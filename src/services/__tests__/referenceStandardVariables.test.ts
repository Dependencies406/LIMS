import { describe, it, expect } from 'vitest';
import {
  buildStandardVariables,
  toStandardSnapshot,
  equationToStandardSource,
  checkForceInRange,
  checkStandardDueDate,
  STANDARD_VARIABLE_NAMES,
  MAX_COEFFICIENT_INDEX,
  type StandardVariableSource,
} from '../referenceStandardVariables';
import { FORCE_UNIT_TO_NEWTONS, forceUnitToNewtons } from '../forceUnits';
import { evaluateMockup } from '../recorderTemplateMockup';
import { validateExpression } from '../../modules/recorder/formula';
import type { ConversionEquation, EquipmentRecord, RecorderTemplate } from '../../types';

/**
 * The real NIMT coefficients for CAL-FRC-001, from ADR-013's numerical
 * evidence table. coefficients[0] is the constant term (zero for this
 * certificate); A, B, C multiply R, R^2, R^3.
 */
const A = 25.001904548237;
const B = -0.039616880251316;
const C = 0.075709296790966;
const CAL_FRC_001_COEFFICIENTS = [0, A, B, C];

/**
 * A `StandardVariableSource` — the shape `buildStandardVariables` consumes,
 * with coefficients already CANONICAL ASCENDING. Both the live path
 * (`equationToStandardSource`) and a committed snapshot produce this shape.
 */
function standard(overrides: Partial<StandardVariableSource> = {}): StandardVariableSource {
  return {
    coefficients: CAL_FRC_001_COEFFICIENTS,
    outputUnit: 'N',
    ...overrides,
  };
}

/** CAL-FRC-001 as Firestore stores it: index 0 is the HIGHEST degree. */
function equation(overrides: Partial<ConversionEquation> = {}): ConversionEquation {
  return {
    id: 'eq1',
    name: '1-10 N',
    inputUnit: 'mV/V',
    outputUnit: 'N',
    degree: 3,
    coefficients: [C, B, A, 0].map((value) => ({
      value,
      inputMode: 'decimal' as const,
      raw: String(value),
    })),
    divisor: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    ...overrides,
  };
}

function equipment(overrides: Partial<EquipmentRecord> = {}): EquipmentRecord {
  return {
    id: 'CAL-FRC-001',
    name: 'Force transducer',
    category: 'FRC',
    manufacturer: 'm',
    model: 'm',
    serialNumber: 'SN-1',
    location: 'lab',
    status: 'active',
    custodian: 'u1',
    authorizedUsers: [],
    requiresCalibration: true,
    externalProvider: false,
    isReferenceStandard: true,
    registrationDate: '2026-01-01',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    ...overrides,
  } as EquipmentRecord;
}

/**
 * A template whose one formula column performs the ADR-013 D4 conversion,
 * written exactly as the ADR shows it — a custom function taking the
 * coefficients as arguments, so the maths is visible on the page rather than
 * hidden in a builtin.
 */
function conversionTemplate(): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'UTM',
    equipmentTypeId: 'eq1',
    roundCount: 1,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['UTM'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [
      {
        id: 'M', label: 'Measurement', order: 0,
        columns: [
          { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
          { id: 'R', label: 'Reading (mV/V)', order: 1, type: 'number' },
          { id: 'F', label: 'Force (N)', order: 2, type: 'formula', expression: 'force_N(STD_C1, STD_C2, STD_C3, M_R)' },
        ],
      },
    ],
    summaryFields: [],
    customFunctions: [
      { name: 'force_N', params: ['c1', 'c2', 'c3', 'r'], expression: 'c1*r + c2*r**2 + c3*r**3' },
    ],
    status: 'active',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    updatedBy: 'u1',
  } as RecorderTemplate;
}

