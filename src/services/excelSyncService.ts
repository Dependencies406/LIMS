/**
 * Excel Sync Service
 * Handles two-way synchronization between Excel files and job data
 * Supports export, import, and update operations
 */

import type { Job, Equipment, ServiceInformation, WorkAuthorization } from '../types';
import ExcelJS from 'exceljs';
import { jobService } from './jobService';

/**
 * Export jobs to Excel with sync capability
 * Creates an Excel file that can be edited and imported back
 */
export const exportJobsToSyncableExcel = async (): Promise<void> => {
  try {
    // Fetch all jobs from Firebase
    const jobs = await jobService.getAllJobs();
    
    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    
    // Add metadata sheet with instructions
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [
      { header: 'Instructions', key: 'instructions', width: 100 }
    ];
    
    const instructions = [
      'EXCEL SYNC INSTRUCTIONS',
      '',
      'This Excel file can be used to sync job information with the LIMS system.',
      '',
      'HOW TO USE:',
      '1. Edit job information in the "Jobs" sheet',
      '2. Edit equipment information in the "Equipment" sheet',
      '3. Save the file',
      '4. Use the Import function in the LIMS to sync changes back',
      '',
      'IMPORTANT NOTES:',
      '- Do NOT modify the "Job ID" column - it is used to match existing jobs',
      '- To create a new job, leave "Job ID" empty and fill in all required fields',
      '- Status values must be: Pending, In Progress, Completed, Halt, Superseded, or Void',
      '- Equipment rows must have a Job ID that matches a job in the Jobs sheet',
      '- Date format: YYYY-MM-DD (e.g., 2025-01-15)',
      '',
      'REQUIRED FIELDS FOR NEW JOBS:',
      '- Title',
      '- Status',
      '- Customer Code',
      '- Customer Contact',
      '- At least one Equipment entry',
      '',
      'SYNC BEHAVIOR:',
      '- Jobs with existing Job IDs will be UPDATED',
      '- Jobs without Job IDs will be CREATED',
      '- Equipment is matched by Job ID and will be REPLACED',
    ];
    
    instructions.forEach((instruction, index) => {
      const row = instructionsSheet.addRow({ instructions: instruction });
      if (index === 0) {
        row.font = { bold: true, size: 14 };
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' }
        };
        row.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      }
      row.height = 20;
    });
    
    // Freeze first row
    instructionsSheet.views = [{ state: 'frozen', ySplit: 1 }];
    
    // ===== JOBS SHEET =====
    const jobsSheet = workbook.addWorksheet('Jobs');
    
    jobsSheet.columns = [
      { header: 'Job ID', key: 'jobId', width: 20 },
      { header: 'Title', key: 'title', width: 35 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Customer Code', key: 'customerCode', width: 18 },
      { header: 'Customer Name', key: 'customerName', width: 30 },
      { header: 'Customer Address', key: 'customerAddress', width: 40 },
      { header: 'Customer Contact', key: 'customerContact', width: 25 },
      { header: 'Customer Phone', key: 'customerPhone', width: 18 },
      { header: 'Customer Email', key: 'customerEmail', width: 30 },
      { header: 'Assigned Staff', key: 'assignedStaff', width: 20 },
      { header: 'Start Date', key: 'startDate', width: 15 },
      { header: 'Appointment Date', key: 'appointmentDate', width: 18 },
      { header: 'PO Number', key: 'poNumber', width: 18 },
      { header: 'Comments', key: 'comments', width: 50 },
      { header: 'Certificate Number', key: 'certificateNumber', width: 20 },
      { header: 'Service Requested', key: 'serviceRequested', width: 20 },
      { header: 'SoC ref PDF URL', key: 'socRefPdfUrl', width: 40 },
      { header: 'Statement of Conformity', key: 'statementOfConformity', width: 25 },
      { header: 'Items Condition', key: 'itemsCondition', width: 25 },
      { header: 'Lab Capability', key: 'labCapability', width: 20 },
      { header: 'Created At', key: 'createdAt', width: 20 },
      { header: 'Created By', key: 'createdBy', width: 15 },
    ];
    
    // Style header row
    const headerRow = jobsSheet.getRow(1);
    headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 30;
    
    // Add job data
    jobs.forEach((job) => {
      jobsSheet.addRow({
        jobId: job.jobId,
        title: job.title,
        status: job.status,
        customerCode: job.customerCode,
        customerName: job.customerName || '',
        customerAddress: job.customerAddress || '',
        customerContact: job.customerContact || '',
        customerPhone: job.customerPhone || '',
        customerEmail: job.customerEmail || '',
        assignedStaff: job.assignedStaff || '',
        startDate: job.startDate || '',
        appointmentDate: job.appointmentDate || '',
        poNumber: job.poNumber || '',
        comments: job.comments || '',
        certificateNumber: job.certificateNumber || '',
        serviceRequested: job.serviceInformation?.serviceRequested || '',
        socRefPdfUrl: job.serviceInformation?.statementOfConformityReferencePdf?.url || '',
        statementOfConformity: job.serviceInformation?.statementOfConformity || '',
        itemsCondition: job.workAuthorization?.itemsConditionOnReceipt || '',
        labCapability: job.workAuthorization?.laboratoryCapabilityAssessment || '',
        createdAt: job.createdAt ? new Date(job.createdAt).toISOString().split('T')[0] : '',
        createdBy: job.createdBy || '',
      });
    });
    
    // Apply formatting to data rows
    jobsSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowNumber % 2 === 0 ? 'FFF2F2F2' : 'FFFFFFFF' }
        };
        row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        row.height = 20;
      }
    });
    
    // Add borders
    jobsSheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
    
    // Freeze header row
    jobsSheet.views = [{ state: 'frozen', ySplit: 1 }];
    
    // Add data validation for Status column
    const statusColumn = jobsSheet.getColumn('status');
    statusColumn.eachCell((cell, rowNumber) => {
      if (rowNumber > 1) {
        // Add dropdown validation (Excel will show this when opened)
        cell.dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: ['"Pending,In Progress,Completed,Halt,Superseded,Void"']
        };
      }
    });
    
    // ===== EQUIPMENT SHEET =====
    const equipmentSheet = workbook.addWorksheet('Equipment');
    
    equipmentSheet.columns = [
      { header: 'Job ID', key: 'jobId', width: 20 },
      { header: 'No.', key: 'no', width: 8 },
      { header: 'Equipment Name', key: 'name', width: 30 },
      { header: 'Manufacturer', key: 'manufacturer', width: 25 },
      { header: 'Model', key: 'model', width: 25 },
      { header: 'Serial Number', key: 'serialNumber', width: 20 },
      { header: 'Calibration Point', key: 'calibrationPoint', width: 25 },
      { header: 'Calibration Methods', key: 'calibrationMethods', width: 30 },
      { header: 'Accessories', key: 'accessories', width: 25 },
      { header: 'Machine Location', key: 'machineLocation', width: 25 },
      { header: 'Remark', key: 'remark', width: 40 },
    ];
    
    // Style equipment header row
    const equipmentHeaderRow = equipmentSheet.getRow(1);
    equipmentHeaderRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    equipmentHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF70AD47' }
    };
    equipmentHeaderRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    equipmentHeaderRow.height = 30;
    
    // Add equipment data
    jobs.forEach((job) => {
      if (job.equipment && job.equipment.length > 0) {
        job.equipment.forEach((eq, index) => {
          equipmentSheet.addRow({
            jobId: job.jobId,
            no: eq.no || index + 1,
            name: eq.name,
            manufacturer: eq.manufacturer,
            model: eq.model,
            serialNumber: eq.serialNumber,
            calibrationPoint: eq.calibrationPoint,
            calibrationMethods: eq.calibrationMethods,
            accessories: eq.accessories,
            machineLocation: eq.machineLocation,
            remark: eq.remark,
          });
        });
      }
    });
    
    // Apply formatting to equipment sheet
    equipmentSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowNumber % 2 === 0 ? 'FFE2EFDA' : 'FFFFFFFF' }
        };
        row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        row.height = 20;
      }
    });
    
    // Add borders to equipment sheet
    equipmentSheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
    
    // Freeze header row
    equipmentSheet.views = [{ state: 'frozen', ySplit: 1 }];
    
    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Create blob and download
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jobs_sync_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Error exporting jobs to syncable Excel:', error);
    throw new Error('Failed to export jobs to Excel. Please try again.');
  }
};

