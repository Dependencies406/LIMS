/**
 * Training Records Table Sub-Renderer
 *
 * Renders a single training-table element to jsPDF.
 * Data is supplied by staffPdfService as staffData.training.records.
 *
 * Column IDs map directly to TrainingRecord field names:
 *   courseName | trainingFormat | duration | organizer | status | completionDate | remarks
 */

import type jsPDF from 'jspdf';
import type { TrainingTableElement } from '../../modules/pdf-template-builder/types';
import type { TrainingRecord } from '../../types';
import { computeSafeLineHeight } from '../pdfTextLayoutService';
import type { RendererHelpers } from './rendererHelpers';

/** Format a completion date ISO string (YYYY-MM-DD) for display. */
function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Get display text for a cell in the training records table. */
function getCellText(record: TrainingRecord, colId: string): string {
  switch (colId) {
    case 'courseName':     return record.courseName || '—';
    case 'trainingFormat': return record.trainingFormat || '—';
    case 'duration':       return record.duration || '—';
    case 'organizer':      return record.organizer || '—';
    case 'status':         return record.status || '—';
    case 'completionDate': return fmtDate(record.completionDate);
    case 'certificateUrl': return record.certificateUrl ? 'Yes' : '—';
    case 'remarks':        return record.remarks || '—';
    default:               return '—';
  }
}

