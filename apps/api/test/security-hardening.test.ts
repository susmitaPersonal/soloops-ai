// Regression tests for the M1 security review findings (docs/quality/implementation-status.md).
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createPasswordHasher } from '../src/modules/identity';
import { createFixedClock } from '../src/platform/clock';
import { UnsafeQueryError } from '../src/platform/db';
import { AppError } from '../src/platform/errors';
import { createRateLimiter } from '../src/platform/http/rate-limit';
import { newId } from '../src/platform/ids';
import { createLogger } from '../src/platform/logging';
import { createTestContext, json, TEST_PASSWORD, type TestContext } from './helpers';

const contexts: TestContext[] = [];
async function context(env: Record<string, string> = {}) {
  const t = await createTestContext(env);
  contexts.push(t);
  return t;
}
afterEach(async () => {
  while (contexts.length) await contexts.pop()?.cleanup();
});

const login = (t: TestContext, email: string, xff?: string) =>
  t.request('POST', '/api/v1/auth/login', {
    body: { email, password: 'wrong password!!' },
    ...(xff ? { headers: { 'X-Forwarded-For': xff } } : {}),
  });

describe('SEC-006 rate-limit bypasses', () => {
  it('TRUST_PROXY: a forged leftmost X-Forwarded-For does not create new buckets (rightmost hop is used)', async () => {
    const t = await context({ TRUST_PROXY: 'true' });
    const { email } = await t.register();
    for (let i = 0; i < 10; i += 1) {
      expect((await login(t, email, `198.51.100.${i}, 203.0.113.7`)).status).toBe(401);
    }
    expect((await login(t, email, '198.51.100.99, 203.0.113.7')).status).toBe(429);
  });

  it('per-email bucket stops brute force from rotating IPs', async () => {
    const t = await context({ TRUST_PROXY: 'true' });
    const { email } = await t.register();
    for (let i = 0; i < 50; i += 1) {
      expect((await login(t, email, `203.0.113.${i}`)).status).toBe(401);
    }
    expect((await login(t, email, '203.0.113.250')).status).toBe(429);
  });

  it('per-IP bucket stops password spraying across many emails', async () => {
    const t = await context({ RATE_LIMIT_AUTH_PER_IP: '5' });
    for (let i = 0; i < 5; i += 1) {
      expect((await login(t, `spray${i}@example.com`)).status).toBe(401);
    }
    expect((await login(t, 'spray-last@example.com')).status).toBe(429);
  });

  it('per-IP bucket limits mass registration', async () => {
    const t = await context({ RATE_LIMIT_REGISTER_PER_IP: '3' });
    for (let i = 0; i < 3; i += 1) await t.register();
    const res = await t.request('POST', '/api/v1/auth/register', {
      body: { name: 'Fourth', email: 'fourth@example.com', password: TEST_PASSWORD },
    });
    expect(res.status).toBe(429);
  });

  it('limiter memory is bounded under a flood of unique keys', () => {
    const limiter = createRateLimiter({
      limit: 10,
      windowMs: 60_000,
      clock: createFixedClock('2026-10-16T00:00:00Z'),
      maxKeys: 100,
    });
    for (let i = 0; i < 20_000; i += 1) limiter.consume(`key-${i}`);
    expect(limiter.size()).toBeLessThanOrEqual(100);
  });

  it('expired windows are dropped as time passes', () => {
    const clock = createFixedClock('2026-10-16T00:00:00Z');
    const limiter = createRateLimiter({ limit: 10, windowMs: 1000, clock });
    for (let i = 0; i < 50; i += 1) limiter.consume(`old-${i}`);
    clock.advance(2000);
    limiter.consume('new');
    expect(limiter.size()).toBe(1);
  });
});

describe('argon2 concurrency cap', () => {
  it('excess concurrent hashing beyond the queue fails fast with 503', async () => {
    const hasher = createPasswordHasher({ memoryKiB: 1024, iterations: 1, maxConcurrency: 1 });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => hasher.hash(`password-${i}-long-enough`)),
    );
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(9); // 1 active + 8 queued
    expect(rejected.length).toBe(11);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
    expect(((rejected[0] as PromiseRejectedResult).reason as AppError).status).toBe(503);
  });
});

