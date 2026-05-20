/**
 * Spreadsheet PDF Export Service
 * Generates PDF datasheet from spreadsheet data
 */

import jsPDF from 'jspdf';
import type { Job, Equipment, CompanyInfo } from '../types';
import type { SpreadsheetModel, ColumnDefinition } from '../modules/spreadsheet/models/SpreadsheetModel';
import { generateCellId } from '../modules/spreadsheet/models/SpreadsheetModel';
import { getCompanyInfo, formatCompanyAddress } from './companyInfoService';
import { userService } from './userService';
import { getSpreadsheetCells, getSpreadsheetColumnDefinitions, getSpreadsheetColumnOrder } from '../modules/spreadsheet/utils/tabMigration';

export interface SpreadsheetPdfOptions {
  includeAllData?: boolean; // Include all data even if column is hidden
  showFormulas?: boolean; // Show formulas as footnotes
  selectedTabOrders?: number[]; // Array of tab order indices to include (0-based, by template order)
}

/**
 * Generate PDF datasheet from spreadsheet
 */
export async function generateSpreadsheetPdf(
  spreadsheet: SpreadsheetModel,
  job: Job,
  equipment: Equipment,
  options: SpreadsheetPdfOptions = {}
): Promise<jsPDF> {
  const { includeAllData = true, showFormulas = true } = options;

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

  // Get company info
  const companyInfo = await getCompanyInfo();

  // Get recorder name if available
  let recorderName = 'N/A';
  if (spreadsheet.updatedBy) {
    try {
      const user = await userService.getUserById(spreadsheet.updatedBy);
      recorderName = user.displayName || user.email || spreadsheet.updatedBy;
    } catch (err) {
      console.warn('Could not fetch recorder name:', err);
      recorderName = spreadsheet.updatedBy;
    }
  }

  // Format latest record time
  const latestRecordTime = spreadsheet.updatedAt
    ? new Date(spreadsheet.updatedAt).toLocaleString()
    : spreadsheet.createdAt
    ? new Date(spreadsheet.createdAt).toLocaleString()
    : 'N/A';

  // ===== HEADER SECTION =====
  currentY = await renderHeader(pdf, companyInfo, margin, contentWidth, currentY);

  // Add spacing
  currentY += 5;

  // ===== JOB INFORMATION SECTION =====
  currentY = renderSectionHeader(pdf, 'Job Information', margin, currentY);
  currentY = renderJobInfo(pdf, job, margin, currentY, contentWidth);
  currentY += 3;

  // ===== EQUIPMENT INFORMATION SECTION =====
  currentY = renderSectionHeader(pdf, 'Equipment Information', margin, currentY);
  currentY = renderEquipmentInfo(pdf, equipment, margin, currentY, contentWidth);
  currentY += 3;

  // ===== SPREADSHEET DATA SECTION =====
  // Handle multiple tabs if present
  if (spreadsheet.tabs && spreadsheet.tabs.size > 0) {
    // Get tabs in order
    const tabs = Array.from(spreadsheet.tabs.values())
      .sort((a, b) => a.order - b.order);
    
    // Filter by selectedTabOrders if provided
    const tabsToRender = options.selectedTabOrders
      ? options.selectedTabOrders.map(order => tabs[order]).filter(Boolean)
      : tabs;
    
    // Render each tab
    for (let tabIndex = 0; tabIndex < tabsToRender.length; tabIndex++) {
      const tab = tabsToRender[tabIndex];
      
      // Add tab title/header (except for first tab which already has "Raw Data" header)
      if (tabIndex > 0 || tabsToRender.length > 1) {
        currentY = renderSectionHeader(pdf, tab.name, margin, currentY);
      } else {
        currentY = renderSectionHeader(pdf, `${tab.name} - Raw Data`, margin, currentY);
      }
      
      // Get column definitions and order for this tab
      const columnOrder = tab.columnOrder || [];
      const columnDefs = tab.columnDefinitions || new Map<string, ColumnDefinition>();

      // Prepare table data for this tab
      const tableData: string[][] = [];
      
      // Header row - include both name and columnValue for formula verification
      const headers: string[] = [];
      columnOrder.forEach((colName, colIndex) => {
        const colDef = columnDefs.get(colName);
        if (colDef) {
          // Include columnValue in header if it exists and is different from name
          if (colDef.columnValue && colDef.columnValue !== colDef.name) {
            headers.push(`${colDef.name} (${colDef.columnValue})`);
          } else {
            headers.push(colDef.name || colName);
          }
        } else {
          headers.push(colName);
        }
      });
      tableData.push(headers);

      // Get all rows (find max row number) for this tab
      let maxRow = 0;
      tab.cells.forEach((cell) => {
        if (cell.row > maxRow) {
          maxRow = cell.row;
        }
      });

      // Data rows
      for (let rowIndex = 0; rowIndex <= maxRow; rowIndex++) {
        const rowData: string[] = [];
        let hasData = false;

        columnOrder.forEach((colName, colIndex) => {
          const cellId = generateCellId(rowIndex, colIndex);
          const cell = tab.cells.get(cellId);
          
          if (cell) {
            // Use displayValue if available, otherwise rawValue
            const value = cell.displayValue !== undefined && cell.displayValue !== null
              ? String(cell.displayValue)
              : cell.rawValue !== undefined && cell.rawValue !== null
              ? String(cell.rawValue)
              : '';
            rowData.push(value);
            if (value.trim()) hasData = true;
          } else {
            rowData.push('');
          }
        });

        // Only add row if it has data
        if (hasData) {
          tableData.push(rowData);
        }
      }

      // Render table for this tab
      currentY = renderTable(pdf, tableData, margin, currentY, contentWidth, pageHeight);
      
      // Add page break between tabs (except last)
      if (tabIndex < tabsToRender.length - 1) {
        pdf.addPage();
        currentY = margin;
        // Re-render header on new page
        currentY = await renderHeader(pdf, companyInfo, margin, contentWidth, currentY);
        currentY += 5;
      }
    }
  } else {
    // Legacy single-tab format
    currentY = renderSectionHeader(pdf, 'Raw Data', margin, currentY);
    
    // Get column definitions and order
    const columnOrder = getSpreadsheetColumnOrder(spreadsheet) || [];
    const columnDefs = getSpreadsheetColumnDefinitions(spreadsheet) || new Map<string, ColumnDefinition>();
    const cells = getSpreadsheetCells(spreadsheet);

    // Prepare table data
    const tableData: string[][] = [];
    
    // Header row - include both name and columnValue for formula verification
    const headers: string[] = [];
    columnOrder.forEach((colName, colIndex) => {
      const colDef = columnDefs.get(colName);
      if (colDef) {
        // Include columnValue in header if it exists and is different from name
        if (colDef.columnValue && colDef.columnValue !== colDef.name) {
          headers.push(`${colDef.name} (${colDef.columnValue})`);
        } else {
          headers.push(colDef.name || colName);
        }
      } else {
        headers.push(colName);
      }
    });
    tableData.push(headers);

    // Get all rows (find max row number)
    let maxRow = 0;
    cells.forEach((cell) => {
      if (cell.row > maxRow) {
        maxRow = cell.row;
      }
    });

    // Data rows
    for (let rowIndex = 0; rowIndex <= maxRow; rowIndex++) {
      const rowData: string[] = [];
      let hasData = false;

      columnOrder.forEach((colName, colIndex) => {
        const cellId = generateCellId(rowIndex, colIndex);
        const cell = cells.get(cellId);
        
        if (cell) {
          // Use displayValue if available, otherwise rawValue
          const value = cell.displayValue !== undefined && cell.displayValue !== null
            ? String(cell.displayValue)
            : cell.rawValue !== undefined && cell.rawValue !== null
            ? String(cell.rawValue)
            : '';
          rowData.push(value);
          if (value.trim()) hasData = true;
        } else {
          rowData.push('');
        }
      });

      // Only add row if it has data
      if (hasData) {
        tableData.push(rowData);
      }
    }

    // Render table
    currentY = renderTable(pdf, tableData, margin, currentY, contentWidth, pageHeight);
  }

  // ===== FOOTER SECTION =====
  // Latest record info
  currentY += 5;
  pdf.setFontSize(10);
  pdf.setTextColor(100, 100, 100);
  pdf.text(`Latest Record: ${latestRecordTime}`, margin, currentY);
  currentY += 4;
  pdf.text(`Recorded By: ${recorderName}`, margin, currentY);

  // ===== FORMULAS AS FOOTNOTES =====
  // Collect formulas from all tabs or legacy format
  const allFormulas: Array<{ column: string; formula: string; tabName?: string }> = [];
  
  if (spreadsheet.tabs && spreadsheet.tabs.size > 0) {
    // Collect from all rendered tabs
    const tabs = Array.from(spreadsheet.tabs.values())
      .sort((a, b) => a.order - b.order);
    const tabsToRender = options.selectedTabOrders
      ? options.selectedTabOrders.map(order => tabs[order]).filter(Boolean)
      : tabs;
    
    tabsToRender.forEach((tab) => {
      const tabColumnOrder = tab.columnOrder || [];
      const tabColumnDefs = tab.columnDefinitions || new Map<string, ColumnDefinition>();
      
      tabColumnOrder.forEach((colName: string) => {
        const colDef = tabColumnDefs.get(colName);
        if (colDef && colDef.formula) {
          allFormulas.push({
            column: colDef.name || colName,
            formula: colDef.formula,
            tabName: tab.name,
          });
        }
      });
    });
  } else {
    // Legacy format
    const columnOrder = getSpreadsheetColumnOrder(spreadsheet) || [];
    const columnDefs = getSpreadsheetColumnDefinitions(spreadsheet) || new Map<string, ColumnDefinition>();
    
    columnOrder.forEach((colName: string) => {
      const colDef = columnDefs.get(colName);
      if (colDef && colDef.formula) {
        allFormulas.push({
          column: colDef.name || colName,
          formula: colDef.formula,
        });
      }
    });
  }
  
  if (showFormulas && allFormulas.length > 0) {
    currentY += 5;
    currentY = renderSectionHeader(pdf, 'Column Formulas', margin, currentY);

    if (allFormulas.length > 0) {
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      
      allFormulas.forEach((item, index) => {
        // Check if we need a new page
        if (currentY > pageHeight - 20) {
          pdf.addPage();
          currentY = margin;
        }

        const formulaText = `${item.column}: ${item.formula}`;
        const lines = pdf.splitTextToSize(formulaText, contentWidth);
        
        lines.forEach((line: string) => {
          if (currentY > pageHeight - 20) {
            pdf.addPage();
            currentY = margin;
          }
          pdf.text(line, margin, currentY);
          currentY += 4;
        });
        
        currentY += 2; // Spacing between formulas
      });
    }
  }

  return pdf;
}

