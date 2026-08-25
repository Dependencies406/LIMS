/**
 * recordingGridDocument.ts
 *
 * Pure logic for laying out a RecorderTemplate + CalibrationRecord as a TREB
 * grid, and reading raw input values back out of it. No TREB runtime
 * dependency — this only produces/consumes plain data structures, so it is
 * unit-testable without mounting a spreadsheet, and RecordingGrid.tsx is a
 * thin wrapper that feeds these into TREB's public API
 * (LoadDocument/SetRange/GetRange/ApplyStyle/MergeCells).
 *
 * Built against TREB's PUBLIC API only (ADR-007 + the Phase 5b scoping
 * decision) — no reaching into TREB internals the way the existing
 * SpreadsheetGrid.tsx does.
 */

import type {
  ReportBlockColumn, ConversionCellSnapshot, ConversionFailure, ConversionRule, NumberFormat, RecordColumn, RecordRow, RecorderTemplate } from '../types';
import { forceUnitToNewtons } from './forceUnits';
import { convertColumnDisplayValue } from './columnConversion';
import type { StandardWarning } from './referenceStandardVariables';
import type { MockupCellResult } from './recorderTemplateMockup';

export interface GridCellAddress {
  /** 0-based */
  row: number;
  /** 0-based */
  column: number;
}

export interface GridArea {
  start: GridCellAddress;
  end: GridCellAddress;
}

export interface GridColumnLayout {
  sectionId: string;
  columnId: string;
  /** `${sectionId}_${columnId}` — the formula variable / RecordRow key. */
  key: string;
  column: RecordColumn;
  /** 0-based column index in the sheet. */
  gridColumnIndex: number;
}

export interface SectionHeaderMerge {
  area: GridArea;
  label: string;
}

export const SECTION_HEADER_ROW = 0;
export const COLUMN_HEADER_ROW = 1;
export const FIRST_DATA_ROW = 2;

export interface GridLayout {
  columns: GridColumnLayout[];
  sectionMerges: SectionHeaderMerge[];
}

/** Assigns each column (in section/column order) a sequential grid column index. */
export function buildGridLayout(template: RecorderTemplate): GridLayout {
  const columns: GridColumnLayout[] = [];
  const sectionMerges: SectionHeaderMerge[] = [];

  let gridColumnIndex = 0;
  for (const section of template.sections) {
    const startIndex = gridColumnIndex;
    for (const column of section.columns) {
      columns.push({
        sectionId: section.id,
        columnId: column.id,
        key: `${section.id}_${column.id}`,
        column,
        gridColumnIndex,
      });
      gridColumnIndex += 1;
    }
    const endIndex = gridColumnIndex - 1;
    if (endIndex >= startIndex) {
      sectionMerges.push({
        area: {
          start: { row: SECTION_HEADER_ROW, column: startIndex },
          end: { row: SECTION_HEADER_ROW, column: endIndex },
        },
        label: section.label || section.id,
      });
    }
  }

  return { columns, sectionMerges };
}

/**
 * The template's reference-standard column, or null when it has none
 * (ADR-013 D3). At most one is meaningful — one standard per calibration
 * point — so the first in section/column order wins.
 */
export function findStandardColumn(layout: GridLayout): GridColumnLayout | null {
  return layout.columns.find((c) => c.column.type === 'standard') ?? null;
}

/**
 * The value a newly added row should start with in the standard column
 * (ADR-013 D3): the previous row's selection.
 *
 * A calibration run usually works through a range on one standard before
 * switching, so inheriting is right far more often than not — and it is the
 * mitigation the ADR names for the per-row picker being more clicks than the
 * workbook's one-per-sheet selection. Returns null when there is no previous
 * row or it had no selection, which leaves the new row unselected rather than
 * inventing a standard.
 */
export function inheritedStandardValue(
  rows: RecordRow[],
  standardColumnKey: string | null,
): string | null {
  if (!standardColumnKey || rows.length === 0) return null;
  const previous = rows[rows.length - 1][standardColumnKey];
  return typeof previous === 'string' && previous ? previous : null;
}

/**
 * Formula columns whose expression consumes any `STD_*` variable (ADR-014
 * Phase 13). This is how "the force column" is identified generically: not by
 * a naming convention (a template author could call it anything), but by the
 * structural fact that it actually depends on the row's reference standard.
 *
 * A template may have more than one such column (e.g. separate rounds), so
 * this returns all of them; a template with none returns an empty array,
 * which is normal for templates that don't use a `standard` column at all.
 */
