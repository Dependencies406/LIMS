/**
 * trace.test.ts
 *
 * Phase 32 — the Calculation Trace (ADR-018 D2/D3).
 *
 * The load-bearing test here is the FIRST one: `traceExpression(...).value`
 * must equal `evaluate(...)` for every case the existing suite pins. If the
 * two ever disagree, the trace documents something the system does not do,
 * which ADR-018 names as this design's largest technical risk.
 *
 * The golden set is the existing formula suite. `STAGE_D_GOLDEN_DATA.json`
 * exists in the repo but is NOT usable here: it lives under
 * `recorder-reserved/`, which `security.test.ts` structurally forbids this
 * module from referencing, and it is an oracle for the retired Stage D
 * analysis module (relativeError.ts / uncertaintyBudget.ts) shaped as
 * workbook extractions rather than formula cases. Recorded in
 * docs/PHASE_32_RESULT.md rather than worked around.
 */

import { describe, it, expect } from 'vitest';
import { evaluate } from '../evaluator';
import type { CellValue, CustomFunctionBinding, EvaluationContext, FormulaValue } from '../evaluator';
import { FormulaEvaluationError } from '../errors';
import { parseExpression, parseFunctionDefinition } from '../parser';
import {
  TRACE_PROVENANCES,
  traceExpression,
  traceNodeToLine,
  type ComputedTraceNode,
  type TraceNode,
  type TraceOptions,
} from '../trace';

function fns(...sources: string[]): Record<string, CustomFunctionBinding> {
  const out: Record<string, CustomFunctionBinding> = {};
  for (const source of sources) {
    const def = parseFunctionDefinition(source);
    out[def.name] = { name: def.name, params: def.params, body: def.body };
  }
  return out;
}

const row = (
  r: Record<string, CellValue> = {},
  env: Record<string, CellValue> = {},
  std: Record<string, CellValue> | null = null,
  customFunctions: Record<string, CustomFunctionBinding> = {},
): EvaluationContext => ({ kind: 'row', row: r, env, std, customFunctions });

const summary = (
  rows: Array<Record<string, CellValue>> = [],
  env: Record<string, CellValue> = {},
  sum: Record<string, CellValue> = {},
  customFunctions: Record<string, CustomFunctionBinding> = {},
): EvaluationContext => ({ kind: 'summary', rows, env, summary: sum, customFunctions });

const block = (
  b: Record<string, CellValue> = {},
  rows: Array<Record<string, CellValue>> = [],
  env: Record<string, CellValue> = {},
  sum: Record<string, CellValue> = {},
): EvaluationContext => ({ kind: 'block', block: b, rows, env, summary: sum, customFunctions: {} });

/** What an evaluation did: a value, or the error it raised. */
type Outcome = { ok: true; value: FormulaValue } | { ok: false; kind: string; message: string };

function outcomeOf(run: () => FormulaValue): Outcome {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    if (error instanceof FormulaEvaluationError) {
      return { ok: false, kind: error.kind, message: error.message };
    }
    throw error;
  }
}

function traceOutcome(source: string, context: EvaluationContext, options: TraceOptions = {}): Outcome {
  const node = traceExpression(source, context, options);
  if (node.error) return { ok: false, kind: node.error.kind, message: node.error.message };
  return { ok: true, value: node.value as FormulaValue };
}

const LIB = fns(
  'def error(nominal, indicated):\n    return indicated - nominal',
  'def percent_error(nominal, indicated):\n    return error(nominal, indicated) / nominal * 100',
  'def a(x):\n    return b(x) + 1',
  'def b(x):\n    return c(x) + 1',
  'def c(x):\n    return x + 1',
);
const LIB_SOURCES = {
  error: 'indicated - nominal',
  percent_error: 'error(nominal, indicated) / nominal * 100',
  a: 'b(x) + 1',
  b: 'c(x) + 1',
  c: 'x + 1',
};

/**
 * Every value-producing case the existing suite pins, plus every error case.
 * Drawn from evaluator.test.ts, builtins.test.ts and integration.test.ts.
 */
