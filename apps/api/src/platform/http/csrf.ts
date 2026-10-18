import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '@soloops/contracts';
import type { MiddlewareHandler } from 'hono';
import { errors } from '../errors';
import type { AppEnv } from './types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * SEC-003 / ADR-0013: state-changing requests need `X-Requested-With: soloops` and an `Origin`
 * equal to APP_ORIGIN. Server-to-server GETs from Next.js carry no Origin, which is allowed
 * only for safe methods.
 */
export function csrfProtection(appOrigin: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const header = c.req.header(CSRF_HEADER_NAME);
      const origin = c.req.header('Origin');
      if (header !== CSRF_HEADER_VALUE || origin !== appOrigin) throw errors.csrfRejected();
    }
    await next();
  };
}
