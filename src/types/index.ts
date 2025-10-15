// User Types
export interface User {
  uid: string;
  email: string;
  displayName?: string;
  firstName: string;
  lastName: string;
  position?: string;
  role: 'admin' | 'staff';
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

