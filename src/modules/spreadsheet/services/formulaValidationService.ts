/**
 * Formula Validation Service
 * Provides comprehensive syntax error detection and helpful advice
 */

import { parseFormulaToAST, type ParseError } from './formulaParser';
import { getEnhancedFormulaError, formatFormulaErrorForDisplay, getErrorPositionIndicator } from '../utils/formulaErrorHelper';

export interface FormulaValidationResult {
  isValid: boolean;
  errors: FormulaError[];
  warnings: FormulaWarning[];
}

export interface FormulaError {
  message: string;
  position: number;
  suggestion?: string;
  helpText?: string;
  errorType: 'syntax' | 'semantic' | 'reference' | 'function';
}

export interface FormulaWarning {
  message: string;
  position: number;
  suggestion?: string;
}

/**
 * Validate formula and provide detailed error information
 */
export function validateFormulaWithAdvice(
  formula: string,
  availableColumnNames: string[] = []
): FormulaValidationResult {
  const errors: FormulaError[] = [];
  const warnings: FormulaWarning[] = [];

  // Empty formula check
  if (!formula || formula.trim() === '') {
    return {
      isValid: false,
      errors: [{
        message: 'Formula is empty',
        position: 0,
        suggestion: 'Enter a formula starting with = (e.g., =A1+B2)',
        helpText: 'Formulas must start with = followed by an expression',
        errorType: 'syntax',
      }],
      warnings: [],
    };
  }

  // Check if formula starts with =
  const trimmed = formula.trim();
  if (!trimmed.startsWith('=')) {
    errors.push({
      message: 'Formula must start with =',
      position: 0,
      suggestion: `Add = at the beginning: =${trimmed}`,
      helpText: 'All formulas must begin with the equals sign (=)',
      errorType: 'syntax',
    });
  }

  // Parse formula
  const parseResult = parseFormulaToAST(trimmed);
  
  if (!parseResult.success) {
    // Convert parse errors to FormulaError with enhanced messages
    for (const parseError of parseResult.errors) {
      const enhanced = getEnhancedFormulaError(parseError, trimmed);
      errors.push({
        message: enhanced.message,
        position: enhanced.position,
        suggestion: enhanced.suggestion,
        helpText: enhanced.helpText,
        errorType: 'syntax',
      });
    }
  } else if (parseResult.ast) {
    // Additional semantic checks
    checkSemanticErrors(parseResult.ast, trimmed, availableColumnNames, errors, warnings);
  }

  // Check for common issues
  checkCommonIssues(trimmed, availableColumnNames, errors, warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check for semantic errors in the AST
 */
function checkSemanticErrors(
  ast: any,
  formula: string,
  availableColumnNames: string[],
  errors: FormulaError[],
  warnings: FormulaWarning[]
): void {
  // Recursively check AST nodes
  checkNode(ast, availableColumnNames, errors, warnings);
}

/**
 * Recursively check AST node for errors
 */
function checkNode(
  node: any,
  availableColumnNames: string[],
  errors: FormulaError[],
  warnings: FormulaWarning[]
): void {
  if (!node) return;

  switch (node.type) {
    case 'VARIABLE':
      // Check if variable/column name exists
      if (availableColumnNames.length > 0 && !hasColumnMatch(node.name, availableColumnNames)) {
        const similar = findSimilarColumnName(node.name, availableColumnNames);
        errors.push({
          message: `Column "${node.name}" not found`,
          position: node.position,
          suggestion: similar
            ? `Did you mean "${similar}"?`
            : `Available columns: ${availableColumnNames.slice(0, 5).join(', ')}${availableColumnNames.length > 5 ? '...' : ''}`,
          helpText: 'Column names are matched case-insensitively. Use the 📎 button to insert column names.',
          errorType: 'reference',
        });
      }
      break;

    case 'FUNCTION':
      // Check if function name is valid
      const validFunctions = [
        'SUM', 'AVG', 'AVERAGE', 'MAX', 'MIN', 'COUNT', 'IF', 'ABS',
        'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'SQRT', 'POWER', 'LOG', 'LN',
        'EXP', 'SIN', 'COS', 'TAN', 'PI'
      ];
      
      if (!validFunctions.includes(node.name.toUpperCase())) {
        const similar = findSimilarFunction(node.name, validFunctions);
        errors.push({
          message: `Unknown function "${node.name}"`,
          position: node.position,
          suggestion: similar
            ? `Did you mean "${similar}"?`
            : `Supported functions: ${validFunctions.slice(0, 10).join(', ')}...`,
          helpText: 'Function names are case-insensitive. Check spelling and ensure the function is supported.',
          errorType: 'function',
        });
      }

      // Check function arguments
      if (node.arguments) {
        for (const arg of node.arguments) {
          checkNode(arg, availableColumnNames, errors, warnings);
        }
      }
      break;

    case 'BINARY_OP':
      // Check for division by zero (warning, not error)
      if (node.operator === '/' && node.right.type === 'NUMBER' && node.right.value === 0) {
        warnings.push({
          message: 'Division by zero',
          position: node.position,
          suggestion: 'This will result in an error. Check the divisor value.',
        });
      }
      checkNode(node.left, availableColumnNames, errors, warnings);
      checkNode(node.right, availableColumnNames, errors, warnings);
      break;

    case 'UNARY_OP':
      checkNode(node.operand, availableColumnNames, errors, warnings);
      break;

    case 'CELL_REF':
      // Validate cell reference format
      if (!/^[A-Z]+\d+$/.test(node.cellId)) {
        errors.push({
          message: `Invalid cell reference "${node.cellId}"`,
          position: node.position,
          suggestion: 'Use format: Column letter (A-Z) + Row number (e.g., A1, B2)',
          helpText: 'Cell references must be in the format: ColumnLetterRowNumber (e.g., A1, B2, AA10)',
          errorType: 'reference',
        });
      }
      break;
  }
}

/**
 * Check for common formula issues
 */
function checkCommonIssues(
  formula: string,
  availableColumnNames: string[],
  errors: FormulaError[],
  warnings: FormulaWarning[]
): void {
  // Check for unmatched parentheses
  const openParens = (formula.match(/\(/g) || []).length;
  const closeParens = (formula.match(/\)/g) || []).length;
  if (openParens > closeParens) {
    const missing = openParens - closeParens;
    errors.push({
      message: `Missing ${missing} closing parenthes${missing > 1 ? 'es' : 'is'}`,
      position: formula.length,
      suggestion: `Add ${missing} closing parenthes${missing > 1 ? 'es' : 'is'}: ${')'.repeat(missing)}`,
      helpText: 'Every opening parenthesis ( must have a matching closing parenthesis )',
      errorType: 'syntax',
    });
  } else if (closeParens > openParens) {
    const extra = closeParens - openParens;
    errors.push({
      message: `Extra ${extra} closing parenthes${extra > 1 ? 'es' : 'is'}`,
      position: formula.lastIndexOf(')'),
      suggestion: `Remove ${extra} closing parenthes${extra > 1 ? 'es' : 'is'}`,
      helpText: 'Too many closing parentheses. Check that each ) has a matching (',
      errorType: 'syntax',
    });
  }

  // Check for consecutive operators
  if (formula.match(/[+\-*/^]{2,}/)) {
    warnings.push({
      message: 'Consecutive operators detected',
      position: formula.search(/[+\-*/^]{2,}/),
      suggestion: 'Check for missing operands between operators',
    });
  }

  // Check for missing operands
  if (formula.match(/[+\-*/^]\s*[+\-*/^)]/)) {
    errors.push({
      message: 'Missing operand between operators',
      position: formula.search(/[+\-*/^]\s*[+\-*/^)]/),
      suggestion: 'Add a number, cell reference, or expression between operators',
      helpText: 'Operators must have operands on both sides (e.g., A1+B2, not A1+)',
      errorType: 'syntax',
    });
  }

  // Check for empty function calls
  if (formula.match(/\w+\s*\(\s*\)/)) {
    warnings.push({
      message: 'Empty function call',
      position: formula.search(/\w+\s*\(\s*\)/),
      suggestion: 'Some functions require arguments. Check function documentation.',
    });
  }
}

