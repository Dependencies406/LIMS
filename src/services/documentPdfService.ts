/**
 * Document PDF Service
 * Extends the PDF service for ISO/IEC 17025 document control
 * Handles PDF generation with watermarks for obsolete and uncontrolled copies
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Document } from '../types';

/**
 * Generate PDF for a document with ISO 17025 compliant headers/footers
 * Includes watermarks for obsolete and uncontrolled copies
 */
export const generateDocumentPDF = async (
  docData: Document,
  options: {
    isObsolete?: boolean;
    isUncontrolledCopy?: boolean;
    includeWatermark?: boolean;
  } = {}
): Promise<Uint8Array> => {
  try {
    const { isObsolete = false, isUncontrolledCopy = false, includeWatermark = true } = options;

    // Create HTML content for the document
    const htmlContent = generateDocumentHTML(docData, {
      isObsolete,
      isUncontrolledCopy,
      includeWatermark,
    });

    // Create temporary container
    const doc = window.document;
    const container = doc.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '210mm'; // A4 width
    container.style.margin = '0';
    container.style.padding = '20mm';
    container.style.border = 'none';
    container.style.outline = 'none';
    container.style.backgroundColor = '#ffffff';
    container.style.fontFamily = "'Sarabun', 'Tahoma', 'Arial', sans-serif";
    container.innerHTML = htmlContent;
    doc.body.appendChild(container);

    // Wait for any images to load
    const images = container.querySelectorAll('img');
    if (images.length > 0) {
      await Promise.all(
        Array.from(images).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve(); // Continue even if image fails
            setTimeout(() => resolve(), 2000);
          });
        })
      );
    }

    // Small delay to ensure rendering
    await new Promise(resolve => setTimeout(resolve, 100));

    // Convert to canvas
    container.offsetHeight; // Force reflow
    const canvas = await html2canvas(container, {
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      imageTimeout: 2000,
      removeContainer: false,
    });

    // Remove temporary container
    doc.body.removeChild(container);

    // Create PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    // Add first page
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    // Add additional pages if content is longer
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    // Add watermarks to all pages
    if (includeWatermark) {
      const totalPages = pdf.getNumberOfPages();
      
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        
        // Add header with document info
        addDocumentHeader(pdf, docData, i, totalPages);
        
        // Add footer
        addDocumentFooter(pdf, docData, i, totalPages);
        
        // Add watermark overlay if obsolete or uncontrolled
        if (isObsolete) {
          addWatermark(pdf, 'OBSOLETE – FOR REFERENCE ONLY', '#ff0000', 45);
        } else if (isUncontrolledCopy) {
          const currentDate = new Date().toLocaleDateString('en-GB');
          addWatermark(pdf, `UNCONTROLLED COPY – Valid only on ${currentDate}`, '#ff8800', 45);
        }
      }
    }

    // Return as Uint8Array
    const pdfOutput = pdf.output('arraybuffer');
    return new Uint8Array(pdfOutput);
  } catch (error) {
    console.error('Error generating document PDF:', error);
    throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Generate HTML content for document
 */
const generateDocumentHTML = (
  docData: Document,
  options: {
    isObsolete?: boolean;
    isUncontrolledCopy?: boolean;
    includeWatermark?: boolean;
  }
): string => {
  const { isObsolete, isUncontrolledCopy } = options;

  // Format date
  const formatDate = (date?: Date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return `
    <div style="max-width: 100%; margin: 0 auto; padding: 0;">
      <!-- Document Header Info -->
      <div style="border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;">
        <h1 style="margin: 0 0 10px 0; font-size: 24px; font-weight: bold; color: #1a1a1a;">
          ${escapeHtml(docData.title)}
        </h1>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <tr>
            <td style="padding: 4px 10px 4px 0; font-weight: bold; width: 150px;">Document ID:</td>
            <td style="padding: 4px 0;">${escapeHtml(docData.documentId)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 10px 4px 0; font-weight: bold;">Revision:</td>
            <td style="padding: 4px 0;">${escapeHtml(docData.revision)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 10px 4px 0; font-weight: bold;">Effective Date:</td>
            <td style="padding: 4px 0;">${formatDate(docData.effectiveDate)}</td>
          </tr>
          ${docData.category ? `
          <tr>
            <td style="padding: 4px 10px 4px 0; font-weight: bold;">Category:</td>
            <td style="padding: 4px 0;">${escapeHtml(docData.category)}</td>
          </tr>
          ` : ''}
        </table>
      </div>

      <!-- Watermark Notice (if applicable) -->
      ${isObsolete ? `
      <div style="background-color: #ffeeee; border: 2px solid #ff0000; padding: 15px; margin-bottom: 20px; text-align: center;">
        <p style="margin: 0; font-size: 16px; font-weight: bold; color: #cc0000;">
          ⚠️ OBSOLETE – FOR REFERENCE ONLY
        </p>
      </div>
      ` : ''}
      
      ${isUncontrolledCopy ? `
      <div style="background-color: #fff4e6; border: 2px solid #ff8800; padding: 15px; margin-bottom: 20px; text-align: center;">
        <p style="margin: 0; font-size: 16px; font-weight: bold; color: #cc6600;">
          ⚠️ UNCONTROLLED COPY – Valid only on ${new Date().toLocaleDateString('en-GB')}
        </p>
      </div>
      ` : ''}

      <!-- Document Description -->
      ${docData.description ? `
      <div style="margin-bottom: 20px; padding: 10px; background-color: #f5f5f5; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; font-size: 14px; color: #555;">
          ${escapeHtml(docData.description)}
        </p>
      </div>
      ` : ''}

      <!-- Document Content -->
      <div style="margin-top: 20px; line-height: 1.6; font-size: 14px; color: #333;">
        ${docData.content}
      </div>

      <!-- Document Footer Info -->
      <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 40px; font-size: 11px; color: #666;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 0;">Created by: ${escapeHtml(docData.createdByName)}</td>
            <td style="padding: 4px 0; text-align: right;">Created: ${formatDate(docData.createdAt)}</td>
          </tr>
          ${docData.reviewSignature ? `
          <tr>
            <td style="padding: 4px 0;">Reviewed by: ${escapeHtml(docData.reviewSignature.userName)}</td>
            <td style="padding: 4px 0; text-align: right;">Reviewed: ${formatDate(docData.reviewSignature.signedAt)}</td>
          </tr>
          ` : ''}
          ${docData.approvalSignature ? `
          <tr>
            <td style="padding: 4px 0;">Approved by: ${escapeHtml(docData.approvalSignature.userName)}</td>
            <td style="padding: 4px 0; text-align: right;">Approved: ${formatDate(docData.approvalSignature.signedAt)}</td>
          </tr>
          ` : ''}
        </table>
      </div>
    </div>
  `;
};

/**
 * Add document header to PDF page
 */
const addDocumentHeader = (pdf: jsPDF, docData: Document, pageNum: number, totalPages: number) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  
  // Document ID and Title
  pdf.setFontSize(10);
  pdf.setTextColor(100, 100, 100);
  pdf.text(docData.documentId, 10, 10);
  pdf.text(docData.title, pageWidth / 2, 10, { align: 'center' });
  
  // Revision and Page number
  pdf.text(docData.revision, pageWidth - 10, 10, { align: 'right' });
  pdf.text(`Page ${pageNum} of ${totalPages}`, pageWidth - 10, 15, { align: 'right' });
  
  // Effective date if available
  if (docData.effectiveDate) {
    const effDate = new Date(docData.effectiveDate).toLocaleDateString('en-GB');
    pdf.text(`Effective: ${effDate}`, 10, 15);
  }
};

/**
 * Add document footer to PDF page
 */
const addDocumentFooter = (pdf: jsPDF, docData: Document, pageNum: number, totalPages: number) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  
  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  
  // Footer line
  pdf.setDrawColor(200, 200, 200);
  pdf.line(10, pageHeight - 15, pageWidth - 10, pageHeight - 15);
  
  // Footer text
  pdf.text(docData.documentId, 10, pageHeight - 10);
  pdf.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  pdf.text(docData.revision, pageWidth - 10, pageHeight - 10, { align: 'right' });
};

