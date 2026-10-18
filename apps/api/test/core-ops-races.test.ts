// Regression tests for the M2 security review (docs/quality/test-execution-report.md §10):
// interleavings that the plain concurrency tests cannot hit reliably. Each test wraps the REAL
// database so a competing request commits at an exact point inside the request under test.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { Database } from '../src/platform/db';
import { newId } from '../src/platform/ids';
import { createLogger } from '../src/platform/logging';
import { coreOps } from './core-ops-fixtures';
import { APP_ORIGIN, createTestContext, json, type TestContext } from './helpers';

let t: TestContext;
let owner: Awaited<ReturnType<TestContext['register']>>;
let api: ReturnType<typeof coreOps>;

beforeAll(async () => {
  t = await createTestContext();
  owner = await t.register({ name: 'Race owner' });
  api = coreOps(t, owner);
});
afterAll(async () => {
  await t.cleanup();
});

function appWith(db: Database) {
  return createApp({ config: t.config, db, clock: t.clock, logger: createLogger('silent') });
}

const send = (
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  app.request(`${api.base}${path}`, {
    method,
    headers: {
      Origin: APP_ORIGIN,
      'X-Requested-With': 'soloops',
      Cookie: owner.cookie,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('BR-015 stale snapshot race on task update (review F1)', () => {
  it('TC-016.R a concurrent unlink cannot be combined with "billable: true" from a stale read', async () => {
    const { project, requirements } = await api.baselinedProject(1);
    const task = await api.task(project.id, {
      title: 'Race task',
      billable: false,
      scope: { type: 'BASELINE', requirementId: requirements[0].id },
    });

    // Request A (scope → INTERNAL) commits just before request B's transaction starts.
    let fired = false;
    const racing: Database = {
      ...t.db,
      withTransaction: async (fn) => {
        if (!fired) {
          fired = true;
          const a = await api.patch(`/tasks/${task.id}`, { scope: { type: 'INTERNAL' } }, 1);
          expect(a.status).toBe(200);
        }
        return t.db.withTransaction(fn);
      },
    };
    // Request B: billable true, with If-Match "2" (the version A produces).
    const b = await send(
      appWith(racing),
      'PATCH',
      `/tasks/${task.id}`,
      { billable: true },
      {
        'If-Match': '"2"',
      },
    );
    expect(fired).toBe(true);
    expect(b.status).toBe(422);
    expect((await json(b)).code).toBe('NOT_ELIGIBLE');
    const stored = await t.db.raw.collection('tasks').findOne({ _id: task.id });
    expect(stored).toMatchObject({ billable: false, scope: { type: 'INTERNAL' }, rowVersion: 2 });
  });

  it('TC-016.R2 If-Match is compared with the version read in the transaction (stale → 412)', async () => {
    const { project } = await api.baselinedProject(1);
    const task = await api.task(project.id, { title: 'Versioned' });
    await api.patch(`/tasks/${task.id}`, { status: 'IN_PROGRESS' }, 1);
    const res = await api.patch(`/tasks/${task.id}`, { status: 'DONE' }, 1);
    expect(res.status).toBe(412);
  });
});

describe('BR-029 client archive vs concurrent writes (review F3)', () => {
  /** Archives `clientId` through the normal app the first time a client is read inside a transaction. */
  function archiveDuringFirstTxClientRead(clientId: string) {
    let fired = false;
    const db: Database = {
      ...t.db,
      tenant: (name, workspaceId) => {
        const c = t.db.tenant(name, workspaceId);
        if (name !== 'clients') return c;
        return Object.create(c, {
          findOne: {
            value: async (...args: Parameters<typeof c.findOne>) => {
              const result = await c.findOne(...args);
              if (!fired && args[1]?.session) {
                fired = true;
                const res = await api.post(`/clients/${clientId}/archive`);
                expect(res.status).toBe(200);
              }
              return result;
            },
          },
        });
      },
    } as Database;
    return { db, fired: () => fired };
  }

  it('TC-BR-029.3 a task create that read the client before the archive is refused on retry (409)', async () => {
    const client = await api.client({ name: 'Race client' });
    const project = await api.project(client.id);
    const race = archiveDuringFirstTxClientRead(client.id);
    const res = await send(appWith(race.db), 'POST', `/projects/${project.id}/tasks`, {
      title: 'Too late',
      scope: { type: 'INTERNAL' },
    });
    expect(race.fired()).toBe(true);
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('ARCHIVED');
    expect(await t.db.raw.collection('tasks').countDocuments({ projectId: project.id })).toBe(0);
  });

  it('TC-BR-029.4 a project edit that read the client before the archive is refused on retry (409)', async () => {
    const client = await api.client({ name: 'Race client 2' });
    const project = await api.project(client.id);
    const race = archiveDuringFirstTxClientRead(client.id);
    const res = await send(
      appWith(race.db),
      'PATCH',
      `/projects/${project.id}`,
      { name: 'Renamed after archive' },
      { 'If-Match': '"1"' },
    );
    expect(race.fired()).toBe(true);
    expect(res.status).toBe(409);
    const stored = await t.db.raw.collection('projects').findOne({ _id: project.id });
    expect(stored?.name).toBe('Online ordering app');
  });
});

describe('AC-005.2 client archive vs project create (test review D2)', () => {
  it('TC-005.R a project create that read the client before the archive is refused on retry (409)', async () => {
    const client = await api.client({ name: 'Race client 3' });
    let fired = false;
    const db: Database = {
      ...t.db,
      tenant: (name, workspaceId) => {
        const c = t.db.tenant(name, workspaceId);
        if (name !== 'clients') return c;
        return Object.create(c, {
          findOne: {
            value: async (...args: Parameters<typeof c.findOne>) => {
              const result = await c.findOne(...args);
              if (!fired && args[1]?.session) {
                fired = true;
                expect((await api.post(`/clients/${client.id}/archive`)).status).toBe(200);
              }
              return result;
            },
          },
        });
      },
    } as Database;
    const res = await send(appWith(db), 'POST', '/projects', {
      clientId: client.id,
      name: 'Too late',
      billingModel: 'FIXED',
    });
    expect(fired).toBe(true);
    expect(res.status).toBe(409);
    expect(await t.db.raw.collection('projects').countDocuments({ clientId: client.id })).toBe(0);
  });
});

describe('BR-004 requirement cap keeps every draft inside one baseline (review F2)', () => {
  it('TC-006.L a project holds at most 500 active requirements; deleted ones do not count', async () => {
    const project = await api.project((await api.client()).id);
    // Volume setup only: 499 valid drafts written directly (the validator still applies), and the
    // counter moved past them so the API keeps allocating unique numbers.
    const at = t.clock.now();
    await t.db.raw.collection('requirements').insertMany(
      Array.from({ length: 499 }, (_, i) => ({
        _id: newId() as never,
        workspaceId: owner.workspaceId,
        projectId: project.id,
        number: i + 1,
        title: `Seeded ${i + 1}`,
        description: '',
        acceptanceCriteria: [],
        priority: 'COULD',
        baselineId: null,
        deletedAt: null,
        rowVersion: 1,
        createdAt: at,
        updatedAt: at,
      })),
    );
    await t.db.raw
      .collection('projects')
      .updateOne({ _id: project.id as never }, { $set: { 'counters.requirement': 499 } });

    const r500 = await api.requirement(project.id, { title: 'Number 500' });
    expect(r500.key).toBe('REQ-500');
    const over = await api.post(`/projects/${project.id}/requirements`, {
      title: 'Number 501',
      priority: 'MUST',
    });
    expect(over.status).toBe(422);
    expect((await json(over)).detail).toMatch(/at most 500 requirements/);

    // Deleting one frees a slot (the number is still not reused).
    expect((await api.del(`/requirements/${r500.id}`)).status).toBe(204);
    expect((await api.requirement(project.id, { title: 'Replacement' })).key).toBe('REQ-501');

    // The baseline freezes all 500 active drafts, and the list shows all of them.
    const baseline = await api.baseline(project.id);
    expect(baseline.requirementCount).toBe(500);
    const list = await json(await api.get(`/projects/${project.id}/requirements`));
    expect(list.items).toHaveLength(500);
    expect(list.items.every((r: { baselineId: string }) => r.baselineId === baseline.id)).toBe(
      true,
    );
  });
});
