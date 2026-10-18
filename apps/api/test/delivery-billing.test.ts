// M4 Delivery and billable work: FR-030 (tasks from approved versions), BR-012/BR-013 task links,
// FR-040 / FR-041 billable entries with server eligibility (BR-016), BR-021 rates, FR-015 overview.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { Database } from '../src/platform/db';
import { newId } from '../src/platform/ids';
import { createLogger } from '../src/platform/logging';
import { APP_ORIGIN, createTestContext, json, type TestContext } from './helpers';
import { completeDraft, idemKey, scopeGuard } from './scope-guard-fixtures';

let t: TestContext;
let owner: Awaited<ReturnType<TestContext['register']>>;
let sg: ReturnType<typeof scopeGuard>;

beforeAll(async () => {
  t = await createTestContext();
  owner = await t.register({ name: 'Riya Sen' });
  sg = scopeGuard(t, owner);
});
afterAll(async () => {
  await t.cleanup();
});

const ops = () => sg.ops;
const convert = (crId: string, n: number, body: unknown, headers?: Record<string, string>) =>
  ops().post(`/change-requests/${crId}/versions/${n}/tasks`, body, headers);
const entries = (projectId: string, state = '') =>
  ops().get(`/projects/${projectId}/billable-entries${state ? `?state=${state}` : ''}`);
const logWork = (
  projectId: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
) =>
  ops().post(
    `/projects/${projectId}/billable-entries`,
    { kind: 'TIME', workDate: '2026-10-15', minutes: 60, description: 'Work', ...body },
    headers,
  );
const taskCount = (projectId: string) => t.db.raw.collection('tasks').countDocuments({ projectId });
const auditCount = (crId: string, action: string) =>
  t.db.raw.collection('auditEvents').countDocuments({ 'entity.id': crId, action });

