// M5 invoices: FR-042–FR-046, BR-017–BR-025, BR-028, AC-019.x–AC-021.1 on a real replica set.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../src/platform/ids';
import { json, createTestContext, type TestContext } from './helpers';
import { idemKey, scopeGuard } from './scope-guard-fixtures';

let t: TestContext;
let owner: Awaited<ReturnType<TestContext['register']>>;
let sg: ReturnType<typeof scopeGuard>;
let member: ReturnType<typeof scopeGuard>['ops'];

beforeAll(async () => {
  t = await createTestContext();
  owner = await t.register({ name: 'Riya Sen' });
  sg = scopeGuard(t, owner);
  const m = await t.addMember(owner.workspaceId);
  member = scopeGuard(t, { ...owner, cookie: m.cookie }).ops;
});
afterAll(async () => {
  await t.cleanup();
});

const ops = () => sg.ops;
const ok = async (res: Response, status: number) => {
  if (res.status !== status)
    throw new Error(`expected ${status}, got ${res.status}: ${await res.text()}`);
  return json(res);
};
const nextNumber = async () =>
  (await t.db.raw.collection('workspaces').findOne({ _id: owner.workspaceId as never }))
    ?.nextInvoiceNumber as number;
const entryDoc = (id: string) =>
  t.db.raw.collection('billableEntries').findOne({ _id: id as never });
const audits = (id: string, action: string) =>
  t.db.raw.collection('auditEvents').countDocuments({ 'entity.id': id, action });

/** A baselined project (₹1,500/h) with eligible entries; returns their IDs. */
async function billable(minutes: number[] = [120]) {
  const { project, requirement } = await sg.project();
  const ids: string[] = [];
  for (const [i, m] of minutes.entries()) {
    const e = await ok(
      await ops().post(`/projects/${project.id}/billable-entries`, {
        kind: 'TIME',
        workDate: `2026-10-1${i % 6}`,
        minutes: m,
        description: `Work ${i + 1}`,
        scope: { type: 'BASELINE', requirementId: requirement.id },
      }),
      201,
    );
    ids.push(e.id);
  }
  return { project, requirement, ids };
}
const draft = (projectId: string, entryIds: string[], headers?: Record<string, string>) =>
  ops().post('/invoices', { projectId, entryIds }, headers);
const issue = (id: string, key: string | null = idemKey(), as = ops()) =>
  as.post(`/invoices/${id}/issue`, undefined, key ? { 'Idempotency-Key': key } : {});
const voidIt = (id: string, reason: unknown, key: string | null = idemKey(), as = ops()) =>
  as.post(`/invoices/${id}/void`, { reason }, key ? { 'Idempotency-Key': key } : {});

async function setTax(taxRateBps: number) {
  const ws = await json(await ops().get(''));
  await ok(
    await ops().patch('', { taxRateBps, taxLabel: 'GST', invoicePrefix: 'RS' }, ws.rowVersion),
    200,
  );
}

