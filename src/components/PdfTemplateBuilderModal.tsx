/**
 * PDF Template Builder Modal
 * Main UI for creating and editing PDF templates (replaces old PDF settings)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PdfTemplateBuilderCanvas } from '../modules/pdf-template-builder/components/PdfTemplateBuilderCanvas';
import { ElementPropertiesPanel } from '../modules/pdf-template-builder/components/ElementPropertiesPanel';
import { AlignmentToolbar } from '../modules/pdf-template-builder/components/AlignmentToolbar';
import { SectionPanel } from '../modules/pdf-template-builder/components/SectionPanel';
import { createPdfElement, updateElement, getElementLabel } from '../modules/pdf-template-builder/models/PdfElement';
import type { ComponentDefinition } from '../modules/pdf-template-builder/components/sections/types';
import { pdfTemplateService } from '../services/pdfTemplateService';
import { useAuth } from '../contexts/AuthContext';
import { useUndoRedo } from '../modules/pdf-template-builder/hooks/useUndoRedo';
import { useClipboard } from '../modules/pdf-template-builder/hooks/useClipboard';
import type { PdfTemplate, PdfElement, PdfElementType, PdfPage, PdfTemplateScope } from '../modules/pdf-template-builder/types';
import { PdfComponentScannerModal } from './PdfComponentScannerModal';
import { Button } from './common';

export interface PdfTemplateBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId?: string; // If provided, load existing template
  onSave?: (template: PdfTemplate) => void;
  /** When creating a new template, pre-set its scope so it appears in the right module picker. */
  initialScope?: PdfTemplateScope;
}

