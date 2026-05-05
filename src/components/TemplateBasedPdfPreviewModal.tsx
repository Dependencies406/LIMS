/**
 * Template-Based PDF Preview Modal
 * Shows PDF preview using the template-based system with full workflow
 * Implements: Select Template → Check Missing Data → Preview PDF
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { Job } from '../types';
import { Modal, Button, PrinterIcon, DownloadIcon } from './common';
import { TemplateSelectorModal } from './TemplateSelectorModal';
import { MissingDataWarningModal } from './MissingDataWarningModal';
import { PdfTemplateBuilderModal } from './PdfTemplateBuilderModal';
import { useTemplatePdfGeneration } from '../hooks/useTemplatePdfGeneration';
import { pdfDataResolver } from '../services/pdfDataResolver';
import { pdfTemplateRenderer } from '../services/pdfTemplateRenderer';
import { pdfTemplateService } from '../services/pdfTemplateService';
import type { PdfTemplate } from '../modules/pdf-template-builder/types';
import type { MissingDataReport } from '../services/pdfDataResolver';
import {
  buildPdfPreviewFlightKey,
  singleFlightPreviewGeneration,
} from '../utils/pdfPreviewGenerationSingleFlight';

function jobRevisionMs(j: Job): number {
  const u = j.updatedAt;
  if (u instanceof Date) return u.getTime();
  return new Date(u as string | number).getTime();
}

interface TemplateBasedPdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job;
  selectedEquipmentIndex?: number; // Equipment index that user has selected/currently viewing
  /** Pre-linked template ID — if set, the selector is skipped and this template is loaded automatically */
  defaultTemplateId?: string;
  /** Called after the user picks a template so the parent can persist the choice on the job */
  onTemplateSelected?: (templateId: string) => void;
}

