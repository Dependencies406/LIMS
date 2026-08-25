/**
 * standardNamespaceIsolation.test.ts
 *
 * ADR-013 D4 grants exactly ONE exception to ADR-010's strict empty
 * semantics: `STD_C0`..`STD_C5` beyond the stored polynomial degree resolve
 * to 0 rather than raising `awaiting-input`.
 *
 * This file exists to prove the exception does not leak. If it ever does,
 * ADR-010's strict semantics are silently weakened everywhere and NOTHING
 * VISIBLY BREAKS — a half-recorded table would quietly compute finished
 * numbers out of empty cells. That is the failure mode this file guards.
 */

import { describe, it, expect } from 'vitest';
import { evaluateMockup } from '../recorderTemplateMockup';
import type { ReferenceStandard, RecorderTemplate } from '../../types';

const STANDARD_A = {
  id: 'stdA',
  displayName: 'Standard A',
  equipmentCode: 'A',
  instrumentName: 'A',
  rangeText: '',
  coefficients: [0, 10],   // F = 10R
  inputUnit: 'mV/V',
  outputUnit: 'N',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'u',
  updatedBy: 'u',
} as ReferenceStandard;

const STANDARD_B = { ...STANDARD_A, id: 'stdB', displayName: 'Standard B', coefficients: [0, 100] }; // F = 100R

