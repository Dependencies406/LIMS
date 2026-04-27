/**
 * Formula Highlighter Utility
 * Parses formulas and identifies column references for highlighting
 */

export interface HighlightedSegment {
  text: string;
  type: 'column' | 'function' | 'operator' | 'number' | 'text' | 'default';
  startIndex: number;
  endIndex: number;
  columnName?: string;
}

/**
 * Extract column references from a formula
 * Supports column letters (A, B, C) and column names
 */
export function parseColumnReferences(formula: string, columnNames: string[]): Array<{ name: string; startIndex: number; endIndex: number }> {
  const references: Array<{ name: string; startIndex: number; endIndex: number }> = [];
  
  if (!formula) return references;
  
  // Remove leading = if present for parsing
  const formulaWithoutEquals = formula.startsWith('=') ? formula.substring(1) : formula;
  
  // Match column letters (A, B, C, ..., Z, AA, AB, etc.)
  const columnLetterPattern = /\b[A-Z]+\b/gi;
  let match;
  while ((match = columnLetterPattern.exec(formulaWithoutEquals)) !== null) {
    const columnLetter = match[0];
    // Check if it's a valid column reference (not part of a function name)
    const before = formulaWithoutEquals[match.index - 1] || '';
    const after = formulaWithoutEquals[match.index + columnLetter.length] || '';
    
    // Column references are typically followed by operators, parentheses, or end of string
    // and not preceded by letters (to avoid matching function names)
    if (!/[a-zA-Z]/.test(before) && (!/[a-zA-Z0-9]/.test(after) || after === '(')) {
      references.push({
        name: columnLetter,
        startIndex: match.index + (formula.startsWith('=') ? 1 : 0), // Adjust for = sign
        endIndex: match.index + columnLetter.length + (formula.startsWith('=') ? 1 : 0),
      });
    }
  }
  
  // Match column names (exact matches from columnNames array)
  columnNames.forEach(columnName => {
    if (!columnName || columnName.trim() === '') return;
    
    // Escape special regex characters in column name
    const escapedName = columnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const namePattern = new RegExp(`\\b${escapedName}\\b`, 'gi');
    
    let nameMatch;
    while ((nameMatch = namePattern.exec(formulaWithoutEquals)) !== null) {
      // Check if it's not already matched as a column letter
      const isDuplicate = references.some(ref => 
        ref.startIndex === nameMatch!.index + (formula.startsWith('=') ? 1 : 0) &&
        ref.endIndex === nameMatch!.index + nameMatch![0].length + (formula.startsWith('=') ? 1 : 0)
      );
      
      if (!isDuplicate) {
        references.push({
          name: columnName,
          startIndex: nameMatch.index + (formula.startsWith('=') ? 1 : 0),
          endIndex: nameMatch.index + nameMatch[0].length + (formula.startsWith('=') ? 1 : 0),
        });
      }
    }
  });
  
  // Sort by start index
  references.sort((a, b) => a.startIndex - b.startIndex);
  
  // Remove overlapping references (keep longer ones)
  const filtered: Array<{ name: string; startIndex: number; endIndex: number }> = [];
  for (const ref of references) {
    const overlaps = filtered.some(existing => 
      (ref.startIndex >= existing.startIndex && ref.startIndex < existing.endIndex) ||
      (ref.endIndex > existing.startIndex && ref.endIndex <= existing.endIndex) ||
      (ref.startIndex <= existing.startIndex && ref.endIndex >= existing.endIndex)
    );
    
    if (!overlaps) {
      filtered.push(ref);
    }
  }
  
  return filtered;
}

/**
 * Parse formula into highlighted segments
 */
