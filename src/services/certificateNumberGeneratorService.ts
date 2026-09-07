/**
 * Certificate Number Generator Service
 *
 * Since Phase 35D the browser does NOT allocate certificate numbers. Allocation
 * is a call to the `allocateCertificateNumber` Cloud Function, which performs
 * the counter transaction with the Admin SDK (ADR-019 D3). The client-side
 * `runTransaction` that used to advance `certificate_number_configs.currentNumber`
 * has been deleted, and `firestore.rules:161-165` still refuses that write to
 * everyone but an admin — so a browser can no longer move the counter at all,
 * whatever it sends (ADR-019 D4).
 *
 * What remains here is read-only: previewing the next number, and formatting.
 */

import { functions, httpsCallable } from './firebase';
import { certificateNumberConfigService } from './certificateNumberConfigService';
import { getCompanyInfo } from './companyInfoService';
import type { CertificateNumberConfig } from '../types';

// ---------------------------------------------------------------------------
// Laboratory time (ADR-019 D8)
// ---------------------------------------------------------------------------

/**
 * The laboratory's clock governs the certificate register (ADR-019 D8).
 *
 * `new Date().getFullYear()` reads the host's timezone — Bangkok in a browser,
 * but UTC on Cloud Functions. Left alone the two disagree for 1 Jan
 * 00:00-07:00 Bangkok, and the preview shown here would not match the number
 * the server issued. Both sides now compute the year and month in this zone.
 *
 * Twin: `LAB_TIME_ZONE` / `labYearMonth` in `functions/src/certificateNumberMath.ts`.
 */
const LAB_TIME_ZONE = 'Asia/Bangkok';

/** Calendar year (4-digit) and month (0-based) at `d`, in the lab's timezone. */
const labYearMonth = (d: Date): { year: number; month: number } => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LAB_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(d);

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  // Intl reports months 1-12; the rest of this codebase uses 0-11.
  const month = Number(parts.find((p) => p.type === 'month')?.value) - 1;

  return { year, month };
};

/**
 * Whether the running number restarts at 1. Mirrors `shouldReset` in
 * `functions/src/certificateNumberMath.ts` — both sides evaluate `now` AND
 * `lastResetAt` in lab time (ADR-019 D8), so preview and allocation agree.
 */
const shouldResetForConfig = (config: CertificateNumberConfig, now: Date): boolean => {
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
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * ⚠️ TWIN IMPLEMENTATION — DO NOT EDIT ONE WITHOUT THE OTHER ⚠️
 *
 * Twin: `formatCertificateNumber` in `functions/src/certificateNumberMath.ts`.
 *
 * The browser bundle and the Cloud Functions bundle share no code — `src/` and
 * `functions/` are separate packages, and application code must not import
 * across them. So this logic is deliberately duplicated, and the two copies
 * MUST change together. If they drift, the preview shown on screen and the
 * number the server actually issues will disagree, and the certificate register
 * will contain two shapes of number.
 *
 * What keeps them honest is not this comment but a test: the twin-agreement
 * test in `src/services/__tests__/certificateNumberGeneratorService.test.ts`
 * runs both copies over the same table of configs and asserts the outputs are
 * identical, character for character. If you change one copy, that test fails.
 *
 * (Phase 35C could write only the server side of this pairing, because it was
 * not permitted to touch `src/`. This is the reciprocal half.)
 *
 * Format: {COMPANY_ABBREVIATION}{sep}{PREFIX}{sep}{YEAR}{NUMBER}
 *         e.g. SCS-UMT-26001
 * - COMPANY_ABBREVIATION: from company info, omitted if unavailable
 * - PREFIX: user-configured prefix (e.g. "UMT")
 * - YEAR: last 2 digits of the year, when includeYear is true (ADR-019 D5)
 * - NUMBER: running number, padded, concatenated to the year with no separator
 */
const formatCertificateNumber = (
  config: CertificateNumberConfig,
  number: number,
  companyAbbreviation?: string,
  year?: number
): string => {
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
    const paddedNumber = number.toString().padStart(config.numberPadding, '0');
    // Concatenate year and number directly (e.g., "26001")
    parts.push(yearStr + paddedNumber);
  } else {
    // If year is not included, just add the padded number
    const paddedNumber = number.toString().padStart(config.numberPadding, '0');
    parts.push(paddedNumber);
  }

  return parts.join(config.separator);
};

