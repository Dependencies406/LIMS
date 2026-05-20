export interface DateDisplayOptions {
  locale?: string;
  fallback?: string;
}

function toValidDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Shared display formatter for UI/PDF date strings.
 * Uses local timezone and short month, 2-digit day, numeric year.
 */
export function formatDateForDisplay(
  value: Date | string | number | null | undefined,
  options: DateDisplayOptions = {}
): string {
  const fallback = options.fallback ?? '';
  const date = toValidDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString(options.locale ?? 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Alias for PDF paths to keep a single date-format contract. */
export function formatDateForPdf(
  value: Date | string | number | null | undefined,
  options: DateDisplayOptions = {}
): string {
  return formatDateForDisplay(value, options);
}