const GOLDEN: Array<[string, string, EvaluationContext]> = [
  // ── row context (evaluator.test.ts) ──
  ['column difference', 'CAL_IND - CAL_NOM', row({ CAL_IND: 10.2, CAL_NOM: 10 })],
  ['env scalar', 'ENV_TEMP_R1', row({}, { ENV_TEMP_R1: 20.5 })],
  ['temperature correction', 'READ_R1 * (1 + 11.5e-6 * (ENV_TEMP_R1 - 20))', row({ READ_R1: 100 }, { ENV_TEMP_R1: 25 })],
  ['ternary pass', '"PASS" if CAL_ERR <= CAL_TOL else "FAIL"', row({ CAL_ERR: 0.1, CAL_TOL: 0.5 })],
  ['ternary fail', '"PASS" if CAL_ERR <= CAL_TOL else "FAIL"', row({ CAL_ERR: 0.9, CAL_TOL: 0.5 })],
  ['and short-circuit', 'X != 0 and 1 / X > 5', row({ X: 0 })],
  ['or short-circuit', 'X == 0 or 1 / X > 5', row({ X: 0 })],
  ['zero is not empty', 'CAL_IND + 1', row({ CAL_IND: 0 })],
  // ── ADR-011 precision ──
  ['float artifact preserved', '0.1 + 0.2', row()],
  ['division precision', '1 / 3', row()],
  ['no intermediate rounding', '1 / 3 * 3', row()],
  ['explicit ROUND only', 'ROUND(1 / 3, 3)', row()],
  // ── comparisons ──
  ['cross-type equality', 'X == 1', row({ X: 'abc' })],
  ['cross-type inequality', 'X != 1', row({ X: 'abc' })],
  ['text equality', 'X == "PASS"', row({ X: 'PASS' })],
  ['text ordering', '"a" < "b"', row()],
  ['unary minus', '-CAL_X + 1', row({ CAL_X: 5 })],
  ['not', 'not X', row({ X: 0 })],
  // ── builtins (builtins.test.ts) ──
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
  // ── STD_* (ADR-013 D4) ──
  ['std coefficients', 'STD_C0 + STD_C1 * CAL_R', row({ CAL_R: 2 }, {}, { STD_C0: 0.5, STD_C1: 2.5 })],
  ['report unit', 'CAL_F * STD_TO_N / REPORT_TO_N', row({ CAL_F: 5 }, { REPORT_TO_N: 1000 }, { STD_TO_N: 1 })],
  // ── summary context ──
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
  // ── block context (ADR-017 D4) ──
  ['block own column', 'BLK_U * 2', block({ BLK_U: 4 })],
  ['block with aggregate and summary', 'BLK_U * SUMMARY_K + col_mean(CAL_ERR)',
    block({ BLK_U: 4 }, [{ CAL_ERR: 1 }, { CAL_ERR: 3 }], {}, { SUMMARY_K: 2 })],
  // ── custom functions ──
  ['custom fn with columns', 'error(CAL_NOM, CAL_IND)', row({ CAL_NOM: 10, CAL_IND: 10.5 }, {}, null, LIB)],
  ['custom fn calling custom fn', 'percent_error(200, 202)', row({}, {}, null, LIB)],
  ['custom fn with arithmetic', 'error(10, 11) * 1.02', row({}, {}, null, LIB)],
  ['three-deep nesting', 'a(0)', row({}, {}, null, LIB)],
  // ── error cases: both must fail identically ──
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

describe('trace(x).value === evaluate(x) across the existing golden set', () => {
  it.each(GOLDEN)('%s', (_label, source, context) => {
    const direct = outcomeOf(() => evaluate(parseExpression(source), context));
    const traced = traceOutcome(source, context, { functionSources: LIB_SOURCES });
    expect(traced).toEqual(direct);
  });

  it('covers every golden case', () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(60);
  });
});

/** Depth-first search for the first node carrying `label`. */
function find(node: TraceNode, label: string): TraceNode | null {
  if (node.label === label) return node;
  if (node.provenance !== 'computed') return null;
  for (const child of node.inputs) {
    const hit = find(child, label);
    if (hit) return hit;
  }
  return null;
}

function depthOf(node: TraceNode): number {
  if (node.provenance !== 'computed' || node.inputs.length === 0) return 1;
  return 1 + Math.max(...node.inputs.map(depthOf));
}

