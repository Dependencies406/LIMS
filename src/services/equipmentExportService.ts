/**
 * Equipment Export Service
 *
 * Produces fixed-layout ISO evidence documents for the Equipment Control module.
 * All layouts are plain / clean â€” no filled backgrounds, ISO form header style.
 * Thai text is rendered correctly via the embedded Sarabun font.
 *
 * Documents:
 *   generateEquipmentDatasheetBytes()  â†’ LAB-FM-QP-05-005  Equipment Control Record (A4 portrait)
 *   generateUsageLogReportBytes()      â†’ LAB-FM-QP-05-006  Equipment Usage Log Report (A4 landscape)
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

// â”€â”€â”€ Text colours (no fill colours â€” clean plain layout) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const BLACK    = [0, 0, 0]       as [number, number, number];
const GRAY_600 = [75, 85, 99]    as [number, number, number];
const GRAY_400 = [156, 163, 175] as [number, number, number];
const GREEN    = [22, 163, 74]   as [number, number, number];
const RED      = [220, 38, 38]   as [number, number, number];
const AMBER    = [217, 119, 6]   as [number, number, number];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmtDate(d?: string | Date | null): string {
  if (!d) return 'â€”';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return 'â€”';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateShort(d?: string | null): string {
  if (!d) return 'â€”';
  const date = new Date(d);
  if (isNaN(date.getTime())) return 'â€”';
  return date.toLocaleDateString('en-GB');
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

// â”€â”€â”€ Document index lookup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ ISO form page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
//  Plain two-column bordered box (no fills):
//
//  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
//  â”‚  [Logo]  Company Name       â”‚  Form Name:   <name>         â”‚
//  â”‚          Address Â· Contact  â”‚  Form No:     <code>         â”‚
//  â”‚                             â”‚  Revision:    Rev. 01        â”‚
//  â”‚                             â”‚  Eff. Date:   dd mmm yyyy    â”‚
//  â”‚                             â”‚  Page:        N of M         â”‚
//  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
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

function drawPageFrame(opts: PageFrameOptions, pageNum: number, totalPages: number) {
  const { pdf, fontName, companyName, companyAddress, companyContact,
          logoBase64, formMeta, docCode, landscape } = opts;
  const W = landscape ? 297 : 210;
  const H = landscape ? 210 : 297;
  const margin = 14;
  const headerH = 26;
  const divX = W * 0.55;

  pdf.setDrawColor(...BLACK);
  pdf.setLineWidth(0.3);
  // Outer border
  pdf.rect(margin, margin, W - margin * 2, headerH);
  // Vertical divider
  pdf.line(divX, margin, divX, margin + headerH);

  // â”€â”€ Left: company â”€â”€
  let lx = margin + 3;
  let ly = margin + 5;

  if (logoBase64) {
    try {
      const logoH = 10;
      const logoW = 20;
      pdf.addImage(logoBase64, 'PNG', lx, margin + (headerH - logoH) / 2, logoW, logoH, '', 'FAST');
      lx += logoW + 3;
    } catch { /* skip */ }
  }

  pdf.setFont(fontName, 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(...BLACK);
  pdf.text(companyName, lx, ly);
  ly += 4.5;

  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(...GRAY_600);
  if (companyAddress) { pdf.text(companyAddress, lx, ly); ly += 4; }
  if (companyContact) { pdf.text(companyContact, lx, ly); }

  // â”€â”€ Right: form info â”€â”€
  const rx = divX + 4;
  const labelW = 24;
  const valueX = rx + labelW;
  let ry = margin + 5;

  const rows: [string, string][] = [
    ['Form Name:', formMeta.formName || 'â€”'],
    ['Form No:',   docCode],
    ['Revision:',  formMeta.revisionNumber ? `Rev. ${formMeta.revisionNumber}` : 'â€”'],
    ['Eff. Date:', formMeta.effectiveDate || 'â€”'],
    ['Page:',      `${pageNum} of ${totalPages}`],
  ];

  rows.forEach(([label, value]) => {
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...GRAY_400);
    pdf.text(label, rx, ry);
    pdf.setFont(fontName, 'normal');
    pdf.setTextColor(...BLACK);
    pdf.text(value, valueX, ry);
    ry += 4.5;
  });

  // â”€â”€ Footer: thin rule + generated text â”€â”€
  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(...GRAY_400);
  pdf.setDrawColor(...GRAY_400);
  pdf.setLineWidth(0.2);
  pdf.line(margin, H - 9, W - margin, H - 9);
  pdf.text(`Generated: ${new Date().toLocaleString('en-GB')}`, margin, H - 5);
  pdf.text(`Page ${pageNum} of ${totalPages}`, W - margin, H - 5, { align: 'right' });

  // Reset
  pdf.setTextColor(...BLACK);
  pdf.setDrawColor(...BLACK);
  pdf.setLineWidth(0.3);
}

