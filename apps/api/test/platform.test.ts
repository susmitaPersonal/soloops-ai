import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrations } from '../migrations';
import { createApp } from '../src/app';
import { createFixedClock } from '../src/platform/clock';
import { ConfigError, loadConfig } from '../src/platform/config';
import { connectDatabase, DuplicateKeyError, UnsafeQueryError } from '../src/platform/db';
import { runMigrations } from '../src/platform/db/migrations';
import { newId } from '../src/platform/ids';
import { createLogger } from '../src/platform/logging';
import { createTestContext, json, type TestContext } from './helpers';
import { inject } from 'vitest';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(async () => {
  await t.cleanup();
});

interface Note {
  _id: string;
  workspaceId: string;
  text: string;
  amountMinor?: bigint;
}

interface Member {
  _id: string;
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

describe('ADR-0012 TenantCollection', () => {
  // `memberships` is used as a scratch tenant collection; its validator is bypassed via raw inserts only.
  const wsA = newId();
  const wsB = newId();

  it('injects workspaceId on insert and scopes every read to the tenant', async () => {
    const id = newId();
    const now = t.clock.now();
    await t.db
      .tenant<Member>('memberships', wsA)
      .insertOne({ _id: id, userId: 'u1', role: 'OWNER', createdAt: now, updatedAt: now });
    const raw = await t.db.raw.collection('memberships').findOne({ _id: id as never });
    expect(raw?.workspaceId).toBe(wsA);

    expect(await t.db.tenant<Member>('memberships', wsA).findOne({ _id: id })).not.toBeNull();
    expect(await t.db.tenant<Member>('memberships', wsB).findOne({ _id: id })).toBeNull();
    expect(await t.db.tenant<Member>('memberships', wsB).find({})).toEqual([]);
    expect(await t.db.tenant<Member>('memberships', wsB).countDocuments({ _id: id })).toBe(0);
    const agg = await t.db.tenant<Member>('memberships', wsB).aggregate([{ $match: { _id: id } }]);
    expect(agg).toEqual([]);
  });

  it('a foreign-tenant update matches nothing', async () => {
    const id = newId();
    const now = t.clock.now();
    await t.db
      .tenant<Member>('memberships', wsA)
      .insertOne({ _id: id, userId: 'u2', role: 'MEMBER', createdAt: now, updatedAt: now });
    const res = await t.db
      .tenant<Member>('memberships', wsB)
      .updateOne({ _id: id }, { $set: { role: 'OWNER' } });
    expect(res.matched).toBe(0);
    expect((await t.db.raw.collection('memberships').findOne({ _id: id as never }))?.role).toBe(
      'MEMBER',
    );
  });

  it('refuses filters, documents and updates that set the tenant key', async () => {
    const c = t.db.tenant<Note>('memberships', wsA);
    await expect(c.findOne({ workspaceId: wsB })).rejects.toBeInstanceOf(UnsafeQueryError);
    await expect(c.find({ $or: [{ workspaceId: wsB }] })).rejects.toBeInstanceOf(UnsafeQueryError);
    await expect(
      c.insertOne({ _id: newId(), workspaceId: wsB, text: 'x' } as never),
    ).rejects.toBeInstanceOf(UnsafeQueryError);
    await expect(c.updateOne({}, { $set: { workspaceId: wsB } })).rejects.toBeInstanceOf(
      UnsafeQueryError,
    );
    await expect(c.aggregate([{ $match: { workspaceId: wsB } }])).rejects.toBeInstanceOf(
      UnsafeQueryError,
    );
  });

  it('refuses server-side JavaScript operators', async () => {
    const c = t.db.tenant<Note>('memberships', wsA);
    await expect(c.find({ $where: 'true' } as never)).rejects.toBeInstanceOf(UnsafeQueryError);
    await expect(c.find({ text: { $function: {} } } as never)).rejects.toBeInstanceOf(
      UnsafeQueryError,
    );
  });

  it('requires an application-generated _id', async () => {
    const c = t.db.tenant<Note>('memberships', wsA);
    await expect(c.insertOne({ text: 'no id' } as never)).rejects.toThrow(/_id/);
  });

  it('maps unique-index violations to DuplicateKeyError', async () => {
    const now = t.clock.now();
    const doc = { userId: 'dup-user', role: 'OWNER' as const, createdAt: now, updatedAt: now };
    await t.db.tenant<Member>('memberships', wsA).insertOne({ _id: newId(), ...doc });
    await expect(
      t.db.tenant<Member>('memberships', wsA).insertOne({ _id: newId(), ...doc }),
    ).rejects.toBeInstanceOf(DuplicateKeyError);
  });
});

describe('ADR-0012 transactions and BigInt money', () => {
  it('BR-019 Int64 money round-trips as bigint beyond Number.MAX_SAFE_INTEGER', async () => {
    const id = newId();
    const big = 9_007_199_254_740_993n; // 2^53 + 1: not representable as a JS number
    await t.db.raw.collection('scratch').insertOne({ _id: id as never, amountMinor: big });
    const back = await t.db.raw.collection('scratch').findOne({ _id: id as never });
    expect(back?.amountMinor).toBe(big);
  });

  it('NFR-002 a failure inside withTransaction rolls back every write', async () => {
    const ws = newId();
    const now = t.clock.now();
    await expect(
      t.db.withTransaction(async (tx) => {
        await t.db
          .tenant('memberships', ws)
          .insertOne(
            { _id: newId(), userId: 'rollback', role: 'OWNER', createdAt: now, updatedAt: now },
            { session: tx },
          );
        await t.db.tenant('auditEvents', ws).insertOne(
          {
            _id: newId(),
            actorUserId: 'rollback',
            action: 'member.added',
            entity: { type: 'MEMBERSHIP', id: 'm', projectId: null },
            data: {},
            requestId: null,
            createdAt: now,
            updatedAt: now,
          },
          { session: tx },
        );
        throw new Error('forced failure');
      }),
    ).rejects.toThrow('forced failure');
    expect(await t.db.raw.collection('memberships').countDocuments({ workspaceId: ws })).toBe(0);
    expect(await t.db.raw.collection('auditEvents').countDocuments({ workspaceId: ws })).toBe(0);
  });

  it('$jsonSchema validators reject invalid documents (defence in depth)', async () => {
    await expect(
      t.db.raw
        .collection('memberships')
        .insertOne({ _id: newId() as never, workspaceId: 'w', userId: 'u', role: 'ADMIN' }),
    ).rejects.toThrow(/validation/i);
  });
});

describe('migrations (data-model.md §11)', () => {
  it('records applied scripts and is idempotent on re-run', async () => {
    const again = await runMigrations(t.db, migrations);
    expect(again.applied).toEqual([]);
    expect(again.skipped).toEqual([
      '0001-identity-and-workspaces',
      '0002-core-ops',
      '0003-scope-guard-and-ai',
      '0004-delivery-and-billable-work',
      '0005-invoices',
    ]);
    expect(again.changed).toEqual([]);
  });

  it('creates the unique and TTL indexes the invariants rely on', async () => {
    const users = await t.db.raw.collection('users').indexes();
    expect(users.find((i) => i.name === 'email_unique')?.unique).toBe(true);
    const sessions = await t.db.raw.collection('sessions').indexes();
    expect(sessions.find((i) => i.name === 'expiresAt_ttl')?.expireAfterSeconds).toBe(0);
    const memberships = await t.db.raw.collection('memberships').indexes();
    expect(memberships.find((i) => i.name === 'workspace_user_unique')?.unique).toBe(true);
    const idem = await t.db.raw.collection('idempotencyKeys').indexes();
    expect(idem.find((i) => i.name === 'workspace_key_unique')?.unique).toBe(true);
  });
});

describe('NFR-010 health and readiness', () => {
  it('/healthz → 200 without touching dependencies', async () => {
    const res = await t.request('GET', '/healthz');
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ status: 'ok' });
  });

