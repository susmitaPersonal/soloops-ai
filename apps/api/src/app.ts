import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { REQUEST_ID_HEADER } from '@soloops/contracts';
import { migrations } from '../migrations';
import type { Clock } from './platform/clock';
import type { AppConfig } from './platform/config';
import type { Database } from './platform/db';
import { errors } from './platform/errors';
import { csrfProtection } from './platform/http/csrf';
import { createErrorHandler, notFoundHandler } from './platform/http/problem';
import { createRateLimiter } from './platform/http/rate-limit';
import { requestLogger } from './platform/http/request-logger';
import type { AppEnv } from './platform/http/types';
import { newId } from './platform/ids';
import type { Logger } from './platform/logging';
import { createAuditService } from './modules/audit';
import {
  createIdentityRoutes,
  createIdentityService,
  createPasswordHasher,
  sessionMiddleware,
  type AuthRateLimits,
  type PasswordHasher,
} from './modules/identity';
import { createWorkspaceRoutes, createWorkspaceService } from './modules/workspace';
import { createAiService, createProvider, type ChatModelProvider } from './modules/ai';
import { createBillingRoutes, createBillingService } from './modules/billing';
import { createCoreOpsRoutes, createCoreOpsService, type CoreOpsPorts } from './modules/core-ops';
import { createScopeGuardRoutes, createScopeGuardService } from './modules/scope-guard';

export interface AppDeps {
  config: AppConfig;
  db: Database;
  clock: Clock;
  logger: Logger;
  hasher?: PasswordHasher;
  authLimits?: AuthRateLimits;
  /** Tests inject a scripted provider; production builds it from AI_PROVIDER (FR-050). */
  aiProvider?: ChatModelProvider;
  /** Tests replace retry back-off waits. */
  aiSleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;
/** api-design §5: 10 attempts per 15 minutes per IP + email on login and register. */
export const AUTH_RATE_LIMIT = { limit: 10, windowMs: FIFTEEN_MINUTES };
/** Per email across all IPs: higher than per IP + email, so an attacker cannot cheaply lock a victim out. */
export const AUTH_PER_EMAIL_LIMIT = { limit: 50, windowMs: FIFTEEN_MINUTES };
const BODY_LIMIT_BYTES = 256 * 1024;

/** Builds the Hono app from injected dependencies (ADR-0010). Tests call `app.request()` directly. */
export function createApp(deps: AppDeps) {
  const { config, db, clock, logger } = deps;
  const hasher =
    deps.hasher ??
    createPasswordHasher({
      memoryKiB: config.ARGON2_MEMORY_KIB,
      iterations: config.ARGON2_ITERATIONS,
      maxConcurrency: config.ARGON2_MAX_CONCURRENCY,
    });
  const authLimits: AuthRateLimits = deps.authLimits ?? {
    perIpEmail: createRateLimiter({ ...AUTH_RATE_LIMIT, clock }),
    perEmail: createRateLimiter({ ...AUTH_PER_EMAIL_LIMIT, clock }),
    loginPerIp: createRateLimiter({
      limit: config.RATE_LIMIT_AUTH_PER_IP,
      windowMs: FIFTEEN_MINUTES,
      clock,
    }),
    registerPerIp: createRateLimiter({
      limit: config.RATE_LIMIT_REGISTER_PER_IP,
      windowMs: 60 * 60 * 1000,
      clock,
    }),
  };

  const audit = createAuditService({ db, clock });
  const ai = createAiService({
    db,
    clock,
    config,
    logger,
    provider: deps.aiProvider ?? createProvider(config),
    ...(deps.aiSleep ? { sleep: deps.aiSleep } : {}),
  });
  const workspaces = createWorkspaceService({ db, clock, audit, ai });
  const identity = createIdentityService({ db, clock, config, hasher, workspaces });
  // Ports are filled after the dependent services exist, so core-ops never imports them.
  const ports: CoreOpsPorts = {};
  const coreOps = createCoreOpsService({ db, clock, audit, workspaces, ports });
  const scopeGuard = createScopeGuardService({ db, clock, audit, workspaces, coreOps, ai });
  const billing = createBillingService({ db, clock, audit, workspaces, coreOps, scopeGuard });
  ports.changeRequestAuthorisation = scopeGuard.getAuthorisationState;
  ports.projectHasBillableEntries = billing.projectHasEntries;

  const app = new Hono<AppEnv>();
  app.use(
    '*',
    requestId({
      headerName: REQUEST_ID_HEADER,
      limitLength: 64,
      generator: () => newId(),
    }),
  );
  app.use('*', requestLogger(logger, clock));
  app.use('*', secureHeaders());
  app.use('*', async (c, next) => {
    await next();
    c.header('API-Version', '1');
    c.header('Cache-Control', 'no-store');
  });

  // NFR-010: liveness (no dependencies) and readiness (DB primary + migrations applied).
  app.get('/healthz', (c) => c.json({ status: 'ok' }));
  app.get('/readyz', async (c) => {
    const ready = await db.checkReady();
    if (!ready.ok) throw errors.serviceUnavailable();
    const applied = new Set(await db.appliedMigrationIds().catch(() => [] as string[]));
    const pending = migrations.filter((m) => !applied.has(m.id)).map((m) => m.id);
    if (pending.length > 0) throw errors.serviceUnavailable();
    return c.json({ status: 'ready' });
  });

  const api = new Hono<AppEnv>();
  api.use(
    '*',
    bodyLimit({
      maxSize: BODY_LIMIT_BYTES,
      onError: () => {
        throw errors.payloadTooLarge();
      },
    }),
  );
  api.use('*', csrfProtection(config.APP_ORIGIN));
  api.use('*', sessionMiddleware(identity, config));

  api.route('/auth', createIdentityRoutes({ service: identity, config, limits: authLimits }));
  api.route('/workspaces/:workspaceId', createWorkspaceRoutes(workspaces));
  api.route('/workspaces/:workspaceId', createCoreOpsRoutes(coreOps, workspaces));
  api.route('/workspaces/:workspaceId', createScopeGuardRoutes(scopeGuard, workspaces));
  api.route('/workspaces/:workspaceId', createBillingRoutes(billing, workspaces));

  app.route('/api/v1', api);
  app.notFound(notFoundHandler);
  app.onError(createErrorHandler(logger));
  return app;
}

export type App = ReturnType<typeof createApp>;
