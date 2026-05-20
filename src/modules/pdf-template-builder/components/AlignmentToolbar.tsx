/**
 * Alignment Toolbar Component
 * Provides alignment and distribution tools for selected PDF template elements
 */

import React from 'react';
import type { PdfElement } from '../types';

export interface AlignmentToolbarProps {
  elements: PdfElement[];
  pageSize: 'A4' | 'Letter' | 'A3' | 'A5';
  /** Page orientation for correct page bounds. Default: portrait */
  orientation?: 'portrait' | 'landscape';
  selectedElementIds: string[];
  onElementsMove?: (updates: Array<{ elementId: string; x: number; y: number }>) => void;
  disabled?: boolean;
}

/**
 * Get page dimensions in pixels (at 72 DPI). For landscape, width and height are swapped.
 */
function getPageDimensions(pageSize: 'A4' | 'Letter' | 'A3' | 'A5', orientation: 'portrait' | 'landscape' = 'portrait'): { width: number; height: number } {
  const dimensions = {
    A4: { width: 595, height: 842 },
    Letter: { width: 612, height: 792 },
    A3: { width: 842, height: 1191 },
    A5: { width: 420, height: 595 },
  };
  const d = dimensions[pageSize];
  return orientation === 'landscape' ? { width: d.height, height: d.width } : d;
}

/**
 * Get element bounds (x, y, width, height, centerX, centerY)
 */
function getElementBounds(element: PdfElement) {
  const width = element.width || (element.type === 'text' ? 150 : 200);
  const height = element.height || (element.type === 'text' ? 30 : 100);
  
  // For line elements, calculate bounds from x1, y1, x2, y2
  if (element.type === 'line') {
    const lineEl = element as any;
    const x1 = lineEl.x1 || element.x;
    const y1 = lineEl.y1 || element.y;
    const x2 = lineEl.x2 || element.x + 200;
    const y2 = lineEl.y2 || element.y;
    
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const maxX = Math.max(x1, x2);
    const maxY = Math.max(y1, y2);
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }
  
  return {
    x: element.x,
    y: element.y,
    width,
    height,
    centerX: element.x + width / 2,
    centerY: element.y + height / 2,
  };
}

