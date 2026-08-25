import type jsPDF from 'jspdf';
import type { RecordTableElement, RecordTableOverflowMode } from '../../modules/pdf-template-builder/types';
import type { CalibrationRecord, ConversionCellSnapshot, ConversionRule, RecorderTemplate, RecordColumn } from '../../types';
import { computeSafeLineHeight } from '../pdfTextLayoutService';
import { joinLabelAndUnit, resolveColumnUnitMap, formatColumnValueForDisplay } from '../recordingGridDocument';
import { convertColumnDisplayValue } from '../columnConversion';
import type { RendererHelpers } from './rendererHelpers';

/** One column resolved for rendering: its key, label, section, and the RecordColumn it came from. */
export interface RecordTableColumnPlan {
  key: string;
  label: string;
  align: 'left' | 'right';
  sectionId: string;
  sectionLabel: string;
  column: RecordColumn;
  /**
   * The column's EFFECTIVE unit (ADR-015 D8 step 3) — fixed, the record's
   * `columnUnits` selection, or a `sameAs` chain, already resolved. The same
   * value `label` was built from (`joinLabelAndUnit`), reused here as the
   * conversion pipeline's target unit so header text and conversion target
   * can never disagree.
   */
  unit?: string;
}

/** The inputs `formatRecordValueForPdf` needs to run ADR-015's conversion pipeline before formatting. */
export interface RecordTableConversionContext {
  targetUnit: string | undefined;
  rules: ConversionRule[];
  /**
   * ADR-015 D7: this cell's FROZEN conversion, captured at commit — when
   * present, it is used directly (`convertedValue`) instead of re-deriving
   * from `rules`, so an already-issued certificate's printed numbers can
   * never move even if the live rule is later edited or deactivated.
   * Undefined for a draft record (nothing has been committed yet) or an
   * older record committed before this snapshot existed.
   */
  snapshot?: ConversionCellSnapshot;
}

/** A section-header span over a contiguous run of resolved columns (by index into the resolved column array). */
export interface RecordTableSectionSpan {
  sectionLabel: string;
  startIndex: number;
  endIndex: number; // inclusive
}

/**
 * Resolves which columns to render, in order (Phase 27, Phase 29):
 *   1. `element.sections` (an ordered list of section ids) filters WHICH
 *      sections appear, in the order given.
 *        - `undefined` (the field absent) = every section, in template
 *          order — the only meaning for templates authored before this
 *          field existed, and unchanged by Phase 29.
 *        - `[]` (Phase 29) = explicitly NO sections — the table renders
 *          nothing. Distinct from `undefined`: an author who deselected
 *          every section sees that reflected honestly, rather than the
 *          picker silently reverting to "all" (the Phase 29 bug).
 *      A section id absent from `template` (a template revised since a
 *      record pinned it, ADR-005) is skipped silently either way.
 *   2. `element.columns` (a list of `${sectionId}_${columnId}` keys) then
 *      narrows WITHIN the surviving sections, in the order given, with the
 *      identical `undefined` (all) vs `[]` (none) distinction as `sections`.
 */
export function getRecordTableColumns(
  element: RecordTableElement,
  template: RecorderTemplate,
  columnUnits: Record<string, string> = {},
): RecordTableColumnPlan[] {
  // Resolved once for the whole template so a 'sameAs' column prints its
  // source's unit — the same header text the on-screen grid shows.
  const unitByKey = resolveColumnUnitMap(template, columnUnits);
  const all: RecordTableColumnPlan[] = [];
  for (const section of template.sections) {
    for (const column of section.columns) {
      const key = `${section.id}_${column.id}`;
      all.push({
        key,
        label: joinLabelAndUnit(column, unitByKey[key]),
        align: column.type === 'number' || column.type === 'formula' ? 'right' : 'left',
        sectionId: section.id,
        sectionLabel: section.label || section.id,
        column,
        unit: unitByKey[key],
      });
    }
  }

  // `undefined` = all; an explicit array (including []) = exactly that set.
  // NEVER treat [] as "fall back to all" — that conflation was the Phase 29
  // bug (deselecting the last section/column silently re-selected everything).
  const sectionFilter = element.sections;
  const bySections = sectionFilter === undefined
    ? all
    : sectionFilter.flatMap((sectionId) => all.filter((c) => c.sectionId === sectionId));

  const selection = element.columns;
  if (selection === undefined) return bySections;

  const byKey = new Map(bySections.map((c) => [c.key, c]));
  return selection.map((key) => byKey.get(key)).filter((c): c is RecordTableColumnPlan => Boolean(c));
}

/** Groups a resolved column list into contiguous section-header spans, for the spanning header row. */
export function computeSectionSpans(columns: RecordTableColumnPlan[]): RecordTableSectionSpan[] {
  const spans: RecordTableSectionSpan[] = [];
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const last = spans[spans.length - 1];
    if (last && columns[last.endIndex].sectionId === col.sectionId) {
      last.endIndex = i;
    } else {
      spans.push({ sectionLabel: col.sectionLabel, startIndex: i, endIndex: i });
    }
  }
  return spans;
}

