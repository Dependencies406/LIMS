/**
 * PDF Template Builder Types
 * Data models for the PDF template builder (replaces old PDF settings)
 */

/**
 * PDF element types
 */
export type PdfElementType =
  | 'text'
  | 'line'
  | 'rectangle'
  | 'image'
  | 'chart'
  | 'equipment-table'
  | 'documents-table'
  | 'treb-table';

/** How an element participates in template-page overflow / continuation pages. Default: tables behave as dynamic when omitted (see renderer). */
export type PdfElementOverflowRole = 'static' | 'dynamic';
export type PdfElementPaginationMode = 'static' | 'dynamic';

/**
 * Data source for PDF elements
 */
export interface PdfElementDataSource {
  type: string; // e.g., 'certificate.title', 'equipment.name', 'static'
  key: string; // Data source key
  [key: string]: any; // Additional properties
}

/**
 * Base PDF element
 */
export interface PdfElement {
  id: string;
  type: PdfElementType;
  x: number;
  y: number;
  width?: number; // For rectangle and image
  height?: number; // For rectangle and image
  /** When set, controls overflow pagination (continuation pages for the same template page). */
  overflowRole?: PdfElementOverflowRole;
  /** New overflow control. Backward-compatible with overflowRole. */
  paginationMode?: PdfElementPaginationMode;
  /** Repaint full element on continuation pages when this element itself has no remaining slice. */
  repeatOnOverflowPages?: boolean;
  /** Optional ordering hint when multiple dynamic elements share a page. Lower draws/plans first. */
  overflowPriority?: number;
  dataSource?: PdfElementDataSource;
  [key: string]: any; // Type-specific properties
}

/**
 * Text element
 */
export interface TextElement extends PdfElement {
  type: 'text';
  font?: string;
  fontSize?: number;
  fontWeight?: number | string; // 100-900 or 'normal', 'bold'
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  letterSpacing?: number;
  lineHeight?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  staticText?: string; // For static text without datasource
  dataSource?: {
    type: string;
    key: string;
    staticText?: string; // For static text
  };
  // Conditional rendering
  condition?: ConditionalRule;
  // Formatting
  dateFormat?: string;
  numberFormat?: string;
}

/**
 * Line element
 */
export interface LineElement extends PdfElement {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  width?: number;
}

/**
 * Rectangle element
 */
