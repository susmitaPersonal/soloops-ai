'use client';

import type { VersionDiff } from '@soloops/contracts';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { SelectField } from '@/components/SelectField';
import { browserApi } from '@/lib/api/browser';
import { BannerAlert } from '@/features/core-ops/BannerAlert';
import styles from '@/features/core-ops/core-ops.module.css';
import { formatMoney } from '@/features/core-ops/money';
import { bannerForError, type Banner } from '@/features/core-ops/mutation-errors';
import { formatMinutes, SCOPE_VERDICT } from './cr-labels';

const LABEL: Record<string, string> = {
  pricing: 'Price',
  confirmedEffortMinutes: 'Confirmed effort',
  effort: 'Effort range',
  title: 'Title',
  clarifiedDescription: 'Description',
  inScope: 'In scope',
  outOfScope: 'Not included',
  acceptanceCriteria: 'Acceptance criteria',
  affectedRequirementIds: 'Affected requirements',
  dependencies: 'Dependencies',
  assumptions: 'Assumptions',
  risks: 'Risks',
  timelineImpact: 'Timeline impact',
  scopeVerdict: 'Scope verdict',
  questionsForClient: 'Questions for the client',
};

/** Renders one diff value as readable text (server values; no computation). */
function show(field: string, v: unknown, keys: Map<string, string>): string {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'pricing' && typeof v === 'object') {
    const p = v as { priceMinor: string | null; currency: string; mode: string };
    return p.priceMinor
      ? `${formatMoney(p.priceMinor, p.currency)} (${p.mode === 'TIME' ? 'time-based' : 'fixed'})`
      : '—';
  }
  if (field === 'confirmedEffortMinutes' && typeof v === 'number') return formatMinutes(v);
  if (field === 'scopeVerdict' && typeof v === 'string' && v in SCOPE_VERDICT) {
    return SCOPE_VERDICT[v as keyof typeof SCOPE_VERDICT].label;
  }
  if (field === 'effort' && typeof v === 'object') {
    const e = v as { lowMinutes: number; likelyMinutes: number; highMinutes: number };
    return `${formatMinutes(e.lowMinutes)} – ${formatMinutes(e.likelyMinutes)} – ${formatMinutes(e.highMinutes)}`;
  }
  if (field === 'affectedRequirementIds' && Array.isArray(v)) {
    return v.map((id) => keys.get(String(id)) ?? 'Removed').join(', ') || '—';
  }
  if (field === 'risks' && Array.isArray(v)) {
    return (
      (v as { severity: string; description: string }[])
        .map((r) => `${r.severity}: ${r.description}`)
        .join('\n') || '—'
    );
  }
  if (Array.isArray(v)) return v.join('\n') || '—';
  return String(v);
}

/** FR-028 / AC-014.2 VersionCompare: any two versions, price and effort first. */
export function VersionCompare({
  workspaceId,
  crId,
  versionNumbers,
  requirementKeys,
}: {
  workspaceId: string;
  crId: string;
  versionNumbers: number[];
  requirementKeys: Map<string, string>;
}) {
  const [from, setFrom] = useState(versionNumbers.at(-2) ?? 1);
  const [to, setTo] = useState(versionNumbers.at(-1) ?? 1);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const opts = versionNumbers.map((n) => ({ value: String(n), label: `v${n}` }));

  async function compare() {
    setBusy(true);
    setBanner(null);
    try {
      setDiff(await browserApi.changeRequests.diff(workspaceId, crId, from, to));
    } catch (err) {
      setBanner(bannerForError(err, { onUnauthenticated: () => window.location.reload() }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="compare-title">
      <h3 id="compare-title" className={styles.cardTitle}>
        Compare versions
      </h3>
      <div className={styles.actions}>
        <SelectField
          label="From"
          value={String(from)}
          options={opts}
          onChange={(e) => setFrom(Number(e.target.value))}
        />
        <SelectField
          label="To"
          value={String(to)}
          options={opts}
          onChange={(e) => setTo(Number(e.target.value))}
        />
        <Button type="button" variant="secondary" loading={busy} onClick={() => void compare()}>
          Compare
        </Button>
      </div>
      <BannerAlert banner={banner} />
      {diff ? (
        <table className={styles.table}>
          <caption className="so-visually-hidden">
            Differences between v{diff.from} and v{diff.to}
          </caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">v{diff.from}</th>
              <th scope="col">v{diff.to}</th>
            </tr>
          </thead>
          <tbody>
            {diff.fields.map((f) => (
              <tr key={f.field} className={f.changed ? styles.changedRow : undefined}>
                <th scope="row">
                  {LABEL[f.field] ?? f.field}
                  {f.changed ? <span className={styles.muted}> · changed</span> : null}
                </th>
                <td className={styles.preLine}>{show(f.field, f.from, requirementKeys)}</td>
                <td className={styles.preLine}>{show(f.field, f.to, requirementKeys)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
