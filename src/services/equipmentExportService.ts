// @ts-nocheck
/**
 * Equipment Export Service
 *
 * Produces fixed-layout ISO evidence documents for the Equipment Control module.
 * All layouts are plain / clean — no filled backgrounds, ISO form header style.
 * Thai text is rendered correctly via the embedded Sarabun font.
 *
 * Documents:
 *   generateEquipmentDatasheetBytes()  → LAB-FM-QP-05-005  Equipment Control Record (A4 portrait)
 *   generateUsageLogReportBytes()      → LAB-FM-QP-05-006  Equipment Usage Log Report (A4 landscape)
 *
 * Form metadata (name, revision, effective date) is resolved at generation time
 * from the Documents module (document_index collection) using the form code.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getCompanyInfo } from './companyInfoService';
import { documentIndexService } from './documentIndexService';
import { registerThaiFont } from './thaiPdfFontService';
import type { EquipmentRecord, UsageLog, CalibrationEvent } from '../types';
import { equipmentService } from './equipmentControlService';

// ─── Text colours (no fill colours — clean plain layout) ─────────────────────

const BLACK    = [0, 0, 0]       as [number, number, number];
const GRAY_600 = [75, 85, 99]    as [number, number, number];
const GRAY_400 = [156, 163, 175] as [number, number, number];
const GREEN    = [22, 163, 74]   as [number, number, number];
const RED      = [220, 38, 38]   as [number, number, number];
const AMBER    = [217, 119, 6]   as [number, number, number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | Date | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(d?: string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtBool(v?: boolean): string {
  return v ? 'Yes' : 'No';
}

async function loadLogoBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── Document index lookup ────────────────────────────────────────────────────

interface FormMeta {
  formName: string;
  revisionNumber: string;
  effectiveDate: string;
}

async function lookupFormMeta(docCode: string): Promise<FormMeta> {
  try {
    const docs = await documentIndexService.list();
    const found = docs.find((d) => d.documentCode === docCode);
    if (found) {
      return {
        formName: found.documentName,
        revisionNumber: found.revisionNumber,
        effectiveDate: fmtDate(found.effectiveDate),
      };
    }
  } catch { /* fall through to defaults */ }
  return { formName: '', revisionNumber: '', effectiveDate: '' };
}

// ─── ISO form page header ─────────────────────────────────────────────────────
//
//  Plain two-column bordered box (no fills):
//
//  ┌─────────────────────────────┬──────────────────────────────┐
//  │  [Logo]  Company Name       │  Form Name:   <name>         │
//  │          Address · Contact  │  Form No:     <code>         │
//  │                             │  Revision:    Rev. 01        │
//  │                             │  Eff. Date:   dd mmm yyyy    │
//  │                             │  Page:        N of M         │
//  └─────────────────────────────┴──────────────────────────────┘
//

interface PageFrameOptions {
  pdf: jsPDF;
  fontName: string;
  companyName: string;
  companyAddress: string;
  companyContact: string;
  logoBase64: string | null;
  formMeta: FormMeta;
  docCode: string;
  landscape: boolean;
}

/**
 * Draws the ISO form page header and footer.
 *
 * The left column (company info) uses splitTextToSize so long addresses/names
 * wrap cleanly and never overflow into the right column or beyond the border.
 * The header box height is computed dynamically from the actual wrapped content
 * so no text is ever clipped or hidden.
 *
 * Returns the computed header height (mm) so callers can position body content
 * at `margin + headerH + gap` regardless of how tall the header turns out to be.
 */
