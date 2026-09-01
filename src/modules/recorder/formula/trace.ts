/**
 * trace.ts
 *
 * The Calculation Trace type (ADR-018 D2/D3) — the structure that shows where
 * a produced value came from, recursively, down to values that were entered or
 * read rather than computed.
 *
 * Types and pure rendering only. The instrumentation that BUILDS these nodes
 * lives in `evaluator.ts` (leaf probe) and in the orchestrator; nothing here
 * evaluates anything.
 *
 * ── Shape: one line per value, children expandable (ADR-018 D3) ─────────────
 *
 * A node is ONE value. Its children are one node per INPUT — not one per AST
 * operator. ADR-018 D3 explicitly rejects full per-operation expansion ("a
 * single row of a force calibration with a full uncertainty budget becomes
 * pages, and reviewers stop reading"), so `2 + 3 * 4` is a single computed
 * node, not a tree of four. Nesting comes from an input being itself computed,
 * which is a RECORD-level recursion (column depends on column), not an
 * AST-level one.
 *
 * `traceNodeToLine` below is the proof of that constraint: every node renders
 * to one readable line with no child expanded.
 *
 * ── Why `displayValue` is supplied, never computed here ─────────────────────
 *
 * `services/recordingGridDocument.ts` holds `applyNumberFormat` /
 * `formatColumnValueForDisplay`, documented there as THE single source of
 * truth for rendering a column value — the grid, the PDF record table and the
 * read-only view all route through it. This module is inside the formula
 * engine, and the dependency direction is services -> formula, never the
 * reverse (ADR-015 D1; `columnConversionIsolation.test.ts` enforces it for the
 * evaluation path).
 *
 * So `displayValue` is filled in BY THE CALLER from that one function, rather
 * than re-derived here. If this module reimplemented ADR-011 rounding, a trace
 * could show a different displayed figure from the certificate it is meant to
 * evidence — which is precisely the defect class ADR-018 D5 exists to catch
 * (exact-string agreement on every reported value). A second implementation
 * would be a second thing to keep in sync, and the trace is the wrong place to
 * discover they diverged.
 *
 * ── JSON, strictly ──────────────────────────────────────────────────────────
 *
 * Later phases store these in Firestore and render them to PDF (ADR-018 D11),
 * so a node must survive `JSON.parse(JSON.stringify(node))` unchanged. Two
 * rules make that true by construction:
 *
 *   1. No class instances, no Map/Set, no Date. Dates are ISO 8601 strings.
 *   2. NO OPTIONAL FIELDS. Absent is written as an explicit `null`, because
 *      `JSON.stringify` DROPS a key whose value is `undefined` — an optional
 *      field would make the round trip lossy and the equality test a lie.
 */

import { walk, type ExpressionNode, type Position } from './ast';
import { isBuiltin, isColumnAggregate } from './builtins';
import { FormulaEvaluationError, type FormulaErrorKind } from './errors';
import { parseExpression } from './parser';
import {
  evaluateWithProbe,
  type EvaluationContext,
  type EvaluationEvent,
  type FormulaValue,
  type ResolveSource,
} from './evaluator';

/** What a traced value can be. Mirrors `FormulaValue`; JSON-safe by construction. */
export type TraceValue = number | string | boolean;

/**
 * Where a value came from (ADR-018 D2). Exactly the six kinds the ADR names.
 *
 * A variable that was never evaluated does NOT get a provenance — see
 * `ComputedTraceNode.notEvaluated`, which names it instead of inventing one.
 */
export type TraceProvenance =
  | 'computed'
  | 'entered'
  | 'reference-standard'
  | 'template-constant'
  | 'environment'
  | 'record-scalar';

/** Every provenance, for exhaustiveness checks and tests. */
export const TRACE_PROVENANCES: readonly TraceProvenance[] = [
  'computed',
  'entered',
  'reference-standard',
  'template-constant',
  'environment',
  'record-scalar',
] as const;

/**
 * A failure attached to the node where it happened. ADR-018's trace is most
 * valuable exactly when a value is missing, so a failed node is still a node.
 */
export interface TraceError {
  kind: FormulaErrorKind;
  message: string;
}

/**
 * Fields every node carries.
 *
 * INVARIANT: exactly one of `value` and `error` is non-null. A node with
 * neither is not representable — a variable that never got evaluated is listed
 * in the parent's `notEvaluated`, not built as a valueless node.
 */
