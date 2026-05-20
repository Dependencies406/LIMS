import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  validateTemplate: vi.fn(),
  renderTemplateWithContext: vi.fn(),
  list: vi.fn(),
  getCustomerByCode: vi.fn(),
  createObjectURL: vi.fn(() => 'blob:test'),
  revokeObjectURL: vi.fn(),
}));

vi.mock('../pdfDataResolver', () => ({
  pdfDataResolver: {
    validateTemplate: (...args: unknown[]) => hoisted.validateTemplate(...args),
  },
}));

vi.mock('../pdfTemplateRenderer', () => ({
  pdfTemplateRenderer: {
    renderTemplateWithContext: (...args: unknown[]) => hoisted.renderTemplateWithContext(...args),
  },
}));

vi.mock('../documentIndexService', () => ({
  documentIndexService: {
    list: (...args: unknown[]) => hoisted.list(...args),
  },
}));

// Guard against accidental coupling to customer lookups in documents flow
vi.mock('../customerService', () => ({
  customerService: {
    getCustomerByCode: (...args: unknown[]) => hoisted.getCustomerByCode(...args),
  },
}));

vi.mock('../companyInfoService', () => ({
  getCompanyInfo: vi.fn().mockResolvedValue({
    companyName: 'Test Co',
    address: '',
    contactInfo: {},
    logoBase64: '',
    additionalInfo: {},
  }),
  formatCompanyAddress: vi.fn().mockReturnValue(''),
}));

import { documentsTemplatePrintService } from '../documentsTemplatePrintService';

describe('documentsTemplatePrintService', () => {
  beforeEach(() => {
    hoisted.validateTemplate.mockReset();
    hoisted.renderTemplateWithContext.mockReset();
    hoisted.list.mockReset();
    hoisted.getCustomerByCode.mockReset();
    hoisted.list.mockResolvedValue([]);
    hoisted.validateTemplate.mockReturnValue([]);
    hoisted.renderTemplateWithContext.mockResolvedValue({
      pdf: { output: vi.fn(() => new Blob(['x'], { type: 'application/pdf' })) },
      missingData: [],
    });
  });

  it('validates template via documents context without job/customer lookups', async () => {
    await documentsTemplatePrintService.validateTemplate({ name: 'T' } as any);
    expect(hoisted.list).toHaveBeenCalledOnce();
    expect(hoisted.getCustomerByCode).not.toHaveBeenCalled();
    expect(hoisted.validateTemplate).toHaveBeenCalledOnce();
  });

  it('generates blob via renderer and returns missing data', async () => {
    const out = await documentsTemplatePrintService.generatePdfBlob({ name: 'T' } as any, { continueWithNA: true });
    expect(hoisted.renderTemplateWithContext).toHaveBeenCalledOnce();
    expect(out.blob).toBeInstanceOf(Blob);
    expect(Array.isArray(out.missingData)).toBe(true);
  });

  it('throws clear error when documents fetch fails', async () => {
    hoisted.list.mockRejectedValueOnce(new Error('boom'));
    await expect(documentsTemplatePrintService.validateTemplate({ name: 'DAR' } as any))
      .rejects
      .toThrow('Failed to load documents for print.');
  });

  it('uses provided documentIndexItems without fetching the full documents list', async () => {
    const filteredItems = [
      {
        id: 'd1',
        documentCode: 'DOC-1',
        type: 'Quality Procedure',
        revisionNumber: '01',
        documentName: 'Doc 1',
        tags: [],
        effectiveDate: new Date('2024-01-01'),
        darNumber: '',
        source: { kind: 'pdf' as const, storagePath: '/p/1.pdf', url: 'https://x/1.pdf', fileName: '1.pdf' },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'u',
        updatedBy: 'u',
      },
    ] as any[];

    await documentsTemplatePrintService.generatePdfBlob(
      { name: 'T' } as any,
      { continueWithNA: false, documentIndexItems: filteredItems }
    );

    expect(hoisted.list).not.toHaveBeenCalled();
    expect(hoisted.renderTemplateWithContext).toHaveBeenCalledOnce();
    const ctx = hoisted.renderTemplateWithContext.mock.calls[0][1] as any;
    expect(ctx.documentIndexItems).toEqual(filteredItems);
    expect(ctx.documents.list).toEqual(filteredItems);
  });

  it('openBlobForPrint falls back to download when popup blocked', () => {
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const click = vi.fn();
    const createElement = vi.fn(() => ({ click }));
    const open = vi.fn(() => null);

    (globalThis as any).window = { open, setTimeout: (fn: any) => fn() };
    (globalThis as any).document = { body: { appendChild, removeChild }, createElement };
    (globalThis as any).URL = { createObjectURL: hoisted.createObjectURL, revokeObjectURL: hoisted.revokeObjectURL };

    const result = documentsTemplatePrintService.openBlobForPrint(new Blob(['x'], { type: 'application/pdf' }), 'docs.pdf');
    expect(result).toBe('downloaded-fallback');
    expect(createElement).toHaveBeenCalledWith('a');
    expect(click).toHaveBeenCalledOnce();
  });
});