export interface RectangleElement extends PdfElement {
  type: 'rectangle';
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

/**
 * Image element
 */
export interface ImageElement extends PdfElement {
  type: 'image';
  imageUrl?: string; // Direct image URL for standalone images
  imagePath?: string; // Direct image path for standalone images
  dataSource?: {
    type: string;
    key: string; // e.g., 'logo', 'signature'
    path?: string;
    url?: string;
  };
  maintainAspect?: boolean;
  fitMode?: 'contain' | 'cover' | 'fill';
  condition?: ConditionalRule;
}

/**
 * Chart element (e.g. scatter, line, bar from spreadsheet or table data).
 * Rendered as an image in the PDF (data source can reference spreadsheet range or table key).
 */
export interface ChartElement extends PdfElement {
  type: 'chart';
  chartType?: 'scatter' | 'line' | 'bar' | 'column';
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  dataSource?: {
    type: 'chart';
    key: string; // e.g. 'equipment.measurements', 'spreadsheet.range'
    range?: string; // Optional range ref for spreadsheet (e.g. 'A1:B10')
  };
  condition?: ConditionalRule;
}

/**
 * Column definition for equipment table (PDF template).
 * Data source is always job.equipment; user configures visibility, order, alignment, width.
 */
export interface EquipmentTableColumnDef {
  id: string;           // Field key on Equipment (e.g. 'name', 'serialNumber')
  label: string;        // Fixed header label (e.g. 'Name', 'Serial Number')
  visible: boolean;
  width: number;        // Fixed width in pt
  align: 'left' | 'center' | 'right';
  order: number;        // Display order (0-based)
}

/**
 * Equipment table element.
 * Displays job.equipment as a table (one row per equipment). Columns are configurable.
 */
export interface EquipmentTableElement extends PdfElement {
  type: 'equipment-table';
  width?: number;
  height?: number;
  columns: EquipmentTableColumnDef[];
  headerStyle?: CellStyle;
  cellStyle?: CellStyle;
  borderColor?: string;
  borderWidth?: number;
  fontSize?: number;
  headerFontSize?: number;
}

/** Column definition for documents index table (PDF). Same shape as equipment columns for builder UX. */
export interface DocumentsTableColumnDef {
  id: string;
  label: string;
  visible: boolean;
  width: number;
  align: 'left' | 'center' | 'right';
  order: number;
}

/**
 * Renders full document_index list (documentIndexService.list order) in a bounded table.
 */
export interface DocumentsTableElement extends PdfElement {
  type: 'documents-table';
  width?: number;
  height?: number;
  columns: DocumentsTableColumnDef[];
  headerStyle?: CellStyle;
  cellStyle?: CellStyle;
  borderColor?: string;
  borderWidth?: number;
  fontSize?: number;
  headerFontSize?: number;
  dataSource?: { type: string; key: string };
}

/**
 * TREB table element.
 * Renders data from a @trebco/treb spreadsheet tab; data is supplied via jobData.trebDataRegistry[sourceTabId].
 */
export interface TrebTableElement extends PdfElement {
  type: 'treb-table';
  spreadsheetTemplateId: string;
  sourceTabId: string;
  renderRange?: string; // Optional range like 'A1:F15' to limit what gets rendered
  width?: number;
  height?: number;
  fontSize?: number;
  borderColor?: string;
  borderWidth?: number;
}

/**
 * Cell style for charts (and legacy table references in saved templates)
 */
export interface CellStyle {
  font?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  backgroundColor?: string;
  align?: 'left' | 'center' | 'right';
  decimalPlaces?: number; // Number of decimal places for numeric values
}


/**
 * Conditional rendering rule
 */
export interface ConditionalRule {
  field: string; // Data source key to check
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'empty' | 'notEmpty';
  value?: any; // Value to compare against
  logic?: 'AND' | 'OR'; // For multiple conditions
  conditions?: ConditionalRule[]; // Nested conditions
}

/** Page orientation for PDF templates */
export type PageOrientation = 'portrait' | 'landscape';

/**
 * PDF template structure
 */
export interface PdfTemplate {
  id?: string;
  name: string;
  description?: string;
  pageSize: 'A4' | 'Letter' | 'A3' | 'A5';
  /** Page orientation (portrait or landscape). Default: portrait */
  orientation?: PageOrientation;
  pagePattern?: 'number' | 'page-number' | 'page-of-total'; // Page numbering pattern: X, Page X, or Page X of Y
  backgroundPdf?: string; // Path or URL to background PDF
  elements: PdfElement[];
  pages?: PdfPage[]; // Multi-page support
  metadata?: {
    author?: string;
    createdAt?: string;
    updatedAt?: string;
    version?: number;
  };
  // Grid settings
  gridEnabled?: boolean;
  gridSize?: number; // Grid spacing in pixels
  snapToGrid?: boolean;
}

/**
 * PDF page (for multi-page support)
 */
export interface PdfPage {
  id: string;
  pageNumber: number;
  pageSize: 'A4' | 'Letter' | 'A3' | 'A5';
  /** Page orientation (portrait or landscape). Default: portrait */
  orientation?: PageOrientation;
  elements: PdfElement[];
  backgroundPdf?: string;
}

/**
 * Data source discovery result
 */
export interface DataSourceItem {
  key: string;
  label: string;
  description?: string;
  category: string;
  type: 'text' | 'number' | 'date' | 'image';
}

/** Default column definitions for equipment table (id, label, default width in pt). Order defines initial display order. */
export const EQUIPMENT_TABLE_DEFAULT_COLUMNS: ReadonlyArray<{ id: string; label: string; defaultWidth: number }> = [
  { id: 'no', label: 'No.', defaultWidth: 28 },
  { id: 'name', label: 'Name', defaultWidth: 80 },
  { id: 'manufacturer', label: 'Manufacturer', defaultWidth: 70 },
  { id: 'model', label: 'Model', defaultWidth: 70 },
  { id: 'serialNumber', label: 'Serial Number', defaultWidth: 75 },
  { id: 'calibrationPoint', label: 'Calibration Point', defaultWidth: 80 },
  { id: 'calibrationMethods', label: 'Calibration Methods', defaultWidth: 85 },
  { id: 'accessories', label: 'Accessories', defaultWidth: 70 },
  { id: 'machineLocation', label: 'Machine Location', defaultWidth: 75 },
  { id: 'remark', label: 'Remark', defaultWidth: 70 },
  { id: 'certificateNumber', label: 'Certificate Number', defaultWidth: 90 },
];

/** Default columns for documents-table (tags excluded per product spec). */
export const DOCUMENTS_TABLE_DEFAULT_COLUMNS: ReadonlyArray<{ id: string; label: string; defaultWidth: number }> = [
  { id: 'documentCode', label: 'Document Code', defaultWidth: 72 },
  { id: 'type', label: 'Type', defaultWidth: 80 },
  { id: 'revisionNumber', label: 'Rev', defaultWidth: 28 },
  { id: 'documentName', label: 'Document Name', defaultWidth: 120 },
  { id: 'effectiveDate', label: 'Effective Date', defaultWidth: 72 },
  { id: 'darNumber', label: 'DAR Number', defaultWidth: 52 },
  { id: 'source', label: 'Source', defaultWidth: 90 },
  { id: 'darSource', label: 'DAR Source', defaultWidth: 90 },
];

