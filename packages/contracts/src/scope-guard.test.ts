import { describe, expect, it } from 'vitest';
import {
  aiEnablementRequestSchema,
  apiPaths,
  changeRequestListQuerySchema,
  createChangeRequestSchema,
  crAnalysisOutputSchema,
  crKey,
  effortRangeSchema,
  recordDecisionRequestSchema,
  updateVersionRequestSchema,
} from './index';

const H = 'a'.repeat(64);

describe('scope-guard contracts', () => {
  it('UT-CON-SG-01 BR-026 effort range: low ≤ likely ≤ high, 1 min – 2,000 h, whole minutes', () => {
    expect(
      effortRangeSchema.safeParse({ lowMinutes: 1, likelyMinutes: 1, highMinutes: 120000 }).success,
    ).toBe(true);
    for (const e of [
      { lowMinutes: 2, likelyMinutes: 1, highMinutes: 3 },
      { lowMinutes: 0, likelyMinutes: 1, highMinutes: 3 },
      { lowMinutes: 1, likelyMinutes: 1, highMinutes: 120001 },
      { lowMinutes: 1.5, likelyMinutes: 2, highMinutes: 3 },
    ]) {
      expect(effortRangeSchema.safeParse(e).success).toBe(false);
    }
  });

  it('UT-CON-SG-02 FR-020 the raw text is kept exactly (not trimmed) but must not be blank', () => {
    const base = { sourceChannel: 'CHAT', requestedByName: 'S', receivedOn: '2026-10-12' };
    expect(
      createChangeRequestSchema.parse({ ...base, rawRequestText: '  hi\n' }).rawRequestText,
    ).toBe('  hi\n');
    expect(createChangeRequestSchema.safeParse({ ...base, rawRequestText: ' \n ' }).success).toBe(
      false,
    );
  });

  it('UT-CON-SG-03 BR-014 decisions: hash format, enums, "" evidence becomes null', () => {
    const d = {
      decision: 'APPROVED',
      contentHash: H,
      clientDecisionMakerName: 'S. Das',
      decidedOn: '2026-10-14',
      channel: 'EMAIL',
    };
    expect(recordDecisionRequestSchema.parse({ ...d, evidenceNote: '' }).evidenceNote).toBeNull();
    expect(recordDecisionRequestSchema.parse(d).evidenceNote).toBeNull();
    expect(
      recordDecisionRequestSchema.safeParse({ ...d, contentHash: H.toUpperCase() }).success,
    ).toBe(false);
    expect(recordDecisionRequestSchema.safeParse({ ...d, decision: 'SUPERSEDED' }).success).toBe(
      false,
    );
    expect(recordDecisionRequestSchema.safeParse({ ...d, decidedOn: '2026-02-30' }).success).toBe(
      false,
    );
  });

  it('UT-CON-SG-04 draft updates: at least one field; provenance only for suggestable fields', () => {
    expect(updateVersionRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateVersionRequestSchema.safeParse({
        aiFieldProvenance: { clarifiedDescription: '0192a000-0000-7000-8000-0000000000b5' },
      }).success,
    ).toBe(true);
    expect(
      updateVersionRequestSchema.safeParse({
        aiFieldProvenance: { pricing: '0192a000-0000-7000-8000-0000000000b5' },
      }).success,
    ).toBe(false);
    expect(
      updateVersionRequestSchema.safeParse({ pricing: { mode: 'TIME', priceMinor: '1' } }).success,
    ).toBe(true);
    expect(updateVersionRequestSchema.safeParse({ pricing: { mode: 'FIXED' } }).success).toBe(
      false,
    );
  });

  it('UT-CON-SG-05 status filter accepts known derived statuses only', () => {
    expect(
      changeRequestListQuerySchema.parse({ status: 'AWAITING_DECISION,NEEDS_REVISION' }).status,
    ).toEqual(['AWAITING_DECISION', 'NEEDS_REVISION']);
    expect(changeRequestListQuerySchema.safeParse({ status: 'APPROVED,SIGNED' }).success).toBe(
      false,
    );
  });

  it('UT-CON-SG-06 keys and paths', () => {
    expect(crKey(4)).toBe('CR-4');
    expect(apiPaths.crVersionAction('w', 'c/1', 2, 'decisions')).toBe(
      '/api/v1/workspaces/w/change-requests/c%2F1/versions/2/decisions',
    );
  });
});

describe('ai contracts', () => {
  it('UT-CON-AI-01 the model output schema has no money fields and strips unknown ones', () => {
    const out = crAnalysisOutputSchema.parse({
      clarifiedDescription: 'd',
      inScope: [],
      outOfScope: [],
      acceptanceCriteria: ['a'],
      affectedRequirementKeys: [],
      dependencies: [],
      assumptions: [],
      effortHours: { low: 1, likely: 2, high: 3 },
      risks: [],
      timelineImpact: '',
      questionsForClient: [],
      scopeAssessment: {
        verdict: 'NEW_SCOPE',
        rationale: '',
        baselineSufficient: true,
        asks: [{ quote: 'q', citations: [], price: '₹2' }],
      },
      price: '₹1',
    });
    expect(out).not.toHaveProperty('price');
    expect(
      Object.keys(crAnalysisOutputSchema.shape).some((k) => /price|cost|amount|rate/i.test(k)),
    ).toBe(false);
    expect(out.scopeAssessment.asks[0]).not.toHaveProperty('price');
    // The scope assessment, its asks and citations (cr-analysis-output@3) carry no money fields
    // either (BR-027).
    const ask = crAnalysisOutputSchema.shape.scopeAssessment.shape.asks.element;
    for (const shape of [ask.shape, ask.shape.citations.element.shape]) {
      expect(Object.keys(shape).some((k) => /price|cost|amount|rate/i.test(k))).toBe(false);
    }
    expect(
      Object.keys(crAnalysisOutputSchema.shape.scopeAssessment.shape).some((k) =>
        /price|cost|amount|rate/i.test(k),
      ),
    ).toBe(false);
  });

  it('UT-CON-AI-02 FR-054 enabling requires acknowledging the disclosure; disabling does not', () => {
    expect(aiEnablementRequestSchema.safeParse({ enabled: true }).success).toBe(false);
    expect(
      aiEnablementRequestSchema.safeParse({ enabled: true, acknowledgeDisclosure: false }).success,
    ).toBe(false);
    expect(
      aiEnablementRequestSchema.safeParse({ enabled: true, acknowledgeDisclosure: true }).success,
    ).toBe(true);
    expect(aiEnablementRequestSchema.safeParse({ enabled: false }).success).toBe(true);
  });
});
