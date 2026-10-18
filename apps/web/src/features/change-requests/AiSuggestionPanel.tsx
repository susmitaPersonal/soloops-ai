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
import { EVIDENCE_RELATION, formatMinutes, SCOPE_VERDICT } from './cr-labels';

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
  | 'affectedRequirementIds'
  | 'scopeVerdict'
  | 'questionsForClient';

const FIELD_LABEL: Record<SuggestionField, string> = {
  scopeVerdict: 'Scope verdict',
  questionsForClient: 'Questions for the client',
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
      return s.effort
        ? `${formatMinutes(s.effort.lowMinutes)} – ${formatMinutes(s.effort.likelyMinutes)} – ${formatMinutes(s.effort.highMinutes)}`
        : 'No extra effort estimated';
    case 'risks':
      return s.risks.map((r) => `${r.severity}: ${r.description}`).join('\n');
    case 'affectedRequirementIds':
      return s.affectedRequirementKeys.join(', ') || 'None';
    case 'scopeVerdict':
      return SCOPE_VERDICT[s.scope.verdict].label;
    case 'questionsForClient':
      return s.questionsForClient.join('\n') || 'None';
    case 'clarifiedDescription':
    case 'timelineImpact':
      return s[field];
    default:
      return s[field].join('\n');
  }
}

/**
 * FR-021 scope check: the verdict SoloOps stands behind after checking the AI's evidence against
 * the project's real, agreed requirements. When the evidence did not support the AI's own verdict,
 * that is said openly. Plain text only (SEC-009); the verdict is a suggestion until a person applies
 * and proposes it.
 */
function ScopeCheck({ scope }: { scope: AnalysisResponse['suggestion']['scope'] }) {
  const verdict = SCOPE_VERDICT[scope.verdict];
  return (
    <section className={styles.group} aria-labelledby="ai-scope-check">
      <div className={styles.groupHeader}>
        <span id="ai-scope-check" className={styles.rowTitle}>
          Scope check
        </span>
        <StatusBadge tone={verdict.tone}>{verdict.label}</StatusBadge>
      </div>
      <p className={styles.muted}>{verdict.help}</p>
      {scope.rationale ? <p className={styles.preLine}>{scope.rationale}</p> : null}
      {scope.evidence.length > 0 ? (
        <ul aria-label="Evidence from agreed requirements">
          {scope.evidence.map((e) => (
            <li key={e.requirementId}>
              <strong>
                {e.requirementKey} {e.requirementTitle}
              </strong>{' '}
              {EVIDENCE_RELATION[e.relation]}: {e.explanation}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No agreed requirement was cited as evidence.</p>
      )}
      {scope.verdict !== scope.modelVerdict ? (
        <Alert tone="warning" title="SoloOps changed the AI’s verdict">
          The AI said “{SCOPE_VERDICT[scope.modelVerdict].label}”, but its evidence did not support
          that, so SoloOps shows “{verdict.label}”. {scope.adjustments.join(' ')}
        </Alert>
      ) : scope.adjustments.length > 0 ? (
        <Alert tone="warning" title="Some evidence was removed">
          {scope.adjustments.join(' ')}
        </Alert>
      ) : null}
    </section>
  );
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
        The AI compares the client’s message with your agreed (baselined) requirements and drafts a
        proposal. You review and decide what to use; it never proposes, prices or approves anything.
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
          <ScopeCheck scope={state.result.suggestion.scope} />
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
          <p className={styles.muted}>
            The effort range is an uncertain AI estimate. It has not been evaluated for accuracy and
            can vary a lot between runs, so check it against your own experience.
          </p>
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
