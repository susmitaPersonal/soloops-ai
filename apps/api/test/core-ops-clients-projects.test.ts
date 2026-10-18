import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coreOps } from './core-ops-fixtures';
import { createTestContext, json, type TestContext } from './helpers';

let t: TestContext;
let owner: Awaited<ReturnType<TestContext['register']>>;
let api: ReturnType<typeof coreOps>;

beforeAll(async () => {
  t = await createTestContext();
  owner = await t.register({ name: 'Riya Sen' });
  api = coreOps(t, owner);
});
afterAll(async () => {
  await t.cleanup();
});

describe('FR-010 clients', () => {
  it('TC-004.1 creates a client with a name; optional fields default to null; listed in this workspace only', async () => {
    const res = await api.post('/clients', { name: '  Das Sweets Pvt Ltd  ' });
    expect(res.status).toBe(201);
    expect(res.headers.get('ETag')).toBe('"1"');
    const client = await json(res);
    expect(client).toMatchObject({
      name: 'Das Sweets Pvt Ltd',
      contactName: null,
      email: null,
      phone: null,
      billingAddress: null,
      taxId: null,
      archivedAt: null,
      rowVersion: 1,
    });

    const list = await json(await api.get('/clients'));
    expect(list.items.map((c: { id: string }) => c.id)).toContain(client.id);

    // Another workspace never sees it (AC-004.1 "my workspace's client list only").
    const other = coreOps(t, await t.register());
    expect((await json(await other.get('/clients'))).items).toEqual([]);

    // MongoDB persistence: tenant key injected, no client-supplied fields stored.
    const stored = await t.db.raw.collection('clients').findOne({ _id: client.id });
    expect(stored?.workspaceId).toBe(owner.workspaceId);
  });

  it('TC-004.1 stores all contact and billing fields; "" clears to null', async () => {
    const client = await api.client({
      contactName: 'S. Das',
      email: 'orders@das-sweets.example.com',
      phone: '+91 90000 00000',
      billingAddress: 'Park Street, Kolkata',
      taxId: '',
    });
    expect(client).toMatchObject({
      contactName: 'S. Das',
      email: 'orders@das-sweets.example.com',
      phone: '+91 90000 00000',
      billingAddress: 'Park Street, Kolkata',
      taxId: null,
    });
  });

  it.each([
    [{}, 'name'],
    [{ name: '   ' }, 'name'],
    [{ name: 'x'.repeat(161) }, 'name'],
    [{ name: 'Ok', email: 'not-an-email' }, 'email'],
    [{ name: 'Ok', phone: '1'.repeat(33) }, 'phone'],
    [{ name: 'Ok', billingAddress: 'a'.repeat(501) }, 'billingAddress'],
    [{ name: 'Ok', taxId: 't'.repeat(33) }, 'taxId'],
    [{ name: 'Ok', contactName: 'c'.repeat(161) }, 'contactName'],
  ])('ERR-010 invalid client %j → 422 on %s', async (body, path) => {
    const res = await api.post('/clients', body);
    expect(res.status).toBe(422);
    const problem = await json(res);
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.errors.map((e: { path: string }) => e.path)).toContain(path);
  });

  it('boundary: name of 160 characters is accepted', async () => {
    expect((await api.post('/clients', { name: 'n'.repeat(160) })).status).toBe(201);
  });

  it('FR-010 edit: If-Match required, stale → 412, success bumps rowVersion', async () => {
    const client = await api.client({ name: 'Edit me' });
    expect((await api.patch(`/clients/${client.id}`, { name: 'X' }, null)).status).toBe(428);
    const ok = await api.patch(`/clients/${client.id}`, { contactName: 'Asha' }, 1);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('ETag')).toBe('"2"');
    expect(await json(ok)).toMatchObject({ name: 'Edit me', contactName: 'Asha', rowVersion: 2 });
    const stale = await api.patch(`/clients/${client.id}`, { contactName: 'Old' }, 1);
    expect(stale.status).toBe(412);
    expect((await json(await api.get(`/clients/${client.id}`))).contactName).toBe('Asha');
    expect((await api.patch(`/clients/${client.id}`, {}, 2)).status).toBe(422);
  });

  it('SEC-005 mass assignment: archivedAt, rowVersion and workspaceId in the body are ignored', async () => {
    const client = await api.client({ name: 'Mass' });
    const res = await api.patch(
      `/clients/${client.id}`,
      {
        name: 'Mass 2',
        archivedAt: '2026-01-01T00:00:00Z',
        rowVersion: 99,
        workspaceId: 'x',
        _id: 'y',
      },
      1,
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ name: 'Mass 2', archivedAt: null, rowVersion: 2 });
  });

  it('ERR-005 concurrent edits with the same If-Match: exactly one wins', async () => {
    const client = await api.client({ name: 'Race' });
    const results = await Promise.all(
      [1, 2, 3, 4].map((i) => api.patch(`/clients/${client.id}`, { contactName: `P${i}` }, 1)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 412, 412, 412]);
  });

  it('TC-004.3 archive: read-only, hidden from the default list, shown with archived=true, idempotent', async () => {
    const client = await api.client({ name: 'Archive me' });
    const archived = await api.post(`/clients/${client.id}/archive`);
    expect(archived.status).toBe(200);
    const dto = await json(archived);
    expect(dto.archivedAt).toBe('2026-10-16T09:00:00.000Z');

    const active = await json(await api.get('/clients?limit=100'));
    expect(active.items.map((c: { id: string }) => c.id)).not.toContain(client.id);
    const archivedList = await json(await api.get('/clients?archived=true'));
    expect(archivedList.items.map((c: { id: string }) => c.id)).toContain(client.id);

    // BR-029: read-only.
    const edit = await api.patch(`/clients/${client.id}`, { name: 'Changed' }, dto.rowVersion);
    expect(edit.status).toBe(409);
    expect((await json(edit)).code).toBe('ARCHIVED');
    // Retrying the archive is safe and changes nothing.
    const again = await json(await api.post(`/clients/${client.id}/archive`));
    expect(again).toEqual(dto);
  });

  it('AC-004.2 an unknown or malformed client ID → 404', async () => {
    expect((await api.get('/clients/0192a000-0000-7000-8000-00000000dead')).status).toBe(404);
    expect((await api.get('/clients/not-a-uuid')).status).toBe(404);
    expect((await api.post('/clients/not-a-uuid/archive')).status).toBe(404);
  });

  it('api-design §1 pagination: alphabetical keyset pages with an opaque cursor', async () => {
    const fresh = coreOps(t, await t.register());
    for (const name of ['Charlie', 'Alpha', 'Bravo']) await fresh.client({ name });
    const first = await json(await fresh.get('/clients?limit=2'));
    expect(first.items.map((c: { name: string }) => c.name)).toEqual(['Alpha', 'Bravo']);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await json(
      await fresh.get(`/clients?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`),
    );
    expect(second.items.map((c: { name: string }) => c.name)).toEqual(['Charlie']);
    expect(second.nextCursor).toBeNull();
  });

  it.each([
    'limit=0',
    'limit=101',
    'limit=abc',
    'cursor=%%%',
    'cursor=bm90LWpzb24',
    'archived=yes',
  ])('ERR-010 invalid list query %s → 422', async (query) => {
    const res = await api.get(`/clients?${query}`);
    expect(res.status).toBe(422);
  });
});