/**
 * Formats a raw cell value exactly as ADR-011 specifies: full-precision
 * storage, rounding only at display, notation is an explicit per-column
 * choice with no magnitude-based auto-switching. Scientific: uppercase `E`,
 * always-signed exponent, no exponent zero-padding — which is exactly what
 * `Number.prototype.toExponential` already produces (only the `e` needs
 * uppercasing). Only `type: 'number'` columns carry a NumberFormat (matches
 * the on-screen recording grid — see `recordingGridDocument.ts`); every other
 * column type is shown as its raw string value, unrounded.
 *
 * ADR-015 D1/D8: when `conversion` is supplied and the column is a `formula`
 * column with `conversionEnabled`, the value is run through
 * `convertColumnDisplayValue` FIRST — full precision, exactly as the grid
 * does — and only the (possibly converted) result is then subject to
 * whatever rounding this function already applies below. A conversion that
 * was needed but failed (D6) still shows the RAW value, with a short " [!]"
 * marker appended so the printed page never silently shows a wrong-unit
 * number as if it were correct.
 *
 * D7: when `conversion.snapshot` is present, its `convertedValue` is used
 * DIRECTLY — the live rule library is not consulted at all for this cell —
 * so an already-committed certificate keeps printing the same number even
 * after the rule that originally produced it is edited or deactivated.
 *
 * This must be the ONLY place that turns a record cell into display text —
 * `measureRecordTableHeights` (pdfTemplateRenderer.ts) and the drawing pass
 * below both call it, so row heights are always measured from what actually
 * gets drawn.
 */
export function formatRecordValueForPdf(
  value: string | number | null | undefined,
  column: RecordColumn,
  conversion?: RecordTableConversionContext,
): string {
  if (value === null || value === undefined) return '';
  let display: string | number = value;
  let marker = '';
  if (column.type === 'formula' && column.conversionEnabled && typeof value === 'number' && conversion) {
    if (conversion.snapshot) {
      display = conversion.snapshot.convertedValue;
    } else {
      const result = convertColumnDisplayValue({
        rawValue: value,
        column,
        targetUnit: conversion.targetUnit,
        rules: conversion.rules,
      });
      display = result.displayValue;
      if (result.failure) marker = ' [!]';
    }
  }
  // Phase 26 Task 1: formula columns are formatted here too, through the
  // SAME `effectiveNumberFormat` the grid uses, so a computed value cannot
  // read one way on screen and another on the certificate. Was
  // `type === 'number'` only.
  //
  // Deliberately AFTER the conversion block above: when a value was
  // display-converted (ADR-015), it is the CONVERTED number that gets
  // rounded, never the raw one — rounding first and converting second would
  // compound two roundings into the printed figure.
  // Phase 26 Task 1: routed through the SAME shared formatter the grid,
  // read-only view and test harness use, so a computed value cannot read one
  // way on screen and another on the certificate. Formula columns previously
  // fell straight through to String() at raw float precision.
  //
  // Deliberately AFTER the conversion block above: when a value was
  // display-converted (ADR-015) it is the CONVERTED number that gets rounded,
  // never the raw one — rounding first would compound two roundings into the
  // printed figure.
  if (typeof display === 'number') {
    return formatColumnValueForDisplay(display, column) + marker;
  }
  return String(display) + marker;
}

/**
 * Minimum width (pt) any record-table column may render at. Below this,
 * `layoutTextToLines` (pdfTextLayoutService.ts) cannot fit even a short word
 * or number on one line and falls back to character-by-character splitting
 * — the Phase 27 bug. 36pt leaves ~28pt of content width after padding,
 * enough for a handful of characters even at `RECORD_TABLE_FONT_FLOOR`.
 * Columns are NEVER narrower than this (see `distributeRecordTableColumnWidths`);
 * when there isn't even this much room, text degrades by font-shrink then
 * ellipsis truncation instead (Task 2), and the layout is reported as
 * impossible in the Properties Panel (Task 3) rather than silently breaking.
 */
export const RECORD_TABLE_MIN_COLUMN_WIDTH = 36;

/**
 * Smallest font size the degradation path will shrink cell/header text to
 * before switching to ellipsis truncation. Matches the Properties Panel's
 * own `fontSize` / `headerFontSize` input floor (`ElementPropertiesPanel.tsx`,
 * `min={6}`) — an author can't hand-author a smaller cell font already, so
 * the automatic floor stays consistent with what's manually achievable.
 */
export const RECORD_TABLE_FONT_FLOOR = 6;

const ELLIPSIS = '…';

