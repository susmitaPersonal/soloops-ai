'use client';

import type { AnalysisResponse } from '@soloops/contracts';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { browserApi } from '@/lib/api/browser';
import { describeError } from '@/lib/api/errors';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatMoney } from '@/features/core-ops/money';
import { formatMinutes } from './cr-labels';

export type SuggestionField =
  | 'clarifiedDescription'
  | 'inScope'
  | 'outOfScope'
  | 'acceptanceCriteria'
  | 'assumptions'
  | 'dependencies'
  | 'risks'
  | 'effort'
  | 'timelineImpact'
  | 'affectedRequirementIds';

const FIELD_LABEL: Record<SuggestionField, string> = {
  clarifiedDescription: 'Description',
  inScope: 'In scope',
  outOfScope: 'Not included',
  acceptanceCriteria: 'Acceptance criteria',
  assumptions: 'Assumptions',
  dependencies: 'Dependencies',
  risks: 'Risks',
  effort: 'Effort range',
  timelineImpact: 'Timeline impact',
  affectedRequirementIds: 'Affected requirements',
};

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; result: AnalysisResponse }
  | { kind: 'failure'; title: string; message: string };

function preview(result: AnalysisResponse, field: SuggestionField): string {
  const s = result.suggestion;
  switch (field) {
    case 'effort':
      return `${formatMinutes(s.effort.lowMinutes)} – ${formatMinutes(s.effort.likelyMinutes)} – ${formatMinutes(s.effort.highMinutes)}`;
    case 'risks':
      return s.risks.map((r) => `${r.severity}: ${r.description}`).join('\n');
    case 'affectedRequirementIds':
      return s.affectedRequirementKeys.join(', ') || 'None';
    case 'clarifiedDescription':
    case 'timelineImpact':
      return s[field];
    default:
      return s[field].join('\n');
  }
}

/**
 * S-07 AI suggestion panel (FR-021, FR-051). Advisory only: nothing is applied until a person
 * chooses Apply (AC-009.2). Confirmed effort is never filled from the suggestion (BR-003).
 * Model output is rendered as plain text (SEC-009).
 */
export function AiSuggestionPanel({
  workspaceId,
  crId,
  versionNumber,
  available,
  isOwner,
  onApply,
}: {
  workspaceId: string;
  crId: string;
  versionNumber: number;
  /** Workspace opted in AND a provider is configured. */
  available: boolean;
  isOwner: boolean;
  onApply: (fields: SuggestionField[], result: AnalysisResponse) => void;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [applied, setApplied] = useState<Set<SuggestionField>>(new Set());
  const controller = useRef<AbortController | null>(null);

  if (!available) {
    return isOwner ? (
      <Alert tone="info" title="AI assistance is off">
        You can write the proposal manually. To get AI suggestions,{' '}
        <Link href={`/w/${workspaceId}/settings`}>enable AI in Settings</Link>.
      </Alert>
    ) : null;
  }

  async function analyze() {
    controller.current = new AbortController();
    setApplied(new Set());
    setState({ kind: 'running' });
    try {
      const result = await browserApi.changeRequests.analyze(
        workspaceId,
        crId,
        versionNumber,
        controller.current.signal,
      );
      setState({ kind: 'success', result });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState({ kind: 'idle' });
        return;
      }
      const d = describeError(err);
      // FR-051: never a fabricated suggestion — say what happened and that manual entry works.
      const title =
        d.status === 429
          ? 'Too many AI requests — try again in a few minutes'
          : d.code === 'AI_TIMEOUT'
            ? 'The AI took too long'
            : d.code === 'AI_DISABLED'
              ? 'AI is not available'
              : 'The AI could not help this time';
      setState({ kind: 'failure', title, message: `${d.message} Your draft is unchanged.` });
    } finally {
      controller.current = null;
    }
  }

  const apply = (fields: SuggestionField[]) => {
    if (state.kind !== 'success') return;
    onApply(fields, state.result);
    setApplied((prev) => new Set([...prev, ...fields]));
  };

  return (
    <section
      className={styles.card}
      aria-labelledby="ai-panel"
      aria-busy={state.kind === 'running' || undefined}
    >
      <div className={styles.groupHeader}>
        <Sparkles size={16} aria-hidden="true" />
        <h3 id="ai-panel" className={styles.cardTitle}>
          AI suggestion
        </h3>
        <StatusBadge tone="info">Suggestion only</StatusBadge>
      </div>
      <p className={styles.muted}>
        The AI drafts a proposal from the client’s message. You review and decide what to use; it
        never proposes, prices or approves anything.
      </p>
      {state.kind === 'running' ? (
        <div className={styles.actions}>
          <Button type="button" loading>
            Analysing…
          </Button>
          <Button type="button" variant="ghost" onClick={() => controller.current?.abort()}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          icon={<Sparkles size={16} aria-hidden="true" />}
          onClick={() => void analyze()}
        >
          {state.kind === 'success' ? 'Analyse again' : 'Analyse with AI'}
        </Button>
      )}
      <p className="so-visually-hidden" role="status" aria-live="polite">
        {state.kind === 'success'
          ? 'AI suggestion ready.'
          : state.kind === 'failure'
            ? state.title
            : ''}
      </p>
      {state.kind === 'failure' ? (
        <Alert tone="warning" title={state.title}>
          {state.message} You can continue writing the proposal manually.
        </Alert>
      ) : null}
      {state.kind === 'success' ? (
        <>
          {state.result.warnings.map((w) => (
            <Alert key={w.code} tone="warning" title="Check this suggestion">
              {w.message}
            </Alert>
          ))}
          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => apply(Object.keys(FIELD_LABEL) as SuggestionField[])}
            >
              Apply all fields
            </Button>
          </div>
          <ul className={styles.list}>
            {(Object.keys(FIELD_LABEL) as SuggestionField[]).map((f) => (
              <li key={f} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{FIELD_LABEL[f]}</span>
                  <span className={styles.preLine}>{preview(state.result, f)}</span>
                </div>
                {applied.has(f) ? (
                  <StatusBadge tone="success">Applied</StatusBadge>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Apply ${FIELD_LABEL[f]}`}
                    onClick={() => apply([f])}
                  >
                    Apply
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {state.result.suggestion.questionsForClient.length > 0 ? (
            <div className={styles.group}>
              <span className={styles.rowTitle}>Questions for the client</span>
              <ul>
                {state.result.suggestion.questionsForClient.map((q, i) => (
                  <li key={`${i}-${q}`}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {state.result.indicativeCost ? (
            <p className={styles.muted}>
              Indicative cost (calculated by SoloOps from the effort range and your rate, not by the
              AI):{' '}
              {formatMoney(
                state.result.indicativeCost.lowMinor,
                state.result.indicativeCost.currency,
              )}{' '}
              –{' '}
              {formatMoney(
                state.result.indicativeCost.likelyMinor,
                state.result.indicativeCost.currency,
              )}{' '}
              –{' '}
              {formatMoney(
                state.result.indicativeCost.highMinor,
                state.result.indicativeCost.currency,
              )}
            </p>
          ) : null}
          <p className={styles.muted}>
            Confirmed effort is never filled in by the AI — enter the hours you will charge for
            yourself. Model: {state.result.model} · {state.result.promptVersion}
          </p>
        </>
      ) : null}
    </section>
  );
}
