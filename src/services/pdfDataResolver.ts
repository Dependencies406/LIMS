/**
 * PDF Data Resolver Service
 * Resolves data sources to actual values and detects missing data
 */

import type { Job } from '../types';
import type { PdfElement, PdfTemplate } from '../modules/pdf-template-builder/types';
import { getDataSourceDiscovery } from './dataSourceDiscoveryService';

export interface MissingDataReport {
  elementId: string;
  elementType: string;
  elementName: string;
  dataSource: string;
  section: string;
  reason: 'missing' | 'null' | 'empty' | 'invalid';
  expectedType?: string;
}

export interface ResolvedData {
  value: any;
  exists: boolean;
  isNull: boolean;
  isEmpty: boolean;
  isValid: boolean;
}

export class PdfDataResolver {
  /**
   * Resolve a data source path to actual value
   * @param dataSource - Data source path (e.g., 'measurements.data', 'measurements.data[0]')
   * @param job - Job object
   * @param equipmentIndex - Optional equipment index for context-aware resolution
   */
  /**
   * Map laboratory capability assessment stored value to display text
   */
  private mapCapabilityAssessment(value: string | undefined): string {
    if (!value) return '';
    
    const mapping: Record<string, string> = {
      'Full capability': 'Laboratory has FULL capability and resources to perform ALL requested services.',
      'Partial capability': 'Laboratory has PARTIAL capability (specify limitations):',
      'Lacks capability': 'Laboratory lacks capability for the following requested services due to:'
    };
    
    return mapping[value] || value;
  }

  /**
   * Map items condition on receipt stored value to display text
   */
  private mapItemsCondition(value: string | undefined): string {
    if (!value) return '';
    
    const mapping: Record<string, string> = {
      'Acceptable': 'Acceptable - Meets all criteria for calibration,',
      'Damaged or altered': 'Damaged or altered (specify):',
      'Improper storage/transportation conditions': 'Improper storage/transportation conditions (specify).',
      'Insufficient quantity': 'Insufficient quantity for requested tests.',
      'Other issues': 'Other issues (specify):'
    };
    
    return mapping[value] || value;
  }