const STD_VARIABLE_PATTERN = /\bSTD_(?:C\d|TO_N|UCAL|UA|UB|UC|RESOLUTION)\b/;

export function findStandardDependentFormulaColumns(template: RecorderTemplate): GridColumnLayout[] {
  const layout = buildGridLayout(template);
  return layout.columns.filter(
    (c) => c.column.type === 'formula' && !!c.column.expression && STD_VARIABLE_PATTERN.test(c.column.expression),
  );
}

/**
 * Whether any formula column OR summary field in this template consumes
 * `REPORT_TO_N` (ADR-014 D5, Phase 14 Task 2) — detected structurally, the
 * same way `findStandardDependentFormulaColumns` finds the force column: by
 * what the expression actually references, never by a naming convention.
 *
 * Drives "this template needs a reporting unit, and none is set" messaging.
 * `REPORT_TO_N` is valid in BOTH row and summary contexts (unlike `STD_*`,
 * which is row-only), so summary fields are checked too.
 */
const REPORT_VARIABLE_PATTERN = /\bREPORT_TO_N\b/;

export function templateReferencesReportUnit(template: RecorderTemplate): boolean {
  const formulaHit = template.sections.some((s) =>
    s.columns.some((c) => c.type === 'formula' && !!c.expression && REPORT_VARIABLE_PATTERN.test(c.expression)),
  );
  if (formulaHit) return true;
  return template.summaryFields.some((f) => REPORT_VARIABLE_PATTERN.test(f.expression));
}

/**
 * Every 'selectable' column in the template, i.e. the ones a record-level
 * unit picker needs a control for (Phase 15 Task 1 supersession).
 */
export function findSelectableUnitColumns(template: RecorderTemplate): GridColumnLayout[] {
  const layout = buildGridLayout(template);
  return layout.columns.filter((c) => c.column.unitMode === 'selectable');
}

/**
 * Whether `value` is a legal choice for a 'selectable' column — same rule
 * as the `standard` column (ADR-014 Phase 13): only a value that is
 * actually in the author's list may be stored, never arbitrary text. A
 * column that isn't 'selectable' at all, or has no `unitChoices`, accepts
 * nothing.
 */
export function isValidColumnUnitChoice(column: Pick<RecordColumn, 'unitMode' | 'unitChoices'>, value: string): boolean {
  if (column.unitMode !== 'selectable') return false;
  return (column.unitChoices ?? []).includes(value);
}

/**
 * Parses a comma-separated text input into a trimmed, blank-dropped list —
 * the exact rule the `selection` column's `choices` field already uses
 * (`e.target.value.split(',').map(trim).filter(Boolean)`), pulled out here
 * so `unitChoices` mirrors it exactly instead of re-implementing it inline
 * a second time, and so the parsing itself is unit-testable independent of
 * the builder's JSX.
 */
