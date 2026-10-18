/**
 * Money arithmetic (BR-019, BR-020, ADR-0007). Server-only, pure and integer-based: amounts are
 * bigint minor units, time is integer minutes, rates are minor units per hour, tax is basis points.
 * There is no floating point anywhere in this file.
 */

/**
 * `numerator / denominator` rounded half away from zero (for non-negative values this is the
 * "round half up" of BR-020; negative adjustment totals round symmetrically).
 */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('denominator must be positive');
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  const q = n / denominator;
  const r = n % denominator;
  const rounded = r * 2n >= denominator ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/** BR-020 / AC-010.1: `roundHalfUp(minutes × hourlyRateMinor / 60)`. */
export function timeAmountMinor(minutes: number, hourlyRateMinor: bigint): bigint {
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    throw new RangeError('minutes must be a non-negative integer');
  }
  if (hourlyRateMinor < 0n) throw new RangeError('rate must not be negative');
  return divRoundHalfUp(BigInt(minutes) * hourlyRateMinor, 60n);
}

/** BR-020: `roundHalfUp(subtotal × taxBps / 10000)`, computed on the subtotal, not per line. */
export function taxAmountMinor(subtotalMinor: bigint, taxRateBps: number): bigint {
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) {
    throw new RangeError('tax rate must be 0–10000 basis points');
  }
  return divRoundHalfUp(subtotalMinor * BigInt(taxRateBps), 10000n);
}

/** Signed Int64, the range MongoDB stores and the contracts accept (BR-019). */
export const INT64_MAX = 9_223_372_036_854_775_807n;

export function assertInt64(value: bigint): bigint {
  if (value > INT64_MAX || value < -INT64_MAX - 1n) throw new RangeError('amount out of range');
  return value;
}

/**
 * BR-021: the applicable hourly rate. `versionRate` is the rate frozen on an approved
 * change-request version (for change-request work), then the project override, then the
 * workspace default.
 */
export function resolveHourlyRate(rates: {
  versionRate?: bigint | null;
  projectRate: bigint | null;
  workspaceDefault: bigint;
}): bigint {
  return rates.versionRate ?? rates.projectRate ?? rates.workspaceDefault;
}