interface TraceNodeCommon {
  /**
   * The machine name a reader recognises from the template: `CAL_ERR` for a
   * column (`SECTIONID_COLUMNID`), `SUMMARY_MAXDEV` for a summary field,
   * `ENV_TEMP_R1`, `STD_C1`, `REPORT_TO_N`.
   */
  label: string;
  /**
   * The human column/field name — `"Error"` for `CAL_ERR`. `null` when the
   * value has no separate human name (an `ENV_*` reading, a literal).
   */
  name: string | null;
  /**
   * When this node is the argument bound to a custom function's parameter,
   * that parameter's name — so the reader sees `nominal <- CAL_NOM = 10` and
   * can follow the body's substituted text. `null` otherwise.
   */
  parameter: string | null;
  /**
   * FULL PRECISION, never rounded (ADR-011). `null` iff `error` is set.
   * This is the value the calculation actually used.
   */
  value: TraceValue | null;
  /**
   * The value as it is DISPLAYED, when this value belongs to a column or field
   * carrying a `NumberFormat`; `null` otherwise. Supplied by the caller from
   * `formatColumnValueForDisplay` — see the file header for why it is not
   * computed here.
   */
  displayValue: string | null;
  /** The failure at this node, or `null` when it produced a value. */
  error: TraceError | null;
}

// ── Computed values ─────────────────────────────────────────────────────────

/** How a computed value was produced. A closed set — illegal states are unrepresentable. */
export type ComputedOrigin =
  | ExpressionOrigin
  | CustomFunctionOrigin
  | ColumnAggregateOrigin
  | ReferenceOrigin;

/** An ordinary formula: a column expression, a summary field, a block cell. */
export interface ExpressionOrigin {
  kind: 'expression';
}

/**
 * A call into a user-authored function. The node's `expression` is the
 * function BODY as authored in the pinned template version, and its `inputs`
 * are the arguments, each tagged with the parameter it bound to.
 *
 * The body text is itself template-constant data (ADR-018 D2); that fact is
 * carried by this origin rather than by a separate child node, so the call
 * still reads as one line.
 */
export interface CustomFunctionOrigin {
  kind: 'custom-function';
  functionName: string;
  /** Parameter names, in declaration order. */
  params: string[];
}

/**
 * `col_mean` / `col_max` / `col_min` / `col_sum` / `col_count` / `col_stdev`.
 *
 * ADR-018's whole point is defeated by an aggregate whose inputs are invisible,
 * so the node's `inputs` are the individual row values it consumed, in row
 * order — never a summary of them.
 */
export interface ColumnAggregateOrigin {
  kind: 'column-aggregate';
  functionName: string;
  /** The column aggregated over, e.g. `CAL_ERR`. */
  column: string;
  /** How many rows were consumed. Equals `inputs.length`. */
  rowCount: number;
}

/**
 * A value read from something already computed elsewhere in this record — a
 * `SUMMARY_*` field, or a formula column referenced by another formula.
 *
 * The evaluator sees only the finished value at this point, so it emits this
 * origin with `expression`/`substituted` null. The orchestrator, which holds
 * that value's own trace, splices the real subtree in. Kept as its own origin
 * so an un-spliced reference is visibly a reference rather than masquerading
 * as an expression with no inputs.
 */
export interface ReferenceOrigin {
  kind: 'reference';
  refers: 'summary-field' | 'formula-column';
}

export interface ComputedTraceNode extends TraceNodeCommon {
  provenance: 'computed';
  origin: ComputedOrigin;
  /**
   * The source expression EXACTLY as authored — never re-printed from the AST.
   * The parser discards parentheses (`( expr )` returns the inner node), so a
   * re-printed expression could not reproduce what the author wrote.
   *
   * `null` only while `origin.kind === 'reference'` and the referenced trace
   * has not been spliced in.
   */
  expression: string | null;
  /**
   * The same expression with each resolved variable replaced by its
   * full-precision value — the single most useful line for a human reviewer,
   * so it is produced by substituting into the ORIGINAL SOURCE TEXT at each
   * identifier's token position, not by re-printing the AST.
   *
   * A name listed in `notEvaluated` is left as a bare name here: it genuinely
   * had no value, and writing one in would be a fabrication.
   *
   * `null` under the same condition as `expression`.
   */
  substituted: string | null;
  /** One node per input, in the order the inputs appear in the expression. */
  inputs: TraceNode[];
  /**
   * Names that appear in the expression but were never evaluated — the
   * short-circuited side of `and`/`or`, or the untaken branch of a ternary.
   *
   * They are named, not noded: they have no value, no provenance and no
   * error, and any of those would be invented. This is what stops the
   * substituted expression from implying a value that was never read.
   */
  notEvaluated: string[];
}

