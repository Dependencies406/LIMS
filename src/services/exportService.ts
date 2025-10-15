/**
 * Export Service
 * Handles data export to various formats (CSV, Excel, JSON)
 */

import type { Job, Customer, Equipment } from '../types';

/**
 * Convert data to CSV format
 */
const convertToCSV = (data: any[], headers: string[]): string => {
  const csvRows = [];
  
  // Add headers
  csvRows.push(headers.join(','));
  
  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      
      // Handle special characters and escape quotes
      if (value === null || value === undefined) return '';
      
      const stringValue = String(value);
      
      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      
      return stringValue;
    });
    
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
};

/**
 * Download a file
 */
const downloadFile = (content: string, filename: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Export jobs to CSV
 */
export const exportJobsToCSV = (jobs: Job[]): void => {
  const headers = [
    'jobId',
    'title',
    'status',
    'customerCode',
    'customerContact',
    'assignedStaff',
    'equipmentCount',
    'startDate',
    'scheduleDate',
    'scheduleDate',
    'comments',
    'createdAt',
    'createdBy',
  ];
  
  const data = jobs.map(job => ({
    jobId: job.jobId,
    title: job.title,
    status: job.status,
    customerCode: job.customerCode,
    customerContact: job.customerContact || '',
    assignedStaff: job.assignedStaff || '',
    equipmentCount: job.equipment?.length || 0,
    startDate: job.startDate || '',
    scheduleDate: job.scheduleDate || '',
    comments: job.comments || '',
    createdAt: new Date(job.createdAt).toLocaleDateString('en-GB'),
    createdBy: job.createdBy,
  }));
  
  const csv = convertToCSV(data, headers);
  const filename = `jobs_export_${new Date().toISOString().split('T')[0]}.csv`;
  downloadFile(csv, filename, 'text/csv;charset=utf-8;');
};

/**
 * Export customers to CSV
 */
export const exportCustomersToCSV = (customers: Customer[]): void => {
  const headers = [
    'customerCode',
    'name',
    'contact',
    'email',
    'phone',
    'address',
    'createdAt',
  ];
  
  const data = customers.map(customer => ({
    customerCode: customer.customerCode,
    name: customer.name,
    contact: customer.contact,
    email: customer.email || '',
    phone: customer.phone || '',
    address: customer.address || '',
    createdAt: new Date(customer.createdAt).toLocaleDateString('en-GB'),
  }));
  
  const csv = convertToCSV(data, headers);
  const filename = `customers_export_${new Date().toISOString().split('T')[0]}.csv`;
  downloadFile(csv, filename, 'text/csv;charset=utf-8;');
};

/**
 * Export equipment list to CSV
 */
export const exportEquipmentToCSV = (equipment: Equipment[], jobId: string): void => {
  const headers = [
    'no',
    'name',
    'manufacturer',
    'model',
    'serialNumber',
    'calibrationPoint',
    'calibrationMethods',
    'accessories',
    'machineLocation',
    'remark',
  ];
  
  const data = equipment.map((eq, index) => ({
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
  }));
  
  const csv = convertToCSV(data, headers);
  const filename = `equipment_${jobId}_${new Date().toISOString().split('T')[0]}.csv`;
  downloadFile(csv, filename, 'text/csv;charset=utf-8;');
};

/**
 * Export job with equipment to detailed CSV
 */
export const exportJobDetailsToCSV = (job: Job): void => {
  const lines: string[] = [];
  
  // Job Information
  lines.push('JOB INFORMATION');
  lines.push('Field,Value');
  lines.push(`Job ID,${job.jobId}`);
  lines.push(`Title,${job.title}`);
  lines.push(`Status,${job.status}`);
  lines.push(`Customer Code,${job.customerCode}`);
  lines.push(`Customer Contact,${job.customerContact || 'N/A'}`);
  lines.push(`Assigned Staff,${job.assignedStaff || 'Unassigned'}`);
  lines.push(`Start Date,${job.startDate || 'Not set'}`);
  lines.push(`Due Date,${job.scheduleDate || 'Not set'}`);
  lines.push(`End Date,${job.scheduleDate || 'Not completed'}`);
  lines.push(`Created At,${new Date(job.createdAt).toLocaleString()}`);
  lines.push(`Created By,${job.createdBy}`);
  lines.push('');
  
  // Comments
  if (job.comments) {
    lines.push('COMMENTS');
    lines.push(`"${job.comments.replace(/"/g, '""')}"`);
    lines.push('');
  }
  
  // Equipment List
  if (job.equipment && job.equipment.length > 0) {
    lines.push('EQUIPMENT LIST');
    const equipmentHeaders = [
      'No',
      'Name',
      'Manufacturer',
      'Model',
      'Serial Number',
      'Calibration Point',
      'Calibration Methods',
      'Accessories',
      'Machine Location',
      'Remark',
    ];
    lines.push(equipmentHeaders.join(','));
    
    for (const [index, eq] of job.equipment.entries()) {
      const values = [
        eq.no || index + 1,
        eq.name,
        eq.manufacturer,
        eq.model,
        eq.serialNumber,
        eq.calibrationPoint,
        eq.calibrationMethods,
        eq.accessories,
        eq.machineLocation,
        eq.remark,
      ].map(val => {
        const stringValue = String(val || '');
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      
      lines.push(values.join(','));
    }
  }
  
  const csv = lines.join('\n');
  const filename = `job_${job.jobId}_details_${new Date().toISOString().split('T')[0]}.csv`;
  downloadFile(csv, filename, 'text/csv;charset=utf-8;');
};

/**
 * Export data to JSON
 */
export const exportToJSON = (data: any, filename: string): void => {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, filename, 'application/json');
};

/**
 * Generate summary report
 */
export const generateSummaryReport = (jobs: Job[]): string => {
  const totalJobs = jobs.length;
  const pendingJobs = jobs.filter(j => j.status === 'Pending').length;
  const inProgressJobs = jobs.filter(j => j.status === 'In Progress').length;
  const completedJobs = jobs.filter(j => j.status === 'Completed').length;
  
  const totalEquipment = jobs.reduce((sum, job) => sum + (job.equipment?.length || 0), 0);
  const avgEquipmentPerJob = totalJobs > 0 ? (totalEquipment / totalJobs).toFixed(1) : 0;
  
  // Count unique customers
  const uniqueCustomers = new Set(jobs.map(j => j.customerCode)).size;
  
  // Jobs by staff
  const staffJobCount: { [key: string]: number } = {};
  jobs.forEach(job => {
    const staff = job.assignedStaff || 'Unassigned';
    staffJobCount[staff] = (staffJobCount[staff] || 0) + 1;
  });
  
  const report = `
LIMS SUMMARY REPORT
Generated on: ${new Date().toLocaleString()}

═══════════════════════════════════════════════

JOB STATISTICS
═══════════════════════════════════════════════
Total Jobs: ${totalJobs}
Pending: ${pendingJobs}
In Progress: ${inProgressJobs}
Completed: ${completedJobs}

═══════════════════════════════════════════════

EQUIPMENT STATISTICS
═══════════════════════════════════════════════
Total Equipment Items: ${totalEquipment}
Average per Job: ${avgEquipmentPerJob}

═══════════════════════════════════════════════

CUSTOMER STATISTICS
═══════════════════════════════════════════════
Unique Customers: ${uniqueCustomers}

═══════════════════════════════════════════════

JOBS BY STAFF
═══════════════════════════════════════════════
${Object.entries(staffJobCount)
    .sort((a, b) => b[1] - a[1])
    .map(([staff, count]) => `${staff}: ${count}`)
    .join('\n')}

═══════════════════════════════════════════════
`.trim();
  
  return report;
};

/**
 * Export summary report to text file
 */
export const exportSummaryReport = (jobs: Job[]): void => {
  const report = generateSummaryReport(jobs);
  const filename = `lims_summary_report_${new Date().toISOString().split('T')[0]}.txt`;
  downloadFile(report, filename, 'text/plain;charset=utf-8;');
};

/**
 * Export service
 */
export const exportService = {
  exportJobsToCSV,
  exportCustomersToCSV,
  exportEquipmentToCSV,
  exportJobDetailsToCSV,
  exportToJSON,
  generateSummaryReport,
  exportSummaryReport,
};

