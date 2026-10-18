import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, json, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(async () => {
  await t.cleanup();
});

const validSettings = {
  name: 'Riya Sen Studio',
  defaultCurrency: 'INR',
  defaultHourlyRateMinor: '150000',
  taxLabel: 'GST',
  taxRateBps: 1800,
  invoicePrefix: 'RS',
  timeZone: 'Asia/Kolkata',
  billingDetails: { legalName: 'Riya Sen', address: 'Kolkata, West Bengal', taxId: null },
};

describe('FR-005 workspace settings', () => {
  it('GET returns defaults, the caller role and an ETag; never internal fields', async () => {
    const owner = await t.register({ name: 'Riya Sen' });
    const res = await t.request('GET', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"1"');
    const body = await json(res);
    expect(body).toMatchObject({
      id: owner.workspaceId,
      defaultCurrency: 'INR',
      defaultHourlyRateMinor: '0',
      taxRateBps: 0,
      aiEnabled: false,
      rowVersion: 1,
      myRole: 'OWNER',
      billingDetails: { legalName: 'Riya Sen', address: null, taxId: null },
    });
    expect(body).not.toHaveProperty('nextInvoiceNumber');
    expect(body).not.toHaveProperty('_id');
  });

  it('TC-002.1 owner saves valid settings: persisted, rowVersion bumped, audit event written', async () => {
    const owner = await t.register();
    const res = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      headers: { 'If-Match': '"1"' },
      body: validSettings,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"2"');
    expect(await json(res)).toMatchObject({ ...validSettings, rowVersion: 2, myRole: 'OWNER' });

    // Money stored as Int64 (BR-019), returned as a minor-unit string.
    const doc = await t.db.raw
      .collection('workspaces')
      .findOne({ _id: owner.workspaceId as never });
    expect(doc?.defaultHourlyRateMinor).toBe(150000n);

    const again = await t.request('GET', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
    });
    expect((await json(again)).taxLabel).toBe('GST');

    const audit = await t.db.raw
      .collection('auditEvents')
      .find({ workspaceId: owner.workspaceId, action: 'workspace.settings_changed' })
      .toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'workspace.settings_changed',
      actorUserId: owner.userId,
      entity: { type: 'WORKSPACE', id: owner.workspaceId, projectId: null },
    });
    // Exactly the fields that were sent, sorted (BR-028: key facts only).
    expect(audit[0]?.data.changedFields).toEqual(Object.keys(validSettings).sort());
  });

  it('accepts a partial update', async () => {
    const owner = await t.register();
    const res = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      headers: { 'If-Match': '"1"' },
      body: { invoicePrefix: 'SO-26' },
    });
    expect(res.status).toBe(200);
    expect((await json(res)).invoicePrefix).toBe('SO-26');
  });

  it('TC-002.2 SEC-011 a MEMBER can read settings but PATCH gives 403', async () => {
    const owner = await t.register();
    const member = await t.addMember(owner.workspaceId);
    const read = await t.request('GET', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: member.cookie,
    });
    expect(read.status).toBe(200);
    expect((await json(read)).myRole).toBe('MEMBER');
    const res = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: member.cookie,
      headers: { 'If-Match': '"1"' },
      body: { taxRateBps: 500 },
    });
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('FORBIDDEN');
    const doc = await t.db.raw
      .collection('workspaces')
      .findOne({ _id: owner.workspaceId as never });
    expect(doc?.taxRateBps).toBe(0);
  });

  it.each([
    [-1, 422],
    [0, 200],
    [10000, 200],
    [10001, 422],
  ])('TC-002.3 tax rate %i bps → %i', async (taxRateBps, status) => {
    const owner = await t.register();
    const res = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      headers: { 'If-Match': '"1"' },
      body: { taxRateBps },
    });
    expect(res.status).toBe(status);
    if (status === 422) {
      const body = await json(res);
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.errors).toEqual([expect.objectContaining({ path: 'taxRateBps' })]);
    }
  });

  it.each([
    ['fractional basis points', { taxRateBps: 18.5 }, 'taxRateBps'],
    ['lowercase invoice prefix', { invoicePrefix: 'rs' }, 'invoicePrefix'],
    ['11-character invoice prefix', { invoicePrefix: 'ABCDEFGHIJK' }, 'invoicePrefix'],
    ['unknown time zone', { timeZone: 'Mars/Olympus' }, 'timeZone'],
    ['non-ISO currency', { defaultCurrency: 'rupee' }, 'defaultCurrency'],
    ['decimal money string', { defaultHourlyRateMinor: '1500.50' }, 'defaultHourlyRateMinor'],
    [
      'numeric money (must be a string)',
      { defaultHourlyRateMinor: 150000 },
      'defaultHourlyRateMinor',
    ],
    ['negative money', { defaultHourlyRateMinor: '-1' }, 'defaultHourlyRateMinor'],
    [
      'empty legal name',
      { billingDetails: { legalName: ' ', address: null, taxId: null } },
      'billingDetails.legalName',
    ],
  ])('ERR-010 rejects %s with a field error', async (_label, body, path) => {
    const owner = await t.register();
    const res = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      headers: { 'If-Match': '"1"' },
      body,
    });
    expect(res.status).toBe(422);
    expect((await json(res)).errors).toContainEqual(expect.objectContaining({ path }));
  });

  it('rejects an empty update', async () => {
    const owner = await t.register();
    const res = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      headers: { 'If-Match': '"1"' },
      body: {},
    });
    expect(res.status).toBe(422);
  });

  it('SEC-005 mass assignment: server-owned fields in the body are ignored', async () => {
    const owner = await t.register();
    const other = await t.register();
    const res = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      headers: { 'If-Match': '"1"' },
      body: {
        taxLabel: 'VAT',
        aiEnabled: true,
        nextInvoiceNumber: 999,
        rowVersion: 50,
        workspaceId: other.workspaceId,
        _id: other.workspaceId,
      },
    });
    expect(res.status).toBe(200);
    const doc = await t.db.raw
      .collection('workspaces')
      .findOne({ _id: owner.workspaceId as never });
    expect(doc).toMatchObject({
      taxLabel: 'VAT',
      aiEnabled: false,
      nextInvoiceNumber: 1,
      rowVersion: 2,
    });
    const otherDoc = await t.db.raw
      .collection('workspaces')
      .findOne({ _id: other.workspaceId as never });
    expect(otherDoc?.taxLabel).toBe('Tax');
  });
});

