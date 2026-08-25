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
  | 'equipmentTypes.view' | 'equipmentTypes.edit'
  | 'recorderTemplates.view' | 'recorderTemplates.edit' | 'recorderTemplates.publish'
  | 'records.commit' | 'records.review' | 'records.approve' | 'records.revise'
  | 'staffPerformance.view' | 'staffPerformance.viewOwn' | 'staffPerformance.exportLogs'
  | 'staffTraining.view' | 'staffTraining.manage'
  | 'equipmentControl.view' | 'equipmentControl.register' | 'equipmentControl.edit'
  | 'equipmentControl.approve' | 'equipmentControl.logUsage' | 'equipmentControl.calibrate'
  | 'equipmentControl.uploadDocuments' | 'equipmentControl.deleteDocuments' | 'equipmentControl.retire';

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
  /** Stable identity, required since ADR-002 Phase 2. Every item must have one
   * before a Record can ever bind to it. Backfilled onto historical data via
   * scripts/backfillEquipmentIds.ts; assigned at creation everywhere new items
   * are constructed (JobModal.tsx, PendingJobsPage.tsx conversion path). */
  id: string;
  certificateNumber?: string;
  /**
   * References a `certificate_number_configs` document id — that collection
   * IS the equipment type (ADR-012, superseding ADR-003's separate entity).
   * Optional until migration from free-text `name` is complete.
   */
  equipmentTypeId?: string;
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
  /** Firebase Storage path — required for deletion. */
  storagePath?: string;
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
  /** ID of the PDF template linked to this job */
  pdfTemplateId?: string;
  requestNo?: string;
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
  /** Firestore UID of the user who performed the action */
  performedBy: string;
  performedByName?: string;
  /** For document-index audit: legacy field aliases */
  userId?: string;
  userName?: string;
  userEmail?: string;
  changeSummary?: string;
  previousRevision?: number;
  newRevision?: number;
  previousState?: string;
  newState?: string;
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
  /** Legacy field stored by jobLoggingService */
  userName?: string;
  /** Legacy field stored by jobLoggingService */
  userEmail?: string;
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

// ─── Job Share Token ──────────────────────────────────────────────────────────

/** Snapshot of job data embedded in a share token */
export interface JobSnapshot {
  title?: string;
  status?: string;
  customerName?: string;
  customerContact?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  scheduleDate?: string;
  equipment?: Array<{
    name?: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    [key: string]: unknown;
  }>;
  serviceInformation?: {
    serviceRequested?: string;
    reportingFormat?: string;
    statementOfConformity?: string;
    [key: string]: unknown;
  };
  workAuthorizationStatement?: string;
  comments?: string;
  [key: string]: unknown;
}

