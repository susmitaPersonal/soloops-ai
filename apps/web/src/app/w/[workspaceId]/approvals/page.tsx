import type { CrStatus } from '@soloops/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { CR_STATUS, daysSince } from '@/features/change-requests/cr-labels';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatMoney } from '@/features/core-ops/money';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Approvals' };

const FILTERS: { label: string; status: CrStatus | 'BOTH' }[] = [
  { label: 'Awaiting decision', status: 'AWAITING_DECISION' },
  { label: 'Needs revision', status: 'NEEDS_REVISION' },
  { label: 'Both', status: 'BOTH' },
];

/** S-15 Approvals queue (FR-032, AC-027.1–.2): what is waiting on clients, oldest first. */
export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  const filter = FILTERS.find((f) => f.status === query.status) ?? FILTERS[0]!;
  const status = filter.status === 'BOTH' ? 'AWAITING_DECISION,NEEDS_REVISION' : filter.status;
  const page = await (
    await serverApi()
  ).changeRequests
    .queue(workspaceId, { status, limit: 50, ...(query.cursor ? { cursor: query.cursor } : {}) })
    .catch(handleServerError);
  const base = `/w/${workspaceId}/approvals`;

  return (
    <div className={styles.page}>
      <div className={styles.headerText}>
        <h1 className={styles.title}>Approvals</h1>
        <p className={styles.muted}>Change requests waiting on a client decision or a revision.</p>
      </div>
      <nav aria-label="Approvals filter">
        <ul className={styles.tabs}>
          {FILTERS.map((f) => {
            const current = f === filter;
            return (
              <li key={f.label}>
                <Link
                  href={`${base}?status=${f.status}`}
                  className={[styles.tab, current ? styles.tabCurrent : ''].join(' ')}
                  aria-current={current ? 'page' : undefined}
                >
                  {f.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {page.items.length === 0 ? (
        <EmptyState title="Nothing is waiting on clients" />
      ) : (
        <section className={styles.card} aria-label="Waiting change requests">
          <ul className={styles.list}>
            {page.items.map((cr) => (
              <li key={cr.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <Link
                    href={`/w/${workspaceId}/projects/${cr.projectId}/change-requests/${cr.id}?v=${cr.currentVersionNumber}`}
                    className={styles.rowTitle}
                  >
                    <span className="so-mono">{cr.key}</span> {cr.title || 'Untitled'}
                  </Link>
                  <span className={styles.meta}>
                    <span>{cr.projectName}</span>
                    <span>v{cr.currentVersionNumber}</span>
                    <span>
                      {cr.priceMinor ? formatMoney(cr.priceMinor, cr.currency) : 'No price'}
                    </span>
                    {cr.proposedAt ? <span>waiting {daysSince(cr.proposedAt)} days</span> : null}
                  </span>
                </div>
                <StatusBadge tone={CR_STATUS[cr.status].tone}>
                  {CR_STATUS[cr.status].label}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      )}
      {page.nextCursor ? (
        <p>
          <Link
            href={`${base}?${new URLSearchParams({ status: filter.status, cursor: page.nextCursor }).toString()}`}
          >
            Load more
          </Link>
        </p>
      ) : null}
    </div>
  );
}
