/** @vitest-environment jsdom */
import React, { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TemplateBasedPdfPreviewModal } from '../TemplateBasedPdfPreviewModal';
import type { Job } from '../../types';

const pdfMocks = vi.hoisted(() => ({
  prepareJobDataForPdf: vi.fn(),
  renderTemplate: vi.fn(),
}));

vi.mock('../../services/pdfTemplateRenderer', () => ({
  pdfTemplateRenderer: {
    prepareJobDataForPdf: (...args: unknown[]) => pdfMocks.prepareJobDataForPdf(...args),
    renderTemplate: (...args: unknown[]) => pdfMocks.renderTemplate(...args),
  },
}));

vi.mock('../../services/pdfDataResolver', () => ({
  pdfDataResolver: {
    validateTemplate: vi.fn(() => []),
  },
}));

vi.mock('../TemplateSelectorModal', () => ({
  TemplateSelectorModal: ({ isOpen, onSelect }: { isOpen: boolean; onSelect: (t: unknown) => void }) =>
    isOpen ? (
      <button
        type="button"
        onClick={() =>
          onSelect({
            id: 'service-request',
            name: 'Service Request',
            pageSize: 'A4',
            elements: [],
          })
        }
      >
        pick-template
      </button>
    ) : null,
}));

vi.mock('../MissingDataWarningModal', () => ({
  MissingDataWarningModal: () => null,
}));

const mockJob: Job = {
  id: 'job-doc-1',
  jobId: 'JOB-001',
  title: 'Test',
  status: 'Completed',
  customerCode: 'C1',
  customerContact: 'x',
  equipment: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  createdBy: 'u',
} as Job;

describe('TemplateBasedPdfPreviewModal', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview-test'),
      revokeObjectURL: vi.fn(),
    } as any);
    pdfMocks.prepareJobDataForPdf.mockReset();
    pdfMocks.renderTemplate.mockReset();
    pdfMocks.prepareJobDataForPdf.mockResolvedValue({ prepared: true });
    pdfMocks.renderTemplate.mockResolvedValue({
      pdf: { output: vi.fn(() => new Blob(['%PDF'], { type: 'application/pdf' })) },
      missingData: [],
    });
  });

  it('calls renderTemplate once per template select; prepareJobDataForPdf once when validation cache applies', async () => {
    render(<TemplateBasedPdfPreviewModal isOpen onClose={vi.fn()} job={mockJob} />);
    fireEvent.click(screen.getByRole('button', { name: 'pick-template' }));
    await waitFor(() => expect(pdfMocks.renderTemplate).toHaveBeenCalledTimes(1));
    expect(pdfMocks.prepareJobDataForPdf).toHaveBeenCalledTimes(1);
  });

  it('under StrictMode, concurrent generation shares one renderTemplate (single-flight)', async () => {
    render(
      <StrictMode>
        <TemplateBasedPdfPreviewModal isOpen onClose={vi.fn()} job={mockJob} />
      </StrictMode>
    );
    fireEvent.click(screen.getByRole('button', { name: 'pick-template' }));
    await waitFor(() => expect(pdfMocks.renderTemplate).toHaveBeenCalledTimes(1));
    // Template select path always prepares once per user selection; auto-preview must not prepare again.
    expect(pdfMocks.prepareJobDataForPdf).toHaveBeenCalledTimes(1);
  });
});
