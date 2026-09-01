/**
 * traceGoldenFixtures.ts
 *
 * Shared golden-case data for the Phase 32/33 trace tests. Extracted so
 * Phase 33's substitution-invariant gate (traceSubstitutionInvariant.test.ts)
 * can reuse the SAME cases `trace.test.ts` already pins, without modifying
 * `trace.test.ts` — Phase 33's constraints forbid touching existing tests.
 *
 * Not itself a test file (no `describe`/`it`), so it carries no test count.
 */

import type { CellValue, CustomFunctionBinding, EvaluationContext } from '../evaluator';
import { parseFunctionDefinition } from '../parser';

export function fns(...sources: string[]): Record<string, CustomFunctionBinding> {
  const out: Record<string, CustomFunctionBinding> = {};
  for (const source of sources) {
    const def = parseFunctionDefinition(source);
    out[def.name] = { name: def.name, params: def.params, body: def.body };
  }
  return out;
}

export const row = (
  r: Record<string, CellValue> = {},
  env: Record<string, CellValue> = {},
  std: Record<string, CellValue> | null = null,
  customFunctions: Record<string, CustomFunctionBinding> = {},
): EvaluationContext => ({ kind: 'row', row: r, env, std, customFunctions });

export const summary = (
  rows: Array<Record<string, CellValue>> = [],
  env: Record<string, CellValue> = {},
  sum: Record<string, CellValue> = {},
  customFunctions: Record<string, CustomFunctionBinding> = {},
): EvaluationContext => ({ kind: 'summary', rows, env, summary: sum, customFunctions });

export const block = (
  b: Record<string, CellValue> = {},
  rows: Array<Record<string, CellValue>> = [],
  env: Record<string, CellValue> = {},
  sum: Record<string, CellValue> = {},
): EvaluationContext => ({ kind: 'block', block: b, rows, env, summary: sum, customFunctions: {} });

export const LIB = fns(
  'def error(nominal, indicated):\n    return indicated - nominal',
  'def percent_error(nominal, indicated):\n    return error(nominal, indicated) / nominal * 100',
  'def a(x):\n    return b(x) + 1',
  'def b(x):\n    return c(x) + 1',
  'def c(x):\n    return x + 1',
);
export const LIB_SOURCES = {
  error: 'indicated - nominal',
  percent_error: 'error(nominal, indicated) / nominal * 100',
  a: 'b(x) + 1',
  b: 'c(x) + 1',
  c: 'x + 1',
};

/**
 * Every value-producing / error case the Phase 32 suite pins (mirrors
 * trace.test.ts's GOLDEN array; see file header for why this is a copy
 * rather than a shared import).
 */
