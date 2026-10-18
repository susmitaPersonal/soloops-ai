import {
  createEntryRequestSchema,
  createInvoiceRequestSchema,
  entryListQuerySchema,
  idSchema,
  invoiceListQuerySchema,
  updateEntryRequestSchema,
  updateInvoiceRequestSchema,
  voidInvoiceRequestSchema,
} from '@soloops/contracts';
import { Hono, type Context } from 'hono';
import { errors } from '../../platform/errors';
import { parseIdempotencyKey } from '../../platform/http/idempotency';
import type { AppEnv } from '../../platform/http/types';
import { jsonBody, parseIfMatch, queryParams } from '../../platform/http/validate';
import { requireMembership, type WorkspaceService } from '../workspace';
import type { BillingService } from './service';

function pathId(c: Context<AppEnv>, name: string): string {
  const parsed = idSchema.safeParse(c.req.param(name));
  if (!parsed.success) throw errors.notFound();
  return parsed.data;
}

/**
 * Mounted at /api/v1/workspaces/:workspaceId. Every route requires membership (SEC-004). Logging
 * and reviewing work is open to any member (api-design §4, Auth = M).
 */
export function createBillingRoutes(service: BillingService, workspaces: WorkspaceService) {
  const r = new Hono<AppEnv>();
  const member = requireMembership(workspaces);
  for (const path of [
    '/billable-entries/*',
    '/projects/:projectId/billable-entries',
    '/projects/:projectId/overview',
    '/invoices',
    '/invoices/*',
  ]) {
    r.use(path, member);
  }

  // FR-040 / FR-041
  r.get('/projects/:projectId/billable-entries', queryParams(entryListQuerySchema), async (c) =>
    c.json(await service.listEntries(c.get('ctx'), pathId(c, 'projectId'), c.req.valid('query'))),
  );
  r.post('/projects/:projectId/billable-entries', jsonBody(createEntryRequestSchema), async (c) => {
    const res = await service.createEntry(
      c.get('ctx'),
      pathId(c, 'projectId'),
      c.req.valid('json'),
      parseIdempotencyKey(c.req.header('Idempotency-Key'), false),
    );
    const rowVersion = (res.body as { rowVersion?: number }).rowVersion;
    if (rowVersion !== undefined) c.header('ETag', `"${rowVersion}"`);
    return c.json(res.body, res.status as 201);
  });
  r.get('/billable-entries/:entryId', async (c) => {
    const dto = await service.getEntry(c.get('ctx'), pathId(c, 'entryId'));
    c.header('ETag', `"${dto.rowVersion}"`);
    return c.json(dto);
  });
  r.patch('/billable-entries/:entryId', jsonBody(updateEntryRequestSchema), async (c) => {
    const id = pathId(c, 'entryId');
    const dto = await service.updateEntry(
      c.get('ctx'),
      id,
      c.req.valid('json'),
      parseIfMatch(c.req.header('If-Match')),
    );
    c.header('ETag', `"${dto.rowVersion}"`);
    return c.json(dto);
  });
  r.delete('/billable-entries/:entryId', async (c) => {
    await service.deleteEntry(c.get('ctx'), pathId(c, 'entryId'));
    return c.body(null, 204);
  });

  // FR-015 project overview
  r.get('/projects/:projectId/overview', async (c) =>
    c.json(await service.overview(c.get('ctx'), pathId(c, 'projectId'))),
  );

  // FR-042–FR-046 invoices. Issue and void are owner-only (checked in the service, SEC-011).
  r.get('/invoices', queryParams(invoiceListQuerySchema), async (c) =>
    c.json(await service.listInvoices(c.get('ctx'), c.req.valid('query'))),
  );
  r.post('/invoices', jsonBody(createInvoiceRequestSchema), async (c) => {
    const res = await service.createInvoice(
      c.get('ctx'),
      c.req.valid('json'),
      parseIdempotencyKey(c.req.header('Idempotency-Key'), false),
    );
    const rowVersion = (res.body as { rowVersion?: number }).rowVersion;
    if (rowVersion !== undefined) c.header('ETag', `"${rowVersion}"`);
    return c.json(res.body, res.status as 201);
  });
  r.get('/invoices/:invoiceId', async (c) => {
    const dto = await service.getInvoice(c.get('ctx'), pathId(c, 'invoiceId'));
    c.header('ETag', `"${dto.rowVersion}"`);
    return c.json(dto);
  });
  r.patch('/invoices/:invoiceId', jsonBody(updateInvoiceRequestSchema), async (c) => {
    const id = pathId(c, 'invoiceId');
    const dto = await service.updateDraft(
      c.get('ctx'),
      id,
      c.req.valid('json'),
      parseIfMatch(c.req.header('If-Match')),
    );
    c.header('ETag', `"${dto.rowVersion}"`);
    return c.json(dto);
  });
  r.delete('/invoices/:invoiceId', async (c) => {
    await service.deleteDraft(c.get('ctx'), pathId(c, 'invoiceId'));
    return c.body(null, 204);
  });
  // Idempotency-Key REQUIRED on issue and void (api-design §4, AC-020.3).
  r.post('/invoices/:invoiceId/issue', async (c) => {
    const id = pathId(c, 'invoiceId');
    const key = parseIdempotencyKey(c.req.header('Idempotency-Key'), true) as string;
    const res = await service.issue(c.get('ctx'), id, key);
    return c.json(res.body, res.status as 200);
  });
  r.post('/invoices/:invoiceId/void', jsonBody(voidInvoiceRequestSchema), async (c) => {
    const id = pathId(c, 'invoiceId');
    const key = parseIdempotencyKey(c.req.header('Idempotency-Key'), true) as string;
    const res = await service.void(c.get('ctx'), id, c.req.valid('json'), key);
    return c.json(res.body, res.status as 200);
  });

  return r;
}
