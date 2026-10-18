import { describe, expect, it } from 'vitest';
import {
  assertInt64,
  divRoundHalfUp,
  INT64_MAX,
  resolveHourlyRate,
  taxAmountMinor,
  timeAmountMinor,
} from './money';

describe('BR-019 / BR-020 / ADR-0007 money', () => {
  it.each([
    [10n, 4n, 3n], // 2.5 → 3 (half up)
    [9n, 4n, 2n], // 2.25 → 2
    [11n, 4n, 3n], // 2.75 → 3
    [0n, 7n, 0n],
    [-10n, 4n, -3n], // symmetric: −2.5 → −3
    [-9n, 4n, -2n],
    [1n, 3n, 0n],
    [2n, 3n, 1n],
  ])('UT-MNY-01 divRoundHalfUp(%s, %s) = %s', (n, d, expected) => {
    expect(divRoundHalfUp(n, d)).toBe(expected);
  });

  it('UT-MNY-02 refuses non-positive denominators', () => {
    expect(() => divRoundHalfUp(1n, 0n)).toThrow(RangeError);
    expect(() => divRoundHalfUp(1n, -1n)).toThrow(RangeError);
  });

  it('UT-MNY-03 time amounts: roundHalfUp(minutes × rate / 60), exact for huge values', () => {
    expect(timeAmountMinor(120, 150000n)).toBe(300000n);
    expect(timeAmountMinor(1, 30n)).toBe(1n); // 0.5 → 1
    expect(timeAmountMinor(0, 150000n)).toBe(0n);
    expect(timeAmountMinor(1440, INT64_MAX / 1440n)).toBe((INT64_MAX / 1440n) * 24n);
    expect(() => timeAmountMinor(1.5, 1n)).toThrow(RangeError);
    expect(() => timeAmountMinor(-1, 1n)).toThrow(RangeError);
    expect(() => timeAmountMinor(1, -1n)).toThrow(RangeError);
  });

  it.each([
    [1000000n, 1800, 180000n],
    [1000000n, 0, 0n],
    [5n, 1000, 1n], // 0.5 → 1
    [4n, 1000, 0n], // 0.4 → 0
    [1000000n, 10000, 1000000n],
    [-500n, 1800, -90n],
  ])('UT-MNY-04 tax on subtotal %s at %i bps = %s', (subtotal, bps, expected) => {
    expect(taxAmountMinor(subtotal, bps)).toBe(expected);
  });

  it('UT-MNY-05 tax rates are bounded integer basis points', () => {
    expect(() => taxAmountMinor(1n, -1)).toThrow(RangeError);
    expect(() => taxAmountMinor(1n, 10001)).toThrow(RangeError);
    expect(() => taxAmountMinor(1n, 18.5)).toThrow(RangeError);
  });

  it('UT-MNY-06 BR-021 rate resolution: version rate, then project override, then workspace default', () => {
    expect(resolveHourlyRate({ versionRate: 1n, projectRate: 2n, workspaceDefault: 3n })).toBe(1n);
    expect(resolveHourlyRate({ versionRate: null, projectRate: 2n, workspaceDefault: 3n })).toBe(
      2n,
    );
    expect(resolveHourlyRate({ projectRate: null, workspaceDefault: 3n })).toBe(3n);
    expect(resolveHourlyRate({ projectRate: 0n, workspaceDefault: 3n })).toBe(0n); // explicit 0 wins
  });

  it('UT-MNY-07 Int64 bounds', () => {
    expect(assertInt64(INT64_MAX)).toBe(INT64_MAX);
    expect(() => assertInt64(INT64_MAX + 1n)).toThrow(RangeError);
    expect(() => assertInt64(-INT64_MAX - 2n)).toThrow(RangeError);
  });
});
