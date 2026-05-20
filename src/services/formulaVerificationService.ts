/**
 * Formula Verification Service
 * Provides step-by-step formula calculation verification
 */

import type { SpreadsheetModel } from '../modules/spreadsheet/models/SpreadsheetModel';
import { evaluateSpreadsheet } from '../modules/spreadsheet/services/spreadsheetEngine';
import { generateCellId } from '../modules/spreadsheet/models/SpreadsheetModel';
import { getSpreadsheetCells, getSpreadsheetColumnDefinitions, getSpreadsheetColumnOrder } from '../modules/spreadsheet/utils/tabMigration';

export interface StepApproval {
  signatureData?: string; // Base64 encoded signature image
  reviewerName: string;
  approvedDate: Date;
}

export interface FormulaStep {
  step: number;
  description: string;
  expression: string;
  result: number | string | boolean | null;
  subSteps?: FormulaStep[];
  approval?: StepApproval;
}

export interface CellVerification {
  cellId: string;
  columnName: string;
  formula: string;
  inputValues: Map<string, { cellId: string; value: number | string | boolean | null; displayValue: string }>;
  calculationSteps: FormulaStep[];
  finalResult: number | string | boolean | null;
  displayValue: string;
  error?: string;
}

export interface RowVerification {
  rowIndex: number;
  rowData: Map<string, { cellId: string; value: number | string | boolean | null; displayValue: string }>;
  formulaVerifications: CellVerification[];
}

/**
 * Verify formulas for a specific row
 */
export async function verifyRowFormulas(
  spreadsheet: SpreadsheetModel,
  rowIndex: number,
  tabId?: string
): Promise<RowVerification> {
  const columnOrder = getSpreadsheetColumnOrder(spreadsheet, tabId) || [];
  const columnDefs = getSpreadsheetColumnDefinitions(spreadsheet, tabId) || new Map();
  const cells = getSpreadsheetCells(spreadsheet, tabId);
  
  // Get all cell values in this row
  const rowData = new Map<string, { cellId: string; value: number | string | boolean | null; displayValue: string }>();
  
  columnOrder.forEach((colName, colIndex) => {
    const cellId = generateCellId(rowIndex, colIndex);
    const cell = cells.get(cellId);
    
    if (cell) {
      rowData.set(colName, {
        cellId,
        value: cell.rawValue,
        displayValue: cell.displayValue || String(cell.rawValue || ''),
      });
    } else {
      // Even if cell doesn't exist, add placeholder for column
      rowData.set(colName, {
        cellId,
        value: null,
        displayValue: '',
      });
    }
  });
  
  // Evaluate spreadsheet to get calculated values
  const evalResult = evaluateSpreadsheet(spreadsheet);
  
  // Find all formula columns
  const formulaVerifications: CellVerification[] = [];
  
  columnOrder.forEach((colName, colIndex) => {
    const colDef = columnDefs.get(colName);
    if (colDef && colDef.formula) {
      const cellId = generateCellId(rowIndex, colIndex);
      const verification = traceFormulaCalculation(
        spreadsheet,
        cellId,
        colDef.formula,
        colName,
        evalResult,
        rowIndex
      );
      formulaVerifications.push(verification);
    }
  });
  
  return {
    rowIndex,
    rowData,
    formulaVerifications,
  };
}

/**
 * Trace formula calculation step by step
 */
function traceFormulaCalculation(
  spreadsheet: SpreadsheetModel,
  cellId: string,
  formula: string,
  columnName: string,
  evalResult: any,
  rowIndex: number
): CellVerification {
  const cellResult = evalResult.cellResults.get(cellId);
  
  // Extract input values (cell references used in formula)
  const inputValues = extractInputValues(spreadsheet, formula, rowIndex);
  
  // Build calculation steps
  const calculationSteps = buildCalculationSteps(
    spreadsheet,
    formula,
    cellId,
    inputValues,
    evalResult,
    rowIndex
  );
  
  return {
    cellId,
    columnName,
    formula,
    inputValues,
    calculationSteps,
    finalResult: cellResult?.value ?? null,
    displayValue: cellResult?.displayValue ?? '#ERROR',
    error: cellResult?.error,
  };
}