describe('SEC-004 tenant guard escape hatches', () => {
  it.each([
    [{ $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'u' } }],
    [{ $unionWith: { coll: 'memberships' } }],
    [
      {
        $graphLookup: {
          from: 'memberships',
          startWith: '$x',
          connectFromField: 'a',
          connectToField: 'b',
          as: 'g',
        },
      },
    ],
    [{ $out: 'stolen' }],
    [{ $merge: { into: 'stolen' } }],
    [{ $facet: { nested: [{ $lookup: { from: 'users', as: 'u', pipeline: [] } }] } }],
  ])('aggregate refuses %j', async (stage) => {
    const t = await context();
    await expect(t.db.tenant('memberships', newId()).aggregate([stage])).rejects.toBeInstanceOf(
      UnsafeQueryError,
    );
  });

  it('updates cannot $rename a field into the tenant key or _id', async () => {
    const t = await context();
    const c = t.db.tenant<{ _id: string; workspaceId: string; note: string }>(
      'memberships',
      newId(),
    );
    await expect(c.updateOne({}, { $rename: { note: 'workspaceId' } })).rejects.toBeInstanceOf(
      UnsafeQueryError,
    );
    await expect(c.updateOne({}, { $rename: { note: '_id' } })).rejects.toBeInstanceOf(
      UnsafeQueryError,
    );
  });

  it("the user-scoped memberships view only ever returns the given user's rows", async () => {
    const t = await context();
    const a = await t.register();
    const b = await t.register();
    const view = t.db.userScoped<{ _id: string; userId: string; workspaceId: string }>(
      'memberships',
      a.userId,
    );
    const rows = await view.find({});
    expect(rows.map((r) => r.userId)).toEqual([a.userId]);
    await expect(view.find({ userId: b.userId })).rejects.toBeInstanceOf(UnsafeQueryError);
  });
});

describe('SEC-002 __Host- cookie in secure mode', () => {
  it('COOKIE_SECURE=true issues __Host-soloops_sid with Secure, and it authenticates', async () => {
    const t = await context({ COOKIE_SECURE: 'true' });
    const res = await t.request('POST', '/api/v1/auth/register', {
      body: { name: 'Secure', email: 'secure@example.com', password: TEST_PASSWORD },
    });
    expect(res.status).toBe(201);
    const header = res.headers.getSetCookie().join('\n');
    expect(header).toMatch(/^__Host-soloops_sid=/m);
    expect(header).toMatch(/Secure/);
    expect(header).toMatch(/Path=\//);
    expect(header).not.toMatch(/Domain=/i);
    const cookie = header.split(';')[0] as string;
    const me = await t.request('GET', '/api/v1/auth/me', { cookie });
    expect(me.status).toBe(200);
    expect((await json(me)).user.email).toBe('secure@example.com');
    // The plain-named cookie is not accepted in secure mode.
    expect(
      (await t.request('GET', '/api/v1/auth/me', { cookie: cookie.replace('__Host-', '') })).status,
    ).toBe(401);
  });

  it('the plain cookie name is used when COOKIE_SECURE=false', async () => {
    const t = await context();
    const r = await t.register();
    expect(r.cookie.startsWith('soloops_sid=')).toBe(true);
  });
});

describe('TC-SEC-07 nested redaction', () => {
  it('redacts two-level-deep credentials, set-cookie, api keys and emails', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    createLogger('info', sink).info({
      err: {
        config: {
          headers: { cookie: 'soloops_sid=deep', authorization: 'Bearer deep' },
          password: 'deep-pw',
        },
      },
      res: { headers: { 'set-cookie': 'soloops_sid=set', 'x-api-key': 'key-123' } },
      email: 'person@example.com',
      user: { email: 'nested@example.com' },
    });
    const out = lines.join('');
    for (const secret of [
      'soloops_sid=deep',
      'Bearer deep',
      'deep-pw',
      'soloops_sid=set',
      'key-123',
      'person@example.com',
      'nested@example.com',
    ]) {
      expect(out).not.toContain(secret);
    }
  });
});
