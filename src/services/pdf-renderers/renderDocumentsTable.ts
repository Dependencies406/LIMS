import type jsPDF from 'jspdf';
import type { DocumentsTableElement } from '../../modules/pdf-template-builder/types';
import type { DocumentIndexItem, DocumentSource } from '../../types';
import { computeSafeLineHeight } from '../pdfTextLayoutService';
import type { RendererHelpers } from './rendererHelpers';

/**
 * Renders the documents index table element onto a jsPDF document.
 * This function was extracted from PdfTemplateRenderer for maintainability.
 *
 * Rows come from jobData.documentIndexItems (populated from
 * documentIndexService.list by ensureDocumentIndexItems in the renderer).
 * Layout metrics must match measureDocumentsTableHeights in
 * pdfTemplateRenderer.ts so overflow slice plans line up with what is drawn.
 */

function formatSource(source: DocumentSource | undefined, helpers: RendererHelpers): string {
  if (!source || typeof source !== 'object') return '—';
  if (source.kind === 'pdf') {
    const name = (source as any).fileName || '';
    if (name) return `PDF: ${helpers.normalizePdfText(String(name))}`;
    const path = (source as any).storagePath || '';
    if (path) return `PDF: ${helpers.normalizePdfText(String(path))}`;
    return helpers.normalizePdfText(String((source as any).url || '—'));
  }
  return helpers.normalizePdfText(String((source as any).url || '—'));
}

function getCellText(item: DocumentIndexItem, colId: string, helpers: RendererHelpers): string {
  switch (colId) {
    case 'documentCode':
      return item.documentCode || '-';
    case 'type':
      return item.type || '-';
    case 'revisionNumber':
      return item.revisionNumber || '-';
    case 'documentName':
      return item.documentName || '-';
    case 'effectiveDate':
      return item.effectiveDate ? helpers.formatDate(item.effectiveDate) : '-';
    case 'darNumber':
      return item.darNumber || '—';
    case 'source':
      return formatSource(item.source, helpers);
    case 'darSource':
      return item.darSource ? formatSource(item.darSource, helpers) : '—';
    default:
      return '-';
  }
}

