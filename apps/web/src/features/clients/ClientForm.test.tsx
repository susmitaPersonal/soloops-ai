import { ApiError } from '@soloops/api-client';
import type { ClientDto } from '@soloops/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));
const api = vi.hoisted(() => ({
  clients: { create: vi.fn(), update: vi.fn(), archive: vi.fn() },
}));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { ClientForm } from './ClientForm';

const WS = '0192a000-0000-7000-8000-000000000001';
const client: ClientDto = {
  id: '0192a000-0000-7000-8000-0000000000c1',
  name: 'Das Sweets Pvt Ltd',
  contactName: 'S. Das',
  email: null,
  phone: null,
  billingAddress: null,
  taxId: null,
  archivedAt: null,
  rowVersion: 3,
  createdAt: '2026-10-16T09:00:00.000Z',
  updatedAt: '2026-10-16T09:00:00.000Z',
};

beforeEach(() => vi.clearAllMocks());

describe('S-02 ClientForm (FR-010)', () => {
  it('CT-CLI-01 TC-004.1 creates a client: optional fields sent as null, then opens its page', async () => {
    api.clients.create.mockResolvedValue({ ...client, id: 'new-id' });
    const user = userEvent.setup();
    render(<ClientForm workspaceId={WS} />);
    await user.type(screen.getByLabelText(/Client name/), '  Das Sweets  ');
    await user.click(screen.getByRole('button', { name: 'Add client' }));
    await waitFor(() => expect(api.clients.create).toHaveBeenCalledTimes(1));
    expect(api.clients.create).toHaveBeenCalledWith(WS, {
      name: 'Das Sweets',
      contactName: null,
      email: null,
      phone: null,
      billingAddress: null,
      taxId: null,
    });
    expect(router.push).toHaveBeenCalledWith(`/w/${WS}/clients/new-id`);
  });

  it('CT-CLI-02 A11Y-003 name required and email format: focused error summary, no API call', async () => {
    const user = userEvent.setup();
    render(<ClientForm workspaceId={WS} />);
    await user.type(screen.getByLabelText(/Email/), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Add client' }));
    const summary = await screen.findByRole('alert', { name: /There is a problem/ });
    await waitFor(() => expect(summary).toHaveFocus());
    expect(screen.getByRole('link', { name: 'Client name is required.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Enter a valid email address.' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Client name/)).toHaveAttribute('aria-invalid', 'true');
    expect(api.clients.create).not.toHaveBeenCalled();
  });

  it('CT-CLI-03 ERR-010 server field errors are shown on the matching inputs', async () => {
    api.clients.create.mockRejectedValue(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        title: 'Validation failed',
        detail: 'Some fields need attention.',
        errors: [{ path: 'phone', message: 'Phone must be at most 32 characters.' }],
      }),
    );
    const user = userEvent.setup();
    render(<ClientForm workspaceId={WS} />);
    await user.type(screen.getByLabelText(/Client name/), 'Das');
    await user.click(screen.getByRole('button', { name: 'Add client' }));
    const phone = screen.getByLabelText(/Phone/);
    await waitFor(() =>
      expect(phone).toHaveAccessibleDescription(/Phone must be at most 32 characters\./),
    );
    expect(phone).toHaveAttribute('aria-invalid', 'true');
  });

  it('CT-CLI-04 editing sends If-Match rowVersion and announces success', async () => {
    api.clients.update.mockResolvedValue({ ...client, phone: '+91 90000 00000', rowVersion: 4 });
    const user = userEvent.setup();
    render(<ClientForm workspaceId={WS} initial={client} />);
    await user.type(screen.getByLabelText(/Phone/), '+91 90000 00000');
    await user.click(screen.getByRole('button', { name: 'Save client' }));
    await waitFor(() => expect(api.clients.update).toHaveBeenCalled());
    const [ws, id, body, rowVersion] = api.clients.update.mock.calls[0] ?? [];
    expect([ws, id, rowVersion]).toEqual([WS, client.id, 3]);
    expect(body).toMatchObject({ name: 'Das Sweets Pvt Ltd', phone: '+91 90000 00000' });
    expect(await screen.findByRole('status')).toHaveTextContent('Client saved.');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CT-CLI-05 ERR-005 a stale save shows the conflict banner with Reload', async () => {
    api.clients.update.mockRejectedValue(
      new ApiError(412, { code: 'PRECONDITION_FAILED', title: 'This item changed' }),
    );
    const user = userEvent.setup();
    render(<ClientForm workspaceId={WS} initial={client} />);
    await user.click(screen.getByRole('button', { name: 'Save client' }));
    expect(await screen.findByText('This item changed since you opened it')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('CT-CLI-06 AC-004.3 an archived client is read-only: banner, read-only inputs, no Save', () => {
    render(
      <ClientForm workspaceId={WS} initial={{ ...client, archivedAt: '2026-10-16T09:00:00Z' }} />,
    );
    expect(screen.getByText('Archived — read-only')).toBeInTheDocument();
    expect(screen.getByLabelText(/Client name/)).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Save client' })).not.toBeInTheDocument();
  });

  it('CT-CLI-07 ERR-008 a 401 on save sends the user to sign-in and back to this client', async () => {
    api.clients.update.mockRejectedValue(
      new ApiError(401, { code: 'UNAUTHENTICATED', title: 'Not signed in' }),
    );
    const user = userEvent.setup();
    render(<ClientForm workspaceId={WS} initial={client} />);
    await user.click(screen.getByRole('button', { name: 'Save client' }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        `/signin?returnTo=${encodeURIComponent(`/w/${WS}/clients/${client.id}`)}`,
      ),
    );
  });

  it('CT-CLI-08 the submit button blocks double submits while saving', async () => {
    let resolve: (v: unknown) => void = () => {};
    api.clients.create.mockImplementation(() => new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<ClientForm workspaceId={WS} />);
    await user.type(screen.getByLabelText(/Client name/), 'Das');
    const button = screen.getByRole('button', { name: 'Add client' });
    await user.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    await user.click(button);
    expect(api.clients.create).toHaveBeenCalledTimes(1);
    resolve({ ...client });
  });
});
