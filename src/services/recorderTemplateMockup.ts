/**
 * recorderTemplateMockup.ts
 *
 * Evaluates author-entered sample data against a RecorderTemplate exactly the
 * way real recording will: formula columns row-by-row in dependency order,
 * then summary fields once over all rows, in dependency order.
 *
 * This is the "template mockup / test harness" of draft requirement 3 — it
 * reuses the Phase 3 interpreter directly (parse, evaluate, topologicalSort,
 * walk) and contains no arithmetic or parsing of its own.
 */

import type { RecordRow, RecorderTemplate } from '../types';
import {
  evaluate,
  parseExpression,
  parseFunctionDefinition,
  topologicalSort,
  validateColumnFormulas,
  walk,
  type CellValue,
  type CustomFunctionBinding,
  type FormulaValue,
  type TemplateShape,
} from '../modules/recorder/formula';
import { customFunctionToSource } from './recorderTemplateValidation';
import { buildStandardVariables, type StandardVariableSource } from './referenceStandardVariables';

/**
 * The reference standards a record's rows may point at (ADR-013 D4), keyed by
 * document id. At commit this is the SNAPSHOT map, never the live documents
 * (D6) — that substitution is the whole point of the snapshot.
 */
export type StandardsById = Record<string, StandardVariableSource>;

/**
 * The row key of the template's `standard` column, or null when the template
 * has none. Templates carry at most one meaningful standard column — one
 * standard per calibration point (D3) — so if an author somehow defines
 * several, the first in section/column order wins and the rest are ordinary
 * text columns as far as STD_* is concerned.
 */
export function findStandardColumnKey(template: RecorderTemplate): string | null {
  for (const section of template.sections) {
    for (const column of section.columns) {
      if (column.type === 'standard') return `${section.id}_${column.id}`;
    }
  }
  return null;
}

/**
 * Phase 21 Task 1a: a row where every INPUT column is empty is a row the
 * technician never used, not incomplete data — `calibrationRecordService`'s
 * `commitRecord` drops such rows before evaluation ever sees them, so they
 * neither block commit nor get counted into a `col_*` summary aggregate.
 * "Input column" means anything the technician can type or pick — text,
 * number, selection, standard; `formula` columns are computed, never input,
 * so they take no part in this check. A row with ANY input value is a REAL
 * row and is unaffected by this — it still gets fully validated (ADR-010's
 * strict empty semantics are not weakened for it).
 */
export function isRowEmpty(template: RecorderTemplate, row: RecordRow): boolean {
  for (const section of template.sections) {
    for (const column of section.columns) {
      if (column.type === 'formula') continue;
      const value = row[`${section.id}_${column.id}`];
      if (value !== null && value !== undefined && value !== '') return false;
    }
  }
  return true;
}

export interface MockupCellResult {
  value: FormulaValue | null;
  error?: { kind: 'awaiting-input' | 'invalid-computation'; message: string };
}

export interface MockupResult {
  rows: Array<Record<string, MockupCellResult>>;
  /** Keyed by summary field id (without the SUMMARY_ prefix). */
  summary: Record<string, MockupCellResult>;
  /**
   * ADR-017 — evaluated report blocks, keyed by block id, each an array of
   * that block's OWN rows (its own row axis, not calibration points). Empty
   * for a template with no blocks, so every pre-ADR-017 caller is unaffected.
   */
  blocks: Record<string, Array<Record<string, MockupCellResult>>>;
}

/** A block's typed cells, keyed by block id then `BLOCKID_COLUMNID`. */
export type BlockRowsInput = Record<string, Array<Record<string, CellValue>>>;

