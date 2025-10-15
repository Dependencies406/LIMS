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
import { customerService } from './customerService';

/**
 * Helper function to convert Firestore Timestamp to Date
 */
const getDateFromValue = (dateValue: any): Date => {
  if (dateValue instanceof Date) {
    return dateValue;
  }
  if (dateValue && typeof dateValue.toDate === 'function') {
    return dateValue.toDate();
  }
  return new Date(dateValue);
};

/**
 * Convert image URL to base64 data URL using canvas
 * This solves CORS issues with Firebase Storage URLs
 */
const imageUrlToBase64 = async (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    // Set crossOrigin BEFORE setting src
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        // Create a canvas to draw the image
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        // Draw the image onto the canvas
        ctx.drawImage(img, 0, 0);
        
        // Convert canvas to base64
        try {
          const base64 = canvas.toDataURL('image/png');
          resolve(base64);
        } catch (error) {
          // If toDataURL fails due to tainted canvas, try without CORS
          console.warn('Canvas tainted, retrying without CORS...');
          reject(error);
        }
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = (error) => {
      console.error('Failed to load image:', url, error);
      reject(new Error(`Failed to load image: ${url}`));
    };
    
    // Set source to start loading
    img.src = url;
  });
};

/**
 * Helper function to replace placeholders in header/footer content
 */
const replacePlaceholders = async (
  text: string, 
  job: Job, 
  companyInfo: any, 
  pageNum: number = 1, 
  totalPages: number = 1,
  customerName?: string,
  logoSize?: { maxHeight: number; maxWidth: number }
): Promise<string> => {
  // Handle company logo placeholder
  if (text.includes('{company_logo}')) {
    if (companyInfo?.logoUrl) {
      try {
        // Convert Firebase Storage URL to base64 to avoid CORS issues
        const base64Image = await imageUrlToBase64(companyInfo.logoUrl);
        const maxHeight = logoSize?.maxHeight || 40;
        const maxWidth = logoSize?.maxWidth || 150;
        return `<img src="${base64Image}" alt="Company Logo" style="max-height: ${maxHeight}px; max-width: ${maxWidth}px; object-fit: contain;" />`;
      } catch (error) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ FAILED TO LOAD COMPANY LOGO FOR PDF');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('This is likely a CORS (Cross-Origin) issue.');
        console.error('');
        console.error('📋 TO FIX THIS:');
        console.error('1. Open: docs/FIREBASE_STORAGE_CORS_SETUP.md');
        console.error('2. Follow the instructions to configure Firebase Storage CORS');
        console.error('3. It takes ~5 minutes using Google Cloud SDK');
        console.error('');
        console.error('Logo URL:', companyInfo.logoUrl);
        console.error('Error:', error);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Return a placeholder text instead of the image
        return '<div style="padding: 8px; background: #fee; border: 1px solid #fcc; border-radius: 4px; color: #c00; font-size: 10px;">⚠️ Logo unavailable - CORS not configured</div>';
      }
    }
    return ''; // Return empty if no logo
  }
  
  // Handle other placeholders
  return text
    .replace(/\{company_name\}/g, companyInfo?.companyName || '')
    .replace(/\{company_address\}/g, companyInfo?.address?.street || '')
    .replace(/\{company_phone\}/g, companyInfo?.contactInfo?.phone || '')
    .replace(/\{company_email\}/g, companyInfo?.contactInfo?.email || '')
    .replace(/\{company_website\}/g, companyInfo?.contactInfo?.website || '')
    .replace(/\{job_id\}/g, job.jobId || '')
    .replace(/\{job_title\}/g, job.title || '')
    .replace(/\{job_customer\}/g, customerName || job.customerCode || '')
    .replace(/\{date\}/g, new Date().toLocaleDateString('en-GB')) // DD/MM/YYYY format
    .replace(/\{page_number\}/g, `Page ${pageNum} of ${totalPages}`)
    .replace(/\{page\}/g, `${pageNum}`);
};

/**
 * Generate HTML content for the PDF
 */
