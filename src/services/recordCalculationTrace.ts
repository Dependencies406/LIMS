/**
 * recordCalculationTrace.ts
 *
 * Phase 33 Task 2 — traces a WHOLE record, splicing cross-column references
 * so a reviewer can follow a calculation from a printed cell all the way
 * down to entered/environment/reference-standard/template-constant leaves,
 * instead of stopping at "this came from another formula column."
 *
 * ── Placement (Task 2 requirement 1) ────────────────────────────────────────
 *
 * Lives in `services/`, NOT in `modules/recorder/formula/`. This is the same
 * placement `recorderTemplateMockup.ts` and `recordRecalculation.ts` already
 * use for the SAME reason: ADR-015 D1's separation rule is directional —
 * "the formula engine, the validator, the evaluator and the recalculation
 * services do not know conversion [or anything else outside evaluation]
 * exists" — and the enforced direction is services -> formula, never the
 * reverse (`columnConversionIsolation.test.ts` asserts this structurally for
 * the evaluation-path file list). This file imports ONLY the formula
 * module's public API (`traceExpression`, `TraceOptions`, `TraceNode`, ...)
 * and the record/template types; the formula module gains no new import at
 * all from this phase, which is what keeps the rule intact. Putting the
 * splicer INSIDE trace.ts, by contrast, would need it to know about
 * `RecorderTemplate`/`CalibrationRecord` shapes — exactly the kind of
 * knowledge ADR-015 D1 keeps out of the evaluation path.
 *
 * ── Why NOT reuse evaluateMockup's loop body directly ───────────────────────
 *
 * `evaluateMockup` (recorderTemplateMockup.ts) is live, tested code driving
 * real recalculation (`useLiveRecalculation` on every keystroke). This phase
 * must not change any computed value, so rather than editing that function
 * to optionally emit traces (a behaviour change to a hot, already-correct
 * path, for no benefit to the paths that don't need tracing), this file
 * mirrors its STRUCTURE — same evaluation order via `validateColumnFormulas`,
 * same summary topological sort, same standard-variable resolution — calling
 * `traceExpression` instead of `evaluate`. Both call the exact same
 * `evaluationOrder`/`topologicalSort`/`buildStandardVariables` PUBLIC
 * functions, so the two can never silently diverge on WHICH order things
 * evaluate in, even though the loop bodies are separate.
 *
 * ── Shared subexpressions (requirement 3) ───────────────────────────────────
 *
 * Each formula column, and each summary field, is traced via `traceExpression`
 * EXACTLY ONCE per record (once per row, for row-scoped columns) and memoized.
 * A second column referencing it gets the SAME already-built subtree spliced
 * in — not a second `traceExpression` call — so tracing cost scales with the
 * number of formula columns/fields, not with how many other formulas
 * reference them. The two reference sites end up as two separate JS objects
 * (a shallow copy, so each keeps its own `parameter`/binding context), but
 * with IDENTICAL content — expandable from either place with the same result.
 *
 * ── Cycles (requirement 2) ───────────────────────────────────────────────────
 *
 * `validateColumnFormulas`'s `evaluationOrder` is already a PARTIAL order
 * when a cycle exists (confirmed by reading `topologicalSort`: it stops
 * appending to `order` at the point a cycle is detected) — so a formula
 * column caught in a cycle is simply ABSENT from `evaluationOrder`, and
 * `evaluateMockup` itself already never evaluates it, by construction, no
 * hang either way. What that leaves silently missing is a VISIBLE node for
 * the reader — this file closes that gap explicitly: every formula column
 * NOT reached by `evaluationOrder` gets an explicit, clearly-marked node
 * (`invalid-computation`, naming it as part of a circular reference) instead
 * of being absent from the trace.
 *
 * On top of that structural protection, `spliceNode` ALSO carries its own
 * `visiting` set and a `MAX_SPLICE_DEPTH` guard, per the prompt's explicit
 * requirement. In normal operation neither ever fires — attaching an
 * already-fully-built dependency is O(1) reference reuse, not further
 * recursion, precisely because evaluation order guarantees the dependency
 * was completed first. They exist as a backstop for a pinned snapshot
 * validated by an older validator version that might not have caught
 * everything `topologicalSort` catches today.
 */

