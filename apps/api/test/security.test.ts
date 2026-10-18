import { CSRF_HEADER_NAME } from '@soloops/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../src/platform/ids';
import { createTestContext, json, type TestContext } from './helpers';

let t: TestContext;
let a: Awaited<ReturnType<TestContext['register']>>;
let b: Awaited<ReturnType<TestContext['register']>>;

/** Real resources in workspace A, so the matrix targets existing documents, not placeholders. */
const ids = {
  clientId: '',
  projectId: '',
  requirementId: '',
  taskId: '',
  crId: '',
  entryId: '',
  /** Workspace A's owner: the most sensitive target for the member routes (FR-004). */
  userId: '',
  invoiceId: '',
};

beforeAll(async () => {
  t = await createTestContext();
  a = await t.register({ name: 'Workspace A owner' });
  b = await t.register({ name: 'Workspace B owner' });
  const ws = `/api/v1/workspaces/${a.workspaceId}`;
  const post = async (path: string, body: unknown) =>
    json(await t.request('POST', `${ws}${path}`, { cookie: a.cookie, body }));
  ids.userId = a.userId;
  ids.clientId = (await post('/clients', { name: 'A client' })).id;
  ids.projectId = (
    await post('/projects', { clientId: ids.clientId, name: 'A project', billingModel: 'HOURLY' })
  ).id;
  ids.requirementId = (
    await post(`/projects/${ids.projectId}/requirements`, { title: 'A req', priority: 'MUST' })
  ).id;
  ids.taskId = (
    await post(`/projects/${ids.projectId}/tasks`, { title: 'A task', scope: { type: 'INTERNAL' } })
  ).id;
  ids.crId = (
    await post(`/projects/${ids.projectId}/change-requests`, {
      rawRequestText: 'A private change request',
      sourceChannel: 'EMAIL',
      requestedByName: 'A client',
      receivedOn: '2026-10-12',
    })
  ).id;
  ids.entryId = (
    await post(`/projects/${ids.projectId}/billable-entries`, {
      kind: 'TIME',
      workDate: '2026-10-12',
      minutes: 30,
      description: 'A private work entry',
    })
  ).id;
  // A draft invoice on a second project (baselined), so the first project's state stays untouched.
  const p2 = (
    await post('/projects', {
      clientId: ids.clientId,
      name: 'A billed project',
      billingModel: 'HOURLY',
    })
  ).id;
  const r2 = (await post(`/projects/${p2}/requirements`, { title: 'Billed', priority: 'MUST' })).id;
  await post(`/projects/${p2}/baselines`, undefined);
  const e2 = (
    await post(`/projects/${p2}/billable-entries`, {
      kind: 'TIME',
      workDate: '2026-10-12',
      minutes: 60,
      description: 'A private invoiced entry',
      scope: { type: 'BASELINE', requirementId: r2 },
    })
  ).id;
  ids.invoiceId = (await post('/invoices', { projectId: p2, entryIds: [e2] })).id;
});
afterAll(async () => {
  await t.cleanup();
});

/**
 * TC-SEC-01 matrix: every tenant route, called by the owner of workspace B against
 * workspace A. Adding a tenant route without adding it here fails TC-SEC-02.
 */
