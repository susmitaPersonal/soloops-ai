import { ApiError, ClientError } from '@soloops/api-client';
import type { InvoiceDto } from '@soloops/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));
const api = vi.hoisted(() => ({
  invoices: { update: vi.fn(), delete: vi.fn(), issue: vi.fn(), void: vi.fn() },
}));
vi.mock('@/lib/api/browser', () => ({ browserApi: api }));

import { formatBps, signedInputToMinor } from './invoice-labels';
import { InvoicePaper } from './InvoicePaper';
import { InvoiceView } from './InvoiceView';

const WS = '0192a000-0000-7000-8000-000000000001';
const I = '0192a000-0000-7000-8000-0000000000c1';
const E = '0192a000-0000-7000-8000-0000000000e9';

const invoice = (over: Partial<InvoiceDto> = {}): InvoiceDto => ({
  id: I,
  clientId: WS,
  clientName: 'Das Sweets Pvt Ltd',
  projectId: WS,
  projectName: 'Online ordering app',
  status: 'DRAFT',
  number: null,
  displayNumber: null,
  currency: 'INR',
  taxLabel: 'GST',
  taxRateBps: 1800,
  calculationVersion: 1,
  lines: [
    {
      position: 1,
      kind: 'TIME',
      billableEntryId: E,
      description: 'OTP verification endpoint (CR-3 v2)',
      minutes: 120,
      hourlyRateMinor: '150000',
      amountMinor: '300000',
      adjustmentReason: null,
    },
    {
      position: 2,
      kind: 'ADJUSTMENT',
      billableEntryId: null,
      description: 'Goodwill discount',
      minutes: null,
      hourlyRateMinor: null,
      amountMinor: '-50000',
      adjustmentReason: 'Agreed on call',
    },
  ],
  // Deliberately not the sum of the lines: the UI must show the server's figures.
  subtotalMinor: '250000',
  taxMinor: '45000',
  totalMinor: '295000',
  supplier: { legalName: 'Riya Sen', address: 'Kolkata', taxId: null },
  issuedAt: null,
  issuedByUserId: null,
  voidedAt: null,
  voidReason: null,
  rowVersion: 3,
  createdAt: '2026-10-16T09:00:00.000Z',
  updatedAt: '2026-10-16T09:00:00.000Z',
  ...over,
});
const issued = (over: Partial<InvoiceDto> = {}) =>
  invoice({
    status: 'ISSUED',
    number: 7,
    displayNumber: 'RS-0007',
    issuedAt: '2026-10-16T10:00:00.000Z',
    ...over,
  });
const view = (inv: InvoiceDto, isOwner = true) =>
  render(<InvoiceView workspaceId={WS} invoice={inv} isOwner={isOwner} />);

beforeEach(() => vi.clearAllMocks());

