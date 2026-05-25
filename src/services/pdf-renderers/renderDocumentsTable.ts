import type jsPDF from 'jspdf';
import type { DocumentsTableElement } from '../../modules/pdf-template-builder/types';
import type { RendererHelpers } from './rendererHelpers';

/**
 * Renders the documents table element onto a jsPDF document.
 * This function was extracted from PdfTemplateRenderer for maintainability.
 */
export function renderDocumentsTable(
  pdf: jsPDF,
  element: DocumentsTableElement,
  jobData: any,
  slice: { rowStart: number; rowEnd: number } | undefined,
  helpers: RendererHelpers
): void {
  const documents: any[] = jobData?.documents ?? [];
  const items = slice
    ? documents.slice(slice.rowStart, slice.rowEnd)
    : documents;

  if (items.length === 0) return;

  const columns = (element as any).columns ?? [];
  const x = element.x ?? 0;
  const y = element.y ?? 0;
  const width = element.width ?? 100;
  const fontSize = (element as any).fontSize ?? 8;
  const rowHeight = (element as any).rowHeight ?? 8;
  const headerBg = (element as any).headerBackgroundColor ?? '#e5e7eb';
  const colWidth = columns.length > 0 ? width / columns.length : width;

  pdf.setFontSize(fontSize);

  // Draw header row
  let curX = x;
  for (const col of columns) {
    pdf.setFillColor(headerBg);
    pdf.rect(curX, y, colWidth, rowHeight, 'F');
    pdf.setTextColor('#111827');
    pdf.text(helpers.normalizePdfText(col.label ?? ''), curX + 1, y + rowHeight - 2, {
      maxWidth: colWidth - 2,
    });
    curX += colWidth;
  }

  // Draw data rows
  let curY = y + rowHeight;
  for (const doc of items) {
    curX = x;
    for (const col of columns) {
      const raw = doc[col.key] ?? '';
      const text = helpers.normalizePdfText(String(raw));
      pdf.setFillColor('#ffffff');
      pdf.rect(curX, curY, colWidth, rowHeight, 'S');
      pdf.setTextColor('#374151');
      pdf.text(text, curX + 1, curY + rowHeight - 2, { maxWidth: colWidth - 2 });
      curX += colWidth;
    }
    curY += rowHeight;
  }
}
