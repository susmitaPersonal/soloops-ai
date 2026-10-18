import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deriveCrStatus } from '../src/modules/scope-guard/domain/lifecycle';
import { versionContentHash } from '../src/modules/scope-guard/domain/version-rules';
import { createTestContext, json, type TestContext } from './helpers';
import { completeDraft, idemKey, scopeGuard } from './scope-guard-fixtures';

let t: TestContext;
let owner: Awaited<ReturnType<TestContext['register']>>;
let sg: ReturnType<typeof scopeGuard>;
let projectId: string;
let requirementId: string;

beforeAll(async () => {
  t = await createTestContext();
  owner = await t.register({ name: 'Riya Sen' });
  sg = scopeGuard(t, owner);
  const p = await sg.project();
  projectId = p.project.id;
  requirementId = p.requirement.id;
});
afterAll(async () => {
  await t.cleanup();
});

const crDoc = (id: string) => t.db.raw.collection('changeRequests').findOne({ _id: id as never });
const auditActions = async (id: string) =>
  (
    await t.db.raw
      .collection('auditEvents')
      .find({ 'entity.type': 'CHANGE_REQUEST', 'entity.id': id })
      .sort({ _id: 1 })
      .toArray()
  ).map((e) => e.action);

/** AC-027.3 / ADR-0015: the stored cache always equals the pure derivation. */
async function expectStatusConsistent(id: string) {
  const doc = await crDoc(id);
  expect(doc?.derivedStatus).toBe(deriveCrStatus(doc?.versions ?? []));
}

describe('FR-020 record a change request', () => {
  it('TC-008.1 AC-008.1 creates CR-n with draft v1 holding the raw text unchanged; audited', async () => {
    const raw = '  Can you also add login with WhatsApp OTP?\nNeed it before Diwali.  ';
    const res = await sg.createCr(projectId, { rawRequestText: raw });
    expect(res.status).toBe(201);
    const cr = await json(res);
    expect(cr).toMatchObject({
      key: `CR-${cr.number}`,
      rawRequestText: raw,
      sourceChannel: 'CHAT',
      requestedByName: 'S. Das',
      receivedOn: '2026-10-12',
      status: 'DRAFT',
      openVersionNumber: 1,
      approvedVersionNumber: null,
      latestVersionNumber: 1,
      readOnly: false,
    });
    expect(cr.versions).toHaveLength(1);
    expect(cr.versions[0]).toMatchObject({
      number: 1,
      state: 'DRAFT',
      title: 'Can you also add login with WhatsApp OTP?',
      contentHash: null,
      decision: null,
    });
    expect(await auditActions(cr.id)).toEqual(['cr.created']);
    await expectStatusConsistent(cr.id);
  });

  it('TC-008.N CR numbers are sequential per project and never reused', async () => {
    const a = await sg.cr(projectId);
    const b = await sg.cr(projectId);
    expect(b.number).toBe(a.number + 1);
  });

  it.each([
    [{ rawRequestText: '' }, 'rawRequestText'],
    [{ rawRequestText: '   ' }, 'rawRequestText'],
    [{ rawRequestText: 'x'.repeat(20001) }, 'rawRequestText'],
    [{ sourceChannel: 'FAX' }, 'sourceChannel'],
    [{ requestedByName: '' }, 'requestedByName'],
    [{ receivedOn: '2026-10-17' }, 'receivedOn'],
    [{ receivedOn: '12/10/2026' }, 'receivedOn'],
  ])('ERR-010 invalid CR %j → 422 on %s', async (body, path) => {
    const res = await sg.createCr(projectId, body);
    expect(res.status).toBe(422);
    expect((await json(res)).errors.map((e: { path: string }) => e.path)).toContain(path);
  });

  it('TC-008.2 AC-008.2 BR-029 an archived project → 409 ARCHIVED', async () => {
    const p = await sg.ops.project((await sg.ops.client()).id);
    await sg.ops.post(`/projects/${p.id}/archive`);
    const res = await sg.createCr(p.id);
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('ARCHIVED');
  });
});

