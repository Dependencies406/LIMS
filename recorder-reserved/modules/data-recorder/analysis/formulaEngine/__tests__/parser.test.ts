import { describe, it, expect } from 'vitest';
import { parseFormula } from '../parser';
import { FormulaSyntaxError } from '../lexer';

describe('parseFormula — precedence and associativity', () => {
  it('multiplicative binds tighter than additive', () => {
    expect(parseFormula('1 + 2 * 3')).toEqual({
      kind: 'binary', op: '+',
      left: { kind: 'number', value: 1 },
      right: {
        kind: 'binary', op: '*',
        left: { kind: 'number', value: 2 },
        right: { kind: 'number', value: 3 },
      },
    });
  });

  it('power binds tighter than unary minus (Excel: -2^2 = -4)', () => {
    const ast = parseFormula('-2^2');
    expect(ast).toEqual({
      kind: 'unary', op: '-',
      operand: {
        kind: 'binary', op: '^',
        left: { kind: 'number', value: 2 },
        right: { kind: 'number', value: 2 },
      },
    });
  });

  it('power is right-associative: 2^3^2 = 2^(3^2)', () => {
    const ast = parseFormula('2^3^2');
    expect(ast).toEqual({
      kind: 'binary', op: '^',
      left: { kind: 'number', value: 2 },
      right: {
        kind: 'binary', op: '^',
        left: { kind: 'number', value: 3 },
        right: { kind: 'number', value: 2 },
      },
    });
  });

  it('parentheses override precedence', () => {
    const ast = parseFormula('(1 + 2) * 3');
    expect(ast).toEqual({
      kind: 'binary', op: '*',
      left: {
        kind: 'binary', op: '+',
        left: { kind: 'number', value: 1 },
        right: { kind: 'number', value: 2 },
      },
      right: { kind: 'number', value: 3 },
    });
  });

  it('comparison has the lowest precedence', () => {
    const ast = parseFormula('1 + 2 = 3');
    expect(ast).toEqual({
      kind: 'binary', op: '=',
      left: {
        kind: 'binary', op: '+',
        left: { kind: 'number', value: 1 },
        right: { kind: 'number', value: 2 },
      },
      right: { kind: 'number', value: 3 },
    });
  });

  it('parses function calls with multiple arguments, uppercasing the name', () => {
    const ast = parseFormula('max(q1, q2, q3)');
    expect(ast).toEqual({
      kind: 'call', name: 'MAX',
      args: [
        { kind: 'variable', name: 'q1' },
        { kind: 'variable', name: 'q2' },
        { kind: 'variable', name: 'q3' },
      ],
    });
  });

  it('parses a nested, realistic Stage-D-style formula without throwing', () => {
    expect(() => parseFormula('IF(fi1 = 0, 0, (calPoint - fi1) / fi1 * 100)')).not.toThrow();
    expect(() => parseFormula('SQRT(uRep^2 + uRes^2 + uStd^2)')).not.toThrow();
  });

  it('parses zero-argument-looking but valid unary chains', () => {
    expect(parseFormula('- - 5')).toEqual({
      kind: 'unary', op: '-',
      operand: { kind: 'unary', op: '-', operand: { kind: 'number', value: 5 } },
    });
  });
});

describe('parseFormula — syntax errors', () => {
  it('rejects a trailing token after a complete expression', () => {
    expect(() => parseFormula('1 + 2 3')).toThrow(FormulaSyntaxError);
  });

  it('rejects an unclosed paren', () => {
    expect(() => parseFormula('(1 + 2')).toThrow(FormulaSyntaxError);
  });

  it('rejects a dangling operator', () => {
    expect(() => parseFormula('1 +')).toThrow(FormulaSyntaxError);
  });

  it('rejects an empty expression', () => {
    expect(() => parseFormula('')).toThrow(FormulaSyntaxError);
  });

  it('rejects a stray comma outside a call', () => {
    expect(() => parseFormula('1, 2')).toThrow(FormulaSyntaxError);
  });
});
