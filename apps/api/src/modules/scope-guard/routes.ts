import {
  changeRequestListQuerySchema,
  convertToTasksRequestSchema,
  createChangeRequestSchema,
  idSchema,
  recordDecisionRequestSchema,
  updateVersionRequestSchema,
} from '@soloops/contracts';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { errors } from '../../platform/errors';
import { parseIdempotencyKey } from '../../platform/http/idempotency';
import type { AppEnv } from '../../platform/http/types';
import { jsonBody, parseIfMatch, queryParams } from '../../platform/http/validate';
import { requireMembership, type WorkspaceService } from '../workspace';
import type { ScopeGuardService } from './service';

function pathId(c: Context<AppEnv>, name: string): string {
  const parsed = idSchema.safeParse(c.req.param(name));
  if (!parsed.success) throw errors.notFound();
  return parsed.data;
}

/** Version numbers are 1–50 (data-model §4.9); anything else is a missing version (404). */
function versionNo(c: Context<AppEnv>, name = 'n'): number {
  const raw = c.req.param(name) ?? '';
  if (!/^[1-9]\d?$/.test(raw) || Number(raw) > 50) throw errors.notFound();
  return Number(raw);
}

const idemKey = (c: Context<AppEnv>, required: boolean) =>
  parseIdempotencyKey(c.req.header('Idempotency-Key'), required);

const diffQuerySchema = z.object({
  from: z.coerce.number().int().min(1).max(50),
  to: z.coerce.number().int().min(1).max(50),
});

/** Mounted at /api/v1/workspaces/:workspaceId. Every route requires membership (SEC-004). */
export function createScopeGuardRoutes(service: ScopeGuardService, workspaces: WorkspaceService) {
  const r = new Hono<AppEnv>();
  const member = requireMembership(workspaces);
  for (const path of [
    '/change-requests',
    '/change-requests/*',
    '/projects/:projectId/change-requests',
  ]) {
    r.use(path, member);
  }

  // FR-020 / FR-032
  r.get(
    '/projects/:projectId/change-requests',
    queryParams(changeRequestListQuerySchema),
    async (c) =>
      c.json(
        await service.listForProject(c.get('ctx'), pathId(c, 'projectId'), c.req.valid('query')),
      ),
  );
  r.post('/projects/:projectId/change-requests', jsonBody(createChangeRequestSchema), async (c) => {
    const projectId = pathId(c, 'projectId');
    const dto = await service.createChangeRequest(c.get('ctx'), projectId, c.req.valid('json'));
    c.header('ETag', `"${dto.rowVersion}"`);
    return c.json(dto, 201);
  });
  r.get('/change-requests', queryParams(changeRequestListQuerySchema), async (c) =>
    c.json(await service.listQueue(c.get('ctx'), c.req.valid('query'))),
  );

  // FR-028
  r.get('/change-requests/:crId', async (c) => {
    const dto = await service.getChangeRequest(c.get('ctx'), pathId(c, 'crId'));
    c.header('ETag', `"${dto.rowVersion}"`);
    return c.json(dto);
  });
  r.get('/change-requests/:crId/diff', queryParams(diffQuerySchema), async (c) => {
    const { from, to } = c.req.valid('query');
    return c.json(await service.diff(c.get('ctx'), pathId(c, 'crId'), from, to));
  });

  // FR-026 new version (Idempotency-Key optional)
  r.post('/change-requests/:crId/versions', async (c) => {
    const res = await service.createVersion(c.get('ctx'), pathId(c, 'crId'), idemKey(c, false));
    return c.json(res.body, res.status as 201);
  });

  // FR-022 edit / discard a draft
  r.patch('/change-requests/:crId/versions/:n', jsonBody(updateVersionRequestSchema), async (c) => {
    const crId = pathId(c, 'crId');
    const n = versionNo(c);
    const dto = await service.updateDraft(
      c.get('ctx'),
      crId,
      n,
      c.req.valid('json'),
      parseIfMatch(c.req.header('If-Match')),
    );
    c.header('ETag', `"${dto.rowVersion}"`);
    return c.json(dto);
  });
  r.delete('/change-requests/:crId/versions/:n', async (c) => {
    const dto = await service.discardDraft(c.get('ctx'), pathId(c, 'crId'), versionNo(c));
    return c.json(dto);
  });

  // FR-021 AI analysis (suggestion only; never changes the draft)
  r.post('/change-requests/:crId/versions/:n/analyze', async (c) =>
    c.json(await service.analyze(c.get('ctx'), pathId(c, 'crId'), versionNo(c))),
  );

  // FR-024 propose (If-Match required, Idempotency-Key optional)
  r.post('/change-requests/:crId/versions/:n/propose', async (c) => {
    const crId = pathId(c, 'crId');
    const n = versionNo(c);
    const res = await service.propose(
      c.get('ctx'),
      crId,
      n,
      parseIfMatch(c.req.header('If-Match')),
      idemKey(c, false),
    );
    return c.json(res.body, res.status as 200);
  });

  // FR-029 withdraw
  r.post('/change-requests/:crId/versions/:n/withdraw', async (c) => {
    const crId = pathId(c, 'crId');
    const n = versionNo(c);
    const res = await service.withdraw(c.get('ctx'), crId, n, idemKey(c, false));
    return c.json(res.body, res.status as 200);
  });

  // FR-025 decisions (Idempotency-Key REQUIRED, api-design §4)
  r.post(
    '/change-requests/:crId/versions/:n/decisions',
    jsonBody(recordDecisionRequestSchema),
    async (c) => {
      const crId = pathId(c, 'crId');
      const n = versionNo(c);
      const key = idemKey(c, true) as string;
      const res = await service.recordDecision(c.get('ctx'), crId, n, c.req.valid('json'), key);
      return c.json(res.body, res.status as 201);
    },
  );

  // FR-030 tasks from an approved version (Idempotency-Key optional)
  r.post(
    '/change-requests/:crId/versions/:n/tasks',
    jsonBody(convertToTasksRequestSchema),
    async (c) => {
      const crId = pathId(c, 'crId');
      const n = versionNo(c);
      const res = await service.convertToTasks(
        c.get('ctx'),
        crId,
        n,
        c.req.valid('json'),
        idemKey(c, false),
      );
      return c.json(res.body, res.status as 201);
    },
  );

  // FR-027 client-facing summary
  r.get('/change-requests/:crId/versions/:n/summary', async (c) =>
    c.json(await service.summary(c.get('ctx'), pathId(c, 'crId'), versionNo(c))),
  );

  return r;
}
