// User Types
export interface User {
  uid: string;
  email: string;
  displayName?: string;
  firstName: string;
  lastName: string;
  position?: string;
  /**
   * The user's role identifier.
   * Built-in values: 'admin' | 'staff'.
   * Custom roles are stored as their Firestore `roles/{id}` document ID (any string).
   * Use `isAdmin` from AuthContext for the privileged-admin fast-path check;
   * use `usePermission(action)` for granular feature gating.
   */
  role: string;
  lastLogin?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  isActive?: boolean;
}

// Item Details Types
export interface Equipment {
  no?: number;
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  calibrationPoint: string;
  calibrationMethods: string;
  accessories: string;
  machineLocation: string;
  remark: string;
}

// Customer Types
export interface Customer {
  id: string;
  customerCode: string;
  name: string;
  contact: string;
  address: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// File Attachment Types
export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: Date;
  uploadedBy: string;
}

// Service Information Types
export interface ServiceInformation {
  serviceRequested: 'Calibration' | string; // Allow for future services
  reportingFormat: 'Standard' | 'Simplified Report' | 'Electronic File' | 'Other';
  reportingFormatOther?: string; // Text input when "Other" is selected
  statementOfConformity: 'Required' | 'Not required';
  statementOfConformityRequirements?: string; // Text input when "Required" is selected
}

// Digital Signature Types
export interface DigitalSignature {
  signatureData: string; // Base64 encoded signature image
  signerName: string;
  signedDate: Date;
}

// Work Authorization Types
export interface WorkAuthorization {
  // Customer Authorization
  workAuthorizationStatement: string; // Editable text for authorization statement
  customerSignature?: DigitalSignature;
  
  // Request Review (Laboratory Use Only)
  itemsConditionOnReceipt: 'Acceptable' | 'Damaged or altered' | 'Improper storage/transportation conditions' | 'Insufficient quantity' | 'Other issues';
  itemsConditionSpecification?: string; // Text when specific conditions are selected
  
  laboratoryCapabilityAssessment: 'Full capability' | 'Partial capability' | 'Lacks capability';
  capabilitySpecification?: string; // Text when limitations are specified
  
  staffSignature?: DigitalSignature;
}

