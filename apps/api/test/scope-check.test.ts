import { afterEach, describe, expect, it } from 'vitest';
import { validSuggestion, type ChatModelProvider } from '../src/modules/ai';
import type { CompletionRequest } from '../src/modules/ai/providers/types';
import { createTestContext, json, type TestContext } from './helpers';
import { completeDraft, scopeGuard } from './scope-guard-fixtures';

/**
 * FR-021 scope check (cr-analysis@2): the AI compares a client request with the AGREED
 * requirements; the server keeps only evidence that names real requirements and downgrades
 * unsupported verdicts; a person confirms the verdict, which is then bound by the version hash.
 */
const contexts: TestContext[] = [];
afterEach(async () => {
  while (contexts.length) await contexts.pop()?.cleanup();
});

function scripted(body: (req: CompletionRequest) => unknown) {
  const calls: CompletionRequest[] = [];
  const provider: ChatModelProvider = {
    id: 'mock',
    model: 'scripted-model',
    health: async () => 'ok',
    async complete(req) {
      calls.push(req);
      return { text: JSON.stringify(body(req)), model: 'scripted-model' };
    },
  };
  return { provider, calls };
}

const scope = (
  verdict: string,
  evidence: { requirementKey: string; relation: string; explanation: string }[],
) => ({
  scopeAssessment: {
    verdict,
    rationale: 'Scripted rationale.',
    baselineSufficient: true,
    evidence,
  },
});

async function setup(provider?: ChatModelProvider) {
  const t = await createTestContext(
    provider ? {} : { AI_PROVIDER: 'none' },
    provider ? { aiProvider: provider, aiSleep: async () => undefined } : {},
  );
  contexts.push(t);
  const owner = await t.register({ name: 'Riya Sen' });
  const sg = scopeGuard(t, owner);
  const p = await sg.project(); // REQ-1 "Customer login", baselined (agreed)
  if (provider) {
    const res = await t.request('PUT', `${sg.ops.base}/ai-enablement`, {
      cookie: owner.cookie,
      body: { enabled: true, acknowledgeDisclosure: true },
    });
    expect(res.status).toBe(200);
  }
  return { t, owner, sg, ...p };
}

const count = (t: TestContext, name: string) => t.db.raw.collection(name).countDocuments({});

describe('FR-021 scope check through the API (scripted provider, real MongoDB)', () => {
  it('IT-SCOPE-01 a supported verdict comes back with evidence resolved to the real requirement', async () => {
    const s = scripted(() =>
      validSuggestion('REQ-1', {
        ...scope('LIKELY_ALREADY_COVERED', [
          {
            requirementKey: 'REQ-1',
            relation: 'COVERS',
            explanation: 'REQ-1 already defines login.',
          },
        ]),
      }),
    );
    const { t, sg, project, requirement } = await setup(s.provider);
    const cr = await sg.cr(project.id);
    const res = await sg.analyze(cr.id, 1);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.suggestion.scope).toEqual({
      verdict: 'LIKELY_ALREADY_COVERED',
      modelVerdict: 'LIKELY_ALREADY_COVERED',
      rationale: 'Scripted rationale.',
      baselineSufficient: true,
      evidence: [
        {
          requirementId: requirement.id,
          requirementKey: 'REQ-1',
          requirementTitle: 'Customer login',
          relation: 'COVERS',
          explanation: 'REQ-1 already defines login.',
        },
      ],
      adjustments: [],
    });
    const [gen] = await t.db.raw.collection('aiGenerations').find({}).toArray();
    expect(gen).toMatchObject({
      promptVersion: 'cr-analysis@2',
      schemaVersion: 'cr-analysis-output@2',
    });
  });

  it('IT-SCOPE-02 BR-001 an invented requirement is removed and the verdict falls back to UNCLEAR; nothing changes state', async () => {
    const s = scripted(() =>
      validSuggestion('REQ-1', {
        ...scope('LIKELY_ALREADY_COVERED', [
          { requirementKey: 'REQ-42', relation: 'COVERS', explanation: 'Invented.' },
        ]),
      }),
    );
    const { t, sg, project } = await setup(s.provider);
    const cr = await sg.cr(project.id);
    const body = await json(await sg.analyze(cr.id, 1));
    expect(body.suggestion.scope.verdict).toBe('UNCLEAR');
    expect(body.suggestion.scope.modelVerdict).toBe('LIKELY_ALREADY_COVERED');
    expect(body.suggestion.scope.evidence).toEqual([]);
    expect(body.suggestion.scope.adjustments.join(' ')).toContain('REQ-42 does not exist');
    // Advisory only: the draft is untouched and no approval, task or invoice exists.
    const after = await sg.get(cr.id);
    expect(after.versions[0]).toMatchObject({
      state: 'DRAFT',
      scopeVerdict: null,
      questionsForClient: [],
    });
    expect(await count(t, 'approvals')).toBe(0);
    expect(await count(t, 'tasks')).toBe(0);
    expect(await count(t, 'invoices')).toBe(0);
  });

  it('IT-SCOPE-03 a requirement that is not baselined cannot show agreed scope, and the prompt says so', async () => {
    const s = scripted(() =>
      validSuggestion('REQ-2', {
        ...scope('LIKELY_ALREADY_COVERED', [
          { requirementKey: 'REQ-2', relation: 'COVERS', explanation: 'Draft idea covers it.' },
        ]),
      }),
    );
    const { sg, project } = await setup(s.provider);
    await sg.ops.requirement(project.id, { title: 'Wishlist (not agreed yet)' }); // REQ-2, draft
    const cr = await sg.cr(project.id);
    const body = await json(await sg.analyze(cr.id, 1));
    expect(body.suggestion.scope.evidence[0]).toMatchObject({
      requirementKey: 'REQ-2',
      relation: 'RELATED',
    });
    expect(body.suggestion.scope.verdict).toBe('UNCLEAR');
    expect(s.calls[0]?.user).toContain('REQ-1 [agreed]: Customer login');
    expect(s.calls[0]?.user).toContain('REQ-2 [draft]: Wishlist');
  });
});

