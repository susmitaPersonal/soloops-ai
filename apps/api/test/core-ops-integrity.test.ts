// Integrity cases added after the M2 test-engineer review (docs/quality/test-execution-report.md §10):
// rollback of every Core Ops write, BR-029 on every write path, parallel edits, concurrent
// edit-vs-baseline, and member-level access (api-design §4, Auth = M).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { baselineContentHash } from '../src/modules/core-ops/domain/baseline-hash';
import type { Database, TenantCollectionName } from '../src/platform/db';
import { createLogger } from '../src/platform/logging';
import { coreOps } from './core-ops-fixtures';
import { APP_ORIGIN, createTestContext, json, type TestContext } from './helpers';

let t: TestContext;
let owner: Awaited<ReturnType<TestContext['register']>>;
let api: ReturnType<typeof coreOps>;

beforeAll(async () => {
  t = await createTestContext();
  owner = await t.register({ name: 'Integrity owner' });
  api = coreOps(t, owner);
});
afterAll(async () => {
  await t.cleanup();
});

/** The real database, except that inserts into `failing` reject (inside real transactions). */
function failInsertsInto(failing: TenantCollectionName): Database {
  return {
    ...t.db,
    tenant: (name, workspaceId) => {
      const c = t.db.tenant(name, workspaceId);
      if (name !== failing) return c;
      return Object.create(c, {
        insertOne: { value: async () => Promise.reject(new Error(`${failing} unavailable`)) },
      });
    },
  } as Database;
}

