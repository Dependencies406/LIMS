/**
 * Spreadsheet Engine
 * Pure calculation engine for evaluating spreadsheet formulas
 * 
 * This module provides formula evaluation, dependency resolution,
 * and circular reference detection without any UI or database logic.
 */

import type {
  SpreadsheetModel,
  Cell,
  Formula as _Formula,
  Variable,
} from '../models/SpreadsheetModel';
import { parseCellId, generateCellId } from '../models/SpreadsheetModel';

/**
 * Evaluation result for a cell
 */
export interface CellEvaluationResult {
  /** Cell ID */
  cellId: string;
  /** Success status */
  success: boolean;
  /** Calculated value */
  value: number | string | boolean | null;
  /** Display value (formatted) */
  displayValue: string;
  /** Error message (if evaluation failed) */
  error?: string;
  /** Dependencies used in calculation */
  dependencies?: string[];
}

/**
 * Spreadsheet evaluation result
 */
export interface SpreadsheetEvaluationResult {
  /** Success status */
  success: boolean;
  /** Cell evaluation results */
  cellResults: Map<string, CellEvaluationResult>;
  /** Circular references detected */
  circularReferences: string[][];
  /** Errors encountered */
  errors: string[];
  /** Evaluation order */
  evaluationOrder: string[];
}

/**
 * Internal cell state during evaluation
 */
interface CellState {
  cell: Cell;
  evaluated: boolean;
  evaluating: boolean;
  value: number | string | boolean | null;
  error?: string;
  dependencies: Set<string>;
}

/**
 * Token types for formula parsing
 */
type TokenType = 
  | 'NUMBER'
  | 'STRING' // Quoted string literal so ")" inside does not break parenthesis balance
  | 'CELL_REF'
  | 'CROSS_TAB_CELL_REF' // SheetName!A1 - cell in another tab (must be resolved from that tab)
  | 'COLUMN_REF'
  | 'CROSS_TAB_REF' // TabName.ColumnValue
  | 'CELL_RANGE'
  | 'VARIABLE'
  | 'FUNCTION'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'COLON'
  | 'DOT' // For cross-tab references
  | 'WHITESPACE';

/**
 * Token for formula parsing
 */
interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Parse number with scientific notation support (matches desktop parse_number_with_scientific)
 * Handles: "2.55E20", "1.5e-10", "999999999", "3.14"
 * Returns float or null if parsing fails
 */