  it('/readyz → 200 when the primary is writable and migrations are applied', async () => {
    const res = await t.request('GET', '/readyz');
    expect(res.status).toBe(200);
  });

  it('/readyz → 503 when migrations are pending', async () => {
    const uri = inject('mongoUri');
    const dbName = `soloops_test_nomig_${newId().slice(-8)}`;
    const db = await connectDatabase(uri, dbName);
    try {
      const app = createApp({
        config: t.config,
        db,
        clock: t.clock,
        logger: createLogger('silent'),
      });
      const res = await app.request('/readyz');
      expect(res.status).toBe(503);
      expect((await json(res)).code).toBe('SERVICE_UNAVAILABLE');
    } finally {
      await db.raw.dropDatabase();
      await db.close();
    }
  });

  it('ERR-009 database unavailable → /readyz 503 and API requests 503 problem', async () => {
    const uri = inject('mongoUri');
    const db = await connectDatabase(uri, `soloops_test_down_${newId().slice(-8)}`);
    await db.close();
    const app = createApp({ config: t.config, db, clock: t.clock, logger: createLogger('silent') });
    expect((await app.request('/readyz')).status).toBe(503);
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
        'X-Requested-With': 'soloops',
      },
      body: JSON.stringify({ email: 'a@example.com', password: 'whatever-password' }),
    });
    expect(res.status).toBe(503);
  });
});