export interface JobShareToken {
  id: string;
  jobId: string;
  jobNumber?: string;
  jobSnapshot?: JobSnapshot;
  expiresAt: Date;
  createdAt: Date;
  createdBy: string;
  used?: boolean;
  customerSignature?: DigitalSignature;
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

// ─── Training Records ─────────────────────────────────────────────────────────

export type TrainingFormat =
  | 'External Training'
  | 'Internal Training'
  | 'On-the-Job Training'
  | 'e-Learning'
  | 'Workshop'
  | 'Seminar'
  | 'Conference'
  | 'Other';

export type TrainingStatus =
  | 'Completed'
  | 'Planned'
  | 'In Progress'
  | 'Cancelled';

export interface TrainingRecord {
  id: string;
  staffUid: string;
  staffName: string;
  /** ชื่อหลักสูตร / หัวข้อการอบรม */
  courseName: string;
  /** รูปแบบการอบรม */
  trainingFormat: TrainingFormat;
  /** ระยะเวลาอบรม e.g. "2 days", "8 hours" */
  duration: string;
  /** ผู้จัดการอบรม */
  organizer: string;
  /** สถานะดำเนินการ */
  status: TrainingStatus;
  /** อบรมแล้วเสร็จวันที่ – ISO date string YYYY-MM-DD */
  completionDate?: string;
  /** ใบรับรอง / เอกสารประเมินผล – URL */
  certificateUrl?: string;
  /** หมายเหตุ */
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Staff Personnel Documents ────────────────────────────────────────────────

export type StaffDocumentCategory =
  | 'Code of Conduct'
  | 'Job Description'
  | 'Employment Contract'
  | 'Training Certificate'
  | 'Performance Review'
  | 'Medical Certificate'
  | 'ID / Passport'
  | 'Other';

export const STAFF_DOCUMENT_CATEGORIES: StaffDocumentCategory[] = [
  'Code of Conduct',
  'Job Description',
  'Employment Contract',
  'Training Certificate',
  'Performance Review',
  'Medical Certificate',
  'ID / Passport',
  'Other',
];

/** A file (PDF, image, etc.) attached to a staff member's personnel record. */
export interface StaffDocument {
  id: string;
  staffUid: string;
  /** Original file name shown to users */
  name: string;
  category: StaffDocumentCategory;
  /** File size in bytes */
  size: number;
  mimeType: string;
  /** Firebase Storage download URL */
  url: string;
  /** Firebase Storage path used for deletion */
  storagePath: string;
  uploadedAt: Date;
  uploadedBy: string;
  uploadedByName: string;
}

// ─── Staff Performance Types ──────────────────────────────────────────────────

export interface StaffPerformanceMetrics {
  userId: string;
  userName: string;
  /** Staff user ID (used by staffPerformanceService) */
  staffId?: string;
  /** Staff display name (used by staffPerformanceService) */
  staffName?: string;
  totalAssigned: number;
  totalJobsAssigned?: number;
  completed: number;
  inProgress: number;
  jobsInProgress?: number;
  /** Jobs completed on time (used by staffPerformanceService) */
  jobsCompletedOnTime?: number;
  /** Jobs completed overdue (used by staffPerformanceService) */
  jobsCompletedOverdue?: number;
  /** Pending jobs count (used by staffPerformanceService) */
  jobsPending?: number;
  overdue: number;
  onTimeCompletionRate: number;
  /** On-time completion percentage 0–100 (used by staffPerformanceService) */
  onTimePercentage?: number;
  /** Overdue percentage 0–100 (used by staffPerformanceService) */
  overduePercentage?: number;
  averageCompletionDays?: number;
  jobIds?: string[];
  /** Last time metrics were recalculated */
  lastUpdated?: Date;
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
  prefix: string;
  organizationPrefix: string;
  idTypePrefix: string;
  currentYear: number;
  currentSequence: number;
  yearlyReset: boolean;
}

/**
 * `certificate_number_configs` IS the equipment type (ADR-012, superseding
 * ADR-003's separate `EquipmentType` entity). One instrument type, one
 * certificate series — a strict 1:1. This document's own `id` is the stable
 * key that `Equipment.equipmentTypeId` and `RecorderTemplate.equipmentTypeId`
 * reference; `name` is just the renameable display label.
 *
 * Naming warning: the collection is still called `certificate_number_configs`
 * while representing equipment types. Renaming it would mean copying live
 * counter documents — the highest-consequence migration available in this
 * system — so the mismatch is accepted rather than risked away. See ADR-012.
 */
export interface CertificateNumberConfig {
  id: string;
  name: string;
  prefix: string;
  separator: string;
  includeYear: boolean;
  numberPadding: number;
  currentNumber: number;
  currentSequence: number;
  currentYear: number;
  /** Derived, not stored: always `resetPolicy === 'yearly'`. Computed on read (Phase 0 finding). */
  yearlyReset: boolean;
  resetPolicy: 'never' | 'yearly' | 'monthly';
  lastResetAt?: Date;
  /** Written by the allocation transaction only, so `updatedAt` keeps meaning "last human edit" (ADR-012). */
  lastAllocatedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Recorder Template Types (ADR-001, ADR-003, ADR-005, ADR-006, ADR-009, ADR-010, ADR-011) ──

/**
 * Display-only formatting for a numeric column or summary field. Stored values
 * are always full precision; rounding happens only when rendered (ADR-011).
 */
export interface NumberFormat {
  notation: 'fixed' | 'scientific';
  /** Fixed: decimal places. Scientific: mantissa decimal places. */
  decimals: number;
}

/** A user-authored `def name(params): return <expression>` (ADR-001). */
export interface CustomFunction {
  /** /^[a-zA-Z_][a-zA-Z0-9_]*$/ */
  name: string;
  params: string[];
  /** Single expression, evaluated in the Phase 3 interpreter's row context rules (params only). */
  expression: string;
}

export interface RecordColumn {
  /** Formula variable part B; /^[A-Z][A-Z0-9]*$/ */
  id: string;
  label: string;
  order: number;
  /**
   * 'standard' stores a composite `equipmentId::equationId` key identifying an
   * (equipment, calibrated range) pair, and feeds `STD_*` (ADR-014 D3).
   */
  type: 'text' | 'number' | 'selection' | 'formula' | 'standard';

