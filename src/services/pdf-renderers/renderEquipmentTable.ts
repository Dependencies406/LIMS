import type jsPDF from 'jspdf';
import type { EquipmentTableElement } from '../../modules/pdf-template-builder/types';
import { computeSafeLineHeight } from '../pdfTextLayoutService';
import type { RendererHelpers } from './rendererHelpers';

/**
 * Renders the equipment table element onto a jsPDF document.
 * This function was extracted from PdfTemplateRenderer for maintainability.
 *
 * Row heights are computed dynamically from the actual wrapped-text content so
 * the table expands to fit multi-line values (e.g. long calibration point lists).
 */
export function renderEquipmentTable(
  pdf: jsPDF,
  element: EquipmentTableElement,
  jobData: any,
  slice: { rowStart: number; rowEnd: number } | undefined,
  helpers: RendererHelpers
): void {
  const equipment: any[] = jobData?.equipment ?? [];
  const items = slice
    ? equipment.slice(slice.rowStart, slice.rowEnd)
    : equipment;

  if (items.length === 0) return;

  // Filter to visible columns only and sort by display order — must match
  // measureEquipmentTableHeights in pdfTemplateRenderer.ts so layout is consistent.
  const columns = ((element as any).columns ?? [])
    .filter((c: any) => c.visible !== false)
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

  if (columns.length === 0) return;

  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const totalWidth = element.width ?? 100;

  const fontSize = (element as any).fontSize ?? (element as any).cellStyle?.fontSize ?? 9;
  const headerFontSize = (element as any).headerFontSize ?? (element as any).headerStyle?.fontSize ?? fontSize;
  const cellPadding = 4;
  const minRowHeight = 18;

  const headerBg = (element as any).headerStyle?.backgroundColor
    ?? (element as any).headerBackgroundColor
    ?? '#e5e7eb';
  const borderColor = (element as any).borderColor ?? '#d1d5db';
  const borderWidth = (element as any).borderWidth ?? 0.5;

  const cellBold = !!((element as any).cellStyle?.bold);
  const headerBold = !!((element as any).headerStyle?.bold ?? true);

  // Per-column widths (matches measureEquipmentTableHeights).
  const equalW = totalWidth / columns.length;
  const colWidths: number[] = columns.map((c: any) => c.width ?? equalW);

  const bodyLineHeight   = computeSafeLineHeight({ fontSize, text: '' });
  const headerLineHeight = computeSafeLineHeight({ fontSize: headerFontSize, text: '' });

  // ── Pass 1: compute header row height ────────────────────────────
  helpers.applyContentFont(pdf, '', 'Helvetica', headerBold ? 'bold' : 'normal', headerFontSize);
  let headerHeight = minRowHeight;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const cw = colWidths[i];
    const lines = helpers.wrapTextForCell(
      helpers.normalizePdfText(col.label ?? col.id ?? ''),
      Math.max(1, cw - cellPadding * 2),
      headerFontSize,
      pdf
    );
    const needed = lines.length * headerLineHeight + cellPadding * 2;
    if (needed > headerHeight) headerHeight = needed;
  }

  // ── Pass 1: compute each data row height ─────────────────────────
  helpers.applyContentFont(pdf, '', 'Helvetica', cellBold ? 'bold' : 'normal', fontSize);
  const rowHeights: number[] = items.map((eq) => {
    let rh = minRowHeight;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const cw = colWidths[i];
      // Bug fix: use col.id (field key on Equipment) — col.key does not exist on
      // EquipmentTableColumnDef and always resolved to undefined, causing blank cells.
      const raw = eq[col.id] ?? '';
      const text = helpers.normalizePdfText(String(raw));
      const lines = helpers.wrapTextForCell(
        text,
        Math.max(1, cw - cellPadding * 2),
        fontSize,
        pdf
      );
      const needed = lines.length * bodyLineHeight + cellPadding * 2;
      if (needed > rh) rh = needed;
    }
    return rh;
  });

  // ── Pass 2: render header row ─────────────────────────────────────
  helpers.applyContentFont(pdf, '', 'Helvetica', headerBold ? 'bold' : 'normal', headerFontSize);
  pdf.setFontSize(headerFontSize);

  let curX = x;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const cw = colWidths[i];

    pdf.setFillColor(headerBg);
    pdf.rect(curX, y, cw, headerHeight, 'F');
    pdf.setDrawColor(borderColor);
    pdf.setLineWidth(borderWidth);
    pdf.rect(curX, y, cw, headerHeight);

    pdf.setTextColor('#111827');
    const label = helpers.normalizePdfText(col.label ?? col.id ?? '');
    const align: 'left' | 'center' | 'right' = col.align ?? 'left';
    const textX = align === 'center'
      ? curX + cw / 2
      : align === 'right'
        ? curX + cw - cellPadding
        : curX + cellPadding;

    const lines = helpers.wrapTextForCell(label, Math.max(1, cw - cellPadding * 2), headerFontSize, pdf);
    let lineY = y + cellPadding + headerFontSize;
    for (const line of lines) {
      pdf.text(line, textX, lineY, { align, maxWidth: cw - cellPadding * 2 });
      lineY += headerLineHeight;
    }

    curX += cw;
  }

  // ── Pass 2: render data rows ──────────────────────────────────────
  helpers.applyContentFont(pdf, '', 'Helvetica', cellBold ? 'bold' : 'normal', fontSize);
  pdf.setFontSize(fontSize);

  // Hard clip: never render past element.y + element.height so we never
  // paint over sibling elements positioned below this table in the template.
  // Only enforced when height is explicitly set (> 0) — if the template omits
  // height, we render without a boundary (backward-compatible behaviour).
  // The proper fix for users whose table overlaps siblings is to set a Table
  // Height in the Properties Panel equal to the allocated space on the page.
  const bottomBoundary = (typeof element.height === 'number' && element.height > minRowHeight)
    ? y + element.height
    : Infinity;

  let curY = y + headerHeight;
  for (let ri = 0; ri < items.length; ri++) {
    if (curY >= bottomBoundary) break; // stop — remaining rows belong on the next sub-page
    const eq = items[ri];
    const rowHeight = rowHeights[ri];
    curX = x;

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const cw = colWidths[i];

      pdf.setFillColor('#ffffff');
      pdf.rect(curX, curY, cw, rowHeight, 'F');
      pdf.setDrawColor(borderColor);
      pdf.setLineWidth(borderWidth);
      pdf.rect(curX, curY, cw, rowHeight);

      const raw = eq[col.id] ?? '';
      const text = helpers.normalizePdfText(String(raw));
      const align: 'left' | 'center' | 'right' = col.align ?? 'left';
      const textX = align === 'center'
        ? curX + cw / 2
        : align === 'right'
          ? curX + cw - cellPadding
          : curX + cellPadding;

      pdf.setTextColor('#374151');
      const lines = helpers.wrapTextForCell(text, Math.max(1, cw - cellPadding * 2), fontSize, pdf);
      let lineY = curY + cellPadding + fontSize;
      for (const line of lines) {
        pdf.text(line, textX, lineY, { align, maxWidth: cw - cellPadding * 2 });
        lineY += bodyLineHeight;
      }

      curX += cw;
    }
    curY += rowHeight;
  }
}
