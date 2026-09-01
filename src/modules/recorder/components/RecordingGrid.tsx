/**
 * RecordingGrid.tsx
 *
 * Mounts a TREB spreadsheet (ADR-007: extend TREB, do not build a new grid)
 * as the recording surface for a CalibrationRecord's rows, laid out per
 * `recordingGridDocument.ts`. Built against TREB's PUBLIC API only
 * (CreateSpreadsheet/SetRange/GetRange/ApplyStyle/MergeCells/Subscribe/
 * SetColumnWidth/Freeze/Resize/Batch/SetValidation) — no reaching into TREB
 * internals the way `SpreadsheetGrid.tsx` does.
 *
 * Contract with the parent (deliberately simple — remount on identity change
 * rather than diff/patch):
 * - Mount once per (template, record) pair. Pass a `key` from the parent
 *   (e.g. `${template.id}_${template.version}_${record.id}`) so React remounts
 *   this component — and TREB is recreated from scratch — whenever the
 *   template shape or the record being edited changes. `rows` is read only
 *   at mount time to seed the grid; after that, TREB itself is the source of
 *   truth for cell content.
 * - User edits flow OUT via `onRowsChange`, called with freshly-typed INPUT
 *   values only (formula columns are never read back as input — see
 *   `extractInputRows`).
 * - Freshly computed formula-column values flow IN via the imperative
 *   `updateComputedValues` handle (Task 3 wires this to the recalculation
 *   engine) — this writes only formula columns, never touching whatever the
 *   technician is currently typing into an input column.
 * - `addRow` appends one blank input row (used when `allowRowAdd` is true).
 *
 * Updatable-in-place vs remount-required (Phase 23 Task 1 — keep this list
 * current; it is the actual contract, not a suggestion):
 * - `columnUnits` — updatable in place via the imperative `updateHeaders`
 *   handle. ADR-015 D1: conversion is display-only, so a unit change needs
 *   no re-read of raw data — only the header row's text and converted
 *   formula-column DISPLAY values change; no input cell is touched.
 * - `standardOptions`/`standardLabels` and `conversionRules` STILL require a
 *   remount (still in the parent's `key`) — both are read once at mount to
 *   seed the picker/label maps and the rule library respectively, and
 *   nothing updates them in place; a 0 -> N transition after their async
 *   load needs the remount to be picked up at all.
 * - `record.status` STILL requires a remount — it drives `isReadOnly`, which
 *   sets `in_cell_editor` at `CreateSpreadsheet` time (TREB has no public API
 *   to toggle that post-mount) and gates whether the change subscription is
 *   attached at all.
 *
 * Read-only enforcement (ADR-007 scoping decision): `isReadOnly` disables
 * the in-cell editor via TREB's documented `in_cell_editor` option and skips
 * the change subscription entirely — this is a real option, not a hack.
 * Formula-column "locked" styling is applied for visual affordance only;
 * the actual guarantee that formula-column content is never persisted as
 * input comes from `extractInputRows` (Task 1a), which unconditionally
 * skips formula-type columns regardless of what the grid displays there.
 * TREB's per-cell `locked` style does not by itself block typing (confirmed
 * by `SpreadsheetGrid.tsx`, which has to intercept Delete/Backspace via
 * undocumented internals to enforce it) — we deliberately do not replicate
 * that internals-reaching pattern here.
 *
 * ── The `standard` column picker (ADR-014 Phase 13) ─────────────────────────
 *
 * TREB has a genuine PUBLIC data-validation API — `SetValidation(target,
 * list: CellValue[], error: boolean)` — verified against its own source (not
 * just its .d.ts) to be real, wired machinery: it dispatches a command,
 * renders an actual dropdown caret + list on selection, and with `error:
 * true` blocks committing any typed value outside the list. This is used
 * here instead of a custom popover: no free text is ever accepted into a
 * `standard` cell through ordinary typing.
 *
 * The one thing native validation cannot do is separate "what's displayed"
 * from "what's stored" — the list IS the literal cell value. Since the
 * record's stored value must stay the opaque composite key
 * (`equipmentId::equationId`, ADR-014 D3) while the technician sees a
 * readable "equipment — range" label, this component runs its OWN
 * translation layer at the two boundaries: `standardOptions` seeds the grid
 * with LABELS (`buildGridDocument`'s `standardLabels` map) and the
 * validation list IS that same label set; reading back
 * (`extractInputRows`'s `standardKeyByLabel`) reverses label -> key before
 * anything reaches `onRowsChange`. A `standard` cell's value in `RecordRow`
 * is therefore always either a real composite key or `null` — never
 * arbitrary text, even if some write path (e.g. paste) put unrecognised text
 * in the cell, because that text simply fails the reverse lookup.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { TREB } from '@trebco/treb';
import type { EmbeddedSpreadsheet, EmbeddedSheetEvent, CellValue, CellStyle, IArea } from '@trebco/treb';
import {
  buildGridLayout,
  buildGridDocument,
  extractInputRows,
  invertStandardLabels,
  findStandardColumn,
  resolveColumnUnitMap,
  joinLabelAndUnit,
  FIRST_DATA_ROW,
  columnRoleFor,
  type ColumnRole,
  type GridLayout,
  type StandardLabelMap,
} from '../../../services/recordingGridDocument';
import { convertColumnDisplayValue } from '../../../services/columnConversion';
import { getColumnIndex } from '../../../utils/formulaHelpers';
import type { MockupCellResult } from '../../../services/recorderTemplateMockup';
import type { StandardOption } from '../../../services/referenceStandardOptions';
import type { ConversionCellSnapshot, ConversionRule, RecordRow, RecorderTemplate } from '../../../types';

/**
 * Task 4 (ADR-010): `awaiting-input` is the expected state for most of a
 * recording session (a formula waiting on a cell nobody has typed into yet)
 * and must stay QUIET — styled identically to a normal computed cell, with
 * no error text, so it never trains people to tune out error styling.
 * `invalid-computation` is a real fault (div-by-zero, domain error) and must
 * be visually PROMINENT — a red fill plus the error text right in the cell.
 */
/**
 * Phase 22 Task 1 — column role tints (`buildGridDocument`'s `columnRoles`
 * decides WHICH cells; the actual colours, a TREB-facing concern, live
 * here). `COMPUTED_CELL_STYLE` below deliberately carries the SAME fill as
 * `FORMULA_ROLE_STYLE`: `updateComputedValues` re-applies it with
 * `delta:false` (replace, not merge) on every recalculation, which would
 * otherwise wipe the mount-time role tint the instant a formula cell first
 * gets a value. Giving the "no error" formula state the identical fill
 * makes that replace visually a no-op, so a formula column stays
 * consistently grey whether idle or freshly computed.
 *
 * Precedence (stated, not just implemented): role tint is the BASE layer,
 * applied once at mount. `CONVERSION_FAILURE_STYLE` (mount AND
 * `updateComputedValues`) and `INVALID_COMPUTATION_STYLE`
 * (`updateComputedValues` only) both set `fill` explicitly and are always
 * applied AFTER the role tint in `applyLayout`'s write order, or on a
 * later `updateComputedValues` call — either way the later write wins, so
 * an error can never be hidden underneath a role tint.
 */
