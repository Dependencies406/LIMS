/**
 * Spreadsheet Model
 * Core data structures for ISO/IEC 17025 compliant spreadsheet management
 * 
 * This module defines the data models for spreadsheet documents,
 * cells, formulas, and audit trails without any UI or database logic.
 */

/**
 * Spreadsheet status following ISO 17025 document control requirements
 */
export type SpreadsheetStatus = 'draft' | 'under-review' | 'approved' | 'archived';

/**
 * Cell data type
 */
export type CellDataType = 'text' | 'number' | 'formula' | 'date' | 'boolean' | 'measurement' | 'uncertainty';

/**
 * Cell alignment options
 */
export type CellAlignment = 'left' | 'center' | 'right' | 'justify';

/**
 * Cell formatting options
 */
export interface CellFormat {
  /** Number format string (e.g., "0.00", "0.000E+00", "dd/mm/yyyy") */
  numberFormat?: string;
  /** Font family */
  fontFamily?: string;
  /** Font size in points */
  fontSize?: number;
  /** Font weight */
  fontWeight?: 'normal' | 'bold' | 'lighter' | number;
  /** Text color (hex or RGB) */
  textColor?: string;
  /** Background color (hex or RGB) */
  backgroundColor?: string;
  /** Text alignment */
  alignment?: CellAlignment;
  /** Whether text should wrap */
  wrapText?: boolean;
  /** Number of decimal places for numeric values */
  decimalPlaces?: number;
}

/**
 * Individual cell in the spreadsheet grid
 */
export interface Cell {
  /** Unique cell identifier (e.g., "A1", "B5") */
  id: string;
  /** Row index (0-based) */
  row: number;
  /** Column index (0-based) */
  column: number;
  /** Cell data type */
  dataType: CellDataType;
  /** Display value (formatted string representation) */
  displayValue: string;
  /** Raw value (actual data) */
  rawValue: string | number | boolean | null;
  /** Formula expression (if dataType is 'formula') */
  formula?: string;
  /** Cell formatting */
  format?: CellFormat;
  /** Whether cell is locked (protected) */
  isLocked?: boolean;
  /** Whether cell is hidden */
  isHidden?: boolean;
  /** Reference to measurement data (if dataType is 'measurement') */
  measurementId?: string;
  /** Reference to uncertainty data (if dataType is 'uncertainty') */
  uncertaintyId?: string;
  /** Validation rules */
  validation?: CellValidation;
  /** Comments or notes */
  comment?: string;
  /** Last modified timestamp */
  modifiedAt?: Date;
  /** User who last modified */
  modifiedBy?: string;
}

/**
 * Cell validation rules
 */
export interface CellValidation {
  /** Validation type */
  type: 'number' | 'text' | 'date' | 'list' | 'custom' | 'measurement';
  /** Minimum value (for number/date) */
  min?: number | Date;
  /** Maximum value (for number/date) */
  max?: number | Date;
  /** Allowed values (for list) */
  allowedValues?: string[];
  /** Custom validation formula */
  customFormula?: string;
  /** Error message to display on validation failure */
  errorMessage?: string;
  /** Whether to show warning instead of error */
  isWarning?: boolean;
}

/**
 * Formula definition
 */
export interface Formula {
  /** Unique formula identifier */
  id: string;
  /** Formula expression */
  expression: string;
  /** Cell references used in formula */
  dependencies: string[];
  /** Formula result type */
  resultType: CellDataType;
  /** Whether formula is volatile (recalculates on any change) */
  isVolatile?: boolean;
  /** Formula description/documentation */
  description?: string;
  /** ISO 17025 traceability: method reference */
  methodReference?: string;
}

/**
 * Variable definition for use in formulas
 */
export interface Variable {
  /** Variable name (must be valid identifier) */
  name: string;
  /** Variable value */
  value: number | string | boolean;
  /** Variable type */
  type: 'constant' | 'parameter' | 'calibration' | 'environmental';
  /** Unit of measurement (if applicable) */
  unit?: string;
  /** Variable description */
  description?: string;
  /** ISO 17025 traceability: source/reference */
  source?: string;
  /** Uncertainty associated with variable */
  uncertainty?: number;
  /** Last updated timestamp */
  updatedAt?: Date;
  /** User who last updated */
  updatedBy?: string;
}

/**
 * Audit trail entry for ISO 17025 compliance
 */
export interface AuditTrailEntry {
  /** Unique audit entry identifier */
  id: string;
  /** Action performed */
  action: 'created' | 'modified' | 'approved' | 'rejected' | 'archived' | 'restored' | 'formula-changed' | 'variable-changed';
  /** User who performed the action */
  userId: string;
  /** User display name */
  userName: string;
  /** User email */
  userEmail: string;
  /** Timestamp of action */
  timestamp: Date;
  /** Description of changes */
  description?: string;
  /** Cell or area affected (if applicable) */
  affectedCells?: string[];
  /** Previous value (for modifications) */
  previousValue?: string;
  /** New value (for modifications) */
  newValue?: string;
  /** Reason for change */
  reason?: string;
  /** ISO 17025: Reference to procedure or method */
  procedureReference?: string;
}

