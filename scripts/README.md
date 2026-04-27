# Excel Formula and VBA Writer Script

This script allows you to write formulas and VBA code directly to Excel files on your local filesystem.

## Prerequisites

The required packages are already installed:
- `exceljs` - For reading/writing Excel files
- `ts-node` - For running TypeScript files directly

## Usage

### Basic Syntax

```bash
npm run excel:write <excel-file-path> [options]
```

or directly:

```bash
npx ts-node scripts/writeExcelFormulas.ts <excel-file-path> [options]
```

### Options

- `--formula <cell> <formula>` - Add a formula to a cell
- `--value <cell> <value>` - Set a cell value
- `--vba <vba-code>` - Add inline VBA code
- `--vba-file <file-path>` - Add VBA code from a file
- `--sheet <sheet-name>` - Specify worksheet name (default: first sheet)
- `--output <output-path>` - Output file path (default: overwrites input file)

## Examples

### Example 1: Add a simple SUM formula

```bash
npm run excel:write data.xlsx --formula C1 "SUM(A1:B1)"
```

### Example 2: Add multiple formulas

```bash
npm run excel:write data.xlsx \
  --formula C1 "SUM(A1:B1)" \
  --formula D1 "AVERAGE(A1:B1)" \
  --formula E1 "MAX(A1:B1)"
```

### Example 3: Set values and add formulas

```bash
npm run excel:write data.xlsx \
  --value A1 10 \
  --value B1 20 \
  --formula C1 "SUM(A1:B1)"
```

### Example 4: Add formulas to a specific sheet

```bash
npm run excel:write data.xlsx \
  --sheet "Sheet2" \
  --formula C1 "SUM(A1:B1)"
```

### Example 5: Save to a different file

```bash
npm run excel:write input.xlsx \
  --formula C1 "SUM(A1:B1)" \
  --output output.xlsx
```

### Example 6: Add VBA code from a file

First, create a VBA file (e.g., `scripts/macro.vba`):
```vba
Sub HelloWorld()
    MsgBox "Hello from VBA!"
End Sub
```

Then run:
```bash
npm run excel:write data.xlsx --vba-file scripts/macro.vba
```

### Example 7: Complex formula example

```bash
npm run excel:write report.xlsx \
  --value A1 "Revenue" \
  --value B1 1000 \
  --value C1 1500 \
  --formula D1 "SUM(B1:C1)" \
  --formula E1 "AVERAGE(B1:C1)" \
  --formula F1 "IF(D1>2000,\"High\",\"Low\")"
```

## Notes

- Formulas should be provided without the leading `=` sign (the script adds it automatically)
- Cell references are case-insensitive (A1 = a1)
- The script preserves existing data in the Excel file
- VBA support is limited in exceljs - for advanced VBA operations, consider using Excel's COM interface on Windows

## Error Handling

If the Excel file doesn't exist, the script will throw an error. Make sure the file path is correct.

## Advanced Usage

For more complex scenarios, you can modify the script directly (`scripts/writeExcelFormulas.ts`) to:
- Batch process multiple files
- Read formulas from a configuration file
- Apply conditional formatting
- Add charts and shapes