describe('ERR-005 optimistic concurrency on settings', () => {
  it('missing If-Match → 428 PRECONDITION_REQUIRED', async () => {
    const owner = await t.register();
    const res = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      body: { taxLabel: 'VAT' },
    });
    expect(res.status).toBe(428);
    expect((await json(res)).code).toBe('PRECONDITION_REQUIRED');
  });

  it('stale If-Match → 412, nothing written, no audit event', async () => {
    const owner = await t.register();
    const first = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      headers: { 'If-Match': '"1"' },
      body: { taxLabel: 'VAT' },
    });
    expect(first.status).toBe(200);
    const stale = await t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
      cookie: owner.cookie,
      headers: { 'If-Match': '"1"' },
      body: { taxLabel: 'GST' },
    });
    expect(stale.status).toBe(412);
    expect((await json(stale)).code).toBe('PRECONDITION_FAILED');
    const doc = await t.db.raw
      .collection('workspaces')
      .findOne({ _id: owner.workspaceId as never });
    expect(doc?.taxLabel).toBe('VAT');
    expect(
      await t.db.raw
        .collection('auditEvents')
        .countDocuments({ workspaceId: owner.workspaceId, action: 'workspace.settings_changed' }),
    ).toBe(1);
  });

  it('concurrent PATCHes with the same If-Match: exactly one succeeds', async () => {
    const owner = await t.register();
    const results = await Promise.all(
      ['A', 'B', 'C', 'D'].map((label) =>
        t.request('PATCH', `/api/v1/workspaces/${owner.workspaceId}`, {
          cookie: owner.cookie,
          headers: { 'If-Match': '"1"' },
          body: { taxLabel: `L${label}` },
        }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 412, 412, 412]);
    expect(
      await t.db.raw
        .collection('auditEvents')
        .countDocuments({ workspaceId: owner.workspaceId, action: 'workspace.settings_changed' }),
    ).toBe(1);
  });
});