const HASH = 'a'.repeat(64);
const TENANT_ROUTES: {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: string;
}[] = [
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId' },
  {
    method: 'PATCH',
    path: '/api/v1/workspaces/:workspaceId',
    body: { taxLabel: 'X' },
    headers: { 'If-Match': '"1"' },
  },
  // Core Ops (FR-010–FR-014)
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/clients' },
  { method: 'POST', path: '/api/v1/workspaces/:workspaceId/clients', body: { name: 'X' } },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/clients/:clientId' },
  {
    method: 'PATCH',
    path: '/api/v1/workspaces/:workspaceId/clients/:clientId',
    body: { name: 'X' },
    headers: { 'If-Match': '"1"' },
  },
  { method: 'POST', path: '/api/v1/workspaces/:workspaceId/clients/:clientId/archive' },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/projects' },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/projects',
    body: { clientId: ':clientId', name: 'X', billingModel: 'FIXED' },
  },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/projects/:projectId' },
  {
    method: 'PATCH',
    path: '/api/v1/workspaces/:workspaceId/projects/:projectId',
    body: { name: 'X' },
    headers: { 'If-Match': '"1"' },
  },
  { method: 'POST', path: '/api/v1/workspaces/:workspaceId/projects/:projectId/archive' },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/projects/:projectId/requirements' },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/projects/:projectId/requirements',
    body: { title: 'X', priority: 'MUST' },
  },
  {
    method: 'PATCH',
    path: '/api/v1/workspaces/:workspaceId/requirements/:requirementId',
    body: { title: 'X' },
    headers: { 'If-Match': '"1"' },
  },
  { method: 'DELETE', path: '/api/v1/workspaces/:workspaceId/requirements/:requirementId' },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/projects/:projectId/baselines' },
  { method: 'POST', path: '/api/v1/workspaces/:workspaceId/projects/:projectId/baselines' },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/projects/:projectId/tasks' },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/projects/:projectId/tasks',
    body: { title: 'X', scope: { type: 'INTERNAL' } },
  },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/tasks/:taskId' },
  {
    method: 'PATCH',
    path: '/api/v1/workspaces/:workspaceId/tasks/:taskId',
    body: { status: 'DONE' },
    headers: { 'If-Match': '"1"' },
  },
  // Scope Guard (FR-020–FR-032) and AI (FR-021, FR-053, FR-054)
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/projects/:projectId/change-requests' },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/projects/:projectId/change-requests',
    body: {
      rawRequestText: 'X',
      sourceChannel: 'CHAT',
      requestedByName: 'X',
      receivedOn: '2026-10-12',
    },
  },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/change-requests' },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/change-requests/:crId' },
  {
    method: 'GET',
    path: '/api/v1/workspaces/:workspaceId/change-requests/:crId/diff',
    query: '?from=1&to=1',
  },
  { method: 'POST', path: '/api/v1/workspaces/:workspaceId/change-requests/:crId/versions' },
  {
    method: 'PATCH',
    path: '/api/v1/workspaces/:workspaceId/change-requests/:crId/versions/:n',
    body: { title: 'X' },
    headers: { 'If-Match': '"1"' },
  },
  { method: 'DELETE', path: '/api/v1/workspaces/:workspaceId/change-requests/:crId/versions/:n' },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/change-requests/:crId/versions/:n/analyze',
  },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/change-requests/:crId/versions/:n/propose',
    headers: { 'If-Match': '"1"' },
  },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/change-requests/:crId/versions/:n/withdraw',
  },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/change-requests/:crId/versions/:n/decisions',
    body: {
      decision: 'APPROVED',
      contentHash: HASH,
      clientDecisionMakerName: 'X',
      decidedOn: '2026-10-14',
      channel: 'EMAIL',
    },
    headers: { 'Idempotency-Key': 'security-matrix-key-1' },
  },
  {
    method: 'GET',
    path: '/api/v1/workspaces/:workspaceId/change-requests/:crId/versions/:n/summary',
  },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/change-requests/:crId/versions/:n/tasks',
    body: { criterionIndexes: [0] },
  },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/projects/:projectId/billable-entries' },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/projects/:projectId/billable-entries',
    body: { kind: 'TIME', workDate: '2026-10-12', minutes: 15, description: 'X' },
  },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/billable-entries/:entryId' },
  {
    method: 'PATCH',
    path: '/api/v1/workspaces/:workspaceId/billable-entries/:entryId',
    body: { description: 'X' },
    headers: { 'If-Match': '"1"' },
  },
  { method: 'DELETE', path: '/api/v1/workspaces/:workspaceId/billable-entries/:entryId' },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/projects/:projectId/overview' },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/invoices' },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/invoices',
    body: { projectId: ':projectId', entryIds: [':entryId'] },
  },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/invoices/:invoiceId' },
  {
    method: 'PATCH',
    path: '/api/v1/workspaces/:workspaceId/invoices/:invoiceId',
    body: { lineDescriptions: [{ position: 1, description: 'X' }] },
    headers: { 'If-Match': '"1"' },
  },
  { method: 'DELETE', path: '/api/v1/workspaces/:workspaceId/invoices/:invoiceId' },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/invoices/:invoiceId/issue',
    headers: { 'Idempotency-Key': 'security-matrix-issue-1' },
  },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/invoices/:invoiceId/void',
    body: { reason: 'X' },
    headers: { 'Idempotency-Key': 'security-matrix-void-1' },
  },
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/ai/status' },
  {
    method: 'PUT',
    path: '/api/v1/workspaces/:workspaceId/ai-enablement',
    body: { enabled: false },
  },
  // Members (FR-004)
  { method: 'GET', path: '/api/v1/workspaces/:workspaceId/members' },
  {
    method: 'POST',
    path: '/api/v1/workspaces/:workspaceId/members',
    body: { email: 'someone@example.com' },
  },
  { method: 'DELETE', path: '/api/v1/workspaces/:workspaceId/members/:userId' },
];

