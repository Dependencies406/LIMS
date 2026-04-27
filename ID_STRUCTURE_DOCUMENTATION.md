# ID Structure Documentation

This document explains the numbering structure for **Job IDs** and **Customer Codes** in the LIMS system.

## Overview

The system uses two separate numbering schemes:
1. **Job ID** - Automatically generated for each job/request
2. **Customer Code** - Automatically generated for each customer

---

## Job ID Structure

### Format
```
[ORG-PREFIX]-[JOB-TYPE-PREFIX]-[YY][XXX]
```

### Components
- **ORG-PREFIX**: Organization prefix (e.g., "CPN", "SCS")
  - Configurable in Settings → Job ID Configuration
  - Maximum 10 characters
  - Only uppercase letters and numbers (A-Z, 0-9)
  
- **JOB-TYPE-PREFIX**: Job type prefix (e.g., "CAL" for Calibration)
  - Configurable in Settings → Job ID Configuration
  - Maximum 10 characters
  - Only uppercase letters and numbers (A-Z, 0-9)
  
- **YY**: Last 2 digits of the year (e.g., "25" for 2025)
  - Automatically updated based on current year
  
- **XXX**: Sequential number with zero-padding (e.g., "001", "002", "999")
  - 3 digits with leading zeros
  - Increments automatically for each new job
  - Resets to 001 when year changes (if yearly reset is enabled)

### Example Job IDs
```
CPN-CAL-25001  (Organization: CPN, Type: CAL, Year: 2025, Sequence: 001)
CPN-CAL-25002  (Organization: CPN, Type: CAL, Year: 2025, Sequence: 002)
CPN-CAL-25003  (Organization: CPN, Type: CAL, Year: 2025, Sequence: 003)
SCS-REP-25123  (Organization: SCS, Type: REP, Year: 2025, Sequence: 123)
```

### Configuration Location
**Settings → Job ID Configuration**

Settings include:
- `organizationPrefix`: Organization abbreviation (default: "CPN")
- `jobTypePrefix`: Job type abbreviation (default: "CAL")
- `currentYear`: Current year (e.g., 2025)
- `currentSequence`: Next sequence number (auto-increments)
- `yearlyReset`: Whether to reset sequence to 001 on year change (default: true)

### How It Works
1. When creating a new job, the system automatically generates the next Job ID
2. The sequence number increments after the job is saved
3. If yearly reset is enabled, the sequence resets to 001 on January 1st
4. The system previews the next Job ID before creation

---

## Customer Code Structure

### Format
```
[PREFIX]-[YY][XXX]
```

### Components
- **PREFIX**: Customer prefix (e.g., "CUS", "CUST")
  - Configurable in Settings → Customer ID Configuration
  - Typically 3-5 characters
  
- **YY**: Last 2 digits of the year (e.g., "25" for 2025)
  - Automatically updated based on current year
  
- **XXX**: Sequential number with zero-padding (e.g., "001", "002", "999")
  - 3 digits with leading zeros
  - Increments automatically for each new customer
  - Resets to 001 when year changes (if yearly reset is enabled)

### Example Customer Codes
```
CUS-25001  (Prefix: CUS, Year: 2025, Sequence: 001)
CUS-25002  (Prefix: CUS, Year: 2025, Sequence: 002)
CUS-25003  (Prefix: CUS, Year: 2025, Sequence: 003)
CUST-25123 (Prefix: CUST, Year: 2025, Sequence: 123)
```

### Configuration Location
**Settings → Customer ID Configuration**

Settings include:
- `prefix`: Customer prefix (default: "CUS")
- `currentYear`: Current year (e.g., 2025)
- `currentSequence`: Next sequence number (auto-increments)
- `yearlyReset`: Whether to reset sequence to 001 on year change (default: true)

### How It Works
1. When creating a new customer, the system automatically generates the next Customer Code
2. The sequence number increments after the customer is saved
3. If yearly reset is enabled, the sequence resets to 001 on January 1st
4. The system previews the next Customer Code before creation

---

## Relationship Between Job ID and Customer Code

### How They Work Together
- **Job ID** is unique to each job/request and is automatically generated
- **Customer Code** is unique to each customer and is automatically generated
- When creating a job, you **select an existing customer** by their Customer Code
- The Job ID and Customer Code are **independent** - they don't share numbering

### Example Workflow
1. **Create Customer**: System generates `CUS-25001`
2. **Create Job for that Customer**: System generates `CPN-CAL-25001`
3. The job is linked to customer `CUS-25001` via the `customerCode` field
4. The Job ID (`CPN-CAL-25001`) and Customer Code (`CUS-25001`) are separate identifiers

### In the Database
- **Job** object contains:
  - `jobId`: The Job ID (e.g., "CPN-CAL-25001")
  - `customerCode`: Reference to the Customer Code (e.g., "CUS-25001")
  - `customerName`: Customer name (for display purposes)

---

## Summary Table

| Field | Format | Example | Auto-Generated | Configurable |
|-------|--------|---------|----------------|--------------|
| **Job ID** | `[ORG]-[TYPE]-[YY][XXX]` | `CPN-CAL-25001` | ✅ Yes | ✅ Yes (prefixes) |
| **Customer Code** | `[PREFIX]-[YY][XXX]` | `CUS-25001` | ✅ Yes | ✅ Yes (prefix) |

---

## Configuration Files

- **Job ID Settings**: Stored in Firestore at `system/jobIdSettings`
- **Customer ID Settings**: Stored in Firestore at `system/customerIdSettings`

---

## Notes

1. Both IDs automatically increment sequences after creation
2. Yearly reset is optional but recommended for clean annual numbering
3. Prefixes can be customized per organization/business needs
4. Sequence numbers are zero-padded to ensure consistent formatting
5. The system validates ID formats to ensure they contain only valid characters
6. Maximum sequence per year: 999 (000-999)
