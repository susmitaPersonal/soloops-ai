import { json, type TestContext, type TestRequestOptions } from './helpers';

type User = Awaited<ReturnType<TestContext['register']>>;

/**
 * Core Ops fixtures (FR-010–FR-014): a user-bound request helper and factories that create
 * data **through the API**, so every fixture passes the same validation and rules as real use.
 */
export function coreOps(t: TestContext, user: User) {
  const base = `/api/v1/workspaces/${user.workspaceId}`;
  const call = (method: string, path: string, opts: TestRequestOptions = {}) =>
    t.request(method, `${base}${path}`, { cookie: user.cookie, ...opts });

  async function created(res: Response, what: string) {
    if (res.status !== 201) throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
    return json(res);
  }

  const api = {
    base,
    get: (path: string) => call('GET', path),
    post: (path: string, body?: unknown, headers?: Record<string, string>) =>
      call('POST', path, { body, ...(headers ? { headers } : {}) }),
    patch: (path: string, body: unknown, rowVersion: number | string | null) =>
      call('PATCH', path, {
        body,
        ...(rowVersion === null ? {} : { headers: { 'If-Match': `"${rowVersion}"` } }),
      }),
    del: (path: string) => call('DELETE', path),

    client: async (body: Record<string, unknown> = {}) =>
      created(await api.post('/clients', { name: 'Das Sweets Pvt Ltd', ...body }), 'client'),
    project: async (clientId: string, body: Record<string, unknown> = {}) =>
      created(
        await api.post('/projects', {
          clientId,
          name: 'Online ordering app',
          billingModel: 'HOURLY',
          ...body,
        }),
        'project',
      ),
    requirement: async (projectId: string, body: Record<string, unknown> = {}) =>
      created(
        await api.post(`/projects/${projectId}/requirements`, {
          title: 'Customer login',
          priority: 'MUST',
          ...body,
        }),
        'requirement',
      ),
    baseline: async (projectId: string) =>
      created(await api.post(`/projects/${projectId}/baselines`), 'baseline'),
    task: async (projectId: string, body: Record<string, unknown> = {}) =>
      created(
        await api.post(`/projects/${projectId}/tasks`, {
          title: 'Set up CI',
          scope: { type: 'INTERNAL' },
          ...body,
        }),
        'task',
      ),
    /** A client + project with `n` baselined requirements: the minimum for billable work. */
    async baselinedProject(n = 1) {
      const client = await api.client();
      const project = await api.project(client.id);
      const requirements = [];
      for (let i = 0; i < n; i += 1) {
        requirements.push(await api.requirement(project.id, { title: `Requirement ${i + 1}` }));
      }
      const baseline = await api.baseline(project.id);
      return { client, project, requirements, baseline };
    },
  };
  return api;
}