// ── Leaves ──────────────────────────────────────────────────────────────────

/** A person typed it. */
export interface EnteredTraceNode extends TraceNodeCommon {
  provenance: 'entered';
  /** 0-based index into the record's `rows`. `null` outside row context. */
  rowIndex: number | null;
  /** 1-based round, when the value belongs to one. `null` otherwise. */
  round: number | null;
}

/** From the Environment Block for a round (ADR-006/ADR-009). */
export interface EnvironmentTraceNode extends TraceNodeCommon {
  provenance: 'environment';
  /**
   * 1-based round, from the `ENV_*_R<n>` name. `null` when the name carries
   * no round — read from the variable name, never guessed.
   */
  round: number | null;
}

/**
 * Identity of the reference standard a value was read from.
 *
 * Every field here is one that `ReferenceStandardSnapshot` actually stores
 * (ADR-013 D6 / ADR-014 D6). NOTE: that snapshot has NO certificate-number
 * field — `serialNumber`, `equipmentCode` and `displayName` are the identity
 * it does carry, and no certificate identity is fabricated to fill the gap.
 *
 * `calibrationDate`/`dueDate` are stored as `Date` on the snapshot and are
 * ISO 8601 strings here, per this module's JSON rule.
 */
export interface TraceStandardIdentity {
  equipmentId: string | null;
  equationId: string | null;
  /** `"<equipment name> — <equation name>"`. */
  displayName: string | null;
  equipmentCode: string | null;
  serialNumber: string | null;
  /** ISO 8601, or `null` when the snapshot has none. */
  calibrationDate: string | null;
  /** ISO 8601, or `null` when the snapshot has none. */
  dueDate: string | null;
}

/**
 * Read from the equipment register / conversion equation (`STD_*`).
 *
 * `standard` is `null` when the caller had no snapshot to hand — the evaluator
 * itself cannot supply identity, since `buildStandardVariables` hands it only
 * `STD_* -> number | null` with no trace of which device produced them.
 */
export interface ReferenceStandardTraceNode extends TraceNodeCommon {
  provenance: 'reference-standard';
  /** `STD_*` is row-scoped (ADR-013 D4): two rows may use different standards. */
  rowIndex: number | null;
  standard: TraceStandardIdentity | null;
}

/** From the pinned template version. */
export interface TemplateConstantTraceNode extends TraceNodeCommon {
  provenance: 'template-constant';
  /**
   * `literal` — a number or string written in the formula itself.
   * `custom-function-body` — text taken from a template-defined function.
   * `choice` — a value from a column's choice list.
   */
  constantKind: 'literal' | 'custom-function-body' | 'choice';
}

/**
 * A record-level value — in practice `REPORT_TO_N`, the certificate's
 * reporting unit (ADR-014 D5).
 *
 * A column's unit label is deliberately NOT reachable here: ADR-014 D5 makes
 * it non-negotiable that no evaluation path reads `unit`/`unitChoices`/
 * `columnUnits`, so no such value can ever reach a formula to be traced.
 */
export interface RecordScalarTraceNode extends TraceNodeCommon {
  provenance: 'record-scalar';
}

export type TraceNode =
  | ComputedTraceNode
  | EnteredTraceNode
  | EnvironmentTraceNode
  | ReferenceStandardTraceNode
  | TemplateConstantTraceNode
  | RecordScalarTraceNode;

// ── Rendering ───────────────────────────────────────────────────────────────

/** How a value prints inside a substituted expression and on a trace line. */
export function formatTraceValue(value: TraceValue): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/**
 * Renders ONE node as ONE line, with nothing expanded — the ADR-018 D3
 * constraint, made executable. If a node ever needs a child expanded to be
 * understood, this function is where that shows up.
 *
 * Full precision is what the line states; the displayed figure is shown
 * alongside only when it actually differs, so the reader is never left
 * wondering which of two numbers the calculation used.
 */
export function traceNodeToLine(node: TraceNode): string {
  const head = node.parameter ? `${node.parameter} <- ${node.label}` : node.label;
  const named = node.name ? `${head} (${node.name})` : head;

  if (node.error) return `${named} = [${node.error.kind}] ${node.error.message}`;

  const full = node.value === null ? '?' : formatTraceValue(node.value);
  const shown =
    node.displayValue !== null && node.displayValue !== full
      ? `${full} (shows ${node.displayValue})`
      : full;

  if (node.provenance !== 'computed') return `${named} = ${shown}  [${node.provenance}]`;

  const detail = node.substituted !== null ? `  ${node.expression} -> ${node.substituted}` : '';
  const pending =
    node.notEvaluated.length > 0 ? `  [not evaluated: ${node.notEvaluated.join(', ')}]` : '';
  return `${named} = ${shown}  [computed]${detail}${pending}`;
}

