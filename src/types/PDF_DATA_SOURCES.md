# PDF Template Data Sources - Complete Reference

## Overview
This document lists **EVERY SINGLE DYNAMIC FIELD KEY** available for use in PDF templates.
These are the **REAL** data source keys extracted from your actual codebase.

---

## 🔵 JOB DETAILS FIELDS
**Source:** `Job` interface (`src/types/index.ts` lines 289-326)

Use these keys with prefix: `job.{key}`

| Key | Type | Description | Example Value |
|-----|------|-------------|---------------|
| `id` | string | Job document ID | `"abc123def456"` |
| `jobId` | string | Formatted job ID | `"CPN-CAL-25001"` |
| `title` | string | Job title | `"Calibration Service"` |
| `status` | string | Job status | `"In Progress"` |
| `customerCode` | string | Customer code reference | `"CUST-001"` |
| `customerName` | string | Customer name (optional) | `"Acme Corporation"` |
| `customerAddress` | string | Customer address (optional) | `"123 Main St, City"` |
| `customerContact` | string | Contact person name | `"John Doe"` |
| `customerPhone` | string | Contact phone (optional) | `"+1-555-0123"` |
| `customerEmail` | string | Contact email (optional) | `"john@acme.com"` |
| `assignedStaff` | string | Assigned staff member (optional) | `"Jane Smith"` |
| `startDate` | string | Start date (optional) | `"2025-01-15"` |
| `appointmentDate` | string | Scheduled/confirmed calibration appointment date (optional) | `"2025-01-20"` |
| `comments` | string | Job comments (optional) | `"Handle with care"` |
| `certificateNumber` | string | Certificate number (optional) | `"CERT-1001"` |
| `parentJobId` | string | Parent job if amendment (optional) | `"CPN-CAL-25000"` |
| `amendmentReason` | string | Reason for amendment (optional) | `"Correction of values"` |
| `createdAt` | Date | Creation timestamp | `2025-01-10T10:00:00Z` |
| `updatedAt` | Date | Last update timestamp | `2025-01-15T14:30:00Z` |
| `createdBy` | string | Creator user ID | `"user-abc123"` |

**Usage Examples:**
```typescript
// In your PDF template:
{
  type: 'dynamic-field',
  dataSource: 'job.jobId',
  label: 'Job ID:',
  valueStyling: { fontSize: 12 }
}

{
  type: 'dynamic-field',
  dataSource: 'job.customerName',
  label: 'Customer:',
  valueStyling: { fontSize: 12, fontWeight: 'bold' }
}

{
  type: 'dynamic-field',
  dataSource: 'job.certificateNumber',
  label: 'Certificate No:',
  valueStyling: { fontSize: 14 }
}
```

---

## 🔧 EQUIPMENT FIELDS
**Source:** `Equipment` interface (`src/types/index.ts` lines 141-156)

Use these keys with prefix: `equipment.{key}` or `equipment[0].{key}` for specific item

| Key | Type | Description | Example Value |
|-----|------|-------------|---------------|
| `no` | number | Equipment number (optional) | `1` |
| `name` | string | Equipment name | `"Digital Multimeter"` |
| `manufacturer` | string | Manufacturer name | `"Fluke Corporation"` |
| `model` | string | Model number | `"87V"` |
| `serialNumber` | string | Serial number | `"SN12345678"` |
| `calibrationPoint` | string | Calibration point | `"Voltage: 0-1000V"` |
| `calibrationMethods` | string | Calibration methods | `"ISO/IEC 17025"` |
| `accessories` | string | Accessories description | `"Test leads, manual"` |
| `machineLocation` | string | Machine location | `"Lab A - Bench 3"` |
| `remark` | string | Remarks | `"Good condition"` |

**Usage Examples:**
```typescript
// First equipment item:
{
  type: 'dynamic-field',
  dataSource: 'equipment[0].name',
  label: 'Equipment:',
  valueStyling: { fontSize: 12 }
}

// Table of all equipment:
{
  type: 'table',
  dataSource: 'equipment',
  columns: [
    { id: 'name', header: 'Name', dataSource: 'equipment.name' },
    { id: 'manufacturer', header: 'Manufacturer', dataSource: 'equipment.manufacturer' },
    { id: 'serialNumber', header: 'S/N', dataSource: 'equipment.serialNumber' }
  ]
}
```