export function renderTrainingTable(
  pdf: jsPDF,
  element: TrainingTableElement,
  staffData: { training?: { records?: TrainingRecord[] } },
  slice: { rowStart: number; rowEnd: number } | undefined,
  helpers: RendererHelpers,
): void {
  const allRecords: TrainingRecord[] = Array.isArray(staffData.training?.records)
    ? staffData.training!.records
    : [];
  const rowStart = slice ? Math.max(0, slice.rowStart) : 0;
  const rowEnd   = slice ? Math.max(rowStart, slice.rowEnd) : allRecords.length;
  const records  = allRecords.slice(rowStart, rowEnd);

  const columns = (element.columns || [])
    .filter((c: any) => c.visible !== false)
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  if (columns.length === 0) return;

  const borderColor   = element.borderColor  || '#000000';
  const borderWidth   = element.borderWidth  ?? 0.5;
  const fontSize      = element.fontSize     ?? element.cellStyle?.fontSize   ?? 9;
  const headerFontSize = element.headerFontSize ?? element.headerStyle?.fontSize ?? 9;
  const headerStyle   = element.headerStyle  || {};
  const cellStyle     = element.cellStyle    || {};

  const headerSample  = columns.map((c: any) => String(c.label || c.id || '')).join(' ');
  const bodySample    = records
    .map((r) => columns.map((c: any) => getCellText(r, c.id)).join(' '))
    .join(' ');

  const lineHeight       = computeSafeLineHeight({ fontSize, text: bodySample });
  const headerLineHeight = computeSafeLineHeight({ fontSize: headerFontSize, text: headerSample });
  const cellPadding      = 3;
  const defaultRowHeight = 16;

  let currentY = element.y;

  // â”€â”€ Total table width â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const totalColWidth = columns.reduce((sum: number, c: any) => sum + (c.width ?? 60), 0);
  const tableWidth    = element.width ?? totalColWidth;
  const scale         = tableWidth / totalColWidth;

  // â”€â”€ Header row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const headerBgColor = headerStyle.backgroundColor || '#e5e7eb'; // gray-200
  const headerTextColor = headerStyle.color || '#111827';
  const headerBold = headerStyle.bold ?? true;
  const headerHeight = headerLineHeight * headerFontSize * 0.3528 + cellPadding * 2;

  pdf.setFillColor(headerBgColor);
  pdf.rect(element.x, currentY, tableWidth, headerHeight, 'F');
  pdf.setDrawColor(borderColor);
  pdf.setLineWidth(borderWidth);
  pdf.rect(element.x, currentY, tableWidth, headerHeight, 'S');

  let xPos = element.x;
  for (const col of columns) {
    const colWidth = (col.width ?? 60) * scale;

    helpers.applyContentFont(
      pdf,
      col.label || col.id,
      headerStyle.font ?? 'Helvetica',
      headerBold ? 'bold' : 'normal',
      headerFontSize,
    );
    pdf.setTextColor(headerTextColor);
    pdf.text(
      helpers.normalizePdfText(col.label || col.id),
      xPos + cellPadding,
      currentY + cellPadding + headerFontSize * 0.3528,
      { maxWidth: colWidth - cellPadding * 2 },
    );

    // Vertical separator
    pdf.setDrawColor(borderColor);
    pdf.setLineWidth(borderWidth);
    pdf.line(xPos, currentY, xPos, currentY + headerHeight);
    xPos += colWidth;
  }
  // Final right border
  pdf.line(xPos, currentY, xPos, currentY + headerHeight);
  currentY += headerHeight;

  // â”€â”€ Data rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const rowBg       = cellStyle.backgroundColor || '#ffffff';
  const altBg       = '#f9fafb'; // gray-50
  const textColor   = cellStyle.color || '#111827';
  const cellBold    = cellStyle.bold   ?? false;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // Compute row height from wrapping
    let maxLines = 1;
    xPos = element.x;
    for (const col of columns) {
      const colWidth = (col.width ?? 60) * scale;
      const text = getCellText(record, col.id);
      const lines = helpers.wrapTextForCell(
        helpers.normalizePdfText(text),
        colWidth - cellPadding * 2,
        fontSize,
        pdf,
      );
      if (lines.length > maxLines) maxLines = lines.length;
      xPos += colWidth;
    }
    const rowHeight = Math.max(
      defaultRowHeight,
      maxLines * lineHeight * fontSize * 0.3528 + cellPadding * 2,
    );

    // Row background
    const bg = i % 2 === 0 ? rowBg : altBg;
    pdf.setFillColor(bg);
    pdf.rect(element.x, currentY, tableWidth, rowHeight, 'F');
    pdf.setDrawColor(borderColor);
    pdf.setLineWidth(borderWidth);
    pdf.rect(element.x, currentY, tableWidth, rowHeight, 'S');

    xPos = element.x;
    for (const col of columns) {
      const colWidth = (col.width ?? 60) * scale;
      const text = helpers.normalizePdfText(getCellText(record, col.id));

      helpers.applyContentFont(
        pdf,
        text,
        cellStyle.font ?? 'Helvetica',
        cellBold ? 'bold' : 'normal',
        fontSize,
      );
      pdf.setTextColor(textColor);
      const align = col.align ?? 'left';
      const textX =
        align === 'right'  ? xPos + colWidth - cellPadding :
        align === 'center' ? xPos + colWidth / 2           :
        xPos + cellPadding;

      pdf.text(text, textX, currentY + cellPadding + fontSize * 0.3528, {
        maxWidth: colWidth - cellPadding * 2,
        align,
      });

      // Vertical separator
      pdf.setDrawColor(borderColor);
      pdf.setLineWidth(borderWidth);
      pdf.line(xPos, currentY, xPos, currentY + rowHeight);
      xPos += colWidth;
    }
    // Final right border
    pdf.line(xPos, currentY, xPos, currentY + rowHeight);
    currentY += rowHeight;
  }

  // â”€â”€ Empty-state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (records.length === 0) {
    const emptyHeight = defaultRowHeight;
    pdf.setFillColor('#ffffff');
    pdf.rect(element.x, currentY, tableWidth, emptyHeight, 'F');
    pdf.setDrawColor(borderColor);
    pdf.setLineWidth(borderWidth);
    pdf.rect(element.x, currentY, tableWidth, emptyHeight, 'S');
    helpers.applyContentFont(pdf, 'No training records.', 'Helvetica', 'normal', fontSize);
    pdf.setTextColor('#6b7280');
    pdf.text('No training records.', element.x + cellPadding, currentY + cellPadding + fontSize * 0.3528);
  }
}
