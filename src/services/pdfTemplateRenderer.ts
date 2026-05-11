/**
 * PDF Template Renderer Service
 * Renders PDF templates to actual PDF documents using jsPDF
 */

const DEBUG_PDF_RENDERER = false; // set true for verbose PDF rendering logs
const debugLog = DEBUG_PDF_RENDERER ? (...a: any[]) => console.log(...a) : () => {};

import jsPDF from 'jspdf';
import type { Job, CompanyInfo, DocumentIndexItem, DocumentSource } from '../types';
import type {
  PdfTemplate,
  PdfElement,
  TextElement,
  ImageElement,
  LineElement,
  RectangleElement,
  CheckboxElement,
  ChartElement,
  EquipmentTableElement,
  DocumentsTableElement,
  TrebTableElement,
} from '../modules/pdf-template-builder/types';
import { assertNever } from '../modules/pdf-template-builder/types';
import { renderEquipmentTable } from './pdf-renderers/renderEquipmentTable';
import { renderDocumentsTable } from './pdf-renderers/renderDocumentsTable';
import type { RendererHelpers } from './pdf-renderers/rendererHelpers';
import { documentIndexService } from './documentIndexService';
import { pdfDataResolver, type MissingDataReport } from './pdfDataResolver';
import { getCompanyInfo, formatCompanyAddress } from './companyInfoService';
import { customerService } from './customerService';
import { userService } from './userService';
import { getDataSourceDiscovery } from './dataSourceDiscoveryService';
import { spreadsheetTemplateService } from './spreadsheetTemplateService';
import { computeSafeLineHeight, layoutTextToLines } from './pdfTextLayoutService';
import { pdfFontManager } from './pdfFontManager';
import { formatDateForDisplay } from '../utils/dateDisplayFormatter';
import { evaluateSpreadsheet } from '../modules/spreadsheet/services/spreadsheetEngine';
import type { TREBDocument } from '@trebco/treb';
import { trebDocumentToSpreadsheetModel, getDisplayValueForCell } from '../modules/spreadsheet/utils/trebDocumentUtils';
import { generateCellId, parseCellId, type SpreadsheetModel, type SpreadsheetTab, type Cell } from '../modules/spreadsheet/models/SpreadsheetModel';

export interface RenderOptions {
  showMissingDataAsNA?: boolean;
  missingDataLabel?: string;
  selectedEquipmentIndex?: number; // Equipment index that user has selected/currently viewing
  /** Optional: key = tabId, value = serialized TREB 2D array data for treb-table elements */
  trebDataRegistry?: Record<string, unknown>;
}

/**
 * Job data shape passed to element renderers. Includes prepared job/company/customer
 * and optional TREB data for treb-table elements.
 */
export interface PdfRenderJobData {
  [key: string]: unknown;
  footer?: { text: string; page_number: number; total_pages: number };
  trebDataRegistry?: Record<string, unknown>;
  /** Print area per (templateId, tabId): key `${spreadsheetTemplateId}:${sourceTabId}` -> range e.g. "A1:F15". From template tabPrintAreas. */
  trebPrintAreaByTab?: Record<string, string>;
  /** Full Documents Index rows (documentIndexService.list order) for documents-table elements */
  documentIndexItems?: DocumentIndexItem[];
}

export interface RenderResult {
  pdf: jsPDF;
  missingData: MissingDataReport[];
}

/** Generic element slices for template-page overflow continuation. */
export type ElementSlicePlan = {
  elementId: string;
  slices: Array<{ start: number; end: number }>;
  splitCount: number;
};

type SubPageRenderContext = {
  subPageIndex: number;
  subPageCount: number;
  pageDimensions: { width: number; height: number };
  slicePlans: Map<string, ElementSlicePlan>;
};

export class PdfTemplateRenderer {
  private readonly MISSING_DATA_LABEL = '-';
  private readonly PDF_TABLE_BOTTOM_MARGIN_PT = 50;
  private readonly TEXT_ELLIPSIS = '…';

