/**
 * unitScaling.test.ts
 *
 * ADR-014 D5: unit scaling is DERIVED at evaluation time from the standard's
 * output unit and the record's reporting unit —
 *
 *     force_in_report_unit = polynomial(R) * STD_TO_N / REPORT_TO_N
 *
 * — and the stored `ConversionEquation.divisor` is NOT part of that path.
 * Applying both would scale twice and put every force out by three orders of
 * magnitude, which is the specific accident this file exists to prevent.
 */

import { describe, it, expect } from 'vitest';
import { evaluateMockup, type StandardsById } from '../recorderTemplateMockup';
import { environmentToEnvMap } from '../recordEnvironment';
import { equationToStandardSource } from '../referenceStandardVariables';
import { checkDivisorAgreement } from '../referenceStandardVariables';
import type { ConversionEquation, RecorderTemplate } from '../../types';

/** F = 10·R exactly, so the arithmetic below is easy to read. */
function equation(overrides: Partial<ConversionEquation> = {}): ConversionEquation {
  return {
    id: 'eq1',
    name: 'range-1',
    inputUnit: 'mV/V',
    outputUnit: 'N',
    degree: 1,
    // Stored DESCENDING: [coefficient of R, constant].
    coefficients: [
      { value: 10, inputMode: 'decimal', raw: '10' },
      { value: 0, inputMode: 'decimal', raw: '0' },
    ],
    divisor: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u',
    ...overrides,
  };
}

/**
 * The conversion written exactly as ADR-014 D5 states it, in the template —
 * visible on the page rather than hidden in a builtin.
 */