---

## 👤 CUSTOMER FIELDS
**Source:** `Customer` interface (`src/types/index.ts` lines 184-193)

Use these keys with prefix: `customer.{key}`

| Key | Type | Description | Example Value |
|-----|------|-------------|---------------|
| `id` | string | Customer document ID | `"cust-abc123"` |
| `customerId` | string | Auto-generated customer ID | `"CPN-CUS-25001"` |
| `customerCode` | string | Customer code | `"CUST-001"` |
| `name` | string | Customer name | `"Acme Corporation"` |
| `address` | string | Customer address | `"123 Main St, City, State"` |
| `isActive` | boolean | Active status | `true` |
| `createdAt` | Date | Creation timestamp | `2025-01-01T00:00:00Z` |
| `updatedAt` | Date | Last update timestamp | `2025-01-10T10:00:00Z` |

**Usage Examples:**
```typescript
{
  type: 'dynamic-field',
  dataSource: 'customer.name',
  label: 'Customer:',
  valueStyling: { fontSize: 14, fontWeight: 'bold' }
}

{
  type: 'dynamic-field',
  dataSource: 'customer.address',
  label: 'Address:',
  valueStyling: { fontSize: 10 }
}
```

---

## 🏢 COMPANY INFORMATION FIELDS
**Source:** `CompanyInfo` interface (`src/types/index.ts` lines 526-552)

Use these keys with prefix: `company.{key}`

| Key | Type | Description | Example Value |
|-----|------|-------------|---------------|
| `companyName` | string | Company name | `"PT. Calibration Services"` |
| `logoBase64` | string | Logo Base64 data URL (optional) | `"data:image/png;base64,..."` |
| `address.street` | string | Street address | `"456 Lab Road"` |
| `address.city` | string | City | `"Jakarta"` |
| `address.state` | string | State/province | `"DKI Jakarta"` |
| `address.postalCode` | string | Postal/ZIP code | `"12345"` |
| `address.country` | string | Country | `"Indonesia"` |
| `contactInfo.phone` | string | Phone number | `"+62-21-1234567"` |
| `contactInfo.email` | string | Email address | `"info@lab.com"` |
| `contactInfo.website` | string | Website (optional) | `"www.lab.com"` |
| `contactInfo.fax` | string | Fax number (optional) | `"+62-21-7654321"` |
| `additionalInfo.taxId` | string | Tax ID (optional) | `"01.234.567.8-901.000"` |
| `additionalInfo.registrationNumber` | string | Registration number (optional) | `"REG-123456"` |
| `additionalInfo.businessLicense` | string | Business license (optional) | `"LIC-789012"` |

**Usage Examples:**
```typescript
{
  type: 'dynamic-field',
  dataSource: 'company.companyName',
  valueStyling: { fontSize: 16, fontWeight: 'bold' }
}

{
  type: 'dynamic-field',
  dataSource: 'company.contactInfo.phone',
  label: 'Phone:',
  valueStyling: { fontSize: 10 }
}

{
  type: 'image',
  source: 'company.logoBase64',
  dimensions: { width: 50, height: 50 }
}
```

---

## 📋 SERVICE INFORMATION FIELDS
**Source:** `ServiceInformation` interface (`src/types/index.ts` lines 257-263)

Use these keys with prefix: `serviceInfo.{key}`

| Key | Type | Description | Example Value |
|-----|------|-------------|---------------|
| `serviceRequested` | string | Service type | `"Calibration"` |
| `reportingFormat` | string | Report format type | `"Standard"` |
| `reportingFormatOther` | string | Custom format (optional) | `"Custom PDF format"` |
| `statementOfConformity` | string | Conformity requirement | `"Required"` |
| `statementOfConformityRequirements` | string | Requirements details (optional) | `"ISO 17025 compliance"` |

**Usage Examples:**
```typescript
{
  type: 'dynamic-field',
  dataSource: 'serviceInfo.serviceRequested',
  label: 'Service:',
  valueStyling: { fontSize: 12 }
}
```

---

## ✅ WORK AUTHORIZATION FIELDS
**Source:** `WorkAuthorization` interface (`src/types/index.ts` lines 273-286)

Use these keys with prefix: `workAuth.{key}`

