import { ApiError } from '@soloops/api-client';
import type { ProjectDto } from '@soloops/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));
const api = vi.hoisted(() => ({ projects: { create: vi.fn(), update: vi.fn() } }));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { ProjectForm } from './ProjectForm';
import { toProjectRequest, projectFormSchema } from './project-form';

const WS = '0192a000-0000-7000-8000-000000000001';
const C1 = '0192a000-0000-7000-8000-0000000000c1';
const C2 = '0192a000-0000-7000-8000-0000000000c2';
const clients = [
  { id: C1, name: 'Das Sweets' },
  { id: C2, name: 'Sen Studio' },
];
const project: ProjectDto = {
  id: '0192a000-0000-7000-8000-0000000000e1',
  clientId: C1,
  clientName: 'Das Sweets',
  name: 'Online ordering app',
  description: null,
  billingModel: 'HOURLY',
  currency: 'INR',
  hourlyRateMinor: '150000',
  startDate: '2026-10-01',
  status: 'ACTIVE',
  archivedAt: null,
  readOnly: false,
  rowVersion: 2,
  createdAt: '2026-10-16T09:00:00.000Z',
  updatedAt: '2026-10-16T09:00:00.000Z',
};

beforeEach(() => vi.clearAllMocks());

describe('S-03 ProjectForm (FR-011)', () => {
  it('UT-PRJ-01 BR-019 the rate is converted to minor units without floats; empty means workspace default', () => {
    const parse = (hourlyRate: string, currency = 'INR') =>
      toProjectRequest(
        projectFormSchema.parse({
          clientId: C1,
          name: 'P',
          description: '',
          billingModel: 'HOURLY',
          currency,
          hourlyRate,
          startDate: '',
          status: 'ACTIVE',
        }),
      );
    expect(parse('1,500.50').hourlyRateMinor).toBe('150050');
    expect(parse('0.1').hourlyRateMinor).toBe('10');
    expect(parse('').hourlyRateMinor).toBeNull();
    expect(parse('1500', 'JPY').hourlyRateMinor).toBe('1500');
    expect(parse('').startDate).toBeNull();
    expect(parse('').description).toBeNull();
  });

  it.each(['1500.555', 'abc', '-5'])('UT-PRJ-02 rejects the rate %s', (hourlyRate) => {
    const r = projectFormSchema.safeParse({
      clientId: C1,
      name: 'P',
      description: '',
      billingModel: 'HOURLY',
      currency: 'INR',
      hourlyRate,
      startDate: '',
      status: 'ACTIVE',
    });
    expect(r.success).toBe(false);
  });

  it('CT-PRJ-01 TC-005.1 creates a project for the chosen client with the workspace currency by default', async () => {
    api.projects.create.mockResolvedValue({ ...project, id: 'new-project' });
    const user = userEvent.setup();
    render(<ProjectForm workspaceId={WS} clients={clients} defaultCurrency="INR" />);
    await user.selectOptions(screen.getByLabelText(/Client/), C2);
    await user.type(screen.getByLabelText(/Project name/), 'Website');
    await user.selectOptions(screen.getByLabelText(/Billing model/), 'FIXED');
    await user.type(screen.getByLabelText(/Start date/), '2026-11-01');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(api.projects.create).toHaveBeenCalled());
    expect(api.projects.create).toHaveBeenCalledWith(WS, {
      clientId: C2,
      name: 'Website',
      description: null,
      billingModel: 'FIXED',
      currency: 'INR',
      hourlyRateMinor: null,
      startDate: '2026-11-01',
      status: 'ACTIVE',
    });
    expect(router.push).toHaveBeenCalledWith(`/w/${WS}/projects/new-project`);
  });

  it('CT-PRJ-02 AC-005.2 an archived client (409) is explained in a banner', async () => {
    api.projects.create.mockRejectedValue(
      new ApiError(409, {
        code: 'ARCHIVED',
        title: 'Archived',
        detail: 'This client is archived. New projects cannot be added to it.',
      }),
    );
    const user = userEvent.setup();
    render(<ProjectForm workspaceId={WS} clients={clients} defaultCurrency="INR" />);
    await user.type(screen.getByLabelText(/Project name/), 'Website');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Archived — read-only')).toBeInTheDocument();
    expect(
      screen.getByText('This client is archived. New projects cannot be added to it.'),
    ).toBeInTheDocument();
  });

  it('CT-PRJ-03 editing shows decimal values, never sends clientId, and uses If-Match', async () => {
    api.projects.update.mockResolvedValue({ ...project, status: 'ON_HOLD', rowVersion: 3 });
    const user = userEvent.setup();
    render(<ProjectForm workspaceId={WS} clients={[]} defaultCurrency="INR" initial={project} />);
    expect(screen.getByLabelText(/Hourly rate/)).toHaveValue('1500.00');
    expect(screen.queryByLabelText(/^Client/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/Status/), 'ON_HOLD');
    await user.click(screen.getByRole('button', { name: 'Save project' }));
    await waitFor(() => expect(api.projects.update).toHaveBeenCalled());
    const [, id, body, rowVersion] = api.projects.update.mock.calls[0] ?? [];
    expect(id).toBe(project.id);
    expect(rowVersion).toBe(2);
    expect(body).not.toHaveProperty('clientId');
    expect(body).toMatchObject({ status: 'ON_HOLD', hourlyRateMinor: '150000' });
  });

  it('CT-PRJ-04 BR-029 a read-only project disables every field and hides Save', () => {
    render(
      <ProjectForm
        workspaceId={WS}
        clients={[]}
        defaultCurrency="INR"
        initial={{ ...project, readOnly: true, archivedAt: '2026-10-16T09:00:00Z' }}
      />,
    );
    expect(screen.getByText('Archived — read-only')).toBeInTheDocument();
    expect(screen.getByLabelText(/Project name/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save project' })).not.toBeInTheDocument();
  });

  it('CT-PRJ-05 server field errors map onto the rate field', async () => {
    api.projects.create.mockRejectedValue(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        title: 'Validation failed',
        errors: [{ path: 'hourlyRateMinor', message: 'Amount is too large.' }],
      }),
    );
    const user = userEvent.setup();
    render(<ProjectForm workspaceId={WS} clients={clients} defaultCurrency="INR" />);
    await user.type(screen.getByLabelText(/Project name/), 'Website');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    const rate = screen.getByLabelText(/Hourly rate/);
    await waitFor(() => expect(rate).toHaveAccessibleDescription(/Amount is too large\./));
    expect(rate).toHaveAttribute('aria-invalid', 'true');
  });
});