/**
 * Spreadsheet Tab
 * Represents a single tab/sheet within a spreadsheet
 */
export interface SpreadsheetTab {
  /** Unique tab identifier */
  id: string;
  /** Tab display name */
  name: string;
  /** Tab order (0-based) */
  order: number;
  /** Cells in this tab */
  cells: Map<string, Cell>;
  /** Column definitions for this tab */
  columnDefinitions?: Map<string, ColumnDefinition>;
  /** Column order for this tab */
  columnOrder?: string[];
  /** Grid dimensions for this tab */
  rowCount: number;
  columnCount: number;
}

/**
 * Spreadsheet metadata
 */
export interface SpreadsheetMetadata {
  /** Spreadsheet title */
  title?: string;
  /** Description */
  description?: string;
  /** Template ID if created from a template */
  templateId?: string;
  /** Template name if created from a template */
  templateName?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Category or classification */
  category?: string;
  /** ISO 17025: Method reference */
  methodReference?: string;
  /** ISO 17025: Equipment used */
  equipmentReferences?: string[];
  /** ISO 17025: Calibration certificate references */
  calibrationReferences?: string[];
  /** Related document IDs */
  relatedDocuments?: string[];
}

/**
 * Main Spreadsheet model
 * Represents a complete spreadsheet document with ISO 17025 compliance
 */
export interface SpreadsheetModel {
  /** Unique spreadsheet identifier */
  id: string;
  /** Spreadsheet name */
  name: string;
  /** Description (optional) */
  description?: string;
  /** Version number (for version control) */
  version: string;
  /** Current status */
  status: SpreadsheetStatus;
  
  /** Creation metadata */
  createdBy: string;
  createdAt: Date;
  
  /** Approval metadata */
  approvedBy?: string;
  approvedAt?: Date;
  
  /** Last modification metadata */
  updatedBy?: string;
  updatedAt?: Date;
  
  /** Grid dimensions (for backward compatibility, use tabs for new spreadsheets) */
  rowCount: number;
  columnCount: number;
  
  /** Tabs map: tabId -> SpreadsheetTab (new multi-tab structure) */
  tabs?: Map<string, SpreadsheetTab>;
  
  /** Tab order (array of tab IDs in display order) */
  tabOrder?: string[];
  
  /** 2D grid of cells (deprecated - use tabs instead, kept for backward compatibility)
   * Access pattern: cells[row][column]
   * Cells are stored in a flat structure keyed by cell ID
   */
  cells?: Map<string, Cell>;
  
  /** Formulas map: formulaId -> Formula */
  formulas: Map<string, Formula>;
  
  /** Variables map: variableName -> Variable */
  variables: Map<string, Variable>;
  
  /** Column definitions (deprecated - use tabs instead, kept for backward compatibility) */
  columnDefinitions?: Map<string, ColumnDefinition>;
  
  /** Column order (deprecated - use tabs instead, kept for backward compatibility) */
  columnOrder?: string[];
  
  /** Audit trail for ISO 17025 traceability */
  auditTrail: AuditTrailEntry[];
  
  /** Additional metadata */
  metadata?: SpreadsheetMetadata;
  
  /** ISO 17025: Revision history */
  revisions?: SpreadsheetRevision[];
  
  /** ISO 17025: Review and approval records */
  reviews?: SpreadsheetReview[];
}

/**
 * Spreadsheet revision for version control
 */
export interface SpreadsheetRevision {
  /** Revision number */
  revision: string;
  /** Revision date */
  date: Date;
  /** User who created revision */
  createdBy: string;
  /** Description of changes */
  description: string;
  /** Reference to previous revision */
  previousRevision?: string;
}

/**
 * Review record for ISO 17025 approval process
 */
export interface SpreadsheetReview {
  /** Review identifier */
  id: string;
  /** Review date */
  date: Date;
  /** Reviewer user ID */
  reviewerId: string;
  /** Reviewer name */
  reviewerName: string;
  /** Review status */
  status: 'pending' | 'approved' | 'rejected' | 'requires-changes';
  /** Review comments */
  comments?: string;
  /** Review outcome */
  outcome?: string;
  /** ISO 17025: Review method/procedure */
  reviewMethod?: string;
}

/**
 * Cell range definition
 */
export interface CellRange {
  /** Starting cell ID */
  startCell: string;
  /** Ending cell ID */
  endCell: string;
  /** Starting row */
  startRow: number;
  /** Starting column */
  startColumn: number;
  /** Ending row */
  endRow: number;
  /** Ending column */
  endColumn: number;
}

/**
 * Column definition for spreadsheet
 * Defines structure, formulas, and validation at the column level
 */