import type {
  CellValue,
  ComputedTraceNode,
  FormulaValue,
  TraceNode,
  TraceOptions,
  TraceStandardIdentity,
} from '../modules/recorder/formula';
import {
  parseExpression,
  parseFunctionDefinition,
  topologicalSort,
  traceExpression,
  validateColumnFormulas,
  walk,
  type CustomFunctionBinding,
  type TemplateShape,
} from '../modules/recorder/formula';
import type {
  ConversionEquation,
  EquipmentRecord,
  RecordRow,
  RecorderTemplate,
  ReferenceStandardSnapshot,
} from '../types';
import { customFunctionToSource } from './recorderTemplateValidation';
import { buildStandardVariables, type StandardVariableSource } from './referenceStandardVariables';
import { findStandardColumnKey, type StandardsById } from './recorderTemplateMockup';

/** Every formula column's own trace, for every row, keyed `${sectionId}_${columnId}`. */
export type RecordTraceRows = Array<Record<string, ComputedTraceNode>>;

/** Every summary field's trace, keyed by field id (no `SUMMARY_` prefix — matches `MockupResult.summary`). */
export type RecordTraceSummary = Record<string, ComputedTraceNode>;

/** Every report block's cell traces, keyed by block id then `${blockId}_${columnId}`, one entry per that block's OWN row. */
export type RecordTraceBlocks = Record<string, RecordTraceRows>;

export interface RecordTrace {
  rows: RecordTraceRows;
  summary: RecordTraceSummary;
  blocks: RecordTraceBlocks;
}

/** ADR-017: the typed cells of each report block's own rows — same shape `evaluateMockup` takes. */
export type BlockRowsInput = Record<string, Array<Record<string, CellValue>>>;

export interface TraceRecordInput {
  template: RecorderTemplate;
  rows: Array<Record<string, CellValue>>;
  env: Record<string, CellValue>;
  standardsById?: StandardsById;
  /** Identity for `reference-standard` nodes, keyed the same as `standardsById`. Absent means nodes carry `standard: null`. */
  standardIdentityById?: Record<string, TraceStandardIdentity>;
  blockRows?: BlockRowsInput;
  /** Human column/field names by label, e.g. `{ CAL_ERR: 'Error' }` — passed straight through to `TraceOptions`. */
  names?: Record<string, string>;
  /** ADR-011 display rendering — see trace.ts's header for why this is caller-supplied, never computed here. */
  formatDisplay?: (label: string, value: FormulaValue) => string | null;
}

function buildCustomFunctions(template: RecorderTemplate): {
  bindings: Record<string, CustomFunctionBinding>;
  sources: Record<string, string>;
} {
  const bindings: Record<string, CustomFunctionBinding> = {};
  const sources: Record<string, string> = {};
  for (const fn of template.customFunctions) {
    try {
      const source = customFunctionToSource(fn);
      const def = parseFunctionDefinition(source);
      bindings[def.name] = { name: def.name, params: def.params, body: def.body };
      // `traceExpression`'s TraceOptions wants the BODY text only (what
      // follows `return`), not the whole `def ...` source — mirrors what
      // `evaluateMockup`'s own customFunctionToSource produces, minus the
      // wrapper, since that wrapper's positions are meaningless to a reader.
      sources[def.name] = fn.expression;
    } catch {
      // Same as evaluateMockup: an invalid function body is reported by
      // Verify; the trace simply cannot expand it, and any caller reaches
      // "Unknown function" the same way evaluation already would.
    }
  }
  return { bindings, sources };
}

function buildShape(template: RecorderTemplate): TemplateShape {
  const columns: string[] = [];
  for (const section of template.sections) {
    for (const column of section.columns) columns.push(`${section.id}_${column.id}`);
  }
  return {
    columns,
    roundCount: template.roundCount,
    summaryFieldIds: template.summaryFields.map((f) => f.id),
    customFunctions: template.customFunctions.map((f) => ({ name: f.name, params: f.params })),
  };
}

// ── Splicing ─────────────────────────────────────────────────────────────

const MAX_SPLICE_DEPTH = 128;