// ── Building a trace ────────────────────────────────────────────────────────


/**
 * What the caller must supply that the evaluator cannot know.
 *
 * Everything here is context the ENGINE genuinely does not have: the evaluator
 * sees `STD_C1 -> 2.5`, not which transducer produced it, and it sees a number,
 * not the column's declared decimals. Each field is therefore optional and
 * absent means "not known", never a substituted default.
 */
export interface TraceOptions {
  /**
   * Body source per custom function name, so an expanded body renders exactly
   * as its author wrote it. Absent for a function means its node reports a null
   * expression rather than a reconstructed one.
   */
  functionSources?: Readonly<Record<string, string>>;
  /** Human column/field names by label, e.g. `{ CAL_ERR: 'Error' }`. */
  names?: Readonly<Record<string, string>>;
  /**
   * ADR-011 display rendering. Supply `formatColumnValueForDisplay` from the
   * services layer — see this file's header for why it is not done here.
   */
  formatDisplay?: (label: string, value: TraceValue) => string | null;
  /** 0-based row this evaluation belongs to, for `entered`/`reference-standard`. */
  rowIndex?: number | null;
  /** Identity of this row's reference standard, from the record's snapshot. */
  standard?: TraceStandardIdentity | null;
  /**
   * Labels that are FORMULA columns. They trace as computed references rather
   * than entered values, so the orchestrator can splice their own subtree in.
   * A label absent from this list is treated as entered.
   */
  formulaColumns?: readonly string[];
}

/** `line`/`column` (both 1-based) to a string offset. */
function offsetOf(source: string, position: Position): number {
  let offset = 0;
  let line = 1;
  while (line < position.line) {
    const next = source.indexOf('\n', offset);
    if (next === -1) return source.length;
    offset = next + 1;
    line += 1;
  }
  return Math.min(offset + position.column - 1, source.length);
}

/** `ENV_TEMP_R1` -> 1. Read from the name, never guessed. */
function roundOf(name: string): number | null {
  const match = /_R(\d+)$/.exec(name);
  return match ? Number(match[1]) : null;
}

function toTraceError(error: unknown): TraceError {
  if (error instanceof FormulaEvaluationError) {
    return { kind: error.kind, message: error.message };
  }
  return {
    kind: 'invalid-computation',
    message: error instanceof Error ? error.message : String(error),
  };
}

/** Builds the leaf node for a name the evaluator resolved, tagged by WHICH branch resolved it. */
function leafFor(
  name: string,
  source: ResolveSource,
  value: TraceValue | null,
  error: TraceError | null,
  options: TraceOptions,
): TraceNode {
  const base = {
    label: name,
    name: options.names?.[name] ?? null,
    parameter: null,
    value,
    displayValue: value === null ? null : (options.formatDisplay?.(name, value) ?? null),
    error,
  };

  switch (source) {
    case 'env':
      return { ...base, provenance: 'environment', round: roundOf(name) };
    case 'report':
      return { ...base, provenance: 'record-scalar' };
    case 'std':
      return {
        ...base,
        provenance: 'reference-standard',
        rowIndex: options.rowIndex ?? null,
        standard: options.standard ?? null,
      };
    case 'summary':
      return {
        ...base,
        provenance: 'computed',
        origin: { kind: 'reference', refers: 'summary-field' },
        expression: null,
        substituted: null,
        inputs: [],
        notEvaluated: [],
      };
    case 'row-column':
    case 'block-column':
      // A formula column is a COMPUTED value that happens to be read here; the
      // orchestrator holds its own trace and splices it in. Anything else was
      // typed by a person.
      if (options.formulaColumns?.includes(name)) {
        return {
          ...base,
          provenance: 'computed',
          origin: { kind: 'reference', refers: 'formula-column' },
          expression: null,
          substituted: null,
          inputs: [],
          notEvaluated: [],
        };
      }
      return { ...base, provenance: 'entered', rowIndex: options.rowIndex ?? null, round: null };
    case 'local':
      // Reached only for a parameter read inside a body. Parameter bindings are
      // built from the call's arguments instead, so this is never an input node.
      return { ...base, provenance: 'template-constant', constantKind: 'custom-function-body' };
  }
}

