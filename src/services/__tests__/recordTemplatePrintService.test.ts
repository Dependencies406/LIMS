/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalibrationRecord, RecorderTemplate } from '../../types';
import type { PdfTemplate } from '../../modules/pdf-template-builder/types';

const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  renderTemplateWithContext: vi.fn(),
  validateTemplate: vi.fn(),
  getCompanyInfo: vi.fn(),
  addWatermark: vi.fn(),
  getAllConversionRules: vi.fn(),
}));

vi.mock('../recorderTemplateService', () => ({
  recorderTemplateService: {
    getVersion: (...args: unknown[]) => mocks.getVersion(...args),
    // Intentionally no getTemplateById/getActiveTemplateByEquipmentTypeId mock —
    // if the service ever called either of those (the "live template" paths),
    // the test would fail with "not a function" rather than silently passing.
  },
}));

vi.mock('../pdfTemplateRenderer', () => ({
  pdfTemplateRenderer: {
    renderTemplateWithContext: (...args: unknown[]) => mocks.renderTemplateWithContext(...args),
  },
}));

vi.mock('../pdfDataResolver', () => ({
  pdfDataResolver: {
    validateTemplate: (...args: unknown[]) => mocks.validateTemplate(...args),
  },
}));

vi.mock('../companyInfoService', () => ({
  getCompanyInfo: (...args: unknown[]) => mocks.getCompanyInfo(...args),
  formatCompanyAddress: () => '',
}));

vi.mock('../documentPdfService', () => ({
  addWatermark: (...args: unknown[]) => mocks.addWatermark(...args),
}));

vi.mock('../unitConversionRuleService', () => ({
  unitConversionRuleService: {
    getAll: (...args: unknown[]) => mocks.getAllConversionRules(...args),
  },
}));

import { recordTemplatePrintService, assertPrintable, resolvePinnedTemplate, RecordNotPrintableError } from '../recordTemplatePrintService';

function baseRecord(overrides: Partial<CalibrationRecord> = {}): CalibrationRecord {
  return {
    id: 'rec1',
    recordNumber: 'UTM-001',
    jobId: 'job1',
    itemId: 'item1',
    equipmentTypeId: 'eqtype1',
    templateId: 'tpl1',
    templateVersion: 2,
    contextSnapshot: {} as any,
    environment: [],
    rows: [],
    summary: {},
    status: 'approved',
    createdAt: new Date(),
    createdBy: 'u1',
    ...overrides,
  } as CalibrationRecord;
}

function pinnedSnapshot(overrides: Partial<RecorderTemplate> = {}): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'Pinned v2',
    equipmentTypeId: 'eqtype1',
    roundCount: 1,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['UTM'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [],
    summaryFields: [],
    customFunctions: [],
    status: 'active',
    version: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  } as RecorderTemplate;
}

const fakePdfTemplate: PdfTemplate = { name: 't', description: '', pageSize: 'A4', elements: [] };

describe('assertPrintable (Task 3: draft is blocked entirely)', () => {
  it('throws RecordNotPrintableError for a draft', () => {
    expect(() => assertPrintable(baseRecord({ status: 'draft' }))).toThrow(RecordNotPrintableError);
  });

  it.each(['committed', 'reviewed', 'approved', 'superseded'] as const)('does not throw for status %s', (status) => {
    expect(() => assertPrintable(baseRecord({ status }))).not.toThrow();
  });
});

