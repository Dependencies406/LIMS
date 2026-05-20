/**
 * Spreadsheet Grid Component
 * TREB-powered spreadsheet renderer that keeps compatibility with existing callbacks.
 * This is the single TREB grid used across the app (Equipment spreadsheet, Template manager,
 * Spreadsheet page). Delete-tab confirmation here applies to all of them.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TREB } from '@trebco/treb';
import type { EmbeddedSheetEvent, EmbeddedSpreadsheet, SerializedSheet, TREBDocument } from '@trebco/treb';
import type { SpreadsheetModel, Cell, CellDataType, ColumnDefinition, SpreadsheetTab } from '../models/SpreadsheetModel';
import { generateCellId, parseCellId, DEFAULT_SPREADSHEET_ROW_COUNT } from '../models/SpreadsheetModel';
import { setLockedInSelectionArea, selectionAreaContainsLockedCell, normalizeLongDateInDocument } from '../utils/trebDocumentUtils';
import type { TrebSelectionArea } from '../utils/trebDocumentUtils';

/** Message shown before deleting a sheet/tab. Use this for any TREB delete-tab flow so wording is consistent. */
export const DELETE_TAB_CONFIRM_MESSAGE =
  'Are you sure you want to delete this tab? This cannot be undone.';

/** Max height for dropdowns/menus so they don't get cut off; add scroll when content exceeds this. */
const DROPDOWN_MAX_HEIGHT = 'min(70vh, 420px)';

/** Ensure dropdown/menu elements inside root have scroll when cut off (max-height + overflow-y). */
function ensureMenusScrollable(root: HTMLElement): void {
  const viewportBottom = window.innerHeight;
  const selector = '[role="listbox"], [role="menu"], [role="list"]';
  root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0 && rect.bottom > viewportBottom) {
      el.style.maxHeight = DROPDOWN_MAX_HEIGHT;
      el.style.overflowY = 'auto';
    } else if (rect.height > 300) {
      el.style.maxHeight = DROPDOWN_MAX_HEIGHT;
      el.style.overflowY = 'auto';
    }
  });
  // Any absolutely positioned div that looks like a dropdown (tall, has many children)
  root.querySelectorAll<HTMLElement>('div[style*="position: absolute"], div[style*="position:absolute"]').forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height > 200 && (rect.bottom > viewportBottom || el.scrollHeight > rect.height)) {
      el.style.maxHeight = DROPDOWN_MAX_HEIGHT;
      el.style.overflowY = 'auto';
    }
  });
}

export interface SpreadsheetGridProps {
  spreadsheet: SpreadsheetModel;
  isReadOnly?: boolean;
  onCellUpdate?: (cellId: string, value: string | number, formula?: string) => void;
  onCellSelect?: (cellId: string) => void;
  /** Second arg options.isFullReplace: true when the update is from loading an external template (parent should replace full state, not merge). options.activeTabId: current tab from TREB so parent can keep selection in sync. */
  onSpreadsheetChange?: (spreadsheet: SpreadsheetModel, options?: { isFullReplace?: boolean; activeTabId?: string }) => void;
  onAddRow?: () => void;
  onDeleteRow?: () => void;
  /**
   * When set to a non-null TREBDocument, loads it directly into TREB (bypassing the
   * SpreadsheetModel → TREBDocument conversion) so formatting and sheet structure are
   * preserved exactly as authored in the template builder.
   */
  externalDocument?: TREBDocument | null;
  /** Called after externalDocument has been consumed so the parent can reset it to null. */
  onExternalDocumentConsumed?: () => void;
  /**
   * Fired on every TREB document-change with the raw TREBDocument (before any conversion).
   * Use this to capture the exact TREB state for storage (e.g. in the template builder).
   */
  onTrebDocumentChange?: (doc: TREBDocument) => void;
  /**
   * Optional content rendered in a thin bar flush against the top of the TREB container.
   * Use this to add custom action buttons (e.g. a Templates picker) that appear as part
   * of the spreadsheet toolbar without modifying TREB internals.
   */
  toolbarSlot?: ReactNode;
  /** Show a full-screen toggle button in the toolbar (default true). */
  showFullScreenButton?: boolean;
  /**
   * When true, the grid fills its parent height (flex-1) instead of using a fixed 70vh.
   * Use inside a flex container with constrained height (e.g. modal) to avoid cut-off.
   */
  fillHeight?: boolean;
  /** Show Bold, Italic, Underline, Strikethrough buttons in the toolbar (default true when not read-only). */
  showFormatToolbar?: boolean;
  /**
   * When provided and the user tries to delete/clear a locked cell (e.g. Delete/Backspace),
   * this is called with a function that performs the clear. The parent can show a password
   * prompt and, on success, call the function to allow the clear.
   */
  onRequestUnlockLockedCell?: (performClear: () => void) => void;
  /**
   * When provided, called with a getter that returns the current full TREB document (all sheets)
   * from SerializeDocument(). Use at save time so templates persist every sheet, not just the last change.
   */
  onRegisterGetDocument?: (getDocument: () => TREBDocument | null) => void;
  /**
   * When provided, called with a function that applies style (e.g. number_format) to the current
   * selection. Use for Custom format toolbar so the user can set a format string (e.g. "mmm dd, yyyy").
   */
  onRegisterApplyStyle?: (applyStyle: (style: { number_format?: string }) => void) => void;
}

type SerializedCellLike = {
  row?: number;
  column?: number;
  value?: unknown;
  calculated?: unknown;
  cells?: Array<{ row?: number; column?: number; value?: unknown; calculated?: unknown }>;
};

type SheetMeta = {
  name?: string;
  rowCount?: number;
  columnCount?: number;
  columnOrder?: string[];
  columnDefinitions?: Record<string, ColumnDefinition>;
};

type SpreadsheetUserData = {
  source?: string;
  sheets?: Record<string, SheetMeta>;
};

const getColumnLabel = (index: number): string => {
  let label = '';
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }
  return label;
};

const buildDefaultColumnOrder = (columnCount: number): string[] =>
  Array.from({ length: Math.max(columnCount, 1) }, (_, index) => getColumnLabel(index));

