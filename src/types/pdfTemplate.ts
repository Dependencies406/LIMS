/**
 * PDF Template Type Definitions
 * Comprehensive type system for building dynamic PDF certificates and reports
 * 
 * Data Sources Analyzed:
 * - Job interface (src/types/index.ts lines 289-326)
 * - Equipment interface (src/types/index.ts lines 141-156)
 * - Customer interface (src/types/index.ts lines 184-193)
 * - CompanyInfo interface (src/types/index.ts lines 526-552)
 * - ServiceInformation interface (src/types/index.ts lines 257-263)
 * - WorkAuthorization interface (src/types/index.ts lines 273-286)
 */

// ============================================================================
// PAGE SETTINGS
// ============================================================================

export type PaperSize = 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5';
export type PageOrientation = 'portrait' | 'landscape';

export interface PageMargins {
  top: number;    // in mm
  right: number;  // in mm
  bottom: number; // in mm
  left: number;   // in mm
}

export interface PageSettings {
  size: PaperSize;
  orientation: PageOrientation;
  margins: PageMargins;
  showPageNumbers: boolean;
  pageNumberPosition?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  pageNumberFormat?: string; // e.g., "Page {current} of {total}"
}

// ============================================================================
// DATA SOURCE KEYS (All available dynamic fields)
// ============================================================================

/**
 * ALL JOB FIELDS - From Job interface
 * These are the REAL keys available in your Job data
 */
export type JobDataKey =
  | 'id'                      // Job document ID
  | 'jobId'                   // Job ID (e.g., "CPN-CAL-25001")
  | 'title'                   // Job title
  | 'status'                  // Pending | Proceeding | In Progress | Completed | Halt | Superseded | Void
  | 'customerCode'            // Customer code reference
  | 'customerName'            // Customer name (optional)
  | 'customerAddress'         // Customer address (optional)
  | 'customerContact'         // Contact person name
  | 'customerPhone'           // Contact phone (optional)
  | 'customerEmail'           // Contact email (optional)
  | 'assignedStaff'           // Assigned staff member (optional)
  | 'startDate'               // Start date (optional)
  | 'appointmentDate'         // Scheduled/confirmed calibration appointment date (optional)
  | 'poNumber'                // Purchase order number (optional)
  | 'comments'                // Job comments (optional)
  | 'certificateNumber'       // Certificate number (optional, e.g., "CERT-1001")
  | 'parentJobId'             // Parent job if amendment (optional)
  | 'amendmentReason'         // Reason for amendment (optional)
  | 'createdAt'               // Creation timestamp
  | 'updatedAt'               // Last update timestamp
  | 'createdBy';              // Creator user ID

/**
 * ALL EQUIPMENT FIELDS - From Equipment interface
 * Each job can have multiple equipment items
 */
export type EquipmentDataKey =
  | 'no'                      // Equipment number (optional)
  | 'name'                    // Equipment name
  | 'manufacturer'            // Manufacturer name
  | 'model'                   // Model number
  | 'serialNumber'            // Serial number
  | 'calibrationPoint'        // Calibration point
  | 'calibrationMethods'      // Calibration methods
  | 'accessories'             // Accessories description
  | 'machineLocation'         // Machine location
  | 'remark';                 // Remarks

/**
 * ALL CUSTOMER FIELDS - From Customer interface
 */
export type CustomerDataKey =
  | 'id'                      // Customer document ID
  | 'customerId'              // Auto-generated customer ID (e.g., "CPN-CUS-25001")
  | 'customerCode'            // Customer code
  | 'name'                    // Customer name
  | 'address'                 // Customer address
  | 'isActive'                // Active status
  | 'createdAt'               // Creation timestamp
  | 'updatedAt';              // Last update timestamp

/**
 * ALL COMPANY INFO FIELDS - From CompanyInfo interface
 */
export type CompanyDataKey =
  | 'companyName'             // Company name
  | 'logoBase64'             // Logo Base64 data URL (optional)
  | 'address.street'          // Street address
  | 'address.city'            // City
  | 'address.state'           // State/province
  | 'address.postalCode'      // Postal/ZIP code
  | 'address.country'         // Country
  | 'contactInfo.phone'       // Phone number
  | 'contactInfo.email'       // Email address
  | 'contactInfo.website'     // Website (optional)
  | 'contactInfo.fax'         // Fax number (optional)
  | 'additionalInfo.taxId'    // Tax ID (optional)
  | 'additionalInfo.registrationNumber'   // Registration number (optional)
  | 'additionalInfo.businessLicense';     // Business license (optional)