// =================================================================================================
describe('FR-042 invoice drafts', () => {
  it('TC-019.1 AC-019.1 BR-020 BR-021 lines, subtotal, tax and total from the server; entries reserved; audited', async () => {
    await setTax(1800);
    const { project, ids } = await billable([120, 45]);
    const res = await draft(project.id, ids);
    expect(res.status).toBe(201);
    expect(res.headers.get('ETag')).toBe('"1"');
    const inv = await json(res);
    expect(inv).toMatchObject({
      status: 'DRAFT',
      number: null,
      displayNumber: null,
      currency: 'INR',
      taxLabel: 'GST',
      taxRateBps: 1800,
      calculationVersion: 1,
      clientName: 'Das Sweets Pvt Ltd',
      projectName: project.name,
      // 120 min → 300000; 45 min → 112500; subtotal 412500; tax 74250; total 486750
      subtotalMinor: '412500',
      taxMinor: '74250',
      totalMinor: '486750',
    });
    expect(inv.lines).toEqual([
      expect.objectContaining({
        position: 1,
        kind: 'TIME',
        minutes: 120,
        hourlyRateMinor: '150000',
        amountMinor: '300000',
        billableEntryId: ids[0],
      }),
      expect.objectContaining({
        position: 2,
        minutes: 45,
        amountMinor: '112500',
        billableEntryId: ids[1],
      }),
    ]);
    expect(inv.lines[0].description).toMatch(/^Work 1 \(REQ-\d+\)$/);
    for (const id of ids) expect((await entryDoc(id))?.invoiceId).toBe(inv.id);
    expect(await audits(inv.id, 'invoice.created')).toBe(1);
    // The unbilled list no longer offers reserved work.
    const unbilled = await json(await ops().get(`/projects/${project.id}/billable-entries`));
    expect(unbilled.eligible).toEqual([]);
    await setTax(0);
  });

  it('TC-019.1b zero tax and .5 rounding (1 min at ₹0.30/h → 1 paisa, half up)', async () => {
    const client = await ops().client();
    const project = await ops().project(client.id, { hourlyRateMinor: '30' });
    const r = await ops().requirement(project.id);
    await ops().baseline(project.id);
    const e = await ok(
      await ops().post(`/projects/${project.id}/billable-entries`, {
        kind: 'TIME',
        workDate: '2026-10-15',
        minutes: 1,
        description: 'x',
        scope: { type: 'BASELINE', requirementId: r.id },
      }),
      201,
    );
    const inv = await ok(await draft(project.id, [e.id]), 201);
    expect(inv).toMatchObject({ subtotalMinor: '1', taxMinor: '0', totalMinor: '1' });
  });

  it('BR-022 client-sent totals and line amounts are ignored', async () => {
    const { project, ids } = await billable([60]);
    const inv = await ok(
      await ops().post('/invoices', {
        projectId: project.id,
        entryIds: ids,
        totalMinor: '1',
        lines: [{ amountMinor: '1' }],
      }),
      201,
    );
    expect(inv.totalMinor).toBe('150000');
  });

  it('TC-019.2 AC-019.2 BR-017 an ineligible entry in the selection → 422 listing it; nothing reserved', async () => {
    const { project, ids } = await billable([60]);
    const unscoped = await ok(
      await ops().post(`/projects/${project.id}/billable-entries`, {
        kind: 'TIME',
        workDate: '2026-10-15',
        minutes: 30,
        description: 'Misc',
      }),
      201,
    );
    const res = await draft(project.id, [ids[0] as string, unscoped.id]);
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.code).toBe('NOT_ELIGIBLE');
    expect(body.errors).toEqual([
      { path: 'entryIds.1', message: expect.stringContaining('Misc: This work is not linked') },
    ]);
    expect((await entryDoc(ids[0] as string))?.invoiceId).toBeNull();
    expect(await t.db.raw.collection('invoices').countDocuments({ projectId: project.id })).toBe(0);
  });

  it('TC-019.4 AC-019.4 BR-018 work already on another draft → 409; concurrent drafts → exactly one', async () => {
    const { project, ids } = await billable([60, 30]);
    await ok(await draft(project.id, [ids[0] as string]), 201);
    const again = await draft(project.id, ids);
    expect(again.status).toBe(409);
    expect((await json(again)).code).toBe('ALREADY_INVOICED');
    const racing = await Promise.all([1, 2, 3].map(() => draft(project.id, [ids[1] as string])));
    expect(racing.filter((r) => r.status === 201)).toHaveLength(1);
    for (const r of racing.filter((x) => x.status !== 201)) expect(r.status).toBe(409);
    expect(await t.db.raw.collection('invoices').countDocuments({ projectId: project.id })).toBe(2);
  });

  it.each([
    [{ entryIds: [] }, 'entryIds'],
    [{ entryIds: ['dup', 'dup'] }, 'entryIds.0'],
    [{ projectId: 'nope' }, 'projectId'],
  ])('ERR-010 invalid draft %j → 422 on %s', async (override, path) => {
    const { project, ids } = await billable([60]);
    const res = await ops().post('/invoices', {
      projectId: project.id,
      entryIds: ids,
      ...override,
    });
    expect(res.status).toBe(422);
    expect((await json(res)).errors[0].path).toBe(path);
  });

  it('entries of another project, a missing entry or a foreign project → 422 field errors', async () => {
    const a = await billable([60]);
    const b = await billable([60]);
    for (const [body, path] of [
      [{ projectId: a.project.id, entryIds: [b.ids[0]] }, 'entryIds.0'],
      [{ projectId: a.project.id, entryIds: [a.ids[0], newId()] }, 'entryIds.1'],
      [{ projectId: newId(), entryIds: a.ids }, 'projectId'],
    ] as const) {
      const res = await ops().post('/invoices', body);
      expect(res.status).toBe(422);
      expect((await json(res)).errors[0].path).toBe(path);
    }
  });

  it('an Idempotency-Key replay returns the same draft', async () => {
    const { project, ids } = await billable([60]);
    const key = idemKey();
    const first = await ok(await draft(project.id, ids, { 'Idempotency-Key': key }), 201);
    const replay = await ok(await draft(project.id, ids, { 'Idempotency-Key': key }), 201);
    expect(replay.id).toBe(first.id);
    expect(await t.db.raw.collection('invoices').countDocuments({ projectId: project.id })).toBe(1);
  });

  it('workflows §4 eligible work on an archived project stays invoiceable; members can draft', async () => {
    const { project, ids } = await billable([60]);
    await ok(await ops().post(`/projects/${project.id}/archive`), 200);
    const res = await member.post('/invoices', { projectId: project.id, entryIds: ids });
    expect(res.status).toBe(201);
  });
});

