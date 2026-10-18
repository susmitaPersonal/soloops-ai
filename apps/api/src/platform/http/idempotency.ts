import { createHash } from 'node:crypto';
import type { Clock } from '../clock';
import { DuplicateKeyError, type Database, type TxSession } from '../db';
import { errors } from '../errors';
import { newId } from '../ids';

/** Stored response of a transition (backend-architecture.md#idempotency). */
export interface IdempotentResponse {
  status: number;
  body: Record<string, unknown>;
}

interface IdempotencyKeyDoc {
  _id: string;
  workspaceId: string;
  key: string;
  userId: string;
  route: string;
  requestHash: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const TTL_MS = 24 * 60 * 60 * 1000;

/** Stable JSON with sorted keys, so semantically equal bodies hash equally. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function parseIdempotencyKey(header: string | undefined, required: boolean): string | null {
  if (header === undefined || header === '') {
    if (!required) return null;
    throw errors.validationFailed(
      [{ path: 'Idempotency-Key', message: 'Send an Idempotency-Key header with this request.' }],
      'This action needs an Idempotency-Key header.',
    );
  }
  if (!KEY_PATTERN.test(header)) {
    throw errors.validationFailed([
      { path: 'Idempotency-Key', message: 'Use 8–128 letters, digits, hyphens or underscores.' },
    ]);
  }
  return header;
}

/**
 * Runs a transition exactly once per `Idempotency-Key` (api-design §1):
 * - first call: `fn` runs inside one transaction and its response is stored **in that same
 *   transaction**, so the record exists if and only if the transition committed;
 * - retry with the same key and body: the stored response is returned and nothing runs again;
 * - same key with a different body, route or user: 422 `IDEMPOTENCY_KEY_REUSED`.
 * Without a key (where optional), `fn` simply runs in a transaction. Failed transitions store
 * nothing, so a retry after an error is evaluated afresh.
 */
export async function runIdempotent(
  deps: { db: Database; clock: Clock },
  opts: {
    workspaceId: string;
    userId: string;
    key: string | null;
    route: string;
    requestBody: unknown;
  },
  fn: (tx: TxSession) => Promise<IdempotentResponse>,
): Promise<IdempotentResponse> {
  if (opts.key === null) return deps.db.withTransaction(fn);
  const keys = deps.db.tenant<IdempotencyKeyDoc>('idempotencyKeys', opts.workspaceId);
  const requestHash = createHash('sha256')
    .update(`${opts.route}\n${canonical(opts.requestBody)}`, 'utf8')
    .digest('hex');
  const replay = (doc: IdempotencyKeyDoc): IdempotentResponse => {
    if (doc.requestHash !== requestHash || doc.userId !== opts.userId) {
      throw errors.idempotencyKeyReused();
    }
    return { status: doc.responseStatus, body: doc.responseBody };
  };
  try {
    return await deps.db.withTransaction(async (tx) => {
      const existing = await keys.findOne({ key: opts.key as string }, { session: tx });
      if (existing) return replay(existing);
      const result = await fn(tx);
      const now = deps.clock.now();
      await keys.insertOne(
        {
          _id: newId(),
          key: opts.key as string,
          userId: opts.userId,
          route: opts.route,
          requestHash,
          responseStatus: result.status,
          responseBody: result.body,
          expiresAt: new Date(now.getTime() + TTL_MS),
          createdAt: now,
          updatedAt: now,
        },
        { session: tx },
      );
      return result;
    });
  } catch (err) {
    // A concurrent request with the same key committed first: return its stored response.
    if (err instanceof DuplicateKeyError) {
      const winner = await keys.findOne({ key: opts.key });
      if (winner) return replay(winner);
    }
    throw err;
  }
}
