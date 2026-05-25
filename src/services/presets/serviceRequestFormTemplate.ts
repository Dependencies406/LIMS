/**
 * Preset Template: SCS Service Request Form
 * Mirrors the layout of the physical Service Request Form (LAB-FM-QP-07-001).
 *
 * Install via:  pdfTemplateService.createTemplate(serviceRequestFormTemplate)
 */

import type { PdfTemplate } from '../../modules/pdf-template-builder/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0;
const uid = () => `preset-srf-${++_seq}-${Math.random().toString(36).slice(2, 7)}`;

// Layout constants (A4 portrait = 595.28 × 841.89 pt)
const L = 28;          // left margin
const R = 567;         // right edge
const W = R - L;       // content width = 539 pt
const BG = '#EEEEEE';  // section header fill
const BK = '#000000';
const SW = 0.5;        // default stroke width
const LABEL_SIZE = 8.5;
const VALUE_SIZE = 9;
const SECTION_SIZE = 8.5;

// ── Layout Y positions ────────────────────────────────────────────────────────
// Each section is calculated from the one above so the layout stays consistent.

const HDR_TOP  = 28;   // header logo/text top
const HDR_LINE = 84;   // horizontal rule under header
const TTL_TOP  = 88;   // title row top
const TTL_BOT  = 106;  // title row bottom
const CI_HDR   = 108;  // Customer Information grey header
const CI_TOP   = 120;  // first customer field row top
const ROW_H    = 14;   // standard row height
const CI_R1    = CI_TOP;               // Company Name row top
const CI_R2    = CI_R1 + ROW_H;       // Address
const CI_R3    = CI_R2 + ROW_H;       // Contact / Phone
const CI_R4    = CI_R3 + ROW_H;       // Email / PO
const CI_R5    = CI_R4 + ROW_H;       // Appointment Date
const CI_BOT   = CI_R5 + ROW_H;       // = 190
const EQ_HDR   = CI_BOT + 2;          // Equipment Details grey header top
const EQ_TBL   = EQ_HDR + 14;         // equipment table top
const EQ_H     = 138;                  // equipment table height (10 rows × ~11pt + header)
const EQ_BOT   = EQ_TBL + EQ_H;       // = EQ_TBL + 138
const TR_HDR   = EQ_BOT + 2;          // Technical Requirements header top
const TR_SOC   = TR_HDR + 14;         // Statement of Conformity row
const TR_DR    = TR_SOC + 14;         // Decision Rule row
const TR_CDR   = TR_DR  + 14;         // Customer-Specified Decision Rule
const TR_N1    = TR_CDR + 14;         // Note 1
const TR_N2    = TR_N1  + 19;         // Note 2
const TC_HDR   = TR_N2  + 19;         // Terms & Conditions header
const TC_R1    = TC_HDR + 14;         // Traceability
const TC_R2    = TC_R1  + 18;         // Confidentiality
const TC_R3    = TC_R2  + 18;         // Subcontracting
const TC_R4    = TC_R3  + 18;         // No Urgent Service
const AG_ROW   = TC_R4  + 20;         // Accepted and Agreed row
const AG_SIG   = AG_ROW + 12;         // Signature row
const LAB_HDR  = AG_SIG + 42;         // For Laboratory Use Only header
const LAB_COND = LAB_HDR + 14;        // Item condition row
const LAB_CLHD = LAB_COND + 14;       // Pre-work checklist subheader
const LAB_CL1  = LAB_CLHD + 14;       // Checklist row 1
const LAB_CL2  = LAB_CL1 + 12;
const LAB_CL3  = LAB_CL2 + 12;
const LAB_CL4  = LAB_CL3 + 12;
const BOT_HDR  = LAB_CL4 + 14;        // Received By / Tech Reviewer header
const BOT_SIG  = BOT_HDR + 12;        // bottom signatures
const FOOTER_Y = BOT_SIG  + 42;       // footer reference

// ── Template definition ───────────────────────────────────────────────────────

