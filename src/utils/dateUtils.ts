/**
 * Safely convert a Firestore field value to a Date.
 * Handles: Firestore Timestamp, JS Date, number (ms), ISO string, null/undefined.
 */
export function firestoreToDate(value: unknown, fallback: Date = new Date()): Date {
  if (!value) return fallback;
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  const d = new Date(value as string | number);
  return isNaN(d.getTime()) ? fallback : d;
}

/**
 * Date parsing that avoids the off-by-one bug when you're west of UTC.
 * new Date("2026-03-02") is treated as UTC midnight, so in e.g. EST it becomes 2026-03-01 19:00.
 * Use parseDateStringAsLocal("2026-03-02") so the date stays on the intended calendar day.
 */

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse "YYYY-MM-DD" as local midnight (no UTC rollback).
 * Use for input type="date" values and any date-only string.
 */
export function parseDateStringAsLocal(dateStr: string): Date {
  const s = dateStr?.trim();
  if (!s || !ISO_DATE_ONLY.test(s)) return new Date(NaN);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format a Date to "YYYY-MM-DD" for input[type="date"].value.
 * Uses local date parts so it matches what the user sees.
 */
export function toDateOnlyString(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
