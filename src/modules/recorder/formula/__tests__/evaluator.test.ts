import { describe, it, expect } from 'vitest';
import { parseExpression, parseFunctionDefinition } from '../parser';
import { MAX_CALL_DEPTH, evaluate } from '../evaluator';
import type { CellValue, CustomFunctionBinding, FormulaValue } from '../evaluator';
import { FormulaEvaluationError } from '../errors';

function fns(...sources: string[]): Record<string, CustomFunctionBinding> {
  const out: Record<string, CustomFunctionBinding> = {};
  for (const source of sources) {
    const def = parseFunctionDefinition(source);
    out[def.name] = { name: def.name, params: def.params, body: def.body };
  }
  return out;
}

function evalRow(
  source: string,
  row: Record<string, CellValue> = {},
  env: Record<string, CellValue> = {},
  customFunctions: Record<string, CustomFunctionBinding> = {},
): FormulaValue {
  return evaluate(parseExpression(source), { kind: 'row', row, env, customFunctions });
}

function evalSummary(
  source: string,
  rows: Array<Record<string, CellValue>> = [],
  env: Record<string, CellValue> = {},
  summary: Record<string, CellValue> = {},
  customFunctions: Record<string, CustomFunctionBinding> = {},
): FormulaValue {
  return evaluate(parseExpression(source), { kind: 'summary', rows, env, summary, customFunctions });
}

function errorFrom(run: () => unknown): FormulaEvaluationError {
  try {
    run();
  } catch (error) {
    if (error instanceof FormulaEvaluationError) return error;
    throw error;
  }
  throw new Error('Expected an evaluation error, but none was raised.');
}

// ── Basic evaluation ────────────────────────────────────────────────────────

describe('row context evaluation', () => {
  it('resolves a column to its value in the current row', () => {
    expect(evalRow('CAL_IND - CAL_NOM', { CAL_IND: 10.2, CAL_NOM: 10 })).toBeCloseTo(0.2, 12);
  });

  it('resolves ENV_* as a broadcast scalar', () => {
    expect(evalRow('ENV_TEMP_R1', {}, { ENV_TEMP_R1: 20.5 })).toBe(20.5);
  });

  it('evaluates a realistic temperature correction', () => {
    const value = evalRow(
      'READ_R1 * (1 + 11.5e-6 * (ENV_TEMP_R1 - 20))',
      { READ_R1: 100 },
      { ENV_TEMP_R1: 25 },
    );
    expect(value).toBeCloseTo(100 * (1 + 11.5e-6 * 5), 12);
  });

  it('evaluates the pass/fail ternary from ADR-010', () => {
    expect(evalRow('"PASS" if CAL_ERR <= CAL_TOL else "FAIL"', { CAL_ERR: 0.1, CAL_TOL: 0.5 })).toBe('PASS');
    expect(evalRow('"PASS" if CAL_ERR <= CAL_TOL else "FAIL"', { CAL_ERR: 0.9, CAL_TOL: 0.5 })).toBe('FAIL');
  });

  it('short-circuits `and` so the right side is not evaluated when unnecessary', () => {
    // Without short-circuiting this would divide by zero.
    expect(evalRow('X != 0 and 1 / X > 5', { X: 0 })).toBe(false);
  });

  it('short-circuits `or`', () => {
    expect(evalRow('X == 0 or 1 / X > 5', { X: 0 })).toBe(true);
  });
});

describe('summary context evaluation', () => {
  const rows = [{ CAL_ERR: 1 }, { CAL_ERR: 3 }, { CAL_ERR: 5 }];

  it('col_mean averages every row', () => {
    expect(evalSummary('col_mean(CAL_ERR)', rows)).toBe(3);
  });

  it('col_max / col_min', () => {
    expect(evalSummary('col_max(CAL_ERR)', rows)).toBe(5);
    expect(evalSummary('col_min(CAL_ERR)', rows)).toBe(1);
  });

  it('col_sum / col_count', () => {
    expect(evalSummary('col_sum(CAL_ERR)', rows)).toBe(9);
    expect(evalSummary('col_count(CAL_ERR)', rows)).toBe(3);
  });

  it('col_stdev uses the sample denominator', () => {
    expect(evalSummary('col_stdev(CAL_ERR)', rows)).toBeCloseTo(2, 12);
  });

  it('resolves SUMMARY_* fields already computed', () => {
    expect(evalSummary('SUMMARY_MAXDEV * 2', rows, {}, { SUMMARY_MAXDEV: 4 })).toBe(8);
  });

  it('combines an aggregate with a previously computed summary field', () => {
    expect(
      evalSummary('"PASS" if col_max(CAL_ERR) <= SUMMARY_TOL else "FAIL"', rows, {}, { SUMMARY_TOL: 10 }),
    ).toBe('PASS');
  });
});