describe('THE ARITHMETIC — the documented cubic, not the workbook (ADR-013 D1)', () => {
  /**
   * These are the values that proved the workbook wrong.
   *
   * The workbook DOCUMENTS `F = A*R + B*R^2 + C*R^3` but IMPLEMENTS
   * `A*R + B*R^2 + C*R` — a linear third term, which collapses to
   * `(A+C)*R + B*R^2` and drops the cubic entirely.
   *
   * With the real CAL-FRC-001 coefficients:
   *
   *   R      correct cubic     workbook's linear third term    nominal
   *   0.04   1.00002           1.00304                         1 N
   *   0.4    9.99927           10.02471                        10 N
   *
   * The cubic reproduces the nominal calibration points; the workbook's form
   * does not — it reads ~0.30 % high at the bottom of range, roughly six times
   * the standard's own claimed u_cal of 0.047 %. It is exactly zero at R = 1,
   * which is why it survived undetected for years.
   *
   * THIS TEST IS THE REGRESSION GUARD. If someone later "simplifies" the
   * polynomial and these numbers move to 1.00304 / 10.02471, they have
   * reintroduced the defect.
   */
  it('evaluates the full cubic through the real pipeline: ~1.00002 at R=0.04', () => {
    const result = evaluateMockup(
      conversionTemplate(),
      [{ M_STDSEL: 'std1', M_R: 0.04 }],
      {},
      { std1: standard() },
    );

    expect(result.rows[0].M_F.error).toBeUndefined();
    expect(result.rows[0].M_F.value as number).toBeCloseTo(1.00002, 5);
    // The defective form would give 1.00304 — assert we are NOT that.
    expect(result.rows[0].M_F.value as number).not.toBeCloseTo(1.00304, 5);
  });

  it('evaluates the full cubic through the real pipeline: ~9.99927 at R=0.4', () => {
    const result = evaluateMockup(
      conversionTemplate(),
      [{ M_STDSEL: 'std1', M_R: 0.4 }],
      {},
      { std1: standard() },
    );

    expect(result.rows[0].M_F.error).toBeUndefined();
    expect(result.rows[0].M_F.value as number).toBeCloseTo(9.99927, 5);
    // The defective form would give 10.02471.
    expect(result.rows[0].M_F.value as number).not.toBeCloseTo(10.02471, 5);
  });

  it('preserves full precision — no rounding during evaluation (ADR-011, ADR-013 D9)', () => {
    const result = evaluateMockup(
      conversionTemplate(),
      [{ M_STDSEL: 'std1', M_R: 0.04 }],
      {},
      { std1: standard() },
    );
    const value = result.rows[0].M_F.value as number;

    // The workbook hard-codes ROUND(..., 5). We do not: the stored value keeps
    // every digit, and rounding is a display concern only.
    const exact = A * 0.04 + B * 0.04 ** 2 + C * 0.04 ** 3;
    expect(value).toBe(exact);
    expect(value).not.toBe(Number(value.toFixed(5)));
  });
});

describe('buildStandardVariables — the coefficient zero-default (ADR-013 D4)', () => {
  it('exposes stored coefficients at their own index', () => {
    const vars = buildStandardVariables(standard());
    expect(vars.STD_C0).toBe(0);
    expect(vars.STD_C1).toBe(A);
    expect(vars.STD_C2).toBe(B);
    expect(vars.STD_C3).toBe(C);
  });

  it('resolves coefficient slots beyond the stored degree to 0, not to an error', () => {
    const vars = buildStandardVariables(standard());
    // Stored degree is 3; slots 4 and 5 are absent higher terms, which
    // genuinely ARE zero.
    expect(vars.STD_C4).toBe(0);
    expect(vars.STD_C5).toBe(0);
  });

  it('exposes every coefficient slot up to MAX_COEFFICIENT_INDEX even for a degree-1 standard', () => {
    const vars = buildStandardVariables(standard({ coefficients: [0, 2] }));
    for (let i = 0; i <= MAX_COEFFICIENT_INDEX; i += 1) {
      expect(typeof vars[`STD_C${i}`]).toBe('number');
    }
    expect(vars.STD_C1).toBe(2);
    expect(vars.STD_C2).toBe(0);
  });

  it('leaves absent uncertainty contributors NULL, so they still error (the exception must not spread)', () => {
    const vars = buildStandardVariables(standard({ uCal: undefined, uA: undefined, uB: undefined, uC: undefined, resolution: undefined }));
    expect(vars.STD_UCAL).toBeNull();
    expect(vars.STD_UA).toBeNull();
    expect(vars.STD_UB).toBeNull();
    expect(vars.STD_UC).toBeNull();
    expect(vars.STD_RESOLUTION).toBeNull();
  });

  it('passes through uncertainty contributors when the standard has them', () => {
    const vars = buildStandardVariables(standard({ uCal: 0.047, uA: 0.01, uB: 0.02, uC: 0.03, resolution: 0.001 }));
    expect(vars.STD_UCAL).toBe(0.047);
    expect(vars.STD_UA).toBe(0.01);
    expect(vars.STD_UB).toBe(0.02);
    expect(vars.STD_UC).toBe(0.03);
    expect(vars.STD_RESOLUTION).toBe(0.001);
  });

  it('exposes STD_TO_N from the standard output unit', () => {
    expect(buildStandardVariables(standard({ outputUnit: 'kN' })).STD_TO_N).toBe(1000);
    expect(buildStandardVariables(standard({ outputUnit: 'N' })).STD_TO_N).toBe(1);
  });

  it('builds exactly the variable set the validator accepts', () => {
    const vars = buildStandardVariables(standard());
    expect(Object.keys(vars).sort()).toEqual([...STANDARD_VARIABLE_NAMES].sort());
  });
});