const generatePDFHTML = async (job: Job, settings: PdfSettings, companyInfo: any, customerName?: string): Promise<string> => {
  const { fontSize, margin, headerContent, footerContent, showHeader, showFooter } = settings;
  
  // Format date helper - DD/MM/YYYY format
  const formatDate = (date?: string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-GB'); // DD/MM/YYYY format
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

  // Pre-process header and footer content with async placeholders
  const headerLeft = await replacePlaceholders(headerContent.left, job, companyInfo, 1, 1, customerName, settings.logoSize);
  const headerCenter = await replacePlaceholders(headerContent.center, job, companyInfo, 1, 1, customerName, settings.logoSize);
  const headerRight = await replacePlaceholders(headerContent.right, job, companyInfo, 1, 1, customerName, settings.logoSize);
  const footerLeft = await replacePlaceholders(footerContent.left, job, companyInfo, 1, 1, customerName, settings.logoSize);
  const footerCenter = await replacePlaceholders(footerContent.center, job, companyInfo, 1, 1, customerName, settings.logoSize);
  const footerRight = await replacePlaceholders(footerContent.right, job, companyInfo, 1, 1, customerName, settings.logoSize);

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
          <div style="flex: 1; font-size: ${fontSize.header}px;">
            ${headerLeft}
          </div>
          <div style="flex: 1; text-align: center; font-size: ${fontSize.header}px;">
            ${headerCenter}
          </div>
          <div style="flex: 1; text-align: right; font-size: ${fontSize.header}px;">
            ${headerRight}
          </div>
        </div>
      ` : ''}

      <div style="margin-bottom: 20px;">
        <h3 style="font-size: ${fontSize.heading}px; font-weight: bold; margin-bottom: 10px; color: #333;">
          ${settings.sectionHeaders?.jobInformation || 'Job Information'}
        </h3>
        <table style="width: 100%; font-size: ${fontSize.body}px; border-collapse: collapse;">
          ${settings.jobTableColumns.jobId ? `
          <tr>
            <td style="padding: 5px; width: 30%; font-weight: bold;">Job ID:</td>
            <td style="padding: 5px;">${job.jobId}</td>
          </tr>
          ` : ''}
          ${settings.jobTableColumns.title ? `
          <tr>
            <td style="padding: 5px; font-weight: bold;">Title:</td>
            <td style="padding: 5px;">${job.title}</td>
          </tr>
          ` : ''}
          ${settings.jobTableColumns.status ? `
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
          ` : ''}
          ${settings.jobTableColumns.customer ? `
          <tr>
            <td style="padding: 5px; font-weight: bold;">Customer:</td>
            <td style="padding: 5px;">${customerName || job.customerCode}</td>
          </tr>
          ` : ''}
          ${settings.jobTableColumns.assignedStaff && job.assignedStaff ? `
          <tr>
            <td style="padding: 5px; font-weight: bold;">Assigned Staff:</td>
            <td style="padding: 5px;">${job.assignedStaff}</td>
          </tr>
          ` : ''}
          ${settings.jobTableColumns.startDate && job.startDate ? `
          <tr>
            <td style="padding: 5px; font-weight: bold;">Start Date:</td>
            <td style="padding: 5px;">${formatDate(job.startDate)}</td>
          </tr>
          ` : ''}
          ${settings.jobTableColumns.scheduleDate && job.scheduleDate ? `
          <tr>
            <td style="padding: 5px; font-weight: bold;">Schedule Date:</td>
            <td style="padding: 5px;">${formatDate(job.scheduleDate)}</td>
          </tr>
          ` : ''}
          ${settings.jobTableColumns.created ? `
          <tr>
            <td style="padding: 5px; font-weight: bold;">Created:</td>
            <td style="padding: 5px;">${formatDate(job.createdAt?.toString())}</td>
          </tr>
          ` : ''}
        </table>
      </div>

      ${job.serviceInformation && settings.serviceInformationVisibility ? `
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: ${fontSize.heading}px; font-weight: bold; margin-bottom: 10px; color: #333;">
            ${settings.sectionHeaders?.serviceInformation || 'Service Information'}
          </h3>
          <table style="width: 100%; font-size: ${fontSize.body}px; border-collapse: collapse;">
            ${settings.serviceInformationVisibility.serviceRequested ? `
            <tr>
              <td style="padding: 5px; width: 30%; font-weight: bold;">Service Requested:</td>
              <td style="padding: 5px;">${job.serviceInformation.serviceRequested}</td>
            </tr>
            ` : ''}
            ${settings.serviceInformationVisibility.reportingFormat ? `
            <tr>
              <td style="padding: 5px; font-weight: bold;">Reporting Format:</td>
              <td style="padding: 5px;">
                ${job.serviceInformation.reportingFormat}
                ${job.serviceInformation.reportingFormat === 'Other' && job.serviceInformation.reportingFormatOther 
                  ? ` - ${job.serviceInformation.reportingFormatOther}` : ''}
              </td>
            </tr>
            ` : ''}
            ${settings.serviceInformationVisibility.statementOfConformity ? `
            <tr>
              <td style="padding: 5px; font-weight: bold;">Statement of Conformity:</td>
              <td style="padding: 5px;">${job.serviceInformation.statementOfConformity}</td>
            </tr>
            ` : ''}
            ${settings.serviceInformationVisibility.statementOfConformityRequirements && 
              job.serviceInformation.statementOfConformity === 'Required' && 
              job.serviceInformation.statementOfConformityRequirements ? `
            <tr>
              <td style="padding: 5px; font-weight: bold;">Requirements/Specifications:</td>
              <td style="padding: 5px; white-space: pre-wrap;">${job.serviceInformation.statementOfConformityRequirements}</td>
            </tr>
            ` : ''}
          </table>
        </div>
      ` : ''}

      ${job.equipment && job.equipment.length > 0 && settings.jobTableColumns.equipment ? `
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: ${fontSize.heading}px; font-weight: bold; margin-bottom: 10px; color: #333;">
            ${settings.sectionHeaders?.equipment || 'Item Details'}
          </h3>
          <table style="
            width: 100%;
            font-size: ${fontSize.small}px;
            border-collapse: collapse;
            ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''}
          ">
            <thead>
              <tr style="background: #f8f9fa;">
                ${settings.equipmentTableColumns.no ? `<th style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''} text-align: left;">No.</th>` : ''}
                ${settings.equipmentTableColumns.name ? `<th style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''} text-align: left;">Name</th>` : ''}
                ${settings.equipmentTableColumns.manufacturer ? `<th style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''} text-align: left;">Manufacturer</th>` : ''}
                ${settings.equipmentTableColumns.model ? `<th style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''} text-align: left;">Model</th>` : ''}
                ${settings.equipmentTableColumns.serialNumber ? `<th style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''} text-align: left;">Serial No.</th>` : ''}
                ${settings.equipmentTableColumns.calibrationPoint ? `<th style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''} text-align: left;">Calibration Point</th>` : ''}
                ${settings.equipmentTableColumns.calibrationMethods ? `<th style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''} text-align: left;">Calibration Methods</th>` : ''}
                ${settings.equipmentTableColumns.accessories ? `<th style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''} text-align: left;">Accessories</th>` : ''}
                ${settings.equipmentTableColumns.machineLocation ? `<th style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''} text-align: left;">Machine Location</th>` : ''}
                ${settings.equipmentTableColumns.remark ? `<th style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''} text-align: left;">Remark</th>` : ''}
              </tr>
            </thead>
            <tbody>
              ${job.equipment.map((eq, idx) => `
                <tr>
                  ${settings.equipmentTableColumns.no ? `<td style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''}">${idx + 1}</td>` : ''}
                  ${settings.equipmentTableColumns.name ? `<td style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''}">${eq.name || 'N/A'}</td>` : ''}
                  ${settings.equipmentTableColumns.manufacturer ? `<td style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''}">${eq.manufacturer || 'N/A'}</td>` : ''}
                  ${settings.equipmentTableColumns.model ? `<td style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''}">${eq.model || 'N/A'}</td>` : ''}
                  ${settings.equipmentTableColumns.serialNumber ? `<td style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''}">${eq.serialNumber || 'N/A'}</td>` : ''}
                  ${settings.equipmentTableColumns.calibrationPoint ? `<td style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''}">${eq.calibrationPoint || 'N/A'}</td>` : ''}
                  ${settings.equipmentTableColumns.calibrationMethods ? `<td style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''}">${eq.calibrationMethods || 'N/A'}</td>` : ''}
                  ${settings.equipmentTableColumns.accessories ? `<td style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''}">${eq.accessories || 'N/A'}</td>` : ''}
                  ${settings.equipmentTableColumns.machineLocation ? `<td style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''}">${eq.machineLocation || 'N/A'}</td>` : ''}
                  ${settings.equipmentTableColumns.remark ? `<td style="padding: 8px; ${settings.showTableBorders ? 'border: 1px solid #ddd;' : ''}">${eq.remark || 'N/A'}</td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      ${job.workAuthorization && settings.workAuthorizationVisibility ? `
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: ${fontSize.heading}px; font-weight: bold; margin-bottom: 10px; color: #333;">
            ${settings.sectionHeaders?.workAuthorization || 'Work Authorization'}
          </h3>
          
          ${settings.workAuthorizationVisibility.workAuthorizationStatement ? `
            <div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px;">
              <p style="font-size: ${fontSize.body}px; margin: 0; font-style: italic; color: #333;">
                ${settings.workAuthorizationStatement || 'I confirm that the information provided is correct and authorize the laboratory to proceed with the requested services according to the laboratory\'s terms and conditions. I understand that any deviations from the request must be communicated and approved before proceeding.'}
              </p>
            </div>
          ` : ''}

          <table style="width: 100%; font-size: ${fontSize.body}px; border-collapse: collapse;">
            ${settings.workAuthorizationVisibility.customerSignature && job.workAuthorization.customerSignature ? `
            <tr>
              <td style="padding: 5px; width: 30%; font-weight: bold;">Customer Signature:</td>
              <td style="padding: 5px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <img src="${job.workAuthorization.customerSignature.signatureData}" style="max-height: 60px; max-width: 200px;" />
                  <div>
                    <div style="font-weight: bold;">${job.workAuthorization.customerSignature.signerName}</div>
                    <div style="font-size: ${fontSize.small}px; color: #666;">
                      ${getDateFromValue(job.workAuthorization.customerSignature.signedDate).toLocaleDateString('en-GB')} at ${getDateFromValue(job.workAuthorization.customerSignature.signedDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </td>
            </tr>
            ` : ''}
            
            ${settings.workAuthorizationVisibility.itemsConditionOnReceipt ? `
            <tr>
              <td style="padding: 5px; font-weight: bold;">Items Condition on Receipt:</td>
              <td style="padding: 5px;">
                ${job.workAuthorization.itemsConditionOnReceipt}
                ${job.workAuthorization.itemsConditionOnReceipt !== 'Acceptable' && job.workAuthorization.itemsConditionOnReceipt !== 'Insufficient quantity' && job.workAuthorization.itemsConditionSpecification 
                  ? `<br/><span style="font-size: ${fontSize.small}px; color: #666;">Specification: ${job.workAuthorization.itemsConditionSpecification}</span>` : ''}
              </td>
            </tr>
            ` : ''}
            
            ${settings.workAuthorizationVisibility.laboratoryCapabilityAssessment ? `
            <tr>
              <td style="padding: 5px; font-weight: bold;">Laboratory Capability Assessment:</td>
              <td style="padding: 5px;">
                ${job.workAuthorization.laboratoryCapabilityAssessment}
                ${job.workAuthorization.laboratoryCapabilityAssessment !== 'Full capability' && job.workAuthorization.capabilitySpecification 
                  ? `<br/><span style="font-size: ${fontSize.small}px; color: #666;">Specification: ${job.workAuthorization.capabilitySpecification}</span>` : ''}
              </td>
            </tr>
            ` : ''}
            
            ${settings.workAuthorizationVisibility.staffSignature && job.workAuthorization.staffSignature ? `
            <tr>
              <td style="padding: 5px; font-weight: bold;">Staff Signature:</td>
              <td style="padding: 5px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <img src="${job.workAuthorization.staffSignature.signatureData}" style="max-height: 60px; max-width: 200px;" />
                  <div>
                    <div style="font-weight: bold;">${job.workAuthorization.staffSignature.signerName}</div>
                    <div style="font-size: ${fontSize.small}px; color: #666;">
                      ${getDateFromValue(job.workAuthorization.staffSignature.signedDate).toLocaleDateString('en-GB')} at ${getDateFromValue(job.workAuthorization.staffSignature.signedDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </td>
            </tr>
            ` : ''}
          </table>
        </div>
      ` : ''}


      ${job.comments ? `
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: ${fontSize.heading}px; font-weight: bold; margin-bottom: 10px; color: #333;">
            ${settings.sectionHeaders?.comments || 'Comments'}
          </h3>
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
          font-size: ${fontSize.footer}px;
          color: #666;
        ">
          <div style="flex: 1;">
            ${footerLeft}
          </div>
          <div style="flex: 1; text-align: center;">
            ${footerCenter}
          </div>
          <div style="flex: 1; text-align: right;">
            ${footerRight}
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
    
    // Fetch customer name from customer code
    let customerName: string | undefined;
    try {
      if (job.customerCode) {
        const customer = await customerService.getCustomerByCode(job.customerCode);
        customerName = customer.name;
      }
    } catch (error) {
      console.warn('Could not fetch customer name, using code instead:', error);
      customerName = undefined; // Will fallback to customerCode in the template
    }
    
    // Merge with default settings
    const pdfSettings: PdfSettings = {
      ...DEFAULT_PDF_SETTINGS,
      ...settings,
      fontSize: { ...DEFAULT_PDF_SETTINGS.fontSize, ...(settings.fontSize || {}) },
      margin: { ...DEFAULT_PDF_SETTINGS.margin, ...(settings.margin || {}) },
      fieldVisibility: { ...DEFAULT_PDF_SETTINGS.fieldVisibility, ...(settings.fieldVisibility || {}) },
      jobTableColumns: { ...DEFAULT_PDF_SETTINGS.jobTableColumns, ...(settings.jobTableColumns || {}) },
      equipmentTableColumns: { ...DEFAULT_PDF_SETTINGS.equipmentTableColumns, ...(settings.equipmentTableColumns || {}) },
      serviceInformationVisibility: { ...DEFAULT_PDF_SETTINGS.serviceInformationVisibility, ...(settings.serviceInformationVisibility || {}) },
      workAuthorizationVisibility: { ...DEFAULT_PDF_SETTINGS.workAuthorizationVisibility, ...(settings.workAuthorizationVisibility || {}) },
      workAuthorizationStatement: settings.workAuthorizationStatement || DEFAULT_PDF_SETTINGS.workAuthorizationStatement,
      sectionHeaders: { ...DEFAULT_PDF_SETTINGS.sectionHeaders, ...(settings.sectionHeaders || {}) },
      headerContent: { ...DEFAULT_PDF_SETTINGS.headerContent, ...(settings.headerContent || {}) },
      footerContent: { ...DEFAULT_PDF_SETTINGS.footerContent, ...(settings.footerContent || {}) },
      logoSize: { ...DEFAULT_PDF_SETTINGS.logoSize, ...(settings.logoSize || {}) }
    };

    // Generate HTML content with all placeholders replaced (including base64 images)
    const htmlContent = await generatePDFHTML(job, pdfSettings, companyInfo, customerName);
    
    // Create a temporary container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '210mm'; // A4 width
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    // Wait for images (logos) to load - images are now base64, so this should be very fast
    const images = container.querySelectorAll('img');
    if (images.length > 0) {
      await Promise.all(
        Array.from(images).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => {
              console.warn('Failed to load image (base64):', img.src.substring(0, 50) + '...');
              resolve(); // Continue even if image fails
            };
            // Shorter timeout since base64 images load instantly
            setTimeout(() => resolve(), 1000);
          });
        })
      );
    }

    // Small delay to ensure rendering is complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Convert to canvas with optimized settings for base64 images
    const canvas = await html2canvas(container, {
      scale: 2.5, // Higher quality
      useCORS: false, // Not needed with base64 images
      allowTaint: true, // Safe with base64 images
      logging: false,
      backgroundColor: '#ffffff',
      imageTimeout: 1000, // Shorter timeout for base64
      removeContainer: false
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