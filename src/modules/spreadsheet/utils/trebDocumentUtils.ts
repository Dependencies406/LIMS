// @ts-nocheck
/**
 * Utilities for TREB document handling (e.g. strip locked so templates are editable).
 */

import type { TREBDocument } from '@trebco/treb';
import type { SpreadsheetModel, SpreadsheetTab, Cell, CellDataType } from '../models/SpreadsheetModel';
import { generateCellId } from '../models/SpreadsheetModel';

/** Selection shape from TREB GetSelectionReference(): area.start/end, optional empty. */
export interface TrebSelectionArea {
  empty?: boolean;
  area?: {
    start: { row: number; column: number };
    end: { row: number; column: number };
  };
}

/**
 * Returns true if the given selection area contains any cell that has locked style
 * in the TREB document. Use to block Delete/Backspace (and similar) when selection
 * includes locked cells. Considers cell_styles, sheet_style.locked, row_style, and column_style.
 */
export function selectionAreaContainsLockedCell(
  doc: TREBDocument,
  selection: TrebSelectionArea,
  activeSheetIndex?: number
): boolean {
  if (selection.empty || !selection.area) return false;
  const sheets = normalizeSheetArray((doc as any).sheet_data);
  const idx = activeSheetIndex ?? (typeof (doc as any).active_sheet === 'number' ? (doc as any).active_sheet : 0);
  const sheet = sheets[Math.max(0, idx)];
  if (!sheet || typeof sheet !== 'object') return false;

  // Whole-sheet locked (e.g. template protection)
  if (sheet.sheet_style && typeof sheet.sheet_style === 'object' && (sheet.sheet_style as any).locked) {
    return true;
  }

  const styles = sheet.styles || sheet.cell_style_refs || [];
  const cellStyles = Array.isArray(sheet.cell_styles) ? sheet.cell_styles : [];
  const lockedSet = new Set<string>();
  for (const entry of cellStyles) {
    const style = (entry as any).style ?? styles[(entry as any).ref];
    if (style && (style as any).locked) {
      lockedSet.add(`${(entry as any).row},${(entry as any).column}`);
    }
  }
  const rowStyle = sheet.row_style && typeof sheet.row_style === 'object' ? (sheet.row_style as Record<string, { locked?: boolean }>) : null;
  const colStyle = sheet.column_style && typeof sheet.column_style === 'object' ? (sheet.column_style as Record<string, { locked?: boolean }>) : null;

  const start = selection.area.start;
  const end = selection.area.end;
  const r0 = Math.min(start.row, end.row);
  const r1 = Math.max(start.row, end.row);
  const c0 = Math.min(start.column, end.column);
  const c1 = Math.max(start.column, end.column);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (lockedSet.has(`${r},${c}`)) return true;
      if (rowStyle && rowStyle[r] && (rowStyle[r] as any).locked) return true;
      if (colStyle && colStyle[c] != null && (colStyle[c] as any).locked) return true;
    }
  }
  return false;
}

/** Extract flat { row, column, value } from a TREB sheet's data array. */
function extractSheetCells(sheet: any): Array<{ row: number; column: number; value: unknown }> {
  const out: Array<{ row: number; column: number; value: unknown }> = [];
  const arr = Array.isArray(sheet?.data) ? sheet.data : [];
  for (const entry of arr) {
    if (typeof entry?.row === 'number' && typeof entry?.column === 'number') {
      out.push({ row: entry.row, column: entry.column, value: entry.value });
      continue;
    }
    if (typeof entry?.row === 'number' && Array.isArray(entry.cells)) {
      for (const c of entry.cells) {
        if (typeof c?.column === 'number') out.push({ row: entry.row, column: c.column, value: c.value });
      }
      continue;
    }
    if (typeof entry?.column === 'number' && Array.isArray(entry.cells)) {
      for (const c of entry.cells) {
        if (typeof c?.row === 'number') out.push({ row: c.row, column: entry.column, value: c.value });
      }
    }
  }
  return out;
}

/** Get value at (row, col) from TREB sheet.data array. Returns undefined if not found. */
function getCellValueInSheetData(data: any[], row: number, column: number): unknown {
  if (!Array.isArray(data)) return undefined;
  const flat = data.length > 0 && typeof data[0]?.row === 'number' && typeof data[0]?.column === 'number';
  if (flat) {
    const entry = data.find((e: any) => e.row === row && e.column === column);
    return entry?.value;
  }
  const rowEntry = data.find((e: any) => e.row === row);
  if (!rowEntry?.cells) return undefined;
  const cell = rowEntry.cells.find((c: any) => c.column === column);
  return cell?.value;
}

/** True if the cell at (row, col) in sheet data is a formula (value starts with '=' or has formula property). */
function templateCellIsFormula(data: any[], row: number, column: number): boolean {
  if (!Array.isArray(data)) return false;
  const flat = data.length > 0 && typeof data[0]?.row === 'number' && typeof data[0]?.column === 'number';
  if (flat) {
    const entry = data.find((e: any) => e.row === row && e.column === column);
    if (!entry) return false;
    return !!(entry.formula ?? (typeof entry.value === 'string' && entry.value.startsWith('=')));
  }
  const rowEntry = data.find((e: any) => e.row === row);
  if (!rowEntry?.cells) return false;
  const cell = rowEntry.cells.find((c: any) => c.column === column);
  if (!cell) return false;
  return !!(cell.formula ?? (typeof cell.value === 'string' && cell.value.startsWith('=')));
}