// ── §8: context violations ──────────────────────────────────────────────────

describe('context restrictions are enforced at evaluation too', () => {
  it('rejects col_* in a row formula', () => {
    expect(errorFrom(() => evalRow('col_mean(CAL_ERR)', { CAL_ERR: 1 })).message).toBe(
      'Column aggregates can only be used in summary fields and report blocks, not in column formulas.',
    );
  });

  it('rejects SUMMARY_* in a row formula', () => {
    expect(errorFrom(() => evalRow('SUMMARY_MAXDEV', {})).message).toBe(
      'Summary fields cannot be used in column formulas.',
    );
  });

  it('rejects a bare column reference in a summary field', () => {
    expect(errorFrom(() => evalSummary('CAL_ERR', [{ CAL_ERR: 1 }])).message).toMatch(
      /has no single value in a summary field/,
    );
  });
});

// ── §8: strict empty propagation ────────────────────────────────────────────

describe('strict empty semantics — empty is empty, never zero', () => {
  it('raises awaiting-input when a referenced column is empty', () => {
    const error = errorFrom(() => evalRow('CAL_IND + 1', { CAL_IND: null }));
    expect(error.kind).toBe('awaiting-input');
    expect(error.message).toMatch(/has no value yet/);
  });

  it('treats a missing key as empty', () => {
    expect(errorFrom(() => evalRow('CAL_IND + 1', { CAL_IND: undefined })).kind).toBe('awaiting-input');
  });

  it('treats an empty string as empty', () => {
    expect(errorFrom(() => evalRow('CAL_IND + 1', { CAL_IND: '' })).kind).toBe('awaiting-input');
  });

  it('does NOT treat 0 as empty', () => {
    expect(evalRow('CAL_IND + 1', { CAL_IND: 0 })).toBe(1);
  });

  it('propagates an empty through nested calls', () => {
    expect(errorFrom(() => evalRow('ROUND(ABS(CAL_IND), 2)', { CAL_IND: null })).kind).toBe('awaiting-input');
  });

  it('raises awaiting-input when an ENV value is not recorded yet', () => {
    expect(errorFrom(() => evalRow('ENV_TEMP_R1 + 1', {}, { ENV_TEMP_R1: null })).kind).toBe('awaiting-input');
  });

  it('aggregates error when ANY row is empty — they do not skip empties', () => {
    const rows = [{ CAL_ERR: 1 }, { CAL_ERR: null }, { CAL_ERR: 3 }];
    const error = errorFrom(() => evalSummary('col_mean(CAL_ERR)', rows));
    expect(error.kind).toBe('awaiting-input');
    expect(error.message).toMatch(/not filled in for every row/);
  });

  it('aggregates error over an empty row set', () => {
    expect(errorFrom(() => evalSummary('col_mean(CAL_ERR)', [])).kind).toBe('awaiting-input');
  });

  it('col_count also errors on an incomplete column, per §6', () => {
    const rows = [{ CAL_ERR: 1 }, { CAL_ERR: null }];
    expect(errorFrom(() => evalSummary('col_count(CAL_ERR)', rows)).kind).toBe('awaiting-input');
  });
});

describe('invalid computations are distinguished from awaiting input', () => {
  it('division by zero is invalid-computation', () => {
    const error = errorFrom(() => evalRow('1 / X', { X: 0 }));
    expect(error.kind).toBe('invalid-computation');
    expect(error.message).toBe('Division by zero.');
  });

  it('SQRT of a negative is invalid-computation', () => {
    expect(errorFrom(() => evalRow('SQRT(X)', { X: -1 })).kind).toBe('invalid-computation');
  });

  it('arithmetic on text is invalid-computation', () => {
    expect(errorFrom(() => evalRow('X + 1', { X: 'abc' })).kind).toBe('invalid-computation');
  });

  it('ordering comparison across types is invalid-computation', () => {
    expect(errorFrom(() => evalRow('X < 1', { X: 'abc' })).kind).toBe('invalid-computation');
  });

  it('an unknown column is invalid-computation, not awaiting-input', () => {
    expect(errorFrom(() => evalRow('NOPE + 1', {})).kind).toBe('invalid-computation');
  });

  it('overflow to Infinity is invalid-computation', () => {
    expect(errorFrom(() => evalRow('1e308 * 10')).kind).toBe('invalid-computation');
  });
});

