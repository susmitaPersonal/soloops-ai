import { describe, expect, it, vi } from 'vitest';
import { ClientError, createApiClient } from './index';

const WS = '0192a000-0000-7000-8000-000000000001';
const CR = '0192a000-0000-7000-8000-0000000000d3';
const P = '0192a000-0000-7000-8000-0000000000e1';
const ts = '2026-10-16T09:00:00.000Z';
const version = {
  number: 1,
  state: 'DRAFT',
  title: 'T',
  clarifiedDescription: '',
  inScope: [],
  outOfScope: [],
  acceptanceCriteria: [],
  affectedRequirementIds: [],
  dependencies: [],
  assumptions: [],
  risks: [],
  effort: null,
  confirmedEffortMinutes: null,
  pricing: null,
  timelineImpact: '',
  questionsForClient: [],
  scopeVerdict: null,
  aiFieldProvenance: {},
  contentHash: null,
  proposedAt: null,
  proposedByUserId: null,
  decision: null,
};
const cr = {
  id: CR,
  projectId: P,
  number: 1,
  key: 'CR-1',
  rawRequestText: 'raw',
  sourceChannel: 'CHAT',
  requestedByName: 'S',
  receivedOn: '2026-10-12',
  status: 'DRAFT',
  openVersionNumber: 1,
  approvedVersionNumber: null,
  latestVersionNumber: 1,
  versions: [version],
  readOnly: false,
  rowVersion: 1,
  createdByUserId: CR,
  createdAt: ts,
  updatedAt: ts,
};
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('@soloops/api-client scope-guard and ai', () => {
  it('UT-CLI-SG-01 methods, paths and transition headers', async () => {
    const replies: unknown[] = [
      { items: [], nextCursor: null },
      { items: [], nextCursor: null },
      { ...cr, decisions: [], history: [] },
      cr,
      cr,
      cr,
      cr,
      cr,
      cr,
      { approvalId: CR, versionState: 'APPROVED', supersededVersion: null, changeRequest: cr },
      {
        changeRequestKey: 'CR-1',
        projectName: 'P',
        clientName: 'C',
        supplier: { legalName: 'L', address: null, taxId: null },
        version,
        disclaimer: 'd',
      },
      { from: 1, to: 1, fields: [] },
      {
        provider: 'none',
        model: null,
        health: 'unconfigured',
        workspaceEnabled: false,
        disclosure: [],
      },
    ];
    let i = 0;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => json(replies[i++]));
    const api = createApiClient({ baseUrl: '', fetch });
    await api.changeRequests.listForProject(WS, P, { status: 'DRAFT,APPROVED' });
    await api.changeRequests.queue(WS, { projectId: P });
    await api.changeRequests.get(WS, CR);
    await api.changeRequests.create(WS, P, {
      rawRequestText: 'raw',
      sourceChannel: 'CHAT',
      requestedByName: 'S',
      receivedOn: '2026-10-12',
    });
    await api.changeRequests.updateDraft(WS, CR, 1, { title: 'T' }, 4);
    await api.changeRequests.discardDraft(WS, CR, 2);
    await api.changeRequests.newVersion(WS, CR, 'key-new-version');
    await api.changeRequests.propose(WS, CR, 1, 5, 'key-propose-1');
    await api.changeRequests.withdraw(WS, CR, 1);
    await api.changeRequests.recordDecision(
      WS,
      CR,
      1,
      {
        decision: 'APPROVED',
        contentHash: 'a'.repeat(64),
        clientDecisionMakerName: 'S',
        decidedOn: '2026-10-14',
        channel: 'EMAIL',
      },
      'key-decision-1',
    );
    await api.changeRequests.summary(WS, CR, 1);
    await api.changeRequests.diff(WS, CR, 1, 2);
    await api.ai.status(WS);
    const base = `/api/v1/workspaces/${WS}`;
    const calls = fetch.mock.calls.map(
      ([u, init]) => `${init?.method} ${String(u).replace(base, '')}`,
    );
    expect(calls).toEqual([
      `GET /projects/${P}/change-requests?status=DRAFT%2CAPPROVED`,
      `GET /change-requests?projectId=${P}`,
      `GET /change-requests/${CR}`,
      `POST /projects/${P}/change-requests`,
      `PATCH /change-requests/${CR}/versions/1`,
      `DELETE /change-requests/${CR}/versions/2`,
      `POST /change-requests/${CR}/versions`,
      `POST /change-requests/${CR}/versions/1/propose`,
      `POST /change-requests/${CR}/versions/1/withdraw`,
      `POST /change-requests/${CR}/versions/1/decisions`,
      `GET /change-requests/${CR}/versions/1/summary`,
      `GET /change-requests/${CR}/diff?from=1&to=2`,
      'GET /ai/status',
    ]);
    const headers = (n: number) => fetch.mock.calls[n]?.[1]?.headers as Record<string, string>;
    expect(headers(4)['If-Match']).toBe('"4"');
    expect(headers(6)['Idempotency-Key']).toBe('key-new-version');
    expect(headers(7)).toMatchObject({ 'If-Match': '"5"', 'Idempotency-Key': 'key-propose-1' });
    expect(headers(8)['Idempotency-Key']).toBeUndefined();
    expect(headers(9)['Idempotency-Key']).toBe('key-decision-1');
  });

  it('UT-CLI-SG-02 analyze passes the abort signal; setEnablement is a PUT; bad shapes are rejected', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => json({ nope: true }));
    const api = createApiClient({ baseUrl: '', fetch });
    const controller = new AbortController();
    await expect(api.changeRequests.analyze(WS, CR, 1, controller.signal)).rejects.toBeInstanceOf(
      ClientError,
    );
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    await expect(
      api.ai.setEnablement(WS, { enabled: true, acknowledgeDisclosure: true }),
    ).rejects.toBeInstanceOf(ClientError);
    expect(fetch.mock.calls[1]?.[1]?.method).toBe('PUT');
  });
});
