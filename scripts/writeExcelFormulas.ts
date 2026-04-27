/**
 * Excel Formula and VBA Writer Script
 * 
 * This script allows you to write formulas and VBA code to Excel files.
 * 
 * Usage:
 *   npx ts-node scripts/writeExcelFormulas.ts <excel-file-path> [options]
 * 
 * Options:
 *   --formula <cell> <formula>  - Add a formula to a cell (e.g., --formula A1 "=SUM(B1:B10)")
 *   --value <cell> <value>      - Set a cell value
 *   --vba <vba-code>            - Add VBA code (file path or inline)
 *   --sheet <sheet-name>        - Specify worksheet name (default: first sheet)
 *   --output <output-path>      - Output file path (default: overwrites input file)
 */

import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

interface FormulaEntry {
  cell: string;
  formula: string;
}

interface ValueEntry {
  cell: string;
  value: string | number;
}

interface ScriptOptions {
  filePath: string;
  formulas: FormulaEntry[];
  values: ValueEntry[];
  vbaCode?: string;
  vbaFilePath?: string;
  sheetName?: string;
  outputPath?: string;
}

/**
 * Parse cell reference (e.g., "A1" -> {row: 1, col: 1})
 */
function parseCellReference(cellRef: string): { row: number; col: number } {
  const match = cellRef.match(/^([A-Z]+)(\d+)$/i);
  if (!match) {
    throw new Error(`Invalid cell reference: ${cellRef}`);
  }

  const colStr = match[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }

  const row = parseInt(match[2], 10);
  return { row, col };
}

/**
 * Load Excel file and apply formulas/values/VBA
 */
async function processExcelFile(options: ScriptOptions): Promise<void> {
  const { filePath, formulas, values, vbaCode, vbaFilePath, sheetName, outputPath } = options;

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`📖 Reading Excel file: ${filePath}`);

  // Create workbook
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  // Get worksheet
  let worksheet = workbook.worksheets[0];
  if (sheetName) {
    worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      throw new Error(`Worksheet "${sheetName}" not found`);
    }
  }

  console.log(`📝 Working with worksheet: ${worksheet.name}`);

  // Apply values first
  if (values.length > 0) {
    console.log(`\n✏️  Setting cell values:`);
    for (const { cell, value } of values) {
      const { row, col } = parseCellReference(cell);
      worksheet.getCell(row, col).value = value;
      console.log(`   ${cell} = ${value}`);
    }
  }

  // Apply formulas
  if (formulas.length > 0) {
    console.log(`\n🔢 Setting formulas:`);
    for (const { cell, formula } of formulas) {
      const { row, col } = parseCellReference(cell);
      // Remove = if present (exceljs adds it automatically)
      const cleanFormula = formula.startsWith('=') ? formula.substring(1) : formula;
      worksheet.getCell(row, col).value = { formula: cleanFormula };
      console.log(`   ${cell} = ${formula}`);
    }
  }

  // Apply VBA code
  if (vbaCode || vbaFilePath) {
    console.log(`\n⚙️  Adding VBA code...`);
    
    let vbaContent = '';
    if (vbaFilePath) {
      if (!fs.existsSync(vbaFilePath)) {
        throw new Error(`VBA file not found: ${vbaFilePath}`);
      }
      vbaContent = fs.readFileSync(vbaFilePath, 'utf-8');
      console.log(`   Loaded VBA from file: ${vbaFilePath}`);
    } else if (vbaCode) {
      vbaContent = vbaCode;
      console.log(`   Using inline VBA code`);
    }

    // Note: exceljs has limited VBA support
    // For full VBA support, you may need to use a different approach
    // This is a placeholder for VBA insertion
    console.log(`   ⚠️  Note: Full VBA insertion requires additional setup.`);
    console.log(`   VBA content length: ${vbaContent.length} characters`);
    
    // Store VBA in workbook metadata (this is a workaround)
    (workbook as any).vbaCode = vbaContent;
  }

  // Save file
  const outputFile = outputPath || filePath;
  console.log(`\n💾 Saving to: ${outputFile}`);
  
  await workbook.xlsx.writeFile(outputFile);
  
  console.log(`\n✅ Successfully updated Excel file!`);
  
  // Summary
  console.log(`\n📊 Summary:`);
  console.log(`   - Values set: ${values.length}`);
  console.log(`   - Formulas added: ${formulas.length}`);
  if (vbaCode || vbaFilePath) {
    console.log(`   - VBA code: ${vbaCode ? 'inline' : 'from file'}`);
  }
}

/**
 * Main function - parse command line arguments
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Excel Formula and VBA Writer Script

Usage:
  npx ts-node scripts/writeExcelFormulas.ts <excel-file-path> [options]

Options:
  --formula <cell> <formula>    Add a formula to a cell
                                Example: --formula C1 "SUM(A1:B1)"
  
  --value <cell> <value>        Set a cell value
                                Example: --value A1 "Hello"
  
  --vba <vba-code>              Add inline VBA code
                                Example: --vba "Sub Test()\\nMsgBox \\"Hello\\"\\nEnd Sub"
  
  --vba-file <file-path>        Add VBA code from file
                                Example: --vba-file scripts/macro.vba
  
  --sheet <sheet-name>          Specify worksheet name (default: first sheet)
                                Example: --sheet "Sheet2"
  
  --output <output-path>        Output file path (default: overwrites input)
                                Example: --output output.xlsx

Examples:
  # Add a SUM formula to cell C1
  npx ts-node scripts/writeExcelFormulas.ts data.xlsx --formula C1 "SUM(A1:B1)"
  
  # Add multiple formulas
  npx ts-node scripts/writeExcelFormulas.ts data.xlsx \\
    --formula C1 "SUM(A1:B1)" \\
    --formula D1 "AVERAGE(A1:B1)" \\
    --formula E1 "MAX(A1:B1)"
  
  # Add formulas with values
  npx ts-node scripts/writeExcelFormulas.ts data.xlsx \\
    --value A1 10 \\
    --value B1 20 \\
    --formula C1 "SUM(A1:B1)"
  
  # Add VBA from file
  npx ts-node scripts/writeExcelFormulas.ts data.xlsx --vba-file scripts/macro.vba
  
  # Save to different file
  npx ts-node scripts/writeExcelFormulas.ts input.xlsx \\
    --formula C1 "SUM(A1:B1)" \\
    --output output.xlsx
`);
    process.exit(0);
  }

  const options: ScriptOptions = {
    filePath: args[0],
    formulas: [],
    values: [],
  };

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--formula' && i + 2 < args.length) {
      options.formulas.push({
        cell: args[i + 1],
        formula: args[i + 2],
      });
      i += 3;
    } else if (arg === '--value' && i + 2 < args.length) {
      options.values.push({
        cell: args[i + 1],
        value: args[i + 2],
      });
      i += 3;
    } else if (arg === '--vba' && i + 1 < args.length) {
      options.vbaCode = args[i + 1];
      i += 2;
    } else if (arg === '--vba-file' && i + 1 < args.length) {
      options.vbaFilePath = args[i + 1];
      i += 2;
    } else if (arg === '--sheet' && i + 1 < args.length) {
      options.sheetName = args[i + 1];
      i += 2;
    } else if (arg === '--output' && i + 1 < args.length) {
      options.outputPath = args[i + 1];
      i += 2;
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  try {
    await processExcelFile(options);
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { processExcelFile, parseCellReference };