const post = (db: Database, path: string, body: unknown) =>
  createApp({ config: t.config, db, clock: t.clock, logger: createLogger('silent') }).request(
    `${api.base}${path}`,
    {
      method: 'POST',
      headers: {
        Origin: APP_ORIGIN,
        'X-Requested-With': 'soloops',
        Cookie: owner.cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

const projectDoc = (id: string) => t.db.raw.collection('projects').findOne({ _id: id as never });

describe('BR-028 / NFR-002 rollback of Core Ops writes', () => {
  it('TC-BR-028.req a failed requirement insert consumes no number and leaves the project untouched', async () => {
    const project = await api.project((await api.client()).id);
    const before = await projectDoc(project.id);
    const res = await post(
      failInsertsInto('requirements'),
      `/projects/${project.id}/requirements`,
      {
        title: 'Lost',
        priority: 'MUST',
      },
    );
    expect(res.status).toBe(500);
    expect(await projectDoc(project.id)).toEqual(before);
    expect((await api.requirement(project.id)).key).toBe('REQ-1');
  });

  it('TC-BR-028.task a failed task insert stores nothing and leaves the project untouched', async () => {
    const project = await api.project((await api.client()).id);
    const before = await projectDoc(project.id);
    const res = await post(failInsertsInto('tasks'), `/projects/${project.id}/tasks`, {
      title: 'Lost',
      scope: { type: 'INTERNAL' },
    });
    expect(res.status).toBe(500);
    expect(await t.db.raw.collection('tasks').countDocuments({ projectId: project.id })).toBe(0);
    expect(await projectDoc(project.id)).toEqual(before);
  });

  it('TC-BR-028.project a failed project insert leaves the client untouched', async () => {
    const client = await api.client({ name: 'Rollback client' });
    const before = await t.db.raw.collection('clients').findOne({ _id: client.id });
    const res = await post(failInsertsInto('projects'), '/projects', {
      clientId: client.id,
      name: 'Lost',
      billingModel: 'FIXED',
    });
    expect(res.status).toBe(500);
    expect(await t.db.raw.collection('clients').findOne({ _id: client.id })).toEqual(before);
  });
});

describe('BR-029 every write path of an archived project or client', () => {
  it('TC-BR-029.5 archived project: draft requirement PATCH and DELETE → 409, document unchanged', async () => {
    const project = await api.project((await api.client()).id);
    const req = await api.requirement(project.id);
    await api.post(`/projects/${project.id}/archive`);
    const before = await t.db.raw.collection('requirements').findOne({ _id: req.id });
    const patch = await api.patch(`/requirements/${req.id}`, { title: 'Late' }, 1);
    const del = await api.del(`/requirements/${req.id}`);
    expect([patch.status, del.status]).toEqual([409, 409]);
    expect((await json(del)).code).toBe('ARCHIVED');
    expect(await t.db.raw.collection('requirements').findOne({ _id: req.id })).toEqual(before);
  });

  it('TC-BR-029.6 archived client: task create/PATCH, baseline, requirement PATCH/DELETE → 409; nothing new', async () => {
    const client = await api.client({ name: 'To archive' });
    const project = await api.project(client.id);
    const req = await api.requirement(project.id);
    const task = await api.task(project.id);
    await api.post(`/clients/${client.id}/archive`);
    const results = await Promise.all([
      api.post(`/projects/${project.id}/tasks`, { title: 'New', scope: { type: 'INTERNAL' } }),
      api.patch(`/tasks/${task.id}`, { status: 'DONE' }, 1),
      api.post(`/projects/${project.id}/baselines`),
      api.patch(`/requirements/${req.id}`, { title: 'Late' }, 1),
      api.del(`/requirements/${req.id}`),
    ]);
    expect(results.map((r) => r.status)).toEqual([409, 409, 409, 409, 409]);
    expect(await t.db.raw.collection('tasks').countDocuments({ projectId: project.id })).toBe(1);
    expect(await t.db.raw.collection('baselines').countDocuments({ projectId: project.id })).toBe(
      0,
    );
    expect(await t.db.raw.collection('requirements').findOne({ _id: req.id })).toMatchObject({
      title: 'Customer login',
      deletedAt: null,
      baselineId: null,
      rowVersion: 1,
    });
  });
});

describe('ERR-005 / BR-004 concurrency', () => {
  it('TC-006.2C parallel requirement PATCHes with one If-Match: exactly one wins', async () => {
    const project = await api.project((await api.client()).id);
    const req = await api.requirement(project.id);
    const res = await Promise.all(
      [1, 2, 3, 4].map((i) => api.patch(`/requirements/${req.id}`, { title: `T${i}` }, 1)),
    );
    expect(res.map((r) => r.status).sort()).toEqual([200, 412, 412, 412]);
    expect((await t.db.raw.collection('requirements').findOne({ _id: req.id }))?.rowVersion).toBe(
      2,
    );
  });

  it('TC-016.2C parallel task PATCHes with one If-Match: exactly one wins', async () => {
    const project = await api.project((await api.client()).id);
    const task = await api.task(project.id);
    const res = await Promise.all(
      (['IN_PROGRESS', 'DONE', 'TODO'] as const).map((status) =>
        api.patch(`/tasks/${task.id}`, { status }, 1),
      ),
    );
    expect(res.map((r) => r.status).sort()).toEqual([200, 412, 412]);
    expect((await t.db.raw.collection('tasks').findOne({ _id: task.id }))?.rowVersion).toBe(2);
  });

  it('TC-007.C2 BR-004 BR-005 a draft edit racing a baseline is either frozen into the hash or refused', async () => {
    for (let i = 0; i < 10; i += 1) {
      const project = await api.project((await api.client()).id);
      const req = await api.requirement(project.id, { title: 'Original' });
      const [edit, bl] = await Promise.all([
        api.patch(`/requirements/${req.id}`, { title: 'Edited' }, 1),
        api.post(`/projects/${project.id}/baselines`),
      ]);
      expect(bl.status).toBe(201);
      expect([200, 409]).toContain(edit.status);
      const baseline = await json(bl);
      const frozen = await t.db.raw
        .collection('requirements')
        .find({ baselineId: baseline.id })
        .toArray();
      expect(frozen).toHaveLength(1);
      expect(
        baselineContentHash(
          frozen.map((d) => ({
            number: d.number,
            title: d.title,
            description: d.description,
            acceptanceCriteria: d.acceptanceCriteria,
            priority: d.priority,
          })),
        ),
      ).toBe(baseline.contentHash);
      // If the edit lost, the frozen title is the original; if it won, it was frozen as edited.
      expect(frozen[0]?.title).toBe(edit.status === 200 ? 'Edited' : 'Original');
    }
  });
});

describe('api-design §4: Core Ops actions are open to every member (Auth = M)', () => {
  it('TC-AUTH-M a MEMBER can manage clients, projects, requirements, baselines and tasks', async () => {
    const member = await t.addMember(owner.workspaceId);
    const m = coreOps(t, { ...member, workspaceId: owner.workspaceId });
    const client = await m.client({ name: 'Member client' });
    expect((await m.patch(`/clients/${client.id}`, { phone: '1' }, 1)).status).toBe(200);
    const project = await m.project(client.id);
    expect((await m.patch(`/projects/${project.id}`, { status: 'ON_HOLD' }, 1)).status).toBe(200);
    const req = await m.requirement(project.id);
    const draft = await m.requirement(project.id, { title: 'Drop me' });
    expect((await m.del(`/requirements/${draft.id}`)).status).toBe(204);
    expect((await m.baseline(project.id)).requirementCount).toBe(1);
    const task = await m.task(project.id, {
      billable: true,
      scope: { type: 'BASELINE', requirementId: req.id },
    });
    expect((await m.patch(`/tasks/${task.id}`, { status: 'DONE' }, 1)).status).toBe(200);
    expect((await m.post(`/projects/${project.id}/archive`)).status).toBe(200);
    expect((await m.post(`/clients/${client.id}/archive`)).status).toBe(200);
  });
});