// =================================================================================================
describe('FR-043 editing drafts', () => {
  async function aDraft() {
    const { project, ids } = await billable([120, 60]);
    return { project, ids, inv: await ok(await draft(project.id, ids), 201) };
  }

  it('TC-019.3 AC-019.3 BR-025 an adjustment needs a reason; with one it is a manual line and totals refresh', async () => {
    const { inv } = await aDraft();
    const noReason = await ops().patch(
      `/invoices/${inv.id}`,
      { addAdjustments: [{ description: 'Goodwill', amountMinor: '-50000', reason: '' }] },
      1,
    );
    expect(noReason.status).toBe(422);
    expect((await json(noReason)).errors[0].path).toBe('addAdjustments.0.reason');
    const res = await ops().patch(
      `/invoices/${inv.id}`,
      {
        lineDescriptions: [{ position: 1, description: 'Login API' }],
        addAdjustments: [
          { description: 'Goodwill discount', amountMinor: '-50000', reason: 'Agreed on call' },
        ],
      },
      1,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"2"');
    const body = await json(res);
    expect(body.lines.map((l: { description: string }) => l.description)).toEqual([
      'Login API',
      expect.stringMatching(/^Work 2/),
      'Goodwill discount',
    ]);
    expect(body.lines[2]).toMatchObject({
      position: 3,
      kind: 'ADJUSTMENT',
      billableEntryId: null,
      amountMinor: '-50000',
      adjustmentReason: 'Agreed on call',
    });
    expect(body).toMatchObject({ subtotalMinor: '400000', totalMinor: '400000' });
  });

  it('removing a line returns its entry to unbilled work; removing all lines is refused', async () => {
    const { project, ids, inv } = await aDraft();
    const res = await ok(
      await ops().patch(`/invoices/${inv.id}`, { removePositions: [1] }, 1),
      200,
    );
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0]).toMatchObject({ position: 1, billableEntryId: ids[1] });
    expect(res.subtotalMinor).toBe('150000');
    expect((await entryDoc(ids[0] as string))?.invoiceId).toBeNull();
    const list = await json(await ops().get(`/projects/${project.id}/billable-entries`));
    expect(list.eligible.map((e: { id: string }) => e.id)).toEqual([ids[0]]);
    const all = await ops().patch(`/invoices/${inv.id}`, { removePositions: [1] }, 2);
    expect(all.status).toBe(422);
  });

  it('a negative subtotal, unknown positions, stale or missing If-Match are refused', async () => {
    const { inv } = await aDraft();
    const neg = await ops().patch(
      `/invoices/${inv.id}`,
      { addAdjustments: [{ description: 'x', amountMinor: '-999999999', reason: 'r' }] },
      1,
    );
    expect(neg.status).toBe(422);
    expect((await ops().patch(`/invoices/${inv.id}`, { removePositions: [9] }, 1)).status).toBe(
      422,
    );
    expect(
      (
        await ops().patch(
          `/invoices/${inv.id}`,
          { lineDescriptions: [{ position: 1, description: 'y' }] },
          7,
        )
      ).status,
    ).toBe(412);
    expect(
      (
        await ops().patch(
          `/invoices/${inv.id}`,
          { lineDescriptions: [{ position: 1, description: 'y' }] },
          null,
        )
      ).status,
    ).toBe(428);
    expect((await ops().patch(`/invoices/${inv.id}`, {}, 1)).status).toBe(422);
    expect(
      (
        await ops().patch(
          `/invoices/${inv.id}`,
          { addAdjustments: [{ description: 'x', amountMinor: '0', reason: 'r' }] },
          1,
        )
      ).status,
    ).toBe(422);
  });

  it('deleting a draft releases every entry; then it is gone', async () => {
    const { ids, inv } = await aDraft();
    expect((await ops().del(`/invoices/${inv.id}`)).status).toBe(204);
    for (const id of ids) expect((await entryDoc(id))?.invoiceId).toBeNull();
    expect((await ops().get(`/invoices/${inv.id}`)).status).toBe(404);
  });
});