/** Set value at (row, col) in cloned TREB sheet.data (mutates in place). Handles flat and row-nested formats. */
function setCellValueInSheetData(data: any[], row: number, column: number, value: unknown): void {
  if (!Array.isArray(data)) return;
  const flat = data.length > 0 && typeof data[0]?.row === 'number' && typeof data[0]?.column === 'number';
  if (flat) {
    const entry = data.find((e: any) => e.row === row && e.column === column);
    if (entry) entry.value = value;
    else data.push({ row, column, value });
    return;
  }
  let rowEntry = data.find((e: any) => e.row === row);
  if (!rowEntry) {
    rowEntry = { row, cells: [] };
    data.push(rowEntry);
  }
  const cells = rowEntry.cells || (rowEntry.cells = []);
  let cell = cells.find((c: any) => c.column === column);
  if (cell) cell.value = value;
  else cells.push({ column, value });
}

function normalizeSheetArray(sheetData: unknown): any[] {
  if (!sheetData) return [];
  if (Array.isArray(sheetData)) return sheetData;
  // Firestore or JSON can return array-like as object with numeric keys { "0": s0, "1": s1 }
  if (typeof sheetData === 'object' && sheetData !== null) {
    const obj = sheetData as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
    if (keys.length > 0) {
      return keys.map((k) => obj[k]);
    }
  }
  return [sheetData];
}

const KNOWN_DISPLAY_KEYS = [
  'calculated', 'result', 'display_value', 'displayValue', 'rendered_value', 'rendered',
  'text', 'formatted_value', 'formatted', 'content', 'formattedValue',
];

/** Keys to prefer for "what the user sees" (display/formatted first, then fallback to calculated/value). */
const DISPLAY_FIRST_KEYS = [
  'display_value', 'displayValue', 'formatted_value', 'formatted', 'text',
  'rendered_value', 'rendered', 'content', 'formattedValue', 'calculated', 'result',
];

/** Debug flag for TREB cell/style logging used during PDF fidelity work. Leave false unless investigating. */
const DEBUG_TREB_LOG = false;

/**
 * Format a number using a simple TREB/Excel-style format string (e.g. 0.00, 0.0, #,##0.00, General).
 * Generic algorithm (no sheet/tab/row specifics):
 * - Take first section before ';'
 * - Strip decorations ([Red], "text", currency symbols, %, etc.).
 * - If there's a decimal point, count 0s after it ⇒ decimals; use n.toFixed(decimals).
 * - Else if there's at least one 0 ⇒ round to integer.
 * - Else fallback to String(n).
 */
