import {
  crAnalysisOutputSchema,
  type CrAnalysisOutput,
  type CrSuggestion,
} from '@soloops/contracts';

/** Model text longer than this is refused before parsing (excessive output, ai-architecture §6). */
export const MAX_OUTPUT_CHARS = 60_000;

export type ParseResult = { ok: true; output: CrAnalysisOutput } | { ok: false; errors: string[] };

/**
 * Untrusted model text → validated `cr-analysis-output@1`. Accepts a bare JSON object or one
 * wrapped in prose or code fences (`prompt` structured-output mode). Unknown properties are
 * stripped by the schema, so price-like or action-like fields never survive (BR-027, BR-002).
 */
export function parseModelText(text: string): ParseResult {
  if (text.length > MAX_OUTPUT_CHARS) return { ok: false, errors: ['The answer is too long.'] };
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start)
    return { ok: false, errors: ['The answer contains no JSON object.'] };
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, errors: ['The answer is not valid JSON.'] };
  }
  const parsed = crAnalysisOutputSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  return { ok: true, output: parsed.data };
}

export interface MappingWarning {
  code: 'UNKNOWN_REQUIREMENT_KEYS' | 'INPUT_TRUNCATED';
  message: string;
}

const hoursToMinutes = (h: number) => Math.min(120_000, Math.max(1, Math.round(h * 60)));

/**
 * Post-validation mapping (ai-architecture §4): keys → requirement IDs of this project only
 * (unknown keys dropped with a warning, AC-009.5), hours → whole minutes.
 */
export function mapSuggestion(
  output: CrAnalysisOutput,
  requirements: readonly { id: string; key: string }[],
): { suggestion: CrSuggestion; warnings: MappingWarning[] } {
  const byKey = new Map(requirements.map((r) => [r.key, r.id]));
  const keys = [...new Set(output.affectedRequirementKeys)];
  const known = keys.filter((k) => byKey.has(k));
  const unknown = keys.filter((k) => !byKey.has(k));
  const warnings: MappingWarning[] = unknown.length
    ? [
        {
          code: 'UNKNOWN_REQUIREMENT_KEYS',
          message: `The suggestion referred to requirements that don't exist in this project and they were removed: ${unknown.join(', ')}.`,
        },
      ]
    : [];
  return {
    suggestion: {
      clarifiedDescription: output.clarifiedDescription,
      inScope: output.inScope,
      outOfScope: output.outOfScope,
      acceptanceCriteria: output.acceptanceCriteria,
      affectedRequirementIds: known.map((k) => byKey.get(k) as string),
      affectedRequirementKeys: known,
      dependencies: output.dependencies,
      assumptions: output.assumptions,
      effort: {
        lowMinutes: hoursToMinutes(output.effortHours.low),
        likelyMinutes: hoursToMinutes(output.effortHours.likely),
        highMinutes: hoursToMinutes(output.effortHours.high),
      },
      risks: output.risks,
      timelineImpact: output.timelineImpact,
      questionsForClient: output.questionsForClient,
    },
    warnings,
  };
}
