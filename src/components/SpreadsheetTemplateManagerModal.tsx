/**
 * Spreadsheet Template Manager Modal
 * Full-screen modal where admins can create, edit, duplicate and delete
 * TREB-based spreadsheet templates.
 *
 * Templates are stored as raw TREBDocuments in the `spreadsheet_templates`
 * Firestore collection and can be applied in the Equipment Spreadsheet modal.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SpreadsheetEditorCore, toTrebDocument } from '../modules/spreadsheet/components';
import { createEmptySpreadsheet } from '../modules/spreadsheet/models/SpreadsheetModel';
import { parseCellId } from '../modules/spreadsheet/models/SpreadsheetModel';
import type { SpreadsheetModel } from '../modules/spreadsheet/models';
import type { Cell } from '../modules/spreadsheet/models';
import type { TREBDocument } from '@trebco/treb';
import { loadDocumentForSpreadsheet, serializeDocumentForStorage } from '../modules/spreadsheet/utils/spreadsheetSessionUtils';
import { getSpreadsheetCells, getActiveTab } from '../modules/spreadsheet/utils/tabMigration';
import {
  spreadsheetTemplateService,
  type SpreadsheetTemplate,
} from '../services/spreadsheetTemplateService';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from './common/LoadingSpinner';

export interface SpreadsheetTemplateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type EditorMode = 'list' | 'create' | 'edit';

const formatDate = (d: Date | undefined | null): string => {
  if (d == null) return '—';
  const date = d instanceof Date ? d : (d as { toDate?: () => Date }).toDate?.() ?? new Date(d as unknown as number);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export const SpreadsheetTemplateManagerModal: React.FC<SpreadsheetTemplateManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { currentUser } = useAuth();

  /* ─── Inline feedback (replaces toast — modal has isolated toast state) ─── */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const showInlineSuccess = (msg: string) => {
    setSaveSuccess(msg);
    setSaveError(null);
    setTimeout(() => setSaveSuccess(null), 3000);
  };
  const showInlineError = (msg: string) => {
    setSaveError(msg);
    setSaveSuccess(null);
  };

  /* ─── Template list state ─── */
  const [templates, setTemplates] = useState<SpreadsheetTemplate[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingEditTemplate, setLoadingEditTemplate] = useState(false);

  /* ─── Editor state ─── */
  const [mode, setMode] = useState<EditorMode>('list');
  const [editingTemplate, setEditingTemplate] = useState<SpreadsheetTemplate | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPublic, setFormPublic] = useState(false);
  const [formProtectEnabled, setFormProtectEnabled] = useState(false);
  const [formProtectPassword, setFormProtectPassword] = useState('');
  const [formProtectConfirm, setFormProtectConfirm] = useState('');
  const [nameError, setNameError] = useState('');
  const [protectError, setProtectError] = useState('');
  const [saving, setSaving] = useState(false);
  /** Print area per tab id (e.g. "sheet-4" -> "A1:F15"). Saved as template.tabPrintAreas. */
  const [tabPrintAreas, setTabPrintAreas] = useState<Record<string, string>>({});

  /* ─── TREB grid state ─── */
  const [editorSpreadsheet, setEditorSpreadsheet] = useState<SpreadsheetModel | null>(null);
  const [pendingExternal, setPendingExternal] = useState<TREBDocument | null>(null);
  /**
   * Tracks the latest raw TREB document from onTrebDocumentChange.
   * This is what we persist — it preserves TREB formatting exactly.
   * When loading an existing template we seed it with the stored trebDocument so
   * "save without editing" still works correctly.
   */
  const latestTrebDocRef = useRef<TREBDocument | null>(null);
  /** Getter for full document (all sheets) at save time — avoids saving only the last-changed sheet. */
  const getDocumentRef = useRef<(() => TREBDocument | null) | null>(null);
  const applyStyleRef = useRef<((style: { number_format?: string }) => void) | null>(null);

  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);

  /* ─── Undo/redo ─── */
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isUndoRedo, setIsUndoRedo] = useState(false);
  const historyInitRef = useRef<string | null>(null);

  /* ─── Delete confirm ─── */
  const [deleteTarget, setDeleteTarget] = useState<SpreadsheetTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ─── Discard confirm ─── */
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [hasEditorChanges, setHasEditorChanges] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  /* ─────────────────────── helpers ─────────────────────── */

  const loadTemplates = useCallback(async () => {
    if (!currentUser) return;
    setLoadingList(true);
    try {
      const list = await spreadsheetTemplateService.listByOwner(currentUser.uid);
      setTemplates(list);
    } catch (err) {
      console.error('[SpreadsheetTemplateManager] loadTemplates failed:', err);
      showInlineError('Failed to load templates');
    } finally {
      setLoadingList(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const serializeSpreadsheetForHistory = useCallback((model: SpreadsheetModel): Record<string, unknown> => {
    const serializeMap = (map?: Map<string, unknown>) => (map ? Object.fromEntries(map) : undefined);
    const serialized: Record<string, unknown> = {
      ...model,
      cells: serializeMap(model.cells as Map<string, unknown>),
      formulas: serializeMap(model.formulas as Map<string, unknown>),
      variables: serializeMap(model.variables as Map<string, unknown>),
      columnDefinitions: serializeMap(model.columnDefinitions as Map<string, unknown>),
    };
    if (model.tabs && model.tabs instanceof Map) {
      serialized.tabs = Array.from(model.tabs.entries()).map(([tabId, tab]) => ({
        ...tab,
        id: tabId,
        cells: serializeMap(tab.cells as Map<string, unknown>),
        columnDefinitions: serializeMap(tab.columnDefinitions as Map<string, unknown>),
      }));
      serialized.tabOrder = model.tabOrder || Array.from(model.tabs.keys());
    }
    return serialized;
  }, []);

  const restoreSpreadsheetFromHistory = useCallback((snapshot: Record<string, unknown>): SpreadsheetModel => {
    const restored = { ...snapshot } as Record<string, unknown>;
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
      restored.columnDefinitions = new Map(Object.entries(restored.columnDefinitions || {}));
    }
    if (restored.tabs && Array.isArray(restored.tabs)) {
      const tabsMap = new Map();
      (restored.tabs as unknown[]).forEach((tab: unknown) => {
        const t = tab as Record<string, unknown>;
        if (!t || typeof t !== 'object') return;
        const tabCells = t.cells && !(t.cells instanceof Map) ? new Map(Object.entries(t.cells)) : t.cells;
        const tabColDefs = t.columnDefinitions && !(t.columnDefinitions instanceof Map)
          ? new Map(Object.entries(t.columnDefinitions as Record<string, unknown>))
          : t.columnDefinitions;
        tabsMap.set(t.id, { ...t, cells: tabCells || new Map(), columnDefinitions: tabColDefs });
      });
      restored.tabs = tabsMap;
    }
    return restored as unknown as SpreadsheetModel;
  }, []);

  const saveToHistory = useCallback((model: SpreadsheetModel) => {
    const snapshot = serializeSpreadsheetForHistory(model);
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      next.push(JSON.parse(JSON.stringify(snapshot)));
      return next.slice(-50);
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex, serializeSpreadsheetForHistory]);

  const handleCellSelect = useCallback((cellId: string | null) => {
    if (cellId == null) {
      setSelectedCell(null);
      return;
    }
    if (!editorSpreadsheet) return;
    const cells = getSpreadsheetCells(editorSpreadsheet, undefined);
    let cell = cells.get(cellId) as Cell | undefined;
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
        setSelectedCell(null);
        return;
      }
    }
    setSelectedCell(cell);
  }, [editorSpreadsheet]);

  const handleCellUpdate = useCallback((cellId: string, value: string | number) => {
    if (!editorSpreadsheet) return;
    const prev = editorSpreadsheet;
    const cells = getSpreadsheetCells(prev, undefined);
    const updatedCells = new Map(cells);
    try {
      const { row, column } = parseCellId(cellId);
      let cell = updatedCells.get(cellId) as Cell | undefined;
      if (!cell) {
        cell = {
          id: cellId,
          row,
          column,
          dataType: 'number',
          displayValue: String(value),
          rawValue: value,
        };
      } else {
        cell = { ...cell, rawValue: value, displayValue: String(value), dataType: 'number' as const };
      }
      updatedCells.set(cellId, cell);
    } catch {
      return;
    }
    let next: SpreadsheetModel;
    if (prev.tabs && prev.tabs.size > 0) {
      const tabOrder = prev.tabOrder ?? Array.from(prev.tabs.keys());
      const activeTabId = tabOrder[0];
      const tab = getActiveTab(prev, activeTabId);
      if (tab) {
        const updatedTabs = new Map(prev.tabs);
        updatedTabs.set(activeTabId, { ...tab, cells: updatedCells });
        next = { ...prev, tabs: updatedTabs, cells: updatedCells, updatedAt: new Date() };
      } else {
        next = { ...prev, cells: updatedCells, updatedAt: new Date() };
      }
    } else {
      next = { ...prev, cells: updatedCells, updatedAt: new Date() };
    }
    setEditorSpreadsheet(next);
    setHasEditorChanges(true);
    saveToHistory(next);
  }, [editorSpreadsheet, saveToHistory]);

  const isUndoRedoRef = React.useRef(false);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0 && history.length > 0) {
      isUndoRedoRef.current = true;
      setIsUndoRedo(true);
      const prevState = history[historyIndex - 1] as Record<string, unknown>;
      setEditorSpreadsheet(restoreSpreadsheetFromHistory(prevState));
      setHistoryIndex(historyIndex - 1);
      setHasEditorChanges(true);
      setTimeout(() => {
        setIsUndoRedo(false);
        isUndoRedoRef.current = false;
      }, 150);
    }
  }, [history, historyIndex, restoreSpreadsheetFromHistory]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1 && history.length > 0) {
      isUndoRedoRef.current = true;
      setIsUndoRedo(true);
      const nextState = history[historyIndex + 1] as Record<string, unknown>;
      setEditorSpreadsheet(restoreSpreadsheetFromHistory(nextState));
      setHistoryIndex(historyIndex + 1);
      setHasEditorChanges(true);
      setTimeout(() => {
        setIsUndoRedo(false);
        isUndoRedoRef.current = false;
      }, 150);
    }
  }, [history, historyIndex, restoreSpreadsheetFromHistory]);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setMode('list');
      setEditingTemplate(null);
      setEditorSpreadsheet(null);
    }
  }, [isOpen, loadTemplates]);

  useEffect(() => {
    if (mode === 'list' || !editorSpreadsheet) return;
    if (!isUndoRedo && historyInitRef.current !== editorSpreadsheet.id) {
      const snapshot = serializeSpreadsheetForHistory(editorSpreadsheet);
      setHistory([JSON.parse(JSON.stringify(snapshot))]);
      setHistoryIndex(0);
      historyInitRef.current = editorSpreadsheet.id;
    }
  }, [mode, editorSpreadsheet, isUndoRedo, serializeSpreadsheetForHistory]);

  useEffect(() => {
    if (mode === 'list' || !isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, isOpen, handleUndo, handleRedo]);

  const resetEditor = useCallback(() => {
    setFormName('');
    setFormDescription('');
    setFormPublic(false);
    setFormProtectEnabled(false);
    setFormProtectPassword('');
    setFormProtectConfirm('');
    setNameError('');
    setProtectError('');
    setTabPrintAreas({});
    setEditingTemplate(null);
    setEditorSpreadsheet(null);
    setPendingExternal(null);
    latestTrebDocRef.current = null;
    setHasEditorChanges(false);
    setHistory([]);
    setHistoryIndex(-1);
    historyInitRef.current = null;
  }, []);

  /** Guard: if the editor has unsaved changes ask the user first. */
  const guardAction = useCallback((action: () => void) => {
    if (hasEditorChanges && mode !== 'list') {
      pendingActionRef.current = action;
      setShowDiscardConfirm(true);
    } else {
      action();
    }
  }, [hasEditorChanges, mode]);

  /* ─────────────────────── editor actions ─────────────────────── */

  const startCreate = useCallback(() => {
    resetEditor();
    setEditorSpreadsheet(createEmptySpreadsheet('tpl-new', 'Template', currentUser?.uid ?? 'unknown'));
    setMode('create');
  }, [resetEditor, currentUser?.uid]);

  const startEdit = useCallback((tpl: SpreadsheetTemplate) => {
    resetEditor();
    setFormName(tpl.name);
    setFormDescription(tpl.description ?? '');
    setFormPublic(tpl.isPublic ?? false);
    setFormProtectEnabled(!!tpl.unlockPasswordHash);
    setTabPrintAreas(tpl.tabPrintAreas && typeof tpl.tabPrintAreas === 'object' ? { ...tpl.tabPrintAreas } : {});
    setEditingTemplate(tpl);
    // Seed latestTrebDocRef so "save without editing" still persists the correct content.
    latestTrebDocRef.current = tpl.trebDocument as TREBDocument;
    // Mount an empty grid first; then schedule loading the stored document into TREB.
    setEditorSpreadsheet(createEmptySpreadsheet(tpl.id, tpl.name, currentUser?.uid ?? 'unknown'));
    // A small delay ensures the TREB instance is fully initialized before we load.
    // The externalDocumentRef in SpreadsheetGrid also catches it at creation time.
    setTimeout(() => {
      const doc = tpl.trebDocument as TREBDocument;
      setPendingExternal(loadDocumentForSpreadsheet(doc) ?? doc ?? null);
    }, 80);
    setMode('edit');
  }, [resetEditor, currentUser?.uid]);

  /** Open template for edit, fetching from server first so protection password is current. */
  const handleEditClick = useCallback(async (tpl: SpreadsheetTemplate) => {
    setLoadingEditTemplate(true);
    try {
      const fresh = await spreadsheetTemplateService.getByIdFromServer(tpl.id);
      guardAction(() => startEdit(fresh ?? tpl));
    } catch {
      showInlineError('Failed to load template');
    } finally {
      setLoadingEditTemplate(false);
    }
  }, [guardAction, startEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelEdit = useCallback(() => {
    guardAction(() => {
      resetEditor();
      setMode('list');
    });
  }, [guardAction, resetEditor]);

  const handleSave = useCallback(async () => {
    if (!currentUser || !editorSpreadsheet) return;

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setNameError('Template name is required');
      return;
    }
    setNameError('');
    setProtectError('');

    let unlockPasswordHash: string | null = null;
    if (formProtectEnabled) {
      if (formProtectPassword || formProtectConfirm) {
        if (formProtectPassword.length < 4) {
          setProtectError('Password must be at least 4 characters');
          return;
        }
        if (formProtectPassword !== formProtectConfirm) {
          setProtectError('Passwords do not match');
          return;
        }
        unlockPasswordHash = await spreadsheetTemplateService.hashPassword(formProtectPassword);
      } else if (editingTemplate?.unlockPasswordHash) {
        // Keep current password (user left fields blank); use hash from template we loaded for edit.
        unlockPasswordHash = editingTemplate.unlockPasswordHash;
      }
    }
    // When protection is off, explicitly clear the hash so it persists on update.

    setSaving(true);
    try {
      // Prefer live SerializeDocument() at save time so all sheets (tabs) are persisted, not just the last edit.
      const rawDoc = getDocumentRef.current?.() ?? latestTrebDocRef.current ?? toTrebDocument(editorSpreadsheet);
      const trebDocument: TREBDocument = rawDoc && typeof rawDoc === 'object'
        ? (serializeDocumentForStorage(rawDoc) ?? rawDoc as TREBDocument)
        : toTrebDocument(editorSpreadsheet);

      if (mode === 'create') {
        await spreadsheetTemplateService.create({
          name: trimmedName,
          description: formDescription.trim(),
          trebDocument,
          ownerId: currentUser.uid,
          isPublic: formPublic,
          unlockPasswordHash,
          ...(Object.keys(tabPrintAreas).length > 0 && { tabPrintAreas }),
        });
        showInlineSuccess(`Template "${trimmedName}" created successfully`);
        await loadTemplates();
        resetEditor();
        setMode('list');
      } else if (editingTemplate) {
        await spreadsheetTemplateService.update(editingTemplate.id, {
          name: trimmedName,
          description: formDescription.trim(),
          trebDocument,
          isPublic: formPublic,
          unlockPasswordHash,
          tabPrintAreas,
        });
        showInlineSuccess(`Template "${trimmedName}" updated successfully`);
        await loadTemplates();
        setHasEditorChanges(false);
        setEditingTemplate((prev) => (prev ? { ...prev, name: trimmedName, description: formDescription.trim(), isPublic: formPublic, unlockPasswordHash, tabPrintAreas, updatedAt: new Date() } : null));
        /* Stay in edit mode on the same template so the user can continue working without re-opening from the list. */
      }
    } catch (err: any) {
      console.error('[SpreadsheetTemplateManager] handleSave failed:', err);
      showInlineError(err?.message || 'Failed to save template. Check console for details.');
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, editorSpreadsheet, formName, formDescription, formPublic, mode, editingTemplate, tabPrintAreas, loadTemplates, resetEditor]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await spreadsheetTemplateService.delete(deleteTarget.id);
      showInlineSuccess(`Template "${deleteTarget.name}" deleted`);
      if (editingTemplate?.id === deleteTarget.id) {
        resetEditor();
        setMode('list');
      }
      setDeleteTarget(null);
      await loadTemplates();
    } catch (err) {
      console.error('[SpreadsheetTemplateManager] handleDelete failed:', err);
      showInlineError('Failed to delete template');
    } finally {
      setDeleting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteTarget, editingTemplate, resetEditor, loadTemplates]);

  const handleDuplicate = useCallback(async (tpl: SpreadsheetTemplate) => {
    if (!currentUser) return;
    try {
      await spreadsheetTemplateService.duplicate(tpl.id, currentUser.uid, templates.map(t => t.name));
      showInlineSuccess(`Duplicated "${tpl.name}"`);
      await loadTemplates();
    } catch (err) {
      console.error('[SpreadsheetTemplateManager] handleDuplicate failed:', err);
      showInlineError('Failed to duplicate template');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, templates, loadTemplates]);

  /* ─────────────────────── render ─────────────────────── */

  if (!isOpen) return null;

  return (
    <div className="modal !p-0">
      <div className="modal-content !w-screen !h-screen !max-w-none !max-h-none !rounded-none flex flex-col overflow-hidden bg-gray-50/80">

        {/* ── Header (compact so spreadsheet gets ~80% of UI) ── */}
        <div className="flex-shrink-0 border-b border-gray-200/80 bg-white px-4 py-2.5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Spreadsheet Template Builder</h2>
          <button
            onClick={() => guardAction(onClose)}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Inline feedback banner ── */}
        {(saveSuccess || saveError) && (
          <div className={`flex-shrink-0 mx-4 mt-2 rounded-lg px-3 py-2 flex items-center gap-2 text-xs ${
            saveSuccess ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-primary-50 text-primary-800 border border-primary-200'
          }`}>
            {saveSuccess ? (
              <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="font-medium">{saveSuccess || saveError}</span>
            <button
              onClick={() => { setSaveSuccess(null); setSaveError(null); }}
              className="ml-auto text-xs font-medium opacity-80 hover:opacity-100 underline-offset-2 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Body: sidebar ~15% width, main (form + spreadsheet) ~85%; spreadsheet area gets ~80% of height ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── Sidebar (narrow so spreadsheet has more horizontal space) ── */}
          <div className="w-48 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col min-h-0">
            <div className="p-2 border-b border-gray-100">
              <button
                onClick={() => guardAction(startCreate)}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Template
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
              {loadingList ? (
                <div className="flex items-center justify-center py-10">
                  <LoadingSpinner size="sm" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-10 px-3">
                  <div className="w-11 h-11 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-600">No templates yet</p>
                  <p className="text-xs text-gray-400 mt-1">Click New Template to get started</p>
                </div>
              ) : (
                templates.map(tpl => (
                  <div
                    key={tpl.id}
                    className={`rounded-lg border transition-all ${
                      editingTemplate?.id === tpl.id
                        ? 'border-primary-300 bg-primary-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm'
                    }`}
                  >
                    <button
                      className="w-full text-left p-2"
                      onClick={() => guardAction(() => { void handleEditClick(tpl); })}
                      disabled={loadingEditTemplate}
                    >
                      <div className="font-medium text-xs text-gray-900 truncate">{tpl.name}</div>
                      {tpl.description && (
                        <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{tpl.description}</div>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {tpl.isPublic && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-primary-100 text-primary-700">
                            Shared
                          </span>
                        )}
                        <span className="text-[11px] text-gray-400">{formatDate(tpl.updatedAt)}</span>
                      </div>
                    </button>
                    <div className="flex border-t border-gray-100">
                      <button
                        onClick={() => guardAction(() => { void handleEditClick(tpl); })}
                        className="flex-1 py-1.5 text-[10px] font-medium text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors rounded-bl-lg"
                        title="Edit"
                        disabled={loadingEditTemplate}
                      >
                        {loadingEditTemplate ? '…' : 'Edit'}
                      </button>
                      <button
                        onClick={() => handleDuplicate(tpl)}
                        className="flex-1 py-1.5 text-[10px] font-medium text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        title="Duplicate"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => setDeleteTarget(tpl)}
                        className="flex-1 py-1.5 text-[10px] font-medium text-gray-500 hover:text-primary-700 hover:bg-primary-50 transition-colors rounded-br-lg"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── Main editor area ── */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-white">
            {mode === 'list' ? (
              /* Empty state */
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                <div className="w-16 h-16 bg-gradient-to-br from-primary-100 to-primary-200 rounded-2xl flex items-center justify-center mb-5 shadow-sm">
                  <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-800 mb-2">Template Builder</h3>
                <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
                  Select a template to edit or create a new one. Use formulas, multiple tabs, and formatting — everything is saved as you see it.
                </p>
                <button
                  onClick={startCreate}
                  className="mt-6 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                >
                  New Template
                </button>
              </div>
            ) : (
              <>
                {/* ── Form bar (compact single row so spreadsheet gets ~80% of UI) ── */}
                <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="w-40 min-w-0">
                      <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Name <span className="text-primary-500">*</span></label>
                      <input
                        type="text"
                        value={formName}
                        onChange={e => {
                          setFormName(e.target.value);
                          if (e.target.value.trim()) setNameError('');
                          setHasEditorChanges(true);
                        }}
                        placeholder="e.g. Force Calibration"
                        className={`w-full px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                          nameError ? 'border-primary-400 bg-primary-50/50' : 'border-gray-300 bg-gray-50/50'
                        }`}
                      />
                      {nameError && <p className="text-[11px] text-primary-600 mt-0.5">{nameError}</p>}
                    </div>
                    <div className="flex-1 min-w-[120px] max-w-xs">
                      <label className="block text-[11px] font-medium text-gray-500 mb-0.5">Description</label>
                      <input
                        type="text"
                        value={formDescription}
                        onChange={e => { setFormDescription(e.target.value); setHasEditorChanges(true); }}
                        placeholder="Short description"
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={formPublic}
                        onChange={e => { setFormPublic(e.target.checked); setHasEditorChanges(true); }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-xs text-gray-600">Shared</span>
                    </label>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={cancelEdit}
                        className="px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                        disabled={saving}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                      >
                          {saving ? (
                            <>
                              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Saving…
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              {mode === 'create' ? 'Save' : 'Update'}
                            </>
                          )}
                        </button>
                    </div>
                  </div>
                  {/* Password & design note: single compact row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 pt-1.5 border-t border-gray-100">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formProtectEnabled}
                        onChange={e => {
                          setFormProtectEnabled(e.target.checked);
                          if (!e.target.checked) {
                            setFormProtectPassword('');
                            setFormProtectConfirm('');
                            setProtectError('');
                          }
                          setHasEditorChanges(true);
                        }}
                        className="w-3 h-3 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-[11px] text-gray-500">Password to unlock cells</span>
                    </label>
                    {formProtectEnabled && (
                      <>
                        <input
                          type="password"
                          value={formProtectPassword}
                          onChange={e => { setFormProtectPassword(e.target.value); setProtectError(''); setHasEditorChanges(true); }}
                          placeholder={editingTemplate?.unlockPasswordHash ? 'Leave blank to keep' : 'Password'}
                          className="w-28 px-1.5 py-1 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <input
                          type="password"
                          value={formProtectConfirm}
                          onChange={e => { setFormProtectConfirm(e.target.value); setProtectError(''); setHasEditorChanges(true); }}
                          placeholder="Confirm"
                          className="w-24 px-1.5 py-1 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </>
                    )}
                    {protectError && <span className="text-[11px] text-primary-600">{protectError}</span>}
                    <span className="text-[10px] text-gray-400 ml-auto">Design below is saved as you see it.</span>
                  </div>
                  {/* Print area per tab */}
                  {(() => {
                    const tabList = editingTemplate?.tabs?.length
                      ? editingTemplate.tabs
                      : (editorSpreadsheet?.tabOrder && editorSpreadsheet.tabs
                        ? editorSpreadsheet.tabOrder.map((id: string) => ({
                            id,
                            name: (editorSpreadsheet.tabs!.get(id) as { name?: string } | undefined)?.name ?? id,
                          }))
                        : []);
                    if (tabList.length === 0) return null;
                    return (
                      <div className="flex flex-wrap items-start gap-x-6 gap-y-2 mt-1.5 pt-1.5 border-t border-gray-100">
                        <span className="text-[11px] font-medium text-gray-600 shrink-0">Print area</span>
                        {tabList.map((tab: { id: string; name: string }) => (
                          <div key={tab.id} className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-600 whitespace-nowrap">{tab.name}</span>
                            <input
                              type="text"
                              value={tabPrintAreas[tab.id] ?? ''}
                              onChange={e => {
                                const v = e.target.value.trim();
                                setTabPrintAreas(prev => {
                                  const next = { ...prev };
                                  if (v) next[tab.id] = v;
                                  else delete next[tab.id];
                                  return next;
                                });
                                setHasEditorChanges(true);
                              }}
                              placeholder="e.g. A1:F15"
                              className="w-24 px-1.5 py-1 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* ── Spreadsheet working area: top-layer editor (shared with equipment modal for consistency) ── */}
                <div className="flex-1 min-h-0 overflow-hidden p-2 bg-gray-100/80">
                  {editorSpreadsheet && (
                    <div className="h-full min-h-0 rounded-lg border border-gray-200/80 bg-white shadow-sm overflow-hidden flex flex-col">
                      <SpreadsheetEditorCore
                        spreadsheet={editorSpreadsheet}
                        onSpreadsheetChange={(updated) => {
                          if (isUndoRedoRef.current) return;
                          setEditorSpreadsheet(updated);
                          setHasEditorChanges(true);
                          if (!isUndoRedo) saveToHistory(updated);
                        }}
                        externalDocument={pendingExternal}
                        onExternalDocumentConsumed={() => setPendingExternal(null)}
                        onTrebDocumentChange={doc => { latestTrebDocRef.current = doc; }}
                        onRegisterGetDocument={getDoc => { getDocumentRef.current = getDoc; }}
                        applyStyleRef={applyStyleRef}
                        isReadOnly={false}
                        handleUndo={handleUndo}
                        handleRedo={handleRedo}
                        canUndo={historyIndex > 0 && history.length > 0}
                        canRedo={historyIndex < Math.max(0, history.length - 1) && history.length > 0}
                        onCellSelect={handleCellSelect}
                        onCellUpdate={handleCellUpdate}
                        fillHeight
                        gridKey={`template-editor-${editingTemplate?.id ?? 'new'}`}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Delete confirm dialog ── */}
      {deleteTarget && (
        <div className="modal">
          <div className="modal-content max-w-sm rounded-xl shadow-xl border border-gray-200">
            <div className="p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-2">Delete template</h3>
              <p className="text-sm text-gray-600 mb-6">
                Delete <strong>"{deleteTarget.name}"</strong>? This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-60 transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Discard changes confirm ── */}
      {showDiscardConfirm && (
        <div className="modal">
          <div className="modal-content max-w-sm rounded-xl shadow-xl border border-gray-200">
            <div className="p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-2">Unsaved changes</h3>
              <p className="text-sm text-gray-600 mb-6">
                Discard your changes and continue?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowDiscardConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Keep editing
                </button>
                <button
                  onClick={() => {
                    setShowDiscardConfirm(false);
                    setHasEditorChanges(false);
                    pendingActionRef.current?.();
                    pendingActionRef.current = null;
                  }}
                  className="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                >
                  Discard & continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