function formatNumberByFormat(n: number, format: string | undefined): string {
  if (format == null || typeof format !== 'string') return String(n);
  const fmt = format.trim();
  if (fmt === '' || fmt.toLowerCase() === 'general') return String(n);
  if (Number.isNaN(n)) return '';
  const mainSection = fmt.split(';')[0] ?? fmt;
  // Remove [conditions], [colors], quoted text, and everything except digits, #, 0, comma, dot
  const stripped = mainSection
    .replace(/\[[^\]]*]/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/[^0#.,]/g, '')
    .trim();
  if (!stripped) return String(n);
  const decMatch = stripped.match(/\.(0+)/);
  const decimals = decMatch ? decMatch[1].length : 0;
  if (decimals > 0) return n.toFixed(decimals);
  const hasZero = /0/.test(stripped);
  if (hasZero) return Math.round(n).toString();
  return String(n);
}

/**
 * Return the display value for a TREB cell entry (what the user sees).
 * Rule: prefer display/formatted fields; if formula and display is empty, return ''; else format number if number_format present; else use raw calculated/value.
 * Generic: no sheet name or row/column index.
 */
export function getDisplayValueForCell(entry: any, sheet?: any): string | number {
  if (entry == null) return '';
  const v = entry.value ?? entry.v;
  const isFormula = typeof v === 'string' && String(v).trim().startsWith('=');

  if (
    DEBUG_TREB_LOG &&
    (import.meta.env?.DEV) &&
    typeof (entry as any)?.row === 'number' &&
    typeof (entry as any)?.column === 'number'
  ) {
    const idx = (entry as any).style_ref;
    const styleFromStyles = sheet?.styles && idx != null ? sheet.styles[idx] : undefined;
    console.log('[TREB number_format]', sheet?.name ?? '', `${(entry as any).row},${(entry as any).column}`, {
      number_format: (entry as any).number_format,
      numberFormat: (entry as any).numberFormat,
      style_ref: idx,
      styleFromStyles,
      keys: Object.keys(entry),
    });
  }

  let display: string | number | undefined;
  for (const k of DISPLAY_FIRST_KEYS) {
    const val = entry[k];
    if (val !== undefined && val !== null && val !== '') {
      const s = typeof val === 'string' ? val.trim() : val;
      if (s !== '') {
        display = typeof val === 'number' ? val : String(val);
        break;
      }
    }
  }

  if (isFormula && (display === undefined || display === null || String(display).trim() === '')) {
    return '';
  }
  if (display !== undefined && display !== null && String(display).trim() !== '') {
    return typeof display === 'number' ? display : String(display);
  }

  const num = entry.calculated ?? entry.result ?? (typeof v === 'number' && !Number.isNaN(v) ? v : undefined);
  const numberFormat =
    entry.number_format ?? entry.numberFormat ??
    (sheet?.styles && entry.style_ref != null ? sheet.styles[entry.style_ref]?.number_format : undefined) ??
    (sheet?.sheet_style?.number_format);
  if (num !== undefined && num !== null && typeof num === 'number' && !Number.isNaN(num) && numberFormat) {
    return formatNumberByFormat(num, numberFormat);
  }
  if (num !== undefined && num !== null && num !== '') {
    return typeof num === 'number' ? num : String(num);
  }
  if (!isFormula && v !== undefined && v !== null && v !== '') {
    return typeof v === 'number' ? v : String(v);
  }
  return '';
}

/**
 * Pick the best display value from a TREB cell entry (flat or nested in column/row-based sheet.data).
 * SerializeDocument({ rendered_values: true }) may put the displayed value in known keys or any other property.
 */
function pickRenderedValue(entry: any): { value: unknown; calculated: unknown } {
  const v = entry?.value ?? entry?.v;
  let calculated: unknown;
  for (const k of KNOWN_DISPLAY_KEYS) {
    const val = entry?.[k];
    if (val !== undefined && val !== null && val !== '') {
      calculated = val;
      break;
    }
  }
  if (calculated === undefined && entry != null && typeof entry === 'object') {
    for (const k of Object.keys(entry)) {
      if (k === 'row' || k === 'column' || k === 'value' || k === 'v' || k === 'formula') continue;
      const val = entry[k];
      if (typeof val === 'string' && (val as string).trim().startsWith('=')) continue;
      if (typeof val === 'number' || (typeof val === 'string' && (val as string).length > 0)) {
        calculated = val;
        break;
      }
    }
  }
  const isFormulaLike = typeof v === 'string' && (v as string).trim().startsWith('=');
  const valueForDisplay = calculated ?? (typeof v === 'number' || (typeof v === 'string' && !isFormulaLike) ? v : undefined);
  return { value: v, calculated: valueForDisplay ?? calculated };
}

/** Extracted cell with optional explicit display value from pickRenderedValue (for nested TREB cells). */
type ExtractedCell = {
  row: number;
  column: number;
  value: unknown;
  calculated?: unknown;
  /** When set, use this as cell.displayValue so nested cells get correct display (e.g. from display_value, text). */
  renderedDisplayValue?: string;
};

/** Extract cells from a TREB sheet including value and calculated/result (for formula display). Uses getDisplayValueForCell so display/formatted and blank-formula rules apply. */
function extractSheetCellsWithCalculated(sheet: any): ExtractedCell[] {
  const out: ExtractedCell[] = [];
  const arr = Array.isArray(sheet?.data) ? sheet.data : [];
  const sheetName = sheet?.name ?? '';
  for (const entry of arr) {
    if (typeof entry?.row === 'number' && typeof entry?.column === 'number') {
      const { value, calculated } = pickRenderedValue(entry);
      const displayVal = getDisplayValueForCell(entry, sheet);
      const renderedDisplayValue = displayVal === '' ? '' : (displayVal != null ? String(displayVal) : undefined);
      if (DEBUG_TREB_LOG && import.meta.env?.DEV && entry.row <= 2 && entry.column <= 5) {
        console.log('[TREB cells]', sheetName, `${entry.row},${entry.column}`, {
          rawCell: entry,
          value: entry?.value,
          calculated: entry?.calculated,
          display_value: (entry as any)?.display_value ?? (entry as any)?.displayValue,
          formatted_value: (entry as any)?.formatted_value ?? (entry as any)?.formatted,
          style_ref: (entry as any)?.style_ref,
          getDisplayValueForCell: displayVal,
        });
      }
      out.push({ row: entry.row, column: entry.column, value, calculated, renderedDisplayValue });
      continue;
    }
    if (typeof entry?.row === 'number' && Array.isArray(entry.cells)) {
      for (const c of entry.cells) {
        if (typeof c?.column === 'number') {
          const { value, calculated } = pickRenderedValue(c);
          const displayVal = getDisplayValueForCell(c, sheet);
          const renderedDisplayValue = displayVal === '' ? '' : (displayVal != null ? String(displayVal) : undefined);
          if (DEBUG_TREB_LOG && import.meta.env?.DEV && entry.row <= 2 && c.column <= 5) {
            console.log('[TREB cells]', sheetName, `${entry.row},${c.column}`, {
              rawCell: c,
              getDisplayValueForCell: displayVal,
            });
          }
          out.push({ row: entry.row, column: c.column, value, calculated, renderedDisplayValue });
        }
      }
      continue;
    }
    if (typeof entry?.column === 'number' && Array.isArray(entry.cells)) {
      for (const c of entry.cells) {
        if (typeof c?.row === 'number') {
          const { value, calculated } = pickRenderedValue(c);
          const displayVal = getDisplayValueForCell(c, sheet);
          const renderedDisplayValue = displayVal === '' ? '' : (displayVal != null ? String(displayVal) : undefined);
          if (DEBUG_TREB_LOG && import.meta.env?.DEV && c.row <= 2 && entry.column <= 5) {
            console.log('[TREB cells]', sheetName, `${c.row},${entry.column}`, { rawCell: c, getDisplayValueForCell: displayVal });
          }
          out.push({ row: c.row, column: entry.column, value, calculated, renderedDisplayValue });
        }
      }
    }
  }
  return out;
}

function getCellTypeFromValue(value: unknown, formula?: string): CellDataType {
  if (formula) return 'formula';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'text';
}

/**
 * Convert a TREB document to a SpreadsheetModel. Use this as the single source of truth for PDF table
 * data: trebDocument → model → evaluateSpreadsheet → 2D grid. Preserves formulas and uses
 * calculated/result when present (e.g. from TREB runtime); otherwise formula cells get displayValue
 * from evaluation.
 */
export function trebDocumentToSpreadsheetModel(doc: TREBDocument): SpreadsheetModel {
  const sheets = normalizeSheetArray((doc as any).sheet_data);
  const userData = (doc as any).user_data as { sheets?: Record<string, { columnOrder?: string[]; columnCount?: number; rowCount?: number }> } | undefined;
  const sheetMeta = userData?.sheets || {};
  const tabOrder: string[] = [];
  const tabs = new Map<string, SpreadsheetTab>();

  sheets.forEach((sheet: any, index: number) => {
    const tabId = `sheet-${index + 1}`;
    const cellsArr = extractSheetCellsWithCalculated(sheet);
    const maxRow = cellsArr.reduce((acc, c) => Math.max(acc, c.row), 0);
    const maxCol = cellsArr.reduce((acc, c) => Math.max(acc, c.column), 0);
    const sheetName = sheet?.name || `Sheet${index + 1}`;
    if (DEBUG_TREB_LOG && import.meta.env?.DEV) {
      console.log('[TREB styles]', sheetName, {
        styles: sheet?.styles,
        row_style: sheet?.row_style,
        column_style: sheet?.column_style,
        sheet_style: sheet?.sheet_style,
      });
      for (let r = 0; r <= 2; r++) {
        for (let col = 0; col <= 5; col++) {
          console.log('[TREB styles]', sheetName, `${r},${col}`, {
            row: r,
            column: col,
            rowStyle: sheet?.row_style?.[r],
            colStyle: sheet?.column_style?.[col],
            sheetStyle: sheet?.sheet_style,
          });
        }
      }
    }
    const meta = sheetMeta[sheetName];
    const rowCount = Math.max(sheet?.rows ?? 0, meta?.rowCount ?? 0, maxRow + 1, 1);
    const columnCount = Math.max(sheet?.columns ?? 0, meta?.columnCount ?? 0, maxCol + 1, 1);
    const columnOrder = meta?.columnOrder || Array.from({ length: columnCount }, (_, i) => String.fromCharCode(65 + i));

    const tabCells = new Map<string, Cell>();
    cellsArr.forEach(({ row, column, value, calculated, renderedDisplayValue }) => {
      const cellId = generateCellId(row, column);
      const isFormula = typeof value === 'string' && (value as string).trim().startsWith('=');
      const formula = isFormula ? (value as string).slice(1).trim() : undefined;
      const rawValue = isFormula ? null : (value as string | number | boolean | null);
      const computed = calculated !== undefined && calculated !== null && calculated !== '' ? calculated : null;
      const fromRaw = rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== '' ? String(rawValue) : '';
      const fromComputed = computed !== null ? String(computed) : '';
      const displayValue =
        renderedDisplayValue !== undefined
          ? renderedDisplayValue
          : isFormula
            ? fromComputed
            : (fromRaw || fromComputed);

      tabCells.set(cellId, {
        id: cellId,
        row,
        column,
        dataType: getCellTypeFromValue(rawValue, formula),
        rawValue,
        formula,
        displayValue,
      });
    });

    tabOrder.push(tabId);
    tabs.set(tabId, {
      id: tabId,
      name: sheetName,
      order: index,
      cells: tabCells,
      columnDefinitions: new Map(),
      columnOrder,
      rowCount,
      columnCount,
    });
  });

  const firstTab = tabOrder.length > 0 ? tabs.get(tabOrder[0]) : undefined;
  return {
    id: 'pdf-treb',
    name: (doc as any).name || 'Spreadsheet',
    version: '1.0',
    status: 'draft',
    createdBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: 'system',
    rowCount: firstTab?.rowCount ?? 50,
    columnCount: firstTab?.columnCount ?? 26,
    tabs,
    tabOrder,
    cells: firstTab?.cells ?? new Map(),
    formulas: new Map(),
    variables: new Map(),
    columnDefinitions: firstTab?.columnDefinitions ?? new Map(),
    columnOrder: firstTab?.columnOrder ?? [],
    auditTrail: [],
  } as SpreadsheetModel;
}

/**
 * Long date display: "Mar 02, 2026" (no weekday).
 * The "Long Date" option in the spreadsheet toolbar comes from the TREB library
 * (node_modules/@trebco/treb/dist/treb-spreadsheet.mjs). TREB uses a format that
 * includes dddd (e.g. "Tuesday, Mar 3 2026"). We don't define that format in our
 * codebase; we overwrite any number_format containing dddd here so cells show
 * "mmm dd, yyyy" instead.
 */
const LONG_DATE_FORMAT = 'mmm dd, yyyy';

/** True if format string looks like date+time (so formula bar would show time). */
function isDateTimeFormat(fmt: string): boolean {
  const t = fmt.trim();
  return (
    /dddd/i.test(t) ||
    /\b[hH]{1,2}\b/.test(t) ||
    /:[mM]{1,2}\b/.test(t) ||
    /:[sS]{1,2}\b/.test(t) ||
    /\bAM\b|\bPM\b/i.test(t)
  );
}

/** If style has number_format with weekday (dddd) or time, set to date-only so F2/formula bar shows date only. */
function fixLongDateFormatInStyle(style: any): void {
  if (!style || typeof style !== 'object') return;
  const fmt = style.number_format;
  if (typeof fmt === 'string' && isDateTimeFormat(fmt)) {
    style.number_format = LONG_DATE_FORMAT;
  }
}

/** True if format string is date-like (d/m/y tokens). */
function isDateLikeFormat(fmt: string | undefined): boolean {
  if (!fmt || typeof fmt !== 'string') return false;
  const t = fmt.trim();
  return /[dDyYmM]/.test(t) && !/\b[hH]{1,2}\b|:[mM]{1,2}\b|:[sS]{1,2}\b|\bAM\b|\bPM\b/i.test(t);
}

/** Get effective number_format for a cell (from cell_styles or sheet_style). */
function getNumberFormatForCell(sheet: any, row: number, column: number): string | undefined {
  const styles = sheet?.styles || sheet?.cell_style_refs || [];
  const cellStyles = Array.isArray(sheet?.cell_styles) ? sheet.cell_styles : [];
  for (const entry of cellStyles) {
    if ((entry as any).row !== row || (entry as any).column !== column) continue;
    const style = (entry as any).style ?? styles[(entry as any).ref];
    const fmt = style?.number_format;
    if (typeof fmt === 'string') return fmt;
  }
  return sheet?.sheet_style?.number_format;
}

/** Excel epoch: 25569 = days between 1899-12-30 and 1970-01-01 (serial 1 = 1899-12-31). */
const EXCEL_EPOCH_OFFSET = 25569;
const MS_PER_DAY = 86400000;

/** Excel serial date range (roughly 1980–2040) — floor only values in this range to avoid touching measurements. */
const EXCEL_DATE_SERIAL_MIN = 29221;   // 1980-01-01
const EXCEL_DATE_SERIAL_MAX = 54788;   // 2049-12-31

/**
 * Convert a local JS Date to Excel serial. Uses local year/month/day and Date.UTC so timezone
 * is severed from the math (avoids off-by-one when ahead of UTC, e.g. UTC+7).
 */
export function dateToExcelSerial(date: Date): number {
  const cleanUtcMillis = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return cleanUtcMillis / MS_PER_DAY + EXCEL_EPOCH_OFFSET;
}

/**
 * Convert Excel serial back to a JS Date. Reconstructs using UTC components as local components
 * so the displayed calendar day is correct regardless of timezone.
 */
export function excelSerialToDate(serial: number): Date {
  const utcDays = Math.floor(serial - EXCEL_EPOCH_OFFSET);
  const utcMillis = utcDays * MS_PER_DAY;
  const utcDate = new Date(utcMillis);
  return new Date(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate()
  );
}

/** True if value looks like an Excel date serial with time (number with fractional part in date range). */
function isDateSerialWithTime(value: unknown): boolean {
  if (typeof value !== 'number' || Number.isNaN(value) || value % 1 === 0) return false;
  const n = value as number;
  return n >= EXCEL_DATE_SERIAL_MIN && n <= EXCEL_DATE_SERIAL_MAX;
}

/**
 * Fix serial round-trip: when TREB/Excel returns serial - 1 due to timezone, we add 1 so the
 * stored value matches the intended calendar day. Uses excelSerialToDate for consistent
 * serial→date interpretation.
 * - West of UTC: next serial's local date matches current serial's UTC date → add 1.
 * - East of UTC (e.g. UTC+7): local midnight → previous UTC day in getTime() → add 1 for
 *   integer date serials so the displayed day is correct (may cause +1 on already-correct
 *   serials in rare cases).
 */
function fixDateSerialRoundTrip(n: number): number {
  if (n % 1 !== 0 || n < EXCEL_DATE_SERIAL_MIN || n > EXCEL_DATE_SERIAL_MAX) return n;
  const dCur = excelSerialToDate(n);
  const dNext = excelSerialToDate(n + 1);
  const nextLocalMatchesCurUtc =
    dNext.getDate() === dCur.getUTCDate() &&
    dNext.getMonth() === dCur.getUTCMonth() &&
    dNext.getFullYear() === dCur.getUTCFullYear();
  const eastOfUtc = new Date().getTimezoneOffset() < 0;
  return (nextLocalMatchesCurUtc || eastOfUtc) ? n + 1 : n;
}

/** Floor fractional date serials (no time); fix integer date serials that TREB returns as -1 so round-trip is stable. */
function normalizeDateValuesInSheet(sheet: any): void {
  const data = Array.isArray(sheet?.data) ? sheet.data : [];
  for (const entry of data) {
    if (typeof entry?.row === 'number' && typeof entry?.column === 'number') {
      const fmt = getNumberFormatForCell(sheet, entry.row, entry.column);
      if (typeof entry.value === 'number' && !Number.isNaN(entry.value)) {
        const v = entry.value as number;
        if (v % 1 !== 0 && (isDateLikeFormat(fmt) || isDateSerialWithTime(entry.value))) {
          entry.value = Math.floor(v);
        } else if (v % 1 === 0 && isDateLikeFormat(fmt)) {
          entry.value = fixDateSerialRoundTrip(v);
        }
      }
      continue;
    }
    if (typeof entry?.row === 'number' && Array.isArray(entry.cells)) {
      for (const c of entry.cells) {
        if (typeof c?.column !== 'number') continue;
        const fmt = getNumberFormatForCell(sheet, entry.row, c.column);
        if (typeof c.value === 'number' && !Number.isNaN(c.value)) {
          const v = c.value as number;
          if (v % 1 !== 0 && (isDateLikeFormat(fmt) || isDateSerialWithTime(c.value))) {
            c.value = Math.floor(v);
          } else if (v % 1 === 0 && isDateLikeFormat(fmt)) {
            c.value = fixDateSerialRoundTrip(v);
          }
        }
      }
      continue;
    }
    if (typeof entry?.column === 'number' && Array.isArray(entry.cells)) {
      for (const c of entry.cells) {
        if (typeof c?.row !== 'number') continue;
        const fmt = getNumberFormatForCell(sheet, c.row, entry.column);
        if (typeof c.value === 'number' && !Number.isNaN(c.value)) {
          const v = c.value as number;
          if (v % 1 !== 0 && (isDateLikeFormat(fmt) || isDateSerialWithTime(c.value))) {
            c.value = Math.floor(v);
          } else if (v % 1 === 0 && isDateLikeFormat(fmt)) {
            c.value = fixDateSerialRoundTrip(v);
          }
        }
      }
    }
  }
}

/**
 * Returns a clone of the document with any number_format containing dddd (weekday)
 * replaced by "mmm dd, yyyy". Use when receiving a doc from TREB (e.g. on document-change)
 * so the grid shows "Mar 02, 2026" instead of "Tuesday, Mar 02 2026".
 */
export function normalizeLongDateInDocument(doc: TREBDocument): TREBDocument {
  if (!doc || typeof doc !== 'object') return doc;
  const out = JSON.parse(JSON.stringify(doc)) as TREBDocument;
  const sheets = normalizeSheetArray((out as any).sheet_data);
  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== 'object') continue;
    fixLongDateFormatInStyle(sheet.sheet_style);
    for (const arr of [sheet.styles, sheet.cell_style_refs].filter(Array.isArray)) {
      for (const s of arr) fixLongDateFormatInStyle(s);
    }
    if (Array.isArray(sheet.cell_styles)) {
      for (const entry of sheet.cell_styles) {
        fixLongDateFormatInStyle((entry as any)?.style);
      }
    }
    if (sheet.row_style && typeof sheet.row_style === 'object') {
      for (const k of Object.keys(sheet.row_style)) {
        fixLongDateFormatInStyle(sheet.row_style[k]);
      }
    }
    if (sheet.column_style && typeof sheet.column_style === 'object') {
      for (const k of Object.keys(sheet.column_style)) {
        fixLongDateFormatInStyle(sheet.column_style[k]);
      }
    }
    normalizeDateValuesInSheet(sheet);
  }
  return out;
}

