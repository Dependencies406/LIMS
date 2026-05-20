/**
 * PDF Template Editor Component
 * Visual editor for designing PDF report templates with multi-selection and alignment tools
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ReportTemplate, ReportElement, ReportSection } from '../../types/pdfTemplate';
import { AlignmentToolbar } from './AlignmentToolbar';
import {
  alignLeft,
  alignCenterHorizontal,
  alignRight,
  alignTop,
  alignMiddleVertical,
  alignBottom,
  distributeVertically,
  distributeHorizontally,
  getElementBounds,
} from '../../utils/pdfAlignmentHelpers';

interface PdfTemplateEditorProps {
  template: ReportTemplate;
  onTemplateChange: (template: ReportTemplate) => void;
  scale?: number; // Canvas scale factor (for zoom)
}

interface HistoryState {
  template: ReportTemplate;
  timestamp: number;
}

export const PdfTemplateEditor: React.FC<PdfTemplateEditorProps> = ({
  template,
  onTemplateChange,
  scale = 1,
}) => {
  // Multi-selection state
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryState[]>([{ template, timestamp: Date.now() }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Get all elements from all sections
  const getAllElements = useCallback((): ReportElement[] => {
    return template.sections.flatMap(section => section.elements);
  }, [template]);

  // Get selected elements
  const getSelectedElements = useCallback((): ReportElement[] => {
    const allElements = getAllElements();
    return allElements.filter(el => selectedElementIds.includes(el.id));
  }, [getAllElements, selectedElementIds]);

  // Update template with new elements
  const updateElements = useCallback(
    (updatedElements: ReportElement[]) => {
      const elementMap = new Map(updatedElements.map(el => [el.id, el]));
      
      const updatedSections: ReportSection[] = template.sections.map(section => ({
        ...section,
        elements: section.elements.map(el => elementMap.get(el.id) || el),
      }));

      const updatedTemplate: ReportTemplate = {
        ...template,
        sections: updatedSections,
      };

      // Add to history
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({ template: updatedTemplate, timestamp: Date.now() });
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);

      onTemplateChange(updatedTemplate);
    },
    [template, history, historyIndex, onTemplateChange]
  );

  // Handle element click
  const handleElementClick = useCallback(
    (elementId: string, event: React.MouseEvent) => {
      event.stopPropagation();

      if (event.shiftKey) {
        // Shift+Click: Toggle selection
        setSelectedElementIds(prev => {
          if (prev.includes(elementId)) {
            return prev.filter(id => id !== elementId);
          } else {
            return [...prev, elementId];
          }
        });
      } else {
        // Regular click: Single selection
        setSelectedElementIds([elementId]);
      }
    },
    []
  );

  // Handle canvas background click: Clear selection
  const handleCanvasClick = useCallback(() => {
    setSelectedElementIds([]);
  }, []);

  // Alignment handlers
  const handleAlignLeft = useCallback(() => {
    const selected = getSelectedElements();
    if (selected.length < 2) return;

    const aligned = alignLeft(selected);
    updateElements(aligned);
  }, [getSelectedElements, updateElements]);

  const handleAlignCenter = useCallback(() => {
    const selected = getSelectedElements();
    if (selected.length < 2) return;

    const aligned = alignCenterHorizontal(selected);
    updateElements(aligned);
  }, [getSelectedElements, updateElements]);

  const handleAlignRight = useCallback(() => {
    const selected = getSelectedElements();
    if (selected.length < 2) return;

    const aligned = alignRight(selected);
    updateElements(aligned);
  }, [getSelectedElements, updateElements]);

  const handleAlignTop = useCallback(() => {
    const selected = getSelectedElements();
    if (selected.length < 2) return;

    const aligned = alignTop(selected);
    updateElements(aligned);
  }, [getSelectedElements, updateElements]);

  const handleAlignMiddle = useCallback(() => {
    const selected = getSelectedElements();
    if (selected.length < 2) return;

    const aligned = alignMiddleVertical(selected);
    updateElements(aligned);
  }, [getSelectedElements, updateElements]);

  const handleAlignBottom = useCallback(() => {
    const selected = getSelectedElements();
    if (selected.length < 2) return;

    const aligned = alignBottom(selected);
    updateElements(aligned);
  }, [getSelectedElements, updateElements]);

  const handleDistributeVertically = useCallback(() => {
    const selected = getSelectedElements();
    if (selected.length < 3) return;

    const distributed = distributeVertically(selected);
    updateElements(distributed);
  }, [getSelectedElements, updateElements]);

  const handleDistributeHorizontally = useCallback(() => {
    const selected = getSelectedElements();
    if (selected.length < 3) return;

    const distributed = distributeHorizontally(selected);
    updateElements(distributed);
  }, [getSelectedElements, updateElements]);

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      onTemplateChange(history[newIndex].template);
    }
  }, [history, historyIndex, onTemplateChange]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      onTemplateChange(history[newIndex].template);
    }
  }, [history, historyIndex, onTemplateChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Z: Undo
      if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      }
      // Ctrl+Shift+Z or Ctrl+Y: Redo
      if ((event.ctrlKey && event.shiftKey && event.key === 'z') || (event.ctrlKey && event.key === 'y')) {
        event.preventDefault();
        handleRedo();
      }
      // Delete: Remove selected elements
      if (event.key === 'Delete' && selectedElementIds.length > 0) {
        event.preventDefault();
        const allElements = getAllElements();
        const remainingElements = allElements.filter(el => !selectedElementIds.includes(el.id));
        
        const updatedSections: ReportSection[] = template.sections.map(section => ({
          ...section,
          elements: section.elements.filter(el => !selectedElementIds.includes(el.id)),
        }));

        const updatedTemplate: ReportTemplate = {
          ...template,
          sections: updatedSections,
        };

        // Add to history
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push({ template: updatedTemplate, timestamp: Date.now() });
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);

        onTemplateChange(updatedTemplate);
        setSelectedElementIds([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementIds, getAllElements, template, history, historyIndex, onTemplateChange, handleUndo, handleRedo]);

  // Render element with selection indicator
  const renderElement = (element: ReportElement, section: ReportSection) => {
    const isSelected = selectedElementIds.includes(element.id);
    const bounds = getElementBounds(element);
    
    // Convert mm to pixels (assuming 1mm = 3.779527559 pixels at 96 DPI)
    const mmToPx = 3.779527559 * scale;
    const left = bounds.x * mmToPx;
    const top = bounds.y * mmToPx;
    const width = bounds.width * mmToPx;
    const height = bounds.height * mmToPx;

    const elementStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: width > 0 ? `${width}px` : 'auto',
      height: height > 0 ? `${height}px` : 'auto',
      border: isSelected ? '2px solid #3b82f6' : '1px solid transparent',
      cursor: 'pointer',
      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
      padding: '4px',
      boxSizing: 'border-box',
    };

    // Render different element types
    let content: React.ReactNode;
    
    switch (element.type) {
      case 'static-text':
        content = (
          <div className="text-sm">
            {element.content || '(Empty text)'}
          </div>
        );
        break;
      case 'dynamic-field':
        content = (
          <div className="text-sm text-blue-600">
            {`{{${element.dataSource}}}`}
          </div>
        );
        break;
      case 'image':
        content = (
          <div className="text-sm text-gray-400 border-2 border-dashed border-gray-300 p-2">
            [Image: {typeof element.source === 'string' ? element.source : element.source}]
          </div>
        );
        break;
      case 'rectangle':
        content = (
          <div
            className="border-2 border-gray-400"
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: element.fillColor || 'transparent',
            }}
          />
        );
        break;
      case 'line':
        // Lines need special handling - render as SVG line
        const lineLength = Math.sqrt(
          Math.pow((element.endX - element.startX) * mmToPx, 2) +
          Math.pow((element.endY - element.startY) * mmToPx, 2)
        );
        const lineAngle = Math.atan2(
          (element.endY - element.startY) * mmToPx,
          (element.endX - element.startX) * mmToPx
        ) * (180 / Math.PI);
        
        const lineStyle: React.CSSProperties = {
          position: 'absolute',
          left: `${element.startX * mmToPx}px`,
          top: `${element.startY * mmToPx}px`,
          width: `${lineLength}px`,
          height: `${element.strokeWidth || 1}px`,
          backgroundColor: element.strokeColor || '#000000',
          transform: `rotate(${lineAngle}deg)`,
          transformOrigin: 'top left',
        };
        return (
          <div
            key={element.id}
            style={lineStyle}
            onClick={(e) => handleElementClick(element.id, e)}
            className={isSelected ? 'ring-2 ring-blue-500' : ''}
          />
        );
      default:
        content = (
          <div className="text-xs text-gray-500">
            [{element.type}]
          </div>
        );
    }

    return (
      <div
        key={element.id}
        style={elementStyle}
        onClick={(e) => handleElementClick(element.id, e)}
        className={isSelected ? 'ring-2 ring-blue-500' : ''}
      >
        {content}
      </div>
    );
  };

  // Calculate canvas dimensions (A4 at scale)
  const pageWidth = template.pageSettings.orientation === 'landscape' ? 297 : 210; // mm
  const pageHeight = template.pageSettings.orientation === 'landscape' ? 210 : 297; // mm
  const mmToPx = 3.779527559 * scale;
  const canvasWidth = pageWidth * mmToPx;
  const canvasHeight = pageHeight * mmToPx;

  return (
    <div className="relative w-full h-full bg-gray-100 overflow-auto">
      {/* Alignment Toolbar */}
      <AlignmentToolbar
        selectedCount={selectedElementIds.length}
        onAlignLeft={handleAlignLeft}
        onAlignCenter={handleAlignCenter}
        onAlignRight={handleAlignRight}
        onAlignTop={handleAlignTop}
        onAlignMiddle={handleAlignMiddle}
        onAlignBottom={handleAlignBottom}
        onDistributeVertically={handleDistributeVertically}
        onDistributeHorizontally={handleDistributeHorizontally}
      />

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative mx-auto my-8 bg-white shadow-lg"
        style={{
          width: `${canvasWidth}px`,
          minHeight: `${canvasHeight}px`,
        }}
        onClick={handleCanvasClick}
      >
        {/* Render sections and elements */}
        {template.sections.map(section => (
          <div key={section.id} className="relative">
            {section.elements.map(element => renderElement(element, section))}
          </div>
        ))}
      </div>

      {/* Selection info (debug) */}
      {selectedElementIds.length > 0 && (
        <div className="fixed bottom-4 left-4 bg-white border border-gray-300 rounded-lg shadow-lg p-2 text-xs">
          {selectedElementIds.length} element(s) selected
        </div>
      )}
    </div>
  );
};

