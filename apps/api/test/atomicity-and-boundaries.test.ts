// Cases added after the M1 test-engineer review (docs/quality/test-execution-report.md §4):
// transaction atomicity under forced failure, concurrency, length boundaries, If-Match over HTTP,
// logout edge cases, audit content and session-lifetime boundaries.
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { Database, TenantCollectionName } from '../src/platform/db';
import { createLogger } from '../src/platform/logging';
import {
  APP_ORIGIN,
  createTestContext,
  DAY_MS,
  json,
  sessionCookie,
  setCookieHeader,
  TEST_PASSWORD,
  type TestContext,
} from './helpers';

const contexts: TestContext[] = [];
async function context(env: Record<string, string> = {}) {
  const t = await createTestContext(env);
  contexts.push(t);
  return t;
}
afterEach(async () => {
  while (contexts.length) await contexts.pop()?.cleanup();
});

const email = () => `u-${randomUUID().slice(0, 8)}@example.com`;

/**
 * The real database, except that inserts into `failing` throw. Everything still runs inside real
 * MongoDB transactions, so this proves rollback of the *other* writes, not a mocked outcome.
 */
function failInsertsInto(db: Database, failing: TenantCollectionName): Database {
  return {
    ...db,
    tenant: (name, workspaceId) => {
      const c = db.tenant(name, workspaceId);
      if (name !== failing) return c;
      return Object.create(c, {
        insertOne: { value: async () => Promise.reject(new Error(`${failing} unavailable`)) },
      });
    },
  } as Database;
}

function appWith(t: TestContext, db: Database) {
  return createApp({ config: t.config, db, clock: t.clock, logger: createLogger('silent') });
}

const post = (
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: APP_ORIGIN,
      'X-Requested-With': 'soloops',
      ...headers,
    },
    body: JSON.stringify(body),
  });

