import { describe, expect, it, vi } from 'vitest';
import { ClientError, createApiClient } from './index';

const WS = '0192a000-0000-7000-8000-000000000001';
const ID = '0192a000-0000-7000-8000-0000000000c1';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const client = {
  id: ID,
  name: 'Das Sweets',
  contactName: null,
  email: null,
  phone: null,
  billingAddress: null,
  taxId: null,
  archivedAt: null,
  rowVersion: 2,
  createdAt: '2026-10-16T09:00:00.000Z',
  updatedAt: '2026-10-16T09:00:00.000Z',
};

function setup(response: () => Response) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response());
  return { fetch, api: createApiClient({ baseUrl: 'http://api', fetch }) };
}
const url = (fetch: ReturnType<typeof vi.fn>, i = 0) => String(fetch.mock.calls[i]?.[0]);
const init = (fetch: ReturnType<typeof vi.fn>, i = 0) =>
  fetch.mock.calls[i]?.[1] as RequestInit & { headers: Record<string, string> };

describe('@soloops/api-client core-ops (FR-010–FR-014)', () => {
  it('UT-CLI-CO-01 list filters become a query string; undefined values are omitted', async () => {
    const { fetch, api } = setup(() => json(200, { items: [client], nextCursor: null }));
    const page = await api.clients.list(WS, { archived: true, limit: 20, cursor: undefined });
    expect(url(fetch)).toBe(`http://api/api/v1/workspaces/${WS}/clients?archived=true&limit=20`);
    expect(page.items[0]?.name).toBe('Das Sweets');
    await api.clients.list(WS);
    expect(url(fetch, 1)).toBe(`http://api/api/v1/workspaces/${WS}/clients`);
  });

  it('UT-CLI-CO-02 updates send If-Match; archive is a POST with the CSRF header', async () => {
    const { fetch, api } = setup(() => json(200, client));
    await api.clients.update(WS, ID, { name: 'Das Sweets' }, 2);
    expect(init(fetch).method).toBe('PATCH');
    expect(init(fetch).headers['If-Match']).toBe('"2"');
    await api.clients.archive(WS, ID);
    expect(url(fetch, 1)).toBe(`http://api/api/v1/workspaces/${WS}/clients/${ID}/archive`);
    expect(init(fetch, 1).method).toBe('POST');
    expect(init(fetch, 1).headers['X-Requested-With']).toBe('soloops');
  });

  it('UT-CLI-CO-03 path IDs are URL-encoded (no path injection)', async () => {
    const { fetch, api } = setup(() => json(200, { items: [] }));
    await api.requirements.list(WS, '../../auth/me');
    expect(url(fetch)).toBe(
      `http://api/api/v1/workspaces/${WS}/projects/..%2F..%2Fauth%2Fme/requirements`,
    );
  });

  it('UT-CLI-CO-04 DELETE accepts an empty 204 response', async () => {
    const { fetch, api } = setup(() => new Response(null, { status: 204 }));
    await expect(api.requirements.delete(WS, ID)).resolves.toBeUndefined();
    expect(init(fetch).method).toBe('DELETE');
  });

  it('UT-CLI-CO-05 a response that breaks the task contract is rejected', async () => {
    const { api } = setup(() => json(201, { id: ID, title: 'No scope' }));
    await expect(
      api.tasks.create(WS, ID, { title: 'X', scope: { type: 'INTERNAL' } }),
    ).rejects.toBeInstanceOf(ClientError);
  });

  it('UT-CLI-CO-06 every Core Ops method uses the documented method and path', async () => {
    const P = '0192a000-0000-7000-8000-0000000000e1';
    const ts = '2026-10-16T09:00:00.000Z';
    const project = {
      id: P,
      clientId: ID,
      clientName: 'Das',
      name: 'App',
      description: null,
      billingModel: 'HOURLY',
      currency: 'INR',
      hourlyRateMinor: null,
      startDate: null,
      status: 'ACTIVE',
      archivedAt: null,
      readOnly: false,
      rowVersion: 1,
      createdAt: ts,
      updatedAt: ts,
    };
    const requirement = {
      id: ID,
      projectId: P,
      number: 1,
      key: 'REQ-1',
      title: 'T',
      description: '',
      acceptanceCriteria: [],
      priority: 'MUST',
      baselineId: null,
      rowVersion: 1,
      createdAt: ts,
      updatedAt: ts,
    };
    const baseline = {
      id: ID,
      projectId: P,
      sequence: 1,
      requirementCount: 1,
      contentHash: 'a'.repeat(64),
      createdByUserId: ID,
      createdAt: ts,
    };
    const task = {
      id: ID,
      projectId: P,
      title: 'T',
      description: null,
      assigneeUserId: null,
      status: 'TODO',
      billable: false,
      scope: { type: 'INTERNAL', requirementId: null, changeRequestId: null, versionNumber: null },
      rowVersion: 1,
      createdAt: ts,
      updatedAt: ts,
    };
    const replies = [
      { items: [client], nextCursor: null },
      client,
      client,
      { items: [project], nextCursor: 'c' },
      project,
      project,
      project,
      project,
      { items: [requirement] },
      requirement,
      requirement,
      { items: [baseline] },
      baseline,
      { items: [task], nextCursor: null },
      task,
      task,
      task,
    ];
    let i = 0;
    const { fetch, api } = setup(() => json(200, replies[i++]));
    const w = `http://api/api/v1/workspaces/${WS}`;
    await api.clients.list(WS);
    expect((await api.clients.get(WS, ID)).data.id).toBe(ID);
    await api.clients.create(WS, { name: 'Das' });
    await api.projects.list(WS, { clientId: ID, archived: false });
    await api.projects.get(WS, P);
    await api.projects.create(WS, { clientId: ID, name: 'App', billingModel: 'HOURLY' });
    await api.projects.update(WS, P, { name: 'App 2' }, 1);
    await api.projects.archive(WS, P);
    await api.requirements.list(WS, P);
    await api.requirements.create(WS, P, { title: 'T', priority: 'MUST' });
    await api.requirements.update(WS, ID, { title: 'T2' }, 1);
    await api.baselines.list(WS, P);
    await api.baselines.create(WS, P);
    await api.tasks.list(WS, P, { status: 'TODO' });
    await api.tasks.get(WS, ID);
    await api.tasks.create(WS, P, { title: 'T', scope: { type: 'INTERNAL' } });
    await api.tasks.update(WS, ID, { status: 'DONE' }, 1);
    const calls = fetch.mock.calls.map(
      ([u, init]) => `${init?.method} ${String(u).replace(w, '')}`,
    );
    expect(calls).toEqual([
      'GET /clients',
      `GET /clients/${ID}`,
      'POST /clients',
      `GET /projects?clientId=${ID}&archived=false`,
      `GET /projects/${P}`,
      'POST /projects',
      `PATCH /projects/${P}`,
      `POST /projects/${P}/archive`,
      `GET /projects/${P}/requirements`,
      `POST /projects/${P}/requirements`,
      `PATCH /requirements/${ID}`,
      `GET /projects/${P}/baselines`,
      `POST /projects/${P}/baselines`,
      `GET /projects/${P}/tasks?status=TODO`,
      `GET /tasks/${ID}`,
      `POST /projects/${P}/tasks`,
      `PATCH /tasks/${ID}`,
    ]);
    expect(init(fetch, 6).headers['If-Match']).toBe('"1"');
    expect(init(fetch, 16).headers['If-Match']).toBe('"1"');
  });
});
