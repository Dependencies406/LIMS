import { describe, it, expect } from 'vitest';
import { validateFormulaSet, evaluateFormulaSet, type FormulaSet } from '../formulaSet';
import { FormulaEvaluationError } from '../evaluator';

describe('validateFormulaSet', () => {
  it('accepts a well-formed set with no issues', () => {
    const set: FormulaSet = {
      sheetType: 'test',
      steps: [
        { name: 'sum', inputs: ['a', 'b'], expression: 'a + b' },
        { name: 'doubled', inputs: ['sum'], expression: 'sum * 2' },
      ],
    };
    expect(validateFormulaSet(set)).toEqual([]);
  });

  it('flags a syntax error, naming the step', () => {
    const set: FormulaSet = {
      sheetType: 'test',
      steps: [{ name: 'broken', inputs: ['a'], expression: 'a + ' }],
    };
    const issues = validateFormulaSet(set);
    expect(issues).toHaveLength(1);
    expect(issues[0].step).toBe('broken');
  });

  it('flags a variable used but not declared as an input', () => {
    const set: FormulaSet = {
      sheetType: 'test',
      steps: [{ name: 'x', inputs: ['a'], expression: 'a + b' }],
    };
    const issues = validateFormulaSet(set);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/undeclared variable 'b'/);
  });

  it('flags a call to an unknown function', () => {
    const set: FormulaSet = {
      sheetType: 'test',
      steps: [{ name: 'x', inputs: ['a'], expression: 'BOGUS(a)' }],
    };
    const issues = validateFormulaSet(set);
    expect(issues.some((i) => /unknown function 'BOGUS'/.test(i.message))).toBe(true);
  });

  it('flags a duplicate step name', () => {
    const set: FormulaSet = {
      sheetType: 'test',
      steps: [
        { name: 'x', inputs: [], expression: '1' },
        { name: 'x', inputs: [], expression: '2' },
      ],
    };
    const issues = validateFormulaSet(set);
    expect(issues.some((i) => /Duplicate step name/.test(i.message))).toBe(true);
  });

  it('allows IF without flagging it as an unknown function', () => {
    const set: FormulaSet = {
      sheetType: 'test',
      steps: [{ name: 'x', inputs: ['a'], expression: 'IF(a = 0, 0, 1)' }],
    };
    expect(validateFormulaSet(set)).toEqual([]);
  });
});

describe('evaluateFormulaSet', () => {
  it('runs steps in order, each seeing prior steps as variables', () => {
    const set: FormulaSet = {
      sheetType: 'test',
      steps: [
        { name: 'sum', inputs: ['a', 'b'], expression: 'a + b' },
        { name: 'doubled', inputs: ['sum'], expression: 'sum * 2' },
        { name: 'final', inputs: ['doubled', 'a'], expression: 'doubled - a' },
      ],
    };
    const result = evaluateFormulaSet(set, { a: 3, b: 4 });
    expect(result).toMatchObject({ a: 3, b: 4, sum: 7, doubled: 14, final: 11 });
  });

  it('reproduces a realistic Stage-D-shaped chain: q -> b -> classified via IF', () => {
    // Mirrors relativeError.ts's b = max(q1,q2,q3) - min(q1,q2,q3) (D2),
    // and a class-limit check expressed as IF, all through the engine.
    const set: FormulaSet = {
      sheetType: 'force-iso7500-1',
      steps: [
        { name: 'q1', inputs: ['nominal', 'fi1'], expression: 'IF(fi1 = 0, 0, (nominal - fi1) / fi1 * 100)' },
        { name: 'q2', inputs: ['nominal', 'fi2'], expression: 'IF(fi2 = 0, 0, (nominal - fi2) / fi2 * 100)' },
        { name: 'q3', inputs: ['nominal', 'fi3'], expression: 'IF(fi3 = 0, 0, (nominal - fi3) / fi3 * 100)' },
        { name: 'b', inputs: ['q1', 'q2', 'q3'], expression: 'MAX(q1, q2, q3) - MIN(q1, q2, q3)' },
        { name: 'bWithinClass1', inputs: ['b'], expression: 'IF(ABS(b) <= 1, 1, 0)' },
      ],
    };
    const result = evaluateFormulaSet(set, {
      nominal: 4000, fi1: 4002.53912, fi2: 4001.28911, fi3: 4001.28911,
    });
    expect(result.q1).toBeCloseTo(-0.06343773099711544, 9);
    expect(result.b).toBeCloseTo(0.031220363929626432, 9);
    expect(result.bWithinClass1).toBe(1);
  });

  it('throws, naming the failing step, when a step references an unknown variable', () => {
    const set: FormulaSet = {
      sheetType: 'test',
      steps: [{ name: 'x', inputs: ['a'], expression: 'a + missing' }],
    };
    expect(() => evaluateFormulaSet(set, { a: 1 })).toThrow(FormulaEvaluationError);
    expect(() => evaluateFormulaSet(set, { a: 1 })).toThrow(/\[x\]/);
  });

  it('a step cannot see a LATER step (fixed evaluation order, no forward references)', () => {
    const set: FormulaSet = {
      sheetType: 'test',
      steps: [
        { name: 'first', inputs: ['second'], expression: 'second + 1' },
        { name: 'second', inputs: [], expression: '5' },
      ],
    };
    expect(() => evaluateFormulaSet(set, {})).toThrow(/Unknown variable 'second'/);
  });

  it('propagates a division-by-zero error with the step name for an unguarded formula', () => {
    const set: FormulaSet = {
      sheetType: 'test',
      steps: [{ name: 'bad', inputs: ['a'], expression: '1 / a' }],
    };
    expect(() => evaluateFormulaSet(set, { a: 0 })).toThrow(/\[bad\].*Division by zero/s);
  });
});
