import type { MiddlewareHandler } from 'hono';
import type { Clock } from '../clock';
import type { Logger } from '../logging';
import type { AppEnv } from './types';

/**
 * One structured line per request (NFR-010). Logs the route pattern, never bodies, query
 * strings, cookies or raw client text.
 */
export function requestLogger(logger: Logger, clock: Clock): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const started = clock.now().getTime();
    await next();
    const ctx = c.get('ctx') as AppEnv['Variables']['ctx'] | undefined;
    logger.info(
      {
        requestId: c.get('requestId'),
        method: c.req.method,
        route: c.req.routePath,
        status: c.res.status,
        durationMs: clock.now().getTime() - started,
        userId: c.get('user')?.id,
        workspaceId: ctx?.workspaceId,
      },
      'request',
    );
  };
}
