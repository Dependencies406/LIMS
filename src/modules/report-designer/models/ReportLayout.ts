/**
 * Report Layout Model
 * Manages report layout structure and operations
 */

import type { ReportLayout, ReportItem } from '../types';
import { createReportItem, createReportItemFromData } from './ReportItem';

/**
 * Create empty report layout
 */
export function createEmptyLayout(
  pageSize: 'A4' | 'Letter' = 'A4',
  orientation: 'Portrait' | 'Landscape' = 'Portrait'
): ReportLayout {
  return {
    version: '1.0',
    pageSize,
    orientation,
    elements: [],
    metadata: {},
  };
}

/**
 * Create layout from data
 */
export function createLayoutFromData(data: Partial<ReportLayout>): ReportLayout {
  return {
    version: data.version || '1.0',
    pageSize: data.pageSize || 'A4',
    orientation: data.orientation || 'Portrait',
    backgroundImage: data.backgroundImage,
    elements: (data.elements || []).map(el => createReportItemFromData(el)),
    metadata: data.metadata || {},
  };
}

/**
 * Add item to layout
 */
export function addItemToLayout(
  layout: ReportLayout,
  item: ReportItem
): ReportLayout {
  return {
    ...layout,
    elements: [...layout.elements, item],
  };
}

/**
 * Remove item from layout
 */
export function removeItemFromLayout(
  layout: ReportLayout,
  itemId: string
): ReportLayout {
  return {
    ...layout,
    elements: layout.elements.filter(el => el.id !== itemId),
  };
}

/**
 * Update item in layout
 */
export function updateItemInLayout(
  layout: ReportLayout,
  itemId: string,
  updates: Partial<ReportItem>
): ReportLayout {
  return {
    ...layout,
    elements: layout.elements.map(el =>
      el.id === itemId ? { ...el, ...updates } : el
    ),
  };
}

/**
 * Get page dimensions in pixels (at 72 DPI)
 */
export function getPageDimensions(
  pageSize: 'A4' | 'Letter',
  orientation: 'Portrait' | 'Landscape'
): { width: number; height: number } {
  // A4: 210mm x 297mm = 8.27" x 11.69" = 595px x 842px at 72 DPI
  // Letter: 8.5" x 11" = 612px x 792px at 72 DPI
  
  const dimensions = {
    A4: { width: 595, height: 842 },
    Letter: { width: 612, height: 792 },
  };
  
  const size = dimensions[pageSize];
  
  if (orientation === 'Landscape') {
    return { width: size.height, height: size.width };
  }
  
  return size;
}

/**
 * Constrain item position within page bounds
 */
export function constrainItemPosition(
  item: ReportItem,
  pageWidth: number,
  pageHeight: number
): { x: number; y: number } {
  let x = item.x;
  let y = item.y;
  
  // Constrain X
  if (x < 0) {
    x = 0;
  } else if (x + item.width > pageWidth) {
    x = Math.max(0, pageWidth - item.width);
  }
  
  // Constrain Y
  if (y < 0) {
    y = 0;
  } else if (y + item.height > pageHeight) {
    y = Math.max(0, pageHeight - item.height);
  }
  
  return { x, y };
}

