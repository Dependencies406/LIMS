/**
 * Data Source Discovery Service
 * Discovers available data sources for PDF template generation
 */

import type { DataSourceItem } from '../modules/pdf-template-builder/types';
import { sections } from '../modules/pdf-template-builder/components/sections';

class DataSourceDiscovery {
  private dataSources: Map<string, DataSourceItem> = new Map();
  /** Maps data source key to one-or-more section IDs where it is declared. */
  private sectionMap: Map<string, Set<string>> = new Map();

  constructor() {
    this.initializeDataSources();
  }

  private initializeDataSources(): void {
    // ── Boolean / checkbox-compatible fields ─────────────────────────────────
    // Registered first (before section loop) so type: 'boolean' is guaranteed
    // even if a section cast previously coerced the type to 'text'.
    const booleanFields: DataSourceItem[] = [
      { key: 'service.statementOfConformityRequired',    label: 'Statement of Conformity: Required',     description: 'Checked when the customer selected "Required" for Statement of Conformity',     category: 'Form Controls', type: 'boolean' },
      { key: 'service.statementOfConformityNotRequired', label: 'Statement of Conformity: Not Required',  description: 'Checked when the customer selected "Not required" for Statement of Conformity',  category: 'Form Controls', type: 'boolean' },
      { key: 'workAuthorization.itemConditionGood',                                      label: 'Item Condition: Good',                          description: 'Checked when items are in good condition on receipt',                                     category: 'Form Controls', type: 'boolean' },
      { key: 'workAuthorization.itemConditionDamaged',                                   label: 'Item Condition: Damaged',                       description: 'Checked when items are damaged on receipt',                                               category: 'Form Controls', type: 'boolean' },
      { key: 'workAuthorization.itemConditionDirty',                                     label: 'Item Condition: Dirty',                         description: 'Checked when items are dirty / improperly stored on receipt',                             category: 'Form Controls', type: 'boolean' },
      { key: 'workAuthorization.preWorkChecklist.capabilityResourcesAvailable',          label: 'Pre-Work: Capability & Resources Available',    description: 'Checked when lab has capability and resources to perform the service',                    category: 'Form Controls', type: 'boolean' },
      { key: 'workAuthorization.preWorkChecklist.methodAppropriateValidatedUpToDate',    label: 'Pre-Work: Method Appropriate, Validated & Up-to-Date', description: 'Checked when calibration method is appropriate, validated and current',             category: 'Form Controls', type: 'boolean' },
      { key: 'workAuthorization.preWorkChecklist.equipmentConditionChecked',             label: 'Pre-Work: Equipment Condition Checked',         description: 'Checked when equipment condition has been inspected before work begins',                 category: 'Form Controls', type: 'boolean' },
      { key: 'workAuthorization.preWorkChecklist.customerRequirementsUnderstood',        label: 'Pre-Work: Customer Requirements Understood',    description: 'Checked when customer requirements have been reviewed and understood',                    category: 'Form Controls', type: 'boolean' },
    ];
    for (const item of booleanFields) {
      this.dataSources.set(item.key, item); // force-set so type is always 'boolean'
    }

    // Initialize from section definitions
    sections.forEach(section => {
      section.dataSources.forEach(ds => {
        this.addSectionDataSource(section.id, {
          key: ds.key,
          label: ds.label,
          description: `From ${section.name} section`,
          category: ds.category,
          type: ds.type,
        });
      });
    });
    
    // Legacy data sources (for backward compatibility)
    // Certificate metadata
    this.addLegacyDataSource({
      key: 'certificate.title',
      label: 'Certificate Title',
      description: 'Certificate title',
      category: 'Certificate',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'certificate.number',
      label: 'Certificate Number',
      description: 'Certificate number/ID',
      category: 'Certificate',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'certificate.date',
      label: 'Certificate Date (Calibration Date)',
      description: 'Certificate issue date — resolves to the selected equipment calibration date',
      category: 'Certificate',
      type: 'date',
    });
    this.addLegacyDataSource({
      key: 'certificate.valid_until',
      label: 'Valid Until',
      description: 'Certificate expiry date (not currently mapped to job data)',
      category: 'Certificate',
      type: 'date',
    });

    // Equipment information
    this.addLegacyDataSource({
      key: 'equipment.name',
      label: 'Equipment Name',
      description: 'Equipment name',
      category: 'Equipment',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'equipment.manufacturer',
      label: 'Manufacturer',
      description: 'Equipment manufacturer',
      category: 'Equipment',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'equipment.model',
      label: 'Model',
      description: 'Equipment model number',
      category: 'Equipment',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'equipment.serial',
      label: 'Serial Number',
      description: 'Equipment serial number',
      category: 'Equipment',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'equipment.location',
      label: 'Location',
      description: 'Equipment location',
      category: 'Equipment',
      type: 'text',
    });

    // Job information
    this.addLegacyDataSource({
      key: 'job.id',
      label: 'Job ID',
      description: 'Job ID',
      category: 'Job',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'job.title',
      label: 'Job Title',
      description: 'Job title/name',
      category: 'Job',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'job.customer',
      label: 'Customer',
      description: 'Customer name',
      category: 'Job',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'job.date',
      label: 'Job Date (Received)',
      description: 'Job received date (when job was received)',
      category: 'Job',
      type: 'date',
    });
    this.addLegacyDataSource({
      key: 'job.startDate',
      label: 'Start Date',
      description: 'Date the job work was started',
      category: 'Job',
      type: 'date',
    });
    this.addLegacyDataSource({
      key: 'job.completedDate',
      label: 'Completion Date',
      description: 'Date the job was completed',
      category: 'Job',
      type: 'date',
    });
    this.addLegacyDataSource({
      key: 'job.expectedFinishDate',
      label: 'Expected Finish Date',
      description: 'Expected date for the job to be finished',
      category: 'Job',
      type: 'date',
    });
    this.addLegacyDataSource({
      key: 'job.status',
      label: 'Job Status',
      description: 'Job status',
      category: 'Job',
      type: 'text',
    });

    // Customer information
    this.addLegacyDataSource({
      key: 'customer.name',
      label: 'Customer Name',
      description: 'Customer company name',
      category: 'Customer',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'customer.address',
      label: 'Customer Address',
      description: 'Customer address',
      category: 'Customer',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'customer.contact_person',
      label: 'Contact Person',
      description: 'Contact person name',
      category: 'Customer',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'customer.phone',
      label: 'Phone',
      description: 'Customer phone number',
      category: 'Customer',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'customer.email',
      label: 'Email',
      description: 'Customer email',
      category: 'Customer',
      type: 'text',
    });

    // Measurement/Spreadsheet data
    this.addLegacyDataSource({
      key: 'measurements.title',
      label: 'Measurements Title',
      description: 'Measurements section title',
      category: 'Measurements',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'measurements.summary',
      label: 'Measurements Summary',
      description: 'Summary of measurement results',
      category: 'Measurements',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'measurements.data',
      label: 'Measurements Data (First Equipment)',
      description: 'Measurement data from first equipment with spreadsheet data. Use measurements.data[0], measurements.data[1], etc. for specific equipment.',
      category: 'Measurements',
      type: 'text',
    });
    // Add indexed versions for up to 10 equipment items
    for (let i = 0; i < 10; i++) {
      this.addLegacyDataSource({
        key: `measurements.data[${i}]`,
        label: `Measurements Data (Equipment ${i + 1})`,
        description: `Measurement data from equipment at index ${i}`,
        category: 'Measurements',
        type: 'text',
      });
    }
    this.addLegacyDataSource({
      key: 'measurements.pass_fail',
      label: 'Pass/Fail Status',
      description: 'Overall pass/fail status',
      category: 'Measurements',
      type: 'text',
    });

    // Signature/Approval information
    this.addLegacyDataSource({
      key: 'signature.name',
      label: 'Signatory Name',
      description: 'Signatory name',
      category: 'Signature',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'signature.title',
      label: 'Signatory Title',
      description: 'Signatory title/position',
      category: 'Signature',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'signature.date',
      label: 'Signature Date (Staff)',
      description: 'Staff signature date — resolves to workAuthorization.staffSignature.signedDate',
      category: 'Signature',
      type: 'date',
    });

    // Company/Lab information (from Settings module)
    this.addLegacyDataSource({
      key: 'company.name',
      label: 'Company Name',
      description: 'Company name from settings',
      category: 'Company',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'company.address',
      label: 'Company Address',
      description: 'Formatted company address from settings',
      category: 'Company',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'company.phone',
      label: 'Company Phone',
      description: 'Company phone number from settings',
      category: 'Company',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'company.email',
      label: 'Company Email',
      description: 'Company email address from settings',
      category: 'Company',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'company.website',
      label: 'Company Website',
      description: 'Company website URL from settings',
      category: 'Company',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'company.fax',
      label: 'Company Fax',
      description: 'Company fax number from settings',
      category: 'Company',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'company.logo',
      label: 'Company Logo',
      description: 'Company logo image URL from settings',
      category: 'Company',
      type: 'image',
    });
    // Backward-compatible alias for legacy templates.
    // Some saved templates used `company.logoBase64` as the data source key.
    this.addLegacyDataSource({
      key: 'company.logoBase64',
      label: 'Company Logo (Legacy)',
      description: 'Company logo (legacy key) from settings',
      category: 'Company',
      type: 'image',
    });
    // Additional company info (non-sensitive)
    this.addLegacyDataSource({
      key: 'company.taxId',
      label: 'Company Tax ID',
      description: 'Company tax identification number from settings',
      category: 'Company',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'company.registrationNumber',
      label: 'Company Registration Number',
      description: 'Company registration number from settings',
      category: 'Company',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'company.businessLicense',
      label: 'Company Business License',
      description: 'Company business license number from settings',
      category: 'Company',
      type: 'text',
    });

    // Footer/Legal information
    this.addLegacyDataSource({
      key: 'footer.text',
      label: 'Footer Text',
      description: 'Footer text',
      category: 'Footer',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'footer.page_number',
      label: 'Page Number',
      description: 'Current page number',
      category: 'Footer',
      type: 'number',
    });
    this.addLegacyDataSource({
      key: 'footer.total_pages',
      label: 'Total Pages',
      description: 'Total number of pages',
      category: 'Footer',
      type: 'number',
    });

    // Friendly aliases for page counter elements
    this.addLegacyDataSource({
      key: 'page.counter',
      label: 'Page Counter (X of Y)',
      description: 'Renders "Page X of Y" — use this for a page number element on the canvas',
      category: 'Footer',
      type: 'text',
    });
    this.addLegacyDataSource({
      key: 'page.current',
      label: 'Current Page Number',
      description: 'The current page number (e.g. 1, 2, 3…)',
      category: 'Footer',
      type: 'number',
    });
    this.addLegacyDataSource({
      key: 'page.total',
      label: 'Total Pages',
      description: 'Total number of pages in the document',
      category: 'Footer',
      type: 'number',
    });
  }

