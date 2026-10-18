import { ApiError } from '@soloops/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));

const api = vi.hoisted(() => ({
  auth: { login: vi.fn(), register: vi.fn(), logout: vi.fn(), me: vi.fn() },
  workspaces: { get: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { RegisterForm } from './RegisterForm';
import { SignInForm } from './SignInForm';

const WS = '0192a000-0000-7000-8000-000000000001';
const session = {
  user: { id: WS, name: 'Riya', email: 'riya@example.com' },
  workspaces: [{ id: WS, name: 'WS', role: 'OWNER' }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('S-01 RegisterForm', () => {
  it('A11Y-003 empty submit shows a focused error summary linking to each field; no API call', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    const summary = await screen.findByRole('alert', { name: 'There is a problem' });
    expect(summary).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Name is required.' })).toHaveAttribute(
      'href',
      '#register-name',
    );
    expect(screen.getByLabelText(/Your name/)).toHaveAttribute('aria-invalid', 'true');
    expect(api.auth.register).not.toHaveBeenCalled();
  });

  it('AC-001.1 shows the 12-character password rule up front and enforces it', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    expect(screen.getByText(/At least 12 characters/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Your name/), 'Riya');
    await user.type(screen.getByLabelText(/Email/), 'riya@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'short');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(
      await screen.findByRole('link', { name: 'Use at least 12 characters.' }),
    ).toBeInTheDocument();
    expect(api.auth.register).not.toHaveBeenCalled();
  });

  it('TC-001.1 registers and lands on the new workspace settings', async () => {
    api.auth.register.mockResolvedValue(session);
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(screen.getByLabelText(/Your name/), 'Riya Sen');
    await user.type(screen.getByLabelText(/Email/), 'riya@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/w/${WS}/settings?welcome=1`));
    expect(api.auth.register).toHaveBeenCalledWith({
      name: 'Riya Sen',
      email: 'riya@example.com',
      password: 'correct horse battery',
      workspaceName: undefined,
    });
  });

  it('TC-001.2 shows the generic server message for REGISTRATION_FAILED', async () => {
    api.auth.register.mockRejectedValue(
      new ApiError(422, {
        code: 'REGISTRATION_FAILED',
        title: 'Registration failed',
        detail:
          'We could not create an account with these details. If you already have an account, sign in instead.',
      }),
    );
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(screen.getByLabelText(/Your name/), 'Riya');
    await user.type(screen.getByLabelText(/Email/), 'riya@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(
      await screen.findByText(/If you already have an account, sign in instead/),
    ).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('S-01 SignInForm', () => {
  it('TC-001.3 shows the generic credentials error', async () => {
    api.auth.login.mockRejectedValue(
      new ApiError(401, {
        code: 'INVALID_CREDENTIALS',
        title: 'Sign-in failed',
        detail: 'The email or password is incorrect.',
      }),
    );
    const user = userEvent.setup();
    render(<SignInForm returnTo={null} />);
    await user.type(screen.getByLabelText(/Email/), 'riya@example.com');
    await user.type(screen.getByLabelText(/Password/), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email or password is incorrect.',
    );
  });

  it('ERR-008 returns to the preserved path after sign-in', async () => {
    api.auth.login.mockResolvedValue(session);
    const user = userEvent.setup();
    render(<SignInForm returnTo={`/w/${WS}/settings`} />);
    expect(screen.getByText(/Your session ended/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Email/), 'riya@example.com');
    await user.type(screen.getByLabelText(/Password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/w/${WS}/settings`));
  });

  it('defaults to the first workspace when no return path is given', async () => {
    api.auth.login.mockResolvedValue(session);
    const user = userEvent.setup();
    render(<SignInForm returnTo={null} />);
    await user.type(screen.getByLabelText(/Email/), 'riya@example.com');
    await user.type(screen.getByLabelText(/Password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/w/${WS}`));
  });
});

describe('S-01 keyboard and loading states', () => {
  it('A11Y-002 pressing Enter in the password field submits the form', async () => {
    api.auth.login.mockResolvedValue(session);
    const user = userEvent.setup();
    render(<SignInForm returnTo={null} />);
    await user.type(screen.getByLabelText(/Email/), 'riya@example.com');
    await user.type(screen.getByLabelText(/Password/), 'correct horse battery{Enter}');
    await waitFor(() => expect(api.auth.login).toHaveBeenCalledTimes(1));
  });

  it('the submit button is busy and disabled while the request is in flight (no double submit)', async () => {
    let resolve: (v: typeof session) => void = () => {};
    api.auth.login.mockImplementation(() => new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<SignInForm returnTo={null} />);
    await user.type(screen.getByLabelText(/Email/), 'riya@example.com');
    await user.type(screen.getByLabelText(/Password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const button = await screen.findByRole('button', { name: 'Sign in' });
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    expect(button).toBeDisabled();
    await user.click(button);
    expect(api.auth.login).toHaveBeenCalledTimes(1);
    resolve(session);
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
  });

  it('a 429 rate limit shows the server message', async () => {
    api.auth.login.mockRejectedValue(
      new ApiError(429, {
        code: 'RATE_LIMITED',
        title: 'Too many attempts',
        detail: 'Too many attempts. Wait a few minutes and try again.',
      }),
    );
    const user = userEvent.setup();
    render(<SignInForm returnTo={null} />);
    await user.type(screen.getByLabelText(/Email/), 'riya@example.com');
    await user.type(screen.getByLabelText(/Password/), 'whatever-password{Enter}');
    expect(
      await screen.findByText('Too many attempts. Wait a few minutes and try again.'),
    ).toBeInTheDocument();
  });
});

describe('S-01 server validation mapping', () => {
  it('ERR-010 server 422 field errors are shown on the matching inputs', async () => {
    api.auth.register.mockRejectedValue(
      new ApiError(422, {
        code: 'VALIDATION_FAILED',
        title: 'Validation failed',
        errors: [{ path: 'email', message: 'Enter a valid email address.' }],
      }),
    );
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(screen.getByLabelText(/Your name/), 'Riya');
    await user.type(screen.getByLabelText(/Email/), 'riya@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Email/)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getByLabelText(/Email/)).toHaveAccessibleDescription(
      'Enter a valid email address.',
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});