export function parseCommaSeparatedList(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

export interface ColumnUnitMismatch {
  column: RecordColumn;
  message: string;
}

/**
 * Phase 15 Task 2: warn (never block, never convert) when a formula column
 * that consumes `STD_*` (found the same structural way as
 * `findStandardDependentFormulaColumns`) has an EFFECTIVE unit
 * (`effectiveColumnUnit` — the fixed unit, or the record's chosen unit for
 * a 'selectable' column; a 'selectable' column with nothing chosen yet has
 * no effective unit and is silent), the record's `reportUnit` is set, both
 * are RECOGNIZED force units (`forceUnitToNewtons` returns non-null for
 * each), and the two strings disagree. A column with no effective unit —
 * the common case — is silent, since there's nothing to compare. An
 * unrecognized unit string (a temperature, a dimensionless ratio, a typo)
 * is also silent: this check only knows how to compare force units against
 * each other.
 *
 * Compares the EFFECTIVE unit, never `unitChoices` as a whole — a
 * 'selectable' column with ['N', 'kN', 'kgF'] as choices says nothing about
 * a mismatch on its own; only the one the record actually picked does.
 *
 * This never reads the comparison result back into any calculation — it
 * exists purely to flag the same class of author mistake Task 3 also
 * guards against, from the other direction (declared unit vs. actual
 * conversion target, instead of formula vs. conversion factor).
 */
export function findColumnUnitReportUnitMismatches(
  template: RecorderTemplate,
  reportUnit: string | null | undefined,
  columnUnits: Record<string, string> = {},
): ColumnUnitMismatch[] {
  if (!reportUnit) return [];
  const reportNewtons = forceUnitToNewtons(reportUnit);
  if (reportNewtons === null) return [];

  const mismatches: ColumnUnitMismatch[] = [];
  for (const { key, column } of findStandardDependentFormulaColumns(template)) {
    const unit = effectiveColumnUnit(column, columnUnits[key]);
    if (!unit) continue;
    if (unit === reportUnit) continue;
    const columnNewtons = forceUnitToNewtons(unit);
    if (columnNewtons === null) continue;
    mismatches.push({
      column,
      message: `Column "${column.label || column.id}" is labeled ${unit}, but the record's reporting unit is ${reportUnit}. The displayed unit does not convert the value — check whether this is intentional.`,
    });
  }
  return mismatches;
}

/**
 * Only the raw calibration-standard coefficients (`STD_C0`..`STD_C5`) — the
 * polynomial itself, expressed in the selected standard's own `outputUnit`.
 * Deliberately narrower than `STD_VARIABLE_PATTERN` above: `STD_TO_N` is
 * already a unit-converted newton value, and the uncertainty variables
 * (`STD_UCAL`/`STD_UA`/`STD_UB`/`STD_UC`/`STD_RESOLUTION`) are dimensionless
 * or already-converted — none of them say anything about what unit a
 * column's OWN computed value is in, so referencing only those must not
 * trigger this check.
 */
const STD_COEFFICIENT_PATTERN = /\bSTD_C[0-5]\b/;

/**
 * ADR-015 D3: warns — never blocks, never converts — when a formula column's
 * DECLARED conversion source unit (`conversionSourceUnit`) disagrees with
 * the `outputUnit` of whichever reference standard is selected for a given
 * row, but only when the column's expression reads a raw `STD_C*`
 * coefficient directly. A column that doesn't reference one at all, hasn't
 * opted into conversion, or has no source unit declared yet is silent —
 * there is nothing to compare. Same treatment as `checkDivisorAgreement`:
 * flags the likely author mistake without touching the computed value.
 */
export function findConversionSourceUnitMismatch(
  column: RecordColumn,
  standardOutputUnit: string | undefined,
): StandardWarning | null {
  if (column.type !== 'formula' || !column.conversionEnabled) return null;
  if (!column.expression || !STD_COEFFICIENT_PATTERN.test(column.expression)) return null;
  const sourceUnit = column.conversionSourceUnit?.trim();
  if (!sourceUnit || !standardOutputUnit) return null;
  if (sourceUnit === standardOutputUnit) return null;
  return {
    kind: 'unit',
    message: `Column "${column.label || column.id}" declares its conversion source unit as "${sourceUnit}", but the selected standard's output unit is "${standardOutputUnit}". Conversion will treat the raw value as ${sourceUnit} — check whether this is intentional.`,
  };
}

/** ADR-015 D6: one cell, named for a record-level (not grid-index-keyed) warnings list — see `findConversionFailures`. */
export interface RecordConversionFailure {
  rowIndex: number;
  columnKey: string;
  columnLabel: string;
  failure: ConversionFailure;
}

/**
 * ADR-015 D6, computed from a set of FRESHLY computed cell results (e.g. a
 * live-recalculation hook's own `rowResults`) rather than from
 * `buildGridDocument`'s `conversionFailures` — that one only reflects the
 * record's rows AT MOUNT TIME, so during an active editing session it goes
 * stale after the very first keystroke. This is meant to be recomputed on
 * every recalculation instead, from the SAME rowResults already produced —
 * no extra evaluation, no second engine.
 *
 * A cell that's still `awaiting-input`, errored, or not a number yet is
 * skipped — D6 is about a conversion that WAS needed and could not happen,
 * not about a formula that hasn't produced a value yet.
 */
export function findConversionFailures(
  template: RecorderTemplate,
  rowResults: Array<Record<string, MockupCellResult>>,
  columnUnits: Record<string, string>,
  conversionRules: ConversionRule[],
): RecordConversionFailure[] {
  const layout = buildGridLayout(template);
  const convertingCols = layout.columns.filter((c) => c.column.type === 'formula' && c.column.conversionEnabled);
  if (convertingCols.length === 0) return [];

  const unitByKey = resolveColumnUnitMap(template, columnUnits);
  const failures: RecordConversionFailure[] = [];
  rowResults.forEach((row, rowIndex) => {
    for (const col of convertingCols) {
      const cell = row[col.key];
      if (!cell || cell.error || typeof cell.value !== 'number') continue;
      const result = convertColumnDisplayValue({
        rawValue: cell.value,
        column: col.column,
        targetUnit: unitByKey[col.key],
        rules: conversionRules,
      });
      if (result.failure) {
        failures.push({ rowIndex, columnKey: col.key, columnLabel: col.column.label || col.column.id, failure: result.failure });
      }
    }
  });
  return failures;
}

/**
 * `decimals` serves both notations (ADR-011): in `fixed` it's decimal
 * places; in `scientific` it's mantissa decimal places. No magnitude-based
 * auto-switching — a column renders one way, always.
 */
export function numberFormatToTrebFormat(format: NumberFormat): string {
  const mantissa = format.decimals > 0 ? `0.${'0'.repeat(format.decimals)}` : '0';
  return format.notation === 'scientific' ? `${mantissa}E+00` : mantissa;
}

/**
 * Phase 26 Task 1 — the fallback precision for a FORMULA column whose author
 * never set a format.
 *
 * Formula columns previously had no `numberFormat` control at all, so every
 * computed value rendered at raw IEEE-754 precision: the owner reported both
 * `#####` (TREB "too wide for the column") and `-5.42e-15` — floating-point
 * noise from a subtraction that should read as zero — on screen and in the PDF.
 *
 * This is a MAXIMUM, not a fixed decimal count, and that distinction is the
 * whole design:
 *
 *   -5.42e-15  ->  "0"       (the reported noise, gone)
 *   1.23456789 ->  "1.2346"  (the reported ##### overflow, gone)
 *   50         ->  "50"      (UNCHANGED)
 *   0.5        ->  "0.5"     (UNCHANGED)
 *
 * A fixed-4 default was tried first and rejected on evidence: it rewrote
 * every existing formula column, turning `50` into `50.0000` on certificates
 * that already read `50`. Rounding to at most N places and dropping trailing
 * zeros fixes exactly the two reported defects while leaving every value that
 * already rendered cleanly byte-identical — which is what "existing templates
 * render no worse than today" has to mean.
 *
 * An author who wants a fixed number of decimals (trailing zeros and all)
 * sets `numberFormat` explicitly; that always wins over this.
 *
 * ADR-011 is unaffected: display precision only. The stored value keeps full
 * precision and nothing on the evaluation path reads any of this — see
 * `formulaColumnDecimals.test.ts`.
 */
export const DEFAULT_FORMULA_MAX_DECIMALS = 4;

/**
 * The format string TREB gets for an unformatted formula column. `#` renders
 * a digit only when one is present, so this is the grid's expression of the
 * same "at most N decimals, no trailing zeros" rule as `roundToMaxDecimals`.
 */
export const DEFAULT_FORMULA_TREB_FORMAT = `0.${'#'.repeat(DEFAULT_FORMULA_MAX_DECIMALS)}`;

/**
 * The `NumberFormat` an author EXPLICITLY set for a column, or `null`.
 *
 * Returns null for an unformatted column of any type — including a formula
 * column, whose fallback is the trailing-zero-dropping rule above rather than
 * a `NumberFormat`, and so cannot be expressed here.
 */
export function effectiveNumberFormat(column: RecordColumn | ReportBlockColumn): NumberFormat | null {
  if (column.type === 'number' || column.type === 'formula') return column.numberFormat ?? null;
  return null;
}

/** Rounds to at most `maxDecimals` places, dropping trailing zeros and negative zero. */
export function roundToMaxDecimals(value: number, maxDecimals = DEFAULT_FORMULA_MAX_DECIMALS): string {
  const rounded = Number(value.toFixed(maxDecimals));
  // Number() collapses "-0.0000" to -0; String(-0) is "0", which is exactly
  // the reading we want for float noise. Guarded explicitly so it does not
  // depend on that coincidence.
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/**
 * Applies an EXPLICIT format. Normalises NEGATIVE ZERO:
 * `(-5.42e-15).toFixed(4)` is `"-0.0000"` in JavaScript, so without this the
 * very float noise this feature exists to hide would come back as a minus
 * sign on a zero — which on a certificate reads as a real negative error.
 * A genuinely negative value keeps its sign; only the all-zero-digits case
 * loses it.
 */
export function applyNumberFormat(value: number, format: NumberFormat): string {
  const text = format.notation === 'scientific'
    ? value.toExponential(format.decimals).toUpperCase()
    : value.toFixed(format.decimals);
  return /^-0(\.0*)?(E[+-]\d+)?$/.test(text) ? text.slice(1) : text;
}

/**
 * THE single source of truth for rendering one column value — the grid, the
 * PDF record table, the read-only view and the builder test harness all route
 * through this, so a formula column cannot read one way on screen and another
 * on the certificate.
 *
 * Non-numbers (a text column, or a formula returning "PASS") pass through
 * untouched: formatting a verdict as "PASS.0000" would be absurd.
 */
export function formatColumnValueForDisplay(
  value: string | number | null | undefined,
  column: RecordColumn | ReportBlockColumn,
): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'number') return String(value);
  const explicit = effectiveNumberFormat(column);
  if (explicit) return applyNumberFormat(value, explicit);
  if (column.type === 'formula') return roundToMaxDecimals(value);
  return String(value);
}


