/**
 * PDF Template Builder Canvas Component
 * Visual canvas for designing PDF templates
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { PdfElement } from '../types';
import { getElementLabel } from '../models/PdfElement';

export interface PdfTemplateBuilderCanvasProps {
  elements: PdfElement[];
  pageSize: 'A4' | 'Letter' | 'A3' | 'A5';
  /** Page orientation; affects displayed page dimensions. Default: portrait */
  orientation?: 'portrait' | 'landscape';
  backgroundPdf?: string;
  selectedElementIds: string[];
  zoom?: number;
  onElementSelect?: (elementId: string | null, multiSelect?: boolean) => void;
  onElementMove?: (elementId: string, x: number, y: number) => void;
  onElementResize?: (elementId: string, width: number, height: number) => void;
  onElementAdd?: (element: PdfElement) => void;
  onElementDelete?: (elementId: string) => void;
  onBackgroundPdfChange?: (pdfUrl: string | null) => void;
}

/**
 * Get page dimensions in pixels (at 72 DPI). For landscape, width and height are swapped.
 */
function getPageDimensions(pageSize: 'A4' | 'Letter' | 'A3' | 'A5', orientation: 'portrait' | 'landscape' = 'portrait'): { width: number; height: number } {
  // A4: 210mm x 297mm = 8.27" x 11.69" = 595px x 842px at 72 DPI
  // Letter: 8.5" x 11" = 612px x 792px at 72 DPI
  // A3: 297mm x 420mm = 11.69" x 16.54" = 842px x 1191px at 72 DPI
  // A5: 148mm x 210mm = 5.83" x 8.27" = 420px x 595px at 72 DPI
  
  const dimensions = {
    A4: { width: 595, height: 842 },
    Letter: { width: 612, height: 792 },
    A3: { width: 842, height: 1191 },
    A5: { width: 420, height: 595 },
  };
  
  const d = dimensions[pageSize];
  return orientation === 'landscape' ? { width: d.height, height: d.width } : d;
}

