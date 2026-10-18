import { crStatuses, taskStatuses } from '@soloops/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/Alert';
import { CR_STATUS } from '@/features/change-requests/cr-labels';
import { ArchiveButton } from '@/features/core-ops/ArchiveButton';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatDate, TASK_STATUS } from '@/features/core-ops/labels';
import { formatMoney } from '@/features/core-ops/money';
import { ProjectForm } from '@/features/projects/ProjectForm';
import { handleServerError, serverApi } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Project' };

/**
 * S-04 Project overview (FR-015, AC-024.1): requirement, change-request and task counts and the
 * eligible unbilled total, all from the server overview; plus the project details (FR-011).
 */
export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const api = await serverApi();
  const [{ data: project }, overview, baselines, { data: ws }] = await Promise.all([
    api.projects.get(workspaceId, projectId),
    api.projects.overview(workspaceId, projectId),
    api.baselines.list(workspaceId, projectId),
    api.workspaces.get(workspaceId),
  ]).catch(handleServerError);
  const base = `/w/${workspaceId}/projects/${projectId}`;
  const drafts = overview.requirements.draft;
  const frozen = overview.requirements.baselined;
  const latest = baselines.items.at(-1);
  const openCrs = crStatuses.filter((s) => overview.changeRequests[s] > 0);

  return (
    <>
      {baselines.items.length === 0 && !project.readOnly ? (
        <Alert
          tone="warning"
          title="No baseline yet"
          action={<Link href={`${base}/requirements`}>Baseline scope</Link>}
        >
          Billable work needs an agreed original scope. Record the requirements and baseline them.
        </Alert>
      ) : null}

      <section className={styles.card} aria-labelledby="scope-title">
        <h2 id="scope-title" className={styles.cardTitle}>
          Scope
        </h2>
        <p className={styles.muted}>
          {latest
            ? `Original scope: ${baselines.items.length} baseline${baselines.items.length === 1 ? '' : 's'}, ${frozen} frozen requirement${frozen === 1 ? '' : 's'}. Latest: Baseline ${latest.sequence}, ${formatDate(latest.createdAt)}.`
            : 'Not baselined yet.'}{' '}
          {drafts > 0
            ? `${drafts} draft requirement${drafts === 1 ? '' : 's'} not yet agreed.`
            : ''}
        </p>
        <p>
          <Link href={`${base}/requirements`}>View requirements</Link>
        </p>
      </section>

      <section className={styles.card} aria-labelledby="crs-title">
        <h2 id="crs-title" className={styles.cardTitle}>
          Change requests
        </h2>
        {openCrs.length === 0 ? (
          <p className={styles.muted}>No change requests yet.</p>
        ) : (
          <dl className={styles.stats}>
            {openCrs.map((s) => (
              <div key={s} className={styles.stat}>
                <dt className={styles.statLabel}>{CR_STATUS[s].label}</dt>
                <dd className={styles.statValue}>{overview.changeRequests[s]}</dd>
              </div>
            ))}
          </dl>
        )}
        <p>
          <Link href={`${base}/change-requests`}>View change requests</Link>
        </p>
      </section>

      <section className={styles.card} aria-labelledby="tasks-title">
        <h2 id="tasks-title" className={styles.cardTitle}>
          Tasks
        </h2>
        <dl className={styles.stats}>
          {taskStatuses.map((s) => (
            <div key={s} className={styles.stat}>
              <dt className={styles.statLabel}>{TASK_STATUS[s].label}</dt>
              <dd className={styles.statValue}>{overview.tasks[s]}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.muted}>
          {overview.tasks.original} on original scope · {overview.tasks.additional} on approved
          change requests · {overview.tasks.internal} internal
        </p>
        <p>
          <Link href={`${base}/tasks`}>View tasks</Link>
        </p>
      </section>

      <section className={styles.card} aria-labelledby="billing-title">
        <h2 id="billing-title" className={styles.cardTitle}>
          Unbilled work
        </h2>
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Ready to invoice</dt>
            <dd className={styles.statValue}>
              {formatMoney(overview.unbilled.eligibleTotalMinor, overview.currency)}
            </dd>
          </div>
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Entries ready</dt>
            <dd className={styles.statValue}>{overview.unbilled.eligibleCount}</dd>
          </div>
          <div className={styles.stat}>
            <dt className={styles.statLabel}>Not billable yet</dt>
            <dd className={styles.statValue}>{overview.unbilled.ineligibleCount}</dd>
          </div>
        </dl>
        <p>
          <Link href={`${base}/billing`}>View billing</Link>
        </p>
      </section>

      <ProjectForm
        workspaceId={workspaceId}
        clients={[]}
        defaultCurrency={ws.defaultCurrency}
        initial={project}
      />
      {project.archivedAt === null && !project.readOnly ? (
        <div className={styles.actions}>
          <ArchiveButton
            workspaceId={workspaceId}
            kind="project"
            id={project.id}
            name={project.name}
          />
        </div>
      ) : null}
    </>
  );
}