/**
 * ALL SERVICE INFORMATION FIELDS - From ServiceInformation interface
 */
export type ServiceInfoDataKey =
  | 'serviceRequested'                    // e.g., "Calibration"
  | 'statementOfConformity'               // Required | Not required
  | 'statementOfConformityRequirements'  // Requirements details (optional)
  | 'statementOfConformityReferencePdfUrl'   // Download URL of optional reference PDF
  | 'statementOfConformityReferencePdfName'; // Original file name (optional)

/**
 * ALL WORK AUTHORIZATION FIELDS - From WorkAuthorization interface
 */
export type WorkAuthDataKey =
  | 'workAuthorizationStatement'          // Authorization statement text
  | 'itemsConditionOnReceipt'             // Acceptable | Damaged or altered | etc.
  | 'itemsConditionSpecification'         // Details (optional)
  | 'laboratoryCapabilityAssessment'      // Full capability | Partial capability | Lacks capability
  | 'capabilitySpecification';            // Details (optional)

/**
 * SPREADSHEET DATA FIELDS - From EquipmentSpreadsheetData interface
 */
export type SpreadsheetDataKey =
  | 'spreadsheetId'           // Unique identifier
  | 'measurementResult'       // Calculated result (optional)
  | 'unit'                    // Unit of measurement (optional)
  | 'method'                  // Measurement method reference (optional)
  | 'analyst'                 // Analyst name (optional)
  | 'calculatedAt'            // Calculation timestamp (optional)
  | 'calculatedBy';           // Calculator user ID (optional)

/**
 * Combined data key - All possible dynamic field references
 */
export type DataSourceKey = 
  | `job.${JobDataKey}`
  | `equipment.${EquipmentDataKey}`
  | `equipment[${number}].${EquipmentDataKey}`  // For specific equipment by index
  | `customer.${CustomerDataKey}`
  | `company.${CompanyDataKey}`
  | `serviceInfo.${ServiceInfoDataKey}`
  | `workAuth.${WorkAuthDataKey}`
  | `spreadsheet.${SpreadsheetDataKey}`
  | `spreadsheet[${number}].${SpreadsheetDataKey}`; // For specific equipment's spreadsheet

// ============================================================================
// REPORT ELEMENTS (Building Blocks)
// ============================================================================

/**
 * Text alignment options
 */
export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

/**
 * Font weight options
 */
export type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';

/**
 * Font style options
 */
export type FontStyle = 'normal' | 'italic' | 'oblique';

/**
 * Common styling properties for text elements
 */
export interface TextStyling {
  fontSize: number;           // Font size in pt
  fontFamily?: string;        // Font family name (default: system)
  fontWeight?: FontWeight;    // Font weight (default: normal)
  fontStyle?: FontStyle;      // Font style (default: normal)
  color?: string;             // Text color in hex (default: #000000)
  backgroundColor?: string;   // Background color in hex (optional)
  textAlign?: TextAlignment;  // Text alignment (default: left)
  lineHeight?: number;        // Line height multiplier (default: 1.5)
  letterSpacing?: number;     // Letter spacing in pt (default: 0)
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'; // Text transform
}

/**
 * Positioning for absolute-positioned elements
 */
export interface Position {
  x: number;  // X coordinate in mm from left margin
  y: number;  // Y coordinate in mm from top margin
}

/**
 * Dimensions for sized elements
 */
export interface Dimensions {
  width?: number;   // Width in mm (optional, auto if not specified)
  height?: number;  // Height in mm (optional, auto if not specified)
}

/**
 * Border styling
 */
export interface BorderStyle {
  width: number;      // Border width in pt
  color: string;      // Border color in hex
  style?: 'solid' | 'dashed' | 'dotted';  // Border style (default: solid)
  radius?: number;    // Border radius in pt (optional)
}

/**
 * Padding (internal spacing)
 */
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Base element interface - common properties for all elements
 */