export function renderDocumentsTable(
  pdf: jsPDF,
  element: DocumentsTableElement,
  jobData: { documentIndexItems?: DocumentIndexItem[] },
  slice: { rowStart: number; rowEnd: number } | undefined,
  helpers: RendererHelpers
): void {
  const allItems: DocumentIndexItem[] = Array.isArray(jobData?.documentIndexItems)
    ? jobData.documentIndexItems
    : [];
  const items = slice
    ? allItems.slice(slice.rowStart, slice.rowEnd)
    : allItems;

  const x = element.x ?? 0;
  const y = element.y ?? 0;

  // Task 3/4 (Phase 30): an honest empty state instead of a silently blank
  // box — checked against the FULL list, not `items`: an empty slice on a
  // later sub-page is a pagination detail, not "no data".
  if (allItems.length === 0) {
    const totalWidth = element.width ?? 100;
    const emptyHeight = 18;
    const message = 'No documents.';
    pdf.setFillColor('#ffffff');
    pdf.rect(x, y, totalWidth, emptyHeight, 'F');
    pdf.setDrawColor((element as any).borderColor ?? '#d1d5db');
    pdf.setLineWidth((element as any).borderWidth ?? 0.5);
    pdf.rect(x, y, totalWidth, emptyHeight, 'S');
    helpers.applyContentFont(pdf, message, 'Helvetica', 'normal', 9);
    pdf.setFontSize(9);
    pdf.setTextColor('#6b7280');
    pdf.text(helpers.normalizePdfText(message), x + 4, y + 13);
    return;
  }
  if (items.length === 0) return;

  // Visible columns in display order — must match measureDocumentsTableHeights.
  const columns = ((element as any).columns ?? [])
    .filter((c: any) => c.visible !== false)
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

  if (columns.length === 0) return;

  const fontSize = (element as any).fontSize ?? (element as any).cellStyle?.fontSize ?? 9;
  const headerFontSize = (element as any).headerFontSize ?? (element as any).headerStyle?.fontSize ?? 10;
  const headerStyle = (element as any).headerStyle || {};
  const cellStyle = (element as any).cellStyle || {};
  const cellPadding = 4;
  const defaultRowHeight = 18;

  const headerBg = headerStyle.backgroundColor ?? '#e5e7eb';
  const headerTextColor = headerStyle.color ?? '#111827';
  const headerBold = headerStyle.bold ?? true;
  const cellBold = cellStyle.bold ?? false;
  const textColor = cellStyle.color ?? '#374151';
  const borderColor = (element as any).borderColor ?? '#d1d5db';
  const borderWidth = (element as any).borderWidth ?? 0.5;

  // Same width convention as measureDocumentsTableHeights (no rescaling).
  const colWidths: number[] = columns.map((c: any) => c.width ?? 60);

  // Font selection is content-driven (Thai-capable fonts when needed), so pass
  // the real text samples — same as the measuring pass in the renderer class.
  const headerSample = columns.map((c: any) => String(c.label || c.id || '')).join(' ');
  const bodySample = items
    .map((it) => columns.map((c: any) => getCellText(it, c.id, helpers)).join(' '))
    .join(' ');

  const lineHeight = computeSafeLineHeight({ fontSize, text: bodySample });
  const headerLineHeight = computeSafeLineHeight({ fontSize: headerFontSize, text: headerSample });

  // ── Pass 1: header height (mirrors measureDocumentsTableHeights) ──────────
  helpers.applyContentFont(pdf, headerSample, headerStyle.font ?? 'Helvetica', headerBold ? 'bold' : 'normal', headerFontSize);
  let headerHeight = defaultRowHeight;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const cellWidth = colWidths[i] - cellPadding * 2;
    const lines = helpers.wrapTextForCell(col.label || col.id, Math.max(1, cellWidth), headerFontSize, pdf);
    const cellHeight =
      lines.length > 0 ? lines.length * headerLineHeight + cellPadding * 2 : defaultRowHeight;
    if (cellHeight > headerHeight) headerHeight = cellHeight;
  }

  // ── Pass 1: per-row heights (mirrors measureDocumentsTableHeights) ────────
  helpers.applyContentFont(pdf, bodySample, cellStyle.font ?? 'Helvetica', cellBold ? 'bold' : 'normal', fontSize);
  const rowHeights: number[] = items.map((item) => {
    let rowHeight = defaultRowHeight;
    for (let i = 0; i < columns.length; i++) {
      const text = getCellText(item, columns[i].id, helpers);
      const lines = helpers.wrapTextForCell(text, Math.max(1, colWidths[i] - cellPadding * 2), fontSize, pdf);
      const needed = lines.length * lineHeight + cellPadding * 2;
      if (needed > rowHeight) rowHeight = needed;
    }
    return rowHeight;
  });

  // ── Pass 2: render header row ──────────────────────────────────────────────
  helpers.applyContentFont(pdf, headerSample, headerStyle.font ?? 'Helvetica', headerBold ? 'bold' : 'normal', headerFontSize);
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

    pdf.setTextColor(headerTextColor);
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

  // ── Pass 2: render data rows ───────────────────────────────────────────────
  helpers.applyContentFont(pdf, bodySample, cellStyle.font ?? 'Helvetica', cellBold ? 'bold' : 'normal', fontSize);
  pdf.setFontSize(fontSize);

  // Hard clip: never render past element.y + element.height so we never paint
  // over sibling elements below this table (matches renderEquipmentTable).
  const bottomBoundary = (typeof element.height === 'number' && element.height > defaultRowHeight)
    ? y + element.height
    : Infinity;

  let curY = y + headerHeight;
  for (let ri = 0; ri < items.length; ri++) {
    if (curY >= bottomBoundary) break; // remaining rows belong on the next sub-page
    const item = items[ri];
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

      const text = helpers.normalizePdfText(getCellText(item, col.id, helpers));
      const align: 'left' | 'center' | 'right' = col.align ?? 'left';
      const textX = align === 'center'
        ? curX + cw / 2
        : align === 'right'
          ? curX + cw - cellPadding
          : curX + cellPadding;

      pdf.setTextColor(textColor);
      const lines = helpers.wrapTextForCell(text, Math.max(1, cw - cellPadding * 2), fontSize, pdf);
      let lineY = curY + cellPadding + fontSize;
      for (const line of lines) {
        pdf.text(line, textX, lineY, { align, maxWidth: cw - cellPadding * 2 });
        lineY += lineHeight;
      }

      curX += cw;
    }
    curY += rowHeight;
  }
}
