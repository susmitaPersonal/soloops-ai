import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { baselineContentHash } from '../src/modules/core-ops/domain/baseline-hash';
import type { Database } from '../src/platform/db';
import { createLogger } from '../src/platform/logging';
import { coreOps } from './core-ops-fixtures';
import { APP_ORIGIN, createTestContext, json, type TestContext } from './helpers';

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

async function newProject() {
  const client = await api.client();
  return api.project(client.id);
}

const auditFor = (baselineId: string) =>
  t.db.raw
    .collection('auditEvents')
    .find({ 'entity.type': 'BASELINE', 'entity.id': baselineId })
    .toArray();

describe('FR-012 requirements', () => {
  it('TC-006.1 AC-006.1 sequential project-scoped keys REQ-1, REQ-2, … that are never reused', async () => {
    const project = await newProject();
    const r1 = await api.requirement(project.id, {
      title: 'Menu browsing',
      description: 'Customers browse the menu.',
      acceptanceCriteria: ['Shows all items', 'Shows prices'],
      priority: 'MUST',
    });
    const r2 = await api.requirement(project.id, { title: 'Customer login' });
    expect([r1.key, r2.key]).toEqual(['REQ-1', 'REQ-2']);
    expect(r1).toMatchObject({
      number: 1,
      description: 'Customers browse the menu.',
      acceptanceCriteria: ['Shows all items', 'Shows prices'],
      priority: 'MUST',
      baselineId: null,
      rowVersion: 1,
    });

    // Deleting REQ-2 does not free its number.
    expect((await api.del(`/requirements/${r2.id}`)).status).toBe(204);
    const r3 = await api.requirement(project.id, { title: 'Order history' });
    expect(r3.key).toBe('REQ-3');
    const list = await json(await api.get(`/projects/${project.id}/requirements`));
    expect(list.items.map((r: { key: string }) => r.key)).toEqual(['REQ-1', 'REQ-3']);

    // Numbering is per project.
    const other = await newProject();
    expect((await api.requirement(other.id)).key).toBe('REQ-1');
  });

  it('TC-006.1 concurrent creation allocates distinct consecutive numbers', async () => {
    const project = await newProject();
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        api.post(`/projects/${project.id}/requirements`, { title: `R${i}`, priority: 'COULD' }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const numbers = (await Promise.all(results.map((r) => json(r)))).map(
      (r: { number: number }) => r.number,
    );
    expect(numbers.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
  });

  it('TC-006.2 AC-006.2 editing a draft requirement saves the change (If-Match)', async () => {
    const project = await newProject();
    const req = await api.requirement(project.id);
    const res = await api.patch(
      `/requirements/${req.id}`,
      { title: 'Customer login with OTP', acceptanceCriteria: ['OTP expires after 5 min'] },
      1,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"2"');
    expect(await json(res)).toMatchObject({
      key: 'REQ-1',
      title: 'Customer login with OTP',
      acceptanceCriteria: ['OTP expires after 5 min'],
      rowVersion: 2,
    });
    expect((await api.patch(`/requirements/${req.id}`, { title: 'Stale' }, 1)).status).toBe(412);
    expect((await api.patch(`/requirements/${req.id}`, { title: 'No header' }, null)).status).toBe(
      428,
    );
  });

  it.each([
    [{ title: '' }, 'title'],
    [{ title: 't'.repeat(201) }, 'title'],
    [{ priority: 'WONT' }, 'priority'],
    [{ description: 'd'.repeat(10001) }, 'description'],
    [{ acceptanceCriteria: Array.from({ length: 31 }, (_, i) => `AC ${i}`) }, 'acceptanceCriteria'],
    [{ acceptanceCriteria: ['a'.repeat(301)] }, 'acceptanceCriteria.0'],
    [{ acceptanceCriteria: ['  '] }, 'acceptanceCriteria.0'],
  ])('ERR-010 invalid requirement %j → 422 on %s', async (override, path) => {
    const project = await newProject();
    const res = await api.post(`/projects/${project.id}/requirements`, {
      title: 'Valid',
      priority: 'MUST',
      ...override,
    });
    expect(res.status).toBe(422);
    expect((await json(res)).errors.map((e: { path: string }) => e.path)).toContain(path);
  });

  it('boundaries: title 200, 30 criteria of 300 characters, description 10 000 → 201', async () => {
    const project = await newProject();
    const res = await api.post(`/projects/${project.id}/requirements`, {
      title: 't'.repeat(200),
      description: 'd'.repeat(10000),
      acceptanceCriteria: Array.from({ length: 30 }, () => 'a'.repeat(300)),
      priority: 'SHOULD',
    });
    expect(res.status).toBe(201);
  });

  it('a requirement of an unknown project → 404; an unknown requirement → 404', async () => {
    const missing = '0192a000-0000-7000-8000-00000000dead';
    expect(
      (await api.post(`/projects/${missing}/requirements`, { title: 'X', priority: 'MUST' }))
        .status,
    ).toBe(404);
    expect((await api.get(`/projects/${missing}/requirements`)).status).toBe(404);
    expect((await api.patch(`/requirements/${missing}`, { title: 'X' }, 1)).status).toBe(404);
    expect((await api.del(`/requirements/${missing}`)).status).toBe(404);
  });

  it('a deleted requirement cannot be edited or deleted again (404)', async () => {
    const project = await newProject();
    const req = await api.requirement(project.id);
    await api.del(`/requirements/${req.id}`);
    expect((await api.patch(`/requirements/${req.id}`, { title: 'X' }, 2)).status).toBe(404);
    expect((await api.del(`/requirements/${req.id}`)).status).toBe(404);
  });
});

describe('FR-013 baselines', () => {
  it('TC-007.1 AC-007.1 BR-005 BR-028 freezes every draft together with a timestamp, content hash and audit event', async () => {
    const project = await newProject();
    const r1 = await api.requirement(project.id, { title: 'Menu browsing' });
    const r2 = await api.requirement(project.id, { title: 'Customer login', priority: 'SHOULD' });
    const deleted = await api.requirement(project.id, { title: 'Dropped' });
    await api.del(`/requirements/${deleted.id}`);

    const res = await api.post(`/projects/${project.id}/baselines`, undefined, {
      'X-Request-Id': 'baseline-req-1',
    });
    expect(res.status).toBe(201);
    const baseline = await json(res);
    expect(baseline).toMatchObject({
      projectId: project.id,
      sequence: 1,
      requirementCount: 2,
      createdByUserId: owner.userId,
      createdAt: '2026-10-16T09:00:00.000Z',
    });
    expect(baseline.contentHash).toMatch(/^[0-9a-f]{64}$/);

    // Every draft now points at the baseline; the deleted one was not frozen.
    const list = await json(await api.get(`/projects/${project.id}/requirements`));
    expect(list.items.map((r: { id: string; baselineId: string }) => [r.id, r.baselineId])).toEqual(
      [
        [r1.id, baseline.id],
        [r2.id, baseline.id],
      ],
    );
    const deletedDoc = await t.db.raw.collection('requirements').findOne({ _id: deleted.id });
    expect(deletedDoc?.baselineId).toBeNull();

    // BR-005: the stored hash is the hash of the frozen content and can be recomputed from the DB.
    const frozen = await t.db.raw
      .collection('requirements')
      .find({ baselineId: baseline.id })
      .toArray();
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

    // BR-028: one audit event in the same transaction, with key facts only.
    const events = await auditFor(baseline.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'baseline.created',
      actorUserId: owner.userId,
      entity: { type: 'BASELINE', id: baseline.id, projectId: project.id },
      data: {
        sequence: 1,
        requirementCount: 2,
        contentHash: baseline.contentHash,
        requirementNumbers: [1, 2],
      },
      requestId: 'baseline-req-1',
    });
    expect(JSON.stringify(events[0]?.data)).not.toContain('Menu browsing');

    const baselines = await json(await api.get(`/projects/${project.id}/baselines`));
    expect(baselines.items).toEqual([baseline]);
  });

  it('TC-007.2 AC-007.2 BR-004 a baselined requirement cannot be edited or deleted (409 BASELINE_LOCKED); nothing changes', async () => {
    const { requirements } = await api.baselinedProject(1);
    const req = requirements[0];
    const before = await t.db.raw.collection('requirements').findOne({ _id: req.id });

    const edit = await api.patch(`/requirements/${req.id}`, { title: 'Sneaky edit' }, 2);
    expect(edit.status).toBe(409);
    const problem = await json(edit);
    expect(problem.code).toBe('BASELINE_LOCKED');
    expect(problem.detail).toMatch(/change request/i);

    const del = await api.del(`/requirements/${req.id}`);
    expect(del.status).toBe(409);
    expect((await json(del)).code).toBe('BASELINE_LOCKED');

    expect(await t.db.raw.collection('requirements').findOne({ _id: req.id })).toEqual(before);
  });

  it('TC-007.3 AC-007.3 nothing to freeze → 422; the sequence number is not consumed', async () => {
    const project = await newProject();
    const empty = await api.post(`/projects/${project.id}/baselines`);
    expect(empty.status).toBe(422);
    expect((await json(empty)).code).toBe('VALIDATION_FAILED');

    await api.requirement(project.id);
    const first = await api.baseline(project.id);
    expect(first.sequence).toBe(1);
    // Everything is frozen now: a second baseline has nothing to freeze.
    expect((await api.post(`/projects/${project.id}/baselines`)).status).toBe(422);
    expect(await t.db.raw.collection('baselines').countDocuments({ projectId: project.id })).toBe(
      1,
    );
    const stored = await t.db.raw.collection('projects').findOne({ _id: project.id });
    expect(stored?.counters.baseline).toBe(1);
  });

  it('BR-005 a project can have several baselines; a later one freezes only the new drafts', async () => {
    const { project, baseline: b1 } = await api.baselinedProject(2);
    const phase2 = await api.requirement(project.id, { title: 'Push notifications' });
    expect(phase2.key).toBe('REQ-3');
    const b2 = await api.baseline(project.id);
    expect(b2).toMatchObject({ sequence: 2, requirementCount: 1 });
    expect(b2.contentHash).not.toBe(b1.contentHash);
    const list = await json(await api.get(`/projects/${project.id}/requirements`));
    expect(list.items.map((r: { baselineId: string }) => r.baselineId)).toEqual([
      b1.id,
      b1.id,
      b2.id,
    ]);
    const baselines = await json(await api.get(`/projects/${project.id}/baselines`));
    expect(baselines.items.map((b: { sequence: number }) => b.sequence)).toEqual([1, 2]);
  });

  it('NFR-002 concurrent baseline requests: exactly one succeeds, one baseline and one audit event', async () => {
    const project = await newProject();
    await api.requirement(project.id);
    await api.requirement(project.id);
    const results = await Promise.all(
      [1, 2, 3].map(() => api.post(`/projects/${project.id}/baselines`)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 422, 422]);
    const docs = await t.db.raw.collection('baselines').find({ projectId: project.id }).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0]?.requirementCount).toBe(2);
    expect(await auditFor(docs[0]?._id as unknown as string)).toHaveLength(1);
  });

  it('BR-029 an archived project cannot be baselined (409)', async () => {
    const project = await newProject();
    await api.requirement(project.id);
    await api.post(`/projects/${project.id}/archive`);
    const res = await api.post(`/projects/${project.id}/baselines`);
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('ARCHIVED');
    const reqs = await t.db.raw
      .collection('requirements')
      .find({ projectId: project.id })
      .toArray();
    expect(reqs.every((r) => r.baselineId === null)).toBe(true);
  });

  it('TC-BR-028.baseline an audit failure rolls back the baseline and the freeze', async () => {
    const project = await newProject();
    const req = await api.requirement(project.id);
    const failing: Database = {
      ...t.db,
      tenant: (name, workspaceId) => {
        const c = t.db.tenant(name, workspaceId);
        if (name !== 'auditEvents') return c;
        return Object.create(c, {
          insertOne: { value: async () => Promise.reject(new Error('auditEvents unavailable')) },
        });
      },
    } as Database;
    const app = createApp({
      config: t.config,
      db: failing,
      clock: t.clock,
      logger: createLogger('silent'),
    });
    const res = await app.request(`${api.base}/projects/${project.id}/baselines`, {
      method: 'POST',
      headers: { Origin: APP_ORIGIN, 'X-Requested-With': 'soloops', Cookie: owner.cookie },
    });
    expect(res.status).toBe(500);
    expect(await t.db.raw.collection('baselines').countDocuments({ projectId: project.id })).toBe(
      0,
    );
    const doc = await t.db.raw.collection('requirements').findOne({ _id: req.id });
    expect(doc).toMatchObject({ baselineId: null, rowVersion: 1 });
    const stored = await t.db.raw.collection('projects').findOne({ _id: project.id });
    expect(stored?.counters.baseline).toBe(0);

    // With a healthy database the same request succeeds as Baseline 1.
    expect((await api.baseline(project.id)).sequence).toBe(1);
  });

  it('ADR-0012 unique indexes back the numbering invariants', async () => {
    const reqIdx = await t.db.raw.collection('requirements').indexes();
    expect(reqIdx.find((i) => i.name === 'workspace_project_number_unique')?.unique).toBe(true);
    const blIdx = await t.db.raw.collection('baselines').indexes();
    expect(blIdx.find((i) => i.name === 'workspace_project_sequence_unique')?.unique).toBe(true);
  });
});
