import { ApiError, ClientError } from '@soloops/api-client';
import type {
  AnalysisResponse,
  ChangeRequestDetail,
  ProposalSummary,
  RequirementDto,
  VersionDto,
} from '@soloops/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));
const api = vi.hoisted(() => ({
  changeRequests: {
    create: vi.fn(),
    updateDraft: vi.fn(),
    propose: vi.fn(),
    recordDecision: vi.fn(),
    withdraw: vi.fn(),
    newVersion: vi.fn(),
    discardDraft: vi.fn(),
    analyze: vi.fn(),
    diff: vi.fn(),
    convertToTasks: vi.fn(),
  },
}));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { AiSuggestionPanel } from './AiSuggestionPanel';
import { CreateChangeRequestForm } from './CreateChangeRequestForm';
import { DraftEditor } from './DraftEditor';
import { NextStepPanel } from './NextStepPanel';
import { ProposalSummaryView, summaryText } from './ProposalSummaryView';
import { ScopeStrip } from './ScopeStrip';
import { VersionCompare } from './VersionCompare';

const WS = '0192a000-0000-7000-8000-000000000001';
const P = '0192a000-0000-7000-8000-0000000000e1';
const CR = '0192a000-0000-7000-8000-0000000000d3';
const R1 = '0192a000-0000-7000-8000-000000000001';
const HASH = '3f9a'.padEnd(62, '0') + 'c1';

const version = (over: Partial<VersionDto> = {}): VersionDto => ({
  number: 1,
  state: 'DRAFT',
  title: 'WhatsApp OTP login',
  clarifiedDescription: 'Add OTP login.',
  inScope: ['OTP endpoints'],
  outOfScope: [],
  acceptanceCriteria: ['OTP within 30 s'],
  affectedRequirementIds: [R1],
  dependencies: [],
  assumptions: ['Phones verified'],
  risks: [],
  effort: { lowMinutes: 360, likelyMinutes: 480, highMinutes: 840 },
  confirmedEffortMinutes: 540,
  pricing: { mode: 'TIME', hourlyRateMinor: '150000', priceMinor: '1350000', currency: 'INR' },
  timelineImpact: '3 days',
  aiFieldProvenance: {},
  contentHash: null,
  proposedAt: null,
  proposedByUserId: null,
  decision: null,
  ...over,
});
const cr = (
  versions: VersionDto[],
  over: Partial<ChangeRequestDetail> = {},
): ChangeRequestDetail => ({
  id: CR,
  projectId: P,
  number: 3,
  key: 'CR-3',
  rawRequestText: 'Add WhatsApp login',
  sourceChannel: 'CHAT',
  requestedByName: 'S. Das',
  receivedOn: '2026-10-12',
  status: 'DRAFT',
  openVersionNumber: 1,
  approvedVersionNumber: null,
  latestVersionNumber: versions.length,
  versions,
  readOnly: false,
  rowVersion: 7,
  createdByUserId: R1,
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
  decisions: [],
  history: [],
  ...over,
});
const requirements: RequirementDto[] = [
  {
    id: R1,
    projectId: P,
    number: 2,
    key: 'REQ-2',
    title: 'Customer login',
    description: '',
    acceptanceCriteria: [],
    priority: 'MUST',
    baselineId: '0192a000-0000-7000-8000-0000000000b1',
    rowVersion: 2,
    createdAt: '2026-10-12T00:00:00Z',
    updatedAt: '2026-10-12T00:00:00Z',
  },
];
const analysis: AnalysisResponse = {
  generationId: '0192a000-0000-7000-8000-0000000000b5',
  promptVersion: 'cr-analysis@1',
  schemaVersion: 'cr-analysis-output@1',
  provider: 'mock',
  model: 'mock-fixtures@1',
  suggestion: {
    clarifiedDescription: 'AI description',
    inScope: ['AI in scope'],
    outOfScope: ['SMS'],
    acceptanceCriteria: ['AI criterion'],
    affectedRequirementIds: [R1],
    affectedRequirementKeys: ['REQ-2'],
    dependencies: [],
    assumptions: ['AI assumption'],
    effort: { lowMinutes: 360, likelyMinutes: 480, highMinutes: 840 },
    risks: [{ description: 'Provider delay', severity: 'MEDIUM' }],
    timelineImpact: '2–4 days',
    questionsForClient: ['Keep email login?'],
  },
  indicativeCost: {
    currency: 'INR',
    hourlyRateMinor: '150000',
    lowMinor: '900000',
    likelyMinor: '1200000',
    highMinor: '2100000',
  },
  warnings: [],
};