describe('platform config (SEC-007)', () => {
  const base = {
    APP_ORIGIN: 'http://localhost:3000',
    MONGODB_URI: 'mongodb://localhost:27017/?replicaSet=rs0',
    SESSION_SECRET: 'x'.repeat(48),
  };

  it('applies documented defaults', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({
      PORT: 4000,
      MONGODB_DB: 'soloops',
      COOKIE_SECURE: false,
      SESSION_IDLE_DAYS: 7,
      SESSION_ABSOLUTE_DAYS: 30,
    });
  });

  it('names missing variables without printing any values', () => {
    const secret = 'super-secret-value-that-must-not-leak';
    try {
      loadConfig({ SESSION_SECRET: secret, MONGODB_URI: `mongodb://admin:${secret}@host` });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const message = (err as Error).message;
      expect(message).toContain('APP_ORIGIN');
      expect(message).not.toContain(secret);
    }
  });

  it('production refuses insecure cookies, short secrets and non-replica-set URIs', () => {
    try {
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://localhost:27017',
        SESSION_SECRET: 'short-but-32-characters-long!!!!',
      });
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('COOKIE_SECURE');
      expect(message).toContain('SESSION_SECRET');
      expect(message).toContain('MONGODB_URI');
    }
  });

  it('production accepts a secure configuration', () => {
    const c = loadConfig({
      ...base,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      SESSION_SECRET: Buffer.alloc(32, 7).toString('base64'),
    });
    expect(c.COOKIE_SECURE).toBe(true);
  });
});

describe('TC-SEC-07 logger redaction', () => {
  it('redacts passwords, cookies, authorization, AI keys and the Mongo URI', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const logger = createLogger('info', sink);
    logger.info({
      password: 'hunter2-password',
      user: { password: 'nested-password' },
      headers: { cookie: 'soloops_sid=abc', authorization: 'Bearer xyz' },
      config: {
        AI_API_KEY: 'sk-live-123',
        MONGODB_URI: 'mongodb://u:p@h',
        SESSION_SECRET: 'sessionsecret',
      },
      body: { rawRequestText: 'client text' },
    });
    const out = lines.join('');
    for (const secret of [
      'hunter2-password',
      'nested-password',
      'soloops_sid=abc',
      'Bearer xyz',
      'sk-live-123',
      'u:p@h',
      'sessionsecret',
      'client text',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[Redacted]');
  });

  it('request logs carry requestId, route, status and duration, but no cookie or body', async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const app = createApp({
      config: t.config,
      db: t.db,
      clock: createFixedClock('2026-10-16T09:00:00Z'),
      logger: createLogger('info', sink),
    });
    await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
        'X-Requested-With': 'soloops',
        Cookie: 'soloops_sid=secret-cookie',
      },
      body: JSON.stringify({ email: 'log@example.com', password: 'log-password-123' }),
    });
    const entry = JSON.parse(lines.find((l) => l.includes('"msg":"request"')) ?? '{}');
    expect(entry).toMatchObject({ method: 'POST', route: '/api/v1/auth/login', status: 401 });
    expect(entry.requestId).toEqual(expect.any(String));
    expect(entry.durationMs).toEqual(expect.any(Number));
    const all = lines.join('');
    expect(all).not.toContain('secret-cookie');
    expect(all).not.toContain('log-password-123');
  });
});
