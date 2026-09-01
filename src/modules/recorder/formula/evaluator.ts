/**
 * evaluator.ts
 *
 * Walks an AST and produces a value. Implements the evaluation semantics of
 * docs/FORMULA_GRAMMAR.md §6.
 *
 * Three contexts:
 *   row     — once per row; sees columns of the current row, ENV_* scalars,
 *             and STD_* for that row's own reference standard (ADR-013 D4)
 *   summary — once per record; sees ENV_*, SUMMARY_*, and col_* aggregates
 *   block   — once per BLOCK ROW, after summary; sees col_* aggregates,
 *             SUMMARY_*, ENV_* and REPORT_*, and its own block's columns.
 *             Never STD_* (ADR-017 D4).
 *
 * Strict empty semantics: an empty cell is empty, not zero. Anything consuming
 * an empty value raises `awaiting-input`. Genuine faults (division by zero,
 * domain errors, type mismatches) raise `invalid-computation`. The UI styles
 * the two very differently, so the distinction is carried on every error.
 *
 * Values are used UNROUNDED throughout (ADR-011). Display precision and
 * fixed/scientific notation are a rendering concern and never appear here —
 * col_mean therefore averages true stored values, not displayed ones.
 *
 * No eval, no new Function: every operator is dispatched through an explicit
 * switch on the AST node type.
 */

import type { ExpressionNode, IdentifierNode, Position } from './ast';
import { callBuiltin, isBuiltin, isColumnAggregate } from './builtins';
import { FormulaEvaluationError, awaitingInput, invalidComputation } from './errors';
import type { FormulaErrorKind } from './errors';
import { sampleStandardDeviation } from './numeric';

/** A stored cell value. `null` (or a missing key) means empty. */
export type CellValue = number | string | null | undefined;

/** What an expression can evaluate to. */
export type FormulaValue = number | string | boolean;

export interface CustomFunctionBinding {
  name: string;
  params: string[];
  body: ExpressionNode;
}

export interface RowEvaluationContext {
  kind: 'row';
  /** Column reference (`CAL_IND`) to its value in the current row. */
  row: Record<string, CellValue>;
  /** `ENV_TEMP_R1` / `ENV_RH_R1` to its per-round scalar, broadcast to every row. */
  env: Record<string, CellValue>;
  /**
   * `STD_*` for the reference standard selected IN THIS ROW (ADR-013 D4) —
   * built by `buildStandardVariables`. Unlike `env`, this is row-scoped, not
   * broadcast: two rows using different standards see different coefficients.
   *
   * `null` or absent means this row has no standard selected, and every
   * `STD_*` raises `awaiting-input` — including the coefficient slots. The
   * coefficient zero-default lives in `buildStandardVariables` and is
   * unreachable from here.
   */
  std?: Record<string, CellValue> | null;
  customFunctions: Record<string, CustomFunctionBinding>;
}

export interface SummaryEvaluationContext {
  kind: 'summary';
  /** Every row of the record, for col_* aggregates. */
  rows: Array<Record<string, CellValue>>;
  env: Record<string, CellValue>;
  /** `SUMMARY_MAXDEV` to its already-evaluated value (summary fields are topologically ordered). */
  summary: Record<string, CellValue>;
  customFunctions: Record<string, CustomFunctionBinding>;
}

/**
 * ADR-017 D4 — the third context. A block formula is evaluated once per
 * BLOCK ROW (a budget contributor, not a calibration point) and sees:
 *   - column aggregates over the measurement rows  (`rows`)
 *   - SUMMARY_*                                    (`summary`)
 *   - ENV_* and REPORT_TO_N                        (`env`)
 *   - its OWN block's columns, for its own row     (`block`)
 *
 * It does NOT see STD_*: that resolves per calibration point and a block row
 * is not one, so referencing it is a validation error rather than a null
 * (D4). There is deliberately no `std` field here at all — the absence is
 * what makes it unreachable, rather than a runtime check that could be
 * forgotten.
 *
 * Cross-block references are out of scope (D4): `block` holds ONE block's
 * row, so another block's columns are simply not present and resolve as
 * unknown names.
 */
