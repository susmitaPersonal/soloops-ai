import { describe, expect, it } from 'vitest';
import { invoiceTotals, lineAmountMinor, type CalcLine } from './invoice-calc';

const time = (minutes: number, rate: bigint): CalcLine => ({
  kind: 'TIME',
  minutes,
  hourlyRateMinor: rate,
  amountMinor: 0n,
});
const fixed = (amount: bigint): CalcLine => ({
  kind: 'FIXED',
  minutes: null,
  hourlyRateMinor: null,
  amountMinor: amount,
});
const adj = (amount: bigint): CalcLine => ({ ...fixed(amount), kind: 'ADJUSTMENT' });

describe('BR-020 invoice totals (AC-019.1)', () => {
  it('UT-INV-01 single TIME line, zero tax', () => {
    expect(invoiceTotals([time(120, 150000n)], 0)).toEqual({
      subtotalMinor: 300000n,
      taxMinor: 0n,
      totalMinor: 300000n,
    });
  });

  it('UT-INV-02 TIME amounts are recomputed from minutes × rate, not taken from the line', () => {
    expect(lineAmountMinor({ ...time(1, 150000n), amountMinor: 999n })).toBe(2500n);
    // 1 min at ₹1/h = 100/60 = 1.67 → 2 (half up); 1 min at 30/h = 0.5 → 1
    expect(lineAmountMinor(time(1, 100n))).toBe(2n);
    expect(lineAmountMinor(time(1, 30n))).toBe(1n);
  });

  it('UT-INV-03 tax rounds half up on the subtotal, not per line', () => {
    // two lines of 1 minor unit at 50% tax: per-line rounding would give 2, subtotal rounding 1
    expect(invoiceTotals([fixed(1n), fixed(1n)], 2500)).toMatchObject({
      subtotalMinor: 2n,
      taxMinor: 1n, // 2 × 0.25 = 0.5 → 1
      totalMinor: 3n,
    });
    expect(invoiceTotals([fixed(250000n), adj(-50000n)], 1800)).toEqual({
      subtotalMinor: 200000n,
      taxMinor: 36000n,
      totalMinor: 236000n,
    });
  });

  it('UT-INV-04 many lines and 13-digit amounts stay exact (bigint, no floats)', () => {
    const lines = Array.from({ length: 200 }, () => fixed(9999999999999n));
    const t = invoiceTotals(lines, 1800);
    expect(t.subtotalMinor).toBe(1999999999999800n);
    expect(t.taxMinor).toBe(359999999999964n);
    expect(t.totalMinor).toBe(2359999999999764n);
  });

  it('UT-INV-05 a TIME line without minutes or rate is a programming error', () => {
    expect(() => lineAmountMinor({ ...time(1, 1n), hourlyRateMinor: null })).toThrow(RangeError);
  });
});
