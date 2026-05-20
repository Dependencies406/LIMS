/**
 * Hook for template-based PDF generation
 * Implements the workflow: Select Template → Check Missing Data → Generate PDF
 */

import { useState, useCallback } from 'react';
import type { Job } from '../types';
import type { PdfTemplate } from '../modules/pdf-template-builder/types';
import { pdfTemplateRenderer } from '../services/pdfTemplateRenderer';
import type { MissingDataReport } from '../services/pdfDataResolver';

export interface UseTemplatePdfGenerationResult {
  selectedTemplate: PdfTemplate | null;
  missingData: MissingDataReport[];
  isGenerating: boolean;
  error: string | null;
  selectTemplate: (template: PdfTemplate) => void;
  generatePdf: (job: Job, continueWithNA: boolean) => Promise<Blob | null>;
  reset: () => void;
}

export function useTemplatePdfGeneration(): UseTemplatePdfGenerationResult {
  const [selectedTemplate, setSelectedTemplate] = useState<PdfTemplate | null>(null);
  const [missingData, setMissingData] = useState<MissingDataReport[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectTemplate = useCallback((template: PdfTemplate) => {
    setSelectedTemplate(template);
    setError(null);
    // Clear previous missing data when selecting new template
    setMissingData([]);
  }, []);

  const generatePdf = useCallback(async (job: Job, continueWithNA: boolean): Promise<Blob | null> => {
    if (!selectedTemplate) {
      setError('No template selected');
      return null;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Render template
      const result = await pdfTemplateRenderer.renderTemplate(
        selectedTemplate,
        job,
        {
          showMissingDataAsNA: continueWithNA,
          missingDataLabel: 'N/A',
        }
      );

      // Store missing data
      setMissingData(result.missingData);

      // Convert PDF to blob
      const pdfBlob = result.pdf.output('blob');
      return pdfBlob;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate PDF';
      setError(errorMessage);
      console.error('PDF generation error:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [selectedTemplate]);

  const reset = useCallback(() => {
    setSelectedTemplate(null);
    setMissingData([]);
    setError(null);
    setIsGenerating(false);
  }, []);

  return {
    selectedTemplate,
    missingData,
    isGenerating,
    error,
    selectTemplate,
    generatePdf,
    reset,
  };
}