/**
 * Add watermark overlay to PDF page
 */
const addWatermark = (pdf: jsPDF, text: string, color: string, angle: number) => {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  
  // Set watermark properties - use lighter color for opacity effect
  // Convert hex color to RGB and make it lighter
  const rgb = hexToRgb(color);
  if (rgb) {
    // Make color lighter (simulate opacity by mixing with white)
    const lightRgb = {
      r: Math.round(rgb.r + (255 - rgb.r) * 0.8),
      g: Math.round(rgb.g + (255 - rgb.g) * 0.8),
      b: Math.round(rgb.b + (255 - rgb.b) * 0.8),
    };
    pdf.setTextColor(lightRgb.r, lightRgb.g, lightRgb.b);
  } else {
    pdf.setTextColor(200, 200, 200); // Fallback to gray
  }
  
  pdf.setFontSize(48);
  
  // Calculate center position
  const x = pageWidth / 2;
  const y = pageHeight / 2;
  
  // Rotate and draw watermark
  pdf.text(text, x, y, {
    angle: angle,
    align: 'center',
  });
  
  // Reset to default text color (black)
  pdf.setTextColor(0, 0, 0);
};

/**
 * Convert hex color to RGB
 */
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

/**
 * Escape HTML to prevent XSS
 */
const escapeHtml = (text: string): string => {
  const doc = window.document;
  const div = doc.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

/**
 * Generate and download document PDF
 */
export const generateAndDownloadDocumentPDF = async (
  docData: Document,
  options: {
    isObsolete?: boolean;
    isUncontrolledCopy?: boolean;
    includeWatermark?: boolean;
  } = {}
): Promise<void> => {
  try {
    const pdfBytes = await generateDocumentPDF(docData, options);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    const doc = window.document;
    const a = doc.createElement('a');
    a.href = url;
    a.download = `${docData.documentId}_${docData.revision.replace(' ', '_')}.pdf`;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    
    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Error downloading document PDF:', error);
    throw error;
  }
};

/**
 * Generate PDF preview URL
 */
export const generateDocumentPDFPreview = async (
  docData: Document,
  options: {
    isObsolete?: boolean;
    isUncontrolledCopy?: boolean;
    includeWatermark?: boolean;
  } = {}
): Promise<string> => {
  try {
    const pdfBytes = await generateDocumentPDF(docData, options);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error generating PDF preview:', error);
    throw error;
  }
};