describe('FR-022 / FR-023 draft editing and server-side pricing', () => {
  it('TC-010.1 AC-010.1 TIME price = roundHalfUp(minutes × rate / 60), computed on save', async () => {
    const cr = await sg.cr(projectId);
    // 545 min × ₹1,500/h = 1362.5 rupees = 136250 paise exactly; 541 min → 135250.
    const res = await sg.editDraft(
      cr.id,
      1,
      { confirmedEffortMinutes: 545, pricing: { mode: 'TIME' } },
      1,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"2"');
    const v = (await json(res)).versions[0];
    expect(v.pricing).toEqual({
      mode: 'TIME',
      hourlyRateMinor: '150000',
      priceMinor: '1362500',
      currency: 'INR',
    });
    // Rounding: 1 minute at ₹1,500/h = 2500 paise exactly; 1 min at 1 paisa/h = 0.0166… → 0.
    const r2 = await json(await sg.editDraft(cr.id, 1, { confirmedEffortMinutes: 1 }, 2));
    expect(r2.versions[0].pricing.priceMinor).toBe('2500');
  });

  it('TC-010.1b a client-supplied TIME price is ignored (not part of the contract)', async () => {
    const cr = await sg.cr(projectId);
    const res = await sg.editDraft(
      cr.id,
      1,
      { confirmedEffortMinutes: 60, pricing: { mode: 'TIME', priceMinor: '1' }, priceMinor: '1' },
      1,
    );
    expect((await json(res)).versions[0].pricing.priceMinor).toBe('150000');
  });

  it('TC-010.2 AC-010.2 FIXED price is the entered amount', async () => {
    const cr = await sg.cr(projectId);
    const res = await sg.editDraft(
      cr.id,
      1,
      { pricing: { mode: 'FIXED', priceMinor: '800000' } },
      1,
    );
    expect((await json(res)).versions[0].pricing).toEqual({
      mode: 'FIXED',
      hourlyRateMinor: null,
      priceMinor: '800000',
      currency: 'INR',
    });
  });

  it.each([
    [{ effort: { lowMinutes: 600, likelyMinutes: 300, highMinutes: 900 } }, 'effort'],
    [{ effort: { lowMinutes: 0, likelyMinutes: 1, highMinutes: 2 } }, 'effort.lowMinutes'],
    [{ effort: { lowMinutes: 1, likelyMinutes: 1, highMinutes: 120001 } }, 'effort.highMinutes'],
    [{ confirmedEffortMinutes: 1.5 }, 'confirmedEffortMinutes'],
    [{ acceptanceCriteria: Array.from({ length: 21 }, (_, i) => `AC ${i}`) }, 'acceptanceCriteria'],
    [{ acceptanceCriteria: ['x'.repeat(301)] }, 'acceptanceCriteria.0'],
    [{ risks: [{ description: 'r', severity: 'CRITICAL' }] }, 'risks.0.severity'],
    [{ pricing: { mode: 'FIXED', priceMinor: '12.5' } }, 'pricing.priceMinor'],
    [{ clarifiedDescription: 'd'.repeat(4001) }, 'clarifiedDescription'],
    [
      { affectedRequirementIds: ['0192a000-0000-7000-8000-00000000dead'] },
      'affectedRequirementIds.0',
    ],
    [{}, '(body)'],
  ])('ERR-010 BR-026 invalid draft edit %j → 422 on %s', async (body, path) => {
    const cr = await sg.cr(projectId);
    const res = await sg.editDraft(cr.id, 1, body, 1);
    expect(res.status).toBe(422);
    expect((await json(res)).errors.map((e: { path: string }) => e.path)).toContain(path);
  });

  it('ERR-005 draft edits need the current If-Match (428 / 412)', async () => {
    const cr = await sg.cr(projectId);
    expect((await sg.editDraft(cr.id, 1, { title: 'A' }, null)).status).toBe(428);
    expect((await sg.editDraft(cr.id, 1, { title: 'A' }, 1)).status).toBe(200);
    expect((await sg.editDraft(cr.id, 1, { title: 'B' }, 1)).status).toBe(412);
  });

  it('affected requirements must belong to the project; the raw text is immutable', async () => {
    const cr = await sg.cr(projectId);
    const res = await sg.editDraft(
      cr.id,
      1,
      { affectedRequirementIds: [requirementId], rawRequestText: 'tampered' },
      1,
    );
    const body = await json(res);
    expect(body.versions[0].affectedRequirementIds).toEqual([requirementId]);
    expect(body.rawRequestText).toBe(
      'Can you also add login with WhatsApp OTP? Need it before Diwali sale.',
    );
  });
});

describe('FR-024 propose', () => {
  it('TC-011.1 AC-011.1 BR-007 a draft missing assumptions, criteria, price → 422 listing them', async () => {
    const cr = await sg.cr(projectId);
    await sg.editDraft(cr.id, 1, { clarifiedDescription: '', assumptions: [] }, 1);
    const res = await sg.propose(cr.id, 1, 2);
    expect(res.status).toBe(422);
    const paths = (await json(res)).errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'clarifiedDescription',
        'acceptanceCriteria',
        'assumptions',
        'pricing',
      ]),
    );
    expect((await crDoc(cr.id))?.versions[0].state).toBe('DRAFT');
  });

  it('BR-007 TIME pricing needs confirmed effort and a non-zero rate', async () => {
    const ws = await json(await t.request('GET', sg.ops.base, { cookie: owner.cookie }));
    expect(ws.defaultHourlyRateMinor).toBe('0');
    const noRate = await sg.ops.project((await sg.ops.client()).id); // no override, workspace 0
    const cr = await sg.cr(noRate.id);
    const draft = completeDraft({ confirmedEffortMinutes: null });
    const edited = await json(await sg.editDraft(cr.id, 1, draft, 1));
    const res = await sg.propose(cr.id, 1, edited.rowVersion);
    expect(res.status).toBe(422);
    expect((await json(res)).errors.map((e: { path: string }) => e.path)).toEqual(
      expect.arrayContaining(['confirmedEffortMinutes', 'pricing']),
    );
  });

  it('TC-011.2 AC-011.2 BR-008 propose freezes, hashes and audits; further edits → 409', async () => {
    const cr = await sg.cr(projectId);
    const edited = await json(
      await sg.editDraft(cr.id, 1, completeDraft({ affectedRequirementIds: [requirementId] }), 1),
    );
    const res = await sg.propose(cr.id, 1, edited.rowVersion);
    expect(res.status).toBe(200);
    const body = await json(res);
    const v = body.versions[0];
    expect(v).toMatchObject({ state: 'PROPOSED', proposedByUserId: owner.userId });
    expect(v.proposedAt).toBe('2026-10-16T09:00:00.000Z');
    expect(v.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(v.pricing.priceMinor).toBe('1350000'); // 540 min × 150000 / 60
    expect(body.status).toBe('AWAITING_DECISION');

    // BR-008: the stored hash is recomputable from the frozen document.
    const doc = await crDoc(cr.id);
    expect(versionContentHash(cr.id, doc?.versions[0])).toBe(v.contentHash);

    // BR-006 / BR-011: no edit after propose.
    const edit = await sg.editDraft(cr.id, 1, { title: 'Sneaky' }, body.rowVersion);
    expect(edit.status).toBe(409);
    expect((await json(edit)).code).toBe('INVALID_STATE_TRANSITION');
    expect(await auditActions(cr.id)).toEqual(['cr.created', 'cr.version.proposed']);
    await expectStatusConsistent(cr.id);
  });

  it('propose with a stale If-Match → 412; proposing twice → 409', async () => {
    const cr = await sg.cr(projectId);
    const edited = await json(await sg.editDraft(cr.id, 1, completeDraft(), 1));
    expect((await sg.propose(cr.id, 1, 1)).status).toBe(412);
    expect((await sg.propose(cr.id, 1, edited.rowVersion)).status).toBe(200);
    expect((await sg.propose(cr.id, 1, edited.rowVersion + 1)).status).toBe(409);
  });

  it('a deleted affected requirement blocks propose (no dangling scope links)', async () => {
    const draftReq = await sg.ops.requirement(projectId, { title: 'Draft only' });
    const cr = await sg.cr(projectId);
    const edited = await json(
      await sg.editDraft(cr.id, 1, completeDraft({ affectedRequirementIds: [draftReq.id] }), 1),
    );
    await sg.ops.del(`/requirements/${draftReq.id}`);
    const res = await sg.propose(cr.id, 1, edited.rowVersion);
    expect(res.status).toBe(422);
    expect((await json(res)).errors[0].path).toBe('affectedRequirementIds.0');
  });
});

