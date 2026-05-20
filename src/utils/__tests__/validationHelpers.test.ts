/**
 * Validation Helpers Tests
 * Unit tests for validation helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  validateTemplate,
  validateHeaders,
  validateFormulaDependencies,
  validateCompleteTemplate,
} from '../validationHelpers';
import type { TemplateSchema } from '../../types/template';

describe('validationHelpers', () => {
  const validTemplate: TemplateSchema = {
    name: 'Test Template',
    ownerId: 'user123',
    columns: [
      {
        id: 'col1',
        header: 'Column 1',
        type: 'text',
      },
    ],
    isPublic: false,
    version: 1,
  };

  describe('validateTemplate', () => {
    it('should validate a correct template', () => {
      const errors = validateTemplate(validTemplate);
      expect(errors).toHaveLength(0);
    });

    it('should detect missing name', () => {
      const template = { ...validTemplate, name: '' };
      const errors = validateTemplate(template);
      expect(errors).toContain('Template name is required');
    });

    it('should detect missing columns', () => {
      const template = { ...validTemplate, columns: [] };
      const errors = validateTemplate(template);
      expect(errors).toContain('Template must have at least one column');
    });
  });

  describe('validateHeaders', () => {
    it('should validate correct headers', () => {
      const errors = validateHeaders(['Header 1', 'Header 2']);
      expect(errors).toHaveLength(0);
    });

    it('should detect empty headers', () => {
      const errors = validateHeaders(['Header 1', '']);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect duplicate headers', () => {
      const errors = validateHeaders(['Header 1', 'Header 1']);
      expect(errors).toContain('Duplicate headers found');
    });
  });

  describe('validateCompleteTemplate', () => {
    it('should validate complete template', () => {
      const result = validateCompleteTemplate(validTemplate);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});

