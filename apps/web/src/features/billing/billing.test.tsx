import { ApiError, ClientError } from '@soloops/api-client';
import type { EntryDto, EntryListResponse, RequirementDto, TaskDto } from '@soloops/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));
const api = vi.hoisted(() => ({
  billableEntries: { create: vi.fn(), delete: vi.fn() },
  invoices: { create: vi.fn() },
}));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { BillingBoard } from './BillingBoard';
import { linkOptions, makeLogWorkSchema, toEntryRequest } from './log-work-form';

const WS = '0192a000-0000-7000-8000-000000000001';
const P = '0192a000-0000-7000-8000-0000000000e1';
const R1 = '0192a000-0000-7000-8000-000000000001';
const CR = '0192a000-0000-7000-8000-0000000000d3';
const T1 = '0192a000-0000-7000-8000-0000000000f1';

const entry = (over: Partial<EntryDto> = {}): EntryDto => ({
  id: '0192a000-0000-7000-8000-0000000000e9',
  projectId: P,
  kind: 'TIME',
  workDate: '2026-10-15',
  minutes: 120,
  amountMinor: null,
  currency: 'INR',
  description: 'OTP verification endpoint',
  taskId: null,
  scope: { type: 'BASELINE', requirementId: R1, changeRequestId: null, versionNumber: null },
  scopeLabel: 'REQ-2',
  scopeKind: 'ORIGINAL',
  invoiceId: null,
  eligibility: { eligible: true },
  hourlyRateMinor: '150000',
  billableAmountMinor: '300000',
  createdByUserId: WS,
  rowVersion: 1,
  createdAt: '2026-10-15T00:00:00.000Z',
  ...over,
});
const requirements: RequirementDto[] = [
  {
    id: R1,
    projectId: P,
    number: 2,
    key: 'REQ-2',
    title: 'Login API',
    description: '',
    acceptanceCriteria: [],
    priority: 'MUST',
    baselineId: '0192a000-0000-7000-8000-0000000000b1',
    rowVersion: 2,
    createdAt: '2026-10-12T00:00:00Z',
    updatedAt: '2026-10-12T00:00:00Z',
  },
];
const tasks: TaskDto[] = [
  {
    id: T1,
    projectId: P,
    title: 'OTP endpoint',
    description: null,
    assigneeUserId: null,
    status: 'TODO',
    billable: true,
    scope: { type: 'CHANGE_REQUEST', requirementId: null, changeRequestId: CR, versionNumber: 2 },
    rowVersion: 1,
    createdAt: '2026-10-12T00:00:00Z',
    updatedAt: '2026-10-12T00:00:00Z',
  },
  {
    id: '0192a000-0000-7000-8000-0000000000f2',
    projectId: P,
    title: 'Internal chores',
    description: null,
    assigneeUserId: null,
    status: 'TODO',
    billable: false,
    scope: { type: 'INTERNAL', requirementId: null, changeRequestId: null, versionNumber: null },
    rowVersion: 1,
    createdAt: '2026-10-12T00:00:00Z',
    updatedAt: '2026-10-12T00:00:00Z',
  },
];
const approved = [{ changeRequestId: CR, key: 'CR-3', versionNumber: 2, title: 'WhatsApp OTP' }];
const list = (over: Partial<EntryListResponse> = {}): EntryListResponse => ({
  eligible: [],
  ineligible: [],
  eligibleTotalMinor: '0',
  currency: 'INR',
  truncated: false,
  ...over,
});
const board = (l: EntryListResponse, readOnly = false) =>
  render(
    <BillingBoard
      workspaceId={WS}
      projectId={P}
      list={l}
      tasks={tasks}
      requirements={requirements}
      approvedVersions={approved}
      today="2026-10-16"
      readOnly={readOnly}
    />,
  );

beforeEach(() => vi.clearAllMocks());