/**
 * Import jobs from Excel file and sync with database
 * @param file Excel file to import
 * @param userId User ID performing the import
 * @returns Import result with statistics
 */
export const importJobsFromExcel = async (
  file: File,
  userId: string
): Promise<{
  success: boolean;
  created: number;
  updated: number;
  errors: string[];
  warnings: string[];
}> => {
  const result = {
    success: true,
    created: 0,
    updated: 0,
    errors: [] as string[],
    warnings: [] as string[],
  };
  
  try {
    const workbook = new ExcelJS.Workbook();
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer);
    
    // Get Jobs sheet
    const jobsSheet = workbook.getWorksheet('Jobs');
    if (!jobsSheet) {
      throw new Error('Jobs sheet not found in Excel file');
    }
    
    // Get Equipment sheet
    const equipmentSheet = workbook.getWorksheet('Equipment');
    if (!equipmentSheet) {
      result.warnings.push('Equipment sheet not found. Equipment data will not be imported.');
    }
    
    // Read all existing jobs to check for duplicates
    const existingJobs = await jobService.getAllJobs(true); // Include deleted to check
    const existingJobMap = new Map<string, Job>();
    existingJobs.forEach(job => {
      existingJobMap.set(job.jobId, job);
    });
    
    // Process Jobs sheet
    const jobRows: any[] = [];
    jobsSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      
      const jobData: any = {};
      row.eachCell((cell, colNumber) => {
        const headerCell = jobsSheet.getRow(1).getCell(colNumber);
        const header = headerCell.value?.toString() || '';
        const value = cell.value?.toString()?.trim() || '';
        
        if (header && value) {
          // Map Excel headers to job properties
          switch (header) {
            case 'Job ID':
              jobData.jobId = value;
              break;
            case 'Title':
              jobData.title = value;
              break;
            case 'Status':
              jobData.status = value;
              break;
            case 'Customer Code':
              jobData.customerCode = value;
              break;
            case 'Customer Name':
              jobData.customerName = value;
              break;
            case 'Customer Address':
              jobData.customerAddress = value;
              break;
            case 'Customer Contact':
              jobData.customerContact = value;
              break;
            case 'Customer Phone':
              jobData.customerPhone = value;
              break;
            case 'Customer Email':
              jobData.customerEmail = value;
              break;
            case 'Assigned Staff':
              jobData.assignedStaff = value;
              break;
            case 'Start Date':
              jobData.startDate = value;
              break;
            case 'Appointment Date':
              jobData.appointmentDate = value;
              break;
            // Back-compat: older spreadsheets used Schedule Date
            case 'Schedule Date':
              jobData.appointmentDate = value;
              break;
            case 'PO Number':
              jobData.poNumber = value;
              break;
            case 'Comments':
              jobData.comments = value;
              break;
            case 'Certificate Number':
              jobData.certificateNumber = value;
              break;
            case 'Service Requested':
              jobData.serviceRequested = value;
              break;
            case 'Statement of Conformity':
              jobData.statementOfConformity = value;
              break;
            case 'Items Condition':
              jobData.itemsCondition = value;
              break;
            case 'Lab Capability':
              jobData.labCapability = value;
              break;
          }
        }
      });
      
      // Only process rows with at least title and status
      if (jobData.title && jobData.status) {
        jobRows.push(jobData);
      }
    });
    
    // Process Equipment sheet and group by Job ID
    const equipmentByJobId = new Map<string, Equipment[]>();
    if (equipmentSheet) {
      equipmentSheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        
        const equipmentData: any = {};
        row.eachCell((cell, colNumber) => {
          const headerCell = equipmentSheet.getRow(1).getCell(colNumber);
          const header = headerCell.value?.toString() || '';
          const value = cell.value?.toString()?.trim() || '';
          
          if (header && value) {
            switch (header) {
              case 'Job ID':
                equipmentData.jobId = value;
                break;
              case 'No.':
                equipmentData.no = parseInt(value) || undefined;
                break;
              case 'Equipment Name':
                equipmentData.name = value;
                break;
              case 'Manufacturer':
                equipmentData.manufacturer = value;
                break;
              case 'Model':
                equipmentData.model = value;
                break;
              case 'Serial Number':
                equipmentData.serialNumber = value;
                break;
              case 'Calibration Point':
                equipmentData.calibrationPoint = value;
                break;
              case 'Calibration Methods':
                equipmentData.calibrationMethods = value;
                break;
              case 'Accessories':
                equipmentData.accessories = value;
                break;
              case 'Machine Location':
                equipmentData.machineLocation = value;
                break;
              case 'Remark':
                equipmentData.remark = value;
                break;
            }
          }
        });
        
        if (equipmentData.jobId && (equipmentData.name || equipmentData.model)) {
          const { jobId, ...equipment } = equipmentData;
          if (!equipmentByJobId.has(jobId)) {
            equipmentByJobId.set(jobId, []);
          }
          equipmentByJobId.get(jobId)!.push(equipment as Equipment);
        }
      });
    }
    
    // Process each job
    for (const jobData of jobRows) {
      try {
        // Validate required fields
        if (!jobData.title) {
          result.errors.push(`Row ${jobRows.indexOf(jobData) + 2}: Title is required`);
          continue;
        }
        
        if (!jobData.status) {
          result.errors.push(`Row ${jobRows.indexOf(jobData) + 2}: Status is required`);
          continue;
        }
        
        if (!jobData.customerCode) {
          result.errors.push(`Row ${jobRows.indexOf(jobData) + 2}: Customer Code is required`);
          continue;
        }
        
        // Validate status
        const validStatuses = ['Pending', 'In Progress', 'Completed', 'Halt', 'Superseded', 'Void'];
        if (!validStatuses.includes(jobData.status)) {
          result.errors.push(`Row ${jobRows.indexOf(jobData) + 2}: Invalid status "${jobData.status}". Must be one of: ${validStatuses.join(', ')}`);
          continue;
        }
        
        // Get equipment for this job
        const equipment = equipmentByJobId.get(jobData.jobId || '') || [];
        
        // If no equipment in Excel but job has jobId, try to preserve existing equipment
        if (equipment.length === 0 && jobData.jobId) {
          const existingJob = existingJobMap.get(jobData.jobId);
          if (existingJob && existingJob.equipment && existingJob.equipment.length > 0) {
            result.warnings.push(`Job ${jobData.jobId}: No equipment in Excel, preserving existing equipment`);
          }
        }
        
        // Build service information
        const serviceInformation: ServiceInformation | undefined = 
          (jobData.serviceRequested || jobData.statementOfConformity) ? {
            serviceRequested: jobData.serviceRequested || 'Calibration',
            statementOfConformity: (jobData.statementOfConformity as any) || 'Not required',
            statementOfConformityRequirements: jobData.statementOfConformityRequirements,
          } : undefined;
        
        // Build work authorization
        const workAuthorization: WorkAuthorization | undefined =
          (jobData.itemsCondition || jobData.labCapability) ? {
            workAuthorizationStatement: jobData.workAuthorizationStatement || '',
            itemsConditionOnReceipt: (jobData.itemsCondition as any) || 'Acceptable',
            itemsConditionSpecification: jobData.itemsConditionSpecification,
            laboratoryCapabilityAssessment: (jobData.labCapability as any) || 'Full capability',
            capabilitySpecification: jobData.capabilitySpecification,
          } : undefined;
        
        if (jobData.jobId && existingJobMap.has(jobData.jobId)) {
          // Update existing job
          const existingJob = existingJobMap.get(jobData.jobId)!;
          
          await jobService.updateJob(existingJob.id, {
            jobId: jobData.jobId,
            title: jobData.title,
            status: jobData.status as Job['status'],
            customerCode: jobData.customerCode,
            customerContact: jobData.customerContact || existingJob.customerContact,
            assignedStaff: jobData.assignedStaff || existingJob.assignedStaff,
            equipment: equipment.length > 0 ? equipment : existingJob.equipment,
            receivedDate: jobData.startDate || existingJob.receivedDate || existingJob.startDate,
            appointmentDate:
              jobData.appointmentDate ||
              existingJob.appointmentDate ||
              (existingJob as any).scheduleDate,
            comments: jobData.comments || existingJob.comments,
          });
          
          // Update additional fields if needed
          const updateData: any = {};
          if (jobData.customerName !== undefined) updateData.customerName = jobData.customerName;
          if (jobData.customerAddress !== undefined) updateData.customerAddress = jobData.customerAddress;
          if (jobData.customerPhone !== undefined) updateData.customerPhone = jobData.customerPhone;
          if (jobData.customerEmail !== undefined) updateData.customerEmail = jobData.customerEmail;
          if (jobData.certificateNumber !== undefined) updateData.certificateNumber = jobData.certificateNumber;
          if (jobData.poNumber !== undefined) updateData.poNumber = jobData.poNumber;
          if (serviceInformation) updateData.serviceInformation = serviceInformation;
          if (workAuthorization) updateData.workAuthorization = workAuthorization;
          
          if (Object.keys(updateData).length > 0) {
            await jobService.updateJob(existingJob.id, updateData);
          }
          
          result.updated++;
        } else {
          // Create new job
          if (equipment.length === 0) {
            result.errors.push(`Row ${jobRows.indexOf(jobData) + 2}: At least one equipment entry is required for new jobs`);
            continue;
          }
          
          // Generate job ID if not provided
          const newJobId = jobData.jobId || jobService.generateJobId();
          
          // Prepare additional fields to include in update after creation
          const additionalFields: any = {};
          if (jobData.customerName) additionalFields.customerName = jobData.customerName;
          if (jobData.customerAddress) additionalFields.customerAddress = jobData.customerAddress;
          if (jobData.customerPhone) additionalFields.customerPhone = jobData.customerPhone;
          if (jobData.customerEmail) additionalFields.customerEmail = jobData.customerEmail;
          if (jobData.certificateNumber) additionalFields.certificateNumber = jobData.certificateNumber;
          if (jobData.poNumber) additionalFields.poNumber = jobData.poNumber;
          if (serviceInformation) additionalFields.serviceInformation = serviceInformation;
          if (workAuthorization) additionalFields.workAuthorization = workAuthorization;
          
          // Create the job
          const newJobDocId = await jobService.createJob({
            jobId: newJobId,
            title: jobData.title,
            status: jobData.status as Job['status'],
            customerCode: jobData.customerCode,
            customerContact: jobData.customerContact || '',
            assignedStaff: jobData.assignedStaff,
            equipment: equipment,
            receivedDate: jobData.startDate,
            appointmentDate: jobData.appointmentDate,
            comments: jobData.comments,
          }, userId);
          
          // Update additional fields after creation
          if (Object.keys(additionalFields).length > 0) {
            await jobService.updateJob(newJobDocId, additionalFields);
          }
          
          result.created++;
        }
      } catch (error: any) {
        result.errors.push(`Row ${jobRows.indexOf(jobData) + 2}: ${error.message || 'Unknown error'}`);
        result.success = false;
      }
    }
    
    return result;
  } catch (error: any) {
    result.success = false;
    result.errors.push(`Import failed: ${error.message || 'Unknown error'}`);
    return result;
  }
};

/**
 * Excel Sync Service
 */
export const excelSyncService = {
  exportJobsToSyncableExcel,
  importJobsFromExcel,
};

