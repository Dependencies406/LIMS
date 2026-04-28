// ─── User & Role Types ────────────────────────────────────────────────────────

export type PermissionAction =
  | 'serviceRequests.view' | 'serviceRequests.convert' | 'serviceRequests.cancel' | 'serviceRequests.delete'
  | 'jobs.view' | 'jobs.create' | 'jobs.edit' | 'jobs.delete' | 'jobs.assign'
  | 'jobs.changeStatus' | 'jobs.export' | 'jobs.import' | 'jobs.generatePdf' | 'jobs.viewDeleted'
  | 'customers.view' | 'customers.create' | 'customers.edit' | 'customers.delete' | 'customers.export'
  | 'documentIndex.view' | 'documentIndex.manage'
  | 'spreadsheetTemplates.view' | 'spreadsheetTemplates.create' | 'spreadsheetTemplates.edit'
  | 'spreadsheetTemplates.delete' | 'spreadsheetTemplates.duplicate'
  | 'pdfTemplates.view' | 'pdfTemplates.create' | 'pdfTemplates.edit'
  | 'pdfTemplates.delete' | 'pdfTemplates.duplicate'
  | 'users.view' | 'users.create' | 'users.edit' | 'users.delete' | 'users.activate' | 'users.deactivate'
  | 'roles.view' | 'roles.create' | 'roles.edit' | 'roles.delete'
  | 'settings.view' | 'settings.jobIdConfig' | 'settings.customerIdConfig'
  | 'settings.companyInfo'
  | 'certificateNumbers.view' | 'certificateNumbers.edit'
  | 'staffPerformance.view' | 'staffPerformance.viewOwn' | 'staffPerformance.exportLogs';

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: PermissionAction[];
  isSystemRole?: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export type RoleInput = Omit<Role, 'id' | 'createdAt' | 'updatedAt'>;

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  firstName: string;
  lastName: string;
  position?: string;
  role: string; // 'admin' | custom role id
  lastLogin?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  isActive?: boolean;
  avatarUrl?: string;
  trainingLogs?: unknown[];
  documents?: unknown[];
}

// ─── Equipment & Spreadsheet Types ───────────────────────────────────────────

export interface EquipmentAttachment {
  id: string;
  /** Original file name (as uploaded). */
  fileName: string;
  /** MIME type (e.g. 'application/pdf', 'image/jpeg'). */
  fileType: string;
  /** File size in bytes. */
  fileSize: number;
  /** Firebase Storage download URL. */
  downloadURL: string;
  /** Firebase Storage path (used for deletion). */
  storagePath: string;
  uploadedAt: Date;
  uploadedBy: string;
  category?: 'calibration_certificate' | 'photo' | 'datasheet' | 'other';
}

export interface EquipmentSpreadsheetData {
  templateId?: string;
  templateName?: string;
  hotData?: unknown[][];
  colHeaders?: string[];
  rowHeaders?: string[];
  mergeCells?: unknown[];
  customRenderers?: unknown[];
  formulaResults?: Record<string, unknown>;
  lastModified?: string;
  [key: string]: unknown;
}

export interface Equipment {
  no?: number;
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  /** Customer asset tag / internal ID (separate from serial number). */
  assetTag?: string;
  calibrationPoint: string;
  calibrationMethods: string;
  accessories: string;
  machineLocation: string;
  remark: string;
  calibrationDate?: string;
  unit?: string;
  resolution?: string;
  certificateNumber?: string;
  spreadsheetData?: EquipmentSpreadsheetData;
  attachments?: EquipmentAttachment[];
}

// ─── Customer Types ───────────────────────────────────────────────────────────

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

// ─── File Attachment Types ────────────────────────────────────────────────────

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: Date;
  uploadedBy: string;
}

// ─── Service Information Types ────────────────────────────────────────────────

export interface ServiceInformation {
  serviceRequested: 'Calibration' | string;
  statementOfConformity: 'Required' | 'Not required';
  statementOfConformityRequirements?: string;
  /** Customer-specified decision rule (required when Statement of Conformity is Required). */
  decisionRule?: string;
  /** Optional uploaded PDF (e.g. signed paper or reference) for statement of conformity */
  statementOfConformityReferencePdf?: FileAttachment;
}

// ─── Digital Signature Types ──────────────────────────────────────────────────

export interface DigitalSignature {
  signatureData: string;
  signerName: string;
  signedDate: Date;
}