function cycleNode(node: ComputedTraceNode, message: string): ComputedTraceNode {
  return {
    ...node,
    value: null,
    displayValue: null,
    error: { kind: 'invalid-computation', message },
    expression: null,
    substituted: null,
    inputs: [],
    notEvaluated: [],
  };
}

/** An explicit node for a formula column `evaluationOrder` never reached (a cycle). */
function unreachedColumnNode(column: string, name: string | null): ComputedTraceNode {
  return {
    provenance: 'computed',
    label: column,
    name,
    parameter: null,
    value: null,
    displayValue: null,
    error: {
      kind: 'invalid-computation',
      message: `'${column}' could not be evaluated — it is part of a circular reference between formula columns. The pinned template version may predate cycle detection.`,
    },
    origin: { kind: 'expression' },
    expression: null,
    substituted: null,
    inputs: [],
    notEvaluated: [],
  };
}

interface SpliceContext {
  /** This same scope's OTHER already-built traces — this row's formula columns, or this block row's formula columns. */
  ownScope: Map<string, ComputedTraceNode>;
  /** Per-measurement-row formula-column traces, indexed by row — used only inside an aggregate's inputs. */
  rowScopes: RecordTraceRows;
  /** Record-wide summary-field traces. */
  summary: Map<string, ComputedTraceNode>;
}

function spliceFormulaColumnLeaf(
  node: TraceNode,
  target: ComputedTraceNode | undefined,
  visiting: Set<string>,
  depth: number,
): TraceNode {
  if (node.provenance !== 'computed') return node;
  if (depth > MAX_SPLICE_DEPTH) return cycleNode(node, 'Trace depth limit reached — likely a circular reference.');
  if (!target) {
    return cycleNode(
      node,
      `'${node.label}' could not be traced — its own formula was not evaluated (likely a circular reference).`,
    );
  }
  if (visiting.has(node.label)) {
    return cycleNode(node, `Circular reference detected at '${node.label}'.`);
  }
  // `target` was fully built (and itself already spliced) earlier in
  // evaluation order — attaching it is O(1), not further recursion. See
  // this file's header for why `visiting`/depth are a backstop, not load-bearing.
  return {
    ...node,
    origin: target.origin,
    expression: target.expression,
    substituted: target.substituted,
    inputs: target.inputs,
    notEvaluated: target.notEvaluated,
  };
}

function spliceSummaryFieldLeaf(node: TraceNode, target: ComputedTraceNode | undefined): TraceNode {
  if (node.provenance !== 'computed') return node;
  if (!target) {
    return cycleNode(node, `'${node.label}' could not be traced — its own summary field was not evaluated.`);
  }
  return {
    ...node,
    origin: target.origin,
    expression: target.expression,
    substituted: target.substituted,
    inputs: target.inputs,
    notEvaluated: target.notEvaluated,
  };
}

function spliceNode(node: TraceNode, ctx: SpliceContext, visiting: Set<string>, depth: number): TraceNode {
  if (node.provenance !== 'computed') return node;
  if (depth > MAX_SPLICE_DEPTH) return cycleNode(node, 'Trace depth limit reached — likely a circular reference.');

  if (node.origin.kind === 'column-aggregate') {
    // Aggregate inputs are the consumed row values, IN ROW ORDER (trace.ts's
    // own guarantee) — array position is the row index, so no separate
    // rowIndex field is needed to know which per-row scope to splice from.
    return {
      ...node,
      inputs: node.inputs.map((child, i) =>
        spliceFormulaColumnLeaf(child, ctx.rowScopes[i]?.[child.label], visiting, depth + 1),
      ),
    };
  }
  if (node.origin.kind === 'reference' && node.origin.refers === 'formula-column') {
    return spliceFormulaColumnLeaf(node, ctx.ownScope.get(node.label), visiting, depth);
  }
  if (node.origin.kind === 'reference' && node.origin.refers === 'summary-field') {
    return spliceSummaryFieldLeaf(node, ctx.summary.get(node.label));
  }
  return { ...node, inputs: node.inputs.map((c) => spliceNode(c, ctx, visiting, depth + 1)) };
}

// ── Row-scoped formula columns ──────────────────────────────────────────

interface FormulaColumnSpec {
  column: string;
  source: string;
}