export const GOLDEN: Array<[string, string, EvaluationContext]> = [
  ['column difference', 'CAL_IND - CAL_NOM', row({ CAL_IND: 10.2, CAL_NOM: 10 })],
  ['env scalar', 'ENV_TEMP_R1', row({}, { ENV_TEMP_R1: 20.5 })],
  ['temperature correction', 'READ_R1 * (1 + 11.5e-6 * (ENV_TEMP_R1 - 20))', row({ READ_R1: 100 }, { ENV_TEMP_R1: 25 })],
  ['ternary pass', '"PASS" if CAL_ERR <= CAL_TOL else "FAIL"', row({ CAL_ERR: 0.1, CAL_TOL: 0.5 })],
  ['ternary fail', '"PASS" if CAL_ERR <= CAL_TOL else "FAIL"', row({ CAL_ERR: 0.9, CAL_TOL: 0.5 })],
  ['and short-circuit', 'X != 0 and 1 / X > 5', row({ X: 0 })],
  ['or short-circuit', 'X == 0 or 1 / X > 5', row({ X: 0 })],
  ['zero is not empty', 'CAL_IND + 1', row({ CAL_IND: 0 })],
  ['float artifact preserved', '0.1 + 0.2', row()],
  ['division precision', '1 / 3', row()],
  ['no intermediate rounding', '1 / 3 * 3', row()],
  ['explicit ROUND only', 'ROUND(1 / 3, 3)', row()],
  ['cross-type equality', 'X == 1', row({ X: 'abc' })],
  ['cross-type inequality', 'X != 1', row({ X: 'abc' })],
  ['text equality', 'X == "PASS"', row({ X: 'PASS' })],
  ['text ordering', '"a" < "b"', row()],
  ['unary minus', '-CAL_X + 1', row({ CAL_X: 5 })],
  ['not', 'not X', row({ X: 0 })],
  ['ABS', 'ABS(0 - 7.5)', row()],
  ['SQRT', 'SQRT(CAL_X)', row({ CAL_X: 16 })],
  ['ROUND half away from zero', 'ROUND(2.5, 0)', row()],
  ['TRUNC one arg', 'TRUNC(3.99)', row()],
  ['TRUNC two args', 'TRUNC(3.999, 2)', row()],
  ['MAX variadic', 'MAX(1, 9, 3)', row()],
  ['MIN variadic', 'MIN(1, 9, 3)', row()],
  ['AVERAGE', 'AVERAGE(1, 2, 3, 4)', row()],
  ['SUM', 'SUM(1, 2, 3)', row()],
  ['RSS', 'RSS(3, 4)', row()],
  ['STDEV', 'STDEV(1, 2, 3, 4)', row()],
  ['TINV', 'TINV(0.05, 10)', row()],
  ['nested builtins', 'ROUND(SQRT(ABS(0 - 2)), 4)', row()],
  ['power', 'CAL_X ** 2', row({ CAL_X: 3 })],
  ['std coefficients', 'STD_C0 + STD_C1 * CAL_R', row({ CAL_R: 2 }, {}, { STD_C0: 0.5, STD_C1: 2.5 })],
  ['report unit', 'CAL_F * STD_TO_N / REPORT_TO_N', row({ CAL_F: 5 }, { REPORT_TO_N: 1000 }, { STD_TO_N: 1 })],
  ['col_mean', 'col_mean(CAL_ERR)', summary([{ CAL_ERR: 1 }, { CAL_ERR: 3 }, { CAL_ERR: 5 }])],
  ['col_max', 'col_max(CAL_ERR)', summary([{ CAL_ERR: 1 }, { CAL_ERR: 3 }, { CAL_ERR: 5 }])],
  ['col_min', 'col_min(CAL_ERR)', summary([{ CAL_ERR: 1 }, { CAL_ERR: 3 }, { CAL_ERR: 5 }])],
  ['col_sum', 'col_sum(CAL_ERR)', summary([{ CAL_ERR: 1 }, { CAL_ERR: 3 }, { CAL_ERR: 5 }])],
  ['col_count', 'col_count(CAL_ERR)', summary([{ CAL_ERR: 1 }, { CAL_ERR: 3 }, { CAL_ERR: 5 }])],
  ['col_stdev', 'col_stdev(CAL_ERR)', summary([{ CAL_ERR: 1 }, { CAL_ERR: 3 }, { CAL_ERR: 5 }])],
  ['aggregate uses unrounded values', 'col_mean(V)', summary([{ V: 0.1 }, { V: 0.2 }])],
  ['summary reference', 'SUMMARY_MAXDEV * 2', summary([], {}, { SUMMARY_MAXDEV: 4 })],
  ['aggregate with summary', '"PASS" if col_max(CAL_ERR) <= SUMMARY_TOL else "FAIL"',
    summary([{ CAL_ERR: 1 }, { CAL_ERR: 3 }], {}, { SUMMARY_TOL: 10 })],
  ['two aggregates', 'col_max(CAL_ERR) - col_min(CAL_ERR)', summary([{ CAL_ERR: 1 }, { CAL_ERR: 5 }])],
  ['block own column', 'BLK_U * 2', block({ BLK_U: 4 })],
  ['block with aggregate and summary', 'BLK_U * SUMMARY_K + col_mean(CAL_ERR)',
    block({ BLK_U: 4 }, [{ CAL_ERR: 1 }, { CAL_ERR: 3 }], {}, { SUMMARY_K: 2 })],
  ['custom fn with columns', 'error(CAL_NOM, CAL_IND)', row({ CAL_NOM: 10, CAL_IND: 10.5 }, {}, null, LIB)],
  ['custom fn calling custom fn', 'percent_error(200, 202)', row({}, {}, null, LIB)],
  ['custom fn with arithmetic', 'error(10, 11) * 1.02', row({}, {}, null, LIB)],
  ['three-deep nesting', 'a(0)', row({}, {}, null, LIB)],
  ['divide by zero', '1 / X', row({ X: 0 })],
  ['SQRT negative', 'SQRT(X)', row({ X: -1 })],
  ['arithmetic on text', 'X + 1', row({ X: 'abc' })],
  ['ordering across types', 'X < 1', row({ X: 'abc' })],
  ['unknown column', 'NOPE + 1', row()],
  ['overflow', '1e308 * 10', row()],
  ['empty column', 'CAL_IND + 1', row({ CAL_IND: null })],
  ['missing key', 'CAL_IND + 1', row({ CAL_IND: undefined })],
  ['empty string', 'CAL_IND + 1', row({ CAL_IND: '' })],
  ['empty env', 'ENV_TEMP_R1 + 1', row({}, { ENV_TEMP_R1: null })],
  ['empty through nested calls', 'ROUND(ABS(CAL_IND), 2)', row({ CAL_IND: null })],
  ['aggregate with an empty row', 'col_mean(CAL_ERR)', summary([{ CAL_ERR: 1 }, { CAL_ERR: null }])],
  ['aggregate over no rows', 'col_mean(CAL_ERR)', summary([])],
  ['col_stdev needs two rows', 'col_stdev(CAL_ERR)', summary([{ CAL_ERR: 1 }])],
  ['col_* in a row formula', 'col_mean(CAL_ERR)', row({ CAL_ERR: 1 })],
  ['SUMMARY_* in a row formula', 'SUMMARY_MAXDEV', row()],
  ['bare column in a summary', 'CAL_ERR', summary([{ CAL_ERR: 1 }])],
  ['STD_* in a summary', 'STD_C0', summary([])],
  ['STD_* with no standard selected', 'STD_C0 + 1', row({}, {}, null)],
  ['unknown function', 'nope(1)', row()],
  ['wrong argument count', 'error(1)', row({}, {}, null, LIB)],
  ['function body cannot reach a column', 'sneaky(1)',
    row({ CAL_IND: 5 }, {}, null, fns('def sneaky(a):\n    return a + CAL_IND'))],
];

