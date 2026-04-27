# Quick Start Guide - Writing Formulas to Excel Files

## Yes, you can write formulas and VBA directly to Excel files!

I've created a script that allows you to write formulas and VBA code directly to local Excel files.

## Installation

Everything is already installed! The following packages were added:
- ✅ `exceljs` - For Excel file manipulation
- ✅ `ts-node` - For running TypeScript scripts

## Quick Examples

### Example 1: Add a simple formula

```bash
npm run excel:write yourfile.xlsx --formula C1 "SUM(A1:B1)"
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
npm run excel:write report.xlsx \
  --value A1 10 \
  --value B1 20 \
  --formula C1 "SUM(A1:B1)"
```

### Example 4: Work with a specific sheet

```bash
npm run excel:write data.xlsx \
  --sheet "Sheet2" \
  --formula C1 "SUM(A1:B1)"
```

### Example 5: Save to a new file (don't overwrite original)

```bash
npm run excel:write input.xlsx \
  --formula C1 "SUM(A1:B1)" \
  --output output.xlsx
```

### Example 6: Add VBA code

Create a file `macro.vba`:
```vba
Sub HelloWorld()
    MsgBox "Hello from VBA!"
End Sub
```

Then run:
```bash
npm run excel:write data.xlsx --vba-file macro.vba
```

## Using the Script Programmatically

You can also use the functions in your own code:

```typescript
import { processExcelFile } from './scripts/writeExcelFormulas';

await processExcelFile({
  filePath: 'data.xlsx',
  formulas: [
    { cell: 'C1', formula: 'SUM(A1:B1)' },
    { cell: 'D1', formula: 'AVERAGE(A1:B1)' },
  ],
  values: [
    { cell: 'A1', value: 10 },
    { cell: 'B1', value: 20 },
  ],
});
```

## Important Notes

1. **File Path**: Use absolute paths or paths relative to your project root
2. **Formulas**: Don't include the `=` sign (it's added automatically)
3. **Cell References**: Case-insensitive (A1 = a1)
4. **VBA Support**: Limited - exceljs can preserve existing VBA but adding new VBA has limitations

## Get Help

Run with `--help` flag:
```bash
npm run excel:write -- --help
```

## Files Created

- `scripts/writeExcelFormulas.ts` - Main script
- `scripts/README.md` - Detailed documentation
- `scripts/example-usage.ts` - Example code for programmatic usage
- `scripts/tsconfig.json` - TypeScript configuration for scripts

## Need More?

See `scripts/README.md` for detailed documentation and more examples.

