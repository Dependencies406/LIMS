import { describe, it, expect } from 'vitest';
import { evaluateMockup } from '../recorderTemplateMockup';
import type { RecorderTemplate } from '../../types';

function baseTemplate(overrides: Partial<RecorderTemplate> = {}): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'UTM Calibration',
    equipmentTypeId: 'eqtype1',
    roundCount: 2,
    defaultRowCount: 5,
    allowRowAdd: true,
    recordNumberFormat: {
      parts: ['UTM'], separator: '-', includeYear: true, yearDigits: 2, numberPadding: 3, resetPolicy: 'never',
    },
    sections: [
      {
        id: 'CAL', label: 'Calibration', order: 0,
        columns: [
          { id: 'NOM', label: 'Nominal', order: 0, type: 'number' },
          { id: 'IND', label: 'Indicated', order: 1, type: 'number' },
          { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'CAL_IND - CAL_NOM' },
        ],
      },
    ],
    summaryFields: [{ id: 'MAXDEV', label: 'Max Deviation', type: 'number', expression: 'col_max(CAL_ERR)' }],
    customFunctions: [],
    status: 'draft',
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  };
}

describe('evaluateMockup — formula columns', () => {
  it('computes a formula column from raw row data', () => {
    const result = evaluateMockup(
      baseTemplate(),
      [{ CAL_NOM: 100, CAL_IND: 100.2 }],
      {},
    );
    expect(result.rows[0].CAL_ERR.value).toBeCloseTo(0.2, 10);
    expect(result.rows[0].CAL_ERR.error).toBeUndefined();
  });

  it('evaluates multiple rows independently', () => {
    const result = evaluateMockup(
      baseTemplate(),
      [{ CAL_NOM: 100, CAL_IND: 100.2 }, { CAL_NOM: 200, CAL_IND: 199.5 }],
      {},
    );
    expect(result.rows[0].CAL_ERR.value).toBeCloseTo(0.2, 10);
    expect(result.rows[1].CAL_ERR.value).toBeCloseTo(-0.5, 10);
  });

  it('reports awaiting-input when a raw input is missing', () => {
    const result = evaluateMockup(baseTemplate(), [{ CAL_NOM: 100, CAL_IND: null }], {});
    expect(result.rows[0].CAL_ERR.error?.kind).toBe('awaiting-input');
  });

  it('lets one formula column depend on another (dependency order)', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [
            { id: 'NOM', label: 'a', order: 0, type: 'number' },
            { id: 'IND', label: 'b', order: 1, type: 'number' },
            { id: 'ERR', label: 'c', order: 2, type: 'formula', expression: 'CAL_IND - CAL_NOM' },
            { id: 'PCT', label: 'd', order: 3, type: 'formula', expression: 'ROUND(CAL_ERR / CAL_NOM * 100, 3)' },
          ],
        },
      ],
      summaryFields: [],
    });
    const result = evaluateMockup(template, [{ CAL_NOM: 100, CAL_IND: 101 }], {});
    expect(result.rows[0].CAL_ERR.value).toBe(1);
    expect(result.rows[0].CAL_PCT.value).toBe(1);
  });

  it('resolves ENV_* scalars broadcast to every row', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [
            { id: 'READ', label: 'a', order: 0, type: 'number' },
            { id: 'CORR', label: 'b', order: 1, type: 'formula', expression: 'CAL_READ * (1 + 11.5e-6 * (ENV_TEMP_R1 - 20))' },
          ],
        },
      ],
      summaryFields: [],
    });
    const result = evaluateMockup(template, [{ CAL_READ: 100 }], { ENV_TEMP_R1: 25 });
    expect(result.rows[0].CAL_CORR.value).toBeCloseTo(100 * (1 + 11.5e-6 * 5), 10);
  });
});