/**
 * Splits `totalWidth` across columns given each column's natural (full,
 * single-line) content width — Task 2:
 *   - Every column gets at least `minColWidth`, always (never less).
 *   - If natural widths fit within `totalWidth`, the remaining space is
 *     distributed proportionally to natural width (step 2) — a column that
 *     needs more room gets more of the total, rather than an equal share.
 *   - If they don't fit, every column is floored at `minColWidth` and
 *     whatever's left over is distributed proportionally to how far each
 *     column's natural width exceeds that floor (step 3's "apply a minimum
 *     column width").
 *   - If even `minColWidth * columns.length` exceeds `totalWidth`, the
 *     layout is impossible (step 4): every column still gets exactly
 *     `minColWidth`, overflowing the element's box rather than shrinking
 *     below the floor. The Properties Panel warns about this case ahead of
 *     time (Task 3) so it's a choice the author sees, not a surprise.
 */
export function distributeRecordTableColumnWidths(
  naturalWidths: number[],
  totalWidth: number,
  minColWidth: number = RECORD_TABLE_MIN_COLUMN_WIDTH,
): number[] {
  const n = naturalWidths.length;
  if (n === 0) return [];

  const floorTotal = minColWidth * n;
  if (floorTotal >= totalWidth) {
    return naturalWidths.map(() => minColWidth);
  }

  const sumNatural = naturalWidths.reduce((a, b) => a + b, 0);
  if (sumNatural <= 0) {
    return naturalWidths.map(() => totalWidth / n);
  }
  if (sumNatural <= totalWidth) {
    return naturalWidths.map((w) => (totalWidth * w) / sumNatural);
  }

  const extraBudget = totalWidth - floorTotal;
  const extraNeed = naturalWidths.map((w) => Math.max(0, w - minColWidth));
  const sumExtraNeed = extraNeed.reduce((a, b) => a + b, 0);
  if (sumExtraNeed <= 0) {
    const share = extraBudget / n;
    return naturalWidths.map(() => minColWidth + share);
  }
  return extraNeed.map((need) => minColWidth + (extraBudget * need) / sumExtraNeed);
}

export interface RecordTableColumnFitWarning {
  columnCount: number;
  /** Worst-case per-column width (pt) if `totalWidth` were split evenly across `columnCount` columns. */
  approxColumnWidth: number;
  /** True when `approxColumnWidth` is below `RECORD_TABLE_MIN_COLUMN_WIDTH` — the render WILL degrade (font-shrink, then truncation) somewhere. */
  belowMinimum: boolean;
}

/**
 * Task 3: tells the Properties Panel, at authoring time, whether the
 * current section/column selection will force degraded rendering — before
 * the author generates a PDF and discovers it there.
 *
 * Deliberately an EQUAL-share estimate, not the renderer's actual
 * proportional-with-floor distribution (`distributeRecordTableColumnWidths`):
 * the panel has neither real row data nor jsPDF font metrics to compute
 * natural widths with, only a column count and the element's authored
 * width. But it's the right estimate for a warning — if even an equal split
 * already falls below the minimum, the real (proportional) distribution
 * cannot do better than equal for the narrowest columns, so degradation is
 * guaranteed regardless of exactly how the renderer distributes the
 * shortfall.
 */
export function evaluateRecordTableColumnFit(
  columnCount: number,
  totalWidth: number,
  minColWidth: number = RECORD_TABLE_MIN_COLUMN_WIDTH,
): RecordTableColumnFitWarning {
  const approxColumnWidth = columnCount > 0 ? totalWidth / columnCount : totalWidth;
  return {
    columnCount,
    approxColumnWidth,
    belowMinimum: columnCount > 0 && approxColumnWidth < minColWidth,
  };
}

export interface RecordTableOverflowFitWarning extends RecordTableColumnFitWarning {
  /**
   * True when `belowMinimum` and `mode === 'wrap'`: a column pinned to the
   * 36pt floor has so little content width that ordinary content is likely
   * to need more than `maxWrapLines` lines and still get ellipsis-truncated
   * — the same underlying cause as `belowMinimum`, so this is additional
   * text on the SAME warning (Task 3), not a second estimate: the panel has
   * no real row data or font metrics to know actual wrapped line counts
   * with, only the column-width squeeze that `belowMinimum` already
   * detects, so "wrap mode won't fully rescue this" is reported on that
   * same signal rather than invented per-cell content-length modelling.
   */
  wrapLikelyToTruncate: boolean;
}

/**
 * Phase 28 Task 3: extends `evaluateRecordTableColumnFit` with the
 * mode-aware half of the Properties Panel warning — still ONE evaluation,
 * ONE banner, per the phase's "extend Phase 27's existing fit warning
 * rather than adding a second banner" decision.
 */
export function evaluateRecordTableOverflowFit(
  columnCount: number,
  totalWidth: number,
  mode: RecordTableOverflowMode,
  minColWidth: number = RECORD_TABLE_MIN_COLUMN_WIDTH,
): RecordTableOverflowFitWarning {
  const fit = evaluateRecordTableColumnFit(columnCount, totalWidth, minColWidth);
  return { ...fit, wrapLikelyToTruncate: fit.belowMinimum && mode === 'wrap' };
}

/**
 * Largest font size in `[floor, baseFontSize]` at which every `{ text,
 * width }` pair fits on one line. jsPDF's standard-font text width scales
 * linearly with font size, so the exact required size is solved directly
 * (from the worst-case cell) rather than searched for.
 */
