/**
 * PDF Template Builder Sections
 * Centralized exports for all section components
 */

import type { SectionDefinition } from './types';
import { headerSectionComponents, headerSectionDataSources } from './HeaderSection';
import { footerSectionComponents, footerSectionDataSources } from './FooterSection';
import { jobInformationSectionComponents, jobInformationSectionDataSources } from './JobInformationSection';
import { serviceInformationSectionComponents, serviceInformationSectionDataSources } from './ServiceInformationSection';
import { equipmentSectionComponents, equipmentSectionDataSources } from './EquipmentSection';
import { spreadsheetSectionComponents, spreadsheetSectionDataSources } from './SpreadsheetSection';
import { workAuthorizationSectionComponents, workAuthorizationSectionDataSources } from './WorkAuthorizationSection';
import { commentsSectionComponents, commentsSectionDataSources } from './CommentsSection';
import { createUniversalDocumentsTableComponent } from './DocumentsTableComponent';

function withUniversalDocumentsTable(sectionId: string, components: SectionDefinition['components']) {
  const withoutDocuments = components.filter((c) => c.type !== 'documents-table');
  return [...withoutDocuments, createUniversalDocumentsTableComponent(sectionId)];
}

export const sections: SectionDefinition[] = [
  {
    id: 'header',
    name: 'Header',
    icon: '📄',
    description: 'Header components (logo, company info, page numbers)',
    components: withUniversalDocumentsTable('header', headerSectionComponents),
    dataSources: headerSectionDataSources as SectionDefinition['dataSources'],
  },
  {
    id: 'job-information',
    name: 'Job Information',
    icon: '📋',
    description: 'Job details (ID, title, status, customer, dates)',
    components: withUniversalDocumentsTable('job-information', jobInformationSectionComponents),
    dataSources: jobInformationSectionDataSources as SectionDefinition['dataSources'],
  },
  {
    id: 'service-information',
    name: 'Service Information',
    icon: '🔧',
    description: 'Service request details',
    components: withUniversalDocumentsTable('service-information', serviceInformationSectionComponents),
    dataSources: serviceInformationSectionDataSources as SectionDefinition['dataSources'],
  },
  {
    id: 'equipment',
    name: 'Equipment',
    icon: '⚙️',
    description: 'Equipment list and details',
    components: withUniversalDocumentsTable('equipment', equipmentSectionComponents),
    dataSources: equipmentSectionDataSources as SectionDefinition['dataSources'],
  },
  {
    id: 'spreadsheet',
    name: 'Spreadsheet Data',
    icon: '📊',
    description: 'Measurement data and spreadsheets',
    components: withUniversalDocumentsTable('spreadsheet', spreadsheetSectionComponents),
    dataSources: spreadsheetSectionDataSources as SectionDefinition['dataSources'],
  },
  {
    id: 'work-authorization',
    name: 'Work Authorization',
    icon: '✅',
    description: 'Work authorization and signatures',
    components: withUniversalDocumentsTable('work-authorization', workAuthorizationSectionComponents),
    dataSources: workAuthorizationSectionDataSources as SectionDefinition['dataSources'],
  },
  {
    id: 'comments',
    name: 'Comments',
    icon: '💬',
    description: 'Comments and additional notes',
    components: withUniversalDocumentsTable('comments', commentsSectionComponents),
    dataSources: commentsSectionDataSources as SectionDefinition['dataSources'],
  },
  {
    id: 'footer',
    name: 'Footer',
    icon: '📑',
    description: 'Footer components (text, page numbers)',
    components: withUniversalDocumentsTable('footer', footerSectionComponents),
    dataSources: footerSectionDataSources as SectionDefinition['dataSources'],
  },
];

/**
 * Get section by ID
 */
export function getSectionById(id: string): SectionDefinition | undefined {
  return sections.find(s => s.id === id);
}

/**
 * Get all components from a section
 */
export function getSectionComponents(sectionId: string) {
  const section = getSectionById(sectionId);
  return section?.components || [];
}

/**
 * Get all data sources from a section
 */
export function getSectionDataSources(sectionId: string) {
  const section = getSectionById(sectionId);
  return section?.dataSources || [];
}

/**
 * Get component definition by type and section
 */
export function getComponentDefinition(type: string, sectionId: string) {
  const section = getSectionById(sectionId);
  return section?.components.find(c => c.type === type);
}

// Export individual sections for direct access
export { headerSectionComponents, headerSectionDataSources } from './HeaderSection';
export { footerSectionComponents, footerSectionDataSources } from './FooterSection';
export { jobInformationSectionComponents, jobInformationSectionDataSources } from './JobInformationSection';
export { serviceInformationSectionComponents, serviceInformationSectionDataSources } from './ServiceInformationSection';
export { equipmentSectionComponents, equipmentSectionDataSources } from './EquipmentSection';
export { spreadsheetSectionComponents, spreadsheetSectionDataSources } from './SpreadsheetSection';
export { workAuthorizationSectionComponents, workAuthorizationSectionDataSources } from './WorkAuthorizationSection';
export { commentsSectionComponents, commentsSectionDataSources } from './CommentsSection';

export type { SectionDefinition, ComponentDefinition } from './types';
