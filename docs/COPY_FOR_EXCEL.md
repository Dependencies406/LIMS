# Copy for Excel (Job Details)

On the **Job details** page, in the **Equipment** section, you can copy job and equipment data to the clipboard in a format that pastes cleanly into Excel (tab/newline-separated).

## Where the buttons are

- **Copy all for Excel** – In the Equipment section header, next to the "Add Equipment" button. Copies the current job’s key info plus **all** equipment (and any equipment table/computed grid data).
- **Copy** (per row) – In each equipment row’s action area (next to Expand and Delete). Copies the job info plus **that equipment only** (and its table data if present).

## What gets copied

1. **Job information** – Job ID, Title, Customer, Status, Contact, Received date, Schedule date, Completed date (label–value pairs, then a blank line).
2. **Equipment table** – One header row and one data row per included equipment: Name, Manufacturer, Model, Serial Number, Calibration Point, Calibration Methods, Accessories, Location, Remark, Certificate Number.
3. **Equipment table data** – For each equipment that has stored computed grids (same data as used in PDFs), each tab is output as a small TSV block with a “Equipment table: … – Tab: …” line, then one row per table row, tab-separated columns.

Format is TSV-friendly (tabs between cells, newlines between rows) so pasting into Excel preserves columns and rows.

## If clipboard fails

If the browser denies clipboard access or the write fails, a **fallback modal** opens with the full text and a “Copy to clipboard” button (and “Close”). You can also select all in the textarea and copy manually.

## Implementation note

- **Location:** `src/pages/JobDetailPage.tsx` – Equipment section header and each equipment row; `buildCopyForExcelText` and `handleCopyForExcel`; copy fallback modal at the bottom of the component.
- **Data source:** Job and equipment from current form/state; equipment table data from `equipment[].spreadsheetData.computedGrids` (same source as PDF rendering).
