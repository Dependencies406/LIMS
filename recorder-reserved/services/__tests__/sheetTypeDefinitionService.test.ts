import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDoc = vi.fn();
const setDoc = vi.fn();
const getDocs = vi.fn();

vi.mock('../firebase', () => ({
  db: {},
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({ collection, id })),
  collection: vi.fn((_db: unknown, name: string) => ({ collection: name })),
  getDoc: (...a: unknown[]) => getDoc(...a),
  setDoc: (...a: unknown[]) => setDoc(...a),
  getDocs: (...a: unknown[]) => getDocs(...a),
}));

import { sheetTypeDefinitionService } from '../sheetTypeDefinitionService';
import { FORCE_SHEET_TYPE } from '../../modules/data-recorder/sheetLogic';
import { SERIES } from '../../modules/data-recorder/sheetLogic';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sheetTypeDefinitionService.get', () => {
  it('returns the stored definition when the document exists', async () => {
    const stored = { id: FORCE_SHEET_TYPE, displayName: 'Custom', headerFields: [], series: [], envRounds: 3, schemaVersion: 1 };
    getDoc.mockResolvedValue({ exists: () => true, data: () => stored });

    const result = await sheetTypeDefinitionService.get(FORCE_SHEET_TYPE);

    expect(result).toEqual(stored);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('seeds and persists a definition mirroring the fixed force/ISO-7500-1 shape when no document exists', async () => {
    getDoc.mockResolvedValue({ exists: () => false });

    const result = await sheetTypeDefinitionService.get(FORCE_SHEET_TYPE);

    expect(result.id).toBe(FORCE_SHEET_TYPE);
    expect(result.envRounds).toBe(3);
    expect(result.series.map((s) => s.key)).toEqual(SERIES.map((s) => s.key));
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = setDoc.mock.calls[0];
    expect(ref).toMatchObject({ collection: 'sheetTypeDefinitions', id: FORCE_SHEET_TYPE });
    expect(payload).toEqual(result);
  });

  it('throws for an unknown sheetType with no stored document and no seed', async () => {
    getDoc.mockResolvedValue({ exists: () => false });
    await expect(sheetTypeDefinitionService.get('unknown-type')).rejects.toThrow(/No SheetTypeDefinition/);
    expect(setDoc).not.toHaveBeenCalled();
  });
});

describe('sheetTypeDefinitionService.set', () => {
  it('overwrites the document for the given sheetType id', async () => {
    const def = { id: 'torque-iso6789', displayName: 'Torque', headerFields: [], series: [], envRounds: 1, schemaVersion: 1 };
    await sheetTypeDefinitionService.set(def.id, def);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = setDoc.mock.calls[0];
    expect(ref).toMatchObject({ collection: 'sheetTypeDefinitions', id: def.id });
    expect(payload).toEqual(def);
  });
});

describe('sheetTypeDefinitionService.list', () => {
  it('returns every persisted definition', async () => {
    const defs = [
      { id: FORCE_SHEET_TYPE, displayName: 'Force', headerFields: [], series: [], envRounds: 3, schemaVersion: 1 },
      { id: 'torque-iso6789', displayName: 'Torque', headerFields: [], series: [], envRounds: 1, schemaVersion: 1 },
    ];
    getDocs.mockResolvedValue({ docs: defs.map((d) => ({ data: () => d })) });

    const result = await sheetTypeDefinitionService.list();

    expect(result).toEqual(defs);
  });
});