function rowFormulaColumns(template: RecorderTemplate): FormulaColumnSpec[] {
  return template.sections.flatMap((section) =>
    section.columns
      .filter((c) => c.type === 'formula' && c.expression)
      .map((c) => ({ column: `${section.id}_${c.id}`, source: c.expression as string })),
  );
}

/** Traces every formula column for one row, splicing column-to-column references as it goes. */
function traceRow(
  formulaColumns: FormulaColumnSpec[],
  evaluationOrder: string[],
  rawRow: Record<string, CellValue>,
  env: Record<string, CellValue>,
  std: Record<string, CellValue> | null,
  customFunctions: Record<string, CustomFunctionBinding>,
  functionSources: Record<string, string>,
  rowIndex: number,
  standard: TraceStandardIdentity | null,
  names: Record<string, string> | undefined,
  formatDisplay: TraceOptions['formatDisplay'],
): { rowData: Record<string, CellValue>; traces: Record<string, ComputedTraceNode> } {
  const sourceByColumn = new Map(formulaColumns.map((f) => [f.column, f.source]));
  const formulaColumnKeys = formulaColumns.map((f) => f.column);
  const rowData: Record<string, CellValue> = { ...rawRow };
  const traces = new Map<string, ComputedTraceNode>();

  for (const column of evaluationOrder) {
    const source = sourceByColumn.get(column);
    if (!source) continue;
    const options: TraceOptions = {
      functionSources,
      names,
      formatDisplay,
      rowIndex,
      standard,
      formulaColumns: formulaColumnKeys,
    };
    let node = traceExpression(source, { kind: 'row', row: rowData, env, std, customFunctions }, options, column);
    node = spliceNode(node, { ownScope: traces, rowScopes: [], summary: new Map() }, new Set(), 0) as ComputedTraceNode;
    traces.set(column, node);
    if (node.error === null && node.value !== null) rowData[column] = node.value as CellValue;
  }

  for (const { column } of formulaColumns) {
    if (!traces.has(column)) traces.set(column, unreachedColumnNode(column, names?.[column] ?? null));
  }

  return { rowData, traces: Object.fromEntries(traces) };
}

// ── Summary fields ───────────────────────────────────────────────────────

/** Mirrors `evaluateMockup`'s own summary dependency graph exactly (SUMMARY_* cross-references only). */
function summaryEvaluationOrder(template: RecorderTemplate): string[] {
  const edges = new Map<string, string[]>();
  for (const field of template.summaryFields) {
    const deps: string[] = [];
    try {
      walk(parseExpression(field.expression), (node) => {
        if (node.type === 'Identifier' && node.name.startsWith('SUMMARY_')) {
          const depId = node.name.slice('SUMMARY_'.length);
          if (template.summaryFields.some((f) => f.id === depId)) deps.push(depId);
        }
      });
    } catch {
      // A syntax error surfaces when this field is traced below, same as evaluateMockup.
    }
    edges.set(field.id, deps);
  }
  return topologicalSort(
    template.summaryFields.map((f) => f.id),
    edges,
  ).order;
}

function traceSummaryFields(
  template: RecorderTemplate,
  rowDataForSummary: Array<Record<string, CellValue>>,
  env: Record<string, CellValue>,
  customFunctions: Record<string, CustomFunctionBinding>,
  functionSources: Record<string, string>,
  formulaColumnKeys: string[],
  rowScopes: RecordTraceRows,
  names: Record<string, string> | undefined,
  formatDisplay: TraceOptions['formatDisplay'],
): { summaryValues: Record<string, CellValue>; traces: Map<string, ComputedTraceNode> } {
  const summaryValues: Record<string, CellValue> = {};
  const traces = new Map<string, ComputedTraceNode>();

  for (const fieldId of summaryEvaluationOrder(template)) {
    const field = template.summaryFields.find((f) => f.id === fieldId);
    if (!field) continue;
    const label = `SUMMARY_${fieldId}`;
    const options: TraceOptions = { functionSources, names, formatDisplay, formulaColumns: formulaColumnKeys };
    let node = traceExpression(
      field.expression,
      { kind: 'summary', rows: rowDataForSummary, env, summary: summaryValues, customFunctions },
      options,
      label,
    );
    node = spliceNode(
      node,
      { ownScope: new Map(), rowScopes, summary: traces },
      new Set(),
      0,
    ) as ComputedTraceNode;
    traces.set(label, node);
    if (node.error === null && node.value !== null) summaryValues[label] = node.value as CellValue;
  }

  return { summaryValues, traces };
}

