import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDoc = vi.fn();
const setDoc = vi.fn();

vi.mock('../firebase', () => ({
  db: {},
  doc: vi.fn((_db: unknown, collection: string, sheetType: string) => ({ collection, sheetType })),
  getDoc: (...a: unknown[]) => getDoc(...a),
  setDoc: (...a: unknown[]) => setDoc(...a),
}));

import { analysisFormulaSetService } from '../analysisFormulaSetService';
import { FORCE_ISO7500_1_FORMULA_SET, FORCE_ISO7500_1_SHEET_TYPE } from '../../modules/data-recorder/analysis/formulaEngine';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analysisFormulaSetService.get', () => {
  it('returns the stored FormulaSet when the document exists', async () => {
    const stored = { sheetType: FORCE_ISO7500_1_SHEET_TYPE, steps: [{ name: 'x', inputs: [], expression: '1' }] };
    getDoc.mockResolvedValue({ exists: () => true, data: () => stored });

    const result = await analysisFormulaSetService.get(FORCE_ISO7500_1_SHEET_TYPE);

    expect(result).toEqual(stored);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('seeds and persists the default FormulaSet when no document exists', async () => {
    getDoc.mockResolvedValue({ exists: () => false });

    const result = await analysisFormulaSetService.get(FORCE_ISO7500_1_SHEET_TYPE);

    expect(result).toEqual(FORCE_ISO7500_1_FORMULA_SET);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = setDoc.mock.calls[0];
    expect(ref).toMatchObject({ collection: 'analysisFormulaSets', sheetType: FORCE_ISO7500_1_SHEET_TYPE });
    expect(payload).toEqual(FORCE_ISO7500_1_FORMULA_SET);
  });

  it('propagates the seed generator error for an unknown sheetType with no stored document', async () => {
    getDoc.mockResolvedValue({ exists: () => false });
    await expect(analysisFormulaSetService.get('unknown-type')).rejects.toThrow(/No seed FormulaSet/);
    expect(setDoc).not.toHaveBeenCalled();
  });
});

describe('analysisFormulaSetService.set', () => {
  it('overwrites the document for the given sheetType', async () => {
    const edited = { sheetType: FORCE_ISO7500_1_SHEET_TYPE, steps: [{ name: 'b', inputs: ['q1', 'q2', 'q3'], expression: 'MAX(q1,q2,q3) - MIN(q1,q2,q3)' }] };
    await analysisFormulaSetService.set(FORCE_ISO7500_1_SHEET_TYPE, edited);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = setDoc.mock.calls[0];
    expect(ref).toMatchObject({ collection: 'analysisFormulaSets', sheetType: FORCE_ISO7500_1_SHEET_TYPE });
    expect(payload).toEqual(edited);
  });
});
