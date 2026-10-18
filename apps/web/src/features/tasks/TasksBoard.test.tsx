import { ApiError } from '@soloops/api-client';
import type { RequirementDto, TaskDto } from '@soloops/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));
const api = vi.hoisted(() => ({ tasks: { create: vi.fn(), update: vi.fn() } }));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { TasksBoard } from './TasksBoard';

const WS = '0192a000-0000-7000-8000-000000000001';
const P = '0192a000-0000-7000-8000-0000000000e1';
const ME = '0192a000-0000-7000-8000-0000000000a1';
const R1 = '0192a000-0000-7000-8000-000000000001';
const R2 = '0192a000-0000-7000-8000-000000000002';
const requirements: RequirementDto[] = [
  {
    id: R1,
    projectId: P,
    number: 1,
    key: 'REQ-1',
    title: 'Customer login',
    description: '',
    acceptanceCriteria: [],
    priority: 'MUST',
    baselineId: '0192a000-0000-7000-8000-0000000000b1',
    rowVersion: 2,
    createdAt: '2026-10-16T09:00:00.000Z',
    updatedAt: '2026-10-16T09:00:00.000Z',
  },
  {
    id: R2,
    projectId: P,
    number: 2,
    key: 'REQ-2',
    title: 'Draft only',
    description: '',
    acceptanceCriteria: [],
    priority: 'COULD',
    baselineId: null,
    rowVersion: 1,
    createdAt: '2026-10-16T09:00:00.000Z',
    updatedAt: '2026-10-16T09:00:00.000Z',
  },
];
const task = (over: Partial<TaskDto>): TaskDto => ({
  id: '0192a000-0000-7000-8000-0000000000f1',
  projectId: P,
  title: 'Build login',
  description: null,
  assigneeUserId: null,
  status: 'TODO',
  billable: false,
  scope: { type: 'INTERNAL', requirementId: null, changeRequestId: null, versionNumber: null },
  rowVersion: 4,
  createdAt: '2026-10-16T09:00:00.000Z',
  updatedAt: '2026-10-16T09:00:00.000Z',
  ...over,
});

const board = (tasks: TaskDto[], readOnly = false) =>
  render(
    <TasksBoard
      workspaceId={WS}
      projectId={P}
      tasks={tasks}
      requirements={requirements}
      currentUserId={ME}
      readOnly={readOnly}
      hasMore={false}
    />,
  );

beforeEach(() => vi.clearAllMocks());