function shrinkFontToFit(
  pdf: jsPDF,
  cells: Array<{ text: string; width: number }>,
  baseFontSize: number,
  floor: number,
): number {
  pdf.setFontSize(baseFontSize);
  let minRatio = 1;
  for (const { text, width } of cells) {
    if (!text) continue;
    if (width <= 0) {
      minRatio = 0;
      continue;
    }
    const w = pdf.getTextWidth(text);
    if (w > width) minRatio = Math.min(minRatio, width / w);
  }
  return Math.max(floor, Math.min(baseFontSize, baseFontSize * minRatio));
}

/**
 * Shortens `text` to the widest prefix that still fits `width` once `…` is
 * appended, at `fontSize` — and ALWAYS appends the ellipsis, even if `text`
 * already fit `width` on its own. Assumes `pdf`'s font size is already set
 * to `fontSize` (callers measure other things right before this).
 *
 * This unconditional form exists because "already fits" and "needs an
 * ellipsis" are different questions: `truncateWithEllipsis` (below) only
 * shortens text that doesn't fit — but `resolveRecordTableCellLines`'s wrap
 * mode (Task 2.3, 'wrap') needs the ellipsis on the LAST kept line to mark
 * "there was more text than `maxWrapLines` allowed" even though that line,
 * being a valid wrapped line, already fits `width` by itself.
 */
function forceEllipsisWithinWidth(pdf: jsPDF, text: string, width: number): string {
  if (pdf.getTextWidth(ELLIPSIS) > width) return '';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    const candidate = text.slice(0, mid) + ELLIPSIS;
    if (pdf.getTextWidth(candidate) <= width) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo) + ELLIPSIS;
}

/**
 * Truncates `text` with a trailing ellipsis so it fits within `width` at
 * `fontSize` — the last-resort degradation step (Task 2.3b), reached only
 * when `shrinkFontToFit` has already hit the floor and the text still
 * doesn't fit. The result always fits on one line, so `layoutTextToLines`
 * never needs its character-by-character fallback for it (Task 2.3c).
 */
function truncateWithEllipsis(pdf: jsPDF, text: string, width: number, fontSize: number): string {
  pdf.setFontSize(fontSize);
  if (pdf.getTextWidth(text) <= width) return text;
  return forceEllipsisWithinWidth(pdf, text, width);
}

/**
 * Shrinks to floor (if needed) then truncates with ellipsis (if still
 * needed) — Task 2.3a/b, in order. Exported so `measureRecordTableHeights`
 * (pdfTemplateRenderer.ts) can apply the IDENTICAL degradation when
 * measuring row heights for pagination as `renderRecordTable` applies when
 * actually drawing — otherwise a truncated (shorter/single-line) cell would
 * measure differently than what gets drawn.
 */
export function resolveDegradedText(pdf: jsPDF, text: string, width: number, fontSize: number): string {
  pdf.setFontSize(fontSize);
  if (!text || pdf.getTextWidth(text) <= width) return text;
  return truncateWithEllipsis(pdf, text, width, fontSize);
}

/** `maxWrapLines`'s default (Phase 28 owner decision) and permitted range. */
export const RECORD_TABLE_DEFAULT_MAX_WRAP_LINES = 3;
/** Below 1 line there's nothing to wrap. */
export const RECORD_TABLE_MIN_WRAP_LINES = 1;
/**
 * Upper cap on `maxWrapLines`. A single cell is still just one row: at the
 * 6pt font floor, N wrapped lines cost roughly `N * 6 * 1.2 ≈ N * 7.2pt` of
 * row height (`computeSafeLineHeight`), so an unbounded author-set value
 * could make one long cell balloon a row far past the page — worsening
 * exactly the "one row taller than the viewport" pagination hazard Task 2
 * flags. 6 lines (~43pt at the floor) is generous for a remark/note column
 * while keeping that risk bounded.
 */
export const RECORD_TABLE_MAX_WRAP_LINES = 6;

/** Clamps an author-supplied `maxWrapLines` to `[RECORD_TABLE_MIN_WRAP_LINES, RECORD_TABLE_MAX_WRAP_LINES]`, defaulting when absent or invalid. */
export function clampRecordTableMaxWrapLines(value: number | undefined): number {
  const n = typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : RECORD_TABLE_DEFAULT_MAX_WRAP_LINES;
  return Math.min(RECORD_TABLE_MAX_WRAP_LINES, Math.max(RECORD_TABLE_MIN_WRAP_LINES, n));
}

