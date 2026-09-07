/**
 * Certificate number allocation maths — pure, and therefore testable.
 *
 * This module exists because Phase 35D deletes the client-side allocation
 * transaction, and with it the fourteen tests that were the only executable
 * checks on this logic. Allocation now happens in a Cloud Function, and
 * `functions/` has no test runner. Extracting the decisions into a module with
 * no Firebase imports lets the app's vitest suite import and test them directly
 * (see `src/services/__tests__/certificateNumberGeneratorService.test.ts`).
 *
 * RULES FOR THIS FILE:
 *   - No `firebase-admin`, no `firebase-functions`, no I/O of any kind.
 *   - No reading of the clock. Every function takes the current instant as an
 *     argument. (The one exception is documented on `formatCertificateNumber`.)
 *
 * Keep it that way — the moment this file imports Firebase, the test above
 * stops being importable from `src/` and the coverage is lost again.
 *
 * ADR-019 D8: the numbering year and month are computed in the laboratory's
 * timezone, not the host's. `new Date().getFullYear()` is Bangkok in a browser
 * and UTC on Cloud Functions; left alone, the two disagree for 1 Jan
 * 00:00-07:00 Bangkok.
 */

/** The laboratory's clock governs the certificate register (ADR-019 D8). */
export const LAB_TIME_ZONE = 'Asia/Bangkok';

/** The fields of a certificate-number config that the reset decision reads. */
export interface ResetPolicyInput {
  /** Full four-digit year the counter currently belongs to. */
  currentYear: number;
  /** 'never' | 'yearly' | 'monthly'; anything unrecognised never resets. */
  resetPolicy: string;
  /** When the counter was last reset, for the monthly policy. */
  lastResetAt?: Date;
}

/** The fields `formatCertificateNumber` reads. */
export interface FormatInput {
  prefix: string;
  separator: string;
  includeYear: boolean;
  numberPadding: number;
}

/**
 * The calendar year and month at instant `d`, in the laboratory's timezone.
 *
 * @returns `year` as a full four digits (2026, never 26 — ADR-019 D5), and
 *          `month` zero-based, to match `Date.prototype.getMonth()`.
 */
export function labYearMonth(d: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LAB_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(d);

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  // Intl reports months 1-12; the rest of this codebase uses 0-11.
  const month = Number(parts.find((p) => p.type === 'month')?.value) - 1;

  return { year, month };
}

/**
 * Whether the running number restarts at 1 for this allocation.
 *
 * Both sides of every comparison are evaluated in lab time (D8): `now`, and
 * `lastResetAt` for the monthly policy. Comparing a lab-time "now" against a
 * host-time `lastResetAt` would reintroduce the bug D8 exists to close.
 *
 * @param now The instant the allocation is happening. Passed in, never read
 *            from the clock here, so tests can pin it.
 */
export function shouldReset(config: ResetPolicyInput, now: Date): boolean {
  const nowLab = labYearMonth(now);

  if (config.resetPolicy === 'yearly') {
    return config.currentYear !== nowLab.year;
  }

  if (config.resetPolicy === 'monthly') {
    if (!config.lastResetAt) return true;
    const lastLab = labYearMonth(config.lastResetAt);
    return lastLab.year !== nowLab.year || lastLab.month !== nowLab.month;
  }

  // 'never', and any unrecognised policy, never resets.
  return false;
}

/** The number this allocation takes: 1 after a reset, otherwise the next one. */
export function nextNumber(config: { currentNumber: number }, reset: boolean): number {
  return (reset ? 0 : config.currentNumber) + 1;
}

/**
 * ⚠️ TWIN IMPLEMENTATION — DO NOT EDIT ONE WITHOUT THE OTHER ⚠️
 *
 * Twin: `formatCertificateNumber` in
 * `src/services/certificateNumberGeneratorService.ts`.
 *
 * The browser bundle and the Cloud Functions bundle share no code — `src/` and
 * `functions/` are separate packages, and application code must not import
 * across them. So this logic is deliberately duplicated, and the two copies
 * MUST change together. If they drift, numbers issued by the server and the
 * preview shown in the browser will disagree, and the certificate register will
 * contain two shapes of number.
 *
 * What keeps them honest is not this comment but a test: the twin-agreement
 * test in `src/services/__tests__/certificateNumberGeneratorService.test.ts`
 * runs both copies over the same table of configs and asserts the outputs are
 * identical, character for character. If you change one copy, that test fails.
 *
 * Format: {COMPANY_ABBREVIATION}{sep}{PREFIX}{sep}{YEAR}{NUMBER}
 *         e.g. SCS-UMT-26001
 * - COMPANY_ABBREVIATION: from `system/companyInfo`, omitted if unavailable
 * - PREFIX: user-configured prefix (e.g. "UMT")
 * - YEAR: last 2 digits of the year, when includeYear is true (ADR-019 D5)
 * - NUMBER: running number, padded, concatenated to the year with no separator
 *
 * @param year The full four-digit year to print. Optional only to preserve the
 *   original signature; every caller passes it. The fallback reads the clock —
 *   the single exception to this module's no-clock rule — and does so in lab
 *   time so that even the unreachable branch obeys D8.
 */
export function formatCertificateNumber(
  config: FormatInput,
  num: number,
  companyAbbreviation?: string,
  year?: number
): string {
  const parts: string[] = [];

  // Part 1: Company abbreviation (if available)
  if (companyAbbreviation) {
    parts.push(companyAbbreviation);
  }

  // Part 2: Category prefix (required)
  parts.push(config.prefix);

  // Part 3: Year + Number (concatenated without separator)
  if (config.includeYear) {
    const currentYear = year || labYearMonth(new Date()).year;
    const yearStr = String(currentYear).slice(-2); // Last 2 digits
    const paddedNumber = num.toString().padStart(config.numberPadding, '0');
    // Concatenate year and number directly (e.g., "26001")
    parts.push(yearStr + paddedNumber);
  } else {
    // If year is not included, just add the padded number
    const paddedNumber = num.toString().padStart(config.numberPadding, '0');
    parts.push(paddedNumber);
  }

  return parts.join(config.separator);
}
