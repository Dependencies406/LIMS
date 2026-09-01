/**
 * traceSubstitutionInvariant.test.ts
 *
 * Phase 33 Task 1 — THE GATE. Nothing else in Phase 33 starts until this is
 * green (see docs/PHASE_33_PROMPT_SHOW_THE_WORKING.md).
 *
 * THE INVARIANT: the substituted expression, read as an expression on its
 * own, must produce the node's value. Checked with the parser and evaluator
 * ALREADY BUILT (`parseExpression` + `evaluate`), against an EMPTY DATA
 * context — no column, ENV_*, STD_*, SUMMARY_* or REPORT_* should resolve,
 * because every one of those should already have been replaced by its value.
 *
 * "Empty" applies to DATA, not to custom-function DEFINITIONS. A node's
 * substituted text can legitimately still contain a call like `scale(2)`:
 * the trace deliberately does not inline a custom function's body into its
 * CALLER's substituted text (the call's own child node shows that expansion
 * — see trace.ts's `CustomFunctionOrigin` doc). So the standalone
 * re-evaluation is given the SAME `customFunctions` registry the original
 * trace used, exactly as it is already given every BUILTIN (SQRT, ROUND, ...)
 * for free, context-independently. This does not weaken the invariant: if a
 * call's ARGUMENTS had been substituted wrongly, re-running the real function
 * on the wrong argument would still produce the wrong number and fail the
 * assertion — proven below in "a wrong substitution is still caught".
 *
 * Checked across every case in the Phase 32 golden set (traceGoldenFixtures.ts
 * — a copy of trace.test.ts's own GOLDEN array; Phase 33's constraints forbid
 * modifying trace.test.ts, so the cases could not be imported from there
 * directly), plus deeper-nesting cases, at EVERY NODE OF EVERY TRACE — not
 * only roots. `collectAllNodes` walks the full tree.
 *
 * ── The exclusion categories, and why each is legitimate ────────────────────
 *
 * A. NODES WITH AN ERROR (`node.error !== null`, so `node.value === null`).
 *    The invariant is stated in terms of "the node's value" — a node that
 *    produced no value has nothing for the invariant to check.
 *
 * B. NODES WITH `substituted === null`. Two sub-cases, both structural:
 *      - An un-spliced `reference` node (a `SUMMARY_*` field or formula
 *        column, referenced from a single traced expression with no
 *        orchestrator to splice its subtree in — Task 2 closes this).
 *      - A custom-function argument that is a compound expression rather
 *        than a bare identifier or literal (documented gap, PHASE_32_RESULT
 *        "Everywhere the trace CANNOT see", item 3).
 *    A node with no substituted string has nothing for this test to parse.
 *
 * C. NODES WHOSE SUBSTITUTED TEXT CONTAINS AN UNRESOLVED NAME BY DESIGN — the
 *    short-circuited side of `and`/`or`, or the untaken ternary branch,
 *    deliberately left as a bare name (trace.ts:605, `frame.skipped`).
 *    Detected explicitly via `notEvaluated.length > 0`, never by
 *    catching-and-ignoring a parse/resolution error.
 *
 * D. NODES WHOSE EXPRESSION CONTAINS A COLUMN AGGREGATE CALL ANYWHERE WITHIN
 *    IT — not only when the node itself IS the aggregate. `col_max(CAL_ERR)
 *    - col_min(CAL_ERR)` is one plain-expression node whose substituted text
 *    is `col_max([0.2, 0.5]) - col_min([0.2, 0.1])`; the CONTAINING node
 *    fails to parse just as surely as a bare aggregate node would, because
 *    `[...]` is not a value the grammar accepts anywhere in an expression.
 *    Detected by re-parsing the node's OWN `expression` and walking for any
 *    `Call` whose callee `isColumnAggregate` — not a text heuristic on the
 *    substituted string. Confirmed below that the grammar genuinely rejects
 *    the list-literal shape.
 *
 * Any node outside these categories MUST satisfy the invariant. If one
 * doesn't, this test fails and the underlying bug gets fixed — per the
 * prompt, widening an exclusion to dodge a failure here is the single worst
 * outcome this phase could produce, and was not done. (Two genuine test-design
 * mistakes were found and fixed while building this gate — an empty
 * `customFunctions` registry, and category D only checking the node's own
 * origin instead of walking its expression — both fixed by correcting the
 * test's own empty-context construction, not by touching trace.ts or
 * widening what counts as excluded. See docs/PHASE_33_RESULT.md Task 1.)
 */