export interface BlockEvaluationContext {
  kind: 'block';
  /** This block row's own cells, keyed `BLOCKID_COLUMNID`. */
  block: Record<string, CellValue>;
  /** Every measurement row of the record, for col_* aggregates. */
  rows: Array<Record<string, CellValue>>;
  env: Record<string, CellValue>;
  /** `SUMMARY_MAXDEV` to its already-evaluated value — blocks run after summary fields. */
  summary: Record<string, CellValue>;
  customFunctions: Record<string, CustomFunctionBinding>;
}

export type EvaluationContext =
  | RowEvaluationContext
  | SummaryEvaluationContext
  | BlockEvaluationContext;

/**
 * Defence in depth (§5). Cycles are rejected at authoring time by the
 * validator; if that ever fails, this degrades a frozen browser into an error.
 */
export const MAX_CALL_DEPTH = 64;

/** Local bindings while inside a custom function body — its parameters only. */
type Locals = Record<string, FormulaValue> | null;

function isEmpty(value: CellValue): boolean {
  return value === null || value === undefined || value === '';
}

function requireNumber(value: FormulaValue, description: string): number {
  if (typeof value !== 'number') {
    throw invalidComputation(`${description} expects a number but received ${describeValue(value)}.`);
  }
  return value;
}

function describeValue(value: FormulaValue): string {
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'a true/false value';
  return 'a number';
}

function requireFinite(value: number, description: string): number {
  if (!Number.isFinite(value)) {
    throw invalidComputation(`${description} produced a value that is not a finite number.`);
  }
  return value;
}

/** Truthiness for `and` / `or` / `not` and the ternary condition. */
function toBoolean(value: FormulaValue): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return value.length > 0;
}

/** Converts a stored cell to a usable value, raising `awaiting-input` when empty. */
function readCell(value: CellValue, name: string): FormulaValue {
  if (isEmpty(value)) {
    throw awaitingInput(`${name} has no value yet.`);
  }
  return value as FormulaValue;
}

// ── Instrumentation (ADR-018 D2) ────────────────────────────────────────────
//
// The Calculation Trace needs to know where each value CAME FROM, which means
// observing this evaluation rather than re-implementing it: a trace produced by
// a second engine would document something the system does not actually do,
// the single largest technical risk ADR-018 names.
//
// The probe therefore reports only what this file already computes, at the
// points where it computes it:
//
//   - which of `evaluateIdentifier`'s branches resolved a name, and to what
//   - the row values a column aggregate consumed
//   - entry to and exit from a custom function body
//
// It deliberately does NOT report every AST node. ADR-018 D3 rejects full
// per-operation expansion, so `2 + 3 * 4` is one traced value, not four. The
// trace's tree structure comes from values depending on other values, not from
// the shape of one expression.
//
// Cost when not tracing: one `probe !== null` check per resolved name. No
// allocation, no wrapper objects, no change to any existing code path — see
// `report()` below, which is the only thing the untraced path touches.

/**
 * Which branch of `evaluateIdentifier` produced a value. These are the
 * BRANCHES THEMSELVES, not a re-derivation of them — each is reported from
 * inside the branch it names, so the two cannot drift apart.
 */
export type ResolveSource =
  | 'local'
  | 'env'
  | 'report'
  | 'std'
  | 'summary'
  | 'block-column'
  | 'row-column';

