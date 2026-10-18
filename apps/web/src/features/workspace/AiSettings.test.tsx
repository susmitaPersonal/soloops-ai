import type { AiStatus } from '@soloops/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));
const api = vi.hoisted(() => ({ ai: { setEnablement: vi.fn() } }));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { AiSettings } from './AiSettings';

const WS = '0192a000-0000-7000-8000-000000000001';
const status = (over: Partial<AiStatus> = {}): AiStatus => ({
  provider: 'openai-compatible',
  model: 'open-model',
  health: 'ok',
  workspaceEnabled: false,
  disclosure: [
    'The change request text.',
    'Nothing else: no client contact details, rates, prices or invoices.',
  ],
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('S-12 AiSettings (FR-053, FR-054)', () => {
  it('CT-AIS-01 AC-022.3 enabling requires acknowledging the disclosure', async () => {
    api.ai.setEnablement.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AiSettings workspaceId={WS} status={status()} isOwner />);
    await user.click(screen.getByRole('button', { name: 'Turn AI on…' }));
    const dialog = screen.getByRole('dialog', { name: 'Turn on AI assistance?' });
    expect(within(dialog).getByText(/no client contact details/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Turn AI on' });
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByLabelText(/I understand what is sent/));
    await user.click(confirm);
    await waitFor(() =>
      expect(api.ai.setEnablement).toHaveBeenCalledWith(WS, {
        enabled: true,
        acknowledgeDisclosure: true,
      }),
    );
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CT-AIS-02 AC-022.1 unconfigured provider: explanation and the toggle is disabled', () => {
    render(
      <AiSettings
        workspaceId={WS}
        status={status({ provider: 'none', model: null, health: 'unconfigured' })}
        isOwner
      />,
    );
    expect(
      screen.getByText('Your administrator hasn’t configured an AI endpoint'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn AI on…' })).toBeDisabled();
  });

  it('CT-AIS-03 members see the status and a PermissionNotice, no toggle', () => {
    render(
      <AiSettings workspaceId={WS} status={status({ workspaceEnabled: true })} isOwner={false} />,
    );
    expect(screen.getByText('On for this workspace')).toBeInTheDocument();
    expect(screen.getByText('Only workspace owners can change AI settings')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('CT-AIS-04 owners can turn AI off', async () => {
    api.ai.setEnablement.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AiSettings workspaceId={WS} status={status({ workspaceEnabled: true })} isOwner />);
    await user.click(screen.getByRole('button', { name: 'Turn AI off' }));
    await waitFor(() => expect(api.ai.setEnablement).toHaveBeenCalledWith(WS, { enabled: false }));
  });
});
