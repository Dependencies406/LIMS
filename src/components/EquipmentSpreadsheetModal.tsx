/**
 * Equipment Spreadsheet Modal
 * Modal wrapper for spreadsheet module bound to a specific equipment
 * 
 * This component is part of the Job module, NOT the Spreadsheet module.
 * It handles:
 * - Loading/saving spreadsheet data from Equipment
 * - Enforcing read-only based on Job status
 * - Persisting data back to Equipment
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Equipment, Job } from '../types';
import type { SpreadsheetModel, Cell, CellDataType } from '../modules/spreadsheet/models';
import { createEmptySpreadsheet, parseCellId, generateCellId, DEFAULT_SPREADSHEET_ROW_COUNT } from '../modules/spreadsheet/models/SpreadsheetModel';
import { SpreadsheetEditorCore } from '../modules/spreadsheet/components';
import { loadDocumentForSpreadsheet, serializeDocumentForStorage } from '../modules/spreadsheet/utils/spreadsheetSessionUtils';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { Card } from './common/Card';
import { Modal, ModalFooter, Button, LoadingSpinner } from './common';
import { convertDesktopToWeb } from '../modules/spreadsheet/utils/dataFormatConverter';
import { evaluateSpreadsheet } from '../modules/spreadsheet/services/spreadsheetEngine';
import { shiftAllFormulaReferences } from '../modules/spreadsheet/utils/formulaShifter';
import ExcelJS from 'exceljs';
import { certificateNumberConfigService } from '../services/certificateNumberConfigService';
import { generateCertificateNumber } from '../services/certificateNumberGeneratorService';
import type { CertificateNumberConfig } from '../types';
import type { ColumnDefinition } from '../modules/spreadsheet/models/SpreadsheetModel';
import { generateSpreadsheetPdf } from '../services/spreadsheetPdfService';
import { PdfPreviewModal } from './PdfPreviewModal';
import { FormulaVerificationModal } from './FormulaVerificationModal';
import {
  spreadsheetTemplateService,
  type SpreadsheetTemplate,
} from '../services/spreadsheetTemplateService';
import type { TREBDocument } from '@trebco/treb';
import { ensureTrebDocumentSheetRowCounts, trebDocumentToSpreadsheetModel } from '../modules/spreadsheet/utils/trebDocumentUtils';
import { migrateSpreadsheetToTabs, getSpreadsheetCells, getSpreadsheetColumnDefinitions, getSpreadsheetColumnOrder } from '../modules/spreadsheet/utils/tabMigration';
import jsPDF from 'jspdf';
import { transformInternalFormulaToExcel } from '../utils/formulaHelpers';

const OFFLINE_HASH_CELL_LABEL = '__OFFLINE_HASH__';
const OFFLINE_TIMESTAMP_CELL_LABEL = '__OFFLINE_TIMESTAMP__';
const OFFLINE_TEMPLATE_CELL_LABEL = '__OFFLINE_TEMPLATE__';
const OFFLINE_FILENAME_CELL_LABEL = '__OFFLINE_FILENAME__';

const getExcelColumnLetter = (index: number): string => {
  let column = '';
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    current = Math.floor((current - 1) / 26);
  }
  return column;
};

const sanitizeWorksheetName = (name: string): string => {
  const fallback = 'Sheet1';
  const sanitized = (name || fallback).replace(/[:\\/?*\[\]]/g, '_').trim();
  if (!sanitized) return fallback;
  return sanitized.slice(0, 31);
};

const applyExcelRowIndexToFormula = (formula: string, excelRowNumber: number): string => {
  const reservedKeywords = new Set(['TRUE', 'FALSE', 'AND', 'OR', 'NOT']);
  const formulaWithRows = formula.replace(/\b([A-Z]{1,3})(?!\d)\b/g, (match, token, offset, source) => {
    const upperToken = token.toUpperCase();
    const nextChar = source[offset + token.length];
    if (nextChar === '(') {
      return match;
    }
    if (reservedKeywords.has(upperToken)) {
      return match;
    }
    return `${upperToken}${excelRowNumber}`;
  });
  return formulaWithRows.startsWith('=') ? formulaWithRows : `=${formulaWithRows}`;
};

const buildOfflineValidationPayload = (
  jobId: string,
  templateId: string,
  timestamp: string
): string => {
  return `${jobId}|${templateId}|${timestamp}`;
};

/** Returns true for read-only non-formula columns (treated as calibration/input data columns). */
const isCalibrationPointColumn = (key: string, def: ColumnDefinition): boolean => {
  void key;
  return def.readOnly === true && def.type !== 'formula' && !def.formula;
};


export interface EquipmentSpreadsheetModalProps {
  isOpen: boolean;
  equipment: Equipment;
  equipmentIndex: number;
  job: Job;
  onClose: () => void;
  /** Saves spreadsheet to equipment and persists the job (e.g. to Firestore). Can return a Promise so the modal waits for the job save to complete. */
  onSave: (equipmentIndex: number, spreadsheetData: Equipment['spreadsheetData']) => void | Promise<void>;
  onCertificateNumberGenerated?: (equipmentIndex: number, certificateNumber: string) => void;
}

