/**
 * PDF Preview Modal
 * Shows a preview of the generated PDF before downloading.
 *
 * Two usage modes:
 *  1. job-mode  — pass `job` + optional `settings`; PDF is generated on open
 *  2. pdf-mode  — pass a pre-built `pdf` (jsPDF instance) + `fileName`
 */

import React, { useState, useEffect, useCallback } from 'react';
import type jsPDF from 'jspdf';
import type { Job, PdfSettings } from '../types';
import { Modal, Button, LoadingSpinner } from './common';
import { generatePDFPreview } from '../services/pdfService';

// ── Job-mode props ─────────────────────────────────────────────────────────────
interface JobModeProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job;
  pdf?: never;
  fileName?: never;
  settings?: Partial<PdfSettings>;
  onDownload?: () => void;
}

// ── PDF-mode props (pre-built jsPDF) ──────────────────────────────────────────
interface PdfModeProps {
  isOpen: boolean;
  onClose: () => void;
  job?: never;
  pdf: jsPDF | null;
  fileName: string;
  settings?: never;
  onDownload?: () => void;
}

export type PdfPreviewModalProps = JobModeProps | PdfModeProps;

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = (props) => {
  const { isOpen, onClose, onDownload } = props;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build preview URL depending on mode
  const buildPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url: string;
      if ('pdf' in props && props.pdf) {
        // PDF-mode: convert jsPDF to blob URL
        const blob = props.pdf.output('blob');
        url = URL.createObjectURL(blob);
      } else if ('job' in props && props.job) {
        // Job-mode: generate via pdfService
        url = await generatePDFPreview(props.job, props.settings);
      } else {
        throw new Error('No PDF source provided');
      }
      setPreviewUrl(url);
    } catch (err) {
      console.error('Error generating PDF preview:', err);
      setError('Failed to generate PDF preview. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen) {
      buildPreview();
    } else {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    }
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [isOpen]);

  const title =
    'fileName' in props && props.fileName
      ? `PDF Preview — ${props.fileName}`
      : 'job' in props && props.job
      ? `PDF Preview — ${props.job.jobId}`
      : 'PDF Preview';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="large">
      <div className="space-y-4">
        <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height: '600px' }}>
          {loading && (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner size="lg" message="Generating preview…" />
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-600">{error}</p>
                <Button variant="primary" onClick={buildPreview} className="mt-4">
                  Retry
                </Button>
              </div>
            </div>
          )}
          {!loading && !error && previewUrl && (
            <iframe src={previewUrl} className="w-full h-full border-0" title="PDF Preview" />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={onDownload} disabled={loading || !!error || !previewUrl}>
            Download PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
};