/**
 * The provenance of a name that FAILED to resolve.
 *
 * The evaluator reports no source for a failure — resolution never established
 * one. Classifying by prefix here is reading a NAMING CONVENTION (the same one
 * `variableDocs.ts` documents), not re-deriving evaluation: it decides how to
 * LABEL a value that was never produced, and cannot affect any result.
 */
function failedLeaf(name: string, error: TraceError, options: TraceOptions): TraceNode {
  const source: ResolveSource = name.startsWith('ENV_')
    ? 'env'
    : name.startsWith('REPORT_')
      ? 'report'
      : name.startsWith('STD_')
        ? 'std'
        : name.startsWith('SUMMARY_')
          ? 'summary'
          : 'row-column';
  return leafFor(name, source, null, error, options);
}

/** One expression being evaluated: the root formula, or one custom function body. */
interface Frame {
  source: string | null;
  ast: ExpressionNode | null;
  /** First resolution wins — within one frame a name resolves identically every time. */
  resolved: Map<string, { source: ResolveSource; value: FormulaValue }>;
  failures: Map<string, TraceError>;
  /**
   * Keyed `functionName(column)`, NOT by column alone: one expression may hold
   * `col_max(CAL_ERR) - col_min(CAL_ERR)`, and keying by column would let the
   * second silently overwrite the first.
   */
  aggregates: Map<string, { functionName: string; column: string; values: number[]; value: number }>;
  /**
   * Identifier nodes inside a branch that was never evaluated. Held by AST
   * identity — the same object graph throughout — so a name that resolved
   * elsewhere is still left unsubstituted HERE.
   */
  skipped: Set<ExpressionNode>;
  /**
   * Maps identifier nodes of the AST that was EVALUATED onto the equivalent
   * nodes of the AST used for substitution. They differ for a custom function
   * body, whose evaluated AST is positioned against the whole `def ...` source
   * while substitution runs against the body text alone. Same expression, so
   * the two walk in the same order. `null` when the two are the same graph.
   */
  translate: Map<ExpressionNode, ExpressionNode> | null;
  /** Finished nested calls, with their call-site offset so inputs stay in source order. */
  calls: Array<{ offset: number; node: ComputedTraceNode }>;
  call: { functionName: string; params: string[] } | null;
  /**
   * For a call frame, the argument-to-parameter bindings. Built at call ENTRY,
   * while the caller's frame is still reachable — that is the only moment an
   * identifier argument's real provenance is knowable.
   */
  bindings: TraceNode[];
}

function newFrame(
  source: string | null,
  ast: ExpressionNode | null,
  call: Frame['call'],
  bindings: TraceNode[],
): Frame {
  return {
    source,
    ast,
    resolved: new Map(),
    failures: new Map(),
    aggregates: new Map(),
    skipped: new Set(),
    translate: null,
    calls: [],
    call,
    bindings,
  };
}

function withParameter(node: TraceNode, parameter: string): TraceNode {
  return { ...node, parameter };
}

/**
 * Substitutes each resolved variable into the ORIGINAL SOURCE TEXT at its own
 * token position — never by re-printing the AST, which cannot reproduce the
 * author's parentheses (the parser discards them).
 *
 * A column aggregate has its ARGUMENT replaced by the values it consumed, so
 * `col_max(CAL_ERR)` reads `col_max([0.2, 0.5])`. A name that never resolved is
 * left exactly as written: it had no value, and inventing one here is the
 * failure this whole structure exists to prevent.
 */
function substituteSource(source: string, ast: ExpressionNode, frame: Frame): string {
  const aggregateArgs = new Set<ExpressionNode>();
  walk(ast, (n) => {
    if (n.type === 'Call' && isColumnAggregate(n.callee) && n.args.length === 1) {
      const [arg] = n.args;
      if (arg.type === 'Identifier') aggregateArgs.add(arg);
    }
  });

  const edits: Array<{ start: number; end: number; text: string }> = [];
  walk(ast, (n) => {
    if (n.type !== 'Identifier') return;
    const start = offsetOf(source, n.position);
    const end = start + n.name.length;

    // Inside a skipped branch nothing ran, so nothing is substituted — the
    // reader sees a bare name and knows that span was never computed.
    if (frame.skipped.has(n)) return;

    if (aggregateArgs.has(n)) {
      // Any aggregate over this column consumed the same row values, so the
      // substituted list is identical whichever one this argument belongs to.
      const aggregate = [...frame.aggregates.values()].find((a) => a.column === n.name);
      if (aggregate) {
        edits.push({
          start,
          end,
          text: `[${aggregate.values.map((v) => formatTraceValue(v)).join(', ')}]`,
        });
      }
      return;
    }

    const resolved = frame.resolved.get(n.name);
    if (resolved) edits.push({ start, end, text: formatTraceValue(resolved.value) });
  });

  // Applied back-to-front so earlier offsets stay valid.
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return out;
}

