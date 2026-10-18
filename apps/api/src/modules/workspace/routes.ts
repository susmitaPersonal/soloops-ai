import {
  addMemberRequestSchema,
  aiEnablementRequestSchema,
  idSchema,
  updateWorkspaceSettingsRequestSchema,
} from '@soloops/contracts';
import { Hono } from 'hono';
import { errors } from '../../platform/errors';
import type { AppEnv } from '../../platform/http/types';
import { jsonBody, parseIfMatch } from '../../platform/http/validate';
import { requireMembership } from './membership';
import type { WorkspaceService } from './service';

/** Mounted at /api/v1/workspaces/:workspaceId. All routes require membership (SEC-004). */
export function createWorkspaceRoutes(service: WorkspaceService) {
  const routes = new Hono<AppEnv>();

  // FR-005: any member can read settings.
  routes.get('/', requireMembership(service), async (c) => {
    const dto = await service.getSettings(c.get('ctx'));
    c.header('ETag', `"${dto.rowVersion}"`);
    return c.json(dto);
  });

  // FR-005 / AC-002.1–.3: owner only, If-Match required.
  routes.patch(
    '/',
    requireMembership(service, { role: 'OWNER' }),
    jsonBody(updateWorkspaceSettingsRequestSchema),
    async (c) => {
      const expected = parseIfMatch(c.req.header('If-Match'));
      const dto = await service.updateSettings(c.get('ctx'), c.req.valid('json'), expected);
      c.header('ETag', `"${dto.rowVersion}"`);
      return c.json(dto);
    },
  );

  // FR-053: any member may see whether AI is configured and reachable.
  routes.get('/ai/status', requireMembership(service), async (c) =>
    c.json(await service.aiStatus(c.get('ctx'))),
  );

  // FR-054 / AC-022.3: owner only, disclosure acknowledged.
  routes.put(
    '/ai-enablement',
    requireMembership(service, { role: 'OWNER' }),
    jsonBody(aiEnablementRequestSchema),
    async (c) => {
      const dto = await service.setAiEnablement(c.get('ctx'), c.req.valid('json').enabled);
      c.header('ETag', `"${dto.rowVersion}"`);
      return c.json(dto);
    },
  );

  // FR-004 / S-12: any member sees who is in the workspace (public profile only).
  routes.get('/members', requireMembership(service), async (c) =>
    c.json({ items: await service.listMembers(c.get('ctx')) }),
  );

  // FR-004 / AC-003.1–.2: owner only; adds an existing user as MEMBER.
  routes.post(
    '/members',
    requireMembership(service, { role: 'OWNER' }),
    jsonBody(addMemberRequestSchema),
    async (c) => c.json(await service.addMember(c.get('ctx'), c.req.valid('json').email), 201),
  );

  // FR-004 / S-12: owner only; the last owner can never be removed.
  routes.delete('/members/:userId', requireMembership(service, { role: 'OWNER' }), async (c) => {
    const userId = idSchema.safeParse(c.req.param('userId'));
    if (!userId.success) throw errors.notFound();
    await service.removeMember(c.get('ctx'), userId.data);
    return c.body(null, 204);
  });

  return routes;
}
