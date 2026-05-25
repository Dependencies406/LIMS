/**
 * Staff PDF Service
 *
 * Generates PDF documents for staff personnel records using the PDF template
 * builder.  Works identically to documentsTemplatePrintService but uses a
 * staff-specific data context so that staff.* and training.* data sources are
 * resolved correctly.
 *
 * Data context shape (keys must match the data sources in StaffSection.tsx):
 * {
 *   staff: { name, firstName, lastName, email, position, role, status, uid, printDate }
 *   training: { records: TrainingRecord[], count: number }
 *   company:  { name, address, phone, email, website, fax, logo, ... }
 *   footer:   { text, page_number, total_pages }
 * }
 */

import type { PdfTemplate } from '../modules/pdf-template-builder/types';
import { pdfTemplateRenderer } from './pdfTemplateRenderer';
import { pdfDataResolver, type MissingDataReport } from './pdfDataResolver';
import { getCompanyInfo, formatCompanyAddress } from './companyInfoService';
import { pdfTemplateService } from './pdfTemplateService';
import type { User, TrainingRecord } from '../types';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type OpenPrintResult = 'printed' | 'downloaded-fallback' | 'failed';

export interface StaffPdfContext {
  staff: {
    name: string;
    firstName: string;
    lastName: string;
    email: string;
    position: string;
    role: string;
    status: string;
    uid: string;
    printDate: string;
  };
  training: {
    records: TrainingRecord[];
    count: number;
  };
  company?: {
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    fax: string;
    logo: string;
    taxId: string;
    registrationNumber: string;
    businessLicense: string;
  };
  footer: { text: string; page_number: number; total_pages: number };
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function staffDisplayName(u: User): string {
  return `${u.firstName} ${u.lastName}`.trim() || u.email;
}

// â”€â”€â”€ Service class â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class StaffPdfService {
  /** Build the data context passed to the PDF renderer. */
  async buildDataContext(
    staff: User,
    trainingRecords: TrainingRecord[],
  ): Promise<StaffPdfContext> {
    const companyInfo = await getCompanyInfo().catch(() => null);
    const companyAddress = companyInfo?.address
      ? formatCompanyAddress(companyInfo.address)
      : '';

    const printDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

    return {
      staff: {
        name: staffDisplayName(staff),
        firstName: staff.firstName ?? '',
        lastName: staff.lastName ?? '',
        email: staff.email,
        position: staff.position ?? '',
        role: staff.role ?? '',
        status: staff.isActive !== false ? 'Active' : 'Inactive',
        uid: staff.uid,
        printDate,
      },
      training: {
        records: trainingRecords,
        count: trainingRecords.length,
      },
      company: {
        name: companyInfo?.companyName ?? '',
        address: companyAddress,
        phone: companyInfo?.contactInfo?.phone ?? '',
        email: companyInfo?.contactInfo?.email ?? '',
        website: companyInfo?.contactInfo?.website ?? '',
        fax: companyInfo?.contactInfo?.fax ?? '',
        logo: companyInfo?.logoBase64 ?? '',
        taxId: companyInfo?.additionalInfo?.taxId ?? '',
        registrationNumber: companyInfo?.additionalInfo?.registrationNumber ?? '',
        businessLicense: companyInfo?.additionalInfo?.businessLicense ?? '',
      },
      footer: { text: '', page_number: 1, total_pages: 1 },
    };
  }

  /** Validate a template against a staff context (returns missing field reports). */
  async validateTemplate(
    template: PdfTemplate,
    staff: User,
    trainingRecords: TrainingRecord[],
  ): Promise<MissingDataReport[]> {
    const context = await this.buildDataContext(staff, trainingRecords);
    return pdfDataResolver.validateTemplate(template, context as any);
  }

  /** Generate a PDF blob for a staff personnel record. */
  async generatePdfBlob(
    template: PdfTemplate,
    staff: User,
    trainingRecords: TrainingRecord[],
    options: { continueWithNA?: boolean } = {},
  ): Promise<{ blob: Blob; missingData: MissingDataReport[] }> {
    const context = await this.buildDataContext(staff, trainingRecords);
    const result = await pdfTemplateRenderer.renderTemplateWithContext(
      template,
      context as any,
      {
        showMissingDataAsNA: options.continueWithNA ?? true,
        missingDataLabel: 'N/A',
      },
    );
    return {
      blob: result.pdf.output('blob'),
      missingData: result.missingData,
    };
  }

  /** Open the PDF blob for print / download. */
  openBlobForPrint(
    blob: Blob,
    fileName = `staff-record-${new Date().toISOString().slice(0, 10)}.pdf`,
  ): OpenPrintResult {
    const url = URL.createObjectURL(blob);
    try {
      const win = window.open('', '_blank', 'noopener,noreferrer');
      if (!win) {
        this.downloadBlob(url, fileName);
        return 'downloaded-fallback';
      }
      win.document.write(`
        <!doctype html>
        <html>
          <head><title>${fileName}</title></head>
          <body style="margin:0">
            <iframe id="pdf-frame" src="${url}" style="border:0;width:100vw;height:100vh"></iframe>
          </body>
        </html>
      `);
      win.document.close();

      const triggerPrint = () => {
        try {
          win.focus();
          win.print();
        } catch {
          this.downloadBlob(url, fileName);
        } finally {
          window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
      };
      const frame = win.document.getElementById('pdf-frame') as HTMLIFrameElement | null;
      if (frame) frame.onload = () => triggerPrint();
      window.setTimeout(triggerPrint, 1200);
      return 'printed';
    } catch {
      this.downloadBlob(url, fileName);
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      return 'downloaded-fallback';
    }
  }

  /** Fetch templates tagged for staff scope (or all templates if none are tagged). */
  async getStaffTemplates(): Promise<PdfTemplate[]> {
    const all = await pdfTemplateService.getAllTemplates();
    // Prefer templates explicitly scoped to 'staff', fall back to global/unscoped
    const staff = all.filter((t) => t.scope === 'staff');
    if (staff.length > 0) return staff;
    // If no explicit staff templates, show all templates so the user can pick any
    return all;
  }

  private downloadBlob(url: string, fileName: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export const staffPdfService = new StaffPdfService();