  resolveDataSource(dataSource: string, job: Job, equipmentIndex?: number): ResolvedData {
    try {
      // Normalize legacy data source keys to the canonical ones.
      // Some existing templates store the company logo key as `company.logoBase64`.
      dataSource = dataSource.trim();
      if (dataSource === 'company.logoBase64') {
        dataSource = 'company.logo';
      }

      // Handle workAuthorization.workAuthorizationStatement with default fallback BEFORE calling getNestedValue
      // This ensures the default is always applied, even during validation
      if (dataSource === 'workAuthorization.workAuthorizationStatement') {
        const defaultStatement = 'I confirm that the information provided is correct and authorize the laboratory to proceed with the requested services according to the laboratory\'s terms and conditions. I understand that any deviations from the request must be communicated and approved before proceeding.';
        
        // Try to get the value from job
        const value = this.getNestedValue(job, dataSource, equipmentIndex);
        
        // If value is empty, missing, or undefined, use default
        const finalValue = (!value || (typeof value === 'string' && value.trim().length === 0))
          ? defaultStatement
          : value;
        
        return {
          value: finalValue,
          exists: true, // Always exists because we provide a default
          isNull: false,
          isEmpty: false, // Never empty because we provide a default
          isValid: true, // Always valid because we provide a default
        };
      }
      
      // Handle laboratory capability assessment - map stored value to display text
      if (dataSource === 'workAuthorization.laboratoryCapabilityAssessment') {
        const value = this.getNestedValue(job, dataSource, equipmentIndex);
        const displayValue = this.mapCapabilityAssessment(value);
        
        return {
          value: displayValue,
          exists: value !== undefined,
          isNull: value === null,
          isEmpty: !displayValue || displayValue.trim().length === 0,
          isValid: value !== undefined && value !== null && displayValue.trim().length > 0,
        };
      }
      
      // Handle items condition on receipt - map stored value to display text
      if (dataSource === 'workAuthorization.itemsConditionOnReceipt') {
        const value = this.getNestedValue(job, dataSource, equipmentIndex);
        const displayValue = this.mapItemsCondition(value);
        
        return {
          value: displayValue,
          exists: value !== undefined,
          isNull: value === null,
          isEmpty: !displayValue || displayValue.trim().length === 0,
          isValid: value !== undefined && value !== null && displayValue.trim().length > 0,
        };
      }

      /** Documents index table: loaded onto prepared jobData as documentIndexItems (not on raw Job). */
      if (dataSource === 'documentIndex.list') {
        const items = (job as any).documentIndexItems;
        if (Array.isArray(items)) {
          return {
            value: items,
            exists: true,
            isNull: false,
            isEmpty: false,
            isValid: true,
          };
        }
        return {
          value: undefined,
          exists: false,
          isNull: false,
          isEmpty: true,
          isValid: false,
        };
      }
      
      const value = this.getNestedValue(job, dataSource, equipmentIndex);
      
      return {
        value,
        exists: value !== undefined,
        isNull: value === null,
        isEmpty: this.isEmpty(value),
        isValid: value !== undefined && value !== null && !this.isEmpty(value),
      };
    } catch (error) {
      console.error('[PDF Data Resolver] Error resolving data source:', dataSource, error);
      return {
        value: undefined,
        exists: false,
        isNull: false,
        isEmpty: true,
        isValid: false,
      };
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string, equipmentIndex?: number): any {
    // Handle measurements.data FIRST (before standard dot notation)
    // This must come before standard dot notation to properly handle the array
    if (path.startsWith('measurements.data')) {
      const result = this.getMeasurementData(obj, path, equipmentIndex);
      if (result !== undefined) return result;
    }

    // Handle array access for equipment
    if (path.startsWith('equipment[') && equipmentIndex !== undefined) {
      const match = path.match(/^equipment\[(\d+)\]\.(.+)$/);
      if (match) {
        const index = parseInt(match[1]);
        const restPath = match[2];
        if (obj.equipment && obj.equipment[index]) {
          return this.getNestedValue(obj.equipment[index], restPath);
        }
      }
    }

    // Handle equipment.list (all equipment)
    if (path === 'equipment.list' && obj.equipment) {
      return obj.equipment;
    }

    // Handle equipment.count
    if (path === 'equipment.count') {
      return obj.equipment?.length || 0;
    }

    // Handle equipment.<field> for the selected/specific equipment (datasheet/certificate per equipment)
    // When equipmentIndex is provided (e.g. "Preview PDF for this equipment"), resolve from that item.
    // When not provided, default to first equipment so single-equipment jobs still work.
    if (path.startsWith('equipment.') && obj.equipment?.length) {
      const index = equipmentIndex !== undefined && equipmentIndex >= 0 && equipmentIndex < obj.equipment.length
        ? equipmentIndex
        : 0;
      const eq = obj.equipment[index];
      if (eq) {
        const field = path.slice('equipment.'.length);
        // Map data source keys to Equipment type property names
        const keyMap: Record<string, string> = {
          serial: 'serialNumber',
          location: 'machineLocation',
        };
        const prop = keyMap[field] ?? field;
        const value = (eq as any)[prop];
        return value !== undefined ? value : (eq as any)[field];
      }
    }

    // Handle certificate.number - read directly from equipment.certificateNumber (authoritative source)
    if (path === 'certificate.number') {
      return this.getCertificateNumberFromEquipment(obj, equipmentIndex);
    }

    // Standard dot notation (for paths like measurements.data, this will access obj.measurements.data)
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }

    // If we got here via standard dot notation and it's measurements.data array,
    // return first element for table rendering
    if (path === 'measurements.data' && Array.isArray(current) && current.length > 0) {
      return current[0]; // Return first spreadsheet data object
    }

    return current;
  }

