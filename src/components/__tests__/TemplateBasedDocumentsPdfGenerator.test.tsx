/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TemplateBasedDocumentsPdfGenerator } from '../TemplateBasedDocumentsPdfGenerator';

const mocks = vi.hoisted(() => ({
  validateTemplate: vi.fn(),
  generatePdfBlob: vi.fn(),
}));

vi.mock('../../services/documentsTemplatePrintService', () => ({
  documentsTemplatePrintService: {
    validateTemplate: (...args: unknown[]) => mocks.validateTemplate(...args),
    generatePdfBlob: (...args: unknown[]) => mocks.generatePdfBlob(...args),
  },
}));

vi.mock('../TemplateSelectorModal', () => ({
  TemplateSelectorModal: ({ isOpen, onSelect, onClose }: any) =>
    isOpen ? (
      <div>
        <button onClick={() => onSelect({ id: 't1', name: 'DAR', pageSize: 'A4', elements: [] })}>pick-template</button>
        <button onClick={onClose}>close-selector</button>
      </div>
    ) : null,
}));

vi.mock('../MissingDataWarningModal', () => ({
  MissingDataWarningModal: ({ isOpen, onContinue, onCancel }: any) =>
    isOpen ? (
      <div>
        <button onClick={onContinue}>continue-na</button>
        <button onClick={onCancel}>cancel-na</button>
      </div>
    ) : null,
}));

describe('TemplateBasedDocumentsPdfGenerator', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    } as any);
    mocks.validateTemplate.mockReset();
    mocks.generatePdfBlob.mockReset();
    mocks.validateTemplate.mockResolvedValue([]);
    mocks.generatePdfBlob.mockResolvedValue({ blob: new Blob(['x'], { type: 'application/pdf' }), missingData: [] });
  });

  it('selecting template with no missing data triggers generation and opens preview (no auto-download)', async () => {
    render(<TemplateBasedDocumentsPdfGenerator />);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    fireEvent.click(screen.getByText('pick-template'));
    await waitFor(() => expect(mocks.generatePdfBlob).toHaveBeenCalledTimes(1));
    expect(screen.getByTitle('Documents PDF Preview')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('passes documentIndexItems into documentsTemplatePrintService', async () => {
    const items = [{ id: 'd1', documentCode: 'KEEP-1', type: 'Quality Procedure' }] as any[];
    render(<TemplateBasedDocumentsPdfGenerator documentIndexItems={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    fireEvent.click(screen.getByText('pick-template'));

    await waitFor(() => expect(mocks.generatePdfBlob).toHaveBeenCalled());
    const [, options] = mocks.generatePdfBlob.mock.calls[0];
    expect(options).toEqual({ continueWithNA: false, documentIndexItems: items });
  });

  it('missing data opens warning modal', async () => {
    mocks.validateTemplate.mockResolvedValue([{ elementId: 'x', elementType: 'text', elementName: 'X', dataSource: 'a', section: 'job-information', reason: 'missing' }]);
    render(<TemplateBasedDocumentsPdfGenerator />);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    fireEvent.click(screen.getByText('pick-template'));
    await waitFor(() => expect(screen.getByText('continue-na')).toBeTruthy());
    expect(mocks.generatePdfBlob).not.toHaveBeenCalled();
  });

  it('continue with N/A triggers generation', async () => {
    mocks.validateTemplate.mockResolvedValue([{ elementId: 'x', elementType: 'text', elementName: 'X', dataSource: 'a', section: 'job-information', reason: 'missing' }]);
    render(<TemplateBasedDocumentsPdfGenerator />);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    fireEvent.click(screen.getByText('pick-template'));
    await waitFor(() => expect(screen.getByText('continue-na')).toBeTruthy());
    fireEvent.click(screen.getByText('continue-na'));
    await waitFor(() => expect(mocks.generatePdfBlob).toHaveBeenCalledWith(expect.any(Object), { continueWithNA: true }));
  });

  it('print button handles popup blocked and keeps preview available', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null as any);
    render(<TemplateBasedDocumentsPdfGenerator />);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    fireEvent.click(screen.getByText('pick-template'));
    await waitFor(() => expect(screen.getByTitle('Documents PDF Preview')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Popup blocked. You can still Download PDF.'));
    openSpy.mockRestore();
  });
});

