  /**
 * Data Format Converter
 * Converts between desktop (row-indexed) and web (cell-ID indexed) spreadsheet formats
 * 
 * Desktop format: { "row1": { "Column Name": value, ... }, "row2": {...} }
 * Web format: { "A1": Cell, "B2": Cell, ... }
 */

import type { SpreadsheetModel, Cell, ColumnDefinition } from '../models/SpreadsheetModel';
import { generateCellId } from '../models/SpreadsheetModel';

/**
 * Desktop spreadsheet data format (row-indexed)
 */
export interface DesktopSpreadsheetData {
  [rowIndex: string]: {
    [columnName: string]: {
      value?: any;
      style?: any;
    } | any; // Support both old format (direct value) and new format (dict)
  };
}

/**
 * Desktop column definitions format
 */
export interface DesktopColumnDefinitions {
  [columnName: string]: {
    type: 'NUMBER' | 'STRING' | 'BOOLEAN' | 'SCIENTIFIC' | 'formula';
    formula?: string;
    data_type?: 'NUMBER' | 'STRING' | 'BOOLEAN' | 'SCIENTIFIC';
    precision?: number;
    format_mask?: string;
    validation_rules?: {
      min?: number;
      max?: number;
    };
    conditional_formatting?: any;
  };
}

/**
 * Desktop spreadsheet model format (as stored in Firestore)
 */
export interface DesktopSpreadsheetModel {
  templateId?: string;
  templateName?: string;
  columns: DesktopColumnDefinitions;
  columnOrder?: string[];
  data: DesktopSpreadsheetData;
}

/**
 * Convert desktop format to web format
 */
export function convertDesktopToWeb(
  desktopModel: DesktopSpreadsheetModel,
  spreadsheetId: string,
  spreadsheetName: string,
  createdBy: string
): SpreadsheetModel {
  const cells = new Map<string, Cell>();
  const columnOrder = desktopModel.columnOrder || Object.keys(desktopModel.columns).sort();
  
  // Convert column definitions to column order
  const columnNames = columnOrder;
  const columnCount = columnNames.length;
  
  // Find max row index
  let maxRow = 0;
  for (const rowKey in desktopModel.data) {
    const rowIndex = parseInt(rowKey, 10);
    if (!isNaN(rowIndex) && rowIndex >= 0) {
      maxRow = Math.max(maxRow, rowIndex);
    }
  }
  
  // Convert data rows (skip row 0 if it's headers)
  // Desktop format uses 0-based row indices, but we'll preserve them
  for (const rowKey in desktopModel.data) {
    const rowIndex = parseInt(rowKey, 10);
    if (isNaN(rowIndex)) continue;
    
    const rowData = desktopModel.data[rowKey];
    
    columnNames.forEach((columnName, colIndex) => {
      const cellId = generateCellId(rowIndex, colIndex);
      const colDef = desktopModel.columns[columnName];
      const cellData = rowData[columnName];
      
      // Handle both old format (direct value) and new format (dict with value/style)
      let value: any = null;
      let style: any = null;
      
      if (cellData !== undefined && cellData !== null) {
        if (typeof cellData === 'object' && 'value' in cellData) {
          value = cellData.value;
          style = cellData.style || null;
        } else {
          value = cellData;
          style = null;
        }
      }
      
      // Determine data type
      let dataType: Cell['dataType'] = 'text';
      let formula: string | undefined = undefined;
      
      if (colDef?.type === 'formula' && colDef?.formula) {
        dataType = 'formula';
        formula = colDef.formula;
      } else if (colDef?.data_type === 'NUMBER' || colDef?.data_type === 'SCIENTIFIC') {
        dataType = 'number';
      } else if (colDef?.data_type === 'BOOLEAN') {
        dataType = 'boolean';
      } else if (value !== null && value !== undefined) {
        // Infer from value
        if (typeof value === 'number') {
          dataType = 'number';
        } else if (typeof value === 'boolean') {
          dataType = 'boolean';
        } else {
          dataType = 'text';
        }
      }
      
      // Create cell
      const cell: Cell = {
        id: cellId,
        row: rowIndex,
        column: colIndex,
        dataType,
        displayValue: value !== null && value !== undefined ? String(value) : '',
        rawValue: value,
        formula,
        format: style ? {
          decimalPlaces: style.precision ?? colDef?.precision,
          numberFormat: style.format_mask ?? colDef?.format_mask,
          alignment: style.alignment,
          textColor: style.text_color,
          backgroundColor: style.background_color,
        } : (colDef?.precision !== undefined ? {
          decimalPlaces: colDef.precision,
          numberFormat: colDef.format_mask,
        } : undefined),
        isLocked: colDef?.type === 'formula', // Formula columns are read-only
        validation: colDef?.validation_rules ? {
          type: 'number',
          min: colDef.validation_rules.min,
          max: colDef.validation_rules.max,
        } : undefined,
      };
      
      cells.set(cellId, cell);
    });
  }
  
  // Create columnDefinitions Map from desktop columns
  const columnDefinitions = new Map<string, ColumnDefinition>();
  columnOrder.forEach((columnName) => {
    const desktopColDef = desktopModel.columns[columnName];
    if (desktopColDef) {
      const webColDef: ColumnDefinition = {
        name: columnName, // Use column name as display name
        type: desktopColDef.type === 'formula' ? 'formula' :
              desktopColDef.data_type === 'NUMBER' ? 'number' :
              desktopColDef.data_type === 'SCIENTIFIC' ? 'scientific' :
              desktopColDef.data_type === 'BOOLEAN' ? 'boolean' : 'text',
        formula: desktopColDef.formula,
        dataType: desktopColDef.data_type,
        precision: desktopColDef.precision,
        formatMask: desktopColDef.format_mask,
        validationRules: desktopColDef.validation_rules ? {
          min: desktopColDef.validation_rules.min,
          max: desktopColDef.validation_rules.max,
        } : undefined,
        readOnly: desktopColDef.type === 'formula',
      };
      columnDefinitions.set(columnName, webColDef);
    } else {
      // Create a default column definition if not found
      columnDefinitions.set(columnName, {
        name: columnName,
        type: 'text',
      });
    }
  });
  
  // Create spreadsheet model
  return {
    id: spreadsheetId,
    name: spreadsheetName,
    version: '1.0',
    status: 'draft',
    createdBy,
    createdAt: new Date(),
    rowCount: maxRow + 1,
    columnCount,
    cells,
    formulas: new Map(),
    variables: new Map(),
    columnDefinitions, // Include column definitions
    columnOrder, // Include column order
    auditTrail: [],
    metadata: {
      templateId: desktopModel.templateId,
      templateName: desktopModel.templateName,
    },
  };
}