  private truncateTextToWidth(pdf: jsPDF, text: string, maxWidth: number): string {
    const raw = String(text ?? '');
    const width = Math.max(1, maxWidth);
    if (!raw) return '';
    if (pdf.getTextWidth(raw) <= width) return raw;

    const ell = this.TEXT_ELLIPSIS;
    if (pdf.getTextWidth(ell) > width) return ''; // cannot fit anything meaningful

    // Binary search longest prefix that fits with ellipsis
    let lo = 0;
    let hi = raw.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = raw.slice(0, mid) + ell;
      if (pdf.getTextWidth(candidate) <= width) lo = mid;
      else hi = mid - 1;
    }
    return raw.slice(0, Math.max(0, lo)) + ell;
  }

  /**
   * Render template to PDF
   */
  async renderTemplate(
    template: PdfTemplate,
    job: Job,
    options: RenderOptions = {}
  ): Promise<RenderResult> {
    // Normalize pages (backward compatible: single-page templates use template.elements)
    const pages = template.pages && template.pages.length > 0
      ? template.pages
      : [{
          id: 'page_1',
          pageNumber: 1,
          pageSize: template.pageSize,
          orientation: template.orientation ?? 'portrait',
          elements: template.elements || [],
          backgroundPdf: template.backgroundPdf,
        }];
    
    // Create PDF document using first page size and orientation
    const firstPageSize = pages[0]?.pageSize || template.pageSize;
    const firstOrientation = pages[0]?.orientation ?? template.orientation ?? 'portrait';
    const firstPageDimensions = this.getPageDimensions(firstPageSize, firstOrientation);
    const pdf = new jsPDF({
      orientation: firstOrientation,
      unit: 'pt',
      format: [firstPageDimensions.width, firstPageDimensions.height],
    });
    await pdfFontManager.ensureFontsReadyForPdf(pdf);

    // Prepare job data with company info (includes company data from settings)
    const prepared = await this.prepareJobDataForPdf(job);
    const jobData: PdfRenderJobData = await this.ensureDocumentIndexItems(prepared as PdfRenderJobData);
    if (options.trebDataRegistry) {
      jobData.trebDataRegistry = options.trebDataRegistry;
    } else {
      // Build TREB data registry from job equipment spreadsheets so treb-table elements can render
      const trebBuild = await this.buildTrebDataRegistry(template, job, options.selectedEquipmentIndex);
      jobData.trebDataRegistry = trebBuild.registry;
      if (trebBuild.trebPrintAreaByTab && Object.keys(trebBuild.trebPrintAreaByTab).length > 0) {
        jobData.trebPrintAreaByTab = trebBuild.trebPrintAreaByTab;
      }
    }

    // Validate template with prepared data (includes company info)
    // Pass selectedEquipmentIndex for context-aware validation
    const missingData = pdfDataResolver.validateTemplate(template, jobData as any, options.selectedEquipmentIndex);

    if (!jobData.footer) {
      jobData.footer = {
        text: '',
        page_number: 1,
        total_pages: 1,
      };
    }

    /**
     * Template-page overflow model (v1):
     * - Per template page, sub-page count = max(splitCount) among dynamic table elements on that page.
     * - Multiple stacked dynamic tables: assumes non-overlapping vertical layout; if one table needs more slices than another,
     *   smaller tables either repeat full content (splitCount===1, preference B) or stop after their slices.
     * - treb-table: always drawn in full on every sub-page (splitCount 1 for planning).
     */
    const subPageCounts: number[] = [];
    let totalPhysicalPages = 0;
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const page = pages[pageIndex];
      const pageSize = page.pageSize || template.pageSize;
      const orientation = page.orientation ?? template.orientation ?? 'portrait';
      const pageDimensions = this.getPageDimensions(pageSize, orientation);
      const slicePlans = this.buildElementSlicePlansForTemplatePage(page, jobData, pageDimensions, pdf, options);
      const subCount = this.countSubPagesFromPlans(page.elements || [], slicePlans);
      subPageCounts.push(subCount);
      totalPhysicalPages += subCount;
    }

    jobData.footer.total_pages = Math.max(1, totalPhysicalPages);

    let physicalIndex = 0;
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const page = pages[pageIndex];
      const pageSize = page.pageSize || template.pageSize;
      const orientation = page.orientation ?? template.orientation ?? 'portrait';
      const pageDimensions = this.getPageDimensions(pageSize, orientation);
      const slicePlans = this.buildElementSlicePlansForTemplatePage(page, jobData, pageDimensions, pdf, options);
      const subCount = subPageCounts[pageIndex] ?? 1;

      for (let k = 0; k < subCount; k += 1) {
        if (physicalIndex > 0) {
          pdf.addPage([pageDimensions.width, pageDimensions.height], orientation);
        }
        jobData.footer.page_number = physicalIndex + 1;
        jobData.footer.total_pages = Math.max(1, totalPhysicalPages);

        const ctx: SubPageRenderContext = {
          subPageIndex: k,
          subPageCount: subCount,
          pageDimensions,
          slicePlans,
        };

        for (const element of page.elements || []) {
          await this.renderElementInSubPageContext(pdf, element, jobData, options, ctx);
        }
        physicalIndex += 1;
      }
    }

    return {
      pdf,
      missingData,
    };
  }

  /**
   * Render template using a prebuilt data context (non-job flows, e.g. Documents print).
   * This path intentionally skips prepareJobDataForPdf and any customer/job lookups.
   */
  async renderTemplateWithContext(
    template: PdfTemplate,
    preparedDataContext: PdfRenderJobData,
    options: RenderOptions = {}
  ): Promise<RenderResult> {
    const pages = template.pages && template.pages.length > 0
      ? template.pages
      : [{
          id: 'page_1',
          pageNumber: 1,
          pageSize: template.pageSize,
          orientation: template.orientation ?? 'portrait',
          elements: template.elements || [],
          backgroundPdf: template.backgroundPdf,
        }];

    const firstPageSize = pages[0]?.pageSize || template.pageSize;
    const firstOrientation = pages[0]?.orientation ?? template.orientation ?? 'portrait';
    const firstPageDimensions = this.getPageDimensions(firstPageSize, firstOrientation);
    const pdf = new jsPDF({
      orientation: firstOrientation,
      unit: 'pt',
      format: [firstPageDimensions.width, firstPageDimensions.height],
    });
    await pdfFontManager.ensureFontsReadyForPdf(pdf);

    const jobData: PdfRenderJobData = await this.ensureDocumentIndexItems({
      ...preparedDataContext,
      footer: preparedDataContext.footer ?? { text: '', page_number: 1, total_pages: 1 },
    });
    const missingData = pdfDataResolver.validateTemplate(template, jobData as any, options.selectedEquipmentIndex);

    const subPageCounts: number[] = [];
    let totalPhysicalPages = 0;
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const page = pages[pageIndex];
      const pageSize = page.pageSize || template.pageSize;
      const orientation = page.orientation ?? template.orientation ?? 'portrait';
      const pageDimensions = this.getPageDimensions(pageSize, orientation);
      const slicePlans = this.buildElementSlicePlansForTemplatePage(page, jobData, pageDimensions, pdf, options);
      const subCount = this.countSubPagesFromPlans(page.elements || [], slicePlans);
      subPageCounts.push(subCount);
      totalPhysicalPages += subCount;
    }

    jobData.footer!.total_pages = Math.max(1, totalPhysicalPages);
    let physicalIndex = 0;
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const page = pages[pageIndex];
      const pageSize = page.pageSize || template.pageSize;
      const orientation = page.orientation ?? template.orientation ?? 'portrait';
      const pageDimensions = this.getPageDimensions(pageSize, orientation);
      const slicePlans = this.buildElementSlicePlansForTemplatePage(page, jobData, pageDimensions, pdf, options);
      const subCount = subPageCounts[pageIndex] ?? 1;

      for (let k = 0; k < subCount; k += 1) {
        if (physicalIndex > 0) {
          pdf.addPage([pageDimensions.width, pageDimensions.height], orientation);
        }
        jobData.footer!.page_number = physicalIndex + 1;
        jobData.footer!.total_pages = Math.max(1, totalPhysicalPages);
        const ctx: SubPageRenderContext = {
          subPageIndex: k,
          subPageCount: subCount,
          pageDimensions,
          slicePlans,
        };
        for (const element of page.elements || []) {
          await this.renderElementInSubPageContext(pdf, element, jobData, options, ctx);
        }
        physicalIndex += 1;
      }
    }

    return { pdf, missingData };
  }

  private applyContentFont(
    pdf: jsPDF,
    text: string,
    requestedFamily: string | undefined,
    requestedStyle: 'normal' | 'bold' | 'italic' | 'bolditalic',
    fontSize: number
  ): void {
    pdfFontManager.applyFont(pdf, {
      textSample: text,
      requestedFamily,
      requestedStyle,
      fontSize,
    });
  }

  private getPaginationMode(el: PdfElement): 'static' | 'dynamic' {
    if (el.paginationMode) return el.paginationMode;
    if (el.overflowRole) return el.overflowRole;
    return el.type === 'equipment-table' || el.type === 'documents-table' || el.type === 'treb-table' ? 'dynamic' : 'static';
  }

  /** Dynamic vs static for overflow continuation pages. */
  private elementIsDynamic(el: PdfElement): boolean {
    return this.getPaginationMode(el) === 'dynamic';
  }

  private shouldRepeatOnOverflowPages(el: PdfElement): boolean {
    return el.repeatOnOverflowPages ?? true;
  }

  private getTableViewportHeight(element: PdfElement, pageDim: { width: number; height: number }): number {
    if (typeof element.height === 'number' && element.height > 0) {
      return element.height;
    }
    return Math.max(40, pageDim.height - element.y - this.PDF_TABLE_BOTTOM_MARGIN_PT);
  }

  /**
   * Split data row indices into chunks that fit in viewport height including header.
   */
  private computeTableRowSlices(
    headerHeight: number,
    rowHeights: number[],
    viewportHeight: number
  ): Array<{ start: number; end: number }> {
    if (rowHeights.length === 0) {
      return [{ start: 0, end: 0 }];
    }
    const vh = Math.max(24, viewportHeight);
    const slices: Array<{ start: number; end: number }> = [];
    let i = 0;
    while (i < rowHeights.length) {
      let used = headerHeight;
      const start = i;
      while (i < rowHeights.length && used + rowHeights[i] <= vh) {
        used += rowHeights[i];
        i++;
      }
      if (i === start) {
        i = start + 1;
      }
      slices.push({ start, end: i });
    }
    return slices.length ? slices : [{ start: 0, end: 0 }];
  }

  private countSubPagesFromPlans(elements: PdfElement[], plans: Map<string, ElementSlicePlan>): number {
    let maxSub = 1;
    for (const el of elements) {
      if (!this.elementIsDynamic(el)) continue;
      if (el.type === 'treb-table') {
        maxSub = Math.max(maxSub, 1);
        continue;
      }
      const p = plans.get(el.id);
      if (p) maxSub = Math.max(maxSub, p.splitCount);
    }
    return Math.max(1, maxSub);
  }

  private buildElementSlicePlansForTemplatePage(
    page: { elements?: PdfElement[] },
    jobData: PdfRenderJobData,
    pageDimensions: { width: number; height: number },
    pdf: jsPDF,
    options: RenderOptions
  ): Map<string, ElementSlicePlan> {
    const map = new Map<string, ElementSlicePlan>();
    for (const el of page.elements || []) {
      if (!this.elementIsDynamic(el)) continue;
      if (el.type === 'text') {
        map.set(el.id, this.planTextElement(el as TextElement, jobData, pageDimensions, pdf, options));
      } else if (el.type === 'equipment-table') {
        map.set(el.id, this.planEquipmentTableElement(el as EquipmentTableElement, jobData, pageDimensions, pdf));
      } else if (el.type === 'documents-table') {
        map.set(el.id, this.planDocumentsTableElement(el as DocumentsTableElement, jobData, pageDimensions, pdf));
      }
    }
    return map;
  }

  private planEquipmentTableElement(
    element: EquipmentTableElement,
    jobData: any,
    pageDimensions: { width: number; height: number },
    pdf: jsPDF
  ): ElementSlicePlan {
    const { headerHeight, rowHeights } = this.measureEquipmentTableHeights(pdf, element, jobData);
    const viewport = this.getTableViewportHeight(element, pageDimensions);
    const slices = this.computeTableRowSlices(headerHeight, rowHeights, viewport);
    return {
      elementId: element.id,
      slices,
      splitCount: Math.max(1, slices.length),
    };
  }

  private planDocumentsTableElement(
    element: DocumentsTableElement,
    jobData: PdfRenderJobData,
    pageDimensions: { width: number; height: number },
    pdf: jsPDF
  ): ElementSlicePlan {
    const { headerHeight, rowHeights } = this.measureDocumentsTableHeights(pdf, element, jobData);
    const viewport = this.getTableViewportHeight(element, pageDimensions);
    const slices = this.computeTableRowSlices(headerHeight, rowHeights, viewport);
    return {
      elementId: element.id,
      slices,
      splitCount: Math.max(1, slices.length),
    };
  }

  private planTextElement(
    element: TextElement,
    jobData: any,
    pageDimensions: { width: number; height: number },
    pdf: jsPDF,
    options: RenderOptions
  ): ElementSlicePlan {
    const resolved = this.resolveTextElementContent(element, jobData, options);
    if (!resolved || !resolved.text) {
      return { elementId: element.id, slices: [{ start: 0, end: 0 }], splitCount: 1 };
    }
    const fontSize = resolved.fontSize;
    const lineHeight = resolved.lineHeight;
    const width = Math.max(20, element.width ?? 150);
    const viewportHeight = (typeof element.height === 'number' && element.height > 0)
      ? element.height
      : Math.max(24, pageDimensions.height - element.y - this.PDF_TABLE_BOTTOM_MARGIN_PT);

    this.applyContentFont(pdf, resolved.text, resolved.font, resolved.fontStyle as any, fontSize);
    const lines = this.wrapTextForCell(resolved.text, width, fontSize, pdf);
    const linesPerSlice = Math.max(1, Math.floor(viewportHeight / Math.max(1, lineHeight)));
    const slices: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < lines.length; i += linesPerSlice) {
      slices.push({ start: i, end: Math.min(lines.length, i + linesPerSlice) });
    }
    if (slices.length === 0) slices.push({ start: 0, end: 0 });
    return { elementId: element.id, slices, splitCount: Math.max(1, slices.length) };
  }

  private async renderElementInSubPageContext(
    pdf: jsPDF,
    element: PdfElement,
    jobData: PdfRenderJobData,
    options: RenderOptions,
    ctx: SubPageRenderContext
  ): Promise<void> {
    const k = ctx.subPageIndex;
    const plans = ctx.slicePlans;

    if (!this.elementIsDynamic(element)) {
      if (k > 0 && !this.shouldRepeatOnOverflowPages(element)) {
        return;
      }
      await this.renderElement(pdf, element, jobData, options);
      return;
    }

    if (element.type === 'treb-table') {
      await this.renderTrebTableElement(pdf, element as TrebTableElement, jobData, options);
      return;
    }

    if (element.type === 'equipment-table') {
      const plan = plans.get(element.id);
      if (!plan || plan.splitCount <= 1) {
        this.renderEquipmentTableElement(pdf, element as EquipmentTableElement, jobData);
        return;
      }
      if (k < plan.slices.length) {
        const sl = plan.slices[k];
        this.renderEquipmentTableElement(pdf, element as EquipmentTableElement, jobData, {
          rowStart: sl.start,
          rowEnd: sl.end,
        });
        return;
      }
      if (this.shouldRepeatOnOverflowPages(element)) {
        this.renderEquipmentTableElement(pdf, element as EquipmentTableElement, jobData);
      }
      return;
    }

    if (element.type === 'documents-table') {
      const plan = plans.get(element.id);
      if (!plan || plan.splitCount <= 1) {
        this.renderDocumentsTableElement(pdf, element as DocumentsTableElement, jobData);
        return;
      }
      if (k < plan.slices.length) {
        const sl = plan.slices[k];
        this.renderDocumentsTableElement(pdf, element as DocumentsTableElement, jobData, {
          rowStart: sl.start,
          rowEnd: sl.end,
        });
        return;
      }
      if (this.shouldRepeatOnOverflowPages(element)) {
        this.renderDocumentsTableElement(pdf, element as DocumentsTableElement, jobData);
      }
      return;
    }

    if (element.type === 'text') {
      const plan = plans.get(element.id);
      if (!plan || plan.splitCount <= 1) {
        this.renderTextElement(pdf, element as TextElement, jobData, options);
        return;
      }
      if (k < plan.slices.length) {
        const sl = plan.slices[k];
        this.renderTextElement(pdf, element as TextElement, jobData, options, {
          lineStart: sl.start,
          lineEnd: sl.end,
        });
        return;
      }
      if (this.shouldRepeatOnOverflowPages(element)) {
        this.renderTextElement(pdf, element as TextElement, jobData, options);
      }
      return;
    }

    await this.renderElement(pdf, element, jobData, options);
  }

  private async ensureDocumentIndexItems(jobData: PdfRenderJobData): Promise<PdfRenderJobData> {
    if (Array.isArray(jobData.documentIndexItems)) {
      return jobData;
    }
    let documentIndexItems: DocumentIndexItem[] = [];
    try {
      documentIndexItems = await documentIndexService.list();
    } catch (e) {
      console.warn('[PDF] documentIndexService.list failed; documents-table may be empty.', e);
    }
    return { ...jobData, documentIndexItems };
  }

  /**
   * Render a single element
   */
  private async renderElement(
    pdf: jsPDF,
    element: PdfElement,
    jobData: any,
    options: RenderOptions
  ): Promise<void> {
    switch (element.type) {
      case 'text':
        this.renderTextElement(pdf, element as TextElement, jobData, options);
        break;
      case 'image':
        await this.renderImageElement(pdf, element as ImageElement, jobData, options);
        break;
      case 'line':
        this.renderLineElement(pdf, element as LineElement);
        break;
      case 'rectangle':
        this.renderRectangleElement(pdf, element as RectangleElement);
        break;
      case 'checkbox':
        this.renderCheckboxElement(pdf, element as CheckboxElement, jobData);
        break;
      case 'chart':
        this.renderChartElement(pdf, element as ChartElement);
        break;
      case 'equipment-table':
        this.renderEquipmentTableElement(pdf, element as EquipmentTableElement, jobData);
        break;
      case 'documents-table':
        this.renderDocumentsTableElement(pdf, element as DocumentsTableElement, jobData);
        break;
      case 'treb-table':
        await this.renderTrebTableElement(pdf, element as TrebTableElement, jobData, options);
        break;
      default:
        // If TypeScript raises an error here, a new PdfElementType was added
        // but renderElement has no case for it. Add a render case above to fix.
        assertNever((element as PdfElement).type as never);
    }
  }

  /**
   * Format date according to format string
   */
  private formatDate(date: Date | string | undefined | null, format: string | undefined): string {
    if (!date) return '';

    // Handle Firestore Timestamp objects (have a toDate() method)
    const rawDate: any = date;
    if (rawDate && typeof rawDate.toDate === 'function') {
      return this.formatDate(rawDate.toDate() as Date, format);
    }

    const dateObj = date instanceof Date ? date : new Date(date as string);
    if (isNaN(dateObj.getTime())) return String(date); // Invalid date, return as-is

    if (!format) {
      // Shared UI/PDF display contract (local timezone, short month/day/year)
      return formatDateForDisplay(dateObj);
    }

    const day = dateObj.getDate();
    const month = dateObj.getMonth();
    const year = dateObj.getFullYear();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const pad = (n: number) => n.toString().padStart(2, '0');
    const year2 = year.toString().slice(-2);
    const dayStr = day.toString();
    const monthNumStr = pad(month + 1);

    // Replace format tokens (longer patterns first so MMMM/MMM/Month are not broken by MM)
    let formatted = format
      .replace(/MMMM/g, monthNames[month])
      .replace(/MMM/g, monthAbbr[month])
      .replace(/Month/g, monthNames[month])
      .replace(/MM/g, monthNumStr)
      .replace(/DD/g, pad(day))
      .replace(/\bD\b/g, dayStr)  // single D = day without leading zero (e.g. 24)
      .replace(/YYYY/g, year.toString())
      .replace(/YY/g, year2);

    return formatted;
  }

  /**
   * Format number according to format string
   */
  private formatNumber(num: number | string | undefined | null, format: string | undefined): string {
    if (num === null || num === undefined) return '';
    
    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(numValue)) return String(num); // Invalid number, return as-is

    if (!format) {
      return String(numValue);
    }

    // Handle percentage formats
    if (format.includes('%')) {
      const decimals = (format.match(/\.(\d+)/)?.[1] || '0').length;
      const multiplier = 100;
      const formatted = (numValue * multiplier).toFixed(decimals);
      return `${formatted}%`;
    }

    // Handle decimal formats
    const hasComma = format.includes(',');
    const decimals = (format.match(/\.(\d+)/)?.[1] || '0').length;
    
    let formatted = numValue.toFixed(decimals);
    
    // Add thousands separator
    if (hasComma && decimals > 0) {
      const parts = formatted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      formatted = parts.join('.');
    } else if (hasComma) {
      formatted = formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    return formatted;
  }

  /**
   * Normalize text before drawing to PDF so unsupported Unicode chars are replaced
   * with safe equivalents that jsPDF fonts can render.
   */
  private normalizePdfText(value: string): string {
    if (!value) return '';
    let s = value;
    // Map Unicode degree Celsius symbol to "°C"
    s = s.replace(/\u2103/g, '°C');
    // Normalize non-breaking space to regular space
    s = s.replace(/\u00A0/g, ' ');
    return s;
  }

  /**
   * Render text element
   */
  private renderTextElement(
    pdf: jsPDF,
    element: TextElement,
    jobData: any,
    options: RenderOptions,
    slice?: { lineStart: number; lineEnd: number }
  ): void {
    const resolved = this.resolveTextElementContent(element, jobData, options);
    if (!resolved || !resolved.text) return;
    const { text, font, fontSize, color, align, fontStyle, lineHeight } = resolved;

    this.applyContentFont(pdf, text, font, fontStyle as any, fontSize);
    pdf.setTextColor(color);

    if ((resolved as any).renderAs === 'checkbox') {
      this.drawCheckbox(pdf, element, !!(resolved as any).checked, color);
      return;
    }

    // Calculate text position
    // For jsPDF, the x coordinate is the alignment point:
    // - 'left': x is the left edge
    // - 'center': x is the center point
    // - 'right': x is the right edge
    const elementX = element.x;
    const elementWidth = element.width || 150;
    let textX = elementX;
    
    if (align === 'center') {
      textX = elementX + elementWidth / 2;
    } else if (align === 'right') {
      textX = elementX + elementWidth; // Right edge of the text box
    }
    // For 'left', textX = elementX (left edge)

    const isDynamic = this.elementIsDynamic(element as any);
    const allowMultiLine = isDynamic || (typeof element.height === 'number' && element.height > 0) || !!slice;
    const allLines = allowMultiLine
      ? this.wrapTextForCell(text, elementWidth, fontSize, pdf)
      : [this.truncateTextToWidth(pdf, text, elementWidth)];
    const elementHeight =
      typeof element.height === 'number' && element.height > 0 ? element.height : undefined;
    const maxLinesByHeight =
      elementHeight ? Math.max(1, Math.floor(elementHeight / Math.max(1, lineHeight))) : undefined;

    let lines = slice
      ? allLines.slice(Math.max(0, slice.lineStart), Math.max(0, slice.lineEnd))
      : allLines;

    // Safety: never paint beyond element.height (prevents overlapping other elements).
    // Pagination is controlled by paginationMode; static text will clip, dynamic text will be sliced upstream.
    if (maxLinesByHeight !== undefined) {
      lines = lines.slice(0, maxLinesByHeight);
    }

    // ── Vertical alignment within the element's bounding box ──────────────
    // Only applies when a non-zero height is set; otherwise fall back to 'top'.
    const boxHeight = typeof element.height === 'number' && element.height > 0 ? element.height : 0;
    const totalTextHeight = lines.length > 1 ? (lines.length - 1) * lineHeight + fontSize : fontSize;
    const verticalAlign = (element as any).verticalAlign || 'top';

    let startY: number;
    if (boxHeight > 0 && verticalAlign === 'middle') {
      // Centre the text block inside the box
      startY = element.y + (boxHeight - totalTextHeight) / 2 + fontSize;
    } else if (boxHeight > 0 && verticalAlign === 'bottom') {
      // Align the bottom of the last line to the bottom of the box
      startY = element.y + boxHeight - (lines.length - 1) * lineHeight;
    } else {
      // 'top' (default) — baseline of first line at y + fontSize
      startY = element.y + fontSize;
    }

    let y = startY;
    for (const line of lines) {
      pdf.text(line, textX, y, {
        align: align as any,
      });
      y += lineHeight;
    }
  }

  private resolveTextElementContent(
    element: TextElement,
    jobData: any,
    options: RenderOptions
  ): {
    text: string;
    font: string;
    fontSize: number;
    color: string;
    align: 'left' | 'center' | 'right';
    fontStyle: string;
    lineHeight: number;
    renderAs?: 'checkbox';
    checked?: boolean;
  } | null {
    let text = '';
    if (element.dataSource?.key) {
      const resolved = pdfDataResolver.resolveDataSource(element.dataSource.key, jobData, options.selectedEquipmentIndex);
      if (resolved.isValid) {
        let dataSourceType = element.dataSource.type;
        if (!dataSourceType || dataSourceType === 'text') {
          const discovery = getDataSourceDiscovery();
          const ds = discovery.getDataSource(element.dataSource.key);
          if (ds?.type && (ds.type === 'date' || ds.type === 'number')) dataSourceType = ds.type;
        }
        if (dataSourceType === 'date' && element.dateFormat) text = this.formatDate(resolved.value, element.dateFormat);
        else if (dataSourceType === 'number' && element.numberFormat) text = this.formatNumber(resolved.value, element.numberFormat);
        else if (typeof resolved.value === 'boolean') {
          // If this looks like a checkbox cell, render it with vector drawing (font-independent).
          const w = element.width ?? 0;
          const h = element.height ?? 0;
          const likelyCheckbox = w > 0 && w <= 18 && (h === 0 || h <= 18);
          if (likelyCheckbox) {
            text = ' ';
            const font = element.font || 'Helvetica';
            const fontSize = element.fontSize || 12;
            const color = element.color || '#000000';
            const align = element.align || 'left';
            let fontStyle = 'normal';
            if (element.bold && element.italic) fontStyle = 'bolditalic';
            else if (element.bold) fontStyle = 'bold';
            else if (element.italic) fontStyle = 'italic';
            const lineHeight =
              element.lineHeight && element.lineHeight > 0 ? element.lineHeight : computeSafeLineHeight({ fontSize, text: 'X' });
            return { text, font, fontSize, color, align, fontStyle, lineHeight, renderAs: 'checkbox', checked: resolved.value };
          }
          text = resolved.value ? 'Yes' : 'No';
        }
        else text = String(resolved.value);
      } else {
        text = options.showMissingDataAsNA ? this.MISSING_DATA_LABEL : '';
      }
    } else if (element.staticText !== undefined) {
      text = element.staticText || '';
    } else {
      return null;
    }
    text = this.normalizePdfText(text);
    if (!text) return null;

    const font = element.font || 'Helvetica';
    const fontSize = element.fontSize || 12;
    const color = element.color || '#000000';
    const align = element.align || 'left';
    let fontStyle = 'normal';
    if (element.bold && element.italic) fontStyle = 'bolditalic';
    else if (element.bold) fontStyle = 'bold';
    else if (element.italic) fontStyle = 'italic';
    const lineHeight = element.lineHeight && element.lineHeight > 0 ? element.lineHeight : computeSafeLineHeight({ fontSize, text });
    return { text, font, fontSize, color, align, fontStyle, lineHeight };
  }

  private drawCheckbox(pdf: jsPDF, element: TextElement, checked: boolean, strokeColor: string): void {
    const size = Math.max(8, Math.min(element.width ?? 12, element.height ?? element.width ?? 12, 14));
    const x = element.x;
    const y = element.y + 1;
    pdf.setDrawColor(strokeColor);
    pdf.setLineWidth(1);
    pdf.rect(x, y, size, size);
    if (!checked) return;
    pdf.setLineWidth(1.4);
    pdf.line(x + size * 0.20, y + size * 0.55, x + size * 0.42, y + size * 0.78);
    pdf.line(x + size * 0.42, y + size * 0.78, x + size * 0.82, y + size * 0.25);
  }

  /**
   * Render image element
   */
  private async renderImageElement(
    pdf: jsPDF,
    element: ImageElement,
    jobData: any,
    options: RenderOptions
  ): Promise<void> {
    let imageValue: any = null;
    
    // Check if element has dataSource or direct image URL/path
    if (element.dataSource?.key) {
      // Use dataSource
      const resolved = pdfDataResolver.resolveDataSource(element.dataSource.key, jobData, options.selectedEquipmentIndex);
      
      if (!resolved.isValid) {
        if (options.showMissingDataAsNA) {
          // Render "N/A" text instead
          pdf.setFontSize(12);
          pdf.setTextColor('#999999');
          pdf.text(this.MISSING_DATA_LABEL, element.x, element.y + 12);
        }
        return;
      }
      
      imageValue = resolved.value;
    } else if (element.imageUrl) {
      // Use direct image URL
      imageValue = element.imageUrl;
    } else if (element.imagePath) {
      // Use direct image path
      imageValue = element.imagePath;
    } else {
      // No dataSource or direct URL/path - skip rendering
      return;
    }

    if (!imageValue) return;

    try {
      // Handle different image value types:
      // 1. Already base64 string (starts with "data:")
      // 2. URL string (http/https)
      // 3. DigitalSignature object with signatureData property
      // 4. Object (Firebase Storage reference) - convert to URL first
      let imageData: string;
      
      if (typeof imageValue === 'string') {
        if (imageValue.startsWith('data:')) {
          // Already base64, use directly
          imageData = imageValue;
        } else {
          // URL string, convert to base64
          imageData = await this.imageUrlToBase64(imageValue);
        }
      } else if (typeof imageValue === 'object' && imageValue !== null) {
        const obj = imageValue as any;
        
        // Check if it's a DigitalSignature object with signatureData property
        if (obj.signatureData && typeof obj.signatureData === 'string') {
          // DigitalSignature object - use signatureData directly (should be base64)
          if (obj.signatureData.startsWith('data:')) {
            imageData = obj.signatureData;
          } else {
            // If it's not a data URL, treat it as base64 or URL
            imageData = await this.imageUrlToBase64(obj.signatureData);
          }
        } else if (obj.fullPath || obj.path) {
          // Firebase Storage reference - need to get download URL
          const { storage, storageRef, getDownloadURL } = await import('./firebase');
          const storageReference = storageRef(storage, obj.fullPath || obj.path);
          const url = await getDownloadURL(storageReference);
          imageData = await this.imageUrlToBase64(url);
        } else {
          throw new Error('Image value is an object but cannot be converted to URL');
        }
      } else {
        throw new Error(`Invalid image value type: ${typeof imageValue}`);
      }
      
      // Calculate dimensions
      let width = element.width || 100;
      let height = element.height || 100;

      // Maintain aspect ratio if specified
      if (element.maintainAspect && imageData) {
        // For now, use provided dimensions
        // TODO: Calculate actual aspect ratio from image dimensions
      }

      // Add image to PDF
      pdf.addImage(imageData, 'PNG', element.x, element.y, width, height);
    } catch (error) {
      console.error('Failed to render image:', error);
      if (options.showMissingDataAsNA) {
        pdf.setFontSize(12);
        pdf.setTextColor('#999999');
        pdf.text(this.MISSING_DATA_LABEL, element.x, element.y + 12);
      }
    }
  }

  /**
   * Render line element
   */
  private renderLineElement(pdf: jsPDF, element: LineElement): void {
    pdf.setDrawColor(element.color || '#000000');
    pdf.setLineWidth(element.width || 1);
    pdf.line(element.x1, element.y1, element.x2, element.y2);
  }

  /**
   * Render rectangle element
   */
  private renderRectangleElement(pdf: jsPDF, element: RectangleElement): void {
    if (element.fillColor) {
      pdf.setFillColor(element.fillColor);
      pdf.rect(element.x, element.y, element.width || 100, element.height || 100, 'F');
    }
    
    if (element.strokeColor) {
      pdf.setDrawColor(element.strokeColor);
      pdf.setLineWidth(element.strokeWidth || 1);
      pdf.rect(element.x, element.y, element.width || 100, element.height || 100);
    }
  }

  /**
   * Render checkbox element.
   * Draws a square box; if checked draws a checkmark / X / filled square inside.
   * Supports static `checked` boolean and dynamic data-bound keys (truthy = checked).
   */
  private renderCheckboxElement(pdf: jsPDF, element: CheckboxElement, jobData: any): void {
    const size = element.size ?? 10;
    const x = element.x;
    const y = element.y;
    const strokeColor = element.strokeColor || '#000000';
    const strokeWidth = element.strokeWidth ?? 0.75;
    const checkColor = element.checkColor || '#000000';

    // ── Resolve checked state ────────────────────────────────────────
    let isChecked = element.checked ?? false;
    if (element.dataSource?.key) {
      const rawValue = this.resolveNestedPath(jobData, element.dataSource.key);
      if (rawValue !== null && rawValue !== undefined) {
        // Treat as checked if truthy and not the string literals 'false' / '0' / ''
        isChecked = Boolean(rawValue) && rawValue !== 'false' && rawValue !== '0' && rawValue !== '';
      }
    }

    // ── Draw the box ─────────────────────────────────────────────────
    pdf.setDrawColor(strokeColor);
    pdf.setLineWidth(strokeWidth);
    pdf.rect(x, y, size, size);

    // ── Draw check mark ──────────────────────────────────────────────
    if (isChecked) {
      const style = element.checkStyle ?? 'checkmark';
      const pad = size * 0.18;

      if (style === 'filled') {
        pdf.setFillColor(checkColor);
        pdf.rect(x + pad, y + pad, size - pad * 2, size - pad * 2, 'F');
      } else if (style === 'x') {
        pdf.setDrawColor(checkColor);
        pdf.setLineWidth(strokeWidth + 0.5);
        pdf.line(x + pad, y + pad, x + size - pad, y + size - pad);
        pdf.line(x + size - pad, y + pad, x + pad, y + size - pad);
      } else {
        // checkmark ✓ — two lines: short stroke down-right, long stroke up-right
        pdf.setDrawColor(checkColor);
        pdf.setLineWidth(strokeWidth + 0.5);
        const mid = { x: x + size * 0.35, y: y + size - pad };
        pdf.line(x + pad, y + size * 0.55, mid.x, mid.y);
        pdf.line(mid.x, mid.y, x + size - pad, y + pad);
      }
    }

    // ── Draw label ───────────────────────────────────────────────────
    if (element.label) {
      const fontSize = element.labelFontSize ?? 9;
      pdf.setFontSize(fontSize);
      pdf.setTextColor('#000000');
      const fontStyle = element.labelBold ? 'bold' : 'normal';
      pdf.setFont('Helvetica', fontStyle);

      // Vertically centre the text baseline with the box
      const labelY = y + size * 0.78;
      const gap = 3; // pt gap between box edge and text
      const labelX = element.labelPosition === 'left'
        ? x - pdf.getTextWidth(element.label) - gap
        : x + size + gap;

      pdf.text(element.label, labelX, labelY);
    }
  }

  /** Resolve a dot-path key against a nested object (e.g. 'job.customer.name') */
  private resolveNestedPath(obj: any, path: string): unknown {
    return path.split('.').reduce((cur, key) => {
      if (cur === null || cur === undefined) return undefined;
      return (cur as Record<string, unknown>)[key];
    }, obj as unknown);
  }

  /**
   * Render chart element. Placeholder: draws a bordered box and title.
   * Full data-driven chart (from dataSource) can be added later via Chart.js or similar.
   */
  private renderChartElement(pdf: jsPDF, element: ChartElement): void {
    const w = element.width ?? 300;
    const h = element.height ?? 200;
    pdf.setDrawColor('#cccccc');
    pdf.setLineWidth(1);
    pdf.rect(element.x, element.y, w, h);
    pdf.setFillColor('#f5f5f5');
    pdf.rect(element.x, element.y, w, h, 'FD');
    pdf.setFontSize(10);
    pdf.setTextColor('#666666');
    const title = element.title || 'Chart';
    pdf.text(title, element.x + w / 2, element.y + h / 2, { align: 'center' });
  }

  /**
   * Wrap text to fit within max width (pt). Returns array of lines.
   */
  private wrapTextForCell(text: string, maxWidth: number, fontSize: number, pdf: jsPDF): string[] {
    const raw = String(text ?? '');
    // IMPORTANT: never pass newline-containing strings to jsPDF text()
    // because jsPDF will render them as multi-line at the same baseline y,
    // which causes visual overlap when we also advance y per "line".
    const paragraphs = raw.split(/\r?\n/);
    const out: string[] = [];
    for (let i = 0; i < paragraphs.length; i += 1) {
      const p = paragraphs[i] ?? '';
      const lines = layoutTextToLines({ text: p, maxWidth, pdf, fontSize });
      out.push(...lines);
      // Preserve blank line between paragraphs (except after the last)
      if (i < paragraphs.length - 1) out.push('');
    }
    return out.length > 0 ? out : [''];
  }

  private measureEquipmentTableHeights(
    pdf: jsPDF,
    element: EquipmentTableElement,
    jobData: any
  ): { headerHeight: number; rowHeights: number[] } {
    const equipment: any[] = Array.isArray(jobData.equipment) ? jobData.equipment : [];
    const columns = (element.columns || [])
      .filter((c: any) => c.visible !== false)
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    if (columns.length === 0) return { headerHeight: 0, rowHeights: [] };

    const fontSize = element.fontSize ?? element.cellStyle?.fontSize ?? 9;
    const headerFontSize = element.headerFontSize ?? element.headerStyle?.fontSize ?? 10;
    const headerStyle = element.headerStyle || {};
    const headerSample = columns.map((c: any) => String(c.label || c.id || '')).join(' ');
    const bodySample = equipment.map((eq: any) => columns.map((c: any) => String(eq?.[c.id] ?? '')).join(' ')).join(' ');
    const lineHeight = computeSafeLineHeight({ fontSize, text: bodySample });
    const headerLineHeight = computeSafeLineHeight({ fontSize: headerFontSize, text: headerSample });
    const cellPadding = 4;
    const defaultRowHeight = 18;

    const colWidths = columns.map((c: any) => c.width ?? 60);

    this.applyContentFont(pdf, columns.map((c: any) => c.label || c.id).join(' '), undefined, headerStyle.bold ? 'bold' : 'normal', headerFontSize);
    let headerHeight = defaultRowHeight;
    for (let idx = 0; idx < columns.length; idx++) {
      const col = columns[idx];
      const cellWidth = colWidths[idx] - cellPadding * 2;
      const lines = this.wrapTextForCell(col.label || col.id, cellWidth, headerFontSize, pdf);
      const cellHeight =
        lines.length > 0 ? lines.length * headerLineHeight + cellPadding * 2 : defaultRowHeight;
      headerHeight = Math.max(headerHeight, cellHeight);
    }

    const emptyLabel = '-';
    const rowHeights: number[] = [];
    this.applyContentFont(pdf, equipment.map((eq) => columns.map((c: any) => String(eq?.[c.id] ?? '')).join(' ')).join(' '), undefined, (element.cellStyle || {}).bold ? 'bold' : 'normal', fontSize);
    for (const eq of equipment) {
      const cellTexts: string[][] = columns.map((col: any) => {
        const raw = eq[col.id];
        const val =
          raw === undefined || raw === null || String(raw).trim() === '' ? emptyLabel : String(raw).trim();
        return this.wrapTextForCell(val, colWidths[columns.indexOf(col)] - cellPadding * 2, fontSize, pdf);
      });
      let rowHeight = defaultRowHeight;
      for (const lines of cellTexts) {
        rowHeight = Math.max(rowHeight, lines.length * lineHeight + cellPadding * 2);
      }
      rowHeights.push(rowHeight);
    }
    return { headerHeight, rowHeights };
  }

  /**
   * Render equipment table element.
   * Logic lives in: src/services/pdf-renderers/renderEquipmentTable.ts
   */
  private renderEquipmentTableElement(
    pdf: jsPDF,
    element: EquipmentTableElement,
    jobData: any,
    slice?: { rowStart: number; rowEnd: number }
  ): void {
    renderEquipmentTable(pdf, element, jobData, slice, this.getRendererHelpers());
  }

  private formatDocumentSourceForPdf(source: DocumentSource | undefined): string {
    if (!source || typeof source !== 'object') return '—';
    if (source.kind === 'pdf') {
      const name = (source as any).fileName || '';
      if (name) return `PDF: ${this.normalizePdfText(String(name))}`;
      const path = (source as any).storagePath || '';
      if (path) return `PDF: ${this.normalizePdfText(String(path))}`;
      return this.normalizePdfText(String((source as any).url || '—'));
    }
    return this.normalizePdfText(String((source as any).url || '—'));
  }

  private getDocumentsTableCellText(item: DocumentIndexItem, colId: string): string {
    switch (colId) {
      case 'documentCode':
        return item.documentCode || '-';
      case 'type':
        return item.type || '-';
      case 'revisionNumber':
        return item.revisionNumber || '-';
      case 'documentName':
        return item.documentName || '-';
      case 'effectiveDate':
        return item.effectiveDate ? this.formatDate(item.effectiveDate as any, undefined) : '-';
      case 'darNumber':
        return item.darNumber || '—';
      case 'source':
        return this.formatDocumentSourceForPdf(item.source);
      case 'darSource':
        return item.darSource ? this.formatDocumentSourceForPdf(item.darSource) : '—';
      default:
        return '-';
    }
  }

  private measureDocumentsTableHeights(
    pdf: jsPDF,
    element: DocumentsTableElement,
    jobData: PdfRenderJobData
  ): { headerHeight: number; rowHeights: number[] } {
    const items: DocumentIndexItem[] = Array.isArray(jobData.documentIndexItems)
      ? (jobData.documentIndexItems as DocumentIndexItem[])
      : [];
    const columns = (element.columns || [])
      .filter((c: any) => c.visible !== false)
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    if (columns.length === 0) return { headerHeight: 0, rowHeights: [] };

    const fontSize = element.fontSize ?? element.cellStyle?.fontSize ?? 9;
    const headerFontSize = element.headerFontSize ?? element.headerStyle?.fontSize ?? 10;
    const headerStyle = element.headerStyle || {};
    const headerSample = columns.map((c: any) => String(c.label || c.id || '')).join(' ');
    const bodySample = items.map((it) => columns.map((c: any) => this.getDocumentsTableCellText(it, c.id)).join(' ')).join(' ');
    const lineHeight = computeSafeLineHeight({ fontSize, text: bodySample });
    const headerLineHeight = computeSafeLineHeight({ fontSize: headerFontSize, text: headerSample });
    const cellPadding = 4;
    const defaultRowHeight = 18;
    const colWidths = columns.map((c: any) => c.width ?? 60);

    this.applyContentFont(pdf, columns.map((c: any) => c.label || c.id).join(' '), undefined, headerStyle.bold ? 'bold' : 'normal', headerFontSize);
    let headerHeight = defaultRowHeight;
    for (let idx = 0; idx < columns.length; idx++) {
      const col = columns[idx];
      const cellWidth = colWidths[idx] - cellPadding * 2;
      const lines = this.wrapTextForCell(col.label || col.id, cellWidth, headerFontSize, pdf);
      const cellHeight =
        lines.length > 0 ? lines.length * headerLineHeight + cellPadding * 2 : defaultRowHeight;
      headerHeight = Math.max(headerHeight, cellHeight);
    }

    const rowHeights: number[] = [];
    this.applyContentFont(pdf, items.map((it) => columns.map((c: any) => this.getDocumentsTableCellText(it, c.id)).join(' ')).join(' '), undefined, (element.cellStyle || {}).bold ? 'bold' : 'normal', fontSize);
    for (const item of items) {
      const cellTexts: string[][] = columns.map((col: any) => {
        const val = this.getDocumentsTableCellText(item, col.id);
        return this.wrapTextForCell(val, colWidths[columns.indexOf(col)] - cellPadding * 2, fontSize, pdf);
      });
      let rowHeight = defaultRowHeight;
      for (const lines of cellTexts) {
        rowHeight = Math.max(rowHeight, lines.length * lineHeight + cellPadding * 2);
      }
      rowHeights.push(rowHeight);
    }
    return { headerHeight, rowHeights };
  }

  /**
   * Documents index table.
   * Logic lives in: src/services/pdf-renderers/renderDocumentsTable.ts
   */
  private renderDocumentsTableElement(
    pdf: jsPDF,
    element: DocumentsTableElement,
    jobData: PdfRenderJobData,
    slice?: { rowStart: number; rowEnd: number }
  ): void {
    renderDocumentsTable(pdf, element, jobData as any, slice, this.getRendererHelpers());
  }

  /**
   * Parse A1-style column letters to 0-based index (A=0, B=1, ..., Z=25, AA=26, ...).
   */
  private parseColLetters(letters: string): number {
    let n = 0;
    const s = letters.toUpperCase();
    for (let i = 0; i < s.length; i++) {
      n = n * 26 + (s.charCodeAt(i) - 64);
    }
    return n - 1;
  }

  /**
   * Parse renderRange string (e.g. 'A1:F15') into 0-based row/col bounds.
   * Returns { rowStart, rowEnd, colStart, colEnd } or null if invalid.
   */
  private parseTrebRange(range: string): { rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null {
    const m = range.match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/);
    if (!m) return null;
    const [, col1, row1, col2, row2] = m;
    const rowStart = Math.max(0, parseInt(row1!, 10) - 1);
    const rowEnd = Math.max(0, parseInt(row2!, 10) - 1);
    const colStart = Math.max(0, this.parseColLetters(col1!));
    const colEnd = Math.max(0, this.parseColLetters(col2!));
    return {
      rowStart: Math.min(rowStart, rowEnd),
      rowEnd: Math.max(rowStart, rowEnd),
      colStart: Math.min(colStart, colEnd),
      colEnd: Math.max(colStart, colEnd),
    };
  }

  /**
   * Render TREB table element to match the TREB spreadsheet module: same cell padding, text wrap,
   * row heights, borders, alignment, and merged cells. Data from jobData.trebDataRegistry[sourceTabId]
   * (2D array or { data, columnWidths?, merges? }). Merges are 0-based inclusive
   * { startRow, startCol, endRow, endCol }. Uses element.width for total width.
   */
  private async renderTrebTableElement(
    pdf: jsPDF,
    element: TrebTableElement,
    jobData: PdfRenderJobData,
    _options: RenderOptions
  ): Promise<void> {
    const raw = jobData.trebDataRegistry?.[element.sourceTabId];
    const rawEntryObj: any | null =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as any) : null;
    const tableWidth = element.width || 200;
    const fontSize = element.fontSize ?? 9;
    const cellPadding = 4;
    let lineHeight = computeSafeLineHeight({ fontSize, text: '' });
    const minRowHeight = 18;

    // Support registry value as 2D array or { data, columnWidths?, rowHeights?, merges?, cellBorders?, cellStyles? }
    type MergeRange = { startRow: number; startCol: number; endRow: number; endCol: number };
    type CellBordersMap = Record<string, { top: number; right: number; bottom: number; left: number }>;
    type CellStyleInfo = { bold?: boolean; align?: 'left' | 'center' | 'right'; fillColor?: string; textColor?: string };
    type CellStylesMap = Record<string, CellStyleInfo>;
    let data: (string | number)[][];
    let colWidths: number[] | null = null;
    let sheetRowHeights: number[] | null = null;
    let merges: MergeRange[] = [];
    let cellBorders: CellBordersMap | null = null;
    let cellStyles: CellStylesMap | null = null;
    // Normalize cell value to what the user sees in the grid (never show "undefined"/"null" or raw formula)
    const sanitizeCellForDisplay = (v: unknown): string | number => {
      if (v === undefined || v === null) return '';
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
      const raw = String(v).trim();
      if (raw === 'undefined' || raw === 'null' || raw === '') return '';
      return this.normalizePdfText(raw);
    };
    if (raw != null && typeof raw === 'object' && !Array.isArray(raw) && 'data' in (raw as any)) {
      const obj = raw as {
        data: (string | number)[][];
        columnWidths?: number[];
        rowHeights?: number[];
        merges?: MergeRange[];
        cellBorders?: CellBordersMap;
        cellStyles?: CellStylesMap;
      };
      const rawData = Array.isArray(obj.data) ? obj.data : [];
      data = rawData.map((row) => (Array.isArray(row) ? row.map((cell) => sanitizeCellForDisplay(cell)) : []));
      if (Array.isArray(obj.columnWidths) && obj.columnWidths.length > 0) colWidths = obj.columnWidths;
      if (Array.isArray(obj.rowHeights) && obj.rowHeights.length > 0) sheetRowHeights = obj.rowHeights;
      if (Array.isArray(obj.merges) && obj.merges.length > 0) merges = obj.merges;
      if (obj.cellBorders && typeof obj.cellBorders === 'object' && Object.keys(obj.cellBorders).length > 0) cellBorders = obj.cellBorders;
      if (obj.cellStyles && typeof obj.cellStyles === 'object' && Object.keys(obj.cellStyles).length > 0) {
        cellStyles = obj.cellStyles;
      }
    } else if (Array.isArray(raw) && raw.length > 0) {
      data = (raw as unknown[]).map((row: unknown) =>
        Array.isArray(row)
          ? (row as (string | number)[]).map((cell: unknown) => sanitizeCellForDisplay(cell))
          : []
      );
    } else {
      data = [];
    }

    // Print area: element.renderRange overrides; else use template's tabPrintAreas[sourceTabId]; else full grid
    let printBounds: { r0: number; r1: number; c0: number; c1: number } | null = null;
    const effectiveRange =
      (typeof element.renderRange === 'string' && element.renderRange.trim())
        ? element.renderRange.trim()
        : (jobData.trebPrintAreaByTab?.[`${element.spreadsheetTemplateId ?? ''}:${element.sourceTabId ?? ''}`]?.trim() || undefined);
    if (data.length > 0 && effectiveRange) {
      const bounds = this.parseTrebRange(effectiveRange);
      if (bounds) {
        const maxRow = data.length - 1;
        const maxCol = Math.max(0, ...data.map((r) => (r?.length ?? 0) - 1), 0);
        const rowStart = Math.max(0, Math.min(bounds.rowStart, maxRow));
        const rowEnd = Math.max(0, Math.min(bounds.rowEnd, maxRow));
        const colStart = Math.max(0, Math.min(bounds.colStart, maxCol));
        const colEnd = Math.max(0, Math.min(bounds.colEnd, maxCol));
        const r0 = Math.min(rowStart, rowEnd);
        const r1 = Math.max(rowStart, rowEnd);
        const c0 = Math.min(colStart, colEnd);
        const c1 = Math.max(colStart, colEnd);
        printBounds = { r0, r1, c0, c1 };

        data = data.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1));

        if (colWidths && colWidths.length > c1) {
          colWidths = colWidths.slice(c0, c1 + 1);
        }
        if (sheetRowHeights && sheetRowHeights.length > r1) {
          sheetRowHeights = sheetRowHeights.slice(r0, r1 + 1);
        }

        const rebasedMerges: MergeRange[] = [];
        for (const m of merges) {
          const mr0 = m.startRow;
          const mc0 = m.startCol;
          const mr1 = m.endRow;
          const mc1 = m.endCol;
          if (mr1 < r0 || mr0 > r1 || mc1 < c0 || mc0 > c1) continue;
          rebasedMerges.push({
            startRow: Math.max(mr0, r0) - r0,
            startCol: Math.max(mc0, c0) - c0,
            endRow: Math.min(mr1, r1) - r0,
            endCol: Math.min(mc1, c1) - c0,
          });
        }
        merges = rebasedMerges;

        if (cellBorders && Object.keys(cellBorders).length > 0) {
          const nextBorders: CellBordersMap = {};
          for (const key of Object.keys(cellBorders)) {
            const [row, col] = key.split(',').map(Number);
            if (row >= r0 && row <= r1 && col >= c0 && col <= c1) {
              nextBorders[`${row - r0},${col - c0}`] = cellBorders[key];
            }
          }
          cellBorders = Object.keys(nextBorders).length > 0 ? nextBorders : null;
        }
        if (cellStyles && Object.keys(cellStyles).length > 0) {
          const nextStyles: CellStylesMap = {};
          for (const key of Object.keys(cellStyles)) {
            const [row, col] = key.split(',').map(Number);
            if (row >= r0 && row <= r1 && col >= c0 && col <= c1) {
              nextStyles[`${row - r0},${col - c0}`] = cellStyles[key];
            }
          }
          cellStyles = Object.keys(nextStyles).length > 0 ? nextStyles : null;
        }
      }
    }

    const isDebugTrebTable = DEBUG_PDF_RENDERER && import.meta.env?.DEV;
    lineHeight = computeSafeLineHeight({ fontSize, text: data.flat().map((v) => String(v ?? '')).join(' ') });

    if (isDebugTrebTable) {
      console.log('[TrebTable filter info]', {
        sourceTabId: element.sourceTabId,
        hasRawEntry: !!rawEntryObj,
        hasTrebCoords: !!rawEntryObj?.trebCoords,
        trebCoordsCount: Array.isArray(rawEntryObj?.trebCoords) ? rawEntryObj.trebCoords.length : 0,
        printBounds,
        dataRows: data.length,
        dataCols: data[0]?.length ?? 0,
      });
    }

    // If trebCoords are missing for this entry, rebuild them from the template's TREB document so the filter can run.
    if (
      (!rawEntryObj?.trebCoords || !Array.isArray(rawEntryObj.trebCoords) || rawEntryObj.trebCoords.length === 0) &&
      element.spreadsheetTemplateId &&
      element.sourceTabId
    ) {
      try {
        const tpl = await spreadsheetTemplateService.getByIdFromServer(element.spreadsheetTemplateId);
        const doc = tpl?.trebDocument as TREBDocument | undefined;
        if (doc && typeof doc === 'object' && (doc as any).sheet_data != null) {
          let sheetName = '';
          const tab = tpl?.tabs?.find((t) => t.id === element.sourceTabId);
          if (tab?.name?.trim()) sheetName = tab.name.trim();
          else sheetName = element.sourceTabId;
          const sheetForCoords = this.getSheetByName(doc as any, sheetName);
          if (sheetForCoords) {
            const trebCellsForTab = this.extractSheetCells(sheetForCoords);
            const trebCoords = trebCellsForTab.map((c) => ({ row: c.row, column: c.column }));
            if (trebCoords.length > 0) {
              if (rawEntryObj) rawEntryObj.trebCoords = trebCoords;
            }
          }
        }
      } catch (e) {
        if (isDebugTrebTable) {
          console.warn('[TrebTable] Failed to rebuild trebCoords at render time', e);
        }
      }
    }

    // After print-area slicing, ensure only real TREB cells inside that range can show values.
    // Use trebCoords captured in the registry entry to blank any sliced cell that has no backing TREB cell.
    if (printBounds && rawEntryObj?.trebCoords && Array.isArray(rawEntryObj.trebCoords)) {
      const { r0, r1, c0, c1 } = printBounds;
      const allowedLocalCoords = new Set<string>();
      for (const coord of rawEntryObj.trebCoords as Array<{ row: number; column: number }>) {
        const row = coord.row;
        const col = coord.column;
        if (row >= r0 && row <= r1 && col >= c0 && col <= c1) {
          const localRow = row - r0;
          const localCol = col - c0;
          allowedLocalCoords.add(`${localRow},${localCol}`);
        }
      }
      if (allowedLocalCoords.size > 0) {
        for (let i = 0; i < data.length; i++) {
          const rowArr = data[i] ?? [];
          for (let j = 0; j < rowArr.length; j++) {
            const key = `${i},${j}`;
            if (!allowedLocalCoords.has(key)) {
              rowArr[j] = '';
            }
          }
          data[i] = rowArr;
        }
      }
    }

    // Fallback (null state): data missing or 0 rows
    if (data.length === 0 || (data[0] && data[0].length === 0)) {
      if (typeof (pdf as any).saveGraphicsState === 'function') (pdf as any).saveGraphicsState();
      (pdf as any).setLineDash?.([3, 3], 0);
      pdf.setDrawColor(150, 150, 150);
      pdf.setLineWidth(1);
      pdf.rect(element.x, element.y, tableWidth, 50);
      pdf.setFontSize(10);
      pdf.setTextColor(150, 150, 150);
      pdf.text('N/A - Data Not Found', element.x + tableWidth / 2, element.y + 25, { align: 'center' });
      (pdf as any).setLineDash?.([]);
      if (typeof (pdf as any).restoreGraphicsState === 'function') (pdf as any).restoreGraphicsState();
      return;
    }

    const numCols = Math.max(...data.map((r) => r.length), 1);
    const totalColWidth = colWidths ? colWidths.reduce((a, b) => a + b, 0) : 0;
    const scale = totalColWidth > 0 ? tableWidth / totalColWidth : 1;
    const widths: number[] =
      colWidths && colWidths.length >= numCols
        ? colWidths.slice(0, numCols).map((w) => w * scale)
        : Array(numCols).fill(tableWidth / numCols);
    // Scale for row heights: same as column scale so proportions are preserved
    const rowScale = scale;

    // Merged cells: set of (row,col) that are inside a merge but not the top-left; map of top-left -> { endRow, endCol }
    const covered = new Set<string>();
    const mergeTopLeft = new Map<string, { endRow: number; endCol: number }>();
    for (const m of merges) {
      const r0 = m.startRow;
      const c0 = m.startCol;
      const r1 = m.endRow;
      const c1 = m.endCol;
      if (r0 > r1 || c0 > c1) continue;
      mergeTopLeft.set(`${r0},${c0}`, { endRow: r1, endCol: c1 });
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (r !== r0 || c !== c0) covered.add(`${r},${c}`);
        }
      }
    }

    const isCovered = (r: number, c: number) => covered.has(`${r},${c}`);
    const getMergeSpan = (r: number, c: number): { endRow: number; endCol: number } | null =>
      mergeTopLeft.get(`${r},${c}`) ?? null;

    // Cell style = TREB sheet (cell override → row_style → column_style → sheet_style). cellStyles/cellBorders
    // were built from getCellStyleFromSheet + cellStyleInfoFromSheet/extractCellBorders; print-area slice re-keys
    // so (row,col) refer to the sliced grid.
    const borderColorRaw = element.borderColor || '#000000';
    const borderColorRgb = this.normalizeFillColorForPdf(String(borderColorRaw));
    const borderColor = borderColorRgb ? [borderColorRgb[0], borderColorRgb[1], borderColorRgb[2]] as [number, number, number] : ([0, 0, 0] as [number, number, number]);
    const borderWidth = element.borderWidth ?? 1;
    this.applyContentFont(pdf, data.flat().map((c) => String(c ?? '')).join(' '), undefined, 'normal', fontSize);
    pdf.setTextColor(0, 0, 0);
    pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    pdf.setLineWidth(borderWidth);

    /** Draw borders only where the cell has border set (when cellBorders is present); otherwise draw full rect if no cellBorders. */
    const drawCellBordersIfSet = (x: number, y: number, w: number, h: number, row: number, col: number) => {
      pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      pdf.setLineWidth(borderWidth);
      const borders = cellBorders?.[`${row},${col}`];
      if (borders) {
        if (borders.top > 0) pdf.line(x, y, x + w, y);
        if (borders.bottom > 0) pdf.line(x, y + h, x + w, y + h);
        if (borders.left > 0) pdf.line(x, y, x, y + h);
        if (borders.right > 0) pdf.line(x + w, y, x + w, y + h);
      } else if (!cellBorders) {
        pdf.rect(x, y, w, h);
      }
    };

    const getAlignedX = (x: number, w: number, align: 'left' | 'center' | 'right', text: string): number => {
      const tw = pdf.getTextWidth(text);
      if (align === 'center') return x + (w - tw) / 2;
      if (align === 'right') return x + w - tw - cellPadding;
      return x + cellPadding;
    };

    const isNumeric = (v: string | number): boolean =>
      typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)));

    const getCellStyle = (row: number, col: number): CellStyleInfo =>
      (cellStyles && cellStyles[`${row},${col}`]) || {};
    const totalTableWidth = widths.reduce((a, b) => a + (b ?? 0), 0);

    // Row heights: use actual sheet dimensions when available, otherwise compute from content
    const rowHeights: number[] = [];
    if (sheetRowHeights && sheetRowHeights.length > 0) {
      for (let i = 0; i < data.length; i++) {
        const h = sheetRowHeights[i];
        const scaled = h != null && Number(h) > 0 ? Number(h) * rowScale : minRowHeight;
        rowHeights[i] = Math.max(minRowHeight, scaled);
      }
      for (let i = 0; i < data.length; i++) {
        if (rowHeights[i] == null) rowHeights[i] = minRowHeight;
      }
    } else {
      // First pass: compute row heights from content (only non-covered cells; merge top-left uses merged width for wrap)
      for (let i = 0; i < data.length; i++) {
        let rowHeight = minRowHeight;
        const row = data[i] ?? [];
        for (let j = 0; j < numCols; j++) {
          if (isCovered(i, j)) continue;
          const cellValue = sanitizeCellForDisplay(row[j]);
          const str = typeof cellValue === 'number' ? String(cellValue) : cellValue;
          const span = getMergeSpan(i, j);
          let cellW: number;
          if (span) {
            cellW = 0;
            for (let c = j; c <= span.endCol && c < widths.length; c++) cellW += widths[c] ?? 0;
            cellW -= cellPadding * 2;
          } else {
            cellW = (widths[j] ?? tableWidth / numCols) - cellPadding * 2;
          }
          const lines = this.wrapTextForCell(str, Math.max(1, cellW), fontSize, pdf);
          const needH = lines.length * lineHeight + cellPadding * 2;
          rowHeight = Math.max(rowHeight, needH);
        }
        rowHeights[i] = rowHeight;
      }
      for (let i = 0; i < data.length; i++) {
        if (rowHeights[i] == null) rowHeights[i] = minRowHeight;
      }
    }

    let currentY = element.y;
    const startX = element.x;

    for (let i = 0; i < data.length; i++) {
      const row = data[i] ?? [];
      const rowHeight = rowHeights[i] ?? minRowHeight;
      let cx = startX;

      for (let j = 0; j < numCols; j++) {
        if (isCovered(i, j)) {
          cx += widths[j] ?? tableWidth / numCols;
          continue;
        }
        if (DEBUG_PDF_RENDERER && import.meta.env?.DEV && i <= 2 && j <= 5) {
          console.log('[PDF render grid]', element.sourceTabId, `${i},${j}`, {
            rawGridValue: row[j],
            afterSanitize: sanitizeCellForDisplay(row[j]),
          });
        }

        const span = getMergeSpan(i, j);
        if (span) {
          const r1 = span.endRow;
          const c1 = span.endCol;
          let mergeW = 0;
          let mergeH = 0;
          for (let c = j; c <= c1 && c < widths.length; c++) mergeW += widths[c] ?? 0;
          for (let r = i; r <= r1 && r < rowHeights.length; r++) mergeH += rowHeights[r] ?? minRowHeight;
          const style = getCellStyle(i, j);
          if (DEBUG_PDF_RENDERER && import.meta.env?.DEV && i <= 2 && j <= 5) {
            console.log('[PDF render style]', element.sourceTabId, `${i},${j}`, style);
          }
          const fillRgb = style.fillColor ? this.normalizeFillColorForPdf(style.fillColor) : null;
          if (fillRgb) {
            pdf.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
            pdf.rect(cx, currentY, mergeW, mergeH, 'F');
          }
          drawCellBordersIfSet(cx, currentY, mergeW, mergeH, i, j);
          const cellValue = sanitizeCellForDisplay(row[j]);
          const str = typeof cellValue === 'number' ? String(cellValue) : cellValue;
          const lines = this.wrapTextForCell(str, Math.max(1, mergeW - cellPadding * 2), fontSize, pdf);
          const align: 'left' | 'center' | 'right' =
            style.align ?? (isNumeric(cellValue) ? 'right' : 'left');
          const textRgb = style.textColor ? this.normalizeFillColorForPdf(style.textColor) : null;
          if (textRgb) pdf.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
          this.applyContentFont(pdf, str, undefined, style.bold ? 'bold' : 'normal', fontSize);
          let ly = currentY + cellPadding + fontSize;
          for (const line of lines) {
            const tx = getAlignedX(cx, mergeW, align, line);
            pdf.text(line, tx, ly, { maxWidth: mergeW - cellPadding * 2 });
            ly += lineHeight;
          }
          pdf.setTextColor(0, 0, 0);
          this.applyContentFont(pdf, '', undefined, 'normal', fontSize);
          for (let c = j; c <= c1; c++) cx += widths[c] ?? tableWidth / numCols;
          j = c1; // skip columns covered by this merge
          continue;
        }

        const w = widths[j] ?? tableWidth / numCols;
        const style = getCellStyle(i, j);
        if (DEBUG_PDF_RENDERER && import.meta.env?.DEV && i <= 2 && j <= 5) {
          console.log('[PDF render style]', element.sourceTabId, `${i},${j}`, style);
        }
        const fillRgb = style.fillColor ? this.normalizeFillColorForPdf(style.fillColor) : null;
        if (fillRgb) {
          pdf.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
          pdf.rect(cx, currentY, w, rowHeight, 'F');
        }
        drawCellBordersIfSet(cx, currentY, w, rowHeight, i, j);
        const cellValue = sanitizeCellForDisplay(row[j]);
        const str = typeof cellValue === 'number' ? String(cellValue) : cellValue;
        const lines = this.wrapTextForCell(str, Math.max(1, w - cellPadding * 2), fontSize, pdf);
        const align: 'left' | 'center' | 'right' =
          style.align ?? (isNumeric(cellValue) ? 'right' : 'left');
        const textRgb = style.textColor ? this.normalizeFillColorForPdf(style.textColor) : null;
        if (textRgb) pdf.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
        this.applyContentFont(pdf, str, undefined, style.bold ? 'bold' : 'normal', fontSize);
        let ly = currentY + cellPadding + fontSize;
        for (const line of lines) {
          const tx = getAlignedX(cx, w, align, line);
          pdf.text(line, tx, ly, { maxWidth: w - cellPadding * 2 });
          ly += lineHeight;
        }
        pdf.setTextColor(0, 0, 0);
        this.applyContentFont(pdf, '', undefined, 'normal', fontSize);
        cx += w;
      }
      currentY += rowHeight;
      if (i === 0) {
        const headerHasBottomBorder = cellBorders && Array.from({ length: numCols }, (_, col) => (cellBorders[`0,${col}`]?.bottom ?? 0) > 0).some(Boolean);
        if (!headerHasBottomBorder && totalTableWidth > 0) {
          pdf.setDrawColor(85, 85, 85);
          pdf.setLineWidth(1);
          pdf.line(startX, currentY, startX + totalTableWidth, currentY);
          pdf.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
          pdf.setLineWidth(borderWidth);
        }
      }
    }
  }

  /**
   * Get page dimensions in pt. For landscape, width and height are swapped.
   */
  private getPageDimensions(pageSize: 'A4' | 'Letter' | 'A3' | 'A5', orientation: 'portrait' | 'landscape' = 'portrait'): { width: number; height: number } {
    const dimensions = {
      A4: { width: 595, height: 842 },
      Letter: { width: 612, height: 792 },
      A3: { width: 842, height: 1191 },
      A5: { width: 420, height: 595 },
    };
    const d = dimensions[pageSize];
    return orientation === 'landscape' ? { width: d.height, height: d.width } : d;
  }

  /**
   * Prepare job data with company info
   * Maps CompanyInfo from settings to company.* data sources for PDF templates
   * This makes company information from settings available to all PDF templates
   */
  async prepareJobDataForPdf(job: Job): Promise<any> {
    // Get company info and customer name
    const companyInfo = await getCompanyInfo();
    const customer = job.customerCode ? await customerService.getCustomerByCode(job.customerCode) : null;
    const customerName = customer?.name || job.customerName || '';

    // Resolve user IDs to names
    const assignedStaffName = job.assignedStaff ? await this.getUserNameById(job.assignedStaff) : '';

    const base = this.prepareJobData(job, companyInfo, customerName, assignedStaffName);
    let documentIndexItems: DocumentIndexItem[] = [];
    try {
      documentIndexItems = await documentIndexService.list();
    } catch (e) {
      console.warn('[PDF] documentIndexService.list failed; documents-table may be empty.', e);
    }
    return { ...base, documentIndexItems };
  }

  /**
   * Get user name by ID (returns empty string if user not found)
   */
  private async getUserNameById(userId: string): Promise<string> {
    try {
      const user = await userService.getUserById(userId);
      return user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.email || userId;
    } catch (error) {
      console.warn(`Failed to get user name for ID: ${userId}`, error);
      return userId; // Fallback to ID if user not found
    }
  }

  /**
   * Extract (row, column, value, calculated, rawEntry) from a TREB sheet's data array.
   * rawEntry is the TREB cell object so the grid build can use getDisplayValueForCell (display-first, blank formula, number format).
   */
  private extractSheetCells(sheet: any): Array<{ row: number; column: number; value: unknown; calculated?: unknown; rawEntry?: any }> {
    const out: Array<{ row: number; column: number; value: unknown; calculated?: unknown; rawEntry?: any }> = [];
    const arr = Array.isArray(sheet?.data) ? sheet.data : [];
    for (const entry of arr) {
      const calc = (entry as any).calculated ?? (entry as any).result;
      if (typeof entry?.row === 'number' && typeof entry?.column === 'number') {
        out.push({ row: entry.row, column: entry.column, value: entry.value, calculated: calc, rawEntry: entry });
        continue;
      }
      if (typeof entry?.row === 'number' && Array.isArray(entry.cells)) {
        for (const c of entry.cells) {
          if (typeof c?.column === 'number') {
            const subCalc = (c as any).calculated ?? (c as any).result;
            out.push({ row: entry.row, column: c.column, value: c.value, calculated: subCalc, rawEntry: c });
          }
        }
        continue;
      }
      if (typeof entry?.column === 'number' && Array.isArray(entry.cells)) {
        for (const c of entry.cells) {
          if (typeof c?.row === 'number') {
            const subCalc = (c as any).calculated ?? (c as any).result;
            out.push({ row: c.row, column: entry.column, value: c.value, calculated: subCalc, rawEntry: c });
          }
        }
      }
    }
    return out;
  }

  /** Get a single cell's value/calculated from a TREB sheet by row/column (0-based). */
  private getCellInTrebSheet(sheet: any, row: number, col: number): { value: unknown; calculated?: unknown } | null {
    const cells = this.extractSheetCells(sheet);
    const c = cells.find((x) => x.row === row && x.column === col);
    return c ? { value: c.value, calculated: c.calculated } : null;
  }

  /** Merge range: 0-based inclusive [startRow, startCol, endRow, endCol]. Top-left is (startRow, startCol). */
  private extractMergeRanges(sheet: any): Array<{ startRow: number; startCol: number; endRow: number; endCol: number }> {
    const out: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }> = [];
    const seen = new Set<string>();

    const push = (r0: number, c0: number, r1: number, c1: number) => {
      const key = `${r0},${c0},${r1},${c1}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        startRow: Math.max(0, r0),
        startCol: Math.max(0, c0),
        endRow: Math.max(0, r1),
        endCol: Math.max(0, c1),
      });
    };

    // TREB stores merge on each cell as merge_area: { start: { row, column }, end: { row, column } } (0-based)
    const arr = Array.isArray(sheet?.data) ? sheet.data : [];
    for (const entry of arr) {
      const area = (entry as any).merge_area;
      if (area && typeof area === 'object' && area.start && area.end) {
        const r0 = Number(area.start?.row ?? 0);
        const c0 = Number(area.start?.column ?? 0);
        const r1 = Number(area.end?.row ?? r0);
        const c1 = Number(area.end?.column ?? c0);
        push(r0, c0, r1, c1);
        continue;
      }
      if (typeof entry?.row === 'number' && Array.isArray(entry.cells)) {
        for (const c of entry.cells) {
          const ma = (c as any).merge_area;
          if (ma && typeof ma === 'object' && ma.start && ma.end) {
            const r0 = Number(ma.start?.row ?? entry.row);
            const c0 = Number(ma.start?.column ?? c?.column ?? 0);
            const r1 = Number(ma.end?.row ?? r0);
            const c1 = Number(ma.end?.column ?? c0);
            push(r0, c0, r1, c1);
          }
        }
        continue;
      }
      if (typeof entry?.column === 'number' && Array.isArray(entry.cells)) {
        for (const c of entry.cells) {
          const ma = (c as any).merge_area;
          if (ma && typeof ma === 'object' && ma.start && ma.end) {
            const r0 = Number(ma.start?.row ?? c?.row ?? 0);
            const c0 = Number(ma.start?.column ?? entry.column);
            const r1 = Number(ma.end?.row ?? r0);
            const c1 = Number(ma.end?.column ?? c0);
            push(r0, c0, r1, c1);
          }
        }
      }
    }

    // Sheet-level merge arrays (alternative formats)
    const raw = sheet?.merges ?? sheet?.merge_ranges ?? sheet?.merged_cells ?? sheet?.merge;
    if (raw && Array.isArray(raw)) {
      for (const m of raw) {
        if (m && typeof m === 'object') {
          const r0 = (m as any).startRow ?? (m as any).start_row ?? (m as any).row ?? (m as any).r0 ?? 0;
          const c0 = (m as any).startCol ?? (m as any).start_column ?? (m as any).column ?? (m as any).c0 ?? 0;
          const r1 = (m as any).endRow ?? (m as any).end_row ?? (m as any).row2 ?? (m as any).r1 ?? r0;
          const c1 = (m as any).endCol ?? (m as any).end_column ?? (m as any).col2 ?? (m as any).c1 ?? c0;
          push(r0, c0, r1, c1);
        } else if (Array.isArray(m) && m.length >= 4) {
          push(Number(m[0]), Number(m[1]), Number(m[2]), Number(m[3]));
        }
      }
    }

    // IArea format: { start: { row, column }, end: { row, column } }
    const areas = sheet?.areas ?? sheet?.merge_areas;
    if (areas && Array.isArray(areas)) {
      for (const a of areas) {
        if (a && typeof a === 'object' && a.start && a.end) {
          const r0 = Number(a.start?.row ?? 0);
          const c0 = Number(a.start?.column ?? 0);
          const r1 = Number(a.end?.row ?? r0);
          const c1 = Number(a.end?.column ?? c0);
          push(r0, c0, r1, c1);
        }
      }
    }

    // Fallback: cell-level row_span/col_span
    if (out.length === 0 && arr.length > 0) {
      for (const entry of arr) {
        const row = entry?.row ?? entry?.cells?.[0]?.row;
        const cells = entry?.cells ?? (typeof entry?.column === 'number' ? [] : [entry]);
        for (const c of cells) {
          const r = typeof row === 'number' ? row : c?.row ?? 0;
          const col = c?.column ?? entry?.column ?? 0;
          const rs = c?.row_span ?? c?.rowSpan ?? 1;
          const cs = c?.col_span ?? c?.colSpan ?? 1;
          if (rs > 1 || cs > 1) push(r, col, r + Math.max(0, Number(rs)) - 1, col + Math.max(0, Number(cs)) - 1);
        }
        if (typeof entry?.row === 'number' && typeof entry?.column === 'number' && !entry?.cells) {
          const r = entry.row;
          const col = entry.column;
          const rs = entry.row_span ?? entry.rowSpan ?? 1;
          const cs = entry.col_span ?? entry.colSpan ?? 1;
          if (rs > 1 || cs > 1) push(r, col, r + Math.max(0, Number(rs)) - 1, col + Math.max(0, Number(cs)) - 1);
        }
      }
    }
    return out;
  }

  /**
   * Resolve effective CellStyle for (row, col) from TREB sheet.
   * Order: cell override (cell_styles / data style_ref) → row_style → column_style → sheet_style.
   * Used for fill, text color, alignment, bold, and borders so PDF matches the spreadsheet.
   */
  private getCellStyleFromSheet(sheet: any, row: number, column: number): any {
    const styles = sheet?.styles ?? sheet?.cell_style_refs ?? [];
    const cellStyles = Array.isArray(sheet?.cell_styles) ? sheet.cell_styles : [];
    for (const entry of cellStyles) {
      if (entry.row === row && entry.column === column) {
        const s = entry.style ?? styles[entry.ref];
        if (s && typeof s === 'object') return s;
        break;
      }
    }
    const data = Array.isArray(sheet?.data) ? sheet.data : [];
    for (const entry of data) {
      if (typeof entry?.row === 'number' && typeof entry?.column === 'number') {
        if (entry.row === row && entry.column === column && (entry as any).style_ref != null) {
          const s = styles[(entry as any).style_ref];
          if (s && typeof s === 'object') return s;
          break;
        }
        continue;
      }
      if (typeof entry?.row === 'number' && Array.isArray(entry.cells)) {
        for (const c of entry.cells) {
          if (c?.column === column && entry.row === row && (c as any).style_ref != null) {
            const s = styles[(c as any).style_ref];
            if (s && typeof s === 'object') return s;
            break;
          }
        }
        continue;
      }
      if (typeof entry?.column === 'number' && Array.isArray(entry.cells)) {
        for (const c of entry.cells) {
          if (c?.row === row && entry.column === column && (c as any).style_ref != null) {
            const s = styles[(c as any).style_ref];
            if (s && typeof s === 'object') return s;
            break;
          }
        }
      }
    }
    const rowStyle = sheet?.row_style && typeof sheet.row_style === 'object' ? sheet.row_style[row] : undefined;
    if (rowStyle != null) {
      const s = typeof rowStyle === 'number' ? styles[rowStyle] : rowStyle;
      if (s && typeof s === 'object') return s;
    }
    const colStyle = sheet?.column_style && typeof sheet.column_style === 'object' ? sheet.column_style[column] : undefined;
    if (colStyle != null) {
      const s = typeof colStyle === 'number' ? styles[colStyle] : colStyle;
      if (s && typeof s === 'object') return s;
    }
    return sheet?.sheet_style && typeof sheet.sheet_style === 'object' ? sheet.sheet_style : null;
  }

  /**
   * Normalize a color string to RGB tuple for jsPDF setFillColor(r, g, b).
   * Handles hex (#f5f5f5), rgb(r,g,b), rgba(r,g,b,a), and named colors (gray, grey, lightgray, etc.).
   * Returns null if the value cannot be parsed.
   */
  private normalizeFillColorForPdf(value: string): [number, number, number] | null {
    if (!value || typeof value !== 'string') return null;
    const s = value.trim();
    if (!s) return null;
    const hex = s.match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);
    if (hex) {
      const h = hex[1];
      const r = h.length === 3
        ? parseInt(h[0] + h[0], 16)
        : parseInt(h.slice(0, 2), 16);
      const g = h.length === 3
        ? parseInt(h[1] + h[1], 16)
        : parseInt(h.slice(2, 4), 16);
      const b = h.length === 3
        ? parseInt(h[2] + h[2], 16)
        : parseInt(h.slice(4, 6), 16);
      return [r, g, b];
    }
    const rgb = s.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    const names: Record<string, [number, number, number]> = {
      gray: [128, 128, 128], grey: [128, 128, 128],
      lightgray: [211, 211, 211], lightgrey: [211, 211, 211],
      darkgray: [169, 169, 169], darkgrey: [169, 169, 169],
      silver: [192, 192, 192], white: [255, 255, 255], black: [0, 0, 0],
      gainsboro: [220, 220, 220], whitesmoke: [245, 245, 245],
      red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
      darkred: [139, 0, 0], darkgreen: [0, 100, 0], darkblue: [0, 0, 139],
      orange: [255, 165, 0], yellow: [255, 255, 0], purple: [128, 0, 128],
      maroon: [128, 0, 0], navy: [0, 0, 128], teal: [0, 128, 128],
    };
    const key = s.toLowerCase().replace(/\s+/g, '');
    if (names[key]) return names[key];
    return null;
  }

  /**
   * Resolve alignment from a TREB style object. TREB CellStyle uses horizontal_align (see docs.treb.app).
   * Supports string and numeric (0/-1=left, 1=center, 2=right).
   */
  private resolveAlignFromStyle(style: any): 'left' | 'center' | 'right' | undefined {
    if (!style) return undefined;
    const raw =
      style.horizontal_align ??
      style.alignment ?? style.align ?? style.h_align ?? style.hAlign ??
      style.horizontal_alignment ?? style.textAlign ?? style.horizontalAlignment;
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'number') {
      if (raw === 1) return 'center';
      if (raw === 2) return 'right';
      return 'left';
    }
    const a = String(raw).trim().toLowerCase();
    if (a.includes('center')) return 'center';
    if (a.includes('right')) return 'right';
    if (a.includes('left')) return 'left';
    return undefined;
  }

  /**
   * Resolve text/font color string from a TREB style object (font_color, text_color, color, foreground, etc.).
   */
  private resolveTextColorFromStyle(style: any): string | undefined {
    if (!style) return undefined;
    const raw =
      style.font_color ?? style.text_color ?? style.color ?? style.foreground ??
      style.fgColor ?? style.fontColor;
    if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();
    if (raw && typeof raw === 'object') {
      const c = raw.color ?? raw.colour ?? raw.theme;
      if (typeof c === 'string' && c.trim() !== '') return c.trim();
    }
    return undefined;
  }

  /**
   * Resolve fill/background color string from a TREB style object (multiple possible property names and shapes).
   */
  private resolveFillColorFromStyle(style: any): string | undefined {
    if (!style) return undefined;
    const fill =
      style.fill_color ?? style.background_color ?? style.bgColor ?? style.backgroundColor ??
      style.fill ?? style.background;
    if (typeof fill === 'string' && fill.trim() !== '') return fill.trim();
    if (fill && typeof fill === 'object') {
      const c = fill.color ?? fill.colour ?? fill.theme;
      if (typeof c === 'string' && c.trim() !== '') return c.trim();
    }
    return undefined;
  }

  /**
   * Build CellStyleInfo for one cell from the TREB sheet.
   * All styling from resolved style only (cell → row → column → sheet). No sheet name or row index logic.
   * When style is null, default align to 'left' so we don't inherit column/sheet center.
   */
  private cellStyleInfoFromSheet(
    sheet: any,
    style: any,
    row: number,
    _col: number
  ): { bold?: boolean; align?: 'left' | 'center' | 'right'; fillColor?: string; textColor?: string } {
    const info: { bold?: boolean; align?: 'left' | 'center' | 'right'; fillColor?: string; textColor?: string } = {};
    if (style) {
      if (style.bold === true || style.font_weight === 'bold' || style.fontWeight === 'bold') info.bold = true;
      const align = this.resolveAlignFromStyle(style);
      if (align) info.align = align;
      const fillStr = this.resolveFillColorFromStyle(style);
      if (fillStr) info.fillColor = fillStr;
      const textStr = this.resolveTextColorFromStyle(style);
      if (textStr) info.textColor = textStr;
    }
    if (!style) {
      info.align = 'left';
    }
    return info;
  }

  /**
   * Extract per-cell border flags from sheet styles. Returns a map keyed by "row,col" with
   * { top, right, bottom, left } (0 = no border, >0 = border weight). Uses TREB names (border_top, etc.)
   * and camelCase (borderTop, etc.); optional border/border_width = all sides. Only includes cells that have at least one border set.
   */
  private extractCellBorders(sheet: any, numRows: number, numCols: number): Record<string, { top: number; right: number; bottom: number; left: number }> {
    const out: Record<string, { top: number; right: number; bottom: number; left: number }> = {};
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        const style = this.getCellStyleFromSheet(sheet, r, c);
        if (!style) continue;
        const allSides = Math.max(0, Number(style.border ?? style.border_width ?? style.borderWidth ?? 0));
        const top = Math.max(0, Number(style.border_top ?? style.borderTop ?? allSides));
        const right = Math.max(0, Number(style.border_right ?? style.borderRight ?? allSides));
        const bottom = Math.max(0, Number(style.border_bottom ?? style.borderBottom ?? allSides));
        const left = Math.max(0, Number(style.border_left ?? style.borderLeft ?? allSides));
        if (top > 0 || right > 0 || bottom > 0 || left > 0) {
          out[`${r},${c}`] = { top, right, bottom, left };
        }
      }
    }
    return out;
  }

  /**
   * Extract column widths and row heights from a TREB sheet (SerializedSheet).
   * TREB uses default_column_width, default_row_height and sparse column_width, row_height records.
   * Returns arrays sized to numCols/numRows with defaults filled in.
   */
  private extractSheetDimensions(
    sheet: any,
    numRows: number,
    numCols: number
  ): { columnWidths: number[]; rowHeights: number[] } {
    const defaultCol = Math.max(0, Number(sheet?.default_column_width ?? 80));
    const defaultRow = Math.max(0, Number(sheet?.default_row_height ?? 20));
    const cwRecord = sheet?.column_width && typeof sheet.column_width === 'object' ? sheet.column_width as Record<number, number> : {};
    const rhRecord = sheet?.row_height && typeof sheet.row_height === 'object' ? sheet.row_height as Record<number, number> : {};
    const columnWidths: number[] = [];
    const rowHeights: number[] = [];
    for (let c = 0; c < numCols; c++) columnWidths.push(Math.max(0, Number(cwRecord[c] ?? defaultCol)));
    for (let r = 0; r < numRows; r++) rowHeights.push(Math.max(0, Number(rhRecord[r] ?? defaultRow)));
    return { columnWidths, rowHeights };
  }

  /** Normalize sheet_data to array (doc may have array or Firestore object with numeric keys). */
  private getSheetsFromDoc(doc: any): any[] {
    const sd = doc?.sheet_data;
    if (Array.isArray(sd)) return sd;
    if (sd && typeof sd === 'object') {
      const keys = Object.keys(sd).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
      if (keys.length > 0) return keys.map((k) => sd[k]);
    }
    return sd != null ? [sd] : [];
  }

  /** Get sheet from TREB doc by name (case-insensitive). */
  private getSheetByName(doc: any, sheetName: string): any {
    const sheets = this.getSheetsFromDoc(doc);
    const key = (sheetName || '').trim().toLowerCase();
    for (const s of sheets) {
      const n = (s?.name || '').trim().toLowerCase();
      if (n === key) return s;
    }
    for (const s of sheets) {
      const n = (s?.name || '').trim().toLowerCase();
      if (n.includes(key) || key.includes(n)) return s;
    }
    return null;
  }

  /** Resolve a single cell value from the TREB document (for =Sheet!Cell refs). Returns displayable value or null. */
  private getCellValueFromTrebDoc(doc: any, sheetName: string, cellId: string): string | number | null {
    const sheet = this.getSheetByName(doc, sheetName);
    if (!sheet) return null;
    let row: number; let column: number;
    try {
      const parsed = parseCellId(cellId.toUpperCase());
      row = parsed.row;
      column = parsed.column;
    } catch {
      return null;
    }
    const cell = this.getCellInTrebSheet(sheet, row, column);
    if (!cell) return null;
    const calc = cell.calculated;
    if (calc !== undefined && calc !== null && calc !== '') {
      if (typeof calc === 'number' && !Number.isNaN(calc)) return calc;
      if (typeof calc === 'string' && calc.trim() !== '' && !calc.trim().startsWith('=')) return calc;
    }
    const val = cell.value;
    if (typeof val === 'number' && !Number.isNaN(val)) return val;
    if (typeof val === 'string' && val.trim() !== '' && !val.trim().startsWith('=')) return val;
    return null;
  }

  /**
   * Overlay computed (evaluated) grid onto grid from TREB doc. Fills cells that are empty or
   * placeholder so Reference Standard Devices and other formula-driven tables show correct values
   * when the saved doc lacked rendered_values.
   */
  private overlayComputedGridOntoTrebGrid(
    grid: (string | number)[][],
    overlay: (string | number)[][]
  ): (string | number)[][] {
    const result = grid.map((row) => row.slice());
    const placeholderLike = (v: string | number): boolean => {
      const s = String(v).trim();
      return s === '' || s === 'S/N' || s === '0' || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null';
    };
    for (let r = 0; r < overlay.length; r++) {
      const overlayRow = overlay[r];
      if (!Array.isArray(overlayRow)) continue;
      if (!result[r]) result[r] = [];
      for (let c = 0; c < overlayRow.length; c++) {
        const ov = overlayRow[c];
        const existing = result[r][c];
        if (ov !== undefined && ov !== null && String(ov).trim() !== '' && placeholderLike(existing ?? '')) {
          result[r][c] = ov;
        }
      }
    }
    return result;
  }

  /**
   * Merge TREB document grid with computed grid so that:
   * - Static text from TREB (headings, paragraphs, labels) is preserved.
   * - Formula-derived values (what the user sees in the grid) come from the computed grid.
   * - Computed values can still fill empty/placeholder cells from the TREB doc.
   */
  private mergeTrebAndComputedGrid(
    sheet: any,
    trebGrid: (string | number)[][],
    computedGrid: (string | number)[][]
  ): (string | number)[][] {
    const cells = this.extractSheetCells(sheet);
    const byCoord = new Map<string, { value: unknown }>();
    for (const c of cells) {
      byCoord.set(`${c.row},${c.column}`, { value: c.value });
    }

    const rows = Math.max(trebGrid.length, computedGrid.length);
    const maxColsIn = (grid: (string | number)[][]): number =>
      grid.reduce((m, r) => (Array.isArray(r) ? Math.max(m, r.length) : m), 0);
    const cols = rows > 0 ? Math.max(maxColsIn(trebGrid), maxColsIn(computedGrid), 0) : 0;

    const isPlaceholder = (v: unknown): boolean => {
      const s = String(v ?? '').trim();
      if (s === '' || s === '0') return true;
      const lower = s.toLowerCase();
      return lower === 'undefined' || lower === 'null';
    };

    const result: (string | number)[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => '')
    );

    const trebCoordSet = new Set(byCoord.keys());
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        if (!trebCoordSet.has(key)) {
          result[r][c] = '';
          continue;
        }
        const meta = byCoord.get(key);
        const origVal = meta?.value;
        const docVal = trebGrid[r]?.[c];
        const compVal = computedGrid[r]?.[c];
        const origIsFormula = typeof origVal === 'string' && origVal.trim().startsWith('=');

        let finalVal: string | number = '';

        const hasComp =
          compVal !== undefined && compVal !== null && String(compVal).trim() !== '';
        const hasDoc =
          docVal !== undefined && docVal !== null && String(docVal).trim() !== '';

        if (hasComp && (origIsFormula || isPlaceholder(docVal))) {
          finalVal = compVal as any;
        } else if (hasDoc) {
          finalVal = docVal as any;
        } else if (hasComp) {
          finalVal = compVal as any;
        }

        result[r][c] = finalVal;
      }
    }

    return result;
  }

  /**
   * Filter a grid so that only cells that exist in the TREB sheet layout are kept.
   * Any value at a (row, col) coordinate that doesn't correspond to a TREB cell is cleared.
   */
  private filterGridToTrebCoords(
    grid: (string | number)[][],
    trebCoords: Set<string>
  ): (string | number)[][] {
    const out: (string | number)[][] = grid.map((row) => (Array.isArray(row) ? row.slice() : []));
    for (let r = 0; r < out.length; r++) {
      const row = out[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const key = `${r},${c}`;
        if (!trebCoords.has(key)) {
          row[c] = '';
        }
      }
    }
    return out;
  }

  /**
   * Trim a grid to the TREB sheet's used row/column range and clear any values
   * outside actual TREB cell coordinates. This ensures we never render stray
   * values from indices that don't exist in the sheet layout.
   */
  private clampGridToSheetLayout(
    grid: (string | number)[][],
    sheet: any
  ): (string | number)[][] {
    if (!sheet || !grid || grid.length === 0) return grid;
    const trebCells = this.extractSheetCells(sheet);
    if (!trebCells.length) return grid;

    let maxRow = 0;
    let maxCol = 0;
    const trebCoords = new Set<string>();
    for (const c of trebCells) {
      trebCoords.add(`${c.row},${c.column}`);
      if (c.row > maxRow) maxRow = c.row;
      if (c.column > maxCol) maxCol = c.column;
    }

    const rowCount = maxRow + 1;
    const colCount = maxCol + 1;
    if (rowCount <= 0 || colCount <= 0) return grid;

    const trimmed: (string | number)[][] = [];
    for (let r = 0; r < rowCount; r++) {
      const srcRow = grid[r] ?? [];
      const newRow: (string | number)[] = [];
      for (let c = 0; c < colCount; c++) {
        newRow[c] = srcRow[c] ?? '';
      }
      trimmed[r] = newRow;
    }

    return this.filterGridToTrebCoords(trimmed, trebCoords);
  }

  /**
   * Build 2D array from a TREB sheet using only the document: use calculated/value, and resolve
   * simple cross-sheet refs (=Sheet!Cell) by reading the referenced cell from the same doc.
   * No formula engine — avoids 0/undefined when engine and TREB disagree.
   */
  private trebDocTo2DArrayWithCrossRefs(doc: any, sheet: any): (string | number)[][] {
    const cells = this.extractSheetCells(sheet);
    if (cells.length === 0) return [];
    const maxRow = Math.max(...cells.map((c) => c.row), 0);
    const maxCol = Math.max(...cells.map((c) => c.column), 0);
    const grid: (string | number)[][] = Array(maxRow + 1)
      .fill(null)
      .map(() => Array(maxCol + 1).fill(''));
    for (const { row, column, value, calculated, rawEntry } of cells) {
      let displayVal: string | number;
      if (rawEntry != null) {
        displayVal = getDisplayValueForCell(rawEntry, sheet);
        const raw = value != null && value !== '' ? value : '';
        const isFormula = typeof raw === 'string' && (raw as string).trim().startsWith('=');
        if (isFormula && (displayVal === '' || displayVal === null || displayVal === undefined)) {
          const ref = PdfTemplateRenderer.matchCrossTabRef((raw as string).trim());
          if (ref) {
            const [refSheet, refCell] = ref;
            const resolved = this.getCellValueFromTrebDoc(doc, refSheet, refCell);
            if (resolved !== null) displayVal = resolved;
          }
        }
      } else {
        const raw = value != null && value !== '' ? value : '';
        const isFormula = typeof raw === 'string' && (raw as string).trim().startsWith('=');
        if (isFormula) {
          const ref = PdfTemplateRenderer.matchCrossTabRef((raw as string).trim());
          if (ref) {
            const [refSheet, refCell] = ref;
            const resolved = this.getCellValueFromTrebDoc(doc, refSheet, refCell);
            if (resolved !== null) displayVal = resolved;
            else if (calculated !== undefined && calculated !== null && calculated !== '') {
              displayVal = typeof calculated === 'number' ? calculated : String(calculated);
            } else {
              displayVal = '';
            }
          } else if (calculated !== undefined && calculated !== null && calculated !== '') {
            displayVal = typeof calculated === 'number' ? calculated : String(calculated);
          } else {
            displayVal = '';
          }
        } else {
          displayVal = raw === undefined || raw === null ? '' : (typeof raw === 'number' ? raw : String(raw));
        }
      }
      if (displayVal === '#ERROR' || (typeof displayVal === 'string' && displayVal.trim().toUpperCase() === '#ERROR')) {
        displayVal = '';
      }
      if (displayVal === undefined || displayVal === null || (typeof displayVal === 'string' && (displayVal === 'undefined' || displayVal === 'null'))) {
        displayVal = '';
      }
      grid[row][column] = displayVal;
      if (DEBUG_PDF_RENDERER && import.meta.env?.DEV && row <= 2 && column <= 5) {
        console.log('[PDF grid build]', sheet?.name ?? '', `${row},${column}`, {
          raw: value,
          calculated,
          finalGridValue: displayVal,
        });
      }
    }
    return grid;
  }

  /**
   * Convert a TREB sheet to a 2D array for treb-table rendering (legacy; no cross-ref resolution).
   */
  private sheetTo2DArray(sheet: any): (string | number)[][] {
    const cells = this.extractSheetCells(sheet);
    if (cells.length === 0) return [];
    const maxRow = Math.max(...cells.map((c) => c.row), 0);
    const maxCol = Math.max(...cells.map((c) => c.column), 0);
    const grid: (string | number)[][] = Array(maxRow + 1)
      .fill(null)
      .map(() => Array(maxCol + 1).fill(''));
    for (const { row, column, value } of cells) {
      const raw = value != null && value !== '' ? value : '';
      const isFormula = typeof raw === 'string' && raw.toString().trim().startsWith('=');
      let displayVal: string | number = isFormula ? '' : (typeof raw === 'number' ? raw : String(raw));
      if (displayVal === '#ERROR' || (typeof displayVal === 'string' && displayVal.trim().toUpperCase() === '#ERROR')) {
        displayVal = '';
      }
      grid[row][column] = displayVal;
    }
    return grid;
  }

  /** Value used in PDF when a formula errors or is not yet computed (avoids showing #ERROR or formula text). */
  private static readonly FALLBACK_CELL_DISPLAY = '';

  /**
   * Match cross-tab ref: (1) whole formula is Sheet!Cell, or (2) formula contains Sheet!Cell (e.g. If(Raw_Data!E7=..., Raw_Data!E7)).
   * Returns first [sheetName, cellId] or null.
   */
  private static matchCrossTabRef(formula: string): [string, string] | null {
    if (!formula || typeof formula !== 'string') return null;
    const trimmed = formula.trim().replace(/^=/, '').replace(/\$/g, '').trim();
    const whole = trimmed.match(/^([A-Za-z0-9_]+)\s*!\s*([A-Z]+\d+)\s*$/i);
    if (whole) return [whole[1].trim(), whole[2].toUpperCase()];
    const inside = trimmed.match(/([A-Za-z0-9_]+)\s*!\s*([A-Z]+\d+)/i);
    if (inside) return [inside[1].trim(), inside[2].toUpperCase()];
    return null;
  }

  /**
   * Resolve a cross-tab cell value from evaluated tabs (e.g. Raw_Data!B7 -> value from raw_data tab).
   * Used when engine evaluation returns 0/#ERROR but source tab has the correct value.
   */
  private resolveCrossTabFromEvaluated(
    evaluatedTabsByName: Map<string, { cells?: Map<string, Cell> | Record<string, Cell> }>,
    sheetName: string,
    cellId: string
  ): string | number | null {
    const key = (sheetName || '').trim().toLowerCase();
    const tab = evaluatedTabsByName.get(key);
    if (!tab?.cells) return null;
    const refId = cellId.toUpperCase();
    const cell = tab.cells instanceof Map ? tab.cells.get(refId) : (tab.cells as Record<string, Cell>)[refId];
    if (!cell) return null;
    const dv = cell.displayValue;
    if (dv !== undefined && dv !== '' && dv !== '#ERROR') {
      if (typeof dv === 'number' && !Number.isNaN(dv)) return dv;
      const n = parseFloat(String(dv));
      if (!Number.isNaN(n)) return n;
      return typeof dv === 'string' ? dv : String(dv);
    }
    if (typeof cell.rawValue === 'number' && !Number.isNaN(cell.rawValue)) return cell.rawValue;
    if (cell.rawValue != null && cell.rawValue !== '') return typeof cell.rawValue === 'number' ? cell.rawValue : String(cell.rawValue);
    return null;
  }

  /**
   * Build 2D array from spreadsheet model tab (uses displayValue so formulas show computed result).
   * When evaluated cell is #ERROR, empty, or 0 and the formula is a cross-tab ref (e.g. =Raw_Data!B7),
   * resolves the value from evaluatedTabsByName so the PDF shows the correct number.
   */
  private modelTabTo2DArray(
    tab: { cells?: Record<string, { row: number; column: number; displayValue?: string; rawValue?: string | number | boolean | null; formula?: string }> | Map<string, Cell> },
    fallbackTab?: { cells?: Record<string, { row: number; column: number; displayValue?: string; rawValue?: string | number | boolean | null }> | Map<string, Cell> },
    evaluatedTabsByName?: Map<string, { cells?: Map<string, Cell> | Record<string, Cell> }> | null
  ): (string | number)[][] {
    const cellsMap = tab?.cells;
    if (!cellsMap || (typeof cellsMap === 'object' && !(cellsMap instanceof Map) && Object.keys(cellsMap).length === 0)) return [];
    const cells = cellsMap instanceof Map ? Array.from(cellsMap.values()) : Object.values(cellsMap);
    if (cells.length === 0) return [];
    const maxRow = Math.max(...cells.map((c) => c.row), 0);
    const maxCol = Math.max(...cells.map((c) => c.column), 0);
    const fallbackByRowCol = new Map<string, string | number>();
    if (fallbackTab?.cells) {
      const fbCells = fallbackTab.cells instanceof Map ? Array.from(fallbackTab.cells.values()) : Object.values(fallbackTab.cells);
      for (const c of fbCells) {
        const r = c?.row ?? -1;
        const col = c?.column ?? -1;
        if (r < 0) continue;
        const dv = c?.displayValue;
        const rv = c?.rawValue;
        let v: string | number = '';
        if (dv !== undefined && dv !== '' && dv !== '#ERROR') v = dv;
        else if (rv != null && rv !== '') v = typeof rv === 'number' ? rv : String(rv);
        if (v !== '') fallbackByRowCol.set(`${r},${col}`, v);
      }
    }
    const grid: (string | number)[][] = Array(maxRow + 1)
      .fill(null)
      .map(() => Array(maxCol + 1).fill(''));
    for (const cell of cells) {
      const { row, column, displayValue, rawValue } = cell;
      const formula = (cell as { formula?: string }).formula;
      let val: string | number = '';
      if (displayValue !== undefined && displayValue !== '' && displayValue !== '#ERROR') {
        val = displayValue;
      } else if (rawValue != null && rawValue !== '') {
        val = typeof rawValue === 'number' ? rawValue : (typeof rawValue === 'boolean' ? String(rawValue) : String(rawValue));
      }
      if (val === '#ERROR' || (typeof val === 'string' && val.trim().toUpperCase() === '#ERROR')) {
        val = PdfTemplateRenderer.FALLBACK_CELL_DISPLAY;
      }
      if ((val === '' || val === PdfTemplateRenderer.FALLBACK_CELL_DISPLAY) && fallbackByRowCol.has(`${row},${column}`)) {
        val = fallbackByRowCol.get(`${row},${column}`)!;
      } else if ((val === 0 || val === '0') && fallbackByRowCol.has(`${row},${column}`)) {
        const fb = fallbackByRowCol.get(`${row},${column}`)!;
        const useFallback = (typeof fb === 'number' && fb !== 0) ||
          (typeof fb === 'string' && fb.trim() !== '' && fb.trim() !== '0');
        if (useFallback) val = fb;
      }
      if ((val === '' || val === 0 || val === '0') && formula && evaluatedTabsByName?.size) {
        const ref = PdfTemplateRenderer.matchCrossTabRef(formula);
        if (ref) {
          const [sheetName, cellId] = ref;
          const resolved = this.resolveCrossTabFromEvaluated(evaluatedTabsByName, sheetName, cellId);
          if (resolved !== null) val = resolved;
        }
      }
      if (typeof val === 'string' && (val === 'undefined' || val === 'null')) val = '';
      grid[row][column] = val;
    }
    return grid;
  }

  /**
   * Normalize sheet_data to array (single sheet or array or Firestore object-with-numeric-keys).
   */
  private normalizeSheetArray(sheetData: unknown): any[] {
    if (sheetData == null) return [];
    if (Array.isArray(sheetData)) return sheetData;
    if (typeof sheetData === 'object' && sheetData !== null) {
      const obj = sheetData as Record<string, unknown>;
      const keys = Object.keys(obj).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
      if (keys.length > 0) return keys.map((k) => obj[k]);
    }
    return [sheetData];
  }

  /**
   * Hydrate serialized spreadsheet model (from Firestore/job) to a model with Maps so we can run the formula engine.
   * Returns null if hydration fails (e.g. missing tabs).
   */
  private hydrateSpreadsheetModelForEvaluation(serialized: any): SpreadsheetModel | null {
    if (!serialized || typeof serialized !== 'object') return null;
    let tabsArray: any[] = [];
    if (Array.isArray(serialized.tabs)) {
      tabsArray = serialized.tabs;
    } else if (serialized.tabs && typeof serialized.tabs === 'object' && !(serialized.tabs instanceof Map)) {
      tabsArray = Object.values(serialized.tabs);
    } else if (serialized.tabs instanceof Map) {
      tabsArray = Array.from(serialized.tabs.values());
    }
    if (tabsArray.length === 0) return null;

    const tabs = new Map<string, SpreadsheetTab>();
    for (const t of tabsArray) {
      if (!t || typeof t !== 'object' || t.id == null) continue;
      const cellsObj = t.cells && typeof t.cells === 'object' ? t.cells : {};
      const cells = new Map<string, Cell>();
      const entries: Array<[string, any]> = t.cells instanceof Map
        ? (Array.from(t.cells.entries()) as Array<[string, any]>)
        : (Object.entries(cellsObj as Record<string, any>) as Array<[string, any]>);
      const a1Style = /^[A-Z]+\d+$/i;
      for (const [cellId, c] of entries) {
        if (!c || typeof c !== 'object') continue;
        const cell = c as any;
        const row = typeof cell.row === 'number' ? cell.row : 0;
        const column = typeof cell.column === 'number' ? cell.column : 0;
        const canonicalId = a1Style.test(String(cellId)) ? cellId : generateCellId(row, column);
        cells.set(canonicalId, {
          id: canonicalId,
          row,
          column,
          dataType: cell.dataType || 'text',
          displayValue: typeof cell.displayValue === 'string' ? cell.displayValue : '',
          rawValue: cell.rawValue ?? null,
          formula: cell.formula,
          format: cell.format,
        });
      }
      const colDefs = t.columnDefinitions;
      const columnDefinitions = colDefs && typeof colDefs === 'object' && !(colDefs instanceof Map)
        ? new Map(Object.entries(colDefs))
        : (colDefs instanceof Map ? colDefs : new Map());
      const tabColumnOrder = Array.isArray(t.columnOrder) && t.columnOrder.length > 0
        ? t.columnOrder
        : (Array.isArray(serialized.columnOrder) ? serialized.columnOrder : []);
      tabs.set(t.id, {
        id: t.id,
        name: t.name != null ? String(t.name) : '',
        order: typeof t.order === 'number' ? t.order : 0,
        cells,
        columnDefinitions,
        columnOrder: tabColumnOrder,
        rowCount: typeof t.rowCount === 'number' ? t.rowCount : serialized.rowCount ?? 50,
        columnCount: typeof t.columnCount === 'number' ? t.columnCount : serialized.columnCount ?? 26,
      });
    }
    const tabOrder = Array.isArray(serialized.tabOrder) ? serialized.tabOrder : Array.from(tabs.keys());
    const base: SpreadsheetModel = {
      id: serialized.id || 'pdf-eval',
      name: serialized.name || 'Spreadsheet',
      version: serialized.version || '1.0',
      status: 'draft',
      createdBy: serialized.createdBy || 'system',
      createdAt: serialized.createdAt instanceof Date ? serialized.createdAt : new Date(),
      updatedAt: serialized.updatedAt instanceof Date ? serialized.updatedAt : new Date(),
      updatedBy: serialized.updatedBy || 'system',
      formulas: serialized.formulas && typeof serialized.formulas === 'object' && !(serialized.formulas instanceof Map)
        ? new Map(Object.entries(serialized.formulas))
        : new Map(),
      variables: serialized.variables && typeof serialized.variables === 'object' && !(serialized.variables instanceof Map)
        ? new Map(Object.entries(serialized.variables))
        : new Map(),
      rowCount: typeof serialized.rowCount === 'number' ? serialized.rowCount : 50,
      columnCount: typeof serialized.columnCount === 'number' ? serialized.columnCount : 26,
      tabs,
      tabOrder,
      cells: tabs.get(tabOrder[0])?.cells ?? new Map(),
      columnDefinitions: tabs.get(tabOrder[0])?.columnDefinitions ?? new Map(),
      columnOrder: tabs.get(tabOrder[0])?.columnOrder ?? [],
      auditTrail: Array.isArray(serialized.auditTrail) ? (serialized.auditTrail as any) : [],
    };
    return base;
  }

  /**
   * Get evaluated 2D grid for a tab by name: hydrate model, run formula engine, return display values.
   * Use when computedGrids is missing so formula-derived cells (e.g. Reference Standard Devices) show correct values.
   */
  private getEvaluatedGridForTab(serializedModel: any, tabName: string): (string | number)[][] | null {
    if (!serializedModel || !tabName || typeof tabName !== 'string') return null;
    const hydrated = this.hydrateSpreadsheetModelForEvaluation(serializedModel);
    if (!hydrated?.tabs?.size) return null;
    try {
      evaluateSpreadsheet(hydrated);
      const key = (tabName || '').trim().toLowerCase();
      const evaluatedTabsByName = new Map<string, { cells?: Map<string, Cell> | Record<string, Cell> }>();
      for (const tab of hydrated.tabs.values()) {
        const name = (tab.name || '').trim().toLowerCase();
        if (name) evaluatedTabsByName.set(name, { cells: tab.cells });
      }
      const tab = Array.from(hydrated.tabs.values()).find(
        (t: any) => (t?.name || '').trim().toLowerCase() === key
      );
      if (!tab) return null;
      return this.modelTabTo2DArray(tab, undefined, evaluatedTabsByName);
    } catch {
      return null;
    }
  }

  /**
   * Build a 2D array from a TREB sheet using TREB's own computed values.
   * TREB is the sole authoritative source — no formula evaluation is performed here.
   * entry.value is used directly:
   *   - number  → use as-is
   *   - non-formula string → use as-is
   *   - formula string ("=...") → skip (TREB already stored the computed result separately or we leave blank)
   */
  private trebSheetTo2DArray(sheet: any): (string | number)[][] {
    const cells = this.extractSheetCells(sheet);
    if (cells.length === 0) return [];
    const maxRow = Math.max(...cells.map((c) => c.row), 0);
    const maxCol = Math.max(...cells.map((c) => c.column), 0);
    const grid: (string | number)[][] = Array(maxRow + 1)
      .fill(null)
      .map(() => Array(maxCol + 1).fill(''));

    for (const cellEntry of cells) {
      const { row, column, value } = cellEntry;
      const calculated = (cellEntry as any).calculated;
      const result = (cellEntry as any).result;

      // Priority 1: use calculated/result (cached computed value TREB may store alongside formula)
      const computed = calculated !== undefined ? calculated : (result !== undefined ? result : undefined);
      if (computed !== undefined && computed !== null && computed !== '') {
        if (typeof computed === 'number' && !Number.isNaN(computed)) {
          grid[row][column] = computed;
          continue;
        }
        if (typeof computed === 'string' && computed.trim() !== '' && !computed.trim().startsWith('=')) {
          grid[row][column] = computed.trim();
          continue;
        }
      }

      // Priority 2: use value if it is a number or non-formula string
      if (typeof value === 'number' && !Number.isNaN(value)) {
        grid[row][column] = value;
      } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed !== '' && !trimmed.startsWith('=')) {
          grid[row][column] = trimmed;
        }
        // formula strings ("=...") → leave empty until we know where TREB stores computed results
      }
    }
    return grid;
  }

  /**
   * Build trebDataRegistry for PDF TREB table elements.
   * Preferred path: use equipment's trebDocument → convert to SpreadsheetModel → evaluate formulas
   * → build 2D grid per tab by name. Fallback: computedGrids or hydrated spreadsheetModel.
   * Also builds trebPrintAreaByTab from each template's tabPrintAreas when templates are loaded.
   */
  private async buildTrebDataRegistry(
    template: PdfTemplate,
    job: Job,
    selectedEquipmentIndex?: number
  ): Promise<{ registry: Record<string, unknown>; trebPrintAreaByTab?: Record<string, string> }> {
    const registry: Record<string, unknown> = {};
    const trebPrintAreaByTab: Record<string, string> = {};
    const templateCache: Record<string, Awaited<ReturnType<typeof spreadsheetTemplateService.getByIdFromServer>>> = {};
    const elements = (template.pages && template.pages.length > 0
      ? template.pages.flatMap((p) => p.elements || [])
      : template.elements || []) as PdfElement[];
    const trebElements = elements.filter((el): el is TrebTableElement => el.type === 'treb-table');
    if (trebElements.length === 0) return { registry, trebPrintAreaByTab };

    const equipment = job.equipment || [];
    let index = selectedEquipmentIndex;
    if (index == null || index < 0 || index >= equipment.length) {
      const firstWithData = equipment.findIndex(
        (eq) => eq?.spreadsheetData?.trebDocument || eq?.spreadsheetData?.computedGrids || eq?.spreadsheetData?.spreadsheetModel
      );
      index = firstWithData >= 0 ? firstWithData : 0;
    }
    const eq = equipment[index];
    const spreadsheetData = eq?.spreadsheetData;
    const trebDocument = spreadsheetData?.trebDocument as TREBDocument | undefined;
    const rawComputedGrids = (spreadsheetData as any)?.computedGrids as Record<string, string> | undefined;
    const computedGridsParsed: Record<string, (string | number)[][]> | undefined = rawComputedGrids
      ? Object.fromEntries(
          Object.entries(rawComputedGrids).map(([k, v]) => {
            try { return [k, JSON.parse(v) as (string | number)[][]]; }
            catch { return [k, [] as (string | number)[][]]; }
          })
        )
      : undefined;
    const normalizeTabName = (name: string) => (name || '').trim().toLowerCase();
    const templateIdToTabName = new Map<string, string>();

    // Build model tabs array once so we can resolve computedGrids by tab name (template tab id may differ from equipment tab id)
    const spreadsheetModel = spreadsheetData?.spreadsheetModel;
    const rawTabs = spreadsheetModel?.tabs;
    let modelTabsArr: Array<{ id?: string; name?: string }> = [];
    if (Array.isArray(rawTabs)) modelTabsArr = rawTabs;
    else if (rawTabs instanceof Map) modelTabsArr = Array.from(rawTabs.values());
    else if (rawTabs && typeof rawTabs === 'object') {
      const keys = Object.keys(rawTabs).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
      modelTabsArr = keys.map((k) => (rawTabs as Record<string, any>)[k]);
    }
    const getComputedGridByTab = (tabId: string, tabName: string): (string | number)[][] | undefined => {
      const byId = computedGridsParsed?.[tabId];
      if (byId && byId.length > 0) return byId;
      const key = normalizeTabName(tabName || '');
      if (!key) return undefined;
      const modelTab = modelTabsArr.find((t: any) => normalizeTabName(String(t?.name ?? '')) === key);
      return modelTab?.id ? computedGridsParsed?.[modelTab.id] : undefined;
    };

    // Resolve tab name for each element (template tab id → human-readable name); cache templates and fill trebPrintAreaByTab
    for (const el of trebElements) {
      const tplId = (el as TrebTableElement).spreadsheetTemplateId;
      const tabId = (el as TrebTableElement).sourceTabId;
      if (!tabId) continue;
      let tabName = templateIdToTabName.get(`${tplId}:${tabId}`);
      if (tabName === undefined && tplId) {
        try {
          let tpl = templateCache[tplId];
          if (tpl == null) {
            tpl = await spreadsheetTemplateService.getByIdFromServer(tplId);
            templateCache[tplId] = tpl;
            if (tpl?.tabPrintAreas && typeof tpl.tabPrintAreas === 'object') {
              for (const tab of tpl.tabs || []) {
                const range = tpl.tabPrintAreas[tab.id];
                if (range && typeof range === 'string' && range.trim()) {
                  trebPrintAreaByTab[`${tplId}:${tab.id}`] = range.trim();
                }
              }
            }
          }
          const tab = tpl?.tabs?.find((t) => t.id === tabId);
          tabName = (tab?.name ?? tabId ?? '').trim();
          templateIdToTabName.set(`${tplId}:${tabId}`, tabName);
        } catch {
          tabName = tabId;
          templateIdToTabName.set(`${tplId}:${tabId}`, tabName);
        }
      }
      if (!tabName) tabName = tabId;
    }

    // Path 1: Direct TREB document — build 2D grid from sheet data, resolve =Sheet!Cell refs inside the doc (no formula engine)
    if (trebDocument && typeof trebDocument === 'object' && (trebDocument as any).sheet_data != null) {
      try {
        const doc = trebDocument as any;
        let loggedTrebStyle = false;
        for (const el of trebElements) {
          const tabId = (el as TrebTableElement).sourceTabId;
          const tabName = templateIdToTabName.get(`${(el as TrebTableElement).spreadsheetTemplateId}:${tabId}`) ?? tabId;
          const sheet = this.getSheetByName(doc, tabName);
          if (sheet) {
            if (import.meta.env?.DEV && !loggedTrebStyle) {
              const headerStyle = this.getCellStyleFromSheet(sheet, 0, 0);
              const dataStyle = this.getCellStyleFromSheet(sheet, 1, 0);
              console.debug('[PDF treb] TREB style sample (header 0,0):', headerStyle ? Object.keys(headerStyle) : null, headerStyle);
              console.debug('[PDF treb] TREB style sample (data 1,0):', dataStyle ? Object.keys(dataStyle) : null, dataStyle);
              loggedTrebStyle = true;
            }
            // Prefer evaluated display values (what the user sees) while preserving static TREB text
            let grid: (string | number)[][] = [];
            const evaluatedGrid = getComputedGridByTab(tabId, tabName);
            if (evaluatedGrid && evaluatedGrid.length > 0) {
              const trebGrid = this.trebDocTo2DArrayWithCrossRefs(doc, sheet);
              grid = trebGrid.length > 0
                ? this.mergeTrebAndComputedGrid(sheet, trebGrid, evaluatedGrid)
                : evaluatedGrid;
            } else {
              // No saved computedGrids: evaluate spreadsheet model so formula-derived cells get correct values
              const fromModel = this.getEvaluatedGridForTab(spreadsheetData?.spreadsheetModel, tabName);
              if (fromModel && fromModel.length > 0) {
                grid = fromModel;
              } else {
                grid = this.trebDocTo2DArrayWithCrossRefs(doc, sheet);
                const overlay = getComputedGridByTab(tabId, tabName);
                if (overlay && grid.length > 0) {
                  grid = this.overlayComputedGridOntoTrebGrid(grid, overlay);
                }
              }
            }
            if (grid.length > 0) {
              grid = this.clampGridToSheetLayout(grid, sheet);
            }
            const trebCellsForTab = this.extractSheetCells(sheet);
            const trebCoords = trebCellsForTab.map((c) => ({ row: c.row, column: c.column }));
            const merges = this.extractMergeRanges(sheet);
            const numCols = grid.length > 0 ? Math.max(...grid.map((r) => (r ?? []).length), 1) : 0;
            const { columnWidths: sheetColWidths, rowHeights: sheetRowHeights } = this.extractSheetDimensions(sheet, grid.length, numCols);
            const cellBorders = this.extractCellBorders(sheet, grid.length, numCols);
            // Extract per-cell style info (bold, align, fillColor, textColor) from TREB sheet; row 0 gets default header style when no style
            type CellStyleInfo = { bold?: boolean; align?: 'left' | 'center' | 'right'; fillColor?: string; textColor?: string };
            const cellStyles: Record<string, CellStyleInfo> = {};
            for (let r = 0; r < grid.length; r++) {
              const row = grid[r] ?? [];
              const maxCols = row.length || numCols;
              for (let c = 0; c < maxCols; c++) {
                const style = this.getCellStyleFromSheet(sheet, r, c);
                const info = this.cellStyleInfoFromSheet(sheet, style, r, c);
                if (info.bold || info.align || info.fillColor || info.textColor) {
                  cellStyles[`${r},${c}`] = info;
                }
              }
            }
            if (grid.length > 0) {
              const entry: Record<string, unknown> = { data: grid, trebCoords };
              if (sheetColWidths.length > 0) entry.columnWidths = sheetColWidths;
              if (sheetRowHeights.length > 0) entry.rowHeights = sheetRowHeights;
              if (merges.length > 0) entry.merges = merges;
              if (Object.keys(cellBorders).length > 0) entry.cellBorders = cellBorders;
              if (Object.keys(cellStyles).length > 0) (entry as any).cellStyles = cellStyles;
              registry[tabId] = entry;
            }
          }
        }
        if (Object.keys(registry).length > 0) return { registry, trebPrintAreaByTab };
      } catch (err) {
        debugLog('[PDF treb] Direct TREB-doc path failed:', err);
      }
    }

    // Path 2: Fallback — computedGrids or hydrate spreadsheetModel (modelTabsArr already built above)
    const computedGrids = computedGridsParsed;
    const spreadsheetModelForHydration = spreadsheetData?.spreadsheetModel;

    for (const el of trebElements) {
      const tplId = (el as TrebTableElement).spreadsheetTemplateId;
      const tabId = (el as TrebTableElement).sourceTabId;
      if (!tabId || registry[tabId]) continue;
      const tabName = templateIdToTabName.get(`${tplId}:${tabId}`) ?? tabId;
      const tabKey = normalizeTabName(tabName);

       let grid: (string | number)[][] | undefined;

      if (computedGrids?.[tabId]?.length) {
        grid = computedGrids[tabId];
      }
      const matchingModelTab = modelTabsArr.find((t: any) => normalizeTabName(String(t?.name ?? '')) === tabKey);
      if (!grid && matchingModelTab?.id && computedGrids?.[matchingModelTab.id]?.length) {
        grid = computedGrids[matchingModelTab.id];
      }
      // Fallback: match by tab index when name fails; assumes equipment tab order matches template.
      if (!grid && computedGrids) {
        try {
          const tpl = await spreadsheetTemplateService.getByIdFromServer(tplId);
          const templateTabIndex = tpl?.tabs?.findIndex((t) => t.id === tabId) ?? -1;
          if (templateTabIndex >= 0) {
            const tabOrder = (spreadsheetModel as any)?.tabOrder as string[] | undefined;
            const equipmentTabId = Array.isArray(tabOrder)
              ? tabOrder[templateTabIndex]
              : modelTabsArr[templateTabIndex]?.id;
            if (equipmentTabId && computedGrids[equipmentTabId]?.length) {
              grid = computedGrids[equipmentTabId];
            } 
          }
        } catch {
          // ignore
        }
      }
      if (!grid && spreadsheetModelForHydration) {
        const hydrated = this.hydrateSpreadsheetModelForEvaluation(spreadsheetModelForHydration);
        if (hydrated?.tabs?.size) {
          try {
            evaluateSpreadsheet(hydrated);
            const evaluatedTabsByName = new Map<string, { cells?: Map<string, Cell> | Record<string, Cell> }>();
            for (const tab of hydrated.tabs.values()) {
              const name = (tab.name || '').trim().toLowerCase();
              if (name) evaluatedTabsByName.set(name, { cells: tab.cells });
            }
            const tabByName = Array.from(hydrated.tabs.values()).find(
              (t: any) => normalizeTabName(String(t?.name ?? '')) === tabKey
            );
            if (tabByName) {
              const modelGrid = this.modelTabTo2DArray(tabByName, undefined, evaluatedTabsByName);
              if (modelGrid.length > 0) grid = modelGrid;
            }
          } catch {
            // ignore
          }
        }
      }
      if (grid && grid.length > 0) {
        // If we have a TREB sheet for this tab (from job's trebDocument or template's trebDocument),
        // clamp and filter the grid so only real TREB coordinates keep values.
        let sheetForTab: any | null = null;
        if (trebDocument && typeof trebDocument === 'object' && (trebDocument as any).sheet_data != null) {
          sheetForTab = this.getSheetByName(trebDocument as any, tabName);
        }
        if (!sheetForTab && tplId) {
          try {
            const tpl = await spreadsheetTemplateService.getByIdFromServer(tplId);
            const docForTpl = tpl?.trebDocument;
            if (docForTpl && typeof docForTpl === 'object' && (docForTpl as any).sheet_data != null) {
              sheetForTab = this.getSheetByName(docForTpl as any, tabName);
            }
          } catch {
            // ignore
          }
        }
        const finalGrid = sheetForTab ? this.clampGridToSheetLayout(grid, sheetForTab) : grid;
        const entry: Record<string, unknown> = { data: finalGrid };
        if (sheetForTab) {
          const numCols = finalGrid.length > 0 ? Math.max(...finalGrid.map((r) => (r ?? []).length), 1) : 0;
          const { columnWidths: cw, rowHeights: rh } = this.extractSheetDimensions(sheetForTab, finalGrid.length, numCols);
          if (cw.length > 0) entry.columnWidths = cw;
          if (rh.length > 0) entry.rowHeights = rh;
          const trebCellsForTab = this.extractSheetCells(sheetForTab);
          const trebCoords = trebCellsForTab.map((c) => ({ row: c.row, column: c.column }));
          const merges = this.extractMergeRanges(sheetForTab);
          if (merges.length > 0) entry.merges = merges;
          const cellBorders = this.extractCellBorders(sheetForTab, finalGrid.length, numCols);
          if (Object.keys(cellBorders).length > 0) entry.cellBorders = cellBorders;
          type CellStyleInfo = { bold?: boolean; align?: 'left' | 'center' | 'right'; fillColor?: string; textColor?: string };
          const cellStyles: Record<string, CellStyleInfo> = {};
          for (let r = 0; r < finalGrid.length; r++) {
            const row = finalGrid[r] ?? [];
            const maxCols = row.length || numCols;
            for (let c = 0; c < maxCols; c++) {
              const style = this.getCellStyleFromSheet(sheetForTab, r, c);
              const info = this.cellStyleInfoFromSheet(sheetForTab, style, r, c);
              if (info.bold || info.align || info.fillColor || info.textColor) cellStyles[`${r},${c}`] = info;
            }
          }
          if (Object.keys(cellStyles).length > 0) (entry as any).cellStyles = cellStyles;
          if (trebCoords.length > 0) (entry as any).trebCoords = trebCoords;
        }
        registry[tabId] = entry;
        continue;
      }
      if (!registry[tabId]) {
        console.warn('[PDF treb] No data for tab', tabName, '(sourceTabId:', tabId, '). Ensure equipment has a saved spreadsheet (with trebDocument).');
      }
    }

    // Path 3: When equipment has no spreadsheet data, build table structure from the spreadsheet template so the PDF shows headers and empty cells instead of "N/A - Data Not Found"
    for (const el of trebElements) {
      const tplId = (el as TrebTableElement).spreadsheetTemplateId;
      const tabId = (el as TrebTableElement).sourceTabId;
      if (!tplId || !tabId || registry[tabId]) continue;
      let tabName = templateIdToTabName.get(`${tplId}:${tabId}`) ?? tabId;
      let tpl: { trebDocument?: unknown; tabs?: { id: string; name?: string }[] } | null = null;
      try {
        tpl = await spreadsheetTemplateService.getByIdFromServer(tplId);
      } catch {
        continue;
      }
      if (tpl?.tabs?.length) {
        const tab = tpl.tabs.find((t) => t.id === tabId);
        if (tab?.name?.trim()) tabName = tab.name.trim();
      }
      const doc = tpl?.trebDocument;
      if (!doc || typeof doc !== 'object' || (doc as any).sheet_data == null) continue;
      const sheet = this.getSheetByName(doc, tabName);
      if (!sheet) continue;
      let grid = this.trebDocTo2DArrayWithCrossRefs(doc, sheet);
      if (grid.length === 0) continue;
      grid = this.clampGridToSheetLayout(grid, sheet);
      const trebCellsForTab = this.extractSheetCells(sheet);
      const trebCoords = trebCellsForTab.map((c) => ({ row: c.row, column: c.column }));
      const merges = this.extractMergeRanges(sheet);
      const numCols = Math.max(...grid.map((r) => (r ?? []).length), 1);
      const { columnWidths: sheetColWidths, rowHeights: sheetRowHeights } = this.extractSheetDimensions(sheet, grid.length, numCols);
      const cellBorders = this.extractCellBorders(sheet, grid.length, numCols);
      type CellStyleInfo = { bold?: boolean; align?: 'left' | 'center' | 'right'; fillColor?: string; textColor?: string };
      const cellStyles: Record<string, CellStyleInfo> = {};
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r] ?? [];
        const maxCols = row.length || numCols;
        for (let c = 0; c < maxCols; c++) {
          const style = this.getCellStyleFromSheet(sheet, r, c);
          const info = this.cellStyleInfoFromSheet(sheet, style, r, c);
          if (info.bold || info.align || info.fillColor || info.textColor) cellStyles[`${r},${c}`] = info;
        }
      }
      const entry: Record<string, unknown> = { data: grid, trebCoords };
      if (sheetColWidths.length > 0) entry.columnWidths = sheetColWidths;
      if (sheetRowHeights.length > 0) entry.rowHeights = sheetRowHeights;
      if (merges.length > 0) entry.merges = merges;
      if (Object.keys(cellBorders).length > 0) entry.cellBorders = cellBorders;
      if (Object.keys(cellStyles).length > 0) (entry as any).cellStyles = cellStyles;
      registry[tabId] = entry;
    }

    return { registry, trebPrintAreaByTab };
  }

  /**
   * Prepare job data with company info (internal method)
   * Maps CompanyInfo from settings to company.* data sources for PDF templates
   */
  private prepareJobData(job: Job, companyInfo: CompanyInfo | null, customerName: string, assignedStaffName: string): any {
    // Format company address as string
    const companyAddress = companyInfo?.address 
      ? formatCompanyAddress(companyInfo.address)
      : '';

    // Prepare workAuthorization with resolved names (signatures should already have names, but ensure they're preserved)
    // Ensure workAuthorizationStatement has a default value if missing or empty
    const defaultWorkAuthorizationStatement = 'I confirm that the information provided is correct and authorize the laboratory to proceed with the requested services according to the laboratory\'s terms and conditions. I understand that any deviations from the request must be communicated and approved before proceeding.';
    
    const workAuthorization = job.workAuthorization ? {
      ...job.workAuthorization,
      // Use default statement if workAuthorizationStatement is missing or empty
      workAuthorizationStatement: job.workAuthorization.workAuthorizationStatement && job.workAuthorization.workAuthorizationStatement.trim().length > 0
        ? job.workAuthorization.workAuthorizationStatement
        : defaultWorkAuthorizationStatement,
      // Ensure signature objects preserve signerName
      customerSignature: job.workAuthorization.customerSignature ? {
        ...job.workAuthorization.customerSignature,
        signerName: job.workAuthorization.customerSignature.signerName || '',
      } : undefined,
      staffSignature: job.workAuthorization.staffSignature ? {
        ...job.workAuthorization.staffSignature,
        signerName: job.workAuthorization.staffSignature.signerName || '',
      } : undefined,
      technicalReviewerSignature: job.workAuthorization.technicalReviewerSignature ? {
        ...job.workAuthorization.technicalReviewerSignature,
        signerName: job.workAuthorization.technicalReviewerSignature.signerName || '',
      } : undefined,
      // ── Computed item-condition booleans ──────────────────────────────────────
      // itemsConditionOnReceipt is a string enum; these boolean aliases let
      // checkbox elements bind without a conditional expression.
      itemConditionGood:    job.workAuthorization.itemsConditionOnReceipt === 'Acceptable',
      itemConditionDamaged: job.workAuthorization.itemsConditionOnReceipt === 'Damaged or altered',
      itemConditionDirty:   job.workAuthorization.itemsConditionOnReceipt === 'Improper storage/transportation conditions',
    } : {
      // If workAuthorization doesn't exist, provide default structure
      workAuthorizationStatement: defaultWorkAuthorizationStatement,
      itemConditionGood: false,
      itemConditionDamaged: false,
      itemConditionDirty: false,
    };

    return {
      ...job,
      // Company information from settings (available for all PDF templates)
      company: {
        name: companyInfo?.companyName || '',
        address: companyAddress,
        phone: companyInfo?.contactInfo?.phone || '',
        email: companyInfo?.contactInfo?.email || '',
        website: companyInfo?.contactInfo?.website || '',
        fax: companyInfo?.contactInfo?.fax || '',
        logo: companyInfo?.logoBase64 || '',
        // Additional company info (non-sensitive)
        taxId: companyInfo?.additionalInfo?.taxId || '',
        registrationNumber: companyInfo?.additionalInfo?.registrationNumber || '',
        businessLicense: companyInfo?.additionalInfo?.businessLicense || '',
      },
      customer: {
        name: customerName,
        address: job.customerAddress || '',
        contact_person: job.customerContact || '',
        phone: job.customerPhone || '',
        email: job.customerEmail || '',
      },
      job: {
        id: job.jobId,
        title: job.title,
        status: job.status,
        customer: customerName,
        date: job.receivedDate, // Map to receivedDate from job module
        appointmentDate: job.appointmentDate || (job as any).scheduleDate || '',
        startDate: job.startDate || '',
        completedDate: job.completedDate || '',
        expectedFinishDate: job.expectedFinishDate || '',
        assignedStaff: assignedStaffName || job.assignedStaff, // Use resolved name, fallback to ID
        assignedStaffId: job.assignedStaff, // Also provide ID if needed
        poNumber: job.poNumber || '',
        comments: job.comments,
      },
      equipment: (job.equipment || []).map((eq) => ({
        ...eq,
        manufacturerModel: [eq.manufacturer, eq.model].filter(Boolean).join(' / '),
      })),
      service: {
        ...(job.serviceInformation || {}),
        statementOfConformityReferencePdfUrl:
          job.serviceInformation?.statementOfConformityReferencePdf?.url || '',
        statementOfConformityReferencePdfName:
          job.serviceInformation?.statementOfConformityReferencePdf?.name || '',
        // Computed boolean helpers — drive checkboxes in Service Request templates
        statementOfConformityRequired:
          job.serviceInformation?.statementOfConformity === 'Required',
        statementOfConformityNotRequired:
          job.serviceInformation?.statementOfConformity === 'Not required',
      },
      workAuthorization: workAuthorization,
      measurements: {
        data: this.getMeasurementsData(job),
        // Also expose individual equipment spreadsheet data for direct access
        getData: (index?: number) => {
          const allData = this.getMeasurementsData(job);
          if (index !== undefined && allData[index]) {
            return allData[index];
          }
          return allData[0] || null;
        }
      },
      footer: {
        text: '',
        page_number: 1,
        total_pages: 1,
      },
    };
  }

  /**
   * Get measurements data from equipment
   */
  private getMeasurementsData(job: Job): any[] {
    const measurements: any[] = [];
    if (job.equipment) {
      for (const eq of job.equipment) {
        if (eq.spreadsheetData) {
          measurements.push(eq.spreadsheetData);
        }
      }
    }
    
    // Debug logging (development only)
    if (import.meta.env.DEV) {
      debugLog('[PDF Renderer] getMeasurementsData:', {
        equipmentCount: job.equipment?.length || 0,
        measurementsFound: measurements.length,
        hasSpreadsheetModel: measurements.length > 0 && measurements[0]?.spreadsheetModel ? true : false
      });
    }
    
    return measurements;
  }


  /**
   * Convert image URL to base64
   */
  private async imageUrlToBase64(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          ctx.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL('image/png');
          resolve(base64);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`));
      };
      
      img.src = url;
    });
  }

  /**
   * Build the RendererHelpers object to pass into sub-renderer files.
   * This gives extracted functions access to shared utilities without
   * importing the class itself (which would be circular).
   */
  private getRendererHelpers(): RendererHelpers {
    return {
      applyContentFont: (pdf, text, family, style, size) =>
        this.applyContentFont(pdf, text, family, style as any, size),
      wrapTextForCell: (text, maxWidth, fontSize, pdf) =>
        this.wrapTextForCell(text, maxWidth, fontSize, pdf),
      normalizePdfText: (text) => this.normalizePdfText(text),
      formatDate: (value, format) => this.formatDate(value, format),
    };
  }
}

export const pdfTemplateRenderer = new PdfTemplateRenderer();
