/**
 * Formula Reference Shifter
 * Handles shifting cell references in formulas when rows/columns are inserted or deleted
 */

import { parseCellId, generateCellId } from '../models/SpreadsheetModel';

/**
 * Shift cell references in a formula expression
 * @param formula Formula expression (e.g., "=A1+B2")
 * @param rowShift Number of rows to shift (positive = down, negative = up)
 * @param colShift Number of columns to shift (positive = right, negative = left)
 * @param insertedAtRow Row index where insertion occurred (for relative references)
 * @param insertedAtCol Column index where insertion occurred
 * @param deletedAtRow Row index where deletion occurred
 * @param deletedAtCol Column index where deletion occurred
 */
export function shiftFormulaReferences(
  formula: string,
  rowShift: number = 0,
  colShift: number = 0,
  insertedAtRow?: number,
  insertedAtCol?: number,
  deletedAtRow?: number,
  deletedAtCol?: number
): string {
  if (!formula || !formula.startsWith('=')) {
    return formula;
  }

  // Remove leading =
  let expression = formula.substring(1);
  
  // Pattern to match cell references: A1, B2, AA10, etc.
  const cellRefPattern = /\b([A-Z]+)(\d+)\b/gi;
  
  // Replace all cell references
  expression = expression.replace(cellRefPattern, (match, colLetters, rowNum) => {
    try {
      const cellId = match.toUpperCase();
      const { row, column } = parseCellId(cellId);
      
      let newRow = row;
      let newCol = column;
      
      // Handle insertion
      if (insertedAtRow !== undefined) {
        if (row >= insertedAtRow) {
          newRow += rowShift;
        }
      } else if (rowShift !== 0) {
        newRow += rowShift;
      }
      
      if (insertedAtCol !== undefined) {
        if (column >= insertedAtCol) {
          newCol += colShift;
        }
      } else if (colShift !== 0) {
        newCol += colShift;
      }
      
      // Handle deletion
      if (deletedAtRow !== undefined) {
        if (row > deletedAtRow) {
          newRow -= Math.abs(rowShift);
        } else if (row === deletedAtRow) {
          // Reference to deleted row - return #REF!
          return '#REF!';
        }
      }
      
      if (deletedAtCol !== undefined) {
        if (column > deletedAtCol) {
          newCol -= Math.abs(colShift);
        } else if (column === deletedAtCol) {
          // Reference to deleted column - return #REF!
          return '#REF!';
        }
      }
      
      // Ensure non-negative indices
      if (newRow < 0 || newCol < 0) {
        return '#REF!';
      }
      
      return generateCellId(newRow, newCol);
    } catch (error) {
      // If parsing fails, return original
      return match;
    }
  });
  
  return '=' + expression;
}

/**
 * Shift column-only references (A, B, etc.) in a formula
 * Note: Column-only references don't shift with row operations
 */
export function shiftColumnOnlyReferences(
  formula: string,
  colShift: number = 0,
  insertedAtCol?: number,
  deletedAtCol?: number
): string {
  if (!formula || !formula.startsWith('=')) {
    return formula;
  }

  let expression = formula.substring(1);
  
  // Pattern to match column-only references: \bA\b, \bB\b (not followed by digit)
  const columnOnlyPattern = /\b([A-Z]+)(?!\d)\b/gi;
  
  expression = expression.replace(columnOnlyPattern, (match, colLetters) => {
    try {
      // Convert column letters to index
      let colIndex = 0;
      for (let i = 0; i < colLetters.length; i++) {
        colIndex = colIndex * 26 + (colLetters.charCodeAt(i) - 64);
      }
      colIndex -= 1; // Convert to 0-based
      
      let newCol = colIndex;
      
      // Handle insertion
      if (insertedAtCol !== undefined) {
        if (colIndex >= insertedAtCol) {
          newCol += colShift;
        }
      } else if (colShift !== 0) {
        newCol += colShift;
      }
      
      // Handle deletion
      if (deletedAtCol !== undefined) {
        if (colIndex > deletedAtCol) {
          newCol -= Math.abs(colShift);
        } else if (colIndex === deletedAtCol) {
          return '#REF!';
        }
      }
      
      if (newCol < 0) {
        return '#REF!';
      }
      
      // Convert back to column letters
      let result = '';
      newCol += 1; // Convert to 1-based
      while (newCol > 0) {
        newCol -= 1;
        result = String.fromCharCode(65 + (newCol % 26)) + result;
        newCol = Math.floor(newCol / 26);
      }
      
      return result;
    } catch (error) {
      return match;
    }
  });
  
  return '=' + expression;
}

/**
 * Shift all references in a formula (both cell and column-only)
 */
export function shiftAllFormulaReferences(
  formula: string,
  rowShift: number = 0,
  colShift: number = 0,
  insertedAtRow?: number,
  insertedAtCol?: number,
  deletedAtRow?: number,
  deletedAtCol?: number
): string {
  // First shift cell references
  let shifted = shiftFormulaReferences(
    formula,
    rowShift,
    colShift,
    insertedAtRow,
    insertedAtCol,
    deletedAtRow,
    deletedAtCol
  );
  
  // Then shift column-only references
  shifted = shiftColumnOnlyReferences(
    shifted,
    colShift,
    insertedAtCol,
    deletedAtCol
  );
  
  return shifted;
}

