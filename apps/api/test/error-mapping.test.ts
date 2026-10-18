// ERR-009 / backend-architecture §Errors: unexpected failures become a generic problem+json
// response that leaks no internals, and the full error is logged server-side only.
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { Database } from '../src/platform/db';
import { UnsafeQueryError } from '../src/platform/db';
import { createLogger } from '../src/platform/logging';
import { APP_ORIGIN, createTestContext, json, TEST_PASSWORD, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(async () => {
  await t.cleanup();
});

/** The real database, except that transactions fail with `error` (simulates an unexpected fault). */
function failingTransactions(db: Database, error: Error): Database {
  return { ...db, withTransaction: async () => Promise.reject(error) };
}

function appWith(db: Database, lines: string[]) {
  const sink = new Writable({
    write(chunk, _e, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return createApp({ config: t.config, db, clock: t.clock, logger: createLogger('error', sink) });
}

const register = (app: ReturnType<typeof createApp>) =>
  app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: APP_ORIGIN,
      'X-Requested-With': 'soloops',
    },
    body: JSON.stringify({
      name: 'Err',
      email: `err-${randomUUID()}@example.com`,
      password: TEST_PASSWORD,
    }),
  });

describe('error mapping (problem.ts)', () => {
  it('ERR-MAP-01 an unexpected error → 500 INTERNAL_ERROR with request ID, no internal details', async () => {
    const lines: string[] = [];
    const app = appWith(
      failingTransactions(t.db, new Error('ECONNRESET at /srv/secret/db.ts:42')),
      lines,
    );
    const res = await register(app);
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = await json(res);
    expect(body).toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 500,
      requestId: expect.any(String),
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain('ECONNRESET');
    expect(text).not.toContain('/srv/secret');
    expect(text).not.toMatch(/stack|at .*\.ts/);
    // ... while the server log keeps the details for operators, keyed by the same request ID.
    const logged = lines.join('');
    expect(logged).toContain('ECONNRESET');
    expect(logged).toContain(body.requestId);
  });

  it('ERR-MAP-02 a refused unsafe query is a generic 500, never a 4xx hint to the caller', async () => {
    const app = appWith(
      failingTransactions(t.db, new UnsafeQueryError('Operator $where is not allowed.')),
      [],
    );
    const res = await register(app);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await json(res))).not.toContain('$where');
  });
});
