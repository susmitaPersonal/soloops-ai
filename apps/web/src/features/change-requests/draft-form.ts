import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
  type CrSuggestion,
  type UpdateVersionRequest,
  type VersionDto,
} from '@soloops/contracts';
import { z } from 'zod';
import { fractionDigits } from '@/features/core-ops/money';

/** One string per line → trimmed list (blank lines dropped). */
export const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
export const joinLines = (list: readonly string[]) => list.join('\n');

/** Hours as typed ("6", "6.5") → whole minutes, or null when empty. Time, not money. */
export function hoursToMinutes(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  const minutes = Math.round(Number(t) * 60);
  return minutes >= 1 && minutes <= 120_000 ? minutes : undefined;
}
export const minutesToHours = (m: number | null) =>
  m === null ? '' : String(Math.round((m / 60) * 100) / 100);

const listField = z.string();

/**
 * S-07 draft editor: what people type, for a project currency (its minor-unit precision). The
 * API validates everything again and computes the price itself (BR-020).
 */
export const makeDraftFormSchema = (currency: string) =>
  z
    .object({
      title: z.string().trim().max(200, { error: 'Title must be at most 200 characters.' }),
      clarifiedDescription: z
        .string()
        .trim()
        .max(4000, { error: 'Description must be at most 4,000 characters.' }),
      inScope: listField,
      outOfScope: listField,
      acceptanceCriteria: listField,
      dependencies: listField,
      assumptions: listField,
      timelineImpact: z
        .string()
        .trim()
        .max(500, { error: 'Timeline impact must be at most 500 characters.' }),
      effortLow: z.string(),
      effortLikely: z.string(),
      effortHigh: z.string(),
      confirmedHours: z.string(),
      pricingMode: z.enum(['', 'TIME', 'FIXED']),
      fixedPrice: z.string(),
      affectedRequirementIds: z.array(z.string()),
    })
    .superRefine((v, ctx) => {
      for (const f of [
        'inScope',
        'outOfScope',
        'acceptanceCriteria',
        'dependencies',
        'assumptions',
      ] as const) {
        const l = lines(v[f]);
        if (l.length > 20)
          ctx.addIssue({ code: 'custom', path: [f], message: 'Add at most 20 items.' });
        if (l.some((x) => x.length > 300)) {
          ctx.addIssue({
            code: 'custom',
            path: [f],
            message: 'Each item must be at most 300 characters.',
          });
        }
      }
      const e = [v.effortLow, v.effortLikely, v.effortHigh].map(hoursToMinutes);
      const filled = e.filter((x) => x !== null).length;
      if (e.some((x) => x === undefined)) {
        ctx.addIssue({
          code: 'custom',
          path: ['effortLikely'],
          message: 'Enter hours such as 6 or 6.5 (up to 2,000).',
        });
      } else if (filled > 0 && filled < 3) {
        ctx.addIssue({
          code: 'custom',
          path: ['effortLikely'],
          message: 'Enter low, likely and high, or leave all three empty.',
        });
      } else if (filled === 3) {
        const [lo, li, hi] = e as number[];
        if (!(lo! <= li! && li! <= hi!)) {
          ctx.addIssue({
            code: 'custom',
            path: ['effortLikely'],
            message: 'The range must satisfy low ≤ likely ≤ high.',
          });
        }
      }
      if (hoursToMinutes(v.confirmedHours) === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['confirmedHours'],
          message: 'Enter hours such as 9 or 9.5.',
        });
      }
      if (
        v.pricingMode === 'FIXED' &&
        decimalToMinorUnits(v.fixedPrice, fractionDigits(currency)) === null
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['fixedPrice'],
          message: 'Enter an amount such as 8000 or 8000.50.',
        });
      }
    });

export type DraftFormInput = z.input<ReturnType<typeof makeDraftFormSchema>>;
export type DraftFormValues = z.output<ReturnType<typeof makeDraftFormSchema>>;

