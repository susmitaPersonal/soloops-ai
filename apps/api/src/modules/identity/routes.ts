import {
  loginRequestSchema,
  registerRequestSchema,
  SECURE_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '@soloops/contracts';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import type { AppConfig } from '../../platform/config';
import { errors } from '../../platform/errors';
import { clientIp, type RateLimiter } from '../../platform/http/rate-limit';
import type { AppEnv } from '../../platform/http/types';
import { jsonBody } from '../../platform/http/validate';
import type { IdentityService } from './service';

type CookieConfig = Pick<
  AppConfig,
  'SESSION_SECRET' | 'COOKIE_SECURE' | 'SESSION_ABSOLUTE_DAYS' | 'TRUST_PROXY'
>;

/** SEC-006 buckets (api-design §5). Every attempt consumes all buckets that apply to it. */
export interface AuthRateLimits {
  /** Per IP + email: brute force against one account from one client. */
  perIpEmail: RateLimiter;
  /** Per email, any IP: brute force with rotating IPs. Higher, to limit victim lock-out. */
  perEmail: RateLimiter;
  /** Per IP, any email: password spraying. */
  loginPerIp: RateLimiter;
  /** Per IP: mass registration and email probing. */
  registerPerIp: RateLimiter;
}

/**
 * With COOKIE_SECURE=true the cookie uses the `__Host-` prefix, so browsers refuse it unless it is
 * Secure, Path=/ and host-only: a sibling subdomain cannot plant or shadow it.
 */
export function sessionCookieName(secure: boolean): string {
  return secure ? SECURE_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME;
}

/** Reads the signed session cookie; returns the raw token or undefined (tampered or absent). */
export async function readSessionToken(
  c: Context,
  config: Pick<CookieConfig, 'SESSION_SECRET' | 'COOKIE_SECURE'>,
): Promise<string | undefined> {
  const name = sessionCookieName(config.COOKIE_SECURE);
  const value = await getSignedCookie(
    c,
    config.SESSION_SECRET,
    name.replace(/^__Host-/, ''),
    config.COOKIE_SECURE ? 'host' : undefined,
  );
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** SEC-002: HttpOnly, SameSite=Lax, Secure when COOKIE_SECURE=true, Path=/. */
async function writeSessionCookie(c: Context, config: CookieConfig, token: string) {
  await setSignedCookie(
    c,
    sessionCookieName(config.COOKIE_SECURE).replace(/^__Host-/, ''),
    token,
    config.SESSION_SECRET,
    {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'Lax',
      path: '/',
      maxAge: config.SESSION_ABSOLUTE_DAYS * 24 * 60 * 60,
      ...(config.COOKIE_SECURE ? { prefix: 'host' as const } : {}),
    },
  );
}

function clearSessionCookie(c: Context, config: CookieConfig) {
  deleteCookie(c, sessionCookieName(config.COOKIE_SECURE).replace(/^__Host-/, ''), {
    path: '/',
    secure: config.COOKIE_SECURE,
    ...(config.COOKIE_SECURE ? { prefix: 'host' as const } : {}),
  });
}

/** Resolves `c.var.user` from the session cookie on every API request. Never rejects by itself. */
export function sessionMiddleware(
  service: IdentityService,
  config: Pick<CookieConfig, 'SESSION_SECRET' | 'COOKIE_SECURE'>,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = await readSessionToken(c, config);
    c.set('user', token ? ((await service.authenticate(token)) ?? undefined) : undefined);
    await next();
  };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) throw errors.unauthenticated();
  await next();
};

/** Mounted at /api/v1/auth. */
export function createIdentityRoutes(deps: {
  service: IdentityService;
  config: CookieConfig;
  limits: AuthRateLimits;
}) {
  const { service, config, limits } = deps;
  const routes = new Hono<AppEnv>();

  // FR-001, FR-003, AC-001.1–.2. SEC-006: per IP, and per IP + email.
  routes.post('/register', jsonBody(registerRequestSchema), async (c) => {
    const body = c.req.valid('json');
    const ip = clientIp(c, config.TRUST_PROXY);
    limits.registerPerIp.consume(`register:${ip}`);
    limits.perIpEmail.consume(`register:${ip}:${body.email}`);
    const previous = await readSessionToken(c, config);
    const issued = await service.register(body, previous);
    await writeSessionCookie(c, config, issued.token);
    return c.json(issued.response, 201);
  });

  // FR-002, AC-001.3. Rotates the session on every successful login.
  routes.post('/login', jsonBody(loginRequestSchema), async (c) => {
    const body = c.req.valid('json');
    const ip = clientIp(c, config.TRUST_PROXY);
    limits.loginPerIp.consume(`login:${ip}`);
    limits.perIpEmail.consume(`login:${ip}:${body.email}`);
    limits.perEmail.consume(`login:${body.email}`);
    const previous = await readSessionToken(c, config);
    const issued = await service.login(body, previous);
    await writeSessionCookie(c, config, issued.token);
    return c.json(issued.response);
  });

  // AC-001.4
  routes.post('/logout', async (c) => {
    await service.logout(await readSessionToken(c, config));
    clearSessionCookie(c, config);
    return c.body(null, 204);
  });

  routes.get('/me', requireAuth, async (c) => {
    const user = c.get('user');
    if (!user) throw errors.unauthenticated();
    return c.json(await service.sessionResponse(user.id));
  });

  return routes;
}
