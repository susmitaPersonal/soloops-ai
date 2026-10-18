import {
  aiEnablementRequestSchema,
  updateWorkspaceSettingsRequestSchema,
} from '@soloops/contracts';
import { Hono } from 'hono';
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

  return routes;
}
