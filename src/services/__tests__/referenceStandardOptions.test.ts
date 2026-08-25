/**
 * referenceStandardOptions.test.ts
 *
 * ADR-014 Phase 13: proves the DRAFTING data path end-to-end, through the
 * REAL production functions (`loadStandardOptions`, `optionsToStandardsById`,
 * `checkOptionWarnings`), not a hand-built `StandardsById` map. This is what
 * the picker and the evaluator both actually run on — a unit test with a
 * fixture map would prove the evaluator works but say nothing about whether
 * the picker's own data feeds it correctly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EquipmentRecord, ConversionEquation, RecorderTemplate } from '../../types';

vi.mock('../firebase', async () => {
  const { createFakeFirestore } = await import('./fakeFirestore');
  return createFakeFirestore();
});

import * as firebaseMock from '../firebase';
import { loadStandardOptions, optionsToStandardsById, checkOptionWarnings } from '../referenceStandardOptions';
import { evaluateMockup } from '../recorderTemplateMockup';

beforeEach(() => {
  (firebaseMock as any).store.clear();
});

/** Same seeding shape calibrationRecordService.test.ts uses — real Firestore document layout. */
function seedEquipment(id: string, overrides: Record<string, unknown> = {}) {
  const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
  store.set(`equipmentControl/${id}`, {
    data: {
      name: `Transducer ${id}`,
      category: 'FRC',
      serialNumber: `SN-${id}`,
      isReferenceStandard: true,
      status: 'active',
      lastCalibrationDate: '2026-01-15',
      nextCalibrationDate: '2027-01-15',
      ...overrides,
    },
    version: 0,
  });
}

function seedEquation(
  equipmentId: string,
  equationId: string,
  descendingCoefficients: number[],
  overrides: Record<string, unknown> = {},
) {
  const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
  store.set(`equipmentControl/${equipmentId}/conversionEquations/${equationId}`, {
    data: {
      name: `${equipmentId} range`,
      inputUnit: 'mV/V',
      outputUnit: 'N',
      degree: descendingCoefficients.length - 1,
      coefficients: descendingCoefficients.map((value) => ({ value, inputMode: 'decimal', raw: String(value) })),
      divisor: 1,
      createdAt: new Date(),
      ...overrides,
    },
    version: 0,
  });
}

function template(): RecorderTemplate {
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
  } as RecorderTemplate;
}

describe('loadStandardOptions — only isReferenceStandard equipment, real Firestore shapes', () => {
  it('returns one option per (equipment, equation) pair', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq1', [10, 0]); // stored descending -> F = 10R

    const options = await loadStandardOptions();
    expect(options).toHaveLength(1);
    expect(options[0].key).toBe('EQ-A::eq1');
    expect(options[0].label).toBe('EQ-A — EQ-A range');
  });

  it('excludes equipment NOT flagged isReferenceStandard', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq1', [10, 0]);
    seedEquipment('EQ-B', { isReferenceStandard: false });
    seedEquation('EQ-B', 'eq1', [20, 0]);

    const options = await loadStandardOptions();
    expect(options.map((o) => o.equipment.id)).toEqual(['EQ-A']);
  });

  it('excludes flagged equipment with no equations at all — nothing to select', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq1', [10, 0]);
    seedEquipment('EQ-EMPTY'); // no equation seeded

    const options = await loadStandardOptions();
    expect(options.map((o) => o.equipment.id)).toEqual(['EQ-A']);
  });

  it('returns multiple options for one transducer with several calibrated ranges', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'range-low', [10, 0]);
    seedEquation('EQ-A', 'range-high', [100, 0]);

    const options = await loadStandardOptions();
    expect(options.map((o) => o.key).sort()).toEqual(['EQ-A::range-high', 'EQ-A::range-low'].sort());
  });
});

// ── ADR-014 Phase 14 Task 4: duplicate equation names must not collide ──────
//
// The equation form rejects NEW duplicates, but existing data can already
// have two equations named alike under one equipment. invertStandardLabels
// overwrites on a label collision, so an un-disambiguated duplicate would let
// picking "EQ-A — 1-10 kN" silently resolve to whichever equation's
// coefficients happened to be written last — a plausible wrong force with no
// error, straight onto a certificate.

