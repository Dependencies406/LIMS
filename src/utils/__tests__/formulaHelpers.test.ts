/**
 * Formula Helpers Tests
 * Unit tests for formula helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  getColumnLetter,
  getColumnIndex,
  getCellId,
  parseCellId,
  generateAvailableLetters,
  transformTemplateFormula,
  extractCellReferences,
  isValidFormulaSyntax,
} from '../formulaHelpers';

describe('formulaHelpers', () => {
  describe('getColumnLetter', () => {
    it('should convert 0-based index to column letter', () => {
      expect(getColumnLetter(0)).toBe('A');
      expect(getColumnLetter(25)).toBe('Z');
      expect(getColumnLetter(26)).toBe('AA');
      expect(getColumnLetter(27)).toBe('AB');
    });
  });

  describe('getColumnIndex', () => {
    it('should convert column letter to 0-based index', () => {
      expect(getColumnIndex('A')).toBe(0);
      expect(getColumnIndex('Z')).toBe(25);
      expect(getColumnIndex('AA')).toBe(26);
      expect(getColumnIndex('AB')).toBe(27);
    });
  });

  describe('getCellId', () => {
    it('should generate cell ID from row and column', () => {
      expect(getCellId(0, 0)).toBe('A1');
      expect(getCellId(1, 1)).toBe('B2');
      expect(getCellId(0, 25)).toBe('Z1');
    });
  });

  describe('parseCellId', () => {
    it('should parse cell ID to row and column', () => {
      expect(parseCellId('A1')).toEqual({ row: 0, col: 0 });
      expect(parseCellId('B2')).toEqual({ row: 1, col: 1 });
      expect(parseCellId('Z1')).toEqual({ row: 0, col: 25 });
    });
  });

  describe('generateAvailableLetters', () => {
    it('should generate array of column letters', () => {
      expect(generateAvailableLetters(3)).toEqual(['A', 'B', 'C']);
      expect(generateAvailableLetters(26)).toHaveLength(26);
    });
  });

  describe('transformTemplateFormula', () => {
    it('should transform formula with offsets', () => {
      expect(transformTemplateFormula('=A1+B1', 1, 1)).toBe('=B2+C2');
      expect(transformTemplateFormula('=SUM(A1:A10)', 0, 2)).toBe('=SUM(C1:C10)');
    });
  });

  describe('extractCellReferences', () => {
    it('should extract cell references from formula', () => {
      expect(extractCellReferences('=A1+B2')).toEqual(['A1', 'B2']);
      expect(extractCellReferences('=SUM(A1:A10)')).toContain('A1');
    });
  });

  describe('isValidFormulaSyntax', () => {
    it('should validate formula syntax', () => {
      expect(isValidFormulaSyntax('=A1+B1')).toBe(true);
      expect(isValidFormulaSyntax('=SUM(A1:A10)')).toBe(true);
      expect(isValidFormulaSyntax('A1+B1')).toBe(false); // Missing =
      expect(isValidFormulaSyntax('=A1+(')).toBe(false); // Unbalanced
    });
  });
});