/**
 * Normalize a TREB document so it can be loaded with all sheets/tabs.
 * - Ensures sheet_data is always an array (handles Firestore/object-with-numeric-keys).
 * - Ensures each sheet has id and name so TREB shows the tab bar and all tabs.
 * - Sets active_sheet to 0 so the first sheet is visible.
 * - Replaces any number_format that contains dddd (weekday) with "mmm dd, yyyy" so dates show "Mar 02, 2026" not "Sunday, Mar 02 2026".
 * Call this before passing a document to LoadDocument when applying a template.
 */
export function normalizeTrebDocumentForLoad(doc: TREBDocument): TREBDocument {
  if (!doc || typeof doc !== 'object') return doc;
  const out = JSON.parse(JSON.stringify(doc)) as TREBDocument;
  let sheets = normalizeSheetArray((out as any).sheet_data);

  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== 'object') continue;
    fixLongDateFormatInStyle(sheet.sheet_style);
    for (const arr of [sheet.styles, sheet.cell_style_refs].filter(Array.isArray)) {
      for (const s of arr) fixLongDateFormatInStyle(s);
    }
    if (Array.isArray(sheet.cell_styles)) {
      for (const entry of sheet.cell_styles) {
        fixLongDateFormatInStyle((entry as any)?.style);
      }
    }
    if (sheet.row_style && typeof sheet.row_style === 'object') {
      for (const k of Object.keys(sheet.row_style)) {
        fixLongDateFormatInStyle(sheet.row_style[k]);
      }
    }
    if (sheet.column_style && typeof sheet.column_style === 'object') {
      for (const k of Object.keys(sheet.column_style)) {
        fixLongDateFormatInStyle(sheet.column_style[k]);
      }
    }
    // Floor numeric date values so formula bar (F2) shows date only, not time
    normalizeDateValuesInSheet(sheet);
  }

  // Ensure each sheet has id and name so TREB renders all tabs
  sheets = sheets.map((sheet: any, index: number) => {
    if (!sheet || typeof sheet !== 'object') return sheet;
    const s = { ...sheet };
    if (typeof s.id !== 'number') s.id = index + 1;
    if (typeof s.name !== 'string' || s.name === '') s.name = sheet.name || `Sheet${index + 1}`;
    return s;
  });
  (out as any).sheet_data = sheets;
  if (sheets.length > 0 && typeof (out as any).active_sheet !== 'number') {
    (out as any).active_sheet = 0;
  }
  if (typeof (out as any).active_sheet === 'number' && (out as any).active_sheet >= sheets.length) {
    (out as any).active_sheet = 0;
  }
  return out;
}

