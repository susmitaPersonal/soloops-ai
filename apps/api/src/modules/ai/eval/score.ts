import type { ScopeVerdict } from '@soloops/contracts';

/**
 * Scoring for the scope-check evaluation (ai-architecture §7). Pure: the runner collects one
 * `RunResult` per case × repetition; this file turns them into metrics and pass/fail against
 * thresholds that were fixed BEFORE the first real-model run (never tuned to results).
 */
export const THRESHOLDS = {
  /** T1: answers that passed schema validation (after the single repair attempt). */
  schemaValidRate: 0.95,
  /** T2: cited requirement keys in the raw model evidence that do not exist in the project. */
  maxInventedReferenceRate: 0.05,
  /** T3: final (server-checked) verdict within the case's expected set. */
  verdictAccuracy: 0.7,
  /** T4: "already covered" when it is wrong — the costly error (unbilled work). */
  maxFalseCoveredRate: 0.05,
  /** T5: cases whose repeated runs all gave the same final verdict. */
  agreementRate: 0.7,
} as const;

export interface EvalCase {
  id: string;
  category: string;
  project: string;
  request: string;
  expected: ScopeVerdict[];
}

export interface RunResult {
  caseId: string;
  /** `ok` = schema-valid suggestion; otherwise the failure code (INVALID_OUTPUT, TIMEOUT, …). */
  status: 'ok' | string;
  verdict: ScopeVerdict | null;
  modelVerdict: ScopeVerdict | null;
  /** Requirement keys the model cited as evidence (raw, before server checks). */
  citedKeys: string[];
  /** Of `citedKeys`, how many do not exist in the case's project. */
  inventedKeys: number;
  likelyMinutes: number | null;
  latencyMs: number;
}

const rate = (n: number, d: number) => (d === 0 ? 0 : n / d);
const percentile = (xs: number[], p: number) => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
};