/** ADR-015 D6: one cell where conversion was NEEDED but could not be applied. */
export interface GridConversionFailure {
  rowIndex: number;
  gridColumnIndex: number;
  columnKey: string;
  failure: ConversionFailure;
}

/**
 * Phase 22 Task 1: what a column IS, for styling purposes — never anything
 * about its current cell content. 'input' covers every type the technician
 * types free text/numbers into (text, number, selection); 'standard' is its
 * own role because it is CHOSEN via the native dropdown (ADR-014 Phase 13),
 * not typed; 'formula' is computed, never input.
 */
export type ColumnRole = 'input' | 'formula' | 'standard';

/** One column's role, spanning every seeded data row — the structural counterpart to `lockedRanges` (formula-only) but for every column. */
export interface GridColumnRoleRange {
  area: GridArea;
  role: ColumnRole;
}

/**
 * The single definition of "what role does this column have" — used by
 * `buildGridDocument`'s `columnRoles` (every row present at mount) AND by
 * RecordingGrid's `addRow` (a row added AFTER mount, which never goes
 * through `buildGridDocument` again). Exported specifically so a second
 * definition can't drift from this one.
 */
export function columnRoleFor(column: Pick<RecordColumn, 'type'>): ColumnRole {
  if (column.type === 'formula') return 'formula';
  if (column.type === 'standard') return 'standard';
  return 'input';
}

