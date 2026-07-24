import { useState, useEffect } from 'react';
import type { FormulaSet } from '../modules/data-recorder/analysis/formulaEngine';
import { FORCE_ISO7500_1_SHEET_TYPE, generateSeedFormulaSet } from '../modules/data-recorder/analysis/formulaEngine';
import { analysisFormulaSetService } from '../services/analysisFormulaSetService';

/**
 * Loads/saves the (currently unversioned — design §2b) FormulaSet for a
 * sheetType. Mirrors useCmcSettings.tsx's shape exactly.
 */
export const useAnalysisFormulaSet = (sheetType: string = FORCE_ISO7500_1_SHEET_TYPE) => {
  const [formulaSet, setFormulaSet] = useState<FormulaSet>(() => generateSeedFormulaSet(sheetType));
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setFormulaSet(await analysisFormulaSetService.get(sheetType));
    } catch (err) {
      console.error('Error loading analysis FormulaSet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetType]);

  const updateFormulaSet = async (next: FormulaSet): Promise<void> => {
    await analysisFormulaSetService.set(sheetType, next);
    setFormulaSet(next);
  };

  return { formulaSet, loading, updateFormulaSet, refreshFormulaSet: load };
};
