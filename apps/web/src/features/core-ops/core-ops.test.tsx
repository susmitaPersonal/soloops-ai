import { ApiError, ClientError } from '@soloops/api-client';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => nav.pathname }));
const api = vi.hoisted(() => ({
  clients: { archive: vi.fn(), create: vi.fn() },
  projects: { archive: vi.fn(), create: vi.fn() },
}));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { AddClientPanel } from '@/features/clients/AddClientPanel';
import { NewProjectPanel } from '@/features/projects/NewProjectPanel';
import { ProjectTabs } from '@/features/projects/ProjectTabs';
import { ArchiveButton } from './ArchiveButton';
import { formatMoney, fractionDigits, minorToRateInput, rateInputToMinor } from './money';
import { bannerForError } from './mutation-errors';

const WS = '0192a000-0000-7000-8000-000000000001';
const ID = '0192a000-0000-7000-8000-0000000000c1';

beforeEach(() => {
  vi.clearAllMocks();
  nav.pathname = '/';
});

describe('money display and input helpers (BR-019, NFR-013)', () => {
  it('UT-MNY-01 converts without floats and formats with Intl', () => {
    expect(rateInputToMinor('1,500.50', 'INR')).toBe('150050');
    expect(rateInputToMinor('  ', 'INR')).toBeNull();
    expect(rateInputToMinor('1.505', 'INR')).toBeUndefined();
    expect(minorToRateInput('150050', 'INR')).toBe('1500.50');
    expect(minorToRateInput(null, 'INR')).toBe('');
    expect(formatMoney('150000', 'INR')).toBe('₹1,500.00');
    expect(formatMoney('1500', 'JPY')).toMatch(/1,500/);
    // An unknown or half-typed code falls back to 2 decimals instead of throwing.
    expect(fractionDigits('X')).toBe(2);
  });

  it('UT-MNY-02 keeps precision beyond Number.MAX_SAFE_INTEGER (display only)', () => {
    expect(formatMoney('900719925474099312', 'INR')).toContain('9,00,71,99,25,47,40,993.12');
  });
});

describe('bannerForError (screen specifications §3)', () => {
  const opts = { onUnauthenticated: vi.fn() };
  it('UT-BNR-01 maps 403, 404, network and unknown failures to user-facing banners', () => {
    expect(
      bannerForError(
        new ApiError(403, { code: 'FORBIDDEN', title: 'Not allowed', detail: 'No.' }),
        opts,
      ),
    ).toMatchObject({ tone: 'permission' });
    expect(
      bannerForError(
        new ApiError(404, {
          code: 'NOT_FOUND',
          title: 'Not found',
          detail: 'Gone.',
          requestId: 'req-1',
        }),
        opts,
      ),
    ).toEqual({ tone: 'error', title: 'Couldn’t save', message: 'Gone. (Reference: req-1)' });
    expect(
      bannerForError(new ClientError('NETWORK_ERROR', 'Could not reach the server.'), opts),
    ).toMatchObject({ tone: 'error', message: 'Could not reach the server.' });
    expect(opts.onUnauthenticated).not.toHaveBeenCalled();
  });

  it('UT-BNR-02 422: mapped fields return no banner; unmapped ones become a form-level message', () => {
    const err = new ApiError(422, {
      code: 'VALIDATION_FAILED',
      title: 'Validation failed',
      detail: 'Some fields need attention.',
      errors: [
        { path: 'name', message: 'Name is required.' },
        { path: '(body)', message: 'Nothing to change.' },
      ],
    });
    const seen: string[] = [];
    const banner = bannerForError(err, {
      ...opts,
      setFieldError: (path) => {
        seen.push(path);
        return path === 'name';
      },
    });
    expect(seen).toEqual(['name', '(body)']);
    expect(banner).toEqual({
      tone: 'error',
      title: 'Some fields need attention.',
      message: 'Nothing to change.',
    });
  });
});

describe('ArchiveButton (FR-010, FR-011, BR-029)', () => {
  it('CT-ARC-01 explains the consequence before archiving, then archives and refreshes', async () => {
    api.clients.archive.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ArchiveButton workspaceId={WS} kind="client" id={ID} name="Das Sweets" />);
    await user.click(screen.getByRole('button', { name: 'Archive client' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive Das Sweets?' });
    expect(within(dialog).getByText(/all of its projects become read-only/)).toBeInTheDocument();
    expect(api.clients.archive).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Archive client' }));
    await waitFor(() => expect(api.clients.archive).toHaveBeenCalledWith(WS, ID));
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CT-ARC-02 a project archive failure shows the error; 401 goes to sign-in', async () => {
    api.projects.archive.mockRejectedValueOnce(
      new ApiError(503, {
        code: 'SERVICE_UNAVAILABLE',
        title: 'Service unavailable',
        detail: 'Try again shortly.',
      }),
    );
    const user = userEvent.setup();
    render(<ArchiveButton workspaceId={WS} kind="project" id={ID} name="App" />);
    await user.click(screen.getByRole('button', { name: 'Archive project' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive project' }),
    );
    expect(await screen.findByText('Try again shortly.')).toBeInTheDocument();

    api.projects.archive.mockRejectedValueOnce(
      new ApiError(401, { code: 'UNAUTHENTICATED', title: 'Not signed in' }),
    );
    await user.click(screen.getByRole('button', { name: 'Archive project' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive project' }),
    );
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        `/signin?returnTo=${encodeURIComponent(`/w/${WS}/projects/${ID}`)}`,
      ),
    );
  });
});

describe('primary actions and navigation', () => {
  it('CT-PNL-01 "Add client" opens the form and Cancel closes it', async () => {
    const user = userEvent.setup();
    render(<AddClientPanel workspaceId={WS} />);
    await user.click(screen.getByRole('button', { name: 'Add client' }));
    expect(screen.getByRole('form', { name: 'Add client' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('CT-PNL-02 "New project" needs a client first; with clients it opens the form', async () => {
    const { unmount } = render(
      <NewProjectPanel workspaceId={WS} clients={[]} defaultCurrency="INR" />,
    );
    expect(screen.getByRole('link', { name: 'Add a client' })).toHaveAttribute(
      'href',
      `/w/${WS}/clients`,
    );
    unmount();
    const user = userEvent.setup();
    render(
      <NewProjectPanel
        workspaceId={WS}
        clients={[{ id: ID, name: 'Das' }]}
        defaultCurrency="INR"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'New project' }));
    expect(screen.getByRole('form', { name: 'New project' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Currency/)).toHaveValue('INR');
  });

  it('CT-TAB-01 project tabs mark the current route and list only implemented tabs', () => {
    const base = `/w/${WS}/projects/${ID}`;
    nav.pathname = `${base}/tasks`;
    render(<ProjectTabs base={base} />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Overview',
      'Requirements',
      'Change requests',
      'Tasks',
      'Billing',
    ]);
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });
});
