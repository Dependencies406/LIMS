/**
 * Spreadsheet Page
 * Main page for spreadsheet module
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { SpreadsheetModel, Cell } from '../models';
import { createEmptySpreadsheet } from '../models/SpreadsheetModel';
import { SpreadsheetGrid, SpreadsheetToolbar } from '../components';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../hooks/useToast';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { spreadsheetService } from '../services/spreadsheetService';

export const SpreadsheetPage: React.FC = () => {
  const { spreadsheetId } = useParams<{ spreadsheetId?: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();

  const [spreadsheet, setSpreadsheet] = useState<SpreadsheetModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isUndoRedo, setIsUndoRedo] = useState(false);
  const isUndoRedoRef = useRef(false);
  const historyInitRef = useRef<string | null>(null);
  const applyStyleRef = useRef<((style: { number_format?: string }) => void) | null>(null);

  // Load spreadsheet from Firestore
  useEffect(() => {
    const loadSpreadsheet = async () => {
      try {
        setLoading(true);
        
        if (spreadsheetId) {
          // Load existing spreadsheet
          const loaded = await spreadsheetService.getSpreadsheet(spreadsheetId);
          if (loaded) {
            setSpreadsheet(loaded);
          } else {
            showError('Spreadsheet not found');
            navigate('/spreadsheets');
          }
        } else {
          // Create new spreadsheet
          const newSpreadsheet = createEmptySpreadsheet(
            `spreadsheet-${Date.now()}`,
            'New Spreadsheet',
            currentUser?.uid || 'unknown'
          );
          // Save to Firestore
          const id = await spreadsheetService.createSpreadsheet(newSpreadsheet);
          setSpreadsheet({ ...newSpreadsheet, id });
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to load spreadsheet:', err);
        showError('Failed to load spreadsheet');
        setLoading(false);
      }
    };

    if (currentUser) {
      loadSpreadsheet();
    }
  }, [spreadsheetId, currentUser, showError, navigate]);

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

  useEffect(() => {
    if (!spreadsheet) {
      historyInitRef.current = null;
      return;
    }
    if (!isUndoRedo && historyInitRef.current !== spreadsheet.id) {
      const snapshot = serializeSpreadsheetForHistory(spreadsheet);
      setHistory([JSON.parse(JSON.stringify(snapshot))]);
      setHistoryIndex(0);
      historyInitRef.current = spreadsheet.id;
    }
  }, [spreadsheet, isUndoRedo, serializeSpreadsheetForHistory]);

  const saveToHistory = useCallback((model: SpreadsheetModel) => {
    const snapshot = serializeSpreadsheetForHistory(model);
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      next.push(JSON.parse(JSON.stringify(snapshot)));
      return next.slice(-50);
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex, serializeSpreadsheetForHistory]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0 && history.length > 0) {
      isUndoRedoRef.current = true;
      setIsUndoRedo(true);
      const prevState = history[historyIndex - 1] as unknown as Record<string, unknown>;
      setSpreadsheet(restoreSpreadsheetFromHistory(prevState));
      setHistoryIndex(historyIndex - 1);
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
      const nextState = history[historyIndex + 1] as unknown as Record<string, unknown>;
      setSpreadsheet(restoreSpreadsheetFromHistory(nextState));
      setHistoryIndex(historyIndex + 1);
      setTimeout(() => {
        setIsUndoRedo(false);
        isUndoRedoRef.current = false;
      }, 150);
    }
  }, [history, historyIndex, restoreSpreadsheetFromHistory]);

  useEffect(() => {
    if (!spreadsheet) return;
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
  }, [spreadsheet, handleUndo, handleRedo]);

  // Handle cell selection
  const handleCellSelect = useCallback((cellId: string) => {
    if (!spreadsheet) return;
    // Keep callback for compatibility with SpreadsheetGrid selection updates.
    void cellId;
  }, [spreadsheet]);

  // Handle cell update
  const handleCellUpdate = useCallback(async (cellId: string, value: string | number, formula?: string) => {
    if (!spreadsheet) return;

    const cells = spreadsheet.cells || new Map();
    const cell = cells.get(cellId);
    if (!cell) return;

    // Update cell
    const updatedCell: Cell = {
      ...cell,
      rawValue: formula ? null : (typeof value === 'number' ? value : value),
      formula,
      dataType: formula ? 'formula' : typeof value === 'number' ? 'number' : 'text',
      displayValue: typeof value === 'string' ? value : String(value),
      modifiedAt: new Date(),
      modifiedBy: currentUser?.uid,
    };

    // Update spreadsheet
    const updatedCells = new Map(spreadsheet.cells);
    updatedCells.set(cellId, updatedCell);

    const updatedSpreadsheet: SpreadsheetModel = {
      ...spreadsheet,
      cells: updatedCells,
      updatedAt: new Date(),
      updatedBy: currentUser?.uid,
    };

    setSpreadsheet(updatedSpreadsheet);

    // Save to Firestore (debounced in real app, but for now save immediately)
    try {
      await spreadsheetService.updateSpreadsheet(spreadsheet.id, {
        cells: updatedCells,
        updatedBy: currentUser?.uid,
      });
      success('Cell updated');
    } catch (err) {
      console.error('Failed to save cell update:', err);
      showError('Failed to save changes');
    }
  }, [spreadsheet, currentUser, success, showError]);

  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading spreadsheet...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!spreadsheet) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <p className="text-gray-500">Spreadsheet not found</p>
            <Button onClick={() => navigate('/spreadsheets')} className="mt-4">
              Back to Spreadsheets
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isReadOnly = spreadsheet.status === 'approved';

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{spreadsheet.name}</h1>
              <p className="text-gray-600 mt-1">
                Status: <span className="font-semibold">{spreadsheet.status}</span>
                {isReadOnly && <span className="ml-2 text-sm text-orange-600">(Read-only)</span>}
              </p>
            </div>
            <div className="flex gap-2">
              {!isReadOnly && (
                <>
                  <Button variant="secondary" onClick={async () => {
                    if (!spreadsheet) return;
                    try {
                      await spreadsheetService.updateSpreadsheet(spreadsheet.id, {
                        ...spreadsheet,
                        updatedBy: currentUser?.uid,
                      });
                      success('Spreadsheet saved');
                    } catch (err) {
                      console.error('Failed to save spreadsheet:', err);
                      showError('Failed to save spreadsheet');
                    }
                  }}>
                    Save
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Content - Spreadsheet Grid */}
        <Card>
          <SpreadsheetGrid
            spreadsheet={spreadsheet}
            isReadOnly={isReadOnly}
            onRegisterApplyStyle={(apply) => { applyStyleRef.current = apply; }}
            toolbarSlot={!isReadOnly ? (
              <SpreadsheetToolbar
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={historyIndex > 0 && history.length > 0}
                canRedo={historyIndex < Math.max(0, history.length - 1) && history.length > 0}
                applyStyleRef={applyStyleRef}
              />
            ) : undefined}
            onCellUpdate={handleCellUpdate}
            onCellSelect={handleCellSelect}
            onSpreadsheetChange={(updatedSpreadsheet) => {
              if (isUndoRedoRef.current) return;
              setSpreadsheet(updatedSpreadsheet);
              if (!isUndoRedo) saveToHistory(updatedSpreadsheet);
            }}
          />
        </Card>
      </div>
    </div>
  );
};

