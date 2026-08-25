/**
 * rawDataSheetPdf.ts
 *
 * A4 LANDSCAPE PDF of a calibration raw-data sheet (the measurement grid —
 * Cal. Point | Standard | 4 series × 3 columns — does not fit portrait at a
 * readable size). Built with jsPDF + jspdf-autotable; Thai text requires the
 * Sarabun font registered via pdfFontManager BEFORE any text is drawn.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CalibrationRawDataSheet, SheetVoidRecord } from '../../../types';
import { pdfFontManager } from '../../../services/pdfFontManager';
import { SERIES, fmtDate, fmtDateTime, fmtForce, shortId, snapshotForRow } from '../sheetLogic';

const MARGIN = 10;
const BLACK: [number, number, number] = [23, 33, 28];
const GRAY: [number, number, number] = [91, 102, 96];
const RED: [number, number, number] = [179, 55, 62];
const HEAD_FILL: [number, number, number] = [234, 241, 237];

export interface RawDataSheetPdfOptions {
  /** When the sheet has been voided, a prominent cancellation marker is printed. */
  voidInfo?: SheetVoidRecord;
}

/** Build the PDF document for a saved sheet. Exported for testing. */
export async function buildRawDataSheetPdf(
  sheet: CalibrationRawDataSheet,
  options: RawDataSheetPdfOptions = {},
): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Thai text renders as garbage without Sarabun — register before ANY text.
  await pdfFontManager.ensureFontsReadyForPdf(pdf);
  const { family: fontName } = pdfFontManager.applyFont(pdf, {
    textSample: 'บันทึกข้อมูลดิบ',   // force Thai-capable family selection
    fontSize: 10,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = 12;

  // ── Title ──
  pdf.setFont(fontName, 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(...BLACK);
  pdf.text('Calibration Raw Data Sheet', pageWidth / 2, y, { align: 'center' });
  y += 5.5;
  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(...GRAY);
  const subtitle = sheet.kind === 'amendment'
    ? `${sheet.requestNo} · ${sheet.direction} · Amendment of ${shortId(sheet.amends ?? '')} — ${sheet.amendmentReason ?? ''}`
    : `${sheet.requestNo} · ${sheet.direction} · Original record`;
  pdf.text(subtitle, pageWidth / 2, y, { align: 'center' });
  y += 5;

  if (options.voidInfo) {
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...RED);
    pdf.text(
      `ยกเลิก (VOIDED) — ${options.voidInfo.reason} · โดย ${options.voidInfo.recordedByName} · ${fmtDateTime(options.voidInfo.createdAt)}`,
      pageWidth / 2, y, { align: 'center' },
    );
    y += 5;
  }
  y += 1;

  // ── Header blocks (Job / UUC) as a two-column field table ──
  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [[
      { content: 'Job Info.', colSpan: 2 },
      { content: 'Unit Under Calibration', colSpan: 2 },
    ]],
    body: [
      ['Request No.:', sheet.requestNo, 'Name:', sheet.uuc.equipmentName],
      ['Received:', fmtDate(sheet.receivedDate), 'Serial No.:', sheet.uuc.serial ?? '—'],
      ['Cal. Date:', fmtDate(sheet.calibrationDate),
        'Resolution:', `${sheet.uuc.resolution ?? '—'} ${sheet.uuc.readingUnit}`],
      ['Recorded by:', sheet.recordedByName, 'Range / Direction:',
        `${sheet.calibrationRange} · ${sheet.direction}`],
    ],
    styles: { font: fontName, fontSize: 8, textColor: BLACK, cellPadding: 1 },
    headStyles: { font: fontName, fontSize: 8, fontStyle: 'bold', fillColor: HEAD_FILL, textColor: BLACK },
    columnStyles: {
      0: { textColor: GRAY, cellWidth: 28 },
      2: { textColor: GRAY, cellWidth: 32 },
    },
    theme: 'grid',
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;

  // ── Reference standards used (incl. thermo-hygrometer) ──
  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [[
      `Reference Standards used · F = A·R + B·R² + … (unit of standard, converted to ${sheet.uuc.readingUnit})`,
      'Serial', 'Due', 'Coefficients (high → low)', '÷', 'Unit', 'Rows',
    ]],
    body: [
      ...sheet.standards.map((s) => [
        s.code,
        s.serial ?? '—',
        fmtDate(s.dueDate),
        s.coefficients.map((c) => c.toPrecision(6)).join(',  '),
        String(s.divisor),
        s.outputUnit + (s.outputUnit !== sheet.uuc.readingUnit ? ` → ${sheet.uuc.readingUnit}` : ''),
        String(sheet.rows.filter(
          (r) => r.standardEquipmentId === s.equipmentId && r.equationId === s.equationId,
        ).length),
      ]),
      [
        sheet.envStandard.code,
        sheet.envStandard.serial ?? '—',
        fmtDate(sheet.envStandard.dueDate),
        `${sheet.envStandard.name} · ${sheet.envStandard.range ?? '—'}`,
        '', '', 'Env.',
      ],
    ],
    styles: { font: fontName, fontSize: 7.5, textColor: BLACK, cellPadding: 1 },
    headStyles: { font: fontName, fontSize: 7.5, fontStyle: 'bold', fillColor: HEAD_FILL, textColor: BLACK },
    theme: 'grid',
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3.5;

  // ── Environment line ──
  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...GRAY);
  const envText = `Environment (${sheet.envStandard.code}, S/N ${sheet.envStandard.serial ?? '—'}): `
    + sheet.env.map((r, i) => `Round ${i + 1}: ${r.t}°C / ${r.h}%RH`).join(' · ')
    + ` · Machine condition: ${sheet.machineCondition}`;
  pdf.text(envText, MARGIN, y);
  y += 3.5;

  // ── Measurement grid ──
  const unit = sheet.uuc.readingUnit;
  const dp = sheet.decimalPlaces;
  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [
      [
        { content: `Cal. Point\n${unit}`, rowSpan: 2 },
        { content: 'Standard', rowSpan: 2 },
        ...SERIES.map((s) => ({ content: s.label, colSpan: 3 })),
      ],
      SERIES.flatMap(() => ['UUC', 'STD-Signal\nmV/V', `STD-Force\n${unit}`]),
    ],
    body: sheet.rows.map((row) => {
      const snap = snapshotForRow(sheet, row);
      return [
        row.calPoint.toLocaleString('en-US'),
        snap?.code ?? '—',
        ...SERIES.flatMap(({ key }) => {
          const cell = row.cells[key];
          return [
            cell.uuc === null ? '-' : fmtForce(cell.uuc, dp),
            cell.sig === null ? '-' : String(cell.sig),
            fmtForce(cell.force, dp),
          ];
        }),
      ];
    }),
    styles: {
      font: fontName, fontSize: 7, textColor: BLACK,
      cellPadding: 0.8, halign: 'center', valign: 'middle',
    },
    headStyles: { font: fontName, fontSize: 7, fontStyle: 'bold', fillColor: HEAD_FILL, textColor: BLACK },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'left' } },
    theme: 'grid',
  });
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ── Signature row ──
  const pageHeight = pdf.internal.pageSize.getHeight();
  let signY = y + 16;
  if (signY > pageHeight - 18) {
    pdf.addPage();
    signY = 30;
  }
  pdf.setFontSize(8);
  pdf.setTextColor(...GRAY);
  const signWidth = 60;
  const positions = [MARGIN + 10, pageWidth / 2 - signWidth / 2, pageWidth - MARGIN - signWidth - 10];
  const labels = [`Recorded by: ${sheet.recordedByName}`, 'Reviewed by', 'Date'];
  positions.forEach((x, i) => {
    pdf.setDrawColor(...GRAY);
    pdf.line(x, signY, x + signWidth, signY);
    pdf.text(labels[i], x + signWidth / 2, signY + 4, { align: 'center' });
  });

  // ── Footer on every page ──
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(7);
    pdf.setTextColor(...GRAY);
    pdf.text(
      `Record ${sheet.id} · saved ${fmtDateTime(sheet.createdAt)} · LIMS Data Recorder`,
      MARGIN, pageHeight - 6,
    );
    pdf.text(`หน้า ${page} / ${pageCount}`, pageWidth - MARGIN, pageHeight - 6, { align: 'right' });
  }

  return pdf;
}

export function rawDataSheetPdfFileName(sheet: CalibrationRawDataSheet): string {
  return `raw-data-${sheet.requestNo}-${shortId(sheet.id).slice(1)}.pdf`;
}

/** Generate the PDF and return a blob URL for in-app preview (caller revokes it). */
export async function buildRawDataSheetPdfBlobUrl(
  sheet: CalibrationRawDataSheet,
  options: RawDataSheetPdfOptions = {},
): Promise<string> {
  const pdf = await buildRawDataSheetPdf(sheet, options);
  return pdf.output('bloburl').toString();
}

/** Generate and download the PDF for a sheet. */
export async function downloadRawDataSheetPdf(
  sheet: CalibrationRawDataSheet,
  options: RawDataSheetPdfOptions = {},
): Promise<void> {
  const pdf = await buildRawDataSheetPdf(sheet, options);
  pdf.save(rawDataSheetPdfFileName(sheet));
}