describe('evaluateMockup — Phase 21 Task 1b: a dependent column names the real cause', () => {
  /** A -> B -> C, where A depends on STD_* and no standard is selected for the row. */
  function chainTemplate(): RecorderTemplate {
    return baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [
            { id: 'STD', label: 'Standard', order: 0, type: 'standard' },
            { id: 'A', label: 'a', order: 1, type: 'formula', expression: 'STD_C1' },
            { id: 'B', label: 'b', order: 2, type: 'formula', expression: 'CAL_A * 2' },
            { id: 'C', label: 'c', order: 3, type: 'formula', expression: 'CAL_B + 1' },
          ],
        },
      ],
      summaryFields: [],
    });
  }

  it('test 4: one message names the real cause (A); B and C say they depend on a value that is not available; nothing claims a real column is unknown', () => {
    const result = evaluateMockup(chainTemplate(), [{ CAL_STD: null }], {});

    expect(result.rows[0].CAL_A.error?.message).toMatch(/no reference standard/i);
    expect(result.rows[0].CAL_B.error?.message).toBe(
      "CAL_B has no value because its dependency 'CAL_A' does not have a value.",
    );
    expect(result.rows[0].CAL_C.error?.message).toBe(
      "CAL_C has no value because its dependency 'CAL_B' does not have a value.",
    );

    for (const cell of [result.rows[0].CAL_A, result.rows[0].CAL_B, result.rows[0].CAL_C]) {
      expect(cell.error?.message.toLowerCase()).not.toContain('is not a known column');
    }
  });

  it('test 5: error kinds are preserved down the chain — awaiting-input stays awaiting-input, never upgraded to invalid-computation', () => {
    const result = evaluateMockup(chainTemplate(), [{ CAL_STD: null }], {});

    expect(result.rows[0].CAL_A.error?.kind).toBe('awaiting-input');
    expect(result.rows[0].CAL_B.error?.kind).toBe('awaiting-input');
    expect(result.rows[0].CAL_C.error?.kind).toBe('awaiting-input');
  });

  it('a genuine invalid-computation fault also propagates its kind unchanged, not downgraded to awaiting-input', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [
            { id: 'A', label: 'a', order: 0, type: 'formula', expression: '1 / 0' },
            { id: 'B', label: 'b', order: 1, type: 'formula', expression: 'CAL_A * 2' },
          ],
        },
      ],
      summaryFields: [],
    });
    const result = evaluateMockup(template, [{}], {});

    expect(result.rows[0].CAL_A.error?.kind).toBe('invalid-computation');
    expect(result.rows[0].CAL_B.error?.kind).toBe('invalid-computation');
    expect(result.rows[0].CAL_B.error?.message).toBe(
      "CAL_B has no value because its dependency 'CAL_A' does not have a value.",
    );
  });

  it('an identifier that is genuinely not a known column (author typo) still reports "is not a known column"', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [{ id: 'A', label: 'a', order: 0, type: 'formula', expression: 'CAL_TYPO' }],
        },
      ],
      summaryFields: [],
    });
    const result = evaluateMockup(template, [{}], {});
    expect(result.rows[0].CAL_A.error?.message).toBe("'CAL_TYPO' is not a known column.");
  });
});

describe('evaluateMockup — summary fields', () => {
  it('computes a summary aggregate over the completed formula column', () => {
    const result = evaluateMockup(
      baseTemplate(),
      [
        { CAL_NOM: 100, CAL_IND: 100.2 },
        { CAL_NOM: 200, CAL_IND: 199.5 },
        { CAL_NOM: 300, CAL_IND: 300.4 },
      ],
      {},
    );
    expect(result.summary.MAXDEV.value).toBeCloseTo(0.4, 10);
  });

  it('reports awaiting-input on the summary when any row is incomplete', () => {
    const result = evaluateMockup(
      baseTemplate(),
      [{ CAL_NOM: 100, CAL_IND: 100.2 }, { CAL_NOM: 200, CAL_IND: null }],
      {},
    );
    expect(result.summary.MAXDEV.error?.kind).toBe('awaiting-input');
  });

  it('lets one summary field reference another (dependency order)', () => {
    const template = baseTemplate({
      summaryFields: [
        { id: 'MAXDEV', label: 'a', type: 'number', expression: 'col_max(CAL_ERR)' },
        { id: 'VERDICT', label: 'b', type: 'text', expression: '"PASS" if SUMMARY_MAXDEV <= 0.5 else "FAIL"' },
      ],
    });
    const result = evaluateMockup(template, [{ CAL_NOM: 100, CAL_IND: 100.2 }], {});
    expect(result.summary.MAXDEV.value).toBeCloseTo(0.2, 10);
    expect(result.summary.VERDICT.value).toBe('PASS');
  });
});

describe('evaluateMockup — custom functions', () => {
  it('calls a custom function from a formula column', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [
            { id: 'NOM', label: 'a', order: 0, type: 'number' },
            { id: 'IND', label: 'b', order: 1, type: 'number' },
            { id: 'ERR', label: 'c', order: 2, type: 'formula', expression: 'error(CAL_NOM, CAL_IND)' },
          ],
        },
      ],
      summaryFields: [],
      customFunctions: [{ name: 'error', params: ['nominal', 'indicated'], expression: 'indicated - nominal' }],
    });
    const result = evaluateMockup(template, [{ CAL_NOM: 100, CAL_IND: 101 }], {});
    expect(result.rows[0].CAL_ERR.value).toBe(1);
  });

  it('does not crash on an invalid custom function body — the calling formula errors instead', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [{ id: 'ERR', label: 'c', order: 0, type: 'formula', expression: 'broken(1)' }],
        },
      ],
      summaryFields: [],
      customFunctions: [{ name: 'broken', params: ['a'], expression: 'a +' }], // syntax error
    });
    const result = evaluateMockup(template, [{}], {});
    expect(result.rows[0].CAL_ERR.error).toBeDefined();
  });
});

describe('evaluateMockup — no rounding during evaluation (ADR-011)', () => {
  it('carries full precision through a formula column', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [
            { id: 'A', label: 'a', order: 0, type: 'number' },
            { id: 'B', label: 'b', order: 1, type: 'formula', expression: 'CAL_A + 0.2' },
          ],
        },
      ],
      summaryFields: [],
    });
    const result = evaluateMockup(template, [{ CAL_A: 0.1 }], {});
    expect(result.rows[0].CAL_B.value).toBe(0.30000000000000004);
  });
});