// ─── Work Authorization Types ─────────────────────────────────────────────────

export interface WorkAuthorization {
  workAuthorizationStatement: string;
  customerSignature?: DigitalSignature;
  itemsConditionOnReceipt: 'Acceptable' | 'Damaged or altered' | 'Improper storage/transportation conditions' | 'Insufficient quantity' | 'Other issues';
  itemsConditionSpecification?: string;
  laboratoryCapabilityAssessment: 'Full capability' | 'Partial capability' | 'Lacks capability';
  capabilitySpecification?: string;
  /** Paper-style checklist (Laboratory use only) */
  preWorkChecklist?: {
    capabilityResourcesAvailable?: boolean;
    methodAppropriateValidatedUpToDate?: boolean;
    equipmentConditionChecked?: boolean;
    customerRequirementsUnderstood?: boolean;
  };
  staffSignature?: DigitalSignature;
  /** Laboratory technical review (separate from received-by / staff intake signature) */
  technicalReviewerSignature?: DigitalSignature;
}

// ─── Job Types ────────────────────────────────────────────────────────────────

export type JobStatus = 'Pending' | 'Proceeding' | 'In Progress' | 'Completed' | 'Halt' | 'Superseded' | 'Void';

export interface Job {
  id: string;
  jobId: string;
  title: string;
  status: JobStatus;
  customerCode: string;
  customerName?: string;
  customerAddress?: string;
  customerContact: string;
  customerPhone?: string;
  customerEmail?: string;
  assignedStaff?: string;
  equipment: Equipment[];
  startDate?: string;
  receivedDate?: string;
  /** Scheduled/confirmed calibration appointment date (Service Request Form). */
  appointmentDate?: string;
  expectedFinishDate?: string;
  completedDate?: string;
  /** Purchase order number when the job is confirmed by PO instead of a signed request */
  poNumber?: string;
  comments?: string;
  serviceInformation?: ServiceInformation;
  workAuthorization?: WorkAuthorization;
  attachments?: FileAttachment[];
  signatures?: { customer?: string; staff?: string };
  certificateNumber?: string;
  parentJobId?: string;
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type JobInput = Omit<Job, 'id' | 'createdAt' | 'updatedAt'>;

// ─── Audit Trail Types ────────────────────────────────────────────────────────

export interface AuditTrailEntry {
  id: string;
  action: string;
  performedBy: string;
  performedByName?: string;
  timestamp: Date;
  details?: Record<string, unknown>;
}

// ─── Job Logging Types ────────────────────────────────────────────────────────

export interface JobActionLog {
  id: string;
  jobId: string;
  action: string;
  performedBy: string;
  performedByName?: string;
  timestamp: Date;
  details?: Record<string, unknown>;
}

export interface JobAssignmentLog {
  id: string;
  jobId: string;
  assignedTo: string;
  assignedBy: string;
  assignedAt: Date;
  previousAssignee?: string;
}

// ─── Service Request Types ────────────────────────────────────────────────────

/** One line item on the customer service request form (maps to job equipment on conversion). */
export interface ServiceRequestEquipment {
  name: string;
  manufacturer: string;
  model: string;
  capacity: string;
  serialNumber: string;
  calibrationPoint: string;
  note: string;
  /** Calibration procedure / method(s) requested */
  calibrationMethods?: string;
  unit?: string;
  resolution?: string;
  /** Customer asset / ID tag number */
  assetTag?: string;
  /** Maps to job equipment `accessories` */
  accessories?: string;
  /** Maps to job equipment `machineLocation` */
  machineLocation?: string;
  /** Maps to job equipment `calibrationDate` (ISO yyyy-mm-dd) */
  calibrationDate?: string;
  /** Optional; lab may re-issue on the job */
  certificateNumber?: string;
}

/**
 * Customer service request (intake). Stored in Firestore `serviceRequests`.
 * Field set aligned with job `ServiceInformation` + equipment table on ISO-style forms.
 */
export interface ServiceRequest {
  id: string;
  customerCompanyName: string;
  /** Set when the customer is chosen from the directory (matches job `customerCode`) */
  customerCode?: string;
  /** @deprecated legacy field name */
  customerName?: string;
  address: string;
  contactName: string;
  email: string;
  phoneNumber: string;
  fax?: string;
  equipment: ServiceRequestEquipment[];
  /** Same structure as job service section (reporting format, statement of conformity, etc.) */
  serviceInformation?: ServiceInformation;
  /** Customer PO, work order, or reference */
  customerReference?: string;
  /**
   * Request calibration date (ISO yyyy-mm-dd from date input).
   * On convert to job, maps to job `appointmentDate`.
   */
  requestedCalibrationDate?: string;
  /** @deprecated Legacy Firestore field; use `requestedCalibrationDate` when reading */
  requestedCompletionDate?: string;
  /** General remarks / special instructions */
  generalRemarks?: string;
  status: 'Pending' | 'Converted' | 'Cancelled';
  /** Firestore field when converted to a job */
  convertedToJobId?: string;
  /** @deprecated use convertedToJobId — kept for older documents */
  convertedJobId?: string;
  cancelReason?: string;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export type ServiceRequestInput = Omit<ServiceRequest, 'id' | 'createdAt' | 'updatedAt' | 'status'>;

// ─── Staff Performance Types ──────────────────────────────────────────────────

export interface StaffPerformanceMetrics {
  userId: string;
  userName: string;
  totalAssigned: number;
  completed: number;
  inProgress: number;
  overdue: number;
  onTimeCompletionRate: number;
  averageCompletionDays?: number;
  jobIds?: string[];
}

// ─── ID Settings Types ────────────────────────────────────────────────────────

export interface JobIdSettings {
  organizationPrefix: string;
  jobTypePrefix: string;
  currentYear: number;
  currentSequence: number;
  yearlyReset: boolean;
}

export interface CustomerIdSettings {
  organizationPrefix: string;
  idTypePrefix: string;
  currentYear: number;
  currentSequence: number;
  yearlyReset: boolean;
}

export interface CertificateNumberConfig {
  id: string;
  equipmentType: string;
  prefix: string;
  currentSequence: number;
  currentYear: number;
  yearlyReset: boolean;
  lastResetAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Company Information Types ────────────────────────────────────────────────

export interface CompanyInfo {
  id: string;
  companyName: string;
  logoUrl?: string;
  logoBase64?: string;
  logoFile?: File;
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

// ─── PDF Settings Types ───────────────────────────────────────────────────────

export interface FieldVisibility {
  [key: string]: { visible: boolean; label?: string };
}

export interface PdfSettings {
  version?: number;
  templateName: string;
  pageSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  layout: 'traditional' | 'grid';
  fontSize: { title: number; heading: number; body: number; small: number; header: number; footer: number };
  margin: { top: number; right: number; bottom: number; left: number };
  fieldVisibility: FieldVisibility;
  jobTableColumns: {
    jobId: boolean; title: boolean; customer: boolean; status: boolean;
    equipment: boolean; appointmentDate: boolean; created: boolean; assignedStaff: boolean; startDate: boolean;
    poNumber: boolean;
  };
  equipmentTableColumns: {
    no: boolean; name: boolean; manufacturer: boolean; model: boolean;
    serialNumber: boolean; calibrationPoint: boolean; calibrationMethods: boolean;
    accessories: boolean; machineLocation: boolean; remark: boolean;
  };
  serviceInformationVisibility: {
    serviceRequested: boolean;
    statementOfConformity: boolean;
    statementOfConformityRequirements: boolean;
    statementOfConformityReferencePdf: boolean;
  };
  workAuthorizationVisibility: {
    workAuthorizationStatement: boolean; customerSignature: boolean;
    itemsConditionOnReceipt: boolean; laboratoryCapabilityAssessment: boolean; staffSignature: boolean;
  };
  workAuthorizationStatement: string;
  sectionHeaders: {
    jobInformation: string; serviceInformation: string;
    workAuthorization: string; equipment: string; comments: string;
  };
  showLogo: boolean;
  showHeader: boolean;
  showFooter: boolean;
  showTableBorders: boolean;
  logoSize: { maxHeight: number; maxWidth: number };
  headerContent: { left: string; center: string; right: string };
  footerContent: { left: string; center: string; right: string };
}

// ─── Misc Types ───────────────────────────────────────────────────────────────

export type ModalType = 'JobFormModal' | 'CustomerModal' | 'CompleteJobModal' | 'SettingsModal';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export * from './template';
export type { DocumentIndexItem, DocumentIndexItemInput, DocumentIndexType, DocumentSource } from './documentIndex';