/** A column aggregate as a node whose children are the row values it consumed. */
function aggregateNode(
  aggregate: { functionName: string; column: string; values: number[]; value: number },
  options: TraceOptions,
): ComputedTraceNode {
  const { functionName, column, values, value } = aggregate;
  return {
    provenance: 'computed',
    label: `${functionName}(${column})`,
    name: options.names?.[column] ?? null,
    parameter: null,
    value,
    displayValue: options.formatDisplay?.(column, value) ?? null,
    error: null,
    origin: { kind: 'column-aggregate', functionName, column, rowCount: values.length },
    expression: `${functionName}(${column})`,
    substituted: `${functionName}([${values.map((v) => formatTraceValue(v)).join(', ')}])`,
    inputs: values.map((rowValue, rowIndex) =>
      leafFor(column, 'row-column', rowValue, null, { ...options, rowIndex }),
    ),
    notEvaluated: [],
  };
}

/** Turns a finished frame into its computed node. */
function buildFrame(
  frame: Frame,
  value: FormulaValue | null,
  error: TraceError | null,
  label: string,
  options: TraceOptions,
): ComputedTraceNode {
  const { source, ast } = frame;
  const params = frame.call ? new Set(frame.call.params) : new Set<string>();

  // Names this frame's own text mentions, in source order, each seen once.
  const seen = new Set<string>();
  const ordered: Array<{ name: string; offset: number }> = [];
  const aggregateArgs = new Set<string>();
  /** One entry per aggregate CALL SITE, so two aggregates over one column both appear. */
  const aggregateCalls: Array<{ key: string; offset: number }> = [];
  /** Only-in-a-skipped-branch names, which never ran anywhere in this frame. */
  const skippedOnly = new Set<string>();
  if (ast && source !== null) {
    const customCallArgs = new Set<ExpressionNode>();
    walk(ast, (n) => {
      if (n.type !== 'Call') return;
      if (isColumnAggregate(n.callee)) {
        const [arg] = n.args;
        if (n.args.length === 1 && arg.type === 'Identifier') {
          aggregateArgs.add(arg.name);
          aggregateCalls.push({
            key: `${n.callee}(${arg.name})`,
            offset: offsetOf(source, arg.position),
          });
        }
        return;
      }
      // A CUSTOM function's bare-identifier arguments are already shown as
      // parameter bindings inside that call's own node, with their provenance
      // intact. Listing them again here would say the same thing twice.
      if (!isBuiltin(n.callee)) {
        for (const arg of n.args) if (arg.type === 'Identifier') customCallArgs.add(arg);
      }
    });
    walk(ast, (n) => {
      if (n.type !== 'Identifier') return;
      if (customCallArgs.has(n)) return;
      if (frame.skipped.has(n)) {
        if (!frame.resolved.has(n.name)) skippedOnly.add(n.name);
        return;
      }
      if (seen.has(n.name)) return;
      seen.add(n.name);
      ordered.push({ name: n.name, offset: offsetOf(source, n.position) });
    });
  }

  const positioned: Array<{ offset: number; node: TraceNode }> = [];
  const notEvaluated: string[] = [];

  // An aggregate's argument is reported by the aggregate node, which shows
  // every row value; a second bare node for the column name would say less.
  for (const { key, offset } of aggregateCalls) {
    const aggregate = frame.aggregates.get(key);
    if (aggregate) positioned.push({ offset, node: aggregateNode(aggregate, options) });
  }

  for (const { name, offset } of ordered) {
    if (aggregateArgs.has(name)) continue;
    // A parameter is reported as the binding built from the call's argument,
    // which carries where the value actually came from.
    if (params.has(name)) continue;

    const resolved = frame.resolved.get(name);
    if (resolved) {
      positioned.push({ offset, node: leafFor(name, resolved.source, resolved.value, null, options) });
      continue;
    }
    const failure = frame.failures.get(name);
    if (failure) {
      positioned.push({ offset, node: failedLeaf(name, failure, options) });
      continue;
    }
    notEvaluated.push(name);
  }
  for (const name of skippedOnly) if (!notEvaluated.includes(name)) notEvaluated.push(name);

  for (const call of frame.calls) positioned.push({ offset: call.offset, node: call.node });
  positioned.sort((a, b) => a.offset - b.offset);

  // Parameter bindings lead: they are what the body's substituted text is
  // written in terms of, so the reader meets them before they are used.
  const bindings = frame.bindings;

  const substituted =
    ast && source !== null ? substituteSource(source, ast, frame) : null;

  // `col_max(CAL_ERR)` on its own is the aggregate, not an expression wrapping
  // one — the overwhelmingly common summary-field shape should not gain an
  // empty layer just to stay uniform.
  const soleAggregate =
    !frame.call &&
    ast?.type === 'Call' &&
    isColumnAggregate(ast.callee) &&
    positioned.length === 1 &&
    positioned[0].node.provenance === 'computed' &&
    (positioned[0].node as ComputedTraceNode).origin.kind === 'column-aggregate'
      ? (positioned[0].node as ComputedTraceNode)
      : null;

  if (soleAggregate && error === null) return { ...soleAggregate, label };

  return {
    provenance: 'computed',
    label,
    name: options.names?.[label] ?? null,
    parameter: null,
    value: error === null ? (value as TraceValue | null) : null,
    displayValue:
      error === null && value !== null ? (options.formatDisplay?.(label, value) ?? null) : null,
    error,
    origin: frame.call
      ? { kind: 'custom-function', functionName: frame.call.functionName, params: frame.call.params }
      : { kind: 'expression' },
    expression: source,
    substituted,
    inputs: [...bindings, ...positioned.map((p) => p.node)],
    notEvaluated,
  };
}