beforeEach(() => vi.clearAllMocks());

describe('S-06 CreateChangeRequestForm (FR-020)', () => {
  it('CT-CR-01 AC-008.1 submits the message exactly as typed and opens the CR', async () => {
    api.changeRequests.create.mockResolvedValue({ id: CR });
    const user = userEvent.setup();
    render(<CreateChangeRequestForm workspaceId={WS} projectId={P} today="2026-10-16" />);
    await user.type(screen.getByLabelText(/Client’s message/), '  Please add exports  ');
    await user.type(screen.getByLabelText(/Requested by/), 'S. Das');
    await user.click(screen.getByRole('button', { name: 'Record change request' }));
    await waitFor(() => expect(api.changeRequests.create).toHaveBeenCalled());
    expect(api.changeRequests.create.mock.calls[0]?.[2]).toMatchObject({
      rawRequestText: '  Please add exports  ',
      requestedByName: 'S. Das',
      sourceChannel: 'EMAIL',
      receivedOn: '2026-10-16',
    });
    expect(router.push).toHaveBeenCalledWith(`/w/${WS}/projects/${P}/change-requests/${CR}`);
  });

  it('CT-CR-02 an empty message is refused before calling the API; date max is today', async () => {
    const user = userEvent.setup();
    render(<CreateChangeRequestForm workspaceId={WS} projectId={P} today="2026-10-16" />);
    expect(screen.getByLabelText(/Received on/)).toHaveAttribute('max', '2026-10-16');
    await user.click(screen.getByRole('button', { name: 'Record change request' }));
    expect(await screen.findByRole('alert', { name: /There is a problem/ })).toBeInTheDocument();
    expect(api.changeRequests.create).not.toHaveBeenCalled();
  });
});

