import { describe, it, expect } from 'vitest';
import { callBuiltin, BUILTIN_FUNCTIONS } from '../builtins';
import { roundHalfAwayFromZero, truncToDecimals } from '../../numeric';
import { sampleStdDev } from '../../uncertaintyBudget';
import { tinv, FALLBACK_K } from '../../studentT';

describe('callBuiltin — delegates to the existing (already-tested) helpers', () => {
  it('ROUND matches numeric.roundHalfAwayFromZero exactly', () => {
    expect(callBuiltin('ROUND', [2.005, 2])).toBe(roundHalfAwayFromZero(2.005, 2));
    expect(callBuiltin('ROUND', [-2.5, 0])).toBe(roundHalfAwayFromZero(-2.5, 0));
  });

  it('TRUNC matches numeric.truncToDecimals, with a default of 0 decimals', () => {
    expect(callBuiltin('TRUNC', [3.789, 1])).toBe(truncToDecimals(3.789, 1));
    expect(callBuiltin('TRUNC', [3.789])).toBe(truncToDecimals(3.789, 0));
  });

  it('STDEV matches uncertaintyBudget.sampleStdDev exactly', () => {
    const values = [0.26, 0.4, 0.3];
    expect(callBuiltin('STDEV', values)).toBe(sampleStdDev(values));
  });

  it('TINV applies the workbook IFERROR-to-2 fallback via studentT.tinv/FALLBACK_K', () => {
    expect(callBuiltin('TINV', [0.0455, 10])).toBeCloseTo(tinv(0.0455, 10), 9);
    // nu < 1 is invalid for tinv -> NaN -> falls back to FALLBACK_K (2)
    expect(callBuiltin('TINV', [0.0455, 0])).toBe(FALLBACK_K);
  });

  it('RSS computes the root-sum-of-squares', () => {
    expect(callBuiltin('RSS', [3, 4])).toBe(5);
  });

  it('ABS / SQRT / SUM / AVERAGE behave as expected', () => {
    expect(callBuiltin('ABS', [-5])).toBe(5);
    expect(callBuiltin('SQRT', [9])).toBe(3);
    expect(callBuiltin('SUM', [1, 2, 3])).toBe(6);
    expect(callBuiltin('AVERAGE', [1, 2, 3])).toBe(2);
  });
});

describe('callBuiltin — validation', () => {
  it('rejects an unknown function name', () => {
    expect(() => callBuiltin('NOPE', [1])).toThrow(/Unknown function/);
  });

  it('rejects wrong arity for fixed-arity functions', () => {
    expect(() => callBuiltin('ABS', [1, 2])).toThrow(/expects 1 argument/);
    expect(() => callBuiltin('ROUND', [1])).toThrow(/expects 2 argument/);
  });

  it('rejects zero arguments for variadic functions', () => {
    expect(() => callBuiltin('MAX', [])).toThrow(/at least 1 argument/);
  });

  it('rejects a non-finite argument', () => {
    expect(() => callBuiltin('ABS', [Number.NaN])).toThrow(/non-finite/);
    expect(() => callBuiltin('SUM', [1, Number.POSITIVE_INFINITY])).toThrow(/non-finite/);
  });

  it('every entry in BUILTIN_FUNCTIONS is directly callable by its own key', () => {
    for (const name of Object.keys(BUILTIN_FUNCTIONS)) {
      const arity = BUILTIN_FUNCTIONS[name].arity ?? 1;
      const args = Array.from({ length: Math.max(arity, 1) }, () => 2);
      expect(() => callBuiltin(name, args)).not.toThrow();
    }
  });
});