describe('S-09 TasksBoard (FR-014)', () => {
  it('CT-TSK-01 empty state explains where tasks come from', () => {
    board([]);
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Tasks come from baselined requirements or approved change requests/),
    ).toBeInTheDocument();
  });

  it('CT-TSK-02 groups by status and shows ScopeTag, assignee and billable text', () => {
    board([
      task({
        id: 'a',
        title: 'Login API',
        status: 'IN_PROGRESS',
        billable: true,
        assigneeUserId: ME,
        scope: { type: 'BASELINE', requirementId: R1, changeRequestId: null, versionNumber: null },
      }),
      task({ id: 'b', title: 'Set up CI', status: 'TODO' }),
    ]);
    const inProgress = screen.getByRole('region', { name: 'In progress' });
    expect(within(inProgress).getByText('Login API')).toBeInTheDocument();
    expect(within(inProgress).getByText('REQ-1')).toBeInTheDocument();
    expect(within(inProgress).getByText('Me')).toBeInTheDocument();
    expect(within(inProgress).getByText('· Billable')).toBeInTheDocument();
    const todo = screen.getByRole('region', { name: 'To do' });
    expect(within(todo).getByText('Internal (not billable)')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('CT-TSK-03 TC-016.2 changing the status sends only the status with If-Match', async () => {
    api.tasks.update.mockResolvedValue(task({ status: 'DONE', rowVersion: 5 }));
    const user = userEvent.setup();
    board([task({})]);
    await user.selectOptions(screen.getByLabelText('Status of Build login'), 'DONE');
    await waitFor(() =>
      expect(api.tasks.update).toHaveBeenCalledWith(WS, task({}).id, { status: 'DONE' }, 4),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('“Build login” moved to Done.');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CT-TSK-04 BR-015 the scope list offers only baselined requirements and Internal', async () => {
    const user = userEvent.setup();
    board([]);
    await user.click(screen.getByRole('button', { name: 'New task' }));
    const scope = screen.getByLabelText(/Belongs to/);
    const labels = within(scope)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toEqual(['Internal (not billable)', 'Original scope · REQ-1 Customer login']);
  });

  it('CT-TSK-05 AC-016.1 an internal task marked billable gets a field error and no API call', async () => {
    const user = userEvent.setup();
    board([]);
    await user.click(screen.getByRole('button', { name: 'New task' }));
    await user.type(screen.getByLabelText(/Title/), 'Sneaky');
    await user.click(screen.getByLabelText('Billable'));
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    const billable = screen.getByLabelText('Billable');
    await waitFor(() => expect(billable).toHaveAttribute('aria-invalid', 'true'));
    expect(billable).toHaveAccessibleDescription(/must belong to a baselined requirement/);
    expect(api.tasks.create).not.toHaveBeenCalled();
  });

  it('CT-TSK-06 creates a billable task linked to a baselined requirement, assigned to me', async () => {
    api.tasks.create.mockResolvedValue(task({}));
    const user = userEvent.setup();
    board([]);
    await user.click(screen.getByRole('button', { name: 'New task' }));
    await user.type(screen.getByLabelText(/Title/), 'Login screen');
    await user.selectOptions(screen.getByLabelText(/Belongs to/), R1);
    await user.selectOptions(screen.getByLabelText(/Assignee/), ME);
    await user.click(screen.getByLabelText('Billable'));
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(api.tasks.create).toHaveBeenCalled());
    expect(api.tasks.create).toHaveBeenCalledWith(WS, P, {
      title: 'Login screen',
      description: null,
      scope: { type: 'BASELINE', requirementId: R1 },
      billable: true,
      assigneeUserId: ME,
      status: 'TODO',
    });
  });

  it('CT-TSK-07 AC-016.2 a server assignee error is shown on the assignee field', async () => {
    api.tasks.create.mockRejectedValue(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        title: 'Validation failed',
        errors: [
          { path: 'assigneeUserId', message: 'The assignee must be a member of this workspace.' },
        ],
      }),
    );
    const user = userEvent.setup();
    board([]);
    await user.click(screen.getByRole('button', { name: 'New task' }));
    await user.type(screen.getByLabelText(/Title/), 'X');
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    const assignee = screen.getByLabelText(/Assignee/);
    await waitFor(() =>
      expect(assignee).toHaveAccessibleDescription(/must be a member of this workspace/),
    );
  });

  it('CT-TSK-08 BR-015 a server NOT_ELIGIBLE on the scope maps to the scope field', async () => {
    api.tasks.create.mockRejectedValue(
      new ApiError(422, {
        code: 'NOT_ELIGIBLE',
        title: 'Not allowed for this work',
        errors: [
          {
            path: 'scope.requirementId',
            message: 'This requirement is not baselined yet. Baseline the scope first.',
          },
        ],
      }),
    );
    const user = userEvent.setup();
    board([]);
    await user.click(screen.getByRole('button', { name: 'New task' }));
    await user.type(screen.getByLabelText(/Title/), 'X');
    await user.selectOptions(screen.getByLabelText(/Belongs to/), R1);
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Belongs to/)).toHaveAccessibleDescription(/not baselined yet/),
    );
  });

  it('CT-TSK-09 BR-029 a read-only project shows statuses as text and no actions', () => {
    board([task({ status: 'DONE' })], true);
    expect(screen.getByText('Archived — read-only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New task' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status of Build login')).not.toBeInTheDocument();
  });

  it('CT-TSK-10 ERR-005 a stale status change shows the conflict banner', async () => {
    api.tasks.update.mockRejectedValue(
      new ApiError(412, { code: 'PRECONDITION_FAILED', title: 'This item changed' }),
    );
    const user = userEvent.setup();
    board([task({})]);
    await user.selectOptions(screen.getByLabelText('Status of Build login'), 'IN_PROGRESS');
    expect(await screen.findByText('This item changed since you opened it')).toBeInTheDocument();
  });
});

describe('S-09 TasksBoard links to approved change requests (BR-012, BR-013)', () => {
  const CR = '0192a000-0000-7000-8000-0000000000d3';
  const approved = [
    { changeRequestId: CR, key: 'CR-3', versionNumber: 2, title: 'WhatsApp OTP login' },
  ];
  const crBoard = (tasks: TaskDto[]) =>
    render(
      <TasksBoard
        workspaceId={WS}
        projectId={P}
        tasks={tasks}
        requirements={requirements}
        approvedVersions={approved}
        currentUserId={ME}
        readOnly={false}
        hasMore={false}
      />,
    );

  it('CT-TSK-11 approved versions are offered and a billable task links to one', async () => {
    api.tasks.create.mockResolvedValue(task({}));
    const user = userEvent.setup();
    crBoard([]);
    await user.click(screen.getByRole('button', { name: 'New task' }));
    const scope = screen.getByLabelText(/Belongs to/);
    expect(
      within(scope).getByRole('option', { name: 'Additional · CR-3 v2 WhatsApp OTP login' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Title/), 'OTP endpoint');
    await user.selectOptions(scope, `cr:${CR}:2`);
    await user.click(screen.getByLabelText('Billable'));
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(api.tasks.create).toHaveBeenCalled());
    expect(api.tasks.create.mock.calls[0]?.[2]).toMatchObject({
      billable: true,
      scope: { type: 'CHANGE_REQUEST', changeRequestId: CR, versionNumber: 2 },
    });
  });

  it('CT-TSK-12 a task on an earlier (superseded) approval keeps its link selectable when edited', async () => {
    const user = userEvent.setup();
    crBoard([
      task({
        billable: true,
        scope: {
          type: 'CHANGE_REQUEST',
          requirementId: null,
          changeRequestId: CR,
          versionNumber: 1,
        },
      }),
    ]);
    expect(screen.getByText('CR-3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit Build login' }));
    const scope = screen.getByLabelText(/Belongs to/) as HTMLSelectElement;
    expect(scope.value).toBe(`cr:${CR}:1`);
    expect(
      within(scope).getByRole('option', { name: /CR v1 \(earlier approval\)/ }),
    ).toBeInTheDocument();
  });

  it('CT-TSK-13 no "No baseline yet" hint when an approved change request can authorise work', () => {
    crBoard([]);
    expect(screen.queryByText('No baseline yet')).not.toBeInTheDocument();
  });
});
