/**
 * Formula Engine
 * Wrapper around hot-formula-parser with custom functions for template calculations
 */

import { Parser } from 'hot-formula-parser';
import type { FlattenedCellData, TemplateFormula } from '../types/template';
import { getCellId, parseCellId } from '../utils/formulaHelpers';

/**
 * Get cell value from flattened cell data
 */
function getCellValue(
  cellId: string,
  cellsData: FlattenedCellData[],
  cellsMap: Map<string, FlattenedCellData>
): number | string {
  const cell = cellsMap.get(cellId);
  if (!cell) {
    return 0; // Default to 0 for missing cells
  }

  // If cell has a numeric value, return it
  if (typeof cell.value === 'number') {
    return cell.value;
  }

  // Try to parse string value as number
  const numValue = parseFloat(String(cell.value));
  return isNaN(numValue) ? 0 : numValue;
}

/**
 * Formula Engine class
 * Handles formula parsing and calculation for spreadsheet templates
 */
export class FormulaEngine {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.setupCustomFunctions();
  }

  /**
   * Setup custom functions for the formula parser
   */
  private setupCustomFunctions(): void {
    // SUM function
    this.parser.setFunction('SUM', (params: any[]) => {
      return params.reduce((sum: number, val: any) => {
        const num = parseFloat(val) || 0;
        return sum + num;
      }, 0);
    });

    // AVERAGE function
    this.parser.setFunction('AVERAGE', (params: any[]) => {
      if (params.length === 0) return 0;
      const sum = params.reduce((acc: number, val: any) => {
        return acc + (parseFloat(val) || 0);
      }, 0);
      return sum / params.length;
    });

    // MAX function
    this.parser.setFunction('MAX', (params: any[]) => {
      if (params.length === 0) return 0;
      return Math.max(...params.map((val: any) => parseFloat(val) || 0));
    });

    // MIN function
    this.parser.setFunction('MIN', (params: any[]) => {
      if (params.length === 0) return 0;
      return Math.min(...params.map((val: any) => parseFloat(val) || 0));
    });

    // COUNT function
    this.parser.setFunction('COUNT', (params: any[]) => {
      return params.filter((val: any) => val != null && val !== '').length;
    });

    // IF function
    this.parser.setFunction('IF', (params: any[]) => {
      if (params.length < 2) return false;
      const condition = params[0];
      const trueValue = params[1];
      const falseValue = params[2] || false;
      return condition ? trueValue : falseValue;
    });
  }

  /**
   * Parse and evaluate a formula
   * @param formula Formula string (e.g., "=A1+B1")
   * @param cellsData Array of all cell data
   * @param cellsMap Map of cellId to cell data for quick lookup
   * @returns Object with value and error (if any)
   */
  public parseFormula(
    formula: string,
    cellsData: FlattenedCellData[],
    cellsMap: Map<string, FlattenedCellData>
  ): { value: any; error: string | null } {
    if (!formula || !formula.startsWith('=')) {
      return { value: formula, error: null };
    }

    try {
      // Replace cell references with their values
      const formulaWithValues = formula.replace(/([A-Z]+\d+)/gi, (match) => {
        const value = getCellValue(match, cellsData, cellsMap);
        return String(value);
      });

      // Parse the formula
      const result = this.parser.parse(formulaWithValues);

      if (result.error) {
        return { value: `#ERROR!`, error: result.error };
      }

      return { value: result.result, error: null };
    } catch (error) {
      return {
        value: `#ERROR!`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Calculate all formulas in a template
   * Handles dependency resolution and circular reference detection
   * @param allCells All cells in the spreadsheet
   * @returns Object with calculated cells and error flag
   */
  public calculateAll(
    allCells: FlattenedCellData[]
  ): { dataWithValues: FlattenedCellData[]; hasErrors: boolean } {
    const updatedCellsMap = new Map<string, FlattenedCellData>();
    const calcState = new Map<
      string,
      { cell: FlattenedCellData; isCalculated: boolean; dependencies: string[] }
    >();

    // Initialize maps
    allCells.forEach((cell) => {
      const cellId = getCellId(cell.row, cell.col);
      updatedCellsMap.set(cellId, { ...cell });

      if (cell.formula) {
        // Extract dependencies from formula
        const deps = this.extractDependencies(cell.formula);
        calcState.set(cellId, {
          cell: { ...cell },
          isCalculated: false,
          dependencies: deps,
        });
      }
    });

    let hasErrors = false;
    let passes = 0;
    const maxPasses = allCells.length + 1;
    let cellsCalculatedThisPass = -1;

    // Calculate formulas in dependency order
    while (cellsCalculatedThisPass !== 0 && passes < maxPasses) {
      cellsCalculatedThisPass = 0;

      for (const [id, state] of calcState.entries()) {
        if (state.isCalculated) continue;

        // Check if all dependencies are calculated
        const allDepsMet = state.dependencies.every((depId) => {
          return calcState.get(depId)?.isCalculated ?? true;
        });

        if (allDepsMet) {
          const currentCellsData = Array.from(updatedCellsMap.values());
          const currentCellsMap = new Map(
            currentCellsData.map((c) => [getCellId(c.row, c.col), c])
          );

          const { value, error } = this.parseFormula(
            state.cell.formula!,
            currentCellsData,
            currentCellsMap
          );

          const newCell = {
            ...state.cell,
            value: error ? value : String(value),
          };
          updatedCellsMap.set(id, newCell);
          state.isCalculated = true;
          cellsCalculatedThisPass++;

          if (error) hasErrors = true;
        }
      }
      passes++;
    }

    // Handle circular references
    if (cellsCalculatedThisPass === 0) {
      for (const [id, state] of calcState.entries()) {
        if (!state.isCalculated) {
          const errorCell = { ...state.cell, value: '#REF!' };
          updatedCellsMap.set(id, errorCell);
          hasErrors = true;
        }
      }
    }

    const dataWithValues = Array.from(updatedCellsMap.values());
    return { dataWithValues, hasErrors };
  }

  /**
   * Extract cell dependencies from a formula
   */
  private extractDependencies(formula: string): string[] {
    const cellRefRegex = /([A-Z]+\d+)/gi;
    const matches = formula.match(cellRefRegex);
    return matches ? [...new Set(matches.map((m) => m.toUpperCase()))] : [];
  }
}

export const formulaEngine = new FormulaEngine();

