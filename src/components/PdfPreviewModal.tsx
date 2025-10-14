/**
 * PDF Preview Modal
 * Shows a preview of the generated PDF before downloading
 */

import React, { useState, useEffect } from 'react';
import type { Job, PdfSettings } from '../types';
import { Modal, Button, LoadingSpinner } from './common';
import { generatePDFPreview } from '../services/pdfService';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job;
  settings?: Partial<PdfSettings>;
  onDownload?: () => void;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  isOpen,
  onClose,
  job,
  settings,
  onDownload,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      generatePreview();
    } else {
      // Clean up preview URL when modal closes
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    }

    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isOpen, job, settings]);

  const generatePreview = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const url = await generatePDFPreview(job, settings);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Error generating PDF preview:', err);
      setError('Failed to generate PDF preview. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={`PDF Preview - ${job.jobId}`}
      size="large"
    >
      <div className="space-y-4">
        {/* Preview Area */}
        <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height: '600px' }}>
          {loading && (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner size="lg" />
              <span className="ml-3 text-gray-600">Generating preview...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-red-600 mb-2">⚠️</div>
                <p className="text-red-600">{error}</p>
                <Button 
                  variant="primary" 
                  onClick={generatePreview}
                  className="mt-4"
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {!loading && !error && previewUrl && (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-gray-600">
            Preview generated for: <span className="font-semibold">{job.title}</span>
          </div>
          
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button 
              variant="primary" 
              onClick={handleDownload}
              disabled={loading || !!error}
            >
              Download PDF
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

