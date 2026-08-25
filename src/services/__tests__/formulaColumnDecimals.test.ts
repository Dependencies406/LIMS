/**
 * formulaColumnDecimals.test.ts
 *
 * Phase 26 Task 1 — tests 1 and 2.
 *
 * A formula column previously had no display-precision control, so every
 * computed value rendered at raw IEEE-754 precision: the owner reported
 * `#####` (TREB overflow) and `-5.42e-15` — subtraction noise that should
 * read as zero — on screen and in the PDF.
 *
 * Test 1 asserts the format is honoured on EVERY render path, through the one
 * shared helper each of them calls.
 * Test 2 is the ADR-011 guard: formatting is DISPLAY ONLY, so the stored
 * value must come out of evaluation byte-identical whether or not the column
 * carries a numberFormat.
 */

import { describe, it, expect } from 'vitest';
import {
  effectiveNumberFormat,
  formatColumnValueForDisplay,
  numberFormatToTrebFormat,
  buildGridDocument,
  DEFAULT_FORMULA_MAX_DECIMALS,
  roundToMaxDecimals,
} from '../recordingGridDocument';
import { formatRecordValueForPdf } from '../pdf-renderers/renderRecordTable';
import { evaluateMockup } from '../recorderTemplateMockup';
import type { RecordColumn, RecorderTemplate } from '../../types';

function column(overrides: Partial<RecordColumn> = {}): RecordColumn {
  return { id: 'ERR', label: 'Error', order: 0, type: 'formula', ...overrides };
}

function template(formulaColumn: Partial<RecordColumn> = {}): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'T',
    equipmentTypeId: 'eq1',
    roundCount: 1,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [
      {
        id: 'CAL',
        label: 'Calibration',
        order: 0,
        columns: [
          { id: 'NOM', label: 'Nominal', order: 0, type: 'number' },
          { id: 'IND', label: 'Indicated', order: 1, type: 'number' },
          { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'CAL_NOM - CAL_IND', ...formulaColumn },
        ],
      },
    ],
    summaryFields: [],
    customFunctions: [],
    status: 'active',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u',
    updatedBy: 'u',
  } as RecorderTemplate;
}

describe('test 1: a formula column honours its decimals on every render path', () => {
  const formatted = column({ numberFormat: { notation: 'fixed', decimals: 2 } });

  it('the shared resolver returns the authored format for a formula column', () => {
    expect(effectiveNumberFormat(formatted)).toEqual({ notation: 'fixed', decimals: 2 });
  });

  it('GRID: the TREB format string is emitted for a formula column, not just a number column', () => {
    const doc = buildGridDocument(template({ numberFormat: { notation: 'fixed', decimals: 2 } }), [{ CAL_NOM: 1, CAL_IND: 2 }]);
    const errColumn = doc.layout.columns.find((c) => c.key === 'CAL_ERR')!;
    const emitted = doc.numberFormats.find((f) => f.columnIndex === errColumn.gridColumnIndex);
    expect(emitted).toBeDefined();
    expect(emitted!.format).toBe(numberFormatToTrebFormat({ notation: 'fixed', decimals: 2 }));
  });

  it('GRID: an UNFORMATTED formula column gets the no-trailing-zeros default mask', () => {
    const doc = buildGridDocument(template(), [{ CAL_NOM: 1, CAL_IND: 2 }]);
    const errColumn = doc.layout.columns.find((c) => c.key === 'CAL_ERR')!;
    const emitted = doc.numberFormats.find((f) => f.columnIndex === errColumn.gridColumnIndex);
    expect(emitted!.format).toBe('0.####');
  });

  it('READ-ONLY VIEW: is the same grid document builder, so the same emission covers it', () => {
    const rows = [{ CAL_NOM: 1, CAL_IND: 2 }];
    const a = buildGridDocument(template({ numberFormat: { notation: 'fixed', decimals: 3 } }), rows);
    const b = buildGridDocument(template({ numberFormat: { notation: 'fixed', decimals: 3 } }), rows);
    expect(a.numberFormats).toEqual(b.numberFormats);
    expect(a.numberFormats.some((f) => f.format === '0.000')).toBe(true);
  });

  it('PDF: formatRecordValueForPdf rounds a formula column, which it previously ignored', () => {
    expect(formatRecordValueForPdf(-5.42e-15, formatted)).toBe('0.00');
    expect(formatRecordValueForPdf(1.23456789, formatted)).toBe('1.23');
  });

  it('HARNESS: formatColumnValueForDisplay is what the test harness renders through', () => {
    expect(formatColumnValueForDisplay(-5.42e-15, formatted)).toBe('0.00');
    expect(formatColumnValueForDisplay(1.23456789, formatted)).toBe('1.23');
  });

  it('scientific notation is honoured too, on both the PDF and harness paths', () => {
    const sci = column({ numberFormat: { notation: 'scientific', decimals: 2 } });
    expect(formatRecordValueForPdf(12345, sci)).toBe('1.23E+4');
    expect(formatColumnValueForDisplay(12345, sci)).toBe('1.23E+4');
  });

  it('the reported float-noise value collapses to zero instead of -5.42e-15', () => {
    expect(formatColumnValueForDisplay(-5.42e-15, column())).toBe('0');
    expect(String(-5.42e-15)).toBe('-5.42e-15');
  });
});