/**
 * Task 2.4 (Phase 28) — resolves the FINAL lines to draw/measure for one
 * cell/header/section-header, after font-shrink has already produced
 * `fontSize` (Phase 27 steps 1-3, which run identically regardless of
 * mode). This is the ONE place `overflowMode` is interpreted; both
 * `renderRecordTable` (draw) and `measureRecordTableHeights`
 * (pdfTemplateRenderer.ts) call it, so a wrapped row measures exactly as
 * tall as what gets drawn.
 *
 *   - `'ellipsis'` (default): identical to Phase 27 — one line, truncated
 *     with `…` if it still overflows `width` at `fontSize`.
 *   - `'wrap'`: wraps via the untouched `wrapTextForCell` (itself built on
 *     `layoutTextToLines`), capped at `maxWrapLines`; if wrapping needed
 *     more lines than that, the LAST kept line is ellipsis-truncated so
 *     nothing is silently dropped without a visible marker.
 *   - `'shrink-only'`: nothing further — the full text as a single,
 *     un-truncated "line". Deliberately NOT passed through
 *     `wrapTextForCell` at the cell's width: that could still need
 *     multiple lines or (if a single token doesn't fit) trip
 *     `layoutTextToLines`' character-split fallback. Returning it as one
 *     opaque line and letting the caller draw it without a `maxWidth`
 *     constraint is what makes "may overflow the cell visibly" true
 *     without ever risking single-character lines (Task 2 ladder step 5).
 */
export function resolveRecordTableCellLines(
  pdf: jsPDF,
  rawText: string,
  width: number,
  fontSize: number,
  mode: RecordTableOverflowMode,
  maxWrapLines: number,
  wrapTextForCell: RendererHelpers['wrapTextForCell'],
): string[] {
  if (!rawText) return [''];

  if (mode === 'shrink-only') {
    return [rawText];
  }

  if (mode === 'wrap') {
    const lines = wrapTextForCell(rawText, width, fontSize, pdf);
    if (lines.length <= maxWrapLines) return lines;
    const kept = lines.slice(0, Math.max(1, maxWrapLines));
    const lastIndex = kept.length - 1;
    // The kept last line already fits `width` (it's a valid wrapped line) —
    // `forceEllipsisWithinWidth` is used, not `truncateWithEllipsis`,
    // because an ellipsis must be added here regardless to mark "more text
    // followed", not only when the line's own text overflows.
    pdf.setFontSize(fontSize);
    const marked = forceEllipsisWithinWidth(pdf, kept[lastIndex], width);
    kept[lastIndex] = marked || kept[lastIndex];
    return kept;
  }

  // 'ellipsis' (default).
  const resolved = resolveDegradedText(pdf, rawText, width, fontSize);
  return wrapTextForCell(resolved, width, fontSize, pdf);
}

export interface RecordTableLayout {
  /** One width (pt) per column, same order as the resolved column list. Sums to `totalWidth` unless Task 2 step 4's impossible case applies. */
  colWidths: number[];
  /** Effective font size for data-row cells, after degradation (Task 2.3a). */
  cellFontSize: number;
  /** Effective font size for the column-header row, after degradation. */
  headerFontSize: number;
  /** Effective font size for the section-header row, after degradation. */
  sectionHeaderFontSize: number;
}

/**
 * Computes column widths and per-band font sizes for a record table —
 * Task 2 in full. Always run against the FULL (unsliced) row set, by both
 * `renderRecordTable` (draw) and `measureRecordTableHeights`
 * (pdfTemplateRenderer.ts, pagination planning), so every sub-page of a
 * paginated table gets IDENTICAL column widths and font sizes — otherwise
 * columns would drift between continuation pages.
 */
