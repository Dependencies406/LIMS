/**
 * recordRecalculation.ts
 *
 * Task 3: live recalculation. Wires the recording grid + environment block
 * to the Phase 3 engine via `evaluateMockup` (Phase 4) — no second engine.
 *
 * `evaluateMockup` recomputes every row and every summary field from scratch
 * on each call; nothing here caches or diffs previous results. That is what
 * makes "any cell feeding an aggregate invalidates the whole summary" true
 * by construction — there is no stale intermediate state to invalidate.
 */

import type { RecordRow, RecorderTemplate, RoundEnvironment } from '../types';
import { evaluateMockup, type MockupCellResult, type StandardsById } from './recorderTemplateMockup';
import { environmentToEnvMap } from './recordEnvironment';
import { mergeComputedIntoRow } from './recordingGridDocument';
import type { CellValue, FormulaValue } from '../modules/recorder/formula';

export interface RecordRecalculationResult {
  /** `rows` with formula-column results merged in — feeds RecordingGrid.updateComputedValues. */
  computedRows: RecordRow[];
  /** Raw per-cell results (value + error) per row, keyed by column — feeds Task 4's error styling. */
  rowResults: Array<Record<string, MockupCellResult>>;
  /** Raw per-field summary results (value + error), keyed by summary field id. */
  summary: Record<string, MockupCellResult>;
}

function toRowValue(value: FormulaValue): string | number | null {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return value;
}

/**
 * Recalculates a draft's formula columns and summary fields for live display.
 *
 * `standards` and `reportUnit` are optional so the many templates with neither
 * a `standard` column nor a unit conversion keep working untouched. When a
 * template does use `STD_*` or `REPORT_TO_N` and these are not supplied, those
 * variables resolve to empty and the affected cells show `awaiting-input` —
 * the correct display for "not selected yet", never a substituted default.
 */
export function recalculateRecord(
  template: RecorderTemplate,
  rows: RecordRow[],
  environment: RoundEnvironment[],
  standards: StandardsById = {},
  reportUnit?: string | null,
): RecordRecalculationResult {
  const env = environmentToEnvMap(environment, reportUnit);
  const result = evaluateMockup(template, rows as Array<Record<string, CellValue>>, env, standards);

  const computedRows = rows.map((row, i) => {
    const cellResults = result.rows[i] ?? {};
    const computed: Record<string, string | number | null> = {};
    for (const [key, cellResult] of Object.entries(cellResults)) {
      // A cell with an error (awaiting-input or invalid-computation) has no
      // value to merge in — Task 4 renders the error itself, not a stale value.
      if (cellResult.error) continue;
      if (cellResult.value !== null) computed[key] = toRowValue(cellResult.value);
    }
    return mergeComputedIntoRow(row, computed);
  });

  return { computedRows, rowResults: result.rows, summary: result.summary };
}