describe('substituted expressions are exact', () => {
  it('replaces each variable with its full-precision value', () => {
    const node = traceExpression('CAL_IND - CAL_NOM', row({ CAL_IND: 10.5, CAL_NOM: 10 }));
    expect(node.expression).toBe('CAL_IND - CAL_NOM');
    expect(node.substituted).toBe('10.5 - 10');
  });

  it("preserves the author's own parentheses, which the AST does not retain", () => {
    const node = traceExpression('(CAL_A + CAL_B) * (CAL_A - CAL_B)', row({ CAL_A: 3, CAL_B: 1 }));
    expect(node.expression).toBe('(CAL_A + CAL_B) * (CAL_A - CAL_B)');
    expect(node.substituted).toBe('(3 + 1) * (3 - 1)');
  });

  it('substitutes full precision, never a rounded figure (ADR-011)', () => {
    const node = traceExpression('V * 2', row({ V: 0.30000000000000004 }), {
      formatDisplay: () => '0.300',
    });
    expect(node.substituted).toBe('0.30000000000000004 * 2');
  });

  it('shows an aggregate as the row values it consumed', () => {
    const node = traceExpression('col_max(CAL_ERR)', summary([{ CAL_ERR: 0.2 }, { CAL_ERR: 0.5 }]));
    expect(node.substituted).toBe('col_max([0.2, 0.5])');
  });

  it('quotes text values so they cannot be mistaken for names', () => {
    const node = traceExpression('X == "PASS"', row({ X: 'PASS' }));
    expect(node.substituted).toBe('"PASS" == "PASS"');
  });

  it('leaves a short-circuited branch written as authored', () => {
    // `1 / X` never ran. Rendering it as `1 / 0` would imply a division that
    // did not happen — and X resolving on the LEFT must not leak into it.
    const node = traceExpression('X != 0 and 1 / X > 5', row({ X: 0 }));
    expect(node.substituted).toBe('0 != 0 and 1 / X > 5');
  });

  it('leaves the untaken ternary branch written as authored, and names it', () => {
    const node = traceExpression('"PASS" if CAL_ERR <= CAL_TOL else FAIL_MSG',
      row({ CAL_ERR: 0.1, CAL_TOL: 0.5, FAIL_MSG: 'FAIL' }));
    expect(node.substituted).toBe('"PASS" if 0.1 <= 0.5 else FAIL_MSG');
    expect(node.notEvaluated).toEqual(['FAIL_MSG']);
  });

  it('substitutes a custom function body against the body source, not the def source', () => {
    const node = traceExpression('error(CAL_NOM, CAL_IND)',
      row({ CAL_NOM: 10, CAL_IND: 10.5 }, {}, null, LIB), { functionSources: LIB_SOURCES });
    const body = node.inputs.find((n) => n.provenance === 'computed') as ComputedTraceNode;
    expect(body.expression).toBe('indicated - nominal');
    expect(body.substituted).toBe('10.5 - 10');
  });
});

describe('provenance is correct for each of the six kinds', () => {
  const node = traceExpression(
    'CAL_IND * STD_C1 + ENV_TEMP_R1 / REPORT_TO_N + CAL_CALC + scale(2)',
    row({ CAL_IND: 2, CAL_CALC: 9 }, { ENV_TEMP_R1: 20, REPORT_TO_N: 1000 }, { STD_C1: 3 },
      fns('def scale(k):\n    return k * 1')),
    {
      rowIndex: 1,
      formulaColumns: ['CAL_CALC'],
      functionSources: { scale: 'k * 1' },
      standard: {
        equipmentId: 'EQ1', equationId: 'EQ1-R1', displayName: 'Load cell — 10-100 kN',
        equipmentCode: 'CAL-FRC-004', serialNumber: 'SN-77',
        calibrationDate: '2026-07-09T00:00:00.000Z', dueDate: '2027-07-09T00:00:00.000Z',
      },
    },
  );

  it('entered — a person typed it, with its row', () => {
    const n = find(node, 'CAL_IND')!;
    expect(n.provenance).toBe('entered');
    expect(n).toMatchObject({ value: 2, rowIndex: 1 });
  });

  it('reference-standard — carries only identity the snapshot actually stores', () => {
    const n = find(node, 'STD_C1')!;
    expect(n.provenance).toBe('reference-standard');
    expect(n).toMatchObject({
      rowIndex: 1,
      standard: { equipmentId: 'EQ1', equationId: 'EQ1-R1', serialNumber: 'SN-77',
                  dueDate: '2027-07-09T00:00:00.000Z' },
    });
  });

  it('environment — with the round read from the name', () => {
    const n = find(node, 'ENV_TEMP_R1')!;
    expect(n.provenance).toBe('environment');
    expect(n).toMatchObject({ round: 1, value: 20 });
  });

  it('record-scalar — the reporting unit', () => {
    expect(find(node, 'REPORT_TO_N')!.provenance).toBe('record-scalar');
  });

  it('computed — a formula column is a reference for the orchestrator to splice', () => {
    const n = find(node, 'CAL_CALC') as ComputedTraceNode;
    expect(n.provenance).toBe('computed');
    expect(n.origin).toEqual({ kind: 'reference', refers: 'formula-column' });
  });

  it('template-constant — a literal argument written into the template', () => {
    const n = find(node, '2')!;
    expect(n.provenance).toBe('template-constant');
    expect(n).toMatchObject({ constantKind: 'literal', parameter: 'k', value: 2 });
  });

  it('a SUMMARY_* reference is computed, not entered', () => {
    const s = traceExpression('SUMMARY_MAXDEV * 2', summary([], {}, { SUMMARY_MAXDEV: 4 }));
    const n = find(s, 'SUMMARY_MAXDEV') as ComputedTraceNode;
    expect(n.provenance).toBe('computed');
    expect(n.origin).toEqual({ kind: 'reference', refers: 'summary-field' });
  });

  it('uses only the six provenances ADR-018 names', () => {
    const seen = new Set<string>();
    const visit = (n: TraceNode) => {
      seen.add(n.provenance);
      if (n.provenance === 'computed') n.inputs.forEach(visit);
    };
    visit(node);
    for (const p of seen) expect(TRACE_PROVENANCES).toContain(p);
  });
});