  /**
   * Get measurement data from equipment spreadsheet
   * Handles both Job objects and prepared jobData objects
   * @param obj - Job or prepared jobData object
   * @param path - Data source path (e.g., 'measurements.data', 'measurements.data[0]')
   * @param equipmentIndex - Optional equipment index for context-aware resolution
   */
  private getMeasurementData(obj: any, path: string, equipmentIndex?: number): any {
    // Extract equipment index if specified in path
    const match = path.match(/measurements\.data(?:\[(\d+)\])?/);
    const pathIndex = match && match[1] ? parseInt(match[1]) : undefined;
    
    // Use path index if specified, otherwise use context equipmentIndex, otherwise try to match dynamically
    const index = pathIndex !== undefined ? pathIndex : (equipmentIndex !== undefined ? equipmentIndex : undefined);
    
    // First, check if measurements.data is already in the prepared data structure
    if (obj.measurements?.data) {
      const measurementsArray = obj.measurements.data;
      
      if (Array.isArray(measurementsArray) && measurementsArray.length > 0) {
        // If index specified (from path or context), return that specific measurement
        if (index !== undefined) {
          if (index >= 0 && index < measurementsArray.length) {
            return measurementsArray[index];
          } else {
            console.warn('[PDF Data Resolver] Index out of bounds:', index, 'array length:', measurementsArray.length);
            return undefined;
          }
        }
        
        // For 'measurements.data' (no index), use smart dynamic matching:
        // - If only one measurement exists, use it
        // - If equipmentIndex is provided from context (user viewing specific equipment), use that
        // - If multiple exist, try to match by equipment name or use first one
        if (measurementsArray.length === 1) {
          return measurementsArray[0];
        } else {
          // Strategy 0: If equipmentIndex is provided from context (user selected specific equipment), use it
          // This is the PRIMARY strategy when user is viewing a specific equipment's spreadsheet
          if (equipmentIndex !== undefined && equipmentIndex >= 0 && equipmentIndex < measurementsArray.length) {
            return measurementsArray[equipmentIndex];
          }
          
          // Try to match by equipment name if available in spreadsheet model
          // This allows dynamic selection based on equipment context
          if (obj.equipment && Array.isArray(obj.equipment)) {
            // Strategy 1: Match by equipment name from spreadsheet model
            for (let i = 0; i < measurementsArray.length; i++) {
              const measurement = measurementsArray[i];
              const spreadsheetModel = measurement?.spreadsheetModel;
              
              if (spreadsheetModel?.equipmentName) {
                // Try exact match first
                let matchingEquipment = obj.equipment.find((eq: any) => 
                  eq.name === spreadsheetModel.equipmentName
                );
                
                // If no exact match, try case-insensitive match
                if (!matchingEquipment) {
                  matchingEquipment = obj.equipment.find((eq: any) => 
                    eq.name?.toLowerCase() === spreadsheetModel.equipmentName?.toLowerCase()
                  );
                }
                
                // If no case-insensitive match, try partial match
                if (!matchingEquipment) {
                  matchingEquipment = obj.equipment.find((eq: any) => 
                    eq.name?.toLowerCase().includes(spreadsheetModel.equipmentName?.toLowerCase()) ||
                    spreadsheetModel.equipmentName?.toLowerCase().includes(eq.name?.toLowerCase())
                  );
                }
                
                if (matchingEquipment) {
                  const eqIndex = obj.equipment.indexOf(matchingEquipment);
                  return measurement;
                }
              }
            }
            
            // Strategy 2: Try to match by index order (measurements.data[0] = equipment[0] with spreadsheet)
            // This assumes the measurements array order matches equipment array order
            // Find which equipment index has spreadsheet data and try to match
            const equipmentWithSpreadsheet = obj.equipment
              .map((eq: any, idx: number) => ({ index: idx, equipment: eq, hasSpreadsheet: !!eq.spreadsheetData }))
              .filter((item: any) => item.hasSpreadsheet);
            
            if (equipmentWithSpreadsheet.length > 0) {
              // If there's only one equipment with spreadsheet, use its corresponding measurement
              if (equipmentWithSpreadsheet.length === 1) {
                const eqIndex = equipmentWithSpreadsheet[0].index;
                if (eqIndex < measurementsArray.length) {
                  return measurementsArray[eqIndex];
                }
              }
              
            }
          }
          
          // If no match found, use first one but warn
          console.warn('[PDF Data Resolver] Multiple measurements found (' + measurementsArray.length + '), using first one (index 0). Context:', {
            equipmentIndexProvided: equipmentIndex !== undefined,
            equipmentIndex,
            availableMeasurements: measurementsArray.map((m: any, i: number) => ({
              index: i,
              equipmentName: m?.spreadsheetModel?.equipmentName || 'unknown'
            }))
          });
          console.warn('[PDF Data Resolver] To use specific equipment, either:');
          console.warn('  1. Use indexed data source: measurements.data[0], measurements.data[1], etc.');
          console.warn('  2. Ensure equipment names match spreadsheet model equipmentName for automatic matching');
          console.warn('  3. Select/view an equipment spreadsheet before generating PDF to provide context');
          return measurementsArray[0];
        }
      } else {
        console.warn('[PDF Data Resolver] measurements.data is empty array');
        return undefined;
      }
    }
    
    // Fallback: check equipment array directly (for Job objects)
    if (obj.equipment && Array.isArray(obj.equipment) && obj.equipment.length > 0) {
      if (index !== undefined) {
        const equipment = obj.equipment[index];
        if (equipment?.spreadsheetData) {
          return equipment.spreadsheetData;
        }
      }
      
      // If no specific index, try to get first equipment with spreadsheet data
      for (const eq of obj.equipment) {
        if (eq.spreadsheetData) {
          return eq.spreadsheetData;
        }
      }
    }
    
    console.warn('[PDF Data Resolver] No measurement data found for path:', path, {
      hasMeasurements: !!obj.measurements,
      measurementsDataLength: obj.measurements?.data?.length || 0,
      hasEquipment: !!obj.equipment,
      equipmentLength: obj.equipment?.length || 0,
      requestedIndex: index,
      equipmentHasSpreadsheet: obj.equipment?.some((eq: any) => eq.spreadsheetData) || false
    });
    
    return undefined;
  }

