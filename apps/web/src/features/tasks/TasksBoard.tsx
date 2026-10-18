'use client';

import {
  taskStatuses,
  type RequirementDto,
  type TaskDto,
  type TaskStatus,
} from '@soloops/contracts';
import { Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { browserApi } from '@/lib/api/browser';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { TASK_STATUS } from '@/features/core-ops/labels';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';
import { TaskForm } from './TaskForm';
import type { ApprovedVersion } from './task-form';

/**
 * S-09 Tasks (FR-014): a list grouped by status (a board is post-MVP). Each row shows its
 * ScopeTag (design system §6), assignee, billable flag and an inline status select (AC-016.2).
 */
export function TasksBoard({
  workspaceId,
  projectId,
  tasks,
  requirements,
  approvedVersions = [],
  currentUserId,
  readOnly,
  hasMore,
}: {
  workspaceId: string;
  projectId: string;
  tasks: TaskDto[];
  requirements: RequirementDto[];
  approvedVersions?: ApprovedVersion[];
  currentUserId: string;
  readOnly: boolean;
  hasMore: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [status, setStatus] = useState('');
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const crKeys = new Map(approvedVersions.map((v) => [v.changeRequestId, v.key]));
  const baselinedCount = requirements.filter((r) => r.baselineId !== null).length;
  const here = `/w/${workspaceId}/projects/${projectId}/tasks`;

  async function changeStatus(task: TaskDto, next: TaskStatus) {
    setPendingId(task.id);
    setBanner(null);
    setStatus('');
    try {
      await browserApi.tasks.update(workspaceId, task.id, { status: next }, task.rowVersion);
      setStatus(`“${task.title}” moved to ${TASK_STATUS[next].label}.`);
      router.refresh();
    } catch (err) {
      setBanner(
        bannerForError(err, {
          onUnauthenticated: () => router.push(`/signin?returnTo=${encodeURIComponent(here)}`),
        }),
      );
    } finally {
      setPendingId(null);
    }
  }

  const scopeTag = (t: TaskDto) => {
    if (t.scope.type === 'BASELINE' && t.scope.requirementId) {
      const r = byId.get(t.scope.requirementId);
      return (
        <StatusBadge tone="info" square>
          Original scope · <span className="so-mono">{r?.key ?? 'REQ'}</span>
        </StatusBadge>
      );
    }
    if (t.scope.type === 'CHANGE_REQUEST') {
      const cr = crKeys.get(t.scope.changeRequestId ?? '');
      return (
        <StatusBadge tone="success" square>
          Additional · <span className="so-mono">{cr ?? 'CR'}</span> v{t.scope.versionNumber}
        </StatusBadge>
      );
    }
    return (
      <StatusBadge tone="neutral" square>
        Internal (not billable)
      </StatusBadge>
    );
  };
  const assignee = (t: TaskDto) =>
    t.assigneeUserId === null
      ? 'Unassigned'
      : t.assigneeUserId === currentUserId
        ? 'Me'
        : 'Another member';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.cardTitle}>Tasks</h2>
        {readOnly ? null : (
          <Button
            type="button"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}
          >
            New task
          </Button>
        )}
      </div>
      {readOnly ? (
        <Alert tone="warning" title="Archived — read-only">
          This project is archived. Tasks can no longer be added or changed.
        </Alert>
      ) : null}
      {!readOnly && baselinedCount === 0 && approvedVersions.length === 0 ? (
        <Alert tone="info" title="No baseline yet">
          Billable tasks need a baselined requirement or an approved change request.{' '}
          <Link href={`/w/${workspaceId}/projects/${projectId}/requirements`}>
            Baseline the scope
          </Link>{' '}
          first, or create internal (non-billable) tasks.
        </Alert>
      ) : null}
      <BannerAlert banner={banner} />
      <p className="so-visually-hidden" role="status" aria-live="polite">
        {status}
      </p>

      {creating ? (
        <TaskForm
          workspaceId={workspaceId}
          projectId={projectId}
          requirements={requirements}
          approvedVersions={approvedVersions}
          currentUserId={currentUserId}
          onDone={() => setCreating(false)}
        />
      ) : null}

      {tasks.length === 0 && !creating ? (
        <EmptyState title="No tasks yet">
          Tasks come from baselined requirements or approved change requests.{' '}
          <Link href={`/w/${workspaceId}/projects/${projectId}/requirements`}>
            View requirements
          </Link>
        </EmptyState>
      ) : null}

      {taskStatuses.map((s) => {
        const group = tasks.filter((t) => t.status === s);
        if (group.length === 0) return null;
        const titleId = `tasks-${s}`;
        return (
          <section key={s} className={styles.card} aria-labelledby={titleId}>
            <div className={styles.groupHeader}>
              <h3 id={titleId} className={styles.cardTitle}>
                {TASK_STATUS[s].label}
              </h3>
              <StatusBadge tone={TASK_STATUS[s].tone}>{group.length}</StatusBadge>
            </div>
            <ul className={styles.list}>
              {group.map((t) =>
                editingId === t.id ? (
                  <li key={t.id} className={styles.row}>
                    <TaskForm
                      workspaceId={workspaceId}
                      projectId={projectId}
                      requirements={requirements}
                      approvedVersions={approvedVersions}
                      currentUserId={currentUserId}
                      initial={t}
                      onDone={() => setEditingId(null)}
                    />
                  </li>
                ) : (
                  <li key={t.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <span className={styles.rowTitle}>{t.title}</span>
                      <span className={styles.meta}>
                        {scopeTag(t)}
                        <span>{assignee(t)}</span>
                        <span>· {t.billable ? 'Billable' : 'Not billable'}</span>
                      </span>
                    </div>
                    {readOnly ? (
                      <StatusBadge tone={TASK_STATUS[t.status].tone}>
                        {TASK_STATUS[t.status].label}
                      </StatusBadge>
                    ) : (
                      <div className={styles.actions}>
                        <label className="so-visually-hidden" htmlFor={`status-${t.id}`}>
                          Status of {t.title}
                        </label>
                        <select
                          id={`status-${t.id}`}
                          className={styles.inlineSelect}
                          value={t.status}
                          disabled={pendingId === t.id}
                          aria-busy={pendingId === t.id || undefined}
                          onChange={(e) => void changeStatus(t, e.target.value as TaskStatus)}
                        >
                          {taskStatuses.map((v) => (
                            <option key={v} value={v}>
                              {TASK_STATUS[v].label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          icon={<Pencil size={16} aria-hidden="true" />}
                          aria-label={`Edit ${t.title}`}
                          onClick={() => {
                            setCreating(false);
                            setEditingId(t.id);
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    )}
                  </li>
                ),
              )}
            </ul>
          </section>
        );
      })}
      {hasMore ? <p className={styles.muted}>Showing the 100 most recent tasks.</p> : null}
    </div>
  );
}
