/**
 * Today (YYYY-MM-DD) in a time zone, for date-input defaults and `max` only. The server enforces
 * "not in the future" itself (AC-012.5); this is display/UX, not a business rule.
 */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
