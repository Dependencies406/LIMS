/**
 * Formula Verification PDF Service
 * Generates PDF documents for formula verification results
 */

import jsPDF from 'jspdf';
import type { RowVerification, CellVerification, StepApproval } from './formulaVerificationService';
import type { Job } from '../types';

export interface FormulaVerificationPdfOptions {
  templateName?: string;
  job?: Job;
}

/**
 * Generate PDF for formula verification results
 */
export async function generateFormulaVerificationPdf(
  verification: RowVerification,
  options: FormulaVerificationPdfOptions = {}
): Promise<jsPDF> {
  const { templateName, job } = options;
  // Create PDF document (A4 portrait)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);
  let currentY = margin;

  // Title
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('Formula Verification Report', margin, currentY);
  currentY += 8;

  // Template Name
  if (templateName) {
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Template:', margin, currentY);
    pdf.setFont('helvetica', 'normal');
    pdf.text(templateName, margin + 25, currentY);
    currentY += 5;
  }

  // Job Information
  if (job) {
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Job Information:', margin, currentY);
    currentY += 4;
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const jobInfo = [
      `Job ID: ${job.jobId || 'N/A'}`,
      `Title: ${job.title || 'N/A'}`,
      `Customer Code: ${job.customerCode || 'N/A'}`,
    ];
    
    jobInfo.forEach((info) => {
      pdf.text(info, margin + 2, currentY);
      currentY += 4;
    });
    currentY += 2;
  }

  // Row information
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Row ${verification.rowIndex + 1} - Formula Verification`, margin, currentY);
  currentY += 6;

  // Row Data Summary
  currentY = renderSectionHeader(pdf, 'Row Data Summary', margin, currentY);
  currentY = renderRowData(pdf, verification.rowData, margin, currentY, contentWidth);
  currentY += 5;

  // Formula Verifications
  // Reserve space: footer text height + spacing + margin = 20mm from bottom
  const footerFontSize = 8; // Footer font size in points
  const footerTextHeight = footerFontSize * 0.352778; // Convert points to mm (1pt = 0.352778mm)
  const footerSpacing = 8; // Spacing above footer (increased to prevent overlap)
  const bottomMargin = 5; // Margin at bottom of page
  const footerReservedSpace = footerTextHeight + footerSpacing + bottomMargin; // Total space reserved for footer (~21mm)
  const minContentBottom = pageHeight - footerReservedSpace; // Minimum Y before footer area
  
  if (verification.formulaVerifications.length > 0) {
    for (let idx = 0; idx < verification.formulaVerifications.length; idx++) {
      const formulaVer = verification.formulaVerifications[idx];
      // Check if we need a new page (leave space for footer)
      if (currentY > minContentBottom) {
        pdf.addPage();
        currentY = margin;
      }

      currentY = await renderFormulaVerification(pdf, formulaVer, idx + 1, margin, currentY, contentWidth, pageHeight, minContentBottom);
      currentY += 5;
    }
  } else {
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text('No formulas found in this row.', margin, currentY);
    currentY += 5;
  }

  // Footer on each page
  const totalPages = pdf.getNumberOfPages();
  
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    
    // Calculate footer position - place text baseline at bottom margin
    const footerY = pageHeight - bottomMargin;
    
    // Footer text
    pdf.setFontSize(footerFontSize);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(150, 150, 150);
    pdf.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - margin - 20,
      footerY
    );
    pdf.text(
      `Generated: ${new Date().toLocaleString()}`,
      margin,
      footerY
    );
  }

  return pdf;
}

/**
 * Render section header
 */
function renderSectionHeader(
  pdf: jsPDF,
  title: string,
  margin: number,
  y: number
): number {
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text(title, margin, y);
  return y + 6;
}

/**
 * Render row data summary
 */
function renderRowData(
  pdf: jsPDF,
  rowData: Map<string, { cellId: string; value: number | string | boolean | null; displayValue: string }>,
  margin: number,
  startY: number,
  contentWidth: number
): number {
  let currentY = startY;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);

  // Create table for row data
  const entries = Array.from(rowData.entries());
  const colWidth = contentWidth / 2;
  let colIndex = 0;
  let rowIndex = 0;

  entries.forEach(([colName, data]) => {
    const x = margin + (colIndex * colWidth);
    const y = currentY + (rowIndex * 5);

    // Column name
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${colName}:`, x, y);
    
    // Value
    pdf.setFont('helvetica', 'normal');
    const valueText = data.displayValue || 'N/A';
    const valueLines = pdf.splitTextToSize(valueText, colWidth - 30);
    pdf.text(valueLines[0] || valueText, x + 25, y);

    colIndex++;
    if (colIndex >= 2) {
      colIndex = 0;
      rowIndex++;
      if (rowIndex >= 6) {
        // Start new column group
        currentY += (rowIndex * 5) + 2;
        rowIndex = 0;
      }
    }
  });

  return currentY + (rowIndex * 5) + 5;
}