function parseNumberWithScientific(value: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value !== 'string') {
    return null;
  }
  
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  
  try {
    // Remove whitespace and commas (desktop behavior)
    const cleaned = trimmed.replace(/\s/g, '').replace(/,/g, '');
    
    // Check if it contains scientific notation (E or e followed by optional + or - and digits)
    // Desktop regex: r'^[+-]?(\d+\.?\d*|\.\d+)[eE][+-]?\d+$'
    if (/^[+-]?(\d+\.?\d*|\.\d+)[eE][+-]?\d+$/i.test(cleaned)) {
      // Explicit scientific notation
      return parseFloat(cleaned);
    } else if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) {
      // Regular number
      return parseFloat(cleaned);
    } else {
      // Try parseFloat anyway - it might handle edge cases
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Safe math operations with error handling
 */
class SafeMath {
  /**
   * Safe addition
   */
  static add(a: number, b: number): number {
    const result = a + b;
    if (!Number.isFinite(result)) {
      throw new Error(`Addition overflow: ${a} + ${b}`);
    }
    return result;
  }

  /**
   * Safe subtraction
   */
  static subtract(a: number, b: number): number {
    const result = a - b;
    if (!Number.isFinite(result)) {
      throw new Error(`Subtraction overflow: ${a} - ${b}`);
    }
    return result;
  }

  /**
   * Safe multiplication
   */
  static multiply(a: number, b: number): number {
    const result = a * b;
    if (!Number.isFinite(result)) {
      throw new Error(`Multiplication overflow: ${a} * ${b}`);
    }
    return result;
  }

  /**
   * Safe division
   */
  static divide(a: number, b: number): number {
    if (b === 0) {
      // Return 0 to avoid #ERROR cascade when template formulas have empty/missing inputs (e.g. R2, R3 blank)
      return 0;
    }
    const result = a / b;
    if (!Number.isFinite(result)) {
      throw new Error(`Division overflow: ${a} / ${b}`);
    }
    return result;
  }

  /**
   * Safe exponentiation
   */
  static power(base: number, exponent: number): number {
    if (base === 0 && exponent < 0) {
      throw new Error(`Division by zero: ${base} ^ ${exponent}`);
    }
    const result = Math.pow(base, exponent);
    if (!Number.isFinite(result)) {
      throw new Error(`Exponentiation overflow: ${base} ^ ${exponent}`);
    }
    return result;
  }
}

/**
 * Formula parser and evaluator
 */
class FormulaEvaluator {
  private spreadsheet: SpreadsheetModel;
  private cellStates: Map<string, CellState>;
  private variables: Map<string, Variable>;

  constructor(spreadsheet: SpreadsheetModel) {
    this.spreadsheet = spreadsheet;
    this.cellStates = new Map();
    this.variables = new Map();
    
    // Initialize cell states for existing cells
    // Use the provided spreadsheet.cells (active tab in UI)
    // Cross-tab references are resolved via spreadsheet.tabs to avoid cellId collisions.
    const cells = spreadsheet.cells || new Map();
    for (const [cellId, cell] of cells) {
      this.cellStates.set(cellId, {
        cell,
        evaluated: false,
        evaluating: false,
        value: null,
        dependencies: new Set(),
      });
    }
    
    // Also initialize cell states for cells in formula columns that don't exist yet
    // This ensures column-level formulas can be evaluated
    if (spreadsheet.columnDefinitions && spreadsheet.columnOrder) {
      for (let row = 0; row < (spreadsheet.rowCount || 10); row++) {
        for (let col = 0; col < spreadsheet.columnOrder.length; col++) {
          const cellId = generateCellId(row, col);
          
          // Skip if already initialized
          if (this.cellStates.has(cellId)) continue;
          
          // Check if this column has a formula
          const columnName = spreadsheet.columnOrder[col];
          const colDef = spreadsheet.columnDefinitions.get(columnName);
          if (colDef && colDef.formula) {
            // Create a cell state for this formula column cell
            // Set the formula property so it's recognized as a formula cell
            const tempCell: Cell = {
              id: cellId,
              row,
              column: col,
              dataType: 'formula',
              displayValue: '',
              rawValue: null,
              formula: colDef.formula, // Set the formula from column definition
            };
            this.cellStates.set(cellId, {
              cell: tempCell,
              evaluated: false,
              evaluating: false,
              value: null,
              dependencies: new Set(),
            });
          }
        }
      }
    }
    
    // Initialize variables
    for (const [varName, variable] of spreadsheet.variables) {
      this.variables.set(varName, variable);
    }
  }

  /**
   * Tokenize formula expression
   */
  private tokenize(expression: string): Token[] {
    const tokens: Token[] = [];
    let position = 0;
    
    // Remove leading = if present
    if (expression.startsWith('=')) {
      expression = expression.substring(1);
    }
    // Strip Excel absolute reference $ so $E$6 -> E6 (parser does not handle $)
    expression = expression.replace(/\$/g, '');
    // Do NOT strip Sheet!A1 refs - we tokenize them as CROSS_TAB_CELL_REF and resolve from that tab
    expression = expression.trim();
    // Strip surrounding quotes if present (e.g. stored as "=A1")
    if ((expression.startsWith('"') && expression.endsWith('"') && expression.length >= 2) ||
        (expression.startsWith("'") && expression.endsWith("'") && expression.length >= 2)) {
      expression = expression.slice(1, -1);
    }
    
    // Convert to uppercase for consistent cell reference matching
    // But preserve original for display
    const upperExpression = expression.toUpperCase();
    
    const patterns: Array<{ type: TokenType; regex: RegExp }> = [
      { type: 'WHITESPACE', regex: /^\s+/ },
      { type: 'NUMBER', regex: /^-?\d+\.?\d*(?:[eE][+-]?\d+)?/ },
      { type: 'STRING', regex: /^"[^"]*"|'[^']*'/ },
      // Sheet!A1 style cross-tab cell ref (before CELL_REF so "Raw_Data!B7" is one token)
      { type: 'CROSS_TAB_CELL_REF', regex: /^[A-Za-z0-9_\s]+![A-Z]+\d+/i },
      { type: 'CELL_REF', regex: /^[A-Z]+\d+/i }, // Case-insensitive for cell references (A1, B2, etc.)
      // Cross-tab reference must come before COLUMN_REF/VARIABLE so "Measurement.F" is a single token
      { type: 'CROSS_TAB_REF', regex: /^[A-Z_][A-Z0-9_]*\.[A-Z_][A-Z0-9_]*/i },
      { type: 'COLUMN_REF', regex: /^[A-Z]+(?!\d)/i }, // Column-only references (A, B, etc.) - must come after CELL_REF
      { type: 'COLON', regex: /^:/ }, // Colon for ranges (must come before OPERATOR)
      { type: 'DOT', regex: /^\./ }, // Dot for cross-tab references
      { type: 'VARIABLE', regex: /^[a-zA-Z_][a-zA-Z0-9_]*/ },
      { type: 'FUNCTION', regex: /^(SUM|AVG|AVERAGE|MIN|MAX|STDEV|STDEV\.P|STDEV\.S|STDEVP|VAR|VARP|COUNT|COUNTA|MEDIAN|MODE|ROUND|ROUNDUP|ROUNDDOWN|CEILING|FLOOR|TRUNC|ABS|SQRT|POWER|EXP|LN|LOG|MOD|PI|SIN|COS|TAN|ASIN|ACOS|ATAN|DEGREES|RADIANS|IF|AND|OR|NOT|IFERROR|CONCATENATE|LEFT|RIGHT|MID|LEN|UPPER|LOWER|TRIM|TODAY|NOW|YEAR|MONTH|DAY|HOUR|MINUTE|SECOND|PERCENTILE|QUARTILE|TINV)\s*\(/i },
        { type: 'OPERATOR', regex: /^(<=|>=|<>|=|<|>|\+|-|\*|\/|\^)/ },
      { type: 'LPAREN', regex: /^\(/ },
      { type: 'RPAREN', regex: /^\)/ },
      { type: 'COMMA', regex: /^,/ },
    ];
    
    // Use uppercase expression for matching, but preserve original positions
    let matchExpression = upperExpression;
    
    while (position < matchExpression.length) {
      let matched = false;
      
      for (const { type, regex } of patterns) {
        const match = matchExpression.substring(position).match(regex);
        if (match) {
          if (type !== 'WHITESPACE') {
            // For cell references and column references, use uppercase; for others, preserve original case
            const originalValue = expression.substring(position, position + match[0].length);
            const tokenValue = (type === 'CELL_REF' || type === 'COLUMN_REF')
              ? match[0].toUpperCase()
              : originalValue;
            tokens.push({
              type,
              value: tokenValue,
              position,
            });
          }
          position += match[0].length;
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        throw new Error(`Unexpected character at position ${position}: ${expression[position]}`);
      }
    }
    
    return tokens;
  }

  /**
   * Parse and evaluate formula expression
   */
  private evaluateExpression(
    expression: string,
    cellId: string,
    visitedCells: Set<string> = new Set()
  ): number | string | boolean {
    try {
      const tokens = this.tokenize(expression);
      if (tokens.length === 0) {
        throw new Error('Empty expression');
      }
      
      // Build expression tree and evaluate
      return this.evaluateTokens(tokens, cellId, visitedCells);
    } catch (error) {
      throw new Error(`Formula evaluation error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Evaluate tokens using recursive descent parser
   */
  private evaluateTokens(
    tokens: Token[],
    cellId: string,
    visitedCells: Set<string>,
    index: { current: number } = { current: 0 }
  ): number | string | boolean {
    if (index.current >= tokens.length) {
      throw new Error('Unexpected end of expression');
    }

    // Parse expression: term (operator term)*
    let result = this.parseTerm(tokens, cellId, visitedCells, index);
    
    while (index.current < tokens.length) {
      const token = tokens[index.current];
      
      if (token.type === 'OPERATOR') {
        const operator = token.value;
        index.current++;
        
        if (index.current >= tokens.length) {
          throw new Error(`Missing operand after operator ${operator}`);
        }
        
        const right = this.parseTerm(tokens, cellId, visitedCells, index);
        
        const isComparison = operator === '=' || operator === '<' || operator === '>' || operator === '<=' || operator === '>=' || operator === '<>';
        if (!isComparison && (typeof result !== 'number' || typeof right !== 'number')) {
          throw new Error(`Cannot apply operator ${operator} to non-numeric values`);
        }
        
        switch (operator) {
          case '+':
            result = SafeMath.add(result as number, right as number);
            break;
          case '-':
            result = SafeMath.subtract(result as number, right as number);
            break;
          case '*':
            result = SafeMath.multiply(result as number, right as number);
            break;
          case '/':
            result = SafeMath.divide(result as number, right as number);
            break;
          case '^':
            result = SafeMath.power(result as number, right as number);
            break;
          case '=':
            result = (Number(result) === Number(right)) ? 1 : 0;
            break;
          case '<':
            result = (Number(result) < Number(right)) ? 1 : 0;
            break;
          case '>':
            result = (Number(result) > Number(right)) ? 1 : 0;
            break;
          case '<=':
            result = (Number(result) <= Number(right)) ? 1 : 0;
            break;
          case '>=':
            result = (Number(result) >= Number(right)) ? 1 : 0;
            break;
          case '<>':
            result = (Number(result) !== Number(right)) ? 1 : 0;
            break;
          default:
            throw new Error(`Unknown operator: ${operator}`);
        }
      } else {
        break;
      }
    }
    
    return result;
  }

  /**
   * Parse term: factor (operator factor)*
   */
  private parseTerm(
    tokens: Token[],
    cellId: string,
    visitedCells: Set<string>,
    index: { current: number }
  ): number | string | boolean {
    return this.parseFactor(tokens, cellId, visitedCells, index);
  }

  /**
   * Parse factor: number | cell_ref | variable | function | (expression)
   */
  private parseFactor(
    tokens: Token[],
    cellId: string,
    visitedCells: Set<string>,
    index: { current: number }
  ): number | string | boolean {
    if (index.current >= tokens.length) {
      throw new Error('Unexpected end of expression');
    }

    const token = tokens[index.current];

    switch (token.type) {
      case 'NUMBER': {
        index.current++;
        const num = parseFloat(token.value);
        if (isNaN(num)) {
          throw new Error(`Invalid number: ${token.value}`);
        }
        return num;
      }

      case 'STRING': {
        index.current++;
        // Consume string literal so ) inside quotes does not break parenthesis balance; treat as 0 in numeric context
        const inner = token.value.length >= 2 ? token.value.slice(1, -1) : '';
        const asNum = parseNumberWithScientific(inner);
        return asNum !== null ? asNum : 0;
      }

      case 'CELL_REF': {
        index.current++;
        const refCellId = token.value.toUpperCase();
        
        // Single cell reference (ranges are handled in parseFunction)
        // Check for circular reference
        if (visitedCells.has(refCellId)) {
          throw new Error(`Circular reference detected: ${cellId} -> ${refCellId}`);
        }
        
        // Get cell value
        const value = this.getCellValue(refCellId, new Set([...visitedCells, cellId]));
        
        // Track dependency
        const cellState = this.cellStates.get(cellId);
        if (cellState) {
          cellState.dependencies.add(refCellId);
        }
        
        if (typeof value === 'number') return value;
        if (typeof value === 'boolean') return value ? 1 : 0;
        const parsed = parseNumberWithScientific(value);
        if (parsed !== null) return parsed;
        // Label/empty: treat as 0 so formulas don't cascade to #ERROR (e.g. Raw_Data A6 header)
        return 0;
      }

      case 'CROSS_TAB_CELL_REF': {
        index.current++;
        const parts = token.value.split('!');
        if (parts.length !== 2) {
          throw new Error(`Invalid cross-tab cell reference: ${token.value}`);
        }
        const [sheetName, refCellId] = parts;
        const cellIdFromRef = refCellId.trim().toUpperCase();
        const value = this.getCellValueFromTab(sheetName.trim(), cellIdFromRef);
        if (typeof value === 'number') return value;
        if (typeof value === 'boolean') return value ? 1 : 0;
        const parsed = parseNumberWithScientific(value);
        if (parsed !== null) return parsed;
        // Label/empty cells: treat as 0 so formulas (e.g. referencing header row) don't cascade to #ERROR
        return 0;
      }

      case 'COLUMN_REF': {
        index.current++;
        const columnLetter = token.value.toUpperCase();
        
        // Column-only reference (e.g., "A", "B") - refers to the current row in that column
        const { row: currentRow } = parseCellId(cellId);
        const refCellId = `${columnLetter}${currentRow + 1}`;
        
        // Check for circular reference
        if (visitedCells.has(refCellId)) {
          throw new Error(`Circular reference detected: ${cellId} -> ${refCellId}`);
        }
        
        // Get cell value from current row in the referenced column
        const value = this.getCellValue(refCellId, new Set([...visitedCells, cellId]));
        
        // Track dependency
        const cellState = this.cellStates.get(cellId);
        if (cellState) {
          cellState.dependencies.add(refCellId);
        }
        
        // Convert value to number if possible
        if (typeof value === 'number') {
          return value;
        } else if (typeof value === 'boolean') {
          return value ? 1 : 0;
        } else if (typeof value === 'string') {
          // Try to parse string as number
          const numValue = parseNumberWithScientific(value);
          if (numValue !== null) {
            return numValue;
          }
          // If it's an empty string, return 0 (matches desktop behavior)
          if (value.trim() === '') {
            return 0;
          }
          throw new Error(`Column ${columnLetter} does not contain a numeric value in row ${currentRow + 1}: "${value}"`);
        } else if (value === null || value === undefined) {
          // Empty cell returns 0 for numeric operations
          return 0;
        }
        
        throw new Error(`Column ${columnLetter} does not contain a numeric value in row ${currentRow + 1}`);
      }

      case 'CROSS_TAB_REF': {
        index.current++;
        // Token value is "TabName.ColumnValue"
        const parts = token.value.split('.');
        if (parts.length !== 2) {
          throw new Error(`Invalid cross-tab reference format: ${token.value}`);
        }
        const [tabName, columnValue] = parts;
        
        // Get current row from cellId
        const { row: currentRow } = parseCellId(cellId);
        
        // Resolve cross-tab reference
        const value = this.resolveCrossTabReference(tabName, columnValue, currentRow, cellId, visitedCells);
        
        if (typeof value !== 'number' && typeof value !== 'boolean') {
          throw new Error(`Cross-tab reference ${token.value} does not contain a numeric value`);
        }
        
        return typeof value === 'number' ? value : (value ? 1 : 0);
      }

      case 'VARIABLE': {
        index.current++;
        const varName = token.value;
        
        // Check if it's actually a function
        if (index.current < tokens.length && tokens[index.current].type === 'LPAREN') {
          // It's a function, handle it
          return this.parseFunction(tokens, cellId, visitedCells, index, varName.toUpperCase());
        }
        
        // Get variable value
        const variable = this.variables.get(varName);
        if (!variable) {
          throw new Error(`Variable not found: ${varName}`);
        }
        
        if (typeof variable.value !== 'number' && typeof variable.value !== 'boolean') {
          throw new Error(`Variable ${varName} is not numeric`);
        }
        
        return typeof variable.value === 'number' ? variable.value : (variable.value ? 1 : 0);
      }

      case 'FUNCTION': {
        index.current++;
        const funcName = token.value.toUpperCase().replace(/\s*\($/, '');
        return this.parseFunction(tokens, cellId, visitedCells, index, funcName);
      }

      case 'LPAREN': {
        index.current++;
        const result = this.evaluateTokens(tokens, cellId, visitedCells, index);
        
        if (index.current >= tokens.length || tokens[index.current].type !== 'RPAREN') {
          throw new Error('Missing closing parenthesis');
        }
        index.current++;
        return result;
      }

      case 'OPERATOR': {
        // Handle unary minus
        if (token.value === '-') {
          index.current++;
          const factor = this.parseFactor(tokens, cellId, visitedCells, index);
          if (typeof factor !== 'number') {
            throw new Error('Unary minus requires numeric operand');
          }
          return -factor;
        }
        throw new Error(`Unexpected operator: ${token.value}`);
      }

      default:
        throw new Error(`Unexpected token: ${token.type} (${token.value})`);
    }
  }

  /**
   * Parse function call
   */
  private parseFunction(
    tokens: Token[],
    cellId: string,
    visitedCells: Set<string>,
    index: { current: number },
    funcName: string
  ): number {
    // Consume opening parenthesis
    if (index.current >= tokens.length || tokens[index.current].type !== 'LPAREN') {
      throw new Error(`Missing opening parenthesis for function ${funcName}`);
    }
    index.current++;

    // Parse arguments (can be numbers, cell references, or ranges)
    const args: number[] = [];
    
    if (index.current < tokens.length && tokens[index.current].type !== 'RPAREN') {
      while (true) {
        // Check if this is a range (CELL_REF : CELL_REF) or (Sheet!A1 : Sheet!B2)
        const isCellRange = tokens[index.current].type === 'CELL_REF' &&
          index.current + 2 < tokens.length &&
          tokens[index.current + 1].type === 'COLON' &&
          tokens[index.current + 2].type === 'CELL_REF';
        const crossTabToken = tokens[index.current].type === 'CROSS_TAB_CELL_REF' ? tokens[index.current].value : null;
        const isCrossTabRange = crossTabToken &&
          index.current + 2 < tokens.length &&
          tokens[index.current + 1].type === 'COLON' &&
          tokens[index.current + 2].type === 'CROSS_TAB_CELL_REF';

        if (isCellRange) {
          const startCellId = tokens[index.current].value.toUpperCase();
          index.current++; // Skip CELL_REF
          index.current++; // Skip COLON
          const endCellId = tokens[index.current].value.toUpperCase();
          index.current++; // Skip end CELL_REF
          const rangeValues = this.expandRangeToValues(startCellId, endCellId, cellId, visitedCells);
          args.push(...rangeValues);
        } else if (isCrossTabRange) {
          const [sheet1, startCellId] = tokens[index.current].value.split('!');
          index.current++; // Skip CROSS_TAB_CELL_REF
          index.current++; // Skip COLON
          const endToken = tokens[index.current].value;
          if (!endToken || !endToken.includes('!')) {
            throw new Error(`Invalid cross-tab range in function ${funcName}`);
          }
          const [, endCellId] = endToken.split('!');
          index.current++; // Skip end CROSS_TAB_CELL_REF
          const rangeValues = this.expandRangeToValuesFromTab((sheet1 || '').trim(), startCellId.trim().toUpperCase(), endCellId.trim().toUpperCase());
          args.push(...rangeValues);
        } else {
          // Regular argument (number, cell ref, or expression)
          const arg = this.evaluateTokens(tokens, cellId, visitedCells, index);
          if (typeof arg !== 'number') {
            throw new Error(`Function ${funcName} requires numeric arguments`);
          }
          args.push(arg);
        }
        
        if (index.current >= tokens.length) {
          throw new Error(`Missing closing parenthesis for function ${funcName}`);
        }
        
        if (tokens[index.current].type === 'RPAREN') {
          break;
        }
        
        if (tokens[index.current].type === 'COMMA') {
          index.current++;
        } else {
          throw new Error(`Expected comma or closing parenthesis in function ${funcName}`);
        }
      }
    }
    
    // Consume closing parenthesis
    if (index.current >= tokens.length || tokens[index.current].type !== 'RPAREN') {
      throw new Error(`Missing closing parenthesis for function ${funcName}`);
    }
    index.current++;

    // Evaluate function
    return this.evaluateFunction(funcName, args, cellId, visitedCells);
  }

  /**
   * Expand a cell range to an array of numeric values
   */
  private expandRangeToValues(
    startCellId: string,
    endCellId: string,
    currentCellId: string,
    visitedCells: Set<string>
  ): number[] {
    const values: number[] = [];
    const { row: startRow, column: startCol } = parseCellId(startCellId);
    const { row: endRow, column: endCol } = parseCellId(endCellId);
    
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cellId = generateCellId(row, col);
        if (cellId === currentCellId) {
          throw new Error('Circular reference: Range includes current cell');
        }
        if (visitedCells.has(cellId)) {
          continue; // Skip cells already being evaluated
        }
        
        const cells = this.spreadsheet.cells || new Map();
        const cell = cells.get(cellId);
        if (cell) {
          try {
            const cellValue = this.getCellValue(cellId, new Set([...visitedCells, cellId]));
            if (typeof cellValue === 'number') {
              values.push(cellValue);
            }
          } catch (error) {
            // Skip cells with errors
          }
        }
      }
    }
    
    return values;
  }

  /**
   * Expand a cross-tab cell range (e.g. Raw_Data!C2:Raw_Data!F2) to numeric values from that tab.
   */
  private expandRangeToValuesFromTab(tabName: string, startCellId: string, endCellId: string): number[] {
    if (!this.spreadsheet.tabs || this.spreadsheet.tabs.size === 0) return [];
    const normalizedName = (tabName || '').trim().toLowerCase();
    const targetTab = Array.from(this.spreadsheet.tabs.values()).find(
      (tab) => (tab.name || '').trim().toLowerCase() === normalizedName
    );
    if (!targetTab || !targetTab.cells) return [];
    const { row: startRow, column: startCol } = parseCellId(startCellId);
    const { row: endRow, column: endCol } = parseCellId(endCellId);
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    const values: number[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cellId = generateCellId(row, col);
        const cell = targetTab.cells.get(cellId);
        if (!cell) continue;
        const dv = cell.displayValue;
        if (dv !== undefined && dv !== '' && dv !== '#ERROR') {
          const num = parseNumberWithScientific(dv);
          if (num !== null) values.push(num);
          continue;
        }
        if (typeof cell.rawValue === 'number') values.push(cell.rawValue);
        else {
          const num = parseNumberWithScientific(cell.rawValue);
          if (num !== null) values.push(num);
        }
      }
    }
    return values;
  }

  /**
   * Evaluate built-in function
   */
  private evaluateFunction(
    funcName: string,
    args: number[],
    _cellId: string,
    _visitedCells: Set<string>
  ): number {
    switch (funcName) {
      case 'SUM': {
        if (args.length === 0) {
          throw new Error('SUM requires at least one argument');
        }
        return args.reduce((sum, val) => SafeMath.add(sum, val), 0);
      }

      case 'AVG': {
        if (args.length === 0) {
          throw new Error('AVG requires at least one argument');
        }
        const sum = args.reduce((s, val) => SafeMath.add(s, val), 0);
        return SafeMath.divide(sum, args.length);
      }

      case 'MIN': {
        if (args.length === 0) {
          throw new Error('MIN requires at least one argument');
        }
        return Math.min(...args);
      }

      case 'MAX': {
        if (args.length === 0) {
          throw new Error('MAX requires at least one argument');
        }
        return Math.max(...args);
      }

      case 'STDEV': {
        if (args.length < 2) {
          throw new Error('STDEV requires at least 2 arguments');
        }
        const mean = args.reduce((s, v) => SafeMath.add(s, v), 0) / args.length;
        const variance = args.reduce((sum, val) => {
          const diff = SafeMath.subtract(val, mean);
          return SafeMath.add(sum, SafeMath.multiply(diff, diff));
        }, 0) / args.length;
        return Math.sqrt(variance);
      }

      case 'ROUND': {
        if (args.length === 0 || args.length > 2) {
          throw new Error('ROUND requires 1 or 2 arguments');
        }
        const value = args[0];
        const decimals = args.length === 2 ? Math.round(args[1]) : 0;
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
      }

      case 'ROUNDUP': {
        if (args.length === 0 || args.length > 2) {
          throw new Error('ROUNDUP requires 1 or 2 arguments');
        }
        const value = args[0];
        const decimals = args.length === 2 ? Math.round(args[1]) : 0;
        const factor = Math.pow(10, decimals);
        return Math.ceil(value * factor) / factor;
      }

      case 'ROUNDDOWN': {
        if (args.length === 0 || args.length > 2) {
          throw new Error('ROUNDDOWN requires 1 or 2 arguments');
        }
        const value = args[0];
        const decimals = args.length === 2 ? Math.round(args[1]) : 0;
        const factor = Math.pow(10, decimals);
        return Math.floor(value * factor) / factor;
      }

      case 'CEILING': {
        if (args.length === 0) {
          throw new Error('CEILING requires at least 1 argument');
        }
        return Math.ceil(args[0]);
      }

      case 'FLOOR': {
        if (args.length === 0) {
          throw new Error('FLOOR requires at least 1 argument');
        }
        return Math.floor(args[0]);
      }

      case 'TRUNC': {
        if (args.length === 0) {
          throw new Error('TRUNC requires at least 1 argument');
        }
        return Math.trunc(args[0]);
      }

      case 'ABS': {
        if (args.length === 0) {
          throw new Error('ABS requires at least 1 argument');
        }
        return Math.abs(args[0]);
      }

      case 'SQRT': {
        if (args.length === 0) {
          throw new Error('SQRT requires at least 1 argument');
        }
        if (args[0] < 0) {
          throw new Error('SQRT: Cannot calculate square root of negative number');
        }
        return Math.sqrt(args[0]);
      }

      case 'POWER': {
        if (args.length !== 2) {
          throw new Error('POWER requires exactly 2 arguments');
        }
        return Math.pow(args[0], args[1]);
      }

      case 'EXP': {
        if (args.length === 0) {
          throw new Error('EXP requires at least 1 argument');
        }
        return Math.exp(args[0]);
      }

      case 'LN': {
        if (args.length === 0) {
          throw new Error('LN requires at least 1 argument');
        }
        if (args[0] <= 0) {
          throw new Error('LN: Argument must be positive');
        }
        return Math.log(args[0]);
      }

      case 'LOG': {
        if (args.length === 0 || args.length > 2) {
          throw new Error('LOG requires 1 or 2 arguments');
        }
        if (args[0] <= 0) {
          throw new Error('LOG: First argument must be positive');
        }
        if (args.length === 2 && args[1] <= 0) {
          throw new Error('LOG: Base must be positive');
        }
        const base = args.length === 2 ? args[1] : 10;
        return Math.log(args[0]) / Math.log(base);
      }

      case 'MOD': {
        if (args.length !== 2) {
          throw new Error('MOD requires exactly 2 arguments');
        }
        if (args[1] === 0) {
          return 0;
        }
        return args[0] % args[1];
      }

      case 'PI': {
        return Math.PI;
      }

      case 'AVERAGE': {
        // Alias for AVG
        if (args.length === 0) {
          throw new Error('AVERAGE requires at least one argument');
        }
        const sum = args.reduce((s, val) => SafeMath.add(s, val), 0);
        return SafeMath.divide(sum, args.length);
      }

      case 'COUNT': {
        // Count numeric values
        return args.filter(arg => typeof arg === 'number' && !isNaN(arg)).length;
      }

      case 'COUNTA': {
        // Count all non-empty values
        return args.filter(arg => arg !== null && arg !== undefined && !isNaN(arg)).length;
      }

      case 'MEDIAN': {
        if (args.length === 0) {
          throw new Error('MEDIAN requires at least one argument');
        }
        const sorted = [...args].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      }

      case 'MODE': {
        if (args.length === 0) {
          throw new Error('MODE requires at least one argument');
        }
        const freq: Map<number, number> = new Map();
        args.forEach(val => {
          freq.set(val, (freq.get(val) || 0) + 1);
        });
        let maxFreq = 0;
        let mode = args[0];
        freq.forEach((count, value) => {
          if (count > maxFreq) {
            maxFreq = count;
            mode = value;
          }
        });
        return mode;
      }

      case 'VAR': {
        // Sample variance
        if (args.length < 2) {
          throw new Error('VAR requires at least 2 arguments');
        }
        const mean = args.reduce((s, v) => SafeMath.add(s, v), 0) / args.length;
        const variance = args.reduce((sum, val) => {
          const diff = SafeMath.subtract(val, mean);
          return SafeMath.add(sum, SafeMath.multiply(diff, diff));
        }, 0) / (args.length - 1);
        return variance;
      }

      case 'VARP': {
        // Population variance
        if (args.length < 2) {
          throw new Error('VARP requires at least 2 arguments');
        }
        const mean = args.reduce((s, v) => SafeMath.add(s, v), 0) / args.length;
        const variance = args.reduce((sum, val) => {
          const diff = SafeMath.subtract(val, mean);
          return SafeMath.add(sum, SafeMath.multiply(diff, diff));
        }, 0) / args.length;
        return variance;
      }

      case 'STDEVP':
      case 'STDEV.P': {
        // Population standard deviation (uses n, no correction)
        if (args.length < 1) {
          return 0.0; // Desktop returns 0.0 if <1 value
        }
        const mean = args.reduce((s, v) => SafeMath.add(s, v), 0) / args.length;
        const variance = args.reduce((sum, val) => {
          const diff = SafeMath.subtract(val, mean);
          return SafeMath.add(sum, SafeMath.multiply(diff, diff));
        }, 0) / args.length; // n for population standard deviation
        return Math.sqrt(variance);
      }

      case 'STDEV.S': {
        // Sample standard deviation (uses n-1, Bessel's correction)
        if (args.length < 2) {
          return 0.0; // Desktop returns 0.0 if <2 values
        }
        const mean = args.reduce((s, v) => SafeMath.add(s, v), 0) / args.length;
        const variance = args.reduce((sum, val) => {
          const diff = SafeMath.subtract(val, mean);
          return SafeMath.add(sum, SafeMath.multiply(diff, diff));
        }, 0) / (args.length - 1); // n-1 for sample standard deviation
        return Math.sqrt(variance);
      }

      case 'PERCENTILE': {
        if (args.length !== 2) {
          throw new Error('PERCENTILE requires exactly 2 arguments');
        }
        const data = args.slice(0, -1);
        const k = args[args.length - 1];
        if (k < 0 || k > 1) {
          throw new Error('PERCENTILE: k must be between 0 and 1');
        }
        const sorted = [...data].sort((a, b) => a - b);
        const index = k * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper) {
          return sorted[lower];
        }
        return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
      }

      case 'QUARTILE': {
        if (args.length !== 2) {
          throw new Error('QUARTILE requires exactly 2 arguments');
        }
        const data = args.slice(0, -1);
        const quart = Math.round(args[args.length - 1]);
        if (quart < 0 || quart > 4) {
          throw new Error('QUARTILE: quartile must be 0, 1, 2, 3, or 4');
        }
        const sorted = [...data].sort((a, b) => a - b);
        const percentiles = [0, 0.25, 0.5, 0.75, 1];
        const k = percentiles[quart];
        const index = k * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper) {
          return sorted[lower];
        }
        return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
      }

      // Trigonometric functions
      case 'SIN': {
        if (args.length === 0) {
          throw new Error('SIN requires at least 1 argument');
        }
        return Math.sin(args[0]);
      }

      case 'COS': {
        if (args.length === 0) {
          throw new Error('COS requires at least 1 argument');
        }
        return Math.cos(args[0]);
      }

      case 'TAN': {
        if (args.length === 0) {
          throw new Error('TAN requires at least 1 argument');
        }
        return Math.tan(args[0]);
      }

      case 'ASIN': {
        if (args.length === 0) {
          throw new Error('ASIN requires at least 1 argument');
        }
        if (args[0] < -1 || args[0] > 1) {
          throw new Error('ASIN: Argument must be between -1 and 1');
        }
        return Math.asin(args[0]);
      }

      case 'ACOS': {
        if (args.length === 0) {
          throw new Error('ACOS requires at least 1 argument');
        }
        if (args[0] < -1 || args[0] > 1) {
          throw new Error('ACOS: Argument must be between -1 and 1');
        }
        return Math.acos(args[0]);
      }

      case 'ATAN': {
        if (args.length === 0) {
          throw new Error('ATAN requires at least 1 argument');
        }
        return Math.atan(args[0]);
      }

      case 'DEGREES': {
        if (args.length === 0) {
          throw new Error('DEGREES requires at least 1 argument');
        }
        // DEGREES(count) returns count - 1 (degrees of freedom)
        // This matches desktop behavior where DEGREES is used for degrees of freedom calculation
        if (args.length === 1 && Number.isInteger(args[0]) && args[0] > 0) {
          return args[0] - 1;
        }
        // Otherwise, convert radians to degrees
        return args[0] * (180 / Math.PI);
      }

      case 'RADIANS': {
        if (args.length === 0) {
          throw new Error('RADIANS requires at least 1 argument');
        }
        return args[0] * (Math.PI / 180);
      }

      case 'TINV': {
        // T-Distribution Inverse (2-tailed, Excel-compatible)
        // TINV(probability, degrees_freedom) = t.ppf(1 - prob/2, df)
        if (args.length !== 2) {
          throw new Error('TINV requires exactly 2 arguments: TINV(probability, degrees_freedom)');
        }
        const probability = args[0];
        const degreesFreedom = args[1];
        
        if (probability <= 0 || probability >= 1) {
          throw new Error('TINV: probability must be between 0 and 1');
        }
        if (degreesFreedom < 1) {
          throw new Error('TINV: degrees of freedom must be >= 1');
        }
        
        // Use approximation for t-distribution inverse
        // For large degrees of freedom, use normal approximation
        if (degreesFreedom >= 30) {
          // Normal approximation: z = norm.ppf(1 - prob/2)
          const z = this.normalInverse(1 - probability / 2);
          return Math.abs(z);
        }
        
        // For smaller degrees of freedom, use approximation
        // This is a simplified approximation - for production, consider using a proper t-distribution library
        const alpha = 1 - probability / 2;
        const tValue = this.tDistributionInverse(alpha, degreesFreedom);
        return Math.abs(tValue);
      }

      // Logical functions
      case 'IF': {
        if (args.length < 2 || args.length > 3) {
          throw new Error('IF requires 2 or 3 arguments');
        }
        return args[0] ? args[1] : (args[2] ?? 0);
      }

      case 'AND': {
        if (args.length === 0) {
          throw new Error('AND requires at least 1 argument');
        }
        return args.every(arg => Boolean(arg)) ? 1 : 0;
      }

      case 'OR': {
        if (args.length === 0) {
          throw new Error('OR requires at least 1 argument');
        }
        return args.some(arg => Boolean(arg)) ? 1 : 0;
      }

      case 'NOT': {
        if (args.length !== 1) {
          throw new Error('NOT requires exactly 1 argument');
        }
        return Boolean(args[0]) ? 0 : 1;
      }

      case 'IFERROR': {
        if (args.length !== 2) {
          throw new Error('IFERROR requires exactly 2 arguments');
        }
        // In a real implementation, we'd catch errors during evaluation
        // For now, just return the first argument
        return args[0];
      }

      default:
        throw new Error(`Unknown function: ${funcName}`);
    }
  }

  /**
   * Normal distribution inverse (quantile function)
   * Approximation using Beasley-Springer-Moro algorithm
   */
  private normalInverse(p: number): number {
    if (p <= 0 || p >= 1) {
      throw new Error('normalInverse: probability must be between 0 and 1');
    }
    
    // Constants for Beasley-Springer-Moro algorithm
    const a0 = 2.50662823884;
    const a1 = -18.61500062529;
    const a2 = 41.39119773534;
    const a3 = -25.44106049637;
    const b0 = -8.47351093090;
    const b1 = 23.08336743743;
    const b2 = -21.06224101826;
    const b3 = 3.13082909833;
    const c0 = 0.3374754822726147;
    const c1 = 0.9761690190917186;
    const c2 = 0.1607979714918209;
    const c3 = 0.0276438810333863;
    const c4 = 0.0038405729373609;
    const c5 = 0.0003951896511919;
    const c6 = 0.0000321767881768;
    const c7 = 0.0000002888167364;
    const c8 = 0.0000003960315187;
    
    let u = p - 0.5;
    let r: number;
    
    if (Math.abs(u) < 0.42) {
      // Rational approximation for central region
      r = u * u;
      r = u * (((a3 * r + a2) * r + a1) * r + a0) / ((((b3 * r + b2) * r + b1) * r + b0) * r + 1);
    } else {
      // Rational approximation for tail region
      r = p;
      if (u > 0) r = 1 - p;
      r = Math.log(-Math.log(r));
      r = c0 + r * (c1 + r * (c2 + r * (c3 + r * (c4 + r * (c5 + r * (c6 + r * (c7 + r * c8)))))));
      if (u < 0) r = -r;
    }
    
    return r;
  }

  /**
   * T-distribution inverse (quantile function)
   * Approximation for t-distribution
   */
  private tDistributionInverse(alpha: number, df: number): number {
    if (alpha <= 0 || alpha >= 1) {
      throw new Error('tDistributionInverse: alpha must be between 0 and 1');
    }
    if (df < 1) {
      throw new Error('tDistributionInverse: degrees of freedom must be >= 1');
    }
    
    // For large degrees of freedom, use normal approximation
    if (df >= 30) {
      return this.normalInverse(alpha);
    }
    
    // Simplified approximation for small degrees of freedom
    // This uses a polynomial approximation - for production, consider a proper library
    const z = this.normalInverse(alpha);
    const a = z;
    const b = (1 / 4) * (Math.pow(a, 3) + a) / df;
    const c = (1 / 96) * (5 * Math.pow(a, 5) + 16 * Math.pow(a, 3) + 3 * a) / (df * df);
    const d = (1 / 384) * (3 * Math.pow(a, 7) + 19 * Math.pow(a, 5) + 17 * Math.pow(a, 3) - 15 * a) / (df * df * df);
    const e = (1 / 92160) * (79 * Math.pow(a, 9) + 776 * Math.pow(a, 7) + 1482 * Math.pow(a, 5) - 1920 * Math.pow(a, 3) - 945 * a) / (df * df * df * df);
    
    return a + b + c + d + e;
  }

  /**
   * Resolve cross-tab reference (TabName.ColumnValue)
   */
  private resolveCrossTabReference(
    tabName: string,
    columnValue: string,
    rowIndex: number,
    currentCellId: string,
    visitedCells: Set<string>
  ): number | string | boolean | null {
    // Find tab by name
    if (!this.spreadsheet.tabs || this.spreadsheet.tabs.size === 0) {
      throw new Error(`Tab "${tabName}" not found: spreadsheet has no tabs`);
    }
    
    const normalizedTabName = tabName.trim().toLowerCase();
    const targetTab = Array.from(this.spreadsheet.tabs.values()).find(
      tab => tab.name?.trim().toLowerCase() === normalizedTabName
    );
    
    if (!targetTab) {
      throw new Error(`Tab "${tabName}" not found`);
    }
    
    // Find column by columnValue
    // If the tab has no columnDefinitions (e.g. Raw_Data is plain grid data), fall back to column-letter index
    if (!targetTab.columnDefinitions || !targetTab.columnOrder || targetTab.columnOrder.length === 0) {
      const isLetter = /^[A-Z]$/i.test(columnValue);
      if (isLetter && targetTab.cells) {
        const colIndex = columnValue.toUpperCase().charCodeAt(0) - 65;
        const cellId = generateCellId(rowIndex, colIndex);
        const cell = targetTab.cells.get(cellId);
        if (!cell) return 0;
        if (typeof cell.rawValue === 'number') return cell.rawValue;
        if (typeof cell.rawValue === 'boolean') return cell.rawValue ? 1 : 0;
        const dv = cell.displayValue;
        if (dv !== undefined && dv !== '' && dv !== '#ERROR') {
          const n = parseNumberWithScientific(dv);
          if (n !== null) return n;
          return dv as string;
        }
        const n = parseNumberWithScientific(cell.rawValue);
        if (n !== null) return n;
        return 0;
      }
      throw new Error(`Tab "${tabName}" has no column definitions`);
    }
    
    // Search through columnDefinitions to find by columnValue property
    // columnOrder contains display names (headers), but we need to find by columnValue
    // Priority: 1) Exact columnValue match, 2) Exact display name match, 3) Column letter match (A, B, C, etc.), 4) Partial match
    let columnIndex = -1;
    const matchingColumns: Array<{ index: number; name: string; columnValue: string }> = [];
    
    // Check if columnValue is a single letter (A-Z) - common case for column references
    const isColumnLetter = /^[A-Z]$/i.test(columnValue);
    let targetColumnLetterIndex = -1;
    if (isColumnLetter) {
      targetColumnLetterIndex = columnValue.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, C=2, etc.
    }
    
    for (let i = 0; i < targetTab.columnOrder.length; i++) {
      const columnName = targetTab.columnOrder[i];
      const colDef = targetTab.columnDefinitions.get(columnName);
      if (colDef) {
        const colValue = colDef.columnValue || colDef.name || columnName;
        const colName = colDef.name || columnName;
        
        // Priority 1: Exact match by columnValue (formula reference)
        if (colDef.columnValue === columnValue || colValue === columnValue) {
          columnIndex = i;
          break;
        }
        
        // Priority 2: Exact match by display name (what user sees)
        if (colName === columnValue || columnName === columnValue) {
          columnIndex = i;
          break;
        }
        
        // Priority 3: Match by column letter (if searching for "F" and column is at index 5)
        if (isColumnLetter && i === targetColumnLetterIndex) {
          columnIndex = i;
          break;
        }
        
        // Priority 4: Partial match: if searching for "F" and column is "F1", "F2", etc.
        // Only match if the search value is a prefix and followed by digits
        // Check both columnValue and display name for partial matches
        const colValuePartial = colValue.startsWith(columnValue) && /^\d+$/.test(colValue.substring(columnValue.length));
        const colNamePartial = colName.startsWith(columnValue) && /^\d+$/.test(colName.substring(columnValue.length));
        if (colValuePartial || colNamePartial) {
          matchingColumns.push({ index: i, name: colName, columnValue: colValue });
        }
      }
    }
    
    // If exact match not found but we have partial matches, use the first one
    // (This allows "F" to match "F1" if there's only one F column, but might be ambiguous)
    if (columnIndex === -1 && matchingColumns.length === 1) {
      columnIndex = matchingColumns[0].index;
    } else if (columnIndex === -1 && matchingColumns.length > 1) {
      // Multiple matches - ambiguous
      const matches = matchingColumns.map(m => m.columnValue).join(', ');
      throw new Error(`Ambiguous column reference "${columnValue}" in tab "${tabName}". Matches: ${matches}. Please use full column name.`);
    }
    
    // If still not found, try direct lookup in columnOrder (fallback)
    if (columnIndex === -1) {
      columnIndex = targetTab.columnOrder.indexOf(columnValue);
    }
    
    if (columnIndex === -1) {
      // Debug: list available columnValues for better error message
      const availableColumnValues: string[] = [];
      targetTab.columnOrder.forEach((colName) => {
        const colDef = targetTab.columnDefinitions?.get(colName);
        if (colDef) {
          const colValue = colDef.columnValue || colDef.name || colName;
          availableColumnValues.push(`${colDef.name} (columnValue: ${colDef.columnValue || 'none'})`);
        }
      });
      console.error(`[FormulaEvaluator] Column "${columnValue}" not found in tab "${tabName}". Available columns:`, availableColumnValues);
      throw new Error(`Column "${columnValue}" not found in tab "${tabName}". Available columns: ${availableColumnValues.join(', ')}`);
    }
    
    // Get cell value from target tab at same row
    const cellId = generateCellId(rowIndex, columnIndex);
    
    // Circular reference: e.g. =Measurement.F in Measurement tab's F column references itself. Return 0 so template doesn't show #ERROR.
    if (visitedCells.has(cellId)) {
      return 0;
    }
    
    // Get cell from target tab
    const cell = targetTab.cells.get(cellId);
    if (!cell) {
      return 0; // Empty cell for numeric operations
    }
    
    // Evaluate cell value (recursively if it's a formula)
    if (cell.dataType === 'formula' && cell.formula) {
      // Need to evaluate formula in context of target tab
      // Create a temporary evaluator for the target tab with full spreadsheet context for cross-tab refs
      const targetTabSpreadsheet: SpreadsheetModel = {
        ...this.spreadsheet, // Keep full spreadsheet for cross-tab references
        cells: targetTab.cells,
        columnDefinitions: targetTab.columnDefinitions,
        columnOrder: targetTab.columnOrder,
        rowCount: targetTab.rowCount,
        columnCount: targetTab.columnCount,
      };
      
      try {
        const tempEvaluator = new FormulaEvaluator(targetTabSpreadsheet);
        const result = tempEvaluator.evaluateCell(cellId);
        if (result.success) {
          // Return numeric value if possible
          if (typeof result.value === 'number') {
            return result.value;
          }
          if (typeof result.value === 'boolean') {
            return result.value;
          }
          // Try to parse displayValue as number
          const numValue = parseNumberWithScientific(result.displayValue);
          if (numValue !== null) {
            return numValue;
          }
          return result.displayValue || '';
        } else {
          // Return 0 so dependent cells don't cascade #ERROR when target tab formula fails (e.g. missing inputs)
          return 0;
        }
      } catch (err) {
        // Return 0 so template doesn't show #ERROR everywhere when cross-tab formula fails
        return 0;
      }
    }
    
    // Return numeric value if possible
    if (typeof cell.rawValue === 'number') {
      return cell.rawValue;
    }
    
    if (typeof cell.rawValue === 'boolean') {
      return cell.rawValue;
    }
    
    // Try to parse as number
    const numValue = parseNumberWithScientific(cell.rawValue);
    if (numValue !== null) {
      return numValue;
    }
    
    // Return as string (will cause error if used in numeric context)
    return cell.displayValue || '';
  }

  /**
   * Get cell value from another tab by name (e.g. Raw_Data!B7).
   * Used when resolving Sheet!A1 refs; the other tab is already evaluated so we read displayValue/rawValue.
   */
  private getCellValueFromTab(tabName: string, cellId: string): number | string | boolean | null {
    if (!this.spreadsheet.tabs || this.spreadsheet.tabs.size === 0) return 0;
    const normalizedName = (tabName || '').trim().toLowerCase();
    const targetTab = Array.from(this.spreadsheet.tabs.values()).find(
      (tab) => (tab.name || '').trim().toLowerCase() === normalizedName
    );
    if (!targetTab || !targetTab.cells) return 0;
    const refId = cellId.toUpperCase();
    let cell = targetTab.cells.get(refId);
    if (!cell) {
      const { row: r, column: c } = parseCellId(refId);
      const altId = generateCellId(r, c);
      if (altId !== refId) cell = targetTab.cells.get(altId);
      if (!cell && targetTab.cells instanceof Map) {
        for (const [, ce] of targetTab.cells) {
          if (ce && (ce as any).row === r && (ce as any).column === c) {
            cell = ce as any;
            break;
          }
        }
      }
    }
    if (!cell) return 0;
    const dv = cell.displayValue;
    // Support numeric displayValue (e.g. from evaluation) so we don't rely only on string parsing
    if (typeof dv === 'number' && !Number.isNaN(dv)) return dv;
    if (dv !== undefined && dv !== '' && dv !== '#ERROR') {
      const num = parseNumberWithScientific(dv);
      if (num !== null) return num;
      return dv;
    }
    if (typeof cell.rawValue === 'number') return cell.rawValue;
    if (typeof cell.rawValue === 'boolean') return cell.rawValue;
    const num = parseNumberWithScientific(cell.rawValue);
    if (num !== null) return num;
    return (cell.displayValue || '') as string;
  }

  /**
   * Get cell value, evaluating if necessary
   */
  private getCellValue(cellId: string, visitedCells: Set<string>): number | string | boolean | null {
    let cellState = this.cellStates.get(cellId);
    
    // If cell state doesn't exist, check if the cell exists in spreadsheet.cells or create from column def
    if (!cellState) {
      const cells = this.spreadsheet.cells || new Map();
      let cell = cells.get(cellId);
      if (!cell && this.spreadsheet.columnDefinitions && this.spreadsheet.columnOrder) {
        const { row, column } = parseCellId(cellId);
        if (column >= 0 && column < this.spreadsheet.columnOrder.length) {
          const columnName = this.spreadsheet.columnOrder[column];
          const colDef = this.spreadsheet.columnDefinitions.get(columnName);
          if (colDef && colDef.formula) {
            cell = {
              id: cellId,
              row,
              column,
              dataType: 'formula',
              displayValue: '',
              rawValue: null,
              formula: colDef.formula,
            };
          }
        }
      }
      if (cell) {
        cellState = {
          cell,
          evaluated: false,
          evaluating: false,
          value: null,
          dependencies: new Set(),
        };
        this.cellStates.set(cellId, cellState);
      } else {
        // Cell doesn't exist and no column formula - return 0 for numeric operations
        return 0;
      }
    }
    
    // If cellState was just created from spreadsheet.cells, we need to evaluate it
    // But we need to make sure we don't cause infinite recursion
    // The evaluation will happen below in the normal flow

    // Check for circular reference
    if (visitedCells.has(cellId)) {
      throw new Error(`Circular reference detected involving cell ${cellId}`);
    }

    // If already evaluated, return cached value
    if (cellState.evaluated) {
      return cellState.value;
    }

    // If currently evaluating, circular reference
    if (cellState.evaluating) {
      throw new Error(`Circular reference detected: cell ${cellId} is being evaluated`);
    }

    // Mark as evaluating
    cellState.evaluating = true;

    try {
      const cell = cellState.cell;

      // Check for column-level formula if cell doesn't have one
      let formulaToEvaluate: string | undefined = cell.formula;
      if (!formulaToEvaluate && this.spreadsheet.columnDefinitions && this.spreadsheet.columnOrder) {
        const { column } = parseCellId(cellId);
        if (column >= 0 && column < this.spreadsheet.columnOrder.length) {
          const columnName = this.spreadsheet.columnOrder[column];
          const colDef = this.spreadsheet.columnDefinitions.get(columnName);
          
          // Check if formula property exists (for desktop compatibility)
          // Column-level formulas apply to all cells in that column
          if (colDef && colDef.formula) {
            formulaToEvaluate = colDef.formula;
          }
        }
      }
      
      // Evaluate based on data type
      if (formulaToEvaluate) {
        const result = this.evaluateExpression(formulaToEvaluate, cellId, new Set([...visitedCells, cellId]));
        cellState.value = result;
      } else if (cell.dataType === 'number') {
        // Use scientific notation-aware parser (matches desktop behavior)
        if (typeof cell.rawValue === 'number') {
          cellState.value = cell.rawValue;
        } else {
          const parsed = parseNumberWithScientific(cell.rawValue);
          cellState.value = parsed !== null ? parsed : 0;
        }
      } else if (cell.dataType === 'boolean') {
        cellState.value = cell.rawValue === true || cell.rawValue === 'true' || cell.rawValue === 1;
      } else {
        // For text cells, try to parse as number if it looks numeric (for formula compatibility)
        // This handles the case where a user enters "1" as text but it should be treated as a number
        if (typeof cell.rawValue === 'string' && cell.rawValue.trim() !== '') {
          const parsed = parseNumberWithScientific(cell.rawValue);
          if (parsed !== null) {
            // It's a numeric string, return as number
            cellState.value = parsed;
          } else {
            // It's a non-numeric string
            cellState.value = cell.rawValue;
          }
        } else {
          cellState.value = cell.rawValue;
        }
      }

      cellState.evaluated = true;
      return cellState.value;
    } catch (error) {
      cellState.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      cellState.evaluating = false;
    }
  }

  /**
   * Build dependency graph
   */
  private buildDependencyGraph(): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    
    // Initialize all cells
    for (const cellId of this.cellStates.keys()) {
      graph.set(cellId, new Set());
    }
    
    // Build dependencies by evaluating formulas (which tracks dependencies)
    // First, check cells that have explicit formulas
    for (const [cellId, cellState] of this.cellStates) {
      if (cellState.cell.dataType === 'formula' && cellState.cell.formula) {
        try {
          // Reset state
          cellState.evaluated = false;
          cellState.evaluating = false;
          cellState.dependencies.clear();
          
          // Evaluate to discover dependencies
          this.getCellValue(cellId, new Set());
        } catch (error) {
          // Ignore evaluation errors, just track dependencies
        }
        
        // Add dependencies to graph
        for (const dep of cellState.dependencies) {
          graph.get(cellId)?.add(dep);
        }
      }
    }
    
    // Also check for column-level formulas for cells that don't have explicit formulas
    if (this.spreadsheet.columnDefinitions && this.spreadsheet.columnOrder) {
      for (const [cellId, cellState] of this.cellStates) {
        // Skip if already processed
        if (cellState.cell.dataType === 'formula' && cellState.cell.formula) continue;
        
        // Check if this cell's column has a formula
        const { column } = parseCellId(cellId);
        if (column >= 0 && column < this.spreadsheet.columnOrder.length) {
          const columnName = this.spreadsheet.columnOrder[column];
          const colDef = this.spreadsheet.columnDefinitions.get(columnName);
          if (colDef && colDef.formula) {
            // This cell should be treated as a formula cell
            try {
              // Reset state
              cellState.evaluated = false;
              cellState.evaluating = false;
              cellState.dependencies.clear();
              
              // Evaluate to discover dependencies
              this.getCellValue(cellId, new Set());
            } catch (error) {
              // Ignore evaluation errors, just track dependencies
            }
            
            // Add dependencies to graph
            for (const dep of cellState.dependencies) {
              graph.get(cellId)?.add(dep);
            }
          }
        }
      }
    }
    
    return graph;
  }

  /**
   * Topological sort for evaluation order
   */
  private topologicalSort(graph: Map<string, Set<string>>): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const visit = (cellId: string) => {
      if (visiting.has(cellId)) {
        // Circular reference detected
        return;
      }
      
      if (visited.has(cellId)) {
        return;
      }
      
      visiting.add(cellId);
      
      const dependencies = graph.get(cellId) || new Set();
      for (const dep of dependencies) {
        visit(dep);
      }
      
      visiting.delete(cellId);
      visited.add(cellId);
      sorted.push(cellId);
    };
    
    for (const cellId of graph.keys()) {
      if (!visited.has(cellId)) {
        visit(cellId);
      }
    }
    
    return sorted;
  }

  /**
   * Detect circular references
   */
  detectCircularReferences(): string[][] {
    const graph = this.buildDependencyGraph();
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (cellId: string) => {
      if (recStack.has(cellId)) {
        // Found cycle - extract cycle path
        const cycleStart = path.indexOf(cellId);
        if (cycleStart !== -1) {
          const cycle = [...path.slice(cycleStart), cellId];
          cycles.push(cycle);
        }
        return;
      }

      if (visited.has(cellId)) {
        return;
      }

      visited.add(cellId);
      recStack.add(cellId);
      path.push(cellId);

      const dependencies = graph.get(cellId) || new Set();
      for (const dep of dependencies) {
        dfs(dep);
      }

      recStack.delete(cellId);
      path.pop();
    };

    for (const cellId of graph.keys()) {
      if (!visited.has(cellId)) {
        dfs(cellId);
      }
    }

    // Remove duplicate cycles
    const uniqueCycles: string[][] = [];
    for (const cycle of cycles) {
      const normalized = cycle.slice(0, -1).sort().join('->');
      if (!uniqueCycles.some(c => c.slice(0, -1).sort().join('->') === normalized)) {
        uniqueCycles.push(cycle);
      }
    }

    return uniqueCycles;
  }

  /**
   * Evaluate all cells in spreadsheet
   */
  evaluateAll(): SpreadsheetEvaluationResult {
    // Refresh cellStates with any new cells from spreadsheet.cells
    // This ensures cells created after FormulaEvaluator construction are included
    const cells = this.spreadsheet.cells || new Map();
    
    for (const [cellId, cell] of cells) {
      if (!this.cellStates.has(cellId)) {
        this.cellStates.set(cellId, {
          cell,
          evaluated: false,
          evaluating: false,
          value: null,
          dependencies: new Set(),
        });
      } else {
        // Update existing cell state with latest cell data
        const cellState = this.cellStates.get(cellId)!;
        cellState.cell = cell;
      }
    }
    
    // Reset all cell states
    for (const cellState of this.cellStates.values()) {
      cellState.evaluated = false;
      cellState.evaluating = false;
      cellState.error = undefined;
      cellState.dependencies.clear();
    }

    // Detect circular references
    const circularReferences = this.detectCircularReferences();
    
    // Build dependency graph
    const graph = this.buildDependencyGraph();
    
    // Get evaluation order
    const evaluationOrder = this.topologicalSort(graph);
    
    // Evaluate cells
    const cellResults = new Map<string, CellEvaluationResult>();
    const errors: string[] = [];

    for (const cellId of evaluationOrder) {
      const cellState = this.cellStates.get(cellId);
      if (!cellState) continue;

      try {
        const value = this.getCellValue(cellId, new Set());
        const cell = cellState.cell;
        
        // Get column definition to apply formatting if cell doesn't have format
        let decimalPlaces = cell.format?.decimalPlaces;
        if (decimalPlaces === undefined && this.spreadsheet.columnDefinitions && this.spreadsheet.columnOrder) {
          const columnName = this.spreadsheet.columnOrder[cell.column];
          const colDef = columnName ? this.spreadsheet.columnDefinitions.get(columnName) : undefined;
          if (colDef && colDef.precision !== undefined) {
            decimalPlaces = colDef.precision;
          }
        }
        
        // Format display value
        let displayValue = String(value);
        if (typeof value === 'number' && decimalPlaces !== undefined) {
          displayValue = value.toFixed(decimalPlaces);
        }

        cellResults.set(cellId, {
          cellId,
          success: true,
          value,
          displayValue,
          dependencies: Array.from(cellState.dependencies),
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Cell ${cellId}: ${errorMsg}`);
        
        cellResults.set(cellId, {
          cellId,
          success: false,
          value: null,
          displayValue: '#ERROR',
          error: errorMsg,
          dependencies: Array.from(cellState.dependencies),
        });
      }
    }

    // Evaluate non-formula cells that weren't in the dependency graph
    // Also evaluate cells with column-level formulas that weren't in the dependency graph
    for (const [cellId, cellState] of this.cellStates) {
      if (!cellResults.has(cellId)) {
        try {
          const value = this.getCellValue(cellId, new Set());
          const cell = cellState.cell;
          
          // Get column definition to apply formatting if cell doesn't have format
          let decimalPlaces = cell.format?.decimalPlaces;
          if (decimalPlaces === undefined && this.spreadsheet.columnDefinitions && this.spreadsheet.columnOrder) {
            const columnName = this.spreadsheet.columnOrder[cell.column];
            const colDef = columnName ? this.spreadsheet.columnDefinitions.get(columnName) : undefined;
            if (colDef && colDef.precision !== undefined) {
              decimalPlaces = colDef.precision;
            }
          }
          
          let displayValue = String(value);
          if (typeof value === 'number' && decimalPlaces !== undefined) {
            displayValue = value.toFixed(decimalPlaces);
          }

          cellResults.set(cellId, {
            cellId,
            success: true,
            value,
            displayValue,
            dependencies: Array.from(cellState.dependencies),
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Cell ${cellId}: ${errorMsg}`);
          
          cellResults.set(cellId, {
            cellId,
            success: false,
            value: null,
            displayValue: '#ERROR',
            error: errorMsg,
            dependencies: Array.from(cellState.dependencies),
          });
        }
      }
    }
    
    // Also evaluate cells that don't exist yet but should have column-level formulas
    // This ensures all cells in formula columns are evaluated
    if (this.spreadsheet.columnDefinitions && this.spreadsheet.columnOrder) {
      for (let row = 0; row < (this.spreadsheet.rowCount || 10); row++) {
        for (let col = 0; col < this.spreadsheet.columnOrder.length; col++) {
          const cellId = generateCellId(row, col);
          
          // Skip if already evaluated
          if (cellResults.has(cellId)) continue;
          
          // Check if this column has a formula
          const columnName = this.spreadsheet.columnOrder[col];
          const colDef = this.spreadsheet.columnDefinitions.get(columnName);
          if (colDef && colDef.formula) {
            // This cell should have a column-level formula
            // Create a temporary cell state for evaluation
            if (!this.cellStates.has(cellId)) {
              const tempCell: Cell = {
                id: cellId,
                row,
                column: col,
                dataType: 'formula',
                displayValue: '',
                rawValue: null,
                formula: colDef.formula,
              };
              this.cellStates.set(cellId, {
                cell: tempCell,
                evaluated: false,
                evaluating: false,
                value: null,
                dependencies: new Set(),
              });
            }
            
            try {
              const value = this.getCellValue(cellId, new Set());
              const cellState = this.cellStates.get(cellId);
              const cell = cellState?.cell;
              
              if (!cell) {
                // Skip if cell doesn't exist
                continue;
              }
              
              // Get column definition to apply formatting if cell doesn't have format
              let decimalPlaces = cell.format?.decimalPlaces;
              if (decimalPlaces === undefined && this.spreadsheet.columnDefinitions && this.spreadsheet.columnOrder) {
                const columnName = this.spreadsheet.columnOrder[cell.column];
                const colDef = columnName ? this.spreadsheet.columnDefinitions.get(columnName) : undefined;
                if (colDef && colDef.precision !== undefined) {
                  decimalPlaces = colDef.precision;
                }
              }
              
              let displayValue = String(value);
              if (typeof value === 'number' && decimalPlaces !== undefined) {
                displayValue = value.toFixed(decimalPlaces);
              }

              cellResults.set(cellId, {
                cellId,
                success: true,
                value,
                displayValue,
                dependencies: Array.from(cellState?.dependencies || []),
              });
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              errors.push(`Cell ${cellId}: ${errorMsg}`);
              
              cellResults.set(cellId, {
                cellId,
                success: false,
                value: null,
                displayValue: '#ERROR',
                error: errorMsg,
                dependencies: [],
              });
            }
          }
        }
      }
    }

    return {
      success: errors.length === 0 && circularReferences.length === 0,
      cellResults,
      circularReferences,
      errors,
      evaluationOrder,
    };
  }

  /**
   * Evaluate single cell
   */
  evaluateCell(cellId: string): CellEvaluationResult {
    const cellState = this.cellStates.get(cellId);
    if (!cellState) {
      return {
        cellId,
        success: false,
        value: null,
        displayValue: '#ERROR',
        error: `Cell not found: ${cellId}`,
      };
    }

    // Reset cell state
    cellState.evaluated = false;
    cellState.evaluating = false;
    cellState.error = undefined;
    cellState.dependencies.clear();

    try {
      const value = this.getCellValue(cellId, new Set());
      const cell = cellState.cell;
      
      // Get column definition to apply formatting if cell doesn't have format
      let decimalPlaces = cell.format?.decimalPlaces;
      if (decimalPlaces === undefined && this.spreadsheet.columnDefinitions && this.spreadsheet.columnOrder) {
        const columnName = this.spreadsheet.columnOrder[cell.column];
        const colDef = columnName ? this.spreadsheet.columnDefinitions.get(columnName) : undefined;
        if (colDef && colDef.precision !== undefined) {
          decimalPlaces = colDef.precision;
        }
      }
      
      let displayValue = String(value);
      if (typeof value === 'number' && decimalPlaces !== undefined) {
        displayValue = value.toFixed(decimalPlaces);
      }

      return {
        cellId,
        success: true,
        value,
        displayValue,
        dependencies: Array.from(cellState.dependencies),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        cellId,
        success: false,
        value: null,
        displayValue: '#ERROR',
        error: errorMsg,
        dependencies: Array.from(cellState.dependencies),
      };
    }
  }
}

/**
 * Evaluate entire spreadsheet.
 * When the spreadsheet has multiple tabs, each tab is evaluated with its own cells and column
 * definitions so formulas (e.g. MAX(G, H, I)-MIN(G, H, I)) work on every tab, not just the first.
 * @param options.collectAllErrors - when true, merged errors from all tabs are returned (for debugging).
 */
export function evaluateSpreadsheet(
  spreadsheet: SpreadsheetModel,
  options?: { collectAllErrors?: boolean }
): SpreadsheetEvaluationResult {
  if (spreadsheet.tabs && spreadsheet.tabs.size > 0) {
    const tabOrder = spreadsheet.tabOrder || Array.from(spreadsheet.tabs.keys());
    let firstTabResult: SpreadsheetEvaluationResult | null = null;
    const allErrors: string[] = [];
    for (let i = 0; i < tabOrder.length; i++) {
      const tabId = tabOrder[i];
      const tab = spreadsheet.tabs.get(tabId);
      if (!tab || !tab.cells) continue;
      const view: SpreadsheetModel = {
        ...spreadsheet,
        cells: tab.cells,
        columnDefinitions: tab.columnDefinitions ?? new Map(),
        columnOrder: tab.columnOrder ?? [],
        rowCount: tab.rowCount ?? spreadsheet.rowCount ?? 10,
        columnCount: tab.columnCount ?? spreadsheet.columnCount ?? 26,
      };
      const evaluator = new FormulaEvaluator(view);
      const result = evaluator.evaluateAll();
      if (options?.collectAllErrors && result.errors.length > 0) {
        const tabLabel = tab.name || tabId;
        result.errors.forEach((e) => allErrors.push(`[${tabLabel}] ${e}`));
      }
      for (const [cellId, cellResult] of result.cellResults) {
        let cell = tab.cells.get(cellId);
        if (cell) {
          cell.displayValue = cellResult.displayValue ?? '';
          if (cellResult.error !== undefined) {
            (cell as Cell & { error?: string }).error = cellResult.error;
          }
        } else {
          // Column-formula or other evaluated cell with no Cell yet — add it so PDF/computedGrids see the result
          const parsed = parseCellId(cellId);
          const newCell: Cell = {
            id: cellId,
            row: parsed.row,
            column: parsed.column,
            dataType: 'formula',
            displayValue: cellResult.displayValue ?? '',
            rawValue: null,
          };
          if (cellResult.error !== undefined) {
            (newCell as Cell & { error?: string }).error = cellResult.error;
          }
          tab.cells.set(cellId, newCell);
        }
      }
      if (i === 0) firstTabResult = result;
    }
    const base = firstTabResult ?? {
      success: true,
      cellResults: new Map(),
      circularReferences: [],
      errors: [],
      evaluationOrder: [],
    };
    return options?.collectAllErrors && allErrors.length > 0
      ? { ...base, errors: allErrors }
      : base;
  }
  const evaluator = new FormulaEvaluator(spreadsheet);
  const result = evaluator.evaluateAll();
  const cellsMap = spreadsheet.cells ?? new Map<string, Cell>();
  for (const [cellId, cellResult] of result.cellResults) {
    const cell = cellsMap.get(cellId);
    if (cell) {
      cell.displayValue = cellResult.displayValue ?? '';
      if (cellResult.error !== undefined) {
        (cell as Cell & { error?: string }).error = cellResult.error;
      }
    } else {
      const parsed = parseCellId(cellId);
      const newCell: Cell = {
        id: cellId,
        row: parsed.row,
        column: parsed.column,
        dataType: 'formula',
        displayValue: cellResult.displayValue ?? '',
        rawValue: null,
      };
      if (cellResult.error !== undefined) {
        (newCell as Cell & { error?: string }).error = cellResult.error;
      }
      cellsMap.set(cellId, newCell);
    }
  }
  return result;
}

/**
 * Evaluate single cell
 */
export function evaluateCell(
  spreadsheet: SpreadsheetModel,
  cellId: string
): CellEvaluationResult {
  const evaluator = new FormulaEvaluator(spreadsheet);
  return evaluator.evaluateCell(cellId);
}

/**
 * Detect circular dependencies in spreadsheet
 */
export function detectCircularDependency(
  spreadsheet: SpreadsheetModel
): string[][] {
  const evaluator = new FormulaEvaluator(spreadsheet);
  return evaluator.detectCircularReferences();
}

/**
 * Recalculate all formulas in spreadsheet
 */
export function recalculateAll(
  spreadsheet: SpreadsheetModel
): SpreadsheetEvaluationResult {
  return evaluateSpreadsheet(spreadsheet);
}

