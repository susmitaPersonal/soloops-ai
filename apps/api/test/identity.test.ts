import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  DAY_MS,
  sessionCookie,
  setCookieHeader,
  TEST_PASSWORD,
  json,
  type TestContext,
} from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(async () => {
  await t.cleanup();
});

describe('FR-001 / FR-003 registration', () => {
  it('TC-001.1 creates user, workspace and OWNER membership and signs the user in', async () => {
    const res = await t.request('POST', '/api/v1/auth/register', {
      body: {
        name: 'Riya Sen',
        email: 'Riya@Example.com',
        password: TEST_PASSWORD,
        workspaceName: 'Riya Sen Studio',
      },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.user).toMatchObject({ name: 'Riya Sen', email: 'riya@example.com' });
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body.workspaces).toEqual([
      { id: expect.any(String), name: 'Riya Sen Studio', role: 'OWNER' },
    ]);

    const me = await t.request('GET', '/api/v1/auth/me', { cookie: sessionCookie(res) });
    expect(me.status).toBe(200);
    expect((await json(me)).user.email).toBe('riya@example.com');

    // SEC-001: argon2id hash stored, never the plaintext.
    const user = await t.db.raw.collection('users').findOne({ email: 'riya@example.com' });
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(user)).not.toContain(TEST_PASSWORD);

    // FR-005 defaults on the new workspace.
    const ws = await t.db.raw.collection('workspaces').findOne({ _id: body.workspaces[0].id });
    expect(ws).toMatchObject({
      aiEnabled: false,
      defaultCurrency: 'INR',
      nextInvoiceNumber: 1,
      rowVersion: 1,
    });
    expect(typeof ws?.defaultHourlyRateMinor).toBe('bigint');

    // BR-028: the founding OWNER membership is audited in the registration transaction.
    const audit = await t.db.raw
      .collection('auditEvents')
      .find({ workspaceId: body.workspaces[0].id })
      .toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'member.added',
      actorUserId: body.user.id,
      entity: { type: 'MEMBERSHIP' },
      data: { userId: body.user.id, role: 'OWNER', reason: 'registration' },
    });
  });

  it('SEC-002 registering while signed in ends the previous session', async () => {
    const first = await t.register();
    const res = await t.request('POST', '/api/v1/auth/register', {
      cookie: first.cookie,
      body: { name: 'Second', email: 'second-account@example.com', password: TEST_PASSWORD },
    });
    expect(res.status).toBe(201);
    expect((await t.request('GET', '/api/v1/auth/me', { cookie: first.cookie })).status).toBe(401);
    expect((await t.request('GET', '/api/v1/auth/me', { cookie: sessionCookie(res) })).status).toBe(
      200,
    );
  });

  it('defaults the workspace name from the user name', async () => {
    const r = await t.register({ name: 'Arjun Das' });
    expect(r.session.workspaces[0]?.name).toBe("Arjun Das's workspace");
  });

  it("TC-001.2 duplicate email (any case) gets a generic error that doesn't confirm the account", async () => {
    await t.register({ email: 'dup@example.com' });
    const res = await t.request('POST', '/api/v1/auth/register', {
      body: { name: 'Someone', email: 'DUP@example.com', password: TEST_PASSWORD },
    });
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.code).toBe('REGISTRATION_FAILED');
    expect(body.detail).not.toMatch(/exists|taken|already registered/i);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(setCookieHeader(res)).toBeUndefined();
    // Still exactly one account. (The duplicate fails at the first insert; rollback of the
    // workspace, membership and audit writes is proven by TC-001.5 under forced failure.)
    expect(await t.db.raw.collection('users').countDocuments({ email: 'dup@example.com' })).toBe(1);
  });

  it.each([
    ['11 characters', 'a'.repeat(11), 422],
    ['12 characters', 'a'.repeat(12), 201],
    ['256 characters', 'a'.repeat(256), 201],
    ['257 characters', 'a'.repeat(257), 422],
  ])('AC-001.1 password boundary: %s → %i', async (_label, password, status) => {
    const res = await t.request('POST', '/api/v1/auth/register', {
      body: { name: 'Boundary', email: `b${password.length}@example.com`, password },
    });
    expect(res.status).toBe(status);
    if (status === 422) {
      const body = await json(res);
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.errors).toContainEqual(expect.objectContaining({ path: 'password' }));
    }
  });

  it('ERR-010 invalid email and missing name → 422 with field errors', async () => {
    const res = await t.request('POST', '/api/v1/auth/register', {
      body: { email: 'not-an-email', password: TEST_PASSWORD },
    });
    expect(res.status).toBe(422);
    const paths = (await json(res)).errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'email']));
  });
});