/**
 * The node for one argument bound to one parameter.
 *
 * A bare-identifier argument keeps the provenance it actually had, so
 * `nominal <- CAL_NOM` still reads as entered data. A literal is
 * template-constant: it was written into the pinned template.
 */
function bindingNode(
  param: string,
  argNode: ExpressionNode | undefined,
  value: FormulaValue | undefined,
  caller: Frame,
  options: TraceOptions,
): TraceNode {
  const traceValue = (value ?? null) as TraceValue | null;

  // A bare identifier keeps the provenance it actually resolved with in the
  // caller, so `nominal <- CAL_NOM` still reads as entered data rather than
  // becoming an anonymous number.
  if (argNode && argNode.type === 'Identifier') {
    // Forwarding a parameter into a further call (`percent` passing its own `n`
    // to `err`) must carry the ORIGINAL origin through. Re-tagging the caller's
    // own binding does that; resolving it as a `local` would relabel entered
    // data as a template constant one level down.
    const forwardedIndex = caller.call ? caller.call.params.indexOf(argNode.name) : -1;
    if (forwardedIndex >= 0 && caller.bindings[forwardedIndex]) {
      return withParameter(caller.bindings[forwardedIndex], param);
    }
    const resolved = caller.resolved.get(argNode.name);
    if (resolved) {
      return withParameter(
        leafFor(argNode.name, resolved.source, resolved.value, null, options),
        param,
      );
    }
  }

  if (argNode && (argNode.type === 'NumberLiteral' || argNode.type === 'StringLiteral')) {
    return {
      provenance: 'template-constant',
      constantKind: 'literal',
      label: formatTraceValue(argNode.value),
      name: null,
      parameter: param,
      value: traceValue,
      displayValue: null,
      error: null,
    };
  }

  // A compound argument expression: its value is what bound to the parameter,
  // and its own variables are already visible in the CALLER's substituted text.
  // It gets no separate subtree — recorded in PHASE_32_RESULT.md as a known gap.
  return {
    provenance: 'computed',
    label: param,
    name: null,
    parameter: param,
    value: traceValue,
    displayValue: null,
    error: null,
    origin: { kind: 'expression' },
    expression: null,
    substituted: null,
    inputs: [],
    notEvaluated: [],
  };
}

/**
 * Evaluates `source` against `context` and returns the Calculation Trace for it.
 *
 * The returned node's `value` is BY CONSTRUCTION the value `evaluate` produces
 * for the same inputs: this runs the same `evaluateNode` recursion through
 * `evaluateWithProbe`, and observes it rather than recomputing anything.
 * `trace.test.ts` asserts that across the whole existing golden set.
 *
 * A failing expression still returns a node: whatever resolved before the
 * failure is present, with the error attached to the node it happened in.
 * Diagnosing a failure is when a trace is worth most.
 *
 * Throws only what `parseExpression` throws — a `FormulaSyntaxError` means
 * there is no expression to trace, which is a different problem from a value
 * that could not be produced.
 */