/**
 * Render formula verification
 */
async function renderFormulaVerification(
  pdf: jsPDF,
  formulaVer: CellVerification,
  formulaNumber: number,
  margin: number,
  startY: number,
  contentWidth: number,
  pageHeight: number,
  minContentBottom: number
): Promise<number> {
  let currentY = startY;

  // Formula header
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text(`Formula ${formulaNumber}: ${formulaVer.columnName}`, margin, currentY);
  currentY += 5;

  // Formula expression box
  pdf.setFillColor(230, 240, 255);
  pdf.rect(margin, currentY - 3, contentWidth, 6, 'F');
  pdf.setDrawColor(100, 150, 255);
  pdf.rect(margin, currentY - 3, contentWidth, 6);
  
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);
  pdf.text('Formula:', margin + 2, currentY);
  pdf.setFont('helvetica', 'bold');
  pdf.text(formulaVer.formula, margin + 20, currentY);
  currentY += 8;

  // Input values
  if (formulaVer.inputValues.size > 0) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Input Values:', margin, currentY);
    currentY += 4;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    
    const inputEntries = Array.from(formulaVer.inputValues.entries());
    const inputColWidth = contentWidth / 3;
    let inputColIndex = 0;
    let inputRowIndex = 0;

    inputEntries.forEach(([ref, data]) => {
      const x = margin + (inputColIndex * inputColWidth);
      const y = currentY + (inputRowIndex * 4);

      pdf.setFont('helvetica', 'bold');
      pdf.text(`${ref}:`, x, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(data.displayValue || 'N/A', x + 12, y);

      inputColIndex++;
      if (inputColIndex >= 3) {
        inputColIndex = 0;
        inputRowIndex++;
      }
    });

    currentY += (inputRowIndex * 4) + 5;
  }

  // Calculation steps
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Calculation Steps:', margin, currentY);
  currentY += 5;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);

  for (const step of formulaVer.calculationSteps) {
    // Check if we need a new page (leave space for footer)
    if (currentY > minContentBottom) {
      pdf.addPage();
      currentY = margin;
      
      // Redraw formula header on new page
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Formula ${formulaNumber}: ${formulaVer.columnName} (continued)`, margin, currentY);
      currentY += 8;
    }

    // Step number and description
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(0, 100, 200);
    pdf.text(`Step ${step.step}: ${step.description}`, margin + 3, currentY);
    
    // Show approved badge if step is approved
    if (step.approval) {
      pdf.setFontSize(7);
      pdf.setTextColor(0, 150, 0);
      pdf.text('✓ Approved', margin + contentWidth - 30, currentY);
    }
    
    currentY += 4;

    // Expression
    if (step.expression) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(0, 0, 0);
      const exprLines = pdf.splitTextToSize(step.expression, contentWidth - 10);
      exprLines.forEach((line: string) => {
        pdf.text(line, margin + 6, currentY);
        currentY += 3;
      });
    }

    // Result
    if (step.result !== null && step.result !== undefined) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(0, 150, 0);
      pdf.text(`Result: ${String(step.result)}`, margin + 6, currentY);
      currentY += 4;
    }

    // Sub-steps
    if (step.subSteps && step.subSteps.length > 0) {
      step.subSteps.forEach((subStep) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`  • ${subStep.description}`, margin + 9, currentY);
        if (subStep.result !== null && subStep.result !== undefined) {
          pdf.text(` = ${String(subStep.result)}`, margin + 9 + pdf.getTextWidth(`  • ${subStep.description}`), currentY);
        }
        currentY += 3;
      });
    }

    // Approval information
    if (step.approval) {
      const approval = step.approval;
      // Check if we need a new page for approval info (reserve more space to prevent footer overlap)
      if (currentY > minContentBottom - 30) {
        pdf.addPage();
        currentY = margin;
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Formula ${formulaNumber}: ${formulaVer.columnName} (continued)`, margin, currentY);
        currentY += 8;
      }
      
      currentY += 2; // Add spacing before approval box
      
      // Calculate box dimensions - ensure all content fits
      const boxStartY = currentY;
      const boxPadding = 2; // Padding inside box (top and bottom)
      const labelSpacing = 3; // Space for "Step Approved:" label (font size 7 ≈ 2.5mm, add 0.5mm)
      const signatureHeight = 8; // Height for signature image
      const textSpacing = 3.5; // Space for reviewer/date text (font size 7 ≈ 2.5mm, add 1mm)
      const spacingBetween = 1.5; // Spacing between elements
      
      // Calculate total height needed
      const totalContentHeight = 
        boxPadding + // Top padding
        labelSpacing + spacingBetween + // Label + spacing
        signatureHeight + spacingBetween + // Signature + spacing
        textSpacing + spacingBetween + // Reviewer + spacing
        textSpacing + boxPadding; // Date + bottom padding
      
      const boxHeight = totalContentHeight; // ~24mm
      const boxWidth = (contentWidth - 12) / 3; // Reduced to 1/3 of original width
      
      // Draw approval box FIRST (so content appears on top)
      pdf.setDrawColor(0, 150, 0);
      pdf.setLineWidth(0.5);
      pdf.rect(margin + 6, boxStartY, boxWidth, boxHeight);
      
      // Calculate Y positions relative to box top
      // In jsPDF, text Y coordinate is the baseline (bottom of text)
      let contentY = boxStartY + boxPadding;
      
      // "Step Approved:" label
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 150, 0);
      // Place baseline at contentY + labelSpacing (text extends upward)
      pdf.text('Step Approved:', margin + 8, contentY + labelSpacing);
      contentY += labelSpacing + spacingBetween;
      
      // Signature image (positioned below label)
      if (approval.signatureData) {
        const signatureData = approval.signatureData;
        try {
          const img = new Image();
          img.src = signatureData;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const sigHeight = 8;
              // Limit signature width to fit within the narrower box (1/3 width)
              const maxSigWidth = boxWidth - 4; // Leave 2mm padding on each side
              const sigWidth = Math.min((img.width / img.height) * sigHeight, maxSigWidth);
              // Image Y coordinate is top-left corner
              pdf.addImage(signatureData, 'PNG', margin + 8, contentY, sigWidth, sigHeight);
              resolve();
            };
            img.onerror = () => resolve();
          });
        } catch (err) {
          console.warn('Could not render signature:', err);
        }
      }
      contentY += signatureHeight + spacingBetween;
      
      // Reviewer name (positioned below signature)
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      // Place baseline at contentY + textSpacing (text extends upward)
      pdf.text(`Reviewer: ${approval.reviewerName}`, margin + 8, contentY + textSpacing);
      contentY += textSpacing + spacingBetween;
      
      // Date (positioned below reviewer)
      pdf.text(`Date: ${new Date(approval.approvedDate).toLocaleString()}`, margin + 8, contentY + textSpacing);
      
      // Update currentY to position after the box
      currentY = boxStartY + boxHeight + 2;
    }

    currentY += 2;
  }

  // Final result (check if we need a new page for footer)
  // Reserve space for final result box (about 10mm) + extra spacing to prevent footer overlap
  if (currentY > minContentBottom - 15) {
    pdf.addPage();
    currentY = margin;
    
    // Redraw formula header on new page
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Formula ${formulaNumber}: ${formulaVer.columnName} (continued)`, margin, currentY);
    currentY += 8;
  }

  pdf.setFillColor(230, 255, 230);
  pdf.rect(margin, currentY - 3, contentWidth, 6, 'F');
  pdf.setDrawColor(0, 200, 0);
  pdf.rect(margin, currentY - 3, contentWidth, 6);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('Final Result:', margin + 2, currentY);
  
  if (formulaVer.error) {
    pdf.setTextColor(200, 0, 0);
    pdf.text(`Error: ${formulaVer.error}`, margin + 30, currentY);
  } else {
    pdf.setTextColor(0, 150, 0);
    pdf.text(formulaVer.displayValue, margin + 30, currentY);
  }

  currentY += 10; // Add extra spacing after final result

  return currentY;
}