export const EquipmentSpreadsheetModal: React.FC<EquipmentSpreadsheetModalProps> = ({
  isOpen,
  equipment,
  equipmentIndex,
  job,
  onClose,
  onSave,
  onCertificateNumberGenerated,
}) => {
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();

  const [spreadsheet, setSpreadsheet] = useState<SpreadsheetModel | null>(null);
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [history, setHistory] = useState<SpreadsheetModel[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isUndoRedo, setIsUndoRedo] = useState(false);
  const isUndoRedoRef = useRef(false);
  const [showCertificateNumberConfirm, setShowCertificateNumberConfirm] = useState(false);
  const [showCertificateNumberError, setShowCertificateNumberError] = useState(false);
  const [certificateConfigs, setCertificateConfigs] = useState<CertificateNumberConfig[]>([]);
  const [generatingCertificateNumber, setGeneratingCertificateNumber] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<jsPDF | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');
  const [showFormulaVerification, setShowFormulaVerification] = useState(false);
  const [verificationRowIndex, setVerificationRowIndex] = useState<number>(0);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [tabs, setTabs] = useState<Array<{ id: string; name: string; order: number }>>([]);

  // â”€â”€â”€ TREB-based spreadsheet template picker â”€â”€â”€
  const [showTrebTemplatePicker, setShowTrebTemplatePicker] = useState(false);
  const [trebTemplates, setTrebTemplates] = useState<SpreadsheetTemplate[]>([]);
  const [loadingTrebTemplates, setLoadingTrebTemplates] = useState(false);
  const [pendingTrebTemplate, setPendingTrebTemplate] = useState<SpreadsheetTemplate | null>(null);
  const [showTrebTemplateConfirm, setShowTrebTemplateConfirm] = useState(false);
  /** External TREB document to load into SpreadsheetGrid when a template is applied. */
  const [externalTrebDocument, setExternalTrebDocument] = useState<TREBDocument | null>(null);
  /** Latest TREB document from the grid (for saving so reload preserves format/tabs). */
  const latestTrebDocRef = useRef<TREBDocument | null>(null);
  /** Getter registered by SpreadsheetGrid to return current TREB doc from SerializeDocument() — use at save time so format/formulas persist. */
  const getTrebDocumentRef = useRef<(() => TREBDocument | null) | null>(null);
  /** Apply style (e.g. number_format) to current selection — used by shared toolbar Custom format. */
  const applyStyleRef = useRef<((style: { number_format?: string }) => void) | null>(null);
  /** Unlock password modal: when user tries to clear a locked cell and a password is set. */
  const [showUnlockPasswordModal, setShowUnlockPasswordModal] = useState(false);
  const [unlockPasswordInput, setUnlockPasswordInput] = useState('');
  const [unlockPasswordError, setUnlockPasswordError] = useState<string | null>(null);
  const pendingUnlockActionRef = useRef<(() => void) | null>(null);
  const [lastOfflineExportHash, setLastOfflineExportHash] = useState<string>('');
  const [lastOfflineExportFileName, setLastOfflineExportFileName] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const selectedTemplateIdRef = useRef(selectedTemplateId);
  selectedTemplateIdRef.current = selectedTemplateId;
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('');

  // Desktop app doesn't enforce read-only based on job status
  // Spreadsheet is always editable (matching desktop behavior)
  const isReadOnly = false;

  const historyInitRef = useRef<string | null>(null);

  const serializeSpreadsheetForHistory = useCallback((model: SpreadsheetModel) => {
    const serializeMap = (map?: Map<string, any>) => (map ? Object.fromEntries(map) : undefined);
    const serialized: any = {
      ...model,
      cells: serializeMap(model.cells),
      formulas: serializeMap(model.formulas),
      variables: serializeMap(model.variables),
      columnDefinitions: serializeMap(model.columnDefinitions),
    };
    if (model.tabs && model.tabs instanceof Map) {
      serialized.tabs = Array.from(model.tabs.entries()).map(([tabId, tab]) => ({
        ...tab,
        id: tabId,
        cells: serializeMap(tab.cells),
        columnDefinitions: serializeMap(tab.columnDefinitions),
      }));
      serialized.tabOrder = model.tabOrder || Array.from(model.tabs.keys());
    }
    return serialized;
  }, []);

  const restoreSpreadsheetFromHistory = useCallback((snapshot: any): SpreadsheetModel => {
    const restored = { ...snapshot } as any;
    if (restored.cells && !(restored.cells instanceof Map)) {
      restored.cells = new Map(Object.entries(restored.cells));
    }
    if (restored.formulas && !(restored.formulas instanceof Map)) {
      restored.formulas = new Map(Object.entries(restored.formulas || {}));
    }
    if (restored.variables && !(restored.variables instanceof Map)) {
      restored.variables = new Map(Object.entries(restored.variables || {}));
    }
    if (restored.columnDefinitions && !(restored.columnDefinitions instanceof Map)) {
      restored.columnDefinitions = new Map(Object.entries(restored.columnDefinitions));
    }
    if (restored.tabs && Array.isArray(restored.tabs)) {
      const tabsMap = new Map();
      restored.tabs.forEach((tab: any) => {
        if (!tab || typeof tab !== 'object') return;
        const tabCells = tab.cells && !(tab.cells instanceof Map) ? new Map(Object.entries(tab.cells)) : tab.cells;
        const tabColDefs = tab.columnDefinitions && !(tab.columnDefinitions instanceof Map)
          ? new Map(Object.entries(tab.columnDefinitions))
          : tab.columnDefinitions;
        tabsMap.set(tab.id, {
          ...tab,
          cells: tabCells || new Map(),
          columnDefinitions: tabColDefs,
        });
      });
      restored.tabs = tabsMap;
    }
    return restored as SpreadsheetModel;
  }, []);

  // Initialize history when spreadsheet is loaded
  useEffect(() => {
    if (!isOpen) {
      historyInitRef.current = null;
      return;
    }
    if (spreadsheet && !isUndoRedo && historyInitRef.current !== spreadsheet.id) {
      const snapshot = serializeSpreadsheetForHistory(spreadsheet);
      setHistory([JSON.parse(JSON.stringify(snapshot))]);
      setHistoryIndex(0);
      historyInitRef.current = spreadsheet.id;
    }
  }, [isOpen, spreadsheet, isUndoRedo, serializeSpreadsheetForHistory]);


  // Load certificate number configs
  useEffect(() => {
    if (!isOpen) return;
    
    let isMounted = true;
    
    (async () => {
      try {
        const activeConfigs = await certificateNumberConfigService.getActiveConfigs();
        if (isMounted) {
          setCertificateConfigs(activeConfigs);
        }
      } catch (err) {
        console.error('[EquipmentSpreadsheetModal] Failed to load certificate number configs:', err);
        if (isMounted) {
          // Don't show error toast on mount - just log it
          // Error will be shown when user tries to generate
        }
      }
    })();
    
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Reset spreadsheet state when modal closes so next open doesn't show stale row count
  useEffect(() => {
    if (!isOpen) {
      setSpreadsheet(null);
    }
  }, [isOpen]);

  // Load spreadsheet data from equipment (load once per equipment)
  const spreadsheetLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) {
      spreadsheetLoadedRef.current = null;
      return;
    }

    // Guard: prevent reloading if already loaded for this equipment
    const equipmentKey = `${equipmentIndex}-${equipment.spreadsheetData?.spreadsheetId || 'new'}`;
    if (spreadsheetLoadedRef.current === equipmentKey) {
      return;
    }

    try {
      if (equipment.spreadsheetData?.spreadsheetModel) {
        // Load existing spreadsheet
        const loadedSpreadsheet = equipment.spreadsheetData.spreadsheetModel as SpreadsheetModel;
        
        // Check if it's desktop format (has columns and data properties)
        if ((loadedSpreadsheet as any).columns && (loadedSpreadsheet as any).data) {
          // Convert from desktop format
          const desktopModel = loadedSpreadsheet as any;
          const converted = convertDesktopToWeb(
            desktopModel,
            desktopModel.spreadsheetId || `equipment-${equipmentIndex}-${Date.now()}`,
            desktopModel.templateName || `${equipment.name || 'Equipment'} - Calculation`,
            currentUser?.uid || 'unknown'
          );
          // Migrate to tabs if needed
          const migrated = migrateSpreadsheetToTabs(converted);
          setSpreadsheet(migrated);
          spreadsheetLoadedRef.current = equipmentKey;
          if (desktopModel.templateId) {
            setSelectedTemplateId(desktopModel.templateId);
          }
        } else {
          // Web format - convert Maps from serialized format if needed
          if (loadedSpreadsheet.cells && !(loadedSpreadsheet.cells instanceof Map)) {
            loadedSpreadsheet.cells = new Map(Object.entries(loadedSpreadsheet.cells));
          }
          if (loadedSpreadsheet.formulas && !(loadedSpreadsheet.formulas instanceof Map)) {
            loadedSpreadsheet.formulas = new Map(Object.entries(loadedSpreadsheet.formulas || {}));
          }
          if (loadedSpreadsheet.variables && !(loadedSpreadsheet.variables instanceof Map)) {
            loadedSpreadsheet.variables = new Map(Object.entries(loadedSpreadsheet.variables || {}));
          }
          if (loadedSpreadsheet.columnDefinitions && !(loadedSpreadsheet.columnDefinitions instanceof Map)) {
            loadedSpreadsheet.columnDefinitions = new Map(Object.entries(loadedSpreadsheet.columnDefinitions));
          }
          
          // Deserialize tabs if they exist (avoid Firestore empty-Map placeholder)
          const rawTabs = loadedSpreadsheet.tabs;
          const isEmptyMapPlaceholder = rawTabs && typeof rawTabs === 'object' && !Array.isArray(rawTabs) && !(rawTabs instanceof Map) &&
            (rawTabs as any).__type === 'Map' && ((rawTabs as any).size === 0 || !(rawTabs as any).entries?.length);
          if (isEmptyMapPlaceholder) {
            (loadedSpreadsheet as any).tabs = undefined;
            (loadedSpreadsheet as any).tabOrder = undefined;
          } else if (rawTabs && !(rawTabs instanceof Map)) {
            if (Array.isArray(rawTabs) && (rawTabs as any[]).length > 0) {
              const tabsMap = new Map();
              const tabsArray = rawTabs as any[];
              tabsArray.forEach((tab: any) => {
                if (tab && typeof tab === 'object' && tab.id != null) {
                  if (tab.cells && !(tab.cells instanceof Map)) {
                    tab.cells = new Map(Object.entries(tab.cells));
                  }
                  if (tab.columnDefinitions && !(tab.columnDefinitions instanceof Map)) {
                    tab.columnDefinitions = new Map(Object.entries(tab.columnDefinitions));
                  }
                  tabsMap.set(tab.id, tab);
                }
              });
              loadedSpreadsheet.tabs = tabsMap;
            } else if (typeof rawTabs === 'object' && !Array.isArray(rawTabs) && !(rawTabs as any).__type) {
              const tabsMap = new Map();
              Object.entries(rawTabs).forEach(([key, tab]: [string, any]) => {
                if (tab && typeof tab === 'object') {
                  if (tab.cells && !(tab.cells instanceof Map)) {
                    tab.cells = new Map(Object.entries(tab.cells));
                  }
                  if (tab.columnDefinitions && !(tab.columnDefinitions instanceof Map)) {
                    tab.columnDefinitions = new Map(Object.entries(tab.columnDefinitions));
                  }
                  tabsMap.set(key, tab);
                }
              });
              loadedSpreadsheet.tabs = tabsMap;
            }
          }
          
          // Ensure columnOrder is an array
          if (!loadedSpreadsheet.columnOrder || !Array.isArray(loadedSpreadsheet.columnOrder)) {
            // Try to extract columnOrder from columnDefinitions if available
            if (loadedSpreadsheet.columnDefinitions instanceof Map) {
              loadedSpreadsheet.columnOrder = Array.from(loadedSpreadsheet.columnDefinitions.keys());
            } else if (loadedSpreadsheet.columnDefinitions && typeof loadedSpreadsheet.columnDefinitions === 'object') {
              loadedSpreadsheet.columnOrder = Object.keys(loadedSpreadsheet.columnDefinitions);
            } else {
              loadedSpreadsheet.columnOrder = [];
            }
          }
          
          // Migrate to tabs if needed
          const migrated = migrateSpreadsheetToTabs(loadedSpreadsheet);
          setSpreadsheet(migrated);
          spreadsheetLoadedRef.current = equipmentKey;
          if (loadedSpreadsheet.metadata?.templateId) {
            setSelectedTemplateId(loadedSpreadsheet.metadata.templateId);
          }
          if (equipment.spreadsheetData?.trebDocument) {
            setExternalTrebDocument(loadDocumentForSpreadsheet(equipment.spreadsheetData.trebDocument as TREBDocument));
          }
        }
      } else {
        // No existing spreadsheet — create a blank one so TREB opens immediately.
        // The user can enter data directly or apply a template.
        const blank = createEmptySpreadsheet(
          `equipment-${equipmentIndex}-${Date.now()}`,
          `${equipment.name || 'Equipment'} - Calculation`,
          currentUser?.uid || 'unknown',
          DEFAULT_SPREADSHEET_ROW_COUNT,
          26
        );
        const migrated = migrateSpreadsheetToTabs(blank);
        setSpreadsheet(migrated);
        spreadsheetLoadedRef.current = equipmentKey;
      }

      setHasChanges(false);
    } catch (err) {
      showError('Failed to load spreadsheet data');
      console.error(err);
    }
  }, [isOpen, equipment.spreadsheetData?.spreadsheetId, equipmentIndex, currentUser, showError]);

  // Set up tabs when spreadsheet changes
  useEffect(() => {
    if (spreadsheet) {
      if (spreadsheet.tabs && spreadsheet.tabs.size > 0) {
        const tabsArray = Array.from(spreadsheet.tabs.values())
          .sort((a, b) => a.order - b.order)
          .map(tab => ({ id: tab.id, name: tab.name, order: tab.order }));
        setTabs(tabsArray);
        
        if (spreadsheet.tabOrder && spreadsheet.tabOrder.length > 0) {
          setActiveTabId(spreadsheet.tabOrder[0]);
        } else if (tabsArray.length > 0) {
          setActiveTabId(tabsArray[0].id);
        }
      } else {
        // No tabs - migration should have created at least one
        // Set empty tabs array, will be handled by migration
        setTabs([]);
        setActiveTabId('');
      }
    } else {
      setTabs([]);
      setActiveTabId('');
    }
  }, [spreadsheet]);

  // Handle cell selection (use synthetic cell for empty cells when needed)
  const handleCellSelect = useCallback((cellId: string | null) => {
    if (cellId == null) {
      setSelectedCell(null);
      return;
    }
    if (!spreadsheet) return;
    const cells = getSpreadsheetCells(spreadsheet, activeTabId);
    let cell = cells.get(cellId);
    if (!cell) {
      try {
        const { row, column } = parseCellId(cellId);
        cell = {
          id: cellId,
          row,
          column,
          dataType: 'text',
          displayValue: '',
          rawValue: null,
        };
      } catch {
        cell = null;
      }
    }
    setSelectedCell(cell);
  }, [spreadsheet, activeTabId]);

  /** True if the given cell's column uses a date format (Long Date, Short Date, Timestamp, or mask with date tokens). */
  const isDateFormattedCell = useCallback((s: SpreadsheetModel | null, tabId: string, cell: Cell | null): boolean => {
    if (!s || !cell) return false;
    const tab = s.tabs?.get(tabId);
    const columnOrder = tab?.columnOrder ?? s.columnOrder ?? [];
    const columnDefinitions = tab?.columnDefinitions ?? s.columnDefinitions;
    if (!columnDefinitions || cell.column >= columnOrder.length) return false;
    const columnName = columnOrder[cell.column];
    const colDef = columnDefinitions.get(columnName);
    const mask = (colDef as { formatMask?: string; format_mask?: string } | undefined)?.formatMask ?? (colDef as { format_mask?: string })?.format_mask ?? cell.format?.numberFormat ?? '';
    if (!mask || typeof mask !== 'string') return false;
    const m = mask.toLowerCase();
    return m === 'long date' || m === 'short date' || m === 'timestamp' ||
      /\b(yyyy|yy|mmmm|mmm|mm|dd|d)\b/.test(m) || /mm\/dd|dd\/mm|yyyy|mmm/.test(m);
  }, []);

  // Handle spreadsheet history for undo/redo
  const saveToHistory = useCallback((spreadsheetToSave: SpreadsheetModel) => {
    const snapshot = serializeSpreadsheetForHistory(spreadsheetToSave);
    setHistory((prevHistory) => {
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(snapshot)));
      return newHistory.slice(-50);
    });
    setHistoryIndex((prevIndex) => Math.min(prevIndex + 1, 49));
  }, [historyIndex, serializeSpreadsheetForHistory]);

  // Enrich a spreadsheet model with the currently-selected template metadata before saving.
  const applyTemplateMetadata = useCallback((model: SpreadsheetModel): SpreadsheetModel => {
    return {
      ...model,
      metadata: {
        ...model.metadata,
        templateId: selectedTemplateId || model.metadata?.templateId,
      },
    };
  }, [selectedTemplateId]);

  // Helper function to swap row references in formulas
  const swapRowReferencesInFormula = useCallback((formula: string, row1: number, row2: number): string => {
    if (!formula) return formula;
    
    // Handle formulas with or without "=" prefix
    const hasEquals = formula.startsWith('=');
    const expression = hasEquals ? formula.substring(1) : formula;
    
    // Pattern to match cell references: A1, B2, AA10, etc.
    const cellRefPattern = /\b([A-Z]+)(\d+)\b/gi;
    
    const swapped = expression.replace(cellRefPattern, (match) => {
      try {
        const { row, column } = parseCellId(match.toUpperCase());
        let newRow = row;
        
        // Swap row references
        if (row === row1) {
          newRow = row2;
        } else if (row === row2) {
          newRow = row1;
        }
        
        return generateCellId(newRow, column);
      } catch (error) {
        return match; // Return original if parsing fails
      }
    });
    
    return hasEquals ? '=' + swapped : swapped;
  }, []);

  // Move row up (swap with row above)
  const handleMoveRowUp = useCallback(() => {
    if (!spreadsheet || !selectedCell) return;
    
    const { row } = parseCellId(selectedCell.id);
    if (row === 0) return; // Can't move first row up
    
    const targetRow = row - 1;
    
    // Create a map to track new cell positions
    const updatedCells = new Map<string, Cell>();
    const updatedColumnDefinitions = spreadsheet.columnDefinitions ? new Map(spreadsheet.columnDefinitions) : undefined;
    
    // First, collect all cells from both rows
    const currentRowCells: Cell[] = [];
    const targetRowCells: Cell[] = [];
    
    const cells = getSpreadsheetCells(spreadsheet, activeTabId);
    for (const [cellId, cell] of cells.entries()) {
      if (cell.row === row) {
        currentRowCells.push(cell);
      } else if (cell.row === targetRow) {
        targetRowCells.push(cell);
      } else {
        // Keep other cells as-is, but update their formulas if they reference swapped rows
        let updatedCell = { ...cell };
        if (updatedCell.formula) {
          updatedCell.formula = swapRowReferencesInFormula(updatedCell.formula, row, targetRow);
        }
        updatedCells.set(cellId, updatedCell);
      }
    }
    
    // Swap rows: move current row cells to target row, and target row cells to current row
    currentRowCells.forEach(cell => {
      const newCellId = generateCellId(targetRow, cell.column);
      const updatedCell: Cell = {
        ...cell,
        id: newCellId,
        row: targetRow,
      };
      
      // Update formula references (swap row references)
      if (updatedCell.formula) {
        updatedCell.formula = swapRowReferencesInFormula(updatedCell.formula, row, targetRow);
      }
      
      updatedCells.set(newCellId, updatedCell);
    });
    
    targetRowCells.forEach(cell => {
      const newCellId = generateCellId(row, cell.column);
      const updatedCell: Cell = {
        ...cell,
        id: newCellId,
        row: row,
      };
      
      // Update formula references
      if (updatedCell.formula) {
        updatedCell.formula = swapRowReferencesInFormula(updatedCell.formula, row, targetRow);
      }
      
      updatedCells.set(newCellId, updatedCell);
    });
    
    // Update column definition formulas
    if (updatedColumnDefinitions) {
      for (const [colName, colDef] of updatedColumnDefinitions.entries()) {
        if (colDef.formula) {
          updatedColumnDefinitions.set(colName, {
            ...colDef,
            formula: swapRowReferencesInFormula(colDef.formula, row, targetRow),
          });
        }
      }
    }
    
    const updatedSpreadsheet: SpreadsheetModel = {
      ...spreadsheet,
      cells: updatedCells,
      columnDefinitions: updatedColumnDefinitions,
      updatedAt: new Date(),
    };
    
    setSpreadsheet(updatedSpreadsheet);
    if (!isUndoRedo) {
      saveToHistory(updatedSpreadsheet);
    }
    setHasChanges(true);
    
    // Update selected cell to the new position
    const newCellId = generateCellId(targetRow, parseCellId(selectedCell.id).column);
    const newCell = updatedCells.get(newCellId);
    if (newCell) {
      setSelectedCell(newCell);
    }
  }, [spreadsheet, selectedCell, saveToHistory, isUndoRedo, swapRowReferencesInFormula]);

  // Move row down (swap with row below)
  const handleMoveRowDown = useCallback(() => {
    if (!spreadsheet || !selectedCell) return;
    
    const { row } = parseCellId(selectedCell.id);
    if (row >= spreadsheet.rowCount - 1) return; // Can't move last row down
    
    const targetRow = row + 1;
    
    // Create a map to track new cell positions
    const updatedCells = new Map<string, Cell>();
    const updatedColumnDefinitions = spreadsheet.columnDefinitions ? new Map(spreadsheet.columnDefinitions) : undefined;
    
    // First, collect all cells from both rows
    const currentRowCells: Cell[] = [];
    const targetRowCells: Cell[] = [];
    
    const cells = getSpreadsheetCells(spreadsheet, activeTabId);
    for (const [cellId, cell] of cells.entries()) {
      if (cell.row === row) {
        currentRowCells.push(cell);
      } else if (cell.row === targetRow) {
        targetRowCells.push(cell);
      } else {
        // Keep other cells as-is, but update their formulas if they reference swapped rows
        let updatedCell = { ...cell };
        if (updatedCell.formula) {
          updatedCell.formula = swapRowReferencesInFormula(updatedCell.formula, row, targetRow);
        }
        updatedCells.set(cellId, updatedCell);
      }
    }
    
    // Swap rows: move current row cells to target row, and target row cells to current row
    currentRowCells.forEach(cell => {
      const newCellId = generateCellId(targetRow, cell.column);
      const updatedCell: Cell = {
        ...cell,
        id: newCellId,
        row: targetRow,
      };
      
      // Update formula references (swap row references)
      if (updatedCell.formula) {
        updatedCell.formula = swapRowReferencesInFormula(updatedCell.formula, row, targetRow);
      }
      
      updatedCells.set(newCellId, updatedCell);
    });
    
    targetRowCells.forEach(cell => {
      const newCellId = generateCellId(row, cell.column);
      const updatedCell: Cell = {
        ...cell,
        id: newCellId,
        row: row,
      };
      
      // Update formula references
      if (updatedCell.formula) {
        updatedCell.formula = swapRowReferencesInFormula(updatedCell.formula, row, targetRow);
      }
      
      updatedCells.set(newCellId, updatedCell);
    });
    
    // Update column definition formulas
    if (updatedColumnDefinitions) {
      for (const [colName, colDef] of updatedColumnDefinitions.entries()) {
        if (colDef.formula) {
          updatedColumnDefinitions.set(colName, {
            ...colDef,
            formula: swapRowReferencesInFormula(colDef.formula, row, targetRow),
          });
        }
      }
    }
    
    const updatedSpreadsheet: SpreadsheetModel = {
      ...spreadsheet,
      cells: updatedCells,
      columnDefinitions: updatedColumnDefinitions,
      updatedAt: new Date(),
    };
    
    setSpreadsheet(updatedSpreadsheet);
    if (!isUndoRedo) {
      saveToHistory(updatedSpreadsheet);
    }
    setHasChanges(true);
    
    // Update selected cell to the new position
    const newCellId = generateCellId(targetRow, parseCellId(selectedCell.id).column);
    const newCell = updatedCells.get(newCellId);
    if (newCell) {
      setSelectedCell(newCell);
    }
  }, [spreadsheet, selectedCell, saveToHistory, isUndoRedo, swapRowReferencesInFormula]);


  // Handle cell update
  const handleCellUpdate = useCallback((cellId: string, value: string | number, formula?: string) => {
    if (isReadOnly) return;

    setSpreadsheet((prevSpreadsheet) => {
      if (!prevSpreadsheet) return prevSpreadsheet;

      // Get or create cell
      const prevCellsMap = getSpreadsheetCells(prevSpreadsheet, activeTabId);
      let cell = prevCellsMap.get(cellId);
      if (!cell) {
        // Create new cell if it doesn't exist
        // Defensive check: validate cellId before parsing
        if (!cellId || typeof cellId !== 'string') {
          console.error('Invalid cellId provided:', cellId);
          return prevSpreadsheet; // Return unchanged spreadsheet on invalid cellId
        }

        try {
          const { row, column } = parseCellId(cellId);
          
          // Validate parsed values are numbers
          if (typeof row !== 'number' || typeof column !== 'number' || isNaN(row) || isNaN(column)) {
            console.error('Invalid row/column from parseCellId:', { row, column, cellId });
            return prevSpreadsheet; // Return unchanged spreadsheet on invalid parse
          }

          cell = {
            id: cellId,
            row,
            column,
            dataType: 'text',
            displayValue: '',
            rawValue: null,
          };
        } catch (error) {
          // Safely handle parseCellId errors (e.g., invalid format)
          console.error('Failed to parse cellId:', cellId, error);
          return prevSpreadsheet; // Return unchanged spreadsheet on parse error
        }
      }

      // Determine if it's a formula
      let finalFormula: string | undefined = formula;
      let finalRawValue: string | number | boolean | null = value;
      
      if (typeof value === 'string' && value.startsWith('=')) {
        finalFormula = value.substring(1);
        finalRawValue = null; // Formula cells have null rawValue
      } else if (typeof value === 'string' && value.trim() !== '') {
        // Try to parse as number if it's a numeric string
        const trimmed = value.trim().replace(/\s/g, '').replace(/,/g, '');
        const numValue = parseFloat(trimmed);
        if (!isNaN(numValue) && isFinite(numValue) && trimmed === String(numValue)) {
          // It's a valid number string, convert to number
          finalRawValue = numValue;
        }
      }

      // Determine data type
      let dataType: CellDataType = 'text';
      if (finalFormula) {
        dataType = 'formula';
      } else if (typeof finalRawValue === 'number') {
        dataType = 'number';
      } else if (typeof finalRawValue === 'boolean') {
        dataType = 'boolean';
      }

      // Update cell
      const updatedCell: Cell = {
        ...cell,
        rawValue: finalFormula ? null : finalRawValue,
        formula: finalFormula,
        dataType,
        // For non-formula cells, set displayValue to the value itself immediately
        // For formula cells, displayValue will be set by evaluation
        displayValue: finalFormula 
          ? (cell.displayValue || '') // Keep existing displayValue for formulas until evaluation
          : (typeof finalRawValue === 'string' 
              ? finalRawValue 
              : (typeof finalRawValue === 'number' ? String(finalRawValue) : '')),
        modifiedAt: new Date(),
        modifiedBy: currentUser?.uid,
      };

      // Update spreadsheet
      const prevCells = getSpreadsheetCells(prevSpreadsheet, activeTabId);
      const updatedCells = new Map(prevCells);
      updatedCells.set(cellId, updatedCell);

      // Update active tab if using tabs
      if (prevSpreadsheet.tabs && activeTabId && prevSpreadsheet.tabs.has(activeTabId)) {
        const activeTab = prevSpreadsheet.tabs.get(activeTabId)!;
        const updatedTab = { ...activeTab, cells: updatedCells };
        const updatedTabs = new Map(prevSpreadsheet.tabs);
        updatedTabs.set(activeTabId, updatedTab);
        
        const updatedSpreadsheet = {
          ...prevSpreadsheet,
          tabs: updatedTabs,
          cells: updatedCells, // Keep for backward compatibility
          updatedAt: new Date(),
          updatedBy: currentUser?.uid,
        };
        if (!isUndoRedo) {
          saveToHistory(updatedSpreadsheet);
        }
        return updatedSpreadsheet;
      }

      // Legacy: no tabs, update cells directly
      const updatedSpreadsheet = {
        ...prevSpreadsheet,
        cells: updatedCells,
        updatedAt: new Date(),
        updatedBy: currentUser?.uid,
      };
      if (!isUndoRedo) {
        saveToHistory(updatedSpreadsheet);
      }
      return updatedSpreadsheet;
    });

    setHasChanges(true);
  }, [isReadOnly, currentUser, activeTabId, isUndoRedo, saveToHistory]);

  // Handle undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0 && history.length > 0) {
      isUndoRedoRef.current = true;
      setIsUndoRedo(true);
      const prevState = history[historyIndex - 1];
      const restoredState = restoreSpreadsheetFromHistory(prevState);
      setSpreadsheet(restoredState);
      setHistoryIndex(historyIndex - 1);
      setHasChanges(true);
      setTimeout(() => {
        setIsUndoRedo(false);
        isUndoRedoRef.current = false;
      }, 150);
    }
  }, [history, historyIndex, restoreSpreadsheetFromHistory]);

  // Handle redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1 && history.length > 0) {
      isUndoRedoRef.current = true;
      setIsUndoRedo(true);
      const nextState = history[historyIndex + 1];
      const restoredState = restoreSpreadsheetFromHistory(nextState);
      setSpreadsheet(restoredState);
      setHistoryIndex(historyIndex + 1);
      setHasChanges(true);
      setTimeout(() => {
        setIsUndoRedo(false);
        isUndoRedoRef.current = false;
      }, 150);
    }
  }, [history, historyIndex, restoreSpreadsheetFromHistory]);

  // Keyboard shortcuts: Ctrl/Cmd+Z (undo), Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z (redo)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleUndo, handleRedo]);

  // â”€â”€â”€ TREB template picker handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleOpenTrebTemplatePicker = useCallback(async () => {
    if (!currentUser) return;
    setLoadingTrebTemplates(true);
    setShowTrebTemplatePicker(true);
    try {
      const list = await spreadsheetTemplateService.listAccessible(currentUser.uid);
      setTrebTemplates(list);
    } catch {
      // Keep picker open with empty list rather than silently failing
      setTrebTemplates([]);
    } finally {
      setLoadingTrebTemplates(false);
    }
  }, [currentUser]);

  const handleSelectTrebTemplate = useCallback((tpl: SpreadsheetTemplate) => {
    setPendingTrebTemplate(tpl);
    setShowTrebTemplatePicker(false);
    setShowTrebTemplateConfirm(true);
  }, []);

  const handleConfirmTrebTemplate = useCallback(async () => {
    if (!pendingTrebTemplate) return;
    setShowTrebTemplateConfirm(false);
    const templateId = pendingTrebTemplate.id;
    // Fetch full template from server so we have all sheets/tabs (list may have truncated or stale data).
    let rawDoc: TREBDocument;
    try {
      const fullTemplate = await spreadsheetTemplateService.getByIdFromServer(templateId);
      rawDoc = (fullTemplate?.trebDocument ?? pendingTrebTemplate.trebDocument) as TREBDocument;
    } catch {
      rawDoc = pendingTrebTemplate.trebDocument as TREBDocument;
    }
    if (!rawDoc || typeof rawDoc !== 'object') {
      setPendingTrebTemplate(null);
      return;
    }
    // Restore spreadsheet to default first (only main tab left, no old data) then apply the new template.
    // This avoids leftover values/text from the previous spreadsheet causing errors when the new template is applied.
    const spreadsheetId = spreadsheet?.id ?? `equipment-${equipmentIndex}-${Date.now()}`;
    const spreadsheetName = spreadsheet?.name ?? `${equipment?.name ?? 'Equipment'} - Calculation`;
    const defaultSpreadsheet = migrateSpreadsheetToTabs(
      createEmptySpreadsheet(
        spreadsheetId,
        spreadsheetName,
        currentUser?.uid ?? 'unknown',
        DEFAULT_SPREADSHEET_ROW_COUNT,
        26
      )
    );
    const defaultWithMeta = {
      ...defaultSpreadsheet,
      metadata: {
        ...defaultSpreadsheet.metadata,
        templateId,
        templateName: pendingTrebTemplate.name,
      },
    };
    historyInitRef.current = null; // So next spreadsheet update (from grid loading template) re-inits history
    setSpreadsheet(defaultWithMeta);
    // Apply the new template as-is (no merge). Loading the template fresh prevents old cell data from persisting.
    let docToLoad = JSON.parse(JSON.stringify(rawDoc)) as TREBDocument;
    ensureTrebDocumentSheetRowCounts(docToLoad);
    docToLoad = loadDocumentForSpreadsheet(docToLoad) ?? docToLoad;
    latestTrebDocRef.current = docToLoad;
    setExternalTrebDocument(docToLoad);
    setHasChanges(true);
    setSelectedTemplateId(templateId);
    setPendingTrebTemplate(null);
  }, [pendingTrebTemplate, spreadsheet, equipmentIndex, equipment?.name, currentUser?.uid]);

  const handleRequestUnlockLockedCell = useCallback((performClear: () => void) => {
    const templateId = selectedTemplateId ?? spreadsheet?.metadata?.templateId;
    if (!templateId) {
      showError('No template applied. Locked cells cannot be unlocked.');
      return;
    }
    spreadsheetTemplateService.getByIdFromServer(templateId).then((tpl) => {
      if (!tpl) {
        showError('Template not found. Locked cells cannot be unlocked.');
        return;
      }
      if (!tpl.unlockPasswordHash) {
        performClear();
        return;
      }
      pendingUnlockActionRef.current = performClear;
      setUnlockPasswordInput('');
      setUnlockPasswordError(null);
      setShowUnlockPasswordModal(true);
    }).catch(() => {
      showError('Could not verify template. Locked cells cannot be unlocked.');
    });
  }, [selectedTemplateId, spreadsheet?.metadata?.templateId, showError]);

  const handleUnlockPasswordSubmit = useCallback(async () => {
    const templateId = selectedTemplateId ?? spreadsheet?.metadata?.templateId;
    if (!templateId) return;
    const ok = await spreadsheetTemplateService.verifyTemplateUnlockPassword(templateId, unlockPasswordInput);
    if (ok) {
      pendingUnlockActionRef.current?.();
      pendingUnlockActionRef.current = null;
      setShowUnlockPasswordModal(false);
      setUnlockPasswordInput('');
      setUnlockPasswordError(null);
    } else {
      setUnlockPasswordError('Incorrect password');
    }
  }, [unlockPasswordInput, selectedTemplateId, spreadsheet?.metadata?.templateId]);

  // â”€â”€â”€ End TREB template picker handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Handle generate certificate number button click
  const handleGenerateCertificateNumber = useCallback(() => {
    // Check if equipment already has a certificate number (single source of truth)
    if (equipment.certificateNumber !== null && equipment.certificateNumber !== undefined) {
      showError('Certificate number already generated for this equipment');
      return;
    }

    if (certificateConfigs.length === 0) {
      // Show modal error dialog instead of toast for better visibility
      setShowCertificateNumberError(true);
      return;
    }

    // Open confirmation dialog
    setShowCertificateNumberConfirm(true);
  }, [certificateConfigs, equipment.certificateNumber, showError]);

  // Handle certificate number generation confirmation
  const handleConfirmCertificateNumberGeneration = useCallback(async () => {
    // Single source of truth: Check if equipment already has a certificate number
    if (equipment.certificateNumber !== null && equipment.certificateNumber !== undefined) {
      showError('Certificate number already generated for this equipment');
      setShowCertificateNumberConfirm(false);
      return;
    }

    // Use first available certificate config
    if (certificateConfigs.length === 0) {
      showError('No active certificate number categories available. Please configure certificate numbers in Settings.');
      setShowCertificateNumberConfirm(false);
      return;
    }

    const configToUse = certificateConfigs[0];

    setGeneratingCertificateNumber(true);
    try {
      const certificateNumber = await generateCertificateNumber(configToUse.id);

      // Store certificate number on equipment model (single source of truth)
      if (onCertificateNumberGenerated) {
        onCertificateNumberGenerated(equipmentIndex, certificateNumber);
      }

      setShowCertificateNumberConfirm(false);
      success(`Certificate number "${certificateNumber}" generated successfully`);
    } catch (error: any) {
      console.error('[EquipmentSpreadsheetModal] Failed to generate certificate number:', error);
      showError(error.message || 'Failed to generate certificate number');
    } finally {
      setGeneratingCertificateNumber(false);
    }
  }, [certificateConfigs, equipmentIndex, equipment.certificateNumber, onCertificateNumberGenerated, showError, success]);

  // Handle generate report (export to Excel)
  const handleGenerateReport = useCallback(async () => {
    if (!spreadsheet) {
      showError('No spreadsheet data to export');
      return;
    }

    try {
      // Evaluate spreadsheet to get calculated values
      const evalResult = evaluateSpreadsheet(spreadsheet);
      
      // Create workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Calculation Data');

      // Get column order (if available) or generate from spreadsheet
      const columnOrder = spreadsheet.columnOrder || [];
      const columnDefs = spreadsheet.columnDefinitions || new Map();
      
      // Determine columns from column definitions or use default
      const columns: string[] = [];
      if (columnOrder.length > 0) {
        columns.push(...columnOrder);
      } else {
        // Extract column headers from column definitions
        columnDefs.forEach((def, key) => {
          if (!columns.includes(key)) {
            columns.push(key);
          }
        });
        
        // If no column definitions, infer from cells
        if (columns.length === 0) {
          const colSet = new Set<number>();
          const cells = getSpreadsheetCells(spreadsheet, activeTabId);
      cells.forEach((cell) => {
            colSet.add(cell.column);
          });
          const sortedCols = Array.from(colSet).sort((a, b) => a - b);
          columns.push(...sortedCols.map(col => String.fromCharCode(65 + col))); // A, B, C, etc.
        }
      }

      // Set up headers
      const headers: string[] = [];
      columns.forEach((colKey) => {
        const colDef = columnDefs.get(colKey);
        headers.push(colDef?.header || colKey || 'Column');
      });

      worksheet.columns = headers.map(header => ({
        header,
        key: header,
        width: 20,
      }));

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 20;

      // Get all rows with data
      const rowMap = new Map<number, Map<string, any>>();
      const cells = getSpreadsheetCells(spreadsheet, activeTabId);
      cells.forEach((cell) => {
        if (!rowMap.has(cell.row)) {
          rowMap.set(cell.row, new Map());
        }
        const rowData = rowMap.get(cell.row)!;
        
        // Get column name
        let colName = columns[cell.column] || String.fromCharCode(65 + cell.column);
        if (columnDefs.has(colName)) {
          colName = columnDefs.get(colName)!.header || colName;
        }
        
        // Use evaluated value if available, otherwise use display value
        const evalCell = evalResult.cellResults.get(cell.id);
        const value = evalCell?.displayValue || cell.displayValue || cell.rawValue || '';
        rowData.set(colName, value);
      });

      // Add data rows
      const sortedRows = Array.from(rowMap.keys()).sort((a, b) => a - b);
      sortedRows.forEach((rowNum) => {
        const rowData = rowMap.get(rowNum)!;
        const row: any = {};
        headers.forEach((header) => {
          row[header] = rowData.get(header) || '';
        });
        worksheet.addRow(row);
      });

      // Apply alternating row colors
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: rowNumber % 2 === 0 ? 'FFF2F2F2' : 'FFFFFFFF' }
          };
          row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          row.height = 20;
        }
      });

      // Add borders
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });
      
      // Generate and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Use simpler filename without report number
      const equipmentName = (equipment.name || 'Equipment').replace(/[^a-z0-9]/gi, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `${equipmentName}_Calculation_${dateStr}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      
      success('Report exported successfully');
    } catch (err) {
      console.error('Error generating report:', err);
      showError(err instanceof Error ? err.message : 'Failed to export report. Please try again.');
    }
  }, [spreadsheet, equipment.name, success, showError]);

  const generateOfflineValidationHash = useCallback(async (payload: string): Promise<string> => {
    if (!window.crypto?.subtle) {
      throw new Error('Browser does not support secure hash generation.');
    }
    const encoded = new TextEncoder().encode(payload);
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }, []);

  // Export spreadsheet for offline work
  const handleExportForOffline = useCallback(async () => {
    if (!spreadsheet) {
      showError('No spreadsheet data to export.');
      return;
    }

    try {
      const firstTabId =
        spreadsheet.tabOrder?.[0] ||
        (spreadsheet.tabs && spreadsheet.tabs.size > 0 ? Array.from(spreadsheet.tabs.keys())[0] : '');
      const firstTab = firstTabId && spreadsheet.tabs ? spreadsheet.tabs.get(firstTabId) : undefined;
      if (!firstTabId || !firstTab) {
        throw new Error('No spreadsheet tab available for offline export.');
      }

      const firstTabColumnOrder = getSpreadsheetColumnOrder(spreadsheet, firstTabId) || [];
      const firstTabColumnDefs = getSpreadsheetColumnDefinitions(spreadsheet, firstTabId) || new Map<string, ColumnDefinition>();
      const firstTabCells = getSpreadsheetCells(spreadsheet, firstTabId);
      const evaluated = evaluateSpreadsheet(spreadsheet);

      const exportColumnKeys = firstTabColumnOrder.filter((columnKey) => {
        const def = firstTabColumnDefs.get(columnKey);
        if (!def) return false;
        const isCalibrationColumn = isCalibrationPointColumn(columnKey, def);
        const isFormulaColumn = Boolean(def.formula) || def.type === 'formula';
        const isEditableInputColumn = !def.formula && def.type !== 'formula' && !def.readOnly;
        return isCalibrationColumn || isFormulaColumn || isEditableInputColumn;
      });

      if (exportColumnKeys.length === 0) {
        throw new Error('No exportable columns found in the first tab.');
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(sanitizeWorksheetName(firstTab.name));
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.columns = exportColumnKeys.map(() => ({ width: 20 }));

      const headerValues: string[] = [];
      for (const columnKey of exportColumnKeys) {
        const def = firstTabColumnDefs.get(columnKey);
        headerValues.push(def?.name || columnKey);
      }
      const headerRow = worksheet.addRow(headerValues);
      headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      headerRow.height = 24;
      headerRow.protection = { locked: true };

      const exportTimestamp = new Date().toISOString();
      const equipmentName = (equipment.name || 'Equipment').replace(/[^a-z0-9]/gi, '_');
      const serialNumber = (equipment.serialNumber || '').replace(/[^a-z0-9]/gi, '_');
      const dateStr = exportTimestamp.split('T')[0];
      const fileName = serialNumber
        ? `${equipmentName}_${serialNumber}_Offline_${dateStr}.xlsx`
        : `${equipmentName}_Offline_${dateStr}.xlsx`;
      const validationPayload = buildOfflineValidationPayload(job.jobId || '', selectedTemplateId, exportTimestamp);
      const validationHash = await generateOfflineValidationHash(validationPayload);

      const hiddenColumnIndex = exportColumnKeys.length + 1;
      worksheet.getColumn(hiddenColumnIndex).hidden = true;
      worksheet.getCell(1, hiddenColumnIndex).value = `${OFFLINE_HASH_CELL_LABEL}:${validationHash}`;
      worksheet.getCell(2, hiddenColumnIndex).value = `${OFFLINE_TIMESTAMP_CELL_LABEL}:${exportTimestamp}`;
      worksheet.getCell(3, hiddenColumnIndex).value = `${OFFLINE_TEMPLATE_CELL_LABEL}:${selectedTemplateId}`;
      worksheet.getCell(4, hiddenColumnIndex).value = `${OFFLINE_FILENAME_CELL_LABEL}:${fileName}`;
      worksheet.getCell(1, hiddenColumnIndex).protection = { locked: true };
      worksheet.getCell(2, hiddenColumnIndex).protection = { locked: true };
      worksheet.getCell(3, hiddenColumnIndex).protection = { locked: true };
      worksheet.getCell(4, hiddenColumnIndex).protection = { locked: true };

      const columnMap: Record<string, string> = {};
      for (let exportColIndex = 0; exportColIndex < exportColumnKeys.length; exportColIndex += 1) {
        const colKey = exportColumnKeys[exportColIndex];
        const colDef = firstTabColumnDefs.get(colKey);
        const excelColumnLetter = getExcelColumnLetter(exportColIndex);
        columnMap[colKey] = excelColumnLetter;
        if (colDef?.columnValue) {
          columnMap[colDef.columnValue] = excelColumnLetter;
        }
      }

      const rowsWithData = new Set<number>();
      for (const cell of firstTabCells.values()) {
        rowsWithData.add(cell.row);
      }
      const sortedRowIndexes = Array.from(rowsWithData).sort((a, b) => a - b);

      for (const rowIndex of sortedRowIndexes) {
        const excelRowNumber = rowIndex + 2;
        worksheet.addRow(new Array(exportColumnKeys.length).fill(''));

        for (let exportColIndex = 0; exportColIndex < exportColumnKeys.length; exportColIndex += 1) {
          const columnKey = exportColumnKeys[exportColIndex];
          const colDef = firstTabColumnDefs.get(columnKey);
          const sourceColumnIndex = firstTabColumnOrder.indexOf(columnKey);
          if (sourceColumnIndex < 0) {
            continue;
          }

          const sourceCellId = generateCellId(rowIndex, sourceColumnIndex);
          const sourceCell = firstTabCells.get(sourceCellId);
          const evaluatedCell = evaluated.cellResults.get(sourceCellId) as any;
          const excelCell = worksheet.getCell(excelRowNumber, exportColIndex + 1);
          const isFormulaColumn = Boolean(colDef?.formula) || colDef?.type === 'formula';
          const isEditableInputColumn = Boolean(colDef) && !colDef.formula && colDef.type !== 'formula' && !colDef.readOnly;

          if (isFormulaColumn && colDef?.formula) {
            const internalFormula = colDef.formula.startsWith('=') ? colDef.formula.slice(1) : colDef.formula;
            const transformedFormula = transformInternalFormulaToExcel(internalFormula, columnMap);
            const excelFormula = applyExcelRowIndexToFormula(transformedFormula, excelRowNumber);
            const formulaResult = evaluatedCell?.value ?? evaluatedCell?.displayValue ?? sourceCell?.rawValue ?? '';
            excelCell.value = {
              formula: excelFormula.startsWith('=') ? excelFormula.slice(1) : excelFormula,
              result: formulaResult,
            };
          } else {
            const cellValue = sourceCell?.rawValue ?? sourceCell?.displayValue ?? '';
            excelCell.value = cellValue as string | number | boolean | Date | null;
          }

          excelCell.protection = { locked: !isEditableInputColumn };
          if (isEditableInputColumn) {
            excelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFE0' } };
          } else {
            excelCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: excelRowNumber % 2 === 0 ? 'FFF2F2F2' : 'FFFFFFFF' },
            };
          }
          excelCell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
          excelCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }
      }

      await worksheet.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        insertHyperlinks: false,
        deleteColumns: false,
        deleteRows: false,
        sort: false,
        autoFilter: false,
        pivotTables: false,
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);

      setLastOfflineExportHash(validationHash);
      setLastOfflineExportFileName(fileName);
      success('Spreadsheet exported for offline work. Only first tab data was included.');
    } catch (err) {
      console.error('Error exporting for offline:', err);
      showError(err instanceof Error ? err.message : 'Failed to export spreadsheet. Please try again.');
    }
  }, [spreadsheet, selectedTemplateId, equipment.name, equipment.serialNumber, job.jobId, generateOfflineValidationHash, success, showError]);

  // Import spreadsheet from Excel file
  const handleImportFromExcel = useCallback(async (file: File) => {
    const INVALID_FILE_MESSAGE = 'Invalid file. Please upload the original downloaded file.';
    if (!spreadsheet) {
      showError('No spreadsheet loaded.');
      return;
    }

    setIsImporting(true);
    try {
      const firstTabId =
        spreadsheet.tabOrder?.[0] ||
        (spreadsheet.tabs && spreadsheet.tabs.size > 0 ? Array.from(spreadsheet.tabs.keys())[0] : '');
      const firstTab = firstTabId && spreadsheet.tabs ? spreadsheet.tabs.get(firstTabId) : undefined;
      if (!firstTabId || !firstTab) {
        throw new Error(INVALID_FILE_MESSAGE);
      }

      const firstTabColumnOrder = getSpreadsheetColumnOrder(spreadsheet, firstTabId) || [];
      const firstTabColumnDefs = getSpreadsheetColumnDefinitions(spreadsheet, firstTabId) || new Map<string, ColumnDefinition>();
      const exportColumnKeys = firstTabColumnOrder.filter((columnKey) => {
        const def = firstTabColumnDefs.get(columnKey);
        if (!def) return false;
        const isCalibrationColumn = isCalibrationPointColumn(columnKey, def);
        const isFormulaColumn = Boolean(def.formula) || def.type === 'formula';
        const isEditableInputColumn = !def.formula && def.type !== 'formula' && !def.readOnly;
        return isCalibrationColumn || isFormulaColumn || isEditableInputColumn;
      });
      if (exportColumnKeys.length === 0) {
        throw new Error(INVALID_FILE_MESSAGE);
      }

      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);

      const visibleSheets = workbook.worksheets.filter((sheet) => sheet.state !== 'hidden');
      if (workbook.worksheets.length !== 1 || visibleSheets.length !== 1) {
        throw new Error(INVALID_FILE_MESSAGE);
      }

      const worksheet = workbook.worksheets[0];
      const metadataColumnIndex = exportColumnKeys.length + 1;
      const hashCellRaw = String(worksheet.getCell(1, metadataColumnIndex).value || '');
      const timestampCellRaw = String(worksheet.getCell(2, metadataColumnIndex).value || '');
      const templateCellRaw = String(worksheet.getCell(3, metadataColumnIndex).value || '');
      const filenameCellRaw = String(worksheet.getCell(4, metadataColumnIndex).value || '');

      if (
        !hashCellRaw.startsWith(`${OFFLINE_HASH_CELL_LABEL}:`) ||
        !timestampCellRaw.startsWith(`${OFFLINE_TIMESTAMP_CELL_LABEL}:`) ||
        !templateCellRaw.startsWith(`${OFFLINE_TEMPLATE_CELL_LABEL}:`) ||
        !filenameCellRaw.startsWith(`${OFFLINE_FILENAME_CELL_LABEL}:`)
      ) {
        throw new Error(INVALID_FILE_MESSAGE);
      }

      const embeddedHash = hashCellRaw.slice(`${OFFLINE_HASH_CELL_LABEL}:`.length);
      const embeddedTimestamp = timestampCellRaw.slice(`${OFFLINE_TIMESTAMP_CELL_LABEL}:`.length);
      const embeddedTemplateId = templateCellRaw.slice(`${OFFLINE_TEMPLATE_CELL_LABEL}:`.length);
      const embeddedFileName = filenameCellRaw.slice(`${OFFLINE_FILENAME_CELL_LABEL}:`.length);
      const expectedPayload = buildOfflineValidationPayload(job.jobId || '', selectedTemplateId, embeddedTimestamp);
      const expectedHash = await generateOfflineValidationHash(expectedPayload);

      if (
        !embeddedHash ||
        embeddedTemplateId !== selectedTemplateId ||
        embeddedHash !== expectedHash ||
        embeddedFileName !== file.name
      ) {
        throw new Error(INVALID_FILE_MESSAGE);
      }

      if (lastOfflineExportHash && embeddedHash !== lastOfflineExportHash) {
        throw new Error(INVALID_FILE_MESSAGE);
      }
      if (lastOfflineExportFileName && file.name !== lastOfflineExportFileName) {
        throw new Error(INVALID_FILE_MESSAGE);
      }

      for (let exportColIndex = 0; exportColIndex < exportColumnKeys.length; exportColIndex += 1) {
        const columnKey = exportColumnKeys[exportColIndex];
        const expectedHeader = firstTabColumnDefs.get(columnKey)?.name || columnKey;
        const actualHeader = String(worksheet.getCell(1, exportColIndex + 1).value || '').trim();
        if (actualHeader !== expectedHeader) {
          throw new Error(INVALID_FILE_MESSAGE);
        }
      }

      const editableColumnIndexes: number[] = [];
      for (let exportColIndex = 0; exportColIndex < exportColumnKeys.length; exportColIndex += 1) {
        const columnKey = exportColumnKeys[exportColIndex];
        const def = firstTabColumnDefs.get(columnKey);
        if (def && !def.formula && def.type !== 'formula' && !def.readOnly) {
          editableColumnIndexes.push(exportColIndex);
        }
      }

      const updatedFirstTabCells = new Map(firstTab.cells);
      let importedRows = 0;
      const dataStartRow = 2;
      const maxRow = worksheet.actualRowCount;

      for (let excelRowNumber = dataStartRow; excelRowNumber <= maxRow; excelRowNumber += 1) {
        const templateRowIndex = excelRowNumber - dataStartRow;
        if (templateRowIndex >= firstTab.rowCount) {
          continue;
        }

        let rowChanged = false;

        for (const exportColIndex of editableColumnIndexes) {
          const columnKey = exportColumnKeys[exportColIndex];
          const sourceColumnIndex = firstTabColumnOrder.indexOf(columnKey);
          if (sourceColumnIndex < 0) {
            continue;
          }

          const colDef = firstTabColumnDefs.get(columnKey);
          const excelCell = worksheet.getCell(excelRowNumber, exportColIndex + 1);
          let incomingValue: any = excelCell.value;

          if (incomingValue && typeof incomingValue === 'object' && 'result' in incomingValue) {
            incomingValue = (incomingValue as { result: unknown }).result;
          }
          if (incomingValue === null || incomingValue === undefined || incomingValue === '') {
            continue;
          }

          const cellId = generateCellId(templateRowIndex, sourceColumnIndex);
          const existingCell = updatedFirstTabCells.get(cellId);
          let rawValue: string | number | boolean | null = incomingValue as string | number | boolean;
          let displayValue = String(incomingValue);

          if (colDef?.type === 'number') {
            const numberValue = typeof incomingValue === 'number' ? incomingValue : Number(incomingValue);
            if (!Number.isFinite(numberValue)) {
              continue;
            }
            rawValue = numberValue;
            const precision = colDef.precision ?? 2;
            displayValue = numberValue.toFixed(precision);
          } else if (colDef?.type === 'boolean') {
            rawValue = Boolean(incomingValue);
            displayValue = rawValue ? 'TRUE' : 'FALSE';
          } else {
            rawValue = String(incomingValue);
            displayValue = String(incomingValue);
          }

          const nextCell: Cell = {
            id: cellId,
            row: templateRowIndex,
            column: sourceColumnIndex,
            dataType: (colDef?.type as CellDataType) || existingCell?.dataType || 'text',
            displayValue,
            rawValue,
            format: existingCell?.format,
            formula: existingCell?.formula,
          };

          updatedFirstTabCells.set(cellId, nextCell);
          rowChanged = true;
        }

        if (rowChanged) {
          importedRows += 1;
        }
      }

      const updatedTabs = new Map(spreadsheet.tabs || new Map());
      updatedTabs.set(firstTabId, {
        ...firstTab,
        cells: updatedFirstTabCells,
      });

      let nextSpreadsheet: SpreadsheetModel = {
        ...spreadsheet,
        tabs: updatedTabs,
        cells: updatedFirstTabCells,
        updatedAt: new Date(),
      };

      const recalculated = evaluateSpreadsheet(nextSpreadsheet);
      const recalculatedFirstTabCells = new Map(updatedFirstTabCells);
      for (const [cellId, cellResult] of recalculated.cellResults) {
        const existingCell = recalculatedFirstTabCells.get(cellId);
        if (!existingCell) continue;
        recalculatedFirstTabCells.set(cellId, {
          ...existingCell,
          displayValue: cellResult.displayValue,
        });
      }

      updatedTabs.set(firstTabId, {
        ...updatedTabs.get(firstTabId)!,
        cells: recalculatedFirstTabCells,
      });
      nextSpreadsheet = {
        ...nextSpreadsheet,
        tabs: updatedTabs,
        cells: recalculatedFirstTabCells,
        updatedAt: new Date(),
      };

      setSpreadsheet(nextSpreadsheet);
      saveToHistory(nextSpreadsheet);
      setHasChanges(true);
      success(`Import completed: ${importedRows} row(s) updated in first tab editable columns only.`);
    } catch (err) {
      console.error('Error importing from Excel:', err);
      if (err instanceof Error && err.message === INVALID_FILE_MESSAGE) {
        showError(INVALID_FILE_MESSAGE);
      } else {
        showError(err instanceof Error ? err.message : 'Failed to import Excel file. Please check the file format.');
      }
    } finally {
      setIsImporting(false);
      setShowImportDialog(false);
      setImportFile(null);
    }
  }, [
    spreadsheet,
    selectedTemplateId,
    job.jobId,
    lastOfflineExportHash,
    lastOfflineExportFileName,
    generateOfflineValidationHash,
    success,
    showError,
    saveToHistory,
  ]);

  // Handle file selection for import
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        showError('Please select a valid Excel file (.xlsx or .xls)');
        return;
      }
      setImportFile(file);
    }
  }, [showError]);

  // Handle import confirmation
  const handleConfirmImport = useCallback(() => {
    if (importFile) {
      handleImportFromExcel(importFile);
    }
  }, [importFile, handleImportFromExcel]);

  // Export spreadsheet as PDF datasheet
  const handleExportPdf = useCallback(async () => {
    if (!spreadsheet) {
      showError('No spreadsheet data available. Please ensure a spreadsheet is loaded.');
      return;
    }

    try {
      const pdf = await generateSpreadsheetPdf(spreadsheet, job, equipment, {
        includeAllData: true,
        showFormulas: true,
      });

      // Generate filename
      const equipmentName = (equipment.name || 'Equipment').replace(/[^a-z0-9]/gi, '_');
      const serialNumber = (equipment.serialNumber || '').replace(/[^a-z0-9]/gi, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = serialNumber 
        ? `${equipmentName}_${serialNumber}_Datasheet_${dateStr}.pdf`
        : `${equipmentName}_Datasheet_${dateStr}.pdf`;

      // Show preview instead of downloading directly
      setPreviewPdf(pdf);
      setPreviewFileName(fileName);
      setShowPdfPreview(true);
    } catch (err) {
      console.error('Error generating PDF:', err);
      showError(err instanceof Error ? err.message : 'Failed to export PDF datasheet. Please try again.');
    }
  }, [spreadsheet, job, equipment, showError]);

  // Handle PDF download from preview
  const handleDownloadPdf = useCallback(() => {
    if (previewPdf && previewFileName) {
      previewPdf.save(previewFileName);
      success('PDF datasheet downloaded successfully');
    }
  }, [previewPdf, previewFileName, success]);

  // Handle formula verification
  const handleVerifyFormulas = useCallback(() => {
    if (!spreadsheet || !selectedCell) {
      showError('Please select a cell in the row you want to verify.');
      return;
    }
    const { row } = parseCellId(selectedCell.id);
    setVerificationRowIndex(row);
    setShowFormulaVerification(true);
  }, [spreadsheet, selectedCell, showError]);

  /** Prefer current TREB doc from grid (SerializeDocument) so format/formulas persist after save+refresh. */
  const getCurrentTrebDocument = useCallback((): TREBDocument | null => {
    try {
      const fromGrid = getTrebDocumentRef.current?.() ?? null;
      if (fromGrid && typeof fromGrid === 'object') return fromGrid;
    } catch {
      // ignore
    }
    return latestTrebDocRef.current;
  }, []);

  /**
   * Build computedGrids from the evaluated spreadsheet model (displayValues set by evaluateSpreadsheet).
   * TREB is never used as a value source. Only spreadsheet.tabs[].cells[].displayValue/rawValue are read.
   */
  const buildComputedGridsFromEvaluatedGrid = useCallback((evaluatedSpreadsheet: SpreadsheetModel): Record<string, string> => {
    const computedGrids: Record<string, string> = {};
    const tabs = evaluatedSpreadsheet.tabs;
    if (!tabs || !(tabs instanceof Map) || tabs.size === 0) return computedGrids;

    const tabOrder = evaluatedSpreadsheet.tabOrder?.length
      ? evaluatedSpreadsheet.tabOrder
      : Array.from(tabs.keys());

    for (const tabId of tabOrder) {
      const tab = tabs.get(tabId);
      if (!tab?.cells) continue;

      const cellsMap = tab.cells instanceof Map ? tab.cells : new Map(Object.entries(tab.cells as Record<string, Cell>));
      const cells: Cell[] = Array.from(cellsMap.values());

      const rowCount = Math.max(tab.rowCount ?? 0, ...cells.map((c: Cell) => c.row), 0) + 1;
      const colCount = Math.max(
        (tab.columnOrder?.length ?? 0) || (tab.columnCount ?? 0),
        ...cells.map((c: Cell) => c.column),
        0
      ) + 1;
      if (rowCount <= 0 || colCount <= 0) continue;

      const grid: (string | number)[][] = Array(rowCount)
        .fill(null)
        .map(() => Array(colCount).fill(''));

      for (const cell of cells) {
        const row = cell.row;
        const col = cell.column;
        if (row < 0 || col < 0) continue;

        // Use display value (what the user sees in the grid), not formula bar / raw value
        const displayVal = cell.displayValue;
        const rawVal = cell.rawValue;
        let value: string | number =
          displayVal !== undefined && displayVal !== '' && String(displayVal).trim() !== 'undefined' && String(displayVal).trim() !== 'null'
            ? (typeof displayVal === 'number' ? displayVal : String(displayVal))
            : rawVal !== undefined && rawVal !== null && rawVal !== '' && String(rawVal).trim() !== 'undefined' && String(rawVal).trim() !== 'null'
              ? (typeof rawVal === 'number' ? rawVal : String(rawVal))
              : '';

        if (value === undefined || value === null || (typeof value === 'string' && (value === 'undefined' || value === 'null'))) value = '';
        grid[row][col] = typeof value === 'number' ? value : String(value);
      }

      computedGrids[tabId] = JSON.stringify(grid);
    }

    return computedGrids;
  }, []);

  /**
   * At save time, build computedGrids from TREB document (with rendered values) when available,
   * so the PDF table matches what the user sees in the grid. Otherwise use the in-memory spreadsheet state.
   */
  const getComputedGridsForSave = useCallback((): Record<string, string> => {
    const trebDoc = getTrebDocumentRef.current?.() ?? null;
    if (trebDoc && typeof trebDoc === 'object') {
      const modelFromTreb = trebDocumentToSpreadsheetModel(trebDoc);
      // Do not call evaluateSpreadsheet(modelFromTreb): TREB already has correct calculated values;
      // re-evaluation overwrites formula cells with 0 when cross-tab refs don't resolve.
      let computed = buildComputedGridsFromEvaluatedGrid(modelFromTreb);
      // Fallback: if a tab's grid is mostly empty, use in-memory state for that tab so PDF is never worse
      if (spreadsheet?.tabs && spreadsheet.tabs instanceof Map) {
        const tabOrder = spreadsheet.tabOrder?.length ? spreadsheet.tabOrder : Array.from(spreadsheet.tabs.keys());
        for (const tabId of tabOrder) {
          const tabGridJson = computed[tabId];
          if (!tabGridJson) continue;
          try {
            const grid = JSON.parse(tabGridJson) as (string | number)[][];
            const total = grid.reduce((sum, row) => sum + (Array.isArray(row) ? row.length : 0), 0);
            const nonEmpty = grid.reduce(
              (count, row) =>
                count +
                (Array.isArray(row)
                  ? row.filter(
                      (v) =>
                        v !== '' &&
                        v !== undefined &&
                        v !== null &&
                        String(v).trim() !== '' &&
                        (typeof v !== 'number' || Math.abs(v) >= 1e-6)
                    ).length
                  : 0),
              0
            );
            if (total > 0 && nonEmpty < Math.max(1, total * 0.1)) {
              evaluateSpreadsheet(spreadsheet);
              const fromState = buildComputedGridsFromEvaluatedGrid(spreadsheet);
              if (fromState[tabId]) computed = { ...computed, [tabId]: fromState[tabId] };
            }
          } catch {
            // ignore parse errors
          }
        }
      }
      return computed;
    }
    if (!spreadsheet) return {};
    evaluateSpreadsheet(spreadsheet);
    const computed = buildComputedGridsFromEvaluatedGrid(spreadsheet);
    return computed;
  }, [spreadsheet, buildComputedGridsFromEvaluatedGrid]);

  // Handle save: persists spreadsheet to equipment and waits for job save (Firestore) so user does not need to close and save again.
  const handleSave = useCallback(async () => {
    if (!spreadsheet || isSaving) return;
    setIsSaving(true);

    const runSave = async (spreadsheetData: Equipment['spreadsheetData']) => {
      const result = onSave(equipmentIndex, spreadsheetData);
      if (result && typeof (result as Promise<void>).then === 'function') {
        await result;
      }
    };

    try {
      // Build computedGrids from TREB document (rendered values) when available so PDF matches grid; else from state.
      const computedGrids = getComputedGridsForSave();
      // Evaluate state so serialized spreadsheetModel has displayValues.
      evaluateSpreadsheet(spreadsheet);

      // Spreadsheet was mutated in place by evaluateSpreadsheet (tab.cells.displayValue). Use for serialization.
      const evaluatedSpreadsheet = applyTemplateMetadata(spreadsheet);

      // Serialize Maps to plain objects for Firestore
      const serializedSpreadsheet: any = {
        ...evaluatedSpreadsheet,
        cells: Object.fromEntries(evaluatedSpreadsheet.cells || new Map()),
        formulas: Object.fromEntries(evaluatedSpreadsheet.formulas || new Map()),
        variables: Object.fromEntries(evaluatedSpreadsheet.variables || new Map()),
        columnDefinitions: evaluatedSpreadsheet.columnDefinitions ? Object.fromEntries(evaluatedSpreadsheet.columnDefinitions) : undefined,
        columnOrder: evaluatedSpreadsheet.columnOrder || [],
      };
      
      // Serialize tabs Map if it exists
      if (evaluatedSpreadsheet.tabs && evaluatedSpreadsheet.tabs instanceof Map) {
        serializedSpreadsheet.tabs = Array.from(evaluatedSpreadsheet.tabs.entries()).map(([tabId, tab]) => ({
          ...tab,
          id: tabId,
          cells: Object.fromEntries(tab.cells || new Map()),
          columnDefinitions: tab.columnDefinitions ? Object.fromEntries(tab.columnDefinitions) : undefined,
        }));
        serializedSpreadsheet.tabOrder = evaluatedSpreadsheet.tabOrder || Array.from(evaluatedSpreadsheet.tabs.keys());
      }

      const trebDoc = getCurrentTrebDocument();
      const storedDoc = trebDoc ? (serializeDocumentForStorage(trebDoc) ?? trebDoc) : null;
      const spreadsheetData: Equipment['spreadsheetData'] = {
        spreadsheetId: evaluatedSpreadsheet.id,
        spreadsheetModel: serializedSpreadsheet,
        ...(storedDoc && { trebDocument: storedDoc }),
        ...(Object.keys(computedGrids).length > 0 && { computedGrids: computedGrids as Record<string, string> }),
      };

      await runSave(spreadsheetData);
      if (trebDoc) latestTrebDocRef.current = trebDoc;
      setHasChanges(false);
      setSaveSuccessMessage('Saved to job');
      setShowSaveSuccess(true);
      // Job is persisted by parent (e.g. JobDetailPage handleSpreadsheetSave); parent shows the toast.
      setTimeout(() => {
        setShowSaveSuccess(false);
        setTimeout(() => setSaveSuccessMessage(''), 300);
      }, 2500);
    } catch (err) {
      console.error('Error evaluating spreadsheet before save:', err);
      showError('Error evaluating formulas. Data saved but some calculations may be incorrect.');

      // Still save even if evaluation fails
      const serializedSpreadsheet: any = {
        ...applyTemplateMetadata(spreadsheet),
        cells: Object.fromEntries(getSpreadsheetCells(spreadsheet, activeTabId)),
        formulas: Object.fromEntries(spreadsheet.formulas || new Map()),
        variables: Object.fromEntries(spreadsheet.variables || new Map()),
        columnDefinitions: spreadsheet.columnDefinitions ? Object.fromEntries(spreadsheet.columnDefinitions) : undefined,
        columnOrder: spreadsheet.columnOrder || [],
      };
      
      // Serialize tabs Map if it exists
      if (spreadsheet.tabs && spreadsheet.tabs instanceof Map) {
        serializedSpreadsheet.tabs = Array.from(spreadsheet.tabs.entries()).map(([tabId, tab]) => ({
          ...tab,
          id: tabId,
          cells: Object.fromEntries(tab.cells || new Map()),
          columnDefinitions: tab.columnDefinitions ? Object.fromEntries(tab.columnDefinitions) : undefined,
        }));
        serializedSpreadsheet.tabOrder = spreadsheet.tabOrder || Array.from(spreadsheet.tabs.keys());
      }

      const computedGrids = getComputedGridsForSave();
      const trebDocFallback = getCurrentTrebDocument();
      const storedDocFallback = trebDocFallback ? (serializeDocumentForStorage(trebDocFallback) ?? trebDocFallback) : null;
      const spreadsheetData: Equipment['spreadsheetData'] = {
        spreadsheetId: spreadsheet.id,
        spreadsheetModel: serializedSpreadsheet,
        ...(storedDocFallback && { trebDocument: storedDocFallback }),
        ...(Object.keys(computedGrids).length > 0 && { computedGrids: computedGrids as Record<string, string> }),
      };

      try {
        await runSave(spreadsheetData);
        if (trebDocFallback) latestTrebDocRef.current = trebDocFallback;
        setHasChanges(false);
        setSaveSuccessMessage('Saved to job');
        setShowSaveSuccess(true);
        setTimeout(() => {
          setShowSaveSuccess(false);
          setTimeout(() => setSaveSuccessMessage(''), 300);
        }, 2500);
      } catch (saveErr) {
        showError('Failed to save to job. Please try again.');
        throw saveErr;
      }
    } finally {
      setIsSaving(false);
    }
  }, [spreadsheet, equipmentIndex, onSave, success, showError, applyTemplateMetadata, isSaving, getCurrentTrebDocument, getComputedGridsForSave]);

  // Handle close with unsaved changes warning
  const handleClose = useCallback(() => {
    if (hasChanges && !isReadOnly) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }, [hasChanges, isReadOnly, onClose]);

  // Confirm close without saving
  const handleConfirmClose = useCallback(() => {
    setShowCloseConfirm(false);
    setHasChanges(false);
    onClose();
  }, [onClose]);

  // Save and close: persists to job then closes so user does not need to save again on the main page.
  const handleSaveAndClose = useCallback(async () => {
    setShowCloseConfirm(false);
    if (!spreadsheet) {
      onClose();
      return;
    }
    if (isSaving) return;
    setIsSaving(true);

    const runSave = async (spreadsheetData: Equipment['spreadsheetData']) => {
      const result = onSave(equipmentIndex, spreadsheetData);
      if (result && typeof (result as Promise<void>).then === 'function') {
        await result;
      }
    };

    try {
      const computedGrids = getComputedGridsForSave();
      evaluateSpreadsheet(spreadsheet);
      const evaluatedSpreadsheet = applyTemplateMetadata(spreadsheet);
      const serializedSpreadsheet: any = {
        ...evaluatedSpreadsheet,
        cells: Object.fromEntries(evaluatedSpreadsheet.cells || new Map()),
        formulas: Object.fromEntries(evaluatedSpreadsheet.formulas || new Map()),
        variables: Object.fromEntries(evaluatedSpreadsheet.variables || new Map()),
        columnDefinitions: evaluatedSpreadsheet.columnDefinitions ? Object.fromEntries(evaluatedSpreadsheet.columnDefinitions) : undefined,
        columnOrder: evaluatedSpreadsheet.columnOrder || [],
      };
      if (evaluatedSpreadsheet.tabs && evaluatedSpreadsheet.tabs instanceof Map) {
        serializedSpreadsheet.tabs = Array.from(evaluatedSpreadsheet.tabs.entries()).map(([tabId, tab]) => ({
          ...tab,
          id: tabId,
          cells: Object.fromEntries(tab.cells || new Map()),
          columnDefinitions: tab.columnDefinitions ? Object.fromEntries(tab.columnDefinitions) : undefined,
        }));
        serializedSpreadsheet.tabOrder = evaluatedSpreadsheet.tabOrder || Array.from(evaluatedSpreadsheet.tabs.keys());
      }
      const trebDoc = getCurrentTrebDocument();
      const storedDoc = trebDoc ? (serializeDocumentForStorage(trebDoc) ?? trebDoc) : null;
      const spreadsheetData: Equipment['spreadsheetData'] = {
        spreadsheetId: evaluatedSpreadsheet.id,
        spreadsheetModel: serializedSpreadsheet,
        ...(storedDoc && { trebDocument: storedDoc }),
        ...(Object.keys(computedGrids).length > 0 && { computedGrids: computedGrids as Record<string, string> }),
      };
      await runSave(spreadsheetData);
      if (trebDoc) latestTrebDocRef.current = trebDoc;
      setHasChanges(false);
      onClose();
    } catch (err) {
      console.error('Error evaluating spreadsheet before save:', err);
      showError('Error evaluating formulas. Data saved but some calculations may be incorrect.');
      const serializedSpreadsheet: any = {
        ...applyTemplateMetadata(spreadsheet),
        cells: Object.fromEntries(getSpreadsheetCells(spreadsheet, activeTabId)),
        formulas: Object.fromEntries(spreadsheet.formulas || new Map()),
        variables: Object.fromEntries(spreadsheet.variables || new Map()),
        columnDefinitions: spreadsheet.columnDefinitions ? Object.fromEntries(spreadsheet.columnDefinitions) : undefined,
        columnOrder: spreadsheet.columnOrder || [],
      };
      if (spreadsheet.tabs && spreadsheet.tabs instanceof Map) {
        serializedSpreadsheet.tabs = Array.from(spreadsheet.tabs.entries()).map(([tabId, tab]) => ({
          ...tab,
          id: tabId,
          cells: Object.fromEntries(tab.cells || new Map()),
          columnDefinitions: tab.columnDefinitions ? Object.fromEntries(tab.columnDefinitions) : undefined,
        }));
        serializedSpreadsheet.tabOrder = spreadsheet.tabOrder || Array.from(spreadsheet.tabs.keys());
      }
      const computedGrids = getComputedGridsForSave();
      const trebDocFallback = getCurrentTrebDocument();
      const storedDocFallback = trebDocFallback ? (serializeDocumentForStorage(trebDocFallback) ?? trebDocFallback) : null;
      const spreadsheetData: Equipment['spreadsheetData'] = {
        spreadsheetId: spreadsheet.id,
        spreadsheetModel: serializedSpreadsheet,
        ...(storedDocFallback && { trebDocument: storedDocFallback }),
        ...(Object.keys(computedGrids).length > 0 && { computedGrids: computedGrids as Record<string, string> }),
      };
      try {
        await runSave(spreadsheetData);
        if (trebDocFallback) latestTrebDocRef.current = trebDocFallback;
        setHasChanges(false);
        onClose();
      } catch (saveErr) {
        showError('Failed to save to job. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  }, [spreadsheet, equipmentIndex, activeTabId, onSave, onClose, showError, applyTemplateMetadata, isSaving, getCurrentTrebDocument, getComputedGridsForSave]);

  // Memoize spreadsheet view for SpreadsheetGrid (active tab's data)
  const spreadsheetForGrid = useMemo(() => {
    // Get active tab data or use spreadsheet as-is
    if (spreadsheet && activeTabId && spreadsheet.tabs) {
      const activeTab = spreadsheet.tabs.get(activeTabId);
      if (activeTab) {
        // Create a view of spreadsheet with active tab's data
        // IMPORTANT: Keep the full spreadsheet structure (including tabs) for cross-tab formula evaluation
        // But use the active tab's cells, columnDefinitions, and columnOrder for display
        return {
          ...spreadsheet,
          cells: activeTab.cells,
          columnDefinitions: activeTab.columnDefinitions,
          columnOrder: activeTab.columnOrder,
          rowCount: activeTab.rowCount,
          columnCount: activeTab.columnCount,
        };
      }
    }
    return spreadsheet;
  }, [spreadsheet, activeTabId]);

  if (!isOpen) return null;

  if (!spreadsheet) {
    return (
      <div className="modal">
        <div className="modal-content max-w-7xl">
          <div className="p-6">
            <div className="text-center py-8">
              <p className="text-gray-500">Loading spreadsheet...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal !p-0">
      <div className="modal-content !w-screen !h-screen !max-w-none !max-h-none !rounded-none flex flex-col overflow-hidden relative">
        {/* Save success overlay (like Job modal) */}
        {showSaveSuccess && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 rounded-lg transition-opacity duration-300">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 transition-all duration-300 animate-fade-in">
              <div className="text-center">
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center animate-scale-in">
                  <svg className="h-10 w-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-green-600 mb-2">
                  {saveSuccessMessage}
                </h3>
                <p className="text-gray-600 text-sm">You can continue editing or close the modal</p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 p-4 bg-white">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900">
                {equipment.name || `Equipment ${equipmentIndex + 1}`} - Calculation
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Job: {job.jobId} | Status: <span className="font-semibold">{job.status}</span>
                {isReadOnly && <span className="ml-2 text-sm text-orange-600">(Read-only)</span>}
                {equipment.certificateNumber && (
                  <span className="ml-2">
                    | Certificate Number: <span className="font-mono font-semibold text-primary-600">{equipment.certificateNumber}</span>
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              {/* Save Button */}
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleSave}
                  className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                    hasChanges && !isSaving
                      ? 'border-primary-500 bg-primary-600 hover:bg-primary-700'
                      : 'border-gray-300 bg-gray-100'
                  }`}
                  disabled={!hasChanges || isSaving}
                  title={isSaving ? 'Saving…' : hasChanges ? 'Save changes to job (no need to save again on main page)' : 'No changes to save'}
                >
                  <svg className={`w-5 h-5 ${hasChanges ? 'text-white' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={handleClose}
                className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Close"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-gray-50 p-6">
          <div className="w-full min-w-0 flex flex-col min-h-0 flex-1">
            {/* Equipment context: which item the user is working on */}
            <div className="flex-shrink-0 mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
              <span className="font-medium text-gray-500">Equipment:</span>
              <span><strong className="text-gray-700">Name</strong>: {equipment.name || '—'}</span>
              <span><strong className="text-gray-700">Model</strong>: {equipment.model || '—'}</span>
              <span><strong className="text-gray-700">Serial Number</strong>: {equipment.serialNumber || '—'}</span>
            </div>
            {/* Main Content - Top-layer spreadsheet editor (shared with template manager for consistency) */}
            <div className="flex-1 min-h-0 flex flex-col max-h-[100vh]">
              <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <SpreadsheetEditorCore
                  spreadsheet={spreadsheetForGrid || spreadsheet}
                  onSpreadsheetChange={(updatedSpreadsheet, options) => {
                    if (isUndoRedoRef.current) return;
                    if (options?.activeTabId) setActiveTabId(options.activeTabId);
                    if (options?.isFullReplace) {
                      setSpreadsheet(updatedSpreadsheet ?? null);
                      setHasChanges(true);
                      return;
                    }
                    setSpreadsheet((prevSpreadsheet) => {
                      if (!prevSpreadsheet) return updatedSpreadsheet;
                      if (prevSpreadsheet.tabs && activeTabId && prevSpreadsheet.tabs.has(activeTabId)) {
                        const activeTab = prevSpreadsheet.tabs.get(activeTabId)!;
                        const updatedTab = {
                          ...activeTab,
                          cells: updatedSpreadsheet.cells || new Map(),
                          columnDefinitions: updatedSpreadsheet.columnDefinitions,
                          columnOrder: updatedSpreadsheet.columnOrder,
                          rowCount: updatedSpreadsheet.rowCount,
                          columnCount: updatedSpreadsheet.columnCount,
                        };
                        const updatedTabs = new Map(prevSpreadsheet.tabs);
                        updatedTabs.set(activeTabId, updatedTab);
                        const templateId = prevSpreadsheet.metadata?.templateId ?? updatedSpreadsheet.metadata?.templateId ?? selectedTemplateIdRef.current;
                        const templateName = prevSpreadsheet.metadata?.templateName ?? updatedSpreadsheet.metadata?.templateName;
                        return {
                          ...prevSpreadsheet,
                          tabs: updatedTabs,
                          cells: updatedSpreadsheet.cells,
                          columnDefinitions: updatedSpreadsheet.columnDefinitions,
                          columnOrder: updatedSpreadsheet.columnOrder,
                          rowCount: updatedSpreadsheet.rowCount,
                          columnCount: updatedSpreadsheet.columnCount,
                          metadata: { ...prevSpreadsheet.metadata, ...updatedSpreadsheet.metadata, templateId: templateId || prevSpreadsheet.metadata?.templateId, templateName: templateName ?? prevSpreadsheet.metadata?.templateName },
                          updatedAt: new Date(),
                        };
                      }
                      const templateId = prevSpreadsheet.metadata?.templateId ?? updatedSpreadsheet.metadata?.templateId ?? selectedTemplateIdRef.current;
                      const templateName = prevSpreadsheet.metadata?.templateName ?? updatedSpreadsheet.metadata?.templateName;
                      return {
                        ...updatedSpreadsheet,
                        metadata: { ...updatedSpreadsheet.metadata, templateId: templateId || updatedSpreadsheet.metadata?.templateId, templateName: templateName ?? updatedSpreadsheet.metadata?.templateName },
                        updatedAt: new Date(),
                      };
                    });
                    setHasChanges(true);
                  }}
                  externalDocument={externalTrebDocument}
                  onExternalDocumentConsumed={() => setExternalTrebDocument(null)}
                  onTrebDocumentChange={(doc) => { latestTrebDocRef.current = doc; }}
                  onRegisterGetDocument={(getDoc) => { getTrebDocumentRef.current = getDoc; }}
                  applyStyleRef={applyStyleRef}
                  isReadOnly={isReadOnly}
                  handleUndo={handleUndo}
                  handleRedo={handleRedo}
                  canUndo={historyIndex > 0 && history.length > 0}
                  canRedo={historyIndex < Math.max(0, history.length - 1) && history.length > 0}
                  showTemplates
                  onOpenTemplates={handleOpenTrebTemplatePicker}
                  onRequestUnlockLockedCell={handleRequestUnlockLockedCell}
                  onCellUpdate={handleCellUpdate}
                  onCellSelect={handleCellSelect}
                  activeTabId={activeTabId}
                  onActiveTabChange={setActiveTabId}
                  fillHeight
                  gridKey={`equipment-spreadsheet-${equipmentIndex}-${equipment.spreadsheetData?.spreadsheetId || 'new'}`}
                />
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* â”€â”€ TREB Template Picker â”€â”€ */}
      {showTrebTemplatePicker && (
        <div className="modal">
          <div className="modal-content max-w-lg">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Apply Spreadsheet Template</h3>
                <button
                  onClick={() => setShowTrebTemplatePicker(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {loadingTrebTemplates ? (
                <div className="flex items-center justify-center py-10">
                  <LoadingSpinner size="sm" message="Loading templates…" />
                </div>
              ) : trebTemplates.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-600 font-medium">No templates available</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Create spreadsheet templates in Settings → Spreadsheet Template Builder
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {trebTemplates.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => handleSelectTrebTemplate(tpl)}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-gray-900 group-hover:text-primary-700">
                          {tpl.name}
                        </span>
                        {tpl.isPublic && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">Shared</span>
                        )}
                      </div>
                      {tpl.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{tpl.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ TREB Template Apply Confirm â”€â”€ */}
      {showUnlockPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setShowUnlockPasswordModal(false); pendingUnlockActionRef.current = null; }}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Unlock locked cells</h3>
            <p className="text-sm text-gray-600 mb-4">Enter this template&apos;s protection password to clear the selection.</p>
            <input
              type="password"
              value={unlockPasswordInput}
              onChange={(e) => { setUnlockPasswordInput(e.target.value); setUnlockPasswordError(null); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
              placeholder="Password"
              autoFocus
            />
            {unlockPasswordError && <p className="text-sm text-red-600 mb-2">{unlockPasswordError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowUnlockPasswordModal(false); pendingUnlockActionRef.current = null; setUnlockPasswordError(null); }}>Cancel</Button>
              <Button variant="primary" onClick={handleUnlockPasswordSubmit}>Unlock</Button>
            </div>
          </div>
        </div>
      )}

      {showTrebTemplateConfirm && pendingTrebTemplate && (
        <div className="modal">
          <div className="modal-content max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Apply Template</h3>
              <p className="text-sm text-gray-600 mb-2">
                Apply <strong>"{pendingTrebTemplate.name}"</strong> to the spreadsheet?
              </p>
              <p className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-6">
                This will replace the current spreadsheet content with the template. Your existing data will be lost.
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowTrebTemplateConfirm(false);
                    setPendingTrebTemplate(null);
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleConfirmTrebTemplate}>
                  Apply Template
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Number Generation Confirmation Dialog */}
      {showCertificateNumberConfirm && (
        <div className="modal">
          <div className="modal-content max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Generate Certificate Number</h3>
              <p className="text-sm text-gray-600 mb-6">
                This will generate and permanently assign a certificate number to this equipment.
                This action cannot be undone. Do you want to continue?
              </p>
              {generatingCertificateNumber && (
                <div className="flex items-center justify-center py-4">
                  <LoadingSpinner size="sm" message="Generating certificate number..." />
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCertificateNumberConfirm(false);
                  }}
                  disabled={generatingCertificateNumber}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleConfirmCertificateNumberGeneration}
                  disabled={generatingCertificateNumber}
                >
                  {generatingCertificateNumber ? 'Generating...' : 'Confirm'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Number Error Dialog (No Configs Available) */}
      {showCertificateNumberError && (
        <div className="modal">
          <div className="modal-content max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-red-600 mb-4">Certificate Number Configuration Required</h3>
              <p className="text-sm text-gray-600 mb-6">
                No active certificate number categories are available. Please configure at least one certificate number category in Settings before generating certificate numbers.
              </p>
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowCertificateNumberError(false);
                  }}
                >
                  OK
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Confirmation Dialog */}
      {showCloseConfirm && (
        <div className="modal">
          <div className="modal-content max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Unsaved Changes
              </h3>
              <p className="text-gray-600 mb-6">
                You have unsaved changes. Do you want to save before closing?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCloseConfirm(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition-all duration-200 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClose}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition-all duration-200 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Close Without Saving
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndClose}
                  className="px-4 py-2 rounded-lg border border-primary-500 bg-primary-600 hover:bg-primary-700 text-white font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel Dialog */}
      <Modal
        isOpen={showImportDialog}
        onClose={() => {
          if (!isImporting) {
            setShowImportDialog(false);
            setImportFile(null);
          }
        }}
        title="Import from Excel"
        size="medium"
      >
        <div className="p-6">
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-4">
              Select an Excel file exported from this spreadsheet. Only input columns will be imported.
              Formula columns and calibration points will be preserved.
            </p>
            
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              disabled={isImporting}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            
            {importFile && (
              <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
                <p className="text-sm text-gray-700">
                  <strong>Selected:</strong> {importFile.name} ({(importFile.size / 1024).toFixed(2)} KB)
                </p>
              </div>
            )}
          </div>
        </div>
        
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => {
              setShowImportDialog(false);
              setImportFile(null);
            }}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmImport}
            disabled={!importFile || isImporting}
          >
            {isImporting ? (
              <>
                <LoadingSpinner size="sm" inline className="mr-2" />
                Importing...
              </>
            ) : (
              'Import'
            )}
          </Button>
        </ModalFooter>
      </Modal>

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        isOpen={showPdfPreview}
        onClose={() => {
          setShowPdfPreview(false);
          setPreviewPdf(null);
          setPreviewFileName('');
        }}
        pdf={previewPdf}
        fileName={previewFileName}
        onDownload={handleDownloadPdf}
      />

      {/* Formula Verification Modal */}
      <FormulaVerificationModal
        isOpen={showFormulaVerification}
        onClose={() => setShowFormulaVerification(false)}
        spreadsheet={spreadsheet}
        rowIndex={verificationRowIndex}
        templateName={spreadsheet?.metadata?.templateName || (selectedTemplateId ? trebTemplates.find(t => t.id === selectedTemplateId)?.name : undefined)}
        job={job}
      />
    </div>
  );
};