function template(overrides: Partial<RecorderTemplate> = {}): RecorderTemplate {
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
        id: 'M', label: 'M', order: 0,
        columns: [
          { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
          { id: 'R', label: 'Reading', order: 1, type: 'number' },
          { id: 'F', label: 'Force', order: 2, type: 'formula', expression: 'STD_C1 * M_R' },
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
    ...overrides,
  } as RecorderTemplate;
}

const STANDARDS = { stdA: STANDARD_A, stdB: STANDARD_B };

describe('THE LEAK TEST — the STD_C* zero-default must not weaken anything else', () => {
  it('an ordinary empty column still raises awaiting-input', () => {
    // M_R is empty. If the exception leaked, this would silently compute 0.
    const result = evaluateMockup(template(), [{ M_STDSEL: 'stdA', M_R: null }], {}, STANDARDS);
    expect(result.rows[0].M_F.error?.kind).toBe('awaiting-input');
    expect(result.rows[0].M_F.value).toBeNull();
  });

  it('an empty ENV_ value still raises awaiting-input', () => {
    const envTemplate = template({
      sections: [
        {
          id: 'M', label: 'M', order: 0,
          columns: [
            { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
            { id: 'R', label: 'Reading', order: 1, type: 'number' },
            { id: 'F', label: 'Force', order: 2, type: 'formula', expression: 'STD_C1 * M_R + ENV_TEMP_R1' },
          ],
        },
      ],
    });
    const result = evaluateMockup(envTemplate, [{ M_STDSEL: 'stdA', M_R: 1 }], { ENV_TEMP_R1: null }, STANDARDS);
    expect(result.rows[0].M_F.error?.kind).toBe('awaiting-input');
  });

  it('STD_UCAL still raises awaiting-input when the standard has no u_cal — it is NOT defaulted to 0', () => {
    const ucalTemplate = template({
      sections: [
        {
          id: 'M', label: 'M', order: 0,
          columns: [
            { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
            { id: 'U', label: 'U', order: 1, type: 'formula', expression: 'STD_UCAL * 2' },
          ],
        },
      ],
    });
    // STANDARD_A has no uCal.
    const result = evaluateMockup(ucalTemplate, [{ M_STDSEL: 'stdA' }], {}, STANDARDS);
    expect(result.rows[0].M_U.error?.kind).toBe('awaiting-input');
    expect(result.rows[0].M_U.value).toBeNull();
  });

  it.each(['STD_UA', 'STD_UB', 'STD_UC', 'STD_RESOLUTION'])(
    '%s also still raises awaiting-input when absent',
    (variable) => {
      const t = template({
        sections: [
          {
            id: 'M', label: 'M', order: 0,
            columns: [
              { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
              { id: 'X', label: 'X', order: 1, type: 'formula', expression: `${variable} * 2` },
            ],
          },
        ],
      });
      const result = evaluateMockup(t, [{ M_STDSEL: 'stdA' }], {}, STANDARDS);
      expect(result.rows[0].M_X.error?.kind).toBe('awaiting-input');
    },
  );

  it('the exception applies ONLY to coefficient slots — STD_C4 is 0 while STD_UCAL errors, on the same row', () => {
    const t = template({
      sections: [
        {
          id: 'M', label: 'M', order: 0,
          columns: [
            { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
            { id: 'HIGH', label: 'High coeff', order: 1, type: 'formula', expression: 'STD_C4 + 1' },
            { id: 'U', label: 'U', order: 2, type: 'formula', expression: 'STD_UCAL + 1' },
          ],
        },
      ],
    });
    const result = evaluateMockup(t, [{ M_STDSEL: 'stdA' }], {}, STANDARDS);

    // Absent higher polynomial term: genuinely zero.
    expect(result.rows[0].M_HIGH.error).toBeUndefined();
    expect(result.rows[0].M_HIGH.value).toBe(1);
    // Absent uncertainty contributor: genuinely missing data.
    expect(result.rows[0].M_U.error?.kind).toBe('awaiting-input');
  });
});

describe('a row with NO standard selected (ADR-013 D4)', () => {
  it.each(['STD_C0', 'STD_C1', 'STD_C4', 'STD_TO_N', 'STD_UCAL', 'STD_RESOLUTION'])(
    '%s raises awaiting-input, coefficient slots included',
    (variable) => {
      const t = template({
        sections: [
          {
            id: 'M', label: 'M', order: 0,
            columns: [
              { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
              { id: 'X', label: 'X', order: 1, type: 'formula', expression: `${variable} + 1` },
            ],
          },
        ],
      });
      // No standard selected on this row.
      const result = evaluateMockup(t, [{ M_STDSEL: null }], {}, STANDARDS);
      expect(result.rows[0].M_X.error?.kind).toBe('awaiting-input');
      expect(result.rows[0].M_X.value).toBeNull();
    },
  );

  it('does NOT silently compute a force of 0 for an unselected row', () => {
    const result = evaluateMockup(template(), [{ M_STDSEL: null, M_R: 5 }], {}, STANDARDS);
    expect(result.rows[0].M_F.error?.kind).toBe('awaiting-input');
    expect(result.rows[0].M_F.value).not.toBe(0);
  });

  it('raises awaiting-input when the row names a standard that was not supplied', () => {
    const result = evaluateMockup(template(), [{ M_STDSEL: 'does-not-exist', M_R: 5 }], {}, STANDARDS);
    expect(result.rows[0].M_F.error?.kind).toBe('awaiting-input');
  });
});

describe('STD_ is ROW-scoped, not broadcast — the point of the phase (ADR-013 D4)', () => {
  it('two rows using DIFFERENT standards each evaluate with their own coefficients', () => {
    const result = evaluateMockup(
      template(),
      [
        { M_STDSEL: 'stdA', M_R: 2 }, // F = 10 * 2  = 20
        { M_STDSEL: 'stdB', M_R: 2 }, // F = 100 * 2 = 200
      ],
      {},
      STANDARDS,
    );

    expect(result.rows[0].M_F.error).toBeUndefined();
    expect(result.rows[1].M_F.error).toBeUndefined();
    expect(result.rows[0].M_F.value).toBe(20);
    expect(result.rows[1].M_F.value).toBe(200);
    // Same reading, different standard, different force — if STD_ were
    // broadcast like ENV_, both rows would show the same number.
    expect(result.rows[0].M_F.value).not.toBe(result.rows[1].M_F.value);
  });

  it('one incomplete row does not poison a complete row using a different standard', () => {
    const result = evaluateMockup(
      template(),
      [
        { M_STDSEL: null, M_R: 2 },   // no standard yet
        { M_STDSEL: 'stdB', M_R: 3 }, // F = 300
      ],
      {},
      STANDARDS,
    );

    expect(result.rows[0].M_F.error?.kind).toBe('awaiting-input');
    expect(result.rows[1].M_F.error).toBeUndefined();
    expect(result.rows[1].M_F.value).toBe(300);
  });

  it('rows sharing one standard agree, and differ only by their own readings', () => {
    const result = evaluateMockup(
      template(),
      [
        { M_STDSEL: 'stdA', M_R: 1 },
        { M_STDSEL: 'stdA', M_R: 2 },
      ],
      {},
      STANDARDS,
    );
    expect(result.rows[0].M_F.value).toBe(10);
    expect(result.rows[1].M_F.value).toBe(20);
  });
});

describe('STD_ name resolution errors', () => {
  it('an unknown STD_ variable is invalid-computation, not awaiting-input', () => {
    const t = template({
      sections: [
        {
          id: 'M', label: 'M', order: 0,
          columns: [
            { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
            { id: 'X', label: 'X', order: 1, type: 'formula', expression: 'STD_NONSENSE + 1' },
          ],
        },
      ],
    });
    const result = evaluateMockup(t, [{ M_STDSEL: 'stdA' }], {}, STANDARDS);
    expect(result.rows[0].M_X.error?.kind).toBe('invalid-computation');
  });
});