/**
 * Render header with company logo and info
 */
async function renderHeader(
  pdf: jsPDF,
  companyInfo: CompanyInfo | null,
  margin: number,
  contentWidth: number,
  startY: number
): Promise<number> {
  let currentY = startY;

  // Company logo (if available)
  if (companyInfo?.logoBase64) {
    try {
      const imgData = companyInfo.logoBase64;
      
      // Determine image format from base64 string
      let imageFormat: 'PNG' | 'JPEG' = 'PNG';
      if (imgData.startsWith('data:image/jpeg') || imgData.startsWith('data:image/jpg')) {
        imageFormat = 'JPEG';
      }
      
      // Extract base64 data (remove data URL prefix if present)
      const base64Data = imgData.includes(',') ? imgData.split(',')[1] : imgData;
      
      // Load image to get original dimensions and maintain aspect ratio
      return new Promise<number>((resolve) => {
        const img = new Image();
        img.onload = () => {
          // Calculate dimensions maintaining aspect ratio
          const maxHeight = 20; // Maximum height in mm
          const maxWidth = 60; // Maximum width in mm
          
          let logoWidth = img.width * (maxHeight / img.height);
          let logoHeight = maxHeight;
          
          // If calculated width exceeds max width, scale down proportionally
          if (logoWidth > maxWidth) {
            logoWidth = maxWidth;
            logoHeight = img.height * (maxWidth / img.width);
          }
          
          const logoX = margin;
          const logoY = currentY;

          pdf.addImage(base64Data, imageFormat, logoX, logoY, logoWidth, logoHeight);
          
          // Company info next to logo
          pdf.setFontSize(12);
          pdf.setTextColor(0, 0, 0);
          pdf.setFont('helvetica', 'bold');
          
          const infoX = logoX + logoWidth + 5;
          let infoY = logoY + 5;
          
          if (companyInfo.companyName) {
            pdf.text(companyInfo.companyName, infoX, infoY);
            infoY += 5;
          }
          
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          
          if (companyInfo.address) {
            const addressText = formatCompanyAddress(companyInfo.address);
            if (addressText) {
              const addressLines = pdf.splitTextToSize(addressText, contentWidth - logoWidth - 5);
              addressLines.forEach((line: string) => {
                pdf.text(line, infoX, infoY);
                infoY += 4;
              });
            }
          }
          
          if (companyInfo.contactInfo) {
            const contactParts: string[] = [];
            if (companyInfo.contactInfo.phone) contactParts.push(`Tel: ${companyInfo.contactInfo.phone}`);
            if (companyInfo.contactInfo.email) contactParts.push(`Email: ${companyInfo.contactInfo.email}`);
            if (contactParts.length > 0) {
              const contactText = contactParts.join(' | ');
              const contactLines = pdf.splitTextToSize(contactText, contentWidth - logoWidth - 5);
              contactLines.forEach((line: string) => {
                pdf.text(line, infoX, infoY);
                infoY += 4;
              });
            }
          }
          
          resolve(Math.max(currentY + logoHeight, infoY) + 5);
        };
        img.onerror = () => {
          console.warn('Could not load logo image');
          resolve(currentY);
        };
        img.src = imgData;
      });
    } catch (err) {
      console.warn('Could not render logo:', err);
      // Continue without logo
    }
  }

  // If no logo, just render company info
  pdf.setFontSize(12);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'bold');
  
  if (companyInfo?.companyName) {
    pdf.text(companyInfo.companyName, margin, currentY);
    currentY += 5;
  }
  
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  
  if (companyInfo?.address) {
    const addressText = formatCompanyAddress(companyInfo.address);
    if (addressText) {
      pdf.text(addressText, margin, currentY);
      currentY += 4;
    }
  }
  
  if (companyInfo?.contactInfo) {
    const contactParts: string[] = [];
    if (companyInfo.contactInfo.phone) contactParts.push(`Tel: ${companyInfo.contactInfo.phone}`);
    if (companyInfo.contactInfo.email) contactParts.push(`Email: ${companyInfo.contactInfo.email}`);
    if (contactParts.length > 0) {
      pdf.text(contactParts.join(' | '), margin, currentY);
      currentY += 4;
    }
  }

  return currentY + 5;
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
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text(title, margin, y);
  return y + 6;
}

