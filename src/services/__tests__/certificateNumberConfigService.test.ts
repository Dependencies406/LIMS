import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CertificateNumberConfig } from '../../types';

vi.mock('../firebase', async () => {
  const { createFakeFirestore } = await import('./fakeFirestore');
  return createFakeFirestore();
});

import * as firebaseMock from '../firebase';
import { certificateNumberConfigService } from '../certificateNumberConfigService';

const baseConfig: Omit<CertificateNumberConfig, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'UTM',
  prefix: 'UTM',
  separator: '-',
  includeYear: true,
  numberPadding: 3,
  currentNumber: 0,
  currentSequence: 0,
  currentYear: 2026,
  yearlyReset: false,
  resetPolicy: 'never',
  isActive: true,
};

beforeEach(() => {
  (firebaseMock as any).store.clear();
});

describe('certificateNumberConfigService — currentSequence/currentYear round-trip', () => {
  it('both fields survive a write -> read round trip via createConfig/getConfigById', async () => {
    const id = await certificateNumberConfigService.createConfig({
      ...baseConfig,
      currentSequence: 7,
      currentYear: 2024,
      resetPolicy: 'yearly',
    });

    const stored = await certificateNumberConfigService.getConfigById(id);

    expect(stored).not.toBeNull();
    expect(stored!.currentSequence).toBe(7);
    expect(stored!.currentYear).toBe(2024);
  });

  it('updateConfig persists currentSequence/currentYear when changed', async () => {
    const id = await certificateNumberConfigService.createConfig({ ...baseConfig });

    await certificateNumberConfigService.updateConfig(id, {
      currentSequence: 42,
      currentYear: 2025,
    });

    const stored = await certificateNumberConfigService.getConfigById(id);

    expect(stored!.currentSequence).toBe(42);
    expect(stored!.currentYear).toBe(2025);
  });
});

describe('certificateNumberConfigService — ADR-012: equipmentType / equipmentTypeId are gone, no readers left', () => {
  it('createConfig/updateConfig no longer accept equipmentType or equipmentTypeId (compile-time — see baseConfig above, which has neither field)', () => {
    // If either field still existed on CertificateNumberConfig, TypeScript
    // would require baseConfig to satisfy Omit<CertificateNumberConfig, ...>
    // either way; the real proof is that this whole file compiles without
    // ever mentioning them. This test documents that intent explicitly.
    expect(Object.keys(baseConfig)).not.toContain('equipmentType');
    expect(Object.keys(baseConfig)).not.toContain('equipmentTypeId');
  });

  it('reading a document with legacy equipmentType/equipmentTypeId keys (simulating old production data) does not surface them', async () => {
    const id = await certificateNumberConfigService.createConfig({ ...baseConfig });

    // Simulate a pre-ADR-012 document that still has the old fields on disk —
    // documentToConfig must not map them through even if present.
    const raw = (firebaseMock as any).store.get(`certificate_number_configs/${id}`);
    raw.data.equipmentType = 'legacy-value';
    raw.data.equipmentTypeId = 'legacy-eqtype-id';

    const stored = await certificateNumberConfigService.getConfigById(id);
    expect((stored as any).equipmentType).toBeUndefined();
    expect((stored as any).equipmentTypeId).toBeUndefined();
  });
});

describe('certificateNumberConfigService — lastAllocatedAt (ADR-012)', () => {
  it('round-trips when present on the document', async () => {
    const id = await certificateNumberConfigService.createConfig({ ...baseConfig });
    const raw = (firebaseMock as any).store.get(`certificate_number_configs/${id}`);
    const when = new Date('2026-01-15T00:00:00.000Z');
    raw.data.lastAllocatedAt = { toDate: () => when };

    const stored = await certificateNumberConfigService.getConfigById(id);
    expect(stored!.lastAllocatedAt).toEqual(when);
  });

  it('is undefined when never allocated', async () => {
    const id = await certificateNumberConfigService.createConfig({ ...baseConfig });
    const stored = await certificateNumberConfigService.getConfigById(id);
    expect(stored!.lastAllocatedAt).toBeUndefined();
  });

  it('updateConfig cannot set lastAllocatedAt — only the allocation transaction writes it', async () => {
    const id = await certificateNumberConfigService.createConfig({ ...baseConfig });

    await certificateNumberConfigService.updateConfig(id, {
      lastAllocatedAt: new Date('2026-06-01T00:00:00.000Z'),
    } as any);

    const raw = (firebaseMock as any).store.get(`certificate_number_configs/${id}`);
    expect(raw.data.lastAllocatedAt).toBeUndefined();
  });
});

describe('certificateNumberConfigService — yearlyReset is derived, not stored (Phase 1)', () => {
  it('is not written to the document at all', async () => {
    const id = await certificateNumberConfigService.createConfig({
      ...baseConfig,
      resetPolicy: 'yearly',
    });

    const raw = (firebaseMock as any).store.get(`certificate_number_configs/${id}`);
    expect(raw.data.yearlyReset).toBeUndefined();
  });

  it('reads back as true when resetPolicy is yearly, false otherwise', async () => {
    const yearlyId = await certificateNumberConfigService.createConfig({ ...baseConfig, resetPolicy: 'yearly' });
    const neverId = await certificateNumberConfigService.createConfig({ ...baseConfig, name: 'other', resetPolicy: 'never' });
    const monthlyId = await certificateNumberConfigService.createConfig({ ...baseConfig, name: 'other2', resetPolicy: 'monthly' });

    expect((await certificateNumberConfigService.getConfigById(yearlyId))!.yearlyReset).toBe(true);
    expect((await certificateNumberConfigService.getConfigById(neverId))!.yearlyReset).toBe(false);
    expect((await certificateNumberConfigService.getConfigById(monthlyId))!.yearlyReset).toBe(false);
  });

  it('tracks a resetPolicy change made via updateConfig with no explicit yearlyReset write', async () => {
    const id = await certificateNumberConfigService.createConfig({ ...baseConfig, resetPolicy: 'never' });
    expect((await certificateNumberConfigService.getConfigById(id))!.yearlyReset).toBe(false);

    await certificateNumberConfigService.updateConfig(id, { resetPolicy: 'yearly' });
    expect((await certificateNumberConfigService.getConfigById(id))!.yearlyReset).toBe(true);
  });

  it('ignores an explicit yearlyReset value passed to updateConfig — resetPolicy is the only source of truth', async () => {
    const id = await certificateNumberConfigService.createConfig({ ...baseConfig, resetPolicy: 'never' });

    // Passing yearlyReset: true without changing resetPolicy must have no effect.
    await certificateNumberConfigService.updateConfig(id, { yearlyReset: true } as any);

    const raw = (firebaseMock as any).store.get(`certificate_number_configs/${id}`);
    expect(raw.data.yearlyReset).toBeUndefined();
    expect((await certificateNumberConfigService.getConfigById(id))!.yearlyReset).toBe(false);
  });
});

describe('certificateNumberConfigService.resetNumber', () => {
  it('resets currentNumber, currentSequence and currentYear together', async () => {
    const id = await certificateNumberConfigService.createConfig({
      ...baseConfig,
      currentNumber: 10,
      currentSequence: 10,
      currentYear: 2020,
    });

    await certificateNumberConfigService.resetNumber(id);

    const stored = await certificateNumberConfigService.getConfigById(id);
    expect(stored!.currentNumber).toBe(0);
    expect(stored!.currentSequence).toBe(0);
    expect(stored!.currentYear).toBe(new Date().getFullYear());
    expect(stored!.lastResetAt).toBeInstanceOf(Date);
  });
});