export function computeRecordTableLayout(params: {
  pdf: jsPDF;
  columns: RecordTableColumnPlan[];
  /** The record's FULL row set — never a slice. */
  rows: CalibrationRecord['rows'];
  conversionRules: ConversionRule[];
  conversionSnapshotFor: (rowIndex: number, columnKey: string) => ConversionCellSnapshot | undefined;
  totalWidth: number;
  fontSize: number;
  headerFontSize: number;
  sectionHeaderFontSize: number;
  showSectionHeaders: boolean;
  spans: RecordTableSectionSpan[];
  cellPadding: number;
  cellBold: boolean;
  headerBold: boolean;
  sectionHeaderBold: boolean;
  helpers: RendererHelpers;
}): RecordTableLayout {
  const {
    pdf, columns, rows, conversionRules, conversionSnapshotFor, totalWidth, cellPadding, helpers,
  } = params;

  const cellTextFor = (ri: number, col: RecordTableColumnPlan) =>
    helpers.normalizePdfText(
      formatRecordValueForPdf(rows[ri][col.key], col.column, {
        targetUnit: col.unit,
        rules: conversionRules,
        snapshot: conversionSnapshotFor(ri, col.key),
      }),
    );

  // ── Natural widths (Task 2 step 1) ─────────────────────────────────────
  helpers.applyContentFont(pdf, '', 'Helvetica', params.headerBold ? 'bold' : 'normal', params.headerFontSize);
  pdf.setFontSize(params.headerFontSize);
  const headerNatural = columns.map((col) => pdf.getTextWidth(helpers.normalizePdfText(col.label)));

  helpers.applyContentFont(pdf, '', 'Helvetica', params.cellBold ? 'bold' : 'normal', params.fontSize);
  pdf.setFontSize(params.fontSize);
  const cellNatural = columns.map(() => 0);
  for (let ri = 0; ri < rows.length; ri++) {
    for (let ci = 0; ci < columns.length; ci++) {
      const w = pdf.getTextWidth(cellTextFor(ri, columns[ci]));
      if (w > cellNatural[ci]) cellNatural[ci] = w;
    }
  }

  const natural = columns.map((_, i) => Math.max(headerNatural[i], cellNatural[i]) + cellPadding * 2);
  const colWidths = distributeRecordTableColumnWidths(natural, totalWidth, RECORD_TABLE_MIN_COLUMN_WIDTH);

  // ── Font-shrink degradation, per band (Task 2 step 3a) ─────────────────
  helpers.applyContentFont(pdf, '', 'Helvetica', params.cellBold ? 'bold' : 'normal', params.fontSize);
  const cellFontSize = shrinkFontToFit(
    pdf,
    rows.flatMap((_, ri) => columns.map((col, ci) => ({
      text: cellTextFor(ri, col),
      width: colWidths[ci] - cellPadding * 2,
    }))),
    params.fontSize,
    RECORD_TABLE_FONT_FLOOR,
  );

  helpers.applyContentFont(pdf, '', 'Helvetica', params.headerBold ? 'bold' : 'normal', params.headerFontSize);
  const headerFontSize = shrinkFontToFit(
    pdf,
    columns.map((col, ci) => ({ text: helpers.normalizePdfText(col.label), width: colWidths[ci] - cellPadding * 2 })),
    params.headerFontSize,
    RECORD_TABLE_FONT_FLOOR,
  );

  let sectionHeaderFontSize = params.sectionHeaderFontSize;
  if (params.showSectionHeaders) {
    helpers.applyContentFont(pdf, '', 'Helvetica', params.sectionHeaderBold ? 'bold' : 'normal', params.sectionHeaderFontSize);
    sectionHeaderFontSize = shrinkFontToFit(
      pdf,
      params.spans.map((span) => ({
        text: helpers.normalizePdfText(span.sectionLabel),
        width: colWidths.slice(span.startIndex, span.endIndex + 1).reduce((a, b) => a + b, 0) - cellPadding * 2,
      })),
      params.sectionHeaderFontSize,
      RECORD_TABLE_FONT_FLOOR,
    );
  }

  return { colWidths, cellFontSize, headerFontSize, sectionHeaderFontSize };
}

/**
 * Renders the record table element onto a jsPDF document. Modeled directly
 * on renderEquipmentTable.ts — two measure passes (header, rows) then two
 * draw passes, reusing the same slice/viewport/pagination contract.
 */
