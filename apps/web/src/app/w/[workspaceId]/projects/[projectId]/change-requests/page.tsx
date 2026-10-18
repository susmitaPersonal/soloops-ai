import type { CrStatus } from '@soloops/contracts';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { CR_STATUS, daysSince, VERSION_STATE } from '@/features/change-requests/cr-labels';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatMoney } from '@/features/core-ops/money';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Change requests' };

const FILTERS: { label: string; status?: CrStatus }[] = [
  { label: 'All' },
  { label: 'Awaiting decision', status: 'AWAITING_DECISION' },
  { label: 'Needs revision', status: 'NEEDS_REVISION' },
  { label: 'Approved', status: 'APPROVED' },
  { label: 'Rejected', status: 'REJECTED' },
];

/** S-06 Change requests of a project (FR-020, FR-032 filters). */
export default async function ChangeRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const [{ workspaceId, projectId }, query] = await Promise.all([params, searchParams]);
  const status = FILTERS.find((f) => f.status === query.status)?.status;
  const api = await serverApi();
  const [{ data: project }, page] = await Promise.all([
    api.projects.get(workspaceId, projectId),
    api.changeRequests.listForProject(workspaceId, projectId, {
      ...(status ? { status } : {}),
      limit: 50,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    }),
  ]).catch(handleServerError);
  const base = `/w/${workspaceId}/projects/${projectId}/change-requests`;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.cardTitle}>Change requests</h2>
        {project.readOnly ? null : (
          <Link href={`${base}/new`} className={styles.buttonLink}>
            <Plus size={16} aria-hidden="true" /> Record change request
          </Link>
        )}
      </div>
      <nav aria-label="Change request filter">
        <ul className={styles.tabs}>
          {FILTERS.map((f) => {
            const current = f.status === status;
            return (
              <li key={f.label}>
                <Link
                  href={f.status ? `${base}?status=${f.status}` : base}
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
        <EmptyState title="No extra requests yet">
          When the client asks for something new, record it here instead of just saying yes.
        </EmptyState>
      ) : (
        <section className={styles.card} aria-label="Change requests">
          <ul className={styles.list}>
            {page.items.map((cr) => (
              <li key={cr.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <Link href={`${base}/${cr.id}`} className={styles.rowTitle}>
                    <span className="so-mono">{cr.key}</span> {cr.title || 'Untitled'}
                  </Link>
                  <span className={styles.meta}>
                    <span>
                      v{cr.currentVersionNumber} · {VERSION_STATE[cr.currentVersionState].label}
                    </span>
                    <span>
                      {cr.priceMinor ? formatMoney(cr.priceMinor, cr.currency) : 'No price yet'}
                    </span>
                    {cr.proposedAt && cr.status === 'AWAITING_DECISION' ? (
                      <span>waiting {daysSince(cr.proposedAt)} days</span>
                    ) : null}
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
            href={`${base}?${new URLSearchParams({ ...(status ? { status } : {}), cursor: page.nextCursor }).toString()}`}
          >
            Load more change requests
          </Link>
        </p>
      ) : null}
    </div>
  );
}