const INPUT_ROLE_STYLE: CellStyle = { fill: { text: '#fef9c3' } }; // pale yellow — the lab's own worksheet convention for technician entry
const FORMULA_ROLE_FILL = { text: '#f3f4f6' }; // same grey as HEADER_FILL below — "not directly editable" reads consistently
const FORMULA_ROLE_STYLE: CellStyle = { fill: FORMULA_ROLE_FILL };
const STANDARD_ROLE_STYLE: CellStyle = { fill: { text: '#e0e7ff' } }; // distinct light indigo — CHOSEN via the native dropdown, not typed
const ROLE_STYLE: Record<ColumnRole, CellStyle> = {
  input: INPUT_ROLE_STYLE,
  formula: FORMULA_ROLE_STYLE,
  standard: STANDARD_ROLE_STYLE,
};

const COMPUTED_CELL_STYLE: CellStyle = { locked: true, fill: FORMULA_ROLE_FILL };
const INVALID_COMPUTATION_STYLE: CellStyle = { locked: true, fill: { text: '#fee2e2' }, text: { text: '#991b1b' }, bold: true };
/**
 * ADR-015 D6: conversion was needed but could not be applied (no rule,
 * expression error, divide-by-zero, non-finite result). The RAW value is
 * still shown underneath — this is only a visual marker, amber rather than
 * the red `INVALID_COMPUTATION_STYLE` since it is not a formula fault, just
 * a missing/broken conversion rule.
 */
const CONVERSION_FAILURE_STYLE: CellStyle = { locked: true, fill: { text: '#fef3c7' }, text: { text: '#92400e' } };
/**
 * Phase 22 Task 2 — section header tints, cycling so adjacent sections
 * differ; all light enough to keep the header's existing dark bold text
 * readable on top (contrast checked against the header's default black
 * text, not decorative — a metrologist reads this).
 */
const SECTION_HEADER_PALETTE: string[] = ['#dbeafe', '#dcfce7', '#fce7f3', '#ffedd5', '#ede9fe'];
const SECTION_BOUNDARY_BORDER_FILL = { text: '#4b5563' };

/**
 * Phase 33 Task 3: the currently selected FORMULA cell, reported on every
 * TREB `selection` event (a real, documented public event — see the type's
 * own doc comment in treb-embed/src/types.ts: "sent when the spreadsheet
 * selection changes. Use GetSelection to get the address."). `null` when
 * nothing traceable is selected — an input cell, a header, a multi-cell
 * selection, or nothing at all.
 *
 * Selection events fire regardless of `isReadOnly` (navigation, not editing),
 * which is what makes a trace reachable on a committed-or-later record —
 * Phase 33 Task 3 requirement 1.
 */
export type SelectedTraceableCell =
  | { kind: 'row'; sectionId: string; columnId: string; columnKey: string; rowIndex: number }
  | { kind: 'summary'; fieldId: string };

export interface RecordingGridHandle {
  /**
   * Writes freshly computed formula-column results, and re-syncs the
   * `standard` column's DISPLAYED label from the row's current stored key —
   * never touches other input columns. `awaiting-input` cells are rendered
   * blank (quiet); `invalid-computation` cells show the error message with
   * prominent styling. See the Task 4 comment above.
   *
   * The standard-column resync happens here (the existing write-back path,
   * called by the parent after recalculation) rather than inside this
   * component's own `document-change` handler, deliberately: writing into
   * the grid from inside its own change subscription risks feeding back into
   * that same subscription. `currentRows` is the freshly-extracted row data
   * the parent already has after this same edit — passing it back is cheap
   * and keeps the single "app writes results into the grid" call site intact.
   */
  updateComputedValues: (
    rowResults: Array<Record<string, MockupCellResult>>,
    currentRows?: RecordRow[],
  ) => void;
  /** Appends one blank input row at the end of the grid. */
  addRow: () => void;
  /**
   * Deletes the currently-selected data row, after confirming with the
   * user (naming the row number and whether it holds data — Phase 21 Task
   * 3). A no-op, with no confirmation prompt, when: the grid is read-only,
   * nothing is selected, the selection is a header row, or only one data
   * row remains. Re-emits the current rows via `onRowsChange` after the
   * delete so the parent's record state and the grid stay in step without
   * depending solely on the later async `document-change` (Phase 19).
   */
  deleteSelectedRow: () => void;
  /**
   * Writes freshly computed summary-field values into the Summary tab
   * (Phase 21 Task 4a) — a no-op when the template has no summary fields
   * (no tab was ever created). Mirrors `updateComputedValues`'s
   * quiet-awaiting-input / prominent-invalid-computation split.
   */
  updateSummaryValues: (summary: Record<string, MockupCellResult>) => void;
  /**
   * Phase 22 Task 2: scrolls so the given section's first column comes into
   * view. Horizontal-only (`y: false`) — this only ever needs to move the
   * viewport sideways, and leaving the vertical axis alone means it can
   * never scroll the frozen header rows out of view (freeze panes stay
   * fixed regardless of scroll position; not touching the y-axis at all
   * removes any way for this to interact with them). A no-op if the
   * section doesn't exist in this template's current layout.
   */
  scrollToSection: (sectionId: string) => void;
  /**
   * Phase 23 Task 1 — rewrites the column-header row's text with the new
   * effective units, and re-renders every conversion-enabled formula
   * column's DISPLAY value against the new target unit (ADR-015 D8's
   * pipeline, same code path `updateComputedValues` uses for role-tint and
   * error-style consistency). Touches NO raw value and no input cell — a
   * unit change is a display concern only (ADR-015 D1). `rowResults` is
   * the same shape `updateComputedValues` takes; the caller's own
   * `useLiveRecalculation` result already holds it, so this recomputes
   * conversion from the SAME raw values already on screen rather than
   * reading anything back from the grid (which would already be
   * OLD-unit-converted, not raw).
   */
  updateHeaders: (columnUnits: Record<string, string>, rowResults: Array<Record<string, MockupCellResult>>) => void;
}