describe('the validator accepts exactly the names buildStandardVariables produces', () => {
  // validator.ts deliberately duplicates this list rather than importing from
  // services/ (the formula module depends on nothing outside itself). This
  // test is what keeps the two copies honest.
  const shape = {
    columns: ['M_R'],
    roundCount: 1,
    summaryFieldIds: [],
    customFunctions: [],
  };

  it.each(STANDARD_VARIABLE_NAMES)('%s validates cleanly in a row formula', (name) => {
    const result = validateExpression(`${name} + 1`, { context: 'row', template: shape });
    expect(result.issues).toEqual([]);
  });

  it('rejects a STD_ name that is not in the list', () => {
    const result = validateExpression('STD_NONSENSE + 1', { context: 'row', template: shape });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].message).toContain('not a valid reference standard value');
  });

  it('rejects STD_ in a summary field — it is row-scoped', () => {
    const result = validateExpression('STD_C1', { context: 'summary', template: shape });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].message).toContain('single row');
  });
});

describe('unit normalisation through newtons (ADR-013 D5)', () => {
  it('maps all four units to newtons with a single factor each', () => {
    expect(FORCE_UNIT_TO_NEWTONS.N).toBe(1);
    expect(FORCE_UNIT_TO_NEWTONS.kN).toBe(1000);
    expect(FORCE_UNIT_TO_NEWTONS.kgF).toBe(9.80665);
    expect(FORCE_UNIT_TO_NEWTONS.gF).toBe(0.00980665);
  });

  it('converts in both directions via value * STD_TO_N / UUC_TO_N', () => {
    const convert = (value: number, from: keyof typeof FORCE_UNIT_TO_NEWTONS, to: keyof typeof FORCE_UNIT_TO_NEWTONS) =>
      (value * FORCE_UNIT_TO_NEWTONS[from]) / FORCE_UNIT_TO_NEWTONS[to];

    expect(convert(1, 'kN', 'N')).toBe(1000);
    expect(convert(1000, 'N', 'kN')).toBe(1);
    expect(convert(1, 'kgF', 'N')).toBe(9.80665);
    expect(convert(9.80665, 'N', 'kgF')).toBe(1);
    expect(convert(1, 'gF', 'N')).toBe(0.00980665);
    expect(convert(1, 'kgF', 'gF')).toBeCloseTo(1000, 9);
    expect(convert(1000, 'gF', 'kgF')).toBeCloseTo(1, 12);
  });

  it('round-trips every unit back to itself', () => {
    for (const unit of Object.keys(FORCE_UNIT_TO_NEWTONS) as Array<keyof typeof FORCE_UNIT_TO_NEWTONS>) {
      const newtons = 42 * FORCE_UNIT_TO_NEWTONS[unit];
      expect(newtons / FORCE_UNIT_TO_NEWTONS[unit]).toBeCloseTo(42, 9);
    }
  });

  it('returns null for an unrecognised unit rather than silently assuming newtons', () => {
    expect(forceUnitToNewtons('lbf')).toBeNull();
    expect(forceUnitToNewtons(undefined)).toBeNull();
    expect(forceUnitToNewtons('')).toBeNull();
  });
});

