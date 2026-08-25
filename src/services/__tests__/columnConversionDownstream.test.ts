/**
 * columnConversionDownstream.test.ts
 *
 * ADR-015 D1's structural guarantee, proved rather than assumed (required
 * test 5): column A has conversion enabled; column B is a formula
 * referencing A. B must be computed from A's RAW value. If a future change
 * fed the CONVERTED value into the row before recalculation, two
 * conversions would compound — the exact ADR-014 D5 divisor failure this
 * design exists to make structurally impossible.
 *
 * Two tests:
 *   1. The real pipeline: `recalculateRecord` (recalculation) and
 *      `convertColumnDisplayValue` (display) run side by side, from the
 *      SAME raw row, completely independently. B's real value is asserted
 *      to be the one arithmetic derives from raw A.
 *   2. The deliberately-broken run: manually construct what B WOULD be if
 *      some future bug wrote the CONVERTED A into the row before
 *      recalculation ran, and show it disagrees with test 1's real answer
 *      — proof that test 1 would fail if that regression were introduced.
 */
import { describe, it, expect } from 'vitest';
import { recalculateRecord } from '../recordRecalculation';
import { convertColumnDisplayValue } from '../columnConversion';
import type { RecorderTemplate, ConversionRule } from '../../types';

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
        id: 'CAL', label: 'Calibration', order: 0,
        columns: [
          { id: 'R', label: 'Reading', order: 0, type: 'number' },
          {
            id: 'A', label: 'Column A', order: 1, type: 'formula', expression: 'CAL_R * 2',
            unitMode: 'fixed', unit: '%',
            conversionEnabled: true, conversionSourceUnit: 'mV/V',
          },
          { id: 'B', label: 'Column B (downstream of A)', order: 2, type: 'formula', expression: 'CAL_A * 10' },
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

const RULE: ConversionRule = {
  id: 'r1', name: 'mV/V to %', fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * 100',
  active: true, createdAt: new Date(), updatedAt: new Date(), createdBy: 'admin1',
};

describe('a downstream formula sees the RAW value, never the converted one (test 5)', () => {
  it('B is computed from raw A, not converted A', () => {
    const result = recalculateRecord(template(), [{ CAL_R: 5 }], []);

    const rawA = result.computedRows[0].CAL_A;
    const realB = result.computedRows[0].CAL_B;
    expect(rawA).toBe(10); // CAL_R(5) * 2

    // What A's DISPLAY value would be — computed entirely separately, via
    // the render-time pipeline, never touching the row recalculation used.
    const displayA = convertColumnDisplayValue({
      rawValue: rawA as number,
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [RULE],
    });
    expect(displayA.displayValue).toBe(1000); // 10 * 100 — very different from raw A

    // B is derived from RAW A (10 * 10 = 100), not from A's display value
    // (which would give 1000 * 10 = 10000).
    expect(realB).toBe(100);
    expect(realB).not.toBe(1000 * 10);
  });

  it('a SECOND, independent guarantee: even directly injecting a converted value into the row cannot corrupt B, because recalculateRecord always recomputes a formula column fresh from its own expression — it never trusts whatever value already occupies that key in the input row', () => {
    const correct = recalculateRecord(template(), [{ CAL_R: 5 }], []);
    const rawA = correct.computedRows[0].CAL_A as number;
    const realB = correct.computedRows[0].CAL_B as number;

    const displayA = convertColumnDisplayValue({
      rawValue: rawA,
      column: { conversionEnabled: true, conversionSourceUnit: 'mV/V' },
      targetUnit: '%',
      rules: [RULE],
    });
    expect(displayA.displayValue).toBe(1000); // very different from rawA (10)

    // Attempt the corruption directly: hand recalculateRecord a row where
    // CAL_A's slot already holds the CONVERTED value, as if some future bug
    // had written it there before calling recalculateRecord.
    const attemptedCorruption = { CAL_R: 5, CAL_A: displayA.displayValue };
    const result = recalculateRecord(template(), [attemptedCorruption], []);

    // CAL_A itself comes back RECOMPUTED (10, not the 1000 that was
    // injected) — a formula column's own value is never read from the
    // input row, only ever derived from its expression.
    expect(result.computedRows[0].CAL_A).toBe(rawA);
    expect(result.computedRows[0].CAL_A).not.toBe(displayA.displayValue);
    // Consequently B is unaffected too.
    expect(result.computedRows[0].CAL_B).toBe(realB);
  });
});