describe('BR-028 / NFR-002 atomicity of real use cases under forced failure', () => {
  it('TC-001.5 registration: an audit failure rolls back user, workspace and membership; no session or cookie', async () => {
    const t = await context();
    const app = appWith(t, failInsertsInto(t.db, 'auditEvents'));
    const address = email();
    const res = await post(app, '/api/v1/auth/register', {
      name: 'Atomic',
      email: address,
      password: TEST_PASSWORD,
    });
    expect(res.status).toBe(500);
    expect(setCookieHeader(res)).toBeUndefined();
    expect(await t.db.raw.collection('users').countDocuments({ email: address })).toBe(0);
    expect(await t.db.raw.collection('workspaces').countDocuments({})).toBe(0);
    expect(await t.db.raw.collection('memberships').countDocuments({})).toBe(0);
    expect(await t.db.raw.collection('auditEvents').countDocuments({})).toBe(0);
    expect(await t.db.raw.collection('sessions').countDocuments({})).toBe(0);
    // The same email can register normally afterwards: nothing half-written blocks it.
    const retry = await t.request('POST', '/api/v1/auth/register', {
      body: { name: 'Atomic', email: address, password: TEST_PASSWORD },
    });
    expect(retry.status).toBe(201);
  });

  it('TC-001.5b registration: a membership failure also rolls back the user and workspace', async () => {
    const t = await context();
    const app = appWith(t, failInsertsInto(t.db, 'memberships'));
    const address = email();
    expect(
      (
        await post(app, '/api/v1/auth/register', {
          name: 'A',
          email: address,
          password: TEST_PASSWORD,
        })
      ).status,
    ).toBe(500);
    expect(await t.db.raw.collection('users').countDocuments({ email: address })).toBe(0);
    expect(await t.db.raw.collection('workspaces').countDocuments({})).toBe(0);
  });

  it('TC-BR-028.settings: an audit failure leaves the workspace unchanged (rowVersion and values)', async () => {
    const t = await context();
    const owner = await t.register();
    const app = appWith(t, failInsertsInto(t.db, 'auditEvents'));
    const res = await app.request(`/api/v1/workspaces/${owner.workspaceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: APP_ORIGIN,
        'X-Requested-With': 'soloops',
        Cookie: owner.cookie,
        'If-Match': '"1"',
      },
      body: JSON.stringify({ taxLabel: 'GST', taxRateBps: 1800 }),
    });
    expect(res.status).toBe(500);
    const doc = await t.db.raw
      .collection('workspaces')
      .findOne({ _id: owner.workspaceId as never });
    expect(doc).toMatchObject({ rowVersion: 1, taxLabel: 'Tax', taxRateBps: 0 });
    expect(
      await t.db.raw
        .collection('auditEvents')
        .countDocuments({ action: 'workspace.settings_changed' }),
    ).toBe(0);
  });
});

describe('concurrency', () => {
  it('TC-001.6 parallel registrations with one email: exactly one succeeds', async () => {
    const t = await context();
    const address = email();
    const results = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        t.request('POST', '/api/v1/auth/register', {
          body: { name: `P${i}`, email: address, password: TEST_PASSWORD },
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 422, 422, 422]);
    expect(await t.db.raw.collection('users').countDocuments({ email: address })).toBe(1);
    expect(await t.db.raw.collection('workspaces').countDocuments({})).toBe(1);
    expect(
      await t.db.raw.collection('auditEvents').countDocuments({ action: 'member.added' }),
    ).toBe(1);
  });
});

describe('registration length boundaries (data-model §4.1, contracts)', () => {
  const reg = (t: TestContext, body: Record<string, unknown>) =>
    t.request('POST', '/api/v1/auth/register', { body: { password: TEST_PASSWORD, ...body } });

  it.each([
    ['name 120', { name: 'n'.repeat(120) }, 201, null],
    ['name 121', { name: 'n'.repeat(121) }, 422, 'name'],
    ['name whitespace only', { name: '   ' }, 422, 'name'],
    ['workspaceName 120', { name: 'N', workspaceName: 'w'.repeat(120) }, 201, null],
    ['workspaceName 121', { name: 'N', workspaceName: 'w'.repeat(121) }, 422, 'workspaceName'],
  ])('%s → %i', async (_l, body, status, path) => {
    const t = await context();
    const res = await reg(t, { email: email(), ...body });
    expect(res.status).toBe(status);
    if (path) expect((await json(res)).errors).toContainEqual(expect.objectContaining({ path }));
  });

  it('email 254 characters → 201, 255 → 422', async () => {
    const t = await context();
    const domain = `${'x'.repeat(63)}.${'x'.repeat(63)}.${'x'.repeat(63)}.${'y'.repeat(56)}.com`;
    const e254 = `a@${domain}`;
    expect(e254).toHaveLength(254);
    expect((await reg(t, { name: 'E', email: e254 })).status).toBe(201);
    const res = await reg(t, { name: 'E', email: `ab@${domain}` });
    expect(res.status).toBe(422);
    expect((await json(res)).errors).toContainEqual(expect.objectContaining({ path: 'email' }));
  });

  it('a 120-character name gives a default workspace name capped at 120 characters', async () => {
    const t = await context();
    const r = await t.register({ name: 'n'.repeat(120) });
    expect(r.session.workspaces[0]?.name).toHaveLength(120);
  });
});

describe('FR-005 settings field boundaries (max → 200, max+1 → 422)', () => {
  it.each([
    ['name', 'n'.repeat(120), 'n'.repeat(121)],
    ['taxLabel', 't'.repeat(20), 't'.repeat(21)],
    ['invoicePrefix', 'P'.repeat(10), 'P'.repeat(11)],
    ['defaultHourlyRateMinor', '9223372036854775807', '9223372036854775808'],
  ])('%s', async (field, ok, tooLong) => {
    const t = await context();
    const owner = await t.register();
    const patch = (value: string, version: number) =>
      t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
        cookie: owner.cookie,
        headers: { 'If-Match': `"${version}"` },
        body: { [field]: value },
      });
    expect((await patch(ok, 1)).status).toBe(200);
    const bad = await patch(tooLong, 2);
    expect(bad.status).toBe(422);
    expect((await json(bad)).errors).toContainEqual(expect.objectContaining({ path: field }));
  });

  it.each([
    ['legalName', 160],
    ['address', 500],
    ['taxId', 32],
  ])('billingDetails.%s at %i → 200, +1 → 422', async (field, max) => {
    const t = await context();
    const owner = await t.register();
    const details = (v: string) => ({ legalName: 'L', address: null, taxId: null, [field]: v });
    const ok = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      headers: { 'If-Match': '"1"' },
      body: { billingDetails: details('z'.repeat(max)) },
    });
    expect(ok.status).toBe(200);
    const bad = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      headers: { 'If-Match': '"2"' },
      body: { billingDetails: details('z'.repeat(max + 1)) },
    });
    expect(bad.status).toBe(422);
    expect((await json(bad)).errors).toContainEqual(
      expect.objectContaining({ path: `billingDetails.${field}` }),
    );
  });

  it('other invalid values: "01" money, 65-character time zone; empty address is stored as null', async () => {
    const t = await context();
    const owner = await t.register();
    const patch = (body: unknown, v: number) =>
      t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
        cookie: owner.cookie,
        headers: { 'If-Match': `"${v}"` },
        body,
      });
    expect((await patch({ defaultHourlyRateMinor: '01' }, 1)).status).toBe(422);
    expect((await patch({ timeZone: 'A'.repeat(65) }, 1)).status).toBe(422);
    const res = await patch({ billingDetails: { legalName: 'L', address: '', taxId: '' } }, 1);
    expect(res.status).toBe(200);
    expect((await json(res)).billingDetails).toEqual({
      legalName: 'L',
      address: null,
      taxId: null,
    });
  });
});

describe('ERR-005 If-Match over HTTP', () => {
  it.each([
    ['"2" (future version)', '"2"', 412],
    ['* (wildcard)', '*', 412],
    ['"abc"', '"abc"', 412],
    ['W/"1" (weak form)', 'W/"1"', 200],
  ])('%s → %i', async (_l, ifMatch, status) => {
    const t = await context();
    const owner = await t.register();
    const res = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      headers: { 'If-Match': ifMatch },
      body: { taxLabel: 'VAT' },
    });
    expect(res.status).toBe(status);
  });
});

describe('FR-005 audit content (BR-028)', () => {
  it('a partial update records exactly the changed field, the new rowVersion and the request ID', async () => {
    const t = await context();
    const owner = await t.register();
    const before = await t.db.raw
      .collection('workspaces')
      .findOne({ _id: owner.workspaceId as never });
    const res = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      headers: { 'If-Match': '"1"', 'X-Request-Id': 'audit-req-1' },
      body: { invoicePrefix: 'SO-26' },
    });
    expect(res.status).toBe(200);
    const [event] = await t.db.raw
      .collection('auditEvents')
      .find({ action: 'workspace.settings_changed' })
      .toArray();
    expect(event?.data).toEqual({ changedFields: ['invoicePrefix'], rowVersion: 2 });
    expect(event?.requestId).toBe('audit-req-1');
    // Every other field is unchanged.
    const after = await t.db.raw
      .collection('workspaces')
      .findOne({ _id: owner.workspaceId as never });
    const {
      invoicePrefix: _a,
      rowVersion: _b,
      updatedAt: _c,
      ...restAfter
    } = (after ?? {}) as Record<string, unknown>;
    const {
      invoicePrefix: _d,
      rowVersion: _e,
      updatedAt: _f,
      ...restBefore
    } = (before ?? {}) as Record<string, unknown>;
    expect(restAfter).toEqual(restBefore);
    expect(after?.invoicePrefix).toBe('SO-26');
  });
});

describe('AC-001.4 logout edge cases', () => {
  it('without a cookie → 204 and a clearing cookie', async () => {
    const t = await context();
    const res = await t.request('POST', '/api/v1/auth/logout');
    expect(res.status).toBe(204);
    expect(setCookieHeader(res)).toMatch(/Max-Age=0/);
  });

  it('is idempotent, accepts a tampered cookie, and only ends the given session', async () => {
    const t = await context();
    const a = await t.register({ email: 'two-sessions@example.com' });
    const b = await t.request('POST', '/api/v1/auth/login', {
      body: { email: 'two-sessions@example.com', password: TEST_PASSWORD },
    });
    const cookieB = sessionCookie(b);
    expect((await t.request('POST', '/api/v1/auth/logout', { cookie: a.cookie })).status).toBe(204);
    expect((await t.request('POST', '/api/v1/auth/logout', { cookie: a.cookie })).status).toBe(204);
    expect(
      (await t.request('POST', '/api/v1/auth/logout', { cookie: 'soloops_sid=forged.value' }))
        .status,
    ).toBe(204);
    expect((await t.request('GET', '/api/v1/auth/me', { cookie: cookieB })).status).toBe(200);
  });

  it('without the CSRF header → 403 and the session stays valid', async () => {
    const t = await context();
    const a = await t.register();
    expect(
      (await t.request('POST', '/api/v1/auth/logout', { cookie: a.cookie, csrf: false })).status,
    ).toBe(403);
    expect((await t.request('GET', '/api/v1/auth/me', { cookie: a.cookie })).status).toBe(200);
  });
});

describe('SEC-002 session lifetime boundaries', () => {
  it('7 days minus 1 ms after the last activity is still valid; exactly 7 days is expired', async () => {
    const t1 = await context();
    const s1 = await t1.register();
    t1.clock.advance(7 * DAY_MS - 1);
    expect((await t1.request('GET', '/api/v1/auth/me', { cookie: s1.cookie })).status).toBe(200);

    const t2 = await context();
    const s2 = await t2.register();
    t2.clock.advance(7 * DAY_MS);
    expect((await t2.request('GET', '/api/v1/auth/me', { cookie: s2.cookie })).status).toBe(401);
  });

  it('activity within 60 s does not rewrite the session; after 60 s the idle expiry slides', async () => {
    const t = await context();
    const s = await t.register();
    const read = async () =>
      (await t.db.raw.collection('sessions').findOne({ userId: s.userId }))?.expiresAt as Date;
    const initial = await read();
    t.clock.advance(30_000);
    await t.request('GET', '/api/v1/auth/me', { cookie: s.cookie });
    expect(await read()).toEqual(initial);
    t.clock.advance(31_000);
    await t.request('GET', '/api/v1/auth/me', { cookie: s.cookie });
    expect((await read()).getTime()).toBe(initial.getTime() + 61_000);
  });

  it('a session whose user no longer exists is rejected', async () => {
    const t = await context();
    const s = await t.register();
    await t.db.raw.collection('users').deleteOne({ _id: s.userId as never });
    expect((await t.request('GET', '/api/v1/auth/me', { cookie: s.cookie })).status).toBe(401);
  });
});

describe('SEC-006 register per IP + email', () => {
  it('the 11th registration attempt for one email from one IP within 15 minutes → 429', async () => {
    const t = await context();
    const address = email();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push(
        (
          await t.request('POST', '/api/v1/auth/register', {
            body: { name: 'R', email: address, password: TEST_PASSWORD },
          })
        ).status,
      );
    }
    expect(statuses[0]).toBe(201);
    expect(statuses.slice(1, 10).every((s) => s === 422)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