// â”€â”€â”€ Document 1: Equipment Control Record â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * LAB-FM-QP-05-005  Equipment Control Record
 * A4 portrait â€” plain clean layout, Thai text supported, metadata from document index.
 */
export async function generateEquipmentDatasheetBytes(
  equipment: EquipmentRecord,
  calibrationEvents: CalibrationEvent[] = [],
  docCode = 'LAB-FM-QP-05-005'
): Promise<ArrayBuffer> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Load Thai font first â€” must happen before any text rendering
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

  drawPageFrame(frameOpts, 1, 1);

  let y = margin + 30;

  // â”€â”€ Document title â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  pdf.setFont(fontName, 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(...BLACK);
  pdf.text('EQUIPMENT CONTROL RECORD', W / 2, y, { align: 'center' });
  y += 5;
  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...GRAY_600);
  pdf.text(`Equipment ID: ${equipment.id}`, W / 2, y, { align: 'center' });
  y += 2;
  pdf.setDrawColor(...GRAY_400);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, margin + contentW, y);
  y += 6;

  // â”€â”€ Section heading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function sectionHeading(title: string) {
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...BLACK);
    pdf.text(title, margin, y + 4);
    pdf.setDrawColor(...BLACK);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y + 6, margin + contentW, y + 6);
    y += 9;
  }

  // â”€â”€ Field rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function fieldTable(rows: [string, string, string?, string?][]) {
    const colW = contentW / 2;
    const rowH = 7;
    const labelW = 38;

    rows.forEach((row) => {
      // Left â€” label
      pdf.setFont(fontName, 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(...GRAY_400);
      pdf.text(row[0], margin, y + 4.5);
      // Left â€” value
      pdf.setFont(fontName, 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...BLACK);
      pdf.text(row[1] || 'â€”', margin + labelW, y + 4.5);

      if (row[2] !== undefined) {
        // Right â€” label
        pdf.setFont(fontName, 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(...GRAY_400);
        pdf.text(row[2], margin + colW, y + 4.5);
        // Right â€” value
        pdf.setFont(fontName, 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(...BLACK);
        pdf.text(row[3] || 'â€”', margin + colW + labelW, y + 4.5);
      }

      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.2);
      pdf.line(margin, y + rowH, margin + contentW, y + rowH);
      y += rowH;
    });
    y += 3;
  }

  // â”€â”€ 1. Identity & Classification â”€â”€
  sectionHeading('1. IDENTITY & CLASSIFICATION');
  fieldTable([
    ['Equipment Name', equipment.name,                       'Category',     equipment.category],
    ['Manufacturer',   equipment.manufacturer,               'Model',        equipment.model],
    ['Serial Number',  equipment.serialNumber,               'Status',       equipmentService.getStatusLabel(equipment.status)],
    ['Capacity',       equipment.capacity      || 'â€”',       'Usage Range',  equipment.usageRange   || 'â€”'],
    ['Usage Criteria', equipment.usageCriteria || 'â€”',       '',             ''],
  ]);

  // â”€â”€ 2. Location & Custodianship â”€â”€
  sectionHeading('2. LOCATION & CUSTODIANSHIP');
  fieldTable([
    ['Location',         equipment.location,                                          'Registration Date', fmtDate(equipment.registrationDate)],
    ['Custodian',        equipment.custodianName || equipment.custodian,             'External Provider', fmtBool(equipment.externalProvider)],
    ['Authorized Users', equipment.authorizedUsers?.length
                           ? `${equipment.authorizedUsers.length} user(s)` : 'â€”',  '',                  ''],
  ]);

  // â”€â”€ 3. Calibration Information â”€â”€
  sectionHeading('3. CALIBRATION INFORMATION');
  fieldTable([
    ['Requires Cal.',   fmtBool(equipment.requiresCalibration),  'Interval',      equipment.calibrationInterval ? `${equipment.calibrationInterval} months` : 'â€”'],
    ['Procedure',       equipment.calibrationProcedure || 'â€”',   'Ext. Provider', fmtBool(equipment.externalProvider)],
    ['Last Calibrated', fmtDate(equipment.lastCalibrationDate),  'Next Due',      fmtDate(equipment.nextCalibrationDate)],
  ]);

  // â”€â”€ 4. Calibration History â”€â”€
  sectionHeading('4. CALIBRATION HISTORY');
  if (calibrationEvents.length > 0) {
    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Sent Date', 'Received', 'Lab / Provider', 'Certificate No.', 'Result', 'Notes']],
      body: calibrationEvents.map((ev) => [
        fmtDateShort(ev.sentDate),
        fmtDateShort(ev.receivedDate),
        ev.calibrationLab,
        ev.certificateNumber || 'â€”',
        ev.result ? ev.result.toUpperCase() : 'â€”',
        ev.notes || '',
      ]),
      headStyles: {
        fillColor: false as any,
        textColor: BLACK,
        fontStyle: 'bold',
        font: fontName,
        fontSize: 7.5,
        lineColor: BLACK,
        lineWidth: 0.3,
      },
      bodyStyles: {
        font: fontName,
        fontSize: 7.5,
        textColor: BLACK,
        lineColor: [200, 200, 200] as [number, number, number],
        lineWidth: 0.2,
      },
      alternateRowStyles: { fillColor: false as any },
      tableLineColor: BLACK,
      tableLineWidth: 0.3,
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22 },
        2: { cellWidth: 40 },
        3: { cellWidth: 32 },
        4: { cellWidth: 18 },
        5: { cellWidth: 'auto' },
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 4) {
          const v = String(data.cell.raw);
          if (v === 'PASS') data.cell.styles.textColor = GREEN;
          if (v === 'FAIL') data.cell.styles.textColor = RED;
        }
      },
    });
    y = (pdf as any).lastAutoTable.finalY + 4;
  } else {
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...GRAY_400);
    pdf.text('No calibration events recorded.', margin, y + 4);
    y += 10;
  }

  // â”€â”€ 5. Notes â”€â”€
  if (equipment.notes) {
    sectionHeading('5. NOTES');
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...BLACK);
    const noteLines = pdf.splitTextToSize(equipment.notes, contentW - 4);
    noteLines.forEach((line: string) => {
      pdf.text(line, margin, y + 4);
      y += 5;
    });
  }

  // â”€â”€ Signature row â”€â”€
  y += 8;
  if (y < 260) {
    pdf.setDrawColor(...BLACK);
    pdf.setLineWidth(0.3);
    const sigW = (contentW - 10) / 3;
    ['Prepared by', 'Reviewed by', 'Approved by'].forEach((label, i) => {
      const sx = margin + i * (sigW + 5);
      pdf.setFont(fontName, 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(...GRAY_400);
      pdf.text(label, sx, y);
      pdf.setDrawColor(...BLACK);
      pdf.line(sx, y + 8, sx + sigW, y + 8);
      pdf.text('Name / Date', sx, y + 12);
    });
  }

  return pdf.output('arraybuffer');
}