export interface GridDocumentData {
  layout: GridLayout;
  /** Two rows: [0] section labels (only at each merge's start column, blank elsewhere), [1] column labels. */
  headerRows: [Array<string | undefined>, Array<string | undefined>];
  /** One row per record row, one cell per grid column, in gridColumnIndex order. Converted for display (ADR-015) where a formula column has conversion enabled — see `conversionFailures` for cells where that could not happen. */
  dataRows: Array<Array<string | number | undefined>>;
  /** Formula columns, spanning every data row — these are DISPLAY ONLY, never user input. */
  lockedRanges: GridArea[];
  /**
   * Phase 22 Task 1 — every column's role, one range each, spanning every
   * seeded data row regardless of whether that row currently holds a
   * value (an empty draft styles exactly the same as a full one). The
   * ACTUAL colours are a TREB-facing concern and live in RecordingGrid.tsx
   * (this module stays TREB-free per its own file header) — this is only
   * the "which cells get which role" structural data, so the grid and any
   * future renderer share one definition of what a column's role even is.
   */
  columnRoles: GridColumnRoleRange[];
  numberFormats: Array<{ columnIndex: number; format: string }>;
  /** ADR-015 D6 — every cell where conversion was needed but failed; `dataRows` shows the raw value at these positions. Empty when nothing needed conversion. */
  conversionFailures: GridConversionFailure[];
  totalColumns: number;
  totalRows: number;
}

/**
 * Maps a `standard` column's stored composite key (`equipmentId::equationId`)
 * to the human-readable text shown in the grid cell (ADR-014 Phase 13).
 *
 * The KEY, never the label, is what lives in `RecordRow` / Firestore / the
 * evaluator — this map exists purely so the technician sees "CAL-FRC-001 —
 * 1-10 N" in the cell instead of the opaque key. Two legitimate sources:
 * live `StandardOption`s while drafting, or a committed record's own frozen
 * `standardSnapshots` (which already carry a `displayName`) for read-only
 * display — never `loadStandardOptions()` for a committed record.
 */
export type StandardLabelMap = Record<string, string>;

