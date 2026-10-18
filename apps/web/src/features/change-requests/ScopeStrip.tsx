import type { ChangeRequestDetail, RequirementDto, VersionDto } from '@soloops/contracts';
import { StatusBadge } from '@/components/StatusBadge';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatDate, formatDay } from '@/features/core-ops/labels';
import { formatMoney } from '@/features/core-ops/money';
import { CHANNEL_LABEL, daysSince, formatMinutes, shortHash } from './cr-labels';
import strip from './ScopeStrip.module.css';

/**
 * S-07 scope strip: always answers what is original, what is additional, whether approval is
 * pending and what is authorised (screen specifications §S-07). All figures come from the server.
 */
export function ScopeStrip({
  cr,
  version,
  requirements,
}: {
  cr: ChangeRequestDetail;
  version: VersionDto;
  requirements: RequirementDto[];
}) {
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const affected = version.affectedRequirementIds
    .map((id) => byId.get(id))
    .filter(Boolean) as RequirementDto[];
  const approved = cr.versions.find((v) => v.state === 'APPROVED');
  const price = version.pricing?.priceMinor
    ? formatMoney(version.pricing.priceMinor, version.pricing.currency)
    : 'not calculated yet';
  const effort = version.effort
    ? `Est. ${formatMinutes(version.effort.lowMinutes)}–${formatMinutes(version.effort.likelyMinutes)}–${formatMinutes(version.effort.highMinutes)}`
    : 'No estimate yet';

  let approval: string;
  if (version.state === 'DRAFT') approval = 'Not sent to the client yet';
  else if (version.state === 'PROPOSED' && version.proposedAt) {
    const d = daysSince(version.proposedAt);
    approval = `Proposed ${formatDate(version.proposedAt)}, waiting ${d} day${d === 1 ? '' : 's'} · ref ${shortHash(version.contentHash)}`;
  } else if (version.decision) {
    approval = `${version.decision.decision === 'APPROVED' ? 'Approved' : version.decision.decision === 'REJECTED' ? 'Rejected' : 'Changes requested'} ${formatDay(version.decision.decidedOn)} by ${version.decision.clientDecisionMakerName} via ${CHANNEL_LABEL[version.decision.channel]}`;
  } else approval = version.state === 'WITHDRAWN' ? 'Withdrawn before a decision' : 'No decision';

  let authorised: { text: string; tone: 'success' | 'warning' | 'neutral' };
  if (cr.status === 'REVISING' && approved) {
    authorised = {
      text: `v${approved.number} remains authorised; v${cr.openVersionNumber} is pending`,
      tone: 'success',
    };
  } else if (approved) {
    authorised = {
      text: `v${approved.number} is authorised — tasks and billing can use it`,
      tone: 'success',
    };
  } else {
    authorised = {
      text: 'None yet — tasks and billing unlock after the client approves',
      tone: 'warning',
    };
  }

  return (
    <section className={`${styles.card} ${strip.strip}`} aria-label="Scope summary">
      <dl className={strip.lines}>
        <div className={strip.line}>
          <dt>Affects original scope</dt>
          <dd>
            {affected.length === 0 ? (
              'No existing requirement affected'
            ) : (
              <ul className={strip.tags}>
                {affected.map((r) => (
                  <li key={r.id}>
                    <StatusBadge tone="info" square>
                      <span className="so-mono">{r.key}</span> {r.title}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div className={strip.line}>
          <dt>Additional</dt>
          <dd>
            v{version.number} · {version.acceptanceCriteria.length} acceptance criteria · {effort} ·
            Price {price}
          </dd>
        </div>
        <div className={strip.line}>
          <dt>Approval</dt>
          <dd>{approval}</dd>
        </div>
        <div className={strip.line}>
          <dt>Authorised work</dt>
          <dd>
            <StatusBadge tone={authorised.tone}>{authorised.text}</StatusBadge>
          </dd>
        </div>
      </dl>
    </section>
  );
}