  /**
   * Display-only unit shown in the column header (Phase 15 Task 1, superseded
   * by the fixed/selectable split below). Absent `unitMode` = no unit,
   * renders as `label` alone — exactly as before either mode existed.
   *
   * Three modes, chosen by the template author:
   *   'fixed'      — `unit` holds the one unit. Not changeable while
   *                  recording. Header renders `label (unit)`.
   *   'selectable' — `unitChoices` holds the allowed units (mirrors the
   *                  `selection` column's `choices`: parsed from a
   *                  comma-separated input, trimmed, blanks dropped). The
   *                  technician picks one per RECORD (not per row, not on
   *                  the template) while drafting; that choice lives in
   *                  `CalibrationRecord.columnUnits`, keyed by this column's
   *                  `${sectionId}_${columnId}` key. Header renders
   *                  `label (chosen)` once something is picked, else plain
   *                  `label` — an unpicked selectable column is a display
   *                  state, not a validation error.
   *   'sameAs'     — `unitSourceColumn` names another column (by its
   *                  `${sectionId}_${columnId}` key) whose unit this column
   *                  reuses. The point is round columns: Reading 1/2/3 all
   *                  report in one unit, so the author makes Reading 1
   *                  selectable and the rest follow it — the technician
   *                  picks once and every header moves together. This
   *                  column gets NO picker of its own, and nothing about it
   *                  is stored per record; its unit is always DERIVED at
   *                  render time from its source. References may chain
   *                  (R3 -> R2 -> R1); a cycle resolves to no unit and is
   *                  reported by the template verifier.
   *
   * Stored SEPARATELY from `label` and joined only at render time — never
   * concatenated into `label` itself.
   *
   * `unit`/`unitChoices` are free text, NOT constrained to `ForceUnit`: mV/V,
   * °C, %RH, mm, or a dimensionless ratio are all valid.
   *
   * NON-NEGOTIABLE (ADR-014 D5): this is a label, not a conversion. No
   * evaluation path may read `unitMode`, `unit`, `unitChoices`, or a record's
   * `columnUnits` — `polynomial(R) * STD_TO_N / REPORT_TO_N` is the only unit
   * conversion in this system, and it stays a VISIBLE part of the author's
   * own formula (ADR-013 D5's whole argument), not a second mechanism hidden
   * behind a column property. A unit string that participated in arithmetic
   * would be the third such mechanism, after `ConversionEquation.divisor`
   * (ADR-014 D5's own corrected mistake). `recordColumnUnit.test.ts` asserts
   * this structurally, extended to cover `columnUnits`.
   */
  unitMode?: 'fixed' | 'selectable' | 'sameAs';
  /** 'fixed' mode only: the one unit. */
  unit?: string;
  /** 'selectable' mode only: the allowed units, parsed like `choices`. */
  unitChoices?: string[];
  /** 'sameAs' mode only: the `${sectionId}_${columnId}` key to inherit the unit from. */
  unitSourceColumn?: string;

  /** type 'number' only (ADR-011). */
  numberFormat?: NumberFormat;
  /** type 'selection' only. */
  choices?: string[];
  /** type 'formula' only — read-only column, evaluated in row context. */
  expression?: string;
  /** Preset value for input types (text/number/selection). */
  preInput?: string | number;

  /**
   * Display-time unit conversion (ADR-015) — 'formula' columns ONLY (D9).
   * `false`/absent on any other column type must never render a control for
   * this at all; a disabled checkbox on a text column would imply the
   * feature exists there.
   *
   * DISPLAY CONCERN, same non-negotiable boundary as `unitMode` above (D1):
   * the column's STORED value (`RecordRow[key]`) is always the raw engine
   * output. Conversion is applied only when a cell is rendered — grid,
   * read-only view, PDF — via `services/columnConversion.ts`. No evaluation
   * path, and nothing in `modules/recorder/formula/`, may read
   * `conversionEnabled` or `conversionSourceUnit`; a downstream formula
   * referencing this column sees the same raw value it always did. That is
   * precisely what makes chained double-conversion structurally impossible
   * (ADR-014 D5's divisor failure, this time by construction, not just by
   * test) — see `columnConversionIsolation.test.ts`.
   */
  conversionEnabled?: boolean;
  /**
   * The unit this column's RAW computed values are actually in — the
   * author's declaration (D3), since inferring it from the expression is
   * out of scope. Free text, matching the header `unit` fields: mV/V, %,
   * mm, °C, or any non-force unit the newton table doesn't cover (a
   * fromUnit/toUnit pair that are BOTH `ForceUnit` values is rejected when
   * the rule itself is saved — D5 — so this field is never the force path).
   *
   * Cross-checked, not trusted: when the column's expression references any
   * `STD_C*`, the record-entry UI compares this against the selected
   * standard's `outputUnit` and warns on disagreement — the same treatment
   * as `checkDivisorAgreement`, never a block.
   */
  conversionSourceUnit?: string;
}

// ─── Reference Standards (ADR-013) ────────────────────────────────────────────

/** The four force units the lab works in (ADR-013 D5). Normalised through newtons. */
export type ForceUnit = 'N' | 'kN' | 'kgF' | 'gF';

/**
 * @deprecated RETIRED by ADR-014 D2. The equipment register is the reference
 * standard: one `EquipmentRecord` per device, one `ConversionEquation` per
 * calibrated range. Use those instead.
 *
 * The service (`referenceStandardService.ts`) and settings modal
 * (`ReferenceStandardManagerModal.tsx`) have been removed, and the owner
 * confirmed the collection holds no data. The (empty) Firestore collection and
 * its rule block are deliberately left in place — deleting Firestore data is
 * irreversible and an unused collection costs nothing.
 *
 * This interface itself is retained ONLY because
 * `standardNamespaceIsolation.test.ts` — the leak test that must keep passing
 * unmodified — still references it. Nothing in `src/` outside that test does.
 * Do not use it in new code.
 */
export interface ReferenceStandard {
  id: string;
  /** Free-text label, e.g. 'CAL-FRC-003 (20 kN, Tensile 2-20 kN)'. Safe to edit. */
  displayName: string;
  equipmentCode: string;
  instrumentName: string;
  /** Human-readable range, e.g. '2-20 kN'. */
  rangeText: string;
  /** Numeric range in the standard's OUTPUT unit — drives the "does not bracket" warning (D3). */
  rangeMin?: number;
  rangeMax?: number;