/**
 * Convert web format to desktop format
 */
export function convertWebToDesktop(
  webModel: SpreadsheetModel,
  columnDefinitions?: DesktopColumnDefinitions
): DesktopSpreadsheetModel {
  const data: DesktopSpreadsheetData = {};
  const columns: DesktopColumnDefinitions = columnDefinitions || {};
  const columnOrder: string[] = [];
  
  // Extract column names from cells (assuming they're in order)
  const columnMap = new Map<number, string>();
  
  // First pass: collect column names from cells
  const cells = webModel.cells || new Map();
  for (const cell of cells.values()) {
    if (!columnMap.has(cell.column)) {
      // Try to infer column name from header row (row 0) or use default
      const headerCell = Array.from(cells.values()).find(
        c => c.row === 0 && c.column === cell.column
      );
      const columnName = headerCell?.displayValue || `Column${cell.column + 1}`;
      columnMap.set(cell.column, columnName);
      columnOrder.push(columnName);
      
      // Create column definition if not provided
      if (!columns[columnName]) {
        columns[columnName] = {
          type: cell.dataType === 'formula' ? 'formula' : 
                cell.dataType === 'number' ? 'NUMBER' :
                cell.dataType === 'boolean' ? 'BOOLEAN' : 'STRING',
          data_type: cell.dataType === 'number' ? 'NUMBER' :
                    cell.dataType === 'boolean' ? 'BOOLEAN' : 'STRING',
          precision: cell.format?.decimalPlaces,
          format_mask: cell.format?.numberFormat,
        };
        
        if (cell.dataType === 'formula' && cell.formula) {
          columns[columnName].formula = cell.formula;
        }
      }
    }
  }
  
  // Sort columns by index
  columnOrder.sort((a, b) => {
    const aIndex = Array.from(columnMap.entries()).find(([_, name]) => name === a)?.[0] ?? 0;
    const bIndex = Array.from(columnMap.entries()).find(([_, name]) => name === b)?.[0] ?? 0;
    return aIndex - bIndex;
  });
  
  // Second pass: convert cells to row-indexed format
  for (const cell of cells.values()) {
    const rowKey = String(cell.row);
    const columnName = columnMap.get(cell.column) || `Column${cell.column + 1}`;
    
    if (!data[rowKey]) {
      data[rowKey] = {};
    }
    
    // Store value and style
    const cellData: any = {
      value: cell.rawValue,
    };
    
    if (cell.format) {
      cellData.style = {
        precision: cell.format.decimalPlaces,
        format_mask: cell.format.numberFormat,
        alignment: cell.format.alignment,
        text_color: cell.format.textColor,
        background_color: cell.format.backgroundColor,
      };
    }
    
    data[rowKey][columnName] = cellData;
  }
  
  return {
    templateId: webModel.metadata?.templateId,
    templateName: webModel.metadata?.templateName,
    columns,
    columnOrder,
    data,
  };
}

/**
 * Convert web ColumnDefinition to desktop column definition format
 */
export function convertColumnDefinitionToDesktop(
  colDef: ColumnDefinition,
  columnIndex: number
): DesktopColumnDefinitions[string] {
  return {
    type: colDef.type === 'formula' ? 'formula' :
          colDef.type === 'number' ? 'NUMBER' :
          colDef.type === 'boolean' ? 'BOOLEAN' : 'STRING',
    data_type: colDef.type === 'number' ? 'NUMBER' :
               colDef.type === 'boolean' ? 'BOOLEAN' : 'STRING',
    formula: colDef.formula,
    precision: colDef.precision || (colDef.validationRules?.min !== undefined ? 2 : undefined),
    format_mask: colDef.formatMask,
    validation_rules: colDef.validationRules ? {
      min: colDef.validationRules.min,
      max: colDef.validationRules.max,
    } : undefined,
  };
}

/**
 * Convert desktop column definition to web ColumnDefinition format
 */
export function convertDesktopColumnDefinitionToWeb(
  colName: string,
  desktopColDef: DesktopColumnDefinitions[string]
): ColumnDefinition {
  return {
    name: colName,
    type: desktopColDef.type === 'formula' ? 'formula' :
          desktopColDef.type === 'NUMBER' || desktopColDef.type === 'SCIENTIFIC' ? 'number' :
          desktopColDef.type === 'BOOLEAN' ? 'boolean' : 'text',
    formula: desktopColDef.formula,
    dataType: desktopColDef.data_type,
    precision: desktopColDef.precision,
    formatMask: desktopColDef.format_mask,
    validationRules: desktopColDef.validation_rules ? {
      min: desktopColDef.validation_rules.min,
      max: desktopColDef.validation_rules.max,
    } : undefined,
    readOnly: desktopColDef.type === 'formula',
  };
}