export type EvaluationEvent =
  | { type: 'resolve'; name: string; source: ResolveSource; value: FormulaValue }
  /**
   * A name that did not resolve. Carries no `source`: resolution did not get
   * far enough to establish one, and inventing it here would be a guess.
   */
  | { type: 'resolve-failed'; name: string; kind: FormulaErrorKind; message: string }
  | {
      type: 'aggregate';
      functionName: string;
      column: string;
      /** Every row value consumed, in row order (ADR-018: never a summary of them). */
      values: number[];
      value: number;
    }
  | {
      type: 'call-entered';
      functionName: string;
      params: string[];
      args: FormulaValue[];
      /** The argument expressions, so a binding can be labelled by what it came from. */
      argNodes: ExpressionNode[];
      body: ExpressionNode;
      /** The call site, which identifies it uniquely within the calling expression. */
      position: Position;
    }
  /** `value` is null when the body threw. `FormulaValue` is never null, so this is unambiguous. */
  | { type: 'call-exited'; functionName: string; value: FormulaValue | null }
  /**
   * A subexpression that was NOT evaluated: the short-circuited side of
   * `and`/`or`, or the untaken branch of a ternary.
   *
   * Reported because silence is ambiguous. Without this, a name that resolved
   * elsewhere in the same expression would be substituted into text that never
   * ran — `1 / X > 5` rendering as `1 / 0 > 5` implies a division that did not
   * happen. The skipped node lets the trace leave that span written as authored.
   */
  | { type: 'branch-skipped'; node: ExpressionNode };

export interface EvaluationProbe {
  onEvent(event: EvaluationEvent): void;
}

/**
 * Reports a resolved name, then returns it unchanged.
 *
 * The whole untraced cost of instrumentation is the null check here. Written
 * as a pass-through so a resolution site stays a single `return` expression
 * and the branch's own logic is untouched.
 */
function report(
  probe: EvaluationProbe | null,
  name: string,
  source: ResolveSource,
  value: FormulaValue,
): FormulaValue {
  if (probe) probe.onEvent({ type: 'resolve', name, source, value });
  return value;
}

export function evaluate(node: ExpressionNode, context: EvaluationContext): FormulaValue {
  return evaluateNode(node, context, null, 0, null);
}

/**
 * `evaluate` with a probe attached — the SAME code path, the same arithmetic,
 * the same error semantics. Nothing is recomputed for the trace's benefit.
 *
 * `trace.ts` is the intended caller; the value returned here is by construction
 * the value `evaluate` returns for the same inputs.
 */
export function evaluateWithProbe(
  node: ExpressionNode,
  context: EvaluationContext,
  probe: EvaluationProbe,
): FormulaValue {
  return evaluateNode(node, context, null, 0, probe);
}

function evaluateNode(
  node: ExpressionNode,
  context: EvaluationContext,
  locals: Locals,
  depth: number,
  probe: EvaluationProbe | null,
): FormulaValue {
  switch (node.type) {
    case 'NumberLiteral':
      return node.value;

    case 'StringLiteral':
      return node.value;

    case 'Identifier': {
      if (!probe) return evaluateIdentifier(node, context, locals, null);
      // The one place a failed resolution is reported. Catching here rather
      // than at each throw site inside evaluateIdentifier keeps that function's
      // branch logic byte-for-byte unchanged — an empty cell and an unknown
      // name both surface, without a second copy of the prefix dispatch.
      try {
        return evaluateIdentifier(node, context, locals, probe);
      } catch (error) {
        if (error instanceof FormulaEvaluationError) {
          probe.onEvent({
            type: 'resolve-failed',
            name: node.name,
            kind: error.kind,
            message: error.message,
          });
        }
        throw error;
      }
    }

    case 'UnaryMinus': {
      const operand = evaluateNode(node.operand, context, locals, depth, probe);
      return -requireNumber(operand, 'Negation');
    }

    case 'Not':
      return !toBoolean(evaluateNode(node.operand, context, locals, depth, probe));

    case 'Logical': {
      // Short-circuit, so `x != 0 and 1 / x > 5` never divides by zero.
      // The unevaluated side emits no events at all — which is exactly how the
      // trace knows to list those names as not-evaluated rather than invent a
      // value for them.
      const left = toBoolean(evaluateNode(node.left, context, locals, depth, probe));
      if (node.operator === 'and') {
        if (!left) {
          if (probe) probe.onEvent({ type: 'branch-skipped', node: node.right });
          return false;
        }
        return toBoolean(evaluateNode(node.right, context, locals, depth, probe));
      }
      if (left) {
        if (probe) probe.onEvent({ type: 'branch-skipped', node: node.right });
        return true;
      }
      return toBoolean(evaluateNode(node.right, context, locals, depth, probe));
    }

    case 'Binary': {
      const left = evaluateNode(node.left, context, locals, depth, probe);
      const right = evaluateNode(node.right, context, locals, depth, probe);
      return evaluateBinary(node.operator, left, right);
    }

    case 'Comparison': {
      const left = evaluateNode(node.left, context, locals, depth, probe);
      const right = evaluateNode(node.right, context, locals, depth, probe);
      return evaluateComparison(node.operator, left, right);
    }

    case 'Ternary': {
      const condition = toBoolean(evaluateNode(node.condition, context, locals, depth, probe));
      if (probe) {
        probe.onEvent({ type: 'branch-skipped', node: condition ? node.whenFalse : node.whenTrue });
      }
      return condition
        ? evaluateNode(node.whenTrue, context, locals, depth, probe)
        : evaluateNode(node.whenFalse, context, locals, depth, probe);
    }

    case 'Call':
      return evaluateCall(node, context, locals, depth, probe);
  }
}

