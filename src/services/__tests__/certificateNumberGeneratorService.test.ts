import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CertificateNumberConfig } from '../../types';

vi.mock('../firebase', async () => {
  const { createFakeFirestore } = await import('./fakeFirestore');
  return createFakeFirestore();
});

vi.mock('../companyInfoService', () => ({
  getCompanyInfo: vi.fn().mockResolvedValue(null),
}));

import * as firebaseMock from '../firebase';
import { generateCertificateNumber, previewCertificateNumber } from '../certificateNumberGeneratorService';

const COLLECTION = 'certificate_number_configs';

const baseDoc = {
  name: 'UTM',
  prefix: 'UTM',
  separator: '-',
  includeYear: false,
  numberPadding: 3,
  currentNumber: 0,
  currentSequence: 0,
  currentYear: new Date().getFullYear(),
  yearlyReset: false,
  resetPolicy: 'never' as const,
  isActive: true,
};

function seedConfig(id: string, overrides: Partial<typeof baseDoc & { lastResetAt: { toDate: () => Date } }> = {}) {
  const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
  store.set(`${COLLECTION}/${id}`, {
    data: { ...baseDoc, ...overrides },
    version: 0,
  });
}

function getRaw(id: string) {
  const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
  return store.get(`${COLLECTION}/${id}`)!.data;
}

beforeEach(() => {
  (firebaseMock as any).store.clear();
});

// The fake's runTransaction (fakeFirestore.ts) implements real optimistic-
// concurrency retries: when two calls race, the loser's commit is rejected
// and its whole updateFunction is re-run against fresh data. These tests
// therefore also cover "a retried transaction does not double-increment" —
// each racing call always resolves to a distinct, gap-free number.
describe('generateCertificateNumber — concurrency', () => {
  it('does not produce duplicate numbers when two allocations race', async () => {
    seedConfig('cfg1', { currentNumber: 0, currentSequence: 0 });

    const [a, b] = await Promise.all([
      generateCertificateNumber('cfg1'),
      generateCertificateNumber('cfg1'),
    ]);

    expect(a).not.toBe(b);
    expect([a, b].sort()).toEqual(['UTM-001', 'UTM-002']);

    const raw = getRaw('cfg1');
    expect(raw.currentNumber).toBe(2);
    expect(raw.currentSequence).toBe(2);
  });

  it('does not double-increment across three concurrent allocations', async () => {
    seedConfig('cfg2', { currentNumber: 0, currentSequence: 0 });

    const results = await Promise.all([
      generateCertificateNumber('cfg2'),
      generateCertificateNumber('cfg2'),
      generateCertificateNumber('cfg2'),
    ]);

    expect(new Set(results).size).toBe(3);
    const raw = getRaw('cfg2');
    expect(raw.currentNumber).toBe(3);
  });
});

describe('generateCertificateNumber — lastAllocatedAt vs updatedAt (ADR-012)', () => {
  it('writes lastAllocatedAt on every allocation', async () => {
    seedConfig('cfg-alloc', { currentNumber: 0, currentSequence: 0 });

    await generateCertificateNumber('cfg-alloc');

    const raw = getRaw('cfg-alloc');
    expect(raw.lastAllocatedAt).toBeDefined();
    expect(raw.lastAllocatedAt.toDate()).toBeInstanceOf(Date);
  });

  it('does NOT touch updatedAt — that field means "a human last edited this equipment type"', async () => {
    const sentinelUpdatedAt = { toDate: () => new Date('2020-01-01T00:00:00.000Z') };
    seedConfig('cfg-alloc-2', { currentNumber: 0, currentSequence: 0, updatedAt: sentinelUpdatedAt } as any);

    await generateCertificateNumber('cfg-alloc-2');

    const raw = getRaw('cfg-alloc-2');
    // Unchanged from what was seeded — the allocation transaction never wrote it.
    expect(raw.updatedAt).toBe(sentinelUpdatedAt);
  });

  it('advances lastAllocatedAt on each subsequent allocation', async () => {
    seedConfig('cfg-alloc-3', { currentNumber: 0, currentSequence: 0 });

    await generateCertificateNumber('cfg-alloc-3');
    const first = getRaw('cfg-alloc-3').lastAllocatedAt.toDate().getTime();

    await generateCertificateNumber('cfg-alloc-3');
    const second = getRaw('cfg-alloc-3').lastAllocatedAt.toDate().getTime();

    expect(second).toBeGreaterThanOrEqual(first);
  });
});

