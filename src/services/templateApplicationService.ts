/**
 * Template Application Service
 * Handles applying templates to spreadsheets and generating initial data
 */

import type {
  TemplateSchema,
  FlattenedCellData,
  ColumnDefinition,
  TemplateApplicationResult,
} from '../types/template';
import { getCellId, parseCellId } from '../utils/formulaHelpers';
import { formulaEngine } from './formulaEngine';

/**
 * Generate spreadsheet data from a template
 * @param template Template to apply
 * @param rowCount Number of data rows to generate (default: 10)
 * @returns Template application result with data, columns, formulas, and errors
 */
export function generateSpreadsheetData(
  template: TemplateSchema,
  rowCount: number = 10
): TemplateApplicationResult {
  const errors: string[] = [];
  const data: FlattenedCellData[] = [];
  const columns = template.columns || [];
  const formulas = template.formulas || [];

  // Generate header row (row 0)
  columns.forEach((col, colIndex) => {
    data.push({
      row: 0,
      col: colIndex,
      value: col.header,
      type: col.type,
    });
  });

  // Generate data rows
  for (let row = 1; row <= rowCount; row++) {
    columns.forEach((col, colIndex) => {
      const cellId = getCellId(row, colIndex);
      let value: string | number = '';

      // Set default value if provided
      if (col.defaultValue) {
        value = col.defaultValue;
      }

      // Handle formula columns
      if (col.type === 'formula' && col.formula) {
        // Formula will be calculated later
        value = '';
      }

      data.push({
        row,
        col: colIndex,
        value,
        type: col.type,
        formula: col.type === 'formula' ? col.formula : undefined,
      });
    });
  }

  // Apply template formulas
  const formulasToApply = formulas.map((f) => {
    const parsed = parseCellId(f.cellId);
    return {
      ...f,
      row: parsed.row,
      col: parsed.col,
    };
  });

  // Calculate formulas
  const cellsMap = new Map(data.map((c) => [getCellId(c.row, c.col), c]));
  const cellsWithFormulas = data.map((cell) => {
    const formula = formulasToApply.find(
      (f) => f.row === cell.row && f.col === cell.col
    );
    if (formula) {
      return { ...cell, formula: formula.formula };
    }
    return cell;
  });

  const { dataWithValues, hasErrors } = formulaEngine.calculateAll(cellsWithFormulas);
  if (hasErrors) {
    errors.push('Some formulas could not be calculated');
  }

  return {
    data: dataWithValues,
    columns,
    formulas,
    errors,
  };
}

/**
 * Apply a template to existing spreadsheet data
 * @param template Template to apply
 * @param existingData Existing spreadsheet data
 * @returns Updated data with template applied
 */
export function applyTemplate(
  template: TemplateSchema,
  existingData: FlattenedCellData[]
): FlattenedCellData[] {
  const result = generateSpreadsheetData(template, 0);
  const templateColumns = result.columns;

  // Merge template columns with existing data
  // This is a simplified version - in practice, you might want more sophisticated merging
  const mergedData = [...existingData];

  // Add template columns that don't exist
  templateColumns.forEach((col, colIndex) => {
    const exists = existingData.some((c) => c.col === colIndex && c.row === 0);
    if (!exists) {
      mergedData.push({
        row: 0,
        col: colIndex,
        value: col.header,
        type: col.type,
      });
    }
  });

  return mergedData;
}

