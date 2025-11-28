/**
 * Formula Helpers
 * Utilities for working with spreadsheet formulas, column letters, and cell references
 */

/**
 * Convert column index (0-based) to column letter (A, B, C, ..., Z, AA, AB, ...)
 * @param index 0-based column index
 * @returns Column letter (e.g., 0 -> 'A', 25 -> 'Z', 26 -> 'AA')
 */
export function getColumnLetter(index: number): string {
  let result = '';
  index++; // Convert to 1-based
  
  while (index > 0) {
    index--;
    result = String.fromCharCode(65 + (index % 26)) + result;
    index = Math.floor(index / 26);
  }
  
  return result;
}

/**
 * Convert column letter to 0-based column index
 * @param letter Column letter (e.g., 'A' -> 0, 'Z' -> 25, 'AA' -> 26)
 * @returns 0-based column index
 */
export function getColumnIndex(letter: string): number {
  let result = 0;
  const upperLetter = letter.toUpperCase();
  
  for (let i = 0; i < upperLetter.length; i++) {
    result = result * 26 + (upperLetter.charCodeAt(i) - 64);
  }
  
  return result - 1; // Convert to 0-based
}

/**
 * Generate cell ID from row and column (0-based)
 * @param row 0-based row index
 * @param col 0-based column index
 * @returns Cell ID (e.g., "A1", "B2")
 */
export function getCellId(row: number, col: number): string {
  return `${getColumnLetter(col)}${row + 1}`;
}

/**
 * Parse cell ID to row and column indices
 * @param cellId Cell ID (e.g., "A1", "B2")
 * @returns Object with row and col (0-based)
 */
export function parseCellId(cellId: string): { row: number; col: number } {
  const match = cellId.match(/^([A-Z]+)(\d+)$/i);
  if (!match) {
    throw new Error(`Invalid cell ID: ${cellId}`);
  }
  
  const col = getColumnIndex(match[1]);
  const row = parseInt(match[2], 10) - 1; // Convert to 0-based
  
  return { row, col };
}

/**
 * Generate available column letters up to a certain count
 * @param count Number of columns
 * @returns Array of column letters
 */
export function generateAvailableLetters(count: number): string[] {
  return Array.from({ length: count }, (_, i) => getColumnLetter(i));
}

/**
 * Transform template formula to adjust cell references
 * Useful when applying templates to different spreadsheet positions
 * @param formula Original formula string
 * @param rowOffset Row offset to apply
 * @param colOffset Column offset to apply
 * @returns Transformed formula
 */
export function transformTemplateFormula(
  formula: string,
  rowOffset: number = 0,
  colOffset: number = 0
): string {
  // Match cell references like A1, B2, etc.
  const cellRefRegex = /([A-Z]+)(\d+)/gi;
  
  return formula.replace(cellRefRegex, (match, colLetter, rowNum) => {
    const colIndex = getColumnIndex(colLetter);
    const rowIndex = parseInt(rowNum, 10) - 1;
    
    const newCol = getColumnLetter(colIndex + colOffset);
    const newRow = rowIndex + rowOffset + 1; // Convert back to 1-based
    
    return `${newCol}${newRow}`;
  });
}

/**
 * Extract cell references from a formula
 * @param formula Formula string
 * @returns Array of cell IDs referenced in the formula
 */
export function extractCellReferences(formula: string): string[] {
  const cellRefRegex = /([A-Z]+\d+)/gi;
  const matches = formula.match(cellRefRegex);
  return matches ? [...new Set(matches.map(m => m.toUpperCase()))] : [];
}

/**
 * Validate formula syntax (basic check)
 * @param formula Formula string
 * @returns true if formula appears valid
 */
export function isValidFormulaSyntax(formula: string): boolean {
  if (!formula || !formula.startsWith('=')) {
    return false;
  }
  
  // Basic validation: check for balanced parentheses
  let depth = 0;
  for (const char of formula) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth < 0) return false;
  }
  
  return depth === 0;
}