// ---------------------------------------------------------------------------
// Allocation — server side only
// ---------------------------------------------------------------------------

/** The `allocateCertificateNumber` callable's request shape. */
interface AllocateRequest {
  equipmentName: string;
  jobId: string;
  equipmentIndex: number;
}

/** The `allocateCertificateNumber` callable's response shape. */
interface AllocateResponse {
  certificateNumber: string;
  number: number;
  year: number;
  configId: string;
}

/**
 * Allocate the next certificate number for an equipment item.
 *
 * Asks the server; the browser never touches the counter (ADR-019 D3/D4). The
 * function resolves the configuration by equipment name, runs the increment in
 * one Firestore transaction, and records the number in the
 * `certificateNumberAllocations` ledger, whose document id is the number itself
 * — which is what makes a duplicate structurally impossible.
 *
 * Any authenticated user may call this. There is deliberately no role or
 * permission check, here or on the server (ADR-019 D2).
 *
 * Errors are allowed to propagate untouched. The function's messages are
 * already written for a human to read ("No certificate number configuration
 * found for equipment …"), and wrapping them in a generic string would throw
 * away the only useful information the caller has.
 *
 * There is deliberately NO retry. A retry after a timeout can allocate a second
 * number that is never used — a burned number (ADR-019 D6). One press, one
 * attempt.
 *
 * @param equipmentName Equipment type name, matched against the config's `name`
 * @param jobId         The job consuming the number, recorded in the ledger
 * @param equipmentIndex Zero-based index of the item within that job
 */
export const generateCertificateNumberForEquipment = async (
  equipmentName: string,
  jobId: string,
  equipmentIndex: number
): Promise<string> => {
  const allocate = httpsCallable<AllocateRequest, AllocateResponse>(
    functions,
    'allocateCertificateNumber'
  );

  const result = await allocate({ equipmentName, jobId, equipmentIndex });
  return result.data.certificateNumber;
};

// ---------------------------------------------------------------------------
// Preview — read-only, stays in the browser
// ---------------------------------------------------------------------------

/**
 * Preview what the next certificate number would be, without allocating it.
 *
 * Read-only: it reads the config and formats a number, and writes nothing. The
 * reset decision mirrors the server's exactly (both use lab time, ADR-019 D8)
 * so that what is previewed is what gets issued.
 */
export const previewCertificateNumber = async (configId: string): Promise<string> => {
  try {
    const config = await certificateNumberConfigService.getConfigById(configId);

    if (!config) {
      throw new Error(`Certificate number configuration ${configId} not found`);
    }

    if (!config.isActive) {
      throw new Error(`Certificate number configuration "${config.name}" is not active`);
    }

    // Mirror the reset-policy evaluation the Cloud Function performs, so the
    // preview matches what an actual allocation would do.
    const now = new Date();
    const currentYear = labYearMonth(now).year;
    const shouldReset = shouldResetForConfig(config, now);

    const nextNumber = (shouldReset ? 0 : config.currentNumber) + 1;

    // Get company info for abbreviation
    let companyAbbreviation: string | undefined;
    try {
      const companyInfo = await getCompanyInfo();
      companyAbbreviation = companyInfo?.companyAbbreviation;
    } catch (error) {
      console.warn('Could not load company info for certificate number preview:', error);
    }

    return formatCertificateNumber(config, nextNumber, companyAbbreviation, currentYear);
  } catch (error: any) {
    console.error('Error previewing certificate number:', error);
    if (error.message) {
      throw error;
    }
    throw new Error('Failed to preview certificate number');
  }
};

/**
 * Format a certificate number from a config object and number.
 * Useful for formatting existing numbers.
 */
export const formatCertificateNumberFromConfig = (
  config: CertificateNumberConfig,
  number: number,
  companyAbbreviation?: string,
  year?: number
): string => {
  return formatCertificateNumber(config, number, companyAbbreviation, year);
};
