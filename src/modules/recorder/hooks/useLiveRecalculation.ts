/**
 * useLiveRecalculation.ts
 *
 * Task 3: connects RecordingGrid + EnvironmentBlock to the recalculation
 * engine (`recalculateRecord`, which itself only calls Phase 3/4's
 * `evaluateMockup` — no second engine here either).
 *
 * Data flow:
 * - RecordingGrid.onRowsChange / EnvironmentBlock.onChange -> this hook ->
 *   recalculateRecord -> RecordingGrid.updateComputedValues (formula columns
 *   only, via the grid's imperative handle) and `rowResults`/`summary` state
 *   (for Task 4's error-kind styling and any summary display).
 * - The RAW rows/environment last reported by the grid — not the
 *   formula-merged `computedRows` — are what should be persisted (autosave,
 *   commit payload): `updateDraftRecord` stores rows as-is with no
 *   evaluation; only `commitRecord` evaluates and persists computed values,
 *   against the pinned template, at commit time. Mixing the two would mean
 *   a draft's saved formula-column values could drift from what commit
 *   would actually compute.
 *
 * ADR-014 Phase 13: also computes the `standard` column's out-of-range /
 * past-due warnings, once per recalculation — which fires right after a
 * selection is made (selecting a standard IS a rows-change event), so this
 * is genuinely "at selection time" without RecordingGrid needing to know
 * anything about warnings itself. Deliberately NOT computed inside
 * RecordingGrid's own change subscription: this hook already has both the
 * row's chosen standard AND that row's freshly computed force value(s)
 * together, on every recalculation, which is exactly what the warning checks
 * need and what RecordingGrid alone does not have.
 *
 * ADR-015 D1: this file is on the structural isolation test's
 * evaluation-path list — it drives `recalculateRecord` — so it deliberately
 * knows NOTHING about display-time unit conversion beyond the D3 cross-check
 * below (which itself never reads a converted VALUE, only compares two unit
 * STRINGS via `findConversionSourceUnitMismatch`). The D6 "conversion
 * failed" warnings list is computed in `RecordEntryPage.tsx` instead, from
 * this hook's own `rowResults` output — a display-side computation, same
 * footing as RecordingGrid.tsx's own conversion rendering, not part of
 * recalculation.
 *
 * Phase 25 Task 1 — `environment` has exactly ONE owner: RecordEntryPage's
 * own `environment` state. This hook does NOT keep a second copy. It used
 * to (`useState<RoundEnvironment[]>(initialEnvironment)`), which broke two
 * ways at once: (1) `useState`'s initial argument is read only on this
 * hook's FIRST render, which always happens before the record's async load
 * resolves — the hook's own copy locked onto `[]` forever unless the user
 * happened to edit EnvironmentBlock afterward; (2) `handleSaveDraft` and
 * `handleCommit` both read THIS hook's copy (the more "obviously correct"
 * one, since it's what EnvironmentBlock's `value` prop displayed) — so a
 * freshly reopened draft that was saved/committed without ever touching
 * EnvironmentBlock first would silently persist `[]`, ERASING whatever
 * environment data the record actually had. `environment` is now taken as
 * a plain parameter, used only inside `recalc`/`handleRowsChange`/
 * `handleEnvironmentChange` for THIS render — never stored, so there is
 * nothing here that can go stale relative to the page's own state.
 *
 * `rows` has an analogous split, but is NOT being collapsed to a single
 * owner the same way: `rowsRef` exists for a different, still-real reason
 * — RecordingGrid's underlying spreadsheet engine (TREB) reports edits via
 * an async document-change event (Phase 19), so there is a genuine gap
 * between a keystroke and React's `rows` state catching up; `getLatestRows()`
 * exists to read the truly-latest value at commit/save time without
 * waiting for that render. Removing the ref would reintroduce exactly the
 * render-lag risk Phase 19's guards were built to keep out of the loop.
 * `rowsRef` had the IDENTICAL first-render-only seeding bug `environment`
 * had, though: fixed below by keeping it in sync with the freshly-passed
 * `rows` parameter on every render (a plain assignment in the function
 * body, not an effect — see the comment at that line for why this does
 * not reintroduce the two-state race the environment fix avoids).
 */

import { useCallback, useRef, useState } from 'react';
import { recalculateRecord } from '../../../services/recordRecalculation';
import type { StandardsById } from '../../../services/recorderTemplateMockup';
import type { MockupCellResult } from '../../../services/recorderTemplateMockup';
import {
  findStandardColumn,
  findStandardDependentFormulaColumns,
  findConversionSourceUnitMismatch,
  buildGridLayout,
} from '../../../services/recordingGridDocument';
import { checkOptionWarnings } from '../../../services/referenceStandardOptions';
import type { StandardOption } from '../../../services/referenceStandardOptions';
import type { StandardWarning } from '../../../services/referenceStandardVariables';
import type { RecordRow, RecorderTemplate, RoundEnvironment } from '../../../types';
import type { RecordingGridHandle } from '../components/RecordingGrid';

export interface UseLiveRecalculationResult {
  rowResults: Array<Record<string, MockupCellResult>>;
  summary: Record<string, MockupCellResult>;
  /**
   * The out-of-range / past-due warnings for each row's currently selected
   * standard, in row order. A row with no standard selected, or one whose
   * key doesn't resolve to a loaded option, has an empty array — not an
   * error; most rows are unselected for most of a recording session.
   */
  standardWarnings: StandardWarning[][];
  /** Wire directly to RecordingGrid's onRowsChange prop. */
  handleRowsChange: (rows: RecordRow[]) => void;
  /**
   * Wire directly to EnvironmentBlock's onChange prop. Only re-runs
   * recalculation (`environment` itself is NOT hook state — see this
   * file's header comment) — the caller is responsible for actually
   * storing the new value; see RecordEntryPage's own `handleEnvironmentChange`.
   */
  handleEnvironmentChange: (environment: RoundEnvironment[]) => void;
  /** Latest raw input rows reported by the grid — the value to persist, not `computedRows`. */
  getLatestRows: () => RecordRow[];
}

