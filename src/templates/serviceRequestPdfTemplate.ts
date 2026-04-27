import type { PdfTemplate, EquipmentTableColumnDef } from '../modules/pdf-template-builder/types';

const A4 = { width: 595, height: 842 }; // pt

export const BUILTIN_SERVICE_REQUEST_TEMPLATE_ID = 'builtin_service_request_v2';
export const BUILTIN_SERVICE_REQUEST_TEMPLATE_VERSION = 4;

const cols = (...defs: Array<Pick<EquipmentTableColumnDef, 'id' | 'label' | 'width' | 'align'>>): EquipmentTableColumnDef[] =>
  defs.map((d, idx) => ({
    id: d.id,
    label: d.label,
    visible: true,
    width: d.width,
    align: d.align,
    order: idx,
  }));

export function buildServiceRequestPdfTemplate(): PdfTemplate {
  const marginX = 32;
  const pageW = A4.width;
  const contentW = pageW - marginX * 2;

  const small = { font: 'Helvetica', fontSize: 9, color: '#111827' };
  const label = { font: 'Helvetica', fontSize: 9, color: '#111827', bold: true };

  return {
    id: BUILTIN_SERVICE_REQUEST_TEMPLATE_ID,
    name: 'Service Request Form (Built-in)',
    description: 'Service request template matching Request.pdf',
    pageSize: 'A4',
    orientation: 'portrait',
    pagePattern: 'page-number',
    ...( { templateVersion: BUILTIN_SERVICE_REQUEST_TEMPLATE_VERSION } as any ),
    elements: [
      // Company header
      { id: 'c_name', type: 'text', x: marginX, y: 26, width: 360, font: 'Helvetica', fontSize: 12, bold: true, dataSource: { type: 'text', key: 'company.name' } },
      { id: 'c_addr', type: 'text', x: marginX, y: 42, width: 360, ...small, dataSource: { type: 'text', key: 'company.address' } },
      { id: 'c_phone_lbl', type: 'text', x: marginX, y: 62, width: 48, ...small, staticText: 'Phone:' },
      { id: 'c_phone', type: 'text', x: marginX + 44, y: 62, width: 140, ...small, dataSource: { type: 'text', key: 'company.phone' } },
      { id: 'c_email_lbl', type: 'text', x: marginX + 190, y: 62, width: 42, ...small, staticText: 'E-mail:' },
      { id: 'c_email', type: 'text', x: marginX + 232, y: 62, width: 220, ...small, dataSource: { type: 'text', key: 'company.email' } },

      // Title row
      { id: 'title', type: 'text', x: 0, y: 92, width: pageW, font: 'Helvetica', fontSize: 14, bold: true, align: 'center', staticText: 'SERVICE REQUEST FORM' },

      // Request number
      // Placed below the centered title to avoid overlap
      { id: 'req_lbl', type: 'text', x: marginX + 330, y: 114, width: 90, ...label, staticText: 'Request No.:' },
      { id: 'req_val', type: 'text', x: marginX + 420, y: 114, width: 140, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'job.id' } },
      { id: 'req_line', type: 'line', x: marginX + 416, y: 130, x1: marginX + 416, y1: 128, x2: marginX + 560, y2: 128, color: '#111827', width: 0.5 },

      // Customer information section
      { id: 'cust_hdr', type: 'text', x: marginX, y: 144, width: contentW, font: 'Helvetica', fontSize: 11, bold: true, staticText: 'CUSTOMER INFORMATION' },

      { id: 'cust_company_lbl', type: 'text', x: marginX, y: 164, width: 100, ...label, staticText: 'Company Name:' },
      { id: 'cust_company', type: 'text', x: marginX + 110, y: 164, width: contentW - 110, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'customer.name' } },
      { id: 'cust_company_line', type: 'line', x: marginX + 108, y: 180, x1: marginX + 108, y1: 178, x2: marginX + contentW, y2: 178, color: '#111827', width: 0.5 },

      { id: 'cust_addr_lbl', type: 'text', x: marginX, y: 186, width: 60, ...label, staticText: 'Address:' },
      { id: 'cust_addr', type: 'text', x: marginX + 110, y: 186, width: contentW - 110, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'customer.address' } },
      { id: 'cust_addr_line', type: 'line', x: marginX + 108, y: 204, x1: marginX + 108, y1: 202, x2: marginX + contentW, y2: 202, color: '#111827', width: 0.5 },

      { id: 'cust_contact_lbl', type: 'text', x: marginX, y: 212, width: 92, ...label, staticText: 'Contact Person:' },
      { id: 'cust_contact', type: 'text', x: marginX + 110, y: 212, width: 180, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'customer.contact_person' } },
      { id: 'cust_phone_lbl', type: 'text', x: marginX + 310, y: 212, width: 44, ...label, staticText: 'Phone:' },
      { id: 'cust_phone', type: 'text', x: marginX + 360, y: 212, width: 200, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'customer.phone' } },
      { id: 'cust_contact_line', type: 'line', x: marginX + 108, y: 230, x1: marginX + 108, y1: 228, x2: marginX + 290, y2: 228, color: '#111827', width: 0.5 },
      { id: 'cust_phone_line', type: 'line', x: marginX + 356, y: 230, x1: marginX + 356, y1: 228, x2: marginX + contentW, y2: 228, color: '#111827', width: 0.5 },

      { id: 'cust_email_lbl', type: 'text', x: marginX, y: 238, width: 44, ...label, staticText: 'Email:' },
      { id: 'cust_email', type: 'text', x: marginX + 110, y: 238, width: 260, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'customer.email' } },
      { id: 'cust_po_lbl', type: 'text', x: marginX + 380, y: 238, width: 82, ...label, staticText: 'PO / Ref No.:' },
      { id: 'cust_po', type: 'text', x: marginX + 470, y: 238, width: 90, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'job.poNumber' } },
      { id: 'cust_email_line', type: 'line', x: marginX + 108, y: 256, x1: marginX + 108, y1: 254, x2: marginX + 370, y2: 254, color: '#111827', width: 0.5 },
      { id: 'cust_po_line', type: 'line', x: marginX + 466, y: 256, x1: marginX + 466, y1: 254, x2: marginX + contentW, y2: 254, color: '#111827', width: 0.5 },

      { id: 'appt_lbl', type: 'text', x: marginX, y: 264, width: 280, ...label, staticText: 'Scheduled / Confirmed Calibration Appointment Date:' },
      { id: 'appt_val', type: 'text', x: marginX + 320, y: 264, width: 240, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'job.appointmentDate' } },
      { id: 'appt_line', type: 'line', x: marginX + 316, y: 282, x1: marginX + 316, y1: 280, x2: marginX + contentW, y2: 280, color: '#111827', width: 0.5 },

      // Equipment table section
      { id: 'eq_hdr', type: 'text', x: marginX, y: 296, width: contentW, font: 'Helvetica', fontSize: 11, bold: true, staticText: 'SECTION 2: EQUIPMENT DETAILS' },
      {
        id: 'eq_table',
        type: 'equipment-table',
        x: marginX,
        y: 316,
        width: contentW,
        height: 220,
        paginationMode: 'dynamic',
        repeatOnOverflowPages: true,
        // Original form uses strong black grid lines
        borderColor: '#000000',
        borderWidth: 1,
        // Render a stronger outer border like the original form
        ...( { outerBorderWidth: 2 } as any ),
        headerStyle: { backgroundColor: '#FFFFFF', color: '#000000', bold: true },
        cellStyle: { color: '#000000' },
        columns: cols(
          { id: 'no', label: 'No.', width: 28, align: 'center' },
          { id: 'name', label: 'Equipment Name', width: 110, align: 'left' },
          { id: 'manufacturerModel', label: 'Manufacturer / Model', width: 150, align: 'left' },
          { id: 'serialNumber', label: 'ID / Serial No.', width: 95, align: 'left' },
          { id: 'calibrationPoint', label: 'Calibration Points', width: 90, align: 'left' },
          { id: 'accessories', label: 'Accessories', width: 90, align: 'left' }
        ),
        headerFontSize: 8,
        fontSize: 8,
      },

      // Technical requirements
      { id: 'tech_hdr', type: 'text', x: marginX, y: 524, width: contentW, font: 'Helvetica', fontSize: 11, bold: true, staticText: 'TECHNICAL REQUIREMENTS' },
      { id: 'soc_lbl', type: 'text', x: marginX, y: 544, width: 220, ...label, staticText: 'Statement of Conformity Required?' },
      { id: 'soc_val', type: 'text', x: marginX + 240, y: 544, width: 200, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'service.statementOfConformity' } },
      { id: 'dr_lbl', type: 'text', x: marginX, y: 562, width: contentW, ...small, staticText: 'Customer-Specified Decision Rule:' },
      { id: 'dr_val', type: 'text', x: marginX, y: 578, width: contentW, font: 'Helvetica', fontSize: 9, dataSource: { type: 'text', key: 'service.decisionRule' } },
      { id: 'dr_line', type: 'line', x: marginX, y: 596, x1: marginX, y1: 594, x2: marginX + contentW, y2: 594, color: '#111827', width: 0.5 },

      // Terms & signatures (kept compact; close-enough layout)
      { id: 'tc_hdr', type: 'text', x: marginX, y: 606, width: contentW, font: 'Helvetica', fontSize: 11, bold: true, staticText: 'TERMS & CONDITIONS' },
      {
        id: 'tc_body',
        type: 'text',
        x: marginX,
        y: 622,
        width: contentW,
        height: 90,
        font: 'Helvetica',
        fontSize: 7.5,
        lineHeight: 9,
        staticText:
          'Traceability: All calibration results are traceable to SI units via NIMT or equivalent NMI. Calibration certificates will reference the traceability chain.\n' +
          'Confidentiality: SCS treats all customer data and technical information as strictly confidential.\n' +
          'Subcontracting: SCS does not normally subcontract calibration work. If subcontracting is required, prior written customer approval will be obtained.\n' +
          'No Urgent Service: Express or urgent service is not available. Standard turnaround time will be confirmed at contract review.',
      },

      // Intake condition + checklist
      { id: 'lab_hdr', type: 'text', x: marginX, y: 716, width: contentW, font: 'Helvetica', fontSize: 10, bold: true, staticText: 'FOR LABORATORY USE ONLY' },
      { id: 'cond_lbl', type: 'text', x: marginX, y: 734, width: 250, ...small, staticText: 'Item/Machine Condition upon Received:' },
      { id: 'cond_val', type: 'text', x: marginX + 250, y: 734, width: contentW - 250, font: 'Helvetica', fontSize: 8.5, dataSource: { type: 'text', key: 'workAuthorization.itemsConditionOnReceipt' } },

      { id: 'chk1_box', type: 'text', x: marginX, y: 756, width: 12, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'workAuthorization.preWorkChecklist.capabilityResourcesAvailable' } },
      { id: 'chk1_txt', type: 'text', x: marginX + 16, y: 756, width: contentW - 16, font: 'Helvetica', fontSize: 8.5, staticText: 'Capability & technical resources are available to perform the requested calibration' },
      { id: 'chk2_box', type: 'text', x: marginX, y: 770, width: 12, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'workAuthorization.preWorkChecklist.methodAppropriateValidatedUpToDate' } },
      { id: 'chk2_txt', type: 'text', x: marginX + 16, y: 770, width: contentW - 16, font: 'Helvetica', fontSize: 8.5, staticText: 'Calibration method is appropriate, validated, and up-to-date per current scope of accreditation' },
      { id: 'chk3_box', type: 'text', x: marginX, y: 784, width: 12, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'workAuthorization.preWorkChecklist.equipmentConditionChecked' } },
      { id: 'chk3_txt', type: 'text', x: marginX + 16, y: 784, width: contentW - 16, font: 'Helvetica', fontSize: 8.5, staticText: 'Equipment condition has been checked; equipment is suitable for calibration without remedial action' },
      { id: 'chk4_box', type: 'text', x: marginX, y: 798, width: 12, font: 'Helvetica', fontSize: 10, dataSource: { type: 'text', key: 'workAuthorization.preWorkChecklist.customerRequirementsUnderstood' } },
      { id: 'chk4_txt', type: 'text', x: marginX + 16, y: 798, width: contentW - 16, font: 'Helvetica', fontSize: 8.5, staticText: 'Customer requirements (including Decision Rule, if applicable) are understood and documented' },
    ],
  };
}