function drawPageFrame(opts: PageFrameOptions, pageNum: number, totalPages: number): number {
  const { pdf, fontName, companyName, companyAddress, companyContact,
          logoBase64, formMeta, docCode, landscape } = opts;
  const W = landscape ? 297 : 210;
  const H = landscape ? 210 : 297;
  const margin = 14;
  const divX = W * 0.68;            // vertical divider at 68 % — larger company area, smaller form-info column

  // ── Geometry constants ──────────────────────────────────────────────────────
  const LOGO_W = 26;
  const LOGO_H = 18;
  const LOGO_GAP = 4;               // gap between logo right edge and text
  const LEFT_PAD = 3;               // gap from left border to logo/text
  const RIGHT_GAP = 3;              // gap from text right edge to divider
  const TOP_PAD = 5;                // first baseline from top of header box
  const BOT_PAD = 4;                // space below last text line inside box
  const NAME_LINE_H = 5.0;          // baseline-to-baseline for company name (10.5 pt)
  const SMALL_LINE_H = 4.5;         // baseline-to-baseline for address/contact (8.5 pt)
  const RIGHT_ROW_H = 4.2;          // row height in form-info column (smaller right column)
  const RIGHT_ROWS = 5;             // Form Name / Form No / Revision / Eff. Date / Page
  const MIN_HEADER_H = 32;          // floor so the box never looks too cramped

  // ── Pre-wrap left-column text ───────────────────────────────────────────────
  const textStartX = margin + LEFT_PAD + (logoBase64 ? LOGO_W + LOGO_GAP : 0);
  const textAvailW = divX - textStartX - RIGHT_GAP; // must not exceed this

  pdf.setFont(fontName, 'bold');
  pdf.setFontSize(10.5);
  const nameLines: string[] = pdf.splitTextToSize(companyName || '', textAvailW);

  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(8.5);
  const addrLines: string[]    = companyAddress ? pdf.splitTextToSize(companyAddress, textAvailW)    : [];
  const contactLines: string[] = companyContact ? pdf.splitTextToSize(companyContact, textAvailW) : [];

  // ── Pre-wrap right-column values (needed for accurate header height) ─────────
  const rx     = divX + 3;
  const labelW = 20;
  const valueX = rx + labelW;
  const valueW = (W - margin) - valueX - 2;

  const formRowDefs: [string, string][] = [
    ['Form Name:', formMeta.formName || '—'],
    ['Form No:',   docCode],
    ['Revision:',  formMeta.revisionNumber ? `Rev. ${formMeta.revisionNumber}` : '—'],
    ['Eff. Date:', formMeta.effectiveDate || '—'],
    ['Page:',      `${pageNum} of ${totalPages}`],
  ];

  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(7.5);
  const formRowWrapped: string[][] = formRowDefs.map(([, val]) =>
    pdf.splitTextToSize(val, valueW)
  );
  const totalRightLines = formRowWrapped.reduce((s, lines) => s + lines.length, 0);

  // ── Calculate header height from content ────────────────────────────────────
  const leftColH  = TOP_PAD
    + nameLines.length * NAME_LINE_H
    + (addrLines.length    > 0 ? addrLines.length    * SMALL_LINE_H + 1 : 0)
    + (contactLines.length > 0 ? contactLines.length * SMALL_LINE_H + 1 : 0)
    + BOT_PAD;
  const rightColH = TOP_PAD + totalRightLines * RIGHT_ROW_H + BOT_PAD;
  const headerH   = Math.max(MIN_HEADER_H, Math.ceil(Math.max(leftColH, rightColH)));

  // ── Draw outer border and divider ───────────────────────────────────────────
  pdf.setDrawColor(...BLACK);
  pdf.setLineWidth(0.3);
  pdf.rect(margin, margin, W - margin * 2, headerH);
  pdf.line(divX, margin, divX, margin + headerH);

  // ── Logo (top-aligned in header) ────────────────────────────────────────────
  if (logoBase64) {
    try {
      const logoY = margin + TOP_PAD - 2;   // top-aligned, small inset from box top
      pdf.addImage(logoBase64, 'PNG', margin + LEFT_PAD, logoY, LOGO_W, LOGO_H, '', 'FAST');
    } catch { /* skip broken logo */ }
  }

  // ── Left column: company name then address then contact ─────────────────────
  let ly = margin + TOP_PAD;

  pdf.setFont(fontName, 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(...BLACK);
  nameLines.forEach((line) => {
    pdf.text(line, textStartX, ly);
    ly += NAME_LINE_H;
  });

  if (addrLines.length > 0) {
    ly += 1; // small gap after company name
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...BLACK);
    addrLines.forEach((line) => {
      pdf.text(line, textStartX, ly);
      ly += SMALL_LINE_H;
    });
  }

  if (contactLines.length > 0) {
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...BLACK);
    contactLines.forEach((line) => {
      pdf.text(line, textStartX, ly);
      ly += SMALL_LINE_H;
    });
  }

  // ── Right column: form info (values wrap to multiple lines as needed) ────────
  let ry = margin + TOP_PAD;

  formRowDefs.forEach(([label], i) => {
    const lines = formRowWrapped[i];

    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...BLACK);
    pdf.text(label, rx, ry);

    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...BLACK);
    lines.forEach((line, li) => {
      pdf.text(line, valueX, ry + li * RIGHT_ROW_H);
    });

    ry += lines.length * RIGHT_ROW_H;
  });

  // ── Footer: thin rule + page stamp ──────────────────────────────────────────
  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...BLACK);
  pdf.setDrawColor(...BLACK);
  pdf.setLineWidth(0.2);
  pdf.line(margin, H - 9, W - margin, H - 9);
  pdf.text(`Generated: ${new Date().toLocaleString('en-US')}`, margin, H - 5);
  pdf.text(`Page ${pageNum} of ${totalPages}`, W - margin, H - 5, { align: 'right' });

  // Reset draw state
  pdf.setTextColor(...BLACK);
  pdf.setDrawColor(...BLACK);
  pdf.setLineWidth(0.3);

  return headerH; // caller positions body content at margin + headerH + gap
}

// ─── Document 1: Equipment Control Record ────────────────────────────────────

