'use client';

import {
  channels,
  decisions,
  type ChangeRequestDetail,
  type Channel,
  type Decision,
  type VersionDto,
} from '@soloops/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorSummary } from '@/components/ErrorSummary';
import { SelectField } from '@/components/SelectField';
import { TextArea } from '@/components/TextArea';
import { TextField } from '@/components/TextField';
import { browserApi } from '@/lib/api/browser';
import { describeError } from '@/lib/api/errors';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatMoney } from '@/features/core-ops/money';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';
import { CHANNEL_LABEL, DECISION_LABEL, formatMinutes, shortHash } from './cr-labels';

type Dialog = 'propose' | 'decision' | 'withdraw' | 'discard' | 'tasks' | null;

const newKey = () => crypto.randomUUID();

/**
 * S-07 "Next step" panel: exactly one primary action per version state. Every transition is a
 * human request to a dedicated endpoint (BR-002); the server enforces state, hash and role.
 */
export function NextStepPanel({
  workspaceId,
  cr,
  version,
  today,
  basePath,
}: {
  workspaceId: string;
  cr: ChangeRequestDetail;
  version: VersionDto;
  today: string;
  basePath: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [status, setStatus] = useState('');
  const [problems, setProblems] = useState<{ fieldId?: string; message: string }[]>([]);
  // One Idempotency-Key per opened dialog: a retry after a network error reuses it (AC-020.3 pattern).
  const [key, setKey] = useState(newKey);
  const [decision, setDecision] = useState<Decision>('APPROVED');
  const [maker, setMaker] = useState(cr.requestedByName);
  const [decidedOn, setDecidedOn] = useState(today);
  const [channel, setChannel] = useState<Channel>(cr.sourceChannel);
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** Shown inside an open dialog when the outcome is unknown (network / 5xx): retry is safe. */
  const [retryError, setRetryError] = useState('');
  /** FR-030: the acceptance criteria chosen for conversion (all by default). */
  const [criteria, setCriteria] = useState<number[]>([]);

  const open = (d: Dialog) => {
    setBanner(null);
    setProblems([]);
    setFieldErrors({});
    setRetryError('');
    setConfirmed(false);
    setCriteria(version.acceptanceCriteria.map((_, i) => i));
    setKey(newKey());
    setDialog(d);
  };
  const onAuthLost = () => router.push(`/signin?returnTo=${encodeURIComponent(basePath)}`);
  const goTo = (n: number) => router.push(`${basePath}?v=${n}`);

  async function run<T>(
    action: () => Promise<T>,
    done: string | ((result: T) => string),
    nextVersion?: number,
  ) {
    setBusy(true);
    setBanner(null);
    setRetryError('');
    try {
      const result = await action();
      setDialog(null);
      setStatus(typeof done === 'string' ? done : done(result));
      if (nextVersion) goTo(nextVersion);
      router.refresh();
    } catch (err) {
      const d = describeError(err);
      if (d.status === 422 && d.fieldErrors.length > 0 && dialog === 'propose') {
        // AC-011.1: list exactly what is missing.
        setProblems(d.fieldErrors.map((f) => ({ message: f.message })));
      } else if (d.status === 422 && dialog === 'decision') {
        setFieldErrors(Object.fromEntries(d.fieldErrors.map((f) => [f.path, f.message])));
      } else if (d.code === 'VERSION_HASH_MISMATCH' || d.code === 'INVALID_STATE_TRANSITION') {
        setDialog(null);
        setBanner({
          tone: 'warning',
          title: 'This proposal changed or was already decided — reload',
          message: d.message,
          reload: true,
        });
      } else if (dialog !== null && (d.status === 0 || d.status >= 500)) {
        // The request may or may not have been applied: keep the dialog AND its Idempotency-Key,
        // so retrying returns the stored result instead of acting twice (api-design §1).
        setRetryError(`${d.message} You can retry safely — it will not be recorded twice.`);
      } else {
        setDialog(null);
        setBanner(bannerForError(err, { onUnauthenticated: onAuthLost }));
      }
    } finally {
      setBusy(false);
    }
  }

  const readOnly = cr.readOnly;
  const isOpenVersion = cr.openVersionNumber === version.number;
  const state = version.state;
  const price =
    version.pricing?.priceMinor && version.pricing
      ? formatMoney(version.pricing.priceMinor, version.pricing.currency)
      : 'calculated when you propose';

  let primary: React.ReactNode = null;
  const secondary: React.ReactNode[] = [];
  if (readOnly) {
    primary = (
      <p className={styles.muted}>This project is archived, so the change request is read-only.</p>
    );
  } else if (state === 'DRAFT') {
    primary = (
      <Button type="button" onClick={() => open('propose')}>
        Propose to client…
      </Button>
    );
    if (version.number > 1) {
      secondary.push(
        <Button key="discard" type="button" variant="ghost" onClick={() => open('discard')}>
          Discard draft
        </Button>,
      );
    }
  } else if (state === 'PROPOSED') {
    primary = (
      <Button type="button" onClick={() => open('decision')}>
        Record client decision…
      </Button>
    );
    secondary.push(
      <Link key="summary" href={`${basePath}/versions/${version.number}/summary`}>
        View client summary
      </Link>,
      <Button key="withdraw" type="button" variant="ghost" onClick={() => open('withdraw')}>
        Withdraw proposal
      </Button>,
    );
  } else if (state === 'APPROVED') {
    // S-07: an approved version authorises work, so turning it into tasks is the next step.
    primary = (
      <Button type="button" onClick={() => open('tasks')}>
        Create tasks from this version…
      </Button>
    );
    secondary.push(
      <Link key="tasks" href={`${basePath.replace(/\/change-requests\/[^/]+$/, '')}/tasks`}>
        View tasks
      </Link>,
      <Link key="summary" href={`${basePath}/versions/${version.number}/summary`}>
        View client summary
      </Link>,
    );
    if (cr.openVersionNumber === null) {
      secondary.push(
        <Button
          key="revise"
          type="button"
          variant="secondary"
          loading={busy}
          onClick={() =>
            void run(
              () => browserApi.changeRequests.newVersion(workspaceId, cr.id, newKey()),
              `Version ${version.number + 1} created as a draft.`,
              version.number + 1,
            )
          }
        >
          Start revision
        </Button>,
      );
    } else {
      secondary.push(
        <Button
          key="open"
          type="button"
          variant="ghost"
          onClick={() => goTo(cr.openVersionNumber as number)}
        >
          Go to open version v{cr.openVersionNumber}
        </Button>,
      );
    }
  } else if (state === 'SUPERSEDED') {
    primary = cr.approvedVersionNumber ? (
      <Button type="button" onClick={() => goTo(cr.approvedVersionNumber as number)}>
        Go to current version
      </Button>
    ) : null;
  } else if (cr.openVersionNumber === null && version.number === cr.latestVersionNumber) {
    primary = (
      <Button
        type="button"
        loading={busy}
        onClick={() =>
          void run(
            () => browserApi.changeRequests.newVersion(workspaceId, cr.id, newKey()),
            `Version ${version.number + 1} created as a draft.`,
            version.number + 1,
          )
        }
      >
        Create new version
      </Button>
    );
  } else if (cr.openVersionNumber !== null && !isOpenVersion) {
    primary = (
      <Button
        type="button"
        variant="secondary"
        onClick={() => goTo(cr.openVersionNumber as number)}
      >
        Go to open version v{cr.openVersionNumber}
      </Button>
    );
  }

  const decisionErrors = Object.entries(fieldErrors).map(([path, message]) => ({
    fieldId: `decision-${path}`,
    message,
  }));

  return (
    <section className={styles.card} aria-labelledby="next-step">
      <h3 id="next-step" className={styles.cardTitle}>
        Next step
      </h3>
      <BannerAlert banner={banner} />
      <p className="so-visually-hidden" role="status" aria-live="polite">
        {status}
      </p>
      <div className={styles.actions}>
        {primary}
        {secondary}
      </div>

      <ConfirmDialog
        open={dialog === 'propose'}
        title={`Propose v${version.number} to the client?`}
        confirmLabel={`Propose v${version.number}`}
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          void run(
            () =>
              browserApi.changeRequests.propose(
                workspaceId,
                cr.id,
                version.number,
                cr.rowVersion,
                key,
              ),
            `v${version.number} proposed. Share the summary with the client, then record their reply.`,
          )
        }
      >
        {problems.length > 0 ? (
          <ErrorSummary title="The proposal is incomplete" items={problems} />
        ) : null}
        {retryError ? (
          <Alert tone="error" title="Couldn’t confirm the result">
            {retryError}
          </Alert>
        ) : null}
        <p>
          Price {price}
          {version.effort
            ? ` · effort ${formatMinutes(version.effort.likelyMinutes)} likely`
            : ''}{' '}
          · {version.assumptions.length} assumption{version.assumptions.length === 1 ? '' : 's'} ·{' '}
          {version.acceptanceCriteria.length} acceptance criteri
          {version.acceptanceCriteria.length === 1 ? 'on' : 'a'}.
        </p>
        <p>
          After proposing, v{version.number} is frozen. Any change will need a new version and a new
          client decision.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'decision'}
        title={`Record client decision — ${cr.key} v${version.number} · ref ${shortHash(version.contentHash)}`}
        confirmLabel={DECISION_LABEL[decision].confirm}
        busy={busy}
        confirmDisabled={!confirmed}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          void run(
            () =>
              browserApi.changeRequests.recordDecision(
                workspaceId,
                cr.id,
                version.number,
                {
                  decision,
                  // BR-010: the hash of the exact version shown, proving what the user looked at.
                  contentHash: version.contentHash ?? '',
                  clientDecisionMakerName: maker,
                  decidedOn,
                  channel,
                  evidenceNote: evidence,
                },
                key,
              ),
            `${DECISION_LABEL[decision].option} recorded for v${version.number}.`,
          )
        }
      >
        {decisionErrors.length > 0 ? <ErrorSummary items={decisionErrors} /> : null}
        {retryError ? (
          <Alert tone="error" title="Couldn’t confirm the result">
            {retryError}
          </Alert>
        ) : null}
        <fieldset className={styles.fieldset}>
          <legend className={styles.rowTitle}>Decision</legend>
          {decisions.map((d) => (
            <label key={d} className={styles.checkbox}>
              <input
                type="radio"
                name="decision"
                value={d}
                checked={decision === d}
                onChange={() => setDecision(d)}
              />
              {DECISION_LABEL[d].option}
            </label>
          ))}
        </fieldset>
        <TextField
          id="decision-clientDecisionMakerName"
          label="Client decision-maker"
          required
          value={maker}
          error={fieldErrors.clientDecisionMakerName}
          onChange={(e) => setMaker(e.target.value)}
        />
        <TextField
          id="decision-decidedOn"
          label="Decision date"
          hint="Today or earlier"
          type="date"
          required
          max={today}
          value={decidedOn}
          error={fieldErrors.decidedOn}
          onChange={(e) => setDecidedOn(e.target.value)}
        />
        <SelectField
          id="decision-channel"
          label="Channel"
          required
          value={channel}
          options={channels.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
          onChange={(e) => setChannel(e.target.value as Channel)}
        />
        <TextArea
          id="decision-evidenceNote"
          label="Evidence"
          hint="Recommended, e.g. the email subject and time"
          rows={2}
          value={evidence}
          error={fieldErrors.evidenceNote}
          onChange={(e) => setEvidence(e.target.value)}
        />
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I confirm the client made this decision on the proposal above.
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'withdraw'}
        title={`Withdraw v${version.number}?`}
        confirmLabel={`Withdraw v${version.number}`}
        danger
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          void run(
            () => browserApi.changeRequests.withdraw(workspaceId, cr.id, version.number, key),
            `v${version.number} withdrawn.`,
          )
        }
      >
        <p>The proposal will no longer wait for a decision and authorises nothing.</p>
        {retryError ? (
          <Alert tone="error" title="Couldn’t confirm the result">
            {retryError}
          </Alert>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'tasks'}
        title={`Create tasks from ${cr.key} v${version.number}?`}
        confirmLabel={`Create ${criteria.length} task${criteria.length === 1 ? '' : 's'}`}
        busy={busy}
        confirmDisabled={criteria.length === 0}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          void run(
            () =>
              browserApi.changeRequests.convertToTasks(
                workspaceId,
                cr.id,
                version.number,
                { criterionIndexes: criteria },
                key,
              ),
            (r) =>
              [
                r.created.length > 0
                  ? `${r.created.length} task${r.created.length === 1 ? '' : 's'} created from v${version.number}.`
                  : 'No new tasks.',
                r.alreadyConverted.length > 0
                  ? `${r.alreadyConverted.length} criteri${r.alreadyConverted.length === 1 ? 'on already had a task' : 'a already had tasks'}, so no duplicates were made.`
                  : '',
              ]
                .join(' ')
                .trim(),
          )
        }
      >
        {retryError ? (
          <Alert tone="error" title="Couldn’t confirm the result">
            {retryError}
          </Alert>
        ) : null}
        <p>
          One billable task per acceptance criterion, linked to v{version.number} (additional
          scope). Criteria that already have a task are skipped.
        </p>
        {version.acceptanceCriteria.length === 0 ? (
          <p className={styles.muted}>This version has no acceptance criteria.</p>
        ) : (
          <fieldset className={styles.fieldset}>
            <legend className={styles.rowTitle}>Acceptance criteria</legend>
            {version.acceptanceCriteria.map((c, i) => (
              <label key={i} className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={criteria.includes(i)}
                  onChange={(e) =>
                    setCriteria((prev) =>
                      e.target.checked
                        ? [...prev, i].sort((a, b) => a - b)
                        : prev.filter((x) => x !== i),
                    )
                  }
                />
                {c}
              </label>
            ))}
          </fieldset>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'discard'}
        title={`Discard draft v${version.number}?`}
        confirmLabel={`Discard v${version.number}`}
        danger
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          void run(
            () => browserApi.changeRequests.discardDraft(workspaceId, cr.id, version.number),
            `Draft v${version.number} discarded.`,
            version.number - 1,
          )
        }
      >
        <p>The draft was never proposed and will be removed. Earlier versions stay unchanged.</p>
      </ConfirmDialog>
    </section>
  );
}