describe('resolvePinnedTemplate (ADR-005: pinned version, never the live template)', () => {
  beforeEach(() => {
    mocks.getVersion.mockReset();
  });

  it('resolves via recorderTemplateService.getVersion(templateId, templateVersion) — the pinned version, not the live one', async () => {
    const record = baseRecord({ templateId: 'tpl1', templateVersion: 2 });
    const pinned = pinnedSnapshot({ name: 'Pinned snapshot v2' });
    mocks.getVersion.mockResolvedValue({ id: 'v2', templateId: 'tpl1', version: 2, snapshot: pinned, publishedAt: new Date(), publishedBy: 'u1' });

    const result = await resolvePinnedTemplate(record);

    expect(mocks.getVersion).toHaveBeenCalledWith('tpl1', 2);
    expect(mocks.getVersion).toHaveBeenCalledTimes(1);
    expect(result.name).toBe('Pinned snapshot v2');
  });

  it('proves the live template is irrelevant: editing what a live template would look like does not change the resolved snapshot', async () => {
    const record = baseRecord({ templateId: 'tpl1', templateVersion: 1 });
    const pinnedV1 = pinnedSnapshot({ name: 'v1 as originally pinned', version: 1 });
    mocks.getVersion.mockResolvedValue({ id: 'v1', templateId: 'tpl1', version: 1, snapshot: pinnedV1, publishedAt: new Date(), publishedBy: 'u1' });

    // Simulate the live template having since been edited to v3 — resolvePinnedTemplate
    // never looks at that; it only ever asks for (templateId, templateVersion) = (tpl1, 1).
    const result = await resolvePinnedTemplate(record);

    expect(result.name).toBe('v1 as originally pinned');
    expect(result.version).toBe(1);
    expect(mocks.getVersion).toHaveBeenCalledWith('tpl1', 1); // never '3', the hypothetical live version
  });

  it('fails cleanly when the pinned version no longer exists', async () => {
    mocks.getVersion.mockResolvedValue(null);
    const record = baseRecord({ templateId: 'tpl1', templateVersion: 5 });

    await expect(resolvePinnedTemplate(record)).rejects.toThrow(RecordNotPrintableError);
    await expect(resolvePinnedTemplate(record)).rejects.toThrow(/no longer exists/);
  });
});

describe('recordTemplatePrintService.generatePdfBlob', () => {
  beforeEach(() => {
    mocks.getVersion.mockReset();
    mocks.renderTemplateWithContext.mockReset();
    mocks.getCompanyInfo.mockReset().mockResolvedValue(null);
    mocks.addWatermark.mockReset();
    mocks.getAllConversionRules.mockReset().mockResolvedValue([]);
    mocks.getVersion.mockResolvedValue({
      id: 'v2', templateId: 'tpl1', version: 2, snapshot: pinnedSnapshot(), publishedAt: new Date(), publishedBy: 'u1',
    });
    const fakePdf = {
      output: vi.fn(() => new Blob(['pdf'])),
      getNumberOfPages: vi.fn(() => 2),
      setPage: vi.fn(),
    };
    mocks.renderTemplateWithContext.mockResolvedValue({ pdf: fakePdf, missingData: [] });
  });

  it('rejects a draft record before ever resolving a template version', async () => {
    const record = baseRecord({ status: 'draft' });
    await expect(recordTemplatePrintService.generatePdfBlob(fakePdfTemplate, record)).rejects.toThrow(RecordNotPrintableError);
    expect(mocks.getVersion).not.toHaveBeenCalled();
  });

  it('passes record + the PINNED recordTemplate snapshot into the render context', async () => {
    const record = baseRecord({ status: 'approved' });
    await recordTemplatePrintService.generatePdfBlob(fakePdfTemplate, record);

    expect(mocks.renderTemplateWithContext).toHaveBeenCalledTimes(1);
    const [, context] = mocks.renderTemplateWithContext.mock.calls[0];
    expect(context.record).toBe(record);
    expect(context.recordTemplate.version).toBe(2);
  });

  it('ADR-015 D2: threads the conversion rule library into the render context', async () => {
    const rule = {
      id: 'r1', name: 'mV/V to %', fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * 100',
      active: true, createdAt: new Date(), updatedAt: new Date(), createdBy: 'admin1',
    };
    mocks.getAllConversionRules.mockResolvedValue([rule]);
    const record = baseRecord({ status: 'approved' });

    await recordTemplatePrintService.generatePdfBlob(fakePdfTemplate, record);

    const [, context] = mocks.renderTemplateWithContext.mock.calls[0];
    expect(context.conversionRules).toEqual([rule]);
  });

  it('stamps no watermark for an approved record', async () => {
    const record = baseRecord({ status: 'approved' });
    await recordTemplatePrintService.generatePdfBlob(fakePdfTemplate, record);
    expect(mocks.addWatermark).not.toHaveBeenCalled();
  });

  it.each([
    ['committed', 'UNAPPROVED — NOT YET REVIEWED'],
    ['reviewed', 'UNAPPROVED — PENDING FINAL APPROVAL'],
    ['superseded', 'SUPERSEDED — SEE REVISION'],
  ] as const)('stamps a watermark on every page for status %s', async (status, expectedText) => {
    const record = baseRecord({ status });
    await recordTemplatePrintService.generatePdfBlob(fakePdfTemplate, record);
    expect(mocks.addWatermark).toHaveBeenCalledTimes(2); // 2 pages, from getNumberOfPages mock
    expect(mocks.addWatermark.mock.calls[0][1]).toBe(expectedText);
  });
});