describe('equationToStandardSource — the live re-sourcing (ADR-014 D4)', () => {
  it('converts the stored descending coefficients to canonical ascending', () => {
    expect(equationToStandardSource(equation()).coefficients).toEqual(CAL_FRC_001_COEFFICIENTS);
  });

  it('carries the uncertainty contributors and resolution across', () => {
    const source = equationToStandardSource(
      equation({ uCal: 0.047, uA: 0.1, uB: 0.2, uC: 0.3, resolution: 0.001 }),
    );
    expect(source.uCal).toBe(0.047);
    expect(source.uA).toBe(0.1);
    expect(source.uB).toBe(0.2);
    expect(source.uC).toBe(0.3);
    expect(source.resolution).toBe(0.001);
  });

  it('does NOT read the divisor (ADR-014 D5) — it is absent from the source entirely', () => {
    const source = equationToStandardSource(equation({ divisor: 1000 }));
    expect(source).not.toHaveProperty('divisor');
    // And the coefficients are untouched by it.
    expect(source.coefficients).toEqual(CAL_FRC_001_COEFFICIENTS);
  });
});

describe('toStandardSnapshot (ADR-013 D6, ADR-014 D6)', () => {
  it('copies the fields evaluation and the certificate need', () => {
    const snap = toStandardSnapshot(
      equipment({
        serialNumber: 'SN-1',
        lastCalibrationDate: '2026-01-01',
        nextCalibrationDate: '2027-01-01',
      }),
      equation({ uCal: 0.047 }),
    );

    expect(snap.equipmentId).toBe('CAL-FRC-001');
    expect(snap.equationId).toBe('eq1');
    expect(snap.coefficients).toEqual(CAL_FRC_001_COEFFICIENTS);
    expect(snap.serialNumber).toBe('SN-1');
    expect(snap.uCal).toBe(0.047);
    expect(snap.outputUnit).toBe('N');
    expect(snap.capturedAt).toBeInstanceOf(Date);
    expect(snap.calibrationDate).toEqual(new Date('2026-01-01'));
    expect(snap.dueDate).toEqual(new Date('2027-01-01'));
  });

  it('stores ASCENDING coefficients, never the stored descending form', () => {
    const snap = toStandardSnapshot(equipment(), equation());
    expect(snap.coefficients).toEqual([0, A, B, C]);
    expect(snap.coefficients).not.toEqual([C, B, A, 0]);
    // A reader who reversed these again would invert the polynomial; the point
    // of storing the converted form is that there is nothing left to reverse.
    expect(snap.coefficients[0]).toBe(0);
    expect(snap.coefficients[3]).toBe(C);
  });

  it('does not alias the live equation — mutating it cannot reach the snapshot', () => {
    const live = equation();
    const snap = toStandardSnapshot(equipment(), live);
    live.coefficients[1].value = 999;
    expect(snap.coefficients[2]).toBe(B);
  });

  it('leaves dates undefined when the equipment has none rather than inventing them', () => {
    const snap = toStandardSnapshot(
      equipment({ lastCalibrationDate: undefined, nextCalibrationDate: undefined }),
      equation(),
    );
    expect(snap.calibrationDate).toBeUndefined();
    expect(snap.dueDate).toBeUndefined();
  });
});

describe('warnings — flag the improbable, never block (ADR-013 D3, D6)', () => {
  it('warns when the force is outside the standard range', () => {
    const warning = checkForceInRange({ displayName: 'CAL-FRC-001', rangeMin: 1, rangeMax: 10 }, 50);
    expect(warning?.kind).toBe('range');
  });

  it('is silent when the force is inside the range', () => {
    expect(checkForceInRange({ displayName: 'x', rangeMin: 1, rangeMax: 10 }, 5)).toBeNull();
  });

  it('is silent when the standard declares no numeric range', () => {
    expect(checkForceInRange({ displayName: 'x', rangeMin: undefined, rangeMax: undefined }, 5)).toBeNull();
  });

  it('warns when the standard was out of calibration on the recording date', () => {
    const warning = checkStandardDueDate({ displayName: 'x', dueDate: new Date('2026-01-01') }, new Date('2026-06-01'));
    expect(warning?.kind).toBe('due-date');
  });

  it('is silent when the standard was still in calibration', () => {
    expect(checkStandardDueDate({ displayName: 'x', dueDate: new Date('2027-01-01') }, new Date('2026-06-01'))).toBeNull();
  });
});
