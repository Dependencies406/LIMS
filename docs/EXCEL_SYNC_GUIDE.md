# Excel Sync Guide - Two-Way Job Synchronization

## Overview

The Excel Sync feature allows you to export job information to Excel, edit it offline, and import it back into the LIMS system. This enables bulk editing and offline work with job data.

## Features

✅ **Export to Syncable Excel** - Export all jobs in a format that can be edited and imported back  
✅ **Import from Excel** - Import edited Excel files and sync changes back to the database  
✅ **Create New Jobs** - Add new jobs by leaving the Job ID empty  
✅ **Update Existing Jobs** - Modify existing jobs by keeping their Job ID  
✅ **Equipment Management** - Sync equipment data separately in the Equipment sheet  
✅ **Validation** - Automatic validation of data during import  
✅ **Error Reporting** - Detailed error and warning messages after import  

## How to Use

### Step 1: Export Jobs to Excel

1. Navigate to the **Jobs** page
2. Click the **Export** button (download icon)
3. Select **"Export Syncable Excel (Edit & Import)"**
4. The Excel file will download with the name `jobs_sync_YYYY-MM-DD.xlsx`

### Step 2: Edit the Excel File

The exported Excel file contains three sheets:

#### **Sheet 1: Instructions**
- Contains detailed instructions on how to use the sync feature
- Read this sheet first for important guidelines

#### **Sheet 2: Jobs**
Contains all job information with the following columns:

| Column | Description | Required | Notes |
|--------|-------------|----------|-------|
| Job ID | Unique job identifier | For updates | Leave empty for new jobs |
| Title | Job title | Yes | Required for all jobs |
| Status | Job status | Yes | Must be: Pending, In Progress, Completed, Halt, Superseded, or Void |
| Customer Code | Customer identifier | Yes | Must match existing customer |
| Customer Name | Customer name | No | |
| Customer Address | Customer address | No | |
| Customer Contact | Contact person | Yes | Required |
| Customer Phone | Phone number | No | |
| Customer Email | Email address | No | |
| Assigned Staff | Staff member name | No | |
| Start Date | Job start date | No | Format: YYYY-MM-DD |
| Schedule Date | Scheduled completion date | No | Format: YYYY-MM-DD |
| Comments | Job comments | No | |
| Certificate Number | Certificate identifier | No | |
| Service Requested | Type of service | No | |
| Reporting Format | Report format | No | |
| Statement of Conformity | Conformity requirement | No | |
| Items Condition | Condition on receipt | No | |
| Lab Capability | Laboratory capability | No | |
| Created At | Creation timestamp | Read-only | |
| Created By | Creator user ID | Read-only | |

#### **Sheet 3: Equipment**
Contains equipment information linked to jobs:

| Column | Description | Required | Notes |
|--------|-------------|----------|-------|
| Job ID | Links to job | Yes | Must match a Job ID in Jobs sheet |
| No. | Equipment number | No | Auto-numbered if not provided |
| Equipment Name | Equipment name | Yes* | Required if Model is empty |
| Manufacturer | Manufacturer name | No | |
| Model | Model number | Yes* | Required if Equipment Name is empty |
| Serial Number | Serial number | No | |
| Calibration Point | Calibration point | No | |
| Calibration Methods | Calibration methods | No | |
| Accessories | Accessories | No | |
| Machine Location | Location | No | |
| Remark | Additional remarks | No | |

*At least one of Equipment Name or Model must be provided.

### Step 3: Import the Excel File

1. After editing the Excel file, save it
2. Return to the **Jobs** page
3. Click the **Import** button (upload icon)
4. Select the edited Excel file
5. Wait for the import to complete
6. Review the import results (created, updated, errors, warnings)

## Import Behavior

### Updating Existing Jobs
- Jobs with a **Job ID** that matches an existing job will be **UPDATED**
- All fields in the Excel file will overwrite the corresponding fields in the database
- Equipment will be **REPLACED** (not merged) with equipment from the Excel file
- If no equipment is provided in Excel, existing equipment is preserved

### Creating New Jobs
- Jobs with an **empty Job ID** will be **CREATED** as new jobs
- A new Job ID will be automatically generated
- **Required fields**: Title, Status, Customer Code, Customer Contact, and at least one Equipment entry
- All other fields are optional

### Equipment Handling
- Equipment is matched to jobs by **Job ID**
- Equipment rows without a matching Job ID will be ignored
- Each job must have at least one equipment entry (for new jobs)
- Equipment is completely replaced during import (not merged)

## Validation Rules

### Status Values
Must be one of:
- `Pending`
- `In Progress`
- `Completed`
- `Halt`
- `Superseded`
- `Void`

### Required Fields for New Jobs
- Title
- Status
- Customer Code
- Customer Contact
- At least one Equipment entry

### Date Format
- Use format: `YYYY-MM-DD` (e.g., `2025-01-15`)
- Invalid dates will be stored as-is (may cause issues)

## Import Results

After importing, you'll see a summary with:

- **Created**: Number of new jobs created
- **Updated**: Number of existing jobs updated
- **Warnings**: Non-critical issues (e.g., missing equipment preserved)
- **Errors**: Critical issues that prevented import (e.g., missing required fields)

### Common Errors

1. **"Title is required"** - Every job must have a title
2. **"Status is required"** - Every job must have a valid status
3. **"Customer Code is required"** - Every job must have a customer code
4. **"Invalid status"** - Status must be one of the valid values
5. **"At least one equipment entry is required"** - New jobs need equipment

## Best Practices

1. **Always export first** - Use the syncable Excel export to ensure proper format
2. **Backup before import** - Export your data before importing changes
3. **Test with small files** - Test the import with a few jobs first
4. **Don't modify Job IDs** - Changing Job IDs will create duplicates
5. **Keep Equipment linked** - Ensure Equipment Job IDs match Jobs sheet
6. **Validate data** - Check for errors before importing
7. **Review warnings** - Pay attention to warnings in the import results

## Troubleshooting

### Import fails with "Jobs sheet not found"
- Ensure your Excel file has a sheet named "Jobs" (case-sensitive)
- Export a new file from the system to get the correct format

### Equipment not importing
- Check that Equipment sheet has "Job ID" column matching Jobs sheet
- Ensure Job IDs match exactly (case-sensitive, no extra spaces)

### Jobs created as duplicates
- Don't modify existing Job IDs in the Excel file
- Leave Job ID empty only for truly new jobs

### Date format issues
- Use YYYY-MM-DD format (e.g., 2025-01-15)
- Avoid using Excel date formats that may not parse correctly

### Status validation errors
- Check that status values match exactly (case-sensitive)
- Use the dropdown validation in Excel if available

## Technical Details

### File Format
- Format: `.xlsx` (Excel 2007+)
- Compatible with: Microsoft Excel, Google Sheets, LibreOffice Calc

### Data Types
- Text fields: Plain text (no formulas)
- Dates: Text in YYYY-MM-DD format
- Numbers: Plain numbers (no formulas)

### Limitations
- Maximum file size: Browser-dependent (typically 10-50MB)
- Maximum rows: Depends on available memory
- Real-time sync: Not supported (manual import/export only)

## Support

For issues or questions:
1. Check the error messages in the import results
2. Review the Instructions sheet in the exported Excel file
3. Verify your Excel file matches the expected format
4. Try exporting a fresh file and comparing formats