/**
 * LAB-FM-QP-05-005  Equipment Control Record
 * A4 portrait — plain clean layout, Thai text supported, metadata from document index.
 */
export async function generateEquipmentDatasheetBytes(
  equipment: EquipmentRecord,
  calibrationEvents: CalibrationEvent[] = [],
  docCode = 'LAB-FM-QP-05-005',
  usageLogs: UsageLog[] = []
): Promise<ArrayBuffer> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Load Thai font first — must happen before any text rendering
  const fontName = await registerThaiFont(pdf);

  const [company, formMeta] = await Promise.all([
    getCompanyInfo(),
    lookupFormMeta(docCode),
  ]);

  const logoBase64 = company?.logoUrl ? await loadLogoBase64(company.logoUrl) : null;

  const companyName = company?.companyName || 'Laboratory';
  const companyAddress = [
    company?.address?.street,
    company?.address?.city,
    company?.address?.state,
    company?.address?.postalCode,
  ].filter(Boolean).join(', ');
  const companyContact = [
    company?.contactInfo?.phone ? `Tel: ${company.contactInfo.phone}` : '',
    company?.contactInfo?.email ? `Email: ${company.contactInfo.email}` : '',
  ].filter(Boolean).join('  ');

  const W = 210;
  const margin = 14;
  const contentW = W - margin * 2;

  const frameOpts: PageFrameOptions = {
    pdf, fontName, companyName, companyAddress, companyContact, logoBase64,
    formMeta, docCode, landscape: false,
  };

  const headerH = drawPageFrame(frameOpts, 1, 1);
  // Content starts just below the header — automatically adapts to header height
  let y = margin + headerH + 5;

  // ── Page geometry helpers ─────────────────────────────────────────────────
  const H            = 297;                    // A4 portrait height (mm)
  const BODY_BOTTOM  = H - margin - 12;        // last usable Y before footer zone
  const PAGE_TOP     = margin + headerH + 5;   // body start on continuation pages
  // Margin used by autoTable on continuation pages — must clear the header
  const autoTableTopMargin = PAGE_TOP;

  /** Add a new page, draw header/footer placeholder, reset y to body top */
  function newPage() {
    pdf.addPage();
    const pageNum = (pdf as any).internal.getNumberOfPages();
    drawPageFrame(frameOpts, pageNum, 1); // page count fixed in second pass
    y = PAGE_TOP;
  }

  /** Break to next page if neededH mm won't fit on the current page */
  function checkPageBreak(neededH: number) {
    if (y + neededH > BODY_BOTTOM) newPage();
  }

  // ── Document title ────────────────────────────────────────────────────────
  pdf.setFont(fontName, 'bold');
  pdf.setFontSize(13.5);
  pdf.setTextColor(...BLACK);
  pdf.text('EQUIPMENT CONTROL RECORD', W / 2, y, { align: 'center' });
  y += 5;
  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(...BLACK);
  const idLines = pdf.splitTextToSize(`Equipment ID: ${equipment.id}`, contentW);
  idLines.forEach((line: string, i: number) => {
    pdf.text(line, W / 2, y + i * 4.5, { align: 'center' });
  });
  y += idLines.length * 4.5;
  pdf.setDrawColor(...BLACK);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, margin + contentW, y);
  y += 6;

  // ── Section heading ───────────────────────────────────────────────────────
  function sectionHeading(title: string) {
    checkPageBreak(18); // need room for heading + at least one row below it
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(...BLACK);
    pdf.text(title, margin, y + 4);
    pdf.setDrawColor(...BLACK);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y + 6, margin + contentW, y + 6);
    y += 9;
  }

  // ── Field rows (with automatic text wrapping and page-break detection) ───
  function fieldTable(rows: [string, string, string?, string?][]) {
    const colW   = contentW / 2; // half-width per column pair
    const labelW = 38;            // label column width (mm)
    const LINE_H = 4.5;           // baseline-to-baseline for wrapped lines (mm)
    const TOP_PAD = 4.5;          // first-line baseline from top of row (mm)
    const BOT_PAD = 2;            // space below last line (mm)
    const MIN_ROW_H = 7;          // minimum row height for single-line rows (mm)
    const GAP = 3;                 // gap before column/page edge (mm)

    // Value column available widths
    const twoColValueW = colW - labelW - GAP;
    const oneColValueW = contentW - labelW - GAP;

    rows.forEach((row) => {
      const hasRight = row[2] !== undefined && row[2] !== '';
      const leftW = hasRight ? twoColValueW : oneColValueW;

      // ── Pre-calculate wrapped lines so we know the row height ──
      pdf.setFont(fontName, 'normal');
      pdf.setFontSize(9.5);
      const leftLines: string[]  = pdf.splitTextToSize(row[1] || '—', leftW);
      const rightLines: string[] = hasRight
        ? pdf.splitTextToSize(row[3] || '—', twoColValueW)
        : [];

      const numLines = Math.max(leftLines.length, rightLines.length, 1);
      const rowH = Math.max(MIN_ROW_H, TOP_PAD + (numLines - 1) * LINE_H + BOT_PAD);

      // ── Page break before this row if it won't fit ──
      checkPageBreak(rowH);

      // ── Left label ──
      pdf.setFont(fontName, 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...BLACK);
      pdf.text(row[0], margin, y + TOP_PAD);

      // ── Left value (wrapped) ──
      pdf.setFont(fontName, 'normal');
      pdf.setFontSize(9.5);
      pdf.setTextColor(...BLACK);
      leftLines.forEach((line, i) => {
        pdf.text(line, margin + labelW, y + TOP_PAD + i * LINE_H);
      });

      if (hasRight) {
        // ── Right label ──
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(...BLACK);
        pdf.text(row[2]!, margin + colW, y + TOP_PAD);

        // ── Right value (wrapped) ──
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(9.5);
        pdf.setTextColor(...BLACK);
        rightLines.forEach((line, i) => {
          pdf.text(line, margin + colW + labelW, y + TOP_PAD + i * LINE_H);
        });
      }

      // ── Bottom divider ──
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.2);
      pdf.line(margin, y + rowH, margin + contentW, y + rowH);
      y += rowH;
    });
    y += 3;
  }

  // ── 1. Identity & Classification ──
  sectionHeading('1. IDENTITY & CLASSIFICATION');
  fieldTable([
    ['Equipment Name', equipment.name,                       'Category',     equipment.category],
    ['Manufacturer',   equipment.manufacturer,               'Model',        equipment.model],
    ['Serial Number',  equipment.serialNumber,               'Status',       equipmentService.getStatusLabel(equipment.status)],
    ['Capacity',       equipment.capacity      || '—',       'Usage Range',  equipment.usageRange   || '—'],
    ['Usage Criteria', equipment.usageCriteria || '—',       '',             ''],
  ]);

  // ── 2. Location & Custodianship ──
  sectionHeading('2. LOCATION & CUSTODIANSHIP');
  fieldTable([
    ['Location',         equipment.location,                                          'Registration Date', fmtDate(equipment.registrationDate)],
    ['Custodian',        equipment.custodianName || equipment.custodian,             'External Provider', fmtBool(equipment.externalProvider)],
    ['Authorized Users', equipment.authorizedUsers?.length
                           ? `${equipment.authorizedUsers.length} user(s)` : '—',  '',                  ''],
  ]);

  // ── 3. Calibration Information ──
  sectionHeading('3. CALIBRATION INFORMATION');
  fieldTable([
    ['Requires Cal.',   fmtBool(equipment.requiresCalibration),  'Interval',      equipment.calibrationInterval ? `${equipment.calibrationInterval} months` : '—'],
    ['Procedure',       equipment.calibrationProcedure || '—',   'Ext. Provider', fmtBool(equipment.externalProvider)],
    ['Last Calibrated', fmtDate(equipment.lastCalibrationDate),  'Next Due',      fmtDate(equipment.nextCalibrationDate)],
  ]);

  // ── 4. Calibration History ──
  sectionHeading('4. CALIBRATION HISTORY');
  if (calibrationEvents.length > 0) {
    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin, top: autoTableTopMargin },
      showHead: 'everyPage',
      head: [['Sent Date', 'Cal. Date', 'Received', 'Lab / Provider', 'Certificate No.', 'Result', 'Notes']],
      body: calibrationEvents.map((ev) => [
        fmtDateShort(ev.sentDate),
        fmtDateShort(ev.calibrationDate),
        fmtDateShort(ev.receivedDate),
        ev.calibrationLab,
        ev.certificateNumber || '—',
        ev.result ? ev.result.toUpperCase() : '—',
        ev.notes || '',
      ]),
      headStyles: {
        fillColor: [255, 255, 255] as [number, number, number],
        textColor: BLACK,
        fontStyle: 'bold',
        font: fontName,
        fontSize: 9,
        lineColor: BLACK,
        lineWidth: 0.3,
      },
      bodyStyles: {
        font: fontName,
        fontSize: 9,
        textColor: BLACK,
        lineColor: BLACK,
        lineWidth: 0.2,
        overflow: 'linebreak',
        cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
      },
      alternateRowStyles: { fillColor: [255, 255, 255] as [number, number, number] },
      tableLineColor: BLACK,
      tableLineWidth: 0.3,
      columnStyles: {
        0: { cellWidth: 20 },            // Sent Date
        1: { cellWidth: 20 },            // Cal. Date
        2: { cellWidth: 20 },            // Received
        3: { cellWidth: 36 },            // Lab / Provider
        4: { cellWidth: 28 },            // Certificate No.
        5: { cellWidth: 14, halign: 'center' }, // Result
        6: { cellWidth: 'auto' },        // Notes
      },
      didParseCell(_data) {
        // All text stays plain black — no colour coding
      },
      didDrawPage(data) {
        // Redraw header/footer on every page the table spans
        drawPageFrame(frameOpts, data.pageNumber, 1); // page count fixed in second pass
      },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;
  } else {
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(...BLACK);
    pdf.text('No calibration events recorded.', margin, y + 4);
    y += 10;
  }

  // ── 5. Usage Logs ──
  sectionHeading('5. USAGE LOGS');
  if (usageLogs.length > 0) {
    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin, top: autoTableTopMargin },
      showHead: 'everyPage',
      head: [['Date', 'Operator', 'Visual', 'Functional', 'Cal. Docs', 'Condition', 'Overall', 'Notes / Action']],
      body: usageLogs.map((log) => [
        fmtDateShort(log.date),
        log.operatorName || log.operator || '—',
        log.visualInspection === 'pass' ? 'Pass' : 'Fail',
        log.functionalCheck  === 'pass' ? 'Pass' : 'Fail',
        log.documentCheck === 'valid' ? 'Valid' : log.documentCheck === 'expired' ? 'Expired' : 'N/A',
        log.equipmentCondition === 'normal' ? 'Normal' : 'Abnormal',
        log.overallResult === 'pass' ? 'Pass' : 'Fail',
        [log.abnormalDetails, log.actionTaken, log.notes].filter(Boolean).join(' | ') || '—',
      ]),
      headStyles: {
        fillColor: [255, 255, 255] as [number, number, number],
        textColor: BLACK,
        fontStyle: 'bold',
        font: fontName,
        fontSize: 9,
        lineColor: BLACK,
        lineWidth: 0.3,
      },
      bodyStyles: {
        font: fontName,
        fontSize: 9,
        textColor: BLACK,
        lineColor: BLACK,
        lineWidth: 0.2,
        overflow: 'linebreak',
        cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
      },
      alternateRowStyles: { fillColor: [255, 255, 255] as [number, number, number] },
      tableLineColor: BLACK,
      tableLineWidth: 0.3,
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 28 },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 18, halign: 'center' },
        6: { cellWidth: 14, halign: 'center' },
        7: { cellWidth: 'auto' },
      },
      didDrawPage(data) {
        drawPageFrame(frameOpts, data.pageNumber, 1);
      },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;
  } else {
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(...BLACK);
    pdf.text('No usage logs recorded.', margin, y + 4);
    y += 10;
  }

  // ── 6. Notes ──
  if (equipment.notes) {
    sectionHeading('6. NOTES');
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(...BLACK);
    const noteLines: string[] = pdf.splitTextToSize(equipment.notes, contentW - 4);
    noteLines.forEach((line: string, i: number) => {
      checkPageBreak(4.5); // one line at a time
      pdf.text(line, margin, y + 4);
      y += 4.5;
    });
    y += 2;
  }

  // ── Two-pass: rewrite headers + footers with correct total page count ─────
  const totalPages = (pdf as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    // White-out the old header and footer areas drawn with placeholder "1"
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, W, margin + headerH + 1, 'F');       // header zone
    pdf.rect(0, H - 13, W, 13, 'F');                     // footer zone
    // Redraw with correct page number
    drawPageFrame(frameOpts, p, totalPages);
  }

  return pdf.output('arraybuffer');
}

