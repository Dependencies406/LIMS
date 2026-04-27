/**
 * Report Item Model
 * Base class and factory for report items
 */

import type {
  ReportItem as IReportItem,
  ReportItemType,
  ReportItemDataSource,
  TextItemDataSource,
  ImageItemDataSource,
  LineItemDataSource,
} from '../types';

/**
 * Create a new report item
 */
export function createReportItem(
  type: ReportItemType,
  x: number,
  y: number,
  width: number,
  height: number,
  dataSource?: Partial<ReportItemDataSource>
): IReportItem {
  const id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Default data sources based on type
  let defaultDataSource: ReportItemDataSource;
  
  switch (type) {
    case 'text':
      defaultDataSource = {
        type: 'text',
        key: 'job.customer',
        font: 'Helvetica',
        fontSize: 12,
        bold: false,
        italic: false,
        align: 'left',
        color: '#000000',
      } as TextItemDataSource;
      break;
      
    case 'image':
      defaultDataSource = {
        type: 'image',
        key: 'logo',
        maintainAspect: true,
        fitMode: 'contain',
      } as ImageItemDataSource;
      break;
      
    case 'line':
      defaultDataSource = {
        type: 'line',
        orientation: 'horizontal',
        thickness: 2,
        color: '#000000',
        style: 'solid',
      } as LineItemDataSource;
      break;
      
    default:
      defaultDataSource = {
        type,
        key: 'unknown',
      };
  }
  
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    dataSource: {
      ...defaultDataSource,
      ...dataSource,
    } as ReportItemDataSource,
    zIndex: 0,
  };
}

/**
 * Create report item from serialized data
 */
export function createReportItemFromData(data: Partial<IReportItem>): IReportItem {
  if (!data.type || !data.id) {
    throw new Error('Invalid report item data: missing type or id');
  }
  
  return {
    id: data.id,
    type: data.type,
    x: data.x ?? 0,
    y: data.y ?? 0,
    width: data.width ?? 100,
    height: data.height ?? 50,
    dataSource: data.dataSource ?? { type: data.type, key: 'unknown' },
    zIndex: data.zIndex ?? 0,
  };
}

/**
 * Update report item
 */
export function updateReportItem(
  item: IReportItem,
  updates: Partial<IReportItem>
): IReportItem {
  return {
    ...item,
    ...updates,
    dataSource: updates.dataSource ? {
      ...item.dataSource,
      ...updates.dataSource,
    } : item.dataSource,
  };
}

/**
 * Get item label for display
 */
export function getItemLabel(item: IReportItem): string {
  const { type, dataSource } = item;
  const key = dataSource.key || 'undefined';
  
  switch (type) {
    case 'text':
      if (key.startsWith('job.')) {
        const fieldName = key.replace('job.', '').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        return `📝 ${fieldName}`;
      } else if (key.startsWith('equipment.')) {
        const fieldName = key.replace('equipment.', '').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        return `🔧 ${fieldName}`;
      } else if (key.startsWith('customer.')) {
        const fieldName = key.replace('customer.', '').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        return `👤 ${fieldName}`;
      } else if (key === 'static') {
        const text = (dataSource as TextItemDataSource).staticText || 'Static Text';
        return `📄 ${text.substring(0, 20)}`;
      }
      return `📝 ${key}`;
      
    case 'image':
      if (key === 'logo') {
        return '🖼️ Company Logo';
      } else if (key === 'signature') {
        return '✍️ Signature';
      }
      return `🖼️ ${key.charAt(0).toUpperCase() + key.slice(1)}`;
      
    case 'line':
      const orientation = (dataSource as LineItemDataSource).orientation || 'horizontal';
      return `➖ ${orientation.charAt(0).toUpperCase() + orientation.slice(1)} Line`;
      
    default:
      return `❓ ${type}`;
  }
}