const getSpreadsheetTabs = (spreadsheet: SpreadsheetModel): Array<{ id: string; tab: SpreadsheetTab }> => {
  if (spreadsheet.tabs instanceof Map && spreadsheet.tabs.size > 0) {
    const order = spreadsheet.tabOrder && spreadsheet.tabOrder.length > 0
      ? spreadsheet.tabOrder
      : Array.from(spreadsheet.tabs.keys());
    return order
      .map((id) => ({ id, tab: spreadsheet.tabs!.get(id) }))
      .filter((entry): entry is { id: string; tab: SpreadsheetTab } => Boolean(entry.tab));
  }

  const fallbackId = 'sheet1';
  return [{
    id: fallbackId,
    tab: {
      id: fallbackId,
      name: spreadsheet.name || 'Sheet1',
      order: 0,
      cells: spreadsheet.cells || new Map(),
      columnDefinitions: spreadsheet.columnDefinitions,
      columnOrder: spreadsheet.columnOrder,
      rowCount: spreadsheet.rowCount ?? DEFAULT_SPREADSHEET_ROW_COUNT,
      columnCount: spreadsheet.columnCount ?? 26,
    },
  }];
};

const getCellType = (value: unknown, formula?: string): CellDataType => {
  if (formula) return 'formula';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'text';
};

/** Normalize sheet_data to an array; handles Firestore/JSON returning array-like as object with numeric keys. */
const normalizeSheetArray = (sheetData?: SerializedSheet | SerializedSheet[] | Record<string, SerializedSheet>): SerializedSheet[] => {
  if (!sheetData) return [];
  if (Array.isArray(sheetData)) return sheetData;
  if (typeof sheetData === 'object' && sheetData !== null) {
    const obj = sheetData as Record<string, SerializedSheet>;
    const keys = Object.keys(obj).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
    if (keys.length > 0) return keys.map((k) => obj[k]);
  }
  return [sheetData as SerializedSheet];
};

const cloneDocument = (doc: TREBDocument): TREBDocument => JSON.parse(JSON.stringify(doc));

const normalizeDocumentForSync = (doc: TREBDocument): string => {
  const normalized = cloneDocument(doc);
  const sheets = normalizeSheetArray(normalized.sheet_data as SerializedSheet | SerializedSheet[]);

  sheets.forEach((sheet: any) => {
    if (sheet && typeof sheet === 'object') {
      delete sheet.selection;
      delete sheet.scroll;
    }
  });

  normalized.sheet_data = sheets;
  delete (normalized as any).revision;
  return JSON.stringify(normalized);
};

/** True if the TREB doc has meaningful styling (fills, borders, cell_styles) so we should not overwrite it with a plain toTrebDocument(state). */
function trebDocHasRichFormatting(doc: TREBDocument): boolean {
  const sheets = normalizeSheetArray(doc.sheet_data as SerializedSheet | SerializedSheet[]);
  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== 'object') continue;
    const s = sheet as any;
    if (Array.isArray(s.cell_styles) && s.cell_styles.length > 0) return true;
    if (Array.isArray(s.styles) && s.styles.length > 0) return true;
    if (Array.isArray(s.cell_style_refs) && s.cell_style_refs.length > 0) return true;
    if (s.sheet_style && typeof s.sheet_style === 'object' && (s.sheet_style.fill || s.sheet_style.border || s.sheet_style.locked)) return true;
    if (s.row_style && typeof s.row_style === 'object' && Object.keys(s.row_style).length > 0) return true;
    if (s.column_style && typeof s.column_style === 'object' && Object.keys(s.column_style).length > 0) return true;
  }
  return false;
}

/** Set one cell value in TREB sheet.data (handles flat and row-nested formats). Used to merge state into rich doc. */
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

/** Merge cell values from sourceDoc into a clone of currentDoc. Preserves currentDoc formatting. */
function mergeCellValuesIntoDoc(currentDoc: TREBDocument, sourceDoc: TREBDocument): TREBDocument {
  const merged = cloneDocument(currentDoc);
  const currentSheets = normalizeSheetArray(merged.sheet_data as SerializedSheet | SerializedSheet[]);
  const sourceSheets = normalizeSheetArray(sourceDoc.sheet_data as SerializedSheet | SerializedSheet[]);
  for (let i = 0; i < sourceSheets.length && i < currentSheets.length; i++) {
    const sourceSheet = sourceSheets[i] as any;
    const currentSheet = currentSheets[i] as any;
    if (!sourceSheet?.data || !Array.isArray(sourceSheet.data) || !currentSheet?.data) continue;
    for (const cell of sourceSheet.data) {
      if (typeof cell?.row === 'number' && typeof cell?.column === 'number') {
        setCellValueInSheetData(currentSheet.data, cell.row, cell.column, cell.value);
      }
    }
  }
  return merged;
}

const mergeCurrentSelectionState = (nextDoc: TREBDocument, currentDoc: TREBDocument): TREBDocument => {
  const merged = cloneDocument(nextDoc);
  const nextSheets = normalizeSheetArray(merged.sheet_data as SerializedSheet | SerializedSheet[]);
  const currentSheets = normalizeSheetArray(currentDoc.sheet_data as SerializedSheet | SerializedSheet[]);

  nextSheets.forEach((sheet: any, index: number) => {
    const currentSheet: any = currentSheets[index];
    if (!sheet || !currentSheet) return;
    if (currentSheet.selection) {
      sheet.selection = currentSheet.selection;
    }
    if (currentSheet.scroll) {
      sheet.scroll = currentSheet.scroll;
    }
  });

  merged.sheet_data = nextSheets;
  if (typeof currentDoc.active_sheet === 'number') {
    merged.active_sheet = currentDoc.active_sheet;
  }
  return merged;
};

const extractSheetCells = (sheet: SerializedSheet): Array<{ row: number; column: number; value: unknown; calculated?: unknown }> => {
  const extracted: Array<{ row: number; column: number; value: unknown; calculated?: unknown }> = [];
  const rowsOrColumns = sheet.data as SerializedCellLike[];

  if (!Array.isArray(rowsOrColumns)) {
    return extracted;
  }

  for (const entry of rowsOrColumns) {
    if (typeof entry?.row === 'number' && typeof entry?.column === 'number') {
      extracted.push({
        row: entry.row,
        column: entry.column,
        value: entry.value,
        calculated: entry.calculated,
      });
      continue;
    }

    if (typeof entry?.row === 'number' && Array.isArray(entry.cells)) {
      for (const nested of entry.cells) {
        if (typeof nested?.column !== 'number') continue;
        extracted.push({
          row: entry.row,
          column: nested.column,
          value: nested.value,
          calculated: nested.calculated,
        });
      }
      continue;
    }

    if (typeof entry?.column === 'number' && Array.isArray(entry.cells)) {
      for (const nested of entry.cells) {
        if (typeof nested?.row !== 'number') continue;
        extracted.push({
          row: nested.row,
          column: entry.column,
          value: nested.value,
          calculated: nested.calculated,
        });
      }
    }
  }

  return extracted;
};