describe('FR-002 sign in and sign out', () => {
  it('TC-001.3 wrong password and unknown email give the same generic 401', async () => {
    const { email } = await t.register();
    const wrong = await t.request('POST', '/api/v1/auth/login', {
      body: { email, password: 'wrong password!!' },
    });
    const unknown = await t.request('POST', '/api/v1/auth/login', {
      body: { email: 'nobody@example.com', password: 'wrong password!!' },
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const a = await json(wrong);
    const b = await json(unknown);
    expect(a.code).toBe('INVALID_CREDENTIALS');
    expect({ ...a, requestId: undefined }).toEqual({ ...b, requestId: undefined });
  });

  it('signs in with valid credentials (email is case-insensitive)', async () => {
    const { email } = await t.register();
    const res = await t.request('POST', '/api/v1/auth/login', {
      body: { email: email.toUpperCase(), password: TEST_PASSWORD },
    });
    expect(res.status).toBe(200);
    expect((await json(res)).workspaces).toHaveLength(1);
  });

  it('TC-001.4 sign-out deletes the session server-side; the old cookie then gets 401', async () => {
    const { cookie } = await t.register();
    expect((await t.request('GET', '/api/v1/auth/me', { cookie })).status).toBe(200);
    const out = await t.request('POST', '/api/v1/auth/logout', { cookie });
    expect(out.status).toBe(204);
    expect(setCookieHeader(out)).toMatch(/Max-Age=0/);
    expect((await t.request('GET', '/api/v1/auth/me', { cookie })).status).toBe(401);
  });

  it('GET /auth/me without a session → 401 problem', async () => {
    const res = await t.request('GET', '/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect((await json(res)).code).toBe('UNAUTHENTICATED');
  });

  it('a tampered cookie signature is treated as signed out', async () => {
    const { cookie } = await t.register();
    const tampered = cookie.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A'));
    expect((await t.request('GET', '/api/v1/auth/me', { cookie: tampered })).status).toBe(401);
  });
});

describe('TC-SEC-05 session cookie and lifetime (SEC-002)', () => {
  it('sets HttpOnly, SameSite=Lax, Path=/ and no Secure flag when COOKIE_SECURE=false', async () => {
    const res = await t.request('POST', '/api/v1/auth/register', {
      body: { name: 'Cookie', email: 'cookie@example.com', password: TEST_PASSWORD },
    });
    const header = setCookieHeader(res) ?? '';
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/SameSite=Lax/);
    expect(header).toMatch(/Path=\//);
    expect(header).not.toMatch(/Secure/);
  });

  it('stores only the SHA-256 of the token, never the token itself', async () => {
    const { cookie, userId } = await t.register();
    const token = decodeURIComponent(cookie.split('=')[1] ?? '').split('.')[0] ?? '';
    const sessions = await t.db.raw.collection('sessions').find({ userId }).toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?._id).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(sessions)).not.toContain(token);
  });

  it('rotates the session on login: the pre-login cookie stops working', async () => {
    const { email, cookie: before } = await t.register();
    const res = await t.request('POST', '/api/v1/auth/login', {
      cookie: before,
      body: { email, password: TEST_PASSWORD },
    });
    const after = sessionCookie(res);
    expect(after).not.toBe(before);
    expect((await t.request('GET', '/api/v1/auth/me', { cookie: before })).status).toBe(401);
    expect((await t.request('GET', '/api/v1/auth/me', { cookie: after })).status).toBe(200);
  });

  it('expires after the idle timeout (7 days) without activity', async () => {
    const { cookie } = await t.register();
    t.clock.advance(7 * DAY_MS + 1000);
    expect((await t.request('GET', '/api/v1/auth/me', { cookie })).status).toBe(401);
  });

  it('activity slides the idle timeout, but never past the absolute timeout (30 days)', async () => {
    const { cookie } = await t.register();
    // Active on days 6, 12, 18, 24 and 29: each request is within 7 days of the previous one.
    for (const step of [6, 6, 6, 6, 5]) {
      t.clock.advance(step * DAY_MS);
      expect((await t.request('GET', '/api/v1/auth/me', { cookie })).status).toBe(200);
    }
    // Day 30 after creation: absolute expiry even though the session was active.
    t.clock.advance(1 * DAY_MS);
    expect((await t.request('GET', '/api/v1/auth/me', { cookie })).status).toBe(401);
  });
});

describe('TC-SEC-06 auth rate limiting (SEC-006)', () => {
  it('returns 429 with Retry-After after 10 login attempts per IP + email in 15 minutes', async () => {
    // Own context: a fresh limiter and clock, independent of earlier tests in this file.
    const t = await createTestContext();
    try {
      const { email } = await t.register();
      for (let i = 0; i < 10; i += 1) {
        const res = await t.request('POST', '/api/v1/auth/login', {
          body: { email, password: 'wrong password!!' },
        });
        expect(res.status).toBe(401);
      }
      const limited = await t.request('POST', '/api/v1/auth/login', {
        body: { email, password: TEST_PASSWORD },
      });
      expect(limited.status).toBe(429);
      expect((await json(limited)).code).toBe('RATE_LIMITED');
      expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);

      // A different email is a different key.
      const other = await t.request('POST', '/api/v1/auth/login', {
        body: { email: 'other@example.com', password: 'wrong password!!' },
      });
      expect(other.status).toBe(401);

      // The window resets after 15 minutes.
      t.clock.advance(15 * 60 * 1000);
      const ok = await t.request('POST', '/api/v1/auth/login', {
        body: { email, password: TEST_PASSWORD },
      });
      expect(ok.status).toBe(200);
    } finally {
      await t.cleanup();
    }
  });
});
