import { coreOps } from './core-ops-fixtures';
import { json, type TestContext } from './helpers';

type User = Awaited<ReturnType<TestContext['register']>>;

let keySeq = 0;
/** A fresh, valid Idempotency-Key. */
export const idemKey = () =>
  `test-key-${Date.now()}-${(keySeq += 1)}-${Math.random().toString(36).slice(2, 10)}`;

/** A complete draft body that satisfies BR-007 for TIME pricing. */
export const completeDraft = (overrides: Record<string, unknown> = {}) => ({
  title: 'WhatsApp OTP login',
  clarifiedDescription: 'Add phone login with OTP over WhatsApp alongside email login.',
  inScope: ['OTP endpoints', 'Login screen option'],
  outOfScope: ['SMS fallback'],
  acceptanceCriteria: ['OTP arrives within 30 s', 'OTP expires after 5 min'],
  dependencies: ['Client WhatsApp Business account'],
  assumptions: ['Phone numbers already verified'],
  risks: [{ description: 'Provider approval delay', severity: 'MEDIUM' }],
  effort: { lowMinutes: 360, likelyMinutes: 480, highMinutes: 840 },
  confirmedEffortMinutes: 540,
  pricing: { mode: 'TIME' },
  timelineImpact: '3–4 working days',
  ...overrides,
});

/**
 * Scope Guard fixtures: everything goes through the real API (validation, BR-029, audit), so
 * fixtures can never create states the product could not reach.
 */
export function scopeGuard(t: TestContext, user: User) {
  const ops = coreOps(t, user);

  async function ok(res: Response, expected: number, what: string) {
    if (res.status !== expected) throw new Error(`${what}: ${res.status} ${await res.text()}`);
    return json(res);
  }

  const sg = {
    ops,
    /** A project with a rate (₹1,500/h) and one baselined requirement REQ-1. */
    async project() {
      const client = await ops.client();
      const project = await ops.project(client.id, { hourlyRateMinor: '150000' });
      const requirement = await ops.requirement(project.id, { title: 'Customer login' });
      await ops.baseline(project.id);
      return { client, project, requirement };
    },
    createCr: (projectId: string, body: Record<string, unknown> = {}) =>
      ops.post(`/projects/${projectId}/change-requests`, {
        rawRequestText: 'Can you also add login with WhatsApp OTP? Need it before Diwali sale.',
        sourceChannel: 'CHAT',
        requestedByName: 'S. Das',
        receivedOn: '2026-10-12',
        ...body,
      }),
    async cr(projectId: string, body: Record<string, unknown> = {}) {
      return ok(await sg.createCr(projectId, body), 201, 'create CR');
    },
    get: async (crId: string) => ok(await ops.get(`/change-requests/${crId}`), 200, 'get CR'),
    editDraft: (crId: string, n: number, body: unknown, rowVersion: number | null) =>
      ops.patch(`/change-requests/${crId}/versions/${n}`, body, rowVersion),
    propose: (crId: string, n: number, rowVersion: number | null, key?: string) =>
      t.request('POST', `${ops.base}/change-requests/${crId}/versions/${n}/propose`, {
        cookie: user.cookie,
        headers: {
          ...(rowVersion === null ? {} : { 'If-Match': `"${rowVersion}"` }),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
      }),
    decide: (
      crId: string,
      n: number,
      body: Record<string, unknown>,
      key: string | null = idemKey(),
    ) =>
      t.request('POST', `${ops.base}/change-requests/${crId}/versions/${n}/decisions`, {
        cookie: user.cookie,
        body: {
          decision: 'APPROVED',
          clientDecisionMakerName: 'S. Das',
          decidedOn: '2026-10-14',
          channel: 'EMAIL',
          evidenceNote: 'Email "Re: Proposal CR-1 v1"',
          ...body,
        },
        headers: key ? { 'Idempotency-Key': key } : {},
      }),
    withdraw: (crId: string, n: number) =>
      ops.post(`/change-requests/${crId}/versions/${n}/withdraw`),
    newVersion: (crId: string) => ops.post(`/change-requests/${crId}/versions`),
    analyze: (crId: string, n: number) =>
      ops.post(`/change-requests/${crId}/versions/${n}/analyze`),

    /** CR with a complete draft v1, proposed. Returns the CR DTO after propose. */
    async proposed(
      projectId: string,
      draft: Record<string, unknown> = {},
      crBody: Record<string, unknown> = {},
    ) {
      const cr = await sg.cr(projectId, crBody);
      const edited = await ok(
        await sg.editDraft(cr.id, 1, completeDraft(draft), cr.rowVersion),
        200,
        'edit draft',
      );
      return ok(await sg.propose(cr.id, 1, edited.rowVersion), 200, 'propose');
    },
    /** CR whose v1 is APPROVED. */
    async approved(projectId: string, draft: Record<string, unknown> = {}) {
      const p = await sg.proposed(projectId, draft);
      const hash = p.versions[0].contentHash;
      const res = await ok(await sg.decide(p.id, 1, { contentHash: hash }), 201, 'decide');
      return res.changeRequest;
    },
  };
  return sg;
}
