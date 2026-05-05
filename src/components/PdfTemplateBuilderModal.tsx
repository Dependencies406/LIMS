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
import { Button, IconButton } from './common';

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
  const [activeLeftSidebarTab, setActiveLeftSidebarTab] = useState<'pages' | 'sections' | 'layers'>('pages');
  const isInputFocusedRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  /** null = use default CSS position (bottom-center); after first drag, stores explicit x/y */
  const [counterPos, setCounterPos] = useState<{ x: number; y: number } | null>(null);
  const [isCounterDragging, setIsCounterDragging] = useState(false);
  const counterRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
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
      return;
    }

    if (multiSelect) {
      setSelectedElementIds(prev =>
        prev.includes(elementId) ? prev.filter(id => id !== elementId) : [...prev, elementId]
      );
    } else {
      setSelectedElementIds([elementId]);
    }
  }, []);

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

  return (
    <>
    <div 
      className="fixed inset-0 z-50 bg-black bg-opacity-50 overflow-hidden"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}
    >
      <div className="w-full h-full flex flex-col bg-white overflow-hidden">
        {/* Top Toolbar */}
        <div 
          className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0"
          style={{ 
            borderBottomColor: '#E5E7EB',
            backgroundColor: '#FFFFFF',
            minHeight: '56px'
          }}
        >
          {/* Left: Template Name (Editable) */}
          <input
            type="text"
            placeholder="Untitled Template"
            value={templateName}
            onChange={(e) => updateTemplate({ ...template, name: e.target.value || '' })}
            onFocus={() => isInputFocusedRef.current = true}
            onBlur={() => isInputFocusedRef.current = false}
            className="text-base font-semibold text-gray-900 bg-transparent border-none outline-none focus:bg-gray-50 px-2 py-1 rounded flex-shrink-0 min-w-0 max-w-[200px]"
            style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}
          />

          {/* Center: Icon Toolbar */}
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
            {/* Add Element Icons */}
            <div className="flex items-center gap-1 px-2 border-r" style={{ borderRightColor: '#E5E7EB' }}>
              <button
                onClick={() => handleElementAdd('text')}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                title="Add Text (T)"
              >
                <span className="text-sm font-bold text-gray-700">T</span>
              </button>
              <button
                onClick={() => handleElementAdd('line')}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                title="Add Line"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
                </svg>
              </button>
              <button
                onClick={() => handleElementAdd('rectangle')}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                title="Add Rectangle"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
                </svg>
              </button>
              <button
                onClick={() => handleElementAdd('image')}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                title="Add Image"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={() => handleElementAdd('equipment-table')}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                title="Add Equipment Table"
              >
                <span className="text-lg">📋</span>
              </button>
              <button
                onClick={() => handleElementAdd('documents-table')}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                title="Add Documents Index Table"
              >
                <span className="text-lg">📑</span>
              </button>
              <button
                onClick={() => handleElementAdd('chart')}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
                title="Add Chart"
              >
                <span className="text-lg">📈</span>
              </button>
            </div>

            {/* Edit Actions */}
            <div className="flex items-center gap-1 px-2 border-r" style={{ borderRightColor: '#E5E7EB' }}>
              <button
                onClick={handleCopy}
                disabled={selectedElementIds.length === 0}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Copy (Ctrl+C)"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={handlePaste}
                disabled={!hasClipboard}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Paste (Ctrl+V)"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </button>
              <button
                onClick={handleDuplicate}
                disabled={selectedElementIds.length === 0}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Duplicate (Ctrl+D)"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>

            {/* Alignment & Distribution Tools */}
            <AlignmentToolbar
              elements={activeElements}
              pageSize={activePageSize}
              orientation={activePageOrientation}
              selectedElementIds={selectedElementIds}
              onElementsMove={handleElementsMove}
            />

            {/* Undo/Redo & Zoom */}
            <div className="flex items-center gap-2 px-2">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo (Ctrl+Z)"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo (Ctrl+Y)"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                </svg>
              </button>
              <div className="flex items-center gap-1 ml-2">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.25, Math.round((z - 0.1) * 100) / 100))}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:bg-gray-100 text-sm font-medium leading-none"
                  title="Zoom out"
                >−</button>
                <input
                  type="range"
                  min="0.25"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-20"
                />
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 100) / 100))}
                  className="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:bg-gray-100 text-sm font-medium leading-none"
                  title="Zoom in"
                >+</button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="text-xs text-gray-600 min-w-[3rem] hover:text-primary-600 hover:underline"
                  title="Reset zoom to 100%"
                >{Math.round(zoom * 100)}%</button>
              </div>
            </div>
          </div>

          {/* Right: Scanner/Save/Close */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <button
              type="button"
              onClick={() => setShowComponentScanner(true)}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 flex items-center gap-1.5 whitespace-nowrap shadow-sm"
              title="Scan all available PDF components"
            >
              <svg className="w-4 h-4 flex-shrink-0 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-gray-700">Scan Components</span>
            </button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={saving || !templateName.trim()}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSave(); }}
            >
              Save
            </Button>
            <IconButton
              variant="ghost"
              size="sm"
              title="Close"
              onClick={onClose}
            >
              <span className="text-xl leading-none">×</span>
            </IconButton>
          </div>
        </div>

        {/* Main Content - Holy Grail Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar */}
          <div
            className={`${leftSidebarCollapsed ? 'w-10' : 'w-[280px]'} border-r flex flex-col flex-shrink-0 transition-all duration-200 overflow-hidden`}
            style={{
              borderRightColor: '#E5E7EB',
              backgroundColor: '#FFFFFF'
            }}
          >
            {/* Sidebar header / collapse toggle */}
            <div
              className="flex items-center justify-between px-2 border-b flex-shrink-0"
              style={{ borderBottomColor: '#E5E7EB', backgroundColor: '#F9FAFB', minHeight: '32px' }}
            >
              {!leftSidebarCollapsed && (
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Elements</span>
              )}
              <button
                type="button"
                onClick={() => setLeftSidebarCollapsed((c) => !c)}
                className={`w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 flex-shrink-0 ${leftSidebarCollapsed ? 'mx-auto' : 'ml-auto'}`}
                title={leftSidebarCollapsed ? 'Expand panel' : 'Collapse panel'}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {leftSidebarCollapsed
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  }
                </svg>
              </button>
            </div>

            {/* Collapsed indicator */}
            {leftSidebarCollapsed && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <span className="text-xs text-gray-400 select-none" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Elements</span>
              </div>
            )}

            {/* Sidebar content */}
            {!leftSidebarCollapsed && (<>
            {/* Toolbox */}
            <div className="border-b p-4 flex-[0_0_50%] overflow-y-auto min-h-0" style={{ borderBottomColor: '#E5E7EB' }}>
              <h3 className="text-sm font-semibold text-gray-900 mb-3" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
                Add Elements
              </h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                    Graphics / Text
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleElementAdd('text')}
                      className="p-3 border rounded-md hover:bg-gray-50 transition-colors text-left"
                      style={{ borderColor: '#E5E7EB' }}
                    >
                      <div className="text-xs font-medium text-gray-900 mb-1">Text</div>
                      <div className="text-lg font-bold text-gray-600">T</div>
                    </button>
                    <button
                      onClick={() => handleElementAdd('line')}
                      className="p-3 border rounded-md hover:bg-gray-50 transition-colors text-left"
                      style={{ borderColor: '#E5E7EB' }}
                    >
                      <div className="text-xs font-medium text-gray-900 mb-1">Line</div>
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleElementAdd('rectangle')}
                      className="p-3 border rounded-md hover:bg-gray-50 transition-colors text-left"
                      style={{ borderColor: '#E5E7EB' }}
                    >
                      <div className="text-xs font-medium text-gray-900 mb-1">Rectangle</div>
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleElementAdd('image')}
                      className="p-3 border rounded-md hover:bg-gray-50 transition-colors text-left"
                      style={{ borderColor: '#E5E7EB' }}
                    >
                      <div className="text-xs font-medium text-gray-900 mb-1">Image</div>
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                    Data Blocks
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleElementAdd('equipment-table')}
                      className="p-3 border rounded-md hover:bg-gray-50 transition-colors text-left"
                      style={{ borderColor: '#E5E7EB' }}
                    >
                      <div className="text-xs font-medium text-gray-900 mb-1">Equipment Table</div>
                      <span className="text-lg">📋</span>
                    </button>
                    <button
                      onClick={() => handleElementAdd('documents-table')}
                      className="p-3 border rounded-md hover:bg-gray-50 transition-colors text-left"
                      style={{ borderColor: '#E5E7EB' }}
                    >
                      <div className="text-xs font-medium text-gray-900 mb-1">Documents Index Table</div>
                      <span className="text-lg">📑</span>
                    </button>
                    <button
                      onClick={() => handleElementAdd('chart')}
                      className="p-3 border rounded-md hover:bg-gray-50 transition-colors text-left"
                      style={{ borderColor: '#E5E7EB' }}
                    >
                      <div className="text-xs font-medium text-gray-900 mb-1">Chart</div>
                      <span className="text-lg">📈</span>
                    </button>
                    <button
                      onClick={() => handleElementAdd({
                        id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        type: 'text',
                        x: 100,
                        y: 100,
                        width: 120,
                        height: 20,
                        fontSize: 9,
                        align: 'center',
                        dataSource: { type: 'text', key: 'page.counter' },
                      } as any)}
                      className="p-3 border rounded-md hover:bg-gray-50 transition-colors text-left"
                      style={{ borderColor: '#E5E7EB' }}
                    >
                      <div className="text-xs font-medium text-gray-900 mb-1">Page Counter</div>
                      <span className="text-sm font-semibold text-gray-600">1/N</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

              {/* Tabs: Pages / Sections / Layers */}
              <div className="flex-[0_0_50%] overflow-y-auto p-4 min-h-0">
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setActiveLeftSidebarTab('pages')}
                    className={`flex-1 text-xs px-2 py-2 rounded-md border transition-colors ${
                      activeLeftSidebarTab === 'pages'
                        ? 'bg-blue-50 border-blue-200 text-blue-900'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Pages
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLeftSidebarTab('sections')}
                    className={`flex-1 text-xs px-2 py-2 rounded-md border transition-colors ${
                      activeLeftSidebarTab === 'sections'
                        ? 'bg-blue-50 border-blue-200 text-blue-900'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Sections
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLeftSidebarTab('layers')}
                    className={`flex-1 text-xs px-2 py-2 rounded-md border transition-colors ${
                      activeLeftSidebarTab === 'layers'
                        ? 'bg-blue-50 border-blue-200 text-blue-900'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Layers
                  </button>
                </div>

                {activeLeftSidebarTab === 'pages' && (
                  <div className="mb-4 pb-4 border-b" style={{ borderBottomColor: '#E5E7EB' }}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-900" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
                        Pages
                      </h3>
                      <button
                        type="button"
                        onClick={handleAddPage}
                        className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                      >
                        Add
                      </button>
                    </div>
                    <div className="space-y-1">
                      {pages.map((page, index) => (
                        <div
                          key={page.id}
                          className={`flex items-center gap-1 rounded-md px-2 py-1 ${
                            activePage?.id === page.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setActivePageId(page.id)}
                            className="flex-1 text-left text-xs font-medium"
                          >
                            Page {page.pageNumber}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMovePage(page.id, 'up');
                            }}
                            disabled={index === 0}
                            className={`w-5 h-5 flex items-center justify-center rounded border text-xs ${
                              index === 0 ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                            title="Move page up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMovePage(page.id, 'down');
                            }}
                            disabled={index === pages.length - 1}
                            className={`w-5 h-5 flex items-center justify-center rounded border text-xs ${
                              index === pages.length - 1 ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                            title="Move page down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePage(page.id);
                            }}
                            disabled={pages.length <= 1}
                            className={`w-5 h-5 flex items-center justify-center rounded border text-xs ${
                              pages.length <= 1 ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                            }`}
                            title="Delete page"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={handleAddPage}
                        className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                      >
                        Add Page
                      </button>
                      <button
                        type="button"
                        onClick={handleDuplicatePage}
                        disabled={!activePage}
                        className={`text-xs px-2 py-1 rounded border ${
                          activePage ? 'border-gray-300 hover:bg-gray-50' : 'border-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        Duplicate
                      </button>
                    </div>
                  </div>
                )}

                {activeLeftSidebarTab === 'sections' && (
                  <SectionPanel
                    selectedSectionId={selectedSectionId}
                    onSectionSelect={setSelectedSectionId}
                    onComponentAdd={handleElementAdd}
                    currentElements={activeElements}
                    className="w-full flex flex-col"
                  />
                )}

                {activeLeftSidebarTab === 'layers' && (
                  <div className="border-t pt-3" style={{ borderTopColor: '#E5E7EB' }}>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
                      Layers ({activeElements.length})
                    </h3>
                    {activeElements.length === 0 ? (
                      <p className="text-xs text-gray-500">No elements yet</p>
                    ) : (
                      <div className="space-y-1">
                        {activeElements.map((element, index) => (
                          <div
                            key={element.id}
                            className={`flex items-center gap-2 rounded-md overflow-hidden ${
                              selectedElementIds.includes(element.id)
                                ? 'bg-blue-50'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            {/* Layer Order Controls */}
                            <div className="flex flex-col gap-0.5 p-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleElementReorder(element.id, 'up');
                                }}
                                disabled={index === 0}
                                className={`w-5 h-5 flex items-center justify-center rounded border text-xs ${
                                  index === 0
                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 cursor-pointer'
                                }`}
                                title="Move layer up (bring forward)"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleElementReorder(element.id, 'down');
                                }}
                                disabled={index === activeElements.length - 1}
                                className={`w-5 h-5 flex items-center justify-center rounded border text-xs ${
                                  index === activeElements.length - 1
                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 cursor-pointer'
                                }`}
                                title="Move layer down (send backward)"
                              >
                                ↓
                              </button>
                            </div>

                            {/* Layer Index Badge */}
                            <span className="text-xs font-medium text-gray-500 min-w-[20px] text-center">
                              {index + 1}
                            </span>

                            {/* Element Button */}
                            <button
                              onClick={() => handleElementSelect(element.id)}
                              className={`flex-1 text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center gap-2 ${
                                selectedElementIds.includes(element.id)
                                  ? 'bg-blue-50 text-blue-900'
                                  : 'text-gray-700'
                              }`}
                            >
                              <span className="text-base">
                                {element.type === 'text' ? '📝' :
                                 element.type === 'line' ? '➖' :
                                 element.type === 'rectangle' ? '▭' :
                                 element.type === 'image' ? '🖼️' :
                                 element.type === 'equipment-table' ? '📋' :
                                 element.type === 'documents-table' ? '📑' :
                                 element.type === 'treb-table' ? '📊' :
                                 element.type === 'chart' ? '📈' : '•'}
                              </span>
                              <span className="font-medium truncate">{getElementLabel(element).replace(/^[^\s]+\s/, '')}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>)}
          </div>

          {/* Center - Canvas Area */}
          <div
            ref={canvasAreaRef}
            className="flex-1 relative overflow-hidden"
            style={{ backgroundColor: '#F3F4F6' }}
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
              onElementResize={handleElementResize}
              onElementDelete={handleElementDelete}
              onZoomChange={(newZoom) => setZoom(Math.min(3, Math.max(0.25, newZoom)))}
            />

            {/* Floating draggable page counter */}
            {(() => {
              const currentIdx = pages.findIndex((p) => p.id === activePageId);
              const total = Math.max(1, pages.length);
              const current = Math.max(1, currentIdx + 1);
              return (
                <div
                  ref={counterRef}
                  onMouseDown={handleCounterDragStart}
                  style={{
                    position: 'absolute',
                    zIndex: 20,
                    cursor: isCounterDragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    ...(counterPos
                      ? { left: counterPos.x, top: counterPos.y }
                      : { bottom: 16, left: '50%', transform: 'translateX(-50%)' }),
                  }}
                  className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pl-2 pr-3 py-1.5 shadow-md"
                  title="Drag to reposition"
                >
                  {/* Drag handle dots */}
                  <svg width="8" height="12" viewBox="0 0 8 12" className="text-gray-400 flex-shrink-0" fill="currentColor">
                    <circle cx="2" cy="2"  r="1.3"/><circle cx="6" cy="2"  r="1.3"/>
                    <circle cx="2" cy="6"  r="1.3"/><circle cx="6" cy="6"  r="1.3"/>
                    <circle cx="2" cy="10" r="1.3"/><circle cx="6" cy="10" r="1.3"/>
                  </svg>

                  {/* Prev */}
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { if (currentIdx > 0) setActivePageId(pages[currentIdx - 1].id); }}
                    disabled={currentIdx <= 0}
                    className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
                    title="Previous page"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <span className="text-xs font-medium text-gray-700 tabular-nums whitespace-nowrap">
                    Page {current} of {total}
                  </span>

                  {/* Next */}
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { if (currentIdx < pages.length - 1) setActivePageId(pages[currentIdx + 1].id); }}
                    disabled={currentIdx >= pages.length - 1}
                    className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
                    title="Next page"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Right Sidebar - Properties */}
          <div
            className={`${rightSidebarCollapsed ? 'w-10' : 'w-[300px]'} border-l flex flex-col flex-shrink-0 transition-all duration-200 overflow-hidden`}
            style={{
              borderLeftColor: '#E5E7EB',
              backgroundColor: '#FFFFFF'
            }}
          >
            {/* Sidebar header / collapse toggle */}
            <div
              className="flex items-center justify-between px-2 border-b flex-shrink-0"
              style={{ borderBottomColor: '#E5E7EB', backgroundColor: '#F9FAFB', minHeight: '32px' }}
            >
              <button
                type="button"
                onClick={() => setRightSidebarCollapsed((c) => !c)}
                className={`w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 flex-shrink-0 ${rightSidebarCollapsed ? 'mx-auto' : 'mr-auto'}`}
                title={rightSidebarCollapsed ? 'Expand panel' : 'Collapse panel'}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {rightSidebarCollapsed
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  }
                </svg>
              </button>
              {!rightSidebarCollapsed && (
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Properties</span>
              )}
            </div>

            {/* Collapsed indicator */}
            {rightSidebarCollapsed && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <span className="text-xs text-gray-400 select-none" style={{ writingMode: 'vertical-rl' }}>Properties</span>
              </div>
            )}

            {/* Sidebar content */}
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

    {/* Save Success Modal - Must be outside main modal div to appear on top */}
    {showSaveSuccess && (
      <div 
        className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50"
        style={{ position: 'fixed', zIndex: 9999, fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}
        onClick={(e) => {
          // Only close if clicking the backdrop, not the modal content
          if (e.target === e.currentTarget) {
            setShowSaveSuccess(false);
          }
        }}
      >
        <div 
          className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with close button */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-900">Success</h3>
            <button
              onClick={() => setShowSaveSuccess(false)}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-6 h-6 flex items-center justify-center"
              type="button"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-8 text-center">
            {/* Green Checkmark Circle */}
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-10 h-10 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            {/* Success Message */}
            <p className="text-lg font-medium text-gray-900 mb-2">
              Template Saved Successfully
            </p>
            <p className="text-sm text-gray-600">
              Your PDF template has been saved. You can continue editing or close this window.
            </p>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
            <Button variant="success" onClick={() => setShowSaveSuccess(false)}>
              OK
            </Button>
          </div>
        </div>
      </div>
    )}
    <PdfComponentScannerModal
      isOpen={showComponentScanner}
      onClose={() => setShowComponentScanner(false)}
    />
    </>
  );
};

