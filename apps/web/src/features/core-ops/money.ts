import {
  currencyFractionDigits,
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from '@soloops/contracts';

/** Fraction digits for a currency, falling back to 2 while the code is still being typed. */
export function fractionDigits(currency: string): number {
  try {
    return currencyFractionDigits(currency);
  } catch {
    return 2;
  }
}

/**
 * MoneyInput conversion (design system §7.2): the person types a decimal; the API receives integer
 * minor units as a string, converted without floating point (BR-019). '' means "no override".
 * Returns undefined when the input is not a valid amount for the currency.
 */
export function rateInputToMinor(input: string, currency: string): string | null | undefined {
  if (input.trim() === '') return null;
  return decimalToMinorUnits(input, fractionDigits(currency)) ?? undefined;
}

export function minorToRateInput(minor: string | null, currency: string): string {
  return minor === null ? '' : minorUnitsToDecimal(minor, fractionDigits(currency));
}

/** Display only (never used for calculations): "₹1,500.00". */
export function formatMoney(minor: string, currency: string): string {
  const digits = fractionDigits(currency);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
    }).format(minorUnitsToDecimal(minor, digits) as unknown as number);
  } catch {
    return `${currency} ${minorUnitsToDecimal(minor, digits)}`;
  }
}