  /**
   * coefficients[i] multiplies R^i. coefficients[0] is the constant term
   * (ADR-013 D1). An ordered array, NOT three named fields, so any polynomial
   * degree works with no schema change. Current NIMT data is degree 3 with a
   * zero constant term.
   */
  coefficients: number[];
  /** The transducer's signal unit, e.g. 'mV/V'. Free text — not converted. */
  inputUnit: string;
  /** The force unit the polynomial produces. Drives STD_TO_N (D5). */
  outputUnit: ForceUnit;
  resolution?: number;

  /** Uncertainty contributors, all percentages (D2). */
  uCal?: number;
  uA?: number;
  uB?: number;
  uC?: number;

  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  accessories?: string;
  traceability?: string;
  calibrationDate?: Date;
  dueDate?: Date;

  /** Deactivate, never delete — historical records reference this by id (D2). */
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

/**
 * What a committed record keeps of a standard (ADR-013 D6). Frozen at commit
 * so recalibrating a transducer can never retroactively alter an issued
 * certificate — identical reasoning to ADR-005's template version pinning.
 *
 * Stored on the record as a map keyed by standard id rather than duplicated
 * onto every row: several rows typically share one standard, and the ADR
 * flags record growth as a concern worth measuring.
 */
export interface ReferenceStandardSnapshot {
  /** Parent equipment record (ADR-014 D1) — the device itself. */
  equipmentId: string;
  /** The calibrated range used, i.e. which ConversionEquation (ADR-014 D3). */
  equationId: string;
  /** Human label, composed at capture: "<equipment name> — <equation name>". */
  displayName: string;
  equipmentCode: string;
  /**
   * CANONICAL ASCENDING — `coefficients[i]` multiplies `Rⁱ` (ADR-014 D6).
   *
   * Already converted from the equation's stored descending order at capture,
   * deliberately: storing the converted form means a later reader cannot
   * re-invert it by accident. Do NOT pass these through the coefficient
   * adapter again.
   */
  coefficients: number[];
  inputUnit: string;
  /** Free text, matching ConversionEquation — legacy values may not be a ForceUnit. */
  outputUnit: string;
  resolution?: number;
  rangeMin?: number;
  rangeMax?: number;
  uCal?: number;
  uA?: number;
  uB?: number;
  uC?: number;
  serialNumber?: string;
  calibrationDate?: Date;
  dueDate?: Date;
  capturedAt: Date;
}

// ─── Display-time unit conversion (ADR-015) ────────────────────────────────────

/**
 * A shared, admin-managed conversion rule (ADR-015 D2) — reusable across
 * every template, looked up at RENDER time by `(fromUnit, toUnit)`, never
 * bound to a specific column or template. `unitConversionRuleService.ts`
 * follows `conversionEquationService.ts`'s conventions exactly.
 *
 * `expression` is parsed and evaluated by the SAME formula parser/evaluator
 * every column formula uses (D4) — no second expression syntax — but sees
 * exactly one variable, `VALUE`. Validated at save time to reference nothing
 * else, and to never pair two `ForceUnit` values (D5: that route is
 * `STD_TO_N` / `REPORT_TO_N`, already exact).
 */
export interface ConversionRule {
  id: string;
  name: string;
  /** Free text; NOT constrained to ForceUnit (D5's rejection is what keeps the force pairs out, not a type). */
  fromUnit: string;
  toUnit: string;
  /** Formula-language expression using only `VALUE`, e.g. `VALUE * 1000`, `(VALUE - 32) * 5 / 9`. */
  expression: string;
  notes?: string;
  /** Deactivate, never delete (D2) — a committed record's snapshot may still name this rule. */
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type ConversionRuleInput = Omit<ConversionRule, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * What a converted cell is allowed to show when conversion could NOT be
 * applied (ADR-015 D6): the raw value, unconverted, plus enough to build a
 * warning naming the missing pair. Never blank, never a thrown exception.
 */
export type ConversionFailureReason = 'no-rule' | 'expression-error' | 'divide-by-zero' | 'non-finite-result';

export interface ConversionFailure {
  reason: ConversionFailureReason;
  message: string;
  sourceUnit: string;
  targetUnit: string;
}

/**
 * D7: frozen at commit, one per converted cell, so a certificate's printed
 * numbers can be reconstructed without the live (shared, editable) rule
 * library — the same reason `standardSnapshots` exists. Keyed on
 * `CalibrationRecord.conversionSnapshots` by `${rowIndex}:${columnKey}`,
 * since conversion is per-CELL (row × column), unlike `standardSnapshots`
 * which is keyed by the standard's own composite key.
 */
export interface ConversionCellSnapshot {
  ruleId: string;
  ruleName: string;
  expression: string;
  sourceUnit: string;
  targetUnit: string;
  rawValue: number;
  convertedValue: number;
  capturedAt: Date;
}

/**
 * A named group of columns — a spanning header, not a nested table (ADR-006).
 * `ENV` and `SUMMARY` are reserved and may not be used as an author-defined
 * section id.
 */
export interface RecordSection {
  /** Formula variable part A; /^[A-Z][A-Z0-9]*$/ */
  id: string;
  label: string;
  order: number;
  columns: RecordColumn[];
}

/** Evaluated once per record, after all rows, in the summary context (ADR-010). */
export interface SummaryField {
  /** Referenced as SUMMARY_<id>; /^[A-Z][A-Z0-9]*$/ */
  id: string;
  label: string;
  type: 'number' | 'text';
  /** type 'number' only (ADR-011). */
  numberFormat?: NumberFormat;
  expression: string;
}

/**
 * ADR-017 D1 — one column of a report block.
 *
 * Deliberately a SEPARATE interface from `RecordColumn` rather than a reuse
 * of it, for one reason that matters: `standard` is excluded. A block row is
 * not a calibration point, so a reference standard has nothing to resolve
 * against, and `STD_*` is a validation error in block context (D4). Sharing
 * `RecordColumn` would have made `type: 'standard'` representable here and
 * left "is this legal?" to a runtime check somewhere; excluding it from the
 * type makes it unrepresentable.
 *
 * The unit/conversion fields of `RecordColumn` are likewise absent: those are
 * per-calibration-point display concerns (ADR-015 D9 restricts conversion to
 * formula columns of the measurement table), and a budget row has no unit
 * axis to convert along.
 */
export interface ReportBlockColumn {
  /** Formula variable part B; /^[A-Z][A-Z0-9]*$/ — referenced as BLOCKID_COLUMNID. */
  id: string;
  label: string;
  order: number;
  /** ADR-017 D1: matches section column types MINUS 'standard'. */
  type: 'text' | 'number' | 'selection' | 'formula';
  /** type 'number' and 'formula' (ADR-011, Phase 26 Task 1). */
  numberFormat?: NumberFormat;
  /** type 'selection' only. */
  choices?: string[];
  /** type 'formula' only — evaluated in BLOCK context (ADR-017 D4). */
  expression?: string;
  /** Preset value for input types (text/number/selection). */
  preInput?: string | number;
}

/**
 * ADR-017 D1/D5 — a report block: a table or a paragraph with its OWN row
 * axis, independent of calibration points.
 *
 * Why this cannot be a `RecordSection`: Phase 21 established that a
 * `RecordRow` spans every section — row 3 is one calibration point in all of
 * them — and that shared axis is what keeps a measurement aligned with its
 * own results. An uncertainty budget has a row per CONTRIBUTOR and a
 * conformity statement has no rows at all, so forcing either onto the
 * calibration-point axis would make a 5-point run produce exactly 5 budget
 * rows.
 *
 * Blocks live inside their template and are copied into the published
 * version snapshot exactly like sections (D2), so a committed record
 * reproduces from its own snapshot without reaching outside it (ADR-005).
 */
export interface ReportBlock {
  /** Formula variable part A; /^[A-Z][A-Z0-9]*$/. Shares the section-id namespace. */
  id: string;
  label: string;
  order: number;
  /**
   * 'table' renders `columns` over `defaultRowCount` rows; 'text' renders
   * `text` with placeholders interpolated (D6). One entity rather than two
   * because they share an id namespace, an ordering, and a snapshot rule.
   */
  kind: 'table' | 'text';
  /** kind 'table' only. */
  columns: ReportBlockColumn[];
  /** kind 'table' only: initial row count. A block row axis is authored, not measured. */
  defaultRowCount: number;
  /**
   * kind 'text' only: the wording authored on the TEMPLATE (D5). A
   * technician may override it per record; the effective text is snapshotted
   * at commit so a later template edit never moves text on a committed
   * record.
   */
  text?: string;
}

/** Reuses the existing certificate-number config model (ADR-008). */
export interface RecordNumberFormat {
  /** 1–2 fixed parts, joined by `separator`. */
  parts: string[];
  separator: string;
  includeYear: boolean;
  yearDigits: 2 | 4;
  numberPadding: number;
  resetPolicy: 'never' | 'yearly' | 'monthly';
}

/**
 * The authored definition of how one equipment type (a
 * `certificate_number_configs` document, ADR-012) is recorded. Bound 1:1 to
 * that equipment type while `status === 'active'` (ADR-003) — enforced
 * transactionally by recorderTemplateService, not by a read-then-write check.
 *
 * This document holds the CURRENT (possibly still-being-edited) content.
 * Publishing freezes a copy into a separate, immutable
 * `RecorderTemplateVersion` document; editing this document afterwards never
 * changes any already-published version (ADR-005).
 */
export interface RecorderTemplate {
  id: string;
  name: string;
  description?: string;
  /** Unique among templates with status 'active' (ADR-003). */
  equipmentTypeId: string;