async function expectStatus(res: Response, status: number) {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${await res.text()}`);
  return json(res);
}

/** CR whose v1 was approved and then superseded by an approved v2. */
async function supersededCr(projectId: string) {
  const v1 = await sg.approved(projectId);
  const v2 = await expectStatus(await sg.newVersion(v1.id), 201);
  const edited = await expectStatus(
    await sg.editDraft(
      v1.id,
      2,
      completeDraft({ title: 'WhatsApp OTP login v2', acceptanceCriteria: ['OTP v2 arrives'] }),
      v2.rowVersion,
    ),
    200,
  );
  const proposed = await expectStatus(await sg.propose(v1.id, 2, edited.rowVersion), 200);
  await expectStatus(
    await sg.decide(v1.id, 2, { contentHash: proposed.versions[1].contentHash }),
    201,
  );
  return v1.id as string;
}

// =================================================================================================
describe('FR-030 tasks from an approved version', () => {
  it('TC-015.1 AC-015.1 one billable task per chosen criterion, linked to the version; audited', async () => {
    const { project } = await sg.project();
    const cr = await sg.approved(project.id);
    const res = await convert(cr.id, 1, { criterionIndexes: [1, 0] });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.alreadyConverted).toEqual([]);
    expect(body.created.map((x: { title: string }) => x.title)).toEqual([
      'OTP expires after 5 min',
      'OTP arrives within 30 s',
    ]);
    for (const task of body.created) {
      expect(task).toMatchObject({
        projectId: project.id,
        status: 'TODO',
        billable: true,
        scope: {
          type: 'CHANGE_REQUEST',
          requirementId: null,
          changeRequestId: cr.id,
          versionNumber: 1,
        },
      });
    }
    const event = await t.db.raw
      .collection('auditEvents')
      .findOne({ 'entity.id': cr.id, action: 'cr.tasks.created' });
    expect(event?.data).toMatchObject({
      versionNumber: 1,
      taskIds: body.created.map((x: { id: string }) => x.id),
      criterionIndexes: [1, 0],
    });
  });

  it('TC-015.4 converting the same criteria again creates no duplicate and no second audit event', async () => {
    const { project } = await sg.project();
    const cr = await sg.approved(project.id);
    await expectStatus(await convert(cr.id, 1, { criterionIndexes: [0] }), 201);
    const again = await convert(cr.id, 1, { criterionIndexes: [0, 1] });
    expect(again.status).toBe(201);
    const body = await json(again);
    expect(body.alreadyConverted).toEqual([0]);
    expect(body.created).toHaveLength(1);
    const third = await convert(cr.id, 1, { criterionIndexes: [1, 0] });
    expect(third.status).toBe(200);
    expect(await json(third)).toEqual({ created: [], alreadyConverted: [1, 0] });
    expect(await taskCount(project.id)).toBe(2);
    expect(await auditCount(cr.id, 'cr.tasks.created')).toBe(2);
  });

  it('TC-015.5 concurrent conversions of the same version create each task exactly once', async () => {
    const { project } = await sg.project();
    const cr = await sg.approved(project.id);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => convert(cr.id, 1, { criterionIndexes: [0, 1] })),
    );
    for (const r of results) expect([200, 201]).toContain(r.status);
    const created = (await Promise.all(results.map(json))).flatMap((b) => b.created);
    expect(created).toHaveLength(2);
    expect(await taskCount(project.id)).toBe(2);
  });

  it('TC-015.6 an Idempotency-Key replay returns the stored response without new tasks', async () => {
    const { project } = await sg.project();
    const cr = await sg.approved(project.id);
    const key = idemKey();
    const first = await json(
      await convert(cr.id, 1, { criterionIndexes: [0] }, { 'Idempotency-Key': key }),
    );
    const replay = await convert(cr.id, 1, { criterionIndexes: [0] }, { 'Idempotency-Key': key });
    expect(replay.status).toBe(201);
    expect(await json(replay)).toEqual(first);
    const reused = await convert(cr.id, 1, { criterionIndexes: [1] }, { 'Idempotency-Key': key });
    expect(reused.status).toBe(422);
    expect((await json(reused)).code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await taskCount(project.id)).toBe(1);
  });

  it('TC-015.2 AC-015.2 DRAFT, PROPOSED, REJECTED, WITHDRAWN and SUPERSEDED versions → 409, no tasks', async () => {
    const { project } = await sg.project();
    const draft = await sg.cr(project.id);
    await sg.editDraft(draft.id, 1, completeDraft(), draft.rowVersion);
    const proposed = await sg.proposed(project.id);
    const rejectedP = await sg.proposed(project.id);
    await expectStatus(
      await sg.decide(rejectedP.id, 1, {
        decision: 'REJECTED',
        contentHash: rejectedP.versions[0].contentHash,
      }),
      201,
    );
    const withdrawn = await sg.proposed(project.id);
    await expectStatus(await sg.withdraw(withdrawn.id, 1), 200);
    const superseded = await supersededCr(project.id);
    for (const id of [draft.id, proposed.id, rejectedP.id, withdrawn.id, superseded]) {
      const res = await convert(id, 1, { criterionIndexes: [0] });
      expect(res.status).toBe(409);
      expect((await json(res)).code).toBe('INVALID_STATE_TRANSITION');
    }
    expect(await taskCount(project.id)).toBe(0);
    // The approved v2 of the superseded CR converts.
    await expectStatus(await convert(superseded, 2, { criterionIndexes: [0] }), 201);
  });

  it.each([
    [{ criterionIndexes: [] }, 'criterionIndexes'],
    [{ criterionIndexes: [0, 0] }, 'criterionIndexes'],
    [{ criterionIndexes: [20] }, 'criterionIndexes.0'],
    [{ criterionIndexes: [-1] }, 'criterionIndexes.0'],
    [{ criterionIndexes: [2] }, 'criterionIndexes.0'],
    [{}, 'criterionIndexes'],
  ])('ERR-010 invalid conversion %j → 422 on %s', async (body, path) => {
    const { project } = await sg.project();
    const cr = await sg.approved(project.id);
    const res = await convert(cr.id, 1, body);
    expect(res.status).toBe(422);
    expect((await json(res)).errors[0].path).toBe(path);
    expect(await taskCount(project.id)).toBe(0);
  });

  it('a missing version is 404; an archived project is 409 ARCHIVED', async () => {
    const { project } = await sg.project();
    const cr = await sg.approved(project.id);
    expect((await convert(cr.id, 9, { criterionIndexes: [0] })).status).toBe(404);
    expect((await convert(newId(), 1, { criterionIndexes: [0] })).status).toBe(404);
    await expectStatus(await ops().post(`/projects/${project.id}/archive`), 200);
    const res = await convert(cr.id, 1, { criterionIndexes: [0] });
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('ARCHIVED');
    expect(await taskCount(project.id)).toBe(0);
  });
});

// =================================================================================================
describe('BR-012 / BR-013 task links to change-request versions', () => {
  const crScope = (changeRequestId: string, versionNumber = 1) => ({
    type: 'CHANGE_REQUEST',
    changeRequestId,
    versionNumber,
  });

  it('TC-016.3 a billable task can link to an APPROVED version of the same project', async () => {
    const { project } = await sg.project();
    const cr = await sg.approved(project.id);
    const task = await ops().task(project.id, { billable: true, scope: crScope(cr.id) });
    expect(task.scope).toMatchObject({ type: 'CHANGE_REQUEST', changeRequestId: cr.id });
  });

  it('TC-016.4 a PROPOSED version or another project’s approved version cannot authorise a task', async () => {
    const { project } = await sg.project();
    const other = await sg.project();
    const proposed = await sg.proposed(project.id);
    const foreign = await sg.approved(other.project.id);
    for (const scope of [crScope(proposed.id), crScope(foreign.id), crScope(proposed.id, 2)]) {
      const res = await ops().post(`/projects/${project.id}/tasks`, {
        title: 'X',
        billable: true,
        scope,
      });
      expect(res.status).toBe(422);
      expect((await json(res)).code).toBe('NOT_ELIGIBLE');
    }
    expect(await taskCount(project.id)).toBe(0);
  });

  it('TC-016.5 BR-013 work linked to v1 stays authorised after v2 supersedes it; new links need v2', async () => {
    const { project } = await sg.project();
    const v1 = await sg.approved(project.id);
    const task = await ops().task(project.id, { billable: true, scope: crScope(v1.id) });
    await supersededCrFrom(v1.id);
    // Same link, billable toggled: still allowed (existing work).
    const off = await expectStatus(
      await ops().patch(`/tasks/${task.id}`, { billable: false }, task.rowVersion),
      200,
    );
    await expectStatus(
      await ops().patch(`/tasks/${task.id}`, { billable: true }, off.rowVersion),
      200,
    );
    // A new link to the superseded v1 is refused; v2 is accepted.
    const fresh = await ops().post(`/projects/${project.id}/tasks`, {
      title: 'New',
      billable: true,
      scope: crScope(v1.id, 1),
    });
    expect(fresh.status).toBe(422);
    await ops().task(project.id, { billable: true, scope: crScope(v1.id, 2) });
  });
});

/** Approves a v2 for an approved CR so that v1 becomes SUPERSEDED. */
async function supersededCrFrom(crId: string) {
  const v2 = await expectStatus(await sg.newVersion(crId), 201);
  const edited = await expectStatus(
    await sg.editDraft(crId, 2, completeDraft({ title: 'v2' }), v2.rowVersion),
    200,
  );
  const proposed = await expectStatus(await sg.propose(crId, 2, edited.rowVersion), 200);
  await expectStatus(
    await sg.decide(crId, 2, { contentHash: proposed.versions[1].contentHash }),
    201,
  );
}

// =================================================================================================
describe('FR-040 / FR-041 billable entries and BR-016 eligibility', () => {
  it('TC-017.1 AC-017.1 TIME on a baselined requirement: saved unbilled, eligible, BR-020 amount', async () => {
    const { project, requirement } = await sg.project();
    const res = await logWork(project.id, {
      minutes: 50,
      scope: { type: 'BASELINE', requirementId: requirement.id },
      // Client-sent totals and eligibility are ignored (AC-018.2, BR-022).
      billableAmountMinor: '1',
      eligibility: { eligible: true },
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('ETag')).toBe('"1"');
    const entry = await json(res);
    expect(entry).toMatchObject({
      kind: 'TIME',
      minutes: 50,
      amountMinor: null,
      currency: 'INR',
      invoiceId: null,
      scopeKind: 'ORIGINAL',
      scopeLabel: requirement.key,
      eligibility: { eligible: true },
      hourlyRateMinor: '150000',
      // roundHalfUp(50 × 150000 / 60) = 125000
      billableAmountMinor: '125000',
    });
    const stored = await t.db.raw.collection('billableEntries').findOne({ _id: entry.id });
    expect(stored).not.toHaveProperty('eligibility');
    expect(stored).not.toHaveProperty('billableAmountMinor');
  });

  it('TC-017.4 BR-020 rounding half up on 1 minute (₹1,500/h → 2500 minor) and FIXED amounts verbatim', async () => {
    const { project, requirement } = await sg.project();
    const scope = { type: 'BASELINE', requirementId: requirement.id };
    const one = await json(await logWork(project.id, { minutes: 1, scope }));
    expect(one.billableAmountMinor).toBe('2500');
    const fixed = await json(
      await logWork(project.id, {
        kind: 'FIXED',
        minutes: undefined,
        amountMinor: '9999999999999',
        scope,
      }),
    );
    expect(fixed).toMatchObject({
      kind: 'FIXED',
      minutes: null,
      amountMinor: '9999999999999',
      hourlyRateMinor: null,
      billableAmountMinor: '9999999999999',
    });
  });

  it('TC-017.2 AC-017.2 work on a non-approved version is saved but ineligible with CR_NOT_APPROVED', async () => {
    const { project } = await sg.project();
    const cr = await sg.proposed(project.id);
    const res = await logWork(project.id, {
      scope: { type: 'CHANGE_REQUEST', changeRequestId: cr.id, versionNumber: 1 },
    });
    expect(res.status).toBe(201);
    const entry = await json(res);
    expect(entry.scopeKind).toBe('ADDITIONAL');
    expect(entry.scopeLabel).toBe(`${cr.key} v1`);
    expect(entry.eligibility).toEqual({
      eligible: false,
      reason: 'CR_NOT_APPROVED',
      explanation: expect.stringContaining('waiting for the client'),
    });
    // Eligibility is computed now, not stored: approving the version makes the same entry eligible.
    await expectStatus(await sg.decide(cr.id, 1, { contentHash: cr.versions[0].contentHash }), 201);
    const list = await json(await entries(project.id));
    expect(list.eligible.map((e: { id: string }) => e.id)).toEqual([entry.id]);
  });

  it('TC-018.3 UNSCOPED and REQUIREMENT_NOT_BASELINED entries are saved, listed separately with reasons', async () => {
    const { project } = await sg.project();
    const draftReq = await ops().requirement(project.id, { title: 'Draft only' });
    const unscoped = await json(await logWork(project.id, { description: 'Meeting' }));
    const notBaselined = await json(
      await logWork(project.id, { scope: { type: 'BASELINE', requirementId: draftReq.id } }),
    );
    expect(unscoped.eligibility.reason).toBe('UNSCOPED');
    expect(unscoped.scopeKind).toBe('NONE');
    expect(notBaselined.eligibility).toMatchObject({
      reason: 'REQUIREMENT_NOT_BASELINED',
      explanation: expect.stringContaining(draftReq.key),
    });
    const list = await json(await entries(project.id));
    expect(list.eligible).toEqual([]);
    expect(list.ineligible.map((e: { id: string }) => e.id).sort()).toEqual(
      [unscoped.id, notBaselined.id].sort(),
    );
    expect(list.eligibleTotalMinor).toBe('0');
    expect(list.truncated).toBe(false);
    // After baselining, the requirement entry becomes eligible without any write to the entry.
    await ops().baseline(project.id);
    const after = await json(await entries(project.id));
    expect(after.eligible.map((e: { id: string }) => e.id)).toEqual([notBaselined.id]);
  });

  it('TC-018.1 AC-018.1 the list separates eligible from ineligible and totals only eligible work', async () => {
    const { project, requirement } = await sg.project();
    const scope = { type: 'BASELINE', requirementId: requirement.id };
    await logWork(project.id, { minutes: 60, scope, workDate: '2026-10-14' });
    await logWork(project.id, { minutes: 30, scope, workDate: '2026-10-15' });
    await logWork(project.id, { minutes: 600 });
    const list = await json(await entries(project.id));
    expect(list.currency).toBe('INR');
    expect(list.eligible).toHaveLength(2);
    // Newest work first.
    expect(list.eligible.map((e: { workDate: string }) => e.workDate)).toEqual([
      '2026-10-15',
      '2026-10-14',
    ]);
    expect(list.ineligible).toHaveLength(1);
    expect(list.eligibleTotalMinor).toBe('225000');
  });

  it('TC-017.5 BR-021 change-request work uses the rate frozen on the approved version', async () => {
    const { project, requirement } = await sg.project();
    const cr = await sg.approved(project.id); // TIME pricing at ₹1,500/h
    const current = await json(await ops().get(`/projects/${project.id}`));
    await expectStatus(
      await ops().patch(
        `/projects/${project.id}`,
        { hourlyRateMinor: '200000' },
        current.rowVersion,
      ),
      200,
    );
    const crEntry = await json(
      await logWork(project.id, {
        scope: { type: 'CHANGE_REQUEST', changeRequestId: cr.id, versionNumber: 1 },
      }),
    );
    const baseEntry = await json(
      await logWork(project.id, { scope: { type: 'BASELINE', requirementId: requirement.id } }),
    );
    expect(crEntry).toMatchObject({ hourlyRateMinor: '150000', billableAmountMinor: '150000' });
    expect(baseEntry).toMatchObject({ hourlyRateMinor: '200000', billableAmountMinor: '200000' });
  });

  it('TC-017.6 BR-021 without a project rate the workspace default applies', async () => {
    const client = await ops().client();
    const project = await ops().project(client.id);
    const entry = await json(await logWork(project.id, { minutes: 90 }));
    expect(entry).toMatchObject({ hourlyRateMinor: '0', billableAmountMinor: '0' });
  });

  it('TC-017.7 the scope is copied from the task; an approved-CR task makes the work eligible', async () => {
    const { project } = await sg.project();
    const cr = await sg.approved(project.id);
    const { created } = await json(await convert(cr.id, 1, { criterionIndexes: [0] }));
    const entry = await json(await logWork(project.id, { taskId: created[0].id }));
    expect(entry).toMatchObject({
      taskId: created[0].id,
      scope: { type: 'CHANGE_REQUEST', changeRequestId: cr.id, versionNumber: 1 },
      eligibility: { eligible: true },
    });
  });

  it('TC-017.8 BR-013 work on v1 stays eligible after v2 supersedes it', async () => {
    const { project } = await sg.project();
    const cr = await sg.approved(project.id);
    const entry = await json(
      await logWork(project.id, {
        scope: { type: 'CHANGE_REQUEST', changeRequestId: cr.id, versionNumber: 1 },
      }),
    );
    await supersededCrFrom(cr.id);
    const list = await json(await entries(project.id));
    expect(list.eligible.map((e: { id: string }) => e.id)).toEqual([entry.id]);
  });

  it('a non-billable task, a task or requirement of another project, or a foreign CR → 422', async () => {
    const { project } = await sg.project();
    const other = await sg.project();
    const internal = await ops().task(project.id);
    const otherTask = await ops().task(other.project.id);
    const otherCr = await sg.approved(other.project.id);
    const cases: [Record<string, unknown>, string][] = [
      [{ taskId: internal.id }, 'taskId'],
      [{ taskId: otherTask.id }, 'taskId'],
      [{ taskId: newId() }, 'taskId'],
      [{ scope: { type: 'BASELINE', requirementId: other.requirement.id } }, 'scope.requirementId'],
      [
        { scope: { type: 'CHANGE_REQUEST', changeRequestId: otherCr.id, versionNumber: 1 } },
        'scope.changeRequestId',
      ],
      [
        { scope: { type: 'CHANGE_REQUEST', changeRequestId: newId(), versionNumber: 1 } },
        'scope.changeRequestId',
      ],
    ];
    for (const [body, path] of cases) {
      const res = await logWork(project.id, body);
      expect(res.status).toBe(422);
      expect((await json(res)).errors[0].path).toBe(path);
    }
    expect(
      await t.db.raw.collection('billableEntries').countDocuments({ projectId: project.id }),
    ).toBe(0);
  });

  it.each([
    [{ minutes: 0 }, 'minutes'],
    [{ minutes: 1441 }, 'minutes'],
    [{ minutes: 1.5 }, 'minutes'],
    [{ minutes: undefined }, 'minutes'],
    [{ amountMinor: '100' }, 'amountMinor'],
    [{ kind: 'FIXED', minutes: undefined, amountMinor: '0' }, 'amountMinor'],
    [{ kind: 'FIXED', minutes: undefined }, 'amountMinor'],
    [{ kind: 'FIXED', amountMinor: '100' }, 'minutes'],
    [{ kind: 'FIXED', minutes: undefined, amountMinor: '1.5' }, 'amountMinor'],
    [{ kind: 'HOURS' }, 'kind'],
    [{ description: '' }, 'description'],
    [{ description: 'd'.repeat(501) }, 'description'],
    [{ workDate: '2026-02-30' }, 'workDate'],
    [{ workDate: '2026-10-17' }, 'workDate'],
    [{ taskId: newId(), scope: { type: 'NONE' } }, 'scope'],
  ])('ERR-010 invalid entry %j → 422 on %s', async (override, path) => {
    const { project } = await sg.project();
    const res = await logWork(project.id, override);
    expect(res.status).toBe(422);
    expect((await json(res)).errors[0].path).toBe(path);
  });

  it('today in the workspace time zone is accepted (clock 2026-10-16 09:00Z = 14:30 IST)', async () => {
    const { project } = await sg.project();
    expect((await logWork(project.id, { workDate: '2026-10-16' })).status).toBe(201);
  });

  it('an Idempotency-Key replay creates one entry', async () => {
    const { project } = await sg.project();
    const key = idemKey();
    const a = await logWork(project.id, {}, { 'Idempotency-Key': key });
    const b = await logWork(project.id, {}, { 'Idempotency-Key': key });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect((await json(b)).id).toBe((await json(a)).id);
    expect(
      await t.db.raw.collection('billableEntries').countDocuments({ projectId: project.id }),
    ).toBe(1);
  });

  it('BR-029 an archived project refuses new, edited and deleted work (409 ARCHIVED)', async () => {
    const { project } = await sg.project();
    const entry = await json(await logWork(project.id, {}));
    await expectStatus(await ops().post(`/projects/${project.id}/archive`), 200);
    for (const res of [
      await logWork(project.id, {}),
      await ops().patch(`/billable-entries/${entry.id}`, { minutes: 5 }, 1),
      await ops().del(`/billable-entries/${entry.id}`),
    ]) {
      expect(res.status).toBe(409);
      expect((await json(res)).code).toBe('ARCHIVED');
    }
    // Reading stays possible.
    expect((await entries(project.id)).status).toBe(200);
  });

  it('any member (not only owners) can log and review work', async () => {
    const member = await t.addMember(owner.workspaceId);
    const { project } = await sg.project();
    const memberOps = scopeGuard(t, { ...owner, cookie: member.cookie }).ops;
    const res = await memberOps.post(`/projects/${project.id}/billable-entries`, {
      kind: 'TIME',
      workDate: '2026-10-15',
      minutes: 30,
      description: 'Member work',
    });
    expect(res.status).toBe(201);
    expect((await json(res)).createdByUserId).toBe(member.userId);
  });
});

// =================================================================================================
describe('AC-017.3 editing and deleting entries', () => {
  async function entry() {
    const { project, requirement } = await sg.project();
    const e = await json(
      await logWork(project.id, {
        minutes: 60,
        scope: { type: 'BASELINE', requirementId: requirement.id },
      }),
    );
    return { project, e };
  }
  const markInvoiced = (id: string) =>
    t.db.raw
      .collection('billableEntries')
      .updateOne({ _id: id as never }, { $set: { invoiceId: newId() } });

  it('PATCH an unbilled entry with If-Match recomputes the amount; stale → 412; missing → 428', async () => {
    const { e } = await entry();
    const res = await ops().patch(
      `/billable-entries/${e.id}`,
      { minutes: 30, description: 'Less' },
      1,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"2"');
    expect(await json(res)).toMatchObject({
      minutes: 30,
      billableAmountMinor: '75000',
      rowVersion: 2,
    });
    expect((await ops().patch(`/billable-entries/${e.id}`, { minutes: 20 }, 1)).status).toBe(412);
    expect((await ops().patch(`/billable-entries/${e.id}`, { minutes: 20 }, null)).status).toBe(
      428,
    );
  });

  it.each([
    [{ amountMinor: '100' }, 'amountMinor'],
    [{ workDate: '2026-10-17' }, 'workDate'],
    [{ minutes: 0 }, 'minutes'],
    [{}, ''],
  ])('PATCH %j on a TIME entry → 422 (%s)', async (body, path) => {
    const { e } = await entry();
    const res = await ops().patch(`/billable-entries/${e.id}`, body, 1);
    expect(res.status).toBe(422);
    const err = await json(res);
    if (path) expect(err.errors[0].path).toBe(path);
  });

  it('TC-017.3 AC-017.3 an invoiced entry cannot be edited or deleted (409 ALREADY_INVOICED)', async () => {
    const { project, e } = await entry();
    await markInvoiced(e.id);
    for (const res of [
      await ops().patch(`/billable-entries/${e.id}`, { minutes: 5 }, 1),
      await ops().del(`/billable-entries/${e.id}`),
    ]) {
      expect(res.status).toBe(409);
      expect((await json(res)).code).toBe('ALREADY_INVOICED');
    }
    // Unbilled list excludes it; `state=all` shows it as ineligible ALREADY_INVOICED.
    expect((await json(await entries(project.id))).eligible).toEqual([]);
    const all = await json(await entries(project.id, 'all'));
    expect(all.ineligible).toEqual([
      expect.objectContaining({
        id: e.id,
        eligibility: expect.objectContaining({ reason: 'ALREADY_INVOICED' }),
      }),
    ]);
    expect((await entries(project.id, 'paid')).status).toBe(422);
  });

  it('an entry invoiced between the read and the write is still refused (guarded update)', async () => {
    const { e } = await entry();
    let fired = false;
    const racing: Database = {
      ...t.db,
      withTransaction: async (fn) => {
        if (!fired) {
          fired = true;
          await markInvoiced(e.id);
        }
        return t.db.withTransaction(fn);
      },
    };
    const app = createApp({
      config: t.config,
      db: racing,
      clock: t.clock,
      logger: createLogger('silent'),
    });
    const send = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
      app.request(`${ops().base}/billable-entries/${e.id}`, {
        method,
        headers: {
          Origin: APP_ORIGIN,
          'X-Requested-With': 'soloops',
          Cookie: owner.cookie,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    const patched = await send('PATCH', { minutes: 5 }, { 'If-Match': '"1"' });
    expect(fired).toBe(true);
    expect(patched.status).toBe(409);
    expect((await json(patched)).code).toBe('ALREADY_INVOICED');
    fired = false;
    await t.db.raw
      .collection('billableEntries')
      .updateOne({ _id: e.id }, { $set: { invoiceId: null } });
    const deleted = await send('DELETE');
    expect(fired).toBe(true);
    expect(deleted.status).toBe(409);
    expect(await t.db.raw.collection('billableEntries').countDocuments({ _id: e.id })).toBe(1);
  });

  it('DELETE an unbilled entry → 204, then 404', async () => {
    const { e } = await entry();
    expect((await ops().del(`/billable-entries/${e.id}`)).status).toBe(204);
    expect((await ops().get(`/billable-entries/${e.id}`)).status).toBe(404);
    expect((await ops().del(`/billable-entries/${e.id}`)).status).toBe(404);
  });

  it('data-model §4.6 the project currency is fixed once work was logged', async () => {
    const { project } = await sg.project();
    const p = await json(await ops().get(`/projects/${project.id}`));
    const before = await ops().patch(`/projects/${project.id}`, { currency: 'USD' }, p.rowVersion);
    expect(before.status).toBe(200);
    const usd = await json(before);
    await logWork(project.id, {});
    const after = await ops().patch(`/projects/${project.id}`, { currency: 'EUR' }, usd.rowVersion);
    expect(after.status).toBe(409);
    expect((await json(after)).code).toBe('INVALID_STATE_TRANSITION');
    // Same currency or other fields are fine.
    expect(
      (
        await ops().patch(
          `/projects/${project.id}`,
          { currency: 'USD', name: 'Renamed' },
          usd.rowVersion,
        )
      ).status,
    ).toBe(200);
  });
});

// =================================================================================================
describe('FR-015 project overview', () => {
  it('TC-024.1 AC-024.1 counts of requirements, CRs by status, tasks, and the eligible unbilled total', async () => {
    const { project, requirement } = await sg.project();
    await ops().requirement(project.id, { title: 'Draft' });
    const approved = await sg.approved(project.id);
    await sg.proposed(project.id);
    await convert(approved.id, 1, { criterionIndexes: [0, 1] });
    await ops().task(project.id);
    await ops().task(project.id, {
      billable: true,
      scope: { type: 'BASELINE', requirementId: requirement.id },
    });
    await logWork(project.id, { scope: { type: 'BASELINE', requirementId: requirement.id } });
    await logWork(project.id, {});
    const res = await ops().get(`/projects/${project.id}/overview`);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      projectId: project.id,
      currency: 'INR',
      requirements: { draft: 1, baselined: 1 },
      baselines: 1,
      changeRequests: {
        DRAFT: 0,
        AWAITING_DECISION: 1,
        REVISING: 0,
        NEEDS_REVISION: 0,
        APPROVED: 1,
        REJECTED: 0,
        WITHDRAWN: 0,
      },
      tasks: {
        TODO: 4,
        IN_PROGRESS: 0,
        DONE: 0,
        total: 4,
        original: 1,
        additional: 2,
        internal: 1,
      },
      unbilled: { eligibleTotalMinor: '150000', eligibleCount: 1, ineligibleCount: 1 },
    });
  });
});
