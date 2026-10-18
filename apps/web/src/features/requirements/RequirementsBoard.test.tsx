import { ApiError } from '@soloops/api-client';
import type { BaselineDto, RequirementDto } from '@soloops/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));
const api = vi.hoisted(() => ({
  requirements: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  baselines: { create: vi.fn() },
}));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { RequirementsBoard } from './RequirementsBoard';
import { criteriaLines, requirementFormSchema } from './requirement-form';

const WS = '0192a000-0000-7000-8000-000000000001';
const P = '0192a000-0000-7000-8000-0000000000e1';
const B1 = '0192a000-0000-7000-8000-0000000000b1';
const req = (n: number, over: Partial<RequirementDto> = {}): RequirementDto => ({
  id: `0192a000-0000-7000-8000-00000000000${n}`,
  projectId: P,
  number: n,
  key: `REQ-${n}`,
  title: `Requirement ${n}`,
  description: '',
  acceptanceCriteria: [],
  priority: 'MUST',
  baselineId: null,
  rowVersion: 1,
  createdAt: '2026-10-16T09:00:00.000Z',
  updatedAt: '2026-10-16T09:00:00.000Z',
  ...over,
});
const baseline: BaselineDto = {
  id: B1,
  projectId: P,
  sequence: 1,
  requirementCount: 1,
  contentHash: '5c1e0b'.padEnd(64, 'a'),
  createdByUserId: '0192a000-0000-7000-8000-0000000000a1',
  createdAt: '2026-10-03T09:00:00.000Z',
};

const board = (requirements: RequirementDto[], baselines: BaselineDto[] = [], readOnly = false) =>
  render(
    <RequirementsBoard
      workspaceId={WS}
      projectId={P}
      requirements={requirements}
      baselines={baselines}
      readOnly={readOnly}
    />,
  );

beforeEach(() => vi.clearAllMocks());

describe('S-05 requirement form helpers', () => {
  it('UT-REQ-01 criteria are one per line; blank lines dropped; >30 or >300 chars refused', () => {
    expect(criteriaLines(' a \n\n b\r\nc ')).toEqual(['a', 'b', 'c']);
    const base = { title: 'T', description: '', priority: 'MUST' as const };
    const many = Array.from({ length: 31 }, (_, i) => `AC ${i}`).join('\n');
    expect(requirementFormSchema.safeParse({ ...base, acceptanceCriteria: many }).success).toBe(
      false,
    );
    expect(
      requirementFormSchema.safeParse({ ...base, acceptanceCriteria: 'x'.repeat(301) }).success,
    ).toBe(false);
    expect(requirementFormSchema.safeParse({ ...base, acceptanceCriteria: '' }).success).toBe(true);
  });
});

