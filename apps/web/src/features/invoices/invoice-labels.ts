import { decimalToMinorUnits, type InvoiceStatus } from '@soloops/contracts';
import type { BadgeTone } from '@/components/StatusBadge';
import { fractionDigits } from '@/features/core-ops/money';

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  ISSUED: { label: 'Issued', tone: 'success' },
  VOID: { label: 'Void', tone: 'error' },
};

/** Display only: 1800 bps → "18%", 1850 → "18.5%" (no floating point). */
export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = String(bps % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return frac ? `${whole}.${frac}%` : `${whole}%`;
}

/**
 * A signed decimal typed by a person ("-500", "1,250.50") → signed integer minor units as a
 * string (BR-019, no floats). Null when it is not a valid non-zero amount for the currency.
 */
export function signedInputToMinor(input: string, currency: string): string | null {
  const trimmed = input.trim();
  const negative = trimmed.startsWith('-');
  const minor = decimalToMinorUnits(
    negative ? trimmed.slice(1) : trimmed,
    fractionDigits(currency),
  );
  if (minor === null || minor === '0') return null;
  return negative ? `-${minor}` : minor;
}
