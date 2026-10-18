import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { ClientForm } from '@/features/clients/ClientForm';
import { ArchiveButton } from '@/features/core-ops/ArchiveButton';
import styles from '@/features/core-ops/core-ops.module.css';
import { PROJECT_STATUS } from '@/features/core-ops/labels';
import { NewProjectPanel } from '@/features/projects/NewProjectPanel';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Client' };

/**
 * S-02b Client detail (FR-010, FR-011): contact and billing details, projects and "New project".
 * Archived → read-only banner and no "New project" (AC-004.3, AC-005.2). Foreign ID → not-found
 * page (AC-004.2).
 */
export default async function ClientPage({
  params,
}: {
  params: Promise<{ workspaceId: string; clientId: string }>;
}) {
  const { workspaceId, clientId } = await params;
  const api = await serverApi();
  const [{ data: client }, projects, archivedProjects, { data: ws }] = await Promise.all([
    api.clients.get(workspaceId, clientId),
    api.projects.list(workspaceId, { clientId, limit: 100 }),
    api.projects.list(workspaceId, { clientId, archived: true, limit: 100 }),
    api.workspaces.get(workspaceId),
  ]).catch(handleServerError);
  const archived = client.archivedAt !== null;
  const all = [...projects.items, ...archivedProjects.items];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.breadcrumbs}>
            <Link href={`/w/${workspaceId}/clients`}>Clients</Link> / {client.name}
          </p>
          <h1 className={styles.title}>{client.name}</h1>
          <p className={styles.meta}>
            {archived ? <StatusBadge tone="neutral">Archived</StatusBadge> : null}
            {client.contactName ? <span>{client.contactName}</span> : null}
          </p>
        </div>
        {archived ? null : (
          <ArchiveButton
            workspaceId={workspaceId}
            kind="client"
            id={client.id}
            name={client.name}
          />
        )}
      </div>

      <ClientForm workspaceId={workspaceId} initial={client} />

      <section className={styles.card} aria-labelledby="client-projects">
        <h2 id="client-projects" className={styles.cardTitle}>
          Projects
        </h2>
        {archived ? null : (
          <NewProjectPanel
            workspaceId={workspaceId}
            clients={[{ id: client.id, name: client.name }]}
            defaultCurrency={ws.defaultCurrency}
            fixedClientId={client.id}
          />
        )}
        {all.length === 0 ? (
          <EmptyState title="No projects for this client yet" />
        ) : (
          <ul className={styles.list}>
            {all.map((p) => (
              <li key={p.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <Link href={`/w/${workspaceId}/projects/${p.id}`} className={styles.rowTitle}>
                    {p.name}
                  </Link>
                </div>
                {p.archivedAt ? (
                  <StatusBadge tone="neutral">Archived</StatusBadge>
                ) : (
                  <StatusBadge tone={PROJECT_STATUS[p.status].tone}>
                    {PROJECT_STATUS[p.status].label}
                  </StatusBadge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