/** Exported so callers (e.g. template manager) can convert a SpreadsheetModel to a TREB document. */
export const toTrebDocument = (spreadsheet: SpreadsheetModel): TREBDocument => {
  const tabs = getSpreadsheetTabs(spreadsheet);
  const sheetMeta: Record<string, SheetMeta> = {};

  const serializedSheets: SerializedSheet[] = tabs.map(({ tab }, index) => {
    // Empty tabs (e.g. new spreadsheet) use default 25 rows; otherwise respect tab.rowCount.
    const rows = (tab.cells?.size ?? 0) > 0
      ? Math.max(tab.rowCount || DEFAULT_SPREADSHEET_ROW_COUNT, 1)
      : DEFAULT_SPREADSHEET_ROW_COUNT;
    const columns = Math.max(tab.columnCount || tab.columnOrder?.length || 1, 1);
    const cellData: Array<{ row: number; column: number; value: any }> = [];

    tab.cells.forEach((cell) => {
      let value: any = null;
      if (cell.formula) {
        value = `=${cell.formula}`;
      } else if (cell.rawValue !== null && cell.rawValue !== undefined) {
        value = cell.rawValue;
      } else if (cell.displayValue !== '') {
        value = cell.displayValue;
      } else {
        return;
      }

      cellData.push({
        row: cell.row,
        column: cell.column,
        value,
      });
    });

    const name = tab.name || `Sheet${index + 1}`;
    sheetMeta[name] = {
      name,
      rowCount: rows,
      columnCount: columns,
      columnOrder: tab.columnOrder || buildDefaultColumnOrder(columns),
      columnDefinitions: tab.columnDefinitions ? Object.fromEntries(tab.columnDefinitions) : undefined,
    };

    return {
      data: cellData,
      sheet_style: {} as any,
      rows,
      columns,
      cell_styles: [],
      row_style: {},
      column_style: {},
      selection: {
        target: { row: 0, column: 0 },
        area: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      },
      id: index + 1,
      name,
    } as SerializedSheet;
  });

  return {
    app: 'lims-treb-adapter',
    version: '1.0.0',
    name: spreadsheet.name,
    active_sheet: 0,
    user_data: {
      source: 'lims',
      sheets: sheetMeta,
    } as SpreadsheetUserData,
    sheet_data: serializedSheets,
  };
};

const toSpreadsheetModel = (document: TREBDocument, base: SpreadsheetModel): SpreadsheetModel => {
  const sheetArray = normalizeSheetArray(document.sheet_data);
  const sheetMetadata = (document.user_data as SpreadsheetUserData | undefined)?.sheets || {};
  const tabOrder: string[] = [];
  const tabs = new Map<string, SpreadsheetTab>();

  sheetArray.forEach((sheet, index) => {
    const tabId = `sheet-${index + 1}`;
    const extractedCells = extractSheetCells(sheet);
    const maxRow = extractedCells.reduce((acc, cell) => Math.max(acc, cell.row), 0);
    const maxColumn = extractedCells.reduce((acc, cell) => Math.max(acc, cell.column), 0);
    const metadata = sheetMetadata[sheet.name || `Sheet${index + 1}`];
    const rowCount = Math.max(sheet.rows || metadata?.rowCount || maxRow + 1 || 1, 1);
    const columnCount = Math.max(sheet.columns || metadata?.columnCount || maxColumn + 1 || 1, 1);
    const columnOrder = metadata?.columnOrder || buildDefaultColumnOrder(columnCount);
    const columnDefinitions = new Map<string, ColumnDefinition>(
      Object.entries(metadata?.columnDefinitions || {})
    );

    const tabCells = new Map<string, Cell>();
    extractedCells.forEach(({ row, column, value, calculated }) => {
      const cellId = generateCellId(row, column);
      const isFormula = typeof value === 'string' && value.startsWith('=');
      const formula = isFormula ? value.slice(1) : undefined;
      const rawValue = isFormula ? null : (value as string | number | boolean | null);
      const displayValue = isFormula
        ? (calculated !== undefined && calculated !== null ? String(calculated) : '')
        : (rawValue !== null && rawValue !== undefined ? String(rawValue) : '');

      tabCells.set(cellId, {
        id: cellId,
        row,
        column,
        dataType: getCellType(rawValue, formula),
        rawValue,
        formula,
        displayValue,
      });
    });

    tabOrder.push(tabId);
    tabs.set(tabId, {
      id: tabId,
      name: sheet.name || `Sheet${index + 1}`,
      order: index,
      cells: tabCells,
      columnDefinitions,
      columnOrder,
      rowCount,
      columnCount,
    });
  });

  const activeTabIndex = typeof document.active_sheet === 'number'
    ? Math.max(0, Math.min(document.active_sheet, tabOrder.length - 1))
    : 0;
  const activeTabId = tabOrder[activeTabIndex] || tabOrder[0];
  const activeTab = activeTabId ? tabs.get(activeTabId) : undefined;

  return {
    ...base,
    name: document.name || base.name,
    tabs,
    tabOrder,
    rowCount: activeTab?.rowCount || base.rowCount,
    columnCount: activeTab?.columnCount || base.columnCount,
    cells: activeTab?.cells || new Map(),
    columnDefinitions: activeTab?.columnDefinitions || base.columnDefinitions || new Map(),
    columnOrder: activeTab?.columnOrder || base.columnOrder || [],
    updatedAt: new Date(),
  };
};

const getSelectedCellId = (sheet: EmbeddedSpreadsheet): string | null => {
  try {
    const selection = sheet.GetSelection(false);
    if (!selection) return null;
    const match = selection.match(/[A-Z]+[0-9]+/);
    return match ? match[0] : null;
  } catch {
    // TREB can throw from GetSelection/CellAddressToLabel in some states (e.g. during init)
    return null;
  }
};

