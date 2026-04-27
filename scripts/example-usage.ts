/**
 * Example: Programmatic usage of Excel formula writer
 * 
 * This file demonstrates how to use the writeExcelFormulas functions
 * programmatically in your own code.
 */

import { processExcelFile } from './writeExcelFormulas';
import * as path from 'path';

/**
 * Example 1: Add formulas to an Excel file
 */
async function example1() {
  const excelFile = path.join(__dirname, '../example.xlsx');
  
  await processExcelFile({
    filePath: excelFile,
    formulas: [
      { cell: 'C1', formula: 'SUM(A1:B1)' },
      { cell: 'D1', formula: 'AVERAGE(A1:B1)' },
      { cell: 'E1', formula: 'MAX(A1:B1)' },
    ],
    values: [
      { cell: 'A1', value: 10 },
      { cell: 'B1', value: 20 },
    ],
  });
  
  console.log('✅ Example 1 completed!');
}

/**
 * Example 2: Add formulas to a specific sheet
 */
async function example2() {
  const excelFile = path.join(__dirname, '../data.xlsx');
  
  await processExcelFile({
    filePath: excelFile,
    sheetName: 'Calculations',
    formulas: [
      { cell: 'C10', formula: 'SUM(A10:B10)' },
      { cell: 'D10', formula: 'IF(C10>100,"High","Low")' },
    ],
    outputPath: path.join(__dirname, '../output.xlsx'),
  });
  
  console.log('✅ Example 2 completed!');
}

/**
 * Example 3: Add VBA code
 */
async function example3() {
  const excelFile = path.join(__dirname, '../macro.xlsx');
  
  const vbaCode = `
Sub HelloWorld()
    MsgBox "Hello from VBA!"
End Sub

Sub CalculateTotal()
    Dim total As Double
    total = Range("A1").Value + Range("B1").Value
    Range("C1").Value = total
End Sub
`.trim();
  
  await processExcelFile({
    filePath: excelFile,
    vbaCode: vbaCode,
    formulas: [
      { cell: 'C1', formula: 'SUM(A1:B1)' },
    ],
  });
  
  console.log('✅ Example 3 completed!');
}

// Run examples (comment out the ones you don't want to run)
async function runExamples() {
  try {
    console.log('Running example 1...\n');
    // await example1();
    
    console.log('\nRunning example 2...\n');
    // await example2();
    
    console.log('\nRunning example 3...\n');
    // await example3();
    
    console.log('\n⚠️  Note: Examples are commented out. Uncomment the ones you want to run.');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Uncomment to run
// runExamples();