export const serviceRequestFormTemplate: Omit<PdfTemplate, 'id'> = {
  name: 'Service Request Form',
  description: 'SCS Service Request Form (LAB-FM-QP-07-001) — mirrors the standard paper form layout.',
  scope: 'jobs',
  pageSize: 'A4',
  orientation: 'portrait',
  pagePattern: 'page-of-total',
  elements: [

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 1 — HEADER
    // ══════════════════════════════════════════════════════════════════════════

    // Company logo
    { id: uid(), type: 'image', x: L, y: HDR_TOP, width: 55, height: 48,
      maintainAspect: true, fitMode: 'contain',
      dataSource: { type: 'image', key: 'logo' } },

    // Company name
    { id: uid(), type: 'text', x: 90, y: HDR_TOP + 14,
      fontSize: 14, bold: true, font: 'Helvetica',
      staticText: 'SCS Instruments Company Limited' },

    // Address
    { id: uid(), type: 'text', x: 90, y: HDR_TOP + 27,
      fontSize: 8, font: 'Helvetica',
      staticText: '178/57 Soi Buddhamonthon Sai 2 Soi 33, Salathammasop, Thawiwatthana, Bangkok, 10170, Thailand' },

    // Phone / Email
    { id: uid(), type: 'text', x: 90, y: HDR_TOP + 38,
      fontSize: 8, font: 'Helvetica',
      staticText: 'Phone: 020248472    E-mail: support@scsinstruments.co.th' },

    // Page number (right-aligned)
    { id: uid(), type: 'text', x: R - 55, y: HDR_TOP + 48,
      fontSize: 8, font: 'Helvetica', align: 'right',
      staticText: 'Page 1 of 1' },

    // Header divider line
    { id: uid(), type: 'line',
      x1: L, y1: HDR_LINE, x2: R, y2: HDR_LINE,
      color: BK, width: 0.75 },

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 2 — TITLE ROW
    // ══════════════════════════════════════════════════════════════════════════

    // Outer rectangle (full width)
    { id: uid(), type: 'rectangle',
      x: L, y: TTL_TOP, width: W, height: TTL_BOT - TTL_TOP,
      strokeColor: BK, strokeWidth: SW },

    // Vertical divider at x=408
    { id: uid(), type: 'line',
      x1: 408, y1: TTL_TOP, x2: 408, y2: TTL_BOT,
      color: BK, width: SW },

    // "SERVICE REQUEST FORM" — centered in left portion (L to 408)
    { id: uid(), type: 'text',
      x: L + 2, y: TTL_TOP + 12,
      width: 376, align: 'center',
      fontSize: 13, bold: true, font: 'Helvetica',
      staticText: 'SERVICE REQUEST FORM' },

    // "Request No.:" label in right cell
    { id: uid(), type: 'text', x: 412, y: TTL_TOP + 7,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Request No.:' },

    // Request No. value
    { id: uid(), type: 'text', x: 412, y: TTL_TOP + 15,
      fontSize: 10, bold: true, font: 'Helvetica',
      dataSource: { type: 'text', key: 'job.id' } },

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — CUSTOMER INFORMATION
    // ══════════════════════════════════════════════════════════════════════════

    // Grey header
    { id: uid(), type: 'rectangle',
      x: L, y: CI_HDR, width: W, height: 12,
      fillColor: BG, strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'text', x: L + 2, y: CI_HDR + 9,
      width: W, align: 'center',
      fontSize: SECTION_SIZE, bold: true, font: 'Helvetica',
      staticText: 'CUSTOMER INFORMATION' },

    // Outer border for 5 rows
    { id: uid(), type: 'rectangle',
      x: L, y: CI_TOP, width: W, height: ROW_H * 5,
      strokeColor: BK, strokeWidth: SW },

    // Row dividers (horizontal lines)
    ...[CI_R2, CI_R3, CI_R4, CI_R5].map(y => ({
      id: uid(), type: 'line' as const,
      x1: L, y1: y, x2: R, y2: y, color: BK, width: SW,
    })),

    // Vertical divider in rows 3 and 4 (Contact|Phone, Email|PO)
    { id: uid(), type: 'line',
      x1: 315, y1: CI_R3, x2: 315, y2: CI_R5, color: BK, width: SW },

    // — Row 1: Company Name ——
    { id: uid(), type: 'text', x: L + 3, y: CI_R1 + 10,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Company Name:' },
    { id: uid(), type: 'text', x: 118, y: CI_R1 + 10,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 200,
      dataSource: { type: 'text', key: 'customer.name' } },

    // — Row 2: Address ——
    { id: uid(), type: 'text', x: L + 3, y: CI_R2 + 10,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Address:' },
    { id: uid(), type: 'text', x: 72, y: CI_R2 + 10,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 285,
      dataSource: { type: 'text', key: 'customer.address' } },

    // — Row 3: Contact Person | Phone ——
    { id: uid(), type: 'text', x: L + 3, y: CI_R3 + 10,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Contact Person:' },
    { id: uid(), type: 'text', x: 110, y: CI_R3 + 10,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 200,
      dataSource: { type: 'text', key: 'customer.contact_person' } },
    { id: uid(), type: 'text', x: 318, y: CI_R3 + 10,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Phone:' },
    { id: uid(), type: 'text', x: 344, y: CI_R3 + 10,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 90,
      dataSource: { type: 'text', key: 'customer.phone' } },

    // — Row 4: Email | PO/Ref No. ——
    { id: uid(), type: 'text', x: L + 3, y: CI_R4 + 10,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Email:' },
    { id: uid(), type: 'text', x: 58, y: CI_R4 + 10,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 252,
      dataSource: { type: 'text', key: 'customer.email' } },
    { id: uid(), type: 'text', x: 318, y: CI_R4 + 10,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'PO / Ref No.:' },
    { id: uid(), type: 'text', x: 374, y: CI_R4 + 10,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 90,
      dataSource: { type: 'text', key: 'job.poNumber' } },

    // — Row 5: Appointment Date ——
    { id: uid(), type: 'text', x: L + 3, y: CI_R5 + 10,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Scheduled / Confirmed Calibration Appointment Date:' },
    { id: uid(), type: 'text', x: 290, y: CI_R5 + 10,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 150,
      dataSource: { type: 'text', key: 'job.appointmentDate' } },
    { id: uid(), type: 'text', x: 460, y: CI_R5 + 10,
      fontSize: 7.5, italic: true, font: 'Helvetica',
      staticText: '(DD / MM / YYYY)' },

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 4 — EQUIPMENT DETAILS
    // ══════════════════════════════════════════════════════════════════════════

    // Grey header
    { id: uid(), type: 'rectangle',
      x: L, y: EQ_HDR, width: W, height: 12,
      fillColor: BG, strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'text', x: L + 2, y: EQ_HDR + 9,
      width: W, align: 'center',
      fontSize: SECTION_SIZE, bold: true, font: 'Helvetica',
      staticText: 'SECTION 2: EQUIPMENT DETAILS' },

    // Equipment table
    {
      id: uid(),
      type: 'equipment-table',
      x: L, y: EQ_TBL,
      width: W,
      height: EQ_H,
      paginationMode: 'static',
      repeatOnOverflowPages: false,
      borderColor: BK,
      borderWidth: 0.5,
      fontSize: 8,
      headerFontSize: 8.5,
      headerStyle: { bold: true, backgroundColor: '#FFFFFF' },
      columns: [
        { id: 'no',               label: 'No.',                  visible: true, width: 22,  align: 'center', order: 0 },
        { id: 'name',             label: 'Equipment Name',        visible: true, width: 100, align: 'left',   order: 1 },
        { id: 'manufacturer',     label: 'Manufacturer / Model',  visible: true, width: 95,  align: 'left',   order: 2 },
        { id: 'serialNumber',     label: 'ID / Serial No.',       visible: true, width: 72,  align: 'left',   order: 3 },
        { id: 'calibrationPoint', label: 'Calibration Points',    visible: true, width: 90,  align: 'left',   order: 4 },
        { id: 'accessories',      label: 'Accessories (if any)',  visible: true, width: 80,  align: 'left',   order: 5 },
        { id: 'calibrationMethods', label: 'Procedure',           visible: true, width: 80,  align: 'left',   order: 6 },
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 5 — TECHNICAL REQUIREMENTS
    // ══════════════════════════════════════════════════════════════════════════

    // Grey header
    { id: uid(), type: 'rectangle',
      x: L, y: TR_HDR, width: W, height: 12,
      fillColor: BG, strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'text', x: L + 2, y: TR_HDR + 9,
      width: W, align: 'center',
      fontSize: SECTION_SIZE, bold: true, font: 'Helvetica',
      staticText: 'TECHNICAL REQUIREMENTS' },

    // Statement of Conformity row border
    { id: uid(), type: 'rectangle',
      x: L, y: TR_SOC, width: W, height: 14,
      strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'text', x: L + 3, y: TR_SOC + 10,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Statement of Conformity Required?' },

    // Yes checkbox (unchecked)
    { id: uid(), type: 'checkbox',
      x: 220, y: TR_SOC + 2, size: 10,
      checked: false, checkStyle: 'checkmark',
      strokeColor: BK, strokeWidth: 0.75, checkColor: BK,
      label: 'Yes', labelPosition: 'right', labelFontSize: 9 },

    // Vertical divider
    { id: uid(), type: 'line',
      x1: 255, y1: TR_SOC, x2: 255, y2: TR_SOC + 14,
      color: BK, width: SW },

    // No checkbox (checked by default)
    { id: uid(), type: 'checkbox',
      x: 258, y: TR_SOC + 2, size: 10,
      checked: true, checkStyle: 'checkmark',
      strokeColor: BK, strokeWidth: 0.75, checkColor: BK,
      label: 'No  (Certificate will show measurements only)',
      labelPosition: 'right', labelFontSize: 9 },

    // Decision Rule row border
    { id: uid(), type: 'rectangle',
      x: L, y: TR_DR, width: W, height: 14,
      strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'text', x: L + 3, y: TR_DR + 9,
      fontSize: 8, font: 'Helvetica',
      staticText: 'Decision Rule  (Required if Statement of Conformity = Yes — Must be specified by the Customer)' },

    // Customer-Specified Decision Rule row
    { id: uid(), type: 'rectangle',
      x: L, y: TR_CDR, width: W, height: 14,
      strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'text', x: L + 3, y: TR_CDR + 10,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Customer-Specified Decision Rule:' },
    { id: uid(), type: 'text', x: 200, y: TR_CDR + 10,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 200,
      dataSource: { type: 'text', key: 'service.decisionRule' } },

    // Italic note 1
    { id: uid(), type: 'text',
      x: L + 3, y: TR_N1 + 9, width: W - 6,
      fontSize: 7.5, italic: true, font: 'Helvetica',
      staticText: 'i  The laboratory does not prescribe or recommend a decision rule. The customer is solely responsible for specifying the decision rule to be applied (e.g., acceptance criteria, guard band width, confidence level, or reference standard). If no decision rule is specified, the Statement of Conformity cannot be issued.' },

    // Italic note 2
    { id: uid(), type: 'text',
      x: L + 3, y: TR_N2 + 9, width: W - 6,
      fontSize: 7.5, italic: true, font: 'Helvetica',
      staticText: 'i  Default Method: Unless otherwise specified, SCS Instrument Co., Ltd. will perform calibration using its validated in-house methods traceable to national/international standards. Customer-specified methods must be submitted with this form for review prior to confirmation.' },

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 6 — TERMS & CONDITIONS
    // ══════════════════════════════════════════════════════════════════════════

    // Grey header
    { id: uid(), type: 'rectangle',
      x: L, y: TC_HDR, width: W, height: 12,
      fillColor: BG, strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'text', x: L + 2, y: TC_HDR + 9,
      width: W, align: 'center',
      fontSize: SECTION_SIZE, bold: true, font: 'Helvetica',
      staticText: 'TERMS & CONDITIONS' },

    // Traceability
    { id: uid(), type: 'text', x: L + 3, y: TC_R1 + 8,
      fontSize: 8, bold: true, font: 'Helvetica',
      staticText: 'Traceability:' },
    { id: uid(), type: 'text', x: 90, y: TC_R1 + 8,
      fontSize: 8, font: 'Helvetica', width: 474,
      staticText: 'All calibration results are traceable to SI units via NIMT or equivalent NMI. Calibration certificates will reference the traceability chain.' },

    // Confidentiality
    { id: uid(), type: 'text', x: L + 3, y: TC_R2 + 8,
      fontSize: 8, bold: true, font: 'Helvetica',
      staticText: 'Confidentiality:' },
    { id: uid(), type: 'text', x: 96, y: TC_R2 + 8,
      fontSize: 8, font: 'Helvetica', width: 468,
      staticText: 'SCS treats all customer data and technical information as strictly confidential and will not disclose it to third parties without prior written consent.' },

    // Subcontracting
    { id: uid(), type: 'text', x: L + 3, y: TC_R3 + 8,
      fontSize: 8, bold: true, font: 'Helvetica',
      staticText: 'Subcontracting:' },
    { id: uid(), type: 'text', x: 96, y: TC_R3 + 8,
      fontSize: 8, font: 'Helvetica', width: 468,
      staticText: 'SCS does not normally subcontract calibration work. If subcontracting is required, prior written customer approval will be obtained.' },

    // No Urgent Service
    { id: uid(), type: 'text', x: L + 3, y: TC_R4 + 8,
      fontSize: 8, bold: true, font: 'Helvetica',
      staticText: 'No Urgent Service:' },
    { id: uid(), type: 'text', x: 108, y: TC_R4 + 8,
      fontSize: 8, font: 'Helvetica', width: 456,
      staticText: 'Express or urgent service is not available. Standard turnaround time will be confirmed at contract review. This policy is in line with current operational capacity.' },

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 7 — ACCEPTED AND AGREED
    // ══════════════════════════════════════════════════════════════════════════

    // Outer border
    { id: uid(), type: 'rectangle',
      x: L, y: AG_ROW, width: W, height: 12,
      strokeColor: BK, strokeWidth: SW },

    // Dividers: Name | Signature | Date
    { id: uid(), type: 'line',
      x1: 310, y1: AG_ROW, x2: 310, y2: AG_ROW + 12, color: BK, width: SW },
    { id: uid(), type: 'line',
      x1: 490, y1: AG_ROW, x2: 490, y2: AG_ROW + 12, color: BK, width: SW },

    { id: uid(), type: 'text', x: L + 3, y: AG_ROW + 9,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Accepted and Agreed by:' },
    { id: uid(), type: 'text', x: 175, y: AG_ROW + 9,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 130,
      dataSource: { type: 'text', key: 'customer.contact_person' } },
    { id: uid(), type: 'text', x: 494, y: AG_ROW + 9,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Date:' },

    // Signature row border
    { id: uid(), type: 'rectangle',
      x: L, y: AG_SIG, width: W, height: 40,
      strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'line',
      x1: 310, y1: AG_SIG, x2: 310, y2: AG_SIG + 40, color: BK, width: SW },
    { id: uid(), type: 'line',
      x1: 490, y1: AG_SIG, x2: 490, y2: AG_SIG + 40, color: BK, width: SW },

    { id: uid(), type: 'text', x: L + 3, y: AG_SIG + 10,
      fontSize: LABEL_SIZE, font: 'Helvetica',
      staticText: 'Signature:' },

    // Customer signature image
    { id: uid(), type: 'image',
      x: 60, y: AG_SIG + 2, width: 240, height: 36,
      maintainAspect: true, fitMode: 'contain',
      dataSource: { type: 'image', key: 'workAuthorization.customerSignature' } },

    // Date value
    { id: uid(), type: 'text', x: 494, y: AG_SIG + 10,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 70,
      dataSource: { type: 'text', key: 'job.appointmentDate' } },

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 8 — FOR LABORATORY USE ONLY
    // ══════════════════════════════════════════════════════════════════════════

    // Grey header
    { id: uid(), type: 'rectangle',
      x: L, y: LAB_HDR, width: W, height: 12,
      fillColor: BG, strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'text', x: L + 2, y: LAB_HDR + 9,
      width: W, align: 'center',
      fontSize: SECTION_SIZE, bold: true, font: 'Helvetica',
      staticText: 'FOR LABORATORY USE ONLY' },

    // Item condition row
    { id: uid(), type: 'rectangle',
      x: L, y: LAB_COND, width: W, height: 14,
      strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'text', x: L + 3, y: LAB_COND + 10,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Item/Machine Condition upon Received :' },

    // Condition checkboxes
    { id: uid(), type: 'checkbox',
      x: 205, y: LAB_COND + 2, size: 10,
      checked: true, checkStyle: 'checkmark',
      strokeColor: BK, strokeWidth: 0.75, checkColor: BK,
      label: 'Good', labelPosition: 'right', labelFontSize: 9 },
    { id: uid(), type: 'checkbox',
      x: 300, y: LAB_COND + 2, size: 10,
      checked: false, checkStyle: 'checkmark',
      strokeColor: BK, strokeWidth: 0.75, checkColor: BK,
      label: 'Damaged', labelPosition: 'right', labelFontSize: 9 },
    { id: uid(), type: 'checkbox',
      x: 380, y: LAB_COND + 2, size: 10,
      checked: false, checkStyle: 'checkmark',
      strokeColor: BK, strokeWidth: 0.75, checkColor: BK,
      label: 'Dirty', labelPosition: 'right', labelFontSize: 9 },
    { id: uid(), type: 'checkbox',
      x: 450, y: LAB_COND + 2, size: 10,
      checked: false, checkStyle: 'checkmark',
      strokeColor: BK, strokeWidth: 0.75, checkColor: BK,
      label: 'Other:..............................................', labelPosition: 'right', labelFontSize: 9 },

    // Pre-work checklist subheader
    { id: uid(), type: 'rectangle',
      x: L, y: LAB_CLHD, width: W, height: 14,
      strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'text', x: L + 3, y: LAB_CLHD + 10,
      width: W - 6, align: 'center',
      fontSize: 8, font: 'Helvetica',
      staticText: 'Pre-Work Capability Checklist (Reviewer to tick all items before issuing confirmation)' },

    // Checklist rows (4 items)
    ...[
      { y: LAB_CL1, text: 'Capability & technical resources are available to perform the requested calibration' },
      { y: LAB_CL2, text: 'Calibration method is appropriate, validated, and up-to-date per current scope of accreditation' },
      { y: LAB_CL3, text: 'Equipment condition has been checked; equipment is suitable for calibration without remedial action' },
      { y: LAB_CL4, text: 'Customer requirements (including Decision Rule, if applicable) are understood and documented' },
    ].flatMap(({ y, text }) => [
      { id: uid(), type: 'rectangle' as const,
        x: L, y, width: W, height: 12,
        strokeColor: BK, strokeWidth: SW },
      { id: uid(), type: 'checkbox' as const,
        x: L + 2, y: y + 1, size: 10,
        checked: true, checkStyle: 'checkmark' as const,
        strokeColor: BK, strokeWidth: 0.75, checkColor: BK,
        label: text, labelPosition: 'right' as const, labelFontSize: 8.5 },
    ]),

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 9 — BOTTOM SIGNATURES
    // ══════════════════════════════════════════════════════════════════════════

    // Header row (Received By | Date | Technical Reviewer | Date)
    { id: uid(), type: 'rectangle',
      x: L, y: BOT_HDR, width: W, height: 12,
      strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'line',
      x1: 160, y1: BOT_HDR, x2: 160, y2: BOT_HDR + 12, color: BK, width: SW },
    { id: uid(), type: 'line',
      x1: 220, y1: BOT_HDR, x2: 220, y2: BOT_HDR + 12, color: BK, width: SW },
    { id: uid(), type: 'line',
      x1: 390, y1: BOT_HDR, x2: 390, y2: BOT_HDR + 12, color: BK, width: SW },
    { id: uid(), type: 'line',
      x1: 490, y1: BOT_HDR, x2: 490, y2: BOT_HDR + 12, color: BK, width: SW },

    { id: uid(), type: 'text', x: L + 3, y: BOT_HDR + 9,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Received By:' },
    { id: uid(), type: 'text', x: 163, y: BOT_HDR + 9,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Date:' },
    { id: uid(), type: 'text', x: 223, y: BOT_HDR + 9,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Technical Reviewer:' },
    { id: uid(), type: 'text', x: 393, y: BOT_HDR + 9,
      fontSize: LABEL_SIZE, bold: true, font: 'Helvetica',
      staticText: 'Date:' },

    // Signature row
    { id: uid(), type: 'rectangle',
      x: L, y: BOT_SIG, width: W, height: 42,
      strokeColor: BK, strokeWidth: SW },
    { id: uid(), type: 'line',
      x1: 160, y1: BOT_SIG, x2: 160, y2: BOT_SIG + 42, color: BK, width: SW },
    { id: uid(), type: 'line',
      x1: 220, y1: BOT_SIG, x2: 220, y2: BOT_SIG + 42, color: BK, width: SW },
    { id: uid(), type: 'line',
      x1: 390, y1: BOT_SIG, x2: 390, y2: BOT_SIG + 42, color: BK, width: SW },
    { id: uid(), type: 'line',
      x1: 490, y1: BOT_SIG, x2: 490, y2: BOT_SIG + 42, color: BK, width: SW },

    { id: uid(), type: 'text', x: L + 3, y: BOT_SIG + 10,
      fontSize: LABEL_SIZE, font: 'Helvetica',
      staticText: 'Signature:' },

    // Staff signature image
    { id: uid(), type: 'image',
      x: L + 3, y: BOT_SIG + 12, width: 155, height: 28,
      maintainAspect: true, fitMode: 'contain',
      dataSource: { type: 'image', key: 'workAuthorization.staffSignature' } },

    // Received By name
    { id: uid(), type: 'text', x: L + 3, y: BOT_SIG + 7,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 128,
      dataSource: { type: 'text', key: 'job.assignedStaff' } },

    // Date (received)
    { id: uid(), type: 'text', x: 163, y: BOT_SIG + 10,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 55,
      dataSource: { type: 'text', key: 'job.date' } },

    { id: uid(), type: 'text', x: 223, y: BOT_SIG + 10,
      fontSize: LABEL_SIZE, font: 'Helvetica',
      staticText: 'Signature:' },

    // Technical reviewer signature
    { id: uid(), type: 'image',
      x: 223, y: BOT_SIG + 12, width: 165, height: 28,
      maintainAspect: true, fitMode: 'contain',
      dataSource: { type: 'image', key: 'workAuthorization.technicalReviewerSignature' } },

    // Tech reviewer name
    { id: uid(), type: 'text', x: 223, y: BOT_SIG + 7,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 164,
      dataSource: { type: 'text', key: 'workAuthorization.technicalReviewerName' } },

    // Date (reviewer)
    { id: uid(), type: 'text', x: 493, y: BOT_SIG + 10,
      fontSize: VALUE_SIZE, font: 'Helvetica', width: 70,
      dataSource: { type: 'text', key: 'job.date' } },

    // ══════════════════════════════════════════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════════════════════════════════════════

    { id: uid(), type: 'text', x: R, y: FOOTER_Y,
      fontSize: 7.5, font: 'Helvetica', align: 'right',
      staticText: 'LAB-FM-QP-07-001 Rev.03 Eff. 24-03-2026' },

  ] as PdfTemplate['elements'],

  metadata: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};
