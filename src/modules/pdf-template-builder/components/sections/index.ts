/**
 * PDF Template Builder — Section Index
 *
 * HOW TO ADD A NEW SECTION
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 1. Create a new file in this folder, e.g. MySection.tsx.
 *    Export two arrays: `mySectionComponents` and `mySectionDataSources`.
 *
 * 2. Import those arrays below under "Section data imports".
 *
 * 3. Add one registerSection({...}) block in the "Register all sections" area.
 *    Copy any existing block as a template — only id/name/icon/description/components/dataSources differ.
 *
 * That's it. The new section appears in the Section Panel, component scanner,
 * and unused-element audit automatically. Nothing else needs to change.
 */

import {
  registerSection,
  getAllSections,
  getSectionById as _getSectionById,
} from '../../sectionRegistry';
import type { SectionDefinition } from './types';
import { createUniversalDocumentsTableComponent } from './DocumentsTableComponent';

// â”€â”€â”€ Section data imports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { headerSectionComponents, headerSectionDataSources } from './HeaderSection';
import { jobInformationSectionComponents, jobInformationSectionDataSources } from './JobInformationSection';
import { serviceInformationSectionComponents, serviceInformationSectionDataSources } from './ServiceInformationSection';
import { equipmentSectionComponents, equipmentSectionDataSources } from './EquipmentSection';
import { spreadsheetSectionComponents, spreadsheetSectionDataSources } from './SpreadsheetSection';
import { workAuthorizationSectionComponents, workAuthorizationSectionDataSources } from './WorkAuthorizationSection';
import { commentsSectionComponents, commentsSectionDataSources } from './CommentsSection';
import { footerSectionComponents, footerSectionDataSources } from './FooterSection';
import { staffSectionComponents, staffSectionDataSources } from './StaffSection';

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Append the universal Documents Index Table to a component list.
 * Prevents accidental duplicates (strips any existing documents-table first).
 */
function withUniversalDocumentsTable(
  sectionId: string,
  components: SectionDefinition['components']
): SectionDefinition['components'] {
  const withoutDocuments = components.filter((c) => c.type !== 'documents-table');
  return [...withoutDocuments, createUniversalDocumentsTableComponent(sectionId)];
}

// â”€â”€â”€ Register all sections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// To add a new section: add one registerSection() block here and import its data above.

registerSection({
  id: 'header',
  name: 'Header',
  icon: '📄',
  description: 'Header components (logo, company info, page numbers)',
  components: withUniversalDocumentsTable('header', headerSectionComponents),
  dataSources: headerSectionDataSources as SectionDefinition['dataSources'],
});

registerSection({
  id: 'job-information',
  name: 'Job Information',
  icon: '📋',
  description: 'Job details (ID, title, status, customer, dates)',
  components: withUniversalDocumentsTable('job-information', jobInformationSectionComponents),
  dataSources: jobInformationSectionDataSources as SectionDefinition['dataSources'],
});

registerSection({
  id: 'service-information',
  name: 'Service Information',
  icon: '🔧',
  description: 'Service request details',
  components: withUniversalDocumentsTable('service-information', serviceInformationSectionComponents),
  dataSources: serviceInformationSectionDataSources as SectionDefinition['dataSources'],
});

registerSection({
  id: 'equipment',
  name: 'Equipment',
  icon: '⚙️',
  description: 'Equipment list and details',
  components: withUniversalDocumentsTable('equipment', equipmentSectionComponents),
  dataSources: equipmentSectionDataSources as SectionDefinition['dataSources'],
});

registerSection({
  id: 'spreadsheet',
  name: 'Spreadsheet Data',
  icon: '📊',
  description: 'Measurement data and spreadsheets',
  components: withUniversalDocumentsTable('spreadsheet', spreadsheetSectionComponents),
  dataSources: spreadsheetSectionDataSources as SectionDefinition['dataSources'],
});

registerSection({
  id: 'work-authorization',
  name: 'Work Authorization',
  icon: '✅',
  description: 'Work authorization and signatures',
  components: withUniversalDocumentsTable('work-authorization', workAuthorizationSectionComponents),
  dataSources: workAuthorizationSectionDataSources as SectionDefinition['dataSources'],
});

registerSection({
  id: 'comments',
  name: 'Comments',
  icon: '💬',
  description: 'Comments and additional notes',
  components: withUniversalDocumentsTable('comments', commentsSectionComponents),
  dataSources: commentsSectionDataSources as SectionDefinition['dataSources'],
});

registerSection({
  id: 'footer',
  name: 'Footer',
  icon: '📑',
  description: 'Footer components (text, page numbers)',
  components: withUniversalDocumentsTable('footer', footerSectionComponents),
  dataSources: footerSectionDataSources as SectionDefinition['dataSources'],
});

registerSection({
  id: 'staff',
  name: 'Staff & Training',
  icon: '👤',
  description: 'Training records and staff information',
  components: withUniversalDocumentsTable('staff', staffSectionComponents),
  dataSources: staffSectionDataSources as SectionDefinition['dataSources'],
});

// ─── Public API ─────────────────────────────────────────────────────────────────────────────────

/** All registered sections in registration order (backward-compatible array). */
export const sections: SectionDefinition[] = getAllSections();

/** Lookup a section by ID. */
export function getSectionById(id: string): SectionDefinition | undefined {
  return _getSectionById(id);
}

/** Get all components from a section. */
export function getSectionComponents(sectionId: string) {
  return getSectionById(sectionId)?.components ?? [];
}

/** Get all data sources from a section. */
export function getSectionDataSources(sectionId: string) {
  return getSectionById(sectionId)?.dataSources ?? [];
}

/** Get a component definition by element type within a section. */
export function getComponentDefinition(type: string, sectionId: string) {
  return getSectionById(sectionId)?.components.find((c) => c.type === type);
}

// â”€â”€â”€ Individual section exports (kept for direct imports) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export { headerSectionComponents, headerSectionDataSources } from './HeaderSection';
export { footerSectionComponents, footerSectionDataSources } from './FooterSection';
export { jobInformationSectionComponents, jobInformationSectionDataSources } from './JobInformationSection';
export { serviceInformationSectionComponents, serviceInformationSectionDataSources } from './ServiceInformationSection';
export { equipmentSectionComponents, equipmentSectionDataSources } from './EquipmentSection';
export { spreadsheetSectionComponents, spreadsheetSectionDataSources } from './SpreadsheetSection';
export { workAuthorizationSectionComponents, workAuthorizationSectionDataSources } from './WorkAuthorizationSection';
export { commentsSectionComponents, commentsSectionDataSources } from './CommentsSection';

export type { SectionDefinition, ComponentDefinition } from './types';
