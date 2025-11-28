/**
 * useFormulaEngine Hook
 * React hook wrapper for the formula engine
 */

import { useMemo } from 'react';
import { formulaEngine } from '../services/formulaEngine';
import type { FlattenedCellData } from '../types/template';

export function useFormulaEngine() {
  const engine = useMemo(() => formulaEngine, []);

  /**
   * Calculate all formulas in cells
   */
  const calculateAll = (cells: FlattenedCellData[]) => {
    return engine.calculateAll(cells);
  };

  /**
   * Parse a single formula
   */
  const parseFormula = (
    formula: string,
    cellsData: FlattenedCellData[],
    cellsMap: Map<string, FlattenedCellData>
  ) => {
    return engine.parseFormula(formula, cellsData, cellsMap);
  };

  return {
    calculateAll,
    parseFormula,
  };
}