export interface BaseElement {
  id: string;                 // Unique element identifier
  type: string;               // Element type discriminator
  name?: string;              // Optional element name for UI
  visible?: boolean;          // Visibility flag (default: true)
  position?: Position;        // Absolute positioning (optional)
  zIndex?: number;            // Stacking order (optional, default: 0)
}

/**
 * STATIC TEXT ELEMENT
 * For fixed text content (e.g., "Calibration Certificate", "Issued By:")
 */
export interface StaticTextElement extends BaseElement {
  type: 'static-text';
  content: string;            // The static text content
  styling: TextStyling;       // Text styling options
  dimensions?: Dimensions;    // Size constraints (optional)
  border?: BorderStyle;       // Border styling (optional)
  padding?: Padding;          // Internal spacing (optional)
}

/**
 * DYNAMIC FIELD ELEMENT
 * For data-bound fields (e.g., {{job.jobId}}, {{customer.name}})
 */
export interface DynamicFieldElement extends BaseElement {
  type: 'dynamic-field';
  dataSource: DataSourceKey; // The data key to bind to
  label?: string;             // Optional label to show before value (e.g., "Job ID:")
  labelStyling?: TextStyling; // Styling for the label (optional)
  valueStyling: TextStyling;  // Styling for the value
  formatting?: {              // Optional formatting rules
    dateFormat?: string;      // For date fields (e.g., "YYYY-MM-DD", "DD/MM/YYYY")
    numberFormat?: {          // For number fields
      decimals?: number;      // Number of decimal places
      thousandsSeparator?: boolean; // Use thousands separator
      prefix?: string;        // Prefix (e.g., "$")
      suffix?: string;        // Suffix (e.g., " kg")
    };
    uppercase?: boolean;      // Convert to uppercase
    lowercase?: boolean;      // Convert to lowercase
    trim?: boolean;           // Trim whitespace (default: true)
  };
  fallbackValue?: string;     // Value to show if data source is empty (optional)
  dimensions?: Dimensions;    // Size constraints (optional)
  border?: BorderStyle;       // Border styling (optional)
  padding?: Padding;          // Internal spacing (optional)
}

/**
 * IMAGE ELEMENT
 * For logos, signatures, or other images
 */
export interface ImageElement extends BaseElement {
  type: 'image';
  source: string | DataSourceKey; // Static URL or dynamic data key
  alt?: string;               // Alt text for accessibility
  dimensions?: Dimensions;    // Size constraints (required for images)
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'; // How image fits in dimensions
  border?: BorderStyle;       // Border styling (optional)
}

/**
 * LINE ELEMENT
 * For separators and visual dividers
 */
export interface LineElement extends BaseElement {
  type: 'line';
  startX: number;             // Start X coordinate in mm
  startY: number;             // Start Y coordinate in mm
  endX: number;               // End X coordinate in mm
  endY: number;               // End Y coordinate in mm
  strokeWidth: number;        // Line thickness in pt
  strokeColor: string;        // Line color in hex
  strokeStyle?: 'solid' | 'dashed' | 'dotted'; // Line style (default: solid)
}

/**
 * RECTANGLE ELEMENT
 * For boxes, backgrounds, and visual grouping
 */
export interface RectangleElement extends BaseElement {
  type: 'rectangle';
  x: number;                  // X coordinate in mm
  y: number;                  // Y coordinate in mm
  width: number;              // Width in mm
  height: number;             // Height in mm
  fillColor?: string;         // Fill color in hex (optional, transparent if not specified)
  strokeColor?: string;       // Border color in hex (optional)
  strokeWidth?: number;       // Border width in pt (optional)
  cornerRadius?: number;      // Corner radius in pt (optional, for rounded rectangles)
}

/**
 * SPACER ELEMENT
 * For creating vertical or horizontal space
 */
export interface SpacerElement extends BaseElement {
  type: 'spacer';
  height?: number;            // Vertical space in mm (for vertical spacers)
  width?: number;             // Horizontal space in mm (for horizontal spacers)
}

/**
 * PAGE BREAK ELEMENT
 * Forces content after this element to start on a new page
 */
export interface PageBreakElement extends BaseElement {
  type: 'page-break';
}

/**
 * QR CODE ELEMENT
 * For generating QR codes (e.g., for job tracking URLs)
 */
