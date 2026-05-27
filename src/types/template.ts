import { z } from 'zod';

/**
 * Template System Type Definitions
 * Defines the schema and types for spreadsheet templates, columns, formulas, and PDF settings
 */

// Column Definition Schema
export const columnDefinitionSchema = z.object({
  id: z.string(),
  header: z.string(),
  type: z.enum(['text', 'number', 'date', 'formula', 'dropdown']),
  width: z.number().optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().optional(),
  formula: z.string().optional(),
  options: z.array(z.string()).optional(), // For dropdown type
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
  }).optional(),
});

export type ColumnDefinition = z.infer<typeof columnDefinitionSchema>;

// Template Formula Schema
export const templateFormulaSchema = z.object({
  cellId: z.string(), // e.g., "A1", "B2"
  formula: z.string(),
  dependsOn: z.array(z.string()).optional(), // Cell IDs this formula depends on
});

export type TemplateFormula = z.infer<typeof templateFormulaSchema>;

// PDF Settings Schema
export const pdfSettingsSchema = z.object({
  version: z.number().optional(),
  templateName: z.string(),
  pageSize: z.enum(['A4', 'Letter']).default('A4'),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  layout: z.enum(['traditional', 'grid']).default('traditional'),
  fontSize: z.object({
    title: z.number().default(16),
    heading: z.number().default(14),
    body: z.number().default(12),
    small: z.number().default(10),
    header: z.number().default(10),
    footer: z.number().default(10),
  }).optional(),
  margin: z.object({
    top: z.number().default(20),
    right: z.number().default(20),
    bottom: z.number().default(20),
    left: z.number().default(20),
  }).optional(),
  showLogo: z.boolean().default(true),
  showHeader: z.boolean().default(true),
  showFooter: z.boolean().default(true),
  headerContent: z.object({
    left: z.string().optional(),
    center: z.string().optional(),
    right: z.string().optional(),
  }).optional(),
  footerContent: z.object({
    left: z.string().optional(),
    center: z.string().optional(),
    right: z.string().optional(),
  }).optional(),
});

export type PdfSettings = z.infer<typeof pdfSettingsSchema>;

// Template Schema
export const templateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  ownerId: z.string(), // Firebase user ID
  columns: z.array(columnDefinitionSchema),
  formulas: z.array(templateFormulaSchema).optional(),
  pdfSettings: pdfSettingsSchema.optional(),
  isPublic: z.boolean().default(false),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  version: z.number().default(1),
  tabs: z.array(z.any()).optional(),
  columnOrder: z.array(z.string()).optional(),
});

export type TemplateSchema = z.infer<typeof templateSchema>;

// Template Metadata (for listing)
export interface TemplateMetadata {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerName?: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  columnCount: number;
}

// Spreadsheet Cell Data
export interface FlattenedCellData {
  row: number;
  col: number;
  value: string | number;
  formula?: string;
  type?: string;
}

// Template Application Result
export interface TemplateApplicationResult {
  data: FlattenedCellData[];
  columns: ColumnDefinition[];
  formulas: TemplateFormula[];
  errors: string[];
}

