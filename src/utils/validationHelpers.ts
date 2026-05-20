/**
 * Validation Helpers
 * Utilities for validating template structures, formulas, and headers
 */

import type { TemplateSchema, ColumnDefinition, TemplateFormula } from '../types/template';
import { extractCellReferences, isValidFormulaSyntax } from './formulaHelpers';

/**
 * Validate template structure
 * @param template Template to validate
 * @returns Array of error messages (empty if valid)
 */
export function validateTemplate(template: TemplateSchema): string[] {
  const errors: string[] = [];

  // Check name
  if (!template.name || template.name.trim().length === 0) {
    errors.push('Template name is required');
  }

  // Check owner
  if (!template.ownerId || template.ownerId.trim().length === 0) {
    errors.push('Template owner ID is required');
  }

  // Check columns
  if (!template.columns || template.columns.length === 0) {
    errors.push('Template must have at least one column');
  } else {
    // Validate each column
    template.columns.forEach((col, index) => {
      if (!col.id || col.id.trim().length === 0) {
        errors.push(`Column ${index + 1}: ID is required`);
      }
      if (!col.header || col.header.trim().length === 0) {
        errors.push(`Column ${index + 1}: Header is required`);
      }
      if (!['text', 'number', 'date', 'formula', 'dropdown'].includes(col.type)) {
        errors.push(`Column ${index + 1}: Invalid type "${col.type}"`);
      }
      if (col.type === 'formula' && !col.formula) {
        errors.push(`Column ${index + 1}: Formula is required for formula type`);
      }
      if (col.type === 'dropdown' && (!col.options || col.options.length === 0)) {
        errors.push(`Column ${index + 1}: Options are required for dropdown type`);
      }
    });

    // Check for duplicate column IDs
    const columnIds = template.columns.map(c => c.id);
    const duplicates = columnIds.filter((id, index) => columnIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate column IDs found: ${duplicates.join(', ')}`);
    }
  }

  // Validate formulas
  if (template.formulas && template.formulas.length > 0) {
    template.formulas.forEach((formula, index) => {
      if (!formula.cellId || formula.cellId.trim().length === 0) {
        errors.push(`Formula ${index + 1}: Cell ID is required`);
      }
      if (!formula.formula || formula.formula.trim().length === 0) {
        errors.push(`Formula ${index + 1}: Formula expression is required`);
      } else if (!isValidFormulaSyntax(formula.formula)) {
        errors.push(`Formula ${index + 1}: Invalid formula syntax`);
      }
    });
  }

  return errors;
}

/**
 * Validate column headers
 * @param headers Array of header strings
 * @returns Array of error messages (empty if valid)
 */
export function validateHeaders(headers: string[]): string[] {
  const errors: string[] = [];

  if (!headers || headers.length === 0) {
    errors.push('At least one header is required');
    return errors;
  }

  // Check for empty headers
  headers.forEach((header, index) => {
    if (!header || header.trim().length === 0) {
      errors.push(`Header ${index + 1} is empty`);
    }
  });

  // Check for duplicate headers
  const uniqueHeaders = new Set(headers.map(h => h.trim().toLowerCase()));
  if (uniqueHeaders.size !== headers.length) {
    errors.push('Duplicate headers found');
  }

  return errors;
}

/**
 * Validate formula dependencies
 * Checks if all cell references in formulas exist and don't create circular dependencies
 * @param template Template to validate
 * @returns Array of error messages (empty if valid)
 */
export function validateFormulaDependencies(template: TemplateSchema): string[] {
  const errors: string[] = [];

  if (!template.formulas || template.formulas.length === 0) {
    return errors;
  }

  // Build a map of cell IDs to formulas
  const formulaMap = new Map<string, TemplateFormula>();
  template.formulas.forEach(f => {
    formulaMap.set(f.cellId, f);
  });

  // Check for circular dependencies using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const hasCycle = (cellId: string): boolean => {
    if (recursionStack.has(cellId)) {
      return true; // Circular dependency found
    }
    if (visited.has(cellId)) {
      return false; // Already processed
    }

    visited.add(cellId);
    recursionStack.add(cellId);

    const formula = formulaMap.get(cellId);
    if (formula && formula.formula) {
      const references = extractCellReferences(formula.formula);
      for (const ref of references) {
        if (formulaMap.has(ref) && hasCycle(ref)) {
          return true;
        }
      }
    }

    recursionStack.delete(cellId);
    return false;
  };

  // Check each formula for cycles
  template.formulas.forEach((formula, index) => {
    if (hasCycle(formula.cellId)) {
      errors.push(`Formula ${index + 1} (${formula.cellId}): Circular dependency detected`);
    }
  });

  return errors;
}

/**
 * Validate complete template (structure + dependencies)
 * @param template Template to validate
 * @returns Object with isValid flag and array of all errors
 */
export function validateCompleteTemplate(template: TemplateSchema): {
  isValid: boolean;
  errors: string[];
} {
  const errors = [
    ...validateTemplate(template),
    ...validateFormulaDependencies(template),
  ];

  return {
    isValid: errors.length === 0,
    errors,
  };
}

