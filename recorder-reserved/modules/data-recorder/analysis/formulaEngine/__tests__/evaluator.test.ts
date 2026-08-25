import { describe, it, expect } from 'vitest';
import { parseFormula } from '../parser';
import { evaluate, FormulaEvaluationError } from '../evaluator';

function run(expr: string, scope: Record<string, number> = {}): number {
  return evaluate(parseFormula(expr), scope);
}

describe('evaluate — arithmetic', () => {
  it('evaluates the four basic operators', () => {
    expect(run('2 + 3')).toBe(5);
    expect(run('5 - 2')).toBe(3);
    expect(run('4 * 2.5')).toBe(10);
    expect(run('9 / 3')).toBe(3);
  });

  it('evaluates power, including negative and fractional exponents', () => {
    expect(run('2^10')).toBe(1024);
    expect(run('4^0.5')).toBe(2);
    expect(run('2^-1')).toBe(0.5);
  });

  it('matches Excel unary-minus-vs-power precedence: -2^2 = -4', () => {
    expect(run('-2^2')).toBe(-4);
  });

  it('resolves variables from scope', () => {
    expect(run('a + b * c', { a: 1, b: 2, c: 3 })).toBe(7);
  });

  it('throws on an unknown variable', () => {
    expect(() => run('a + 1', {})).toThrow(FormulaEvaluationError);
    expect(() => run('unknownVar', {})).toThrow(/unknownVar/);
  });

  it('throws (does not silently produce Infinity) on division by zero', () => {
    expect(() => run('1 / 0')).toThrow(FormulaEvaluationError);
    expect(() => run('1 / 0')).toThrow(/Division by zero/);
  });
});

describe('evaluate — comparisons and IF', () => {
  it('comparison operators return 1 or 0', () => {
    expect(run('1 < 2')).toBe(1);
    expect(run('2 < 1')).toBe(0);
    expect(run('3 = 3')).toBe(1);
    expect(run('3 <> 3')).toBe(0);
    expect(run('3 >= 3')).toBe(1);
    expect(run('2 <= 1')).toBe(0);
  });

  it('IF selects the correct branch', () => {
    expect(run('IF(1 = 1, 10, 20)')).toBe(10);
    expect(run('IF(1 = 2, 10, 20)')).toBe(20);
  });

  it('IF short-circuits: the untaken branch is never evaluated', () => {
    // 1/0 in the FALSE branch must not throw, because condition is true.
    expect(run('IF(x = 0, 99, 1 / x)', { x: 0 })).toBe(99);
    // and the guarded division only runs when safe:
    expect(run('IF(x = 0, 0, 100 / x)', { x: 4 })).toBe(25);
  });

  it('rejects IF with the wrong argument count', () => {
    expect(() => run('IF(1 = 1, 2)')).toThrow(FormulaEvaluationError);
  });
});

describe('evaluate — built-in function calls', () => {
  it('MAX / MIN are variadic', () => {
    expect(run('MAX(3, 7, 2)')).toBe(7);
    expect(run('MIN(3, 7, 2)')).toBe(2);
  });

  it('replicates the Stage-D b formula: MAX(q1,q2,q3) - MIN(q1,q2,q3)', () => {
    // D2: b = max - min, not the workbook's q1 - q3. q2 is the extreme here,
    // proving the formula is order-agnostic (matches sheetLogic's own D2 test intent).
    const scope = { q1: 1.0, q2: -3.5, q3: 0.5 };
    expect(run('MAX(q1, q2, q3) - MIN(q1, q2, q3)', scope)).toBeCloseTo(4.5, 9);
  });

  it('propagates an error from a nested unknown function', () => {
    expect(() => run('BOGUS(1, 2)')).toThrow(/Unknown function/);
  });

  it('throws on wrong arity for a fixed-arity builtin', () => {
    expect(() => run('ROUND(1.2345)')).toThrow(/expects 2 argument/);
  });

  it('throws when SQRT is given a non-finite result upstream', () => {
    expect(() => run('SQRT(1/0)')).toThrow(FormulaEvaluationError);
  });
});
