import { idSchema, type Role } from '@soloops/contracts';
import type { MiddlewareHandler } from 'hono';
import { errors } from '../../platform/errors';
import type { AppEnv } from '../../platform/http/types';
import type { WorkspaceService } from './service';

/**
 * SEC-004: resolves `:workspaceId` against the caller's membership and sets `c.var.ctx`.
 * - no session → 401
 * - malformed ID, unknown workspace or not a member → 404 (identical, no existence leak)
 * - member lacking the required role → 403 (SEC-011)
 */
export function requireMembership(
  service: WorkspaceService,
  options: { role?: Role } = {},
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) throw errors.unauthenticated();
    const parsed = idSchema.safeParse(c.req.param('workspaceId'));
    if (!parsed.success) throw errors.notFound();
    const membership = await service.findMembership(parsed.data, user.id);
    if (!membership) throw errors.notFound();
    if (options.role && membership.role !== options.role) throw errors.forbidden();
    c.set('ctx', {
      userId: user.id,
      workspaceId: parsed.data,
      role: membership.role,
      requestId: c.get('requestId'),
    });
    await next();
  };
}
