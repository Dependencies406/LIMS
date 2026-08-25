import { describe, it, expect } from 'vitest';
import { BUILTIN_FUNCTIONS, callBuiltin, isBuiltin, isColumnAggregate } from '../builtins';
import { roundHalfAwayFromZero, truncateToDecimals, sampleStandardDeviation } from '../numeric';
import { tinv } from '../studentT';
import { FormulaEvaluationError } from '../errors';

// ── §8: ROUND is half-away-from-zero ────────────────────────────────────────

describe('ROUND — half away from zero', () => {
  /**
   * ⚠ THIS DIVERGENCE FROM PYTHON IS DELIBERATE. DO NOT "FIX" IT.
   *
   * Python's built-in round() uses banker's rounding (half-to-even), so
   * round(0.5) is 0 and round(2.5) is 2.
   *
   * ROUND here uses half-away-from-zero, matching Excel: ROUND(0.5, 0) is 1
   * and ROUND(-0.5, 0) is -1. This exists so that results reconcile against
   * the lab's existing spreadsheets. Changing it to match Python would
   * silently alter historical calculations on issued calibration
   * certificates. See docs/FORMULA_GRAMMAR.md §3.
   */
  it('rounds 0.5 up to 1, where Python would give 0', () => {
    expect(callBuiltin('ROUND', [0.5, 0])).toBe(1);
  });

  it('rounds -0.5 to -1, away from zero', () => {
    expect(callBuiltin('ROUND', [-0.5, 0])).toBe(-1);
  });

  it('rounds 2.5 up to 3, where Python banker-rounds to 2', () => {
    expect(callBuiltin('ROUND', [2.5, 0])).toBe(3);
  });

  it('rounds 1.5 to 2 (agrees with Python here, by coincidence)', () => {
    expect(callBuiltin('ROUND', [1.5, 0])).toBe(2);
  });

  it('avoids binary-representation drift: ROUND(2.675, 2) is 2.68, not 2.67', () => {
    expect(callBuiltin('ROUND', [2.675, 2])).toBe(2.68);
  });

  it('rounds to the requested number of decimal places', () => {
    expect(callBuiltin('ROUND', [3.14159, 3])).toBe(3.142);
    expect(callBuiltin('ROUND', [1.005, 2])).toBe(1.01);
  });
});

describe('TRUNC — toward zero', () => {
  it('truncates positives down', () => {
    expect(callBuiltin('TRUNC', [1.9])).toBe(1);
  });

  it('truncates negatives toward zero, not down', () => {
    expect(callBuiltin('TRUNC', [-1.9])).toBe(-1);
  });

  it('accepts an optional decimal-places argument', () => {
    expect(callBuiltin('TRUNC', [3.14159, 2])).toBe(3.14);
  });

  it('defaults to 0 decimal places', () => {
    expect(truncateToDecimals(5.99, 0)).toBe(5);
  });
});

// ── §8: TINV, including the Excel df-truncation quirk ───────────────────────

describe('TINV — two-tailed inverse Student-t, Excel-matching', () => {
  const known: Array<[number, number, number]> = [
    // [alpha, df, Excel's TINV value]
    [0.05, 1, 12.7062047361747],
    [0.05, 2, 4.30265272974946],
    [0.05, 10, 2.22813885198627],
    [0.01, 10, 3.16927267261485],
    [0.0455, 2, 4.52655076008199],
  ];

  it.each(known)('TINV(%f, %f) ≈ %f', (alpha, df, expected) => {
    expect(callBuiltin('TINV', [alpha, df])).toBeCloseTo(expected, 9);
  });

  /**
   * Excel truncates the degrees-of-freedom argument to an integer. Reproducing
   * the lab's workbooks REQUIRES this; a true real-valued inverse-t would not
   * match. See docs/FORMULA_GRAMMAR.md §3.
   */
  it('truncates degrees of freedom to an integer, as Excel does', () => {
    const atTwo = callBuiltin('TINV', [0.0455, 2]);
    expect(callBuiltin('TINV', [0.0455, 2.9])).toBe(atTwo);
    expect(callBuiltin('TINV', [0.0455, 2.0910])).toBe(atTwo);
    expect(callBuiltin('TINV', [0.0455, 2.5411])).toBe(atTwo);
  });

  it('reproduces the archived golden coverage factors', () => {
    expect(callBuiltin('TINV', [0.0455, 9.0913])).toBeCloseTo(2.3198, 4);
    expect(callBuiltin('TINV', [0.0455, 7.166])).toBeCloseTo(2.4288, 4);
    expect(callBuiltin('TINV', [0.0455, 3.29])).toBeCloseTo(3.3068, 4);
  });

  it('errors outside its domain rather than falling back to 2', () => {
    // The archived engine baked in the workbook's =IFERROR(TINV(...), 2).
    // FORMULA_GRAMMAR §6 makes an out-of-domain TINV an error instead.
    expect(() => callBuiltin('TINV', [0, 10])).toThrow(FormulaEvaluationError);
    expect(() => callBuiltin('TINV', [1.5, 10])).toThrow(FormulaEvaluationError);
    expect(() => callBuiltin('TINV', [0.05, 0])).toThrow(FormulaEvaluationError);
  });

  it('classifies a domain error as invalid-computation', () => {
    try {
      callBuiltin('TINV', [0.05, 0]);
      throw new Error('expected a failure');
    } catch (error) {
      expect((error as FormulaEvaluationError).kind).toBe('invalid-computation');
    }
  });

  it('returns 0 when alpha is exactly 1', () => {
    expect(tinv(1, 5)).toBe(0);
  });
});

