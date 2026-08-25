/**
 * Record Template Print Service
 *
 * Wires a CalibrationRecord to the Phase 6 pdfTemplateRenderer (renderer
 * logic itself is untouched — see ADR-004). Modeled directly on
 * documentsTemplatePrintService.ts: prepare a render context, then either
 * validate it or render it to a blob.
 *
 * ADR-005: always resolves the record's PINNED template version via
 * recorderTemplateService.getVersion(templateId, templateVersion) — never
 * the live (possibly since-edited) RecorderTemplate document. This is the
 * only place that resolution happens, so it can't be forgotten by a caller.
 *
 * Lifecycle gating (Phase 7, confirmed with the owner): a draft has no
 * record number and no evaluated summary, so there is nothing to certify —
 * printing is blocked entirely (see assertPrintable). Anything else prints,
 * but committed/reviewed/superseded records get a watermark stamped on
 * every page (reusing documentPdfService's existing addWatermark helper) so
 * a working copy or a historical record is never mistaken for the current,
 * approved certificate. Only 'approved' prints clean.
 */

import type { PdfTemplate } from '../modules/pdf-template-builder/types';
import type { CalibrationRecord, ConversionRule, RecorderTemplate } from '../types';
import { pdfTemplateRenderer } from './pdfTemplateRenderer';
import { pdfDataResolver, type MissingDataReport } from './pdfDataResolver';
import { recorderTemplateService } from './recorderTemplateService';
import { getCompanyInfo, formatCompanyAddress } from './companyInfoService';
import { addWatermark } from './documentPdfService';
import { unitConversionRuleService } from './unitConversionRuleService';

/** Thrown when a record cannot be printed at all (see assertPrintable). */
export class RecordNotPrintableError extends Error {}

const WATERMARK_BY_STATUS: Partial<Record<CalibrationRecord['status'], string>> = {
  committed: 'UNAPPROVED — NOT YET REVIEWED',
  reviewed: 'UNAPPROVED — PENDING FINAL APPROVAL',
  superseded: 'SUPERSEDED — SEE REVISION',
};

/** A draft has no record number and no evaluated summary — nothing to certify yet. */
export function assertPrintable(record: CalibrationRecord): void {
  if (record.status === 'draft') {
    throw new RecordNotPrintableError('This record is still a Draft and has nothing to certify yet. Commit it first.');
  }
}

/** Resolves the record's PINNED template snapshot — never the live template document (ADR-005). */
export async function resolvePinnedTemplate(record: CalibrationRecord): Promise<RecorderTemplate> {
  const version = await recorderTemplateService.getVersion(record.templateId, record.templateVersion);
  if (!version) {
    throw new RecordNotPrintableError(
      `The template version pinned to this record (v${record.templateVersion}) no longer exists — it cannot be printed.`,
    );
  }
  return version.snapshot;
}

export class RecordTemplatePrintService {
  async prepareRecordDataContext(
    record: CalibrationRecord,
    recordTemplate: RecorderTemplate,
  ): Promise<{
    record: CalibrationRecord;
    recordTemplate: RecorderTemplate;
    /**
     * ADR-015 D2 — the shared conversion-rule library, read here so
     * `renderRecordTable`/`measureRecordTableHeights` never touch Firestore
     * themselves (same reason `company` is resolved once up front). This is
     * the LIVE rule library: Task 5's commit-time snapshot (which would let
     * an already-printed certificate stay stable even after a rule is later
     * edited) is separate work not yet wired in here — printing today always
     * reflects whatever the rule library currently says.
     */
    conversionRules: ConversionRule[];
    company?: {
      name: string; address: string; phone: string; email: string;
      website: string; fax: string; logo: string; taxId: string;
      registrationNumber: string; businessLicense: string;
    };
    footer: { text: string; page_number: number; total_pages: number };
  }> {
    const companyInfo = await getCompanyInfo();
    const companyAddress = companyInfo?.address ? formatCompanyAddress(companyInfo.address) : '';
    const conversionRules = await unitConversionRuleService.getAll();
    return {
      record,
      recordTemplate,
      conversionRules,
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
      footer: { text: '', page_number: 1, total_pages: 1 },
    };
  }

  /** Resolves the pinned template itself and validates against it. Throws RecordNotPrintableError for a draft or a missing pinned version. */
  async validateTemplate(template: PdfTemplate, record: CalibrationRecord): Promise<MissingDataReport[]> {
    assertPrintable(record);
    const recordTemplate = await resolvePinnedTemplate(record);
    const context = await this.prepareRecordDataContext(record, recordTemplate);
    return pdfDataResolver.validateTemplate(template, context as any);
  }

  async generatePdfBlob(
    template: PdfTemplate,
    record: CalibrationRecord,
    options: { continueWithNA?: boolean } = {},
  ): Promise<{ blob: Blob; missingData: MissingDataReport[] }> {
    assertPrintable(record);
    const recordTemplate = await resolvePinnedTemplate(record);
    const context = await this.prepareRecordDataContext(record, recordTemplate);
    const result = await pdfTemplateRenderer.renderTemplateWithContext(template, context as any, {
      showMissingDataAsNA: options.continueWithNA ?? false,
      missingDataLabel: 'N/A',
    });

    const watermarkText = WATERMARK_BY_STATUS[record.status];
    if (watermarkText) {
      const pageCount = result.pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        result.pdf.setPage(i);
        addWatermark(result.pdf, watermarkText, '#dc2626', 45);
      }
    }

    return {
      blob: result.pdf.output('blob'),
      missingData: result.missingData,
    };
  }
}

export const recordTemplatePrintService = new RecordTemplatePrintService();