/**
 * Ensure each sheet in the TREB document has a valid `rows` count so that when
 * the document is loaded (e.g. after applying a template), the spreadsheet
 * model gets the correct row count. If sheet.rows is missing or less than the
 * highest row index in the data, set it from the data.
 */
export function ensureTrebDocumentSheetRowCounts(doc: TREBDocument): TREBDocument {
  const sheets = normalizeSheetArray((doc as any).sheet_data);
  sheets.forEach((sheet: any) => {
    if (!sheet || typeof sheet !== 'object') return;
    const cells = extractSheetCells(sheet);
    const maxRow = cells.reduce((acc, c) => Math.max(acc, c.row), 0);
    const fromData = maxRow + 1;
    const current = typeof sheet.rows === 'number' && sheet.rows >= 1 ? sheet.rows : 0;
    sheet.rows = Math.max(current, fromData, 1);
  });
  return doc;
}

/** Get existing tabs in display order (same as SpreadsheetGrid getSpreadsheetTabs). */
function getExistingTabsInOrder(spreadsheet: SpreadsheetModel): Array<{ id: string; tab: SpreadsheetTab }> {
  const tabs = spreadsheet.tabs;
  if (!tabs || tabs.size === 0) return [];
  const tabOrder = spreadsheet.tabOrder && spreadsheet.tabOrder.length > 0
    ? spreadsheet.tabOrder
    : Array.from(tabs.keys());
  return tabOrder
    .map((id) => ({ id, tab: tabs.get(id) }))
    .filter((entry): entry is { id: string; tab: NonNullable<typeof entry.tab> } => Boolean(entry.tab));
}