// â”€â”€â”€ Document 2: Equipment Usage Log Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Equipment Usage Log Report â€” A4 landscape, plain clean layout, Thai text supported.
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

  drawPageFrame(frameOpts, 1, 1);

  let y = margin + 30;

  // â”€â”€ Document title â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  pdf.setFont(fontName, 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(...BLACK);
  pdf.text('EQUIPMENT USAGE LOG', W / 2, y, { align: 'center' });
  y += 5;
  pdf.setFont(fontName, 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...GRAY_600);
  pdf.text(`${equipment.id}  Â·  ${equipment.name}`, W / 2, y, { align: 'center' });
  y += 2;
  pdf.setDrawColor(...GRAY_400);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, margin + contentW, y);
  y += 5;

  // â”€â”€ Equipment summary (inline) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const summaryItems: [string, string][] = [
    ['Serial No.', equipment.serialNumber],
    ['Category',   equipment.category],
    ['Location',   equipment.location],
    ['Custodian',  equipment.custodianName || equipment.custodian],
  ];
  const itemW = contentW / summaryItems.length;
  summaryItems.forEach(([label, val], i) => {
    const sx = margin + i * itemW;
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...GRAY_400);
    pdf.text(label, sx, y + 3);
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...BLACK);
    pdf.text(val || 'â€”', sx, y + 8);
  });
  y += 11;

  pdf.setDrawColor(...GRAY_400);
  pdf.setLineWidth(0.2);
  pdf.line(margin, y, margin + contentW, y);
  y += 5;

  // â”€â”€ Stats row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const statBlocks: [string, string, [number, number, number]][] = [
    ['Total Sessions', String(total),      BLACK],
    ['Pass',           String(passCount),  GREEN],
    ['Fail',           String(failCount),  failCount > 0 ? RED : GRAY_400],
    ['Pass Rate',      `${passRate}%`,     passRate >= 90 ? GREEN : passRate >= 70 ? AMBER : RED],
    ['Period', dateFrom || dateTo
      ? `${fmtDateShort(dateFrom)} â€“ ${fmtDateShort(dateTo)}`
      : 'All dates',                        BLACK],
  ];
  const blockW = contentW / statBlocks.length;
  statBlocks.forEach(([label, value, color], i) => {
    const bx = margin + i * blockW + blockW / 2;
    pdf.setFont(fontName, 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...color);
    pdf.text(value, bx, y + 5, { align: 'center' });
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...GRAY_400);
    pdf.text(label, bx, y + 10, { align: 'center' });
  });
  y += 14;

  // â”€â”€ Usage log table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      log.operatorName || log.operator || 'â€”',
      log.linkedJobRef || 'â€”',
      log.visualInspection === 'pass' ? 'Pass' : 'Fail',
      log.functionalCheck  === 'pass' ? 'Pass' : 'Fail',
      log.documentCheck === 'valid'   ? 'Valid'
        : log.documentCheck === 'expired' ? 'Expired' : 'N/A',
      log.refValuesVerified ? 'Yes' : 'â€”',
      log.equipmentCondition === 'normal' ? 'Normal' : 'Abnormal',
      log.overallResult.toUpperCase(),
      [log.abnormalDetails, log.actionTaken ? `Action: ${log.actionTaken}` : '']
        .filter(Boolean).join(' Â· ') || 'â€”',
      log.notes || 'â€”',
    ]),
    headStyles: {
      fillColor: false as any,
      textColor: BLACK,
      fontStyle: 'bold',
      font: fontName,
      fontSize: 7,
      lineColor: BLACK,
      lineWidth: 0.3,
      halign: 'center',
    },
    bodyStyles: {
      font: fontName,
      fontSize: 7,
      textColor: BLACK,
      lineColor: [200, 200, 200] as [number, number, number],
      lineWidth: 0.2,
      valign: 'middle',
    },
    alternateRowStyles: { fillColor: false as any },
    tableLineColor: BLACK,
    tableLineWidth: 0.3,
    columnStyles: {
      0:  { cellWidth: 20, halign: 'center' },
      1:  { cellWidth: 28 },
      2:  { cellWidth: 22, halign: 'center', font: 'courier' },
      3:  { cellWidth: 17, halign: 'center' },
      4:  { cellWidth: 20, halign: 'center' },
      5:  { cellWidth: 17, halign: 'center' },
      6:  { cellWidth: 18, halign: 'center' },
      7:  { cellWidth: 20, halign: 'center' },
      8:  { cellWidth: 17, halign: 'center', fontStyle: 'bold' },
      9:  { cellWidth: 'auto' },
      10: { cellWidth: 26 },
    },
    didParseCell(data) {
      if (data.section !== 'body') return;
      const v = String(data.cell.raw);
      if (data.column.index === 3 || data.column.index === 4) {
        data.cell.styles.textColor = v === 'Pass' ? GREEN : RED;
      }
      if (data.column.index === 5) {
        if (v === 'Expired') data.cell.styles.textColor = RED;
        if (v === 'Valid')   data.cell.styles.textColor = GREEN;
      }
      if (data.column.index === 7) {
        data.cell.styles.textColor = v === 'Normal' ? GREEN : RED;
      }
      if (data.column.index === 8) {
        data.cell.styles.textColor = v === 'PASS' ? GREEN : RED;
      }
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
    pdf.setDrawColor(...GRAY_400);
    pdf.setLineWidth(0.2);
    pdf.line(margin, H - 9, W - margin, H - 9);
    pdf.setFont(fontName, 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...GRAY_400);
    pdf.text(`Generated: ${new Date().toLocaleString('en-GB')}`, margin, H - 5);
    pdf.text(`Page ${p} of ${totalPagesActual}`, W - margin, H - 5, { align: 'right' });
  }

  return pdf.output('arraybuffer');
}