import { describe, it, expect } from 'vitest';
import { evaluate } from '../evaluator';
import type { CustomFunctionBinding, EvaluationContext } from '../evaluator';
import { walk } from '../ast';
import { isColumnAggregate } from '../builtins';
import { parseExpression } from '../parser';
import { traceExpression, type ComputedTraceNode, type TraceNode } from '../trace';
import { GOLDEN, NESTED_CASES, fns } from './traceGoldenFixtures';

/** Every node in the tree, roots and all descendants, in a stable order. */
function collectAllNodes(root: TraceNode): TraceNode[] {
  const out: TraceNode[] = [];
  const visit = (n: TraceNode) => {
    out.push(n);
    if (n.provenance === 'computed') n.inputs.forEach(visit);
  };
  visit(root);
  return out;
}

/** Does this node's OWN expression contain a column-aggregate call anywhere within it? */
function containsAggregateCall(expression: string): boolean {
  let ast;
  try {
    ast = parseExpression(expression);
  } catch {
    return false; // unparseable for some other reason — not this test's concern
  }
  let found = false;
  walk(ast, (n) => {
    if (n.type === 'Call' && isColumnAggregate(n.callee)) found = true;
  });
  return found;
}

type Category = 'checked' | 'error' | 'no-substituted' | 'not-evaluated' | 'aggregate';

function categorize(node: ComputedTraceNode): Category {
  if (node.error !== null) return 'error';
  if (node.substituted === null || node.expression === null) return 'no-substituted';
  if (node.notEvaluated.length > 0) return 'not-evaluated';
  if (containsAggregateCall(node.expression)) return 'aggregate';
  return 'checked';
}

/**
 * Empty DATA, real custom-function DEFINITIONS (see file header). Built
 * fresh per case since different golden cases define different functions.
 */
function emptyContexts(customFunctions: Record<string, CustomFunctionBinding>): EvaluationContext[] {
  return [
    { kind: 'row', row: {}, env: {}, std: null, customFunctions },
    { kind: 'summary', rows: [], env: {}, summary: {}, customFunctions },
    { kind: 'block', block: {}, rows: [], env: {}, summary: {}, customFunctions },
  ];
}

function evaluateStandalone(substituted: string, customFunctions: Record<string, CustomFunctionBinding>): unknown {
  const ast = parseExpression(substituted);
  let firstError: unknown = null;
  for (const ctx of emptyContexts(customFunctions)) {
    try {
      return evaluate(ast, ctx);
    } catch (e) {
      if (firstError === null) firstError = e;
    }
  }
  throw firstError;
}

const counts: Record<Category, number> = {
  checked: 0,
  error: 0,
  'no-substituted': 0,
  'not-evaluated': 0,
  aggregate: 0,
};

function checkTree(root: ComputedTraceNode, customFunctions: Record<string, CustomFunctionBinding>) {
  for (const node of collectAllNodes(root)) {
    if (node.provenance !== 'computed') continue; // leaves carry no substituted text at all
    const category = categorize(node);
    counts[category] += 1;
    if (category !== 'checked') continue;

    const result = evaluateStandalone(node.substituted as string, customFunctions);
    expect(result, `substituted "${node.substituted}" for "${node.label}"`).toBe(node.value);
  }
}

/** Pulls the customFunctions registry out of whichever context kind a case uses. */
function customFunctionsOf(context: EvaluationContext): Record<string, CustomFunctionBinding> {
  return context.customFunctions;
}