// =================================================================================================
describe('FR-044 issue and FR-046 void', () => {
  it('TC-020.1 AC-020.1 BR-023 the owner issues: next number, frozen, entries billed, audited atomically', async () => {
    const { project, ids } = await billable([60]);
    const inv = await ok(await draft(project.id, ids), 201);
    const before = await nextNumber();
    const prefix = (await json(await ops().get(''))).invoicePrefix;
    const res = await issue(inv.id);
    expect(res.status).toBe(200);
    const issued = await json(res);
    expect(issued).toMatchObject({
      status: 'ISSUED',
      number: before,
      displayNumber: `${prefix}-${String(before).padStart(4, '0')}`,
      totalMinor: '150000',
      issuedByUserId: owner.userId,
    });
    expect(await nextNumber()).toBe(before + 1);
    expect(await audits(inv.id, 'invoice.issued')).toBe(1);
    // Immutable (BR-023): no edits, no delete; entries stay billed.
    expect(
      (await ops().patch(`/invoices/${inv.id}`, { removePositions: [1] }, issued.rowVersion))
        .status,
    ).toBe(409);
    expect((await ops().del(`/invoices/${inv.id}`)).status).toBe(409);
    expect((await issue(inv.id)).status).toBe(409);
    expect((await entryDoc(ids[0] as string))?.invoiceId).toBe(inv.id);
    expect((await ops().patch(`/billable-entries/${ids[0]}`, { minutes: 5 }, 2)).status).toBe(409);
  });

  it('TC-020.2 AC-020.2 SEC-011 a member cannot issue or void (403); the draft is unchanged', async () => {
    const { project, ids } = await billable([60]);
    const inv = await ok(await draft(project.id, ids), 201);
    const before = await nextNumber();
    const res = await issue(inv.id, idemKey(), member);
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('FORBIDDEN');
    expect(await nextNumber()).toBe(before);
    await ok(await issue(inv.id), 200);
    expect((await voidIt(inv.id, 'Mistake', idemKey(), member)).status).toBe(403);
    expect((await json(await ops().get(`/invoices/${inv.id}`))).status).toBe('ISSUED');
  });

  it('TC-020.3 AC-020.3 a retried Idempotency-Key returns the same number; no extra number; key required', async () => {
    const { project, ids } = await billable([60]);
    const inv = await ok(await draft(project.id, ids), 201);
    expect((await issue(inv.id, null)).status).toBe(422);
    const key = idemKey();
    const first = await ok(await issue(inv.id, key), 200);
    const after = await nextNumber();
    const retry = await ok(await issue(inv.id, key), 200);
    expect(retry.number).toBe(first.number);
    expect(await nextNumber()).toBe(after);
    expect(await audits(inv.id, 'invoice.issued')).toBe(1);
  });

  it('TC-020.4 AC-020.4 BR-017 a line whose work became ineligible blocks issuing (409) and consumes no number', async () => {
    const { project, ids } = await billable([60, 30]);
    const inv = await ok(await draft(project.id, ids), 201);
    // Defensive: the API offers no way to make reserved work ineligible, so tamper directly.
    await t.db.raw.collection('billableEntries').updateOne(
      { _id: ids[1] as never },
      {
        $set: {
          scope: {
            type: 'NONE',
            requirementId: null,
            changeRequestId: null,
            versionNumber: null,
          },
        },
      },
    );
    const before = await nextNumber();
    const res = await issue(inv.id);
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.code).toBe('NOT_ELIGIBLE');
    expect(body.errors).toEqual([
      { path: 'lines.2', message: expect.stringContaining('not linked') },
    ]);
    expect(await nextNumber()).toBe(before);
    expect((await json(await ops().get(`/invoices/${inv.id}`))).status).toBe('DRAFT');
    // Remove the offending line, then the invoice issues with the next number.
    const fixed = await ok(
      await ops().patch(`/invoices/${inv.id}`, { removePositions: [2] }, 1),
      200,
    );
    expect((await ok(await issue(inv.id), 200)).number).toBe(before);
    expect(fixed.lines).toHaveLength(1);
  });

  it('BR-023 concurrent issues: different drafts get distinct consecutive numbers; one draft is issued once', async () => {
    const drafts = [];
    for (let i = 0; i < 3; i += 1) {
      const { project, ids } = await billable([60]);
      drafts.push(await ok(await draft(project.id, ids), 201));
    }
    const start = await nextNumber();
    const results = await Promise.all(drafts.map((d) => issue(d.id)));
    const numbers = (await Promise.all(results.map((r) => ok(r, 200)))).map((r) => r.number).sort();
    expect(numbers).toEqual([start, start + 1, start + 2]);
    const { project, ids } = await billable([60]);
    const one = await ok(await draft(project.id, ids), 201);
    const before = await nextNumber();
    const same = await Promise.all([1, 2, 3].map(() => issue(one.id)));
    expect(same.filter((r) => r.status === 200)).toHaveLength(1);
    for (const r of same.filter((x) => x.status !== 200)) expect(r.status).toBe(409);
    expect(await nextNumber()).toBe(before + 1);
  });

  it('TC-021.1 AC-021.1 BR-024 void keeps the number, records the reason and releases the entries; audited', async () => {
    const { project, ids } = await billable([60]);
    const inv = await ok(await draft(project.id, ids), 201);
    const issued = await ok(await issue(inv.id), 200);
    expect((await voidIt(inv.id, '')).status).toBe(422);
    expect((await voidIt(inv.id, 'Wrong client', null)).status).toBe(422);
    const voided = await ok(await voidIt(inv.id, 'Wrong client'), 200);
    expect(voided).toMatchObject({
      status: 'VOID',
      number: issued.number,
      displayNumber: issued.displayNumber,
      voidReason: 'Wrong client',
    });
    expect(voided.voidedAt).not.toBeNull();
    expect((await entryDoc(ids[0] as string))?.invoiceId).toBeNull();
    expect(await audits(inv.id, 'invoice.voided')).toBe(1);
    expect((await voidIt(inv.id, 'Again')).status).toBe(409);
    // BR-030: the released work stays as the void invoice's evidence (no hard delete).
    const del = await ops().del(`/billable-entries/${ids[0]}`);
    expect(del.status).toBe(409);
    expect((await json(del)).detail).toMatch(/void invoice/);
    // The released work can be invoiced again; the voided number is never reused.
    const again = await ok(await draft(project.id, ids), 201);
    const reissued = await ok(await issue(again.id), 200);
    expect(reissued.number).toBeGreaterThan(issued.number);
  });

  it('a draft cannot be voided (409)', async () => {
    const { project, ids } = await billable([60]);
    const inv = await ok(await draft(project.id, ids), 201);
    expect((await voidIt(inv.id, 'x')).status).toBe(409);
  });
});