function evaluateIdentifier(
  node: IdentifierNode,
  context: EvaluationContext,
  locals: Locals,
  probe: EvaluationProbe | null,
): FormulaValue {
  const { name } = node;

  // Inside a custom function body the only data inputs are its parameters (§5).
  if (locals) {
    if (Object.prototype.hasOwnProperty.call(locals, name)) {
      return report(probe, name, 'local', locals[name]);
    }
    throw invalidComputation(
      `'${name}' is not a parameter of this function. Custom functions may only use their own parameters.`,
    );
  }

  if (name.startsWith('ENV_')) {
    if (!Object.prototype.hasOwnProperty.call(context.env, name)) {
      throw invalidComputation(`'${name}' is not a known environment value.`);
    }
    return report(probe, name, 'env', readCell(context.env[name], name));
  }

  // REPORT_ is record-scoped like ENV_, so it resolves from the same map and
  // is valid in both contexts (ADR-014 D5). It is a separate prefix rather
  // than an ENV_ name because it describes the certificate's reporting unit,
  // not a measured environmental condition.
  //
  // A null REPORT_TO_N — no reporting unit set, or one outside the newton
  // table — reaches readCell as an empty and raises awaiting-input, exactly as
  // a missing environment reading would. It is never defaulted to 1.
  if (name.startsWith('REPORT_')) {
    if (!Object.prototype.hasOwnProperty.call(context.env, name)) {
      throw invalidComputation(`'${name}' is not a known report value.`);
    }
    return report(probe, name, 'report', readCell(context.env[name], name));
  }

  // Mirrors the ENV_ branch above exactly, with one difference: STD_ is
  // row-scoped (ADR-013 D4), so it resolves from the current row's own
  // standard rather than a record-wide broadcast. There is deliberately no
  // special handling of empties here — the STD_C* zero-default is applied
  // upstream in buildStandardVariables, where it cannot reach anything else.
  if (name.startsWith('STD_')) {
    if (context.kind !== 'row') {
      throw invalidComputation(
        context.kind === 'block'
          ? `'${name}' refers to the reference standard of a single calibration point, which a report block row does not have.`
          : `'${name}' refers to the reference standard of a single row, which has no value in a summary field.`,
      );
    }
    if (!context.std) {
      throw awaitingInput(`No reference standard has been selected for this row yet, so ${name} has no value.`);
    }
    if (!Object.prototype.hasOwnProperty.call(context.std, name)) {
      throw invalidComputation(`'${name}' is not a known reference standard value.`);
    }
    return report(probe, name, 'std', readCell(context.std[name], name));
  }

  if (name.startsWith('SUMMARY_')) {
    // ADR-017 D4: legal in block context too. ADR-010's row-context ban is
    // untouched and is exactly what `=== 'row'` states.
    if (context.kind === 'row') {
      throw invalidComputation('Summary fields cannot be used in column formulas.');
    }
    if (!Object.prototype.hasOwnProperty.call(context.summary, name)) {
      throw invalidComputation(`'${name}' is not a known summary field.`);
    }
    return report(probe, name, 'summary', readCell(context.summary[name], name));
  }

  // ADR-017 D4: in block context the block's OWN columns resolve for its own
  // row. Anything else falls through to the measurement-column error below,
  // which is what makes a cross-block reference fail rather than half-work.
  if (context.kind === 'block') {
    if (Object.prototype.hasOwnProperty.call(context.block, name)) {
      return report(probe, name, 'block-column', readCell(context.block[name], name));
    }
    throw invalidComputation(
      `'${name}' is a measurement column, which has no single value in a report block. Use a column aggregate such as col_mean(${name}).`,
    );
  }

  if (context.kind !== 'row') {
    throw invalidComputation(
      `'${name}' is a column reference, which has no single value in a summary field. Use a column aggregate such as col_mean(${name}).`,
    );
  }

  if (!Object.prototype.hasOwnProperty.call(context.row, name)) {
    throw invalidComputation(`'${name}' is not a known column.`);
  }
  return report(probe, name, 'row-column', readCell(context.row[name], name));
}