describe('loadStandardOptions — duplicate equation names produce DISTINCT labels', () => {
  it('two same-named equations under one equipment get different labels', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq-low', [10, 0], { name: '1-10 kN' });
    seedEquation('EQ-A', 'eq-high', [100, 0], { name: '1-10 kN' }); // same name, different range

    const options = await loadStandardOptions();
    const labels = options.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length); // injective: no two options share a label
  });

  it('a name collision spanning THREE equations still disambiguates all of them', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq1', [1, 0], { name: 'Standard Range' });
    seedEquation('EQ-A', 'eq2', [2, 0], { name: 'Standard Range' });
    seedEquation('EQ-A', 'eq3', [3, 0], { name: 'Standard Range' });

    const options = await loadStandardOptions();
    const labels = options.map((o) => o.label);
    expect(new Set(labels).size).toBe(3);
  });

  it('does NOT rewrite labels that have no collision at all', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq1', [10, 0], { name: '1-10 N' });

    const options = await loadStandardOptions();
    expect(options[0].label).toBe('EQ-A — 1-10 N'); // unchanged — no id suffix appended
  });

  it('THE CORRECTNESS TEST: two same-named equations resolve to their OWN coefficients, not each other\'s', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq-low', [10, 0], { name: 'Same Name' }); // F = 10R
    seedEquation('EQ-A', 'eq-high', [999, 0], { name: 'Same Name' }); // F = 999R

    const options = await loadStandardOptions();
    const standardsById = optionsToStandardsById(options);

    // Every distinct KEY must still map to its own equation's source — the
    // failure mode this guards is one label silently pointing at the wrong
    // equation's coefficients (invertStandardLabels overwriting on collision).
    const low = options.find((o) => o.equation.id === 'eq-low')!;
    const high = options.find((o) => o.equation.id === 'eq-high')!;
    expect(low.label).not.toBe(high.label); // distinct labels, or the picker itself is ambiguous

    const result = evaluateMockup(
      template(),
      [
        { M_STDSEL: low.key, M_R: 2 }, // must be 10 * 2 = 20, NOT 999 * 2
        { M_STDSEL: high.key, M_R: 2 }, // must be 999 * 2 = 1998, NOT 10 * 2
      ],
      {},
      standardsById,
    );

    expect(result.rows[0].M_F.value).toBe(20);
    expect(result.rows[1].M_F.value).toBe(1998);
  });

  it('the disambiguating suffix is the equation id — proven unique by construction, not luck', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq-alpha', [10, 0], { name: 'Dup' });
    seedEquation('EQ-A', 'eq-beta', [20, 0], { name: 'Dup' });

    const options = await loadStandardOptions();
    const alpha = options.find((o) => o.equation.id === 'eq-alpha')!;
    const beta = options.find((o) => o.equation.id === 'eq-beta')!;
    expect(alpha.label).toContain('eq-alpha');
    expect(beta.label).toContain('eq-beta');
  });
});