  /** Drives the Environment Block only (ADR-006). Reading columns remain free-form. */
  roundCount: number;
  /** Initial calibration-point row count; the technician may add more if allowRowAdd. */
  defaultRowCount: number;
  allowRowAdd: boolean;

  recordNumberFormat: RecordNumberFormat;

  sections: RecordSection[];
  summaryFields: SummaryField[];
  customFunctions: CustomFunction[];
  /**
   * ADR-017 D1/D2. Optional so every template authored before this ADR
   * loads unchanged — absent and `[]` mean the same thing (no blocks), and
   * nothing downstream may distinguish them.
   *
   * D10: this does NOT replace `summaryFields`. A summary field is still the
   * right tool for one value per record, and `SUMMARY_*` is referenced BY
   * blocks (D4).
   */
  reportBlocks?: ReportBlock[];

  status: 'draft' | 'active' | 'archived';
  /** Incremented on each publish; 0 while still an unpublished draft. */
  version: number;

  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

/**
 * An immutable published snapshot of a RecorderTemplate, including its
 * customFunctions. Records pin to `(templateId, version)`, never to the
 * mutable template document, so a closed record is always reproducible
 * (ADR-005). Stored separately so N records sharing a version share one
 * snapshot rather than each embedding a copy.
 */
export interface RecorderTemplateVersion {
  /** `${templateId}_v${version}` */
  id: string;
  templateId: string;
  version: number;
  snapshot: RecorderTemplate;
  publishedAt: Date;
  publishedBy: string;
}

// ─── Calibration Record Types (ADR-002, ADR-005, ADR-008, ADR-010) ────────────

/** `voided` added by ADR-016 — a soft delete, reachable from any other status. */
export type RecordStatus = 'draft' | 'committed' | 'reviewed' | 'approved' | 'superseded' | 'voided';

/** One row = one calibration point. Keys are `${sectionId}_${columnId}`. */
export type RecordRow = Record<string, string | number | null>;

export interface RoundEnvironment {
  /** 1-based. */
  roundIndex: number;
  temperatureC: number;
  relativeHumidity: number;
}

/**
 * Captured at record creation from the Job and Item (Equipment) documents.
 * Snapshotted rather than referenced, so a certificate reprinted years later
 * shows what was true at calibration time — the live job/customer records
 * will have moved on by then.
 */
export interface RecordContextSnapshot {
  job: {
    jobId: string;
    title: string;
    customerName: string;
    customerAddress: string;
    customerContact: string;
    customerEmail: string;
    customerPhone: string;
    assignedStaff: string;
    receivedDate: string;
  };
  item: {
    name: string;
    manufacturer: string;
    model: string;
    serialNumber: string;
    assetTag: string;
    accessories: string;
    machineLocation: string;
    resolution: string;
    unit: string;
    certificateNumber: string;
  };
  capturedAt: Date;
}

/**
 * The transactional aggregate (ADR-002) — its own top-level `records`
 * collection, never inline on the Job document. One record per Item at a
 * time; corrections never mutate a committed record, they create a linked
 * Revision (ADR-005).
 */
export interface CalibrationRecord {
  id: string;
  /** Present iff status is 'committed' or later (ADR-008). */
  recordNumber?: string;