export const PdfTemplateBuilderModal: React.FC<PdfTemplateBuilderModalProps> = ({
  isOpen,
  onClose,
  templateId,
  onSave,
  initialScope,
}) => {
  const { currentUser } = useAuth();
  const initialTemplate: PdfTemplate = {
    name: '',
    description: '',
    pageSize: 'A4',
    orientation: 'portrait',
    elements: [],
  };
  
  const { template, updateTemplate, undo, redo, canUndo, canRedo } = useUndoRedo(initialTemplate);
  const { copy, paste, duplicate, hasClipboard } = useClipboard();
  
  // Ensure template.name is always a string (never undefined)
  const templateName = template.name || '';
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>('header');
  const [showSections, setShowSections] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [showComponentScanner, setShowComponentScanner] = useState(false);
  const [activePageId, setActivePageId] = useState<string>('');
  const [activeLeftSidebarTab, setActiveLeftSidebarTab] = useState<'pages' | 'sections' | 'layers'>('layers');
  const isInputFocusedRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  /** null = use default CSS position (bottom-center); after first drag, stores explicit x/y */
  const [counterPos, setCounterPos] = useState<{ x: number; y: number } | null>(null);
  const [isCounterDragging, setIsCounterDragging] = useState(false);
  const counterRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  /** Scroll container for the Layers list — used to bring selected element into view. */
  const layersScrollRef = useRef<HTMLDivElement>(null);
  /**
   * Anchor element for range-selection in the Layers panel.
   * Set on every plain/ctrl click; unchanged on shift (range) clicks.
   * Stored in a ref so it doesn't cause extra re-renders.
   */
  const selectionAnchorRef = useRef<string | null>(null);
  const counterDragRef = useRef<{
    startMouseX: number;
    startMouseY: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);

  // Load template if templateId is provided - only on mount/open, not on every update
  useEffect(() => {
    // Reset initialization flag when modal closes
    if (!isOpen) {
      hasInitializedRef.current = false;
      return;
    }

    // Skip if already initialized
    if (hasInitializedRef.current) {
      return;
    }

    let isMounted = true;

    const loadTemplateSafe = async () => {
      if (templateId) {
        try {
          const loaded = await pdfTemplateService.getTemplate(templateId);
          if (loaded && isMounted) {
            hasInitializedRef.current = true;
            updateTemplate(loaded, false);
          }
        } catch (error) {
          if (isMounted) {
            console.error('Failed to load template:', error);
          }
        }
      } else {
        // Reset to new template only on initial open
        if (isMounted) {
          hasInitializedRef.current = true;
          updateTemplate({
            name: '',
            description: '',
            scope: initialScope ?? 'global',
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [],
          }, false);
          setSelectedElementIds([]);
        }
      }
    };

    loadTemplateSafe();

    return () => {
      isMounted = false;
    };
    // Only depend on isOpen, templateId, and initialScope - not updateTemplate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, templateId, initialScope]);

  // Removed - loadTemplate logic moved to useEffect to prevent race conditions

  // Ensure pages exist for multi-page templates (migrate legacy single-page templates)
  useEffect(() => {
    if (!isOpen) return;
    if (template.pages && template.pages.length > 0) {
      if (!activePageId || !template.pages.find(page => page.id === activePageId)) {
        setActivePageId(template.pages[0].id);
      }
      return;
    }
    const pageId = `page_${Date.now()}`;
    const initialPage: PdfPage = {
      id: pageId,
      pageNumber: 1,
      pageSize: template.pageSize || 'A4',
      orientation: template.orientation ?? 'portrait',
      elements: template.elements || [],
      backgroundPdf: template.backgroundPdf,
    };
    updateTemplate({
      ...template,
      pages: [initialPage],
      elements: template.elements || [],
    }, false);
    setActivePageId(pageId);
  }, [isOpen, template, activePageId, updateTemplate]);

  useEffect(() => {
    setSelectedElementIds([]);
  }, [activePageId]);

  // Safety net: prevent the browser's built-in Ctrl+Scroll zoom while the modal is open.
  // The canvas component handles its own Ctrl+Scroll, but this catches events that fire
  // outside the canvas (e.g. over the sidebars or toolbar).
  useEffect(() => {
    if (!isOpen) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [isOpen]);

  const pages = template.pages || [];
  const activePage = pages.find(page => page.id === activePageId) || pages[0];
  const activeElements = activePage?.elements || [];
  const activePageSize = activePage?.pageSize || template.pageSize;
  const activePageOrientation = activePage?.orientation ?? template.orientation ?? 'portrait';
  const activeBackgroundPdf = activePage?.backgroundPdf || template.backgroundPdf;

  const renumberPages = useCallback((list: PdfPage[]) => {
    return list.map((page, index) => ({
      ...page,
      pageNumber: index + 1,
    }));
  }, []);

  const updatePages = useCallback((updatedPages: PdfPage[]) => {
    const normalizedPages = renumberPages(updatedPages);
    updateTemplate({
      ...template,
      pages: normalizedPages,
      elements: normalizedPages[0]?.elements || [],
    });
  }, [template, updateTemplate, renumberPages]);

  const updateActivePage = useCallback((updates: Partial<PdfPage>) => {
    if (!activePage) return;
    const updatedPages = pages.map(page => page.id === activePage.id ? { ...page, ...updates } : page);
    updatePages(updatedPages);
  }, [activePage, pages, updatePages]);

  const updateActiveElements = useCallback((updateFn: (elements: PdfElement[]) => PdfElement[]) => {
    if (!activePage) return;
    const updatedPages = pages.map(page => {
      if (page.id !== activePage.id) return page;
      return {
        ...page,
        elements: updateFn(page.elements || []),
      };
    });
    updatePages(updatedPages);
  }, [activePage, pages, updatePages]);

  const handleSave = async () => {
    // Prevent multiple simultaneous saves
    if (saving) {
      return;
    }

    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    setSaving(true);
    try {
      if (templateId) {
        await pdfTemplateService.updateTemplate(templateId, template);
      } else {
        const id = await pdfTemplateService.createTemplate({
          ...template,
          metadata: {
            author: currentUser?.uid || 'unknown',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
        const saved = await pdfTemplateService.getTemplate(id);
        if (saved) {
          updateTemplate(saved, false);
        }
      }
      // Show success modal instead of closing
      console.log('[PdfTemplateBuilder] Save successful, showing success modal');
      setShowSaveSuccess(true);
      // Call onSave callback but don't let it close the modal
      onSave?.(template);
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const clonePageElements = useCallback((elements: PdfElement[]) => {
    return elements.map((el) => ({
      ...el,
      id: `${el.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }));
  }, []);

  const handleAddPage = useCallback(() => {
    const pageId = `page_${Date.now()}`;
    const newPage: PdfPage = {
      id: pageId,
      pageNumber: pages.length + 1,
      pageSize: activePage?.pageSize || template.pageSize,
      orientation: activePage?.orientation ?? template.orientation ?? 'portrait',
      elements: [],
      backgroundPdf: activePage?.backgroundPdf || template.backgroundPdf,
    };
    updatePages([...pages, newPage]);
    setActivePageId(pageId);
  }, [pages, activePage, template.pageSize, template.orientation, template.backgroundPdf, updatePages]);

  const handleDuplicatePage = useCallback(() => {
    if (!activePage) return;
    const pageId = `page_${Date.now()}`;
    const duplicated: PdfPage = {
      ...activePage,
      id: pageId,
      pageNumber: pages.length + 1,
      elements: clonePageElements(activePage.elements || []),
    };
    updatePages([...pages, duplicated]);
    setActivePageId(pageId);
  }, [activePage, pages, updatePages, clonePageElements]);

  const handleDeletePage = useCallback((pageId: string) => {
    if (pages.length <= 1) return;
    const updated = pages.filter(page => page.id !== pageId);
    updatePages(updated);
    if (activePageId === pageId) {
      setActivePageId(updated[0]?.id || '');
    }
  }, [pages, updatePages, activePageId]);

  const handleMovePage = useCallback((pageId: string, direction: 'up' | 'down') => {
    const index = pages.findIndex(page => page.id === pageId);
    if (index === -1) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= pages.length) return;
    const updated = [...pages];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    updatePages(updated);
  }, [pages, updatePages]);

  const handleElementSelect = useCallback((elementId: string | null, multiSelect?: boolean) => {
    if (!elementId) {
      setSelectedElementIds([]);
      selectionAnchorRef.current = null;
      return;
    }

    if (multiSelect) {
      setSelectedElementIds(prev =>
        prev.includes(elementId) ? prev.filter(id => id !== elementId) : [...prev, elementId]
      );
    } else {
      setSelectedElementIds([elementId]);
    }
    // Keep anchor in sync for canvas clicks (so range-select from layers panel is sensible)
    selectionAnchorRef.current = elementId;
  }, []);

  /**
   * Click handler for layer rows in the Layers panel.
   * Plain click  → single select  (anchor = clicked)
   * Ctrl/Cmd     → toggle         (anchor = clicked)
   * Shift        → range from anchor to clicked (anchor unchanged)
   * Ctrl+Shift   → same as Shift
   */
  const handleLayerClick = useCallback((elementId: string, isShift: boolean, isCtrl: boolean) => {
    if (isShift) {
      const anchorId = selectionAnchorRef.current;
      if (!anchorId) {
        // No anchor yet — treat as single select and set anchor
        setSelectedElementIds([elementId]);
        selectionAnchorRef.current = elementId;
        return;
      }
      const anchorIdx  = activeElements.findIndex(el => el.id === anchorId);
      const clickedIdx = activeElements.findIndex(el => el.id === elementId);
      if (anchorIdx === -1) {
        setSelectedElementIds([elementId]);
        selectionAnchorRef.current = elementId;
        return;
      }
      const lo = Math.min(anchorIdx, clickedIdx);
      const hi = Math.max(anchorIdx, clickedIdx);
      setSelectedElementIds(activeElements.slice(lo, hi + 1).map(el => el.id));
      // Anchor stays at the anchor element — do NOT update selectionAnchorRef
    } else if (isCtrl) {
      // Toggle single element
      setSelectedElementIds(prev =>
        prev.includes(elementId) ? prev.filter(id => id !== elementId) : [...prev, elementId]
      );
      selectionAnchorRef.current = elementId;
    } else {
      // Plain click — single select
      setSelectedElementIds([elementId]);
      selectionAnchorRef.current = elementId;
    }
  }, [activeElements]);

  // When an element is selected (from canvas or elsewhere), switch to the Layers
  // tab and scroll that element's row into view automatically.
  // For multi-select we scroll to the last element in the array (most recently
  // added / toggled) so the user sees the element they just interacted with.
  useEffect(() => {
    if (selectedElementIds.length === 0) return;
    const targetId = selectedElementIds[selectedElementIds.length - 1];

    // Switch to layers tab so the user can see the row
    setActiveLeftSidebarTab('layers');

    // Defer scroll by one tick so the tab content has rendered
    requestAnimationFrame(() => {
      const row = layersScrollRef.current?.querySelector<HTMLElement>(
        `[data-element-id="${targetId}"]`
      );
      row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [selectedElementIds]);

  const handleElementMove = useCallback((elementId: string, x: number, y: number) => {
    updateActiveElements((elements) => elements.map(el => {
      if (el.id === elementId) {
        if (el.type === 'line') {
          const lineEl = el as any;
          const oldX1 = lineEl.x1 !== undefined ? lineEl.x1 : el.x;
          const oldY1 = lineEl.y1 !== undefined ? lineEl.y1 : el.y;
          const oldX2 = lineEl.x2 !== undefined ? lineEl.x2 : el.x + 200;
          const oldY2 = lineEl.y2 !== undefined ? lineEl.y2 : el.y;
          const oldMinX = Math.min(oldX1, oldX2);
          const oldMinY = Math.min(oldY1, oldY2);
          const deltaX = x - oldMinX;
          const deltaY = y - oldMinY;
          return {
            ...el,
            x,
            y,
            x1: oldX1 + deltaX,
            y1: oldY1 + deltaY,
            x2: oldX2 + deltaX,
            y2: oldY2 + deltaY,
          };
        }
        return { ...el, x, y };
      }
      return el;
    }));
  }, [updateActiveElements]);

  // Handle multiple elements move (for alignment/distribution)
  const handleElementsMove = useCallback((updates: Array<{ elementId: string; x: number; y: number }>) => {
    updateActiveElements((elements) => elements.map(el => {
      const update = updates.find(u => u.elementId === el.id);
      if (update) {
        if (el.type === 'line') {
          const lineEl = el as any;
          const oldX1 = lineEl.x1 !== undefined ? lineEl.x1 : el.x;
          const oldY1 = lineEl.y1 !== undefined ? lineEl.y1 : el.y;
          const oldX2 = lineEl.x2 !== undefined ? lineEl.x2 : el.x + 200;
          const oldY2 = lineEl.y2 !== undefined ? lineEl.y2 : el.y;
          const oldMinX = Math.min(oldX1, oldX2);
          const oldMinY = Math.min(oldY1, oldY2);
          const deltaX = update.x - oldMinX;
          const deltaY = update.y - oldMinY;
          return {
            ...el,
            x: update.x,
            y: update.y,
            x1: oldX1 + deltaX,
            y1: oldY1 + deltaY,
            x2: oldX2 + deltaX,
            y2: oldY2 + deltaY,
          };
        }
        return { ...el, x: update.x, y: update.y };
      }
      return el;
    }));
  }, [updateActiveElements]);

  const handleElementResize = useCallback((elementId: string, width: number, height: number) => {
    updateActiveElements((elements) => elements.map(el =>
      el.id === elementId ? { ...el, width, height } : el
    ));
  }, [updateActiveElements]);

  const handleElementAdd = useCallback((type: PdfElementType | PdfElement | ComponentDefinition) => {
    let newElement: PdfElement;
    
    if (typeof type === 'string') {
      // Basic element type (from toolbar)
      newElement = createPdfElement(type, 100, 100);
    } else if ('type' in type && 'defaultProperties' in type) {
      // Component definition from section (has defaultProperties)
      const componentDef = type as ComponentDefinition;
      const defaultProps = componentDef.defaultProperties || {};
      
      // Create element with default properties from component definition
      newElement = createPdfElement(
        componentDef.type as PdfElementType,
        100,
        100,
        {
          ...defaultProps,
          // Ensure dataSource is properly set
          dataSource: defaultProps.dataSource || (componentDef.type === 'text'
            ? { type: 'text', key: 'job.title' }
            : componentDef.type === 'image'
            ? { type: 'image', key: 'company.logo' }
            : componentDef.type === 'chart'
            ? { type: 'chart', key: 'measurements.data' }
            : undefined),
        }
      ) as PdfElement;
    } else {
      // Already a PdfElement
      newElement = type as PdfElement;
    }
    
    // Ensure element has valid id
    if (!newElement || !newElement.id) {
      console.error('Failed to create element: invalid element', newElement);
      return;
    }
    
    const currentElements = activeElements || [];
    const updatedElements = [...currentElements, newElement];
    updateActiveElements(() => updatedElements);
    
    setSelectedElementIds([newElement.id]);
  }, [activeElements, updateActiveElements]);

  const handleElementDelete = useCallback((elementId: string) => {
    updateActiveElements((elements) => elements.filter(el => el.id !== elementId));
    setSelectedElementIds(prev => prev.filter(id => id !== elementId));
  }, [updateActiveElements]);

  const handleSelectedElementsDelete = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    updateActiveElements((elements) => elements.filter(el => !selectedElementIds.includes(el.id)));
    setSelectedElementIds([]);
  }, [selectedElementIds, updateActiveElements]);

  const handleElementReorder = useCallback((elementId: string, direction: 'up' | 'down') => {
    const currentElements = [...activeElements];
    const currentIndex = currentElements.findIndex(el => el.id === elementId);
    
    if (currentIndex === -1) return;
    
    // Calculate new index
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    // Check bounds
    if (newIndex < 0 || newIndex >= currentElements.length) return;
    
    // Swap elements
    [currentElements[currentIndex], currentElements[newIndex]] = 
      [currentElements[newIndex], currentElements[currentIndex]];
    
    updateActiveElements(() => currentElements);
  }, [activeElements, updateActiveElements]);

  const handleElementUpdate = useCallback((updates: Partial<PdfElement>) => {
    if (selectedElementIds.length === 0) return;

    // Ensure we preserve all elements and only update selected ones
    const updatedElements = activeElements.map(el => {
      if (selectedElementIds.includes(el.id)) {
        return updateElement(el, updates);
      }
      return el;
    });
    
    // Verify no elements were lost
    if (updatedElements.length !== activeElements.length) {
      console.warn('Element count mismatch during update', {
        before: activeElements.length,
        after: updatedElements.length
      });
      return;
    }

    updateActiveElements(() => updatedElements);
  }, [selectedElementIds, activeElements, updateActiveElements]);

  // Copy/Paste/Duplicate handlers
  const handleCopy = useCallback(() => {
    const selectedElements = activeElements.filter(el => selectedElementIds.includes(el.id));
    if (copy(selectedElements)) {
      console.log('Copied', selectedElements.length, 'element(s)');
    }
  }, [activeElements, selectedElementIds, copy]);

  const handlePaste = useCallback(() => {
    const pastedElements = paste();
    if (pastedElements && pastedElements.length > 0) {
      updateActiveElements((elements) => [...elements, ...pastedElements]);
      setSelectedElementIds(pastedElements.map(el => el.id));
    }
  }, [paste, updateActiveElements]);

  const handleDuplicate = useCallback(() => {
    const selectedElements = activeElements.filter(el => selectedElementIds.includes(el.id));
    const duplicated = duplicate(selectedElements);
    if (duplicated && duplicated.length > 0) {
      updateActiveElements((elements) => [...elements, ...duplicated]);
      setSelectedElementIds(duplicated.map(el => el.id));
    }
  }, [activeElements, selectedElementIds, duplicate, updateActiveElements]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (isInputFocusedRef.current) return;

      const isCtrl = e.ctrlKey || e.metaKey;

      // Undo/Redo
      if (isCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (isCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      // Copy
      else if (isCtrl && e.key === 'c') {
        e.preventDefault();
        handleCopy();
      }
      // Paste
      else if (isCtrl && e.key === 'v') {
        e.preventDefault();
        handlePaste();
      }
      // Duplicate
      else if (isCtrl && e.key === 'd') {
        e.preventDefault();
        handleDuplicate();
      }
      // Select All
      else if (isCtrl && e.key === 'a') {
        e.preventDefault();
        setSelectedElementIds(activeElements.map(el => el.id));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, undo, redo, handleCopy, handlePaste, handleDuplicate, activeElements]);

  const handleCounterDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const containerEl = canvasAreaRef.current;
    const counterEl = counterRef.current;
    if (!containerEl || !counterEl) return;

    const containerRect = containerEl.getBoundingClientRect();
    const counterRect = counterEl.getBoundingClientRect();

    // Compute current position relative to the canvas container
    counterDragRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPosX: counterRect.left - containerRect.left,
      startPosY: counterRect.top - containerRect.top,
    };

    setIsCounterDragging(true);
    document.body.style.cursor = 'grabbing';

    const handleMouseMove = (ev: MouseEvent) => {
      if (!counterDragRef.current || !containerEl || !counterRef.current) return;
      const { startMouseX, startMouseY, startPosX, startPosY } = counterDragRef.current;
      const counterW = counterRef.current.offsetWidth;
      const counterH = counterRef.current.offsetHeight;
      setCounterPos({
        x: Math.max(8, Math.min(containerEl.clientWidth - counterW - 8, startPosX + ev.clientX - startMouseX)),
        y: Math.max(8, Math.min(containerEl.clientHeight - counterH - 8, startPosY + ev.clientY - startMouseY)),
      });
    };

    const handleMouseUp = () => {
      counterDragRef.current = null;
      setIsCounterDragging(false);
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  const selectedElement = selectedElementIds.length === 1
    ? activeElements.find(el => el.id === selectedElementIds[0]) || null
    : null;

  if (!isOpen) return null;

  // ─── Dark-theme palette (Photoshop-inspired) ─────────────────────────────────
  // All colours are defined here so a single-line change updates the whole UI.
  // (Tailwind arbitrary-value classes like hover:bg-gray-100 also reference these.)

  return (
    <>
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif', backgroundColor: '#1a1a1a' }}
    >
      <div className="w-full h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#1a1a1a' }}>
        {/* ── Top Toolbar ── */}
        <div
          className="flex items-center flex-shrink-0 px-3 gap-1"
          style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: '#ffffff', minHeight: '48px' }}
        >
          {/* Template name */}
          <input
            type="text"
            placeholder="Untitled Template"
            value={templateName}
            onChange={(e) => updateTemplate({ ...template, name: e.target.value || '' })}
            onFocus={() => isInputFocusedRef.current = true}
            onBlur={() => isInputFocusedRef.current = false}
            className="text-sm font-semibold bg-transparent border-none outline-none px-2 py-1 rounded flex-shrink-0 min-w-0 max-w-[180px] hover:bg-gray-100 focus:bg-gray-50 transition-colors"
            style={{ color: '#111827', fontFamily: 'inherit' }}
          />

          {/* ── Tool groups ── */}
          <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-hidden justify-center">

            {/* Graphics / Shape tools */}
            <div className="flex items-center gap-0.5" style={{ borderRight: '1px solid #e5e7eb', paddingRight: 8, marginRight: 4 }}>
              <button onClick={() => handleElementAdd('text')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors" style={{ color: '#374151' }} title="Add Text (T)">
                <span className="text-sm font-bold">T</span>
              </button>
              <button onClick={() => handleElementAdd('line')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors" style={{ color: '#374151' }} title="Add Line">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" /></svg>
              </button>
              <button onClick={() => handleElementAdd('rectangle')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors" style={{ color: '#374151' }} title="Add Rectangle">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" /></svg>
              </button>
              <button onClick={() => handleElementAdd('image')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors" style={{ color: '#374151' }} title="Add Image">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </button>
            </div>

            {/* Data blocks */}
            <div className="flex items-center gap-0.5" style={{ borderRight: '1px solid #e5e7eb', paddingRight: 8, marginRight: 4 }}>
              <button onClick={() => handleElementAdd('equipment-table')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors" style={{ color: '#374151' }} title="Add Equipment Table">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18M10 3v18M3 3h18v18H3z" /></svg>
              </button>
              <button onClick={() => handleElementAdd('documents-table')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors" style={{ color: '#374151' }} title="Add Documents Index Table">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </button>
              <button onClick={() => handleElementAdd('chart')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors" style={{ color: '#374151' }} title="Add Chart">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </button>
              <button
                onClick={() => handleElementAdd({
                  id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  type: 'text', x: 100, y: 100, width: 120, height: 20,
                  fontSize: 9, align: 'center',
                  dataSource: { type: 'text', key: 'page.counter' },
                } as any)}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                style={{ color: '#6b7280' }}
                title="Add Page Counter"
              >
                <span className="text-[10px] font-bold">1/N</span>
              </button>
            </div>

            {/* Edit actions */}
            <div className="flex items-center gap-0.5" style={{ borderRight: '1px solid #e5e7eb', paddingRight: 8, marginRight: 4 }}>
              <button onClick={handleCopy} disabled={selectedElementIds.length === 0} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: '#374151' }} title="Copy (Ctrl+C)">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
              <button onClick={handlePaste} disabled={!hasClipboard} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: '#374151' }} title="Paste (Ctrl+V)">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              </button>
              <button onClick={handleDuplicate} disabled={selectedElementIds.length === 0} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: '#374151' }} title="Duplicate (Ctrl+D)">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>

            {/* Alignment & Distribution */}
            <AlignmentToolbar
              elements={activeElements}
              pageSize={activePageSize}
              orientation={activePageOrientation}
              selectedElementIds={selectedElementIds}
              onElementsMove={handleElementsMove}
            />

            {/* Undo / Redo */}
            <div className="flex items-center gap-0.5" style={{ borderRight: '1px solid #e5e7eb', paddingRight: 8, marginRight: 4 }}>
              <button onClick={undo} disabled={!canUndo} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: '#374151' }} title="Undo (Ctrl+Z)">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
              </button>
              <button onClick={redo} disabled={!canRedo} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: '#374151' }} title="Redo (Ctrl+Y)">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
              </button>
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setZoom((z) => Math.max(0.25, Math.round((z - 0.1) * 100) / 100))} className="w-6 h-6 flex items-center justify-center rounded text-sm font-medium leading-none hover:bg-gray-100 transition-colors" style={{ color: '#6b7280' }} title="Zoom out">−</button>
              <input type="range" min="0.25" max="3" step="0.05" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-16" style={{ accentColor: '#4688d7' }} />
              <button type="button" onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 100) / 100))} className="w-6 h-6 flex items-center justify-center rounded text-sm font-medium leading-none hover:bg-gray-100 transition-colors" style={{ color: '#6b7280' }} title="Zoom in">+</button>
              <button type="button" onClick={() => setZoom(1)} className="text-xs min-w-[3rem] hover:text-blue-600 transition-colors tabular-nums text-left" style={{ color: '#6b7280' }} title="Reset zoom to 100%">{Math.round(zoom * 100)}%</button>
            </div>
          </div>

          {/* Right: Scan / Save / Close */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-1">
            <button type="button" onClick={() => setShowComponentScanner(true)} className="px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 whitespace-nowrap hover:bg-gray-100 transition-colors" style={{ backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }} title="Scan all available PDF components">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <span>Scan</span>
            </button>
            <Button variant="primary" size="sm" loading={saving} disabled={saving || !templateName.trim()} onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSave(); }}>
              Save
            </Button>
            <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded text-xl leading-none hover:bg-gray-100 transition-colors" style={{ color: '#6b7280' }} title="Close">
              ×
            </button>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ── Left Sidebar ── */}
          <div
            className={`${leftSidebarCollapsed ? 'w-10' : 'w-[260px]'} flex flex-col flex-shrink-0 transition-all duration-200 overflow-hidden`}
            style={{ borderRight: '1px solid #e5e7eb', backgroundColor: '#ffffff' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-2 flex-shrink-0" style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', minHeight: '30px' }}>
              {!leftSidebarCollapsed && (
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>Elements</span>
              )}
              <button
                type="button"
                onClick={() => setLeftSidebarCollapsed((c) => !c)}
                className={`w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 transition-colors flex-shrink-0 ${leftSidebarCollapsed ? 'mx-auto' : 'ml-auto'}`}
                style={{ color: '#6b7280' }}
                title={leftSidebarCollapsed ? 'Expand panel' : 'Collapse panel'}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {leftSidebarCollapsed
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />}
                </svg>
              </button>
            </div>

            {leftSidebarCollapsed && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <span className="text-[10px] select-none" style={{ color: '#9ca3af', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Elements</span>
              </div>
            )}

            {!leftSidebarCollapsed && (<>
              {/* ── Toolbox ── */}
              <div className="p-3 flex-shrink-0" style={{ borderBottom: '1px solid #e5e7eb' }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>Graphics / Text</p>
                <div className="grid grid-cols-4 gap-1 mb-3">
                  <button onClick={() => handleElementAdd('text')} className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded hover:bg-gray-100 transition-colors" style={{ backgroundColor: '#f3f4f6', color: '#374151' }} title="Add Text">
                    <span className="text-sm font-bold leading-none">T</span>
                    <span className="text-[9px]" style={{ color: '#6b7280' }}>Text</span>
                  </button>
                  <button onClick={() => handleElementAdd('line')} className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded hover:bg-gray-100 transition-colors" style={{ backgroundColor: '#f3f4f6', color: '#374151' }} title="Add Line">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" /></svg>
                    <span className="text-[9px]" style={{ color: '#6b7280' }}>Line</span>
                  </button>
                  <button onClick={() => handleElementAdd('rectangle')} className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded hover:bg-gray-100 transition-colors" style={{ backgroundColor: '#f3f4f6', color: '#374151' }} title="Add Rectangle">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" /></svg>
                    <span className="text-[9px]" style={{ color: '#6b7280' }}>Rect</span>
                  </button>
                  <button onClick={() => handleElementAdd('image')} className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded hover:bg-gray-100 transition-colors" style={{ backgroundColor: '#f3f4f6', color: '#374151' }} title="Add Image">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span className="text-[9px]" style={{ color: '#6b7280' }}>Image</span>
                  </button>
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>Data Blocks</p>
                <div className="grid grid-cols-4 gap-1">
                  <button onClick={() => handleElementAdd('equipment-table')} className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded hover:bg-gray-100 transition-colors" style={{ backgroundColor: '#f3f4f6', color: '#374151' }} title="Add Equipment Table">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18M10 3v18M3 3h18v18H3z" /></svg>
                    <span className="text-[9px]" style={{ color: '#6b7280' }}>Equip.</span>
                  </button>
                  <button onClick={() => handleElementAdd('documents-table')} className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded hover:bg-gray-100 transition-colors" style={{ backgroundColor: '#f3f4f6', color: '#374151' }} title="Add Documents Index">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span className="text-[9px]" style={{ color: '#6b7280' }}>Docs</span>
                  </button>
                  <button onClick={() => handleElementAdd('chart')} className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded hover:bg-gray-100 transition-colors" style={{ backgroundColor: '#f3f4f6', color: '#374151' }} title="Add Chart">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    <span className="text-[9px]" style={{ color: '#6b7280' }}>Chart</span>
                  </button>
                  <button
                    onClick={() => handleElementAdd({
                      id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      type: 'text', x: 100, y: 100, width: 120, height: 20,
                      fontSize: 9, align: 'center',
                      dataSource: { type: 'text', key: 'page.counter' },
                    } as any)}
                    className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded hover:bg-gray-100 transition-colors"
                    style={{ backgroundColor: '#f3f4f6', color: '#374151' }}
                    title="Add Page Counter"
                  >
                    <span className="text-xs font-bold leading-none" style={{ color: '#6b7280' }}>1/N</span>
                    <span className="text-[9px]" style={{ color: '#6b7280' }}>Pages</span>
                  </button>
                </div>
              </div>

              {/* ── Tab bar ── */}
              <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #e5e7eb' }}>
                {(['pages', 'sections', 'layers'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveLeftSidebarTab(tab)}
                    className="flex-1 py-1.5 text-[11px] font-medium capitalize transition-colors"
                    style={{
                      color: activeLeftSidebarTab === tab ? '#4688d7' : '#6b7280',
                      borderBottom: activeLeftSidebarTab === tab ? '2px solid #4688d7' : '2px solid transparent',
                      backgroundColor: 'transparent',
                    }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* ── Tab content ── */}
              <div className="flex-1 overflow-y-auto p-3 min-h-0">

                {/* Pages */}
                {activeLeftSidebarTab === 'pages' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Pages ({pages.length})</span>
                      <button type="button" onClick={handleAddPage} className="text-[11px] px-2 py-0.5 rounded hover:bg-gray-100 transition-colors" style={{ backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}>+ Add</button>
                    </div>
                    <div className="space-y-0.5 mb-3">
                      {pages.map((page, index) => (
                        <div
                          key={page.id}
                          className="flex items-center gap-1 rounded px-2 py-1 overflow-hidden"
                          style={{
                            backgroundColor: activePage?.id === page.id ? '#1b4f8a' : 'transparent',
                            border: activePage?.id === page.id ? '1px solid #4688d7' : '1px solid transparent',
                          }}
                        >
                          <button type="button" onClick={() => setActivePageId(page.id)} className="flex-1 text-left text-xs font-medium" style={{ color: activePage?.id === page.id ? '#fff' : '#374151' }}>
                            Page {page.pageNumber}
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleMovePage(page.id, 'up'); }} disabled={index === 0} className="w-4 h-4 flex items-center justify-center rounded text-xs hover:bg-gray-100 transition-colors disabled:opacity-20 disabled:cursor-not-allowed" style={{ color: '#6b7280' }} title="Move up">↑</button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleMovePage(page.id, 'down'); }} disabled={index === pages.length - 1} className="w-4 h-4 flex items-center justify-center rounded text-xs hover:bg-gray-100 transition-colors disabled:opacity-20 disabled:cursor-not-allowed" style={{ color: '#6b7280' }} title="Move down">↓</button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleDeletePage(page.id); }} disabled={pages.length <= 1} className="w-4 h-4 flex items-center justify-center rounded text-xs hover:bg-red-900 transition-colors disabled:opacity-20 disabled:cursor-not-allowed" style={{ color: '#e74c3c' }} title="Delete page">✕</button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={handleAddPage} className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors" style={{ backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}>Add Page</button>
                      <button type="button" onClick={handleDuplicatePage} disabled={!activePage} className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" style={{ backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}>Duplicate</button>
                    </div>
                  </div>
                )}

                {/* Sections */}
                {activeLeftSidebarTab === 'sections' && (
                  <SectionPanel
                    selectedSectionId={selectedSectionId}
                    onSectionSelect={setSelectedSectionId}
                    onComponentAdd={handleElementAdd}
                    currentElements={activeElements}
                    className="w-full flex flex-col"
                  />
                )}

                {/* Layers */}
                {activeLeftSidebarTab === 'layers' && (
                  <div>
                    <p className="text-[11px] font-semibold mb-2" style={{ color: '#6b7280' }}>Layers ({activeElements.length})</p>
                    {activeElements.length === 0 ? (
                      <p className="text-[11px]" style={{ color: '#9ca3af' }}>No elements yet. Add from the toolbox above.</p>
                    ) : (
                      <div ref={layersScrollRef} className="space-y-0.5">
                        {activeElements.map((element, index) => {
                          const isSel = selectedElementIds.includes(element.id);
                          return (
                            <div
                              key={element.id}
                              data-element-id={element.id}
                              className="flex items-center rounded overflow-hidden"
                              style={{ backgroundColor: isSel ? '#1b4f8a' : 'transparent' }}
                            >
                              {/* Reorder */}
                              <div className="flex flex-col gap-0.5 px-0.5 py-0.5 flex-shrink-0">
                                <button type="button" onClick={(e) => { e.stopPropagation(); handleElementReorder(element.id, 'up'); }} disabled={index === 0} className="w-4 h-4 flex items-center justify-center rounded text-[10px] hover:bg-gray-100 transition-colors disabled:opacity-20 disabled:cursor-not-allowed" style={{ color: '#6b7280' }} title="Bring forward">↑</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); handleElementReorder(element.id, 'down'); }} disabled={index === activeElements.length - 1} className="w-4 h-4 flex items-center justify-center rounded text-[10px] hover:bg-gray-100 transition-colors disabled:opacity-20 disabled:cursor-not-allowed" style={{ color: '#6b7280' }} title="Send backward">↓</button>
                              </div>
                              {/* Index */}
                              <span className="text-[10px] font-medium min-w-[14px] text-center flex-shrink-0" style={{ color: '#9ca3af' }}>{index + 1}</span>
                              {/* Icon + name */}
                              <button
                                onClick={(e) => handleLayerClick(element.id, e.shiftKey, e.ctrlKey || e.metaKey)}
                                className="flex-1 text-left px-1.5 py-1.5 text-[11px] flex items-center gap-1.5 min-w-0 hover:bg-blue-50 transition-colors"
                                style={{ color: isSel ? '#fff' : '#374151' }}
                              >
                                <span className="flex-shrink-0 flex justify-center" style={{ color: isSel ? '#9ec8ff' : '#6b7280', width: 14 }}>
                                  {element.type === 'text' ? (
                                    <span className="text-[11px] font-bold">T</span>
                                  ) : element.type === 'line' ? (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14" /></svg>
                                  ) : element.type === 'rectangle' ? (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1" strokeWidth={2} /></svg>
                                  ) : element.type === 'image' ? (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                  ) : element.type === 'equipment-table' || element.type === 'documents-table' || element.type === 'treb-table' ? (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18M10 3v18M3 3h18v18H3z" /></svg>
                                  ) : element.type === 'chart' ? (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                  ) : (
                                    <span>•</span>
                                  )}
                                </span>
                                <span className="font-medium truncate">{getElementLabel(element).replace(/^[^\s]+\s/, '')}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>)}
          </div>

          {/* ── Canvas Area ── */}
          <div
            ref={canvasAreaRef}
            className="flex-1 relative overflow-hidden"
            style={{ backgroundColor: '#ffffff' }}
          >
            <PdfTemplateBuilderCanvas
              elements={activeElements}
              pageSize={activePageSize}
              orientation={activePageOrientation}
              backgroundPdf={activeBackgroundPdf}
              selectedElementIds={selectedElementIds}
              zoom={zoom}
              onElementSelect={handleElementSelect}
              onElementMove={handleElementMove}
              onElementsMove={handleElementsMove}
              onElementResize={handleElementResize}
              onElementDelete={handleElementDelete}
              onZoomChange={(newZoom) => setZoom(Math.min(3, Math.max(0.25, newZoom)))}
            />

            {/* Draggable page counter */}
            {(() => {
              const currentIdx = pages.findIndex((p) => p.id === activePageId);
              const total = Math.max(1, pages.length);
              const current = Math.max(1, currentIdx + 1);
              return (
                <div
                  ref={counterRef}
                  onMouseDown={handleCounterDragStart}
                  className="flex items-center gap-1.5 rounded-full pl-2 pr-3 py-1.5 shadow-xl"
                  style={{
                    position: 'absolute',
                    zIndex: 20,
                    cursor: isCounterDragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    backgroundColor: '#2c2c2c',
                    border: '1px solid #555',
                    ...(counterPos
                      ? { left: counterPos.x, top: counterPos.y }
                      : { bottom: 16, left: '50%', transform: 'translateX(-50%)' }),
                  }}
                  title="Drag to reposition"
                >
                  <svg width="8" height="12" viewBox="0 0 8 12" fill="#555" className="flex-shrink-0">
                    <circle cx="2" cy="2" r="1.3"/><circle cx="6" cy="2" r="1.3"/>
                    <circle cx="2" cy="6" r="1.3"/><circle cx="6" cy="6" r="1.3"/>
                    <circle cx="2" cy="10" r="1.3"/><circle cx="6" cy="10" r="1.3"/>
                  </svg>
                  <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => { if (currentIdx > 0) setActivePageId(pages[currentIdx - 1].id); }} disabled={currentIdx <= 0} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-[#3a3a3a] transition-colors disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: '#aaa' }} title="Previous page">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="text-xs font-medium tabular-nums whitespace-nowrap" style={{ color: '#d4d4d4' }}>Page {current} of {total}</span>
                  <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => { if (currentIdx < pages.length - 1) setActivePageId(pages[currentIdx + 1].id); }} disabled={currentIdx >= pages.length - 1} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-[#3a3a3a] transition-colors disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: '#aaa' }} title="Next page">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              );
            })()}
          </div>

          {/* ── Right Sidebar ── */}
          <div
            className={`${rightSidebarCollapsed ? 'w-10' : 'w-[300px]'} flex flex-col flex-shrink-0 transition-all duration-200 overflow-hidden`}
            style={{ borderLeft: '1px solid #e5e7eb', backgroundColor: '#ffffff' }}
          >
            <div className="flex items-center justify-between px-2 flex-shrink-0" style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb', minHeight: '30px' }}>
              <button
                type="button"
                onClick={() => setRightSidebarCollapsed((c) => !c)}
                className={`w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 transition-colors flex-shrink-0 ${rightSidebarCollapsed ? 'mx-auto' : 'mr-auto'}`}
                style={{ color: '#6b7280' }}
                title={rightSidebarCollapsed ? 'Expand panel' : 'Collapse panel'}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {rightSidebarCollapsed
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />}
                </svg>
              </button>
              {!rightSidebarCollapsed && (
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>Properties</span>
              )}
            </div>
            {rightSidebarCollapsed && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <span className="text-[10px] select-none" style={{ color: '#9ca3af', writingMode: 'vertical-rl' }}>Properties</span>
              </div>
            )}
            {!rightSidebarCollapsed && (
              <div className="flex-1 overflow-y-auto">
                <ElementPropertiesPanel
                  element={selectedElement}
                  template={template}
                  page={activePage}
                  onUpdate={handleElementUpdate}
                  onTemplateUpdate={(updates) => updateTemplate({ ...template, ...updates })}
                  onPageUpdate={(updates) => updateActivePage(updates)}
                  onDelete={handleSelectedElementsDelete}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Save Success Modal */}
    {showSaveSuccess && (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ position: 'fixed', zIndex: 9999, fontFamily: 'inherit', backgroundColor: 'rgba(0,0,0,0.7)' }}
        onClick={(e) => { if (e.target === e.currentTarget) setShowSaveSuccess(false); }}
      >
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-900">Success</h3>
            <button onClick={() => setShowSaveSuccess(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-6 h-6 flex items-center justify-center" type="button">×</button>
          </div>
          <div className="px-6 py-8 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-900 mb-2">Template Saved Successfully</p>
            <p className="text-sm text-gray-600">Your PDF template has been saved. You can continue editing or close this window.</p>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
            <Button variant="success" onClick={() => setShowSaveSuccess(false)}>OK</Button>
          </div>
        </div>
      </div>
    )}
    <PdfComponentScannerModal isOpen={showComponentScanner} onClose={() => setShowComponentScanner(false)} />
    </>
  );
};

