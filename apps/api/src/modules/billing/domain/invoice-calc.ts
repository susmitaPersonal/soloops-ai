import { taxAmountMinor, timeAmountMinor } from '../../../platform/money';

/**
 * BR-019 / BR-020 / ADR-0007: invoice arithmetic, pure and integer-only. `CALCULATION_VERSION`
 * is stored on every invoice so later rule changes never reinterpret issued history.
 */
export const CALCULATION_VERSION = 1;

export interface CalcLine {
  kind: 'TIME' | 'FIXED' | 'ADJUSTMENT';
  minutes: number | null;
  hourlyRateMinor: bigint | null;
  amountMinor: bigint;
}

/** The authoritative amount of one line: TIME is recomputed from minutes and the copied rate. */
export function lineAmountMinor(line: CalcLine): bigint {
  if (line.kind === 'TIME') {
    if (line.minutes === null || line.hourlyRateMinor === null) {
      throw new RangeError('a TIME line needs minutes and a rate');
    }
    return timeAmountMinor(line.minutes, line.hourlyRateMinor);
  }
  return line.amountMinor;
}

/** Subtotal = Σ lines; tax = roundHalfUp(subtotal × bps / 10000) on the subtotal; total = both. */
export function invoiceTotals(lines: CalcLine[], taxRateBps: number) {
  const subtotalMinor = lines.reduce((sum, l) => sum + lineAmountMinor(l), 0n);
  const taxMinor = taxAmountMinor(subtotalMinor, taxRateBps);
  return { subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor };
}