describe('nested computed inputs nest to the correct depth', () => {
  it('expands a custom function body, and its own nested call', () => {
    const node = traceExpression('percent_error(CAL_NOM, CAL_IND)',
      row({ CAL_NOM: 200, CAL_IND: 202 }, {}, null, LIB), { functionSources: LIB_SOURCES, rowIndex: 0 });

    const outer = node.inputs.find((n) => n.label.startsWith('percent_error')) as ComputedTraceNode;
    expect(outer.origin).toEqual({
      kind: 'custom-function', functionName: 'percent_error', params: ['nominal', 'indicated'],
    });
    expect(outer.expression).toBe('error(nominal, indicated) / nominal * 100');
    expect(outer.substituted).toBe('error(200, 202) / 200 * 100');

    const inner = outer.inputs.find((n) => n.label.startsWith('error(')) as ComputedTraceNode;
    expect(inner.expression).toBe('indicated - nominal');
    expect(inner.substituted).toBe('202 - 200');
    expect(depthOf(node)).toBe(4);
  });

  it('carries a forwarded parameter through with its ORIGINAL provenance', () => {
    const node = traceExpression('percent_error(CAL_NOM, CAL_IND)',
      row({ CAL_NOM: 200, CAL_IND: 202 }, {}, null, LIB), { functionSources: LIB_SOURCES, rowIndex: 0 });
    const outer = node.inputs.find((n) => n.label.startsWith('percent_error')) as ComputedTraceNode;
    const inner = outer.inputs.find((n) => n.label.startsWith('error(')) as ComputedTraceNode;
    const bound = inner.inputs.find((n) => n.parameter === 'nominal')!;
    expect(bound).toMatchObject({ provenance: 'entered', label: 'CAL_NOM', value: 200, rowIndex: 0 });
  });

  it('gives each call of the same function its own body', () => {
    const node = traceExpression('f(1) + f(2)',
      row({}, {}, null, fns('def f(x):\n    return x * 10')), { functionSources: { f: 'x * 10' } });
    const bodies = node.inputs.filter((n) => n.label.startsWith('f(')) as ComputedTraceNode[];
    expect(bodies).toHaveLength(2);
    expect(bodies.map((b) => b.substituted)).toEqual(['1 * 10', '2 * 10']);
    expect(bodies.map((b) => b.value)).toEqual([10, 20]);
  });

  it('does not list a call argument twice', () => {
    const node = traceExpression('error(CAL_NOM, CAL_IND)',
      row({ CAL_NOM: 10, CAL_IND: 10.5 }, {}, null, LIB), { functionSources: LIB_SOURCES });
    expect(node.inputs.filter((n) => n.label === 'CAL_NOM')).toHaveLength(0);
    const body = node.inputs[0] as ComputedTraceNode;
    expect(body.inputs.filter((n) => n.label === 'CAL_NOM')).toHaveLength(1);
  });

  it('does not expand arithmetic into a node per operator (ADR-018 D3)', () => {
    const node = traceExpression('2 + 3 * 4 - (5 / 6)', row());
    expect(node.inputs).toEqual([]);
    expect(depthOf(node)).toBe(1);
  });
});

