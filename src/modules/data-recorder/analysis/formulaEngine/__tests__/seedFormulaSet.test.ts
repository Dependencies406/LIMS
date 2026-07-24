import { describe, it, expect } from 'vitest';
import { validateFormulaSet } from '../formulaSet';
import { FORCE_ISO7500_1_FORMULA_SET, FORCE_ISO7500_1_SHEET_TYPE, generateSeedFormulaSet } from '../seedFormulaSet';

describe('FORCE_ISO7500_1_FORMULA_SET', () => {
  it('has no validation issues (parses, only declared/known references)', () => {
    expect(validateFormulaSet(FORCE_ISO7500_1_FORMULA_SET)).toEqual([]);
  });

  it('is tagged with the force-iso7500-1 sheetType', () => {
    expect(FORCE_ISO7500_1_FORMULA_SET.sheetType).toBe(FORCE_ISO7500_1_SHEET_TYPE);
  });

  it('step names/order exactly match relativeError.ts:109-146 then uncertaintyBudget.ts:50-86', () => {
    expect(FORCE_ISO7500_1_FORMULA_SET.steps.map((s) => s.name)).toEqual([
      'fAvg', 'q1', 'q2', 'q3', 'qAvg', 'b', 'f0', 'v', 'a',
      'sd', 'uRep', 'uRes', 'uStd', 'uC', 'vEff', 'k', 'U', 'uReport', 'reportU',
    ]);
  });

  it('has no duplicate step names', () => {
    const names = FORCE_ISO7500_1_FORMULA_SET.steps.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('generateSeedFormulaSet rejects an unknown sheetType', () => {
    expect(() => generateSeedFormulaSet('temperature-xyz')).toThrow(/No seed FormulaSet/);
  });

  it('no step references a LATER step as an input (fixed evaluation order, no forward references)', () => {
    const allStepNames = new Set(FORCE_ISO7500_1_FORMULA_SET.steps.map((s) => s.name));
    const producedSoFar = new Set<string>();
    for (const step of FORCE_ISO7500_1_FORMULA_SET.steps) {
      for (const input of step.inputs) {
        if (allStepNames.has(input)) {
          expect(producedSoFar.has(input)).toBe(true);
        }
        // inputs not matching any step name are raw sheet-level inputs
        // (calPoint, fi1, uCal, ...) — always available, no order constraint.
      }
      expect(step.inputs).not.toContain(step.name);
      producedSoFar.add(step.name);
    }
  });
});