/**
 * Computes each row's standard-selection warnings from this recalculation's
 * own results — no extra fetch.
 *
 * `reportUnit` is threaded straight through to `checkOptionWarnings`, which
 * needs it to convert a computed force (in the report unit) back to the
 * equation's own output unit before comparing against its range — see that
 * function's doc comment for why the raw numbers cannot be compared directly.
 */
function computeStandardWarnings(
  template: RecorderTemplate,
  rows: RecordRow[],
  rowResults: Array<Record<string, MockupCellResult>>,
  options: StandardOption[],
  reportUnit: string | null | undefined,
): StandardWarning[][] {
  if (options.length === 0) return rows.map(() => []);

  const layout = buildGridLayout(template);
  const standardCol = findStandardColumn(layout);
  if (!standardCol) return rows.map(() => []);

  const optionByKey = new Map(options.map((o) => [o.key, o]));
  const forceCols = findStandardDependentFormulaColumns(template);
  // ADR-015 D3: every formula column in the template is a candidate for the
  // conversion-source-unit cross-check — `findConversionSourceUnitMismatch`
  // itself is the filter (conversionEnabled + a raw STD_C* reference), so
  // this deliberately does not pre-filter to `forceCols` above (that list is
  // built from the BROADER `STD_VARIABLE_PATTERN`, which is not what D3 asks
  // for — see that function's own doc comment).
  const allFormulaCols = layout.columns.filter((c) => c.column.type === 'formula');

  return rows.map((row, i) => {
    const key = row[standardCol.key];
    if (typeof key !== 'string' || !key) return [];
    const option = optionByKey.get(key);
    if (!option) return [];

    const forceValues = forceCols.map((col) => {
      const cell = rowResults[i]?.[col.key];
      return cell && !cell.error && typeof cell.value === 'number' ? cell.value : null;
    });
    const warnings = checkOptionWarnings(option, forceValues, reportUnit);

    const conversionWarnings = allFormulaCols
      .map((col) => findConversionSourceUnitMismatch(col.column, option.equation.outputUnit))
      .filter((w): w is StandardWarning => w !== null);

    return [...warnings, ...conversionWarnings];
  });
}

export function useLiveRecalculation(
  template: RecorderTemplate,
  rows: RecordRow[],
  environment: RoundEnvironment[],
  gridRef: React.RefObject<RecordingGridHandle | null>,
  /**
   * The reference standards selectable in this record, keyed by the composite
   * `equipmentId::equationId` cell value (ADR-014 D3). Live equations while
   * drafting; the record's frozen snapshots once committed.
   */
  standards: StandardsById = {},
  /** The record's reporting unit, exposed to formulas as REPORT_TO_N (D5). */
  reportUnit?: string | null,
  /**
   * The SAME loaded `StandardOption[]` the picker uses (ADR-014 Phase 13
   * Task 3) — passed here only to compute selection-time warnings, so the
   * picker and the warnings can never disagree about what a key means.
   * Empty by default for templates with no `standard` column.
   */
  options: StandardOption[] = [],
): UseLiveRecalculationResult {
  const [rowResults, setRowResults] = useState<Array<Record<string, MockupCellResult>>>([]);
  const [summary, setSummary] = useState<Record<string, MockupCellResult>>({});
  const [standardWarnings, setStandardWarnings] = useState<StandardWarning[][]>([]);
  const rowsRef = useRef<RecordRow[]>(rows);
  // Keep the ref caught up with the freshly-passed `rows` on EVERY render —
  // see this file's header comment for why this specific line is what
  // fixes the ref's own first-render-only seeding gap, and why it does not
  // reintroduce the race the `environment` fix avoids: `handleRowsChange`
  // below writes this same ref directly and synchronously on a real edit,
  // strictly before React's next render (and therefore before this line)
  // can run — so this assignment only ever re-confirms a value that is
  // already the latest, never overwrites something newer with something
  // older.
  rowsRef.current = rows;

  const recalc = useCallback(
    (rows: RecordRow[], env: RoundEnvironment[]) => {
      const result = recalculateRecord(template, rows, env, standards, reportUnit);
      gridRef.current?.updateComputedValues(result.rowResults, rows);
      // Phase 21 Task 4a: push freshly-computed summary values into the
      // grid's own Summary tab (a no-op when the template has none).
      gridRef.current?.updateSummaryValues(result.summary);
      setRowResults(result.rowResults);
      setSummary(result.summary);
      setStandardWarnings(computeStandardWarnings(template, rows, result.rowResults, options, reportUnit));
    },
    [template, gridRef, standards, reportUnit, options],
  );

  const handleRowsChange = useCallback(
    (nextRows: RecordRow[]) => {
      rowsRef.current = nextRows;
      recalc(nextRows, environment);
    },
    [recalc, environment],
  );

  const handleEnvironmentChange = useCallback(
    (nextEnvironment: RoundEnvironment[]) => {
      recalc(rowsRef.current, nextEnvironment);
    },
    [recalc],
  );

  const getLatestRows = useCallback(() => rowsRef.current, []);

  return {
    rowResults,
    summary,
    standardWarnings,
    handleRowsChange,
    handleEnvironmentChange,
    getLatestRows,
  };
}