  jobId: string;
  /** Stable Equipment.id (required since ADR-002 Phase 2). */
  itemId: string;
  /** References a certificate_number_configs document id (ADR-012). */
  equipmentTypeId: string;

  templateId: string;
  /** Pinned at creation; immutable once set (ADR-005). Never re-resolved to the live template. */
  templateVersion: number;

  contextSnapshot: RecordContextSnapshot;
  /** Length must equal the pinned snapshot's roundCount before commit (ADR-006). */
  environment: RoundEnvironment[];
  rows: RecordRow[];
  /**
   * The force unit this record's certificate reports in (ADR-014 D5). Exposed
   * to formulas as `REPORT_TO_N`, so a template writes the conversion as
   * `polynomial(R) * STD_TO_N / REPORT_TO_N`.
   *
   * Lives on the RECORD, not the equation: the same transducer used on a job
   * reporting in N and another reporting in kN needs two different factors,
   * which is precisely why the stored `ConversionEquation.divisor` cannot
   * serve this purpose and is deprecated for it.
   */
  reportUnit?: ForceUnit;
  /**
   * The chosen unit for each 'selectable' column, keyed by that column's
   * `${sectionId}_${columnId}` key (Phase 15 Task 1 supersession). Per
   * COLUMN per RECORD — not per row, not on the template. Editable while
   * Draft, pinned once committed (ADR-005): it changes what every number on
   * the certificate CLAIMS to be, so it must freeze like the rest. Written
   * through the same `updateDraftRecord` path as `reportUnit`/`rows` — no
   * second write path — and needs no explicit commit-time snapshot logic,
   * since `commitRecord`'s `transaction.update` is a partial merge that
   * leaves it untouched on the document, the same way `reportUnit` already
   * survives commit without commitRecord naming it.
   */
  columnUnits?: Record<string, string>;
  /**
   * Every reference standard used by any row, frozen at commit (ADR-013 D6),
   * keyed by the row's composite `equipmentId::equationId` cell value
   * (ADR-014 D3). Evaluation at commit reads coefficients from HERE, never
   * from the live equation. Empty until committed.
   */
  standardSnapshots?: Record<string, ReferenceStandardSnapshot>;
  /**
   * One entry per converted cell, frozen at commit (ADR-015 D7), keyed by
   * `${rowIndex}:${columnKey}` — e.g. `0:CAL_ERR` for row 0's CAL_ERR cell.
   * Per-cell rather than per-column: `RecordRow[]` has no stable row id
   * beyond its index, matching how `rows`/`environment` are already indexed
   * positionally elsewhere in this type. Empty until committed; a draft
   * shows conversion applied live from the current rule library, never from
   * this.
   */
  conversionSnapshots?: Record<string, ConversionCellSnapshot>;
  /** Evaluated at commit, against the pinned snapshot (ADR-010). Empty until committed. */
  summary: Record<string, string | number | null>;

