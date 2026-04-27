# Certificate Number Setup Guide

This guide explains how to set up and use the Certificate Number system in LIMS.

## Overview

The Certificate Number system allows you to generate unique, auto-incrementing certificate numbers for equipment calibration certificates. Each certificate category has its own configuration and running number sequence.

## Setting Up Certificate Numbers

### Step 1: Access Certificate Number Manager

1. Log in as an **Admin** user
2. Navigate to **Settings** (from the main navigation menu)
3. Find and click on the **"Certificate Number Manager"** card

### Step 2: Create a Certificate Category

1. In the Certificate Number Manager modal, click **"Create Category"** or **"Create First Category"**
2. Fill in the form:
   - **Name** (required): A descriptive name for the category (e.g., "Equipment Calibration", "Universal Testing Machine")
   - **Prefix** (required): The prefix text for certificate numbers (e.g., "SCS-UTM")
   - **Separator**: Character to separate parts (default: "-")
   - **Include Year**: Checkbox to include the last 2 digits of the year (YY)
   - **Number Padding**: Number of digits for the running number (1-10, default: 3)
   - **Reset Policy**: Choose "Never" or "Yearly"
   - **Active**: Checkbox to enable/disable this category
3. Click **"Save"**

### Step 3: Format Examples

Certificate numbers are formatted as: `PREFIX-YY-XXX`

Examples:
- With year: `SCS-UTM-26-001`, `SCS-UTM-26-002`, ...
- Without year: `SCS-UTM-001`, `SCS-UTM-002`, ...

Where:
- `PREFIX` = Your configured prefix (e.g., "SCS-UTM")
- `YY` = Last 2 digits of current year (if "Include Year" is enabled)
- `XXX` = Running number with padding (e.g., 001, 002, 003...)

### Step 4: Adjust Current Number (Optional)

To manually set the starting number for a category:

1. Click **"Edit"** on an existing category
2. In the edit form, you'll see **"Current Number"** field
3. Enter the desired starting number (the last issued number)
4. The next certificate will use this number + 1
5. Click **"Save"**

### Step 5: Reset Running Number (Optional)

If a category has "Yearly" reset policy:

1. Click the **"Reset"** button next to the category
2. This resets the running number to 0 for the current year

## Using Certificate Numbers in Spreadsheets

### Step 1: Open Equipment Spreadsheet

1. Navigate to a Job
2. Go to the **Equipment** tab
3. Click the **spreadsheet/document icon** next to an equipment item

### Step 2: Generate Certificate Number

1. Click on an empty cell where you want to insert the certificate number
2. Click the **"Certificate Number"** button in the toolbar (if available)
3. Select a certificate category from the dropdown
4. Click **"Generate"**
5. The certificate number will be inserted into the selected cell
6. The cell will be **locked** (immutable) to prevent accidental changes

### Notes:

- Certificate numbers are **immutable** once generated (cannot be edited)
- Each category maintains its own running number sequence
- Numbers are auto-incremented using Firestore transactions for concurrency safety
- Certificate numbers are stored in locked cells within the spreadsheet data

## Troubleshooting

### Certificate Number Button Not Visible

- Make sure you have at least one **active** certificate category configured
- Check that you have the `certificateNumbers.view` permission (Admin role has this by default)

### Cannot Generate Certificate Number

- Ensure you have selected a cell in the spreadsheet first
- Make sure at least one certificate category exists and is active
- Check browser console for error messages

### Certificate Number Not Rendering in PDF

- Ensure the certificate number was saved in the spreadsheet (click Save in the spreadsheet modal)
- Check that the PDF template uses the `certificate.number` data source
- Verify the certificate number cell is locked (`isLocked: true`) in the spreadsheet data

## Permissions

- **View**: `certificateNumbers.view` - View certificate number configurations
- **Edit**: `certificateNumbers.edit` - Create, edit, and delete certificate categories (Admin only)

## Related Settings

- **Equipment List and Report Number**: Configure equipment list and report number generation (separate from certificate numbers)
- **Job ID Settings**: Configure job ID format and sequence