// =================================================================================================
describe('invoice list', () => {
  it('filters by status and project and pages newest first', async () => {
    const { project, ids } = await billable([60, 30, 15]);
    const a = await ok(await draft(project.id, [ids[0] as string]), 201);
    const b = await ok(await draft(project.id, [ids[1] as string]), 201);
    const c = await ok(await draft(project.id, [ids[2] as string]), 201);
    await ok(await issue(b.id), 200);
    const drafts = await json(await ops().get(`/invoices?projectId=${project.id}&status=DRAFT`));
    expect(drafts.items.map((i: { id: string }) => i.id)).toEqual([c.id, a.id]);
    const page1 = await json(await ops().get(`/invoices?projectId=${project.id}&limit=2`));
    expect(page1.items.map((i: { id: string }) => i.id)).toEqual([c.id, b.id]);
    const page2 = await json(
      await ops().get(`/invoices?projectId=${project.id}&limit=2&cursor=${page1.nextCursor}`),
    );
    expect(page2.items.map((i: { id: string }) => i.id)).toEqual([a.id]);
    expect(page2.nextCursor).toBeNull();
    expect(page1.items[1]).toMatchObject({ status: 'ISSUED', clientName: 'Das Sweets Pvt Ltd' });
    expect((await ops().get('/invoices?status=PAID')).status).toBe(422);
  });
});