function buildCustomFunctions(template: RecorderTemplate): Record<string, CustomFunctionBinding> {
  const bindings: Record<string, CustomFunctionBinding> = {};
  for (const fn of template.customFunctions) {
    try {
      const def = parseFunctionDefinition(customFunctionToSource(fn));
      bindings[def.name] = { name: def.name, params: def.params, body: def.body };
    } catch {
      // An invalid function body is reported by Verify; the mockup simply
      // cannot call it, and any formula that tries will get "Unknown function".
    }
  }
  return bindings;
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

function toCellResult(value: FormulaValue): MockupCellResult {
  return { value };
}

function toCellError(error: unknown): MockupCellResult {
  if (error && typeof error === 'object' && 'kind' in error && 'message' in error) {
    const e = error as { kind: 'awaiting-input' | 'invalid-computation'; message: string };
    return { value: null, error: { kind: e.kind, message: e.message } };
  }
  return {
    value: null,
    error: { kind: 'invalid-computation', message: error instanceof Error ? error.message : String(error) },
  };
}

/**
 * Phase 21 Task 1b: the evaluator's `'X' is not a known column.` message
 * (`evaluator.ts`'s row-context identifier lookup) is only actually true for
 * a genuine authoring typo — an INPUT column is always present in `rowData`
 * (spread from `rawRow` at the top of the row loop below, even when its
 * value is empty), so this message can only fire for a name that is either
 * (a) not a real column at all, or (b) a `formula` column whose OWN
 * evaluation already threw earlier in this same row, so `rowData` never got
 * its key set. Case (b) is a cascade, not an unknown-column defect, and
 * reporting it as one sends the reader looking for a phantom template bug
 * (Phase 21's own diagnosis, from a real 10-issue commit-error list).
 *
 * Matched ONLY against this exact, stable wording — not a generic scan of
 * the formula's identifiers — so a genuinely unrelated fault elsewhere in
 * the same expression (which throws a different message) is never
 * relabelled. Does not touch `evaluator.ts`: this is a translation the
 * orchestrator applies AFTER the fact, using context the evaluator itself
 * doesn't have (which columns already failed this row).
 */
// Column identifiers are `SECTIONID_COLUMNID` (both `/^[A-Z][A-Z0-9]*$/`,
// joined by `_`) — the character class below must include the underscore or
// every composite column name fails to match.
const UNKNOWN_COLUMN_PATTERN = /^'([A-Z][A-Z0-9_]*)' is not a known column\.$/;

function resolveRowError(
  error: unknown,
  column: string,
  sourceByColumn: Map<string, string>,
  failedColumns: Map<string, 'awaiting-input' | 'invalid-computation'>,
): MockupCellResult {
  if (error instanceof Error) {
    const match = UNKNOWN_COLUMN_PATTERN.exec(error.message);
    if (match) {
      const dependency = match[1];
      const dependencyKind = sourceByColumn.has(dependency) ? failedColumns.get(dependency) : undefined;
      if (dependencyKind) {
        // ADR-010: the failed dependency's own KIND propagates unchanged —
        // awaiting-input stays awaiting-input (quiet), a genuine
        // invalid-computation stays invalid-computation (prominent). Never
        // upgraded or downgraded by passing through this column.
        return {
          value: null,
          error: {
            kind: dependencyKind,
            message: `${column} has no value because its dependency '${dependency}' does not have a value.`,
          },
        };
      }
    }
  }
  return toCellError(error);
}

export function evaluateMockup(
  template: RecorderTemplate,
  rawRows: Array<Record<string, CellValue>>,
  env: Record<string, CellValue>,
  standardsById: StandardsById = {},
  /** ADR-017: the typed cells of each report block's own rows. */
  blockRows: BlockRowsInput = {},
): MockupResult {
  const customFunctions = buildCustomFunctions(template);
  const shape = buildShape(template);
  const standardColumnKey = findStandardColumnKey(template);

  const formulaColumns = template.sections.flatMap((section) =>
    section.columns
      .filter((c) => c.type === 'formula' && c.expression)
      .map((c) => ({ column: `${section.id}_${c.id}`, source: c.expression as string })),
  );
  const { evaluationOrder } = validateColumnFormulas(formulaColumns, shape);
  const sourceByColumn = new Map(formulaColumns.map((f) => [f.column, f.source]));

  const rowDataForSummary: Array<Record<string, CellValue>> = [];
  const rowResults: Array<Record<string, MockupCellResult>> = rawRows.map((rawRow) => {
    // rowData accumulates computed formula-column values so a later formula
    // column can reference an earlier one, matching the row-context rule.
    const rowData: Record<string, CellValue> = { ...rawRow };
    const results: Record<string, MockupCellResult> = {};

    // ADR-013 D4: STD_* is resolved PER ROW from that row's own standard.
    // A row with no standard selected, or one naming a standard we were not
    // given, gets `null` — every STD_* then raises awaiting-input, and the
    // coefficient zero-default in buildStandardVariables is never reached.
    const selectedStandardId = standardColumnKey ? rawRow[standardColumnKey] : null;
    const selectedStandard =
      typeof selectedStandardId === 'string' && selectedStandardId
        ? standardsById[selectedStandardId]
        : undefined;
    const std = selectedStandard ? buildStandardVariables(selectedStandard) : null;

    for (const key of Object.keys(rawRow)) {
      results[key] = toCellResult(rawRow[key] as FormulaValue);
    }

    // Phase 21 Task 1b: which formula columns have already failed THIS row,
    // and with which error kind — see resolveRowError's own comment.
    const failedColumns = new Map<string, 'awaiting-input' | 'invalid-computation'>();

    for (const column of evaluationOrder) {
      const source = sourceByColumn.get(column);
      if (!source) continue;
      try {
        const value = evaluate(parseExpression(source), { kind: 'row', row: rowData, env, std, customFunctions });
        rowData[column] = value as CellValue;
        results[column] = toCellResult(value);
      } catch (error) {
        const resolved = resolveRowError(error, column, sourceByColumn, failedColumns);
        results[column] = resolved;
        failedColumns.set(column, resolved.error!.kind);
      }
    }

    rowDataForSummary.push(rowData);
    return results;
  });

  // Summary fields, topologically sorted on SUMMARY_* cross-references —
  // the same machinery Phase 3 uses for custom functions and column formulas.
  const summaryEdges = new Map<string, string[]>();
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
      // Syntax errors surface when this field is evaluated below.
    }
    summaryEdges.set(field.id, deps);
  }
  const { order: summaryOrder } = topologicalSort(
    template.summaryFields.map((f) => f.id),
    summaryEdges,
  );

  const summaryValues: Record<string, CellValue> = {};
  const summaryResults: Record<string, MockupCellResult> = {};
  for (const fieldId of summaryOrder) {
    const field = template.summaryFields.find((f) => f.id === fieldId);
    if (!field) continue;
    try {
      const value = evaluate(parseExpression(field.expression), {
        kind: 'summary',
        rows: rowDataForSummary,
        env,
        summary: summaryValues,
        customFunctions,
      });
      summaryValues[`SUMMARY_${fieldId}`] = value as CellValue;
      summaryResults[fieldId] = toCellResult(value);
    } catch (error) {
      summaryResults[fieldId] = toCellError(error);
    }
  }

  // ── Report blocks (ADR-017 D4) ─────────────────────────────────────────
  //
  // Deliberately LAST: blocks may read col_* aggregates over the measurement
  // rows and SUMMARY_* values, so both must already be final. This ordering
  // is the whole reason D4 specifies "blocks evaluate after all measurement
  // rows and after summary fields" — evaluating them earlier would read a
  // half-built `summaryValues` and produce plausible wrong numbers rather
  // than an error.
  const blockResults: Record<string, Array<Record<string, MockupCellResult>>> = {};
  for (const block of template.reportBlocks ?? []) {
    if (block.kind !== 'table') continue;

    const blockColumnKeys = block.columns.map((c) => `${block.id}_${c.id}`);
    const blockShape: TemplateShape = { ...shape, blockColumns: blockColumnKeys };

    const blockFormulaColumns = block.columns
      .filter((c) => c.type === 'formula' && c.expression)
      .map((c) => ({ column: `${block.id}_${c.id}`, source: c.expression as string }));
    // Same topological machinery as measurement columns — a block formula may
    // reference another formula column of its OWN block, and a cycle between
    // them is rejected exactly as it is for sections.
    const { evaluationOrder: blockOrder } = validateColumnFormulas(blockFormulaColumns, blockShape);
    const blockSourceByColumn = new Map(blockFormulaColumns.map((f) => [f.column, f.source]));

    blockResults[block.id] = (blockRows[block.id] ?? []).map((rawBlockRow) => {
      const blockData: Record<string, CellValue> = { ...rawBlockRow };
      const results: Record<string, MockupCellResult> = {};
      for (const key of Object.keys(rawBlockRow)) {
        results[key] = toCellResult(rawBlockRow[key] as FormulaValue);
      }

      const failedColumns = new Map<string, 'awaiting-input' | 'invalid-computation'>();
      for (const column of blockOrder) {
        const source = blockSourceByColumn.get(column);
        if (!source) continue;
        try {
          const value = evaluate(parseExpression(source), {
            kind: 'block',
            block: blockData,
            rows: rowDataForSummary,
            env,
            summary: summaryValues,
            customFunctions,
          });
          blockData[column] = value as CellValue;
          results[column] = toCellResult(value);
        } catch (error) {
          const resolved = resolveRowError(error, column, blockSourceByColumn, failedColumns);
          results[column] = resolved;
          failedColumns.set(column, resolved.error!.kind);
        }
      }
      return results;
    });
  }

  return { rows: rowResults, summary: summaryResults, blocks: blockResults };
}