export function toDraftFormValues(v: VersionDto, currency: string): DraftFormInput {
  return {
    title: v.title,
    clarifiedDescription: v.clarifiedDescription,
    inScope: joinLines(v.inScope),
    outOfScope: joinLines(v.outOfScope),
    acceptanceCriteria: joinLines(v.acceptanceCriteria),
    dependencies: joinLines(v.dependencies),
    assumptions: joinLines(v.assumptions),
    timelineImpact: v.timelineImpact,
    effortLow: minutesToHours(v.effort?.lowMinutes ?? null),
    effortLikely: minutesToHours(v.effort?.likelyMinutes ?? null),
    effortHigh: minutesToHours(v.effort?.highMinutes ?? null),
    confirmedHours: minutesToHours(v.confirmedEffortMinutes),
    pricingMode: v.pricing?.mode ?? '',
    fixedPrice:
      v.pricing?.mode === 'FIXED' && v.pricing.priceMinor
        ? minorUnitsToDecimal(v.pricing.priceMinor, fractionDigits(currency))
        : '',
    affectedRequirementIds: [...v.affectedRequirementIds],
  };
}

export function toUpdateRequest(
  v: DraftFormValues,
  currency: string,
  risks: VersionDto['risks'],
  provenance: Record<string, string | null>,
): UpdateVersionRequest {
  const effort = [v.effortLow, v.effortLikely, v.effortHigh].map(hoursToMinutes);
  return {
    title: v.title,
    clarifiedDescription: v.clarifiedDescription,
    inScope: lines(v.inScope),
    outOfScope: lines(v.outOfScope),
    acceptanceCriteria: lines(v.acceptanceCriteria),
    dependencies: lines(v.dependencies),
    assumptions: lines(v.assumptions),
    risks,
    timelineImpact: v.timelineImpact,
    affectedRequirementIds: v.affectedRequirementIds,
    effort: effort.every((x) => typeof x === 'number')
      ? {
          lowMinutes: effort[0] as number,
          likelyMinutes: effort[1] as number,
          highMinutes: effort[2] as number,
        }
      : null,
    confirmedEffortMinutes: hoursToMinutes(v.confirmedHours) ?? null,
    pricing:
      v.pricingMode === 'TIME'
        ? { mode: 'TIME' }
        : v.pricingMode === 'FIXED'
          ? {
              mode: 'FIXED',
              priceMinor: decimalToMinorUnits(v.fixedPrice, fractionDigits(currency)) ?? '0',
            }
          : null,
    ...(Object.keys(provenance).length > 0 ? { aiFieldProvenance: provenance } : {}),
  };
}

/** Field values a suggestion can fill in (AC-009.2). Confirmed effort is NEVER auto-filled (BR-003). */
export function suggestionToForm(s: CrSuggestion): Partial<DraftFormInput> {
  return {
    clarifiedDescription: s.clarifiedDescription,
    inScope: joinLines(s.inScope),
    outOfScope: joinLines(s.outOfScope),
    acceptanceCriteria: joinLines(s.acceptanceCriteria),
    dependencies: joinLines(s.dependencies),
    assumptions: joinLines(s.assumptions),
    timelineImpact: s.timelineImpact,
    effortLow: minutesToHours(s.effort.lowMinutes),
    effortLikely: minutesToHours(s.effort.likelyMinutes),
    effortHigh: minutesToHours(s.effort.highMinutes),
    affectedRequirementIds: s.affectedRequirementIds,
  };
}

/** Form field → provenance key (contracts `aiSuggestableFields`). */
export const PROVENANCE_FIELD: Partial<Record<keyof DraftFormInput, string>> = {
  clarifiedDescription: 'clarifiedDescription',
  inScope: 'inScope',
  outOfScope: 'outOfScope',
  acceptanceCriteria: 'acceptanceCriteria',
  dependencies: 'dependencies',
  assumptions: 'assumptions',
  timelineImpact: 'timelineImpact',
  effortLow: 'effort',
  effortLikely: 'effort',
  effortHigh: 'effort',
  affectedRequirementIds: 'affectedRequirementIds',
};

/** Server paths (`acceptanceCriteria.2`, `effort.lowMinutes`, …) → form fields. */
export function draftFieldFor(path: string): keyof DraftFormInput | null {
  const head = path.split('.')[0] ?? '';
  const map: Record<string, keyof DraftFormInput> = {
    title: 'title',
    clarifiedDescription: 'clarifiedDescription',
    inScope: 'inScope',
    outOfScope: 'outOfScope',
    acceptanceCriteria: 'acceptanceCriteria',
    dependencies: 'dependencies',
    assumptions: 'assumptions',
    timelineImpact: 'timelineImpact',
    effort: 'effortLikely',
    confirmedEffortMinutes: 'confirmedHours',
    pricing: 'pricingMode',
    affectedRequirementIds: 'affectedRequirementIds',
  };
  return map[head] ?? null;
}
