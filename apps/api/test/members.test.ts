import { afterEach, describe, expect, it } from 'vitest';
import { createTestContext, json, type TestContext } from './helpers';
import { idemKey, scopeGuard } from './scope-guard-fixtures';

/**
 * FR-004 workspace members (US-003, S-12): owners add EXISTING users by email as MEMBER and
 * remove members; the last owner can never be removed. Real MongoDB replica set, real API.
 */
const contexts: TestContext[] = [];
afterEach(async () => {
  while (contexts.length) await contexts.pop()?.cleanup();
});

async function setup() {
  const t = await createTestContext();
  contexts.push(t);
  const owner = await t.register({ name: 'Riya Sen' });
  const ws = `/api/v1/workspaces/${owner.workspaceId}`;
  const call = (
    user: { cookie: string },
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) =>
    t.request(method, `${ws}${path}`, {
      cookie: user.cookie,
      ...(body === undefined ? {} : { body }),
      ...(headers ? { headers } : {}),
    });
  const add = (by: { cookie: string }, email: string) => call(by, 'POST', '/members', { email });
  const remove = (by: { cookie: string }, userId: string) =>
    call(by, 'DELETE', `/members/${userId}`);
  const list = async (by: { cookie: string }) =>
    (await json(await call(by, 'GET', '/members'))).items;
  const audit = (action: string) =>
    t.db.raw.collection('auditEvents').find({ workspaceId: owner.workspaceId, action }).toArray();
  return { t, owner, ws, call, add, remove, list, audit };
}

