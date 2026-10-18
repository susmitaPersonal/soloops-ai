/**
 * "Today" as `YYYY-MM-DD` in an IANA time zone (data-model §4.3: the workspace time zone defines
 * today for date validations such as `decidedOn ≤ today`). `en-CA` formats dates as YYYY-MM-DD.
 */
export function todayIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** ISO dates compare correctly as strings. */
export const isAfterDay = (isoDate: string, today: string) => isoDate > today;
