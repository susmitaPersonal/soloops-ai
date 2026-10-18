import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/w/ws1', replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, refresh: nav.refresh, push: vi.fn() }),
}));
const api = vi.hoisted(() => ({ auth: { logout: vi.fn() } }));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { SignOutButton } from '@/features/auth/SignOutButton';
import { WorkspaceNav } from './WorkspaceNav';
import { WorkspaceShell } from './WorkspaceShell';

beforeEach(() => {
  vi.clearAllMocks();
  nav.pathname = '/w/ws1';
});

describe('WorkspaceNav (design system §7.3)', () => {
  it('CT-NAV-01 marks Home as the current page only on the workspace root', () => {
    render(<WorkspaceNav workspaceId="ws1" />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current');
  });

  it('CT-NAV-02 marks Settings current on settings sub-pages', () => {
    nav.pathname = '/w/ws1/settings';
    render(<WorkspaceNav workspaceId="ws1" />);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/w/ws1/settings',
    );
  });

  it('CT-NAV-03 lists only implemented screens (no links to features that do not exist yet)', () => {
    render(<WorkspaceNav workspaceId="ws1" />);
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Home',
      'Approvals',
      'Clients',
      'Projects',
      'Billing',
      'Settings',
    ]);
  });
});

describe('WorkspaceShell', () => {
  it('CT-SHL-01 shows workspace and user, a labelled nav and a main landmark for the skip link', () => {
    render(
      <WorkspaceShell
        workspaceId="ws1"
        workspaceName="Riya Sen Studio"
        userName="Riya"
        workspaces={[
          { id: 'ws1', name: 'Riya Sen Studio', role: 'OWNER' },
          { id: 'ws2', name: 'Other', role: 'MEMBER' },
        ]}
      >
        <p>content</p>
      </WorkspaceShell>,
    );
    expect(screen.getByText('Riya Sen Studio')).toBeInTheDocument();
    expect(screen.getByText('Signed in as Riya')).toBeInTheDocument();
    expect(screen.getByText('2 workspaces')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });
});

describe('SignOutButton (AC-001.4)', () => {
  it('CT-OUT-01 calls the API, then returns to sign-in', async () => {
    api.auth.logout.mockResolvedValue(undefined);
    render(<SignOutButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/signin'));
    expect(api.auth.logout).toHaveBeenCalledTimes(1);
  });

  it('CT-OUT-02 still leaves the protected area if the API call fails (e.g. session already expired)', async () => {
    api.auth.logout.mockRejectedValue(new Error('network'));
    render(<SignOutButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/signin'));
  });
});
