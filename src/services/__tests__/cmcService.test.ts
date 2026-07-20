import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CmcSettings } from '../../types';

const getDoc = vi.fn();
const setDoc = vi.fn();

vi.mock('../firebase', () => ({
  db: {},
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: (...a: unknown[]) => getDoc(...a),
  setDoc: (...a: unknown[]) => setDoc(...a),
}));

import { cmcService, DEFAULT_CMC_SETTINGS } from '../cmcService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cmcService.get', () => {
  it('returns the stored settings when the doc exists', async () => {
    const stored: CmcSettings = {
      schemaVersion: 1,
      directions: {
        tension: [{ toN: 100, cmcPercent: 0.3 }],
        compression: [{ toN: 100, cmcPercent: 0.4 }],
      },
    };
    getDoc.mockResolvedValue({ exists: () => true, data: () => stored });
    const result = await cmcService.get();
    expect(result).toEqual(stored);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('seeds the spec §4 default scope and persists it when the doc is missing', async () => {
    getDoc.mockResolvedValue({ exists: () => false });
    const result = await cmcService.get();
    expect(result).toEqual(DEFAULT_CMC_SETTINGS);
    expect(setDoc).toHaveBeenCalledWith({ path: 'system/cmc' }, DEFAULT_CMC_SETTINGS);
  });
});

describe('cmcService.set', () => {
  it('overwrites the CMC document', async () => {
    const next: CmcSettings = {
      schemaVersion: 1,
      directions: { tension: [], compression: [] },
    };
    await cmcService.set(next);
    expect(setDoc).toHaveBeenCalledWith({ path: 'system/cmc' }, next);
  });
});