// ── Remaining whitelist ─────────────────────────────────────────────────────

describe('the rest of the §3 whitelist', () => {
  it('ABS', () => {
    expect(callBuiltin('ABS', [-3.5])).toBe(3.5);
  });

  it('SQRT', () => {
    expect(callBuiltin('SQRT', [9])).toBe(3);
  });

  it('SQRT of a negative is an error, not NaN', () => {
    expect(() => callBuiltin('SQRT', [-1])).toThrow(/not defined/);
  });

  it('MAX and MIN are variadic', () => {
    expect(callBuiltin('MAX', [1, 9, 4])).toBe(9);
    expect(callBuiltin('MIN', [1, 9, 4])).toBe(1);
  });

  it('AVERAGE', () => {
    expect(callBuiltin('AVERAGE', [1, 2, 3, 4])).toBe(2.5);
  });

  it('SUM', () => {
    expect(callBuiltin('SUM', [1, 2, 3])).toBe(6);
  });

  it('RSS combines uncertainties as sqrt(sum of squares)', () => {
    expect(callBuiltin('RSS', [3, 4])).toBe(5);
  });

  it('STDEV uses the n-1 (sample) denominator', () => {
    // Population stdev of [2,4,4,4,5,5,7,9] is 2; the sample stdev is larger.
    expect(callBuiltin('STDEV', [2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5);
  });

  it('STDEV of a single value is an error, not zero', () => {
    expect(() => callBuiltin('STDEV', [5])).toThrow(/at least 2 values/);
  });

  it('sampleStandardDeviation returns NaN below two values', () => {
    expect(Number.isNaN(sampleStandardDeviation([1]))).toBe(true);
  });
});

describe('whitelist membership', () => {
  it('IF() is deliberately NOT a builtin — the ternary is the only conditional', () => {
    expect(isBuiltin('IF')).toBe(false);
    expect(BUILTIN_FUNCTIONS.IF).toBeUndefined();
  });

  it('exposes exactly the §3 general builtins', () => {
    expect(Object.keys(BUILTIN_FUNCTIONS).sort()).toEqual(
      ['ABS', 'AVERAGE', 'MAX', 'MIN', 'ROUND', 'RSS', 'SQRT', 'STDEV', 'SUM', 'TINV', 'TRUNC'].sort(),
    );
  });

  it('recognises the six column aggregates', () => {
    for (const name of ['col_mean', 'col_max', 'col_min', 'col_sum', 'col_count', 'col_stdev']) {
      expect(isColumnAggregate(name)).toBe(true);
    }
    expect(isColumnAggregate('col_median')).toBe(false);
  });

  it('is case-sensitive — `round` is not `ROUND`', () => {
    expect(isBuiltin('round')).toBe(false);
  });
});

describe('arity enforcement', () => {
  it('rejects too few arguments', () => {
    expect(() => callBuiltin('ROUND', [1])).toThrow(/expects 2 argument/);
  });

  it('rejects too many arguments', () => {
    expect(() => callBuiltin('ABS', [1, 2])).toThrow(/expects 1 argument/);
  });

  it('rejects an empty variadic call', () => {
    expect(() => callBuiltin('MAX', [])).toThrow(/at least 1 argument/);
  });

  it('rejects an unknown function', () => {
    expect(() => callBuiltin('NOPE', [1])).toThrow(/Unknown function/);
  });
});

describe('non-finite results are errors', () => {
  it('rejects an overflow to Infinity', () => {
    expect(() => callBuiltin('SUM', [1e308, 1e308])).toThrow(/not a finite number/);
  });
});

describe('numeric helpers avoid binary drift', () => {
  it('roundHalfAwayFromZero handles values a naive shift would corrupt', () => {
    expect(roundHalfAwayFromZero(0.26, 1)).toBe(0.3);
    expect(roundHalfAwayFromZero(1.0049999999, 2)).toBe(1);
  });

  it('leaves non-finite input untouched', () => {
    expect(roundHalfAwayFromZero(Infinity, 2)).toBe(Infinity);
  });
});
