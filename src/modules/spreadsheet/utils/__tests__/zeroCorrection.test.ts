import { describe, it, expect } from 'vitest';
import type { Cell, ColumnDefinition, SpreadsheetModel } from '../../models/SpreadsheetModel';
import {
  computeRowZeroCorrection,
  resolveZeroCorrectionColumnIndexes,
} from '../zeroCorrection';

function createSpreadsheetForZeroCorrectionTest(
  columnOrder: string[],
  rowData: Record<string, unknown>
): SpreadsheetModel {
  const columnDefinitions = new Map<string, ColumnDefinition>();
  const cells = new Map<string, Cell>();

  columnOrder.forEach((columnName, columnIndex) => {
    columnDefinitions.set(columnName, {
      name: columnName,
      columnValue: columnName,
      type: 'number',
    });

    const value = rowData[columnName];
    if (value !== undefined) {
      const cellId = `${String.fromCharCode(65 + columnIndex)}1`;
      cells.set(cellId, {
        id: cellId,
        row: 0,
        column: columnIndex,
        dataType: 'number',
        displayValue: value === null ? '' : String(value),
        rawValue: value as string | number | boolean | null,
      });
    }
  });

  return {
    id: 'test-sheet',
    name: 'Zero Correction Test',
    version: '1.0',
    status: 'draft',
    createdBy: 'test',
    createdAt: new Date(),
    rowCount: 1,
    columnCount: columnOrder.length,
    cells,
    formulas: new Map(),
    variables: new Map(),
    columnDefinitions,
    columnOrder,
    auditTrail: [],
  };
}

describe('zeroCorrection', () => {
  it('computes standard round-1 correction (100 - 5 = 95)', () => {
    const spreadsheet = createSpreadsheetForZeroCorrectionTest(
      ['round', 'reading_val', 'zero_r1'],
      { round: 1, reading_val: 100, zero_r1: 5 }
    );

    const indexes = resolveZeroCorrectionColumnIndexes(spreadsheet);
    const result = computeRowZeroCorrection(spreadsheet, 0, indexes);

    expect(result).not.toBeNull();
    expect(result?.finalValue).toBe(95);
  });

  it('computes dynamic round correction for round 5 via zero_r5 (100 - 10 = 90)', () => {
    const spreadsheet = createSpreadsheetForZeroCorrectionTest(
      ['round', 'reading_val', 'zero_r5'],
      { round: 5, reading_val: 100, zero_r5: 10 }
    );

    const indexes = resolveZeroCorrectionColumnIndexes(spreadsheet);
    const result = computeRowZeroCorrection(spreadsheet, 0, indexes);

    expect(result).not.toBeNull();
    expect(result?.roundId).toBe(5);
    expect(result?.finalValue).toBe(90);
  });

  it('falls back to generic zero column when specific round zero is missing (100 - 2 = 98)', () => {
    const spreadsheet = createSpreadsheetForZeroCorrectionTest(
      ['round', 'reading_val', 'zero'],
      { round: 2, reading_val: 100, zero: 2 }
    );

    const indexes = resolveZeroCorrectionColumnIndexes(spreadsheet);
    const result = computeRowZeroCorrection(spreadsheet, 0, indexes);

    expect(result).not.toBeNull();
    expect(result?.roundId).toBe(2);
    expect(result?.finalValue).toBe(98);
  });

  it('keeps NaN-safe behavior with invalid reading and null zero (0 - 0 = 0)', () => {
    const spreadsheet = createSpreadsheetForZeroCorrectionTest(
      ['round', 'reading_val', 'zero_r1'],
      { round: 1, reading_val: 'invalid', zero_r1: null }
    );

    const indexes = resolveZeroCorrectionColumnIndexes(spreadsheet);
    const result = computeRowZeroCorrection(spreadsheet, 0, indexes);

    expect(result).not.toBeNull();
    expect(result?.rawValue).toBe(0);
    expect(result?.zeroValue).toBe(0);
    expect(result?.finalValue).toBe(0);
  });
});