/**
 * Merge existing spreadsheet data rows into a template TREB document so that
 * the result has the template's structure (columns, header row, styles) but
 * existing data rows aligned to the template's column order.
 * - Template row 0 is kept as the header/structure row.
 * - Existing tabs are matched to template sheets by name (e.g. Class_Table, LoadCell_DB) so tabs
 *   do not get mixed when order differs; fallback to index then first tab.
 * - Locked cell state from the template is preserved (not stripped).
 */
export function mergeExistingDataIntoTemplateDocument(
  templateDoc: TREBDocument,
  existingSpreadsheet: SpreadsheetModel
): TREBDocument {
  const merged = JSON.parse(JSON.stringify(templateDoc)) as TREBDocument;
  const templateSheets = normalizeSheetArray(merged.sheet_data);
  const userData = (merged as any).user_data as { sheets?: Record<string, { columnOrder?: string[]; columnCount?: number; rowCount?: number }> } | undefined;
  const sheetMeta = userData?.sheets || {};

  const existingTabsOrdered = getExistingTabsInOrder(existingSpreadsheet);
  if (existingTabsOrdered.length === 0) {
    return merged;
  }

  const firstExistingTab = existingTabsOrdered[0].tab;

  // Map existing tab name (normalized) -> tab, so we match by name and avoid Class_Table/LoadCell_DB mixing
  const existingByName = new Map<string, SpreadsheetTab>();
  for (const { tab } of existingTabsOrdered) {
    const n = (tab.name || '').trim();
    if (n) existingByName.set(n.toLowerCase(), tab);
  }

  const getExistingTabForSheet = (templateSheetName: string, sheetIndex: number): SpreadsheetTab => {
    const key = (templateSheetName || '').trim().toLowerCase();
    if (key) {
      const byName = existingByName.get(key);
      if (byName) return byName;
    }
    return existingTabsOrdered[sheetIndex]?.tab ?? firstExistingTab;
  };

  templateSheets.forEach((sheet: any, sheetIndex: number) => {
    if (!sheet || !sheet.data) return;
    const sheetName = sheet.name || `Sheet${sheetIndex + 1}`;
    const existingTab = getExistingTabForSheet(sheetName, sheetIndex);
    const existingCells = existingTab.cells || new Map();
    const existingColumnOrder = existingTab.columnOrder || [];
    const existingRowCount = Math.max(existingTab.rowCount ?? 0, 1);
    const existingColumnCount = Math.max(existingColumnOrder.length, existingTab.columnCount ?? 0);

    const meta = sheetMeta[sheetName];
    const templateColumnOrder = meta?.columnOrder || [];
    const templateColumnCount = Math.max(sheet.columns ?? 0, templateColumnOrder.length, 1);

    // Preserve full template (formulas, merges, styles); overlay existing user values only
    const clonedData = JSON.parse(JSON.stringify(sheet.data));

    // Map template column index -> existing column index (by name when both have columnOrder)
    const templateToExistingCol = new Map<number, number>();
    for (let c = 0; c < templateColumnCount; c++) {
      const templateColName = templateColumnOrder[c];
      const existingIdx = templateColName != null ? existingColumnOrder.indexOf(templateColName) : -1;
      templateToExistingCol.set(c, existingIdx >= 0 ? existingIdx : c < existingColumnCount ? c : 0);
    }

    for (let r = 0; r < existingRowCount; r++) {
      for (let c = 0; c < templateColumnCount; c++) {
        const existingCol = templateToExistingCol.get(c) ?? (c < existingColumnCount ? c : 0);
        const cellId = generateCellId(r, existingCol);
        const cell = existingCells.get(cellId);
        let value: unknown = null;
        if (cell) {
          if (cell.formula) value = `=${cell.formula}`;
          else if (cell.rawValue !== null && cell.rawValue !== undefined) value = cell.rawValue;
          else if (cell.displayValue !== '') value = cell.displayValue;
        }
        if (value === null || value === undefined || value === '') continue;
        const templateRow = r + 1;
        const templateHasFormula = templateCellIsFormula(clonedData, templateRow, c);
        const valueIsFormula = typeof value === 'string' && (value as string).startsWith('=');
        if (templateHasFormula && !valueIsFormula) continue;
        setCellValueInSheetData(clonedData, templateRow, c, value);
      }
    }

    sheet.data = clonedData;
    sheet.rows = Math.max(sheet.rows ?? 1, 1 + existingRowCount);
    sheet.columns = Math.max(sheet.columns ?? 0, templateColumnCount);
  });

  merged.sheet_data = templateSheets;
  return merged;
}