  status: RecordStatus;
  /** recordId this record revises. */
  supersedes?: string;
  /** recordId that revised this record. */
  supersededBy?: string;
  revisionReason?: string;

  createdAt: Date;
  createdBy: string;
  committedAt?: Date;
  committedBy?: string;
  reviewedAt?: Date;
  /** The caller's uid at the time of review — lets firestore.rules verify the signer is the caller and enforce separation of duties (Phase 5c). */
  reviewedBy?: string;
  reviewerSignature?: DigitalSignature;
  approvedAt?: Date;
  /** Same reason as `reviewedBy` (Phase 5c). */
  approvedBy?: string;
  approverSignature?: DigitalSignature;

  /**
   * ADR-016 — a soft delete. `statusBeforeVoid` is captured explicitly at
   * void time (D5: never inferred on restore) and, per firestore.rules,
   * deliberately left in place after a restore as a permanent trace that
   * this record was once voided — the same way `supersededBy` is never
   * cleared either. Present only once a record has been voided at least
   * once; absent otherwise.
   */
  voidedAt?: Date;
  /** The caller's uid at the time of voiding — firestore.rules requires this to equal request.auth.uid. */
  voidedBy?: string;
  /** Mandatory, non-empty (enforced client-side and by firestore.rules) — a voided record with no explanation looks like data loss. */
  voidReason?: string;
  /** The record's status immediately before this void — restore returns here. Stored, never inferred (ADR-016 D5). */
  statusBeforeVoid?: RecordStatus;
}

// ─── Company Information Types ────────────────────────────────────────────────

export interface CompanyInfo {
  id: string;
  companyName: string;
  companyAbbreviation?: string;
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

// ─── Equipment Control Module Types ──────────────────────────────────────────

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
  /** Numeric calibration point values (numbers only; unit stored in calibrationUnit) */
  calibrationPoints?: number[];
  /** Physical unit for all calibration points, e.g. "N", "kN", "kg" */
  calibrationUnit?: string;
  externalProvider: boolean;
  /**
   * Whether this device may be selected as a reference standard in a record's
   * `standard` column (ADR-014 D3).
   *
   * An explicit flag, not a name convention: filtering on an id prefix like
   * "CAL-FRC-" would silently include or exclude devices as naming drifts,
   * which is the class of quiet wrong answer ADR-013 exists to end.
   */
  isReferenceStandard?: boolean;
  capacity?: string;
  usageRange?: string;
  usageCriteria?: string;
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
  // Job linkage
  linkedJobId?: string;
  linkedJobRef?: string;
  linkedJobTitle?: string;
  linkedCustomerName?: string;
  createdAt: Date;
}

export interface CalibrationEvent {
  id: string;
  equipmentId: string;
  sentDate: string;
  receivedDate?: string;
  calibrationDate?: string;
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
  storagePath?: string;
  uploadedAt: Date;
  uploadedBy: string;
}

// ─── end Equipment Control ────────────────────────────────────────────────────

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

// ─── Conversion Equations ─────────────────────────────────────────────────────

/** Coefficient entry — stores numeric value and remembers how the user typed it */
export interface EquationCoefficient {
  value: number;
  /** 'decimal' | 'scientific' — drives which input style is shown */
  inputMode: 'decimal' | 'scientific';
  /** Raw string the user typed (preserved for display round-trip) */
  raw: string;
}

/**
 * A polynomial conversion equation stored per equipment.
 * Firestore path: equipmentControl/{equipmentId}/conversionEquations/{id}
 *
 * Equation form: output = (A·xⁿ + B·xⁿ⁻¹ + … + constant) / divisor
 *
 * coefficients[0] = highest-degree coefficient (A)
 * coefficients[degree] = constant term
 */
export interface ConversionEquation {
  id: string;
  name: string;
  inputUnit: string;
  /**
   * The force unit the polynomial produces — drives `STD_TO_N` (ADR-013 D5).
   *
   * Typed `string`, not `ForceUnit`, because this is what Firestore actually
   * holds: the field was a free-text input before ADR-014 and legacy documents
   * may contain values outside `N|kN|kgF|gF` (the old placeholder suggested
   * "kg"). New entry is constrained to a `ForceUnit` dropdown; anything stored
   * outside that set makes `forceUnitToNewtons` return null, which surfaces as
   * a warning in the equipment UI rather than a silently wrong factor.
   */
  outputUnit: string;
  /** Polynomial degree 1–5 */
  degree: number;
  /** Length = degree + 1. Index 0 = highest-degree coeff, last = constant */
  coefficients: EquationCoefficient[];
  /**
   * @deprecated NOT applied in the recorder path (ADR-014 D5).
   *
   * Unit scaling there is derived per job as
   * `polynomial(R) * STD_TO_N / REPORT_TO_N`, because the factor depends on the
   * job's reporting unit and a stored field cannot supply both N and kN for the
   * same transducer. Applying this as well would scale twice and put every
   * force out by ~1000x.
   *
   * Retained only for the standalone calculator on EquipmentDetailPage, which
   * is not part of the recorder pipeline. That page warns when this value
   * disagrees with the factor derived from the equation's own units.
   */
  divisor: number;
  /** Standard's resolution in `outputUnit`. Feeds `STD_RESOLUTION` (ADR-013 D4). */
  resolution?: number;
  /**
   * Numeric bounds of this calibrated range, in `outputUnit`. Drive the
   * "does not bracket this row's force" warning (ADR-013 D3), which warns and
   * never blocks. Both must be set for the check to run.
   */
  rangeMin?: number;
  rangeMax?: number;
  notes?: string;
  /** Standard's calibration uncertainty (%), from the LCDB — used by the Stage D uncertainty budget. */
  uCal?: number;
  /** LCDB uncertainty contribution A (%). */
  uA?: number;
  /** LCDB uncertainty contribution B (%). */
  uB?: number;
  /** LCDB uncertainty contribution C (%). */
  uC?: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type ConversionEquationInput = Omit<ConversionEquation, 'id' | 'createdAt' | 'updatedAt'>;

// ─── Equipment Constants ──────────────────────────────────────────────────────

/**
 * A named constant bound to an equipment record.
 * Keys are assigned sequentially: k1, k2, k3, …
 * Firestore path: equipmentControl/{equipmentId}/constants/{id}
 */
export interface EquipmentConstant {
  id: string;
  /** Sequential label: "k1", "k2", "k3", … */
  key: string;
  /** Numeric value of the constant */
  value: number;
  /** Raw string the user typed (preserves formatting e.g. "2.12230E+01") */
  rawValue: string;
  /** Optional physical unit, e.g. "N/mV/V", "kg", "°C/mV" */
  unit?: string;
  /** Human-readable description of what this constant represents */
  description?: string;
  /** Any additional notes (source document, reference standard, etc.) */
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type EquipmentConstantInput = Omit<EquipmentConstant, 'id' | 'createdAt' | 'updatedAt'>;

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

/** Alias for DocumentIndexItem — used by legacy PDF/notification services */
export type { DocumentIndexItem as Document } from './documentIndex';
