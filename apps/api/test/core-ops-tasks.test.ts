import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coreOps } from './core-ops-fixtures';
import { createTestContext, json, type TestContext } from './helpers';

let t: TestContext;
let owner: Awaited<ReturnType<TestContext['register']>>;
let api: ReturnType<typeof coreOps>;
/** A project whose REQ-1 is baselined and REQ-2 is still a draft. */
let fx: {
  projectId: string;
  baselinedReqId: string;
  draftReqId: string;
};

beforeAll(async () => {
  t = await createTestContext();
  owner = await t.register({ name: 'Riya Sen' });
  api = coreOps(t, owner);
  const { project, requirements } = await api.baselinedProject(1);
  const draft = await api.requirement(project.id, { title: 'Not agreed yet' });
  fx = {
    projectId: project.id,
    baselinedReqId: requirements[0].id,
    draftReqId: draft.id,
  };
});
afterAll(async () => {
  await t.cleanup();
});

const tasksPath = () => `/projects/${fx.projectId}/tasks`;
const errorPaths = async (res: Response) =>
  (await json(res)).errors.map((e: { path: string }) => e.path);

describe('FR-014 tasks: BR-015 scope and billability', () => {
  it('creates an internal, non-billable task with defaults (status TODO, unassigned)', async () => {
    const res = await api.post(tasksPath(), {
      title: 'Set up CI',
      scope: { type: 'INTERNAL' },
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('ETag')).toBe('"1"');
    expect(await json(res)).toMatchObject({
      projectId: fx.projectId,
      title: 'Set up CI',
      description: null,
      assigneeUserId: null,
      status: 'TODO',
      billable: false,
      scope: { type: 'INTERNAL', requirementId: null, changeRequestId: null, versionNumber: null },
      rowVersion: 1,
    });
  });

  it('BR-015 a billable task linked to a baselined requirement of the same project is accepted', async () => {
    const task = await api.task(fx.projectId, {
      title: 'Build login screen',
      billable: true,
      scope: { type: 'BASELINE', requirementId: fx.baselinedReqId },
    });
    expect(task).toMatchObject({
      billable: true,
      scope: { type: 'BASELINE', requirementId: fx.baselinedReqId },
    });
    const stored = await t.db.raw.collection('tasks').findOne({ _id: task.id });
    expect(stored).toMatchObject({ workspaceId: owner.workspaceId, billable: true });
  });

  it('TC-016.1 AC-016.1 an internal task cannot be billable → 422 NOT_ELIGIBLE on billable', async () => {
    const res = await api.post(tasksPath(), {
      title: 'Sneaky billable',
      billable: true,
      scope: { type: 'INTERNAL' },
    });
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.code).toBe('NOT_ELIGIBLE');
    expect(body.errors.map((e: { path: string }) => e.path)).toEqual(['billable']);
    expect(await t.db.raw.collection('tasks').countDocuments({ title: 'Sneaky billable' })).toBe(0);
  });

  it.each([true, false])(
    'BR-015 a task linked to a draft (not baselined) requirement is refused (billable=%s)',
    async (billable) => {
      const title = `Unagreed work ${billable}`;
      const res = await api.post(tasksPath(), {
        title,
        billable,
        scope: { type: 'BASELINE', requirementId: fx.draftReqId },
      });
      expect(res.status).toBe(422);
      const body = await json(res);
      expect(body.code).toBe('NOT_ELIGIBLE');
      expect(body.errors.map((e: { path: string }) => e.path)).toEqual(['scope.requirementId']);
      expect(await t.db.raw.collection('tasks').countDocuments({ title })).toBe(0);
    },
  );

  it('BR-015 a requirement of another project or workspace, or an unknown one → 422 on scope.requirementId', async () => {
    const other = await api.baselinedProject(1);
    const foreignUser = coreOps(t, await t.register());
    const foreign = await foreignUser.baselinedProject(1);
    for (const requirementId of [
      other.requirements[0].id,
      foreign.requirements[0].id,
      '0192a000-0000-7000-8000-00000000dead',
    ]) {
      const res = await api.post(tasksPath(), {
        title: 'Wrong link',
        billable: true,
        scope: { type: 'BASELINE', requirementId },
      });
      expect(res.status).toBe(422);
      const body = await json(res);
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.errors[0]).toEqual({
        path: 'scope.requirementId',
        message: 'Choose a requirement of this project.',
      });
    }
  });

  it('BR-015 a CHANGE_REQUEST link to a version that does not exist is refused', async () => {
    const res = await api.post(tasksPath(), {
      title: 'From a CR',
      billable: true,
      scope: {
        type: 'CHANGE_REQUEST',
        changeRequestId: '0192a000-0000-7000-8000-0000000000d3',
        versionNumber: 2,
      },
    });
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.code).toBe('NOT_ELIGIBLE');
    expect(body.errors.map((e: { path: string }) => e.path)).toEqual(['scope']);
    expect(await t.db.raw.collection('tasks').countDocuments({ title: 'From a CR' })).toBe(0);
  });

  it.each([
    [{ title: '' }, 'title'],
    [{ title: 't'.repeat(201) }, 'title'],
    [{ description: 'd'.repeat(5001) }, 'description'],
    [{ status: 'BLOCKED' }, 'status'],
    [{ billable: 'yes' }, 'billable'],
    [{ scope: { type: 'OTHER' } }, 'scope.type'],
    [{ scope: { type: 'BASELINE' } }, 'scope.requirementId'],
    [{ scope: undefined }, 'scope'],
    [{ assigneeUserId: 'me' }, 'assigneeUserId'],
  ])('ERR-010 invalid task %j → 422 on %s', async (override, path) => {
    const res = await api.post(tasksPath(), {
      title: 'Valid',
      scope: { type: 'INTERNAL' },
      ...override,
    });
    expect(res.status).toBe(422);
    expect(await errorPaths(res)).toContain(path);
  });
});

