/**
 * Report Designer Canvas Component
 * Visual canvas for designing reports with drag-and-drop
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { ReportItem, ReportLayout } from '../types';
import { getPageDimensions, constrainItemPosition } from '../models/ReportLayout';
import { getItemLabel } from '../models/ReportItem';

export interface ReportDesignerCanvasProps {
  layout: ReportLayout;
  selectedItemIds: string[];
  zoom?: number;
  onItemSelect?: (itemId: string | null, multiSelect?: boolean) => void;
  onItemMove?: (itemId: string, x: number, y: number) => void;
  onItemResize?: (itemId: string, width: number, height: number) => void;
  onItemAdd?: (item: ReportItem) => void;
  onItemDelete?: (itemId: string) => void;
  onBackgroundImageChange?: (imageUrl: string | null) => void;
}

export const ReportDesignerCanvas: React.FC<ReportDesignerCanvasProps> = ({
  layout,
  selectedItemIds,
  zoom = 1,
  onItemSelect,
  onItemMove,
  onItemResize,
  onItemAdd,
  onItemDelete,
  onBackgroundImageChange,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [resizedItem, setResizedItem] = useState<string | null>(null);

  const pageDimensions = getPageDimensions(layout.pageSize, layout.orientation);

  // Handle item click
  const handleItemClick = useCallback((e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    const multiSelect = e.ctrlKey || e.metaKey;
    onItemSelect?.(itemId, multiSelect);
  }, [onItemSelect]);

  // Handle canvas click (deselect)
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-background')) {
      onItemSelect?.(null);
    }
  }, [onItemSelect]);

  // Handle item drag start
  const handleItemDragStart = useCallback((e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    const item = layout.elements.find(el => el.id === itemId);
    if (!item) return;

    setIsDragging(true);
    setDragStart({ x: e.clientX - item.x, y: e.clientY - item.y });
    setDraggedItem(itemId);
  }, [layout.elements]);

  // Handle mouse move for dragging
  useEffect(() => {
    if (!isDragging || !dragStart || !draggedItem) return;

    const handleMouseMove = (e: MouseEvent) => {
      const item = layout.elements.find(el => el.id === draggedItem);
      if (!item) return;

      const newX = (e.clientX - dragStart.x) / zoom;
      const newY = (e.clientY - dragStart.y) / zoom;

      const constrained = constrainItemPosition(item, pageDimensions.width, pageDimensions.height);
      onItemMove?.(draggedItem, constrained.x, constrained.y);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragStart(null);
      setDraggedItem(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, draggedItem, layout.elements, zoom, pageDimensions, onItemMove]);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    const item = layout.elements.find(el => el.id === itemId);
    if (!item) return;

    setIsResizing(true);
    setResizeStart({ x: e.clientX, y: e.clientY, width: item.width, height: item.height });
    setResizedItem(itemId);
  }, [layout.elements]);

  useEffect(() => {
    if (!isResizing || !resizeStart || !resizedItem) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - resizeStart.x) / zoom;
      const deltaY = (e.clientY - resizeStart.y) / zoom;

      const newWidth = Math.max(50, resizeStart.width + deltaX);
      const newHeight = Math.max(20, resizeStart.height + deltaY);

      onItemResize?.(resizedItem, newWidth, newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeStart(null);
      setResizedItem(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart, resizedItem, zoom, onItemResize]);

  // Handle keyboard delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItemIds.length > 0 && !isDragging && !isResizing) {
          e.preventDefault();
          selectedItemIds.forEach(id => onItemDelete?.(id));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemIds, isDragging, isResizing, onItemDelete]);

  return (
    <div
      ref={canvasRef}
      className="report-designer-canvas relative bg-gray-100 overflow-auto"
      style={{ width: '100%', height: '100%' }}
      onClick={handleCanvasClick}
    >
      {/* Canvas content container */}
      <div
        className="canvas-content relative mx-auto my-8 shadow-lg bg-white"
        style={{
          width: `${pageDimensions.width * zoom}px`,
          height: `${pageDimensions.height * zoom}px`,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
      >
        {/* Background image */}
        {layout.backgroundImage && (
          <img
            src={layout.backgroundImage}
            alt="Background"
            className="canvas-background absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ opacity: 0.3 }}
          />
        )}

        {/* Page background */}
        <div
          className="canvas-background absolute inset-0"
          style={{
            width: `${pageDimensions.width}px`,
            height: `${pageDimensions.height}px`,
            backgroundColor: '#ffffff',
          }}
        />

        {/* Report items */}
        {layout.elements.map((item) => {
          const isSelected = selectedItemIds.includes(item.id);
          const label = getItemLabel(item);

          return (
            <div
              key={item.id}
              className={`absolute cursor-move border-2 transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 bg-white hover:border-gray-400'
              }`}
              style={{
                left: `${item.x}px`,
                top: `${item.y}px`,
                width: `${item.width}px`,
                height: `${item.height}px`,
                zIndex: item.zIndex || 0,
              }}
              onClick={(e) => handleItemClick(e, item.id)}
              onMouseDown={(e) => handleItemDragStart(e, item.id)}
            >
              {/* Item content */}
              <div className="w-full h-full p-2 text-xs overflow-hidden">
                {label}
              </div>

              {/* Resize handle */}
              {isSelected && (
                <div
                  className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-se-resize"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleResizeStart(e, item.id);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