describe('generateCertificateNumber — allocation still works end to end', () => {
  it('produces a correctly formatted certificate number', async () => {
    seedConfig('cfg-e2e', { currentNumber: 4, currentSequence: 4, includeYear: false, numberPadding: 3 });
    const result = await generateCertificateNumber('cfg-e2e');
    expect(result).toBe('UTM-005');
  });

  it('increments currentNumber and currentSequence together', async () => {
    seedConfig('cfg-e2e-2', { currentNumber: 4, currentSequence: 4 });
    await generateCertificateNumber('cfg-e2e-2');
    const raw = getRaw('cfg-e2e-2');
    expect(raw.currentNumber).toBe(5);
    expect(raw.currentSequence).toBe(5);
  });
});

describe('generateCertificateNumber — yearly reset', () => {
  it('resets to 1 when currentYear differs from the current calendar year', async () => {
    seedConfig('cfg-yearly', {
      resetPolicy: 'yearly',
      yearlyReset: true,
      currentNumber: 50,
      currentSequence: 50,
      currentYear: new Date().getFullYear() - 1,
    });

    const result = await generateCertificateNumber('cfg-yearly');

    expect(result).toBe('UTM-001');
    const raw = getRaw('cfg-yearly');
    expect(raw.currentNumber).toBe(1);
    expect(raw.currentYear).toBe(new Date().getFullYear());
  });

  it('does not write yearlyReset back to the document — it is derived on read (Phase 1)', async () => {
    seedConfig('cfg-yearly-derived', {
      resetPolicy: 'yearly',
      currentNumber: 5,
      currentSequence: 5,
      currentYear: new Date().getFullYear(),
    });
    // Simulate a doc that never had yearlyReset persisted at all.
    delete (getRaw('cfg-yearly-derived') as any).yearlyReset;

    await generateCertificateNumber('cfg-yearly-derived');

    const raw = getRaw('cfg-yearly-derived');
    expect(raw.yearlyReset).toBeUndefined();
  });

  it('does not reset when currentYear already matches the current calendar year', async () => {
    seedConfig('cfg-yearly-2', {
      resetPolicy: 'yearly',
      yearlyReset: true,
      currentNumber: 5,
      currentSequence: 5,
      currentYear: new Date().getFullYear(),
    });

    const result = await generateCertificateNumber('cfg-yearly-2');

    expect(result).toBe('UTM-006');
  });
});

describe('generateCertificateNumber — monthly reset', () => {
  it('resets to 1 when lastResetAt is from a previous month', async () => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    seedConfig('cfg-monthly', {
      resetPolicy: 'monthly',
      currentNumber: 20,
      currentSequence: 20,
      lastResetAt: { toDate: () => twoMonthsAgo },
    });

    const result = await generateCertificateNumber('cfg-monthly');

    expect(result).toBe('UTM-001');
    const raw = getRaw('cfg-monthly');
    expect(raw.currentNumber).toBe(1);
  });

  it('does not reset when lastResetAt is within the current month', async () => {
    const now = new Date();

    seedConfig('cfg-monthly-2', {
      resetPolicy: 'monthly',
      currentNumber: 4,
      currentSequence: 4,
      lastResetAt: { toDate: () => now },
    });

    const result = await generateCertificateNumber('cfg-monthly-2');

    expect(result).toBe('UTM-005');
  });

  it('resets on first allocation when lastResetAt was never set', async () => {
    seedConfig('cfg-monthly-3', {
      resetPolicy: 'monthly',
      currentNumber: 9,
      currentSequence: 9,
    });

    const result = await generateCertificateNumber('cfg-monthly-3');

    expect(result).toBe('UTM-001');
  });
});

describe('previewCertificateNumber', () => {
  it('matches what generateCertificateNumber would actually allocate for a monthly-reset config', async () => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    seedConfig('cfg-preview', {
      resetPolicy: 'monthly',
      currentNumber: 20,
      currentSequence: 20,
      lastResetAt: { toDate: () => twoMonthsAgo },
    });

    const preview = await previewCertificateNumber('cfg-preview');
    expect(preview).toBe('UTM-001');

    const actual = await generateCertificateNumber('cfg-preview');
    expect(actual).toBe(preview);
  });
});