describe('optionsToStandardsById + evaluateMockup — end to end, through the picker\'s own data', () => {
  it('two rows using DIFFERENT standards evaluate with their own coefficients', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq1', [10, 0]); // F = 10R
    seedEquipment('EQ-B');
    seedEquation('EQ-B', 'eq1', [100, 0]); // F = 100R

    const options = await loadStandardOptions();
    const standardsById = optionsToStandardsById(options);

    const keyA = options.find((o) => o.equipment.id === 'EQ-A')!.key;
    const keyB = options.find((o) => o.equipment.id === 'EQ-B')!.key;

    const result = evaluateMockup(
      template(),
      [
        { M_STDSEL: keyA, M_R: 2 }, // 10 * 2 = 20
        { M_STDSEL: keyB, M_R: 2 }, // 100 * 2 = 200
      ],
      {},
      standardsById,
    );

    expect(result.rows[0].M_F.error).toBeUndefined();
    expect(result.rows[1].M_F.error).toBeUndefined();
    expect(result.rows[0].M_F.value).toBe(20);
    expect(result.rows[1].M_F.value).toBe(200);
    expect(result.rows[0].M_F.value).not.toBe(result.rows[1].M_F.value);
  });

  it('picking a standard makes STD_C1 resolve to a number, not awaiting-input', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq1', [10, 0]);

    const options = await loadStandardOptions();
    const standardsById = optionsToStandardsById(options);

    // Before selection: no standard on the row.
    const before = evaluateMockup(template(), [{ M_STDSEL: null, M_R: 2 }], {}, standardsById);
    expect(before.rows[0].M_F.error?.kind).toBe('awaiting-input');

    // After selection: the SAME options object resolves the row.
    const after = evaluateMockup(template(), [{ M_STDSEL: options[0].key, M_R: 2 }], {}, standardsById);
    expect(after.rows[0].M_F.error).toBeUndefined();
    expect(typeof after.rows[0].M_F.value).toBe('number');
  });

  it('reverses stored descending coefficients via the SAME adapter Phase 12 verified', async () => {
    // CAL-FRC-001's real certificate values (ADR-013 §1) — stored descending.
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq1', [0.075709296790966, -0.039616880251316, 25.001904548237, 0]);

    const options = await loadStandardOptions();
    const standardsById = optionsToStandardsById(options);
    // Full cubic F = A*R + B*R^2 + C*R^3, exactly ADR-013's documented form
    // (STD_C1..STD_C3 map to A/B/C at this degree) — not just the linear term.
    const cubicTemplate = {
      ...template(),
      sections: [
        {
          ...template().sections[0],
          columns: [
            template().sections[0].columns[0],
            template().sections[0].columns[1],
            { id: 'F', label: 'Force', order: 2, type: 'formula' as const, expression: 'STD_C1 * M_R + STD_C2 * M_R**2 + STD_C3 * M_R**3' },
          ],
        },
      ],
    };
    const result = evaluateMockup(
      cubicTemplate,
      [{ M_STDSEL: options[0].key, M_R: 0.04 }],
      {},
      { [options[0].key]: standardsById[options[0].key] },
    );
    // F = A*R + B*R^2 + C*R^3 at R=0.04 -> 1.00002, per ADR-013's own table.
    expect(result.rows[0].M_F.value as number).toBeCloseTo(1.00002, 4);
  });
});

