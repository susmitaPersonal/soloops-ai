import { randomUUID } from 'node:crypto';
import {
  CSRF_HEADER_NAME,
  CSRF_HEADER_VALUE,
  SESSION_COOKIE_NAME,
  type SessionResponse,
} from '@soloops/contracts';
import { inject } from 'vitest';
import { migrations } from '../migrations';
import { createApp, type AppDeps } from '../src/app';
import { createFixedClock } from '../src/platform/clock';
import { loadConfig } from '../src/platform/config';
import { connectDatabase } from '../src/platform/db';
import { runMigrations } from '../src/platform/db/migrations';
import { newId } from '../src/platform/ids';
import { createLogger } from '../src/platform/logging';

export const APP_ORIGIN = 'http://localhost:3000';
export const TEST_PASSWORD = 'correct horse battery';

export interface TestRequestOptions {
  body?: unknown;
  rawBody?: string;
  cookie?: string;
  headers?: Record<string, string>;
  /** null omits the Origin header. */
  origin?: string | null;
  /** false omits the CSRF header. */
  csrf?: boolean;
}

/**
 * One isolated database per test file (ADR-0014): real replica set, migrations applied,
 * controllable clock, cheap argon2 parameters (production minimums are enforced only in production).
 */
export async function createTestContext(
  env: Record<string, string> = {},
  overrides: Partial<Pick<AppDeps, 'logger' | 'aiProvider' | 'aiSleep'>> = {},
) {
  const uri = inject('mongoUri');
  const dbName = `soloops_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_ORIGIN,
    MONGODB_URI: uri,
    MONGODB_DB: dbName,
    SESSION_SECRET: 'test-only-session-secret-not-for-production-use',
    LOG_LEVEL: 'silent',
    ARGON2_MEMORY_KIB: '1024',
    ARGON2_ITERATIONS: '1',
    // Many users register from one in-process "IP"; per-IP limits are tested in security-hardening.test.ts.
    RATE_LIMIT_AUTH_PER_IP: '100000',
    RATE_LIMIT_REGISTER_PER_IP: '100000',
    ...env,
  });
  const db = await connectDatabase(uri, dbName);
  await runMigrations(db, migrations);
  const clock = createFixedClock('2026-10-16T09:00:00.000Z');
  const logger = overrides.logger ?? createLogger('silent');
  const app = createApp({
    config,
    db,
    clock,
    logger,
    ...(overrides.aiProvider ? { aiProvider: overrides.aiProvider } : {}),
    ...(overrides.aiSleep ? { aiSleep: overrides.aiSleep } : {}),
  });

  async function request(
    method: string,
    path: string,
    opts: TestRequestOptions = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.origin !== null) headers.Origin = opts.origin ?? APP_ORIGIN;
    if (opts.csrf !== false && method !== 'GET') headers[CSRF_HEADER_NAME] = CSRF_HEADER_VALUE;
    if (opts.cookie) headers.Cookie = opts.cookie;
    let body: string | undefined = opts.rawBody;
    if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      headers['Content-Type'] = 'application/json';
    } else if (body !== undefined) {
      headers['Content-Type'] ??= 'application/json';
    }
    return app.request(path, { method, headers, body });
  }

  let counter = 0;
  async function register(
    input: { name?: string; email?: string; password?: string; workspaceName?: string } = {},
  ) {
    counter += 1;
    const email = input.email ?? `user${counter}-${randomUUID().slice(0, 8)}@example.com`;
    const res = await request('POST', '/api/v1/auth/register', {
      body: {
        name: input.name ?? `Test User ${counter}`,
        email,
        password: input.password ?? TEST_PASSWORD,
        ...(input.workspaceName ? { workspaceName: input.workspaceName } : {}),
      },
    });
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${await res.text()}`);
    const session = (await res.json()) as SessionResponse;
    const workspace = session.workspaces[0];
    if (!workspace) throw new Error('register returned no workspace');
    return {
      email,
      cookie: sessionCookie(res),
      userId: session.user.id,
      workspaceId: workspace.id,
      session,
    };
  }

  /**
   * Fixture: registers a new user and adds them to `workspaceId` with `role`.
   * FR-004 (member management API) is not implemented yet, so the membership is inserted through
   * the tenant-scoped collection (validator applies). Replace with the API once FR-004 lands.
   */
  async function addMember(workspaceId: string, role: 'MEMBER' | 'OWNER' = 'MEMBER') {
    const member = await register();
    const now = clock.now();
    await db
      .tenant('memberships', workspaceId)
      .insertOne({ _id: newId(), userId: member.userId, role, createdAt: now, updatedAt: now });
    return member;
  }

  /** Fixture: two independent workspaces, each with its own OWNER (isolation tests, TC-SEC-01). */
  async function twoWorkspaces() {
    return {
      a: await register({ name: 'Workspace A owner' }),
      b: await register({ name: 'Workspace B owner' }),
    };
  }

  /** Drops this file's database. Each test file owns exactly one database (ADR-0014). */
  async function cleanup() {
    await db.raw.dropDatabase();
    await db.close();
  }

  return { app, db, config, clock, request, register, addMember, twoWorkspaces, cleanup, dbName };
}

export type TestContext = Awaited<ReturnType<typeof createTestContext>>;

/** Extracts `soloops_sid=<value>` from a response's Set-Cookie headers. */
export function sessionCookie(res: Response): string {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!raw) throw new Error('no session cookie set');
  return raw.split(';')[0] as string;
}

export function setCookieHeader(res: Response): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses a response body for assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- assertions inspect arbitrary JSON
export const json = async (res: Response): Promise<any> => res.json();
