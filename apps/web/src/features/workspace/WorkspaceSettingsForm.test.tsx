import { ApiError } from '@soloops/api-client';
import type { WorkspaceSettingsDto } from '@soloops/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));
const api = vi.hoisted(() => ({ workspaces: { get: vi.fn(), update: vi.fn() } }));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { WorkspaceSettingsForm } from './WorkspaceSettingsForm';

const dto: WorkspaceSettingsDto = {
  id: '0192a000-0000-7000-8000-000000000001',
  name: 'Riya Sen Studio',
  defaultCurrency: 'INR',
  defaultHourlyRateMinor: '150000',
  taxLabel: 'GST',
  taxRateBps: 1800,
  invoicePrefix: 'RS',
  timeZone: 'Asia/Kolkata',
  billingDetails: { legalName: 'Riya Sen', address: null, taxId: null },
  aiEnabled: false,
  rowVersion: 3,
  myRole: 'OWNER',
};

beforeEach(() => vi.clearAllMocks());

describe('S-12 WorkspaceSettingsForm', () => {
  it('shows stored values converted for people (minor units → decimal, bps → percent)', () => {
    render(<WorkspaceSettingsForm initial={dto} />);
    expect(screen.getByLabelText(/Default hourly rate/)).toHaveValue('1500.00');
    expect(screen.getByLabelText(/Tax rate/)).toHaveValue('18.00');
  });

  it('TC-002.1 owner saves: integer units sent with If-Match rowVersion, success announced', async () => {
    api.workspaces.update.mockResolvedValue({
      data: { ...dto, taxRateBps: 1250, rowVersion: 4 },
      etag: '"4"',
    });
    const user = userEvent.setup();
    render(<WorkspaceSettingsForm initial={dto} />);
    const rate = screen.getByLabelText(/Tax rate/);
    await user.clear(rate);
    await user.type(rate, '12.5');
    const hourly = screen.getByLabelText(/Default hourly rate/);
    await user.clear(hourly);
    await user.type(hourly, '1,750.50');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(api.workspaces.update).toHaveBeenCalled());
    const [id, body, rowVersion] = api.workspaces.update.mock.calls[0] ?? [];
    expect(id).toBe(dto.id);
    expect(rowVersion).toBe(3);
    expect(body).toMatchObject({
      taxRateBps: 1250,
      defaultHourlyRateMinor: '175050',
      billingDetails: { address: null },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Settings saved.');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('TC-002.3 rejects a tax rate above 100% before calling the API', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSettingsForm initial={dto} />);
    const rate = screen.getByLabelText(/Tax rate/);
    await user.clear(rate);
    await user.type(rate, '100.01');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByRole('link', { name: /rate from 0 to 100/ })).toBeInTheDocument();
    expect(api.workspaces.update).not.toHaveBeenCalled();
  });

  it('maps server 422 field errors onto the matching inputs', async () => {
    api.workspaces.update.mockRejectedValue(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        title: 'Validation failed',
        errors: [{ path: 'timeZone', message: 'Use an IANA time zone such as Asia/Kolkata.' }],
      }),
    );
    const user = userEvent.setup();
    render(<WorkspaceSettingsForm initial={dto} />);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Time zone/)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(
      screen.getAllByText('Use an IANA time zone such as Asia/Kolkata.').length,
    ).toBeGreaterThan(0);
  });

  it('ERR-005 a 412 shows the conflict banner with Reload', async () => {
    api.workspaces.update.mockRejectedValue(
      new ApiError(412, { code: 'PRECONDITION_FAILED', title: 'This item changed' }),
    );
    const user = userEvent.setup();
    render(<WorkspaceSettingsForm initial={dto} />);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(
      await screen.findByText('These settings changed since you opened them'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('AC-002.2 a MEMBER sees read-only values, a PermissionNotice and no save button', () => {
    render(<WorkspaceSettingsForm initial={{ ...dto, myRole: 'MEMBER' }} />);
    expect(screen.getByText('Only workspace owners can change these settings')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Workspace name/)).toHaveAttribute('readonly');
  });

  it('ERR-008 a 401 sends the user to sign-in with a return path', async () => {
    api.workspaces.update.mockRejectedValue(
      new ApiError(401, { code: 'UNAUTHENTICATED', title: 'Not signed in' }),
    );
    const user = userEvent.setup();
    render(<WorkspaceSettingsForm initial={dto} />);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        `/signin?returnTo=${encodeURIComponent(`/w/${dto.id}/settings`)}`,
      ),
    );
  });
});
