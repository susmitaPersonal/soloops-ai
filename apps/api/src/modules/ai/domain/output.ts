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

/** A requirement of the project as the scope check sees it. `agreed` = baselined (BR-004). */
export interface ScopeRequirement {
  id: string;
  key: string;
  title: string;
  agreed: boolean;
}

type ScopeOutput = CrAnalysisOutput['scopeAssessment'];
type Scope = CrSuggestion['scope'];

/**
 * The scope check the app stands behind (ai-architecture §4). The model's verdict is kept only
 * when the evidence supports it; otherwise it becomes `UNCLEAR`, with the reasons in
 * `adjustments`. Evidence must name a requirement of this project, and only **agreed** requirements
 * can show agreed scope (`COVERS` / `CHANGES`). Pure and deterministic.
 */
export function assessScope(model: ScopeOutput, requirements: readonly ScopeRequirement[]): Scope {
  const byKey = new Map(requirements.map((r) => [r.key, r]));
  const adjustments: string[] = [];
  const evidence: Scope['evidence'] = [];
  const seen = new Set<string>();
  for (const e of model.evidence) {
    if (seen.has(e.requirementKey)) continue;
    seen.add(e.requirementKey);
    const req = byKey.get(e.requirementKey);
    if (!req) {
      adjustments.push(`${e.requirementKey} does not exist in this project, so it was removed.`);
      continue;
    }
    let relation = e.relation;
    if (relation !== 'RELATED' && !req.agreed) {
      adjustments.push(
        `${req.key} is not agreed (baselined) yet, so it cannot show agreed scope; it is shown as related.`,
      );
      relation = 'RELATED';
    }
    evidence.push({
      requirementId: req.id,
      requirementKey: req.key,
      requirementTitle: req.title,
      relation,
      explanation: e.explanation,
    });
  }

  const covers = evidence.some((e) => e.relation === 'COVERS');
  const changes = evidence.some((e) => e.relation === 'CHANGES');
  const anyAgreed = requirements.some((r) => r.agreed);
  let verdict = model.verdict;
  const unclear = (reason: string) => {
    if (verdict !== 'UNCLEAR') adjustments.push(reason);
    verdict = 'UNCLEAR';
  };

  if (!anyAgreed) {
    unclear(
      'No requirements are agreed (baselined) yet, so there is no agreed scope to compare with.',
    );
  } else if (!model.baselineSufficient) {
    unclear('The model reported that the agreed requirements are not enough to decide.');
  } else if (verdict === 'LIKELY_ALREADY_COVERED' && !covers) {
    unclear(
      '"Already covered" was not supported by any agreed requirement that covers the request.',
    );
  } else if (verdict === 'LIKELY_ALREADY_COVERED' && changes) {
    unclear(
      'The evidence both covers and changes agreed requirements, which contradicts "already covered".',
    );
  } else if (verdict === 'CHANGES_AGREED_SCOPE' && !changes) {
    unclear(
      '"Changes agreed scope" was not supported by any agreed requirement that the request changes.',
    );
  } else if (verdict === 'NEW_SCOPE' && (covers || changes)) {
    unclear(
      '"New scope" contradicts evidence that agreed requirements cover or are changed by the request.',
    );
  }

  return {
    verdict,
    modelVerdict: model.verdict,
    rationale: model.rationale,
    baselineSufficient: anyAgreed && model.baselineSufficient,
    evidence,
    adjustments,
  };
}

const hoursToMinutes = (h: number) => Math.min(120_000, Math.max(1, Math.round(h * 60)));

/**
 * Post-validation mapping (ai-architecture §4): keys → requirement IDs of this project only
 * (unknown keys dropped with a warning, AC-009.5), hours → whole minutes.
 */
export function mapSuggestion(
  output: CrAnalysisOutput,
  requirements: readonly ScopeRequirement[],
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
      // No extra effort (high = 0) → no estimate rather than a zero range (BR-026).
      effort:
        output.effortHours.high === 0
          ? null
          : {
              lowMinutes: hoursToMinutes(output.effortHours.low),
              likelyMinutes: hoursToMinutes(output.effortHours.likely),
              highMinutes: hoursToMinutes(output.effortHours.high),
            },
      risks: output.risks,
      timelineImpact: output.timelineImpact,
      questionsForClient: output.questionsForClient,
      scope: assessScope(output.scopeAssessment, requirements),
    },
    warnings,
  };
}