describe('FR-011 projects', () => {
  it('TC-005.1 creates a project for a client with billing model, currency and rate override; listed under the client', async () => {
    const client = await api.client({ name: 'Project client' });
    const res = await api.post('/projects', {
      clientId: client.id,
      name: 'Online ordering app',
      description: 'Customer ordering for 3 outlets',
      billingModel: 'HOURLY',
      currency: 'INR',
      hourlyRateMinor: '150000',
      startDate: '2026-10-01',
    });
    expect(res.status).toBe(201);
    const project = await json(res);
    expect(project).toMatchObject({
      clientId: client.id,
      clientName: 'Project client',
      billingModel: 'HOURLY',
      currency: 'INR',
      hourlyRateMinor: '150000',
      startDate: '2026-10-01',
      status: 'ACTIVE',
      archivedAt: null,
      readOnly: false,
      rowVersion: 1,
    });
    const stored = await t.db.raw.collection('projects').findOne({ _id: project.id });
    expect(stored?.hourlyRateMinor).toBe(150000n); // BR-019: Int64, never a float
    expect(stored?.counters).toEqual({ requirement: 0, changeRequest: 0, baseline: 0 });

    const underClient = await json(await api.get(`/projects?clientId=${client.id}`));
    expect(underClient.items.map((p: { id: string }) => p.id)).toEqual([project.id]);
  });

  it('TC-002.1d AC-002.1 (projects): a new project defaults to the workspace currency and rate', async () => {
    const ws = await json(await t.request('GET', api.base, { cookie: owner.cookie }));
    const changed = await t.request('PATCH', api.base, {
      cookie: owner.cookie,
      body: { defaultCurrency: 'USD' },
      headers: { 'If-Match': `"${ws.rowVersion}"` },
    });
    expect(changed.status).toBe(200);
    const client = await api.client({ name: 'Defaults client' });
    const project = await api.project(client.id, { name: 'Defaults' });
    expect(project.currency).toBe('USD');
    expect(project.hourlyRateMinor).toBeNull(); // null = use the workspace default rate (BR-021)
  });

  it('TC-005.2 AC-005.2 creating a project for an archived client → 409 ARCHIVED, nothing stored', async () => {
    const client = await api.client({ name: 'Archived client' });
    await api.post(`/clients/${client.id}/archive`);
    const res = await api.post('/projects', {
      clientId: client.id,
      name: 'Too late',
      billingModel: 'FIXED',
    });
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('ARCHIVED');
    expect(await t.db.raw.collection('projects').countDocuments({ clientId: client.id })).toBe(0);
  });

  it('an unknown client ID in the body → 422 on clientId', async () => {
    const res = await api.post('/projects', {
      clientId: '0192a000-0000-7000-8000-00000000beef',
      name: 'Orphan',
      billingModel: 'FIXED',
    });
    expect(res.status).toBe(422);
    expect((await json(res)).errors[0].path).toBe('clientId');
  });

  it.each([
    [{ billingModel: 'MONTHLY' }, 'billingModel'],
    [{ currency: 'inr' }, 'currency'],
    [{ hourlyRateMinor: '1500.50' }, 'hourlyRateMinor'],
    [{ hourlyRateMinor: 1500 }, 'hourlyRateMinor'],
    [{ hourlyRateMinor: '-1' }, 'hourlyRateMinor'],
    [{ startDate: '2026-02-30' }, 'startDate'],
    [{ startDate: '01/10/2026' }, 'startDate'],
    [{ status: 'DONE' }, 'status'],
    [{ name: '' }, 'name'],
    [{ name: 'p'.repeat(161) }, 'name'],
    [{ description: 'd'.repeat(5001) }, 'description'],
    [{ clientId: 'nope' }, 'clientId'],
  ])('ERR-010 invalid project %j → 422 on %s', async (override, path) => {
    const client = await api.client();
    const res = await api.post('/projects', {
      clientId: client.id,
      name: 'Valid',
      billingModel: 'HOURLY',
      ...override,
    });
    expect(res.status).toBe(422);
    expect((await json(res)).errors.map((e: { path: string }) => e.path)).toContain(path);
  });

  it('FR-011 edit: status and dates change; the client cannot be moved; stale If-Match → 412', async () => {
    const client = await api.client();
    const other = await api.client({ name: 'Other' });
    const project = await api.project(client.id);
    const res = await api.patch(
      `/projects/${project.id}`,
      { status: 'ON_HOLD', startDate: '2026-11-01', hourlyRateMinor: null, clientId: other.id },
      1,
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      status: 'ON_HOLD',
      startDate: '2026-11-01',
      hourlyRateMinor: null,
      clientId: client.id,
      rowVersion: 2,
    });
    expect((await api.patch(`/projects/${project.id}`, { name: 'Stale' }, 1)).status).toBe(412);
  });

  it('BR-029 an archived project is read-only and no requirements or tasks can be added', async () => {
    const client = await api.client();
    const project = await api.project(client.id);
    const archived = await json(await api.post(`/projects/${project.id}/archive`));
    expect(archived).toMatchObject({ readOnly: true });
    expect(archived.archivedAt).not.toBeNull();

    const edit = await api.patch(`/projects/${project.id}`, { name: 'X' }, archived.rowVersion);
    expect(edit.status).toBe(409);
    const req = await api.post(`/projects/${project.id}/requirements`, {
      title: 'Late',
      priority: 'MUST',
    });
    expect(req.status).toBe(409);
    expect((await json(req)).code).toBe('ARCHIVED');
    const task = await api.post(`/projects/${project.id}/tasks`, {
      title: 'Late',
      scope: { type: 'INTERNAL' },
    });
    expect(task.status).toBe(409);
    expect(
      (await json(await api.get('/projects?limit=100'))).items.map((p: { id: string }) => p.id),
    ).not.toContain(project.id);
    expect(
      (await json(await api.get('/projects?archived=true'))).items.map((p: { id: string }) => p.id),
    ).toContain(project.id);
  });

  it('BR-029 archiving the client makes its projects read-only too', async () => {
    const client = await api.client();
    const project = await api.project(client.id);
    await api.post(`/clients/${client.id}/archive`);
    const dto = await json(await api.get(`/projects/${project.id}`));
    expect(dto.readOnly).toBe(true);
    expect(dto.archivedAt).toBeNull();
    expect((await api.patch(`/projects/${project.id}`, { name: 'X' }, 1)).status).toBe(409);
    const req = await api.post(`/projects/${project.id}/requirements`, {
      title: 'Late',
      priority: 'MUST',
    });
    expect(req.status).toBe(409);
  });

  it('lists the most recently active projects first and pages with a cursor', async () => {
    const fresh = coreOps(t, await t.register());
    const client = await fresh.client();
    const p1 = await fresh.project(client.id, { name: 'First' });
    t.clock.advance(1000);
    const p2 = await fresh.project(client.id, { name: 'Second' });
    t.clock.advance(1000);
    // Activity on p1 (a new requirement) moves it to the top.
    await fresh.requirement(p1.id);
    // Restore the shared clock so later tests that assert the fixed time stay order-independent.
    t.clock.set('2026-10-16T09:00:00.000Z');
    const first = await json(await fresh.get('/projects?limit=1'));
    expect(first.items.map((p: { id: string }) => p.id)).toEqual([p1.id]);
    const second = await json(
      await fresh.get(`/projects?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`),
    );
    expect(second.items.map((p: { id: string }) => p.id)).toEqual([p2.id]);
    expect(second.nextCursor).toBeNull();
  });

  it('SEC-005 a tampered project cursor (valid JSON, invalid date or operator object) → 422', async () => {
    const forge = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    for (const cursor of [
      forge({ k: 'not-a-date', id: 'x' }),
      forge({ k: { $gt: '' }, id: 'x' }),
      forge({ k: '2026-10-16T09:00:00.000Z', id: { $ne: null } }),
    ]) {
      const res = await api.get(`/projects?cursor=${cursor}`);
      expect(res.status).toBe(422);
      expect((await json(res)).errors[0].path).toBe('cursor');
    }
  });

  it('ADR-0012 indexes for the documented access patterns exist', async () => {
    const names = async (c: string) => (await t.db.raw.collection(c).indexes()).map((i) => i.name);
    expect(await names('clients')).toContain('workspace_archived_name');
    expect(await names('projects')).toEqual(
      expect.arrayContaining(['workspace_archived_recent', 'workspace_client']),
    );
  });

  it('ADR-0012 the $jsonSchema validator rejects a malformed project written around the API', async () => {
    await expect(
      t.db.raw.collection('projects').insertOne({
        _id: 'bad' as never,
        workspaceId: owner.workspaceId,
        name: 'Bad',
        billingModel: 'MONTHLY',
      }),
    ).rejects.toThrow(/Document failed validation/);
  });
});