function evaluateBinary(
  operator: '+' | '-' | '*' | '/' | '**',
  leftValue: FormulaValue,
  rightValue: FormulaValue,
): number {
  const left = requireNumber(leftValue, `The left side of '${operator}'`);
  const right = requireNumber(rightValue, `The right side of '${operator}'`);

  switch (operator) {
    case '+':
      return requireFinite(left + right, "'+'");
    case '-':
      return requireFinite(left - right, "'-'");
    case '*':
      return requireFinite(left * right, "'*'");
    case '/':
      if (right === 0) {
        throw invalidComputation('Division by zero.');
      }
      return requireFinite(left / right, "'/'");
    case '**':
      return requireFinite(left ** right, "'**'");
  }
}

function evaluateComparison(
  operator: '==' | '!=' | '<' | '<=' | '>' | '>=',
  left: FormulaValue,
  right: FormulaValue,
): boolean {
  if (operator === '==') return left === right;
  if (operator === '!=') return left !== right;

  // Ordering requires two values of the same comparable type. Comparing text
  // to a number has no meaningful answer and is far more likely a mistake.
  const sameType = typeof left === typeof right;
  const comparable = typeof left === 'number' || typeof left === 'string';
  if (!sameType || !comparable) {
    throw invalidComputation(
      `'${operator}' cannot compare ${describeValue(left)} with ${describeValue(right)}.`,
    );
  }

  switch (operator) {
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
  }
}

function evaluateCall(
  node: Extract<ExpressionNode, { type: 'Call' }>,
  context: EvaluationContext,
  locals: Locals,
  depth: number,
  probe: EvaluationProbe | null,
): FormulaValue {
  const { callee } = node;

  if (isColumnAggregate(callee)) {
    if (locals) {
      throw invalidComputation('Column aggregates cannot be used inside a custom function.');
    }
    if (context.kind === 'row') {
      throw invalidComputation(
        'Column aggregates can only be used in summary fields and report blocks, not in column formulas.',
      );
    }
    return evaluateColumnAggregate(callee, node.args, context, probe);
  }

  if (isBuiltin(callee)) {
    // No event: a builtin is an opaque numeric function whose arguments are
    // themselves ordinary expressions, already reported as they evaluate. The
    // substituted expression shows `SQRT(4)` without needing one.
    const args = node.args.map((arg, i) =>
      requireNumber(
        evaluateNode(arg, context, locals, depth, probe),
        `Argument ${i + 1} of ${callee}()`,
      ),
    );
    return callBuiltin(callee, args);
  }

  const fn = context.customFunctions[callee];
  if (!fn) {
    throw invalidComputation(`Unknown function '${callee}'.`);
  }

  if (depth >= MAX_CALL_DEPTH) {
    throw invalidComputation(
      `Custom functions nested more than ${MAX_CALL_DEPTH} deep — this usually means they call each other in a loop.`,
    );
  }

  if (node.args.length !== fn.params.length) {
    throw invalidComputation(
      `${callee} expects ${fn.params.length} argument(s), got ${node.args.length}.`,
    );
  }

  // Arguments are evaluated in the CALLER's scope; the body then runs with a
  // fresh scope containing only the parameters (§5).
  const bound: Record<string, FormulaValue> = {};
  fn.params.forEach((param, i) => {
    bound[param] = evaluateNode(node.args[i], context, locals, depth, probe);
  });

  if (!probe) return evaluateNode(fn.body, context, bound, depth + 1, null);

  // Entered/exited bracket the body so the trace can nest it: every event
  // between the two belongs to THIS call, which is what lets `f(1) + f(2)`
  // produce two bodies with different substituted text rather than one
  // flattened muddle.
  probe.onEvent({
    type: 'call-entered',
    functionName: callee,
    params: fn.params,
    args: fn.params.map((param) => bound[param]),
    argNodes: node.args,
    body: fn.body,
    position: node.position,
  });
  let result: FormulaValue | null = null;
  try {
    result = evaluateNode(fn.body, context, bound, depth + 1, probe);
    return result;
  } finally {
    probe.onEvent({ type: 'call-exited', functionName: callee, value: result });
  }
}

