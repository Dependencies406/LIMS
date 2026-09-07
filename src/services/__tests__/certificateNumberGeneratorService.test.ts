/**
 * Certificate number allocation — maths, formatting, and twin agreement.
 *
 * Phase 35D moved allocation to a Cloud Function and deleted the client-side
 * `generateCertificateNumber` transaction. The fourteen tests that used to live
 * here exercised that transaction directly. Rather than delete the coverage
 * along with the code — `functions/` has no test runner of its own, so that
 * would have left the allocation maths with no executable checks anywhere —
 * Phase 35D extracted the decisions into `functions/src/certificateNumberMath.ts`,
 * a module with no Firebase imports, and this file tests it directly.
 *
 * The cross-package import below is deliberate and is allowed ONLY in tests.
 * Application code must not import across `src/` and `functions/` (they are
 * separate packages that bundle separately) — which is exactly why the
 * formatter is duplicated, and exactly why the twin-agreement test at the
 * bottom of this file exists.
 *
 * Retired deliberately: the two concurrency tests. They asserted that a client
 * `runTransaction` did not double-increment under a race. That transaction no
 * longer exists. The property is now enforced by the server's transaction plus
 * the allocation ledger's document id, which is the certificate number itself
 * and is written with `create()` — so a duplicate is refused by the database
 * (Phase 35C Task 3), not by logic a unit test could exercise here.
 */

import { describe, it, expect, vi } from 'vitest';

// The module under test — imported across packages, in a test only.
import {
  LAB_TIME_ZONE,
  labYearMonth,
  shouldReset,
  nextNumber,
  formatCertificateNumber as fnFormat,
} from '../../../functions/src/certificateNumberMath';

import type { CertificateNumberConfig } from '../../types';

vi.mock('../firebase', async () => {
  const { createFakeFirestore } = await import('./fakeFirestore');
  return {
    ...createFakeFirestore(),
    // The service now imports the callable wiring too. Preview never uses it,
    // but the named imports must resolve.
    functions: {},
    httpsCallable: vi.fn(),
  };
});

vi.mock('../companyInfoService', () => ({
  getCompanyInfo: vi.fn().mockResolvedValue(null),
}));

import * as firebaseMock from '../firebase';
import {
  previewCertificateNumber,
  formatCertificateNumberFromConfig as clientFormat,
} from '../certificateNumberGeneratorService';

const COLLECTION = 'certificate_number_configs';