/** Routes that only an OWNER may call (TC-SEC-03). */
const OWNER_ONLY_ROUTES = [
  'PATCH /api/v1/workspaces/:workspaceId',
  'PUT /api/v1/workspaces/:workspaceId/ai-enablement',
  'POST /api/v1/workspaces/:workspaceId/invoices/:invoiceId/issue',
  'POST /api/v1/workspaces/:workspaceId/invoices/:invoiceId/void',
  'POST /api/v1/workspaces/:workspaceId/members',
  'DELETE /api/v1/workspaces/:workspaceId/members/:userId',
];

/** Fills `:workspaceId` and every resource placeholder with workspace A's real IDs. */
const fill = (path: string, workspaceId: string) =>
  path
    .replace(':workspaceId', workspaceId)
    .replace(':clientId', ids.clientId)
    .replace(':projectId', ids.projectId)
    .replace(':requirementId', ids.requirementId)
    .replace(':taskId', ids.taskId)
    .replace(':userId', ids.userId)
    .replace(':crId', ids.crId)
    .replace(':entryId', ids.entryId)
    .replace(':invoiceId', ids.invoiceId)
    .replace(':n', '1');
const fillBody = (body: unknown) =>
  body === undefined ? undefined : JSON.parse(fill(JSON.stringify(body), ''));
const RESOURCE_PARAM = /:(client|project|requirement|task|cr|entry|invoice)Id/;