/**
 * Extract input values from formula
 */
function extractInputValues(
  spreadsheet: SpreadsheetModel,
  formula: string,
  rowIndex: number
): Map<string, { cellId: string; value: number | string | boolean | null; displayValue: string }> {
  const inputValues = new Map();
  const columnOrder = spreadsheet.columnOrder || [];
  
  // Parse formula to find cell references (e.g., A1, B2)
  const cellRefRegex = /([A-Z]+)(\d+)/gi;
  let match;
  
  while ((match = cellRefRegex.exec(formula)) !== null) {
    const colLetter = match[1];
    const refRow = parseInt(match[2]) - 1;
    const colIndex = columnLetterToIndex(colLetter);
    
    if (colIndex >= 0 && colIndex < columnOrder.length) {
      const refCellId = generateCellId(refRow, colIndex);
      const cells = getSpreadsheetCells(spreadsheet);
      const cell = cells.get(refCellId);
      
      if (cell) {
        inputValues.set(match[0], {
          cellId: refCellId,
          value: cell.rawValue,
          displayValue: cell.displayValue || String(cell.rawValue || ''),
        });
      }
    }
  }
  
  // Find column references (e.g., A, B) - refers to current row
  const columnRefRegex = /\b([A-Z]+)(?!\d)\b/gi;
  const processedColumns = new Set<string>();
  
  while ((match = columnRefRegex.exec(formula)) !== null) {
    const colLetter = match[1];
    
    // Skip if it's a function name (SUM, AVG, etc.)
    const functionNames = ['SUM', 'AVG', 'AVERAGE', 'MIN', 'MAX', 'STDEV', 'VAR', 'COUNT', 'COUNTA', 
                          'MEDIAN', 'MODE', 'ROUND', 'IF', 'AND', 'OR', 'NOT', 'ABS', 'SQRT', 'POWER',
                          'EXP', 'LN', 'LOG', 'MOD', 'PI', 'SIN', 'COS', 'TAN', 'TODAY', 'NOW'];
    if (functionNames.includes(colLetter.toUpperCase())) {
      continue;
    }
    
    if (processedColumns.has(colLetter)) continue;
    processedColumns.add(colLetter);
    
    const colIndex = columnLetterToIndex(colLetter);
    
    if (colIndex >= 0 && colIndex < columnOrder.length) {
      const cellId = generateCellId(rowIndex, colIndex);
      const cells = getSpreadsheetCells(spreadsheet);
      const cell = cells.get(cellId);
      
      if (cell) {
        inputValues.set(colLetter, {
          cellId,
          value: cell.rawValue,
          displayValue: cell.displayValue || String(cell.rawValue || ''),
        });
      } else {
        // Cell doesn't exist, but column reference is in formula
        inputValues.set(colLetter, {
          cellId,
          value: null,
          displayValue: '',
        });
      }
    }
  }
  
  return inputValues;
}

/**
 * Build step-by-step calculation breakdown
 */
