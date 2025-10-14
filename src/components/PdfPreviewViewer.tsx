import React, { useState, useEffect, useRef } from 'react';
import type { Job, PdfSettings } from '../types';
import { generateJobPDF } from '../services/pdfService';

interface PdfPreviewViewerProps {
  job: Job | null;
  settings: PdfSettings;
  height?: string;
}

export const PdfPreviewViewer: React.FC<PdfPreviewViewerProps> = ({
  job,
  settings,
  height = '500px'
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Generate PDF preview when job or settings change
  useEffect(() => {
    if (!job) {
      setPdfUrl(null);
      return;
    }

    const generatePreview = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Generate PDF with current settings
        const pdfBytes = await generateJobPDF(job, settings);
        
        // Create blob URL
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        // Clean up previous URL
        if (pdfUrl) {
          URL.revokeObjectURL(pdfUrl);
        }
        
        setPdfUrl(url);
      } catch (err) {
        console.error('Error generating PDF preview:', err);
        setError('Failed to generate PDF preview');
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce the preview generation to avoid too many updates
    const timeoutId = setTimeout(generatePreview, 300);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [job, settings]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  if (!job) {
    return (
      <div 
        className="flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg"
        style={{ height }}
      >
        <div className="text-center text-gray-500">
          <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">Select a job to preview PDF</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div 
        className="flex items-center justify-center bg-gray-50 border border-gray-300 rounded-lg"
        style={{ height }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">Generating preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className="flex items-center justify-center bg-red-50 border border-red-300 rounded-lg"
        style={{ height }}
      >
        <div className="text-center text-red-600">
          <svg className="mx-auto h-8 w-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div 
        className="flex items-center justify-center bg-gray-50 border border-gray-300 rounded-lg"
        style={{ height }}
      >
        <div className="text-center text-gray-500">
          <p className="text-sm">No preview available</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="border border-gray-300 rounded-lg overflow-hidden bg-white"
      style={{ height }}
    >
      <iframe
        ref={iframeRef}
        src={pdfUrl}
        className="w-full h-full border-0"
        title="PDF Preview"
        style={{ minHeight: '100%' }}
      />
    </div>
  );
};