  private addSectionDataSource(sectionId: string, item: DataSourceItem): void {
    this.addOrWarnOnConflict(item, 'section');
    this.addSectionMapping(sectionId, item.key);
  }

  private addLegacyDataSource(item: DataSourceItem): void {
    // Legacy keys should never override section-declared keys; that leads to confusing UI behavior.
    if (this.dataSources.has(item.key)) return;
    this.addOrWarnOnConflict(item, 'legacy');
  }

  private addSectionMapping(sectionId: string, key: string): void {
    const set = this.sectionMap.get(key) ?? new Set<string>();
    set.add(sectionId);
    this.sectionMap.set(key, set);
  }

  private addOrWarnOnConflict(item: DataSourceItem, source: 'section' | 'legacy'): void {
    const existing = this.dataSources.get(item.key);
    if (existing) {
      const conflict =
        existing.label !== item.label ||
        existing.type !== item.type ||
        existing.category !== item.category;
      if (conflict) {
        // Keep the first-seen definition, but surface the problem so it can be corrected.
        console.warn('[DataSourceDiscovery] Conflicting data source definition; keeping first', {
          key: item.key,
          existing,
          incoming: item,
          source,
        });
      }
      return;
    }
    this.dataSources.set(item.key, item);
  }

  /**
   * Get all data sources
   */
  getAllDataSources(): DataSourceItem[] {
    return Array.from(this.dataSources.values());
  }