describe('equality comparison across types', () => {
  it('== across different types is false rather than an error', () => {
    expect(evalRow('X == 1', { X: 'abc' })).toBe(false);
    expect(evalRow('X != 1', { X: 'abc' })).toBe(true);
  });

  it('compares text for equality', () => {
    expect(evalRow('X == "PASS"', { X: 'PASS' })).toBe(true);
  });

  it('orders text lexicographically when both sides are text', () => {
    expect(evalRow('"a" < "b"')).toBe(true);
  });
});

// ── §8: no rounding occurs during evaluation ────────────────────────────────

describe('numeric precision — evaluation never rounds (ADR-011)', () => {
  it('leaves binary floating-point error visible rather than tidying it', () => {
    // If any rounding were applied this would be 0.3.
    expect(evalRow('0.1 + 0.2')).toBe(0.30000000000000004);
  });

  it('keeps full precision through division', () => {
    expect(evalRow('1 / 3')).toBe(1 / 3);
  });

  it('does not round intermediate results in a chain', () => {
    // (1/3)*3 in full precision is exactly 1; rounding intermediates would not be.
    expect(evalRow('1 / 3 * 3')).toBe(1);
  });

  it('col_mean averages true stored values, not displayed ones', () => {
    const rows = [{ V: 0.1 }, { V: 0.2 }];
    expect(evalSummary('col_mean(V)', rows)).toBe((0.1 + 0.2) / 2);
  });

  it('only rounds where ROUND is explicitly called', () => {
    expect(evalRow('ROUND(1 / 3, 3)')).toBe(0.333);
    expect(evalRow('1 / 3')).not.toBe(0.333);
  });
});

// ── Custom functions ────────────────────────────────────────────────────────

describe('custom functions', () => {
  it('calls a one-level function with column arguments', () => {
    const library = fns('def error(nominal, indicated):\n    return indicated - nominal');
    expect(evalRow('error(CAL_NOM, CAL_IND)', { CAL_NOM: 10, CAL_IND: 10.5 }, {}, library)).toBe(0.5);
  });

  it('lets a custom function call another custom function', () => {
    const library = fns(
      'def error(nominal, indicated):\n    return indicated - nominal',
      'def percent_error(nominal, indicated):\n    return error(nominal, indicated) / nominal * 100',
    );
    expect(evalRow('percent_error(200, 202)', {}, {}, library)).toBeCloseTo(1, 12);
  });

  it('mixes a custom function with inline arithmetic', () => {
    const library = fns('def error(nominal, indicated):\n    return indicated - nominal');
    expect(evalRow('error(10, 11) * 1.02', {}, {}, library)).toBeCloseTo(1.02, 12);
  });

  it('a function body cannot reach a column directly', () => {
    const library = fns('def sneaky(a):\n    return a + CAL_IND');
    const error = errorFrom(() => evalRow('sneaky(1)', { CAL_IND: 5 }, {}, library));
    expect(error.message).toMatch(/not a parameter of this function/);
  });

  it('a function body cannot use a column aggregate', () => {
    const library = fns('def sneaky(a):\n    return a + col_mean(V)');
    expect(errorFrom(() => evalSummary('sneaky(1)', [{ V: 1 }], {}, {}, library)).message).toBe(
      'Column aggregates cannot be used inside a custom function.',
    );
  });

  it('rejects a call with the wrong number of arguments', () => {
    const library = fns('def error(nominal, indicated):\n    return indicated - nominal');
    expect(errorFrom(() => evalRow('error(1)', {}, {}, library)).message).toMatch(/expects 2 argument/);
  });

  it('rejects an unknown function', () => {
    expect(errorFrom(() => evalRow('nope(1)')).message).toMatch(/Unknown function 'nope'/);
  });

  it('enforces a recursion-depth cap as defence in depth (§5)', () => {
    // The validator rejects cycles at authoring time; this proves that if one
    // ever slipped through, it degrades to an error rather than a hung browser.
    const recursive = parseFunctionDefinition('def loop(a):\n    return loop(a)');
    const library = { loop: { name: 'loop', params: ['a'], body: recursive.body } };
    const error = errorFrom(() => evalRow('loop(1)', {}, {}, library));
    expect(error.kind).toBe('invalid-computation');
    expect(error.message).toContain(String(MAX_CALL_DEPTH));
  });

  it('allows nesting well below the cap', () => {
    const library = fns(
      'def a(x):\n    return b(x) + 1',
      'def b(x):\n    return c(x) + 1',
      'def c(x):\n    return x + 1',
    );
    expect(evalRow('a(0)', {}, {}, library)).toBe(3);
  });
});
