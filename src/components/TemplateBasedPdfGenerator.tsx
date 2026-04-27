/**
 * Template-Based PDF Generator
 * Implements the complete workflow: Select Template → Check Missing Data → Generate PDF
 */

import React, { useState } from 'react';
import type { Job } from '../types';
import { TemplateSelectorModal } from './TemplateSelectorModal';
import { MissingDataWarningModal } from './MissingDataWarningModal';
import { useTemplatePdfGeneration } from '../hooks/useTemplatePdfGeneration';
import { pdfDataResolver } from '../services/pdfDataResolver';
import { pdfTemplateRenderer } from '../services/pdfTemplateRenderer';
import type { PdfTemplate } from '../modules/pdf-template-builder/types';
import type { MissingDataReport } from '../services/pdfDataResolver';

export interface TemplateBasedPdfGeneratorProps {
  job: Job;
  onPdfGenerated?: (pdfBlob: Blob) => void;
  onClose?: () => void;
  trigger?: React.ReactNode; // Custom trigger button
}

export const TemplateBasedPdfGenerator: React.FC<TemplateBasedPdfGeneratorProps> = ({
  job,
  onPdfGenerated,
  onClose,
  trigger,
}) => {
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showMissingDataWarning, setShowMissingDataWarning] = useState(false);
  const [localMissingData, setLocalMissingData] = useState<MissingDataReport[]>([]);

  const {
    selectedTemplate,
    missingData,
    isGenerating,
    error,
    selectTemplate,
    generatePdf,
    reset,
  } = useTemplatePdfGeneration();

  const handleTemplateSelect = (template: PdfTemplate) => {
    selectTemplate(template);
    setShowTemplateSelector(false);
  };


  const handleGenerateClick = async () => {
    try {
      if (!selectedTemplate) {
        setShowTemplateSelector(true);
        return;
      }

      // First, check for missing data before generating
      // Prepare job data with company info from settings for accurate validation
      const jobData = await pdfTemplateRenderer.prepareJobDataForPdf(job);
      const missing = pdfDataResolver.validateTemplate(selectedTemplate, jobData);
      setLocalMissingData(missing);
      
      if (missing.length > 0) {
        // Show warning modal with missing data
        setShowMissingDataWarning(true);
        return;
      }

      // No missing data, generate PDF directly
      const pdfBlob = await generatePdf(job, false);
      
      if (error) {
        alert(`Error: ${error}`);
        return;
      }

      if (pdfBlob) {
        onPdfGenerated?.(pdfBlob);
        handleDownload(pdfBlob);
      }
    } catch (err) {
      console.error('Error in handleGenerateClick:', err);
      alert(`Failed to generate PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleContinueWithNA = async () => {
    try {
      setShowMissingDataWarning(false);
      
      if (!selectedTemplate) return;

      const pdfBlob = await generatePdf(job, true);
      
      if (pdfBlob) {
        onPdfGenerated?.(pdfBlob);
        handleDownload(pdfBlob);
      } else if (error) {
        alert(`Error: ${error}`);
      }
    } catch (err) {
      console.error('Error in handleContinueWithNA:', err);
      alert(`Failed to generate PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDownload = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-${job.jobId}-${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCancel = () => {
    reset();
    setShowTemplateSelector(false);
    setShowMissingDataWarning(false);
    onClose?.();
  };

  return (
    <>
      {trigger ? (
        <div onClick={handleGenerateClick}>
          {trigger}
        </div>
      ) : (
        <button
          onClick={handleGenerateClick}
          disabled={isGenerating}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isGenerating ? 'Generating...' : selectedTemplate ? `Generate PDF (${selectedTemplate.name})` : 'Generate PDF'}
        </button>
      )}

      <TemplateSelectorModal
        isOpen={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        onSelect={handleTemplateSelect}
      />

      <MissingDataWarningModal
        isOpen={showMissingDataWarning}
        missingData={localMissingData.length > 0 ? localMissingData : missingData}
        onContinue={handleContinueWithNA}
        onCancel={handleCancel}
      />
    </>
  );
};
