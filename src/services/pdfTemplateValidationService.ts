/**
 * PDF Template Validation Service
 * Zod validation + saving validation reports
 * TODO: Full implementation with validation report storage
 */

import { validateCompleteTemplate } from '../utils/validationHelpers';
import type { TemplateSchema } from '../types/template';

export interface ValidationReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  timestamp: Date;
}

export class PdfTemplateValidationService {
  /**
   * Validate a template and return a report
   */
  validateTemplate(template: TemplateSchema): ValidationReport {
    const result = validateCompleteTemplate(template);
    const warnings: string[] = [];

    // Add warnings for common issues
    if (template.columns.length === 0) {
      warnings.push('Template has no columns');
    }

    if (template.formulas && template.formulas.length > 0) {
      const formulaErrors = template.formulas.filter(f => !f.formula || f.formula.trim().length === 0);
      if (formulaErrors.length > 0) {
        warnings.push(`${formulaErrors.length} formula(s) are empty`);
      }
    }

    return {
      isValid: result.isValid,
      errors: result.errors,
      warnings,
      timestamp: new Date(),
    };
  }

  /**
   * Save validation report (TODO: implement Firestore storage)
   */
  async saveValidationReport(
    templateId: string,
    report: ValidationReport
  ): Promise<void> {
    // TODO: Implement Firestore storage for validation reports
  }
}

export const pdfTemplateValidationService = new PdfTemplateValidationService();