describe('checkOptionWarnings — surfaced with real loaded options', () => {
  it('warns when the standard is past its calibration due date', async () => {
    seedEquipment('EQ-A', { nextCalibrationDate: '2020-01-01' }); // long past due
    seedEquation('EQ-A', 'eq1', [10, 0]);
    const options = await loadStandardOptions();

    const warnings = checkOptionWarnings(options[0], [], 'N', new Date('2026-01-01'));
    expect(warnings.some((w) => w.kind === 'due-date')).toBe(true);
  });

  it('warns when a computed force falls outside the equation\'s range (same unit)', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq1', [10, 0], { rangeMin: 0, rangeMax: 5, outputUnit: 'N' });
    const options = await loadStandardOptions();

    const warnings = checkOptionWarnings(options[0], [50], 'N', new Date('2026-01-01'));
    expect(warnings.some((w) => w.kind === 'range')).toBe(true);
  });

  it('is silent when the standard is current and the force is in range', async () => {
    seedEquipment('EQ-A', { nextCalibrationDate: '2099-01-01' });
    seedEquation('EQ-A', 'eq1', [10, 0], { rangeMin: 0, rangeMax: 100, outputUnit: 'N' });
    const options = await loadStandardOptions();

    const warnings = checkOptionWarnings(options[0], [20], 'N', new Date('2026-01-01'));
    expect(warnings).toEqual([]);
  });

  it('is silent about range when no force is computed yet', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq1', [10, 0], { rangeMin: 0, rangeMax: 5 });
    const options = await loadStandardOptions();

    const warnings = checkOptionWarnings(options[0], [null, undefined], 'N', new Date('2026-01-01'));
    expect(warnings.some((w) => w.kind === 'range')).toBe(false);
  });

  // ── Phase 14 Task 3: the unit mismatch that makes a "wrong" warning fire ──
  //
  // rangeMin/rangeMax are in the equation's OWN outputUnit. A template
  // formula's computed force is in the RECORD's reportUnit (ADR-014 D5).
  // Comparing the raw numbers without converting is the naive bug: it warns
  // when nothing is wrong, and stays silent when something IS wrong.
  describe('unit correctness — force is in REPORT unit, range is in the EQUATION\'s output unit', () => {
    it('does NOT warn for an in-range force reported in a DIFFERENT unit from the equation\'s output unit', async () => {
      // Equation calibrated 2-20 kN. A genuine 10 kN point, but the RECORD
      // reports in N, so the computed force arrives as 10000 (not 10).
      seedEquipment('EQ-A');
      seedEquation('EQ-A', 'eq1', [10, 0], { rangeMin: 2, rangeMax: 20, outputUnit: 'kN' });
      const options = await loadStandardOptions();

      // Naive comparison (10000 against 2-20) would wrongly warn. Correct
      // comparison converts 10000 N -> 10 kN first, which IS in range.
      const warnings = checkOptionWarnings(options[0], [10000], 'N', new Date('2026-01-01'));
      expect(warnings.some((w) => w.kind === 'range')).toBe(false);
    });

    it('DOES warn for a genuinely out-of-range force, after correct unit conversion', async () => {
      // Same 2-20 kN equation. A true 30 kN point (out of range), reported in N.
      seedEquipment('EQ-A');
      seedEquation('EQ-A', 'eq1', [10, 0], { rangeMin: 2, rangeMax: 20, outputUnit: 'kN' });
      const options = await loadStandardOptions();

      const warnings = checkOptionWarnings(options[0], [30000], 'N', new Date('2026-01-01'));
      expect(warnings.some((w) => w.kind === 'range')).toBe(true);
    });

    it('this exact scenario WOULD wrongly warn under the naive (unconverted) comparison', () => {
      // Proof the test above is not vacuous: the naive comparison genuinely
      // disagrees with the correct one on this input.
      const naiveWarning = 10000 >= 2 && 10000 <= 20 ? null : 'would warn';
      expect(naiveWarning).toBe('would warn');
    });

    it('is silent (not wrongly permissive) when the report unit is unset — cannot convert, so does not guess', async () => {
      seedEquipment('EQ-A');
      seedEquation('EQ-A', 'eq1', [10, 0], { rangeMin: 2, rangeMax: 20, outputUnit: 'kN' });
      const options = await loadStandardOptions();

      // 30000 would be wildly out of range in kN, but with no report unit to
      // convert from, this must not compare the raw number against the range.
      const warnings = checkOptionWarnings(options[0], [30000], undefined, new Date('2026-01-01'));
      expect(warnings.some((w) => w.kind === 'range')).toBe(false);
    });

    it('is silent when the report unit is not a recognised force unit', async () => {
      seedEquipment('EQ-A');
      seedEquation('EQ-A', 'eq1', [10, 0], { rangeMin: 2, rangeMax: 20, outputUnit: 'kN' });
      const options = await loadStandardOptions();

      const warnings = checkOptionWarnings(options[0], [30000], 'kg', new Date('2026-01-01'));
      expect(warnings.some((w) => w.kind === 'range')).toBe(false);
    });

    it('kgF <-> N conversion round-trips correctly through the range check', async () => {
      // Equation range 1-2 kgF. A report of 15 N is ~1.53 kgF -> in range.
      seedEquipment('EQ-A');
      seedEquation('EQ-A', 'eq1', [10, 0], { rangeMin: 1, rangeMax: 2, outputUnit: 'kgF' });
      const options = await loadStandardOptions();

      const inRange = checkOptionWarnings(options[0], [15], 'N', new Date('2026-01-01'));
      expect(inRange.some((w) => w.kind === 'range')).toBe(false);

      // 30 N is ~3.06 kgF -> out of range.
      const outOfRange = checkOptionWarnings(options[0], [30], 'N', new Date('2026-01-01'));
      expect(outOfRange.some((w) => w.kind === 'range')).toBe(true);
    });
  });
});

// ── ADR-014 D6: a committed record must NEVER call loadStandardOptions() ────

describe('the commit/replay path never imports referenceStandardOptions.ts', () => {
  it('calibrationRecordService.ts has no reference to referenceStandardOptions', async () => {
    // Static, not just runtime: prevents a future edit from silently wiring
    // the live-options path into the snapshot-replay path (ADR-014 D6).
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const source = await fs.readFile(
      path.resolve(__dirname, '../calibrationRecordService.ts'),
      'utf-8',
    );
    expect(source).not.toContain('referenceStandardOptions');
    expect(source).not.toContain('loadStandardOptions');
  });
});