// ── Report blocks (ADR-017 D4) ───────────────────────────────────────────

function traceBlocks(
  template: RecorderTemplate,
  blockRows: BlockRowsInput,
  rowDataForSummary: Array<Record<string, CellValue>>,
  env: Record<string, CellValue>,
  summaryValues: Record<string, CellValue>,
  customFunctions: Record<string, CustomFunctionBinding>,
  functionSources: Record<string, string>,
  formulaColumnKeys: string[],
  rowScopes: RecordTraceRows,
  summaryTraces: Map<string, ComputedTraceNode>,
  baseShape: TemplateShape,
  names: Record<string, string> | undefined,
  formatDisplay: TraceOptions['formatDisplay'],
): RecordTraceBlocks {
  const result: RecordTraceBlocks = {};

  for (const block of template.reportBlocks ?? []) {
    if (block.kind !== 'table') continue;

    const blockColumnKeys = block.columns.map((c) => `${block.id}_${c.id}`);
    const blockShape: TemplateShape = { ...baseShape, blockColumns: blockColumnKeys };
    const blockFormulaColumns: FormulaColumnSpec[] = block.columns
      .filter((c) => c.type === 'formula' && c.expression)
      .map((c) => ({ column: `${block.id}_${c.id}`, source: c.expression as string }));
    const { evaluationOrder: blockOrder } = validateColumnFormulas(blockFormulaColumns, blockShape);
    const sourceByColumn = new Map(blockFormulaColumns.map((f) => [f.column, f.source]));

    result[block.id] = (blockRows[block.id] ?? []).map((rawBlockRow) => {
      const blockData: Record<string, CellValue> = { ...rawBlockRow };
      const traces = new Map<string, ComputedTraceNode>();

      for (const column of blockOrder) {
        const source = sourceByColumn.get(column);
        if (!source) continue;
        const options: TraceOptions = {
          functionSources,
          names,
          formatDisplay,
          formulaColumns: [...formulaColumnKeys, ...blockColumnKeys],
        };
        let node = traceExpression(
          source,
          {
            kind: 'block',
            block: blockData,
            rows: rowDataForSummary,
            env,
            summary: summaryValues,
            customFunctions,
          },
          options,
          column,
        );
        node = spliceNode(
          node,
          { ownScope: traces, rowScopes, summary: summaryTraces },
          new Set(),
          0,
        ) as ComputedTraceNode;
        traces.set(column, node);
        if (node.error === null && node.value !== null) blockData[column] = node.value as CellValue;
      }

      for (const { column } of blockFormulaColumns) {
        if (!traces.has(column)) traces.set(column, unreachedColumnNode(column, names?.[column] ?? null));
      }

      return Object.fromEntries(traces);
    });
  }

  return result;
}

// ── Public entry point ───────────────────────────────────────────────────

/**
 * Traces every formula column, every summary field, and every report-block
 * cell of one record, splicing cross-references so the result is fully
 * navigable without a separate lookup step.
 *
 * Mirrors `evaluateMockup`'s ordering exactly (rows, then summary fields,
 * then report blocks — ADR-017 D4's stated reason: blocks may read `col_*`
 * aggregates over measurement rows and `SUMMARY_*`, so both must be final
 * first) via the same public `validateColumnFormulas`/`topologicalSort`
 * functions, so the two can never evaluate things in a different order.
 *
 * Does not read Firestore and does not evaluate anything itself — every
 * number comes from `traceExpression`, which runs the SAME `evaluateNode`
 * recursion `evaluate` does (Phase 32). Values are therefore identical to
 * what `evaluateMockup` would produce for the same inputs; this is
 * observation, not a second calculation engine.
 */