export function traceExpression(
  source: string,
  context: EvaluationContext,
  options: TraceOptions = {},
  label = 'result',
): ComputedTraceNode {
  const ast = parseExpression(source);
  const stack: Frame[] = [newFrame(source, ast, null, [])];
  const top = () => stack[stack.length - 1];

  const probe = {
    onEvent(event: EvaluationEvent): void {
      const frame = top();
      switch (event.type) {
        case 'resolve':
          if (!frame.resolved.has(event.name)) {
            frame.resolved.set(event.name, { source: event.source, value: event.value });
          }
          return;

        case 'resolve-failed':
          if (!frame.failures.has(event.name)) {
            frame.failures.set(event.name, { kind: event.kind, message: event.message });
          }
          return;

        case 'aggregate':
          frame.aggregates.set(`${event.functionName}(${event.column})`, {
            functionName: event.functionName,
            column: event.column,
            values: event.values,
            value: event.value,
          });
          return;

        case 'branch-skipped':
          walk(event.node, (n) => {
            if (n.type !== 'Identifier') return;
            frame.skipped.add(frame.translate?.get(n) ?? n);
          });
          return;

        case 'call-entered': {
          const bindings = event.params.map((param, i) =>
            bindingNode(param, event.argNodes[i], event.args[i], frame, options),
          );
          const bodySource = options.functionSources?.[event.functionName] ?? null;
          // The bound `body` AST carries positions relative to the whole
          // `def name(...):\n    return <expr>` source it was parsed from, not
          // to the body text alone. Re-parsing the body source gives an AST
          // whose positions index THAT string, which is what substitution
          // needs. Same expression either way — this is used for positions and
          // names only, never to produce a value.
          let bodyAst: ExpressionNode | null = null;
          if (bodySource !== null) {
            try {
              bodyAst = parseExpression(bodySource);
            } catch {
              // A body source that does not parse simply gets no substituted
              // text; the value it produced is unaffected.
              bodyAst = null;
            }
          }
          const pushed = newFrame(
            bodyAst === null ? null : bodySource,
            bodyAst,
            { functionName: event.functionName, params: event.params },
            bindings,
          );
          if (bodyAst) {
            const evaluated: ExpressionNode[] = [];
            walk(event.body, (n) => {
              if (n.type === 'Identifier') evaluated.push(n);
            });
            const rendered: ExpressionNode[] = [];
            walk(bodyAst, (n) => {
              if (n.type === 'Identifier') rendered.push(n);
            });
            if (evaluated.length === rendered.length) {
              pushed.translate = new Map(evaluated.map((n, i) => [n, rendered[i]]));
            }
          }
          // Remembered on the frame so the finished node can be filed at the
          // call site, keeping inputs in the order the source reads.
          (pushed as Frame & { offset?: number }).offset =
            frame.source === null ? 0 : offsetOf(frame.source, event.position);
          stack.push(pushed);
          return;
        }

        case 'call-exited': {
          const finished = stack.pop();
          if (!finished) return;
          const offset = (finished as Frame & { offset?: number }).offset ?? 0;
          const node = buildFrame(
            finished,
            event.value,
            // A body that threw has its error reported by the enclosing frame,
            // which is where the failure surfaces to the reader.
            null,
            `${event.functionName}(${finished.call?.params.join(', ') ?? ''})`,
            options,
          );
          top().calls.push({ offset, node });
          return;
        }
      }
    },
  };

  let value: FormulaValue | null = null;
  let error: TraceError | null = null;
  try {
    value = evaluateWithProbe(ast, context, probe);
  } catch (caught) {
    error = toTraceError(caught);
  }

  // A throw unwinds without call-exited running for frames still open, so any
  // remaining are folded back in rather than dropped — the partial trace up to
  // the point of failure is exactly what requirement 6 asks for.
  while (stack.length > 1) {
    const finished = stack.pop() as Frame & { offset?: number };
    const node = buildFrame(
      finished,
      null,
      null,
      `${finished.call?.functionName ?? 'call'}(${finished.call?.params.join(', ') ?? ''})`,
      options,
    );
    top().calls.push({ offset: finished.offset ?? 0, node });
  }

  return buildFrame(stack[0], value, error, label, options);
}