/**
 * Additional cases exercising deeper nesting than GOLDEN alone reaches —
 * mirrors the scenarios in trace.test.ts's "nested computed inputs" /
 * "column aggregates" / "all three evaluation contexts" describe blocks, so
 * the gate walks the same tree shapes those tests already assert on.
 */
export const NESTED_CASES: Array<[string, string, EvaluationContext, Record<string, unknown>]> = [
  ['nested custom fn calling custom fn', 'percent_error(CAL_NOM, CAL_IND)',
    row({ CAL_NOM: 200, CAL_IND: 202 }, {}, null, LIB), { functionSources: LIB_SOURCES, rowIndex: 0 }],
  ['same function called twice', 'f(1) + f(2)',
    row({}, {}, null, fns('def f(x):\n    return x * 10')), { functionSources: { f: 'x * 10' } }],
  ['two aggregates over one column', 'col_max(CAL_ERR) - col_min(CAL_ERR)',
    summary([{ CAL_ERR: 0.2 }, { CAL_ERR: 0.5 }, { CAL_ERR: 0.1 }]), {}],
  ['summary aggregate plus scalar', 'col_mean(CAL_ERR) + SUMMARY_K',
    summary([{ CAL_ERR: 2 }, { CAL_ERR: 4 }], {}, { SUMMARY_K: 1 }), {}],
  ['block aggregate and summary combined', 'BLK_U * SUMMARY_K + col_mean(CAL_ERR)',
    block({ BLK_U: 4 }, [{ CAL_ERR: 1 }, { CAL_ERR: 3 }], {}, { SUMMARY_K: 2 }), {}],
  ['formula-column reference (un-spliced)', 'CAL_CALC * 2',
    row({ CAL_CALC: 9 }), { formulaColumns: ['CAL_CALC'] }],
  ['untaken ternary branch names a variable resolved nowhere else',
    '"PASS" if CAL_ERR <= CAL_TOL else FAIL_MSG',
    row({ CAL_ERR: 0.1, CAL_TOL: 0.5, FAIL_MSG: 'FAIL' }), {}],
  ['six-provenance expression', 'CAL_IND * STD_C1 + ENV_TEMP_R1 / REPORT_TO_N + CAL_CALC + scale(2)',
    row({ CAL_IND: 2, CAL_CALC: 9 }, { ENV_TEMP_R1: 20, REPORT_TO_N: 1000 }, { STD_C1: 3 },
      fns('def scale(k):\n    return k * 1')),
    { rowIndex: 1, formulaColumns: ['CAL_CALC'], functionSources: { scale: 'k * 1' } }],
];
