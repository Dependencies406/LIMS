/**
 * Undo/Redo Hook
 * Manages action history for undo/redo functionality
 */

import { useState, useCallback, useRef } from 'react';
import type { PdfTemplate } from '../types';

export interface HistoryState {
  template: PdfTemplate;
  timestamp: number;
}

const MAX_HISTORY = 50; // Maximum number of undo steps

export function useUndoRedo(initialTemplate: PdfTemplate) {
  const [template, setTemplate] = useState<PdfTemplate>(initialTemplate);
  const [history, setHistory] = useState<HistoryState[]>([{ template: initialTemplate, timestamp: Date.now() }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false);

  const updateTemplate = useCallback((newTemplate: PdfTemplate, addToHistory = true) => {
    setTemplate(newTemplate);

    if (!addToHistory || isUndoRedoRef.current) {
      return;
    }

    setHistory((prev) => {
      // Remove any history after current index (when undoing and then making new changes)
      const newHistory = prev.slice(0, historyIndex + 1);
      
      // Add new state
      const updated = [
        ...newHistory,
        { template: newTemplate, timestamp: Date.now() }
      ];

      // Limit history size
      if (updated.length > MAX_HISTORY) {
        return updated.slice(-MAX_HISTORY);
      }

      return updated;
    });

    setHistoryIndex((prev) => {
      const newIndex = prev + 1;
      const maxIndex = Math.min(history.length, MAX_HISTORY - 1);
      return Math.min(newIndex, maxIndex);
    });
  }, [historyIndex, history.length]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoRef.current = true;
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setTemplate(history[newIndex].template);
      setTimeout(() => {
        isUndoRedoRef.current = false;
      }, 0);
      return true;
    }
    return false;
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedoRef.current = true;
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setTemplate(history[newIndex].template);
      setTimeout(() => {
        isUndoRedoRef.current = false;
      }, 0);
      return true;
    }
    return false;
  }, [historyIndex, history]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const clearHistory = useCallback(() => {
    setHistory([{ template, timestamp: Date.now() }]);
    setHistoryIndex(0);
  }, [template]);

  return {
    template,
    updateTemplate,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
  };
}