/**
 * Resolves what unit actually applies to a column right now: the fixed
 * unit, or (for 'selectable') whatever the record has chosen for this
 * column so far — `undefined` if nothing's been chosen yet, or if the
 * column has no unit at all. This is the ONE place "which unit is this
 * column reporting in" is decided; Task 2's mismatch check and the header
 * formatter below both call it, so they can never disagree about it.
 *
 * Pure string resolution — reads `unitMode`/`unit`/`unitChoices` and a
 * chosen-unit string, produces another string. Nothing here evaluates
 * anything, and the result never feeds back into a calculation.
 */
export function effectiveColumnUnit(
  column: Pick<RecordColumn, 'unitMode' | 'unit' | 'unitChoices'>,
  chosenUnit?: string | null,
): string | undefined {
  if (column.unitMode === 'fixed') return column.unit || undefined;
  if (column.unitMode === 'selectable') return chosenUnit || undefined;
  // 'sameAs' cannot be answered from one column alone — it needs the whole
  // template to follow the reference. `resolveColumnUnitMap` does that; this
  // function deliberately returns undefined rather than guessing, so a caller
  // that only has one column in hand renders the plain label instead of a
  // wrong unit.
  return undefined;
}

/**
 * The effective display unit for EVERY column in the template, keyed by
 * `${sectionId}_${columnId}` — the one place a `sameAs` reference is
 * followed (Phase 15 Task 1 supersession).
 *
 * `fixed` and `selectable` resolve exactly as `effectiveColumnUnit` does.
 * `sameAs` walks to its `unitSourceColumn`, transitively, so a chain like
 * R3 -> R2 -> R1 lands on whatever R1 actually reports. Chains are followed
 * with a visited set: a cycle (R1 -> R2 -> R1, or a column naming itself)
 * resolves to `undefined` — the plain label, no unit, no crash — and the
 * template verifier reports it as an author error rather than this render
 * path failing. A reference to a column that does not exist resolves the
 * same quiet way, for the same reason.
 *
 * Still purely a display computation: it reads only unit fields and the
 * record's chosen-unit map, and its result is used for header text alone.
 * Nothing here can reach a calculation.
 */
export function resolveColumnUnitMap(
  template: RecorderTemplate,
  columnUnits: Record<string, string> = {},
): Record<string, string | undefined> {
  const byKey = new Map<string, RecordColumn>();
  for (const section of template.sections) {
    for (const column of section.columns) byKey.set(`${section.id}_${column.id}`, column);
  }

  const resolved: Record<string, string | undefined> = {};

  const resolve = (key: string, seen: Set<string>): string | undefined => {
    const column = byKey.get(key);
    if (!column) return undefined;
    if (column.unitMode !== 'sameAs') return effectiveColumnUnit(column, columnUnits[key]);
    // Cycle (or self-reference): stop and report no unit.
    if (seen.has(key)) return undefined;
    const source = column.unitSourceColumn;
    if (!source) return undefined;
    seen.add(key);
    return resolve(source, seen);
  };

  for (const key of byKey.keys()) resolved[key] = resolve(key, new Set());
  return resolved;
}

/** Joins a label with an ALREADY-RESOLVED unit — the shared `label (unit)` formatting. */
export function joinLabelAndUnit(column: Pick<RecordColumn, 'label' | 'id'>, unit?: string): string {
  const base = column.label || column.id;
  return unit ? `${base} (${unit})` : base;
}

/**
 * Joins a column's label and its effective display unit into ONE header
 * string — `label (unit)`, or plain `label`/`id` when there is none (no
 * `unitMode`, 'fixed' with no unit set, or 'selectable' with nothing chosen
 * yet — Phase 15 Task 1, superseded by the fixed/selectable split). The
 * single place this join happens: the grid, the mockup harness, and the PDF
 * record-table band all call this instead of concatenating
 * `label`/unit themselves, so the rendered form can never drift between
 * surfaces and a blank/absent unit never produces stray parentheses.
 *
 * Deliberately does nothing with the column's unit fields beyond string
 * formatting — this function is part of the proof that a unit cannot reach
 * a calculation: every consumer of a column header goes through here, and
 * here only reads unit fields to build display text.
 */
export function formatColumnHeader(
  column: Pick<RecordColumn, 'label' | 'id' | 'unitMode' | 'unit' | 'unitChoices'>,
  chosenUnit?: string | null,
): string {
  return joinLabelAndUnit(column, effectiveColumnUnit(column, chosenUnit));
}