  /**
   * Get data sources by category
   */
  getDataSourcesByCategory(): Map<string, DataSourceItem[]> {
    const byCategory = new Map<string, DataSourceItem[]>();
    
    for (const item of this.dataSources.values()) {
      if (!byCategory.has(item.category)) {
        byCategory.set(item.category, []);
      }
      byCategory.get(item.category)!.push(item);
    }
    
    // Sort within each category
    for (const items of byCategory.values()) {
      items.sort((a, b) => a.label.localeCompare(b.label));
    }
    
    return byCategory;
  }

  /**
   * Get data source by key
   */
  getDataSource(key: string): DataSourceItem | undefined {
    return this.dataSources.get(key);
  }

  /**
   * Search data sources
   */
  searchDataSources(query: string): DataSourceItem[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.dataSources.values()).filter(item =>
      item.key.toLowerCase().includes(lowerQuery) ||
      item.label.toLowerCase().includes(lowerQuery) ||
      item.description?.toLowerCase().includes(lowerQuery) ||
      item.category.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const item of this.dataSources.values()) {
      categories.add(item.category);
    }
    return Array.from(categories).sort();
  }

  /**
   * Get section ID for a data source (back-compat).
   * Note: a data source key may be declared in multiple sections (e.g. page number).
   */
  getSectionForDataSource(key: string): string | undefined {
    return this.sectionMap.get(key)?.values().next().value;
  }

  /**
   * Get all section IDs for a data source key.
   */
  getSectionsForDataSource(key: string): string[] {
    return Array.from(this.sectionMap.get(key) ?? []);
  }

  /**
   * Get data sources by section
   */
  getDataSourcesBySection(): Map<string, DataSourceItem[]> {
    const bySection = new Map<string, DataSourceItem[]>();
    
    for (const item of this.dataSources.values()) {
      const sectionId = this.sectionMap.get(item.key);
      if (sectionId) {
        if (!bySection.has(sectionId)) {
          bySection.set(sectionId, []);
        }
        bySection.get(sectionId)!.push(item);
      }
    }
    
    return bySection;
  }

  /**
   * Get section information
   */
  getSections() {
    return sections.map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      description: s.description,
      dataSourceCount: s.dataSources.length,
      componentCount: s.components.length,
    }));
  }
}

// Singleton instance
let discoveryInstance: DataSourceDiscovery | null = null;

export function getDataSourceDiscovery(): DataSourceDiscovery {
  if (!discoveryInstance) {
    discoveryInstance = new DataSourceDiscovery();
  }
  return discoveryInstance;
}

/** Force-reset the singleton (used by HMR and tests). */
export function resetDiscovery(): void {
  discoveryInstance = null;
}

// Vite HMR: reset the singleton whenever this module or any section module is reloaded,
// so the next getDataSourceDiscovery() call picks up updated section data sources.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    resetDiscovery();
  });
}