export interface RecordingGridProps {
  template: RecorderTemplate;
  /** Initial row data — read once, at mount, to seed the grid. */
  rows: RecordRow[];
  isReadOnly?: boolean;
  /** Called with raw INPUT values (formula columns excluded) after a user edit. */
  onRowsChange?: (rows: RecordRow[]) => void;
  /**
   * The reference standards selectable in this record (ADR-014 D3), loaded
   * ONCE per record session by the parent — never re-fetched per keystroke.
   * Drives the `standard` column's native dropdown (`SetValidation`) AND its
   * displayed label. DRAFT ONLY: a committed record must never call
   * `loadStandardOptions()` (ADR-014 D6 — it replays from its snapshot), so
   * pass `standardLabels` instead for a read-only grid.
   */
  standardOptions?: StandardOption[];
  /**
   * Plain key -> label lookup for DISPLAY ONLY, no picker. Use this for a
   * read-only record, sourced from its own frozen `standardSnapshots`
   * (`snapshot.displayName`) — never from `loadStandardOptions()`. Ignored
   * when `standardOptions` is also provided.
   */
  standardLabels?: StandardLabelMap;
  /**
   * The record's chosen unit for each 'selectable' column, keyed by the
   * column's `${sectionId}_${columnId}` key (Phase 15 Task 1 supersession).
   * Read once at mount, same as `rows` — the header re-reads it only on
   * remount, so a caller whose columnUnits can change while the record is
   * open (RecordEntryPage's unit-picker strip) must include it in this
   * component's `key` prop to force a remount, the same way `standardOptions`
   * already does for its own 0 -> N transition.
   */
  columnUnits?: Record<string, string>;
  /**
   * The full unit-conversion rule library (ADR-015 D2) — active and inactive
   * alike, same as `standardOptions`/`columnUnits` this is read once at
   * mount to seed the grid's initial render; a caller whose rule set can
   * change while the record is open must include it in this component's
   * `key` prop to force a remount. Defaults to `[]`, meaning every
   * `conversionEnabled` column shows its D6 "no rule" fallback until rules
   * are actually passed in.
   */
  conversionRules?: ConversionRule[];
  /**
   * ADR-015 D7 — the record's frozen-at-commit conversion snapshots, keyed
   * `${rowIndex}:${columnKey}`. A committed-or-later record's caller passes
   * `record.conversionSnapshots` here; a draft passes nothing (it has none
   * yet). When a cell has one, it overrides `conversionRules` for that cell
   * — see `buildGridDocument`'s own doc comment.
   */
  conversionSnapshots?: Record<string, ConversionCellSnapshot>;
  /**
   * Phase 33 Task 3: reports the currently selected formula/summary cell (or
   * `null`), on every selection change — draft or read-only alike. The
   * caller uses this to enable a "view calculation" affordance; this
   * component performs no navigation or lookup of its own beyond reporting
   * which cell is selected.
   */
  onCellSelect?: (cell: SelectedTraceableCell | null) => void;
  className?: string;
}

const HEADER_FILL = { text: '#f3f4f6' };

function toRangeArea(area: IArea): IArea {
  return { start: { row: area.start.row, column: area.start.column }, end: { row: area.end.row, column: area.end.column } };
}

/** GetRange over a multi-cell area returns CellValue[][]; normalize single-row/column shapes defensively. */
function normalizeRangeValues(
  value: CellValue | CellValue[][] | undefined,
  rowCount: number,
  columnCount: number,
): CellValue[][] {
  if (Array.isArray(value)) {
    if (value.length > 0 && Array.isArray(value[0])) return value as CellValue[][];
    // Defensive: a flat array would mean a single row.
    return [value as unknown as CellValue[]];
  }
  return Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => (rowCount === 1 && columnCount === 1 ? value : undefined)));
}

/** Builds the key->label map from loaded options — the single source `applyLayout` and the change handler both read from. */
function buildStandardLabelMap(options: StandardOption[]): StandardLabelMap {
  const map: StandardLabelMap = {};
  for (const option of options) map[option.key] = option.label;
  return map;
}

/**
 * Structural equality for two RecordRow arrays. Phase 19 Task 2b: TREB's
 * `document-change` event fires asynchronously (two stacked microtask
 * deferrals — see docs/PHASE_19_PROMPT_FIX_GRID_FEEDBACK_LOOP.md), so a
 * programmatic write in `updateComputedValues`/`addRow` can trigger a
 * `document-change` that lands well after the re-entrancy flag (Task 2a) has
 * already been cleared by its own `finally`. This equality check is the
 * guard that actually breaks that cycle: a re-triggered event whose
 * extracted INPUT rows are identical to the last ones already reported is
 * dropped instead of re-emitted, so the parent never re-recalculates from a
 * no-op change and the cycle has nothing left to feed it.
 */
function rowsEqual(a: RecordRow[] | null, b: RecordRow[] | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const rowA = a[i];
    const rowB = b[i];
    const keysA = Object.keys(rowA);
    const keysB = Object.keys(rowB);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (rowA[key] !== rowB[key]) return false;
    }
  }
  return true;
}

/**
 * Phase 20 Task 1 — explicit column widths, sized from the column-header row
 * and data only, NEVER from the merged section-header row.
 *
 * Confirmed by reading TREB's own source (treb-grid/src/types/grid.js,
 * `AutoSizeColumn`): its native auto-size (`SetColumnWidth(column)` with
 * `width` undefined) scans every row's `CellData` for that column with no
 * merge-span awareness at all. A merge only joins cells visually — the text
 * itself still lives solely on the merge's anchor cell (see
 * `recordingGridDocument.ts`'s `sectionHeaderRow`, blank everywhere except
 * each merge's start column). So native auto-size against the full sheet
 * would try to fit an entire multi-column label like "Measurement Results
 * (Forward)" into whichever single column anchors that section's merge,
 * ballooning just that one column. Computing widths ourselves from
 * `headerRows[1]` (the real per-column header) and `dataRows` sidesteps this
 * entirely — the section-header row is never measured.
 *
 * Sized once here, at mount (`applyLayout` runs once per component
 * lifetime — see the file header's mount contract). A later
 * `invalid-computation` error message written into a formula cell
 * (`updateComputedValues`) does not trigger a resize — deliberate, so
 * columns don't jump around while someone is mid-entry. The max clamp below
 * still protects a mount-time seed row that happens to contain a long value.
 */
const COLUMN_WIDTH_MIN = 90;
const COLUMN_WIDTH_MAX = 260;
const COLUMN_WIDTH_CHAR_PX = 7;
const COLUMN_WIDTH_PADDING = 24;

function estimateTextWidth(text: string): number {
  return Math.round(text.length * COLUMN_WIDTH_CHAR_PX + COLUMN_WIDTH_PADDING);
}

function computeColumnWidths(doc: { headerRows: [Array<string | undefined>, Array<string | undefined>]; dataRows: Array<Array<string | number | undefined>>; totalColumns: number }): number[] {
  const widths: number[] = [];
  for (let col = 0; col < doc.totalColumns; col++) {
    let max = estimateTextWidth(String(doc.headerRows[1][col] ?? ''));
    for (const row of doc.dataRows) {
      const value = row[col];
      if (value === undefined || value === null) continue;
      max = Math.max(max, estimateTextWidth(String(value)));
    }
    widths.push(Math.min(COLUMN_WIDTH_MAX, Math.max(COLUMN_WIDTH_MIN, max)));
  }
  return widths;
}

/**
 * Phase 20 Task 3 — how many leading columns to freeze alongside the two
 * header rows. The reported template happens to have `Used Standard` as its
 * first column, which is exactly what should stay pinned while scrolling
 * right — but a template need not have a `standard` column at all, or have
 * one first. Freezing column 0 unconditionally would pin an arbitrary input
 * column on any other template, which isn't "worth pinning" — so this only
 * freezes when the FIRST grid column is actually the standard picker.
 */