export interface ColumnDefinition {
  /** Column name/header (display name - can have special chars) */
  name: string;
  /** Column value (used in formulas - simple identifier, no special chars) */
  columnValue?: string;
  /** Unit or sub-header (displayed in second header row, e.g., "mV/V", "kg", etc.) */
  unit?: string;
  /** Column type */
  type: 'text' | 'number' | 'boolean' | 'formula' | 'scientific';
  /** Formula expression (if type is 'formula') */
  formula?: string;
  /** Data type for validation */
  dataType?: 'NUMBER' | 'STRING' | 'BOOLEAN' | 'SCIENTIFIC';
  /** Decimal precision */
  precision?: number;
  /** Format mask (e.g., "0.00", "0.000E+00") */
  formatMask?: string;
  /** Validation rules */
  validationRules?: {
    min?: number;
    max?: number;
  };
  /** Conditional formatting rules */
  conditionalFormatting?: any;
  /** Whether column is read-only */
  readOnly?: boolean;
}

/**
 * Spreadsheet template definition
 */
export interface SpreadsheetTemplate {
  /** Template identifier */
  id: string;
  /** Template name */
  name: string;
  /** Template description */
  description?: string;
  /** Template structure (cells, formulas, variables) */
  structure: {
    cells: Cell[];
    formulas: Formula[];
    variables: Variable[];
  };
  /** Template metadata */
  metadata?: SpreadsheetMetadata;
}

/**
 * Helper function to generate cell ID from row and column
 */
export function generateCellId(row: number, column: number): string {
  const columnLetter = String.fromCharCode(65 + (column % 26));
  const columnNumber = Math.floor(column / 26);
  const columnPart = columnNumber > 0 ? String.fromCharCode(64 + columnNumber) + columnLetter : columnLetter;
  return `${columnPart}${row + 1}`;
}

/**
 * Helper function to parse cell ID to row and column
 */
export function parseCellId(cellId: string): { row: number; column: number } {
  const match = cellId.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid cell ID format: ${cellId}`);
  }
  
  const columnStr = match[1];
  const row = parseInt(match[2], 10) - 1;
  
  let column = 0;
  for (let i = 0; i < columnStr.length; i++) {
    column = column * 26 + (columnStr.charCodeAt(i) - 64);
  }
  column -= 1;
  
  return { row, column };
}

/** Default number of rows for new/empty spreadsheets (e.g. before a template is applied). */
export const DEFAULT_SPREADSHEET_ROW_COUNT = 25;

/**
 * Helper function to create empty spreadsheet
 */
export function createEmptySpreadsheet(
  id: string,
  name: string,
  createdBy: string,
  rowCount: number = DEFAULT_SPREADSHEET_ROW_COUNT,
  columnCount: number = 26,
  columnDefinitions?: Map<string, ColumnDefinition>,
  columnOrder?: string[]
): SpreadsheetModel {
  return {
    id,
    name,
    version: '1.0',
    status: 'draft',
    createdBy,
    createdAt: new Date(),
    rowCount,
    columnCount,
    cells: new Map(),
    formulas: new Map(),
    variables: new Map(),
    columnDefinitions: columnDefinitions || new Map(),
    columnOrder: columnOrder || [],
    auditTrail: [
      {
        id: `audit-${Date.now()}`,
        action: 'created',
        userId: createdBy,
        userName: '',
        userEmail: '',
        timestamp: new Date(),
        description: `Spreadsheet "${name}" created`,
      },
    ],
  };
}

/**
 * Get column definition for a column by index
 */
export function getColumnDefinition(
  spreadsheet: SpreadsheetModel,
  columnIndex: number
): ColumnDefinition | undefined {
  if (!spreadsheet.columnDefinitions || !spreadsheet.columnOrder) {
    return undefined;
  }
  
  const columnName = spreadsheet.columnOrder[columnIndex];
  if (!columnName) {
    return undefined;
  }
  
  return spreadsheet.columnDefinitions.get(columnName);
}

/**
 * Get column definition for a column by name
 */
export function getColumnDefinitionByName(
  spreadsheet: SpreadsheetModel,
  columnName: string
): ColumnDefinition | undefined {
  if (!spreadsheet.columnDefinitions) {
    return undefined;
  }
  
  return spreadsheet.columnDefinitions.get(columnName);
}

/**
 * Check if a column is a formula column
 */
export function isFormulaColumn(
  spreadsheet: SpreadsheetModel,
  columnIndex: number
): boolean {
  const colDef = getColumnDefinition(spreadsheet, columnIndex);
  return colDef?.type === 'formula' && !!colDef.formula;
}

/**
 * Get formula for a column (if it's a formula column)
 */
export function getColumnFormula(
  spreadsheet: SpreadsheetModel,
  columnIndex: number
): string | undefined {
  const colDef = getColumnDefinition(spreadsheet, columnIndex);
  return colDef?.formula;
}


