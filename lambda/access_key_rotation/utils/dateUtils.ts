/**
 * Date utility functions used throughout the rotation Lambda.
 */

/** Return the number of whole days between `createdDate` and now. */
export function calculateKeyAge(createdDate: Date): number {
  const now = new Date();
  const diffMs = Math.abs(now.getTime() - createdDate.getTime());
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/** Check whether a key is older than the given threshold (in days). */
export function isKeyExpired(createdDate: Date, thresholdDays: number): boolean {
  return calculateKeyAge(createdDate) >= thresholdDays;
}

/** Return a new Date that is `days` days after the given date. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Format a date as YYYY-MM-DD (useful for log entries). */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Format a date in a human-friendly style for emails (e.g. "February 11, 2026"). */
export function formatDateForEmail(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