function deriveFreezeColumnCount(layout: GridLayout): number {
  const standardCol = findStandardColumn(layout);
  return standardCol && standardCol.gridColumnIndex === 0 ? 1 : 0;
}

/**
 * Phase 33 Task 3: maps the current TREB selection to a traceable cell, or
 * `null` when nothing traceable is selected.
 *
 * `GetSelection(true)` (qualified) returns `"<SheetName>!<range>"` — the
 * PUBLIC, documented way to learn which sheet the selection is on (confirmed
 * from TREB's own source: it resolves `ref.area.start.sheet_id` via
 * `ResolveSheetName`, there is no lighter-weight public accessor). The
 * Summary sheet is created with the literal name `'Summary'` (this file's
 * own mount effect), so this compares against that exact string rather than
 * an id — the only thing GetSelection's qualified form actually exposes.
 */
function resolveSelectedTraceableCell(
  sheet: EmbeddedSpreadsheet,
  layout: GridLayout,
  template: RecorderTemplate,
): SelectedTraceableCell | null {
  const qualified = sheet.GetSelection(true);
  if (!qualified) return null;
  const plain = sheet.GetSelection(false);
  const match = /^([A-Z]+)(\d+)(?::|$)/.exec(plain);
  if (!match) return null; // empty, or a malformed label
  if (plain.includes(':')) return null; // a multi-cell selection has no single traceable value

  const rowNumber = parseInt(match[2], 10) - 1; // GetSelection's row is 1-based

  if (qualified.startsWith('Summary!')) {
    const fieldIndex = rowNumber; // Summary tab: row i is template.summaryFields[i] (this file's own mount-effect seeding)
    const field = template.summaryFields[fieldIndex];
    return field ? { kind: 'summary', fieldId: field.id } : null;
  }

  if (rowNumber < FIRST_DATA_ROW) return null; // a header row
  const columnIndex = getColumnIndex(match[1]);
  const column = layout.columns.find((c) => c.gridColumnIndex === columnIndex);
  if (!column || column.column.type !== 'formula') return null;

  return {
    kind: 'row',
    sectionId: column.sectionId,
    columnId: column.columnId,
    columnKey: column.key,
    rowIndex: rowNumber - FIRST_DATA_ROW,
  };
}

function applyLayout(
  sheet: EmbeddedSpreadsheet,
  layout: GridLayout,
  template: RecorderTemplate,
  rows: RecordRow[],
  standardLabels: StandardLabelMap,
  isReadOnly: boolean,
  columnUnits: Record<string, string>,
  conversionRules: ConversionRule[],
  conversionSnapshots: Record<string, ConversionCellSnapshot>,
) {
  const doc = buildGridDocument(template, rows, standardLabels, columnUnits, conversionRules, conversionSnapshots);

  // Phase 20 Task 5: batch the whole seed — many individual calls below,
  // one repaint at the end. No feedback-loop guard is needed around this
  // batch specifically: `applyLayout` always runs BEFORE `sheet.Subscribe`
  // is attached (see the mount effect), so nothing is listening for
  // document-change yet when these writes fire.
  sheet.Batch(() => {
    sheet.SetRange({ start: { row: 0, column: 0 }, end: { row: 0, column: Math.max(0, doc.totalColumns - 1) } }, [doc.headerRows[0]]);
    sheet.SetRange({ start: { row: 1, column: 0 }, end: { row: 1, column: Math.max(0, doc.totalColumns - 1) } }, [doc.headerRows[1]]);

    for (const merge of layout.sectionMerges) {
      if (merge.area.start.column === merge.area.end.column) continue; // single-column section: nothing to merge
      sheet.MergeCells(toRangeArea(merge.area));
    }

    sheet.ApplyStyle(
      { start: { row: 0, column: 0 }, end: { row: 1, column: Math.max(0, doc.totalColumns - 1) } },
      { bold: true, locked: true, fill: HEADER_FILL },
      true,
    );

    // Phase 22 Task 2: cycling section-header tint, applied AFTER the
    // uniform header fill above (delta:true merge) so it overwrites just
    // that section's own merged cell, leaving bold/locked untouched.
    layout.sectionMerges.forEach((merge, i) => {
      const tint = SECTION_HEADER_PALETTE[i % SECTION_HEADER_PALETTE.length];
      sheet.ApplyStyle(toRangeArea(merge.area), { fill: { text: tint } }, true);
      // A heavier left border at every boundary EXCEPT before the first
      // section (nothing precedes it) — spans the full column height so it
      // reads as a divider while scrolling horizontally, not just a header
      // underline. Only touches border_left/_fill keys, so it coexists with
      // both the section tint above and the role tints below.
      if (i > 0) {
        sheet.ApplyStyle(
          { start: { row: 0, column: merge.area.start.column }, end: { row: doc.totalRows - 1, column: merge.area.start.column } },
          { border_left: 2, border_left_fill: SECTION_BOUNDARY_BORDER_FILL },
          true,
        );
      }
    });

    if (doc.dataRows.length > 0) {
      sheet.SetRange(
        { start: { row: FIRST_DATA_ROW, column: 0 }, end: { row: FIRST_DATA_ROW + doc.dataRows.length - 1, column: Math.max(0, doc.totalColumns - 1) } },
        doc.dataRows,
      );
    }

    // Phase 22 Task 1: role tint per column, spanning every seeded row
    // regardless of cell content — the empty-draft case this phase exists
    // for. Applied BEFORE the conversion-failure marking below (delta:true
    // merge for both), so a D6 failure's amber fill always wins for the
    // handful of cells that need it — see the constants' own precedence
    // comment for the full ordering.
    for (const roleRange of doc.columnRoles) {
      sheet.ApplyStyle(toRangeArea(roleRange.area), ROLE_STYLE[roleRange.role], true);
    }

    for (const locked of doc.lockedRanges) {
      sheet.ApplyStyle(toRangeArea(locked), { locked: true }, true);
    }

    for (const fmt of doc.numberFormats) {
      if (doc.dataRows.length === 0) continue;
      sheet.ApplyStyle(
        { start: { row: FIRST_DATA_ROW, column: fmt.columnIndex }, end: { row: FIRST_DATA_ROW + doc.dataRows.length - 1, column: fmt.columnIndex } },
        { number_format: fmt.format },
        true,
      );
    }

    // ADR-015 D6: mark cells where conversion was needed but failed. The raw
    // value is already in `doc.dataRows` (buildGridDocument's own D6 fallback)
    // — this only adds the visual marker on top.
    for (const failure of doc.conversionFailures) {
      const row = FIRST_DATA_ROW + failure.rowIndex;
      sheet.ApplyStyle(
        { start: { row, column: failure.gridColumnIndex }, end: { row, column: failure.gridColumnIndex } },
        CONVERSION_FAILURE_STYLE,
        true,
      );
    }

    // Native list-validation dropdown for the `standard` column (see file
    // header). Only when there's something to choose from, and never on a
    // read-only grid (in_cell_editor is already off there, so this would be
    // inert at best; skipping it also means no dropdown caret is even attempted).
    const standardCol = findStandardColumn(layout);
    const labelList = Object.values(standardLabels);
    if (standardCol && !isReadOnly && labelList.length > 0 && doc.dataRows.length > 0) {
      sheet.SetValidation(
        {
          start: { row: FIRST_DATA_ROW, column: standardCol.gridColumnIndex },
          end: { row: FIRST_DATA_ROW + doc.dataRows.length - 1, column: standardCol.gridColumnIndex },
        },
        labelList,
        true,
      );
    }

    // Phase 20 Task 1: explicit widths, sized from the header/data only (see
    // computeColumnWidths' own comment for why NOT native auto-size).
    const widths = computeColumnWidths(doc);
    widths.forEach((width, columnIndex) => sheet.SetColumnWidth(columnIndex, width, true));

    // Phase 20 Task 3: pin both header rows always; pin column 0 only when
    // it's actually the standard picker (see deriveFreezeColumnCount).
    sheet.Freeze(doc.totalColumns > 0 ? 2 : 0, deriveFreezeColumnCount(layout));
  }, true);

  return doc;
}

