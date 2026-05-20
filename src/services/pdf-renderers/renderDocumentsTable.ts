/**
 * Documents Table Sub-Renderer
 *
 * Renders a single documents-table element to jsPDF.
 * Extracted from PdfTemplateRenderer to keep element-specific logic
 * in its own file — find and edit documents table rendering here.
 *
 * To change how document index rows look, start here.
 */

import type jsPDF from 'jspdf';
import type { DocumentsTableElement } from '../../modules/pdf-template-builder/types';
import type { DocumentIndexItem, DocumentSource } from '../../types';
import { computeSafeLineHeight } from '../pdfTextLayoutService';
import { formatDateForDisplay } from '../../utils/dateDisplayFormatter';
import type { RendererHelpers } from './rendererHelpers';

/** Format a DocumentSource for display in a PDF cell. */
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

/** Get display text for a single cell in the documents table. */
function getCellText(item: DocumentIndexItem, colId: string, helpers: RendererHelpers): string {
  switch (colId) {
    case 'documentCode':   return item.documentCode || '-';
    case 'type':           return item.type || '-';
    case 'revisionNumber': return item.revisionNumber || '-';
    case 'documentName':   return item.documentName || '-';
    case 'effectiveDate':  return item.effectiveDate ? formatDateForDisplay(item.effectiveDate as any) : '-';
    case 'darNumber':      return item.darNumber || '—';
    case 'source':         return formatSource(item.source, helpers);
    case 'darSource':      return item.darSource ? formatSource(item.darSource, helpers) : '—';
    default:               return '-';
  }
}

export function renderDocumentsTable(
  pdf: jsPDF,
  element: DocumentsTableElement,
  jobData: { documentIndexItems?: DocumentIndexItem[] },
  slice: { rowStart: number; rowEnd: number } | undefined,
  helpers: RendererHelpers
): void {
  const itemsAll: DocumentIndexItem[] = Array.isArray(jobData.documentIndexItems)
    ? jobData.documentIndexItems
    : [];
  const rowStart = slice ? Math.max(0, slice.rowStart) : 0;
  const rowEnd = slice ? Math.max(rowStart, slice.rowEnd) : itemsAll.length;
  const items = itemsAll.slice(rowStart, rowEnd);

  const columns = (element.columns || [])
    .filter((c: any) => c.visible !== false)
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  if (columns.length === 0) return;

  const borderColor = element.borderColor || '#000000';
  const borderWidth = element.borderWidth ?? 1;
  const fontSize = element.fontSize ?? element.cellStyle?.fontSize ?? 9;
  const headerFontSize = element.headerFontSize ?? element.headerStyle?.fontSize ?? 10;
  const headerStyle = element.headerStyle || {};
  const cellStyle = element.cellStyle || {};
  const headerSample = columns.map((c: any) => String(c.label || c.id || '')).join(' ');
  const bodySample = items
    .map((it) => columns.map((c: any) => getCellText(it, c.id, helpers)).join(' '))
    .join(' ');
  const lineHeight = computeSafeLineHeight({ fontSize, text: bodySample });
  const headerLineHeight = computeSafeLineHeight({ fontSize: headerFontSize, text: headerSample });
  const cellPadding = 4;
  const defaultRowHeight = 18;

  let currentY = element.y;
  const startX = element.x;
  const colWidths = columns.map((c: any) => c.width ?? 60);
  const tableContentWidth = colWidths.reduce((a: number, b: number) => a + b, 0);

  const drawCellBorder = (x: number, y: number, w: number, h: number) => {
    pdf.setDrawColor(borderColor);
    pdf.setLineWidth(borderWidth);
    pdf.rect(x, y, w, h);
  };

  const getAlignedX = (x: number, w: number, align: string, text: string): number => {
    const tw = pdf.getTextWidth(text);
    if (align === 'center') return x + (w - tw) / 2;
    if (align === 'right') return x + w - tw - cellPadding;
    return x + cellPadding;
  };

  // ── Header row ───────────────────────────────────────────────────────────────
  helpers.applyContentFont(
    pdf,
    columns.map((c: any) => c.label || c.id).join(' '),
    undefined,
    headerStyle.bold ? 'bold' : 'normal',
    headerFontSize
  );
  let headerHeight = defaultRowHeight;
  const headerLines: string[][] = columns.map((col: any, idx: number) => {
    const cellWidth = colWidths[idx] - cellPadding * 2;
    const lines = helpers.wrapTextForCell(col.label || col.id, cellWidth, headerFontSize, pdf);
    const cellHeight =
      lines.length > 0 ? lines.length * headerLineHeight + cellPadding * 2 : defaultRowHeight;
    headerHeight = Math.max(headerHeight, cellHeight);
    return lines;
  });

  if (headerStyle.backgroundColor) {
    pdf.setFillColor(headerStyle.backgroundColor);
    pdf.rect(startX, currentY, tableContentWidth, headerHeight, 'F');
  }
  let cx = startX;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const w = colWidths[i];
    drawCellBorder(cx, currentY, w, headerHeight);
    pdf.setTextColor(headerStyle.color || '#000000');
    const lines = headerLines[i];
    let ly = currentY + cellPadding + headerFontSize;
    for (const line of lines) {
      pdf.text(line, getAlignedX(cx, w, col.align || 'left', line), ly);
      ly += headerLineHeight;
    }
    cx += w;
  }
  currentY += headerHeight;

  // ── Data rows ────────────────────────────────────────────────────────────────
  helpers.applyContentFont(
    pdf,
    items.map((it) => columns.map((c: any) => getCellText(it, c.id, helpers)).join(' ')).join(' '),
    undefined,
    cellStyle.bold ? 'bold' : 'normal',
    fontSize
  );
  pdf.setTextColor(cellStyle.color || '#000000');

  for (const item of items) {
    const cellTexts: string[][] = columns.map((col: any) => {
      const val = getCellText(item, col.id, helpers);
      return helpers.wrapTextForCell(
        val,
        colWidths[columns.indexOf(col)] - cellPadding * 2,
        fontSize,
        pdf
      );
    });
    let rowHeight = defaultRowHeight;
    for (const lines of cellTexts) {
      rowHeight = Math.max(rowHeight, lines.length * lineHeight + cellPadding * 2);
    }
    cx = startX;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const w = colWidths[i];
      drawCellBorder(cx, currentY, w, rowHeight);
      const lines = cellTexts[i];
      let ly = currentY + cellPadding + fontSize;
      for (const line of lines) {
        pdf.text(line, getAlignedX(cx, w, col.align || 'left', line), ly);
        ly += lineHeight;
      }
      cx += w;
    }
    currentY += rowHeight;
  }

  // ── Outer border ──────────────────────────────────────────────────────────────
  const outerBorderWidth = (element as any).outerBorderWidth ?? Math.max(borderWidth, 1.25);
  pdf.setDrawColor(borderColor);
  pdf.setLineWidth(outerBorderWidth);
  pdf.rect(startX, element.y, tableContentWidth, Math.max(1, currentY - element.y));
}