// Job Types
export interface Job {
  id: string;
  jobId: string;
  title: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Halt';
  customerCode: string;
  customerName?: string;
  customerAddress?: string;
  customerContact: string; // Contact person name (required)
  customerPhone?: string;
  customerEmail?: string;
  assignedStaff?: string;
  equipment: Equipment[];
  startDate?: string;
  scheduleDate?: string; // Renamed from dueDate
  comments?: string;
  serviceInformation?: ServiceInformation; // New service information section
  workAuthorization?: WorkAuthorization; // Work authorization section
  attachments?: FileAttachment[];
  signatures?: {
    customer?: string;
    staff?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// PDF Settings Types
export interface FieldVisibility {
  [key: string]: {
    visible: boolean;
    label?: string;
  };
}

export interface PdfSettings {
  version?: number;
  templateName: string;
  pageSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  layout: 'traditional' | 'grid';
  fontSize: {
    title: number;
    heading: number;
    body: number;
    small: number;
    header: number;
    footer: number;
  };
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  fieldVisibility: FieldVisibility;
  jobTableColumns: {
    jobId: boolean;
    title: boolean;
    customer: boolean;
    status: boolean;
    equipment: boolean;
    scheduleDate: boolean; // Renamed from dueDate
    created: boolean;
    assignedStaff: boolean;
    startDate: boolean;
  };
  equipmentTableColumns: {
    no: boolean;
    name: boolean;
    manufacturer: boolean;
    model: boolean;
    serialNumber: boolean;
    calibrationPoint: boolean;
    calibrationMethods: boolean;
    accessories: boolean;
    machineLocation: boolean;
    remark: boolean;
  };
  serviceInformationVisibility: {
    serviceRequested: boolean;
    reportingFormat: boolean;
    statementOfConformity: boolean;
    statementOfConformityRequirements: boolean;
  };
  workAuthorizationVisibility: {
    workAuthorizationStatement: boolean;
    customerSignature: boolean;
    itemsConditionOnReceipt: boolean;
    laboratoryCapabilityAssessment: boolean;
    staffSignature: boolean;
  };
  workAuthorizationStatement: string; // Editable authorization statement
  sectionHeaders: {
    jobInformation: string;
    serviceInformation: string;
    workAuthorization: string;
    equipment: string;
    comments: string;
  };
  showLogo: boolean;
  showHeader: boolean;
  showFooter: boolean;
  showTableBorders: boolean;
  logoSize: {
    maxHeight: number;
    maxWidth: number;
  };
  headerContent: {
    left: string;
    center: string;
    right: string;
  };
  footerContent: {
    left: string;
    center: string;
    right: string;
  };
}

// Modal Types
export type ModalType = 'JobFormModal' | 'CustomerModal' | 'CompleteJobModal' | 'SettingsModal';

// Toast Types
export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

// Job ID Settings Types
export interface JobIdSettings {
  organizationPrefix: string;  // e.g., "CPN"
  jobTypePrefix: string;       // e.g., "CAL"
  currentYear: number;         // e.g., 2025 (will show as "25")
  currentSequence: number;     // e.g., 1 (will show as "001")
  yearlyReset: boolean;        // Reset sequence on year change
}

// Company Information Types
export interface CompanyInfo {
  id: string;
  companyName: string;
  logoUrl?: string;
  logoFile?: File; // For file upload
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  contactInfo: {
    phone: string;
    email: string;
    website?: string;
    fax?: string;
  };
  additionalInfo?: {
    taxId?: string;
    registrationNumber?: string;
    businessLicense?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string;
}

// ─── Roles & Permissions ───────────────────────────────────────────────────

/**
 * All valid permission action strings used across the application.
 * Must stay in sync with ALL_PERMISSIONS in roleService.ts.
 */
export type PermissionAction =
  // Service Requests
  | 'serviceRequests.view'
  | 'serviceRequests.convert'
  | 'serviceRequests.cancel'
  | 'serviceRequests.delete'
  // Jobs
  | 'jobs.view'
  | 'jobs.create'
  | 'jobs.edit'
  | 'jobs.delete'
  | 'jobs.assign'
  | 'jobs.changeStatus'
  | 'jobs.export'
  | 'jobs.import'
  | 'jobs.generatePdf'
  | 'jobs.viewDeleted'
  // Customers
  | 'customers.view'
  | 'customers.create'
  | 'customers.edit'
  | 'customers.delete'
  | 'customers.export'
  // Documents Index
  | 'documentIndex.view'
  | 'documentIndex.manage'
  // Spreadsheet Templates
  | 'spreadsheetTemplates.view'
  | 'spreadsheetTemplates.create'
  | 'spreadsheetTemplates.edit'
  | 'spreadsheetTemplates.delete'
  | 'spreadsheetTemplates.duplicate'
  // PDF Templates
  | 'pdfTemplates.view'
  | 'pdfTemplates.create'
  | 'pdfTemplates.edit'
  | 'pdfTemplates.delete'
  | 'pdfTemplates.duplicate'
  // Users
  | 'users.view'
  | 'users.create'
  | 'users.edit'
  | 'users.delete'
  | 'users.activate'
  | 'users.deactivate'
  // Roles
  | 'roles.view'
  | 'roles.create'
  | 'roles.edit'
  | 'roles.delete'
  // Settings
  | 'settings.view'
  | 'settings.jobIdConfig'
  | 'settings.customerIdConfig'
  | 'settings.companyInfo'
  // Certificate Numbers
  | 'certificateNumbers.view'
  | 'certificateNumbers.edit'
  // Staff Performance
  | 'staffPerformance.view'
  | 'staffPerformance.viewOwn'
  | 'staffPerformance.exportLogs'
  // Equipment Control
  | 'equipmentControl.view'
  | 'equipmentControl.register'
  | 'equipmentControl.edit'
  | 'equipmentControl.approve'
  | 'equipmentControl.logUsage'
  | 'equipmentControl.calibrate'
  | 'equipmentControl.uploadDocuments'
  | 'equipmentControl.deleteDocuments'
  | 'equipmentControl.retire';

/** A role document as stored in Firestore `roles/{id}`. */
export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: PermissionAction[];
  /** True for built-in roles (admin, staff) that cannot be deleted. */
  isSystemRole: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/** Input shape for creating or updating a role. */
export interface RoleInput {
  name: string;
  description?: string;
  permissions: PermissionAction[];
}

// ─── Equipment Control Module Types ────────────────────────────────────────

export type EquipmentStatus =
  | 'active'
  | 'due_soon'
  | 'overdue'
  | 'calibration'
  | 'out_of_service'
  | 'pending'
  | 'retired';

export interface EquipmentRecord {
  id: string;                      // CAL-AAA-NNN
  name: string;
  category: string;                // AAA code, e.g. FRC, TMP
  manufacturer: string;
  model: string;
  serialNumber: string;
  location: string;
  status: EquipmentStatus;
  custodian: string;               // email
  custodianName?: string;
  authorizedUsers: string[];       // emails
  requiresCalibration: boolean;
  calibrationInterval?: number;    // months
  calibrationProcedure?: string;
  externalProvider: boolean;
  usagePeriodStart?: string;
  usagePeriodEnd?: string;
  registrationDate: string;        // ISO date
  lastCalibrationDate?: string;
  nextCalibrationDate?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface UsageLog {
  id: string;
  equipmentId: string;
  date: string;                    // ISO date
  operator: string;                // email
  operatorName: string;
  // Section B
  visualInspection: 'pass' | 'fail';
  functionalCheck: 'pass' | 'fail';
  documentCheck: 'valid' | 'expired' | 'na';
  refValuesVerified?: boolean;
  correctionValue?: string;
  // Section C
  equipmentCondition: 'normal' | 'abnormal';
  abnormalDetails?: string;
  actionTaken?: string;
  // Section D
  notes?: string;
  overallResult: 'pass' | 'fail';
  createdAt: Date;
}

export interface CalibrationEvent {
  id: string;
  equipmentId: string;
  sentDate: string;
  receivedDate?: string;
  calibrationLab: string;
  certificateNumber?: string;
  result?: 'pass' | 'fail';
  conditionBeforeSend?: string;
  conditionAfterReceive?: string;
  notes?: string;
  createdAt: Date;
  createdBy: string;
}

export interface EquipmentDocument {
  id: string;
  equipmentId: string;
  docType: 'verification' | 'registration' | 'spec_sheet' | 'certificate' | 'cal_plan' | 'retirement';
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: Date;
  uploadedBy: string;
}

// ─── end Equipment Control ──────────────────────────────────────────────────
