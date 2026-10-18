import { invoiceStatuses, type InvoiceStatus } from '@soloops/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatDate } from '@/features/core-ops/labels';
import { formatMoney } from '@/features/core-ops/money';
import { INVOICE_STATUS } from '@/features/invoices/invoice-labels';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Billing' };

/** S-16 Billing: invoices with a status filter (FR-042). Unbilled work lives on each project (S-10). */
export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  const status = (invoiceStatuses as readonly string[]).includes(query.status ?? '')
    ? (query.status as InvoiceStatus)
    : undefined;
  const list = await (
    await serverApi()
  ).invoices
    .list(workspaceId, {
      ...(status ? { status } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      limit: 50,
    })
    .catch(handleServerError);
  const base = `/w/${workspaceId}/billing`;
  const filters = [
    { label: 'All', href: base, current: !status },
    ...invoiceStatuses.map((s) => ({
      label: INVOICE_STATUS[s].label,
      href: `${base}?status=${s}`,
      current: status === s,
    })),
  ];
  const older = list.nextCursor
    ? `${base}?${new URLSearchParams({ ...(status ? { status } : {}), cursor: list.nextCursor }).toString()}`
    : null;
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Billing</h1>
          <p className={styles.muted}>
            Invoices. To draft one, open a project’s Billing tab and select work that is ready to
            invoice.
          </p>
        </div>
      </div>
      <nav aria-label="Invoice status">
        <ul className={styles.tabs}>
          {filters.map((f) => (
            <li key={f.label}>
              <Link
                href={f.href}
                className={[styles.tab, f.current ? styles.tabCurrent : ''].join(' ')}
                aria-current={f.current ? 'page' : undefined}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {list.items.length === 0 ? (
        <EmptyState title="No invoices yet">
          Draft an invoice from eligible work on a project’s Billing tab.
        </EmptyState>
      ) : (
        <ul className={styles.list}>
          {list.items.map((i) => (
            <li key={i.id} className={styles.row}>
              <div className={styles.rowMain}>
                <Link href={`${base}/invoices/${i.id}`} className={styles.rowTitle}>
                  {i.displayNumber ?? 'Draft'} · {i.clientName}
                </Link>
                <span className={styles.muted}>
                  {i.projectName} · {formatMoney(i.totalMinor, i.currency)} ·{' '}
                  {i.issuedAt
                    ? `issued ${formatDate(i.issuedAt)}`
                    : `created ${formatDate(i.createdAt)}`}
                </span>
              </div>
              <StatusBadge tone={INVOICE_STATUS[i.status].tone}>
                {INVOICE_STATUS[i.status].label}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
      {older ? (
        <p>
          <Link href={older}>Older invoices</Link>
        </p>
      ) : null}
    </div>
  );
}
