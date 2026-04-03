/**
 * Pure utilities for settlement period calculation.
 *
 * All functions operate strictly in UTC to avoid DST ambiguity.
 * "Period" is always a YYYY-MM string representing the month covered
 * by a statement.
 */

/**
 * Returns the period (YYYY-MM) for the month immediately preceding `utcNow`.
 *
 * Called on the 1st of a month to determine which month's statements to
 * generate. E.g.  2024-02-01 → "2024-01",  2024-01-01 → "2023-12".
 */
export function previousMonthPeriod(utcNow: Date): string {
  const year = utcNow.getUTCMonth() === 0
    ? utcNow.getUTCFullYear() - 1
    : utcNow.getUTCFullYear();
  // getUTCMonth() is 0-based; month 0 → previous Dec (12), else current month index
  const month = utcNow.getUTCMonth() === 0 ? 12 : utcNow.getUTCMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Returns true when `date` falls on the 1st calendar day of the month in UTC.
 * The scheduler uses this to decide whether to trigger generation.
 */
export function isFirstDayOfMonthUTC(date: Date): boolean {
  return date.getUTCDate() === 1;
}