/**
 * Builds the full grid document data from a pinned template snapshot and the
 * record's current rows.
 *
 * `conversionRules` is the FULL rule library (active and inactive alike —
 * `convertColumnDisplayValue` filters to `active` itself, the same way a
 * caller need not pre-filter `standardsById`). Defaults to `[]`, so any
 * existing caller that hasn't been updated to pass rules yet simply sees no
 * column ever convert (every `conversionEnabled` column behaves as if no
 * rule existed — D6's own "no rule" failure path, never a crash).
 *
 * `conversionSnapshots` is ADR-015 D7's frozen-at-commit data, keyed
 * `${rowIndex}:${columnKey}` against `rows` exactly as
 * `calibrationRecordService`'s `buildConversionSnapshots` writes it. When a
 * cell has one, its `convertedValue` is used DIRECTLY instead of calling
 * `convertColumnDisplayValue` — the live rule library is not even consulted
 * for that cell — so a committed record's on-screen numbers can never move
 * even if the underlying rule is later edited. Absent for a draft (nothing
 * committed yet), so a draft always uses the live pipeline.
 */
export function buildGridDocument(
  template: RecorderTemplate,
  rows: RecordRow[],
  standardLabels: StandardLabelMap = {},
  columnUnits: Record<string, string> = {},
  conversionRules: ConversionRule[] = [],
  conversionSnapshots: Record<string, ConversionCellSnapshot> = {},
): GridDocumentData {
  const layout = buildGridLayout(template);
  const totalColumns = layout.columns.length;

  const sectionHeaderRow: Array<string | undefined> = new Array(totalColumns).fill(undefined);
  for (const merge of layout.sectionMerges) {
    sectionHeaderRow[merge.area.start.column] = merge.label;
  }
  // One resolve pass for the whole template so a 'sameAs' column follows its
  // source (which formatColumnHeader alone cannot see). ADR-015 D8 step 3
  // (the conversion pipeline's TARGET unit) reuses this SAME resolution —
  // one place decides "what unit does this column's header actually show",
  // and both the header text and the conversion pipeline read from it.
  const unitByKey = resolveColumnUnitMap(template, columnUnits);
  // Phase 22 Task 1: a symbol marker on a formula column's header — "not
  // colour alone", so the calculated/typed distinction survives for a
  // colour-blind reader and a screen reader alike. Scoped to THIS local
  // construction only, not `joinLabelAndUnit` itself (which the mockup
  // harness and the PDF record-table band also call) — the printed
  // certificate must not carry a grid-only affordance marker.
  const columnHeaderRow: Array<string | undefined> = layout.columns.map((c) => {
    const base = joinLabelAndUnit(c.column, unitByKey[c.key]);
    return c.column.type === 'formula' ? `ƒ ${base}` : base;
  });

  const conversionFailures: GridConversionFailure[] = [];
  const dataRows: Array<Array<string | number | undefined>> = rows.map((row, rowIndex) =>
    layout.columns.map((col) => {
      const value = row[col.key];
      if (value === null || value === undefined) return undefined;
      // Display the readable label, not the raw composite key — but only for
      // an actual match. An unresolved key (e.g. the equipment/equation was
      // since deleted) falls back to showing the key itself rather than
      // silently blanking a row that DOES have a selection.
      if (col.column.type === 'standard' && typeof value === 'string') {
        return standardLabels[value] ?? value;
      }
      // ADR-015 D9: conversion is offered on 'formula' columns only, and
      // only when the author opted in — every other column (including a
      // formula column with conversion left off) is untouched, exactly as
      // before this phase.
      if (col.column.type === 'formula' && col.column.conversionEnabled && typeof value === 'number') {
        const snapshot = conversionSnapshots[`${rowIndex}:${col.key}`];
        if (snapshot) {
          // D7: frozen — never re-derived from the (possibly since-edited) live rules.
          return snapshot.convertedValue;
        }
        const result = convertColumnDisplayValue({
          rawValue: value,
          column: col.column,
          targetUnit: unitByKey[col.key],
          rules: conversionRules,
        });
        if (result.failure) {
          conversionFailures.push({ rowIndex, gridColumnIndex: col.gridColumnIndex, columnKey: col.key, failure: result.failure });
        }
        // Full precision, unrounded (D1/D8 step 6) — this cell's EXISTING
        // numberFormat (below) rounds it at display time, exactly as it
        // already rounds an unconverted raw value. Rounding here too would
        // round twice.
        return result.displayValue;
      }
      return value;
    }),
  );

  const lockedRanges: GridArea[] = [];
  const columnRoles: GridColumnRoleRange[] = [];
  const numberFormats: Array<{ columnIndex: number; format: string }> = [];
  for (const col of layout.columns) {
    if (col.column.type === 'formula' && rows.length > 0) {
      lockedRanges.push({
        start: { row: FIRST_DATA_ROW, column: col.gridColumnIndex },
        end: { row: FIRST_DATA_ROW + rows.length - 1, column: col.gridColumnIndex },
      });
    }
    // Phase 26 Task 1: formula columns are formatted too, via the shared
    // `effectiveNumberFormat` (which supplies DEFAULT_FORMULA_NUMBER_FORMAT
    // when the author set none). Was `type === 'number'` only, which is why
    // a computed column rendered at raw float precision.
    const columnFormat = effectiveNumberFormat(col.column);
    if (columnFormat) {
      numberFormats.push({ columnIndex: col.gridColumnIndex, format: numberFormatToTrebFormat(columnFormat) });
    } else if (col.column.type === 'formula') {
      // No author format: the "at most N decimals, no trailing zeros" default.
      numberFormats.push({ columnIndex: col.gridColumnIndex, format: DEFAULT_FORMULA_TREB_FORMAT });
    }
    // Phase 22 Task 1: one role range per column, spanning every seeded
    // row — mirrors `lockedRanges`' own "nothing to span when there are no
    // rows" guard, but for every column type, not just formula.
    if (rows.length > 0) {
      const role = columnRoleFor(col.column);
      columnRoles.push({
        area: {
          start: { row: FIRST_DATA_ROW, column: col.gridColumnIndex },
          end: { row: FIRST_DATA_ROW + rows.length - 1, column: col.gridColumnIndex },
        },
        role,
      });
    }
  }

  return {
    layout,
    headerRows: [sectionHeaderRow, columnHeaderRow],
    dataRows,
    lockedRanges,
    columnRoles,
    numberFormats,
    conversionFailures,
    totalColumns,
    totalRows: FIRST_DATA_ROW + rows.length,
  };
}