// ─── Document 2: Equipment Usage Log Report ───────────────────────────────────

/**
 * Equipment Usage Log Report — A4 landscape, plain clean layout, Thai text supported.
 */
export async function generateUsageLogReportBytes(
  equipment: EquipmentRecord,
  logs: UsageLog[],
  dateFrom?: string,
  dateTo?: string,
  docCode = 'LAB-FM-QP-05-006'
): Promise<ArrayBuffer> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Load Thai font first
  const fontName = await registerThaiFont(pdf);

  const [company, formMeta] = await Promise.all([
    getCompanyInfo(),
    lookupFormMeta(docCode),
  ]);

  const logoBase64 = company?.logoUrl ? await loadLogoBase64(company.logoUrl) : null;

  const companyName = company?.companyName || 'Laboratory';
  const companyAddress = [
    company?.address?.street,
    company?.address?.city,
    company?.address?.state,
    company?.address?.postalCode,
  ].filter(Boolean).join(', ');
  const companyContact = [
    company?.contactInfo?.phone ? `Tel: ${company.contactInfo.phone}` : '',
    company?.contactInfo?.email ? `Email: ${company.contactInfo.email}` : '',
  ].filter(Boolean).join('  ');

  const W = 297;
  const margin = 14;
  const contentW = W - margin * 2;

  const total = logs.length;
  const passCount = logs.filter((l) => l.overallResult === 'pass').length;
  const failCount = total - passCount;
  const passRate = total ? Math.round((passCount / total) * 100) : 0;

  const frameOpts: PageFrameOptions = {
    pdf, fontName, companyName, companyAddress, companyContact, logoBase64,
    formMeta, docCode, landscape: true,
  };

  const headerH = drawPageFrame(frameOpts, 1, 1);
  // Content starts just below the header — automatically adapts to header height
  let y = margin + headerH + 5;

  // ── Document title ────────────────────────────────────────────────────────
  pdf.setFont(fontName, 'bold');
  pdf.setFontSize(13.5);
  pdf.setTextColor(...BLACK);
  pdf.text('EQUIPMENT USAGE LOG', W / 2, y, { align: 'center' });
  y += 5;
  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(...BLACK);
  const subtitleLines = pdf.splitTextToSize(`${equipment.id}  ·  ${equipment.name}`, contentW);
  subtitleLines.forEach((line: string, i: number) => {
    pdf.text(line, W / 2, y + i * 4.5, { align: 'center' });
  });
  y += subtitleLines.length * 4.5;
  pdf.setDrawColor(...BLACK);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, margin + contentW, y);
  y += 5;

  // ── Equipment summary (inline, text wrapped within each column) ─────────
  const summaryItems: [string, string][] = [
    ['Serial No.', equipment.serialNumber],
    ['Category',   equipment.category],
    ['Location',   equipment.location],
    ['Custodian',  equipment.custodianName || equipment.custodian],
  ];
  const itemW = contentW / summaryItems.length;
  const summaryValueW = itemW - 3; // leave 3 mm gap before next column
  // Pre-calculate max wrapped lines to set the strip height
  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(9.5);
  const summaryLineCount = summaryItems.reduce((max, [, val]) => {
    return Math.max(max, pdf.splitTextToSize(val || '—', summaryValueW).length);
  }, 1);
  const summaryH = 4 + summaryLineCount * 4.5; // label(3) + gap(1) + lines

  summaryItems.forEach(([label, val], i) => {
    const sx = margin + i * itemW;
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...BLACK);
    pdf.text(label, sx, y + 3);
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(...BLACK);
    const lines: string[] = pdf.splitTextToSize(val || '—', summaryValueW);
    lines.forEach((line, li) => {
      pdf.text(line, sx, y + 8 + li * 4.5);
    });
  });
  y += summaryH + 3; // dynamic: grows if values wrap to 2+ lines

  pdf.setDrawColor(...BLACK);
  pdf.setLineWidth(0.2);
  pdf.line(margin, y, margin + contentW, y);
  y += 5;

  // ── Stats row ─────────────────────────────────────────────────────────────
  const statBlocks: [string, string][] = [
    ['Total Sessions', String(total)],
    ['Pass',           String(passCount)],
    ['Fail',           String(failCount)],
    ['Pass Rate',      `${passRate}%`],
    ['Period', dateFrom || dateTo
      ? `${fmtDateShort(dateFrom)} – ${fmtDateShort(dateTo)}`
      : 'All dates'],
  ];
  const blockW = contentW / statBlocks.length;
  const blockInnerW = blockW - 4; // leave 2 mm padding each side

  // Pre-wrap all values and labels so we can compute a uniform row height
  pdf.setFont(fontName, 'bold');
  pdf.setFontSize(12.5);
  const statValueLines = statBlocks.map(([, val]) =>
    pdf.splitTextToSize(val, blockInnerW) as string[]
  );
  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(8.5);
  const statLabelLines = statBlocks.map(([lbl]) =>
    pdf.splitTextToSize(lbl, blockInnerW) as string[]
  );
  const maxValLines   = Math.max(...statValueLines.map(l => l.length));
  const maxLabelLines = Math.max(...statLabelLines.map(l => l.length));
  const VALUE_LINE_H  = 5.5;
  const LABEL_LINE_H  = 4.0;
  const statsH = 4 + maxValLines * VALUE_LINE_H + maxLabelLines * LABEL_LINE_H;

  statBlocks.forEach(([, ], i) => {
    const bx = margin + i * blockW + blockW / 2;

    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(12.5);
    pdf.setTextColor(...BLACK);
    statValueLines[i].forEach((line, li) => {
      pdf.text(line, bx, y + 5 + li * VALUE_LINE_H, { align: 'center' });
    });

    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...BLACK);
    statLabelLines[i].forEach((line, li) => {
      pdf.text(line, bx, y + 5 + maxValLines * VALUE_LINE_H + li * LABEL_LINE_H, { align: 'center' });
    });
  });
  y += statsH;

  // ── Usage log table ───────────────────────────────────────────────────────
  autoTable(pdf, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [[
      'Date', 'Operator', 'Linked Job',
      'Visual', 'Functional', 'Cal. Docs',
      'Ref. Values', 'Condition', 'Overall',
      'Abnormal Details / Action', 'Notes',
    ]],
    body: logs.map((log) => [
      fmtDateShort(log.date),
      log.operatorName || log.operator || '—',
      log.linkedJobRef || '—',
      log.visualInspection === 'pass' ? 'Pass' : 'Fail',
      log.functionalCheck  === 'pass' ? 'Pass' : 'Fail',
      log.documentCheck === 'valid'   ? 'Valid'
        : log.documentCheck === 'expired' ? 'Expired' : 'N/A',
      log.refValuesVerified ? 'Yes' : '—',
      log.equipmentCondition === 'normal' ? 'Normal' : 'Abnormal',
      log.overallResult.toUpperCase(),
      [log.abnormalDetails, log.actionTaken ? `Action: ${log.actionTaken}` : '']
        .filter(Boolean).join(' · ') || '—',
      log.notes || '—',
    ]),
    headStyles: {
      fillColor: [255, 255, 255] as [number, number, number],
      textColor: BLACK,
      fontStyle: 'bold',
      font: fontName,
      fontSize: 8.5,
      lineColor: BLACK,
      lineWidth: 0.3,
      halign: 'center',
    },
    bodyStyles: {
      font: fontName,
      fontSize: 8.5,
      textColor: BLACK,
      lineColor: BLACK,
      lineWidth: 0.2,
      overflow: 'linebreak',
      valign: 'top',
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
    },
    alternateRowStyles: { fillColor: [255, 255, 255] as [number, number, number] },
    tableLineColor: BLACK,
    tableLineWidth: 0.3,
    columnStyles: {
      0:  { cellWidth: 20, halign: 'center' },
      1:  { cellWidth: 28 },
      2:  { cellWidth: 22, halign: 'center' },
      3:  { cellWidth: 17, halign: 'center' },
      4:  { cellWidth: 20, halign: 'center' },
      5:  { cellWidth: 17, halign: 'center' },
      6:  { cellWidth: 18, halign: 'center' },
      7:  { cellWidth: 20, halign: 'center' },
      8:  { cellWidth: 17, halign: 'center', fontStyle: 'bold' },
      9:  { cellWidth: 'auto' },
      10: { cellWidth: 26 },
    },
    didParseCell(_data) {
      // All text stays plain black — no colour coding
    },
    didDrawPage(data) {
      if (data.pageNumber > 1) {
        drawPageFrame(frameOpts, data.pageNumber, 1);
      }
    },
    showHead: 'everyPage',
  });

  // Rewrite page footers now that we know the actual total page count
  const totalPagesActual = (pdf as any).internal.getNumberOfPages();
  const H = 210; // landscape A4 height
  for (let p = 1; p <= totalPagesActual; p++) {
    pdf.setPage(p);
    // Erase old placeholder footer
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, H - 12, W, 12, 'F');
    // Draw correct footer
    pdf.setDrawColor(...BLACK);
    pdf.setLineWidth(0.2);
    pdf.line(margin, H - 9, W - margin, H - 9);
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...BLACK);
    pdf.text(`Generated: ${new Date().toLocaleString('en-US')}`, margin, H - 5);
    pdf.text(`Page ${p} of ${totalPagesActual}`, W - margin, H - 5, { align: 'right' });
  }

  return pdf.output('arraybuffer');
}