/**
 * Set locked to false for all cells in the given selection area in the document.
 * Mutates the document in place. Use after password verification to allow clearing locked cells.
 */
export function setLockedInSelectionArea(
  doc: TREBDocument,
  selection: TrebSelectionArea,
  activeSheetIndex: number,
  locked: boolean
): void {
  if (selection.empty || !selection.area) return;
  const sheets = normalizeSheetArray((doc as any).sheet_data);
  const sheet = sheets[Math.max(0, activeSheetIndex)];
  if (!sheet || typeof sheet !== 'object') return;

  const start = selection.area.start;
  const end = selection.area.end;
  const r0 = Math.min(start.row, end.row);
  const r1 = Math.max(start.row, end.row);
  const c0 = Math.min(start.column, end.column);
  const c1 = Math.max(start.column, end.column);

  const cellStyles = Array.isArray(sheet.cell_styles) ? sheet.cell_styles : [];
  const styles = sheet.styles || sheet.cell_style_refs || [];
  for (const entry of cellStyles) {
    const row = (entry as any).row;
    const col = (entry as any).column;
    if (typeof row !== 'number' || typeof col !== 'number') continue;
    if (row < r0 || row > r1 || col < c0 || col > c1) continue;
    const style = (entry as any).style ?? styles[(entry as any).ref];
    if (style && typeof style === 'object') (style as any).locked = locked;
  }
}