describe('FR-025 record the client decision', () => {
  it('TC-012.1 AC-012.1 BR-014 APPROVED is stored immutably with the hash; version APPROVED; audited', async () => {
    const p = await sg.proposed(projectId);
    const hash = p.versions[0].contentHash;
    const res = await sg.decide(p.id, 1, { contentHash: hash });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body).toMatchObject({ versionState: 'APPROVED', supersededVersion: null });
    expect(body.changeRequest).toMatchObject({
      status: 'APPROVED',
      approvedVersionNumber: 1,
      openVersionNumber: null,
    });
    const approval = await t.db.raw.collection('approvals').findOne({ _id: body.approvalId });
    expect(approval).toMatchObject({
      changeRequestId: p.id,
      versionNumber: 1,
      decision: 'APPROVED',
      contentHash: hash,
      clientDecisionMakerName: 'S. Das',
      decidedOn: '2026-10-14',
      channel: 'EMAIL',
      recordedByUserId: owner.userId,
    });
    const events = await t.db.raw
      .collection('auditEvents')
      .find({ 'entity.id': p.id, action: 'cr.decision.recorded' })
      .toArray();
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toMatchObject({
      versionNumber: 1,
      decision: 'APPROVED',
      contentHash: hash,
    });
    await expectStatusConsistent(p.id);
  });

  it.each([
    ['REJECTED', 'REJECTED', 'REJECTED'],
    ['CLARIFICATION_REQUESTED', 'CLARIFICATION_REQUESTED', 'NEEDS_REVISION'],
  ])('TC-012.D %s → version %s, CR %s', async (decision, state, status) => {
    const p = await sg.proposed(projectId);
    const body = await json(
      await sg.decide(p.id, 1, { decision, contentHash: p.versions[0].contentHash }),
    );
    expect(body.changeRequest.versions[0].state).toBe(state);
    expect(body.changeRequest.status).toBe(status);
    await expectStatusConsistent(p.id);
  });

  it('TC-012.3 AC-012.3 BR-010 a hash that does not match → 409 VERSION_HASH_MISMATCH; nothing stored', async () => {
    const p = await sg.proposed(projectId);
    const res = await sg.decide(p.id, 1, { contentHash: 'a'.repeat(64) });
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('VERSION_HASH_MISMATCH');
    expect(await t.db.raw.collection('approvals').countDocuments({ changeRequestId: p.id })).toBe(
      0,
    );
    expect((await crDoc(p.id))?.versions[0].state).toBe('PROPOSED');
  });

  it('TC-012.2 AC-012.2 a version that is not PROPOSED (draft, decided, withdrawn) → 409', async () => {
    const draft = await sg.cr(projectId);
    expect((await sg.decide(draft.id, 1, { contentHash: 'a'.repeat(64) })).status).toBe(409);

    const decided = await sg.approved(projectId);
    const again = await sg.decide(decided.id, 1, { contentHash: decided.versions[0].contentHash });
    expect(again.status).toBe(409);
    expect((await json(again)).code).toBe('INVALID_STATE_TRANSITION');

    const w = await sg.proposed(projectId);
    await sg.withdraw(w.id, 1);
    expect((await sg.decide(w.id, 1, { contentHash: w.versions[0].contentHash })).status).toBe(409);
    expect(await t.db.raw.collection('approvals').countDocuments({ changeRequestId: w.id })).toBe(
      0,
    );
  });

  it('TC-012.4 AC-012.4 concurrent decisions on one version: exactly one succeeds, one approval', async () => {
    const p = await sg.proposed(projectId);
    const hash = p.versions[0].contentHash;
    const results = await Promise.all([
      sg.decide(p.id, 1, { contentHash: hash, decision: 'APPROVED' }),
      sg.decide(p.id, 1, { contentHash: hash, decision: 'REJECTED' }),
      sg.decide(p.id, 1, { contentHash: hash, decision: 'APPROVED' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await t.db.raw.collection('approvals').countDocuments({ changeRequestId: p.id })).toBe(
      1,
    );
    const events = await t.db.raw
      .collection('auditEvents')
      .countDocuments({ 'entity.id': p.id, action: 'cr.decision.recorded' });
    expect(events).toBe(1);
    await expectStatusConsistent(p.id);
  });

  it('TC-012.5 AC-012.5 a decision date in the future (workspace time zone) → 422', async () => {
    const p = await sg.proposed(projectId);
    const res = await sg.decide(p.id, 1, {
      contentHash: p.versions[0].contentHash,
      decidedOn: '2026-10-17',
    });
    expect(res.status).toBe(422);
    expect((await json(res)).errors[0].path).toBe('decidedOn');
    // Today in Asia/Kolkata (clock 2026-10-16T09:00Z = 14:30 IST) is accepted.
    const ok = await sg.decide(p.id, 1, {
      contentHash: p.versions[0].contentHash,
      decidedOn: '2026-10-16',
    });
    expect(ok.status).toBe(201);
  });

  it.each([
    [{ clientDecisionMakerName: '' }, 'clientDecisionMakerName'],
    [{ channel: 'TELEPATHY' }, 'channel'],
    [{ decision: 'MAYBE' }, 'decision'],
    [{ contentHash: 'short' }, 'contentHash'],
    [{ evidenceNote: 'e'.repeat(5001) }, 'evidenceNote'],
  ])('BR-014 invalid decision %j → 422 on %s', async (body, path) => {
    const p = await sg.proposed(projectId);
    const res = await sg.decide(p.id, 1, { contentHash: p.versions[0].contentHash, ...body });
    expect(res.status).toBe(422);
    expect((await json(res)).errors.map((e: { path: string }) => e.path)).toContain(path);
  });

  it('api-design §4 decisions REQUIRE an Idempotency-Key; a malformed key is refused', async () => {
    const p = await sg.proposed(projectId);
    const missing = await sg.decide(p.id, 1, { contentHash: p.versions[0].contentHash }, null);
    expect(missing.status).toBe(422);
    expect((await json(missing)).errors[0].path).toBe('Idempotency-Key');
    const bad = await sg.decide(p.id, 1, { contentHash: p.versions[0].contentHash }, 'no!');
    expect(bad.status).toBe(422);
  });

  it('TC-IDEM-01 a retried decision with the same key returns the same result; nothing is duplicated', async () => {
    const p = await sg.proposed(projectId);
    const key = idemKey();
    const body = { contentHash: p.versions[0].contentHash };
    const first = await sg.decide(p.id, 1, body, key);
    const retry = await sg.decide(p.id, 1, body, key);
    expect([first.status, retry.status]).toEqual([201, 201]);
    expect((await json(retry)).approvalId).toBe((await json(first)).approvalId);
    expect(await t.db.raw.collection('approvals').countDocuments({ changeRequestId: p.id })).toBe(
      1,
    );
    // Same key, different body → 422 IDEMPOTENCY_KEY_REUSED.
    const reused = await sg.decide(p.id, 1, { ...body, decision: 'REJECTED' }, key);
    expect(reused.status).toBe(422);
    expect((await json(reused)).code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('TC-IDEM-02 concurrent retries with one key: a single decision and identical responses', async () => {
    const p = await sg.proposed(projectId);
    const key = idemKey();
    const body = { contentHash: p.versions[0].contentHash };
    const results = await Promise.all([1, 2, 3].map(() => sg.decide(p.id, 1, body, key)));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    const ids = new Set(await Promise.all(results.map(async (r) => (await json(r)).approvalId)));
    expect(ids.size).toBe(1);
    expect(await t.db.raw.collection('approvals').countDocuments({ changeRequestId: p.id })).toBe(
      1,
    );
  });

  it('BR-014 approvals are insert-only: the repository exposes no update/delete', async () => {
    const { createScopeGuardRepository } = await import('../src/modules/scope-guard/repository');
    const repo = createScopeGuardRepository(t.db);
    const names = Object.keys(repo).filter((k) => /approval/i.test(k));
    expect(names.sort()).toEqual(['insertApproval', 'listApprovals']);
  });
});

describe('FR-026 / FR-029 revise, withdraw, supersede', () => {
  it('TC-013.3 AC-013.3 withdraw: PROPOSED → WITHDRAWN; it authorises nothing; audited', async () => {
    const p = await sg.proposed(projectId);
    const res = await sg.withdraw(p.id, 1);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.versions[0].state).toBe('WITHDRAWN');
    expect(body.status).toBe('WITHDRAWN');
    expect(body.openVersionNumber).toBeNull();
    expect((await sg.withdraw(p.id, 1)).status).toBe(409);
    expect(await auditActions(p.id)).toContain('cr.version.withdrawn');
  });

  it('TC-013.1 AC-013.1 a new version is a DRAFT copy of the latest; history kept', async () => {
    const p = await sg.proposed(projectId);
    await sg.decide(p.id, 1, {
      decision: 'CLARIFICATION_REQUESTED',
      contentHash: p.versions[0].contentHash,
    });
    const res = await sg.newVersion(p.id);
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.versions.map((v: { state: string }) => v.state)).toEqual([
      'CLARIFICATION_REQUESTED',
      'DRAFT',
    ]);
    const [v1, v2] = body.versions;
    expect(v2).toMatchObject({
      number: 2,
      title: v1.title,
      acceptanceCriteria: v1.acceptanceCriteria,
      contentHash: null,
      decision: null,
      proposedAt: null,
    });
    expect(v1.decision.decision).toBe('CLARIFICATION_REQUESTED');
    expect(body).toMatchObject({ openVersionNumber: 2, latestVersionNumber: 2, status: 'DRAFT' });
    await expectStatusConsistent(p.id);
  });

  it('TC-013.2 AC-013.2 BR-009 a second open version → 409', async () => {
    const draft = await sg.cr(projectId);
    expect((await sg.newVersion(draft.id)).status).toBe(409);
    const proposed = await sg.proposed(projectId);
    expect((await sg.newVersion(proposed.id)).status).toBe(409);
  });

  it('TC-012.6 AC-012.6 BR-013 approving v2 supersedes v1; REVISING while v2 is drafted', async () => {
    const approved = await sg.approved(projectId);
    const v2 = await json(await sg.newVersion(approved.id));
    expect(v2.status).toBe('REVISING');
    const edited = await json(
      await sg.editDraft(approved.id, 2, { confirmedEffortMinutes: 600 }, v2.rowVersion),
    );
    const proposed = await json(await sg.propose(approved.id, 2, edited.rowVersion));
    expect(proposed.status).toBe('AWAITING_DECISION');
    const res = await json(
      await sg.decide(approved.id, 2, { contentHash: proposed.versions[1].contentHash }),
    );
    expect(res.supersededVersion).toBe(1);
    expect(res.changeRequest.versions.map((v: { state: string }) => v.state)).toEqual([
      'SUPERSEDED',
      'APPROVED',
    ]);
    expect(res.changeRequest.approvedVersionNumber).toBe(2);
    await expectStatusConsistent(approved.id);
  });

  it('lifecycle example 4: v2 rejected keeps v1 as the authorised version (CR stays APPROVED)', async () => {
    const approved = await sg.approved(projectId);
    const v2 = await json(await sg.newVersion(approved.id));
    const proposed = await json(await sg.propose(approved.id, 2, v2.rowVersion));
    const res = await json(
      await sg.decide(approved.id, 2, {
        decision: 'REJECTED',
        contentHash: proposed.versions[1].contentHash,
      }),
    );
    expect(res.changeRequest.versions.map((v: { state: string }) => v.state)).toEqual([
      'APPROVED',
      'REJECTED',
    ]);
    expect(res.changeRequest).toMatchObject({ status: 'APPROVED', approvedVersionNumber: 1 });
  });

  it('a revision draft can be discarded (v1 cannot); audited', async () => {
    const p = await sg.proposed(projectId);
    await sg.withdraw(p.id, 1);
    await sg.newVersion(p.id);
    expect((await sg.ops.del(`/change-requests/${p.id}/versions/1`)).status).toBe(409);
    const res = await sg.ops.del(`/change-requests/${p.id}/versions/2`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({
      latestVersionNumber: 1,
      openVersionNumber: null,
      status: 'WITHDRAWN',
    });
    expect(await auditActions(p.id)).toContain('cr.version.discarded');
    const lone = await sg.cr(projectId);
    expect((await sg.ops.del(`/change-requests/${lone.id}/versions/1`)).status).toBe(409);
  });
});

describe('FR-028 / FR-027 / FR-032 read models', () => {
  it('TC-014.1 AC-014.1 detail shows versions, decisions and audit history in order', async () => {
    const approved = await sg.approved(projectId);
    const detail = await sg.get(approved.id);
    expect(detail.decisions).toHaveLength(1);
    expect(detail.decisions[0]).toMatchObject({
      versionNumber: 1,
      decision: 'APPROVED',
      clientDecisionMakerName: 'S. Das',
      channel: 'EMAIL',
      evidenceNote: 'Email "Re: Proposal CR-1 v1"',
    });
    expect(detail.history.map((h: { action: string }) => h.action)).toEqual([
      'cr.created',
      'cr.version.proposed',
      'cr.decision.recorded',
    ]);
  });

  it('TC-014.2 AC-014.2 compare two versions field by field', async () => {
    const approved = await sg.approved(projectId);
    const v2 = await json(await sg.newVersion(approved.id));
    await sg.editDraft(
      approved.id,
      2,
      { confirmedEffortMinutes: 600, acceptanceCriteria: ['OTP arrives within 30 s'] },
      v2.rowVersion,
    );
    const diff = await json(await sg.ops.get(`/change-requests/${approved.id}/diff?from=1&to=2`));
    const changed = diff.fields
      .filter((f: { changed: boolean }) => f.changed)
      .map((f: { field: string }) => f.field);
    expect(changed).toEqual(['pricing', 'confirmedEffortMinutes', 'acceptanceCriteria']);
    expect(diff.fields[0]).toMatchObject({
      field: 'pricing',
      from: { priceMinor: '1350000' },
      to: { priceMinor: '1500000' },
    });
    expect((await sg.ops.get(`/change-requests/${approved.id}/diff?from=1&to=9`)).status).toBe(404);
    expect((await sg.ops.get(`/change-requests/${approved.id}/diff?from=0&to=1`)).status).toBe(422);
  });

  it('TC-011.3 AC-011.3 summary carries scope, criteria, assumptions, price, hash and the disclaimer', async () => {
    const p = await sg.proposed(projectId);
    const s = await json(await sg.ops.get(`/change-requests/${p.id}/versions/1/summary`));
    expect(s).toMatchObject({
      changeRequestKey: p.key,
      projectName: 'Online ordering app',
      clientName: 'Das Sweets Pvt Ltd',
      supplier: { legalName: 'Riya Sen' },
      disclaimer:
        'This is an estimate based on the listed assumptions, not a guarantee of actual effort.',
    });
    expect(s.version.contentHash).toBe(p.versions[0].contentHash);
    expect(s.version.pricing.priceMinor).toBe('1350000');
  });

  it('TC-027.1 AC-027.1 queue lists only AWAITING_DECISION / NEEDS_REVISION; filters; cursor', async () => {
    const fresh = await t.register();
    const f = scopeGuard(t, fresh);
    const { project } = await f.project();
    const awaiting = await f.proposed(project.id);
    t.clock.advance(1000);
    const needs = await f.proposed(project.id);
    await f.decide(needs.id, 1, {
      decision: 'CLARIFICATION_REQUESTED',
      contentHash: needs.versions[0].contentHash,
    });
    t.clock.advance(1000);
    await f.cr(project.id); // DRAFT — not in the queue
    await f.approved(project.id); // APPROVED — not in the queue
    const queue = await json(await f.ops.get('/change-requests'));
    expect(queue.items.map((i: { id: string }) => i.id)).toEqual([awaiting.id, needs.id]);
    expect(queue.items[0]).toMatchObject({
      status: 'AWAITING_DECISION',
      currentVersionNumber: 1,
      currentVersionState: 'PROPOSED',
      priceMinor: '1350000',
      projectName: 'Online ordering app',
    });
    const onlyNeeds = await json(await f.ops.get('/change-requests?status=NEEDS_REVISION'));
    expect(onlyNeeds.items.map((i: { id: string }) => i.id)).toEqual([needs.id]);
    const page1 = await json(await f.ops.get('/change-requests?limit=1'));
    const page2 = await json(
      await f.ops.get(`/change-requests?limit=1&cursor=${encodeURIComponent(page1.nextCursor)}`),
    );
    expect([page1.items[0].id, page2.items[0].id]).toEqual([awaiting.id, needs.id]);
    expect((await f.ops.get('/change-requests?status=BOGUS')).status).toBe(422);
    t.clock.set('2026-10-16T09:00:00.000Z');
  });

  it('project CR list: newest first, status filter', async () => {
    const fresh = await t.register();
    const f = scopeGuard(t, fresh);
    const { project } = await f.project();
    const a = await f.cr(project.id);
    const b = await f.proposed(project.id);
    const all = await json(await f.ops.get(`/projects/${project.id}/change-requests`));
    expect(all.items.map((i: { id: string }) => i.id)).toEqual([b.id, a.id]);
    const drafts = await json(
      await f.ops.get(`/projects/${project.id}/change-requests?status=DRAFT`),
    );
    expect(drafts.items.map((i: { id: string }) => i.id)).toEqual([a.id]);
  });
});

describe('ADR-0012 indexes and validators', () => {
  it('unique approvals per version, unique CR number per project, queue index', async () => {
    const appr = await t.db.raw.collection('approvals').indexes();
    expect(appr.find((i) => i.name === 'workspace_cr_version_unique')?.unique).toBe(true);
    const crs = await t.db.raw.collection('changeRequests').indexes();
    expect(crs.find((i) => i.name === 'workspace_project_number_unique')?.unique).toBe(true);
    expect(crs.map((i) => i.name)).toContain('workspace_status_recent');
    const gens = await t.db.raw.collection('aiGenerations').indexes();
    expect(gens.find((i) => i.name === 'expiresAt_ttl')?.expireAfterSeconds).toBe(0);
  });

  it('the validator refuses a version state outside the lifecycle', async () => {
    const cr = await sg.cr(projectId);
    await expect(
      t.db.raw
        .collection('changeRequests')
        .updateOne({ _id: cr.id as never }, { $set: { 'versions.0.state': 'SIGNED_OFF' } }),
    ).rejects.toThrow(/Document failed validation/);
  });

  it('draft edits go through the transition guard: a concurrent propose makes the edit 409/412', async () => {
    const cr = await sg.cr(projectId);
    const edited = await json(await sg.editDraft(cr.id, 1, completeDraft(), 1));
    const [edit, prop] = await Promise.all([
      sg.editDraft(cr.id, 1, { title: 'Racing edit' }, edited.rowVersion),
      sg.propose(cr.id, 1, edited.rowVersion),
    ]);
    const statuses = [edit.status, prop.status].sort();
    expect(statuses[0]).toBe(200);
    expect([409, 412]).toContain(statuses[1]);
    const doc = await crDoc(cr.id);
    // Whatever won, a proposed version's hash always matches its stored content.
    if (doc?.versions[0].state === 'PROPOSED') {
      expect(versionContentHash(cr.id, doc.versions[0])).toBe(doc.versions[0].contentHash);
    }
  });
});

describe('BR-029 archived projects are read-only for change requests', () => {
  it('edits, proposes, decisions and new versions → 409 once the project is archived', async () => {
    const p = await sg.ops.project((await sg.ops.client()).id, { hourlyRateMinor: '150000' });
    const proposed = await sg.proposed(p.id);
    const draft = await sg.cr(p.id);
    await sg.ops.post(`/projects/${p.id}/archive`);
    const results = await Promise.all([
      sg.editDraft(draft.id, 1, { title: 'Late' }, 1),
      sg.decide(proposed.id, 1, { contentHash: proposed.versions[0].contentHash }),
      sg.withdraw(proposed.id, 1),
    ]);
    expect(results.map((r) => r.status)).toEqual([409, 409, 409]);
    expect((await sg.get(proposed.id)).readOnly).toBe(true);
  });
});
