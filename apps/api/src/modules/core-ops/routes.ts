import {
  clientListQuerySchema,
  createClientRequestSchema,
  createProjectRequestSchema,
  createRequirementRequestSchema,
  createTaskRequestSchema,
  idSchema,
  projectListQuerySchema,
  taskListQuerySchema,
  updateClientRequestSchema,
  updateProjectRequestSchema,
  updateRequirementRequestSchema,
  updateTaskRequestSchema,
} from '@soloops/contracts';
import { Hono, type Context } from 'hono';
import { errors } from '../../platform/errors';
import type { AppEnv } from '../../platform/http/types';
import { jsonBody, parseIfMatch, queryParams } from '../../platform/http/validate';
import { requireMembership, type WorkspaceService } from '../workspace';
import type { CoreOpsService } from './service';

/** A path ID that is not a UUID is indistinguishable from a missing one (SEC-004). */
function pathId(c: Context<AppEnv>, name: string): string {
  const parsed = idSchema.safeParse(c.req.param(name));
  if (!parsed.success) throw errors.notFound();
  return parsed.data;
}

const etag = (c: Context<AppEnv>, rowVersion: number) => c.header('ETag', `"${rowVersion}"`);

/**
 * Mounted at /api/v1/workspaces/:workspaceId. Every route requires membership (SEC-004);
 * all Core Ops actions are open to any member (api-design §4, Auth = M).
 */
export function createCoreOpsRoutes(service: CoreOpsService, workspaces: WorkspaceService) {
  const r = new Hono<AppEnv>();
  // Scoped to Core Ops paths so the workspace settings routes are not checked twice.
  const member = requireMembership(workspaces);
  for (const path of ['/clients', '/clients/*', '/projects', '/projects/*']) r.use(path, member);
  for (const path of ['/requirements/*', '/tasks/*']) r.use(path, member);

  // --- FR-010 clients ---------------------------------------------------------------------------
  r.get('/clients', queryParams(clientListQuerySchema), async (c) =>
    c.json(await service.listClients(c.get('ctx'), c.req.valid('query'))),
  );
  r.post('/clients', jsonBody(createClientRequestSchema), async (c) => {
    const dto = await service.createClient(c.get('ctx'), c.req.valid('json'));
    etag(c, dto.rowVersion);
    return c.json(dto, 201);
  });
  r.get('/clients/:clientId', async (c) => {
    const dto = await service.getClient(c.get('ctx'), pathId(c, 'clientId'));
    etag(c, dto.rowVersion);
    return c.json(dto);
  });
  r.patch('/clients/:clientId', jsonBody(updateClientRequestSchema), async (c) => {
    const id = pathId(c, 'clientId');
    const dto = await service.updateClient(
      c.get('ctx'),
      id,
      c.req.valid('json'),
      parseIfMatch(c.req.header('If-Match')),
    );
    etag(c, dto.rowVersion);
    return c.json(dto);
  });
  r.post('/clients/:clientId/archive', async (c) => {
    const dto = await service.archiveClient(c.get('ctx'), pathId(c, 'clientId'));
    etag(c, dto.rowVersion);
    return c.json(dto);
  });

  // --- FR-011 projects --------------------------------------------------------------------------
  r.get('/projects', queryParams(projectListQuerySchema), async (c) =>
    c.json(await service.listProjects(c.get('ctx'), c.req.valid('query'))),
  );
  r.post('/projects', jsonBody(createProjectRequestSchema), async (c) => {
    const dto = await service.createProject(c.get('ctx'), c.req.valid('json'));
    etag(c, dto.rowVersion);
    return c.json(dto, 201);
  });
  r.get('/projects/:projectId', async (c) => {
    const dto = await service.getProject(c.get('ctx'), pathId(c, 'projectId'));
    etag(c, dto.rowVersion);
    return c.json(dto);
  });
  r.patch('/projects/:projectId', jsonBody(updateProjectRequestSchema), async (c) => {
    const id = pathId(c, 'projectId');
    const dto = await service.updateProject(
      c.get('ctx'),
      id,
      c.req.valid('json'),
      parseIfMatch(c.req.header('If-Match')),
    );
    etag(c, dto.rowVersion);
    return c.json(dto);
  });
  r.post('/projects/:projectId/archive', async (c) => {
    const dto = await service.archiveProject(c.get('ctx'), pathId(c, 'projectId'));
    etag(c, dto.rowVersion);
    return c.json(dto);
  });

  // --- FR-012 requirements ----------------------------------------------------------------------
  r.get('/projects/:projectId/requirements', async (c) =>
    c.json({ items: await service.listRequirements(c.get('ctx'), pathId(c, 'projectId')) }),
  );
  r.post(
    '/projects/:projectId/requirements',
    jsonBody(createRequirementRequestSchema),
    async (c) => {
      const projectId = pathId(c, 'projectId');
      const dto = await service.createRequirement(c.get('ctx'), projectId, c.req.valid('json'));
      etag(c, dto.rowVersion);
      return c.json(dto, 201);
    },
  );
  r.patch('/requirements/:requirementId', jsonBody(updateRequirementRequestSchema), async (c) => {
    const id = pathId(c, 'requirementId');
    const dto = await service.updateRequirement(
      c.get('ctx'),
      id,
      c.req.valid('json'),
      parseIfMatch(c.req.header('If-Match')),
    );
    etag(c, dto.rowVersion);
    return c.json(dto);
  });
  r.delete('/requirements/:requirementId', async (c) => {
    await service.deleteRequirement(c.get('ctx'), pathId(c, 'requirementId'));
    return c.body(null, 204);
  });

  // --- FR-013 baselines -------------------------------------------------------------------------
  r.get('/projects/:projectId/baselines', async (c) =>
    c.json({ items: await service.listBaselines(c.get('ctx'), pathId(c, 'projectId')) }),
  );
  r.post('/projects/:projectId/baselines', async (c) => {
    const dto = await service.createBaseline(c.get('ctx'), pathId(c, 'projectId'));
    return c.json(dto, 201);
  });

  // --- FR-014 tasks -----------------------------------------------------------------------------
  r.get('/projects/:projectId/tasks', queryParams(taskListQuerySchema), async (c) =>
    c.json(await service.listTasks(c.get('ctx'), pathId(c, 'projectId'), c.req.valid('query'))),
  );
  r.post('/projects/:projectId/tasks', jsonBody(createTaskRequestSchema), async (c) => {
    const projectId = pathId(c, 'projectId');
    const dto = await service.createTask(c.get('ctx'), projectId, c.req.valid('json'));
    etag(c, dto.rowVersion);
    return c.json(dto, 201);
  });
  r.get('/tasks/:taskId', async (c) => {
    const dto = await service.getTask(c.get('ctx'), pathId(c, 'taskId'));
    etag(c, dto.rowVersion);
    return c.json(dto);
  });
  r.patch('/tasks/:taskId', jsonBody(updateTaskRequestSchema), async (c) => {
    const id = pathId(c, 'taskId');
    const dto = await service.updateTask(
      c.get('ctx'),
      id,
      c.req.valid('json'),
      parseIfMatch(c.req.header('If-Match')),
    );
    etag(c, dto.rowVersion);
    return c.json(dto);
  });

  return r;
}