describe('SEC-004 workspace isolation', () => {
  it.each(TENANT_ROUTES)(
    'TC-SEC-01 $method $path: foreign workspace → 404, identical to a missing one',
    async (route) => {
      const foreign = await t.request(
        route.method,
        fill(route.path, a.workspaceId) + (route.query ?? ''),
        {
          cookie: b.cookie,
          body: fillBody(route.body),
          headers: route.headers,
        },
      );
      const missing = await t.request(
        route.method,
        fill(route.path, newId()) + (route.query ?? ''),
        {
          cookie: b.cookie,
          body: fillBody(route.body),
          headers: route.headers,
        },
      );
      const malformed = await t.request(
        route.method,
        fill(route.path, 'not-a-uuid') + (route.query ?? ''),
        {
          cookie: b.cookie,
          body: fillBody(route.body),
          headers: route.headers,
        },
      );
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(malformed.status).toBe(404);
      const strip = async (r: Response) => ({ ...(await json(r)), requestId: undefined });
      const foreignBody = await strip(foreign);
      expect(foreignBody).toEqual(await strip(missing));
      expect(foreignBody).toEqual(await strip(malformed));
      expect(foreignBody.code).toBe('NOT_FOUND');
    },
  );

  it.each(TENANT_ROUTES)('$method $path without a session → 401', async (route) => {
    const res = await t.request(
      route.method,
      fill(route.path, a.workspaceId) + (route.query ?? ''),
      {
        body: fillBody(route.body),
        headers: route.headers,
      },
    );
    expect(res.status).toBe(401);
  });

  // AC-004.2: B is a member of its own workspace but sends A's resource IDs. Path IDs must look
  // missing (404); a body reference (POST /projects with A's clientId) is a field error (422).
  it.each(TENANT_ROUTES.filter((r) => RESOURCE_PARAM.test(r.path + JSON.stringify(r.body ?? ''))))(
    'TC-SEC-01d $method $path: a resource ID from another workspace is treated as missing',
    async (route) => {
      const res = await t.request(
        route.method,
        fill(route.path, b.workspaceId) + (route.query ?? ''),
        {
          cookie: b.cookie,
          body: fillBody(route.body),
          headers: route.headers,
        },
      );
      const body = await json(res);
      if (RESOURCE_PARAM.test(route.path)) {
        expect(res.status).toBe(404);
        expect(body.code).toBe('NOT_FOUND');
        // No enumeration oracle: A's real ID looks exactly like an ID that exists nowhere.
        const missingPath =
          route.path
            .replace(':workspaceId', b.workspaceId)
            .replace(RESOURCE_PARAM, newId())
            .replace(':n', '1') + (route.query ?? '');
        const missing = await t.request(route.method, missingPath, {
          cookie: b.cookie,
          body: fillBody(route.body),
          headers: route.headers,
        });
        expect(missing.status).toBe(404);
        expect({ ...body, requestId: undefined }).toEqual({
          ...(await json(missing)),
          requestId: undefined,
        });
      } else {
        expect(res.status).toBe(422);
        expect(['clientId', 'projectId']).toContain(body.errors[0].path);
      }
      expect(JSON.stringify(body)).not.toContain('A client');
    },
  );

  it("TC-SEC-01d A's resources are unchanged after every cross-workspace attempt", async () => {
    // Self-contained: send the destructive cross-workspace calls here as well.
    for (const route of TENANT_ROUTES.filter((r) => r.method !== 'GET')) {
      await t.request(route.method, fill(route.path, b.workspaceId) + (route.query ?? ''), {
        cookie: b.cookie,
        body: fillBody(route.body),
        headers: route.headers,
      });
      await t.request(route.method, fill(route.path, a.workspaceId) + (route.query ?? ''), {
        cookie: b.cookie,
        body: fillBody(route.body),
        headers: route.headers,
      });
    }
    const ws = `/api/v1/workspaces/${a.workspaceId}`;
    const get = async (path: string) =>
      json(await t.request('GET', `${ws}${path}`, { cookie: a.cookie }));
    expect(await get(`/clients/${ids.clientId}`)).toMatchObject({
      name: 'A client',
      archivedAt: null,
      rowVersion: 1,
    });
    expect(await get(`/projects/${ids.projectId}`)).toMatchObject({
      name: 'A project',
      archivedAt: null,
      rowVersion: 1,
    });
    const reqs = await get(`/projects/${ids.projectId}/requirements`);
    expect(reqs.items).toHaveLength(1);
    expect(reqs.items[0]).toMatchObject({ title: 'A req', baselineId: null, rowVersion: 1 });
    expect(await get(`/tasks/${ids.taskId}`)).toMatchObject({ status: 'TODO', rowVersion: 1 });
    expect((await get(`/projects/${ids.projectId}/baselines`)).items).toEqual([]);
    expect((await get('/clients')).items).toHaveLength(1);
    expect(await get(`/change-requests/${ids.crId}`)).toMatchObject({
      rowVersion: 1,
      status: 'DRAFT',
      latestVersionNumber: 1,
      versions: [expect.objectContaining({ title: 'A private change request', state: 'DRAFT' })],
    });
    expect(await t.db.raw.collection('approvals').countDocuments({})).toBe(0);
    expect(await get(`/billable-entries/${ids.entryId}`)).toMatchObject({
      description: 'A private work entry',
      minutes: 30,
      rowVersion: 1,
    });
    expect((await get(`/projects/${ids.projectId}/billable-entries`)).ineligible).toHaveLength(1);
    expect((await get(`/projects/${ids.projectId}/tasks`)).items).toHaveLength(1);
    expect(await get(`/invoices/${ids.invoiceId}`)).toMatchObject({
      status: 'DRAFT',
      number: null,
      rowVersion: 1,
      lines: [
        expect.objectContaining({
          description: expect.stringContaining('A private invoiced entry'),
        }),
      ],
    });
    expect((await get('')).rowVersion).toBe(1);
    // BR-023: no cross-workspace call consumed an invoice number.
    const wsDoc = await t.db.raw.collection('workspaces').findOne({ _id: a.workspaceId as never });
    expect(wsDoc?.nextInvoiceNumber).toBe(1);
    expect((await get('')).aiEnabled).toBe(false);
    // FR-004: no cross-workspace call added or removed a member of A; A's owner is still owner.
    expect((await get('/members')).items).toEqual([
      expect.objectContaining({ userId: a.userId, role: 'OWNER' }),
    ]);
  });

  it("a foreign PATCH never changes the other workspace's data", async () => {
    // Self-contained: send the foreign PATCH here instead of relying on earlier tests.
    const res = await t.request('PATCH', `/api/v1/workspaces/${a.workspaceId}`, {
      cookie: b.cookie,
      headers: { 'If-Match': '"1"' },
      body: { taxLabel: 'Pwned' },
    });
    expect(res.status).toBe(404);
    const doc = await t.db.raw.collection('workspaces').findOne({ _id: a.workspaceId as never });
    expect(doc?.taxLabel).toBe('Tax');
    expect(doc?.rowVersion).toBe(1);
  });

  it('SEC-004 membership is checked before validation: a foreign invalid request is 404, not 422/428', async () => {
    const res = await t.request('PATCH', `/api/v1/workspaces/${a.workspaceId}`, {
      cookie: b.cookie,
      body: { taxRateBps: -5, unknown: true },
    });
    expect(res.status).toBe(404);
  });

  it('TC-SEC-02 route inventory: every registered tenant route is in the TC-SEC-01 matrix', () => {
    const registered = new Set(
      t.app.routes
        .filter((r) => r.path.includes(':workspaceId') && r.method !== 'ALL')
        .map((r) => `${r.method} ${r.path}`),
    );
    const covered = new Set(TENANT_ROUTES.map((r) => `${r.method} ${r.path}`));
    expect([...registered].sort()).toEqual([...covered].sort());
    expect(registered.size).toBeGreaterThan(0);
  });

  it('TC-SEC-03 role matrix: owner-only routes give 403 to a MEMBER', async () => {
    const member = await t.addMember(a.workspaceId);
    for (const key of OWNER_ONLY_ROUTES) {
      const route = TENANT_ROUTES.find((r) => `${r.method} ${r.path}` === key);
      if (!route) throw new Error(`${key} missing from TENANT_ROUTES`);
      const res = await t.request(
        route.method,
        fill(route.path, a.workspaceId) + (route.query ?? ''),
        {
          cookie: member.cookie,
          body: route.body,
          headers: route.headers,
        },
      );
      expect(res.status, key).toBe(403);
    }
  });
});

