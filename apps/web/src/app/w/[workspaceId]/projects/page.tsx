import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import styles from '@/features/core-ops/core-ops.module.css';
import { BILLING_MODEL_LABEL, PROJECT_STATUS } from '@/features/core-ops/labels';
import { NewProjectPanel } from '@/features/projects/NewProjectPanel';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Projects' };

/** S-03 Projects list (FR-011): most recently active first; archived hidden by default (BR-029). */
export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ archived?: string; cursor?: string }>;
}) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  const archived = query.archived === '1';
  const api = await serverApi();
  const [page, clients, { data: ws }] = await Promise.all([
    api.projects.list(workspaceId, { archived, limit: 50, cursor: query.cursor }),
    api.clients.list(workspaceId, { limit: 100 }),
    api.workspaces.get(workspaceId),
  ]).catch(handleServerError);
  const base = `/w/${workspaceId}/projects`;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Projects</h1>
          <p className={styles.muted}>Each project belongs to one client.</p>
        </div>
      </div>
      {archived ? null : (
        <NewProjectPanel
          workspaceId={workspaceId}
          clients={clients.items.map((c) => ({ id: c.id, name: c.name }))}
          defaultCurrency={ws.defaultCurrency}
        />
      )}

      <nav aria-label="Project filter">
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
        <EmptyState title={archived ? 'No archived projects' : 'No projects yet'}>
          {archived ? null : 'Create a project for a client, then record its requirements.'}
        </EmptyState>
      ) : (
        <section className={styles.card} aria-label={archived ? 'Archived projects' : 'Projects'}>
          <ul className={styles.list}>
            {page.items.map((p) => (
              <li key={p.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <Link href={`${base}/${p.id}`} className={styles.rowTitle}>
                    {p.name}
                  </Link>
                  <span className={styles.muted}>
                    {p.clientName} · {BILLING_MODEL_LABEL[p.billingModel]} · {p.currency}
                  </span>
                </div>
                {p.readOnly ? (
                  <StatusBadge tone="neutral">Archived</StatusBadge>
                ) : (
                  <StatusBadge tone={PROJECT_STATUS[p.status].tone}>
                    {PROJECT_STATUS[p.status].label}
                  </StatusBadge>
                )}
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
            Load more projects
          </Link>
        </p>
      ) : null}
    </div>
  );
}
