/**
 * Section Component Types
 */

import type { PdfElement, PdfElementType } from '../../types';

export interface ComponentDefinition {
  type: PdfElementType;
  name: string;
  icon: string;
  section: string;
  defaultProperties: Partial<PdfElement>;
  description?: string;
}

export interface SectionDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  components: ComponentDefinition[];
  dataSources: Array<{
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'image' | 'boolean';
    category: string;
    description?: string;
  }>;
}