export const RecordingGrid = forwardRef<RecordingGridHandle, RecordingGridProps>(
  ({ template, rows, isReadOnly = false, onRowsChange, standardOptions = [], standardLabels, columnUnits, conversionRules, conversionSnapshots, onCellSelect, className }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const sheetRef = useRef<EmbeddedSpreadsheet | null>(null);
    const layoutRef = useRef<GridLayout>(buildGridLayout(template));
    // Phase 21 Task 2: `defaultRowCount` is no longer a display-time floor —
    // it only bounds a NEW draft's starting seed (calibrationRecordService's
    // own DRAFT_STARTING_ROW_CAP). Here the grid always shows exactly the
    // rows it was given, min 1 so there is always at least one row to
    // click into.
    const rowCountRef = useRef<number>(Math.max(rows.length, 1));
    // `standardOptions` (draft, live, also drives the picker) takes priority
    // over `standardLabels` (read-only, frozen, display only) — a caller
    // should only ever provide one of the two, per the props doc above.
    // Loaded/built once per record session (ADR-014 Phase 13 Task 3) and this
    // component itself mounts once per record (file header) — captured once
    // here, at mount, for the same reason. Native validation (applyLayout,
    // addRow) is additionally gated on `!isReadOnly`, so a read-only grid
    // never gets a picker even though this map is still populated for display.
    const standardLabelsRef = useRef<StandardLabelMap>(
      standardOptions.length > 0 ? buildStandardLabelMap(standardOptions) : (standardLabels ?? {}),
    );
    const standardKeyByLabelRef = useRef<Record<string, string>>(invertStandardLabels(standardLabelsRef.current));
    // Captured once at mount, same as rows/standardLabels above — see the
    // columnUnits prop doc for why the caller must key on it to see updates.
    const columnUnitsRef = useRef<Record<string, string>>(columnUnits ?? {});
    const conversionRulesRef = useRef<ConversionRule[]>(conversionRules ?? []);
    const conversionSnapshotsRef = useRef<Record<string, ConversionCellSnapshot>>(conversionSnapshots ?? {});
    // The header's resolved EFFECTIVE unit per column (ADR-015 D8 step 3) —
    // same resolution `buildGridDocument` uses for header text, computed
    // once here so `updateComputedValues` (which bypasses buildGridDocument
    // entirely) can look up each formula column's target unit without
    // re-resolving a 'sameAs' chain per cell.
    const unitByKeyRef = useRef<Record<string, string | undefined>>(resolveColumnUnitMap(template, columnUnitsRef.current));
    // Phase 21 Task 4a: the main sheet's own ID and the (optional) Summary
    // sheet's ID — see the mount effect's own comment for why every
    // cross-tab-safe address needs this once a second sheet can exist.
    const mainSheetIdRef = useRef<number | null>(null);
    const summarySheetIdRef = useRef<number | null>(null);

    const onRowsChangeRef = useRef(onRowsChange);
    useEffect(() => {
      onRowsChangeRef.current = onRowsChange;
    }, [onRowsChange]);

    const onCellSelectRef = useRef(onCellSelect);
    useEffect(() => {
      onCellSelectRef.current = onCellSelect;
    }, [onCellSelect]);

    // Phase 19 — the write/event feedback-loop guards. See
    // docs/PHASE_19_PROMPT_FIX_GRID_FEEDBACK_LOOP.md for the full analysis;
    // both are required, each catches a different timing:
    // - isProgrammaticWriteRef (Task 2a): set around every programmatic
    //   write below, checked first in the subscription handler. Catches
    //   SYNCHRONOUS re-entry — if TREB's document-change timing ever became
    //   synchronous, this alone would stop the cycle.
    // - lastEmittedRowsRef + rowsEqual (Task 2b): TREB's actual timing is
    //   asynchronous (confirmed from source — two stacked microtask
    //   deferrals), so by the time a write-triggered document-change fires,
    //   isProgrammaticWriteRef has already been cleared by its own
    //   `finally`. This is the guard that actually breaks THIS cycle: a
    //   re-triggered event whose extracted rows match what was last
    //   reported is dropped rather than re-emitted.
    const isProgrammaticWriteRef = useRef(false);
    const lastEmittedRowsRef = useRef<RecordRow[] | null>(null);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const layout = buildGridLayout(template);
      layoutRef.current = layout;

      const seedRowCount = Math.max(rows.length, 1);
      const seedRows: RecordRow[] = Array.from({ length: seedRowCount }, (_, i) => rows[i] ?? {});
      rowCountRef.current = seedRowCount;

      // Phase 21 Task 4a: a Summary tab needs `tab_bar` on to be reachable at
      // all — only turned on when there's something to show there, so a
      // template with no summary fields keeps the exact prior appearance.
      const hasSummaryFields = template.summaryFields.length > 0;
      const sheet: EmbeddedSpreadsheet = TREB.CreateSpreadsheet({
        container,
        toolbar: false,
        formula_bar: false,
        headers: false,
        tab_bar: hasSummaryFields,
        undo: true,
        in_cell_editor: !isReadOnly,
        add_tab: false,
        file_menu: false,
        export: false,
        chart_menu: false,
      });
      sheetRef.current = sheet;

      // Phase 21 Task 4a: this document's own (main) sheet ID — captured
      // once so every read/write below can address it EXPLICITLY rather
      // than implicitly targeting "whichever sheet happens to be active".
      // That distinction only matters once a second sheet exists (below):
      // without it, a technician who switches to the Summary tab while a
      // background recalculation writes computed values, or while the
      // document-change subscription re-reads row data, would silently hit
      // the wrong sheet. `GetSheetID` is public (ADR-007).
      const mainSheetId = sheet.GetSheetID(0);
      mainSheetIdRef.current = mainSheetId ?? null;

      applyLayout(sheet, layout, template, seedRows, standardLabelsRef.current, isReadOnly, columnUnitsRef.current, conversionRulesRef.current, conversionSnapshotsRef.current);

      // Phase 21 Task 4a: Summary Fields as their own tab. Summary values
      // are per-record, not per-row (ADR-010) — unlike a per-SECTION tab
      // (Task 4b), there is no row-alignment question here at all: this
      // sheet has no rows to keep in lockstep with anything. Labels are
      // seeded once, here; VALUES are written by `updateSummaryValues`
      // (called by the parent whenever its live recalculation produces a
      // new `summary` — see useLiveRecalculation.ts), the same "seed once,
      // then an imperative write-back handle" split `updateComputedValues`
      // already uses for formula columns.
      // Scope note: only the document-change subscription's read (above) is
      // qualified with `mainSheetId` — that is the one call whose result
      // reaches `onRowsChange` and therefore the persisted record. The
      // OTHER writes below (`updateComputedValues`, `addRow`,
      // `deleteSelectedRow`) still target "whichever sheet is active" if a
      // technician switches to the Summary tab mid-session; the worst case
      // is a stale/misdirected write to a tab whose own content is fully
      // recomputed on the next `updateSummaryValues` call, not a corrupted
      // record — UNVERIFIED beyond that reasoning; not exercised by a real
      // browser session in this phase.
      if (hasSummaryFields) {
        const summarySheetId = sheet.AddSheet('Summary');
        summarySheetIdRef.current = summarySheetId;
        sheet.Batch(() => {
          template.summaryFields.forEach((field, i) => {
            sheet.SetRange({ row: i, column: 0, sheet_id: summarySheetId }, field.label || field.id);
            sheet.ApplyStyle(
              { start: { row: i, column: 0, sheet_id: summarySheetId }, end: { row: i, column: 0, sheet_id: summarySheetId } },
              { bold: true, locked: true },
              true,
            );
          });
        }, true);
      }

      // Phase 20 Task 4: TREB's own doc says Resize() "should be called
      // automatically by a resize observer set in the containing tag class"
      // — but CreateSpreadsheet is handed a plain div here, so nothing does
      // it. This also covers the mount-time case: banners above the grid
      // (unit-mismatch warning, recovery banner) can still be settling their
      // own height when TREB first measures its container.
      const resizeObserver = new ResizeObserver(() => {
        sheet.Resize();
      });
      resizeObserver.observe(container);

      // Phase 33 Task 3: subscribed UNCONDITIONALLY now (was `!isReadOnly`
      // only) — a `selection` event is navigation, not editing, and a trace
      // must be reachable on a read-only (committed-or-later) record too.
      // The document-change branch below keeps its exact prior isReadOnly
      // gate; nothing about the write-path behavior changes.
      const token: number = sheet.Subscribe((event: EmbeddedSheetEvent) => {
        if (event.type === 'selection') {
          onCellSelectRef.current?.(resolveSelectedTraceableCell(sheet, layoutRef.current, template));
          return;
        }
        if (event.type !== 'document-change' || isReadOnly) return;
        // Task 2a: drop any event that fires WHILE we are mid-write —
        // catches synchronous re-entry (see the ref's own comment above).
        if (isProgrammaticWriteRef.current) return;
        const currentLayout = layoutRef.current;
        const totalColumns = currentLayout.columns.length;
        const rowCount = rowCountRef.current;
        if (totalColumns === 0 || rowCount === 0) return;
        // Phase 21 Task 4a: explicitly the MAIN sheet, regardless of which
        // tab is currently active — see mainSheetIdRef's own comment.
        const raw = sheet.GetRange({
          start: { row: FIRST_DATA_ROW, column: 0, sheet_id: mainSheetId },
          end: { row: FIRST_DATA_ROW + rowCount - 1, column: totalColumns - 1, sheet_id: mainSheetId },
        });
        const values = normalizeRangeValues(raw, rowCount, totalColumns);
        const nextRows = extractInputRows(
          currentLayout,
          values as Array<Array<string | number | boolean | undefined>>,
          standardKeyByLabelRef.current,
        );
        // Task 2b: drop a re-triggered event that carries the SAME input
        // values as what we already reported — this is what actually
        // ends the async cycle (see the ref's own comment above).
        if (rowsEqual(nextRows, lastEmittedRowsRef.current)) return;
        lastEmittedRowsRef.current = nextRows;
        onRowsChangeRef.current?.(nextRows);
      });

      return () => {
        resizeObserver.disconnect();
        if (token !== null) {
          try {
            sheet.Cancel(token);
          } catch {
            // ignore
          }
        }
        sheetRef.current = null;
      };
      // Intentionally mount once: identity changes are handled by the parent
      // remounting via `key` (see file header comment).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * Shared by `updateComputedValues` and Phase 23 Task 1's `updateHeaders`
     * — writes every formula column's DISPLAY value for `rowCount` rows,
     * applying ADR-015 D8's conversion pipeline and the matching
     * quiet/prominent/failure style. Extracted so both callers use the
     * IDENTICAL per-cell style logic: `updateHeaders` re-rendering a
     * converted column after a unit change re-applies `COMPUTED_CELL_STYLE`
     * (which carries the formula role tint) or the error/failure styles
     * exactly as a normal recalculation would, with no second definition
     * that could drift and no separate "reapply the role tint" step needed.
     * Caller is responsible for the isProgrammaticWriteRef guard and Batch.
     */
    function writeFormulaColumnValues(
      sheet: EmbeddedSpreadsheet,
      layout: GridLayout,
      rowResults: Array<Record<string, MockupCellResult>>,
      rowCount: number,
    ) {
      for (const col of layout.columns) {
        if (col.column.type !== 'formula') continue;
        const columnValues: CellValue[][] = [];
        for (let i = 0; i < rowCount; i++) {
          const cell = rowResults[i]?.[col.key];
          const row = FIRST_DATA_ROW + i;
          const isInvalid = cell?.error?.kind === 'invalid-computation';
          let style: CellStyle = isInvalid ? INVALID_COMPUTATION_STYLE : COMPUTED_CELL_STYLE;
          let outValue: CellValue | undefined;

          if (isInvalid) {
            outValue = cell!.error!.message;
          } else if (cell?.error) {
            // awaiting-input: quiet — no value, no decoration.
            outValue = undefined;
          } else {
            const value = cell?.value;
            // ADR-015 D9/D8: only a formula column that opted in, and
            // only a genuinely numeric raw value — a string/null cell
            // value passes through untouched, same as before this phase.
            if (col.column.conversionEnabled && typeof value === 'number') {
              const result = convertColumnDisplayValue({
                rawValue: value,
                column: col.column,
                targetUnit: unitByKeyRef.current[col.key],
                rules: conversionRulesRef.current,
              });
              outValue = result.displayValue;
              if (result.failure) style = CONVERSION_FAILURE_STYLE;
            } else {
              outValue = value === null || value === undefined ? undefined : (value as CellValue);
            }
          }
          sheet.ApplyStyle(
            { start: { row, column: col.gridColumnIndex }, end: { row, column: col.gridColumnIndex } },
            style,
            false,
          );
          columnValues.push([outValue]);
        }
        sheet.SetRange(
          { start: { row: FIRST_DATA_ROW, column: col.gridColumnIndex }, end: { row: FIRST_DATA_ROW + rowCount - 1, column: col.gridColumnIndex } },
          columnValues,
        );
      }
    }

    useImperativeHandle(
      ref,
      () => ({
        updateComputedValues(rowResults: Array<Record<string, MockupCellResult>>, currentRows?: RecordRow[]) {
          const sheet = sheetRef.current;
          if (!sheet) return;
          const layout = layoutRef.current;
          const rowCount = Math.min(rowCountRef.current, rowResults.length);
          if (rowCount === 0) return;

          // Task 2a: every write below is programmatic — guard it, and
          // ALWAYS clear the flag even if a write throws (Test 4), so the
          // subscription isn't left permanently deaf to real user edits.
          isProgrammaticWriteRef.current = true;
          try {
            // Phase 20 Task 5: Batch goes INSIDE this try/finally, never
            // around it — the re-entrancy flag must span every write below
            // exactly as it did before batching. `Batch`'s callback runs
            // SYNCHRONOUSLY (confirmed from source: treb-grid/src/types/
            // grid.js's `Batch` calls `func()` directly, no deferral), so
            // this changes nothing about when the flag is set/cleared —
            // it only coalesces the resulting document-change publish from
            // many events into one, which the async guard (Task 2b,
            // rowsEqual) is unaffected by either way.
            sheet.Batch(() => {
            writeFormulaColumnValues(sheet, layout, rowResults, rowCount);

            // Re-sync the `standard` column's DISPLAYED label from the row's
            // current stored key (see file header). This is the ONE write-back
            // path for that column — never written from inside the
            // document-change subscription itself, to avoid feeding a
            // programmatic write back into that same subscription.
            if (currentRows) {
              const standardCol = findStandardColumn(layout);
              if (standardCol) {
                const labels = standardLabelsRef.current;
                const columnValues: CellValue[][] = [];
                for (let i = 0; i < rowCount; i++) {
                  const key = currentRows[i]?.[standardCol.key];
                  columnValues.push([typeof key === 'string' && key ? (labels[key] ?? key) : undefined]);
                }
                sheet.SetRange(
                  { start: { row: FIRST_DATA_ROW, column: standardCol.gridColumnIndex }, end: { row: FIRST_DATA_ROW + rowCount - 1, column: standardCol.gridColumnIndex } },
                  columnValues,
                );
              }
            }
            }, true);
          } finally {
            isProgrammaticWriteRef.current = false;
          }
        },
        addRow() {
          const sheet = sheetRef.current;
          if (!sheet) return;
          const layout = layoutRef.current;
          const totalColumns = layout.columns.length;
          if (totalColumns === 0) return;
          const newRowIndex = FIRST_DATA_ROW + rowCountRef.current;

          // Task 2a/5: addRow shares the same guard — its writes (a blank
          // row, the inherited standard-column label, native validation)
          // are just as capable of triggering a document-change as
          // updateComputedValues' are. Batch is inside the try/finally for
          // the same reason as above — it runs synchronously, so it doesn't
          // change when the flag is set or cleared.
          isProgrammaticWriteRef.current = true;
          try {
            sheet.Batch(() => {
            sheet.SetRange(
              { start: { row: newRowIndex, column: 0 }, end: { row: newRowIndex, column: totalColumns - 1 } },
              [Array.from({ length: totalColumns }, () => undefined)],
            );

            // Phase 22 Task 1 fix: `applyLayout`'s role tint only ever
            // covered the rows present AT MOUNT (buildGridDocument's
            // columnRoles) — a row added afterward via this method never
            // went through that seeding again, so it rendered white/blank
            // with no tint at all until this. Same role definition
            // (`columnRoleFor`) buildGridDocument itself uses, so the two
            // can never drift apart.
            for (const col of layout.columns) {
              sheet.ApplyStyle(
                { start: { row: newRowIndex, column: col.gridColumnIndex }, end: { row: newRowIndex, column: col.gridColumnIndex } },
                ROLE_STYLE[columnRoleFor(col.column)],
                true,
              );
            }

            // ADR-013 D3: a new row inherits the previous row's reference
            // standard. A run usually works through a range on one standard
            // before switching, so this is right far more often than not — and
            // it is the ADR's stated mitigation for the per-row picker costing
            // more clicks than the workbook's one-selection-per-sheet. Copying
            // cell-to-cell (rather than through RecordRow) carries the LABEL
            // text directly, so no key translation is needed here.
            const standardColumn = findStandardColumn(layout);
            if (standardColumn && rowCountRef.current > 0) {
              const previousRowIndex = newRowIndex - 1;
              const previous = sheet.GetRange({ row: previousRowIndex, column: standardColumn.gridColumnIndex });
              if (typeof previous === 'string' && previous) {
                sheet.SetRange({ row: newRowIndex, column: standardColumn.gridColumnIndex }, previous);
              }
            }

            // `applyLayout`'s SetValidation only covers the rows present at
            // mount — a row added afterward needs its own cell added to the
            // native list-validation target, or it would accept free text.
            const labelList = Object.values(standardLabelsRef.current);
            if (standardColumn && labelList.length > 0) {
              sheet.SetValidation(
                { start: { row: newRowIndex, column: standardColumn.gridColumnIndex }, end: { row: newRowIndex, column: standardColumn.gridColumnIndex } },
                labelList,
                true,
              );
            }
            }, true);
          } finally {
            isProgrammaticWriteRef.current = false;
          }

          rowCountRef.current += 1;
        },
        deleteSelectedRow() {
          const sheet = sheetRef.current;
          if (!sheet || isReadOnly) return;
          const layout = layoutRef.current;
          const totalColumns = layout.columns.length;
          if (totalColumns === 0) return;

          // `GetSelection` is TREB's public API for this (`GetSelectionReference`
          // is marked @internal in its own .d.ts — not used, per ADR-007).
          // `qualified: false` keeps the label a plain "A3" / "A3:C5" with no
          // sheet-name prefix; only the anchor row (the first number in the
          // label) matters here.
          const label = sheet.GetSelection(false);
          const match = /^[A-Z]+(\d+)/.exec(label);
          if (!match) {
            window.alert('Select a row first, then try again.');
            return;
          }
          const rowIndex = parseInt(match[1], 10) - 1; // GetSelection's row is 1-based

          if (rowIndex < FIRST_DATA_ROW) {
            window.alert('Cannot delete a header row.');
            return;
          }
          const dataRowIndex = rowIndex - FIRST_DATA_ROW;
          if (dataRowIndex >= rowCountRef.current) {
            window.alert('Select a data row first, then try again.');
            return;
          }
          if (rowCountRef.current <= 1) {
            window.alert('Cannot delete the last remaining row.');
            return;
          }

          // Does the selected row currently hold data? Read it back the same
          // way the document-change subscription does, so the confirmation
          // names it accurately rather than guessing from stale parent state.
          const raw = sheet.GetRange({
            start: { row: rowIndex, column: 0 },
            end: { row: rowIndex, column: totalColumns - 1 },
          });
          const values = normalizeRangeValues(raw, 1, totalColumns);
          const [selectedRow] = extractInputRows(
            layout,
            values as Array<Array<string | number | boolean | undefined>>,
            standardKeyByLabelRef.current,
          );
          const hasData = Object.values(selectedRow).some((v) => v !== null && v !== undefined && v !== '');
          const displayRowNumber = dataRowIndex + 1;

          const confirmed = window.confirm(
            hasData
              ? `Delete row ${displayRowNumber}? It holds data — this cannot be undone.`
              : `Delete row ${displayRowNumber}? It is empty.`,
          );
          if (!confirmed) return;

          // Task 2a: the delete write goes through the SAME guard as every
          // other programmatic write — a delete that bypassed it would
          // reopen Phase 19's loop exactly as an unguarded SetRange would.
          isProgrammaticWriteRef.current = true;
          try {
            sheet.DeleteRows(rowIndex, 1);
          } finally {
            isProgrammaticWriteRef.current = false;
          }
          rowCountRef.current -= 1;

          // Re-emit the current rows explicitly, rather than relying solely
          // on the later async document-change (Phase 19) to eventually
          // pick up the shrunk range — matches lastEmittedRowsRef so that
          // deferred event is recognized as a duplicate and dropped, not
          // fired a second time.
          const remainingRowCount = rowCountRef.current;
          let nextRows: RecordRow[] = [];
          if (remainingRowCount > 0) {
            const rawAfter = sheet.GetRange({
              start: { row: FIRST_DATA_ROW, column: 0 },
              end: { row: FIRST_DATA_ROW + remainingRowCount - 1, column: totalColumns - 1 },
            });
            const valuesAfter = normalizeRangeValues(rawAfter, remainingRowCount, totalColumns);
            nextRows = extractInputRows(
              layout,
              valuesAfter as Array<Array<string | number | boolean | undefined>>,
              standardKeyByLabelRef.current,
            );
          }
          lastEmittedRowsRef.current = nextRows;
          onRowsChangeRef.current?.(nextRows);
        },
        updateSummaryValues(summary: Record<string, MockupCellResult>) {
          const sheet = sheetRef.current;
          const summarySheetId = summarySheetIdRef.current;
          if (!sheet || summarySheetId === null) return;

          // Task 2a: same guard as every other programmatic write — this
          // still fires document-change (it's the same embedded document),
          // so it must not bypass the loop guard just because it targets a
          // different sheet.
          isProgrammaticWriteRef.current = true;
          try {
            sheet.Batch(() => {
              template.summaryFields.forEach((field, i) => {
                const cell = summary[field.id];
                const isInvalid = cell?.error?.kind === 'invalid-computation';
                const style: CellStyle = isInvalid ? INVALID_COMPUTATION_STYLE : COMPUTED_CELL_STYLE;
                let outValue: CellValue | undefined;

                if (isInvalid) {
                  outValue = cell!.error!.message;
                } else if (cell?.error) {
                  outValue = undefined; // awaiting-input: quiet, same as a formula column
                } else {
                  const value = cell?.value;
                  outValue = value === null || value === undefined ? undefined : (value as CellValue);
                }

                sheet.ApplyStyle(
                  { start: { row: i, column: 1, sheet_id: summarySheetId }, end: { row: i, column: 1, sheet_id: summarySheetId } },
                  style,
                  false,
                );
                sheet.SetRange({ row: i, column: 1, sheet_id: summarySheetId }, outValue);
              });
            }, true);
          } finally {
            isProgrammaticWriteRef.current = false;
          }
        },
        scrollToSection(sectionId: string) {
          const sheet = sheetRef.current;
          if (!sheet) return;
          const firstColumn = layoutRef.current.columns.find((c) => c.sectionId === sectionId);
          if (!firstColumn) return;
          // A pure viewport move, not a document write — ScrollTo doesn't
          // mutate cell data or structure, so this deliberately does NOT go
          // through isProgrammaticWriteRef (nothing here can trigger
          // document-change; the Subscribe handler ignores every event type
          // other than 'document-change' regardless).
          sheet.ScrollTo({ row: FIRST_DATA_ROW, column: firstColumn.gridColumnIndex }, { x: true, y: false });
        },
        updateHeaders(columnUnits: Record<string, string>, rowResults: Array<Record<string, MockupCellResult>>) {
          const sheet = sheetRef.current;
          if (!sheet) return;
          const layout = layoutRef.current;

          // Phase 23 Task 1: `columnUnits` is read once at mount by every
          // OTHER path (buildGridDocument's header text, updateComputedValues'
          // conversion target) — this is the ONE place it changes after
          // mount without a remount, so both refs derived from it must be
          // refreshed here before anything below reads them.
          columnUnitsRef.current = columnUnits;
          unitByKeyRef.current = resolveColumnUnitMap(template, columnUnits);

          isProgrammaticWriteRef.current = true;
          try {
            sheet.Batch(() => {
              // Column-header row (row 1) only — row 0 (section labels)
              // never carries a unit. Same "ƒ " marker + joinLabelAndUnit
              // buildGridDocument uses, so header text can never read
              // differently here than it would at a fresh mount.
              const columnHeaderRow = layout.columns.map((c) => {
                const base = joinLabelAndUnit(c.column, unitByKeyRef.current[c.key]);
                return c.column.type === 'formula' ? `ƒ ${base}` : base;
              });
              sheet.SetRange(
                { start: { row: 1, column: 0 }, end: { row: 1, column: Math.max(0, layout.columns.length - 1) } },
                [columnHeaderRow],
              );

              // ADR-015 D8: re-render every conversion-enabled formula
              // column's DISPLAY value against the NEW target unit, from
              // the SAME raw rowResults the caller's live recalculation
              // already holds — never re-read from the grid (which would
              // already be old-unit-converted, not raw) and never an input
              // cell (D1: conversion is display-only).
              const rowCount = Math.min(rowCountRef.current, rowResults.length);
              if (rowCount > 0) {
                writeFormulaColumnValues(sheet, layout, rowResults, rowCount);
              }
            }, true);
          } finally {
            isProgrammaticWriteRef.current = false;
          }
        },
      }),
      [],
    );

    // Phase 20 Task 2: a definite, viewport-relative height (not h-full,
    // which resolves to auto inside an auto-height parent and leaves TREB
    // with no real viewport to scroll within) — this is only the fallback
    // for a caller that doesn't pass its own className; RecordEntryPage
    // already passes an explicit fixed height (see its own file).
    return <div ref={containerRef} className={className || 'min-h-[400px] h-[60vh] w-full'} />;
  },
);

RecordingGrid.displayName = 'RecordingGrid';

export default RecordingGrid;