describe('column aggregates list the row values they consumed', () => {
  const rows = [{ CAL_ERR: 0.2 }, { CAL_ERR: 0.5 }, { CAL_ERR: 0.1 }];

  it('one input per row, in row order, each tagged with its row index', () => {
    const node = traceExpression('col_max(CAL_ERR)', summary(rows));
    expect(node.origin).toEqual({
      kind: 'column-aggregate', functionName: 'col_max', column: 'CAL_ERR', rowCount: 3,
    });
    expect(node.inputs.map((n) => n.value)).toEqual([0.2, 0.5, 0.1]);
    expect(node.inputs.map((n) => (n as { rowIndex: number }).rowIndex)).toEqual([0, 1, 2]);
    expect(node.value).toBe(0.5);
  });

  it.each(['col_mean', 'col_max', 'col_min', 'col_sum', 'col_count', 'col_stdev'])(
    '%s exposes its inputs',
    (fn) => {
      const node = traceExpression(fn + '(CAL_ERR)', summary(rows));
      expect(node.inputs).toHaveLength(3);
      expect(node.inputs.map((n) => n.value)).toEqual([0.2, 0.5, 0.1]);
    },
  );

  it('keeps two aggregates over the same column separate', () => {
    const node = traceExpression('col_max(CAL_ERR) - col_min(CAL_ERR)', summary(rows));
    const aggs = node.inputs.filter((n) => n.provenance === 'computed') as ComputedTraceNode[];
    expect(aggs.map((a) => (a.origin as { functionName: string }).functionName))
      .toEqual(['col_max', 'col_min']);
    expect(node.substituted).toBe('col_max([0.2, 0.5, 0.1]) - col_min([0.2, 0.5, 0.1])');
  });
});

describe('all three evaluation contexts are traceable', () => {
  it('row (ADR-010)', () => {
    const node = traceExpression('CAL_IND - CAL_NOM', row({ CAL_IND: 3, CAL_NOM: 1 }));
    expect(node.value).toBe(2);
    expect(node.inputs.map((n) => n.label)).toEqual(['CAL_IND', 'CAL_NOM']);
  });

  it('summary (ADR-010)', () => {
    const node = traceExpression('col_mean(CAL_ERR) + SUMMARY_K',
      summary([{ CAL_ERR: 2 }, { CAL_ERR: 4 }], {}, { SUMMARY_K: 1 }));
    expect(node.value).toBe(4);
    expect(node.substituted).toBe('col_mean([2, 4]) + 1');
  });

  it('block (ADR-017 D4)', () => {
    const node = traceExpression('BLK_U * SUMMARY_K + col_mean(CAL_ERR)',
      block({ BLK_U: 4 }, [{ CAL_ERR: 1 }, { CAL_ERR: 3 }], {}, { SUMMARY_K: 2 }));
    expect(node.value).toBe(10);
    expect(node.substituted).toBe('4 * 2 + col_mean([1, 3])');
    expect(find(node, 'BLK_U')!.provenance).toBe('entered');
  });
});

describe('a failing expression still produces a partial trace', () => {
  it('keeps what resolved before the failure, and attaches the error', () => {
    const node = traceExpression('CAL_IND + CAL_MISSING',
      row({ CAL_IND: 5, CAL_MISSING: null }), { rowIndex: 2 });

    expect(node.value).toBeNull();
    expect(node.error).toEqual({ kind: 'awaiting-input', message: 'CAL_MISSING has no value yet.' });
    expect(find(node, 'CAL_IND')).toMatchObject({ value: 5, error: null });
    expect(find(node, 'CAL_MISSING')).toMatchObject({
      value: null,
      error: { kind: 'awaiting-input', message: 'CAL_MISSING has no value yet.' },
    });
  });

  it('distinguishes invalid-computation from awaiting-input', () => {
    const node = traceExpression('1 / X', row({ X: 0 }));
    expect(node.error).toEqual({ kind: 'invalid-computation', message: 'Division by zero.' });
    expect(find(node, 'X')).toMatchObject({ value: 0 });
  });

  it('keeps the inputs that resolved before a mid-expression failure', () => {
    const node = traceExpression('CAL_A + CAL_B + CAL_C', row({ CAL_A: 1, CAL_B: 2, CAL_C: null }));
    expect(node.error?.kind).toBe('awaiting-input');
    expect(find(node, 'CAL_A')).toMatchObject({ value: 1 });
    expect(find(node, 'CAL_B')).toMatchObject({ value: 2 });
  });

  it('folds back a custom function frame left open by a throw', () => {
    const node = traceExpression('boom(CAL_X)',
      row({ CAL_X: 0 }, {}, null, fns('def boom(v):\n    return 1 / v')),
      { functionSources: { boom: '1 / v' } });
    expect(node.error).toEqual({ kind: 'invalid-computation', message: 'Division by zero.' });
    const body = node.inputs.find((n) => n.label.startsWith('boom(')) as ComputedTraceNode;
    expect(body).toBeDefined();
    expect(body.inputs.find((n) => n.parameter === 'v')).toMatchObject({ value: 0, label: 'CAL_X' });
  });
});

