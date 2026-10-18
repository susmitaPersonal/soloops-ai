import { createHash } from 'node:crypto';
import type { FieldError } from '@soloops/contracts';
import { timeAmountMinor } from '../../../platform/money';
import type { PricingDoc, VersionDoc } from '../documents';

/**
 * Canonical JSON (change-request-lifecycle.md "Content hash"): sorted keys, no whitespace,
 * integers for amounts (bigint written as a bare integer, never a float or a quoted string).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError('non-finite number in hashed content');
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** The exact content a decision is bound to (BR-008, BR-010). Metadata and state are excluded. */
export function hashedContent(changeRequestId: string, v: VersionDoc) {
  return {
    changeRequestId,
    versionNumber: v.number,
    title: v.title,
    clarifiedDescription: v.clarifiedDescription,
    inScope: v.inScope,
    outOfScope: v.outOfScope,
    acceptanceCriteria: v.acceptanceCriteria,
    affectedRequirementIds: v.affectedRequirementIds,
    dependencies: v.dependencies,
    assumptions: v.assumptions,
    risks: v.risks,
    effort: v.effort,
    confirmedEffortMinutes: v.confirmedEffortMinutes,
    pricing: v.pricing,
    timelineImpact: v.timelineImpact,
  };
}

/** BR-008: SHA-256 hex of the canonical content. */
export function versionContentHash(changeRequestId: string, v: VersionDoc): string {
  return createHash('sha256')
    .update(canonicalJson(hashedContent(changeRequestId, v)), 'utf8')
    .digest('hex');
}

/**
 * FR-023 / AC-010.1–.2: the price comes from human-confirmed inputs only. TIME →
 * `roundHalfUp(confirmedMinutes × resolvedRate / 60)`; FIXED → the entered amount. Returns null
 * pricing when no mode was chosen; priceMinor is null while TIME inputs are incomplete.
 */
export function computePricing(
  input: { mode: 'TIME' } | { mode: 'FIXED'; priceMinor: string } | null,
  confirmedEffortMinutes: number | null,
  resolvedRateMinor: bigint,
  currency: string,
): PricingDoc | null {
  if (input === null) return null;
  if (input.mode === 'FIXED') {
    return { mode: 'FIXED', hourlyRateMinor: null, priceMinor: BigInt(input.priceMinor), currency };
  }
  return {
    mode: 'TIME',
    hourlyRateMinor: resolvedRateMinor,
    priceMinor:
      confirmedEffortMinutes === null
        ? null
        : timeAmountMinor(confirmedEffortMinutes, resolvedRateMinor),
    currency,
  };
}

/** BR-007 / AC-011.1: what is missing before a draft can be proposed. */
export function proposeProblems(v: VersionDoc): FieldError[] {
  const problems: FieldError[] = [];
  if (v.title.trim() === '') problems.push({ path: 'title', message: 'Add a title.' });
  if (v.clarifiedDescription.trim() === '') {
    problems.push({ path: 'clarifiedDescription', message: 'Add a clarified description.' });
  }
  if (v.acceptanceCriteria.length === 0) {
    problems.push({
      path: 'acceptanceCriteria',
      message: 'Add at least one acceptance criterion.',
    });
  }
  if (v.assumptions.length === 0) {
    problems.push({ path: 'assumptions', message: 'Add at least one assumption.' });
  }
  if (!v.pricing) {
    problems.push({ path: 'pricing', message: 'Choose time-based or fixed pricing.' });
  } else if (v.pricing.mode === 'TIME') {
    if (v.confirmedEffortMinutes === null) {
      problems.push({
        path: 'confirmedEffortMinutes',
        message: 'Confirm the effort you will charge for.',
      });
    }
    if ((v.pricing.hourlyRateMinor ?? 0n) <= 0n) {
      problems.push({
        path: 'pricing',
        message: 'Set an hourly rate on the project or in the workspace settings.',
      });
    }
  }
  return problems;
}

/** FR-028 / AC-014.2: field-level differences; price and effort first (S-07 VersionCompare). */
export const DIFF_FIELDS = [
  'pricing',
  'confirmedEffortMinutes',
  'effort',
  'title',
  'clarifiedDescription',
  'inScope',
  'outOfScope',
  'acceptanceCriteria',
  'affectedRequirementIds',
  'dependencies',
  'assumptions',
  'risks',
  'timelineImpact',
] as const satisfies readonly (keyof VersionDoc)[];

export function diffVersions(a: VersionDoc, b: VersionDoc) {
  return DIFF_FIELDS.map((field) => {
    const from = a[field];
    const to = b[field];
    return {
      field,
      from: toPlain(from),
      to: toPlain(to),
      changed: canonicalJson(from) !== canonicalJson(to),
    };
  });
}

/** bigint → decimal string, so diffs serialise to JSON (amounts stay exact). */
function toPlain(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
  }
  return v;
}