/**
 * Render job information
 */
function renderJobInfo(
  pdf: jsPDF,
  job: Job,
  margin: number,
  startY: number,
  contentWidth: number
): number {
  let currentY = startY;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);

  const jobFields = [
    { label: 'Job ID', value: job.jobId || 'N/A' },
    { label: 'Title', value: job.title || 'N/A' },
    { label: 'Status', value: job.status || 'N/A' },
    { label: 'Customer Code', value: job.customerCode || 'N/A' },
    { label: 'Customer Contact', value: job.customerContact || 'N/A' },
    { label: 'Assigned Staff', value: job.assignedStaff || 'N/A' },
    { label: 'Received Date', value: job.receivedDate || 'N/A' },
    { label: 'Appointment Date', value: job.appointmentDate || 'N/A' },
  ];

  jobFields.forEach((field) => {
    const text = `${field.label}: ${field.value}`;
    const lines = pdf.splitTextToSize(text, contentWidth);
    lines.forEach((line: string) => {
      pdf.text(line, margin, currentY);
      currentY += 4;
    });
  });

  return currentY;
}

/**
 * Render equipment information
 */
function renderEquipmentInfo(
  pdf: jsPDF,
  equipment: Equipment,
  margin: number,
  startY: number,
  contentWidth: number
): number {
  let currentY = startY;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(0, 0, 0);

  const equipmentFields = [
    { label: 'Name', value: equipment.name || 'N/A' },
    { label: 'Manufacturer', value: equipment.manufacturer || 'N/A' },
    { label: 'Model', value: equipment.model || 'N/A' },
    { label: 'Serial Number', value: equipment.serialNumber || 'N/A' },
    { label: 'Calibration Point', value: equipment.calibrationPoint || 'N/A' },
    { label: 'Calibration Methods', value: equipment.calibrationMethods || 'N/A' },
    { label: 'Accessories', value: equipment.accessories || 'N/A' },
    { label: 'Machine Location', value: equipment.machineLocation || 'N/A' },
    { label: 'Remark', value: equipment.remark || 'N/A' },
  ];

  equipmentFields.forEach((field) => {
    const text = `${field.label}: ${field.value}`;
    const lines = pdf.splitTextToSize(text, contentWidth);
    lines.forEach((line: string) => {
      pdf.text(line, margin, currentY);
      currentY += 4;
    });
  });

  return currentY;
}

