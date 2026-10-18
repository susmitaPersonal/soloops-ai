import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './index';

const WS = '0192a000-0000-7000-8000-000000000001';
const P = '0192a000-0000-7000-8000-0000000000e1';
const E = '0192a000-0000-7000-8000-0000000000e9';
const entry = {
  id: E,
  projectId: P,
  kind: 'TIME',
  workDate: '2026-10-15',
  minutes: 60,
  amountMinor: null,
  currency: 'INR',
  description: 'w',
  taskId: null,
  scope: { type: 'NONE', requirementId: null, changeRequestId: null, versionNumber: null },
  scopeLabel: null,
  scopeKind: 'NONE',
  invoiceId: null,
  eligibility: { eligible: false, reason: 'UNSCOPED', explanation: 'x' },
  hourlyRateMinor: '0',
  billableAmountMinor: '0',
  createdByUserId: E,
  rowVersion: 1,
  createdAt: '2026-10-15T00:00:00.000Z',
};
const reply = (body: unknown, status = 200, type = 'application/json') =>
  body === null
    ? new Response(null, { status: 204 })
    : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } });

describe('@soloops/api-client billing', () => {
  it('UT-CLI-BL-01 methods, paths and headers', async () => {
    const replies = [
      { created: [], alreadyConverted: [0] },
      {
        eligible: [],
        ineligible: [entry],
        eligibleTotalMinor: '0',
        currency: 'INR',
        truncated: false,
      },
      entry,
      entry,
      null,
      {
        projectId: P,
        currency: 'INR',
        requirements: { draft: 0, baselined: 0 },
        baselines: 0,
        changeRequests: {
          DRAFT: 0,
          AWAITING_DECISION: 0,
          REVISING: 0,
          NEEDS_REVISION: 0,
          APPROVED: 0,
          REJECTED: 0,
          WITHDRAWN: 0,
        },
        tasks: {
          TODO: 0,
          IN_PROGRESS: 0,
          DONE: 0,
          total: 0,
          original: 0,
          additional: 0,
          internal: 0,
        },
        unbilled: { eligibleTotalMinor: '0', eligibleCount: 0, ineligibleCount: 1 },
      },
    ];
    let i = 0;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => reply(replies[i++]));
    const api = createApiClient({ baseUrl: '', fetch });
    await api.changeRequests.convertToTasks(WS, E, 2, { criterionIndexes: [0] }, 'key-convert-1');
    await api.billableEntries.list(WS, P, { state: 'all' });
    await api.billableEntries.create(
      WS,
      P,
      { kind: 'TIME', workDate: '2026-10-15', minutes: 60, description: 'w' },
      'key-entry-1',
    );
    await api.billableEntries.update(WS, E, { minutes: 30 }, 3);
    await api.billableEntries.delete(WS, E);
    await api.projects.overview(WS, P);
    const base = `/api/v1/workspaces/${WS}`;
    const calls = fetch.mock.calls.map(
      ([u, init]) => `${init?.method} ${String(u).replace(base, '')}`,
    );
    expect(calls).toEqual([
      `POST /change-requests/${E}/versions/2/tasks`,
      `GET /projects/${P}/billable-entries?state=all`,
      `POST /projects/${P}/billable-entries`,
      `PATCH /billable-entries/${E}`,
      `DELETE /billable-entries/${E}`,
      `GET /projects/${P}/overview`,
    ]);
    const headers = (n: number) => fetch.mock.calls[n]?.[1]?.headers as Record<string, string>;
    expect(headers(0)['Idempotency-Key']).toBe('key-convert-1');
    expect(headers(2)['Idempotency-Key']).toBe('key-entry-1');
    expect(headers(3)['If-Match']).toBe('"3"');
  });

  it('UT-CLI-BL-02 ALREADY_INVOICED surfaces as an ApiError with its code', async () => {
    const problem = {
      type: 'about:blank',
      code: 'ALREADY_INVOICED',
      status: 409,
      title: 'Already invoiced',
      detail: 'x',
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(reply(problem, 409, 'application/problem+json'));
    const api = createApiClient({ baseUrl: '', fetch });
    const err = await api.billableEntries.delete(WS, E).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('ALREADY_INVOICED');
    expect((err as ApiError).status).toBe(409);
  });
});

describe('@soloops/api-client invoices', () => {
  const I = '0192a000-0000-7000-8000-0000000000c1';
  const invoice = {
    id: I,
    clientId: P,
    clientName: 'C',
    projectId: P,
    projectName: 'P',
    status: 'DRAFT',
    number: null,
    displayNumber: null,
    currency: 'INR',
    taxLabel: 'GST',
    taxRateBps: 1800,
    calculationVersion: 1,
    lines: [
      {
        position: 1,
        kind: 'ADJUSTMENT',
        billableEntryId: null,
        description: 'd',
        minutes: null,
        hourlyRateMinor: null,
        amountMinor: '-500',
        adjustmentReason: 'r',
      },
    ],
    subtotalMinor: '-500',
    taxMinor: '-90',
    totalMinor: '-590',
    supplier: { legalName: 'L', address: null, taxId: null },
    issuedAt: null,
    issuedByUserId: null,
    voidedAt: null,
    voidReason: null,
    rowVersion: 1,
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
  };

  it('UT-CLI-INV-01 methods, paths, If-Match and required keys', async () => {
    const replies = [
      { items: [], nextCursor: null },
      invoice,
      invoice,
      invoice,
      null,
      invoice,
      invoice,
    ];
    let i = 0;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => reply(replies[i++]));
    const api = createApiClient({ baseUrl: '', fetch });
    await api.invoices.list(WS, { status: 'DRAFT', projectId: P });
    await api.invoices.get(WS, I);
    await api.invoices.create(WS, { projectId: P, entryIds: [E] }, 'key-invoice-1');
    await api.invoices.update(WS, I, { removePositions: [1] }, 4);
    await api.invoices.delete(WS, I);
    await api.invoices.issue(WS, I, 'key-issue-1');
    await api.invoices.void(WS, I, { reason: 'x' }, 'key-void-1');
    const base = `/api/v1/workspaces/${WS}`;
    const calls = fetch.mock.calls.map(
      ([u, init]) => `${init?.method} ${String(u).replace(base, '')}`,
    );
    expect(calls).toEqual([
      `GET /invoices?status=DRAFT&projectId=${P}`,
      `GET /invoices/${I}`,
      'POST /invoices',
      `PATCH /invoices/${I}`,
      `DELETE /invoices/${I}`,
      `POST /invoices/${I}/issue`,
      `POST /invoices/${I}/void`,
    ]);
    const headers = (n: number) => fetch.mock.calls[n]?.[1]?.headers as Record<string, string>;
    expect(headers(2)['Idempotency-Key']).toBe('key-invoice-1');
    expect(headers(3)['If-Match']).toBe('"4"');
    expect(headers(5)['Idempotency-Key']).toBe('key-issue-1');
    expect(headers(6)['Idempotency-Key']).toBe('key-void-1');
  });
});
