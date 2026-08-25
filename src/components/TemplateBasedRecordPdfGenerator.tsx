/**
 * Template-Based Record PDF Generator
 *
 * Print entry point for a CalibrationRecord (Phase 7). Modeled directly on
 * TemplateBasedDocumentsPdfGenerator.tsx — same TemplateSelectorModal +
 * MissingDataWarningModal + preview Modal composition, just backed by
 * `useTemplatePdfWorkflow({ mode: 'record' })` instead of 'documents'.
 *
 * Draft records never reach this component in the first place — RecordEntryPage
 * only renders the trigger for non-draft records (nothing to certify yet).
 */

import React, { useState } from 'react';
import { TemplateSelectorModal } from './TemplateSelectorModal';
import { MissingDataWarningModal } from './MissingDataWarningModal';
import { Modal, Button } from './common';
import { useTemplatePdfWorkflow } from '../hooks/useTemplatePdfWorkflow';
import { PdfTemplateBuilderModal } from './PdfTemplateBuilderModal';
import type { CalibrationRecord } from '../types';

export interface TemplateBasedRecordPdfGeneratorProps {
  record: CalibrationRecord;
  trigger?: React.ReactNode;
  onClose?: () => void;
}

export const TemplateBasedRecordPdfGenerator: React.FC<TemplateBasedRecordPdfGeneratorProps> = ({
  record,
  trigger,
  onClose,
}) => {
  const [showBuilder, setShowBuilder] = useState(false);

  const wf = useTemplatePdfWorkflow({ mode: 'record', record, scope: 'calibrationRecords' });

  const handleStart = () => {
    wf.setShowTemplateSelector(true);
  };

  const handleCreateNew = () => {
    setShowBuilder(true);
  };

  return (
    <>
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
          {wf.isGenerating ? 'Generating…' : wf.selectedTemplate ? `Print (${wf.selectedTemplate.name})` : 'Print Certificate'}
        </button>
      )}

      <TemplateSelectorModal
        isOpen={wf.showTemplateSelector}
        onClose={() => {
          wf.setShowTemplateSelector(false);
          onClose?.();
        }}
        onSelect={wf.handleTemplateSelect}
        scope="calibrationRecords"
        onCreateNew={handleCreateNew}
      />

      <MissingDataWarningModal
        isOpen={wf.showMissingDataWarning}
        missingData={wf.missingData}
        onContinue={() => void wf.handleContinueWithNA()}
        onCancel={() => {
          wf.setShowMissingDataWarning(false);
          onClose?.();
        }}
      />

      <Modal
        isOpen={!!wf.previewUrl && !wf.showTemplateSelector && !wf.showMissingDataWarning}
        onClose={() => {
          wf.reset();
          onClose?.();
        }}
        title={`Certificate Preview${wf.selectedTemplate ? ` (${wf.selectedTemplate.name})` : ''}`}
        size="large"
      >
        <div className="space-y-4">
          <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height: '600px' }}>
            {wf.previewUrl ? (
              <iframe src={wf.previewUrl} className="w-full h-full border-0" title="Record Certificate Preview" />
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => wf.setShowTemplateSelector(true)}>Change Template</Button>
            <Button variant="secondary" onClick={wf.printPreview}>Print</Button>
            <Button
              variant="primary"
              onClick={() => wf.downloadPreview(`${record.recordNumber || record.id}-certificate.pdf`)}
            >
              Download
            </Button>
          </div>
        </div>
      </Modal>

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
          Generating certificate…
        </div>
      )}

      {/* Template Builder — opens when user clicks "Create New Template" in the selector.
          Mounted only while open: the builder is heavyweight and requires AuthProvider. */}
      {showBuilder && (
        <PdfTemplateBuilderModal
          isOpen={showBuilder}
          onClose={() => setShowBuilder(false)}
          initialScope="calibrationRecords"
          onSave={() => {
            setShowBuilder(false);
            wf.setShowTemplateSelector(true);
          }}
        />
      )}
    </>
  );
};

export default TemplateBasedRecordPdfGenerator;
