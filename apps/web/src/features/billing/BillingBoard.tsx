'use client';

import type {
  EntryDto,
  EntryListResponse,
  IneligibilityReason,
  RequirementDto,
  TaskDto,
} from '@soloops/contracts';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { browserApi } from '@/lib/api/browser';
import { describeError } from '@/lib/api/errors';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatDay } from '@/features/core-ops/labels';
import { formatMoney } from '@/features/core-ops/money';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';
import { formatMinutes } from '@/features/change-requests/cr-labels';
import type { ApprovedVersion } from '@/features/tasks/task-form';
import { LogWorkForm } from './LogWorkForm';

/** Short reason labels; the full explanation comes from the server (AC-018.1). */
export const REASON_LABEL: Record<IneligibilityReason, string> = {
  UNSCOPED: 'Not linked to agreed scope',
  REQUIREMENT_NOT_BASELINED: 'Requirement not baselined',
  CR_NOT_APPROVED: 'Change request not approved',
  ALREADY_INVOICED: 'Already invoiced',
  CURRENCY_MISMATCH: 'Currency mismatch',
};

/**
 * S-10 Project billing (FR-040, FR-041). The eligible and ineligible sections, reasons, amounts
 * and the total come exactly from the server classification (AC-018.2); this component computes
 * none of them. Invoice drafting arrives with M5.
 */
