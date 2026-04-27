/**
 * Report Designer Types
 * Data models for the visual report designer
 */

/**
 * Report item types
 */
export type ReportItemType = 'text' | 'image' | 'line';

/**
 * Data source for report items
 */
export interface ReportItemDataSource {
  type: ReportItemType;
  key: string; // e.g., 'job.customer', 'spreadsheet.data', 'logo'
  [key: string]: any; // Additional properties based on item type
}

/**
 * Base report item
 */
export interface ReportItem {
  id: string;
  type: ReportItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  dataSource: ReportItemDataSource;
  zIndex?: number; // For layering
}

/**
 * Text item specific properties
 */
export interface TextItemDataSource extends ReportItemDataSource {
  type: 'text';
  key: string; // e.g., 'job.customer', 'job.jobId', 'static'
  font?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  staticText?: string; // For static text items
}

/**
 * Image item specific properties
 */
export interface ImageItemDataSource extends ReportItemDataSource {
  type: 'image';
  key: 'logo' | 'signature' | string;
  path?: string; // Local or Firebase Storage path
  url?: string; // Download URL
  maintainAspect?: boolean;
  fitMode?: 'contain' | 'cover' | 'fill';
}

/**
 * Line item specific properties
 */
export interface LineItemDataSource extends ReportItemDataSource {
  type: 'line';
  orientation?: 'horizontal' | 'vertical';
  thickness?: number;
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
}

/**
 * Report layout structure
 */
export interface ReportLayout {
  version: string;
  pageSize: 'A4' | 'Letter';
  orientation: 'Portrait' | 'Landscape';
  backgroundImage?: string; // Path or URL
  elements: ReportItem[];
  metadata?: {
    templateId?: string;
    templateName?: string;
    author?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

/**
 * Report template (stored in Firestore)
 */
export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  layout: ReportLayout;
  author: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Canvas viewport state
 */
export interface CanvasViewport {
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * Alignment options
 */
export type HorizontalAlignment = 'left' | 'center' | 'right';
export type VerticalAlignment = 'top' | 'middle' | 'bottom';
export type DistributionType = 'vertical' | 'horizontal';

