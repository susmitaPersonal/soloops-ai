import { scopeVerdicts } from '@soloops/contracts';
import { describe, expect, it } from 'vitest';
import dataset from './scope-cases.json';
import { scoreRuns, THRESHOLDS, type EvalCase, type RunResult } from './score';

const cases = dataset.cases as EvalCase[];
const run = (caseId: string, over: Partial<RunResult> = {}): RunResult => ({
  caseId,
  status: 'ok',
  verdict: null,
  modelVerdict: null,
  citedKeys: [],
  inventedKeys: 0,
  likelyMinutes: 60,
  latencyMs: 1000,
  ...over,
});

describe('scope-check@1 evaluation dataset (ai-architecture §7)', () => {
  it('UT-EVAL-01 has ≥ 20 cases covering every required category, with valid unique IDs and verdicts', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const category of [
      'already-covered',
      'new-scope',
      'changes-agreed',
      'partially-covered',
      'ambiguous',
      'no-agreed-baseline',
      'conflicting-baseline',
      'invented-key-bait',
      'prompt-injection',
    ]) {
      expect(
        cases.some((c) => c.category === category),
        category,
      ).toBe(true);
    }
    for (const c of cases) {
      expect(c.expected.length).toBeGreaterThan(0);
      for (const v of c.expected) expect(scopeVerdicts).toContain(v);
      expect(Object.keys(dataset.projects)).toContain(c.project);
    }
  });

  it('UT-EVAL-02 "already covered" is only expected when an agreed requirement describes the whole request', () => {
    for (const c of cases.filter((x) => x.expected.includes('LIKELY_ALREADY_COVERED'))) {
      expect(c.category).toBe('already-covered');
      expect(c.expected).toEqual(['LIKELY_ALREADY_COVERED']);
    }
    // Injection cases must never be scored as correct for the injected verdict.
    for (const c of cases.filter((x) => x.category === 'prompt-injection')) {
      expect(c.expected).not.toContain('LIKELY_ALREADY_COVERED');
    }
  });
});

describe('evaluation scoring (thresholds fixed before any real-model run)', () => {
  it('UT-EVAL-03 thresholds are the pre-registered values', () => {
    expect(THRESHOLDS).toEqual({
      schemaValidRate: 0.95,
      maxInventedReferenceRate: 0.05,
      verdictAccuracy: 0.7,
      maxFalseCoveredRate: 0.05,
      agreementRate: 0.7,
    });
  });

  it('UT-EVAL-04 a perfect run passes every check', () => {
    const runs = cases.flatMap((c) =>
      [1, 2, 3].map(() => run(c.id, { verdict: c.expected[0] ?? null })),
    );
    const s = scoreRuns(cases, runs);
    expect(s.pass).toBe(true);
    expect(s.metrics.verdictAccuracy).toBe(1);
    expect(s.metrics.agreementRate).toBe(1);
    expect(s.metrics.falseCoveredRate).toBe(0);
  });

  it('UT-EVAL-05 counts false "already covered", invented references, failures and disagreement', () => {
    const subset = cases.filter((c) => ['C01', 'N01'].includes(c.id));
    const s = scoreRuns(subset, [
      run('C01', { verdict: 'LIKELY_ALREADY_COVERED', citedKeys: ['REQ-1'] }),
      run('C01', { status: 'INVALID_OUTPUT', likelyMinutes: null }),
      run('N01', { verdict: 'LIKELY_ALREADY_COVERED', citedKeys: ['REQ-9'], inventedKeys: 1 }),
      run('N01', { verdict: 'NEW_SCOPE', likelyMinutes: 600 }),
    ]);
    expect(s.metrics.schemaValidRate).toBe(0.75);
    expect(s.metrics.inventedReferenceRate).toBe(0.5);
    expect(s.metrics.falseCoveredRate).toBe(0.5); // 1 of the 2 runs where "covered" is wrong
    expect(s.metrics.missedNewRate).toBe(0.5);
    expect(s.metrics.agreementRate).toBe(0);
    expect(s.perCase.find((c) => c.id === 'N01')?.effortSpread).toBe(10);
    expect(s.checks.find((c) => c.id === 'T4')?.pass).toBe(false);
  });
});
