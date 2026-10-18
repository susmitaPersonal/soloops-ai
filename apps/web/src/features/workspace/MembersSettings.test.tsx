import type { MemberDto } from '@soloops/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@soloops/api-client';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));
const api = vi.hoisted(() => ({ members: { add: vi.fn(), remove: vi.fn() } }));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { MembersSettings } from './MembersSettings';

const WS = '0192a000-0000-7000-8000-000000000001';
const owner: MemberDto = {
  userId: '0192a000-0000-7000-8000-0000000000a1',
  name: 'Riya Sen',
  email: 'riya@example.com',
  role: 'OWNER',
  joinedAt: '2026-10-16T09:00:00Z',
};
const member: MemberDto = {
  userId: '0192a000-0000-7000-8000-0000000000a2',
  name: 'Arjun Das',
  email: 'arjun@example.com',
  role: 'MEMBER',
  joinedAt: '2026-10-18T09:00:00Z',
};

beforeEach(() => vi.clearAllMocks());

describe('S-12 MembersSettings (FR-004)', () => {
  it('CT-MEM-01 AC-003.1 an owner adds a member by email; the page refreshes', async () => {
    api.members.add.mockResolvedValue(member);
    const user = userEvent.setup();
    render(<MembersSettings workspaceId={WS} members={[owner]} isOwner />);
    await user.type(screen.getByLabelText(/Add a member by email/), 'arjun@example.com');
    await user.click(screen.getByRole('button', { name: 'Add member' }));
    await waitFor(() =>
      expect(api.members.add).toHaveBeenCalledWith(WS, { email: 'arjun@example.com' }),
    );
    expect(await screen.findByText('Arjun Das was added as a member.')).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CT-MEM-02 an unknown email shows the server message on the email field', async () => {
    api.members.add.mockRejectedValue(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        title: 'Some fields need attention.',
        detail: 'Some fields need attention.',
        errors: [{ path: 'email', message: 'No SoloOps account uses this email.' }],
      }),
    );
    const user = userEvent.setup();
    render(<MembersSettings workspaceId={WS} members={[owner]} isOwner />);
    await user.type(screen.getByLabelText(/Add a member by email/), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: 'Add member' }));
    expect(await screen.findByText('No SoloOps account uses this email.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Add a member by email/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('CT-MEM-03 removing asks for confirmation; the last owner has no Remove button', async () => {
    api.members.remove.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MembersSettings workspaceId={WS} members={[owner, member]} isOwner />);
    expect(screen.queryByRole('button', { name: 'Remove Riya Sen' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Arjun Das' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Arjun Das?' });
    expect(api.members.remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Remove member' }));
    await waitFor(() => expect(api.members.remove).toHaveBeenCalledWith(WS, member.userId));
    expect(
      await screen.findByText('Arjun Das was removed from this workspace.'),
    ).toBeInTheDocument();
  });

  it('CT-MEM-04 AC-003.2 members see the list with roles in words, but no add form or remove buttons', () => {
    render(<MembersSettings workspaceId={WS} members={[owner, member]} isOwner={false} />);
    const list = screen.getByRole('list', { name: 'Workspace members' });
    expect(within(list).getByText('Owner')).toBeInTheDocument();
    expect(within(list).getByText('Member')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Add a member by email/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    expect(screen.getByText('Only workspace owners can add or remove members')).toBeInTheDocument();
  });
});
