/**
 * Column Definitions Utilities
 * Handles applying column definitions to spreadsheet cells
 */

import type { SpreadsheetModel, Cell, ColumnDefinition } from '../models/SpreadsheetModel';
import { generateCellId, parseCellId, getColumnDefinition, isFormulaColumn } from '../models/SpreadsheetModel';
import { evaluateCell } from '../services/spreadsheetEngine';

/**
 * Apply column definitions to spreadsheet
 * Creates formula cells for formula columns
 */
export function applyColumnDefinitions(
  spreadsheet: SpreadsheetModel,
  columnDefinitions: Map<string, ColumnDefinition>,
  columnOrder: string[]
): SpreadsheetModel {
  const updatedCells = new Map(spreadsheet.cells);
  
  // Update spreadsheet with column definitions
  // Set columnCount to match columnOrder length (matches desktop app behavior)
  const updatedSpreadsheet: SpreadsheetModel = {
    ...spreadsheet,
    columnDefinitions,
    columnOrder,
    columnCount: columnOrder.length || spreadsheet.columnCount, // Use columnOrder length if available
  };
  
  // Apply column definitions to all rows
  for (let row = 0; row < spreadsheet.rowCount; row++) {
    columnOrder.forEach((columnName, colIndex) => {
      const colDef = columnDefinitions.get(columnName);
      if (!colDef) return;
      
      const cellId = generateCellId(row, colIndex);
      
      // If it's a formula column, ensure the cell has the formula
      if (colDef.type === 'formula' && colDef.formula) {
        const existingCell = updatedCells.get(cellId);
        
        const formulaCell: Cell = {
          id: cellId,
          row,
          column: colIndex,
          dataType: 'formula',
          displayValue: '',
          rawValue: null,
          formula: colDef.formula,
          isLocked: true, // Formula columns are read-only
          format: colDef.precision !== undefined ? {
            decimalPlaces: colDef.precision,
            numberFormat: colDef.formatMask,
          } : undefined,
        };
        
        updatedCells.set(cellId, formulaCell);
      } else {
        // For non-formula columns, update cell properties if needed
        const existingCell = updatedCells.get(cellId);
        if (existingCell) {
          const updatedCell: Cell = {
            ...existingCell,
            format: colDef.precision !== undefined ? {
              decimalPlaces: colDef.precision,
              numberFormat: colDef.formatMask,
            } : existingCell.format,
            validation: colDef.validationRules ? {
              type: 'number',
              min: colDef.validationRules.min,
              max: colDef.validationRules.max,
            } : existingCell.validation,
          };
          updatedCells.set(cellId, updatedCell);
        }
      }
    });
  }
  
  return {
    ...updatedSpreadsheet,
    cells: updatedCells,
  };
}

/**
 * Get cell value considering column definitions
 * For formula columns, uses column-level formula
 */
export function getCellValueWithColumnDefs(
  spreadsheet: SpreadsheetModel,
  cellId: string
): any {
  const { row, column } = parseCellId(cellId);
  const cells = spreadsheet.cells || new Map();
  const cell = cells.get(cellId);
  
  // Check if this column has a formula definition
  if (isFormulaColumn(spreadsheet, column)) {
    const formula = getColumnDefinition(spreadsheet, column)?.formula;
    if (formula) {
      // Evaluate the formula for this cell
      const result = evaluateCell(spreadsheet, cellId);
      return result.value;
    }
  }
  
  // Return cell value normally
  return cell?.rawValue ?? cell?.displayValue ?? null;
}

/**
 * Convert template columns to column definitions with optional prepended columns
 * Matches desktop app structure: type, formula, data_type, precision, format_mask, validation_rules, alignment
 * @param templateColumns - Template column definitions
 * @param prependColumns - Columns to prepend before template columns (e.g., calibration column)
 * @returns Map of column definitions
 */