export interface QRCodeElement extends BaseElement {
  type: 'qr-code';
  data: string | DataSourceKey; // Static data or dynamic data key
  size: number;               // QR code size in mm
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; // Error correction level (default: M)
  foregroundColor?: string;   // QR code color in hex (default: #000000)
  backgroundColor?: string;   // Background color in hex (default: #FFFFFF)
}

/**
 * SIGNATURE FIELD ELEMENT
 * For signature placeholders
 */
export interface SignatureFieldElement extends BaseElement {
  type: 'signature-field';
  label?: string;             // Label (e.g., "Customer Signature:")
  labelStyling?: TextStyling; // Label styling
  signatureDataSource?: DataSourceKey; // Data source for signature image (optional)
  dimensions?: Dimensions;    // Size for signature area
  showSignatureLine?: boolean; // Show a line for manual signatures (default: true)
  showSignedDate?: boolean;   // Show signature date (default: true)
  dateStyling?: TextStyling;  // Date styling
  border?: BorderStyle;       // Border styling (optional)
}

/**
 * DISCRIMINATED UNION - All possible element types
 */
export type ReportElement =
  | StaticTextElement
  | DynamicFieldElement
  | ImageElement
  | LineElement
  | RectangleElement
  | SpacerElement
  | PageBreakElement
  | QRCodeElement
  | SignatureFieldElement;

// ============================================================================
// REPORT SECTIONS
// ============================================================================

/**
 * Section type discriminator
 */
export type SectionType = 'header' | 'body' | 'footer';

/**
 * Report section - Container for elements
 */
export interface ReportSection {
  id: string;                 // Section identifier
  type: SectionType;          // Section type
  name?: string;              // Optional section name for UI
  elements: ReportElement[];  // Elements in this section
  repeatOnEveryPage?: boolean; // For headers/footers (default: false)
  visible?: boolean;          // Section visibility (default: true)
  backgroundColor?: string;   // Section background color in hex (optional)
  padding?: Padding;          // Section padding (optional)
  border?: BorderStyle;       // Section border (optional)
  minHeight?: number;         // Minimum section height in mm (optional)
  maxHeight?: number;         // Maximum section height in mm (optional)
}

// ============================================================================
// REPORT TEMPLATE (Root Object)
// ============================================================================

/**
 * Complete PDF report template definition
 */
export interface ReportTemplate {
  id: string;                 // Template document ID
  name: string;               // Template name
  description?: string;       // Template description (optional)
  version: string;            // Template version (e.g., "1.0.0")
  category?: 'certificate' | 'report' | 'job-sheet' | 'custom'; // Template category
  pageSettings: PageSettings; // Page configuration
  sections: ReportSection[];  // Template sections (header, body, footer)
  metadata?: {                // Optional metadata
    author?: string;          // Template author
    createdAt?: Date;         // Creation timestamp
    updatedAt?: Date;         // Last update timestamp
    tags?: string[];          // Tags for organization
  };
}

// ============================================================================
// TEMPLATE INPUT (For creating/updating templates)
// ============================================================================

export interface ReportTemplateInput {
  name: string;
  description?: string;
  version?: string;           // Optional, will auto-increment if not provided
  category?: ReportTemplate['category'];
  pageSettings: PageSettings;
  sections: ReportSection[];
}

// ============================================================================
// HELPER TYPE GUARDS
// ============================================================================

export function isStaticTextElement(element: ReportElement): element is StaticTextElement {
  return element.type === 'static-text';
}

export function isDynamicFieldElement(element: ReportElement): element is DynamicFieldElement {
  return element.type === 'dynamic-field';
}

export function isImageElement(element: ReportElement): element is ImageElement {
  return element.type === 'image';
}

export function isLineElement(element: ReportElement): element is LineElement {
  return element.type === 'line';
}

export function isRectangleElement(element: ReportElement): element is RectangleElement {
  return element.type === 'rectangle';
}

export function isSpacerElement(element: ReportElement): element is SpacerElement {
  return element.type === 'spacer';
}

export function isPageBreakElement(element: ReportElement): element is PageBreakElement {
  return element.type === 'page-break';
}

export function isQRCodeElement(element: ReportElement): element is QRCodeElement {
  return element.type === 'qr-code';
}

export function isSignatureFieldElement(element: ReportElement): element is SignatureFieldElement {
  return element.type === 'signature-field';
}