export function parseFormulaForHighlighting(formula: string, columnNames: string[]): HighlightedSegment[] {
  if (!formula) return [];
  
  const segments: HighlightedSegment[] = [];
  const columnRefs = parseColumnReferences(formula, columnNames);
  
  // Common function names
  const functions = ['SUM', 'AVG', 'AVERAGE', 'MAX', 'MIN', 'COUNT', 'IF', 'ABS', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'SQRT', 'POWER', 'LOG', 'LN', 'EXP', 'SIN', 'COS', 'TAN'];
  
  let currentIndex = 0;
  const formulaLength = formula.length;
  
  while (currentIndex < formulaLength) {
    // Check if we're at a column reference
    const columnRef = columnRefs.find(ref => ref.startIndex === currentIndex);
    if (columnRef) {
      segments.push({
        text: formula.substring(columnRef.startIndex, columnRef.endIndex),
        type: 'column',
        startIndex: columnRef.startIndex,
        endIndex: columnRef.endIndex,
        columnName: columnRef.name,
      });
      currentIndex = columnRef.endIndex;
      continue;
    }
    
    // Check if we're at a function name
    let functionMatch: { name: string; endIndex: number } | null = null;
    for (const funcName of functions) {
      const funcPattern = new RegExp(`^${funcName}\\s*\\(`, 'i');
      const remaining = formula.substring(currentIndex);
      if (funcPattern.test(remaining)) {
        functionMatch = {
          name: funcName,
          endIndex: currentIndex + funcName.length,
        };
        break;
      }
    }
    
    if (functionMatch) {
      segments.push({
        text: functionMatch.name,
        type: 'function',
        startIndex: currentIndex,
        endIndex: functionMatch.endIndex,
      });
      currentIndex = functionMatch.endIndex;
      continue;
    }
    
    // Check for numbers
    const numberMatch = formula.substring(currentIndex).match(/^\d+(\.\d+)?/);
    if (numberMatch) {
      segments.push({
        text: numberMatch[0],
        type: 'number',
        startIndex: currentIndex,
        endIndex: currentIndex + numberMatch[0].length,
      });
      currentIndex += numberMatch[0].length;
      continue;
    }
    
    // Check for operators
    const operatorMatch = formula.substring(currentIndex).match(/^[+\-*/=<>!&|(),]/);
    if (operatorMatch) {
      segments.push({
        text: operatorMatch[0],
        type: 'operator',
        startIndex: currentIndex,
        endIndex: currentIndex + 1,
      });
      currentIndex += 1;
      continue;
    }
    
    // Check for string literals
    if (formula[currentIndex] === '"') {
      const stringEnd = formula.indexOf('"', currentIndex + 1);
      if (stringEnd !== -1) {
        segments.push({
          text: formula.substring(currentIndex, stringEnd + 1),
          type: 'text',
          startIndex: currentIndex,
          endIndex: stringEnd + 1,
        });
        currentIndex = stringEnd + 1;
        continue;
      }
    }
    
    // Default: single character
    segments.push({
      text: formula[currentIndex],
      type: 'default',
      startIndex: currentIndex,
      endIndex: currentIndex + 1,
    });
    currentIndex += 1;
  }
  
  return segments;
}

/**
 * Get color for segment type
 */
export function getSegmentColor(type: HighlightedSegment['type']): string {
  switch (type) {
    case 'column':
      return '#0066CC'; // Blue for column references
    case 'function':
      return '#7C3AED'; // Purple for functions
    case 'operator':
      return '#DC2626'; // Red for operators
    case 'number':
      return '#059669'; // Green for numbers
    case 'text':
      return '#D97706'; // Orange for text
    default:
      return '#000000'; // Black for default
  }
}

/**
 * Get background color for segment type
 */
export function getSegmentBackgroundColor(type: HighlightedSegment['type']): string {
  switch (type) {
    case 'column':
      return '#E0F2FE'; // Light blue background
    case 'function':
      return '#F3E8FF'; // Light purple background
    case 'operator':
      return '#FEE2E2'; // Light red background
    case 'number':
      return '#D1FAE5'; // Light green background
    case 'text':
      return '#FED7AA'; // Light orange background
    default:
      return 'transparent';
  }
}