describe('FR-021 already-covered requests and effort (BR-026, BR-027)', () => {
  it('IT-SCOPE-07 zero extra effort gives no estimate and no indicative cost', async () => {
    const s = scripted(() =>
      validSuggestion('REQ-1', {
        effortHours: { low: 0, likely: 0, high: 0 },
        ...scope('LIKELY_ALREADY_COVERED', [
          { requirementKey: 'REQ-1', relation: 'COVERS', explanation: 'REQ-1 already has it.' },
        ]),
      }),
    );
    const { sg, project } = await setup(s.provider);
    const cr = await sg.cr(project.id);
    const body = await json(await sg.analyze(cr.id, 1));
    expect(body.suggestion.effort).toBeNull();
    expect(body.indicativeCost).toBeNull();
    expect(body.suggestion.scope.verdict).toBe('LIKELY_ALREADY_COVERED');
  });
});

describe('FR-021 confirmed scope verdict and client questions on the version (BR-006, BR-008)', () => {
  it('IT-SCOPE-04 the person-confirmed verdict and questions are saved, proposed under the hash and shown in the summary', async () => {
    const { sg, project } = await setup(); // AI off: the manual path works on its own
    const cr = await sg.cr(project.id);
    const edited = await json(
      await sg.editDraft(
        cr.id,
        1,
        {
          ...completeDraft(),
          scopeVerdict: 'NEW_SCOPE',
          questionsForClient: ['Which OTP provider do you already use?', 'Is SMS fallback needed?'],
        },
        cr.rowVersion,
      ),
    );
    expect(edited.versions[0]).toMatchObject({
      scopeVerdict: 'NEW_SCOPE',
      questionsForClient: ['Which OTP provider do you already use?', 'Is SMS fallback needed?'],
    });
    const proposed = await json(await sg.propose(cr.id, 1, edited.rowVersion));
    const hash = proposed.versions[0].contentHash;
    // That the verdict and questions are inside the hash is proven in version-rules.test.ts
    // (UT-HASH-SC-01/02): a different CR would differ anyway, because its ID is hashed too.

    // Immutable after propose (BR-006): changing the verdict is refused.
    const change = await sg.editDraft(cr.id, 1, { scopeVerdict: 'UNCLEAR' }, proposed.rowVersion);
    expect(change.status).toBe(409);

    const summary = await json(await sg.ops.get(`/change-requests/${cr.id}/versions/1/summary`));
    expect(summary.version).toMatchObject({
      scopeVerdict: 'NEW_SCOPE',
      questionsForClient: ['Which OTP provider do you already use?', 'Is SMS fallback needed?'],
    });
    const decided = await sg.decide(cr.id, 1, { contentHash: hash });
    expect(decided.status).toBe(201);
  });

  it('IT-SCOPE-05 invalid verdicts and too many questions are refused with field errors', async () => {
    const { sg, project } = await setup();
    const cr = await sg.cr(project.id);
    const bad = await sg.editDraft(cr.id, 1, { scopeVerdict: 'PROBABLY_FINE' }, cr.rowVersion);
    expect(bad.status).toBe(422);
    const many = await sg.editDraft(
      cr.id,
      1,
      { questionsForClient: Array.from({ length: 21 }, (_, i) => `Question ${i}?`) },
      cr.rowVersion,
    );
    expect(many.status).toBe(422);
  });

  it('IT-SCOPE-06 versions stored before migration 0006 (no new fields) still read, diff and keep their hash', async () => {
    const { t, sg, project } = await setup();
    const p = await sg.proposed(project.id);
    const hash = p.versions[0].contentHash;
    // Simulate a pre-0006 document: the optional fields are absent.
    await t.db.raw
      .collection('changeRequests')
      .updateOne(
        { _id: p.id as never },
        { $unset: { 'versions.0.questionsForClient': '', 'versions.0.scopeVerdict': '' } },
      );
    const read = await sg.get(p.id);
    expect(read.versions[0]).toMatchObject({
      questionsForClient: [],
      scopeVerdict: null,
      contentHash: hash,
    });
    // The stored hash still matches, so the recorded client decision binds as before.
    const decided = await sg.decide(p.id, 1, { contentHash: hash });
    expect(decided.status).toBe(201);
  });
});