export const PdfTemplateBuilderCanvas: React.FC<PdfTemplateBuilderCanvasProps> = ({
  elements,
  pageSize,
  orientation = 'portrait',
  backgroundPdf,
  selectedElementIds,
  zoom = 1,
  onElementSelect,
  onElementMove,
  onElementResize,
  onElementAdd,
  onElementDelete,
  onBackgroundPdfChange,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  // Store callbacks in refs to avoid dependency array issues
  const onElementMoveRef = useRef(onElementMove);
  const onElementResizeRef = useRef(onElementResize);
  
  // Update refs when callbacks change
  useEffect(() => {
    onElementMoveRef.current = onElementMove;
    onElementResizeRef.current = onElementResize;
  }, [onElementMove, onElementResize]);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [draggedElement, setDraggedElement] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState<{ 
    x: number; 
    y: number; 
    width: number; 
    height: number; 
    elementX: number;
    elementY: number;
    handle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';
  } | null>(null);
  const [resizedElement, setResizedElement] = useState<string | null>(null);

  const pageDimensions = getPageDimensions(pageSize, orientation);

  // Handle element click
  const handleElementClick = useCallback((e: React.MouseEvent, elementId: string) => {
    e.stopPropagation();
    // Don't preventDefault - we want normal mouse behavior for dragging
    const multiSelect = e.ctrlKey || e.metaKey;
    onElementSelect?.(elementId, multiSelect);
  }, [onElementSelect]);

  // Handle canvas click (deselect)
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Only deselect if clicking directly on canvas background, not on elements
    const target = e.target as HTMLElement;
    // Check if click is on canvas background or page background, not on an element
    if (
      target === canvasRef.current || 
      target.classList.contains('canvas-background') ||
      (target.classList.contains('canvas-content') && !target.closest('.absolute'))
    ) {
      onElementSelect?.(null);
    }
  }, [onElementSelect]);

  // Handle element drag start
  const handleElementDragStart = useCallback((e: React.MouseEvent, elementId: string) => {
    e.stopPropagation();
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

    // Get canvas content container position for coordinate conversion
    const canvasContentRect = canvasRef.current?.querySelector('.canvas-content')?.getBoundingClientRect();
    
    // Calculate element position (for line elements, use bounds minX, minY)
    let elementX = element.x;
    let elementY = element.y;
    
    if (element.type === 'line') {
      const lineEl = element as any;
      const x1 = lineEl.x1 !== undefined ? lineEl.x1 : element.x;
      const y1 = lineEl.y1 !== undefined ? lineEl.y1 : element.y;
      const x2 = lineEl.x2 !== undefined ? lineEl.x2 : element.x + 200;
      const y2 = lineEl.y2 !== undefined ? lineEl.y2 : element.y;
      elementX = Math.min(x1, x2);
      elementY = Math.min(y1, y2);
    }

    // Calculate mouse position relative to canvas content in canvas coordinates
    // Fallback to simple calculation if canvas rect not available
    let mouseXCanvas: number;
    let mouseYCanvas: number;
    
    if (canvasContentRect) {
      mouseXCanvas = (e.clientX - canvasContentRect.left) / zoom;
      mouseYCanvas = (e.clientY - canvasContentRect.top) / zoom;
    } else {
      // Fallback: assume canvas is at origin (less accurate but works)
      mouseXCanvas = e.clientX / zoom;
      mouseYCanvas = e.clientY / zoom;
    }

    // Store offset from mouse to element position (in canvas coordinates)
    setIsDragging(true);
    setDragStart({ x: mouseXCanvas - elementX, y: mouseYCanvas - elementY });
    setDraggedElement(elementId);
  }, [elements, zoom]);

  // Handle mouse move for dragging
  useEffect(() => {
    if (!isDragging || !dragStart || !draggedElement) return;

    const handleMouseMove = (e: MouseEvent) => {
      const element = elements.find(el => el.id === draggedElement);
      if (!element || !dragStart) return;

      // Get canvas content container position for coordinate conversion
      const canvasContentRect = canvasRef.current?.querySelector('.canvas-content')?.getBoundingClientRect();
      
      // Calculate mouse position relative to canvas content in canvas coordinates
      // Fallback to simple calculation if canvas rect not available
      let mouseXCanvas: number;
      let mouseYCanvas: number;
      
      if (canvasContentRect) {
        mouseXCanvas = (e.clientX - canvasContentRect.left) / zoom;
        mouseYCanvas = (e.clientY - canvasContentRect.top) / zoom;
      } else {
        // Fallback: assume canvas is at origin (less accurate but works)
        mouseXCanvas = e.clientX / zoom;
        mouseYCanvas = e.clientY / zoom;
      }

      // Calculate new position using stored offset (both in canvas coordinates)
      const newX = mouseXCanvas - dragStart.x;
      const newY = mouseYCanvas - dragStart.y;

      // Constrain to page bounds
      // For line elements, use width/height from bounds
      let elementWidth = element.width || 0;
      let elementHeight = element.height || 0;
      
      if (element.type === 'line') {
        const lineEl = element as any;
        const x1 = lineEl.x1 !== undefined ? lineEl.x1 : element.x;
        const y1 = lineEl.y1 !== undefined ? lineEl.y1 : element.y;
        const x2 = lineEl.x2 !== undefined ? lineEl.x2 : element.x + 200;
        const y2 = lineEl.y2 !== undefined ? lineEl.y2 : element.y;
        elementWidth = Math.abs(x2 - x1);
        elementHeight = Math.abs(y2 - y1);
      } else {
        elementWidth = element.width || (element.type === 'text' ? 150 : 200);
        elementHeight = element.height || (element.type === 'text' ? 30 : 100);
      }

      const constrainedX = Math.max(0, Math.min(newX, pageDimensions.width - elementWidth));
      const constrainedY = Math.max(0, Math.min(newY, pageDimensions.height - elementHeight));

      onElementMoveRef.current?.(draggedElement, constrainedX, constrainedY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragStart(null);
      setDraggedElement(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, draggedElement, elements, zoom, pageDimensions]);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent, elementId: string, handle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e') => {
    e.stopPropagation();
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

    // For elements without width/height, use default display dimensions
    const currentWidth = element.width || (element.type === 'text' ? 150 : 200);
    const currentHeight = element.height || (element.type === 'text' ? 30 : 100);

    setIsResizing(true);
    setResizeStart({ 
      x: e.clientX, 
      y: e.clientY, 
      width: currentWidth, 
      height: currentHeight,
      elementX: element.x,
      elementY: element.y,
      handle: handle
    });
    setResizedElement(elementId);
  }, [elements]);

  useEffect(() => {
    if (!isResizing || !resizeStart || !resizedElement) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - resizeStart.x) / zoom;
      const deltaY = (e.clientY - resizeStart.y) / zoom;

      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;
      let newX = resizeStart.elementX;
      let newY = resizeStart.elementY;

      const { handle } = resizeStart;

      // Calculate new dimensions and position based on which handle is being dragged
      if (handle === 'nw' || handle === 'w' || handle === 'sw') {
        // Resizing from left side - adjust width and x position
        newWidth = Math.max(20, resizeStart.width - deltaX);
        newX = resizeStart.elementX + (resizeStart.width - newWidth);
      } else if (handle === 'ne' || handle === 'e' || handle === 'se') {
        // Resizing from right side - adjust width only
        newWidth = Math.max(20, resizeStart.width + deltaX);
      }

      if (handle === 'nw' || handle === 'n' || handle === 'ne') {
        // Resizing from top side - adjust height and y position
        newHeight = Math.max(20, resizeStart.height - deltaY);
        newY = resizeStart.elementY + (resizeStart.height - newHeight);
      } else if (handle === 'sw' || handle === 's' || handle === 'se') {
        // Resizing from bottom side - adjust height only
        newHeight = Math.max(20, resizeStart.height + deltaY);
      }

      // Update element position and size
      // When resizing from left/top, we need to update both position and size
      if (newX !== resizeStart.elementX || newY !== resizeStart.elementY) {
        // Position changed - resize first, then move (React will batch these)
        onElementResizeRef.current?.(resizedElement, newWidth, newHeight);
        onElementMoveRef.current?.(resizedElement, newX, newY);
      } else {
        // Only resize (position unchanged - resizing from right/bottom)
        onElementResizeRef.current?.(resizedElement, newWidth, newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeStart(null);
      setResizedElement(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart, resizedElement, zoom]);

  // Handle keyboard delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Check if user is typing in an input field, textarea, or contenteditable element
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.getAttribute('contenteditable') === 'true' ||
          activeElement.closest('input, textarea, [contenteditable="true"]') !== null
        );

        // Only delete element if NOT typing in an input field
        if (!isInputFocused && selectedElementIds.length > 0 && !isDragging && !isResizing) {
          e.preventDefault();
          selectedElementIds.forEach(id => onElementDelete?.(id));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementIds, isDragging, isResizing, onElementDelete]);

  return (
    <div
      ref={canvasRef}
      className="pdf-template-canvas relative overflow-auto"
      style={{ width: '100%', height: '100%', backgroundColor: '#F3F4F6' }}
      onClick={handleCanvasClick}
    >
      {/* Canvas content container - Centered */}
      <div className="flex items-center justify-center min-h-full p-8">
        <div
          className="canvas-content relative bg-white"
          style={{
            width: `${pageDimensions.width}px`,
            height: `${pageDimensions.height}px`,
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          }}
        >
          {/* Background PDF (if any) */}
          {backgroundPdf && (
            <iframe
              src={backgroundPdf}
              className="canvas-background absolute inset-0 w-full h-full pointer-events-none opacity-30"
              style={{ border: 'none' }}
            />
          )}

          {/* Page background */}
          <div
            className="canvas-background absolute inset-0 border border-gray-200"
            style={{
              width: `${pageDimensions.width}px`,
              height: `${pageDimensions.height}px`,
              backgroundColor: '#ffffff',
              borderRadius: '2px',
            }}
          />

        {/* PDF elements */}
        {elements.filter(el => el != null && el.id).map((element) => {
          const isSelected = selectedElementIds.includes(element.id);
          const label = getElementLabel(element);

          // Render based on element type
          if (element.type === 'line') {
            const lineEl = element as any;
            return (
              <svg
                key={element.id}
                className={`absolute cursor-move ${isSelected ? 'z-10' : 'z-0'}`}
                style={{
                  left: 0,
                  top: 0,
                  width: `${pageDimensions.width}px`,
                  height: `${pageDimensions.height}px`,
                  pointerEvents: 'none',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleElementClick(e, element.id);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleElementDragStart(e, element.id);
                }}
              >
                <line
                  x1={lineEl.x1 || element.x}
                  y1={lineEl.y1 || element.y}
                  x2={lineEl.x2 || element.x + 200}
                  y2={lineEl.y2 || element.y}
                  stroke={lineEl.color || '#000000'}
                  strokeWidth={lineEl.width || 1}
                  style={{ pointerEvents: 'all', cursor: 'move' }}
                />
                {isSelected && (
                  <>
                    <circle
                      cx={lineEl.x1 || element.x}
                      cy={lineEl.y1 || element.y}
                      r={4}
                      fill="#3b82f6"
                      style={{ pointerEvents: 'all', cursor: 'move' }}
                    />
                    <circle
                      cx={lineEl.x2 || element.x + 200}
                      cy={lineEl.y2 || element.y}
                      r={4}
                      fill="#3b82f6"
                      style={{ pointerEvents: 'all', cursor: 'move' }}
                    />
                  </>
                )}
              </svg>
            );
          }

          // TREB table: placeholder with dashed border and hint text
          if (element.type === 'treb-table') {
            const trebWidth = element.width ?? 300;
            const trebHeight = 60;
            return (
              <div
                key={element.id}
                className={`absolute cursor-move border-2 border-dashed transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-gray-400 bg-gray-100 hover:border-gray-500'
                }`}
                style={{
                  left: `${element.x}px`,
                  top: `${element.y}px`,
                  width: `${trebWidth}px`,
                  height: `${trebHeight}px`,
                  zIndex: isSelected ? 10 : 0,
                  pointerEvents: 'auto',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleElementClick(e, element.id);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleElementDragStart(e, element.id);
                }}
              >
                <div className="w-full h-full p-2 flex items-center justify-center text-center text-xs text-gray-600 overflow-hidden">
                  Spreadsheet Table Placeholder: [Select a Template & Tab in Properties]
                </div>
                {isSelected && (
                  <>
                    <div
                      className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 border border-blue-700 cursor-nw-resize rounded-sm"
                      onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, element.id, 'nw'); }}
                    />
                    <div
                      className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 border border-blue-700 cursor-ne-resize rounded-sm"
                      onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, element.id, 'ne'); }}
                    />
                    <div
                      className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 border border-blue-700 cursor-sw-resize rounded-sm"
                      onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, element.id, 'sw'); }}
                    />
                    <div
                      className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border border-blue-700 cursor-se-resize rounded-sm"
                      onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, element.id, 'se'); }}
                    />
                    <div
                      className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border border-blue-700 cursor-n-resize rounded-sm"
                      onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, element.id, 'n'); }}
                    />
                    <div
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border border-blue-700 cursor-s-resize rounded-sm"
                      onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, element.id, 's'); }}
                    />
                    <div
                      className="absolute -left-1 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 border border-blue-700 cursor-w-resize rounded-sm"
                      onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, element.id, 'w'); }}
                    />
                    <div
                      className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 border border-blue-700 cursor-e-resize rounded-sm"
                      onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, element.id, 'e'); }}
                    />
                  </>
                )}
              </div>
            );
          }

          // For other element types (text, rectangle, image, equipment-table, chart)
          const displayWidth =
            element.width ??
            (element.type === 'text' ? 150 : element.type === 'equipment-table' || element.type === 'documents-table' ? 500 : 200);
          const displayHeight =
            element.height ??
            (element.type === 'text' ? 30 : element.type === 'equipment-table' || element.type === 'documents-table' ? 200 : 100);
          
          return (
            <div
              key={element.id}
              className={`absolute cursor-move border-2 transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 bg-white hover:border-gray-400'
              }`}
              style={{
                left: `${element.x}px`,
                top: `${element.y}px`,
                width: `${displayWidth}px`,
                height: `${displayHeight}px`,
                zIndex: isSelected ? 10 : 0,
                pointerEvents: 'auto', // Ensure elements can receive clicks
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleElementClick(e, element.id);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                handleElementDragStart(e, element.id);
              }}
            >
              {/* Element content */}
              <div className="w-full h-full p-2 text-xs overflow-hidden">
                {label}
              </div>

              {/* Resize handles - show for all selected elements */}
              {isSelected && (
                <>
                  {/* Corner handles */}
                  <div
                    className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 border border-blue-700 cursor-nw-resize rounded-sm"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleResizeStart(e, element.id, 'nw');
                    }}
                  />
                  <div
                    className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 border border-blue-700 cursor-ne-resize rounded-sm"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleResizeStart(e, element.id, 'ne');
                    }}
                  />
                  <div
                    className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 border border-blue-700 cursor-sw-resize rounded-sm"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleResizeStart(e, element.id, 'sw');
                    }}
                  />
                  <div
                    className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border border-blue-700 cursor-se-resize rounded-sm"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleResizeStart(e, element.id, 'se');
                    }}
                  />
                  {/* Edge handles */}
                  <div
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border border-blue-700 cursor-n-resize rounded-sm"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleResizeStart(e, element.id, 'n');
                    }}
                  />
                  <div
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border border-blue-700 cursor-s-resize rounded-sm"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleResizeStart(e, element.id, 's');
                    }}
                  />
                  <div
                    className="absolute -left-1 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 border border-blue-700 cursor-w-resize rounded-sm"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleResizeStart(e, element.id, 'w');
                    }}
                  />
                  <div
                    className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 border border-blue-700 cursor-e-resize rounded-sm"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleResizeStart(e, element.id, 'e');
                    }}
                  />
                </>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
};

