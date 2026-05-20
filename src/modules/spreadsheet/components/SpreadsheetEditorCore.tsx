/**
 * Top-layer spreadsheet editor: single place for grid + toolbar used by equipment modal
 * and template manager. Ensures consistent load/save and one place to fix behavior (e.g. dates).
 */

import React, { useRef } from 'react';
import type { SpreadsheetModel } from '../models/SpreadsheetModel';
import type { TREBDocument } from '@trebco/treb';
import { SpreadsheetGrid } from './SpreadsheetGrid';
import { SpreadsheetToolbar } from './SpreadsheetToolbar';

export interface SpreadsheetEditorCoreProps {
  /** Current spreadsheet model (for documentFromProps when no external doc). */
  spreadsheet: SpreadsheetModel | null;
  /** Called when grid emits document-change; parent should update state and optionally sync tabs. */
  onSpreadsheetChange: (model: SpreadsheetModel, options?: { isFullReplace?: boolean; activeTabId?: string }) => void;
  /** Normalized TREB document to load (e.g. from equipment or template). Use loadDocumentForSpreadsheet() before passing. */
  externalDocument?: TREBDocument | null;
  /** Called after externalDocument has been consumed so parent can clear it. */
  onExternalDocumentConsumed?: () => void;
  /** Fired with latest TREB doc on each document-change; use for save. */
  onTrebDocumentChange?: (doc: TREBDocument) => void;
  /** Register getter for current TREB document at save time. */
  onRegisterGetDocument?: (getDocument: () => TREBDocument | null) => void;
  /** Ref for apply-style (Custom format); grid will set it. */
  applyStyleRef: React.MutableRefObject<((style: { number_format?: string }) => void) | null>;
  /** Grid read-only. */
  isReadOnly?: boolean;
  /** Undo/redo. */
  handleUndo: () => void;
  handleRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Show Templates button and handler (e.g. equipment modal). */
  showTemplates?: boolean;
  onOpenTemplates?: () => void;
  /** When user tries to clear a locked cell. */
  onRequestUnlockLockedCell?: (performClear: () => void) => void;
  /** Cell update/select (required by grid). */
  onCellUpdate: (cellId: string, value: string | number, formula?: string) => void;
  onCellSelect?: (cellId: string | null) => void;
  /** Optional: active tab id for merge behavior; parent can pass from state. */
  activeTabId?: string;
  /** Optional: set active tab when grid reports tab change. */
  onActiveTabChange?: (tabId: string) => void;
  /** Fill height in flex layout. */
  fillHeight?: boolean;
  /** Stable key for grid (e.g. equipment index + spreadsheet id). */
  gridKey?: string;
}

export const SpreadsheetEditorCore: React.FC<SpreadsheetEditorCoreProps> = ({
  spreadsheet,
  onSpreadsheetChange,
  externalDocument,
  onExternalDocumentConsumed,
  onTrebDocumentChange,
  onRegisterGetDocument,
  applyStyleRef,
  isReadOnly = false,
  handleUndo,
  handleRedo,
  canUndo,
  canRedo,
  showTemplates = false,
  onOpenTemplates,
  onRequestUnlockLockedCell,
  onCellUpdate,
  onCellSelect,
  activeTabId,
  onActiveTabChange,
  fillHeight = true,
  gridKey = 'spreadsheet-editor-core',
}) => {
  const isUndoRedoRef = useRef(false);

  const handleSpreadsheetChange = (
    updated: SpreadsheetModel,
    options?: { isFullReplace?: boolean; activeTabId?: string }
  ) => {
    if (options?.activeTabId) onActiveTabChange?.(options.activeTabId);
    if (options?.isFullReplace) {
      onSpreadsheetChange(updated, options);
      return;
    }
    onSpreadsheetChange(updated, options);
  };

  const toolbarSlot =
    !isReadOnly ? (
      <SpreadsheetToolbar
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        showTemplates={showTemplates}
        onOpenTemplates={onOpenTemplates}
        applyStyleRef={applyStyleRef}
      />
    ) : undefined;

  if (!spreadsheet) return null;

  return (
    <SpreadsheetGrid
      key={gridKey}
      spreadsheet={spreadsheet}
      isReadOnly={isReadOnly}
      fillHeight={fillHeight}
      externalDocument={externalDocument}
      onExternalDocumentConsumed={onExternalDocumentConsumed}
      onTrebDocumentChange={onTrebDocumentChange}
      onRegisterGetDocument={onRegisterGetDocument}
      onRegisterApplyStyle={(apply) => {
        applyStyleRef.current = apply;
      }}
      onRequestUnlockLockedCell={onRequestUnlockLockedCell}
      toolbarSlot={toolbarSlot}
      onCellUpdate={onCellUpdate}
      onCellSelect={onCellSelect}
      onSpreadsheetChange={handleSpreadsheetChange}
    />
  );
};