describe('FR-004 add members (US-003)', () => {
  it('TC-003.1 AC-003.1 an owner adds an existing user by email as MEMBER; they get access; audited', async () => {
    const { t, owner, call, add, list, audit } = await setup();
    const colleague = await t.register({ name: 'Arjun Das' });
    // Before: the colleague cannot see the workspace (404, no existence leak).
    expect((await call(colleague, 'GET', '/clients')).status).toBe(404);

    const res = await add(owner, colleague.email);
    expect(res.status).toBe(201);
    expect(await json(res)).toMatchObject({
      userId: colleague.userId,
      name: 'Arjun Das',
      email: colleague.email,
      role: 'MEMBER',
    });
    expect((await call(colleague, 'GET', '/clients')).status).toBe(200);
    expect(await list(colleague)).toEqual([
      expect.objectContaining({ userId: owner.userId, role: 'OWNER' }),
      expect.objectContaining({ userId: colleague.userId, role: 'MEMBER' }),
    ]);
    const events = await audit('member.added');
    expect(events.find((e) => e.data.userId === colleague.userId)).toMatchObject({
      actorUserId: owner.userId,
      data: { userId: colleague.userId, role: 'MEMBER' },
    });
  });

  it('TC-003.2 AC-003.2 a MEMBER cannot add or remove members (403); nothing changes', async () => {
    const { t, owner, add, remove, list } = await setup();
    const member = await t.register({ name: 'Member' });
    const outsider = await t.register({ name: 'Outsider' });
    expect((await add(owner, member.email)).status).toBe(201);
    const tryAdd = await add(member, outsider.email);
    expect(tryAdd.status).toBe(403);
    expect((await json(tryAdd)).code).toBe('FORBIDDEN');
    const tryRemove = await remove(member, owner.userId);
    expect(tryRemove.status).toBe(403);
    expect((await json(tryRemove)).code).toBe('FORBIDDEN');
    expect((await list(owner)).map((m: { userId: string }) => m.userId)).toEqual([
      owner.userId,
      member.userId,
    ]);
  });

  it('TC-003.3 an email without a SoloOps account is a field error; no membership is created', async () => {
    const { t, owner, add } = await setup();
    const res = await add(owner, 'nobody-registered@example.com');
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.errors).toEqual([
      expect.objectContaining({
        path: 'email',
        message: expect.stringContaining('register first'),
      }),
    ]);
    expect(
      await t.db.raw.collection('memberships').countDocuments({ workspaceId: owner.workspaceId }),
    ).toBe(1);
  });

  it('TC-003.4 adding an existing member (or yourself) is refused; emails are matched case-insensitively', async () => {
    const { t, owner, add } = await setup();
    const colleague = await t.register({ name: 'Arjun Das' });
    expect((await add(owner, colleague.email.toUpperCase())).status).toBe(201);
    const again = await add(owner, colleague.email);
    expect(again.status).toBe(422);
    expect((await json(again)).errors[0].message).toContain('already a member');
    expect((await add(owner, owner.email)).status).toBe(422);
    expect((await add(owner, 'not-an-email')).status).toBe(422);
  });

  it('TC-003.5 concurrent adds of the same user create exactly one membership', async () => {
    const { t, owner, add } = await setup();
    const colleague = await t.register({ name: 'Arjun Das' });
    const results = await Promise.all([add(owner, colleague.email), add(owner, colleague.email)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(
      await t.db.raw
        .collection('memberships')
        .countDocuments({ workspaceId: owner.workspaceId, userId: colleague.userId }),
    ).toBe(1);
  });
});

describe('FR-004 remove members', () => {
  it('TC-003.6 SEC-004 a removed member loses access on the next request; audited', async () => {
    const { t, owner, call, add, remove, audit } = await setup();
    const colleague = await t.register({ name: 'Arjun Das' });
    await add(owner, colleague.email);
    expect((await call(colleague, 'GET', '')).status).toBe(200);
    const res = await remove(owner, colleague.userId);
    expect(res.status).toBe(204);
    expect((await call(colleague, 'GET', '')).status).toBe(404);
    expect((await call(colleague, 'GET', '/clients')).status).toBe(404);
    expect(
      (await audit('member.removed')).find((e) => e.data.userId === colleague.userId),
    ).toMatchObject({
      actorUserId: owner.userId,
      data: { userId: colleague.userId, role: 'MEMBER' },
    });
    // The removed user keeps their own workspace.
    const me = await json(await t.request('GET', '/api/v1/auth/me', { cookie: colleague.cookie }));
    expect(me.workspaces).toEqual([expect.objectContaining({ id: colleague.workspaceId })]);
  });

  it('TC-003.7 the last owner can never be removed (409); with two owners one can be removed', async () => {
    const { t, owner, remove, list } = await setup();
    const last = await remove(owner, owner.userId);
    expect(last.status).toBe(409);
    expect((await json(last)).code).toBe('INVALID_STATE_TRANSITION');
    expect(await list(owner)).toEqual([
      expect.objectContaining({ userId: owner.userId, role: 'OWNER' }),
    ]);

    const coOwner = await t.addMember(owner.workspaceId, 'OWNER');
    expect((await remove(coOwner, owner.userId)).status).toBe(204);
    expect((await remove(coOwner, coOwner.userId)).status).toBe(409);
  });

  it('TC-003.8 two owners removing each other at the same time: exactly one succeeds, one owner remains', async () => {
    const { t, owner, remove } = await setup();
    const coOwner = await t.addMember(owner.workspaceId, 'OWNER');
    const results = await Promise.all([
      remove(owner, coOwner.userId),
      remove(coOwner, owner.userId),
    ]);
    const statuses = results.map((r) => r.status).sort();
    // One removal wins; the other either loses its own access (404) or meets the last-owner rule.
    expect(statuses.filter((s) => s === 204)).toHaveLength(1);
    expect(
      await t.db.raw
        .collection('memberships')
        .countDocuments({ workspaceId: owner.workspaceId, role: 'OWNER' }),
    ).toBe(1);
  });

  it('TC-003.9 an unknown, foreign or malformed user ID is 404', async () => {
    const { t, owner, remove } = await setup();
    const stranger = await t.register({ name: 'Stranger' });
    expect((await remove(owner, stranger.userId)).status).toBe(404);
    expect((await remove(owner, 'not-a-uuid')).status).toBe(404);
  });
});

describe('FR-004 team work keeps the owner-only financial safeguards (BR-023, E2E-WF-13 at API level)', () => {
  it('TC-003.10 a member added through the API logs work and drafts an invoice, but only the owner issues or voids it', async () => {
    const { t, owner, call, add } = await setup();
    const sg = scopeGuard(t, owner);
    const { project, requirement } = await sg.project();
    const member = await t.register({ name: 'Arjun Das' });
    expect((await add(owner, member.email)).status).toBe(201);

    const entry = await call(member, 'POST', `/projects/${project.id}/billable-entries`, {
      kind: 'TIME',
      workDate: '2026-10-12',
      minutes: 120,
      description: 'Login screen',
      scope: { type: 'BASELINE', requirementId: requirement.id },
    });
    expect(entry.status).toBe(201);
    const draft = await call(member, 'POST', '/invoices', {
      projectId: project.id,
      entryIds: [(await json(entry)).id],
    });
    expect(draft.status).toBe(201);
    const invoiceId = (await json(draft)).id;

    const memberIssue = await call(member, 'POST', `/invoices/${invoiceId}/issue`, undefined, {
      'Idempotency-Key': idemKey(),
    });
    expect(memberIssue.status).toBe(403);
    const ws = await t.db.raw.collection('workspaces').findOne({ _id: owner.workspaceId as never });
    expect(ws?.nextInvoiceNumber).toBe(1); // no number consumed

    const ownerIssue = await call(owner, 'POST', `/invoices/${invoiceId}/issue`, undefined, {
      'Idempotency-Key': idemKey(),
    });
    expect(ownerIssue.status).toBe(200);
    expect((await json(ownerIssue)).status).toBe('ISSUED');
    const memberVoid = await call(
      member,
      'POST',
      `/invoices/${invoiceId}/void`,
      { reason: 'Oops' },
      {
        'Idempotency-Key': idemKey(),
      },
    );
    expect(memberVoid.status).toBe(403);
    // Members cannot change settings or AI enablement either (SEC-011).
    expect((await call(member, 'PATCH', '', { taxLabel: 'X' }, { 'If-Match': '"1"' })).status).toBe(
      403,
    );
  });
});
