import { describe, it, expect } from 'vitest';
import { tokenize, FormulaSyntaxError } from '../lexer';

describe('tokenize', () => {
  it('tokenizes numbers, identifiers, operators, parens, commas', () => {
    const tokens = tokenize('MAX(q1, q2, q3) - MIN(q1, q2, q3)');
    expect(tokens.map((t) => t.type)).toEqual([
      'identifier', 'lparen', 'identifier', 'comma', 'identifier', 'comma',
      'identifier', 'rparen', 'operator', 'identifier', 'lparen', 'identifier',
      'comma', 'identifier', 'comma', 'identifier', 'rparen', 'eof',
    ]);
  });

  it('parses integers, decimals, and scientific notation', () => {
    const tokens = tokenize('1 2.5 .5 1e10 1.5E-3');
    const values = tokens.filter((t) => t.type === 'number').map((t) => t.value);
    expect(values).toEqual(['1', '2.5', '.5', '1e10', '1.5E-3']);
  });

  it('recognizes two-character comparison operators before single-character ones', () => {
    const tokens = tokenize('a <= b >= c <> d < e > f = g');
    const ops = tokens.filter((t) => t.type === 'operator').map((t) => t.value);
    expect(ops).toEqual(['<=', '>=', '<>', '<', '>', '=']);
  });

  it('skips whitespace', () => {
    const tokens = tokenize('  a\t+\n b  ');
    expect(tokens.map((t) => t.type)).toEqual(['identifier', 'operator', 'identifier', 'eof']);
  });

  it('allows underscores in identifiers', () => {
    const [t] = tokenize('u_cal');
    expect(t).toMatchObject({ type: 'identifier', value: 'u_cal' });
  });

  it('throws FormulaSyntaxError with position on an invalid character', () => {
    expect(() => tokenize('a & b')).toThrow(FormulaSyntaxError);
    try {
      tokenize('a & b');
    } catch (err) {
      expect(err).toBeInstanceOf(FormulaSyntaxError);
      expect((err as FormulaSyntaxError).pos).toBe(3);
    }
  });
});
