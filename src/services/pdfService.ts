/**
 * PDF Generation Service
 * Generates PDF documents for jobs using server-side rendering with Thai font support
 */

import type { Job, PdfSettings } from '../types';
import { DEFAULT_PDF_SETTINGS } from '../utils/constants';
import { getCompanyInfo } from './companyInfoService';

// Server URL for PDF generation
const PDF_SERVER_URL = 'https://lims-pdf-server.onrender.com';

/**
 * Generate a PDF document for a job using server-side rendering
 * This supports Thai characters properly
 */
export const generateJobPDF = async (
  job: Job,
  settings: Partial<PdfSettings> = {}
): Promise<Uint8Array> => {
  try {
    // Fetch company info for header/footer placeholders
    const companyInfo = await getCompanyInfo();
    
    // Merge with default settings (deep merge for nested objects)
    const pdfSettings: PdfSettings = {
      ...DEFAULT_PDF_SETTINGS,
      ...settings,
      fontSize: { ...DEFAULT_PDF_SETTINGS.fontSize, ...(settings.fontSize || {}) },
      margin: { ...DEFAULT_PDF_SETTINGS.margin, ...(settings.margin || {}) },
      fieldVisibility: { ...DEFAULT_PDF_SETTINGS.fieldVisibility, ...(settings.fieldVisibility || {}) },
      jobTableColumns: { ...DEFAULT_PDF_SETTINGS.jobTableColumns, ...(settings.jobTableColumns || {}) },
      equipmentTableColumns: { ...DEFAULT_PDF_SETTINGS.equipmentTableColumns, ...(settings.equipmentTableColumns || {}) },
      headerContent: { ...DEFAULT_PDF_SETTINGS.headerContent, ...(settings.headerContent || {}) },
      footerContent: { ...DEFAULT_PDF_SETTINGS.footerContent, ...(settings.footerContent || {}) }
    };

    const response = await fetch(`${PDF_SERVER_URL}/api/generate-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobData: job,
        settings: {
          ...pdfSettings,
          companyInfo // Include company info for placeholder replacement
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    const pdfBuffer = await response.arrayBuffer();
    return new Uint8Array(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Generate a PDF preview for the settings modal
 * This also uses server-side rendering for consistency
 */
export const generatePDFPreview = async (
  job: Job,
  settings: Partial<PdfSettings> = {}
): Promise<string> => {
  try {
    const pdfBytes = await generateJobPDF(job, settings);
    const blob = new Blob([pdfBytes as unknown as ArrayBuffer], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error generating PDF preview:', error);
    throw error;
  }
};

/**
 * Generate and download a PDF for a job
 * This is a convenience function that generates the PDF and triggers a download
 */
export const generateAndDownloadJobPDF = async (
  job: Job,
  settings: Partial<PdfSettings> = {}
): Promise<void> => {
  try {
    const pdfBytes = await generateJobPDF(job, settings);
    const blob = new Blob([pdfBytes as unknown as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.jobId || 'job'}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up the URL object
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Error downloading PDF:', error);
    throw error;
  }
};

/**
 * Check if the PDF server is available
 */
export const checkPDFServerHealth = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${PDF_SERVER_URL}/health`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.warn('PDF server is not available:', error);
    return false;
  }
};