describe('S-07 NextStepPanel: one primary action per state', () => {
  const panel = (c: ChangeRequestDetail, v: VersionDto) =>
    render(
      <NextStepPanel workspaceId={WS} cr={c} version={v} today="2026-10-16" basePath="/base" />,
    );

  it.each([
    ['DRAFT', 'Propose to client…'],
    ['PROPOSED', 'Record client decision…'],
    ['REJECTED', 'Create new version'],
    ['CLARIFICATION_REQUESTED', 'Create new version'],
    ['WITHDRAWN', 'Create new version'],
    ['APPROVED', 'Create tasks from this version…'],
  ] as const)('CT-NSP-01 %s → %s', (state, label) => {
    const v = version({ state, contentHash: state === 'DRAFT' ? null : HASH });
    panel(cr([v], { openVersionNumber: state === 'DRAFT' || state === 'PROPOSED' ? 1 : null }), v);
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('CT-NSP-02 BR-029 an archived project offers no actions', () => {
    const v = version();
    panel(cr([v], { readOnly: true }), v);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/archived/)).toBeInTheDocument();
  });

  it('CT-NSP-03 AC-011.1 propose sends If-Match + Idempotency-Key; a 422 lists what is missing in the dialog', async () => {
    api.changeRequests.propose.mockRejectedValueOnce(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        title: 'Validation failed',
        detail: 'The proposal is incomplete.',
        errors: [{ path: 'assumptions', message: 'Add at least one assumption.' }],
      }),
    );
    const user = userEvent.setup();
    const v = version();
    panel(cr([v]), v);
    await user.click(screen.getByRole('button', { name: 'Propose to client…' }));
    const dialog = screen.getByRole('dialog', { name: 'Propose v1 to the client?' });
    expect(within(dialog).getByText(/v1 is frozen/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Propose v1' }));
    await waitFor(() => expect(api.changeRequests.propose).toHaveBeenCalled());
    const [ws, id, n, rowVersion, key] = api.changeRequests.propose.mock.calls[0] ?? [];
    expect([ws, id, n, rowVersion]).toEqual([WS, CR, 1, 7]);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(await within(dialog).findByText('Add at least one assumption.')).toBeInTheDocument();
  });

  it('CT-NSP-04 AC-012.1 BR-010 the decision dialog needs the confirmation and sends the version hash', async () => {
    api.changeRequests.recordDecision.mockResolvedValue({});
    const user = userEvent.setup();
    const v = version({ state: 'PROPOSED', contentHash: HASH, proposedAt: '2026-10-15T00:00:00Z' });
    panel(cr([v], { status: 'AWAITING_DECISION' }), v);
    await user.click(screen.getByRole('button', { name: 'Record client decision…' }));
    const dialog = screen.getByRole('dialog', {
      name: /Record client decision — CR-3 v1 · ref 3f9a…c1/,
    });
    const confirm = within(dialog).getByRole('button', { name: 'Record approval' });
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByLabelText('Rejected'));
    expect(within(dialog).getByRole('button', { name: 'Record rejection' })).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText('Approved'));
    await user.type(within(dialog).getByLabelText(/Evidence/), 'Email 16 Oct');
    await user.click(within(dialog).getByLabelText(/I confirm the client made this decision/));
    await user.click(within(dialog).getByRole('button', { name: 'Record approval' }));
    await waitFor(() => expect(api.changeRequests.recordDecision).toHaveBeenCalled());
    const [, , n, body, key] = api.changeRequests.recordDecision.mock.calls[0] ?? [];
    expect(n).toBe(1);
    expect(body).toEqual({
      decision: 'APPROVED',
      contentHash: HASH,
      clientDecisionMakerName: 'S. Das',
      decidedOn: '2026-10-16',
      channel: 'CHAT',
      evidenceNote: 'Email 16 Oct',
    });
    expect(typeof key).toBe('string');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CT-NSP-05 a network error keeps the dialog open and reuses the SAME idempotency key on retry', async () => {
    api.changeRequests.recordDecision
      .mockRejectedValueOnce(new ClientError('NETWORK_ERROR', 'Could not reach the server.'))
      .mockResolvedValueOnce({});
    const user = userEvent.setup();
    const v = version({ state: 'PROPOSED', contentHash: HASH });
    panel(cr([v], { status: 'AWAITING_DECISION' }), v);
    await user.click(screen.getByRole('button', { name: 'Record client decision…' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/I confirm/));
    await user.click(within(dialog).getByRole('button', { name: 'Record approval' }));
    expect(await within(dialog).findByText(/retry safely/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Record approval' }));
    await waitFor(() => expect(api.changeRequests.recordDecision).toHaveBeenCalledTimes(2));
    const keys = api.changeRequests.recordDecision.mock.calls.map((c) => c[4]);
    expect(keys[0]).toBe(keys[1]);
  });

  it('CT-NSP-06 AC-012.3 a hash mismatch closes the dialog with a reload banner', async () => {
    api.changeRequests.recordDecision.mockRejectedValue(
      new ApiError(409, {
        code: 'VERSION_HASH_MISMATCH',
        title: 'Proposal changed',
        detail: 'Does not match.',
      }),
    );
    const user = userEvent.setup();
    const v = version({ state: 'PROPOSED', contentHash: HASH });
    panel(cr([v], { status: 'AWAITING_DECISION' }), v);
    await user.click(screen.getByRole('button', { name: 'Record client decision…' }));
    await user.click(screen.getByLabelText(/I confirm/));
    await user.click(screen.getByRole('button', { name: 'Record approval' }));
    expect(
      await screen.findByText('This proposal changed or was already decided — reload'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('CT-NSP-07 AC-012.5 server field errors (future date) show on the dialog field', async () => {
    api.changeRequests.recordDecision.mockRejectedValue(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        title: 'Validation failed',
        errors: [{ path: 'decidedOn', message: 'The decision date cannot be in the future.' }],
      }),
    );
    const user = userEvent.setup();
    const v = version({ state: 'PROPOSED', contentHash: HASH });
    panel(cr([v], { status: 'AWAITING_DECISION' }), v);
    await user.click(screen.getByRole('button', { name: 'Record client decision…' }));
    await user.click(screen.getByLabelText(/I confirm/));
    await user.click(screen.getByRole('button', { name: 'Record approval' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Decision date/)).toHaveAccessibleDescription(
        /cannot be in the future/,
      ),
    );
  });

  it('CT-NSP-08 withdraw and new version call their endpoints', async () => {
    api.changeRequests.withdraw.mockResolvedValue({});
    const user = userEvent.setup();
    const v = version({ state: 'PROPOSED', contentHash: HASH });
    panel(cr([v], { status: 'AWAITING_DECISION' }), v);
    await user.click(screen.getByRole('button', { name: 'Withdraw proposal' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Withdraw v1' }),
    );
    await waitFor(() =>
      expect(api.changeRequests.withdraw).toHaveBeenCalledWith(WS, CR, 1, expect.any(String)),
    );
  });
});

describe('S-07 NextStepPanel idempotency keys', () => {
  it('CT-NSP-09 each "Start revision" click uses its own Idempotency-Key (never a key left by a dialog)', async () => {
    api.changeRequests.newVersion.mockResolvedValue({});
    const user = userEvent.setup();
    const v = version({ state: 'APPROVED', contentHash: HASH });
    render(
      <NextStepPanel
        workspaceId={WS}
        cr={cr([v], { status: 'APPROVED', openVersionNumber: null, approvedVersionNumber: 1 })}
        version={v}
        today="2026-10-16"
        basePath="/base"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Start revision' }));
    await user.click(screen.getByRole('button', { name: 'Start revision' }));
    await waitFor(() => expect(api.changeRequests.newVersion).toHaveBeenCalledTimes(2));
    const [k1, k2] = api.changeRequests.newVersion.mock.calls.map((c) => c[2]);
    expect(k1).not.toBe(k2);
  });
});

describe('S-07 Create tasks from an approved version (FR-030)', () => {
  const approved = () => {
    const v = version({
      state: 'APPROVED',
      contentHash: HASH,
      acceptanceCriteria: ['OTP within 30 s', 'OTP expires after 5 min', 'Resend after 60 s'],
    });
    render(
      <NextStepPanel
        workspaceId={WS}
        cr={cr([v], { status: 'APPROVED', openVersionNumber: null, approvedVersionNumber: 1 })}
        version={v}
        today="2026-10-16"
        basePath={`/w/${WS}/projects/${P}/change-requests/${CR}`}
      />,
    );
  };

  it('CT-NSP-10 AC-015.1 all criteria are preselected; unchecking sends only the chosen indexes', async () => {
    api.changeRequests.convertToTasks.mockResolvedValue({
      created: [{}, {}],
      alreadyConverted: [],
    });
    const user = userEvent.setup();
    approved();
    expect(screen.getByRole('link', { name: 'View tasks' })).toHaveAttribute(
      'href',
      `/w/${WS}/projects/${P}/tasks`,
    );
    expect(screen.getByRole('button', { name: 'Start revision' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create tasks from this version…' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: 'OTP expires after 5 min' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create 2 tasks' }));
    await waitFor(() =>
      expect(api.changeRequests.convertToTasks).toHaveBeenCalledWith(
        WS,
        CR,
        1,
        { criterionIndexes: [0, 2] },
        expect.any(String),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('2 tasks created from v1.');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CT-NSP-11 duplicates are reported, not created; nothing chosen disables the action', async () => {
    api.changeRequests.convertToTasks.mockResolvedValue({
      created: [],
      alreadyConverted: [0, 1, 2],
    });
    const user = userEvent.setup();
    approved();
    await user.click(screen.getByRole('button', { name: 'Create tasks from this version…' }));
    const dialog = screen.getByRole('dialog');
    for (const name of ['OTP within 30 s', 'OTP expires after 5 min', 'Resend after 60 s']) {
      await user.click(within(dialog).getByRole('checkbox', { name }));
    }
    expect(within(dialog).getByRole('button', { name: 'Create 0 tasks' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: 'OTP within 30 s' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create 1 task' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'No new tasks. 3 criteria already had tasks, so no duplicates were made.',
    );
  });

  it('CT-NSP-12 AC-015.2 a 409 (no longer approved) closes the dialog with a reload banner', async () => {
    api.changeRequests.convertToTasks.mockRejectedValue(
      new ApiError(409, {
        code: 'INVALID_STATE_TRANSITION',
        title: 'Not possible in this state',
        detail: 'A newer version was approved.',
      }),
    );
    const user = userEvent.setup();
    approved();
    await user.click(screen.getByRole('button', { name: 'Create tasks from this version…' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create 3 tasks' }),
    );
    expect(await screen.findByText('A newer version was approved.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CT-NSP-13 a network error keeps the dialog and retries with the SAME key', async () => {
    api.changeRequests.convertToTasks
      .mockRejectedValueOnce(new ClientError('NETWORK_ERROR', 'Could not reach the server.'))
      .mockResolvedValueOnce({ created: [{}], alreadyConverted: [] });
    const user = userEvent.setup();
    approved();
    await user.click(screen.getByRole('button', { name: 'Create tasks from this version…' }));
    const confirm = () =>
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Create 3 tasks' });
    await user.click(confirm());
    expect(await screen.findByText(/retry safely/)).toBeInTheDocument();
    await user.click(confirm());
    await waitFor(() => expect(api.changeRequests.convertToTasks).toHaveBeenCalledTimes(2));
    const [k1, k2] = api.changeRequests.convertToTasks.mock.calls.map((c) => c[4]);
    expect(k1).toBe(k2);
  });
});

describe('S-07 AiSuggestionPanel (FR-021, FR-051)', () => {
  const panel = (onApply = vi.fn(), available = true, isOwner = true) =>
    render(
      <AiSuggestionPanel
        workspaceId={WS}
        crId={CR}
        versionNumber={1}
        available={available}
        isOwner={isOwner}
        onApply={onApply}
      />,
    );

  it('CT-AI-01 AC-009.4 unavailable: hidden for members, a settings hint for owners', () => {
    const { unmount } = panel(vi.fn(), false, false);
    expect(screen.queryByRole('button', { name: /Analyse/ })).not.toBeInTheDocument();
    unmount();
    panel(vi.fn(), false, true);
    expect(screen.getByRole('link', { name: 'enable AI in Settings' })).toHaveAttribute(
      'href',
      `/w/${WS}/settings`,
    );
  });

  it('CT-AI-02 AC-009.2 BR-027 shows the suggestion; nothing applies until Apply; cost labelled indicative', async () => {
    api.changeRequests.analyze.mockResolvedValue(analysis);
    const onApply = vi.fn();
    const user = userEvent.setup();
    panel(onApply);
    await user.click(screen.getByRole('button', { name: 'Analyse with AI' }));
    expect(await screen.findByText('AI description')).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/Indicative cost \(calculated by SoloOps/)).toHaveTextContent(
      '₹9,000.00',
    );
    expect(screen.getByText(/Confirmed effort is never filled in by the AI/)).toBeInTheDocument();
    expect(screen.getByText('Keep email login?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply Description' }));
    expect(onApply).toHaveBeenCalledWith(['clarifiedDescription'], analysis);
    expect(screen.getByText('Applied')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply all fields' }));
    expect(onApply.mock.calls[1]?.[0]).toHaveLength(10);
  });

  it.each([
    [
      new ApiError(504, { code: 'AI_TIMEOUT', title: 't', detail: 'Timed out.' }),
      'The AI took too long',
    ],
    [
      new ApiError(502, { code: 'AI_INVALID_OUTPUT', title: 't', detail: 'Bad format.' }),
      'The AI could not help this time',
    ],
    [
      new ApiError(429, { code: 'RATE_LIMITED', title: 't', detail: 'Wait.' }),
      'Too many AI requests — try again in a few minutes',
    ],
    [new ClientError('NETWORK_ERROR', 'Offline.'), 'The AI could not help this time'],
    [
      new ApiError(502, { code: 'AI_PROVIDER_ERROR', title: 't', detail: 'Provider failed.' }),
      'The AI could not help this time',
    ],
    [
      new ApiError(409, { code: 'AI_DISABLED', title: 't', detail: 'Turned off.' }),
      'AI is not available',
    ],
    [
      new ApiError(500, { code: 'INTERNAL_ERROR', title: 't', detail: 'Unexpected.' }),
      'The AI could not help this time',
    ],
  ])(
    'CT-AI-03 AC-009.3 failure %#: clear message, manual path, no fabricated suggestion',
    async (err, title) => {
      api.changeRequests.analyze.mockRejectedValue(err);
      const user = userEvent.setup();
      panel();
      await user.click(screen.getByRole('button', { name: 'Analyse with AI' }));
      // The title is announced (status region) and shown in the visible alert.
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(title));
      expect(screen.getAllByText(title)).toHaveLength(2);
      expect(screen.getByText(/Your draft is unchanged/)).toBeInTheDocument();
      expect(screen.getByText(/continue writing the proposal manually/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Apply/ })).not.toBeInTheDocument();
    },
  );

  it('CT-AI-04 Cancel aborts the running analysis', async () => {
    let signal: AbortSignal | undefined;
    api.changeRequests.analyze.mockImplementation(
      (_w: string, _c: string, _n: number, s: AbortSignal) =>
        new Promise((_res, rej) => {
          signal = s;
          s.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
        }),
    );
    const user = userEvent.setup();
    panel();
    await user.click(screen.getByRole('button', { name: 'Analyse with AI' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(signal?.aborted).toBe(true);
    expect(await screen.findByRole('button', { name: 'Analyse with AI' })).toBeInTheDocument();
  });
});

describe('S-07 DraftEditor (FR-022)', () => {
  const editor = (v: VersionDto = version(), onDirty = vi.fn()) =>
    render(
      <DraftEditor
        workspaceId={WS}
        cr={cr([v])}
        version={v}
        requirements={requirements}
        currency="INR"
        aiAvailable
        isOwner
        onDirtyChange={onDirty}
      />,
    );

  it('CT-DE-01 applying fields marks them AI-suggested; a human edit clears the badge; save sends provenance', async () => {
    api.changeRequests.analyze.mockResolvedValue(analysis);
    api.changeRequests.updateDraft.mockResolvedValue({});
    const user = userEvent.setup();
    const onDirty = vi.fn();
    editor(version({ confirmedEffortMinutes: null }), onDirty);
    await user.click(screen.getByRole('button', { name: 'Analyse with AI' }));
    await user.click(await screen.findByRole('button', { name: 'Apply all fields' }));
    expect(screen.getByLabelText(/Clarified description/)).toHaveValue('AI description');
    expect(screen.getAllByText('AI-suggested').length).toBeGreaterThan(3);
    expect(screen.getByLabelText(/Confirmed effort/)).toHaveValue(''); // BR-003
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(onDirty).toHaveBeenCalledWith(true);
    // Human edit of the description clears its badge.
    await user.type(screen.getByLabelText(/Clarified description/), ' edited');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.changeRequests.updateDraft).toHaveBeenCalled());
    const [, , n, body, rowVersion] = api.changeRequests.updateDraft.mock.calls[0] ?? [];
    expect([n, rowVersion]).toEqual([1, 7]);
    expect(body.clarifiedDescription).toBe('AI description edited');
    expect(body.confirmedEffortMinutes).toBeNull();
    expect(body.aiFieldProvenance).toMatchObject({
      clarifiedDescription: null,
      inScope: analysis.generationId,
      risks: analysis.generationId,
      effort: analysis.generationId,
    });
    expect(body.risks).toEqual(analysis.suggestion.risks);
    expect(body.affectedRequirementIds).toEqual([R1]);
    expect(body).not.toHaveProperty('priceMinor');
  });

  it('CT-DE-02 converts hours to minutes and FIXED price to minor units; validates the range', async () => {
    api.changeRequests.updateDraft.mockResolvedValue({});
    const user = userEvent.setup();
    editor();
    await user.clear(screen.getByLabelText('Low (hours)'));
    await user.type(screen.getByLabelText('Low (hours)'), '20');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert', { name: /There is a problem/ })).toBeInTheDocument();
    expect(api.changeRequests.updateDraft).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Low (hours)'));
    await user.type(screen.getByLabelText('Low (hours)'), '5.5');
    await user.selectOptions(screen.getByLabelText('Pricing'), 'FIXED');
    await user.type(screen.getByLabelText(/Fixed price/), '8,000.50');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(api.changeRequests.updateDraft).toHaveBeenCalled());
    const body = api.changeRequests.updateDraft.mock.calls[0]?.[3];
    expect(body.effort).toEqual({ lowMinutes: 330, likelyMinutes: 480, highMinutes: 840 });
    expect(body.pricing).toEqual({ mode: 'FIXED', priceMinor: '800050' });
  });

  it('CT-DE-03 server field errors map onto inputs (acceptanceCriteria.0 → criteria)', async () => {
    api.changeRequests.updateDraft.mockRejectedValue(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        title: 'Validation failed',
        errors: [{ path: 'acceptanceCriteria.0', message: 'Acceptance criteria cannot be empty.' }],
      }),
    );
    const user = userEvent.setup();
    editor();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Acceptance criteria/)).toHaveAccessibleDescription(
        /cannot be empty/,
      ),
    );
  });
});

describe('S-07 ScopeStrip and VersionCompare', () => {
  it('CT-SS-01 answers original / additional / approval / authorised (server values only)', () => {
    const v = version({
      state: 'PROPOSED',
      contentHash: HASH,
      proposedAt: new Date().toISOString(),
    });
    render(
      <ScopeStrip
        cr={cr([v], { status: 'AWAITING_DECISION' })}
        version={v}
        requirements={requirements}
      />,
    );
    const strip = screen.getByRole('region', { name: 'Scope summary' });
    expect(within(strip).getByText('REQ-2')).toBeInTheDocument();
    expect(within(strip).getByText(/Price ₹13,500.00/)).toBeInTheDocument();
    expect(within(strip).getByText(/waiting 0 days · ref 3f9a…c1/)).toBeInTheDocument();
    expect(
      within(strip).getByText(/None yet — tasks and billing unlock after the client approves/),
    ).toBeInTheDocument();
  });

  it('CT-SS-02 REVISING: the earlier approval still authorises its own scope', () => {
    const v1 = version({ state: 'APPROVED', contentHash: HASH });
    const v2 = version({ number: 2 });
    render(
      <ScopeStrip
        cr={cr([v1, v2], { status: 'REVISING', openVersionNumber: 2, approvedVersionNumber: 1 })}
        version={v2}
        requirements={requirements}
      />,
    );
    expect(screen.getByText('v1 remains authorised; v2 is pending')).toBeInTheDocument();
  });

  it('CT-VC-01 compare renders changed rows with text, not colour alone', async () => {
    api.changeRequests.diff.mockResolvedValue({
      from: 1,
      to: 2,
      fields: [
        {
          field: 'pricing',
          from: { mode: 'TIME', priceMinor: '1350000', currency: 'INR' },
          to: { mode: 'TIME', priceMinor: '1500000', currency: 'INR' },
          changed: true,
        },
        { field: 'title', from: 'A', to: 'A', changed: false },
      ],
    });
    const user = userEvent.setup();
    render(
      <VersionCompare
        workspaceId={WS}
        crId={CR}
        versionNumbers={[1, 2]}
        requirementKeys={new Map()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    const priceRow = (await screen.findByRole('rowheader', { name: /Price.*changed/ })).closest(
      'tr',
    ) as HTMLElement;
    expect(within(priceRow).getByText('₹13,500.00 (time-based)')).toBeInTheDocument();
    expect(within(priceRow).getByText('₹15,000.00 (time-based)')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Title' })).toBeInTheDocument();
  });
});

describe('S-08 ProposalSummaryView (FR-027, AC-011.3)', () => {
  const summary = (v: VersionDto): ProposalSummary => ({
    changeRequestKey: 'CR-3',
    projectName: 'Online ordering app',
    clientName: 'Das Sweets',
    supplier: { legalName: 'Riya Sen', address: 'Kolkata', taxId: null },
    version: v,
    disclaimer:
      'This is an estimate based on the listed assumptions, not a guarantee of actual effort.',
  });

  it('CT-SUM-01 plain text has scope, criteria, assumptions, price, ref and the disclaimer', () => {
    const text = summaryText(
      summary(
        version({ state: 'PROPOSED', contentHash: HASH, proposedAt: '2026-10-15T00:00:00Z' }),
      ),
    );
    for (const part of [
      'Riya Sen — proposal for Das Sweets',
      'Ref 3f9a…c1',
      'OTP endpoints',
      'OTP within 30 s',
      'Phones verified',
      'Price: ₹13,500.00',
      'not a guarantee',
      'How to respond',
    ]) {
      expect(text).toContain(part);
    }
    expect(text).not.toContain('DRAFT');
  });

  it('CT-SUM-02 a draft carries the DRAFT watermark', () => {
    render(<ProposalSummaryView summary={summary(version())} />);
    expect(screen.getByText('DRAFT — not yet proposed')).toBeInTheDocument();
    expect(summaryText(summary(version()))).toContain('DRAFT — not yet proposed');
  });
});