export const AlignmentToolbar: React.FC<AlignmentToolbarProps> = ({
  elements,
  pageSize,
  orientation = 'portrait',
  selectedElementIds,
  onElementsMove,
  disabled = false,
}) => {
  const pageDimensions = getPageDimensions(pageSize, orientation);
  const canAlign = selectedElementIds.length >= 2;
  const canDistribute = selectedElementIds.length >= 3;

  // Get selected elements with their bounds
  const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
  const elementBounds = selectedElements.map(el => ({
    element: el,
    bounds: getElementBounds(el),
  }));

  // Alignment functions
  const alignLeft = () => {
    if (!canAlign || !onElementsMove) return;
    
    // Find the leftmost element
    const leftmostX = Math.min(...elementBounds.map(eb => eb.bounds.x));
    
    const updates = elementBounds.map(({ element, bounds }) => {
      // Calculate delta from current position to leftmost position
      const deltaX = leftmostX - bounds.x;
      
      // For line elements, we need to preserve relative position
      // bounds.x is already the leftmost point of the line
      return {
        elementId: element.id,
        x: leftmostX,
        y: bounds.y,
      };
    });
    
    onElementsMove(updates);
  };

  const alignCenter = () => {
    if (!canAlign || !onElementsMove) return;
    
    // Calculate average center X of all selected elements
    const avgCenterX = elementBounds.reduce((sum, eb) => sum + eb.bounds.centerX, 0) / elementBounds.length;
    
    const updates = elementBounds.map(({ element, bounds }) => {
      // Calculate new x position to center the element at the average center X
      const newX = avgCenterX - bounds.width / 2;
      
      return {
        elementId: element.id,
        x: newX,
        y: bounds.y,
      };
    });
    
    onElementsMove(updates);
  };

  const alignRight = () => {
    if (!canAlign || !onElementsMove) return;
    
    // Find the rightmost element (right edge)
    const rightmostX = Math.max(...elementBounds.map(eb => eb.bounds.x + eb.bounds.width));
    
    const updates = elementBounds.map(({ element, bounds }) => {
      // Calculate new x position to align right edge
      const newX = rightmostX - bounds.width;
      
      return {
        elementId: element.id,
        x: newX,
        y: bounds.y,
      };
    });
    
    onElementsMove(updates);
  };

  const alignTop = () => {
    if (!canAlign || !onElementsMove) return;
    
    // Find the topmost element
    const topmostY = Math.min(...elementBounds.map(eb => eb.bounds.y));
    
    const updates = elementBounds.map(({ element, bounds }) => {
      // Move to topmost Y position
      return {
        elementId: element.id,
        x: bounds.x,
        y: topmostY,
      };
    });
    
    onElementsMove(updates);
  };

  const alignMiddle = () => {
    if (!canAlign || !onElementsMove) return;
    
    // Calculate average center Y of all selected elements
    const avgCenterY = elementBounds.reduce((sum, eb) => sum + eb.bounds.centerY, 0) / elementBounds.length;
    
    const updates = elementBounds.map(({ element, bounds }) => {
      // Calculate new y position to center the element at the average center Y
      const newY = avgCenterY - bounds.height / 2;
      
      return {
        elementId: element.id,
        x: bounds.x,
        y: newY,
      };
    });
    
    onElementsMove(updates);
  };

  const alignBottom = () => {
    if (!canAlign || !onElementsMove) return;
    
    // Find the bottommost element (bottom edge)
    const bottommostY = Math.max(...elementBounds.map(eb => eb.bounds.y + eb.bounds.height));
    
    const updates = elementBounds.map(({ element, bounds }) => {
      // Calculate new y position to align bottom edge
      const newY = bottommostY - bounds.height;
      
      return {
        elementId: element.id,
        x: bounds.x,
        y: newY,
      };
    });
    
    onElementsMove(updates);
  };

  // Distribution functions
  const distributeHorizontally = () => {
    if (!canDistribute || !onElementsMove) return;
    
    // Sort elements by X position
    const sorted = [...elementBounds].sort((a, b) => a.bounds.x - b.bounds.x);
    
    // Get leftmost and rightmost positions
    const leftmostX = sorted[0].bounds.x;
    const rightmostX = sorted[sorted.length - 1].bounds.x + sorted[sorted.length - 1].bounds.width;
    
    // Calculate total width of all elements (excluding gaps)
    const totalWidth = sorted.reduce((sum, eb) => sum + eb.bounds.width, 0);
    
    // Calculate gap between elements
    const gap = (rightmostX - leftmostX - totalWidth) / (sorted.length - 1);
    
    // Distribute elements evenly
    const updates: Array<{ elementId: string; x: number; y: number }> = [];
    let currentX = leftmostX;
    
    for (const { element, bounds } of sorted) {
      updates.push({
        elementId: element.id,
        x: currentX,
        y: bounds.y,
      });
      currentX += bounds.width + gap;
    }
    
    onElementsMove(updates);
  };

  const distributeVertically = () => {
    if (!canDistribute || !onElementsMove) return;
    
    // Sort elements by Y position
    const sorted = [...elementBounds].sort((a, b) => a.bounds.y - b.bounds.y);
    
    // Get topmost and bottommost positions
    const topmostY = sorted[0].bounds.y;
    const bottommostY = sorted[sorted.length - 1].bounds.y + sorted[sorted.length - 1].bounds.height;
    
    // Calculate total height of all elements (excluding gaps)
    const totalHeight = sorted.reduce((sum, eb) => sum + eb.bounds.height, 0);
    
    // Calculate gap between elements
    const gap = (bottommostY - topmostY - totalHeight) / (sorted.length - 1);
    
    // Distribute elements evenly
    const updates: Array<{ elementId: string; x: number; y: number }> = [];
    let currentY = topmostY;
    
    for (const { element, bounds } of sorted) {
      updates.push({
        elementId: element.id,
        x: bounds.x,
        y: currentY,
      });
      currentY += bounds.height + gap;
    }
    
    onElementsMove(updates);
  };

  const isDisabled = disabled || selectedElementIds.length < 2;

  return (
    <div className="flex items-center gap-1 px-2 border-r" style={{ borderRightColor: '#E5E7EB' }}>
      {/* Horizontal Alignment */}
      <div className="flex items-center gap-0.5" title="Horizontal Alignment">
        <button
          onClick={alignLeft}
          disabled={isDisabled || !canAlign}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Align Left (2+ elements)"
        >
          <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M4 8h8M4 16h8" />
          </svg>
        </button>
        <button
          onClick={alignCenter}
          disabled={isDisabled || !canAlign}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Align Center (2+ elements)"
        >
          <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M7 8h10M7 16h10" />
          </svg>
        </button>
        <button
          onClick={alignRight}
          disabled={isDisabled || !canAlign}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Align Right (2+ elements)"
        >
          <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M12 8h8M12 16h8" />
          </svg>
        </button>
      </div>

      {/* Vertical Alignment */}
      <div className="flex items-center gap-0.5 ml-1" title="Vertical Alignment">
        <button
          onClick={alignTop}
          disabled={isDisabled || !canAlign}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Align Top (2+ elements)"
        >
          <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M12 4h8M12 4H4" />
          </svg>
        </button>
        <button
          onClick={alignMiddle}
          disabled={isDisabled || !canAlign}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Align Middle (2+ elements)"
        >
          <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M8 11h8M8 18h8" />
          </svg>
        </button>
        <button
          onClick={alignBottom}
          disabled={isDisabled || !canAlign}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Align Bottom (2+ elements)"
        >
          <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M12 20h8M12 20H4" />
          </svg>
        </button>
      </div>

      {/* Distribution */}
      <div className="flex items-center gap-0.5 ml-1 border-l pl-1" style={{ borderLeftColor: '#E5E7EB' }} title="Distribution">
        <button
          onClick={distributeHorizontally}
          disabled={isDisabled || !canDistribute}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Distribute Horizontally"
        >
          <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" />
            <circle cx="4" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="20" cy="12" r="2" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={distributeVertically}
          disabled={isDisabled || !canDistribute}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Distribute Vertically"
        >
          <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16" />
            <circle cx="12" cy="4" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="20" r="2" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
};
