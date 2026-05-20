/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTemplatePdfWorkflow } from '../useTemplatePdfWorkflow';

const mocks = vi.hoisted(() => ({
  validateTemplate: vi.fn(),
  generatePdfBlob: vi.fn(),
  renderTemplate: vi.fn(),
  prepareJobDataForPdf: vi.fn(),
  validateResolver: vi.fn(),
}));

vi.mock('../../services/documentsTemplatePrintService', () => ({
  documentsTemplatePrintService: {
    validateTemplate: (...args: unknown[]) => mocks.validateTemplate(...args),
    generatePdfBlob: (...args: unknown[]) => mocks.generatePdfBlob(...args),
  },
}));

vi.mock('../../services/pdfTemplateRenderer', () => ({
  pdfTemplateRenderer: {
    renderTemplate: (...args: unknown[]) => mocks.renderTemplate(...args),
    prepareJobDataForPdf: (...args: unknown[]) => mocks.prepareJobDataForPdf(...args),
  },
}));

vi.mock('../../services/pdfDataResolver', () => ({
  pdfDataResolver: {
    validateTemplate: (...args: unknown[]) => mocks.validateResolver(...args),
  },
}));

describe('useTemplatePdfWorkflow', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() } as any);
    mocks.validateTemplate.mockReset();
    mocks.generatePdfBlob.mockReset();
    mocks.renderTemplate.mockReset();
    mocks.prepareJobDataForPdf.mockReset();
    mocks.validateResolver.mockReset();
    mocks.validateTemplate.mockResolvedValue([]);
    mocks.generatePdfBlob.mockResolvedValue({ blob: new Blob(['x']), missingData: [] });
    mocks.prepareJobDataForPdf.mockResolvedValue({ prepared: true });
    mocks.validateResolver.mockReturnValue([]);
    mocks.renderTemplate.mockResolvedValue({ pdf: { output: vi.fn(() => new Blob(['x'])) }, missingData: [] });
  });

  it('documents mode: template selection leads to preview', async () => {
    const { result } = renderHook(() => useTemplatePdfWorkflow({ mode: 'documents' }));
    await act(async () => {
      await result.current.handleTemplateSelect({ id: 't1', name: 'DAR', pageSize: 'A4', elements: [] } as any);
    });
    await waitFor(() => expect(result.current.previewUrl).toBeTruthy());
  });

  it('documents mode passes documentIndexItems through to documentsTemplatePrintService', async () => {
    const items = [{ id: 'd1', documentCode: 'KEEP-1', type: 'Quality Procedure' }] as any;

    const { result } = renderHook(() => useTemplatePdfWorkflow({ mode: 'documents', documentIndexItems: items }));
    await act(async () => {
      await result.current.handleTemplateSelect({ id: 't1', name: 'DAR', pageSize: 'A4', elements: [] } as any);
    });

    await waitFor(() => expect(mocks.generatePdfBlob).toHaveBeenCalled());
    const [, options] = mocks.generatePdfBlob.mock.calls[0];
    expect(options).toEqual({ continueWithNA: false, documentIndexItems: items });
    const [, validateOptions] = mocks.validateTemplate.mock.calls[0];
    expect(validateOptions).toEqual({ documentIndexItems: items });
  });

  it('job mode: template selection leads to preview', async () => {
    const job = { id: 'j1', jobId: 'JOB-1' } as any;
    const { result } = renderHook(() => useTemplatePdfWorkflow({ mode: 'job', job }));
    await act(async () => {
      await result.current.handleTemplateSelect({ id: 't1', name: 'Service Request', pageSize: 'A4', elements: [] } as any);
    });
    await waitFor(() => expect(result.current.previewUrl).toBeTruthy());
  });
});

