import type { PdfTemplate } from '../modules/pdf-template-builder/types';
import { pdfTemplateRenderer } from './pdfTemplateRenderer';
import { pdfDataResolver, type MissingDataReport } from './pdfDataResolver';
import { documentIndexService } from './documentIndexService';
import type { DocumentIndexItem } from '../types';
import { getCompanyInfo, formatCompanyAddress } from './companyInfoService';

export type OpenPrintResult = 'printed' | 'downloaded-fallback' | 'failed';

export class DocumentsTemplatePrintService {
  async prepareDocumentsDataContext(documentIndexItems?: DocumentIndexItem[]): Promise<{
    documents: { list: DocumentIndexItem[]; count: number; printDate: string };
    documentIndexItems: DocumentIndexItem[];
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
  }> {
    try {
      const items = documentIndexItems ?? (await documentIndexService.list());
      const companyInfo = await getCompanyInfo();
      const companyAddress = companyInfo?.address ? formatCompanyAddress(companyInfo.address) : '';
      return {
        documents: {
          list: items,
          count: items.length,
          printDate: new Date().toISOString(),
        },
        // Kept for compatibility with existing documents-table renderer path.
        documentIndexItems: items,
        // Inject company.* data so templates that use {company.logo} render consistently
        // with job-mode (prepareJobDataForPdf) behavior.
        company: {
          name: companyInfo?.companyName || '',
          address: companyAddress,
          phone: companyInfo?.contactInfo?.phone || '',
          email: companyInfo?.contactInfo?.email || '',
          website: companyInfo?.contactInfo?.website || '',
          fax: companyInfo?.contactInfo?.fax || '',
          logo: companyInfo?.logoBase64 || '',
          taxId: companyInfo?.additionalInfo?.taxId || '',
          registrationNumber: companyInfo?.additionalInfo?.registrationNumber || '',
          businessLicense: companyInfo?.additionalInfo?.businessLicense || '',
        },
        footer: {
          text: '',
          page_number: 1,
          total_pages: 1,
        },
      };
    } catch (e) {
      throw new Error('Failed to load documents for print.');
    }
  }

  async validateTemplate(
    template: PdfTemplate,
    options?: { documentIndexItems?: DocumentIndexItem[] }
  ): Promise<MissingDataReport[]> {
    const context = await this.prepareDocumentsDataContext(options?.documentIndexItems);
    return pdfDataResolver.validateTemplate(template, context as any);
  }

  async generatePdfBlob(
    template: PdfTemplate,
    options: { continueWithNA?: boolean; documentIndexItems?: DocumentIndexItem[] } = {}
  ): Promise<{ blob: Blob; missingData: MissingDataReport[] }> {
    const context = await this.prepareDocumentsDataContext(options.documentIndexItems);
    const result = await pdfTemplateRenderer.renderTemplateWithContext(template, context as any, {
      showMissingDataAsNA: options.continueWithNA ?? false,
      missingDataLabel: 'N/A',
    });
    return {
      blob: result.pdf.output('blob'),
      missingData: result.missingData,
    };
  }

  openBlobForPrint(blob: Blob, fileName = `documents-index-${new Date().toISOString().slice(0, 10)}.pdf`): OpenPrintResult {
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
          <head><title>Print Documents</title></head>
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
      if (frame) {
        frame.onload = () => triggerPrint();
      }
      window.setTimeout(triggerPrint, 1200);
      return 'printed';
    } catch {
      this.downloadBlob(url, fileName);
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      return 'downloaded-fallback';
    }
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

export const documentsTemplatePrintService = new DocumentsTemplatePrintService();