describe('GATE: substituted expression, evaluated standalone, equals the node value', () => {
  it.each(GOLDEN)('%s', (_label, source, context) => {
    const node = traceExpression(source, context, { functionSources: {} });
    checkTree(node, customFunctionsOf(context));
  });

  it.each(NESTED_CASES)('%s', (_label, source, context, options) => {
    const node = traceExpression(source, context, options);
    checkTree(node, customFunctionsOf(context));
  });

  it('report: node counts by category', () => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`[Phase 33 Task 1] nodes visited: ${total}`);
    console.log(`  checked (invariant asserted) : ${counts.checked}`);
    console.log(`  excluded - error             : ${counts.error}`);
    console.log(`  excluded - no substituted    : ${counts['no-substituted']}`);
    console.log(`  excluded - not-evaluated     : ${counts['not-evaluated']}`);
    console.log(`  excluded - aggregate         : ${counts.aggregate}`);
    // A floor, not a target: proves the gate actually walked a non-trivial
    // tree rather than vacuously passing over an empty or tiny golden set,
    // and that every exclusion category was genuinely exercised at least
    // once (see docs/PHASE_33_RESULT.md Task 1 for the exact counts).
    expect(counts.checked).toBeGreaterThan(40);
    expect(counts.error).toBeGreaterThan(0);
    expect(counts['no-substituted']).toBeGreaterThan(0);
    expect(counts['not-evaluated']).toBeGreaterThan(0);
    expect(counts.aggregate).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(100);
  });
});

describe('the exclusions are real, not convenient', () => {
  it('an aggregate substituted string is genuinely not valid syntax', () => {
    expect(() => parseExpression('col_max([0.2, 0.5])')).toThrow();
  });

  it('an aggregate embedded inside a larger expression is also not valid syntax', () => {
    expect(() => parseExpression('col_max([0.2, 0.5]) - col_min([0.2, 0.1])')).toThrow();
  });

  it('a skipped-branch substituted string genuinely contains an unresolved name', () => {
    const node = traceExpression('"PASS" if CAL_ERR <= CAL_TOL else FAIL_MSG',
      { kind: 'row', row: { CAL_ERR: 0.1, CAL_TOL: 0.5, FAIL_MSG: 'FAIL' }, env: {}, std: null, customFunctions: {} });
    expect(node.notEvaluated).toEqual(['FAIL_MSG']);
    expect(node.substituted).toContain('FAIL_MSG');
    // NOTE on why this does not assert `.toThrow()`: re-evaluating the
    // substituted text standalone does NOT throw here — the DECIDING
    // condition (`CAL_ERR <= CAL_TOL`) was itself correctly substituted with
    // real values, so control flow is self-consistent and the ternary picks
    // "PASS" again without ever touching the bare FAIL_MSG. This holds for
    // every well-formed short-circuit in this codebase: the branch that was
    // skipped originally is deterministically skipped again on re-evaluation,
    // because the values that decided it were substituted correctly. That is
    // exactly WHY exclusion C never actually failed a real case in this
    // gate's run (`excluded - not-evaluated` nodes never throw when
    // re-evaluated) — but the prompt is explicit that this category must
    // still be detected structurally rather than relied on to happen to
    // pass, because a test that quietly trusted "well it always short-
    // circuits the same way" would stop being true the moment anyone changed
    // evaluation order for an unrelated reason, and nothing would flag that.
    // The exclusion's job is decoupling this test's correctness from that
    // implementation detail, not catching a failure that happens today.
    expect(evaluateStandalone(node.substituted as string, {})).toBe('PASS');
  });

  it('a wrong substitution would still be caught (custom-function definitions are not a loophole)', () => {
    // Proves reusing the real customFunctions registry does not blind the
    // gate to a genuine argument-substitution bug: deliberately construct a
    // node whose substituted text names the wrong argument, and confirm the
    // invariant check (the exact expression under test) would fail.
    const lib = fns('def err(n, i):\n    return i - n');
    const wrongSubstitution = 'err(999, 10.5)'; // the "real" call was err(10, 10.5) = 0.5
    const result = evaluateStandalone(wrongSubstitution, lib);
    expect(result).not.toBe(0.5);
  });
});