export function BillingBoard({
  workspaceId,
  projectId,
  list,
  tasks,
  requirements,
  approvedVersions,
  today,
  readOnly,
}: {
  workspaceId: string;
  projectId: string;
  list: EntryListResponse;
  tasks: TaskDto[];
  requirements: RequirementDto[];
  approvedVersions: ApprovedVersion[];
  today: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [logging, setLogging] = useState(false);
  const [status, setStatus] = useState('');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [deleting, setDeleting] = useState<EntryDto | null>(null);
  const [busy, setBusy] = useState(false);
  /** FR-042: work chosen for an invoice draft (eligible rows only). */
  const [selected, setSelected] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  // One Idempotency-Key per selection; kept when the outcome is unknown so a retry is safe.
  const [draftKey, setDraftKey] = useState(() => crypto.randomUUID());
  const base = `/w/${workspaceId}/projects/${projectId}`;
  const money = (minor: string) => formatMoney(minor, list.currency);
  const empty = list.eligible.length === 0 && list.ineligible.length === 0;

  async function remove(entry: EntryDto) {
    setBusy(true);
    setBanner(null);
    try {
      await browserApi.billableEntries.delete(workspaceId, entry.id);
      setStatus(`Entry “${entry.description}” deleted.`);
      router.refresh();
    } catch (err) {
      setBanner(
        bannerForError(err, {
          onUnauthenticated: () =>
            router.push(`/signin?returnTo=${encodeURIComponent(`${base}/billing`)}`),
        }),
      );
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  const toggle = (id: string, on: boolean) => {
    setDraftKey(crypto.randomUUID());
    setSelected((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  async function createDraft() {
    setDrafting(true);
    setBanner(null);
    try {
      const invoice = await browserApi.invoices.create(
        workspaceId,
        { projectId, entryIds: selected },
        draftKey,
      );
      router.push(`/w/${workspaceId}/billing/invoices/${invoice.id}`);
    } catch (err) {
      const d = describeError(err);
      if (d.status === 0 || d.status >= 500) {
        setBanner({
          tone: 'error',
          title: 'Couldn’t confirm the draft',
          message: `${d.message} You can retry safely — it will not be created twice.`,
        });
      } else {
        setDraftKey(crypto.randomUUID());
        setBanner(
          d.status === 422 || d.status === 409
            ? {
                tone: 'warning',
                title: 'Some of the selected work cannot be invoiced',
                message: [d.message, ...d.fieldErrors.map((f) => f.message)].join(' '),
                reload: true,
              }
            : bannerForError(err, {
                onUnauthenticated: () =>
                  router.push(`/signin?returnTo=${encodeURIComponent(`${base}/billing`)}`),
              }),
        );
      }
    } finally {
      setDrafting(false);
    }
  }

  const fix = (e: EntryDto) => {
    if (e.eligibility.eligible) return null;
    switch (e.eligibility.reason) {
      case 'CR_NOT_APPROVED':
        return e.scope.changeRequestId ? (
          <Link href={`${base}/change-requests/${e.scope.changeRequestId}`}>
            Open change request
          </Link>
        ) : null;
      case 'REQUIREMENT_NOT_BASELINED':
        return <Link href={`${base}/requirements`}>Baseline requirements</Link>;
      default:
        return null;
    }
  };

  const scopeTag = (e: EntryDto) =>
    e.scopeKind === 'ORIGINAL' ? (
      <StatusBadge tone="info" square>
        Original scope · <span className="so-mono">{e.scopeLabel ?? 'REQ'}</span>
      </StatusBadge>
    ) : e.scopeKind === 'ADDITIONAL' ? (
      <StatusBadge tone="success" square>
        Additional · <span className="so-mono">{e.scopeLabel ?? 'CR'}</span>
      </StatusBadge>
    ) : (
      <StatusBadge tone="neutral" square>
        Not linked
      </StatusBadge>
    );

  const amount = (e: EntryDto) =>
    e.kind === 'TIME' && e.minutes !== null && e.hourlyRateMinor !== null
      ? `${formatMinutes(e.minutes)} × ${money(e.hourlyRateMinor)}/h = ${money(e.billableAmountMinor)}`
      : `Fixed ${money(e.billableAmountMinor)}`;

  const row = (e: EntryDto) => (
    <li key={e.id} className={styles.row}>
      {e.eligibility.eligible ? (
        <input
          type="checkbox"
          aria-label={`Select “${e.description}”`}
          checked={selected.includes(e.id)}
          onChange={(ev) => toggle(e.id, ev.target.checked)}
        />
      ) : null}
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{e.description}</span>
        <span className={styles.muted}>
          {formatDay(e.workDate)} · {amount(e)}
        </span>
        {scopeTag(e)}
        {e.eligibility.eligible ? null : (
          <p>
            <StatusBadge tone="warning">{REASON_LABEL[e.eligibility.reason]}</StatusBadge>{' '}
            {e.eligibility.explanation} {fix(e)}
          </p>
        )}
      </div>
      {readOnly || e.invoiceId !== null ? null : (
        <Button
          type="button"
          variant="ghost"
          aria-label={`Delete “${e.description}”`}
          onClick={() => setDeleting(e)}
        >
          Delete
        </Button>
      )}
    </li>
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.cardTitle}>Unbilled work</h2>
        {readOnly ? null : (
          <Button
            type="button"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => {
              setStatus('');
              setLogging(true);
            }}
          >
            Log work
          </Button>
        )}
      </div>
      {readOnly ? (
        <Alert tone="warning" title="Archived — read-only">
          This project is archived. Work can no longer be logged or changed.
        </Alert>
      ) : null}
      <BannerAlert banner={banner} />
      <p role="status" aria-live="polite">
        {status}
      </p>
      {logging ? (
        <LogWorkForm
          workspaceId={workspaceId}
          projectId={projectId}
          currency={list.currency}
          today={today}
          tasks={tasks}
          requirements={requirements}
          approvedVersions={approvedVersions}
          onDone={(message) => {
            setLogging(false);
            setStatus(message);
          }}
        />
      ) : null}
      {list.truncated ? (
        <Alert tone="info" title="Showing the newest entries only">
          This project has more unbilled entries than one page shows. Totals cover the entries
          listed here.
        </Alert>
      ) : null}

      {empty && !logging ? (
        <EmptyState title="No unbilled work">Log time from a task or here.</EmptyState>
      ) : null}
      {!empty && list.eligible.length === 0 ? (
        <Alert tone="warning" title="Nothing can be invoiced yet">
          None of this work is linked to a baselined requirement or an approved change request. Fix
          the items below before drafting an invoice.
        </Alert>
      ) : null}

      {list.eligible.length > 0 ? (
        <section className={styles.card} aria-labelledby="ready-title">
          <div className={styles.header}>
            <h3 id="ready-title" className={styles.cardTitle}>
              Ready to invoice ({list.eligible.length})
            </h3>
            <p>
              Total <strong>{money(list.eligibleTotalMinor)}</strong>
            </p>
          </div>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={selected.length === list.eligible.length}
              onChange={(ev) => {
                setDraftKey(crypto.randomUUID());
                setSelected(ev.target.checked ? list.eligible.map((x) => x.id) : []);
              }}
            />
            Select all ready work
          </label>
          <ul className={styles.list}>{list.eligible.map(row)}</ul>
          <div className={styles.actions}>
            <Button
              type="button"
              loading={drafting}
              disabled={selected.length === 0}
              onClick={() => void createDraft()}
            >
              Create invoice draft ({selected.length})
            </Button>
          </div>
          <p className={styles.muted}>
            The draft’s lines, tax and total are calculated by the server. Nothing is issued until
            an owner issues it.
          </p>
        </section>
      ) : null}

      {list.ineligible.length > 0 ? (
        <section className={styles.card} aria-labelledby="not-billable-title">
          <h3 id="not-billable-title" className={styles.cardTitle}>
            Not billable yet ({list.ineligible.length})
          </h3>
          <ul className={styles.list}>{list.ineligible.map(row)}</ul>
        </section>
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this entry?"
        confirmLabel="Delete entry"
        danger
        busy={busy}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void remove(deleting);
        }}
      >
        <p>“{deleting?.description}” will be removed. Invoiced work can never be deleted.</p>
      </ConfirmDialog>
    </div>
  );
}