describe('nodes are plain JSON', () => {
  const SAMPLES: Array<[string, () => ComputedTraceNode]> = [
    ['row with entered inputs', () => traceExpression('CAL_IND - CAL_NOM', row({ CAL_IND: 10.5, CAL_NOM: 10 }))],
    ['aggregate', () => traceExpression('col_max(CAL_ERR)', summary([{ CAL_ERR: 1 }, { CAL_ERR: 2 }]))],
    ['expanded custom function', () => traceExpression('percent_error(CAL_NOM, CAL_IND)',
      row({ CAL_NOM: 200, CAL_IND: 202 }, {}, null, LIB), { functionSources: LIB_SOURCES, rowIndex: 0 })],
    ['short-circuit', () => traceExpression('X != 0 and 1 / X > 5', row({ X: 0 }))],
    ['failed', () => traceExpression('CAL_IND + CAL_MISSING', row({ CAL_IND: 5, CAL_MISSING: null }))],
    ['reference standard', () => traceExpression('STD_C1 * 2', row({}, {}, { STD_C1: 3 }), {
      rowIndex: 0,
      standard: {
        equipmentId: 'EQ1', equationId: 'EQ1-R1', displayName: 'Load cell', equipmentCode: 'C1',
        serialNumber: 'SN-77', calibrationDate: '2026-07-09T00:00:00.000Z',
        dueDate: '2027-07-09T00:00:00.000Z',
      },
    })],
  ];

  it.each(SAMPLES)('%s survives JSON.parse(JSON.stringify(node)) exactly', (_label, build) => {
    const node = build();
    expect(JSON.parse(JSON.stringify(node))).toStrictEqual(node);
  });

  it.each(SAMPLES)('%s survives structuredClone exactly', (_label, build) => {
    const node = build();
    expect(structuredClone(node)).toStrictEqual(node);
  });

  it('has no undefined-valued key anywhere, which JSON.stringify would drop', () => {
    const check = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((v, i) => check(v, `${path}[${i}]`));
        return;
      }
      if (value === null || typeof value !== 'object') return;
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        expect(v, `${path}.${key} is undefined`).not.toBeUndefined();
        check(v, `${path}.${key}`);
      }
    };
    for (const [label, build] of SAMPLES) check(build(), label);
  });
});

describe('every node renders as one line (ADR-018 D3)', () => {
  it('never emits a newline, and always names the value', () => {
    // Bare columns are illegal in summary context (ADR-010), so the function
    // arguments come from SUMMARY_* values here.
    const node = traceExpression('percent_error(SUMMARY_NOM, SUMMARY_IND) + col_max(CAL_ERR)',
      { kind: 'summary', rows: [{ CAL_ERR: 1 }, { CAL_ERR: 4 }], env: {},
        summary: { SUMMARY_NOM: 200, SUMMARY_IND: 202 }, customFunctions: LIB },
      { functionSources: LIB_SOURCES });
    const lines: string[] = [];
    const visit = (n: TraceNode) => {
      lines.push(traceNodeToLine(n));
      if (n.provenance === 'computed') n.inputs.forEach(visit);
    };
    visit(node);
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) {
      expect(line).not.toContain('\n');
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('shows the displayed figure alongside full precision when they differ', () => {
    const node = traceExpression('V * 1', row({ V: 0.30000000000000004 }), {
      formatDisplay: (_label, value) => (typeof value === 'number' ? value.toFixed(3) : null),
    });
    expect(traceNodeToLine(node)).toContain('0.30000000000000004');
    expect(traceNodeToLine(node)).toContain('shows 0.300');
  });
});
