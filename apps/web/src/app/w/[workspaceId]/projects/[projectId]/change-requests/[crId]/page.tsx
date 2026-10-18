import type { Metadata } from 'next';
import Link from 'next/link';
import { StatusBadge } from '@/components/StatusBadge';
import { ChangeRequestWorkspace } from '@/features/change-requests/ChangeRequestWorkspace';
import { CHANNEL_LABEL, CR_STATUS, VERSION_STATE } from '@/features/change-requests/cr-labels';
import { HistoryTimeline } from '@/features/change-requests/HistoryTimeline';
import { ScopeStrip } from '@/features/change-requests/ScopeStrip';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatDay } from '@/features/core-ops/labels';
import { handleServerError, serverApi } from '@/lib/api/server';
import { todayIn } from '@/lib/today';

export const metadata: Metadata = { title: 'Change request' };

/**
 * S-07 Change request detail: what's original, what's additional, how much, whether approval is
 * pending, and what's authorised. `?v=n` selects a version (default: the open one, else latest).
 */
export default async function ChangeRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string; crId: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const [{ workspaceId, projectId, crId }, query] = await Promise.all([params, searchParams]);
  const api = await serverApi();
  const [cr, requirements, aiStatus, { data: ws }, { data: project }] = await Promise.all([
    api.changeRequests.get(workspaceId, crId),
    api.requirements.list(workspaceId, projectId),
    api.ai.status(workspaceId),
    api.workspaces.get(workspaceId),
    api.projects.get(workspaceId, projectId),
  ]).catch(handleServerError);
  const requested = Number(query.v);
  const version =
    cr.versions.find((v) => v.number === requested) ??
    cr.versions.find((v) => v.number === cr.openVersionNumber) ??
    cr.versions.at(-1);
  if (!version) return null;
  const base = `/w/${workspaceId}/projects/${projectId}/change-requests/${crId}`;

  return (
    <div className={styles.page}>
      <div className={styles.headerText}>
        <p className={styles.breadcrumbs}>
          <Link href={`/w/${workspaceId}/projects/${projectId}/change-requests`}>
            Change requests
          </Link>{' '}
          / {cr.key}
        </p>
        <h2 className={styles.title}>
          {cr.key} · {version.title || 'Untitled'}
        </h2>
        <p className={styles.meta}>
          <StatusBadge tone={CR_STATUS[cr.status].tone}>{CR_STATUS[cr.status].label}</StatusBadge>
          <span>
            Received {formatDay(cr.receivedOn)} via {CHANNEL_LABEL[cr.sourceChannel]} from “
            {cr.requestedByName}”
          </span>
        </p>
      </div>
      <details className={styles.card}>
        <summary className={styles.rowTitle}>Original message (verbatim)</summary>
        <p className={styles.preLine}>{cr.rawRequestText}</p>
      </details>

      <ScopeStrip cr={cr} version={version} requirements={requirements.items} />

      <nav aria-label="Versions">
        <ul className={styles.tabs}>
          {cr.versions.map((v) => {
            const current = v.number === version.number;
            return (
              <li key={v.number}>
                <Link
                  href={`${base}?v=${v.number}`}
                  className={[styles.tab, current ? styles.tabCurrent : ''].join(' ')}
                  aria-current={current ? 'page' : undefined}
                >
                  v{v.number} · {VERSION_STATE[v.state].label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <ChangeRequestWorkspace
        workspaceId={workspaceId}
        cr={cr}
        versionNumber={version.number}
        requirements={requirements.items}
        currency={project.currency}
        aiAvailable={aiStatus.workspaceEnabled && aiStatus.health !== 'unconfigured'}
        isOwner={ws.myRole === 'OWNER'}
        today={todayIn(ws.timeZone)}
        basePath={base}
      />

      <HistoryTimeline history={cr.history} decisions={cr.decisions} timeZone={ws.timeZone} />
    </div>
  );
}