/**
 * Find similar column name (fuzzy matching)
 */
function findSimilarColumnName(name: string, availableNames: string[]): string | null {
  const lowerName = name.toLowerCase();
  
  // Exact match (case-insensitive)
  const exact = availableNames.find(n => n.toLowerCase() === lowerName);
  if (exact) return exact;

  // Starts with
  const startsWith = availableNames.find(n => n.toLowerCase().startsWith(lowerName));
  if (startsWith) return startsWith;

  // Contains
  const contains = availableNames.find(n => n.toLowerCase().includes(lowerName));
  if (contains) return contains;

  // Levenshtein distance (simple)
  let bestMatch: string | null = null;
  let bestScore = Infinity;

  for (const candidate of availableNames) {
    const score = levenshteinDistance(lowerName, candidate.toLowerCase());
    if (score < bestScore && score <= 2) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * Find similar function name
 */
function findSimilarFunction(name: string, validFunctions: string[]): string | null {
  const upperName = name.toUpperCase();
  
  // Exact match
  if (validFunctions.includes(upperName)) return upperName;

  // Levenshtein distance
  let bestMatch: string | null = null;
  let bestScore = Infinity;

  for (const func of validFunctions) {
    const score = levenshteinDistance(upperName, func);
    if (score < bestScore && score <= 2) {
      bestScore = score;
      bestMatch = func;
    }
  }

  return bestMatch;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

function hasColumnMatch(name: string, availableNames: string[]): boolean {
  const normalizedName = name.toLowerCase();
  return availableNames.some((candidate) => candidate.toLowerCase() === normalizedName);
}