export function templateColumnsToColumnDefinitions(
  templateColumns: Array<{ 
    id: string; 
    header: string; // Display name
    columnValue?: string; // Formula value (optional, for backward compatibility)
    type: string; 
    formula?: string; 
    validation?: any;
    data_type?: string;
    precision?: number;
    format_mask?: string;
    alignment?: string;
    is_read_only?: boolean;
    is_printable?: boolean;
  }>,
  prependColumns?: Array<ColumnDefinition> // NEW PARAMETER
): Map<string, ColumnDefinition> {
  const columnDefinitions = new Map<string, ColumnDefinition>();
  
  // Start with prepended columns if provided
  const allColumns: Array<{ 
    id: string; 
    header: string;
    columnValue?: string;
    type: string; 
    formula?: string; 
    validation?: any;
    data_type?: string;
    precision?: number;
    format_mask?: string;
    alignment?: string;
    is_read_only?: boolean;
    is_printable?: boolean;
  }> = [];

  // Add prepended columns first (convert ColumnDefinition to template format)
  if (prependColumns && prependColumns.length > 0) {
    prependColumns.forEach((colDef) => {
      const prependedCol: any = {
        id: colDef.columnValue || colDef.name,
        header: colDef.name,
        columnValue: colDef.columnValue || colDef.name,
        type: colDef.type === 'formula' ? 'formula' : colDef.type === 'number' ? 'number' : 'text',
        formula: colDef.formula,
        data_type: colDef.dataType,
        precision: colDef.precision,
        format_mask: colDef.formatMask,
        is_read_only: colDef.readOnly,
      };
      // Add unit if present
      if (colDef.unit) {
        prependedCol.unit = colDef.unit;
      }
      allColumns.push(prependedCol);
    });
  }

  // Add template columns after prepended columns
  allColumns.push(...templateColumns);
  
  // Build columnValue to letter mapping (accounting for prepended columns)
  const columnValueToLetter = new Map<string, string>();
  allColumns.forEach((templateCol, index) => {
    // Use columnValue if available, otherwise fallback to header
    const colValue = templateCol.columnValue || templateCol.header || templateCol.id || (templateCol as any).name;
    if (colValue) {
      // Convert index to column letter (0 -> A, 1 -> B, etc.)
      const colLetter = String.fromCharCode(65 + (index % 26));
      const colNumber = Math.floor(index / 26);
      const colPart = colNumber > 0 ? String.fromCharCode(64 + colNumber) + colLetter : colLetter;
      columnValueToLetter.set(colValue, colPart);
    }
  });
  
  // Process all columns (prepended + template)
  allColumns.forEach((col) => {
    // Map desktop types to web types
    // Desktop uses "Input" or "Formula" (capitalized), web uses lowercase
    const desktopType = col.type?.toLowerCase() || 'input';
    let webType: ColumnDefinition['type'] = 'text';
    let dataType: 'NUMBER' | 'STRING' | 'BOOLEAN' | 'SCIENTIFIC' = 'STRING';
    
    // Extract unit from template column (support both 'unit' and 'subHeader' fields)
    const unit = (col as any).unit || (col as any).subHeader || undefined;
    
    // Check if it's a formula column (either type is "formula" or has a formula property)
    if (desktopType === 'formula' || (col.formula && col.formula.trim() !== '')) {
      webType = 'formula';
      // For formula columns, use data_type from template or default to NUMBER
      dataType = (col.data_type as any) || 'NUMBER';
    } else if (desktopType === 'number' || col.data_type === 'NUMBER') {
      webType = 'number';
      dataType = 'NUMBER';
    } else if (desktopType === 'scientific' || col.data_type === 'SCIENTIFIC') {
      webType = 'scientific';
      dataType = 'SCIENTIFIC';
    } else if (desktopType === 'boolean' || col.data_type === 'BOOLEAN') {
      webType = 'boolean';
      dataType = 'BOOLEAN';
    } else {
      webType = 'text';
      dataType = 'STRING';
    }
    
    // Ensure formula doesn't have leading "=" (formulas are stored without "=")
    let formulaValue = col.formula;
    if (formulaValue && typeof formulaValue === 'string' && formulaValue.startsWith('=')) {
      formulaValue = formulaValue.substring(1);
    }
    
    // Convert columnValue in formula to column letters (e.g., "InputValue" -> "A")
    // Use columnValue for formula conversion, not header (display name)
    // This ensures formulas use column letters (A, B, C) instead of column values
    // The formula engine only supports column letters, not column names
    if (formulaValue && typeof formulaValue === 'string' && columnValueToLetter.size > 0) {
      // Replace column values with column letters in the formula
      // Use word boundaries to avoid partial matches (e.g., "Value" in "Values" should not match)
      // Sort by length (longest first) to avoid partial matches
      const sortedEntries = Array.from(columnValueToLetter.entries()).sort((a, b) => b[0].length - a[0].length);
      
      for (const [value, letter] of sortedEntries) {
        // Case-insensitive replacement with word boundaries
        // Escape special regex characters in the column value
        const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedValue}\\b`, 'gi');
        formulaValue = formulaValue.replace(regex, letter);
      }
    }
    
    // Use header (display name) as the key for columnDefinitions
    // This ensures the display name is used in the UI and PDF
    const columnKey = col.header || col.id || `Column${columnDefinitions.size + 1}`;
    
    const colDef: ColumnDefinition = {
      name: col.header || col.id || columnKey, // Display name (what users see)
      columnValue: col.columnValue || col.header, // Formula value (for reference)
      unit: unit, // Unit or sub-header for second header row
      type: webType,
      formula: formulaValue,
      dataType: col.data_type as any || dataType,
      precision: col.precision !== undefined ? col.precision : (dataType === 'NUMBER' || dataType === 'SCIENTIFIC' ? 2 : undefined),
      formatMask: col.format_mask,
      validationRules: col.validation ? {
        min: col.validation.min,
        max: col.validation.max,
      } : undefined,
      readOnly: col.is_read_only !== undefined ? col.is_read_only : (webType === 'formula'),
    };
    
    // Use header (display name) as the key
    columnDefinitions.set(columnKey, colDef);
  });
  
  return columnDefinitions;
}

