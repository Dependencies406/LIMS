// Job Status Options
export const JOB_STATUS_OPTIONS = [
  'Pending',
  'In Progress',
  'Completed',
  'Halt'
] as const;

// Item Details Table Columns
export const EQUIPMENT_COLUMNS = [
  { key: 'no', label: 'No.', defaultVisible: true },
  { key: 'name', label: 'Name', defaultVisible: true },
  { key: 'manufacturer', label: 'Manufacturer', defaultVisible: true },
  { key: 'model', label: 'Model', defaultVisible: true },
  { key: 'serialNumber', label: 'Serial Number', defaultVisible: true },
  { key: 'calibrationPoint', label: 'Calibration Point', defaultVisible: true },
  { key: 'calibrationMethods', label: 'Calibration Methods', defaultVisible: true },
  { key: 'accessories', label: 'Accessories', defaultVisible: true },
  { key: 'machineLocation', label: 'Machine Location', defaultVisible: true },
  { key: 'remark', label: 'Remark', defaultVisible: true }
] as const;

// PDF Settings Version (increment when structure changes)
export const PDF_SETTINGS_VERSION = 3;

// Header/Footer Preset Options
export const HEADER_FOOTER_PRESETS = [
  { value: '', label: 'None (Empty)' },
  { value: '{company_logo}', label: 'Company Logo' },
  { value: '{company_name}', label: 'Company Name' },
  { value: '{company_address}', label: 'Company Address' },
  { value: '{company_phone}', label: 'Company Phone' },
  { value: '{company_email}', label: 'Company Email' },
  { value: '{company_website}', label: 'Company Website' },
  { value: '{page_number}', label: 'Page Number (e.g., Page 1 of 3)' },
  { value: '{date}', label: 'Current Date' },
  { value: '{job_id}', label: 'Job ID' },
  { value: 'custom', label: 'Custom Text' },
] as const;

// Default PDF Settings
export const DEFAULT_PDF_SETTINGS = {
  version: PDF_SETTINGS_VERSION,
  templateName: 'Standard Service Request',
  pageSize: 'A4' as const,
  orientation: 'portrait' as const,
  layout: 'traditional' as const,
  fontSize: {
    title: 16,
    heading: 12,
    body: 10,
    small: 8,
    header: 10,
    footer: 9
  },
  margin: {
    top: 40,
    right: 40,
    bottom: 40,
    left: 40
  },
  fieldVisibility: {},
  jobTableColumns: {
    jobId: true,
    title: true,
    customer: true,
    status: true,
    equipment: true,
    scheduleDate: true, // Updated from dueDate
    created: true,
    assignedStaff: true,
    startDate: true
  },
  equipmentTableColumns: {
    no: true,
    name: true,
    manufacturer: true,
    model: true,
    serialNumber: true,
    calibrationPoint: true,
    calibrationMethods: true,
    accessories: true,
    machineLocation: true,
    remark: true
  },
  serviceInformationVisibility: {
    serviceRequested: true,
    reportingFormat: true,
    statementOfConformity: true,
    statementOfConformityRequirements: true
  },
  workAuthorizationVisibility: {
    workAuthorizationStatement: true,
    customerSignature: true,
    itemsConditionOnReceipt: true,
    laboratoryCapabilityAssessment: true,
    staffSignature: true
  },
  workAuthorizationStatement: 'I confirm that the information provided is correct and authorize the laboratory to proceed with the requested services according to the laboratory\'s terms and conditions. I understand that any deviations from the request must be communicated and approved before proceeding.',
  sectionHeaders: {
    jobInformation: 'Job Information',
    serviceInformation: 'Service Information',
    workAuthorization: 'Work Authorization',
    equipment: 'Item Details',
    comments: 'Comments'
  },
  showLogo: true, // Keep for backward compatibility
  showHeader: true,
  showFooter: true,
  showTableBorders: true,
  logoSize: {
    maxHeight: 40,  // in pixels
    maxWidth: 150   // in pixels
  },
  headerContent: {
    left: '{company_logo}',
    center: 'Service Request',
    right: '{page_number}'
  },
  footerContent: {
    left: '{date}',
    center: 'Confidential Document',
    right: '{company_website}'
  }
};