  /**
   * Get certificate number directly from equipment.certificateNumber (authoritative source)
   * Equipment model is the single source of truth - spreadsheet is display-only
   */
  private getCertificateNumberFromEquipment(obj: any, equipmentIndex?: number): string | undefined {
    try {
      // Read directly from equipment.certificateNumber (authoritative source)
      if (obj.equipment && Array.isArray(obj.equipment)) {
        const index = equipmentIndex !== undefined && equipmentIndex >= 0 && equipmentIndex < obj.equipment.length
          ? equipmentIndex
          : 0;
        
        const equipment = obj.equipment[index];
        if (equipment?.certificateNumber) {
          return equipment.certificateNumber;
        }
      }
      
      // Throw explicit error if missing (as requested)
      if (equipmentIndex !== undefined) {
        throw new Error(`Certificate number not found for equipment at index ${equipmentIndex}`);
      }
      
      return undefined;
    } catch (error) {
      console.error('[PDF Data Resolver] Error reading certificate number from equipment:', error);
      throw error; // Re-throw to surface the error
    }
  }

  /**
   * Check if value is empty
   */
  private isEmpty(value: any): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  /**
   * Validate template against job data
   * Returns list of missing data
   * @param template - PDF template to validate
   * @param job - Job object
   * @param equipmentIndex - Optional equipment index for context-aware validation
   */
  validateTemplate(template: PdfTemplate, job: Job, equipmentIndex?: number): MissingDataReport[] {
    const missing: MissingDataReport[] = [];
    const discovery = getDataSourceDiscovery();

    const elements = template.pages && template.pages.length > 0
      ? template.pages.flatMap(page => page.elements || [])
      : template.elements;

    for (const element of elements) {
      if (!element.dataSource?.key) {
        continue; // Skip elements without data sources
      }

      const dataSource = element.dataSource.key;
      const resolved = this.resolveDataSource(dataSource, job, equipmentIndex);
      const section = discovery.getSectionForDataSource(dataSource) || 'unknown';

      if (!resolved.isValid) {
        let reason: MissingDataReport['reason'] = 'missing';
        if (resolved.isNull) {
          reason = 'null';
        } else if (resolved.isEmpty) {
          reason = 'empty';
        } else if (!resolved.exists) {
          reason = 'missing';
        }

        missing.push({
          elementId: element.id,
          elementType: element.type,
          elementName: this.getElementName(element),
          dataSource,
          section,
          reason,
          expectedType: element.dataSource.type,
        });
      }
    }

    return missing;
  }

  /**
   * Get element name for display
   */
  private getElementName(element: PdfElement): string {
    if (element.type === 'text') {
      const textEl = element as any;
      return textEl.dataSource?.key || 'Text Element';
    }
    if (element.type === 'image') {
      return 'Image';
    }
    if (element.type === 'equipment-table') {
      return 'Equipment Table';
    }
    if (element.type === 'documents-table') {
      return 'Documents Index Table';
    }
    return element.type.charAt(0).toUpperCase() + element.type.slice(1);
  }

  /**
   * Resolve all data sources in template
   * Returns map of element ID to resolved value
   */
  resolveTemplateData(template: PdfTemplate, job: Job): Map<string, any> {
    const resolved = new Map<string, any>();

    for (const element of template.elements) {
      if (element.dataSource?.key) {
        const value = this.resolveDataSource(element.dataSource.key, job);
        resolved.set(element.id, value.value);
      }
    }

    return resolved;
  }

  /**
   * Get missing data grouped by section
   */
  getMissingDataBySection(missing: MissingDataReport[]): Map<string, MissingDataReport[]> {
    const bySection = new Map<string, MissingDataReport[]>();

    for (const report of missing) {
      if (!bySection.has(report.section)) {
        bySection.set(report.section, []);
      }
      bySection.get(report.section)!.push(report);
    }

    return bySection;
  }
}

export const pdfDataResolver = new PdfDataResolver();
