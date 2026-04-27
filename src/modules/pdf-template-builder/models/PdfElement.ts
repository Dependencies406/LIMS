/**
 * PDF Element Model
 * Factory and utilities for PDF elements
 */

import type {
  PdfElement,
  TextElement,
  LineElement,
  RectangleElement,
  ImageElement,
  ChartElement,
  EquipmentTableElement,
  EquipmentTableColumnDef,
  DocumentsTableElement,
  DocumentsTableColumnDef,
  TrebTableElement,
  PdfElementType,
} from '../types';
import { DOCUMENTS_TABLE_DEFAULT_COLUMNS, EQUIPMENT_TABLE_DEFAULT_COLUMNS } from '../types';

/**
 * Create a new PDF element
 */
export function createPdfElement(
  type: PdfElementType,
  x: number,
  y: number,
  options?: Partial<PdfElement>
): PdfElement {
  const id = `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const baseElement: PdfElement = {
    id,
    type,
    x,
    y,
    paginationMode: (options as any)?.paginationMode,
    repeatOnOverflowPages: (options as any)?.repeatOnOverflowPages,
    overflowPriority: (options as any)?.overflowPriority,
    ...options,
  };
  
  switch (type) {
    case 'text':
      return {
        ...baseElement,
        type: 'text',
        font: options?.font || 'Helvetica',
        fontSize: options?.fontSize || 12,
        bold: options?.bold || false,
        italic: options?.italic || false,
        align: (options?.align as 'left' | 'center' | 'right') || 'left',
        color: options?.color || '#000000',
        staticText: (options as TextElement)?.staticText,
        dataSource: (options as TextElement)?.dataSource ? {
          type: 'text',
          key: (options as TextElement)?.dataSource?.key || '',
        } : undefined,
      } as TextElement;
      
    case 'line':
      return {
        ...baseElement,
        type: 'line',
        x1: (options as LineElement)?.x1 ?? x,
        y1: (options as LineElement)?.y1 ?? y,
        x2: (options as LineElement)?.x2 ?? x + 200,
        y2: (options as LineElement)?.y2 ?? y,
        color: options?.color || '#000000',
        width: (options as LineElement)?.width || 1,
      } as LineElement;
      
    case 'rectangle':
      return {
        ...baseElement,
        type: 'rectangle',
        width: options?.width || 200,
        height: options?.height || 100,
        fillColor: (options as RectangleElement)?.fillColor,
        strokeColor: (options as RectangleElement)?.strokeColor || '#000000',
        strokeWidth: (options as RectangleElement)?.strokeWidth || 1,
        // Rectangle doesn't need datasource - it's always standalone
        dataSource: undefined,
      } as RectangleElement;
      
    case 'image':
      return {
        ...baseElement,
        type: 'image',
        width: options?.width || 200,
        height: options?.height || 150,
        imageUrl: (options as ImageElement)?.imageUrl,
        imagePath: (options as ImageElement)?.imagePath,
        dataSource: (options as ImageElement)?.dataSource ? {
          type: 'image',
          key: (options as ImageElement)?.dataSource?.key || '',
        } : undefined,
        maintainAspect: (options as ImageElement)?.maintainAspect ?? true,
        fitMode: (options as ImageElement)?.fitMode || 'contain',
      } as ImageElement;

    case 'equipment-table':
      const tableOpts = options as EquipmentTableElement;
      const defaultCols: EquipmentTableColumnDef[] = EQUIPMENT_TABLE_DEFAULT_COLUMNS.map((def, idx) => ({
        id: def.id,
        label: def.label,
        visible: true,
        width: def.defaultWidth,
        align: 'left' as const,
        order: idx,
      }));
      return {
        ...baseElement,
        type: 'equipment-table',
        paginationMode: tableOpts?.paginationMode ?? 'dynamic',
        repeatOnOverflowPages: tableOpts?.repeatOnOverflowPages ?? true,
        overflowRole: tableOpts?.overflowRole ?? 'dynamic',
        width: tableOpts?.width ?? 500,
        height: tableOpts?.height ?? 200,
        columns: (tableOpts?.columns && tableOpts.columns.length > 0) ? tableOpts.columns : defaultCols,
        borderColor: tableOpts?.borderColor ?? '#000000',
        borderWidth: tableOpts?.borderWidth ?? 1,
        fontSize: tableOpts?.fontSize ?? 9,
        headerFontSize: tableOpts?.headerFontSize ?? 10,
        headerStyle: tableOpts?.headerStyle ?? { bold: true, backgroundColor: '#f0f0f0' },
        cellStyle: tableOpts?.cellStyle ?? {},
      } as EquipmentTableElement;

    case 'documents-table': {
      const docOpts = options as DocumentsTableElement;
      const defaultDocCols: DocumentsTableColumnDef[] = DOCUMENTS_TABLE_DEFAULT_COLUMNS.map((def, idx) => ({
        id: def.id,
        label: def.label,
        visible: true,
        width: def.defaultWidth,
        align: 'left' as const,
        order: idx,
      }));
      return {
        ...baseElement,
        type: 'documents-table',
        paginationMode: docOpts?.paginationMode ?? 'dynamic',
        repeatOnOverflowPages: docOpts?.repeatOnOverflowPages ?? true,
        overflowRole: docOpts?.overflowRole ?? 'dynamic',
        width: docOpts?.width ?? 500,
        height: docOpts?.height ?? 200,
        columns: docOpts?.columns && docOpts.columns.length > 0 ? docOpts.columns : defaultDocCols,
        borderColor: docOpts?.borderColor ?? '#000000',
        borderWidth: docOpts?.borderWidth ?? 1,
        fontSize: docOpts?.fontSize ?? 9,
        headerFontSize: docOpts?.headerFontSize ?? 10,
        headerStyle: docOpts?.headerStyle ?? { bold: true, backgroundColor: '#f0f0f0' },
        cellStyle: docOpts?.cellStyle ?? {},
        dataSource: docOpts?.dataSource ?? { type: 'documentIndex', key: 'documentIndex.list' },
      } as DocumentsTableElement;
    }

    case 'chart':
      const chartOptions = options as ChartElement;
      return {
        ...baseElement,
        type: 'chart',
        width: chartOptions?.width || 300,
        height: chartOptions?.height || 200,
        chartType: chartOptions?.chartType || 'line',
        title: chartOptions?.title,
        xAxisLabel: chartOptions?.xAxisLabel,
        yAxisLabel: chartOptions?.yAxisLabel,
        dataSource: chartOptions?.dataSource ? {
          type: 'chart',
          key: chartOptions.dataSource.key,
          range: chartOptions.dataSource.range,
        } : undefined,
      } as ChartElement;

    case 'treb-table': {
      const trebOpts = options as TrebTableElement;
      return {
        ...baseElement,
        type: 'treb-table',
        paginationMode: trebOpts?.paginationMode ?? 'dynamic',
        repeatOnOverflowPages: trebOpts?.repeatOnOverflowPages ?? true,
        spreadsheetTemplateId: trebOpts?.spreadsheetTemplateId ?? '',
        sourceTabId: trebOpts?.sourceTabId ?? '',
        width: trebOpts?.width ?? 300,
        renderRange: trebOpts?.renderRange,
        fontSize: trebOpts?.fontSize ?? 9,
        borderColor: trebOpts?.borderColor ?? '#000000',
        borderWidth: trebOpts?.borderWidth ?? 1,
      } as TrebTableElement;
    }

    default:
      return baseElement;
  }
}

/**
 * Create element from serialized data
 */
export function createElementFromData(data: Partial<PdfElement>): PdfElement {
  if (!data.type || !data.id) {
    throw new Error('Invalid element data: missing type or id');
  }
  
  return {
    id: data.id,
    type: data.type,
    x: data.x ?? 0,
    y: data.y ?? 0,
    ...data,
  } as PdfElement;
}

/**
 * Update element
 */
export function updateElement(
  element: PdfElement,
  updates: Partial<PdfElement>
): PdfElement {
  const updated = {
    ...element,
    ...updates,
  };
  
  // Handle dataSource updates - if explicitly set to undefined, remove it
  if ('dataSource' in updates) {
    updated.dataSource = updates.dataSource;
  } else if (updates.dataSource) {
    // If updates.dataSource exists, merge it with existing
    updated.dataSource = {
      ...element.dataSource,
      ...updates.dataSource,
    };
  }
  
  return updated;
}

/**
 * Get element label for display
 */
export function getElementLabel(element: PdfElement): string {
  switch (element.type) {
    case 'text':
      const textEl = element as TextElement;
      if (!textEl.dataSource && textEl.staticText) {
        return `📄 Static Text`;
      }
      const key = textEl.dataSource?.key || 'unknown';
      if (key.startsWith('job.')) {
        return `📝 ${key.replace('job.', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
      } else if (key.startsWith('equipment.')) {
        return `🔧 ${key.replace('equipment.', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
      } else if (key.startsWith('customer.')) {
        return `👤 ${key.replace('customer.', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
      } else if (key === 'static') {
        return `📄 Static Text`;
      }
      return `📝 ${key}`;
      
    case 'line':
      return '➖ Line';
      
    case 'rectangle':
      return '▭ Rectangle';
      
    case 'image':
      const imgEl = element as ImageElement;
      if (!imgEl.dataSource && (imgEl.imageUrl || imgEl.imagePath)) {
        return '🖼️ Standalone Image';
      }
      const imgKey = imgEl.dataSource?.key || 'image';
      if (imgKey === 'logo') {
        return '🖼️ Company Logo';
      } else if (imgKey === 'signature') {
        return '✍️ Signature';
      }
      return `🖼️ ${imgKey.charAt(0).toUpperCase() + imgKey.slice(1)}`;

    case 'equipment-table':
      const tableEl = element as EquipmentTableElement;
      const visibleCount = tableEl.columns?.filter(c => c.visible !== false).length ?? 0;
      return `📋 Equipment Table (${visibleCount} columns)`;

    case 'documents-table': {
      const docTable = element as DocumentsTableElement;
      const docVisible = docTable.columns?.filter((c) => c.visible !== false).length ?? 0;
      return `📑 Documents Table (${docVisible} columns)`;
    }

    case 'chart':
      return `📈 Chart${(element as ChartElement).title ? `: ${(element as ChartElement).title}` : ''}`;

    case 'treb-table': {
      const trebEl = element as TrebTableElement;
      return trebEl.sourceTabId ? `📊 TREB Table: ${trebEl.sourceTabId}` : '📊 TREB Table';
    }

    default:
      return `❓ ${element.type}`;
  }
}

