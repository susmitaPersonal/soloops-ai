import type { ApprovalDto, HistoryEvent } from '@soloops/contracts';
import styles from '@/features/core-ops/core-ops.module.css';
import { CHANNEL_LABEL, DECISION_LABEL, HISTORY_LABEL, shortHash } from './cr-labels';

/** FR-028 / AC-014.1: decisions (who, when, channel, evidence) and audit events, chronologically. */
export function HistoryTimeline({
  history,
  decisions,
  timeZone,
}: {
  history: HistoryEvent[];
  decisions: ApprovalDto[];
  /** Workspace time zone, so server and browser render the same text. */
  timeZone: string;
}) {
  const fmt = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
  const byApproval = new Map(decisions.map((d) => [d.id, d]));
  return (
    <section className={styles.card} aria-labelledby="cr-history">
      <h3 id="cr-history" className={styles.cardTitle}>
        History
      </h3>
      <ol className={styles.list}>
        {history.map((e) => {
          const version =
            typeof e.data.versionNumber === 'number' ? ` · v${e.data.versionNumber}` : '';
          const decision =
            typeof e.data.approvalId === 'string' ? byApproval.get(e.data.approvalId) : undefined;
          return (
            <li key={e.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {HISTORY_LABEL[e.action] ?? e.action}
                  {version}
                </span>
                <span className={styles.muted}>
                  <time dateTime={e.createdAt}>{fmt.format(new Date(e.createdAt))}</time>
                </span>
                {decision ? (
                  <span>
                    {DECISION_LABEL[decision.decision].option} by {decision.clientDecisionMakerName}{' '}
                    on {decision.decidedOn} via {CHANNEL_LABEL[decision.channel]} · ref{' '}
                    <span className="so-mono">{shortHash(decision.contentHash)}</span>
                    {decision.evidenceNote ? <> · Evidence: {decision.evidenceNote}</> : null}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