function buildCalculationSteps(
  _spreadsheet: SpreadsheetModel,
  formula: string,
  cellId: string,
  inputValues: Map<string, any>,
  evalResult: any,
  _rowIndex: number
): FormulaStep[] {
  const steps: FormulaStep[] = [];
  
  // Step 1: Show original formula
  steps.push({
    step: 1,
    description: 'Original Formula',
    expression: formula,
    result: null,
  });
  
  // Step 2: Substitute cell references with values
  let substitutedFormula = formula;
  const substitutions: FormulaStep[] = [];
  
  // Sort substitutions by length (longest first) to avoid partial replacements
  const sortedRefs = Array.from(inputValues.keys()).sort((a, b) => b.length - a.length);
  
  sortedRefs.forEach((ref) => {
    const value = inputValues.get(ref);
    if (value) {
      const numValue = typeof value.value === 'number' ? value.value : 
                       (value.value !== null && value.value !== undefined ? parseFloat(String(value.value)) : null);
      
      if (numValue !== null && !isNaN(numValue)) {
        // Replace cell reference with numeric value
        const regex = new RegExp(`\\b${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        substitutedFormula = substitutedFormula.replace(regex, String(numValue));
        substitutions.push({
          step: substitutions.length + 1,
          description: `${ref} = ${value.displayValue}`,
          expression: '',
          result: numValue,
        });
      } else if (value.value !== null && value.value !== undefined) {
        // Non-numeric value
        substitutedFormula = substitutedFormula.replace(
          new RegExp(`\\b${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
          String(value.value)
        );
        substitutions.push({
          step: substitutions.length + 1,
          description: `${ref} = ${value.displayValue}`,
          expression: '',
          result: value.value,
        });
      }
    }
  });
  
  if (substitutions.length > 0) {
    steps.push({
      step: 2,
      description: 'Substitute Cell References',
      expression: substitutedFormula,
      result: null,
      subSteps: substitutions,
    });
  }
  
  // Step 3: Parse and evaluate step by step
  const parsedSteps = parseFormulaSteps(substitutedFormula);
  parsedSteps.forEach((step, _idx) => {
    steps.push({
      step: steps.length + 1,
      description: step.description,
      expression: step.expression,
      result: step.result,
    });
  });
  
  // Final step: Show result
  const cellResult = evalResult.cellResults.get(cellId);
  if (cellResult && cellResult.success) {
    steps.push({
      step: steps.length + 1,
      description: 'Final Result',
      expression: substitutedFormula,
      result: cellResult.value,
    });
  } else if (cellResult && cellResult.error) {
    steps.push({
      step: steps.length + 1,
      description: 'Error',
      expression: substitutedFormula,
      result: null,
      subSteps: [{
        step: 1,
        description: cellResult.error,
        expression: '',
        result: null,
      }],
    });
  }
  
  return steps;
}

/**
 * Parse formula into evaluation steps
 */
function parseFormulaSteps(formula: string): FormulaStep[] {
  const steps: FormulaStep[] = [];
  
  // Remove leading = if present
  let expr = formula.trim();
  if (expr.startsWith('=')) {
    expr = expr.substring(1).trim();
  }
  
  // Check for functions
  const functionMatch = expr.match(/^(\w+)\s*\((.*)\)$/i);
  if (functionMatch) {
    const funcName = functionMatch[1].toUpperCase();
    const args = functionMatch[2];
    
    // Handle common functions
    if (funcName === 'SUM' || funcName === 'AVG' || funcName === 'AVERAGE') {
      const argValues = parseFunctionArguments(args);
      const sum = argValues.reduce((a, b) => a + b, 0);
      
      if (funcName === 'SUM') {
        steps.push({
          step: 1,
          description: `Evaluate ${funcName} Function`,
          expression: `${funcName}(${args})`,
          result: sum,
          subSteps: argValues.map((val, idx) => ({
            step: idx + 1,
            description: `Argument ${idx + 1}: ${val}`,
            expression: '',
            result: val,
          })),
        });
      } else if (funcName === 'AVG' || funcName === 'AVERAGE') {
        steps.push({
          step: 1,
          description: `Calculate Sum for ${funcName}`,
          expression: `SUM(${args})`,
          result: sum,
        });
        steps.push({
          step: 2,
          description: `Calculate Average (Sum / Count)`,
          expression: `${sum} / ${argValues.length}`,
          result: sum / argValues.length,
        });
      }
    } else if (funcName === 'IF') {
      // IF function - simplified
      steps.push({
        step: 1,
        description: 'Evaluate IF Function',
        expression: expr,
        result: null,
      });
    }
  } else {
    // Handle arithmetic expressions
    // Check for parentheses
    if (expr.includes('(') && expr.includes(')')) {
      const parenMatch = expr.match(/\(([^()]+)\)/);
      if (parenMatch) {
        const innerExpr = parenMatch[1];
        const innerResult = evaluateSimpleExpression(innerExpr);
        steps.push({
          step: 1,
          description: 'Evaluate Expression in Parentheses',
          expression: `(${innerExpr})`,
          result: innerResult,
        });
        expr = expr.replace(`(${innerExpr})`, String(innerResult));
      }
    }
    
    // Handle multiplication and division
    if (expr.includes('*') || expr.includes('/')) {
      const multDivMatch = expr.match(/([\d.]+)\s*([*/])\s*([\d.]+)/);
      if (multDivMatch) {
        const left = parseFloat(multDivMatch[1]);
        const op = multDivMatch[2];
        const right = parseFloat(multDivMatch[3]);
        const result = op === '*' ? left * right : left / right;
        
        steps.push({
          step: steps.length + 1,
          description: `Evaluate ${op === '*' ? 'Multiplication' : 'Division'}`,
          expression: `${left} ${op} ${right}`,
          result: result,
        });
        
        expr = expr.replace(multDivMatch[0], String(result));
      }
    }
    
    // Handle addition and subtraction
    if (expr.includes('+') || expr.includes('-')) {
      const addSubMatch = expr.match(/([\d.]+)\s*([+-])\s*([\d.]+)/);
      if (addSubMatch) {
        const left = parseFloat(addSubMatch[1]);
        const op = addSubMatch[2];
        const right = parseFloat(addSubMatch[3]);
        const result = op === '+' ? left + right : left - right;
        
        steps.push({
          step: steps.length + 1,
          description: `Evaluate ${op === '+' ? 'Addition' : 'Subtraction'}`,
          expression: `${left} ${op} ${right}`,
          result: result,
        });
      }
    }
  }
  
  return steps;
}

/**
 * Parse function arguments
 */
function parseFunctionArguments(args: string): number[] {
  const values: number[] = [];
  const parts = args.split(',').map(s => s.trim());
  
  parts.forEach(part => {
    const num = parseFloat(part);
    if (!isNaN(num)) {
      values.push(num);
    }
  });
  
  return values;
}

/**
 * Evaluate simple arithmetic expression
 */
function evaluateSimpleExpression(expr: string): number {
  try {
    // Simple evaluation - in production, use proper parser
    // This is a simplified version
    const cleaned = expr.replace(/\s/g, '');
    
    // Handle multiplication/division first
    let result = cleaned;
    const multDivRegex = /([\d.]+)\s*([*/])\s*([\d.]+)/g;
    let match;
    while ((match = multDivRegex.exec(cleaned)) !== null) {
      const left = parseFloat(match[1]);
      const op = match[2];
      const right = parseFloat(match[3]);
      const res = op === '*' ? left * right : left / right;
      result = result.replace(match[0], String(res));
    }
    
    // Handle addition/subtraction
    const addSubRegex = /([\d.]+)\s*([+-])\s*([\d.]+)/;
    match = result.match(addSubRegex);
    if (match) {
      const left = parseFloat(match[1]);
      const op = match[2];
      const right = parseFloat(match[3]);
      return op === '+' ? left + right : left - right;
    }
    
    return parseFloat(result) || 0;
  } catch {
    return 0;
  }
}

/**
 * Convert column letter to index (A=0, B=1, etc.)
 */
function columnLetterToIndex(letter: string): number {
  let index = 0;
  const upperLetter = letter.toUpperCase();
  for (let i = 0; i < upperLetter.length; i++) {
    index = index * 26 + (upperLetter.charCodeAt(i) - 64);
  }
  return index - 1;
}
