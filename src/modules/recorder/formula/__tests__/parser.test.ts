import { describe, it, expect } from 'vitest';
import { parseExpression, parseFunctionDefinition } from '../parser';
import { FormulaSyntaxError } from '../errors';
import { evaluate } from '../evaluator';
import type { ExpressionNode } from '../ast';

/** Parses and evaluates a constant expression — no columns involved. */
function evalConstant(source: string): number | string | boolean {
  return evaluate(parseExpression(source), {
    kind: 'row',
    row: {},
    env: {},
    customFunctions: {},
  });
}

function parseError(source: string): FormulaSyntaxError {
  try {
    parseExpression(source);
  } catch (error) {
    if (error instanceof FormulaSyntaxError) return error;
    throw error;
  }
  throw new Error(`Expected '${source}' to fail parsing, but it succeeded.`);
}

// ── §8: grammar conformance table ───────────────────────────────────────────

describe('grammar conformance — every production accepts its valid forms', () => {
  const valid: Array<[string, string]> = [
    ['number', '42'],
    ['number with decimals', '3.5'],
    ['string', '"PASS"'],
    ['identifier', 'CAL_IND'],
    ['call, no arguments', 'SUM(1)'],
    ['call, several arguments', 'MAX(1, 2, 3)'],
    ['parenthesised expression', '(1 + 2) * 3'],
    ['power', '2 ** 8'],
    ['unary minus', '-5'],
    ['multiplicative *', '6 * 7'],
    ['multiplicative /', '84 / 2'],
    ['additive +', '1 + 2'],
    ['additive -', '9 - 4'],
    ['comparison ==', '1 == 1'],
    ['comparison !=', '1 != 2'],
    ['comparison <', '1 < 2'],
    ['comparison <=', '1 <= 1'],
    ['comparison >', '2 > 1'],
    ['comparison >=', '2 >= 2'],
    ['not', 'not 0'],
    ['and', '1 and 1'],
    ['or', '0 or 1'],
    ['ternary', '"PASS" if 1 < 2 else "FAIL"'],
    ['nested ternary in else branch', '1 if 0 else 2 if 1 else 3'],
  ];

  it.each(valid)('parses %s: %s', (_label, source) => {
    expect(() => parseExpression(source)).not.toThrow();
  });

  const invalid: Array<[string, string]> = [
    ['empty source', ''],
    ['dangling operator', '1 +'],
    ['unclosed parenthesis', '(1 + 2'],
    ['unclosed call', 'MAX(1, 2'],
    ['missing else in ternary', '1 if 2'],
    ['double unary minus', '--5'],
    ['indexing', 'x[0]'],
    ['attribute access', 'x.y'],
    ['assignment', 'x = 1'],
    ['lambda', 'lambda x: x'],
    ['trailing junk', '1 2'],
    ['leading decimal point', '.5'],
    ['unterminated string', '"abc'],
  ];

  it.each(invalid)('rejects %s: %s', (_label, source) => {
    expect(() => parseExpression(source)).toThrow(FormulaSyntaxError);
  });
});

describe('grammar conformance — funcdef', () => {
  it('parses a single-return function definition', () => {
    const def = parseFunctionDefinition('def error(nominal, indicated):\n    return indicated - nominal');
    expect(def.name).toBe('error');
    expect(def.params).toEqual(['nominal', 'indicated']);
    expect(def.body.type).toBe('Binary');
  });

  it('parses a zero-parameter function', () => {
    const def = parseFunctionDefinition('def two():\n    return 2');
    expect(def.params).toEqual([]);
  });

  it('rejects a body with more than one statement', () => {
    expect(() =>
      parseFunctionDefinition('def f(a):\n    return a\n    return a'),
    ).toThrow(/exactly one `return`/);
  });

  it('rejects a missing return', () => {
    expect(() => parseFunctionDefinition('def f(a):\n    a + 1')).toThrow(FormulaSyntaxError);
  });

  it('reports syntax errors with a line and column', () => {
    try {
      parseFunctionDefinition('def f(a):\n    return a +');
      throw new Error('expected a syntax error');
    } catch (error) {
      expect(error).toBeInstanceOf(FormulaSyntaxError);
      const syntaxError = error as FormulaSyntaxError;
      expect(syntaxError.line).toBe(2);
      expect(syntaxError.column).toBeGreaterThan(0);
    }
  });
});

// ── §8: precedence ──────────────────────────────────────────────────────────

