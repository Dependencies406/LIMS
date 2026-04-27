/**
 * PDF Module System Type Definitions
 * Defines the plugin architecture for PDF section rendering
 */

import type { Job, PdfSettings } from './index';

/**
 * Helper functions available to all modules
 */
export interface PdfRenderHelpers {
  formatDate: (date?: string) => string;
  getStatusColor: (status: string) => string;
  getDateFromValue: (dateValue: any) => Date;
  replacePlaceholders: (
    text: string,
    job: Job,
    companyInfo: any,
    pageNum?: number,
    totalPages?: number,
    customerName?: string,
    logoSize?: { maxHeight: number; maxWidth: number }
  ) => Promise<string>;
}

/**
 * Module category for organization
 */
export type ModuleCategory = 'header' | 'content' | 'footer';

/**
 * Header/Footer component configuration
 */
export interface HeaderFooterComponent {
  id: string;
  name: string;
  type: 'static' | 'dynamic';
  enabled: boolean;
  content?: string; // For static components
  placeholder?: string; // For dynamic components (e.g., '{company_logo}', '{date}')
}

/**
 * Grid position for module layout
 */
export interface ModuleGridPosition {
  /** Grid row (1-based) */
  row: number;
  
  /** Grid column (1-based) */
  column: number;
  
  /** Number of rows to span */
  rowSpan?: number;
  
  /** Number of columns to span */
  colSpan?: number;
}

/**
 * PDF Module Definition
 * Each module represents a pluggable section in the PDF
 */
export interface PdfModule {
  /** Unique identifier (e.g., 'job-information') */
  id: string;
  
  /** Display name (e.g., 'Job Information') */
  name: string;
  
  /** Description/tooltip text */
  description: string;
  
  /** Module category */
  category: ModuleCategory;
  
  /** Should it be enabled by default? */
  defaultEnabled: boolean;
  
  /** Default display order */
  defaultOrder: number;
  
  /** Can user disable this module? */
  canDisable: boolean;
  
  /** Rendering function - returns HTML string */
  render: PdfModuleRenderFn;
  
  /** For header/footer modules: configurable components */
  components?: HeaderFooterComponent[];
  
  /** Default grid position */
  defaultGridPosition?: ModuleGridPosition;
}

/**
 * Module rendering function signature
 */
export type PdfModuleRenderFn = (
  job: Job,
  settings: PdfSettings,
  companyInfo: any,
  customerName?: string,
  helpers?: PdfRenderHelpers
) => Promise<string> | string;

/**
 * Module configuration for a template
 */
export interface ModuleConfiguration {
  /** Which modules are enabled */
  moduleVisibility: Record<string, boolean>;
  
  /** Order of modules (array of module IDs) */
  moduleOrder: string[];
  
  /** Grid positions for each module */
  moduleGridPositions?: Record<string, ModuleGridPosition>;
  
  /** Grid layout settings */
  gridLayout?: {
    /** Number of columns in the grid */
    columns: number;
    /** Gap between grid items (in pixels) */
    gap: number;
  };
  
  /** Header component configuration (if header module is enabled) */
  headerComponents?: {
    left: HeaderFooterComponent[];
    center: HeaderFooterComponent[];
    right: HeaderFooterComponent[];
  };
  
  /** Footer component configuration (if footer module is enabled) */
  footerComponents?: {
    left: HeaderFooterComponent[];
    center: HeaderFooterComponent[];
    right: HeaderFooterComponent[];
  };
}

