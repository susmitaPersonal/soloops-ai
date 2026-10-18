import type { SessionResponse } from '@soloops/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../src/platform/ids';
import { createTestContext, json, type TestContext } from './helpers';

/**
 * SEC-004 / SEC-011: membership and role are resolved on every request, never cached in the
 * session. FR-004 (member management API) does not exist yet, so memberships are changed directly
 * in the database here; the behaviour under test is the request-time check in requireMembership.
 */
let t: TestContext;
let owner: Awaited<ReturnType<TestContext['register']>>;

beforeAll(async () => {
  t = await createTestContext();
  owner = await t.register({ name: 'Workspace owner' });
});
afterAll(async () => {
  await t.cleanup();
});

const wsPath = (id: string) => `/api/v1/workspaces/${id}`;

async function currentRowVersion(workspaceId: string): Promise<number> {
  const doc = await t.db.raw.collection('workspaces').findOne({ _id: workspaceId as never });
  return doc?.rowVersion as number;
}

describe('TC-TEN-04 membership changes take effect on the next request (SEC-004, SEC-011)', () => {
  it('removing a membership revokes workspace access immediately, without ending the session', async () => {
    const member = await t.addMember(owner.workspaceId);
    expect(
      (await t.request('GET', wsPath(owner.workspaceId), { cookie: member.cookie })).status,
    ).toBe(200);

    await t.db.raw
      .collection('memberships')
      .deleteOne({ workspaceId: owner.workspaceId, userId: member.userId });

    const get = await t.request('GET', wsPath(owner.workspaceId), { cookie: member.cookie });
    expect(get.status).toBe(404);
    expect((await json(get)).code).toBe('NOT_FOUND');
    const patch = await t.request('PATCH', wsPath(owner.workspaceId), {
      cookie: member.cookie,
      headers: { 'If-Match': `"${await currentRowVersion(owner.workspaceId)}"` },
      body: { taxLabel: 'Gone' },
    });
    expect(patch.status).toBe(404);

    // The session itself is still valid; the removed workspace is no longer listed.
    const me = await t.request('GET', '/api/v1/auth/me', { cookie: member.cookie });
    expect(me.status).toBe(200);
    const ids = ((await json(me)) as SessionResponse).workspaces.map((w) => w.id);
    expect(ids).not.toContain(owner.workspaceId);
    expect(ids).toEqual([member.workspaceId]);
  });

  it('a role downgrade OWNER → MEMBER turns the next owner-only call into 403', async () => {
    const coOwner = await t.addMember(owner.workspaceId, 'OWNER');
    const first = await t.request('PATCH', wsPath(owner.workspaceId), {
      cookie: coOwner.cookie,
      headers: { 'If-Match': `"${await currentRowVersion(owner.workspaceId)}"` },
      body: { taxLabel: 'GST' },
    });
    expect(first.status).toBe(200);

    await t.db.raw
      .collection('memberships')
      .updateOne(
        { workspaceId: owner.workspaceId, userId: coOwner.userId },
        { $set: { role: 'MEMBER' } },
      );

    const version = await currentRowVersion(owner.workspaceId);
    const second = await t.request('PATCH', wsPath(owner.workspaceId), {
      cookie: coOwner.cookie,
      headers: { 'If-Match': `"${version}"` },
      body: { taxLabel: 'VAT' },
    });
    expect(second.status).toBe(403);
    expect((await json(second)).code).toBe('FORBIDDEN');
    const get = await t.request('GET', wsPath(owner.workspaceId), { cookie: coOwner.cookie });
    expect((await json(get)).myRole).toBe('MEMBER');
    const doc = await t.db.raw
      .collection('workspaces')
      .findOne({ _id: owner.workspaceId as never });
    expect(doc?.taxLabel).toBe('GST');
    expect(doc?.rowVersion).toBe(version);
  });
});

describe('TC-TEN-05 one user in two workspaces gets each workspace’s own role (SEC-011)', () => {
  it('is OWNER of their own workspace and MEMBER of another; permissions follow the workspace', async () => {
    const user = await t.register({ name: 'Two-workspace user' });
    const now = t.clock.now();
    await t.db.tenant('memberships', owner.workspaceId).insertOne({
      _id: newId(),
      userId: user.userId,
      role: 'MEMBER',
      createdAt: now,
      updatedAt: now,
    });

    const me = (await json(
      await t.request('GET', '/api/v1/auth/me', { cookie: user.cookie }),
    )) as SessionResponse;
    const roles = Object.fromEntries(me.workspaces.map((w) => [w.id, w.role]));
    expect(roles).toEqual({ [user.workspaceId]: 'OWNER', [owner.workspaceId]: 'MEMBER' });

    const own = await t.request('PATCH', wsPath(user.workspaceId), {
      cookie: user.cookie,
      headers: { 'If-Match': '"1"' },
      body: { taxLabel: 'Mine' },
    });
    expect(own.status).toBe(200);

    const before = await currentRowVersion(owner.workspaceId);
    const other = await t.request('PATCH', wsPath(owner.workspaceId), {
      cookie: user.cookie,
      headers: { 'If-Match': `"${before}"` },
      body: { taxLabel: 'Not mine' },
    });
    expect(other.status).toBe(403);
    expect(await currentRowVersion(owner.workspaceId)).toBe(before);
    const read = await json(
      await t.request('GET', wsPath(owner.workspaceId), { cookie: user.cookie }),
    );
    expect(read.myRole).toBe('MEMBER');
  });
});