function template(): RecorderTemplate {
  return {
    id: 'tpl',
    name: 'T',
    equipmentTypeId: 'eq',
    roundCount: 1,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: {
      parts: ['T'], separator: '-', includeYear: false,
      yearDigits: 2, numberPadding: 3, resetPolicy: 'never',
    },
    sections: [
      {
        id: 'M', label: 'M', order: 0,
        columns: [
          { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
          { id: 'R', label: 'Reading', order: 1, type: 'number' },
          {
            id: 'F', label: 'Force', order: 2, type: 'formula',
            expression: 'STD_C1 * M_R * STD_TO_N / REPORT_TO_N',
          },
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

/** Evaluates one row: reading R, standard in `standardUnit`, reporting in `reportUnit`. */
function forceFor(standardUnit: string, reportUnit: string | null, r = 2, eq = equation()) {
  const standards: StandardsById = {
    key1: equationToStandardSource({ ...eq, outputUnit: standardUnit }),
  };
  const env = environmentToEnvMap([], reportUnit);
  const result = evaluateMockup(template(), [{ M_STDSEL: 'key1', M_R: r }], env, standards);
  return result.rows[0].M_F;
}

describe('unit scaling across N / kN / kgF / gF, both directions (ADR-014 D5)', () => {
  // Raw polynomial at R = 2 is 10 * 2 = 20, in the standard's own unit.

  it('same unit in and out is the identity', () => {
    expect(forceFor('N', 'N').value).toBeCloseTo(20, 10);
    expect(forceFor('kN', 'kN').value).toBeCloseTo(20, 10);
  });

  it('scales DOWN when reporting in a larger unit (N standard → kN report)', () => {
    // 20 N = 0.02 kN
    expect(forceFor('N', 'kN').value).toBeCloseTo(0.02, 10);
  });

  it('scales UP when reporting in a smaller unit (kN standard → N report)', () => {
    // 20 kN = 20000 N
    expect(forceFor('kN', 'N').value).toBeCloseTo(20000, 10);
  });

  it('handles kgF in both directions using g = 9.80665 exactly', () => {
    // 20 kgF = 196.133 N
    expect(forceFor('kgF', 'N').value).toBeCloseTo(20 * 9.80665, 10);
    // 20 N = 2.0394... kgF
    expect(forceFor('N', 'kgF').value).toBeCloseTo(20 / 9.80665, 10);
  });

  it('kN standard reported in kgF resolves the Phase 15 verified-fact number: 10 kN → ~1019.716 kgF, not 10, not 10000', () => {
    // Coefficient is 10, so R=1 gives a raw reading of 10 kN in the standard's own unit.
    const result = forceFor('kN', 'kgF', 1);
    expect(result.value).toBeCloseTo(10000 / 9.80665, 9);
    expect(result.value).toBeCloseTo(1019.716212978, 6);
    expect(result.value).not.toBeCloseTo(10, 1);
    expect(result.value).not.toBeCloseTo(10000, 1);
  });

  it('handles gF in both directions', () => {
    expect(forceFor('gF', 'N').value).toBeCloseTo(20 * 0.00980665, 10);
    expect(forceFor('N', 'gF').value).toBeCloseTo(20 / 0.00980665, 10);
  });

  it('round-trips: kgF → N → kgF returns the original magnitude', () => {
    const toN = forceFor('kgF', 'N').value as number;
    // Feeding that back as a standard reading in N, reported in kgF.
    expect(toN / 9.80665).toBeCloseTo(20, 10);
  });

  it('preserves full precision — no rounding during evaluation (ADR-011, D9)', () => {
    const value = forceFor('kgF', 'N').value as number;
    // 20 * 9.80665 = 196.13300000000001 in IEEE754; an implementation that
    // rounded to 5dp (as the workbook did) would give exactly 196.133.
    expect(value).toBe(20 * 9.80665);
  });
});

describe('the stored divisor is NOT applied in the recorder path (ADR-014 D5)', () => {
  it('a divisor of 1000 does not change the result', () => {
    const withDivisor = forceFor('N', 'N', 2, equation({ divisor: 1000 }));
    const withoutDivisor = forceFor('N', 'N', 2, equation({ divisor: 1 }));

    expect(withDivisor.value).toBeCloseTo(20, 10);
    expect(withDivisor.value).toEqual(withoutDivisor.value);
    // Had it been applied, this would be 0.02 — the ~1000x error D5 names.
    expect(withDivisor.value).not.toBeCloseTo(0.02, 10);
  });

  it('a divisor of 1000 combined with a kN report unit still scales only once', () => {
    // Correct: 20 N -> 0.02 kN. Double-scaled would be 0.00002.
    const value = forceFor('N', 'kN', 2, equation({ divisor: 1000 })).value as number;
    expect(value).toBeCloseTo(0.02, 12);
    expect(value).not.toBeCloseTo(0.00002, 12);
  });

  it('equationToStandardSource does not carry the divisor forward at all', () => {
    expect(equationToStandardSource(equation({ divisor: 1000 }))).not.toHaveProperty('divisor');
  });
});

describe('checkDivisorAgreement — surfacing the bad data instead of honouring it', () => {
  it('is silent for the consistent case, divisor = 1', () => {
    expect(checkDivisorAgreement(equation({ divisor: 1 }))).toBeNull();
  });

  it('warns when a divisor disagrees with the output unit, naming the factor', () => {
    const warning = checkDivisorAgreement(equation({ divisor: 1000 }));
    expect(warning).not.toBeNull();
    expect(warning!.kind).toBe('unit');
    expect(warning!.message).toContain('1000');
    expect(warning!.message).toContain('N');
  });
});

describe('REPORT_TO_N is required for the conversion to resolve', () => {
  it('a record with no reporting unit leaves the force awaiting-input, not defaulted', () => {
    const result = forceFor('N', null);
    expect(result.error?.kind).toBe('awaiting-input');
    expect(result.value).toBeNull();
  });

  it('a reporting unit outside the newton table also raises awaiting-input', () => {
    expect(forceFor('N', 'kg').error?.kind).toBe('awaiting-input');
  });

  it('a standard whose OUTPUT unit is unknown raises awaiting-input too', () => {
    expect(forceFor('kg', 'N').error?.kind).toBe('awaiting-input');
  });
});
