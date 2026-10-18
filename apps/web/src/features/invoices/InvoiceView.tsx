'use client';

import type { InvoiceDto, InvoiceLine } from '@soloops/contracts';
import { Printer } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StatusBadge } from '@/components/StatusBadge';
import { TextArea } from '@/components/TextArea';
import { TextField } from '@/components/TextField';
import { browserApi } from '@/lib/api/browser';
import { describeError } from '@/lib/api/errors';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatMoney } from '@/features/core-ops/money';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';
import { formatMinutes } from '@/features/change-requests/cr-labels';
import { formatBps, INVOICE_STATUS, signedInputToMinor } from './invoice-labels';
import inv from './invoice.module.css';
import { InvoicePaper, TAX_DISCLAIMER } from './InvoicePaper';

type Dialog = 'issue' | 'void' | 'delete' | null;
const newKey = () => crypto.randomUUID();

/**
 * S-11 invoice draft, review, issue and void (FR-042–FR-046). Every amount comes from the server
 * after each change; nothing is calculated here (BR-020). Issue and void are owner-only (BR-023):
 * members see a permission notice instead of the buttons (AC-020.2).
 */
export function InvoiceView({
  workspaceId,
  invoice,
  isOwner,
}: {
  workspaceId: string;
  invoice: InvoiceDto;
  isOwner: boolean;
}) {
  const router = useRouter();
  const base = `/w/${workspaceId}/billing/invoices/${invoice.id}`;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [status, setStatus] = useState('');
  const [retryError, setRetryError] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');
  /** AC-020.4: lines the server reported as no longer eligible, by position. */
  const [offending, setOffending] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [adj, setAdj] = useState({ open: false, description: '', amount: '', reason: '' });
  const [adjErrors, setAdjErrors] = useState<Record<string, string>>({});
  const money = (m: string) => formatMoney(m, invoice.currency);
  const draft = invoice.status === 'DRAFT';
  const onAuthLost = () => router.push(`/signin?returnTo=${encodeURIComponent(base)}`);

  const open = (d: Dialog) => {
    setBanner(null);
    setRetryError('');
    setReviewed(false);
    setVoidReason('');
    setVoidError('');
    setKey(newKey());
    setDialog(d);
  };

  async function transition(
    action: () => Promise<InvoiceDto | void>,
    done: string,
    after?: string,
  ) {
    setBusy(true);
    setBanner(null);
    setRetryError('');
    try {
      await action();
      setDialog(null);
      setOffending({});
      setStatus(done);
      if (after) router.push(after);
      router.refresh();
    } catch (err) {
      const d = describeError(err);
      if (d.code === 'NOT_ELIGIBLE' && d.status === 409) {
        setDialog(null);
        setOffending(
          Object.fromEntries(
            d.fieldErrors.map((f) => [Number(f.path.split('.')[1]), f.message] as const),
          ),
        );
        setBanner({
          tone: 'warning',
          title: 'Some lines can no longer be invoiced',
          message: d.message,
        });
      } else if (d.status === 422 && dialog === 'void') {
        setVoidError(d.fieldErrors.find((f) => f.path === 'reason')?.message ?? d.message);
      } else if (dialog !== null && (d.status === 0 || d.status >= 500)) {
        // Outcome unknown: keep the dialog and its Idempotency-Key, so a retry is safe (AC-020.3).
        setRetryError(`${d.message} You can retry safely — it will not happen twice.`);
      } else {
        setDialog(null);
        setBanner(
          d.code === 'INVALID_STATE_TRANSITION'
            ? {
                tone: 'warning',
                title: 'This invoice changed — reload',
                message: d.message,
                reload: true,
              }
            : bannerForError(err, { onUnauthenticated: onAuthLost }),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function edit(body: Parameters<typeof browserApi.invoices.update>[2], done: string) {
    setBusy(true);
    setBanner(null);
    try {
      await browserApi.invoices.update(workspaceId, invoice.id, body, invoice.rowVersion);
      setStatus(done);
      setEditing(null);
      setAdj({ open: false, description: '', amount: '', reason: '' });
      setAdjErrors({});
      router.refresh();
    } catch (err) {
      const d = describeError(err);
      if (d.status === 422 && body.addAdjustments) {
        const mapped: Record<string, string> = {};
        for (const f of d.fieldErrors) {
          const field = f.path.split('.').at(-1) ?? '';
          mapped[
            field === 'amountMinor' ? 'amount' : field === 'addAdjustments' ? 'amount' : field
          ] = f.message;
        }
        setAdjErrors(mapped);
      } else {
        setBanner(bannerForError(err, { onUnauthenticated: onAuthLost }));
      }
    } finally {
      setBusy(false);
    }
  }

  function addAdjustment() {
    const errs: Record<string, string> = {};
    const minor = signedInputToMinor(adj.amount, invoice.currency);
    if (!adj.description.trim()) errs.description = 'Describe the adjustment.';
    if (minor === null) errs.amount = 'Enter a non-zero amount, e.g. -500 or 250.50.';
    if (!adj.reason.trim()) errs.reason = 'A reason is required for manual adjustments.';
    setAdjErrors(errs);
    if (Object.keys(errs).length > 0 || minor === null) return;
    void edit(
      {
        addAdjustments: [{ description: adj.description, amountMinor: minor, reason: adj.reason }],
      },
      'Adjustment added. Totals updated.',
    );
  }

  const qty = (l: InvoiceLine) => (l.minutes !== null ? formatMinutes(l.minutes) : '—');
  const title = draft ? 'Invoice draft' : `Invoice ${invoice.displayNumber ?? ''}`;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.muted}>
            {invoice.clientName} · {invoice.projectName}
          </p>
        </div>
        <StatusBadge tone={INVOICE_STATUS[invoice.status].tone}>
          {INVOICE_STATUS[invoice.status].label}
        </StatusBadge>
      </div>
      <BannerAlert banner={banner} />
      <p role="status" aria-live="polite">
        {status}
      </p>
      {invoice.status === 'VOID' ? (
        <Alert tone="warning" title="This invoice is void">
          Reason: {invoice.voidReason}. Its number {invoice.displayNumber} is never reused, and its
          work returned to unbilled.
        </Alert>
      ) : null}

      {draft ? (
        <section className={styles.card} aria-labelledby="lines-title">
          <h2 id="lines-title" className={styles.cardTitle}>
            Lines
          </h2>
          <div className={inv.tableWrap}>
            <table className={inv.table}>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Description</th>
                  <th scope="col" className={inv.num}>
                    Quantity
                  </th>
                  <th scope="col" className={inv.num}>
                    Amount
                  </th>
                  <th scope="col">
                    <span className="so-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr
                    key={l.position}
                    className={offending[l.position] ? inv.offending : undefined}
                  >
                    <td>{l.position}</td>
                    <td>
                      {editing === l.position ? (
                        <TextField
                          id={`line-${l.position}-description`}
                          label={`Description of line ${l.position}`}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      ) : (
                        <>
                          {l.kind === 'ADJUSTMENT' ? (
                            <StatusBadge tone="neutral" square>
                              Manual
                            </StatusBadge>
                          ) : null}{' '}
                          {l.description}
                          {l.kind === 'ADJUSTMENT' ? (
                            <span className={styles.muted}> (reason: {l.adjustmentReason})</span>
                          ) : null}
                        </>
                      )}
                      {offending[l.position] ? (
                        <p>
                          <StatusBadge tone="warning">Not eligible</StatusBadge>{' '}
                          {offending[l.position]}
                        </p>
                      ) : null}
                    </td>
                    <td className={inv.num}>
                      {qty(l)}
                      {l.hourlyRateMinor !== null ? ` × ${money(l.hourlyRateMinor)}/h` : ''}
                    </td>
                    <td className={inv.num}>{money(l.amountMinor)}</td>
                    <td>
                      <div className={styles.actions}>
                        {editing === l.position ? (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              loading={busy}
                              disabled={!description.trim()}
                              onClick={() =>
                                void edit(
                                  { lineDescriptions: [{ position: l.position, description }] },
                                  `Line ${l.position} updated.`,
                                )
                              }
                            >
                              Save
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              aria-label={`Edit line ${l.position}`}
                              onClick={() => {
                                setEditing(l.position);
                                setDescription(l.description);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              aria-label={`Remove line ${l.position}`}
                              disabled={busy || invoice.lines.length === 1}
                              onClick={() =>
                                void edit(
                                  { removePositions: [l.position] },
                                  l.billableEntryId
                                    ? `Line ${l.position} removed. Its work is unbilled again.`
                                    : `Line ${l.position} removed.`,
                                )
                              }
                            >
                              Remove
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className={inv.totals}>
            <div className={inv.totalRow}>
              <dt>Subtotal</dt>
              <dd>{money(invoice.subtotalMinor)}</dd>
            </div>
            <div className={inv.totalRow}>
              <dt>
                {invoice.taxLabel} {formatBps(invoice.taxRateBps)}
              </dt>
              <dd>{money(invoice.taxMinor)}</dd>
            </div>
            <div className={inv.totalRow}>
              <dt>Total</dt>
              <dd>
                <strong>{money(invoice.totalMinor)}</strong>
              </dd>
            </div>
          </dl>
          <p className={styles.muted}>{TAX_DISCLAIMER}</p>

          {adj.open ? (
            <fieldset className={styles.fieldset}>
              <legend className={styles.rowTitle}>Manual adjustment</legend>
              <div className={styles.grid}>
                <TextField
                  id="adj-description"
                  label="Description"
                  required
                  value={adj.description}
                  error={adjErrors.description}
                  onChange={(e) => setAdj({ ...adj, description: e.target.value })}
                />
                <TextField
                  id="adj-amount"
                  label={`Amount (${invoice.currency})`}
                  hint="Negative for a discount, e.g. -500"
                  required
                  inputMode="decimal"
                  value={adj.amount}
                  error={adjErrors.amount}
                  onChange={(e) => setAdj({ ...adj, amount: e.target.value })}
                />
                <TextArea
                  id="adj-reason"
                  label="Reason"
                  required
                  rows={2}
                  className={styles.wide}
                  value={adj.reason}
                  error={adjErrors.reason}
                  onChange={(e) => setAdj({ ...adj, reason: e.target.value })}
                />
              </div>
              <div className={styles.actions}>
                <Button type="button" loading={busy} onClick={addAdjustment}>
                  Add adjustment
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAdj({ open: false, description: '', amount: '', reason: '' })}
                >
                  Cancel
                </Button>
              </div>
            </fieldset>
          ) : null}
        </section>
      ) : (
        <InvoicePaper invoice={invoice} headingLevel={2} />
      )}

      <div className={styles.actions}>
        <Link href={`${base}/print`} className={styles.buttonLink}>
          <Printer size={16} aria-hidden="true" /> {draft ? 'Preview print' : 'Print'}
        </Link>
        {draft ? (
          <>
            {adj.open ? null : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAdj({ open: true, description: '', amount: '', reason: '' })}
              >
                + Adjustment
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => open('delete')}>
              Delete draft
            </Button>
            {isOwner ? (
              <Button type="button" onClick={() => open('issue')}>
                Issue invoice…
              </Button>
            ) : null}
          </>
        ) : null}
        {invoice.status === 'ISSUED' && isOwner ? (
          <Button type="button" variant="danger" onClick={() => open('void')}>
            Void…
          </Button>
        ) : null}
      </div>
      {!isOwner && invoice.status !== 'VOID' ? (
        <Alert tone="permission" title="Only owners can issue or void invoices">
          Ask a workspace owner to review and issue this invoice.
        </Alert>
      ) : null}

      <ConfirmDialog
        open={dialog === 'issue'}
        title="Issue this invoice?"
        confirmLabel="Issue invoice"
        busy={busy}
        confirmDisabled={!reviewed}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          void transition(
            () => browserApi.invoices.issue(workspaceId, invoice.id, key),
            'Invoice issued. It can no longer be edited.',
          )
        }
      >
        {retryError ? (
          <Alert tone="error" title="Couldn’t confirm the result">
            {retryError}
          </Alert>
        ) : null}
        <p>
          This assigns the next invoice number and the invoice can no longer be edited. Total{' '}
          {money(invoice.totalMinor)}.
        </p>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I have reviewed this invoice.
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'void'}
        title={`Void ${invoice.displayNumber ?? 'this invoice'}?`}
        confirmLabel="Void invoice"
        danger
        busy={busy}
        confirmDisabled={!voidReason.trim()}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          void transition(
            () => browserApi.invoices.void(workspaceId, invoice.id, { reason: voidReason }, key),
            `${invoice.displayNumber ?? 'The invoice'} is void. Its work is unbilled again.`,
          )
        }
      >
        {retryError ? (
          <Alert tone="error" title="Couldn’t confirm the result">
            {retryError}
          </Alert>
        ) : null}
        <p>
          {invoice.displayNumber} will be marked void. Its number is not reused.{' '}
          {invoice.lines.filter((l) => l.billableEntryId).length} entries return to unbilled work.
        </p>
        <TextArea
          id="void-reason"
          label="Reason"
          required
          rows={2}
          value={voidReason}
          error={voidError || undefined}
          onChange={(e) => setVoidReason(e.target.value)}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete this draft?"
        confirmLabel="Delete draft"
        danger
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          void transition(
            () => browserApi.invoices.delete(workspaceId, invoice.id),
            'Draft deleted. Its work is unbilled again.',
            `/w/${workspaceId}/projects/${invoice.projectId}/billing`,
          )
        }
      >
        <p>The draft is removed and all its work returns to unbilled. Nothing was issued.</p>
      </ConfirmDialog>
    </div>
  );
}