function evaluateColumnAggregate(
  name: string,
  args: ExpressionNode[],
  // Both aggregate-capable contexts expose the SAME `rows` array, so this
  // function is unchanged apart from accepting either — the aggregate
  // semantics (including ADR-010's "do NOT skip empties") are shared
  // verbatim rather than reimplemented for blocks.
  context: SummaryEvaluationContext | BlockEvaluationContext,
  probe: EvaluationProbe | null,
): number {
  // The validator guarantees a single bare column reference; this re-checks
  // rather than trusting, since the evaluator is independently callable.
  if (args.length !== 1 || args[0].type !== 'Identifier') {
    throw invalidComputation(`${name} takes exactly one column name, for example ${name}(CAL_IND).`);
  }

  const column = args[0].name;
  const { rows } = context;

  if (rows.length === 0) {
    throw awaitingInput(`${name}(${column}) has no rows to work with yet.`);
  }

  // A column absent from EVERY row is an authoring mistake; absent from only
  // some rows just means those rows are not filled in yet. Distinguishing the
  // two keeps a half-recorded table in `awaiting-input` rather than flagging a
  // spurious `invalid-computation` (§6).
  if (!rows.some((row) => Object.prototype.hasOwnProperty.call(row, column))) {
    throw invalidComputation(`'${column}' is not a known column.`);
  }

  const values: number[] = [];
  for (const row of rows) {
    const cell = row[column];
    if (isEmpty(cell)) {
      // §6: aggregates do NOT skip empties. A mean over an incomplete data set
      // is meaningless, and erroring makes the incompleteness impossible to miss.
      throw awaitingInput(`${column} is not filled in for every row yet.`);
    }
    if (typeof cell !== 'number') {
      throw invalidComputation(`${name}(${column}) needs numbers, but ${column} contains text.`);
    }
    values.push(cell);
  }

  const result = applyColumnAggregate(name, values);

  // ADR-018 requirement: an aggregate whose inputs are invisible defeats the
  // purpose, so the consumed row values travel with the result.
  if (probe) probe.onEvent({ type: 'aggregate', functionName: name, column, values, value: result });
  return result;
}

/**
 * The aggregate arithmetic itself, unchanged and separated only so the values
 * it consumed can be reported alongside what it produced.
 */
function applyColumnAggregate(name: string, values: number[]): number {
  switch (name) {
    case 'col_mean':
      return requireFinite(values.reduce((sum, v) => sum + v, 0) / values.length, `${name}()`);
    case 'col_max':
      return Math.max(...values);
    case 'col_min':
      return Math.min(...values);
    case 'col_sum':
      return requireFinite(values.reduce((sum, v) => sum + v, 0), `${name}()`);
    case 'col_count':
      return values.length;
    case 'col_stdev':
      if (values.length < 2) {
        throw invalidComputation('col_stdev needs at least 2 rows.');
      }
      return requireFinite(sampleStandardDeviation(values), `${name}()`);
    default:
      throw invalidComputation(`Unknown column aggregate '${name}'.`);
  }
}
