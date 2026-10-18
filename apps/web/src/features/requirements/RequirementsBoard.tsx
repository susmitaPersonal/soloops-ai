'use client';

import type { BaselineDto, RequirementDto } from '@soloops/contracts';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { browserApi } from '@/lib/api/browser';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatDate, PRIORITY_LABEL } from '@/features/core-ops/labels';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';
import { RequirementForm } from './RequirementForm';

type Dialog = { kind: 'baseline' } | { kind: 'delete'; requirement: RequirementDto } | null;

/**
 * S-05 Requirements and baselines (FR-012, FR-013). Drafts are grouped above the frozen
 * baselines. Frozen requirements offer no edit or delete (AC-007.2); "Baseline scope…" is an L2
 * confirmation that states exactly what will be frozen (design system §7.8), and is disabled
 * with an explanation when there is nothing to freeze (AC-007.3).
 */
export function RequirementsBoard({
  workspaceId,
  projectId,
  requirements,
  baselines,
  readOnly,
}: {
  workspaceId: string;
  projectId: string;
  requirements: RequirementDto[];
  baselines: BaselineDto[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [status, setStatus] = useState('');

  const drafts = requirements.filter((r) => r.baselineId === null);
  const nextSequence = (baselines.at(-1)?.sequence ?? 0) + 1;
  const here = `/w/${workspaceId}/projects/${projectId}/requirements`;
  const onError = (err: unknown) =>
    setBanner(
      bannerForError(err, {
        onUnauthenticated: () => router.push(`/signin?returnTo=${encodeURIComponent(here)}`),
      }),
    );

  async function confirmDialog() {
    if (!dialog) return;
    setBusy(true);
    setBanner(null);
    setStatus('');
    try {
      if (dialog.kind === 'baseline') {
        const b = await browserApi.baselines.create(workspaceId, projectId);
        setStatus(
          `Baseline ${b.sequence} created: ${b.requirementCount} requirement${b.requirementCount === 1 ? '' : 's'} frozen.`,
        );
      } else {
        await browserApi.requirements.delete(workspaceId, dialog.requirement.id);
        setStatus(`${dialog.requirement.key} deleted.`);
      }
      setDialog(null);
      router.refresh();
    } catch (err) {
      setDialog(null);
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.cardTitle}>Requirements</h2>
        {readOnly ? null : (
          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() => {
                setEditingId(null);
                setAdding(true);
              }}
            >
              Add requirement
            </Button>
            <Button
              type="button"
              icon={<Lock size={16} aria-hidden="true" />}
              disabled={drafts.length === 0}
              aria-describedby={drafts.length === 0 ? 'baseline-disabled-reason' : undefined}
              onClick={() => setDialog({ kind: 'baseline' })}
            >
              Baseline scope…
            </Button>
          </div>
        )}
      </div>
      {!readOnly && drafts.length === 0 && requirements.length > 0 ? (
        <p id="baseline-disabled-reason" className={styles.muted}>
          Every requirement is already baselined. Add a requirement to create another baseline.
        </p>
      ) : null}
      {!readOnly && requirements.length === 0 ? (
        <p id="baseline-disabled-reason" className="so-visually-hidden">
          Add a requirement before creating a baseline.
        </p>
      ) : null}
      {readOnly ? (
        <Alert tone="warning" title="Archived — read-only">
          This project is archived. Requirements can no longer be added, changed or baselined.
        </Alert>
      ) : null}

      <BannerAlert banner={banner} />
      <p className="so-visually-hidden" role="status" aria-live="polite">
        {status}
      </p>
      {status ? <Alert tone="success" title={status} /> : null}

      {adding ? (
        <RequirementForm
          workspaceId={workspaceId}
          projectId={projectId}
          onDone={() => setAdding(false)}
        />
      ) : null}

      {requirements.length === 0 && !adding ? (
        <EmptyState title="Record what the client asked for originally">
          Add each requirement, then baseline them as the agreed original scope.
        </EmptyState>
      ) : null}

      {drafts.length > 0 ? (
        <section className={styles.card} aria-labelledby="drafts-title">
          <div className={styles.groupHeader}>
            <h3 id="drafts-title" className={styles.cardTitle}>
              Draft (not yet agreed) — {drafts.length}
            </h3>
            <StatusBadge tone="neutral">Editable</StatusBadge>
          </div>
          <ul className={styles.list}>
            {drafts.map((r) =>
              editingId === r.id ? (
                <li key={r.id} className={styles.row}>
                  <RequirementForm
                    workspaceId={workspaceId}
                    projectId={projectId}
                    initial={r}
                    onDone={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li key={r.id} className={styles.row}>
                  <RequirementSummary requirement={r} />
                  {readOnly ? null : (
                    <div className={styles.actions}>
                      <Button
                        type="button"
                        variant="ghost"
                        icon={<Pencil size={16} aria-hidden="true" />}
                        aria-label={`Edit ${r.key}`}
                        onClick={() => {
                          setAdding(false);
                          setEditingId(r.id);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        icon={<Trash2 size={16} aria-hidden="true" />}
                        aria-label={`Delete ${r.key}`}
                        onClick={() => setDialog({ kind: 'delete', requirement: r })}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </li>
              ),
            )}
          </ul>
        </section>
      ) : null}

      {[...baselines].reverse().map((b) => {
        const frozen = requirements.filter((r) => r.baselineId === b.id);
        const titleId = `baseline-${b.sequence}-title`;
        return (
          <section key={b.id} className={styles.card} aria-labelledby={titleId}>
            <div className={styles.groupHeader}>
              <Lock size={16} aria-hidden="true" />
              <h3 id={titleId} className={styles.cardTitle}>
                {b.sequence === 1 ? 'Original scope' : 'Agreed scope'} · Baseline {b.sequence}
              </h3>
              <StatusBadge tone="info">Frozen</StatusBadge>
            </div>
            <p className={styles.muted}>
              {formatDate(b.createdAt)} · {b.requirementCount} requirement
              {b.requirementCount === 1 ? '' : 's'} · hash{' '}
              <span className="so-mono" title={b.contentHash}>
                {b.contentHash.slice(0, 8)}…
              </span>
              . Changes to these requirements need a change request.
            </p>
            <ul className={styles.list}>
              {frozen.map((r) => (
                <li key={r.id} className={styles.row}>
                  <RequirementSummary requirement={r} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <ConfirmDialog
        open={dialog !== null}
        title={
          dialog?.kind === 'delete'
            ? `Delete ${dialog.requirement.key}?`
            : `Freeze ${drafts.length} requirement${drafts.length === 1 ? '' : 's'} as Baseline ${nextSequence}?`
        }
        confirmLabel={
          dialog?.kind === 'delete'
            ? `Delete ${dialog.requirement.key}`
            : `Create Baseline ${nextSequence}`
        }
        danger={dialog?.kind === 'delete'}
        busy={busy}
        onConfirm={confirmDialog}
        onClose={() => setDialog(null)}
      >
        {dialog?.kind === 'delete' ? (
          <p>
            “{dialog.requirement.title}” will be removed. Its number {dialog.requirement.key} is not
            reused.
          </p>
        ) : (
          <>
            <p>
              These requirements become the agreed scope. They can’t be edited or deleted
              afterwards; changes will need a change request.
            </p>
            <ul>
              {drafts.map((r) => (
                <li key={r.id}>
                  <span className="so-mono">{r.key}</span> {r.title}
                </li>
              ))}
            </ul>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

function RequirementSummary({ requirement: r }: { requirement: RequirementDto }) {
  return (
    <div className={styles.rowMain}>
      <span>
        <span className={styles.key}>{r.key}</span>{' '}
        <span className={styles.rowTitle}>{r.title}</span>
      </span>
      {r.description ? <span className={styles.muted}>{r.description}</span> : null}
      {r.acceptanceCriteria.length > 0 ? (
        <ul className={styles.muted}>
          {r.acceptanceCriteria.map((ac, i) => (
            <li key={`${i}-${ac}`}>{ac}</li>
          ))}
        </ul>
      ) : null}
      <span>
        <StatusBadge tone="neutral" square>
          {PRIORITY_LABEL[r.priority]}
        </StatusBadge>
      </span>
    </div>
  );
}