describe('FR-014 tasks: updates, assignees and lists', () => {
  it('TC-016.2 AC-016.2 status changes are saved (If-Match); stale → 412; missing → 428', async () => {
    const task = await api.task(fx.projectId, { title: 'Status flow' });
    const inProgress = await api.patch(`/tasks/${task.id}`, { status: 'IN_PROGRESS' }, 1);
    expect(inProgress.status).toBe(200);
    expect(await json(inProgress)).toMatchObject({ status: 'IN_PROGRESS', rowVersion: 2 });
    const done = await json(await api.patch(`/tasks/${task.id}`, { status: 'DONE' }, 2));
    expect(done.status).toBe('DONE');
    // Re-opening is allowed: FR-014 defines no restricted transitions between the three statuses.
    expect((await api.patch(`/tasks/${task.id}`, { status: 'TODO' }, 3)).status).toBe(200);
    expect((await api.patch(`/tasks/${task.id}`, { status: 'DONE' }, 1)).status).toBe(412);
    expect((await api.patch(`/tasks/${task.id}`, { status: 'DONE' }, null)).status).toBe(428);
    expect((await api.patch(`/tasks/${task.id}`, {}, 4)).status).toBe(422);
  });

  it('TC-016.2 AC-016.2 the assignee must be a workspace member', async () => {
    const member = await t.addMember(owner.workspaceId);
    const outsider = await t.register();
    const assigned = await api.task(fx.projectId, {
      title: 'Assigned',
      assigneeUserId: member.userId,
    });
    expect(assigned.assigneeUserId).toBe(member.userId);

    const create = await api.post(tasksPath(), {
      title: 'Outsider',
      assigneeUserId: outsider.userId,
      scope: { type: 'INTERNAL' },
    });
    expect(create.status).toBe(422);
    expect(await errorPaths(create)).toEqual(['assigneeUserId']);

    const update = await api.patch(`/tasks/${assigned.id}`, { assigneeUserId: outsider.userId }, 1);
    expect(update.status).toBe(422);
    expect(await errorPaths(update)).toEqual(['assigneeUserId']);
    expect(await t.db.raw.collection('tasks').findOne({ _id: assigned.id })).toMatchObject({
      assigneeUserId: member.userId,
      rowVersion: 1,
    });
    const unassign = await api.patch(`/tasks/${assigned.id}`, { assigneeUserId: null }, 1);
    expect(await json(unassign)).toMatchObject({ assigneeUserId: null, rowVersion: 2 });
  });

  it('a MEMBER (not only the owner) can create and update tasks (api-design §4: Auth = M)', async () => {
    const member = await t.addMember(owner.workspaceId);
    const asMember = coreOps(t, { ...member, workspaceId: owner.workspaceId });
    const task = await asMember.task(fx.projectId, { title: 'By a member' });
    expect((await asMember.patch(`/tasks/${task.id}`, { status: 'DONE' }, 1)).status).toBe(200);
  });

  it('BR-015 is re-checked on update: making an internal task billable, or unlinking a billable one, is refused', async () => {
    const internal = await api.task(fx.projectId, { title: 'Internal' });
    const flip = await api.patch(`/tasks/${internal.id}`, { billable: true }, 1);
    expect(flip.status).toBe(422);
    expect((await json(flip)).code).toBe('NOT_ELIGIBLE');

    const billable = await api.task(fx.projectId, {
      title: 'Billable',
      billable: true,
      scope: { type: 'BASELINE', requirementId: fx.baselinedReqId },
    });
    const unlink = await api.patch(`/tasks/${billable.id}`, { scope: { type: 'INTERNAL' } }, 1);
    expect(unlink.status).toBe(422);
    const ok = await api.patch(
      `/tasks/${billable.id}`,
      { scope: { type: 'INTERNAL' }, billable: false },
      1,
    );
    expect(await json(ok)).toMatchObject({ billable: false, scope: { type: 'INTERNAL' } });
    const stored = await t.db.raw.collection('tasks').findOne({ _id: internal.id });
    expect(stored).toMatchObject({ billable: false, rowVersion: 1 });
  });

  it('BR-029 tasks of an archived project cannot be created or changed', async () => {
    const { project } = await api.baselinedProject(1);
    const task = await api.task(project.id, { title: 'Before archive' });
    await api.post(`/projects/${project.id}/archive`);
    const update = await api.patch(`/tasks/${task.id}`, { status: 'DONE' }, 1);
    expect(update.status).toBe(409);
    expect((await json(update)).code).toBe('ARCHIVED');
    expect(await t.db.raw.collection('tasks').findOne({ _id: task.id })).toMatchObject({
      status: 'TODO',
      rowVersion: 1,
    });
    const create = await api.post(`/projects/${project.id}/tasks`, {
      title: 'After archive',
      scope: { type: 'INTERNAL' },
    });
    expect(create.status).toBe(409);
    expect(await t.db.raw.collection('tasks').countDocuments({ projectId: project.id })).toBe(1);
    expect((await api.get(`/tasks/${task.id}`)).status).toBe(200); // still readable
  });

  it('lists newest first, filters by status and assignee, and pages with a cursor', async () => {
    const { project } = await api.baselinedProject(1);
    const a = await api.task(project.id, { title: 'A' });
    const b = await api.task(project.id, { title: 'B', status: 'DONE' });
    const c = await api.task(project.id, { title: 'C', assigneeUserId: owner.userId });
    const all = await json(await api.get(`/projects/${project.id}/tasks`));
    expect(all.items.map((x: { id: string }) => x.id)).toEqual([c.id, b.id, a.id]);
    const done = await json(await api.get(`/projects/${project.id}/tasks?status=DONE`));
    expect(done.items.map((x: { id: string }) => x.id)).toEqual([b.id]);
    const mine = await json(
      await api.get(`/projects/${project.id}/tasks?assigneeUserId=${owner.userId}`),
    );
    expect(mine.items.map((x: { id: string }) => x.id)).toEqual([c.id]);
    const page1 = await json(await api.get(`/projects/${project.id}/tasks?limit=2`));
    expect(page1.items).toHaveLength(2);
    const page2 = await json(
      await api.get(
        `/projects/${project.id}/tasks?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
      ),
    );
    expect(page2.items.map((x: { id: string }) => x.id)).toEqual([a.id]);
    expect(page2.nextCursor).toBeNull();
    expect((await api.get(`/projects/${project.id}/tasks?status=BLOCKED`)).status).toBe(422);
  });

  it('an unknown task or project → 404', async () => {
    const missing = '0192a000-0000-7000-8000-00000000dead';
    expect((await api.get(`/tasks/${missing}`)).status).toBe(404);
    expect((await api.patch(`/tasks/${missing}`, { status: 'DONE' }, 1)).status).toBe(404);
    expect((await api.get(`/projects/${missing}/tasks`)).status).toBe(404);
    expect(
      (await api.post(`/projects/${missing}/tasks`, { title: 'X', scope: { type: 'INTERNAL' } }))
        .status,
    ).toBe(404);
  });

  it('ADR-0012 task indexes for the board and CR-version lookups exist', async () => {
    const names = (await t.db.raw.collection('tasks').indexes()).map((i) => i.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'workspace_project_status',
        'workspace_project_recent',
        'workspace_cr_version',
      ]),
    );
  });
});
