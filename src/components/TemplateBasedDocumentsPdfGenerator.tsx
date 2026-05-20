import React, { useState } from 'react';
import { TemplateSelectorModal } from './TemplateSelectorModal';
import { MissingDataWarningModal } from './MissingDataWarningModal';
import { Modal, Button } from './common';
import { useTemplatePdfWorkflow } from '../hooks/useTemplatePdfWorkflow';
import { PdfTemplateBuilderModal } from './PdfTemplateBuilderModal';
import type { DocumentIndexItem } from '../types';

export interface TemplateBasedDocumentsPdfGeneratorProps {
  trigger?: React.ReactNode;
  onPdfGenerated?: (blob: Blob) => void;
  onClose?: () => void;
  /** When set (e.g. filtered/sorted rows from Documents page), PDF uses this list instead of fetching the full index. */
  documentIndexItems?: DocumentIndexItem[];
}

export const TemplateBasedDocumentsPdfGenerator: React.FC<TemplateBasedDocumentsPdfGeneratorProps> = ({
  trigger,
  documentIndexItems,
  onClose,
}) => {
  const [showBuilder, setShowBuilder] = useState(false);

  const wf = useTemplatePdfWorkflow({ mode: 'documents', documentIndexItems, scope: 'documents' });

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
          {wf.isGenerating ? 'Generating…' : wf.selectedTemplate ? `Print (${wf.selectedTemplate.name})` : 'Print'}
        </button>
      )}

      <TemplateSelectorModal
        isOpen={wf.showTemplateSelector}
        onClose={() => {
          wf.setShowTemplateSelector(false);
          onClose?.();
        }}
        onSelect={wf.handleTemplateSelect}
        scope="documents"
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
        title={`PDF Preview${wf.selectedTemplate ? ` (${wf.selectedTemplate.name})` : ''}`}
        size="large"
      >
        <div className="space-y-4">
          <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height: '600px' }}>
            {wf.previewUrl ? (
              <iframe src={wf.previewUrl} className="w-full h-full border-0" title="Documents PDF Preview" />
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => wf.setShowTemplateSelector(true)}>Change Template</Button>
            <Button variant="secondary" onClick={wf.printPreview}>Print</Button>
            <Button variant="primary" onClick={() => wf.downloadPreview(`documents-index-${new Date().toISOString().slice(0, 10)}.pdf`)}>Download</Button>
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
          Generating PDF for print...
        </div>
      )}

      {/* Template Builder — opens when user clicks "Create New Template" in the selector */}
      <PdfTemplateBuilderModal
        isOpen={showBuilder}
        onClose={() => setShowBuilder(false)}
        initialScope="documents"
        onSave={() => {
          setShowBuilder(false);
          wf.setShowTemplateSelector(true);
        }}
      />
    </>
  );
};