describe('S-10 BillingBoard (FR-041, AC-018.1, AC-018.2)', () => {
  it('CT-BIL-01 empty state', () => {
    board(list());
    expect(screen.getByText('No unbilled work')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log work' })).toBeInTheDocument();
  });

  it('CT-BIL-02 AC-018.2 sections, amounts and the total come from the server, not the rows', () => {
    // The total deliberately differs from the row amount: the UI must show the server value.
    board(list({ eligible: [entry()], eligibleTotalMinor: '999900' }));
    const ready = screen.getByRole('region', { name: 'Ready to invoice (1)' });
    expect(within(ready).getByText('₹9,999.00')).toBeInTheDocument();
    expect(within(ready).getByText(/2 h × ₹1,500.00\/h = ₹3,000.00/)).toBeInTheDocument();
    expect(within(ready).getByText('REQ-2')).toBeInTheDocument();
    expect(within(ready).getByText(/15 Oct 2026/)).toBeInTheDocument();
  });

  it('CT-BIL-03 AC-018.1 each ineligible entry shows its reason, the explanation and a fix', () => {
    board(
      list({
        ineligible: [
          entry({
            id: '0192a000-0000-7000-8000-0000000000e1',
            description: 'Excel export spike',
            scope: {
              type: 'CHANGE_REQUEST',
              requirementId: null,
              changeRequestId: CR,
              versionNumber: 1,
            },
            scopeKind: 'ADDITIONAL',
            scopeLabel: 'CR-4 v1',
            eligibility: {
              eligible: false,
              reason: 'CR_NOT_APPROVED',
              explanation: 'CR-4 v1 is waiting for the client’s decision.',
            },
          }),
          entry({
            id: '0192a000-0000-7000-8000-0000000000e2',
            description: 'Misc fixes',
            scope: {
              type: 'NONE',
              requirementId: null,
              changeRequestId: null,
              versionNumber: null,
            },
            scopeKind: 'NONE',
            scopeLabel: null,
            eligibility: { eligible: false, reason: 'UNSCOPED', explanation: 'Not linked.' },
          }),
        ],
      }),
    );
    const section = screen.getByRole('region', { name: 'Not billable yet (2)' });
    expect(within(section).getByText('Change request not approved')).toBeInTheDocument();
    expect(within(section).getByText(/waiting for the client’s decision/)).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Open change request' })).toHaveAttribute(
      'href',
      `/w/${WS}/projects/${P}/change-requests/${CR}`,
    );
    expect(within(section).getByText('Not linked to agreed scope')).toBeInTheDocument();
    // S-10: all ineligible → a warning explains nothing can be invoiced.
    expect(screen.getByText('Nothing can be invoiced yet')).toBeInTheDocument();
  });

  it('CT-BIL-04 delete asks for confirmation and calls the API', async () => {
    api.billableEntries.delete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    board(list({ eligible: [entry()], eligibleTotalMinor: '300000' }));
    await user.click(screen.getByRole('button', { name: 'Delete “OTP verification endpoint”' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete entry' }),
    );
    await waitFor(() => expect(api.billableEntries.delete).toHaveBeenCalledWith(WS, entry().id));
    expect(await screen.findByRole('status')).toHaveTextContent('deleted');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CT-BIL-05 AC-017.3 a 409 ALREADY_INVOICED delete shows the explanation', async () => {
    api.billableEntries.delete.mockRejectedValue(
      new ApiError(409, {
        code: 'ALREADY_INVOICED',
        title: 'Already invoiced',
        detail: 'This work is on an invoice and can no longer be edited or deleted.',
      }),
    );
    const user = userEvent.setup();
    board(list({ eligible: [entry()] }));
    await user.click(screen.getByRole('button', { name: /Delete “/ }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete entry' }),
    );
    expect(await screen.findByText(/can no longer be edited or deleted/)).toBeInTheDocument();
  });

  it('CT-BIL-06 BR-029 read-only hides logging and deleting (eligible work stays invoiceable); invoiced entries have no delete', () => {
    const { unmount } = board(list({ eligible: [entry()] }), true);
    expect(screen.queryByRole('button', { name: 'Log work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create invoice draft (0)' })).toBeDisabled();
    expect(screen.getByText('Archived — read-only')).toBeInTheDocument();
    unmount();
    board(
      list({
        ineligible: [
          entry({
            invoiceId: '0192a000-0000-7000-8000-0000000000c1',
            eligibility: {
              eligible: false,
              reason: 'ALREADY_INVOICED',
              explanation: 'On an invoice.',
            },
          }),
        ],
      }),
    );
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('CT-BIL-07 a truncated list says so', () => {
    board(list({ eligible: [entry()], truncated: true }));
    expect(screen.getByText('Showing the newest entries only')).toBeInTheDocument();
  });
});

describe('S-10 Log work (FR-040, AC-017.1)', () => {
  it('CT-LOG-01 hours and minutes become integer minutes; the link maps to the task', async () => {
    api.billableEntries.create.mockResolvedValue(entry());
    const user = userEvent.setup();
    board(list());
    await user.click(screen.getByRole('button', { name: 'Log work' }));
    await user.type(screen.getByLabelText('Hours'), '1');
    await user.type(screen.getByLabelText('Minutes'), '30');
    await user.selectOptions(screen.getByLabelText(/Belongs to/), `task:${T1}`);
    await user.type(screen.getByLabelText(/Description/), 'OTP endpoint');
    await user.click(screen.getAllByRole('button', { name: 'Log work' }).at(-1) as HTMLElement);
    await waitFor(() => expect(api.billableEntries.create).toHaveBeenCalled());
    expect(api.billableEntries.create).toHaveBeenCalledWith(
      WS,
      P,
      {
        kind: 'TIME',
        minutes: 90,
        workDate: '2026-10-16',
        description: 'OTP endpoint',
        taskId: T1,
      },
      expect.any(String),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('ready to invoice');
  });

  it('CT-LOG-02 the server explanation is shown when the logged work is not billable', async () => {
    api.billableEntries.create.mockResolvedValue(
      entry({ eligibility: { eligible: false, reason: 'UNSCOPED', explanation: 'Not linked.' } }),
    );
    const user = userEvent.setup();
    board(list());
    await user.click(screen.getByRole('button', { name: 'Log work' }));
    await user.type(screen.getByLabelText('Minutes'), '45');
    await user.type(screen.getByLabelText(/Description/), 'Call');
    await user.click(screen.getAllByRole('button', { name: 'Log work' }).at(-1) as HTMLElement);
    expect(await screen.findByRole('status')).toHaveTextContent('not billable yet: Not linked.');
  });

  it('CT-LOG-03 a zero duration and a future date are refused before calling the API', async () => {
    const user = userEvent.setup();
    board(list());
    await user.click(screen.getByRole('button', { name: 'Log work' }));
    const date = screen.getByLabelText(/Date/);
    expect(date).toHaveAttribute('max', '2026-10-16');
    await user.clear(date);
    await user.type(date, '2026-10-17');
    await user.type(screen.getByLabelText(/Description/), 'x');
    await user.click(screen.getAllByRole('button', { name: 'Log work' }).at(-1) as HTMLElement);
    expect(
      await screen.findByText('Enter a duration from 1 minute to 24 hours.', { selector: 'span' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('The work date cannot be in the future.').length).toBeGreaterThan(0);
    expect(api.billableEntries.create).not.toHaveBeenCalled();
  });

  it('CT-LOG-04 FIXED converts the decimal amount to minor units without floats', async () => {
    api.billableEntries.create.mockResolvedValue(entry());
    const user = userEvent.setup();
    board(list());
    await user.click(screen.getByRole('button', { name: 'Log work' }));
    await user.selectOptions(screen.getByLabelText(/Kind/), 'FIXED');
    await user.type(screen.getByLabelText(/Amount/), '1,500.50');
    await user.selectOptions(screen.getByLabelText(/Belongs to/), `req:${R1}`);
    await user.type(screen.getByLabelText(/Description/), 'Setup fee');
    await user.click(screen.getAllByRole('button', { name: 'Log work' }).at(-1) as HTMLElement);
    await waitFor(() => expect(api.billableEntries.create).toHaveBeenCalled());
    expect(api.billableEntries.create.mock.calls[0]?.[2]).toEqual({
      kind: 'FIXED',
      amountMinor: '150050',
      workDate: '2026-10-16',
      description: 'Setup fee',
      scope: { type: 'BASELINE', requirementId: R1 },
    });
  });

  it('CT-LOG-05 a network error keeps the form and retries with the SAME key', async () => {
    api.billableEntries.create
      .mockRejectedValueOnce(new ClientError('NETWORK_ERROR', 'Could not reach the server.'))
      .mockResolvedValueOnce(entry());
    const user = userEvent.setup();
    board(list());
    await user.click(screen.getByRole('button', { name: 'Log work' }));
    await user.type(screen.getByLabelText('Hours'), '2');
    await user.type(screen.getByLabelText(/Description/), 'Work');
    const submit = () => screen.getAllByRole('button', { name: 'Log work' }).at(-1) as HTMLElement;
    await user.click(submit());
    expect(await screen.findByText(/retry safely/)).toBeInTheDocument();
    await user.click(submit());
    await waitFor(() => expect(api.billableEntries.create).toHaveBeenCalledTimes(2));
    const [k1, k2] = api.billableEntries.create.mock.calls.map((c) => c[3]);
    expect(k1).toBe(k2);
  });

  it('CT-LOG-06 server field errors map onto the form (minutes → hours, scope → link)', async () => {
    api.billableEntries.create.mockRejectedValue(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        title: 'Some fields need attention.',
        errors: [
          {
            path: 'scope.changeRequestId',
            message: 'Choose a change-request version of this project.',
          },
        ],
      }),
    );
    const user = userEvent.setup();
    board(list());
    await user.click(screen.getByRole('button', { name: 'Log work' }));
    await user.type(screen.getByLabelText('Hours'), '1');
    await user.selectOptions(screen.getByLabelText(/Belongs to/), `cr:${CR}:2`);
    await user.type(screen.getByLabelText(/Description/), 'Work');
    await user.click(screen.getAllByRole('button', { name: 'Log work' }).at(-1) as HTMLElement);
    await waitFor(() =>
      expect(screen.getByLabelText(/Belongs to/)).toHaveAccessibleDescription(
        /Choose a change-request version of this project./,
      ),
    );
  });
});

describe('log-work-form helpers', () => {
  it('UT-LOG-01 only billable tasks are offered; draft requirements are labelled', () => {
    const labels = linkOptions(tasks, [{ ...requirements[0]!, baselineId: null }], approved).map(
      (o) => o.label,
    );
    expect(labels).toEqual([
      'Not linked to agreed scope (not billable)',
      'Task · OTP endpoint',
      'Original scope · REQ-2 Login API (not baselined)',
      'Additional · CR-3 v2 WhatsApp OTP',
    ]);
  });

  it('UT-LOG-02 1440 minutes is the maximum; FIXED needs an amount above zero', () => {
    const schema = makeLogWorkSchema('INR', '2026-10-16');
    const base = {
      kind: 'TIME' as const,
      workDate: '2026-10-16',
      hours: '24',
      minutes: '',
      amount: '',
      description: 'x',
      link: 'NONE',
    };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, minutes: '1' }).success).toBe(false);
    expect(schema.safeParse({ ...base, hours: '1.5' }).success).toBe(false);
    expect(schema.safeParse({ ...base, kind: 'FIXED', amount: '0' }).success).toBe(false);
    expect(schema.safeParse({ ...base, kind: 'FIXED', amount: '0.01' }).success).toBe(true);
    const v = schema.parse({ ...base, hours: '', minutes: '5', link: `cr:${CR}:2` });
    expect(toEntryRequest(v, 'INR')).toEqual({
      kind: 'TIME',
      minutes: 5,
      workDate: '2026-10-16',
      description: 'x',
      scope: { type: 'CHANGE_REQUEST', changeRequestId: CR, versionNumber: 2 },
    });
  });
});

describe('S-10 create an invoice draft (FR-042)', () => {
  const two = () =>
    board(
      list({
        eligible: [
          entry(),
          entry({ id: '0192a000-0000-7000-8000-0000000000e8', description: 'Login API' }),
        ],
        eligibleTotalMinor: '600000',
      }),
    );

  it('CT-BIL-08 selecting ready work enables the draft and opens it', async () => {
    api.invoices.create.mockResolvedValue({ id: '0192a000-0000-7000-8000-0000000000c1' });
    const user = userEvent.setup();
    two();
    const create = () => screen.getByRole('button', { name: /Create invoice draft/ });
    expect(create()).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Select “Login API”' }));
    expect(create()).toHaveAccessibleName('Create invoice draft (1)');
    await user.click(screen.getByRole('checkbox', { name: 'Select all ready work' }));
    await user.click(create());
    await waitFor(() =>
      expect(api.invoices.create).toHaveBeenCalledWith(
        WS,
        { projectId: P, entryIds: [entry().id, '0192a000-0000-7000-8000-0000000000e8'] },
        expect.any(String),
      ),
    );
    expect(router.push).toHaveBeenCalledWith(
      `/w/${WS}/billing/invoices/0192a000-0000-7000-8000-0000000000c1`,
    );
  });

  it('CT-BIL-09 AC-019.2 a refused draft explains why; a network error keeps the key', async () => {
    api.invoices.create
      .mockRejectedValueOnce(new ClientError('NETWORK_ERROR', 'Could not reach the server.'))
      .mockRejectedValueOnce(
        new ApiError(422, {
          code: 'NOT_ELIGIBLE',
          title: 'Not allowed for this work',
          detail: 'Some selected work cannot be invoiced.',
          errors: [{ path: 'entryIds.0', message: 'Login API: not linked.' }],
        }),
      );
    const user = userEvent.setup();
    two();
    await user.click(screen.getByRole('checkbox', { name: 'Select “Login API”' }));
    await user.click(screen.getByRole('button', { name: /Create invoice draft/ }));
    expect(await screen.findByText(/retry safely/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Create invoice draft/ }));
    expect(await screen.findByText(/Login API: not linked\./)).toBeInTheDocument();
    const [k1, k2] = api.invoices.create.mock.calls.map((c) => c[2]);
    expect(k1).toBe(k2);
  });
});
