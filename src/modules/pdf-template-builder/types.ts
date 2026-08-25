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
  | 'checkbox'
  | 'chart'
  | 'equipment-table'
  | 'documents-table'
  | 'training-table'
  | 'treb-table'
  | 'record-table';

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
  /** When true, changing width or height in the Properties Panel proportionally adjusts the other dimension. */
  lockAspectRatio?: boolean;
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
  verticalAlign?: 'top' | 'middle' | 'bottom';
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
 * Checkbox element.
 * Renders a square checkbox with an optional label and optional dynamic checked state.
 */
export interface CheckboxElement extends PdfElement {
  type: 'checkbox';
  /** Box size in pt. Default: 10 */
  size?: number;
  /** Static checked state (used when dataSource is absent). Default: false */
  checked?: boolean;
  /** What to draw inside the box when checked. Default: 'checkmark' */
  checkStyle?: 'checkmark' | 'x' | 'filled';
  /** Border colour. Default: #000000 */
  strokeColor?: string;
  /** Border thickness in pt. Default: 0.75 */
  strokeWidth?: number;
  /** Colour of the check mark / fill. Default: #000000 */
  checkColor?: string;
  /** Optional text rendered beside the box */
  label?: string;
  /** Which side the label appears on. Default: 'right' */
  labelPosition?: 'right' | 'left';
  /** Font size for the label text. Default: 9 */
  labelFontSize?: number;
  /** Bold label text. Default: false */
  labelBold?: boolean;
  /** Optional conditional rendering */
  condition?: ConditionalRule;
  /** Optional data source — resolves to a truthy/falsy value to set checked state */
  dataSource?: {
    type: string;
    key: string;
  };
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

/** Training records table column definition */
export interface TrainingTableColumnDef {
  id: string;
  label: string;
  visible?: boolean;
  width?: number;
  align?: 'left' | 'center' | 'right';
  order?: number;
}

/** Training records table element — renders staff training records */
export interface TrainingTableElement extends PdfElement {
  type: 'training-table';
  width?: number;
  height?: number;
  columns: TrainingTableColumnDef[];
  headerStyle?: CellStyle;
  cellStyle?: CellStyle;
  borderColor?: string;
  borderWidth?: number;
  fontSize?: number;
  headerFontSize?: number;
  dataSource?: { type: string; key: string };
  staffUid?: string;
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
 * How a record-table cell/header handles text that still overflows its
 * column after proportional widths, the 36pt minimum, and font-shrink to
 * the 6pt floor have all already been applied (Phase 27 steps 1-3, which
 * run identically regardless of this setting — see `RecordTableElement`'s
 * own doc comment for the full ladder). Phase 28.
 *
 *   - `'ellipsis'`    — one line, truncated with `…` if it still doesn't
 *                       fit. This was Phase 27's ONLY behaviour and remains
 *                       the default, so an element saved before this field
 *                       existed renders unchanged.
 *   - `'wrap'`        — wraps across up to `maxWrapLines` lines (via the
 *                       existing, untouched word-wrap); the last line is
 *                       ellipsis-truncated if there was more text than that.
 *   - `'shrink-only'` — nothing further after font-shrink: the full text is
 *                       drawn on one line at its natural width, which may
 *                       visibly overflow the cell rather than being
 *                       wrapped or truncated.
 */
export type RecordTableOverflowMode = 'ellipsis' | 'wrap' | 'shrink-only';

/**
 * Record table element (ADR-004, ADR-006, ADR-011, Phase 27, Phase 28).
 *
 * Renders a CalibrationRecord's rows against its pinned RecorderTemplate
 * snapshot — the same shape as the on-screen recording grid (one row per
 * calibration point, columns keyed `${sectionId}_${columnId}`, sections as a
 * spanning header row above the column headers). Bound implicitly to
 * `jobData.record` (the CalibrationRecord) and `jobData.recordTemplate` (its
 * pinned RecorderTemplate snapshot) at render time — not via `dataSource`,
 * the same way `equipment-table` binds implicitly to `jobData.equipment`.
 *
 * Column count is NOT authored: the column set varies per template (ADR-006
 * — rounds are ordinary columns) and isn't known until the actual bound
 * record's pinned snapshot is available at render time. Column WIDTHS are
 * computed at render time too, by `computeRecordTableLayout`
 * (`renderRecordTable.ts`) — the full ladder, in order, run identically for
 * every cell regardless of `overflowMode`:
 *
 *   1. Proportional widths from each column's natural content width
 *   2. A 36pt minimum column width floor, once widths don't fit `width`
 *   3. Font-shrink toward a 6pt floor — ALWAYS, in every `overflowMode`;
 *      shrinking often makes text fit with no loss at all, so an author's
 *      overflow choice governs only what's left AFTER shrink, not whether
 *      shrink happens
 *   4. Whatever still overflows is handled per `overflowMode` (see that
 *      type's own doc comment)
 *   5. If a column would still fall below the 36pt floor, it renders AT
 *      36pt anyway and the table overflows `width` rather than the column
 *      shrinking further — flagged at authoring time in the Properties
 *      Panel, never silently producing character-per-line output
 *
 * Never fixed per-column x positions or widths (ADR-004).
 */
export interface RecordTableElement extends PdfElement {
  type: 'record-table';
  width?: number;
  height?: number;
  /**
   * Authoring-time only — which RecorderTemplate the Properties Panel used
   * to build the section/column checklists below. NOT used by the renderer
   * (which always reads sections/columns from whatever pinned snapshot is
   * passed in via `jobData.recordTemplate`, per ADR-005) — purely so
   * reopening the panel remembers the picker's selection instead of showing
   * an empty checklist.
   */
  recorderTemplateId?: string;
  /**
   * Ordered list of section ids this element renders — one element per
   * section is the common authoring pattern, stacked down the page (Phase
   * 27). Semantics (Phase 29: `undefined` and `[]` are NOT the same value —
   * conflating them was the reported bug where deselecting the last section
   * silently re-selected every section):
   *   - `undefined` (the field absent) = every section, in template order
   *     — the only meaning for templates authored before this field
   *     existed, and unchanged behaviour for them.
   *   - `[]` = explicitly NO sections selected. The element renders
   *     nothing. This is a real, intentional state, not a fallback.
   *   - Any other array filters WHICH sections appear, in the ORDER given
   *     here (not necessarily template order) — `columns` below then
   *     narrows WITHIN the surviving sections.
   *   - A section id with no match in the record's pinned snapshot is
   *     skipped silently, not an error: a template can be revised after a
   *     record pins it (ADR-005), and the pinned snapshot is authoritative.
   *     (The Properties Panel separately warns about this at authoring
   *     time against the LIVE template, since an id that's merely absent
   *     from the live template may still be present on older pinned
   *     records — Phase 29 Task 2.)
   *   - If the section+column filter leaves zero columns, the element
   *     renders nothing (no empty grid).
   */
  sections?: string[];
  /**
   * Ordered list of `${sectionId}_${columnId}` keys to include, applied
   * AFTER the `sections` filter above. Same `undefined` (= every column
   * from the surviving sections) vs `[]` (= explicitly none) distinction as
   * `sections` — see that field's doc comment (Phase 29).
   */
  columns?: string[];
  /** Render the section-grouping header row above the column-header row. Default true. */
  showSectionHeaders?: boolean;
  headerStyle?: CellStyle;
  sectionHeaderStyle?: CellStyle;
  cellStyle?: CellStyle;
  borderColor?: string;
  borderWidth?: number;
  fontSize?: number;
  headerFontSize?: number;
  sectionHeaderFontSize?: number;
  /**
   * How text still overflowing after width/font-shrink is handled — see
   * `RecordTableOverflowMode`'s own doc comment for the full ladder.
   * Omitted = `'ellipsis'` (Phase 27's original, only behaviour), so an
   * element saved before Phase 28 renders unchanged.
   */
  overflowMode?: RecordTableOverflowMode;
  /**
   * `'wrap'` mode only. Clamped to a sane range (see
   * `clampRecordTableMaxWrapLines` in `renderRecordTable.ts`) and defaults
   * to 3 when omitted or out of range.
   */
  maxWrapLines?: number;
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
 * Which module a template belongs to.
 * Templates in the selector are filtered to the calling module's scope.
 * 'global' means the template appears in all selectors (backward-compatible default).
 */
export type PdfTemplateScope = 'jobs' | 'customers' | 'documents' | 'global' | 'staff' | 'equipment' | 'calibrationRecords';

/**
 * PDF template structure
 */
export interface PdfTemplate {
  id?: string;
  name: string;
  description?: string;
  /** Which module this template belongs to. Defaults to 'global' for backward compatibility. */
  scope?: PdfTemplateScope;
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
  type: 'text' | 'number' | 'date' | 'image' | 'boolean';
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

/**
 * Exhaustiveness helper.
 * Use as the `default` branch of a switch over PdfElementType:
 *
 *   default: assertNever(element.type);
 *
 * TypeScript will emit a compile error if any element type is not handled,
 * so adding a new type to PdfElementType forces every switch to be updated.
 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled element type: ${String(x)}`);
}

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

export const TRAINING_TABLE_DEFAULT_COLUMNS: ReadonlyArray<{ id: string; label: string; defaultWidth: number }> = [
  { id: 'staffName', label: 'Staff Name', defaultWidth: 90 },
  { id: 'courseName', label: 'Course / Training Topic', defaultWidth: 140 },
  { id: 'trainingFormat', label: 'Format', defaultWidth: 70 },
  { id: 'organizer', label: 'Organizer', defaultWidth: 90 },
  { id: 'duration', label: 'Duration', defaultWidth: 50 },
  { id: 'completionDate', label: 'Completion Date', defaultWidth: 70 },
  { id: 'status', label: 'Status', defaultWidth: 55 },
];

