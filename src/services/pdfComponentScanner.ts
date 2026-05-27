/**
 * PDF Component Scanner Service
 * Scans all available PDF components and data sources in the application
 */

import { sections } from '../modules/pdf-template-builder/components/sections';
import { getDataSourceDiscovery } from './dataSourceDiscoveryService';
import type { ComponentDefinition, SectionDefinition } from '../modules/pdf-template-builder/components/sections/types';
import type { DataSourceItem } from '../modules/pdf-template-builder/types';

export interface ScannedComponent {
  id: string;
  type: string;
  name: string;
  icon: string;
  section: string;
  sectionName: string;
  description?: string;
  defaultProperties?: any;
}

export interface ScannedDataSource {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'image' | 'boolean';
  category: string;
  description?: string;
  /** Primary section (back-compat). */
  section?: string;
  /** All sections where this key is declared (may be multiple). */
  sections?: string[];
}

export interface ScanResult {
  timestamp: Date;
  sections: Array<{
    id: string;
    name: string;
    icon: string;
    description: string;
    componentCount: number;
    dataSourceCount: number;
  }>;
  components: ScannedComponent[];
  dataSources: ScannedDataSource[];
  statistics: {
    totalSections: number;
    totalComponents: number;
    totalDataSources: number;
    componentsByType: Record<string, number>;
    dataSourcesByCategory: Record<string, number>;
    dataSourcesByType: Record<string, number>;
  };
}

class PdfComponentScanner {
  /**
   * Scan all available PDF components and data sources
   */
  scan(): ScanResult {
    const timestamp = new Date();
    
    // Scan sections
    const scannedSections = sections.map(section => ({
      id: section.id,
      name: section.name,
      icon: section.icon,
      description: section.description,
      componentCount: section.components.length,
      dataSourceCount: section.dataSources.length,
    }));

    // Scan all components
    const scannedComponents: ScannedComponent[] = [];
    sections.forEach(section => {
      section.components.forEach(component => {
        scannedComponents.push({
          id: `${section.id}-${component.type}`,
          type: component.type,
          name: component.name,
          icon: component.icon,
          section: section.id,
          sectionName: section.name,
          description: component.description,
          defaultProperties: component.defaultProperties,
        });
      });
    });

    // Scan all data sources
    const discovery = getDataSourceDiscovery();
    const allDataSources = discovery.getAllDataSources();
    const scannedDataSources: ScannedDataSource[] = allDataSources.map(ds => ({
      key: ds.key,
      label: ds.label,
      type: ds.type,
      category: ds.category,
      description: ds.description,
      section: discovery.getSectionForDataSource(ds.key),
      sections: discovery.getSectionsForDataSource(ds.key),
    }));

    // Calculate statistics
    const componentsByType: Record<string, number> = {};
    scannedComponents.forEach(comp => {
      componentsByType[comp.type] = (componentsByType[comp.type] || 0) + 1;
    });

    const dataSourcesByCategory: Record<string, number> = {};
    scannedDataSources.forEach(ds => {
      dataSourcesByCategory[ds.category] = (dataSourcesByCategory[ds.category] || 0) + 1;
    });

    const dataSourcesByType: Record<string, number> = {};
    scannedDataSources.forEach(ds => {
      dataSourcesByType[ds.type] = (dataSourcesByType[ds.type] || 0) + 1;
    });

    return {
      timestamp,
      sections: scannedSections,
      components: scannedComponents,
      dataSources: scannedDataSources,
      statistics: {
        totalSections: scannedSections.length,
        totalComponents: scannedComponents.length,
        totalDataSources: scannedDataSources.length,
        componentsByType,
        dataSourcesByCategory,
        dataSourcesByType,
      },
    };
  }

  /**
   * Get components by section
   */
  getComponentsBySection(sectionId: string): ScannedComponent[] {
    const result = this.scan();
    return result.components.filter(c => c.section === sectionId);
  }

  /**
   * Get data sources by category
   */
  getDataSourcesByCategory(category: string): ScannedDataSource[] {
    const result = this.scan();
    return result.dataSources.filter(ds => ds.category === category);
  }

  /**
   * Search components
   */
  searchComponents(query: string): ScannedComponent[] {
    const result = this.scan();
    const lowerQuery = query.toLowerCase();
    return result.components.filter(comp =>
      comp.name.toLowerCase().includes(lowerQuery) ||
      comp.type.toLowerCase().includes(lowerQuery) ||
      comp.sectionName.toLowerCase().includes(lowerQuery) ||
      comp.description?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Search data sources
   */
  searchDataSources(query: string): ScannedDataSource[] {
    const result = this.scan();
    const lowerQuery = query.toLowerCase();
    return result.dataSources.filter(ds =>
      ds.key.toLowerCase().includes(lowerQuery) ||
      ds.label.toLowerCase().includes(lowerQuery) ||
      ds.category.toLowerCase().includes(lowerQuery) ||
      ds.description?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Export scan result as JSON
   */
  exportAsJson(result: ScanResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Export scan result as CSV
   */
  exportAsCsv(result: ScanResult, type: 'components' | 'dataSources' | 'both' = 'both'): string {
    const lines: string[] = [];

    if (type === 'components' || type === 'both') {
      lines.push('Type,Name,Section,Icon,Description');
      result.components.forEach(comp => {
        lines.push([
          comp.type,
          comp.name,
          comp.sectionName,
          comp.icon,
          comp.description || '',
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      });
    }

    if (type === 'dataSources' || type === 'both') {
      if (type === 'both') lines.push(''); // Separator
      lines.push('Key,Label,Type,Category,Description,Section');
      result.dataSources.forEach(ds => {
        lines.push([
          ds.key,
          ds.label,
          ds.type,
          ds.category,
          ds.description || '',
          ds.section || '',
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      });
    }

    return lines.join('\n');
  }
}

// Singleton instance
let scannerInstance: PdfComponentScanner | null = null;

export function getPdfComponentScanner(): PdfComponentScanner {
  if (!scannerInstance) {
    scannerInstance = new PdfComponentScanner();
  }
  return scannerInstance;
}

export default PdfComponentScanner;