export const SpreadsheetGrid: React.FC<SpreadsheetGridProps> = ({
  spreadsheet,
  isReadOnly = false,
  onCellUpdate: _onCellUpdate,
  onCellSelect,
  onSpreadsheetChange,
  onAddRow: _onAddRow,
  onDeleteRow: _onDeleteRow,
  externalDocument,
  onExternalDocumentConsumed,
  onTrebDocumentChange,
  toolbarSlot,
  showFullScreenButton = true,
  fillHeight = false,
  showFormatToolbar = true,
  onRequestUnlockLockedCell,
  onRegisterGetDocument,
  onRegisterApplyStyle,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<EmbeddedSpreadsheet | null>(null);
  const subscriptionRef = useRef<number | null>(null);
  const lastSerializedRef = useRef<string>('');
  const skipNextPropSyncRef = useRef(false);
  const onSpreadsheetChangeRef = useRef(onSpreadsheetChange);
  const onCellSelectRef = useRef(onCellSelect);
  const onTrebDocumentChangeRef = useRef(onTrebDocumentChange);
  const onRegisterGetDocumentRef = useRef(onRegisterGetDocument);
  const onRegisterApplyStyleRef = useRef(onRegisterApplyStyle);
  useEffect(() => { onTrebDocumentChangeRef.current = onTrebDocumentChange; }, [onTrebDocumentChange]);
  useEffect(() => { onRegisterGetDocumentRef.current = onRegisterGetDocument; }, [onRegisterGetDocument]);
  useEffect(() => { onRegisterApplyStyleRef.current = onRegisterApplyStyle; }, [onRegisterApplyStyle]);
  const spreadsheetRef = useRef(spreadsheet);
  spreadsheetRef.current = spreadsheet;
  // Keep latest external document in a ref so the creation effect can pick it up even
  // when the document is set at the same time as the component mounts.
  const externalDocumentRef = useRef(externalDocument);
  externalDocumentRef.current = externalDocument;
  const onExternalDocumentConsumedRef = useRef(onExternalDocumentConsumed);
  onExternalDocumentConsumedRef.current = onExternalDocumentConsumed;

  type ContextMenuState = { x: number; y: number; left?: number; top?: number };
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const chartTypes = ['Scatter.Plot', 'Scatter.Line', 'Line.Chart', 'Bar.Chart', 'Column.Chart'] as const;
  type ChartType = typeof chartTypes[number];
  type ChartDialogState = { open: boolean; range: string; chartType: ChartType; title: string } | null;
  const [chartDialog, setChartDialog] = useState<ChartDialogState>(null);

  // Flip context menu above or left when it would be cut off by viewport
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const menuWidth = el.offsetWidth;
    const menuHeight = el.offsetHeight;
    const padding = 8;
    let left = contextMenu.left ?? contextMenu.x;
    let top = contextMenu.top ?? contextMenu.y;
    if (left + menuWidth + padding > vw) left = contextMenu.x - menuWidth;
    if (top + menuHeight + padding > vh) top = contextMenu.y - menuHeight;
    if (left < padding) left = padding;
    if (top < padding) top = padding;
    if (left !== (contextMenu.left ?? contextMenu.x) || top !== (contextMenu.top ?? contextMenu.y)) {
      setContextMenu(prev => prev ? { ...prev, left, top } : null);
    }
  }, [contextMenu?.x, contextMenu?.y]);

  useEffect(() => {
    const onFullScreenChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullScreenChange);
  }, []);

  const toggleFullScreen = useCallback(() => {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapperRef.current.requestFullscreen();
    }
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (isReadOnly) return;
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [isReadOnly]
  );
  const menuPosition = contextMenu
    ? { left: contextMenu.left ?? contextMenu.x, top: contextMenu.top ?? contextMenu.y }
    : undefined;

  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      const el = contextMenuRef.current;
      if (el && el.contains(e.target as Node)) return;
      closeContextMenu();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [contextMenu, closeContextMenu]);

  const applyFormat = useCallback((format: 'bold' | 'italic' | 'underline' | 'strike') => {
    const sheet = sheetRef.current;
    if (!sheet || isReadOnly) return;
    try {
      const style = (sheet as { selection_state?: { style?: Record<string, unknown> } }).selection_state?.style;
      const key = format === 'strike' ? 'strike' : format;
      const current = !!style?.[key as keyof typeof style];
      const next = !current;
      sheet.ApplyStyle(undefined, { [key]: next } as { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean }, true);
    } catch {
      // ignore
    }
  }, [isReadOnly]);
  const applyFormatRef = useRef(applyFormat);
  useEffect(() => {
    applyFormatRef.current = applyFormat;
  }, [applyFormat]);

  /** TREB CommandKey.Clear = 12; used to clear cell contents in selection */
  const TREB_CLEAR_KEY = 12;

  /** Paste using source formatting (value + style). Used by context menu Paste. */
  const runPasteWithSourceFormat = useCallback((sheet: EmbeddedSpreadsheet) => {
    try {
      const pasteOpts = { formatting: 'source' as const };
      const paste = (sheet as {
        Paste?: (target?: unknown, data?: unknown, options?: { formatting?: string }) => void;
      }).Paste;
      if (!paste) return;
      // TREB Paste(target?, data?, options?). Omit data so clipboard is used; pass options as 3rd arg.
      if (paste.length >= 3) {
        paste(undefined, undefined, pasteOpts);
      } else {
        paste(undefined, pasteOpts);
      }
    } catch {
      // TREB throws "no clipboard data" when nothing was copied; fail silently
    }
  }, []);

  const runContextAction = useCallback((
    action:
      | 'copy' | 'cut' | 'paste' | 'clear'
      | 'insert-row' | 'insert-column' | 'delete-row' | 'delete-column'
      | 'add-tab' | 'delete-tab'
      | 'resize-row' | 'resize-column'
  ) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    try {
      switch (action) {
        case 'copy':
          (sheet as { Copy?: (source?: unknown) => unknown }).Copy?.();
          break;
        case 'cut':
          (sheet as { Cut?: (source?: unknown) => unknown }).Cut?.();
          break;
        case 'paste': {
          // Paste with source formatting so merged-cell copy → single cell keeps style (bold, alignment, etc.)
          runPasteWithSourceFormat(sheet);
          break;
        }
        case 'clear': {
          const grid = (sheet as { grid?: { ExecCommand?: (cmd: { key: number; area: unknown }) => void }; GetSelectionReference?: () => { empty?: boolean; area?: unknown } }).grid;
          const sel = (sheet as { GetSelectionReference?: () => { empty?: boolean; area?: unknown } }).GetSelectionReference?.();
          if (grid?.ExecCommand && sel && !sel.empty && sel.area) {
            grid.ExecCommand({ key: TREB_CLEAR_KEY, area: sel.area });
          }
          break;
        }
        case 'insert-row':
          sheet.InsertRows();
          break;
        case 'insert-column':
          sheet.InsertColumns();
          break;
        case 'delete-row':
          sheet.DeleteRows();
          break;
        case 'delete-column':
          sheet.DeleteColumns();
          break;
        case 'add-tab':
          sheet.AddSheet();
          break;
        case 'delete-tab':
          sheet.DeleteSheet();
          break;
        case 'resize-row': {
          const getSel = (sheet as { GetSelectionReference?: () => { empty?: boolean; area?: { start: { row: number }; end: { row: number } } } }).GetSelectionReference;
          const sel = getSel?.();
          const rows: number[] = sel && !sel.empty && sel.area
            ? (() => {
                const r0 = Math.min(sel.area.start.row, sel.area.end.row);
                const r1 = Math.max(sel.area.start.row, sel.area.end.row);
                return Array.from({ length: r1 - r0 + 1 }, (_, i) => r0 + i);
              })()
            : [];
          closeContextMenu();
          if (rows.length === 0) return;
          const raw = window.prompt('Row height (number):', '24');
          if (raw != null) {
            const height = parseInt(raw.trim(), 10);
            if (!Number.isNaN(height) && height > 0) {
              (sheet as { SetRowHeight?: (row?: number | number[], height?: number) => void }).SetRowHeight?.(rows.length === 1 ? rows[0] : rows, height);
            }
          }
          return;
        }
        case 'resize-column': {
          const getSel = (sheet as { GetSelectionReference?: () => { empty?: boolean; area?: { start: { column: number }; end: { column: number } } } }).GetSelectionReference;
          const sel = getSel?.();
          const cols: number[] = sel && !sel.empty && sel.area
            ? (() => {
                const c0 = Math.min(sel.area.start.column, sel.area.end.column);
                const c1 = Math.max(sel.area.start.column, sel.area.end.column);
                return Array.from({ length: c1 - c0 + 1 }, (_, i) => c0 + i);
              })()
            : [];
          closeContextMenu();
          if (cols.length === 0) return;
          const raw = window.prompt('Column width (number):', '80');
          if (raw != null) {
            const width = parseInt(raw.trim(), 10);
            if (!Number.isNaN(width) && width > 0) {
              (sheet as { SetColumnWidth?: (column?: number | number[], width?: number) => void }).SetColumnWidth?.(cols.length === 1 ? cols[0] : cols, width);
            }
          }
          return;
        }
      }
    } catch {
      // TREB may throw in some states (e.g. deleting last sheet)
    }
    closeContextMenu();
  }, [closeContextMenu]);

  // F2 to enter edit mode (Excel/Sheets-style). TREB ignores F-keys; we intercept and call its internal edit.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || isReadOnly) return;

    const isElementEditable = (el: Element | null): boolean => {
      if (!el) return false;
      const node = el as HTMLElement;
      if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') return true;
      if (node.getAttribute?.('contenteditable') === 'true' || node.isContentEditable) return true;
      return false;
    };
    const isEventTargetOrAncestorEditable = (e: KeyboardEvent): boolean => {
      const target = e.target as Node | null;
      if (!target || !wrapper.contains(target)) return false;
      let current: Node | null = target;
      while (current && current !== wrapper) {
        if (current instanceof Element && isElementEditable(current)) return true;
        current = current.parentElement;
      }
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!wrapper.contains(document.activeElement as Node)) return;
      const sheet = sheetRef.current;
      if (!sheet) return;

      const activeEl = document.activeElement as HTMLElement | null;
      const isEditing =
        isElementEditable(activeEl) || isEventTargetOrAncestorEditable(e);

      // Block Delete/Backspace when selection contains any locked cell (use TREB live API).
      // Skip when user is editing (formula bar, in-cell editor). TREB's in-cell editor may not
      // focus a standard input, so also check event target and its ancestors for contenteditable/input.
      if (!isReadOnly && !isEditing && (e.key === 'Delete' || e.key === 'Backspace')) {
        try {
          const selection = (sheet as { GetSelectionReference?: () => { empty?: boolean; area?: { start: { row: number; column: number }; end: { row: number; column: number } } } }).GetSelectionReference?.();
          if (selection && !selection.empty && selection.area) {
            const grid = (sheet as { grid?: { active_sheet?: { CellData: (addr: { row: number; column: number }) => { style?: { locked?: boolean } } }; ExecCommand?: (cmd: { key: number; area: unknown }) => void } }).grid;
            const activeSheet = grid?.active_sheet;
            let hasLocked = false;
            // 1) Try TREB live API first (grid.active_sheet.CellData)
            if (activeSheet?.CellData) {
              const start = selection.area.start;
              const end = selection.area.end;
              const r0 = Math.min(start.row, end.row);
              const r1 = Math.max(start.row, end.row);
              const c0 = Math.min(start.column, end.column);
              const c1 = Math.max(start.column, end.column);
              for (let r = r0; r <= r1; r++) {
                for (let c = c0; c <= c1; c++) {
                  const data = activeSheet.CellData({ row: r, column: c });
                  if (data?.style?.locked) {
                    hasLocked = true;
                    break;
                  }
                }
                if (hasLocked) break;
              }
            }
            // 2) Fallback: check serialized document (template lock is in doc; live API may not expose it after LoadDocument)
            if (!hasLocked) {
              const doc = (sheet as { SerializeDocument?: () => TREBDocument }).SerializeDocument?.();
              if (doc) {
                const activeSheetIndex = typeof (doc as any).active_sheet === 'number' ? (doc as any).active_sheet : 0;
                hasLocked = selectionAreaContainsLockedCell(doc, selection, activeSheetIndex);
              }
            }
            if (hasLocked) {
              e.preventDefault();
              e.stopPropagation();
              if (onRequestUnlockLockedCell && grid?.ExecCommand) {
                const unlockAndClear = () => {
                  try {
                    const sh = sheetRef.current;
                    const sel = (sh as { GetSelectionReference?: () => TrebSelectionArea } | null)?.GetSelectionReference?.();
                    if (!sh || !sel || sel.empty || !sel.area) return;
                    const doc = sh.SerializeDocument();
                    const activeSheetIndex = typeof (doc as any).active_sheet === 'number' ? (doc as any).active_sheet : 0;
                    setLockedInSelectionArea(doc, sel, activeSheetIndex, false);
                    sh.LoadDocument(doc, { recalculate: false, flush: true });
                    (grid as { ExecCommand: (cmd: { key: number; area: unknown }) => void }).ExecCommand({ key: 12, area: sel.area });
                  } catch {
                    // ignore
                  }
                };
                onRequestUnlockLockedCell(unlockAndClear);
              }
              return;
            }
          }
        } catch {
          // ignore
        }
      }

      if (e.key !== 'F2') return;
      try {
        const selection = (sheet as { GetSelectionReference?: () => { empty?: boolean } }).GetSelectionReference?.();
        if (selection?.empty) return;
        e.preventDefault();
        e.stopPropagation();
        const grid = (sheet as { grid?: { OverlayEditCell?: (sel: unknown, flush: boolean, ev?: KeyboardEvent) => void } }).grid;
        // flush: false = keep existing value and place cursor at end (Excel-style F2)
        grid?.OverlayEditCell?.(selection, false, undefined);
      } catch {
        // ignore
      }
    };

    // Bubble phase: when focus is in the formula bar (INPUT/TEXTAREA only), stop arrow keys from
    // bubbling to TREB so they move the cursor in the formula bar. Do not intercept when focus
    // is in the grid (e.g. contenteditable cell) so arrow keys still navigate cells.
    const onKeyDownBubble = (e: KeyboardEvent) => {
      if (!wrapper.contains(e.target as Node)) return;
      const key = e.key;
      if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') return;
      const activeEl = document.activeElement as HTMLElement | null;
      const isFormulaBar = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (isFormulaBar) e.stopPropagation();
    };

    wrapper.addEventListener('keydown', onKeyDown, true);
    wrapper.addEventListener('keydown', onKeyDownBubble, false);
    return () => {
      wrapper.removeEventListener('keydown', onKeyDown, true);
      wrapper.removeEventListener('keydown', onKeyDownBubble, false);
    };
  }, [isReadOnly, onRequestUnlockLockedCell]);

  useEffect(() => {
    onSpreadsheetChangeRef.current = onSpreadsheetChange;
  }, [onSpreadsheetChange]);

  useEffect(() => {
    onCellSelectRef.current = onCellSelect;
  }, [onCellSelect]);

  const documentFromProps = useMemo(() => toTrebDocument(spreadsheet), [spreadsheet]);

  // Create TREB instance once on mount. Do NOT depend on spreadsheet/documentFromProps
  // so we never destroy/recreate on parent updates (which would reset selection to A1).
  useEffect(() => {
    if (!containerRef.current) return;

    const sheet = TREB.CreateSpreadsheet({
      container: containerRef.current,
      toolbar: 'show',
      formula_bar: true,
      headers: true,
      tab_bar: true,
      undo: true,
      in_cell_editor: !isReadOnly,
      add_tab: true,
      file_menu: false,
      export: false,
      font_scale: true,
      font_stack: true,
      markdown: true,
      chart_menu: !isReadOnly,
    });

    sheetRef.current = sheet;
    // Wrap DeleteSheet so the confirm shows whether the user deletes via our context menu or TREB's tab bar (e.g. X on tab).
    const originalDeleteSheet = sheet.DeleteSheet.bind(sheet);
    (sheet as { DeleteSheet: () => void }).DeleteSheet = () => {
      if (!window.confirm(DELETE_TAB_CONFIRM_MESSAGE)) return;
      originalDeleteSheet();
    };
    const token = sheet.Subscribe((event: EmbeddedSheetEvent) => {
      if (event.type === 'selection') {
        try {
          const selectedCellId = getSelectedCellId(sheet);
          if (selectedCellId) {
            onCellSelectRef.current?.(selectedCellId);
          }
        } catch {
          // TREB can throw from GetSelection in some states; avoid breaking the subscription
        }
      }

      if (event.type === 'document-change') {
        const currentDocument = sheet.SerializeDocument();
        const docWithFixedLongDate = normalizeLongDateInDocument(currentDocument);
        const serializedOriginal = normalizeDocumentForSync(currentDocument);
        const serializedFixed = normalizeDocumentForSync(docWithFixedLongDate);
        if (serializedOriginal !== serializedFixed) {
          try {
            sheet.LoadDocument(docWithFixedLongDate, { recalculate: true, flush: true });
          } catch {
            // ignore
          }
        }
        const docToUse = docWithFixedLongDate;
        lastSerializedRef.current = serializedFixed;
        skipNextPropSyncRef.current = true;
        onTrebDocumentChangeRef.current?.(docToUse);
        const converted = toSpreadsheetModel(docToUse, spreadsheetRef.current);
        const activeIdx = typeof (docToUse as any).active_sheet === 'number' ? Math.max(0, (docToUse as any).active_sheet) : 0;
        const activeTabIdFromDoc = converted.tabOrder?.[activeIdx] ?? converted.tabOrder?.[0];
        onSpreadsheetChangeRef.current?.(converted, { isFullReplace: false, activeTabId: activeTabIdFromDoc });
      }
    });
    subscriptionRef.current = token;

    const initialDoc = toTrebDocument(spreadsheetRef.current);
    sheet.LoadDocument(initialDoc, { recalculate: false, flush: true });
    lastSerializedRef.current = normalizeDocumentForSync(initialDoc);
    // Defer recalc so TREB's dependency graph sees a fully committed model (avoids "invalid address in range" warn).
    let recalcTimeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      recalcTimeoutId = null;
      try {
        sheet.Recalculate();
      } catch {
        // ignore
      }
    }, 0);

    // If an external document was already set when the sheet was created, load it now.
    if (externalDocumentRef.current) {
      const extDoc = externalDocumentRef.current;
      sheet.LoadDocument(extDoc, { recalculate: false, flush: true });
      lastSerializedRef.current = normalizeDocumentForSync(extDoc);
      skipNextPropSyncRef.current = true;
      const converted = toSpreadsheetModel(extDoc, spreadsheetRef.current);
      const extActiveIdx = typeof (extDoc as any).active_sheet === 'number' ? Math.max(0, (extDoc as any).active_sheet) : 0;
      const extActiveTabId = converted.tabOrder?.[extActiveIdx] ?? converted.tabOrder?.[0];
      onSpreadsheetChangeRef.current?.(converted, { isFullReplace: true, activeTabId: extActiveTabId });
      onExternalDocumentConsumedRef.current?.();
      if (recalcTimeoutId !== null) {
        clearTimeout(recalcTimeoutId);
        recalcTimeoutId = null;
      }
      recalcTimeoutId = setTimeout(() => {
        recalcTimeoutId = null;
        try {
          sheet.Recalculate();
        } catch {
          // ignore
        }
      }, 0);
    }

    // Let parent (e.g. template manager) get full document at save time so all sheets are persisted.
    // Include rendered_values so formula cells have calculated values for PDF/export.
    onRegisterGetDocumentRef.current?.(() => {
      try {
        return sheetRef.current?.SerializeDocument({ rendered_values: true }) ?? null;
      } catch {
        return null;
      }
    });

    // Let parent apply style (e.g. number_format for Custom format) to current selection.
    onRegisterApplyStyleRef.current?.(function applyStyleToSelection(style: { number_format?: string }) {
      const sheet = sheetRef.current;
      if (!sheet) return;
      try {
        (sheet as { ApplyStyle?: (range?: unknown, s?: unknown, delta?: boolean) => void }).ApplyStyle?.(undefined, style, true);
      } catch {
        // ignore
      }
    });

    // Inject Bold/Italic/Underline/Strikethrough inline next to font-stack in TREB toolbar
    let formatToolbarEl: HTMLDivElement | null = null;
    if (showFormatToolbar && !isReadOnly && containerRef.current) {
      const inject = () => {
        const container = containerRef.current;
        if (!container) return;
        const fontStack = container.querySelector('[font-stack]') as HTMLElement | null;
        if (!fontStack?.parentNode) return;
        const wrap = document.createElement('div');
        wrap.className = 'treb-format-inline';
        wrap.setAttribute('composite', '');
        wrap.style.display = 'inline-flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '2px';
        wrap.style.marginLeft = '6px';
        wrap.style.verticalAlign = 'middle';
        const labels: { format: 'bold' | 'italic' | 'underline' | 'strike'; title: string; className: string }[] = [
          { format: 'bold', title: 'Bold', className: 'font-bold' },
          { format: 'italic', title: 'Italic', className: 'italic' },
          { format: 'underline', title: 'Underline', className: 'underline' },
          { format: 'strike', title: 'Strikethrough', className: 'line-through' },
        ];
        labels.forEach(({ format, title, className }) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.title = title;
          btn.className = `treb-toolbar-format-btn ${className}`;
          btn.style.cssText = 'min-width:26px;padding:2px 5px;border-radius:3px;border:1px solid transparent;background:transparent;cursor:pointer;font-size:12px;line-height:1.2;';
          btn.textContent = format === 'bold' ? 'B' : format === 'italic' ? 'I' : format === 'underline' ? 'U' : 'S';
          btn.addEventListener('click', () => applyFormatRef.current?.(format));
          wrap.appendChild(btn);
        });
        fontStack.after(wrap);
        formatToolbarEl = wrap;
      };
      const tryInject = (attempt = 0) => {
        if (containerRef.current?.querySelector('[font-stack]')) {
          inject();
          return;
        }
        if (attempt < 10) setTimeout(() => tryInject(attempt + 1), 50);
      };
      tryInject();
    }

    return () => {
      if (recalcTimeoutId !== null) clearTimeout(recalcTimeoutId);
      formatToolbarEl?.remove?.();
      if (subscriptionRef.current !== null && sheetRef.current) {
        sheetRef.current.Cancel(subscriptionRef.current);
      }
      subscriptionRef.current = null;
      sheetRef.current = null;
    };
  }, [isReadOnly, showFormatToolbar]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally create once

  // Ensure context menus and format dropdowns are not cut off: add scroll when needed
  useEffect(() => {
    const styleId = 'lims-spreadsheet-dropdown-scroll';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .spreadsheet-grid-container [role="listbox"],
        .spreadsheet-grid-container [role="menu"],
        .spreadsheet-grid-container [role="list"] {
          max-height: ${DROPDOWN_MAX_HEIGHT} !important;
          overflow-y: auto !important;
        }
        /* TREB may render format dropdown in a portal; ensure any listbox/menu gets scroll when tall */
        [role="listbox"],
        [role="menu"] {
          max-height: ${DROPDOWN_MAX_HEIGHT} !important;
          overflow-y: auto !important;
        }
      `;
      document.head.appendChild(style);
    }

    const root = wrapperRef.current;
    if (!root) return;

    ensureMenusScrollable(root);

    const observer = new MutationObserver(() => {
      requestAnimationFrame(() => ensureMenusScrollable(root));
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  // Load a raw TREBDocument directly (used by template apply). Runs when externalDocument
  // changes to a non-null value after the sheet is already mounted. Notify parent so
  // spreadsheet state (e.g. row count) conforms to the template.
  // Defer clearing external doc so the parent's state update and the sync effect run first
  // with skipNextPropSyncRef set, avoiding the applied template being overwritten by stale documentFromProps.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !externalDocument) return;
    sheet.LoadDocument(externalDocument, { recalculate: true, flush: true });
    lastSerializedRef.current = normalizeDocumentForSync(externalDocument);
    skipNextPropSyncRef.current = true;
    const converted = toSpreadsheetModel(externalDocument, spreadsheetRef.current);
    const extActiveIdx = typeof (externalDocument as any).active_sheet === 'number' ? Math.max(0, (externalDocument as any).active_sheet) : 0;
    const extActiveTabId = converted.tabOrder?.[extActiveIdx] ?? converted.tabOrder?.[0];
    onSpreadsheetChangeRef.current?.(converted, { isFullReplace: true, activeTabId: extActiveTabId });
    const clearExternal = onExternalDocumentConsumedRef.current;
    if (clearExternal) {
      const id = setTimeout(() => {
        clearExternal();
      }, 0);
      return () => clearTimeout(id);
    }
  }, [externalDocument]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external document changes into TREB (e.g. new sheet from dialog). Skip when
  // the change came from TREB itself so selection is not reset to A1.
  // When we just loaded an external template, keep TREB as source of truth (don't overwrite with plain state).
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    if (skipNextPropSyncRef.current) {
      skipNextPropSyncRef.current = false;
      try {
        lastSerializedRef.current = normalizeDocumentForSync(sheet.SerializeDocument());
      } catch {
        lastSerializedRef.current = normalizeDocumentForSync(documentFromProps);
      }
      return;
    }

    const serialized = normalizeDocumentForSync(documentFromProps);
    if (serialized === lastSerializedRef.current) {
      return;
    }

    const currentDoc = sheet.SerializeDocument();
    // When current has rich formatting (e.g. date format) and props doc is plain, merge our cell values into current
    // so programmatic updates apply while preserving TREB formatting.
    if (trebDocHasRichFormatting(currentDoc) && !trebDocHasRichFormatting(documentFromProps)) {
      const merged = mergeCellValuesIntoDoc(currentDoc, documentFromProps);
      const nextDoc = mergeCurrentSelectionState(merged, currentDoc);
      sheet.LoadDocument(nextDoc, { recalculate: true, flush: true });
      lastSerializedRef.current = normalizeDocumentForSync(nextDoc);
      return;
    }

    const nextDoc = mergeCurrentSelectionState(documentFromProps, currentDoc);
    sheet.LoadDocument(nextDoc, { recalculate: true, flush: true });
    lastSerializedRef.current = normalizeDocumentForSync(nextDoc);
  }, [documentFromProps]);

  const openChartFromSelection = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    try {
      const sel = sheet.GetSelection(true);
      if (!sel || !sel.trim()) {
        return;
      }
      const range = sel.trim();
      const isRange = range.includes(':');
      if (!isRange) {
        return;
      }
      setChartDialog({
        open: true,
        range,
        chartType: 'Scatter.Plot',
        title: range,
      });
    } catch {
      // GetSelection can throw in some states
    }
  }, []);

  const insertChartFromDialog = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet || !chartDialog) return;
    const { range, chartType, title } = chartDialog;
    const safeTitle = (title || range).replace(/"/g, '""');
    let formula: string;
    if (chartType === 'Scatter.Plot' || chartType === 'Scatter.Line') {
      formula = `=${chartType}(Series(,,${range}),"${safeTitle}")`;
    } else {
      formula = `=${chartType}(${range},,"${safeTitle}")`;
    }
    try {
      sheet.InsertAnnotation(formula, 'treb-chart', undefined, { argument_separator: ',' });
    } catch {
      // ignore
    }
    setChartDialog(null);
  }, [chartDialog]);

  const showToolbar = toolbarSlot || showFullScreenButton || !isReadOnly;

  return (
    <div
      ref={wrapperRef}
      className={`spreadsheet-grid-container flex flex-col border border-gray-300 rounded-lg overflow-hidden bg-white ${isFullScreen || fillHeight ? 'h-full min-h-0' : ''}`}
    >
      {showToolbar && (
        <div className="flex items-center gap-2 px-2 py-1 bg-gray-100 border-b border-gray-300 shrink-0">
          <div className="flex-1" />
          {toolbarSlot}
          {!isReadOnly && (
            <button
              type="button"
              onClick={openChartFromSelection}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-xs text-gray-700 font-medium transition-colors"
              title="Insert chart from selected range (select a range first)"
            >
              <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M3 3v18h18V3H3zm16 16H5V5h14v14zM7 12h2v5H7v-5zm4-3h2v8h-2V9zm4-2h2v10h-2V7z" />
              </svg>
              Chart from selection
            </button>
          )}
          {showFullScreenButton && (
            <button
              type="button"
              onClick={toggleFullScreen}
              className="rounded p-1.5 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
              title={isFullScreen ? 'Exit full screen (Esc)' : 'Full screen'}
              aria-label={isFullScreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullScreen ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </button>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        className={`lims-treb-grid flex-1 ${fillHeight || isFullScreen ? 'min-h-0' : 'min-h-[480px] h-[70vh]'} ${isReadOnly ? 'pointer-events-none opacity-90' : ''}`}
        onContextMenu={handleContextMenu}
      />
      {contextMenu &&
        createPortal(
          <div
            ref={contextMenuRef}
            className="fixed z-[10000] min-w-[180px] rounded-md border border-gray-300 bg-white py-1 shadow-lg"
            style={menuPosition ? { left: menuPosition.left, top: menuPosition.top } : undefined}
            role="menu"
          >
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              onClick={() => runContextAction('copy')}
              role="menuitem"
            >
              Copy
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              onClick={() => runContextAction('cut')}
              role="menuitem"
            >
              Cut
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              onClick={() => runContextAction('paste')}
              role="menuitem"
            >
              Paste
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              onClick={() => runContextAction('clear')}
              role="menuitem"
            >
              Clear contents
            </button>
            <div className="my-1 border-t border-gray-200" role="separator" />
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              onClick={() => runContextAction('insert-row')}
              role="menuitem"
            >
              Insert row
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              onClick={() => runContextAction('insert-column')}
              role="menuitem"
            >
              Insert column
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              onClick={() => runContextAction('delete-row')}
              role="menuitem"
            >
              Delete row
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              onClick={() => runContextAction('delete-column')}
              role="menuitem"
            >
              Delete column
            </button>
            <div className="my-1 border-t border-gray-200" role="separator" />
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              onClick={() => runContextAction('resize-row')}
              role="menuitem"
            >
              Resize row…
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              onClick={() => runContextAction('resize-column')}
              role="menuitem"
            >
              Resize column…
            </button>
            <div className="my-1 border-t border-gray-200" role="separator" />
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              onClick={() => runContextAction('add-tab')}
              role="menuitem"
            >
              Add tab
            </button>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              onClick={() => runContextAction('delete-tab')}
              role="menuitem"
            >
              Delete tab
            </button>
          </div>,
          isFullScreen && wrapperRef.current ? wrapperRef.current : document.body
        )}
      {chartDialog?.open &&
        createPortal(
          <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="chart-dialog-title">
            <div className="bg-white rounded-lg shadow-xl p-4 w-full max-w-sm mx-4">
              <h2 id="chart-dialog-title" className="text-lg font-semibold text-gray-900 mb-3">Insert chart from selection</h2>
              <p className="text-sm text-gray-600 mb-3">Range: <span className="font-mono">{chartDialog.range}</span></p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="chart-type" className="block text-sm font-medium text-gray-700 mb-1">Chart type</label>
                  <select
                    id="chart-type"
                    value={chartDialog.chartType}
                    onChange={(e) => setChartDialog((d) => d ? { ...d, chartType: e.target.value as ChartType } : null)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="Scatter.Plot">Scatter (points)</option>
                    <option value="Scatter.Line">Scatter (line)</option>
                    <option value="Line.Chart">Line chart</option>
                    <option value="Bar.Chart">Bar chart</option>
                    <option value="Column.Chart">Column chart</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="chart-title" className="block text-sm font-medium text-gray-700 mb-1">Chart title</label>
                  <input
                    id="chart-title"
                    type="text"
                    value={chartDialog.title}
                    onChange={(e) => setChartDialog((d) => d ? { ...d, title: e.target.value } : null)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="Chart title"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setChartDialog(null)}
                  className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={insertChartFromDialog}
                  className="px-3 py-1.5 text-sm rounded border border-primary-500 bg-primary-600 text-white hover:bg-primary-700"
                >
                  Insert chart
                </button>
              </div>
            </div>
          </div>,
          isFullScreen && wrapperRef.current ? wrapperRef.current : document.body
        )}
    </div>
  );
};