| Key | Type | Description | Example Value |
|-----|------|-------------|---------------|
| `workAuthorizationStatement` | string | Authorization statement | `"Authorized to proceed"` |
| `itemsConditionOnReceipt` | string | Items condition | `"Acceptable"` |
| `itemsConditionSpecification` | string | Details (optional) | `"All items in good condition"` |
| `laboratoryCapabilityAssessment` | string | Lab capability | `"Full capability"` |
| `capabilitySpecification` | string | Details (optional) | `"Fully equipped for task"` |

**Usage Examples:**
```typescript
{
  type: 'dynamic-field',
  dataSource: 'workAuth.itemsConditionOnReceipt',
  label: 'Items Condition:',
  valueStyling: { fontSize: 10 }
}
```

---

## 📊 SPREADSHEET DATA FIELDS
**Source:** `EquipmentSpreadsheetData` interface (`src/types/index.ts` lines 162-181)

Use these keys with prefix: `spreadsheet.{key}` or `spreadsheet[0].{key}` for specific equipment

| Key | Type | Description | Example Value |
|-----|------|-------------|---------------|
| `spreadsheetId` | string | Unique identifier | `"sheet-abc123"` |
| `measurementResult` | number | Calculated result (optional) | `23.45` |
| `unit` | string | Unit of measurement (optional) | `"°C"` |
| `method` | string | Measurement method (optional) | `"ASTM D1298"` |
| `analyst` | string | Analyst name (optional) | `"Dr. Smith"` |
| `calculatedAt` | Date | Calculation timestamp (optional) | `2025-01-15T14:00:00Z` |
| `calculatedBy` | string | Calculator user ID (optional) | `"user-xyz789"` |

**Usage Examples:**
```typescript
{
  type: 'dynamic-field',
  dataSource: 'spreadsheet[0].measurementResult',
  label: 'Result:',
  valueStyling: { fontSize: 12 },
  formatting: {
    numberFormat: {
      decimals: 2,
      suffix: ' °C'
    }
  }
}

{
  type: 'table',
  dataSource: 'spreadsheet',
  columns: [
    { id: 'result', header: 'Result', dataSource: 'spreadsheet.measurementResult' },
    { id: 'unit', header: 'Unit', dataSource: 'spreadsheet.unit' },
    { id: 'analyst', header: 'Analyst', dataSource: 'spreadsheet.analyst' }
  ]
}
```

---

## 📝 COMPLETE DATA SOURCE KEY EXAMPLES

### Text Fields
```typescript
'job.jobId'
'job.title'
'job.status'
'job.customerName'
'job.certificateNumber'
'equipment.name'
'equipment.manufacturer'
'equipment.serialNumber'
'customer.name'
'customer.address'
'company.companyName'
'company.contactInfo.email'
```

### Date Fields (with formatting)
```typescript
'job.createdAt'         // Format: "dateFormat": "YYYY-MM-DD"
'job.updatedAt'         // Format: "dateFormat": "DD/MM/YYYY"
'job.appointmentDate'
'spreadsheet.calculatedAt'
```

### Number Fields (with formatting)
```typescript
'spreadsheet.measurementResult'  // Format with decimals and units
'equipment.no'
```

### Array Access (for multiple items)
```typescript
'equipment[0].name'      // First equipment
'equipment[1].serialNumber'  // Second equipment
'spreadsheet[0].measurementResult'  // First equipment's spreadsheet
```

---

## 🎯 SUMMARY

**Total Available Fields:**

- **Job Fields:** 19 fields
- **Equipment Fields:** 10 fields (per item, array)
- **Customer Fields:** 8 fields
- **Company Fields:** 14 fields
- **Service Info Fields:** 5 fields
- **Work Authorization Fields:** 5 fields
- **Spreadsheet Fields:** 7 fields (per item, array)

**TOTAL: 68+ dynamic data points available for PDF generation!**

---

## ✅ NEXT STEPS

Now that you have the complete type system and data source reference:

1. ✅ **Type System Created** - `src/types/pdfTemplate.ts`
2. ✅ **Data Sources Documented** - This file
3. 🔄 **Next:** Create PDF Template Builder UI
4. 🔄 **Next:** Create PDF Generation Service
5. 🔄 **Next:** Create Template Storage Service

All data sources are **REAL** - extracted from your actual codebase!

---

**File Created:** `src/types/pdfTemplate.ts`
**Analysis Complete:** ✅
**Ready for UI Development:** ✅