/** A full config, so the client formatter (which wants one) is satisfied too. */
function makeConfig(overrides: Partial<CertificateNumberConfig> = {}): CertificateNumberConfig {
  return {
    id: 'cfg',
    name: 'UTM',
    prefix: 'UTM',
    separator: '-',
    includeYear: false,
    numberPadding: 3,
    currentNumber: 0,
    currentSequence: 0,
    currentYear: 2026,
    yearlyReset: false,
    resetPolicy: 'never',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const baseDoc = {
  name: 'UTM',
  prefix: 'UTM',
  separator: '-',
  includeYear: false,
  numberPadding: 3,
  currentNumber: 0,
  currentSequence: 0,
  currentYear: labYearMonth(new Date()).year,
  resetPolicy: 'never' as const,
  isActive: true,
};

function seedConfig(id: string, overrides: Record<string, any> = {}) {
  const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
  store.set(`${COLLECTION}/${id}`, { data: { ...baseDoc, ...overrides }, version: 0 });
}

// ---------------------------------------------------------------------------

describe('labYearMonth — the lab clock governs the register (ADR-019 D8)', () => {
  it('uses Asia/Bangkok', () => {
    expect(LAB_TIME_ZONE).toBe('Asia/Bangkok');
  });

  it('returns the BANGKOK year for an instant that is still the previous year in UTC', () => {
    // 2026-12-31T17:30Z is 2027-01-01T00:30 in Bangkok (UTC+7).
    const instant = new Date('2026-12-31T17:30:00Z');

    expect(instant.getUTCFullYear()).toBe(2026);      // what the old code saw on the server
    expect(labYearMonth(instant).year).toBe(2027);    // what the lab's calendar says
    expect(labYearMonth(instant).month).toBe(0);      // January, 0-based
  });

  it('returns a four-digit year and a zero-based month', () => {
    const { year, month } = labYearMonth(new Date('2026-03-15T04:00:00Z'));
    expect(year).toBe(2026);
    expect(month).toBe(2); // March
  });
});

describe('shouldReset — yearly', () => {
  const now = new Date('2026-06-15T03:00:00Z'); // 2026-06-15 10:00 Bangkok

  it('resets when currentYear is a previous year', () => {
    expect(shouldReset({ currentYear: 2025, resetPolicy: 'yearly' }, now)).toBe(true);
  });

  it('does not reset when currentYear already matches the lab year', () => {
    expect(shouldReset({ currentYear: 2026, resetPolicy: 'yearly' }, now)).toBe(false);
  });

  it('resets across the Bangkok new year even while UTC is still in the old year', () => {
    const newYearBangkok = new Date('2026-12-31T17:30:00Z'); // 2027-01-01 00:30 Bangkok
    // The counter still says 2026. In lab time it is 2027, so it must reset.
    expect(shouldReset({ currentYear: 2026, resetPolicy: 'yearly' }, newYearBangkok)).toBe(true);
  });
});

describe('shouldReset — monthly', () => {
  const now = new Date('2026-06-15T03:00:00Z'); // June 2026 in Bangkok

  it('resets when lastResetAt is from a previous month', () => {
    const april = new Date('2026-04-10T03:00:00Z');
    expect(shouldReset({ currentYear: 2026, resetPolicy: 'monthly', lastResetAt: april }, now)).toBe(true);
  });

  it('does not reset when lastResetAt is within the current lab month', () => {
    const earlierInJune = new Date('2026-06-02T03:00:00Z');
    expect(
      shouldReset({ currentYear: 2026, resetPolicy: 'monthly', lastResetAt: earlierInJune }, now)
    ).toBe(false);
  });

  it('resets on the first allocation, when lastResetAt was never set', () => {
    expect(shouldReset({ currentYear: 2026, resetPolicy: 'monthly' }, now)).toBe(true);
  });
});

describe('shouldReset — never', () => {
  it("does not reset for 'never', nor for an unrecognised policy", () => {
    const now = new Date('2027-06-15T03:00:00Z');
    expect(shouldReset({ currentYear: 2020, resetPolicy: 'never' }, now)).toBe(false);
    expect(shouldReset({ currentYear: 2020, resetPolicy: 'quarterly' }, now)).toBe(false);
  });
});

describe('nextNumber and formatting', () => {
  it('produces a correctly formatted certificate number, incrementing from currentNumber', () => {
    const config = makeConfig({ currentNumber: 4 });
    const n = nextNumber(config, false);

    expect(n).toBe(5);
    expect(fnFormat(config, n, undefined, 2026)).toBe('UTM-005');
  });

  it('restarts at 1 after a reset, and concatenates the two-digit year when includeYear', () => {
    const config = makeConfig({ currentNumber: 50, includeYear: true });
    const n = nextNumber(config, true);

    expect(n).toBe(1);
    // Year and number run together, with no separator between them (ADR-019 D5).
    expect(fnFormat(config, n, 'SCS', 2026)).toBe('SCS-UTM-26001');
  });
});

// ---------------------------------------------------------------------------
// The twin-agreement test.
//
// `formatCertificateNumber` exists twice — once in the browser bundle, once in
// the Cloud Functions bundle — because the two packages share no code. This is
// the only thing that stops them drifting apart. It replaces the old
// "preview matches what an allocation would actually produce" test, and is
// strictly stronger: that one compared two calls into the SAME implementation,
// this one compares the two implementations against each other.
// ---------------------------------------------------------------------------

describe('twin agreement — the client and Cloud Function formatters must not drift', () => {
  const configs: Array<[string, CertificateNumberConfig]> = [
    ['plain, no year', makeConfig()],
    ['with year', makeConfig({ includeYear: true })],
    ['wide padding', makeConfig({ numberPadding: 6, includeYear: true })],
    ['no padding', makeConfig({ numberPadding: 1 })],
    ['slash separator', makeConfig({ separator: '/', includeYear: true })],
    ['empty separator', makeConfig({ separator: '', includeYear: true })],
    ['long prefix', makeConfig({ prefix: 'SCS-UTM-LAB', includeYear: true })],
    ['empty prefix', makeConfig({ prefix: '', includeYear: true })],
  ];

  const numbers = [1, 9, 10, 99, 100, 999, 1000, 123456];
  const abbreviations: Array<string | undefined> = [undefined, '', 'SCS', 'LONGABBR'];
  const years = [2026, 2027, 2099, 2000];

  it('agrees character for character across every combination', () => {
    let compared = 0;

    for (const [label, config] of configs) {
      for (const num of numbers) {
        for (const abbr of abbreviations) {
          for (const year of years) {
            const fromClient = clientFormat(config, num, abbr, year);
            const fromFunction = fnFormat(config, num, abbr, year);

            expect(
              fromClient,
              `mismatch for "${label}" number=${num} abbr=${JSON.stringify(abbr)} year=${year}`
            ).toBe(fromFunction);

            compared++;
          }
        }
      }
    }

    // Guard against the loops silently collapsing to nothing.
    expect(compared).toBe(
      configs.length * numbers.length * abbreviations.length * years.length
    );
  });

  it('agrees on the year split — four-digit in, last two digits out (ADR-019 D5)', () => {
    const config = makeConfig({ includeYear: true });

    expect(clientFormat(config, 1, undefined, 2026)).toBe(fnFormat(config, 1, undefined, 2026));
    expect(clientFormat(config, 1, undefined, 2026)).toBe('UTM-26001');
    expect(clientFormat(config, 1, undefined, 2007)).toBe('UTM-07001');
  });
});

// ---------------------------------------------------------------------------

describe('previewCertificateNumber — read-only, and must match what the server would issue', () => {
  it('previews the reset value for a monthly config whose last reset was months ago', async () => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    seedConfig('cfg-preview', {
      resetPolicy: 'monthly',
      currentNumber: 20,
      currentSequence: 20,
      lastResetAt: { toDate: () => twoMonthsAgo },
    });

    await expect(previewCertificateNumber('cfg-preview')).resolves.toBe('UTM-001');
  });

  it('previews the next number when no reset is due', async () => {
    seedConfig('cfg-preview-2', { currentNumber: 4, currentSequence: 4 });

    await expect(previewCertificateNumber('cfg-preview-2')).resolves.toBe('UTM-005');
  });

  it('refuses an inactive configuration', async () => {
    seedConfig('cfg-inactive', { isActive: false });

    await expect(previewCertificateNumber('cfg-inactive')).rejects.toThrow(/not active/);
  });

  it('writes nothing — preview must never advance the counter', async () => {
    seedConfig('cfg-readonly', { currentNumber: 7, currentSequence: 7 });

    await previewCertificateNumber('cfg-readonly');

    const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
    const entry = store.get(`${COLLECTION}/cfg-readonly`)!;
    expect(entry.data.currentNumber).toBe(7);
    expect(entry.version).toBe(0); // never written
  });
});
