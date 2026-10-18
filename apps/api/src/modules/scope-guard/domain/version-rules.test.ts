import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { VersionDoc } from '../documents';
import {
  canonicalJson,
  computePricing,
  diffVersions,
  proposeProblems,
  versionContentHash,
} from './version-rules';

const base: VersionDoc = {
  number: 2,
  state: 'DRAFT',
  title: 'WhatsApp OTP login',
  clarifiedDescription: 'Add OTP login.',
  inScope: ['OTP endpoints'],
  outOfScope: ['SMS'],
  acceptanceCriteria: ['OTP within 30 s'],
  affectedRequirementIds: ['r1'],
  dependencies: ['Provider account'],
  assumptions: ['Phones verified'],
  risks: [{ description: 'Delay', severity: 'MEDIUM' }],
  effort: { lowMinutes: 360, likelyMinutes: 480, highMinutes: 840 },
  confirmedEffortMinutes: 540,
  pricing: { mode: 'TIME', hourlyRateMinor: 150000n, priceMinor: 1350000n, currency: 'INR' },
  timelineImpact: '3 days',
  aiFieldProvenance: { clarifiedDescription: 'g1' },
  contentHash: null,
  proposedAt: null,
  proposedByUserId: null,
  decision: null,
  createdAt: new Date('2026-10-16T09:00:00Z'),
};

describe('BR-008 canonical JSON and content hash', () => {
  it('UT-HASH-01 sorted keys, no whitespace, bigint as a bare integer', () => {
    expect(canonicalJson({ b: 1, a: [2n, 'x'], c: null, d: undefined })).toBe(
      '{"a":[2,"x"],"b":1,"c":null}',
    );
    expect(canonicalJson(9223372036854775807n)).toBe('9223372036854775807');
    expect(() => canonicalJson(Number.NaN)).toThrow();
  });

  it('UT-HASH-02 the hash is SHA-256 of the canonical hashed content, including CR ID and number', () => {
    const h = versionContentHash('cr-1', base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(versionContentHash('cr-2', base)).not.toBe(h);
    expect(versionContentHash('cr-1', { ...base, number: 3 })).not.toBe(h);
    const manual = createHash('sha256')
      .update(
        canonicalJson({
          changeRequestId: 'cr-1',
          versionNumber: 2,
          title: base.title,
          clarifiedDescription: base.clarifiedDescription,
          inScope: base.inScope,
          outOfScope: base.outOfScope,
          acceptanceCriteria: base.acceptanceCriteria,
          affectedRequirementIds: base.affectedRequirementIds,
          dependencies: base.dependencies,
          assumptions: base.assumptions,
          risks: base.risks,
          effort: base.effort,
          confirmedEffortMinutes: base.confirmedEffortMinutes,
          pricing: base.pricing,
          timelineImpact: base.timelineImpact,
        }),
      )
      .digest('hex');
    expect(h).toBe(manual);
  });

  it.each([
    ['title', { title: 'Other' }],
    ['description', { clarifiedDescription: 'Other' }],
    ['in scope', { inScope: [] }],
    ['out of scope', { outOfScope: [] }],
    ['criteria', { acceptanceCriteria: ['Other'] }],
    ['criteria order', { acceptanceCriteria: ['b', 'a'] }],
    ['affected', { affectedRequirementIds: [] }],
    ['dependencies', { dependencies: [] }],
    ['assumptions', { assumptions: ['Other'] }],
    ['risks', { risks: [] }],
    ['effort', { effort: null }],
    ['confirmed effort', { confirmedEffortMinutes: 541 }],
    ['price', { pricing: { ...base.pricing!, priceMinor: 1350001n } }],
    ['rate', { pricing: { ...base.pricing!, hourlyRateMinor: 1n } }],
    ['currency', { pricing: { ...base.pricing!, currency: 'USD' } }],
    ['timeline', { timelineImpact: '4 days' }],
  ])('UT-HASH-03 BR-011 any change to %s changes the hash', (_l, change) => {
    const withOrder = _l === 'criteria order' ? { ...base, acceptanceCriteria: ['a', 'b'] } : base;
    expect(versionContentHash('cr', { ...withOrder, ...change } as VersionDoc)).not.toBe(
      versionContentHash('cr', withOrder),
    );
  });

  it('UT-HASH-04 metadata does not change the hash (state, provenance, timestamps)', () => {
    const h = versionContentHash('cr', base);
    expect(
      versionContentHash('cr', {
        ...base,
        state: 'PROPOSED',
        aiFieldProvenance: {},
        proposedAt: new Date(),
      }),
    ).toBe(h);
  });
});

describe('FR-023 / BR-020 pricing', () => {
  it.each([
    [540, 150000n, 1350000n],
    [545, 150000n, 1362500n],
    [1, 150000n, 2500n],
    [1, 1n, 0n], // 0.0166 → 0
    [30, 1n, 1n], // exactly .5 rounds up
    [29, 1n, 0n],
    [120000, 9_000_000_000_000_000n, 18_000_000_000_000_000_000n],
  ])('UT-PRC-01 TIME %i min × %s/h → %s', (minutes, rate, expected) => {
    expect(computePricing({ mode: 'TIME' }, minutes, rate, 'INR')?.priceMinor).toBe(expected);
  });

  it('UT-PRC-02 FIXED keeps the entered amount; TIME without confirmed effort has no price yet; null mode → null', () => {
    expect(computePricing({ mode: 'FIXED', priceMinor: '800000' }, 540, 150000n, 'INR')).toEqual({
      mode: 'FIXED',
      hourlyRateMinor: null,
      priceMinor: 800000n,
      currency: 'INR',
    });
    expect(computePricing({ mode: 'TIME' }, null, 150000n, 'INR')?.priceMinor).toBeNull();
    expect(computePricing(null, 540, 150000n, 'INR')).toBeNull();
  });
});

describe('BR-007 propose completeness', () => {
  it('UT-PROP-01 a complete draft has no problems', () => {
    expect(proposeProblems(base)).toEqual([]);
  });

  it('UT-PROP-02 lists every missing field', () => {
    const problems = proposeProblems({
      ...base,
      title: ' ',
      clarifiedDescription: '',
      acceptanceCriteria: [],
      assumptions: [],
      pricing: null,
    }).map((p) => p.path);
    expect(problems).toEqual([
      'title',
      'clarifiedDescription',
      'acceptanceCriteria',
      'assumptions',
      'pricing',
    ]);
  });

  it('UT-PROP-03 TIME needs confirmed effort and a rate > 0', () => {
    expect(
      proposeProblems({
        ...base,
        confirmedEffortMinutes: null,
        pricing: { ...base.pricing!, hourlyRateMinor: 0n },
      }).map((p) => p.path),
    ).toEqual(['confirmedEffortMinutes', 'pricing']);
  });
});

describe('FR-028 diff', () => {
  it('UT-DIFF-01 reports changed fields in documented order with plain (string) amounts', () => {
    const d = diffVersions(base, {
      ...base,
      title: 'New',
      pricing: { ...base.pricing!, priceMinor: 1500000n },
    });
    expect(d[0]).toEqual({
      field: 'pricing',
      from: { mode: 'TIME', hourlyRateMinor: '150000', priceMinor: '1350000', currency: 'INR' },
      to: { mode: 'TIME', hourlyRateMinor: '150000', priceMinor: '1500000', currency: 'INR' },
      changed: true,
    });
    expect(d.filter((f) => f.changed).map((f) => f.field)).toEqual(['pricing', 'title']);
    expect(JSON.stringify(d)).toBeTruthy(); // serialisable (no bigint)
  });
});