/** Reverse of `StandardLabelMap`: readable label -> the composite key it represents. */
export function invertStandardLabels(standardLabels: StandardLabelMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, label] of Object.entries(standardLabels)) out[label] = key;
  return out;
}

/**
 * Reads raw INPUT values back out of a grid's current cell values (as
 * returned by TREB's GetRange over the full data area). Formula columns are
 * always skipped here — their displayed values are computed and written BY
 * the app, never read back as if they were user input, so re-evaluating
 * never feeds a formula's own last output back into itself.
 *
 * `standardKeyByLabel` reverses `standardLabels` from `buildGridDocument`: a
 * `standard` cell's grid text is a LABEL, and this maps it back to the
 * composite key that actually belongs in `RecordRow`. This is also the
 * enforcement boundary for "no arbitrary text in a standard cell" — TREB's
 * native list validation (`SetValidation`, wired in `RecordingGrid.tsx`)
 * blocks typed entry of anything outside the known labels, but does not gate
 * every write path (e.g. paste). Any text here that is not a recognised
 * label — however it got into the cell — resolves to `null`, never to the
 * raw text itself. A standard cell's stored value is therefore always either
 * a real composite key or unset; it can never become free text.
 */
export function extractInputRows(
  layout: GridLayout,
  dataAreaValues: Array<Array<string | number | boolean | undefined>>,
  standardKeyByLabel: Record<string, string> = {},
): RecordRow[] {
  return dataAreaValues.map((gridRow) => {
    const row: RecordRow = {};
    for (const col of layout.columns) {
      if (col.column.type === 'formula') continue;
      const raw = gridRow[col.gridColumnIndex];
      if (col.column.type === 'standard') {
        row[col.key] = typeof raw === 'string' && raw ? (standardKeyByLabel[raw] ?? null) : null;
        continue;
      }
      if (raw === undefined || raw === '') {
        row[col.key] = null;
      } else if (typeof raw === 'boolean') {
        row[col.key] = raw ? 'TRUE' : 'FALSE';
      } else {
        row[col.key] = raw;
      }
    }
    return row;
  });
}

/**
 * Merges freshly-computed formula/summary values back into a row for
 * display, without disturbing whatever the technician just typed into the
 * input columns of that same row.
 */
export function mergeComputedIntoRow(row: RecordRow, computed: Record<string, string | number | null>): RecordRow {
  return { ...row, ...computed };
}