describe('the default for formula columns that never had one', () => {
  it('rounds to AT MOST N decimals rather than to a fixed count', () => {
    expect(DEFAULT_FORMULA_MAX_DECIMALS).toBe(4);
    expect(roundToMaxDecimals(1.23456789)).toBe('1.2346');
  });

  it('leaves an already-clean value byte-identical — the reason a fixed default was rejected', () => {
    // A fixed-4 default rewrote every existing certificate: 50 -> "50.0000".
    expect(formatColumnValueForDisplay(50, column())).toBe('50');
    expect(formatColumnValueForDisplay(0.5, column())).toBe('0.5');
    expect(formatColumnValueForDisplay(-0.2, column())).toBe('-0.2');
    expect(formatColumnValueForDisplay(0, column())).toBe('0');
  });

  it('still fixes both reported defects', () => {
    expect(formatColumnValueForDisplay(-5.42e-15, column())).toBe('0');
    expect(formatColumnValueForDisplay(1.23456789012, column())).toBe('1.2346');
  });

  it('an unformatted NUMBER column is untouched — no fallback of any kind', () => {
    const numberColumn: RecordColumn = { id: 'N', label: 'N', order: 0, type: 'number' };
    expect(effectiveNumberFormat(numberColumn)).toBeNull();
    expect(formatColumnValueForDisplay(1.23456789, numberColumn)).toBe('1.23456789');
  });

  it('text / selection / standard columns take no format at all', () => {
    expect(effectiveNumberFormat({ id: 'T', label: 'T', order: 0, type: 'text' })).toBeNull();
    expect(effectiveNumberFormat({ id: 'S', label: 'S', order: 0, type: 'selection' })).toBeNull();
    expect(effectiveNumberFormat({ id: 'D', label: 'D', order: 0, type: 'standard' })).toBeNull();
  });

  it('a formula column returning TEXT is passed through unrounded, not PASS.0000', () => {
    expect(formatColumnValueForDisplay('PASS', column())).toBe('PASS');
    expect(formatRecordValueForPdf('PASS', column())).toBe('PASS');
  });

  it('an explicit author format always beats the default', () => {
    expect(effectiveNumberFormat(column({ numberFormat: { notation: 'fixed', decimals: 0 } })))
      .toEqual({ notation: 'fixed', decimals: 0 });
  });
});

describe('test 2: formatting is DISPLAY ONLY — the stored value keeps full precision (ADR-011)', () => {
  it('the evaluated value of a formatted column is byte-identical to the unformatted one', () => {
    const rows = [{ CAL_NOM: 0.1, CAL_IND: 0.3 }];
    const env = {};

    const unformatted = evaluateMockup(template(), rows, env);
    const formatted = evaluateMockup(
      template({ numberFormat: { notation: 'fixed', decimals: 2 } }),
      rows,
      env,
    );

    expect(unformatted.rows[0].CAL_ERR.value).toBe(0.1 - 0.3);
    expect(formatted.rows[0].CAL_ERR.value).toBe(unformatted.rows[0].CAL_ERR.value);
    expect(formatted.rows[0].CAL_ERR.value).not.toBe(-0.2);
  });

  it('the displayed string rounds while the stored number does not — both true at once', () => {
    const rows = [{ CAL_NOM: 0.1, CAL_IND: 0.3 }];
    const result = evaluateMockup(template({ numberFormat: { notation: 'fixed', decimals: 2 } }), rows, {});
    const stored = result.rows[0].CAL_ERR.value as number;

    expect(stored).toBe(-0.19999999999999998);
    expect(formatColumnValueForDisplay(stored, column({ numberFormat: { notation: 'fixed', decimals: 2 } }))).toBe('-0.20');
  });

  it('applying the default format does not change what a later formula reads from the column', () => {
    const t = template();
    t.sections[0].columns.push({
      id: 'DBL', label: 'Doubled', order: 3, type: 'formula', expression: 'CAL_ERR * 2',
    });
    const result = evaluateMockup(t, [{ CAL_NOM: 0.1, CAL_IND: 0.3 }], {});
    expect(result.rows[0].CAL_DBL.value).toBe((0.1 - 0.3) * 2);
  });
});