describe('TC-SEC-04 CSRF (SEC-003)', () => {
  const login = { email: 'csrf@example.com', password: 'whatever-password' };

  it('rejects a mutation without X-Requested-With', async () => {
    const res = await t.request('POST', '/api/v1/auth/login', { body: login, csrf: false });
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('CSRF_REJECTED');
  });

  it('rejects a mutation with the wrong X-Requested-With value', async () => {
    const res = await t.request('POST', '/api/v1/auth/login', {
      body: login,
      csrf: false,
      headers: { [CSRF_HEADER_NAME]: 'XMLHttpRequest' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects a mutation from a foreign Origin', async () => {
    // Compare with a snapshot taken here, not the defaults: other tests in this file share workspace A.
    const workspaces = t.db.raw.collection('workspaces');
    const before = await workspaces.findOne({ _id: a.workspaceId as never });
    const res = await t.request('PATCH', `/api/v1/workspaces/${a.workspaceId}`, {
      cookie: a.cookie,
      origin: 'https://evil.example.com',
      headers: { 'If-Match': `"${before?.rowVersion}"` },
      body: { taxLabel: 'Pwned' },
    });
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('CSRF_REJECTED');
    expect(await workspaces.findOne({ _id: a.workspaceId as never })).toEqual(before);
  });

  it('rejects a mutation with no Origin header', async () => {
    const res = await t.request('POST', '/api/v1/auth/logout', { cookie: a.cookie, origin: null });
    expect(res.status).toBe(403);
    expect((await t.request('GET', '/api/v1/auth/me', { cookie: a.cookie })).status).toBe(200);
  });

  it('allows safe GETs without Origin (Next.js server-side reads, ADR-0013)', async () => {
    const res = await t.request('GET', '/api/v1/auth/me', { cookie: a.cookie, origin: null });
    expect(res.status).toBe(200);
  });
});

describe('SEC-005 input handling', () => {
  it('NoSQL operator injection in the login email is rejected by validation', async () => {
    const res = await t.request('POST', '/api/v1/auth/login', {
      body: { email: { $ne: null }, password: { $ne: null } },
    });
    expect(res.status).toBe(422);
  });

  it('malformed JSON → 400 MALFORMED_JSON', async () => {
    const res = await t.request('POST', '/api/v1/auth/login', { rawBody: '{"email":' });
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('MALFORMED_JSON');
  });

  it('bodies over 256 KB → 413', async () => {
    const res = await t.request('POST', '/api/v1/auth/register', {
      body: {
        name: 'x'.repeat(300 * 1024),
        email: 'big@example.com',
        password: 'long enough password',
      },
    });
    expect(res.status).toBe(413);
    expect((await json(res)).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('unknown routes → 404 problem+json', async () => {
    const res = await t.request('GET', '/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
  });
});

describe('SEC-010 headers and NFR-010 request IDs', () => {
  it('sets security headers, API-Version and no-store on API responses', async () => {
    const res = await t.request('GET', '/api/v1/auth/me', { cookie: a.cookie });
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(res.headers.get('API-Version')).toBe('1');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull(); // CORS disabled (ADR-0013)
  });

  it('propagates a valid X-Request-Id into the response and problem body', async () => {
    const res = await t.request('GET', '/api/v1/auth/me', {
      headers: { 'X-Request-Id': 'web-abc123' },
    });
    expect(res.headers.get('X-Request-Id')).toBe('web-abc123');
    expect((await json(res)).requestId).toBe('web-abc123');
  });

  it('replaces a request ID containing unsafe characters (log injection)', async () => {
    const res = await t.request('GET', '/api/v1/auth/me', {
      headers: { 'X-Request-Id': 'bad id {"INJECTED":1}' },
    });
    expect(res.headers.get('X-Request-Id')).not.toContain('INJECTED');
    expect(res.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