/**
 * Render table
 */
function renderTable(
  pdf: jsPDF,
  data: string[][],
  margin: number,
  startY: number,
  contentWidth: number,
  pageHeight: number
): number {
  if (data.length === 0) return startY;

  const rowHeight = 6;
  const headerHeight = 8;
  const colCount = data[0].length;
  const colWidth = contentWidth / colCount;

  let currentY = startY;
  const pageMargin = 20;

  // Header row
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);

  // Draw header background
  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, currentY - headerHeight + 2, contentWidth, headerHeight, 'F');

  // Draw header text with wrapping
  let maxHeaderLines = 1;
  const headerLines: string[][] = [];
  data[0].forEach((header, colIndex) => {
    const x = margin + (colIndex * colWidth);
    const text = pdf.splitTextToSize(header, colWidth - 2);
    headerLines.push(text);
    if (text.length > maxHeaderLines) {
      maxHeaderLines = text.length;
    }
  });
  
  // Adjust header height based on max lines
  const adjustedHeaderHeight = headerHeight + (maxHeaderLines - 1) * 4;
  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, currentY - headerHeight + 2, contentWidth, adjustedHeaderHeight, 'F');
  
  // Draw all header lines
  headerLines.forEach((lines, colIndex) => {
    const x = margin + (colIndex * colWidth);
    lines.forEach((line, lineIndex) => {
      pdf.text(line, x + 1, currentY + (lineIndex * 4));
    });
  });

  currentY += adjustedHeaderHeight + 2;

  // Data rows
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);

  for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
    // Calculate wrapped text for all cells in this row
    const cellLines: string[][] = [];
    let maxCellLines = 1;
    
    data[rowIndex].forEach((cellValue, colIndex) => {
      const x = margin + (colIndex * colWidth);
      const text = pdf.splitTextToSize(cellValue || '', colWidth - 2);
      cellLines.push(text);
      if (text.length > maxCellLines) {
        maxCellLines = text.length;
      }
    });
    
    // Calculate dynamic row height based on max lines
    const dynamicRowHeight = rowHeight + (maxCellLines - 1) * 4;
    
    // Check if we need a new page
    if (currentY + dynamicRowHeight > pageHeight - pageMargin) {
      pdf.addPage();
      currentY = margin + adjustedHeaderHeight + 2;
      
      // Redraw header on new page
      pdf.setFont('helvetica', 'bold');
      pdf.setFillColor(240, 240, 240);
      pdf.rect(margin, currentY - headerHeight + 2, contentWidth, adjustedHeaderHeight, 'F');
      
      headerLines.forEach((lines, colIndex) => {
        const x = margin + (colIndex * colWidth);
        lines.forEach((line, lineIndex) => {
          pdf.text(line, x + 1, currentY + (lineIndex * 4));
        });
      });
      
      currentY += adjustedHeaderHeight + 2;
      pdf.setFont('helvetica', 'normal');
    }

    // Draw row border
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, currentY - rowHeight + 2, margin + contentWidth, currentY - rowHeight + 2);

    // Draw cell data with all wrapped lines
    cellLines.forEach((lines, colIndex) => {
      const x = margin + (colIndex * colWidth);
      lines.forEach((line, lineIndex) => {
        pdf.text(line, x + 1, currentY + (lineIndex * 4));
      });
    });

    currentY += dynamicRowHeight;
  }

  // Draw table borders
  pdf.setDrawColor(0, 0, 0);
  pdf.rect(margin, startY - headerHeight + 2, contentWidth, currentY - startY + headerHeight - 2);

  return currentY;
}
