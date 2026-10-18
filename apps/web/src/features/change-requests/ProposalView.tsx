import { ESTIMATE_DISCLAIMER, type RequirementDto, type VersionDto } from '@soloops/contracts';
import { Lock } from 'lucide-react';
import { Alert } from '@/components/Alert';
import { StatusBadge } from '@/components/StatusBadge';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatMoney } from '@/features/core-ops/money';
import { formatMinutes, SCOPE_VERDICT, VERSION_STATE } from './cr-labels';

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.group}>
      <h4 className={styles.rowTitle}>{title}</h4>
      <ul>
        {items.map((x, i) => (
          <li key={`${i}-${x}`}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/** Pricing line, always with the BR-026 disclaimer next to effort figures (AC-010.3). */
export function PricingSummary({ version }: { version: VersionDto }) {
  const p = version.pricing;
  return (
    <div className={styles.group}>
      {version.effort ? (
        <p className={styles.muted}>
          Effort estimate {formatMinutes(version.effort.lowMinutes)} –{' '}
          {formatMinutes(version.effort.likelyMinutes)} –{' '}
          {formatMinutes(version.effort.highMinutes)}
          {version.confirmedEffortMinutes !== null
            ? ` · confirmed ${formatMinutes(version.confirmedEffortMinutes)}`
            : ''}
        </p>
      ) : null}
      {p ? (
        <p>
          <strong>
            Price {p.priceMinor ? formatMoney(p.priceMinor, p.currency) : '— (calculated on save)'}
          </strong>
          {p.mode === 'TIME' && p.hourlyRateMinor && version.confirmedEffortMinutes !== null
            ? ` (${formatMinutes(version.confirmedEffortMinutes)} × ${formatMoney(p.hourlyRateMinor, p.currency)}/h)`
            : p.mode === 'FIXED'
              ? ' (fixed price)'
              : ''}
        </p>
      ) : (
        <p className={styles.muted}>No pricing chosen yet.</p>
      )}
      <Alert tone="info" title="Estimate, not a guarantee">
        {ESTIMATE_DISCLAIMER}
      </Alert>
    </div>
  );
}

/** A frozen (non-draft) version: read-only, with its state and reference hash. */
export function ProposalView({
  version,
  requirements,
}: {
  version: VersionDto;
  requirements: RequirementDto[];
}) {
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const state = VERSION_STATE[version.state];
  return (
    <section className={styles.card} aria-labelledby={`proposal-v${version.number}`}>
      <div className={styles.groupHeader}>
        <Lock size={16} aria-hidden="true" />
        <h3 id={`proposal-v${version.number}`} className={styles.cardTitle}>
          Proposal v{version.number} (frozen)
        </h3>
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
      </div>
      {version.contentHash ? (
        <p className={styles.muted}>
          Reference{' '}
          <span className="so-mono" title={version.contentHash}>
            {version.contentHash.slice(0, 12)}…
          </span>
        </p>
      ) : null}
      <h4 className={styles.rowTitle}>{version.title}</h4>
      <p>{version.clarifiedDescription}</p>
      {version.scopeVerdict ? (
        <p>
          Confirmed scope verdict:{' '}
          <StatusBadge tone={SCOPE_VERDICT[version.scopeVerdict].tone}>
            {SCOPE_VERDICT[version.scopeVerdict].label}
          </StatusBadge>
        </p>
      ) : null}
      <List title="Questions for the client" items={version.questionsForClient} />
      <List title="In scope" items={version.inScope} />
      <List title="Not included" items={version.outOfScope} />
      <List title="Acceptance criteria" items={version.acceptanceCriteria} />
      <List title="Assumptions" items={version.assumptions} />
      <List title="Dependencies" items={version.dependencies} />
      <List
        title="Affected requirements"
        items={version.affectedRequirementIds.map((id) => {
          const r = byId.get(id);
          return r ? `${r.key} ${r.title}` : 'Removed requirement';
        })}
      />
      <List title="Risks" items={version.risks.map((r) => `${r.severity}: ${r.description}`)} />
      {version.timelineImpact ? <p>Timeline impact: {version.timelineImpact}</p> : null}
      <PricingSummary version={version} />
    </section>
  );
}