describe('S-11 invoice draft (FR-042, FR-043)', () => {
  it('CT-INV-01 BR-020 shows the server lines and totals verbatim, the manual line with its reason, and the disclaimer', () => {
    view(invoice());
    expect(screen.getByRole('heading', { name: 'Invoice draft' })).toBeInTheDocument();
    const lines = screen.getByRole('region', { name: 'Lines' });
    expect(within(lines).getByText(/OTP verification endpoint/)).toBeInTheDocument();
    expect(within(lines).getByText('2 h × ₹1,500.00/h')).toBeInTheDocument();
    expect(within(lines).getByText('Manual')).toBeInTheDocument();
    expect(within(lines).getByText(/reason: Agreed on call/)).toBeInTheDocument();
    expect(within(lines).getByText('₹2,500.00')).toBeInTheDocument();
    expect(within(lines).getByText('GST 18%')).toBeInTheDocument();
    expect(within(lines).getByText('₹2,950.00')).toBeInTheDocument();
    expect(screen.getByText(/does not verify tax compliance/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Preview print/ })).toHaveAttribute(
      'href',
      `/w/${WS}/billing/invoices/${I}/print`,
    );
  });

  it('CT-INV-02 AC-020.2 a member sees a permission notice instead of Issue', () => {
    view(invoice(), false);
    expect(screen.queryByRole('button', { name: 'Issue invoice…' })).not.toBeInTheDocument();
    expect(screen.getByText('Only owners can issue or void invoices')).toBeInTheDocument();
    // Members may still edit drafts.
    expect(screen.getByRole('button', { name: '+ Adjustment' })).toBeInTheDocument();
  });

  it('CT-INV-03 AC-019.3 BR-025 an adjustment needs a reason; the signed amount is sent as minor units', async () => {
    api.invoices.update.mockResolvedValue(invoice());
    const user = userEvent.setup();
    view(invoice());
    await user.click(screen.getByRole('button', { name: '+ Adjustment' }));
    await user.type(screen.getByLabelText(/^Description/), 'Discount');
    await user.type(screen.getByLabelText(/^Amount/), '-500.50');
    await user.click(screen.getByRole('button', { name: 'Add adjustment' }));
    expect(screen.getByLabelText(/^Reason/)).toHaveAccessibleDescription(/A reason is required/);
    expect(api.invoices.update).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/^Reason/), 'Late delivery');
    await user.click(screen.getByRole('button', { name: 'Add adjustment' }));
    await waitFor(() =>
      expect(api.invoices.update).toHaveBeenCalledWith(
        WS,
        I,
        {
          addAdjustments: [
            { description: 'Discount', amountMinor: '-50050', reason: 'Late delivery' },
          ],
        },
        3,
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Adjustment added');
  });

  it('CT-INV-04 removing a line and editing a description send the change with If-Match', async () => {
    api.invoices.update.mockResolvedValue(invoice());
    const user = userEvent.setup();
    view(invoice());
    await user.click(screen.getByRole('button', { name: 'Remove line 1' }));
    await waitFor(() =>
      expect(api.invoices.update).toHaveBeenCalledWith(WS, I, { removePositions: [1] }, 3),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('unbilled again');
    await user.click(screen.getByRole('button', { name: 'Edit line 2' }));
    const field = screen.getByLabelText('Description of line 2');
    await user.clear(field);
    await user.type(field, 'Loyalty discount');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.invoices.update).toHaveBeenLastCalledWith(
        WS,
        I,
        { lineDescriptions: [{ position: 2, description: 'Loyalty discount' }] },
        3,
      ),
    );
  });

  it('CT-INV-05 deleting the draft goes back to the project billing tab', async () => {
    api.invoices.delete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    view(invoice());
    await user.click(screen.getByRole('button', { name: 'Delete draft' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete draft' }),
    );
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/w/${WS}/projects/${WS}/billing`),
    );
  });
});

describe('S-11 issue and void (FR-044, FR-046)', () => {
  it('CT-INV-06 AC-020.1 issuing needs the review confirmation and sends an Idempotency-Key', async () => {
    api.invoices.issue.mockResolvedValue(issued());
    const user = userEvent.setup();
    view(invoice());
    await user.click(screen.getByRole('button', { name: 'Issue invoice…' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Total ₹2,950.00/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Issue invoice' });
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByLabelText('I have reviewed this invoice.'));
    await user.click(confirm);
    await waitFor(() => expect(api.invoices.issue).toHaveBeenCalledWith(WS, I, expect.any(String)));
    expect(await screen.findByRole('status')).toHaveTextContent('Invoice issued');
  });

  it('CT-INV-07 AC-020.3 a network error keeps the dialog and retries with the SAME key', async () => {
    api.invoices.issue
      .mockRejectedValueOnce(new ClientError('NETWORK_ERROR', 'Could not reach the server.'))
      .mockResolvedValueOnce(issued());
    const user = userEvent.setup();
    view(invoice());
    await user.click(screen.getByRole('button', { name: 'Issue invoice…' }));
    await user.click(screen.getByLabelText('I have reviewed this invoice.'));
    const confirm = () =>
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Issue invoice' });
    await user.click(confirm());
    expect(await screen.findByText(/retry safely/)).toBeInTheDocument();
    await user.click(confirm());
    await waitFor(() => expect(api.invoices.issue).toHaveBeenCalledTimes(2));
    const [k1, k2] = api.invoices.issue.mock.calls.map((c) => c[2]);
    expect(k1).toBe(k2);
  });

  it('CT-INV-08 AC-020.4 lines that are no longer eligible are highlighted with the reason', async () => {
    api.invoices.issue.mockRejectedValue(
      new ApiError(409, {
        code: 'NOT_ELIGIBLE',
        title: 'Some lines are no longer eligible',
        detail: 'Remove those lines, then issue again.',
        errors: [{ path: 'lines.1', message: 'This work is not linked to agreed scope.' }],
      }),
    );
    const user = userEvent.setup();
    view(invoice());
    await user.click(screen.getByRole('button', { name: 'Issue invoice…' }));
    await user.click(screen.getByLabelText('I have reviewed this invoice.'));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Issue invoice' }),
    );
    expect(await screen.findByText('Some lines can no longer be invoiced')).toBeInTheDocument();
    expect(screen.getByText('Not eligible')).toBeInTheDocument();
    expect(screen.getByText('This work is not linked to agreed scope.')).toBeInTheDocument();
  });

  it('CT-INV-09 AC-021.1 an issued invoice is read-only; void needs a reason', async () => {
    api.invoices.void.mockResolvedValue(issued({ status: 'VOID' }));
    const user = userEvent.setup();
    view(issued());
    expect(screen.getByRole('heading', { name: 'Invoice RS-0007', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove line/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Issue invoice…' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Void…' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Its number is not reused/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Void invoice' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Wrong client');
    await user.click(confirm);
    await waitFor(() =>
      expect(api.invoices.void).toHaveBeenCalledWith(
        WS,
        I,
        { reason: 'Wrong client' },
        expect.any(String),
      ),
    );
  });

  it('CT-INV-10 a void invoice shows its reason; members get no void button', () => {
    const { unmount } = view(issued({ status: 'VOID', voidReason: 'Wrong client' }));
    expect(screen.getByText('This invoice is void')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Void…' })).not.toBeInTheDocument();
    unmount();
    view(issued(), false);
    expect(screen.queryByRole('button', { name: 'Void…' })).not.toBeInTheDocument();
  });
});

describe('S-11 print (FR-045, AC-020.5)', () => {
  it('CT-INV-11 drafts are watermarked DRAFT; issued invoices show the number; void ones VOID', () => {
    const { unmount } = render(<InvoicePaper invoice={invoice()} />);
    expect(screen.getByText(/^DRAFT — not issued/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invoice draft' })).toBeInTheDocument();
    expect(screen.getByText('Riya Sen')).toBeInTheDocument();
    unmount();
    const r = render(<InvoicePaper invoice={issued()} />);
    expect(screen.queryByText(/^DRAFT/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Invoice RS-0007' })).toBeInTheDocument();
    r.unmount();
    render(<InvoicePaper invoice={issued({ status: 'VOID', voidReason: 'Duplicate' })} />);
    expect(screen.getByText('VOID — Duplicate')).toBeInTheDocument();
  });

  it('UT-INV-UI-01 helpers: tax rate labels and signed amounts without floats', () => {
    expect(formatBps(1800)).toBe('18%');
    expect(formatBps(1850)).toBe('18.5%');
    expect(formatBps(5)).toBe('0.05%');
    expect(formatBps(0)).toBe('0%');
    expect(signedInputToMinor('-1,250.50', 'INR')).toBe('-125050');
    expect(signedInputToMinor('250', 'INR')).toBe('25000');
    expect(signedInputToMinor('0', 'INR')).toBeNull();
    expect(signedInputToMinor('abc', 'INR')).toBeNull();
    expect(signedInputToMinor('-5', 'JPY')).toBe('-5');
  });
});