describe('S-05 RequirementsBoard (FR-012, FR-013)', () => {
  it('CT-REQ-01 empty state explains the next step; baseline is disabled with a reason (AC-007.3)', () => {
    board([]);
    expect(screen.getByText('Record what the client asked for originally')).toBeInTheDocument();
    const baselineButton = screen.getByRole('button', { name: 'Baseline scope…' });
    expect(baselineButton).toBeDisabled();
    expect(baselineButton).toHaveAccessibleDescription(/Add a requirement before/);
  });

  it('CT-REQ-02 AC-007.2 drafts are editable; frozen requirements offer no edit or delete', () => {
    board([req(1, { baselineId: B1 }), req(2)], [baseline]);
    const drafts = screen.getByRole('region', { name: /Draft \(not yet agreed\) — 1/ });
    expect(within(drafts).getByRole('button', { name: 'Edit REQ-2' })).toBeInTheDocument();
    expect(within(drafts).getByRole('button', { name: 'Delete REQ-2' })).toBeInTheDocument();
    const frozen = screen.getByRole('region', { name: /Original scope · Baseline 1/ });
    expect(within(frozen).getByText('REQ-1')).toBeInTheDocument();
    expect(within(frozen).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(frozen).getByText(/Changes to these requirements need a change request/),
    ).toBeInTheDocument();
    expect(within(frozen).getByText('5c1e0baa…')).toBeInTheDocument();
  });

  it('CT-REQ-03 TC-006.1 adding a requirement sends trimmed criteria lines and refreshes', async () => {
    api.requirements.create.mockResolvedValue(req(1));
    const user = userEvent.setup();
    board([]);
    await user.click(screen.getByRole('button', { name: 'Add requirement' }));
    const form = screen.getByRole('form', { name: 'Add requirement' });
    await user.type(within(form).getByLabelText(/Title/), 'Customer login');
    await user.type(
      within(form).getByLabelText(/Acceptance criteria/),
      'Login works{enter}{enter}Lockout after 5 tries',
    );
    await user.selectOptions(within(form).getByLabelText(/Priority/), 'SHOULD');
    await user.click(within(form).getByRole('button', { name: 'Add requirement' }));
    await waitFor(() => expect(api.requirements.create).toHaveBeenCalled());
    expect(api.requirements.create).toHaveBeenCalledWith(WS, P, {
      title: 'Customer login',
      description: '',
      acceptanceCriteria: ['Login works', 'Lockout after 5 tries'],
      priority: 'SHOULD',
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CT-REQ-04 AC-007.1 the baseline dialog states exactly what will be frozen; confirm creates it', async () => {
    api.baselines.create.mockResolvedValue({ ...baseline, sequence: 2, requirementCount: 2 });
    const user = userEvent.setup();
    board([req(1, { baselineId: B1 }), req(2), req(3)], [baseline]);
    await user.click(screen.getByRole('button', { name: 'Baseline scope…' }));
    const dialog = screen.getByRole('dialog', { name: 'Freeze 2 requirements as Baseline 2?' });
    expect(within(dialog).getByText(/can’t be edited or deleted afterwards/)).toBeInTheDocument();
    expect(within(dialog).getByText('REQ-2')).toBeInTheDocument();
    expect(within(dialog).getByText('REQ-3')).toBeInTheDocument();
    expect(within(dialog).queryByText('REQ-1')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Create Baseline 2' }));
    await waitFor(() => expect(api.baselines.create).toHaveBeenCalledWith(WS, P));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Baseline 2 created: 2 requirements frozen.',
    );
  });

  it('CT-REQ-05 cancelling the baseline dialog changes nothing', async () => {
    const user = userEvent.setup();
    board([req(1)]);
    await user.click(screen.getByRole('button', { name: 'Baseline scope…' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.baselines.create).not.toHaveBeenCalled();
  });

  it('CT-REQ-06 deleting a draft asks first and keeps the number unused', async () => {
    api.requirements.delete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    board([req(1), req(2)]);
    await user.click(screen.getByRole('button', { name: 'Delete REQ-2' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete REQ-2?' });
    expect(within(dialog).getByText(/REQ-2 is not reused/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete REQ-2' }));
    await waitFor(() => expect(api.requirements.delete).toHaveBeenCalledWith(WS, req(2).id));
  });

  it('CT-REQ-07 AC-007.2 a 409 BASELINE_LOCKED from the server is explained', async () => {
    api.requirements.update.mockRejectedValue(
      new ApiError(409, {
        code: 'BASELINE_LOCKED',
        title: 'Requirement is baselined',
        detail: 'Record the change as a change request instead.',
      }),
    );
    const user = userEvent.setup();
    board([req(1)]);
    await user.click(screen.getByRole('button', { name: 'Edit REQ-1' }));
    await user.click(screen.getByRole('button', { name: 'Save requirement' }));
    expect(await screen.findByText('This requirement is baselined')).toBeInTheDocument();
    expect(screen.getByText('Record the change as a change request instead.')).toBeInTheDocument();
  });

  it('CT-REQ-08 BR-029 an archived project shows the banner and no actions', () => {
    board([req(1)], [], true);
    expect(screen.getByText('Archived — read-only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add requirement' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit REQ-1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete REQ-1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Baseline scope…' })).not.toBeInTheDocument();
  });
});