export const TemplateBasedPdfPreviewModal: React.FC<TemplateBasedPdfPreviewModalProps> = ({
  isOpen,
  onClose,
  job,
  selectedEquipmentIndex,
  defaultTemplateId,
  onTemplateSelected,
}) => {
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showMissingDataWarning, setShowMissingDataWarning] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localMissingData, setLocalMissingData] = useState<MissingDataReport[]>([]);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  /** Stable ref to handleTemplateSelect so the "open" effect doesn't need it as a dep */
  const handleTemplateSelectRef = React.useRef<((tpl: PdfTemplate) => Promise<void>) | null>(null);
  /** Bumps on modal close and before each auto-generation so late async work does not commit after unmount / remount. */
  const previewGenerationEpochRef = React.useRef(0);
  /** Last prepare+validate from template selection (or full preview path); avoids duplicate work before renderTemplate. */
  const validationCacheRef = React.useRef<{
    jobId: string;
    templateId: string;
    equipmentIndex: number | undefined;
    jobUpdatedAtMs: number;
    missing: MissingDataReport[];
  } | null>(null);

  const {
    selectedTemplate,
    missingData,
    isGenerating,
    error,
    selectTemplate,
    reset,
  } = useTemplatePdfGeneration();

  // When modal opens: if there's a linked template ID, auto-load it; otherwise show the selector
  useEffect(() => {
    if (!isOpen || selectedTemplate) return;

    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    if (defaultTemplateId) {
      // Silently fetch the linked template and select it — no selector shown
      pdfTemplateService.getTemplate(defaultTemplateId).then((tpl) => {
        if (tpl && handleTemplateSelectRef.current) {
          void handleTemplateSelectRef.current(tpl);
        } else {
          // Template no longer exists — fall back to showing the selector
          setShowTemplateSelector(true);
        }
      }).catch(() => {
        setShowTemplateSelector(true);
      });
    } else {
      setShowTemplateSelector(true);
    }
  }, [isOpen, defaultTemplateId, selectedTemplate]);

  // Clean up when modal closes
  useEffect(() => {
    if (!isOpen) {
      previewGenerationEpochRef.current += 1;
      validationCacheRef.current = null;
      reset();
      setShowTemplateSelector(false);
      setShowMissingDataWarning(false);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [isOpen, reset]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleTemplateSelect = async (template: PdfTemplate) => {
    selectTemplate(template);

    // Notify parent so it can persist the template choice on the job
    if (template.id && onTemplateSelected) {
      onTemplateSelected(template.id);
    }

    // Check for missing data with the selected template
    // Prepare job data with company info from settings for accurate validation
    const jobData = await pdfTemplateRenderer.prepareJobDataForPdf(job);
    // Pass selectedEquipmentIndex for context-aware validation
    const missing = pdfDataResolver.validateTemplate(template, jobData, selectedEquipmentIndex);
    const tid = template.id ?? template.name;
    validationCacheRef.current = {
      jobId: job.id,
      templateId: tid,
      equipmentIndex: selectedEquipmentIndex,
      jobUpdatedAtMs: jobRevisionMs(job),
      missing,
    };
    setLocalMissingData(missing);

    // Close template selector
    setShowTemplateSelector(false);

    if (missing.length > 0) {
      // Show warning modal - rendering will happen after user confirms
      setShowMissingDataWarning(true);
      return;
    }

    // No missing data - let the useEffect handle rendering to avoid duplicate calls
  };
  // Always keep ref pointing to the latest version (read by the "open" effect)
  handleTemplateSelectRef.current = handleTemplateSelect;

  const generateAndShowPreview = useCallback(
    async (continueWithNA: boolean): Promise<Blob | null> => {
      if (!selectedTemplate) {
        return null;
      }

      const key = buildPdfPreviewFlightKey(
        job.id,
        selectedTemplate.id ?? selectedTemplate.name,
        selectedEquipmentIndex,
        continueWithNA
      );

      return singleFlightPreviewGeneration(key, async () => {
        try {
          const result = await pdfTemplateRenderer.renderTemplate(selectedTemplate, job, {
            showMissingDataAsNA: continueWithNA,
            missingDataLabel: '-',
            selectedEquipmentIndex,
          });

          const pdfBlob = result.pdf.output('blob') as Blob;
          setLocalMissingData(result.missingData);
          return pdfBlob;
        } catch (err) {
          console.error('[PDF Preview] Error generating PDF:', err);
          return null;
        }
      });
    },
    [selectedTemplate, job, selectedEquipmentIndex]
  );

  const handleGeneratePreview = useCallback(
    async (options?: { forceRevalidate?: boolean; generationEpoch?: number }) => {
      if (!selectedTemplate) {
        setShowTemplateSelector(true);
        return;
      }

      const tid = selectedTemplate.id ?? selectedTemplate.name;
      const rev = jobRevisionMs(job);

      let missing: MissingDataReport[];
      const cache = validationCacheRef.current;
      if (
        !options?.forceRevalidate &&
        cache &&
        cache.jobId === job.id &&
        cache.templateId === tid &&
        cache.equipmentIndex === selectedEquipmentIndex &&
        cache.jobUpdatedAtMs === rev
      ) {
        missing = cache.missing;
      } else {
        const jobData = await pdfTemplateRenderer.prepareJobDataForPdf(job);
        missing = pdfDataResolver.validateTemplate(selectedTemplate, jobData, selectedEquipmentIndex);
        validationCacheRef.current = {
          jobId: job.id,
          templateId: tid,
          equipmentIndex: selectedEquipmentIndex,
          jobUpdatedAtMs: rev,
          missing,
        };
      }

      setLocalMissingData(missing);

      if (missing.length > 0) {
        setShowMissingDataWarning(true);
        return;
      }

      const pdfBlob = await generateAndShowPreview(false);

      if (
        options?.generationEpoch !== undefined &&
        options.generationEpoch !== previewGenerationEpochRef.current
      ) {
        return;
      }

      if (pdfBlob) {
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(pdfBlob);
        });
      }
    },
    [selectedTemplate, job, selectedEquipmentIndex, generateAndShowPreview]
  );

  /**
   * Auto-generate after template pick with no missing data.
   * React 18 StrictMode (see main.tsx) double-mounts in dev; component refs reset on remount,
   * so dedupe must not rely only on useRef — use module single-flight + generation epoch.
   */
  useEffect(() => {
    const shouldSkip =
      !isOpen ||
      !selectedTemplate ||
      previewUrl ||
      isGenerating ||
      showTemplateSelector ||
      showMissingDataWarning;

    if (shouldSkip) return;

    const epoch = ++previewGenerationEpochRef.current;
    void handleGeneratePreview({ generationEpoch: epoch });
  }, [
    isOpen,
    selectedTemplate,
    previewUrl,
    isGenerating,
    showTemplateSelector,
    showMissingDataWarning,
    handleGeneratePreview,
  ]);

  const handleContinueWithNA = async () => {
    const epoch = ++previewGenerationEpochRef.current;
    const pdfBlob = await generateAndShowPreview(true);

    if (epoch !== previewGenerationEpochRef.current) {
      return;
    }

    // Close the warning modal only after generation finishes.
    // This prevents backdrop click races where the main preview modal unmounts
    // before the iframe/previewUrl is set.
    setShowMissingDataWarning(false);

    if (pdfBlob) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(pdfBlob);
      });
    }
  };

  const handleDownload = () => {
    if (previewUrl) {
      const a = document.createElement('a');
      a.href = previewUrl;
      a.download = `job-${job.jobId}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handlePrint = () => {
    if (!previewUrl) return;

    const iframe = iframeRef.current;
    const w = iframe?.contentWindow;
    if (w) {
      w.focus();
      w.print();
      return;
    }

    // Fallback: open in a new tab and let the user print from there.
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCancel = () => {
    reset();
    setShowTemplateSelector(false);
    setShowMissingDataWarning(false);
    onClose();
  };

  const handleClose = () => {
    if (showTemplateSelector || showMissingDataWarning) {
      // Don't close main modal if sub-modals are open
      return;
    }
    onClose();
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !showTemplateSelector && !showMissingDataWarning}
        onClose={handleClose}
        title={`PDF Preview - ${job.jobId}${selectedTemplate ? ` (${selectedTemplate.name})` : ''}`}
        size="large"
      >
        <div className="space-y-4">
          {/* Preview Area */}
          <div className="bg-gray-100 rounded-lg overflow-auto p-2" style={{ height: '600px' }}>
            {isGenerating && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                  <p className="text-sm text-gray-600">Generating preview...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-red-600 mb-2">⚠️</div>
                  <p className="text-red-600">{error}</p>
                  <Button
                    variant="primary"
                    onClick={() => void handleGeneratePreview({ forceRevalidate: true })}
                    className="mt-4"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}

            {!isGenerating && !error && previewUrl && (
              <iframe
                ref={iframeRef}
                src={previewUrl}
                className="w-full h-full border-0 bg-white rounded"
                title="PDF Preview"
              />
            )}

            {!isGenerating && !error && !previewUrl && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-gray-600 mb-4">No preview available</p>
                  <Button
                    variant="primary"
                    onClick={() => void handleGeneratePreview({ forceRevalidate: true })}
                  >
                    Generate Preview
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-gray-600">
              Preview for: <span className="font-semibold">{job.title}</span>
              {selectedTemplate && (
                <> using template: <span className="font-semibold">{selectedTemplate.name}</span></>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleClose}>
                Close
              </Button>
              {selectedTemplate && (
                <Button
                  variant="secondary"
                  onClick={() => setShowTemplateSelector(true)}
                  disabled={isGenerating}
                >
                  Change Template
                </Button>
              )}
              <Button
                variant="secondary"
                icon={<PrinterIcon />}
                onClick={handlePrint}
                disabled={!previewUrl || isGenerating}
              >
                Print
              </Button>
              <Button
                variant="primary"
                icon={<DownloadIcon />}
                onClick={handleDownload}
                disabled={!previewUrl || isGenerating}
              >
                Download PDF
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Template Selector Modal (scoped to jobs + global) */}
      <TemplateSelectorModal
        isOpen={showTemplateSelector}
        onClose={() => {
          setShowTemplateSelector(false);
          if (!selectedTemplate) {
            // If no template was ever selected, close the main modal
            onClose();
          }
        }}
        onSelect={handleTemplateSelect}
        scope="jobs"
        onCreateNew={() => {
          setShowTemplateSelector(false);
          setShowBuilder(true);
        }}
      />

      {/* Template Builder — lets users create a new jobs-scoped template inline */}
      <PdfTemplateBuilderModal
        isOpen={showBuilder}
        onClose={() => setShowBuilder(false)}
        initialScope="jobs"
        onSave={() => {
          setShowBuilder(false);
          setShowTemplateSelector(true);
        }}
      />

      {/* Missing Data Warning Modal */}
      <MissingDataWarningModal
        isOpen={showMissingDataWarning}
        missingData={localMissingData.length > 0 ? localMissingData : missingData}
        onContinue={handleContinueWithNA}
        onCancel={handleCancel}
      />
    </>
  );
};