describe('precedence', () => {
  // The two consequences FORMULA_GRAMMAR.md §2 explicitly requires be preserved,
  // both matching Python.
  it('-2 ** 2 === -4 — unary minus binds looser than **', () => {
    expect(evalConstant('-2 ** 2')).toBe(-4);
  });

  it('2 ** 3 ** 2 === 512 — ** is right-associative', () => {
    expect(evalConstant('2 ** 3 ** 2')).toBe(512);
  });

  it('* binds tighter than +', () => {
    expect(evalConstant('1 + 2 * 3')).toBe(7);
  });

  it('parentheses override precedence', () => {
    expect(evalConstant('(1 + 2) * 3')).toBe(9);
  });

  it('comparison binds looser than arithmetic', () => {
    expect(evalConstant('1 + 1 == 2')).toBe(true);
  });

  it('not binds looser than comparison', () => {
    expect(evalConstant('not 1 > 2')).toBe(true);
  });

  it('and binds tighter than or', () => {
    // (0 and 0) or 1  →  true ; 0 and (0 or 1) would be false
    expect(evalConstant('0 and 0 or 1')).toBe(true);
  });

  it('ternary is the loosest form', () => {
    expect(evalConstant('1 + 1 if 2 > 1 else 9 + 9')).toBe(2);
  });

  it('- applies to the whole power expression, not just the base', () => {
    expect(evalConstant('-3 ** 2')).toBe(-9);
  });

  it('allows a negative exponent', () => {
    expect(evalConstant('2 ** -1')).toBe(0.5);
  });
});

// ── §8: scientific notation literals ────────────────────────────────────────

describe('scientific notation literals', () => {
  it('parses 11.5e-6 (coefficient of thermal expansion)', () => {
    expect(evalConstant('11.5e-6')).toBe(11.5e-6);
  });

  it('parses 7.882E+21', () => {
    expect(evalConstant('7.882E+21')).toBe(7.882e21);
  });

  it('parses 1e-3', () => {
    expect(evalConstant('1e-3')).toBe(1e-3);
  });

  it('parses an exponent with no sign', () => {
    expect(evalConstant('2e3')).toBe(2000);
  });

  it('does not swallow a following `else` as an exponent', () => {
    expect(evalConstant('1 if 0 else 2')).toBe(2);
  });
});

// ── §8: error-message snapshots for every §2 restriction ────────────────────

describe('§2 deliberate restrictions — exact required messages', () => {
  it('rejects chained comparisons', () => {
    expect(parseError('0 < 5 < 10').message).toBe(
      'Chained comparisons are not supported. Write `0 < x and x < 10` instead.',
    );
  });

  it('rejects repeated not', () => {
    expect(parseError('not not 1').message).toBe('Repeated `not` is not supported.');
  });

  it('rejects floor division', () => {
    expect(parseError('7 // 2').message).toBe('`//` is not supported. Use `/`.');
  });

  it('rejects modulo', () => {
    expect(parseError('7 % 2').message).toBe('`%` is not supported.');
  });

  it('rejects escaped quotes inside text', () => {
    expect(parseError('"say \\"hi\\""').message).toBe(
      'Quotes cannot be used inside text. Use different wording.',
    );
  });

  it('reports restriction errors with a position', () => {
    const error = parseError('0 < 5 < 10');
    expect(error.line).toBe(1);
    expect(error.column).toBeGreaterThan(1);
  });
});

// ── AST shape ───────────────────────────────────────────────────────────────

describe('AST shape', () => {
  it('records source order for the ternary, not evaluation order', () => {
    const ast = parseExpression('"PASS" if 1 else "FAIL"') as Extract<ExpressionNode, { type: 'Ternary' }>;
    expect(ast.type).toBe('Ternary');
    expect(ast.whenTrue).toMatchObject({ type: 'StringLiteral', value: 'PASS' });
    expect(ast.whenFalse).toMatchObject({ type: 'StringLiteral', value: 'FAIL' });
  });

  it('treats ENV_ and SUMMARY_ names as ordinary identifiers (ADR-009: no grammar change)', () => {
    expect(parseExpression('ENV_TEMP_R1')).toMatchObject({ type: 'Identifier', name: 'ENV_TEMP_R1' });
    expect(parseExpression('SUMMARY_MAXDEV')).toMatchObject({ type: 'Identifier', name: 'SUMMARY_MAXDEV' });
  });

  it('ignores comments', () => {
    expect(evalConstant('1 + 1  # add them up')).toBe(2);
  });
});