export function scoreRuns(cases: readonly EvalCase[], runs: readonly RunResult[]) {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const valid = runs.filter((r) => r.status === 'ok');
  const correct = valid.filter(
    (r) => r.verdict && byId.get(r.caseId)?.expected.includes(r.verdict),
  );
  const coveredWrongPool = runs.filter(
    (r) => !byId.get(r.caseId)?.expected.includes('LIKELY_ALREADY_COVERED'),
  );
  const falseCovered = coveredWrongPool.filter((r) => r.verdict === 'LIKELY_ALREADY_COVERED');
  // What the model alone would have shown, before the server's evidence gates (comparison only).
  const modelFalseCovered = coveredWrongPool.filter(
    (r) => r.modelVerdict === 'LIKELY_ALREADY_COVERED',
  );
  // "Covered" recall: truly covered requests that still reach "already covered" (usefulness).
  const coveredPool = runs.filter(
    (r) => byId.get(r.caseId)?.expected.includes('LIKELY_ALREADY_COVERED') ?? false,
  );
  const coveredHit = coveredPool.filter((r) => r.verdict === 'LIKELY_ALREADY_COVERED');
  const newPool = runs.filter((r) => byId.get(r.caseId)?.expected.includes('NEW_SCOPE'));
  const falseNew = valid.filter(
    (r) => r.verdict === 'NEW_SCOPE' && !byId.get(r.caseId)?.expected.includes('NEW_SCOPE'),
  );
  const missedNew = newPool.filter(
    (r) => r.verdict === null || !byId.get(r.caseId)?.expected.includes(r.verdict),
  );
  const cited = runs.reduce((n, r) => n + r.citedKeys.length, 0);
  const invented = runs.reduce((n, r) => n + r.inventedKeys, 0);

  const perCase = cases.map((c) => {
    const rs = runs.filter((r) => r.caseId === c.id);
    const verdicts = rs.map((r) => r.verdict ?? 'FAILED');
    const likely = rs.flatMap((r) => (r.likelyMinutes === null ? [] : [r.likelyMinutes]));
    return {
      id: c.id,
      category: c.category,
      expected: c.expected,
      verdicts,
      correct: rs.filter((r) => r.verdict && c.expected.includes(r.verdict)).length,
      runs: rs.length,
      agreed: rs.length > 0 && new Set(verdicts).size === 1,
      /** Max / min of the likely effort across runs; 1 = identical. Consistency, NOT accuracy. */
      effortSpread: likely.length > 1 ? Math.max(...likely) / Math.min(...likely) : null,
    };
  });

  const categories = [...new Set(cases.map((c) => c.category))].map((category) => {
    const rs = runs.filter((r) => byId.get(r.caseId)?.category === category);
    return {
      category,
      runs: rs.length,
      accuracy: rate(
        rs.filter((r) => r.verdict && byId.get(r.caseId)?.expected.includes(r.verdict)).length,
        rs.length,
      ),
    };
  });

  const spreads = perCase.flatMap((c) => (c.effortSpread === null ? [] : [c.effortSpread]));
  const metrics = {
    runs: runs.length,
    schemaValidRate: rate(valid.length, runs.length),
    inventedReferenceRate: rate(invented, cited),
    citedReferences: cited,
    verdictAccuracy: rate(correct.length, runs.length),
    falseCoveredRate: rate(falseCovered.length, coveredWrongPool.length),
    /** T4 reported on its own: counts behind the rate, separate from accuracy (T3). */
    falseCovered: { count: falseCovered.length, of: coveredWrongPool.length },
    modelFalseCoveredRate: rate(modelFalseCovered.length, coveredWrongPool.length),
    coveredRecall: rate(coveredHit.length, coveredPool.length),
    coveredRecallCounts: { count: coveredHit.length, of: coveredPool.length },
    falseNewRate: rate(falseNew.length, runs.length),
    missedNewRate: rate(missedNew.length, newPool.length),
    agreementRate: rate(perCase.filter((c) => c.agreed).length, perCase.length),
    failureRate: rate(runs.length - valid.length, runs.length),
    latencyP50Ms: percentile(
      runs.map((r) => r.latencyMs),
      0.5,
    ),
    latencyP95Ms: percentile(
      runs.map((r) => r.latencyMs),
      0.95,
    ),
    effortSpreadMedian: percentile(spreads, 0.5),
    effortSpreadMax: spreads.length ? Math.max(...spreads) : null,
  };
  const checks = [
    {
      id: 'T1',
      name: 'Schema-valid rate',
      value: metrics.schemaValidRate,
      pass: metrics.schemaValidRate >= THRESHOLDS.schemaValidRate,
      threshold: `≥ ${THRESHOLDS.schemaValidRate}`,
    },
    {
      id: 'T2',
      name: 'Invented-reference rate',
      value: metrics.inventedReferenceRate,
      pass: metrics.inventedReferenceRate <= THRESHOLDS.maxInventedReferenceRate,
      threshold: `≤ ${THRESHOLDS.maxInventedReferenceRate}`,
    },
    {
      id: 'T3',
      name: 'Verdict accuracy',
      value: metrics.verdictAccuracy,
      pass: metrics.verdictAccuracy >= THRESHOLDS.verdictAccuracy,
      threshold: `≥ ${THRESHOLDS.verdictAccuracy}`,
    },
    {
      id: 'T4',
      name: 'False "already covered" rate',
      value: metrics.falseCoveredRate,
      pass: metrics.falseCoveredRate <= THRESHOLDS.maxFalseCoveredRate,
      threshold: `≤ ${THRESHOLDS.maxFalseCoveredRate}`,
    },
    {
      id: 'T5',
      name: 'Agreement across runs',
      value: metrics.agreementRate,
      pass: metrics.agreementRate >= THRESHOLDS.agreementRate,
      threshold: `≥ ${THRESHOLDS.agreementRate}`,
    },
  ];
  return { metrics, checks, pass: checks.every((c) => c.pass), perCase, categories };
}
