import { describe, it, expect } from 'vitest';
import { recalculateRecord } from '../recordRecalculation';
import type { RecorderTemplate } from '../../types';

function baseTemplate(overrides: Partial<RecorderTemplate> = {}): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'UTM Calibration',
    equipmentTypeId: 'eqtype1',
    roundCount: 2,
    defaultRowCount: 3,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['UTM'], separator: '-', includeYear: true, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
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
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  };
}

describe('recalculateRecord', () => {
  it('merges the computed formula value into each row, preserving raw inputs', () => {
    const result = recalculateRecord(baseTemplate(), [{ CAL_NOM: 100, CAL_IND: 100.2 }], []);
    expect(result.computedRows[0]).toEqual({ CAL_NOM: 100, CAL_IND: 100.2, CAL_ERR: expect.closeTo(0.2, 10) });
  });

  it('recomputes the summary fresh from all rows on every call (no stale aggregate)', () => {
    const first = recalculateRecord(
      baseTemplate(),
      [{ CAL_NOM: 100, CAL_IND: 100.2 }, { CAL_NOM: 200, CAL_IND: 199.5 }],
      [],
    );
    expect(first.summary.MAXDEV.value).toBeCloseTo(0.2, 10);

    // Editing one cell that feeds the aggregate (col_max) must move the
    // summary on the very next call — there is no cached/partial state to
    // invalidate, because evaluateMockup always recomputes from scratch.
    const second = recalculateRecord(
      baseTemplate(),
      [{ CAL_NOM: 100, CAL_IND: 100.2 }, { CAL_NOM: 200, CAL_IND: 205 }],
      [],
    );
    expect(second.summary.MAXDEV.value).toBeCloseTo(5, 10);
  });

  it('does not merge a value for a cell that errored (awaiting-input)', () => {
    const result = recalculateRecord(baseTemplate(), [{ CAL_NOM: 100, CAL_IND: null }], []);
    expect(result.computedRows[0]).toEqual({ CAL_NOM: 100, CAL_IND: null });
    expect(result.rowResults[0].CAL_ERR.error?.kind).toBe('awaiting-input');
  });

  it('surfaces invalid-computation errors without merging a bogus value', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [
            { id: 'NOM', label: 'a', order: 0, type: 'number' },
            { id: 'DIV', label: 'b', order: 1, type: 'formula', expression: '1 / CAL_NOM' },
          ],
        },
      ],
      summaryFields: [],
    });
    const result = recalculateRecord(template, [{ CAL_NOM: 0 }], []);
    expect(result.rowResults[0].CAL_DIV.error?.kind).toBe('invalid-computation');
    expect(result.computedRows[0]).toEqual({ CAL_NOM: 0 });
  });

  it('feeds environment rounds into the formula via ENV_TEMP_R{n} / ENV_RH_R{n}', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [
            { id: 'READ', label: 'a', order: 0, type: 'number' },
            { id: 'CORR', label: 'b', order: 1, type: 'formula', expression: 'CAL_READ + ENV_TEMP_R1' },
          ],
        },
      ],
      summaryFields: [],
    });
    const result = recalculateRecord(template, [{ CAL_READ: 100 }], [{ roundIndex: 1, temperatureC: 5, relativeHumidity: 48 }]);
    expect(result.computedRows[0].CAL_CORR).toBe(105);
  });

  it('coerces a boolean formula result to TRUE/FALSE text, matching the grid round-trip', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [
            { id: 'NOM', label: 'a', order: 0, type: 'number' },
            { id: 'PASS', label: 'b', order: 1, type: 'formula', expression: 'CAL_NOM > 0' },
          ],
        },
      ],
      summaryFields: [],
    });
    const result = recalculateRecord(template, [{ CAL_NOM: 5 }], []);
    expect(result.computedRows[0].CAL_PASS).toBe('TRUE');
  });

  it('handles multiple rows independently in the returned computedRows', () => {
    const result = recalculateRecord(
      baseTemplate(),
      [{ CAL_NOM: 100, CAL_IND: 100.2 }, { CAL_NOM: 200, CAL_IND: 199.5 }],
      [],
    );
    expect(result.computedRows).toHaveLength(2);
    expect(result.computedRows[1].CAL_ERR).toBeCloseTo(-0.5, 10);
  });
});
