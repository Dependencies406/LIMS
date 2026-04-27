/**
 * Clipboard Hook
 * Manages copy/paste/duplicate functionality for PDF elements
 */

import { useState, useCallback } from 'react';
import type { PdfElement } from '../types';

export function useClipboard() {
  const [clipboard, setClipboard] = useState<PdfElement[]>([]);

  const copy = useCallback((elements: PdfElement[]) => {
    if (elements.length === 0) return false;
    
    // Deep clone elements with new IDs
    const copied = elements.map((el) => ({
      ...el,
      id: `${el.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      // Offset position slightly for paste
      x: el.x + 10,
      y: el.y + 10,
    }));
    
    setClipboard(copied);
    return true;
  }, []);

  const paste = useCallback(() => {
    if (clipboard.length === 0) return null;
    
    // Return cloned clipboard items with new IDs
    return clipboard.map((el) => ({
      ...el,
      id: `${el.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }));
  }, [clipboard]);

  const duplicate = useCallback((elements: PdfElement[]) => {
    if (elements.length === 0) return null;
    
    // Create duplicates with offset positions
    return elements.map((el) => ({
      ...el,
      id: `${el.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      x: el.x + 20,
      y: el.y + 20,
    }));
  }, []);

  const hasClipboard = clipboard.length > 0;

  return {
    copy,
    paste,
    duplicate,
    hasClipboard,
  };
}
