/**
 * PDF Generation Service - Client-Side
 * Generates PDF documents for jobs directly in the browser using jsPDF and html2canvas
 * No server required! Works offline and completely free.
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Job, PdfSettings } from '../types';
import { DEFAULT_PDF_SETTINGS } from '../utils/constants';
import { getCompanyInfo } from './companyInfoService';

/**
 * Helper function to replace placeholders in header/footer content
 */
const replacePlaceholders = (text: string, job: Job, companyInfo: any): string => {
  return text
    .replace(/\{company\.name\}/g, companyInfo?.name || '')
    .replace(/\{company\.address\}/g, companyInfo?.address?.street || '')
    .replace(/\{company\.phone\}/g, companyInfo?.phone || '')
    .replace(/\{company\.email\}/g, companyInfo?.email || '')
    .replace(/\{job\.id\}/g, job.jobId || '')
    .replace(/\{job\.title\}/g, job.title || '')
    .replace(/\{job\.customer\}/g, job.customerCode || '')
    .replace(/\{date\}/g, new Date().toLocaleDateString())
    .replace(/\{page\}/g, '1'); // Simple page numbering for now
};

/**
 * Generate HTML content for the PDF
 */
const generatePDFHTML = (job: Job, settings: PdfSettings, companyInfo: any): string => {
  const { fontSize, margin, headerContent, footerContent, showHeader, showFooter } = settings;
  
  // Format date helper
  const formatDate = (date?: string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  };

  // Status color helper
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return '#6c757d';
      case 'In Progress': return '#ffc107';
      case 'Completed': return '#28a745';
      case 'Halt': return '#dc3545';
      default: return '#6c757d';
    }
  };

  return `
    <div style="
      font-family: 'Sarabun', 'Tahoma', 'Arial', sans-serif;
      padding: ${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm;
      max-width: 210mm;
      background: white;
    ">
      ${showHeader ? `
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 10px;
          border-bottom: 2px solid #c73636;
          margin-bottom: 20px;
        ">
          <div style="flex: 1; font-size: ${fontSize.small}px;">
            ${replacePlaceholders(headerContent.left, job, companyInfo)}
          </div>
          <div style="flex: 1; text-align: center; font-size: ${fontSize.small}px;">
            ${replacePlaceholders(headerContent.center, job, companyInfo)}
          </div>
          <div style="flex: 1; text-align: right; font-size: ${fontSize.small}px;">
            ${replacePlaceholders(headerContent.right, job, companyInfo)}
          </div>
        </div>
      ` : ''}

      <h1 style="
        color: #c73636;
        font-size: ${fontSize.title}px;
        margin: 0 0 20px 0;
        text-align: center;
      ">Job Report</h1>

      <div style="margin-bottom: 20px;">
        <h2 style="
          font-size: ${fontSize.heading}px;
          color: #333;
          margin: 0 0 10px 0;
          border-bottom: 1px solid #ddd;
          padding-bottom: 5px;
        ">Job Information</h2>
        
        <table style="width: 100%; font-size: ${fontSize.body}px; border-collapse: collapse;">
          <tr>
            <td style="padding: 5px; width: 30%; font-weight: bold;">Job ID:</td>
            <td style="padding: 5px;">${job.jobId}</td>
          </tr>
          <tr>
            <td style="padding: 5px; font-weight: bold;">Title:</td>
            <td style="padding: 5px;">${job.title}</td>
          </tr>
          <tr>
            <td style="padding: 5px; font-weight: bold;">Status:</td>
            <td style="padding: 5px;">
              <span style="
                background: ${getStatusColor(job.status)};
                color: white;
                padding: 3px 10px;
                border-radius: 3px;
                font-size: ${fontSize.small}px;
              ">${job.status}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 5px; font-weight: bold;">Customer:</td>
            <td style="padding: 5px;">${job.customerCode}</td>
          </tr>
          ${job.assignedStaff ? `
          <tr>
            <td style="padding: 5px; font-weight: bold;">Assigned Staff:</td>
            <td style="padding: 5px;">${job.assignedStaff}</td>
          </tr>
          ` : ''}
          ${job.startDate ? `
          <tr>
            <td style="padding: 5px; font-weight: bold;">Start Date:</td>
            <td style="padding: 5px;">${formatDate(job.startDate)}</td>
          </tr>
          ` : ''}
          ${job.scheduleDate ? `
          <tr>
            <td style="padding: 5px; font-weight: bold;">Schedule Date:</td>
            <td style="padding: 5px;">${formatDate(job.scheduleDate)}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 5px; font-weight: bold;">Created:</td>
            <td style="padding: 5px;">${formatDate(job.createdAt?.toString())}</td>
          </tr>
        </table>
      </div>

      ${job.equipment && job.equipment.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <h2 style="
            font-size: ${fontSize.heading}px;
            color: #333;
            margin: 0 0 10px 0;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
          ">Equipment</h2>
          
          <table style="
            width: 100%;
            font-size: ${fontSize.small}px;
            border-collapse: collapse;
            border: 1px solid #ddd;
          ">
            <thead>
              <tr style="background: #f8f9fa;">
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">No.</th>
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Name</th>
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Manufacturer</th>
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Model</th>
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Serial No.</th>
              </tr>
            </thead>
            <tbody>
              ${job.equipment.map((eq, idx) => `
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;">${idx + 1}</td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${eq.name || 'N/A'}</td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${eq.manufacturer || 'N/A'}</td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${eq.model || 'N/A'}</td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${eq.serialNumber || 'N/A'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      ${job.comments ? `
        <div style="margin-bottom: 20px;">
          <h2 style="
            font-size: ${fontSize.heading}px;
            color: #333;
            margin: 0 0 10px 0;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
          ">Comments</h2>
          <p style="font-size: ${fontSize.body}px; margin: 0; white-space: pre-wrap;">${job.comments}</p>
        </div>
      ` : ''}

      ${showFooter ? `
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 10px;
          border-top: 1px solid #ddd;
          margin-top: 30px;
          font-size: ${fontSize.small}px;
          color: #666;
        ">
          <div style="flex: 1;">
            ${replacePlaceholders(footerContent.left, job, companyInfo)}
          </div>
          <div style="flex: 1; text-align: center;">
            ${replacePlaceholders(footerContent.center, job, companyInfo)}
          </div>
          <div style="flex: 1; text-align: right;">
            ${replacePlaceholders(footerContent.right, job, companyInfo)}
          </div>
        </div>
      ` : ''}
    </div>
  `;
};

/**
 * Generate a PDF document for a job using client-side rendering
 * This works completely in the browser - no server needed!
 */
export const generateJobPDF = async (
  job: Job,
  settings: Partial<PdfSettings> = {}
): Promise<Uint8Array> => {
  try {
    // Fetch company info for header/footer placeholders
    const companyInfo = await getCompanyInfo();
    
    // Merge with default settings
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

    // Create a temporary container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '210mm'; // A4 width
    container.innerHTML = generatePDFHTML(job, pdfSettings, companyInfo);
    document.body.appendChild(container);

    // Convert to canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    // Remove temporary container
    document.body.removeChild(container);

    // Create PDF
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: pdfSettings.orientation,
      unit: 'mm',
      format: pdfSettings.pageSize.toLowerCase() as 'a4' | 'letter'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    // Add first page
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    // Add additional pages if content is longer than one page
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    // Return as Uint8Array for compatibility
    const pdfOutput = pdf.output('arraybuffer');
    return new Uint8Array(pdfOutput);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Generate a PDF preview for the settings modal
 */
export const generatePDFPreview = async (
  job: Job,
  settings: Partial<PdfSettings> = {}
): Promise<string> => {
  try {
    const pdfBytes = await generateJobPDF(job, settings);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error generating PDF preview:', error);
    throw error;
  }
};

/**
 * Generate and download a PDF for a job
 */
export const generateAndDownloadJobPDF = async (
  job: Job,
  settings: Partial<PdfSettings> = {}
): Promise<void> => {
  try {
    const pdfBytes = await generateJobPDF(job, settings);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
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
 * Check if PDF generation is available (always true for client-side)
 */
export const checkPDFServerHealth = async (): Promise<boolean> => {
  // Client-side PDF generation is always available!
  return true;
};