export function renderRecordTable(
  pdf: jsPDF,
  element: RecordTableElement,
  jobData: any,
  slice: { rowStart: number; rowEnd: number } | undefined,
  helpers: RendererHelpers,
): void {
  const record: CalibrationRecord | undefined = jobData?.record;
  const template: RecorderTemplate | undefined = jobData?.recordTemplate;
  if (!record || !template) return;

  const columns = getRecordTableColumns(element, template, record.columnUnits ?? {});
  if (columns.length === 0) return;

  // ADR-015 D2: the shared rule library, threaded through jobData by
  // recordTemplatePrintService.prepareRecordDataContext. Absent (e.g. an
  // older caller / test fixture that hasn't been updated) behaves exactly
  // like an empty rule set — every conversionEnabled cell falls back to D6's
  // "no rule" marker, never a crash.
  const conversionRules: ConversionRule[] = (jobData as any)?.conversionRules ?? [];

  const rows = slice ? record.rows.slice(slice.rowStart, slice.rowEnd) : record.rows;
  if (rows.length === 0) return;

  // `conversionSnapshots` is keyed by `${rowIndex}:${columnKey}` against the
  // record's FULL, unsliced row array (see calibrationRecordService's
  // buildConversionSnapshots) — a slice offsets `ri` below, so every lookup
  // must add it back to land on the same key commit-time wrote.
  const rowIndexOffset = slice?.rowStart ?? 0;
  const conversionSnapshotFor = (ri: number, columnKey: string): ConversionCellSnapshot | undefined =>
    record.conversionSnapshots?.[`${rowIndexOffset + ri}:${columnKey}`];

  const showSectionHeaders = element.showSectionHeaders ?? true;
  const spans = showSectionHeaders ? computeSectionSpans(columns) : [];

  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const totalWidth = element.width ?? 400;

  const fontSize = element.fontSize ?? element.cellStyle?.fontSize ?? 9;
  const headerFontSize = element.headerFontSize ?? element.headerStyle?.fontSize ?? fontSize;
  const sectionHeaderFontSize = element.sectionHeaderFontSize ?? element.sectionHeaderStyle?.fontSize ?? headerFontSize;
  const cellPadding = 4;
  const minRowHeight = 18;

  const sectionHeaderBg = element.sectionHeaderStyle?.backgroundColor ?? '#d1d5db';
  const headerBg = element.headerStyle?.backgroundColor ?? '#e5e7eb';
  const borderColor = element.borderColor ?? '#d1d5db';
  const borderWidth = element.borderWidth ?? 0.5;

  const cellBold = !!element.cellStyle?.bold;
  const headerBold = element.headerStyle?.bold ?? true;
  const sectionHeaderBold = element.sectionHeaderStyle?.bold ?? true;

  // Phase 28: governs step 4 of the ladder only — width/font-shrink (steps
  // 1-3) below run identically regardless of mode. Omitted = 'ellipsis',
  // Phase 27's only behaviour, so an element saved before this field
  // existed renders unchanged.
  const overflowMode: RecordTableOverflowMode = element.overflowMode ?? 'ellipsis';
  const maxWrapLines = clampRecordTableMaxWrapLines(element.maxWrapLines);

  // Task 2: proportional widths with a minimum-width floor, degrading via
  // font-shrink then ellipsis truncation — computed from the record's FULL
  // row set (not `rows`, the current slice) so every sub-page of a
  // paginated table gets identical widths/fonts. Must match
  // `measureRecordTableHeights` (pdfTemplateRenderer.ts) exactly, or
  // pagination slices against a layout that doesn't match what's drawn.
  const layout = computeRecordTableLayout({
    pdf, columns, rows: record.rows, conversionRules, conversionSnapshotFor: (ri, key) =>
      record.conversionSnapshots?.[`${ri}:${key}`],
    totalWidth, fontSize, headerFontSize, sectionHeaderFontSize,
    showSectionHeaders, spans, cellPadding, cellBold, headerBold, sectionHeaderBold, helpers,
  });
  const { colWidths } = layout;
  const colX: number[] = [];
  {
    let acc = x;
    for (const w of colWidths) {
      colX.push(acc);
      acc += w;
    }
  }
  const spanX = (span: RecordTableSectionSpan) => colX[span.startIndex];
  const spanWidth = (span: RecordTableSectionSpan) =>
    colWidths.slice(span.startIndex, span.endIndex + 1).reduce((a, b) => a + b, 0);

  const cellLineHeight = computeSafeLineHeight({ fontSize: layout.cellFontSize, text: '' });
  const headerLineHeight = computeSafeLineHeight({ fontSize: layout.headerFontSize, text: '' });
  const sectionHeaderLineHeight = computeSafeLineHeight({ fontSize: layout.sectionHeaderFontSize, text: '' });

  // ── Pass 1: section header row height (if shown) ──────────────────────
  let sectionHeaderHeight = 0;
  if (showSectionHeaders) {
    helpers.applyContentFont(pdf, '', 'Helvetica', sectionHeaderBold ? 'bold' : 'normal', layout.sectionHeaderFontSize);
    sectionHeaderHeight = minRowHeight;
    for (const span of spans) {
      const width = Math.max(1, spanWidth(span) - cellPadding * 2);
      const lines = resolveRecordTableCellLines(
        pdf, helpers.normalizePdfText(span.sectionLabel), width, layout.sectionHeaderFontSize,
        overflowMode, maxWrapLines, helpers.wrapTextForCell,
      );
      sectionHeaderHeight = Math.max(sectionHeaderHeight, lines.length * sectionHeaderLineHeight + cellPadding * 2);
    }
  }

  // ── Pass 1: column header row height ──────────────────────────────────
  helpers.applyContentFont(pdf, '', 'Helvetica', headerBold ? 'bold' : 'normal', layout.headerFontSize);
  let headerHeight = minRowHeight;
  for (let i = 0; i < columns.length; i++) {
    const width = Math.max(1, colWidths[i] - cellPadding * 2);
    const lines = resolveRecordTableCellLines(
      pdf, helpers.normalizePdfText(columns[i].label), width, layout.headerFontSize,
      overflowMode, maxWrapLines, helpers.wrapTextForCell,
    );
    headerHeight = Math.max(headerHeight, lines.length * headerLineHeight + cellPadding * 2);
  }

  // ── Pass 1: data row heights, from the FORMATTED cell string (ADR-011) ─
  helpers.applyContentFont(pdf, '', 'Helvetica', cellBold ? 'bold' : 'normal', layout.cellFontSize);
  const rowHeights: number[] = rows.map((row, ri) => {
    let rh = minRowHeight;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const width = Math.max(1, colWidths[i] - cellPadding * 2);
      const raw = helpers.normalizePdfText(
        formatRecordValueForPdf(row[col.key], col.column, {
          targetUnit: col.unit,
          rules: conversionRules,
          snapshot: conversionSnapshotFor(ri, col.key),
        }),
      );
      const lines = resolveRecordTableCellLines(pdf, raw, width, layout.cellFontSize, overflowMode, maxWrapLines, helpers.wrapTextForCell);
      rh = Math.max(rh, lines.length * cellLineHeight + cellPadding * 2);
    }
    return rh;
  });

  const bottomBoundary = (typeof element.height === 'number' && element.height > minRowHeight)
    ? y + element.height
    : Infinity;

  let curY = y;

  // ── Pass 2: section header band ───────────────────────────────────────
  if (showSectionHeaders) {
    helpers.applyContentFont(pdf, '', 'Helvetica', sectionHeaderBold ? 'bold' : 'normal', layout.sectionHeaderFontSize);
    pdf.setFontSize(layout.sectionHeaderFontSize);
    for (const span of spans) {
      const sx = spanX(span);
      const sw = spanWidth(span);
      pdf.setFillColor(sectionHeaderBg);
      pdf.rect(sx, curY, sw, sectionHeaderHeight, 'F');
      pdf.setDrawColor(borderColor);
      pdf.setLineWidth(borderWidth);
      pdf.rect(sx, curY, sw, sectionHeaderHeight);
      pdf.setTextColor('#111827');
      const width = Math.max(1, sw - cellPadding * 2);
      const lines = resolveRecordTableCellLines(
        pdf, helpers.normalizePdfText(span.sectionLabel), width, layout.sectionHeaderFontSize,
        overflowMode, maxWrapLines, helpers.wrapTextForCell,
      );
      if (lines.length <= 1) {
        // Single line (the only case in 'ellipsis'/'shrink-only' modes, and
        // the common case in 'wrap' too): unchanged from before this phase
        // — vertically centered in the band. 'shrink-only' omits maxWidth
        // so an over-wide line overflows visibly instead of being wrapped
        // by jsPDF's own text() maxWidth handling.
        pdf.text(lines[0] ?? '', sx + sw / 2, curY + sectionHeaderHeight / 2 + layout.sectionHeaderFontSize / 3, {
          align: 'center',
          ...(overflowMode === 'shrink-only' ? {} : { maxWidth: width }),
        });
      } else {
        // Multiple lines only ever happen in 'wrap' mode.
        let lineY = curY + cellPadding + layout.sectionHeaderFontSize;
        for (const line of lines) {
          pdf.text(line, sx + sw / 2, lineY, { align: 'center', maxWidth: width });
          lineY += sectionHeaderLineHeight;
        }
      }
    }
    curY += sectionHeaderHeight;
  }

  // ── Pass 2: column header band ────────────────────────────────────────
  helpers.applyContentFont(pdf, '', 'Helvetica', headerBold ? 'bold' : 'normal', layout.headerFontSize);
  pdf.setFontSize(layout.headerFontSize);
  for (let i = 0; i < columns.length; i++) {
    const cx = colX[i];
    const cw = colWidths[i];
    pdf.setFillColor(headerBg);
    pdf.rect(cx, curY, cw, headerHeight, 'F');
    pdf.setDrawColor(borderColor);
    pdf.setLineWidth(borderWidth);
    pdf.rect(cx, curY, cw, headerHeight);
    pdf.setTextColor('#111827');
    const width = Math.max(1, cw - cellPadding * 2);
    const lines = resolveRecordTableCellLines(
      pdf, helpers.normalizePdfText(columns[i].label), width, layout.headerFontSize,
      overflowMode, maxWrapLines, helpers.wrapTextForCell,
    );
    let lineY = curY + cellPadding + layout.headerFontSize;
    for (const line of lines) {
      pdf.text(line, cx + cw / 2, lineY, {
        align: 'center',
        ...(overflowMode === 'shrink-only' ? {} : { maxWidth: width }),
      });
      lineY += headerLineHeight;
    }
  }
  curY += headerHeight;

  // ── Pass 2: data rows ──────────────────────────────────────────────────
  helpers.applyContentFont(pdf, '', 'Helvetica', cellBold ? 'bold' : 'normal', layout.cellFontSize);
  pdf.setFontSize(layout.cellFontSize);
  for (let ri = 0; ri < rows.length; ri++) {
    if (curY >= bottomBoundary) break; // remaining rows belong on the next sub-page
    const row = rows[ri];
    const rowHeight = rowHeights[ri];
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const cx = colX[i];
      const cw = colWidths[i];
      pdf.setFillColor('#ffffff');
      pdf.rect(cx, curY, cw, rowHeight, 'F');
      pdf.setDrawColor(borderColor);
      pdf.setLineWidth(borderWidth);
      pdf.rect(cx, curY, cw, rowHeight);

      const width = Math.max(1, cw - cellPadding * 2);
      const raw = helpers.normalizePdfText(
        formatRecordValueForPdf(row[col.key], col.column, {
          targetUnit: col.unit,
          rules: conversionRules,
          snapshot: conversionSnapshotFor(ri, col.key),
        }),
      );
      const align = col.align;
      const textX = align === 'right' ? cx + cw - cellPadding : cx + cellPadding;
      pdf.setTextColor('#374151');
      const lines = resolveRecordTableCellLines(pdf, raw, width, layout.cellFontSize, overflowMode, maxWrapLines, helpers.wrapTextForCell);
      let lineY = curY + cellPadding + layout.cellFontSize;
      for (const line of lines) {
        pdf.text(line, textX, lineY, {
          align,
          ...(overflowMode === 'shrink-only' ? {} : { maxWidth: width }),
        });
        lineY += cellLineHeight;
      }
    }
    curY += rowHeight;
  }
}
