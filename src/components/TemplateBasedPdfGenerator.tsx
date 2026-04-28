/**
 * Template-Based PDF Generator (Jobs)
 * Workflow: Select Template → Check Missing Data → In-app Preview → Print / Download
 */

import React, { useState } from 'react';
import type { Job } from '../types';
import { TemplateSelectorModal } from './TemplateSelectorModal';
import { MissingDataWarningModal } from './MissingDataWarningModal';
import { Modal, Button } from './common';
import { useTemplatePdfWorkflow } from '../hooks/useTemplatePdfWorkflow';
import { PdfTemplateBuilderModal } from './PdfTemplateBuilderModal';

export interface TemplateBasedPdfGeneratorProps {
  job: Job;
  onPdfGenerated?: (pdfBlob: Blob) => void;
  onClose?: () => void;
  /** Custom trigger element. Clicking it opens the template selector. */
  trigger?: React.ReactNode;
  /** Override the equipment index to include in the PDF (pass undefined to include all). */
  selectedEquipmentIndex?: number;
}

export const TemplateBasedPdfGenerator: React.FC<TemplateBasedPdfGeneratorProps> = ({
  job,
  onClose,
  trigger,
  selectedEquipmentIndex,
}) => {
  const [showBuilder, setShowBuilder] = useState(false);

  const wf = useTemplatePdfWorkflow({
    mode: 'job',
    job,
    selectedEquipmentIndex,
    scope: 'jobs',
  });

  const handleStart = () => {
    wf.setShowTemplateSelector(true);
  };

  const handleCreateNew = () => {
    // TemplateSelectorModal calls onClose internally before calling this
    setShowBuilder(true);
  };

  const fileName = `job-${job.jobId}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return (
    <>
      {/* Trigger */}
      {trigger ? (
        <div onClick={handleStart} aria-busy={wf.isGenerating}>
          {trigger}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleStart}
          disabled={wf.isGenerating}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {wf.isGenerating
            ? 'Generating…'
            : wf.selectedTemplate
            ? `Print (${wf.selectedTemplate.name})`
            : 'Print PDF'}
        </button>
      )}

      {/* Template Selector (scoped to jobs + global) */}
      <TemplateSelectorModal
        isOpen={wf.showTemplateSelector}
        onClose={() => {
          wf.setShowTemplateSelector(false);
          onClose?.();
        }}
        onSelect={wf.handleTemplateSelect}
        scope="jobs"
        onCreateNew={handleCreateNew}
      />

      {/* Missing Data Warning */}
      <MissingDataWarningModal
        isOpen={wf.showMissingDataWarning}
        missingData={wf.missingData}
        onContinue={() => void wf.handleContinueWithNA()}
        onCancel={() => {
          wf.setShowMissingDataWarning(false);
          onClose?.();
        }}
      />

      {/* In-app PDF Preview */}
      <Modal
        isOpen={!!wf.previewUrl && !wf.showTemplateSelector && !wf.showMissingDataWarning}
        onClose={() => {
          wf.reset();
          onClose?.();
        }}
        title={`PDF Preview${wf.selectedTemplate ? ` — ${wf.selectedTemplate.name}` : ''}`}
        size="large"
      >
        <div className="space-y-4">
          <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height: '600px' }}>
            {wf.previewUrl && (
              <iframe
                src={wf.previewUrl}
                className="w-full h-full border-0"
                title="Job PDF Preview"
              />
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => wf.setShowTemplateSelector(true)}>
              Change Template
            </Button>
            <Button variant="secondary" onClick={wf.printPreview}>
              Print
            </Button>
            <Button variant="primary" onClick={() => wf.downloadPreview(fileName)}>
              Download
            </Button>
          </div>
        </div>
      </Modal>

      {/* Status messages */}
      {wf.error && (
        <div className="text-xs text-red-600 mt-2" role="alert">
          {wf.error}
        </div>
      )}
      {wf.infoMessage && (
        <div className="text-xs text-blue-700 mt-2" role="status">
          {wf.infoMessage}
        </div>
      )}
      {wf.isGenerating && (
        <div className="text-xs text-gray-600 mt-2" aria-live="polite">
          Generating PDF…
        </div>
      )}

      {/* Template Builder — opens when user clicks "Create New Template" in the selector */}
      <PdfTemplateBuilderModal
        isOpen={showBuilder}
        onClose={() => setShowBuilder(false)}
        initialScope="jobs"
        onSave={() => {
          // After saving, close builder and re-open selector so user can pick the new template
          setShowBuilder(false);
          wf.setShowTemplateSelector(true);
        }}
      />
    </>
  );
};