// ─── Document 3: Equipment Register (ทะเบียนเครื่องมือวัด) ──────────────────

/**
 * LAB-FM-QP-05-003  ทะเบียนเครื่องมือวัด  (Equipment Register)
 * A4 landscape — lists all registered equipment in a single master table.
 * Thai text is supported via the embedded Sarabun font.
 */
export async function generateEquipmentRegisterBytes(
  equipmentList: EquipmentRecord[],
  docCode = 'LAB-FM-QP-05-003'
): Promise<ArrayBuffer> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Load Thai font first
  const fontName = await registerThaiFont(pdf);

  const [company, formMeta] = await Promise.all([
    getCompanyInfo(),
    lookupFormMeta(docCode),
  ]);

  const logoBase64    = company?.logoUrl ? await loadLogoBase64(company.logoUrl) : null;
  const companyName   = company?.companyName || 'Laboratory';
  const companyAddress = [
    company?.address?.street,
    company?.address?.city,
    company?.address?.state,
    company?.address?.postalCode,
  ].filter(Boolean).join(', ');
  const companyContact = [
    company?.contactInfo?.phone ? `Tel: ${company.contactInfo.phone}` : '',
    company?.contactInfo?.email ? `Email: ${company.contactInfo.email}` : '',
  ].filter(Boolean).join('  ');

  const W        = 297;
  const margin   = 14;
  const contentW = W - margin * 2;

  const frameOpts: PageFrameOptions = {
    pdf, fontName, companyName, companyAddress, companyContact, logoBase64,
    formMeta, docCode, landscape: true,
  };

  const firstHeaderH = drawPageFrame(frameOpts, 1, 1);
  let y = margin + firstHeaderH + 5;

  // ── Document title (Thai + English) ──────────────────────────────────────
  pdf.setFont(fontName, 'bold');
  pdf.setFontSize(14.5);
  pdf.setTextColor(...BLACK);
  pdf.text('ทะเบียนเครื่องมือวัด', W / 2, y, { align: 'center' });
  y += 6;
  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(...BLACK);
  pdf.text('Equipment Register', W / 2, y, { align: 'center' });
  y += 2;
  pdf.setDrawColor(...BLACK);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, margin + contentW, y);
  y += 4;

  // ── Summary line ─────────────────────────────────────────────────────────
  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...BLACK);
  const summaryText = `Total items: ${equipmentList.length}     Printed: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const summaryTextLines = pdf.splitTextToSize(summaryText, contentW);
  summaryTextLines.forEach((line: string, i: number) => {
    pdf.text(line, margin, y + 3.5 + i * 4.5);
  });
  y += 3.5 + summaryTextLines.length * 4.5;

  // ── Equipment register table ──────────────────────────────────────────────
  //  Column widths fit inside A4 landscape content width (269 mm total)
  autoTable(pdf, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [[
      'No.',
      'Equipment ID',
      'ชื่อเครื่องมือ\nName',
      'ยี่ห้อ / รุ่น\nMfr. / Model',
      'Serial No.',
      'สถานที่เก็บ\nLocation',
      'พิกัด\nCapacity',
      'รอบสอบฯ\n(เดือน)',
      'สอบเทียบล่าสุด\nLast Cal.',
      'สอบเทียบครั้งถัดไป\nNext Due',
      'สถานะ\nStatus',
    ]],
    body: equipmentList.map((eq, idx) => [
      String(idx + 1),
      eq.id,
      eq.name,
      [eq.manufacturer, eq.model].filter(Boolean).join('\n'),
      eq.serialNumber,
      eq.location,
      eq.capacity || '—',
      eq.calibrationInterval ? String(eq.calibrationInterval) : '—',
      fmtDateShort(eq.lastCalibrationDate),
      fmtDateShort(eq.nextCalibrationDate),
      equipmentService.getStatusLabel(eq.status),
    ]),
    headStyles: {
      fillColor: [255, 255, 255] as [number, number, number],
      textColor: BLACK,
      fontStyle: 'bold',
      font: fontName,
      fontSize: 8,
      lineColor: BLACK,
      lineWidth: 0.3,
      halign: 'center',
      valign: 'middle',
      cellPadding: { top: 2.5, right: 1.5, bottom: 2.5, left: 1.5 },
    },
    bodyStyles: {
      font: fontName,
      fontSize: 8.5,
      textColor: BLACK,
      lineColor: BLACK,
      lineWidth: 0.2,
      overflow: 'linebreak',
      valign: 'top',
      cellPadding: { top: 2, right: 1.5, bottom: 2, left: 1.5 },
    },
    alternateRowStyles: { fillColor: [255, 255, 255] as [number, number, number] },
    tableLineColor: BLACK,
    tableLineWidth: 0.3,
    columnStyles: {
      0:  { cellWidth: 7,         halign: 'center' },
      1:  { cellWidth: 25,        halign: 'center', fontSize: 8 },
      2:  { cellWidth: 40 },
      3:  { cellWidth: 34 },
      4:  { cellWidth: 24,        halign: 'center' },
      5:  { cellWidth: 26 },
      6:  { cellWidth: 22,        halign: 'center' },
      7:  { cellWidth: 14,        halign: 'center' },
      8:  { cellWidth: 21,        halign: 'center' },
      9:  { cellWidth: 21,        halign: 'center' },
      10: { cellWidth: 'auto',    halign: 'center' },
    },
    didParseCell(_data) {
      // All text stays plain black — no colour coding
    },
    didDrawPage(data) {
      if (data.pageNumber > 1) {
        drawPageFrame(frameOpts, data.pageNumber, 1);
      }
    },
    showHead: 'everyPage',
  });

  // Rewrite page footers with the correct total
  const totalPagesActual = (pdf as any).internal.getNumberOfPages();
  const Hlnd = 210; // landscape A4 height
  for (let p = 1; p <= totalPagesActual; p++) {
    pdf.setPage(p);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, Hlnd - 12, W, 12, 'F');
    pdf.setDrawColor(...BLACK);
    pdf.setLineWidth(0.2);
    pdf.line(margin, Hlnd - 9, W - margin, Hlnd - 9);
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...BLACK);
    pdf.text(`Generated: ${new Date().toLocaleString('en-US')}`, margin, Hlnd - 5);
    pdf.text(`Page ${p} of ${totalPagesActual}`, W - margin, Hlnd - 5, { align: 'right' });
  }

  return pdf.output('arraybuffer');
}