/**
 * Deep-clone a TREB document and set all style `locked` properties to false
 * so that templates applied in the equipment spreadsheet are editable.
 * Templates from the Template Builder may have locked cells (e.g. headers).
 */
export function stripLockedFromTrebDocument(doc: TREBDocument): TREBDocument {
  const clone = JSON.parse(JSON.stringify(doc)) as TREBDocument;
  const sheets = Array.isArray(clone.sheet_data) ? clone.sheet_data : [clone.sheet_data].filter(Boolean);
  sheets.forEach((sheet: any) => {
    if (sheet?.sheet_style && typeof sheet.sheet_style === 'object' && sheet.sheet_style.locked) {
      sheet.sheet_style.locked = false;
    }
    if (Array.isArray(sheet?.styles)) {
      sheet.styles.forEach((s: any) => {
        if (s && typeof s === 'object' && s.locked) s.locked = false;
      });
    }
    if (sheet?.row_style && typeof sheet.row_style === 'object') {
      Object.keys(sheet.row_style).forEach((k) => {
        const v = sheet.row_style[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && v.locked) (sheet.row_style[k] as any).locked = false;
      });
    }
    if (sheet?.column_style && typeof sheet.column_style === 'object') {
      Object.keys(sheet.column_style).forEach((k) => {
        const v = sheet.column_style[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && v.locked) (sheet.column_style[k] as any).locked = false;
      });
    }
  });
  return clone;
}

/**
 * Remove cell fill (background) from all styles in a TREB document.
 * Use when applying a template so unintended grey or colored shading from
 * the template (e.g. from chart ranges, merged cells, or builder styling)
 * does not appear on the applied spreadsheet.
 */
export function stripCellFillsFromTrebDocument(doc: TREBDocument): TREBDocument {
  const clone = JSON.parse(JSON.stringify(doc)) as TREBDocument;
  const sheets = Array.isArray(clone.sheet_data) ? clone.sheet_data : [clone.sheet_data].filter(Boolean);
  sheets.forEach((sheet: any) => {
    if (sheet?.sheet_style && typeof sheet.sheet_style === 'object' && 'fill' in sheet.sheet_style) {
      delete sheet.sheet_style.fill;
    }
    const styleArrays = [sheet?.styles, sheet?.cell_style_refs].filter(Array.isArray);
    styleArrays.forEach((arr: any[]) => {
      arr.forEach((s: any) => {
        if (s && typeof s === 'object' && 'fill' in s) delete s.fill;
      });
    });
    const clearFill = (rec: Record<string, unknown>) => {
      if (!rec || typeof rec !== 'object') return;
      Object.keys(rec).forEach((k) => {
        const v = rec[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && 'fill' in (v as any)) {
          delete (v as any).fill;
        }
      });
    };
    if (sheet?.row_style && typeof sheet.row_style === 'object') {
      clearFill(sheet.row_style);
    }
    if (sheet?.column_style && typeof sheet.column_style === 'object') {
      clearFill(sheet.column_style);
    }
    // Inline styles on cell_styles (cell_style with .style object)
    if (Array.isArray(sheet?.cell_styles)) {
      sheet.cell_styles.forEach((entry: any) => {
        if (entry?.style && typeof entry.style === 'object' && 'fill' in entry.style) {
          delete entry.style.fill;
        }
      });
    }
  });
  return clone;
}
