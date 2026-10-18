import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { AddClientPanel } from '@/features/clients/AddClientPanel';
import styles from '@/features/core-ops/core-ops.module.css';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Clients' };

/** S-02 Clients list (FR-010, AC-004.1, AC-004.3: archived clients are hidden by default). */
export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ archived?: string; cursor?: string }>;
}) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  const archived = query.archived === '1';
  const api = await serverApi();
  const page = await api.clients
    .list(workspaceId, { archived, limit: 50, cursor: query.cursor })
    .catch(handleServerError);
  const base = `/w/${workspaceId}/clients`;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Clients</h1>
          <p className={styles.muted}>The people and companies you do work for.</p>
        </div>
      </div>
      {archived ? null : <AddClientPanel workspaceId={workspaceId} />}

      <nav aria-label="Client filter">
        <ul className={styles.tabs}>
          <li>
            <Link
              href={base}
              className={[styles.tab, archived ? '' : styles.tabCurrent].join(' ')}
              aria-current={archived ? undefined : 'page'}
            >
              Active
            </Link>
          </li>
          <li>
            <Link
              href={`${base}?archived=1`}
              className={[styles.tab, archived ? styles.tabCurrent : ''].join(' ')}
              aria-current={archived ? 'page' : undefined}
            >
              Archived
            </Link>
          </li>
        </ul>
      </nav>

      {page.items.length === 0 ? (
        <EmptyState
          title={archived ? 'No archived clients' : 'Add your first client to start a project'}
        />
      ) : (
        <section className={styles.card} aria-label={archived ? 'Archived clients' : 'Clients'}>
          <ul className={styles.list}>
            {page.items.map((c) => (
              <li key={c.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <Link href={`${base}/${c.id}`} className={styles.rowTitle}>
                    {c.name}
                  </Link>
                  <span className={styles.muted}>
                    {[c.contactName, c.email].filter(Boolean).join(' · ') || 'No contact details'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {page.nextCursor ? (
        <p>
          <Link
            href={`${base}?${new URLSearchParams({
              ...(archived ? { archived: '1' } : {}),
              cursor: page.nextCursor,
            }).toString()}`}
          >
            Load more clients
          </Link>
        </p>
      ) : null}
    </div>
  );
}