export function traceRecord(input: TraceRecordInput): RecordTrace {
  const { template, rows, env, standardsById = {}, standardIdentityById = {}, blockRows = {}, names, formatDisplay } = input;
  const { bindings: customFunctions, sources: functionSources } = buildCustomFunctions(template);
  const baseShape = buildShape(template);
  const standardColumnKey = findStandardColumnKey(template);

  const formulaColumns = rowFormulaColumns(template);
  const { evaluationOrder } = validateColumnFormulas(
    formulaColumns.map((f) => ({ column: f.column, source: f.source })),
    baseShape,
  );
  const formulaColumnKeys = formulaColumns.map((f) => f.column);

  const rowDataForSummary: Array<Record<string, CellValue>> = [];
  const traceRows: RecordTraceRows = rows.map((rawRow, rowIndex) => {
    const selectedStandardId = standardColumnKey ? rawRow[standardColumnKey] : null;
    const source: StandardVariableSource | undefined =
      typeof selectedStandardId === 'string' && selectedStandardId ? standardsById[selectedStandardId] : undefined;
    const std = source ? buildStandardVariables(source) : null;
    const standardIdentity =
      typeof selectedStandardId === 'string' && selectedStandardId
        ? (standardIdentityById[selectedStandardId] ?? null)
        : null;

    const { rowData, traces } = traceRow(
      formulaColumns,
      evaluationOrder,
      rawRow,
      env,
      std,
      customFunctions,
      functionSources,
      rowIndex,
      standardIdentity,
      names,
      formatDisplay,
    );
    rowDataForSummary.push(rowData);
    return traces;
  });

  const { summaryValues, traces: summaryTraceMap } = traceSummaryFields(
    template,
    rowDataForSummary,
    env,
    customFunctions,
    functionSources,
    formulaColumnKeys,
    traceRows,
    names,
    formatDisplay,
  );

  const blocks = traceBlocks(
    template,
    blockRows,
    rowDataForSummary,
    env,
    summaryValues,
    customFunctions,
    functionSources,
    formulaColumnKeys,
    traceRows,
    summaryTraceMap,
    baseShape,
    names,
    formatDisplay,
  );

  const summary: RecordTraceSummary = {};
  for (const [label, node] of summaryTraceMap) summary[label.slice('SUMMARY_'.length)] = node;

  return { rows: traceRows, summary, blocks };
}

// ── Reference-standard identity adapters ─────────────────────────────────

/** Parses an equipment record's ISO date field, or null when unset/invalid — mirrors referenceStandardVariables.ts's own helper, string-returning for the JSON-safe trace type. */
function toIsoOrNull(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Builds `TraceStandardIdentity` from a DRAFT record's live picker option
 * (`referenceStandardOptions.ts`'s `StandardOption` — full `EquipmentRecord`
 * + `ConversionEquation`, since a draft has not snapshotted anything yet).
 */
export function standardIdentityFromEquipment(
  equipment: EquipmentRecord,
  equation: ConversionEquation,
): TraceStandardIdentity {
  return {
    equipmentId: equipment.id,
    equationId: equation.id,
    displayName: `${equipment.name} — ${equation.name}`,
    equipmentCode: equipment.id,
    serialNumber: equipment.serialNumber ?? null,
    calibrationDate: toIsoOrNull(equipment.lastCalibrationDate),
    dueDate: toIsoOrNull(equipment.nextCalibrationDate),
  };
}

/**
 * Builds `TraceStandardIdentity` from a COMMITTED-OR-LATER record's frozen
 * `standardSnapshots` entry (ADR-013 D6 / ADR-014 D6) — this is the one that
 * actually matters for a signed certificate, since a committed record must
 * replay from its snapshot, never from live equipment data (D6).
 */
export function standardIdentityFromSnapshot(snapshot: ReferenceStandardSnapshot): TraceStandardIdentity {
  return {
    equipmentId: snapshot.equipmentId,
    equationId: snapshot.equationId,
    displayName: snapshot.displayName,
    equipmentCode: snapshot.equipmentCode,
    serialNumber: snapshot.serialNumber ?? null,
    calibrationDate: snapshot.calibrationDate ? new Date(snapshot.calibrationDate).toISOString() : null,
    dueDate: snapshot.dueDate ? new Date(snapshot.dueDate).toISOString() : null,
  };
}
