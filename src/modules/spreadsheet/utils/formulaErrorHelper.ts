/**
 * Formula Error Helper
 * Provides enhanced error messages and suggestions for formula syntax errors
 */

import type { ParseError } from '../services/formulaParser';

export interface EnhancedFormulaError {
  message: string;
  position: number;
  suggestion?: string;
  helpText?: string;
}

/**
 * Get enhanced error message with suggestions
 */
export function getEnhancedFormulaError(error: ParseError, formula: string): EnhancedFormulaError {
  const baseError: EnhancedFormulaError = {
    message: error.message,
    position: error.position,
  };

  const errorMsg = error.message.toLowerCase();
  const formulaLower = formula.toLowerCase();

  // Missing closing parenthesis
  if (errorMsg.includes('closing parenthesis') || errorMsg.includes('expected') && errorMsg.includes(')')) {
    const openParens = (formula.match(/\(/g) || []).length;
    const closeParens = (formula.match(/\)/g) || []).length;
    const missing = openParens - closeParens;
    if (missing <= 0) {
      return baseError;
    }
    
    return {
      ...baseError,
      message: `Missing ${missing} closing parenthes${missing > 1 ? 'es' : 'is'}`,
      suggestion: `Add ${missing} closing parenthes${missing > 1 ? 'es' : 'is'} (${')'.repeat(missing)})`,
      helpText: 'Check that all opening parentheses ( have matching closing parentheses )',
    };
  }

  // Missing opening parenthesis
  if (errorMsg.includes('opening parenthesis') || errorMsg.includes('expected') && errorMsg.includes('(')) {
    return {
      ...baseError,
      message: 'Missing opening parenthesis',
      suggestion: 'Add an opening parenthesis ( before the function name',
      helpText: 'Functions require parentheses: =SUM(A1:A5), =POWER(2, 3)',
    };
  }

  // Unexpected token/character
  if (errorMsg.includes('unexpected')) {
    const foundMatch = errorMsg.match(/found ['"]?([^'"]+)['"]?/);
    const found = foundMatch ? foundMatch[1] : '';
    
    return {
      ...baseError,
      message: error.message,
      suggestion: found ? `Remove or fix "${found}"` : 'Check the syntax around this position',
      helpText: 'Common issues: extra commas, missing operators, or invalid characters',
    };
  }

  // Expected token
  if (errorMsg.includes('expected')) {
    const expectedMatch = errorMsg.match(/expected ([^,]+)/);
    const expected = expectedMatch ? expectedMatch[1] : '';
    
    if (expected.includes('cell reference')) {
      return {
        ...baseError,
        message: 'Expected a cell reference (e.g., A1, B2)',
        suggestion: 'Use a cell reference like A1 or a range like A1:A5',
        helpText: 'Cell references use column letters (A-Z) and row numbers (1-999)',
      };
    }
    
    if (expected.includes('parenthesis')) {
      return {
        ...baseError,
        message: error.message,
        suggestion: 'Add the missing parenthesis',
        helpText: 'Check that all parentheses are properly matched',
      };
    }

    return {
      ...baseError,
      message: error.message,
      suggestion: expected ? `Expected: ${expected}` : 'Check the formula syntax',
      helpText: 'Review the formula structure and ensure all parts are valid',
    };
  }

  // Invalid number
  if (errorMsg.includes('invalid number')) {
    return {
      ...baseError,
      message: 'Invalid number value',
      suggestion: 'Use a valid number (e.g., 123, 45.67, -10)',
      helpText: 'Numbers can be integers or decimals, positive or negative',
    };
  }

  // Invalid cell reference
  if (errorMsg.includes('invalid cell reference')) {
    return {
      ...baseError,
      message: 'Invalid cell reference',
      suggestion: 'Use valid cell references like A1, B2, or ranges like A1:A5',
      helpText: 'Cell references: Column letter (A-Z) + Row number (1-999). Ranges: A1:A5',
    };
  }

  // Function-related errors
  if (errorMsg.includes('function')) {
    return {
      ...baseError,
      message: error.message,
      suggestion: 'Check function name spelling and syntax',
      helpText: 'Functions must be followed by parentheses and arguments: =SUM(A1:A5)',
    };
  }

  // Missing comma/separator
  if (errorMsg.includes('comma') || errorMsg.includes('separator')) {
    return {
      ...baseError,
      message: 'Missing comma between arguments',
      suggestion: 'Add a comma (,) to separate function arguments',
      helpText: 'Function arguments are separated by commas: =SUM(A1, A2, A3)',
    };
  }

  // Return base error if no specific match
  return baseError;
}

/**
 * Get error position indicator (shows where error is in formula)
 */
export function getErrorPositionIndicator(formula: string, position: number): string {
  if (position < 0 || position > formula.length) {
    return '';
  }
  
  // Create indicator string with caret at error position
  const before = ' '.repeat(Math.max(0, position));
  const indicator = before + '^';
  
  return indicator;
}

/**
 * Get common formula error suggestions based on error type
 */
export function getCommonFormulaSuggestions(formula: string): string[] {
  const suggestions: string[] = [];
  const trimmed = formula.trim();

  // Check for common issues
  if (trimmed.startsWith('=') && trimmed.length > 1) {
    // Missing equals sign (but we already check this)
    if (!trimmed.match(/^=/)) {
      suggestions.push('Formulas should start with =');
    }

    // Unmatched parentheses
    const openParens = (trimmed.match(/\(/g) || []).length;
    const closeParens = (trimmed.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      suggestions.push(`Unmatched parentheses: ${openParens} opening, ${closeParens} closing`);
    }

    // Common typos
    if (trimmed.includes('sum(') && !trimmed.match(/sum\(/i)) {
      suggestions.push('Did you mean SUM? Function names are case-insensitive but should be uppercase');
    }
  }

  return suggestions;
}

/**
 * Format error for display with position highlighting
 */
export function formatFormulaErrorForDisplay(
  error: ParseError,
  formula: string
): { displayMessage: string; position: number; suggestion?: string; helpText?: string } {
  const enhanced = getEnhancedFormulaError(error, formula);
  
  return {
    displayMessage: enhanced.message,
    position: enhanced.position,
    suggestion: enhanced.suggestion,
    helpText: enhanced.helpText,
  };
}
