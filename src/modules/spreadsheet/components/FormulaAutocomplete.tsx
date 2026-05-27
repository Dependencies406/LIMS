/**
 * Formula Autocomplete Component
 * Provides autocomplete suggestions and syntax hints for formulas (like Excel/Google Sheets)
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';

export interface FormulaDefinition {
  name: string;
  category: 'Math' | 'Statistical' | 'Trigonometric' | 'Logical' | 'Text' | 'Date/Time';
  description: string;
  syntax: string;
  examples: string[];
  args: string;
}

// Formula definitions (shared with FormulaGuideModal)
export const FORMULA_DEFINITIONS: FormulaDefinition[] = [
  // Math Functions
  { name: 'SUM', category: 'Math', description: 'Sums all numbers in a range or list', syntax: 'SUM(range)', args: 'range or values', examples: ['=SUM(A1:A5)', '=SUM(A1, A2, A3)', '=SUM(A1:A3, B1:B3)'] },
  { name: 'AVG', category: 'Statistical', description: 'Calculates the average of numbers', syntax: 'AVG(range)', args: 'range or values', examples: ['=AVG(A1:A5)', '=AVG(A1, A2, A3)'] },
  { name: 'AVERAGE', category: 'Statistical', description: 'Alias for AVG - calculates the average', syntax: 'AVERAGE(range)', args: 'range or values', examples: ['=AVERAGE(A1:A5)'] },
  { name: 'MIN', category: 'Statistical', description: 'Returns the minimum value', syntax: 'MIN(range)', args: 'range or values', examples: ['=MIN(A1:A5)', '=MIN(A1, A2, A3)'] },
  { name: 'MAX', category: 'Statistical', description: 'Returns the maximum value', syntax: 'MAX(range)', args: 'range or values', examples: ['=MAX(A1:A5)', '=MAX(A1, A2, A3)'] },
  { name: 'ROUND', category: 'Math', description: 'Rounds a number to specified decimal places', syntax: 'ROUND(value, decimals)', args: 'value, [decimals]', examples: ['=ROUND(A1, 2)', '=ROUND(3.14159, 2)'] },
  { name: 'ROUNDUP', category: 'Math', description: 'Rounds a number up to specified decimal places', syntax: 'ROUNDUP(value, decimals)', args: 'value, [decimals]', examples: ['=ROUNDUP(A1, 2)', '=ROUNDUP(3.14159, 2)'] },
  { name: 'ROUNDDOWN', category: 'Math', description: 'Rounds a number down to specified decimal places', syntax: 'ROUNDDOWN(value, decimals)', args: 'value, [decimals]', examples: ['=ROUNDDOWN(A1, 2)', '=ROUNDDOWN(3.14159, 2)'] },
  { name: 'CEILING', category: 'Math', description: 'Rounds a number up to the nearest integer', syntax: 'CEILING(value)', args: 'value', examples: ['=CEILING(3.2)', '=CEILING(-3.2)'] },
  { name: 'FLOOR', category: 'Math', description: 'Rounds a number down to the nearest integer', syntax: 'FLOOR(value)', args: 'value', examples: ['=FLOOR(3.8)', '=FLOOR(-3.8)'] },
  { name: 'TRUNC', category: 'Math', description: 'Truncates a number to an integer', syntax: 'TRUNC(value)', args: 'value', examples: ['=TRUNC(3.8)', '=TRUNC(-3.8)'] },
  { name: 'ABS', category: 'Math', description: 'Returns the absolute value of a number', syntax: 'ABS(value)', args: 'value', examples: ['=ABS(-5)', '=ABS(5)'] },
  { name: 'SQRT', category: 'Math', description: 'Returns the square root of a number', syntax: 'SQRT(value)', args: 'value', examples: ['=SQRT(16)', '=SQRT(A1)'] },
  { name: 'POWER', category: 'Math', description: 'Raises a number to a power', syntax: 'POWER(base, exponent)', args: 'base, exponent', examples: ['=POWER(2, 3)', '=POWER(A1, 2)'] },
  { name: 'EXP', category: 'Math', description: 'Returns e raised to the power of a number', syntax: 'EXP(value)', args: 'value', examples: ['=EXP(1)', '=EXP(A1)'] },
  { name: 'LN', category: 'Math', description: 'Returns the natural logarithm of a number', syntax: 'LN(value)', args: 'value', examples: ['=LN(2.718)', '=LN(A1)'] },
  { name: 'LOG', category: 'Math', description: 'Returns the logarithm of a number to a specified base', syntax: 'LOG(value, [base])', args: 'value, [base=10]', examples: ['=LOG(100)', '=LOG(8, 2)'] },
  { name: 'MOD', category: 'Math', description: 'Returns the remainder after division', syntax: 'MOD(dividend, divisor)', args: 'dividend, divisor', examples: ['=MOD(10, 3)', '=MOD(A1, 2)'] },
  { name: 'PI', category: 'Math', description: 'Returns the value of π (pi)', syntax: 'PI()', args: 'none', examples: ['=PI()', '=2*PI()*A1'] },

  // Statistical Functions
  { name: 'COUNT', category: 'Statistical', description: 'Counts the number of numeric values', syntax: 'COUNT(range)', args: 'range or values', examples: ['=COUNT(A1:A10)', '=COUNT(A1, A2, A3)'] },
  { name: 'COUNTA', category: 'Statistical', description: 'Counts the number of non-empty values', syntax: 'COUNTA(range)', args: 'range or values', examples: ['=COUNTA(A1:A10)'] },
  { name: 'STDEV', category: 'Statistical', description: 'Calculates sample standard deviation', syntax: 'STDEV(range)', args: 'range (min 2 values)', examples: ['=STDEV(A1:A10)'] },
  { name: 'STDEVP', category: 'Statistical', description: 'Calculates population standard deviation', syntax: 'STDEVP(range)', args: 'range (min 2 values)', examples: ['=STDEVP(A1:A10)'] },
  { name: 'VAR', category: 'Statistical', description: 'Calculates sample variance', syntax: 'VAR(range)', args: 'range (min 2 values)', examples: ['=VAR(A1:A10)'] },
  { name: 'VARP', category: 'Statistical', description: 'Calculates population variance', syntax: 'VARP(range)', args: 'range (min 2 values)', examples: ['=VARP(A1:A10)'] },
  { name: 'MEDIAN', category: 'Statistical', description: 'Returns the median value', syntax: 'MEDIAN(range)', args: 'range or values', examples: ['=MEDIAN(A1:A10)', '=MEDIAN(1, 2, 3, 4, 5)'] },
  { name: 'MODE', category: 'Statistical', description: 'Returns the most frequently occurring value', syntax: 'MODE(range)', args: 'range or values', examples: ['=MODE(A1:A10)'] },
  { name: 'PERCENTILE', category: 'Statistical', description: 'Returns the k-th percentile of values', syntax: 'PERCENTILE(range, k)', args: 'range, k (0-1)', examples: ['=PERCENTILE(A1:A10, 0.5)', '=PERCENTILE(A1:A10, 0.95)'] },
  { name: 'QUARTILE', category: 'Statistical', description: 'Returns the quartile of a data set', syntax: 'QUARTILE(range, quart)', args: 'range, quart (0-4)', examples: ['=QUARTILE(A1:A10, 1)', '=QUARTILE(A1:A10, 3)'] },

  // Trigonometric Functions
  { name: 'SIN', category: 'Trigonometric', description: 'Returns the sine of an angle (in radians)', syntax: 'SIN(angle)', args: 'angle (radians)', examples: ['=SIN(PI()/2)', '=SIN(RADIANS(90))'] },
  { name: 'COS', category: 'Trigonometric', description: 'Returns the cosine of an angle (in radians)', syntax: 'COS(angle)', args: 'angle (radians)', examples: ['=COS(0)', '=COS(RADIANS(60))'] },
  { name: 'TAN', category: 'Trigonometric', description: 'Returns the tangent of an angle (in radians)', syntax: 'TAN(angle)', args: 'angle (radians)', examples: ['=TAN(PI()/4)', '=TAN(RADIANS(45))'] },
  { name: 'ASIN', category: 'Trigonometric', description: 'Returns the arcsine (inverse sine) in radians', syntax: 'ASIN(value)', args: 'value (-1 to 1)', examples: ['=ASIN(1)', '=DEGREES(ASIN(0.5))'] },
  { name: 'ACOS', category: 'Trigonometric', description: 'Returns the arccosine (inverse cosine) in radians', syntax: 'ACOS(value)', args: 'value (-1 to 1)', examples: ['=ACOS(0)', '=DEGREES(ACOS(0.5))'] },
  { name: 'ATAN', category: 'Trigonometric', description: 'Returns the arctangent (inverse tangent) in radians', syntax: 'ATAN(value)', args: 'value', examples: ['=ATAN(1)', '=DEGREES(ATAN(1))'] },
  { name: 'DEGREES', category: 'Trigonometric', description: 'Converts radians to degrees', syntax: 'DEGREES(radians)', args: 'radians', examples: ['=DEGREES(PI())', '=DEGREES(PI()/2)'] },
  { name: 'RADIANS', category: 'Trigonometric', description: 'Converts degrees to radians', syntax: 'RADIANS(degrees)', args: 'degrees', examples: ['=RADIANS(180)', '=RADIANS(90)'] },

  // Logical Functions
  { name: 'IF', category: 'Logical', description: 'Returns one value if condition is true, another if false', syntax: 'IF(condition, value_if_true, [value_if_false])', args: 'condition, true_value, [false_value]', examples: ['=IF(A1>10, "High", "Low")', '=IF(A1>0, A1, 0)'] },
  { name: 'AND', category: 'Logical', description: 'Returns TRUE if all arguments are true', syntax: 'AND(condition1, condition2, ...)', args: 'conditions', examples: ['=AND(A1>0, A1<100)', '=AND(A1>10, B1>10)'] },
  { name: 'OR', category: 'Logical', description: 'Returns TRUE if any argument is true', syntax: 'OR(condition1, condition2, ...)', args: 'conditions', examples: ['=OR(A1>100, B1>100)', '=OR(A1="Yes", B1="Yes")'] },
  { name: 'NOT', category: 'Logical', description: 'Reverses the logical value of its argument', syntax: 'NOT(condition)', args: 'condition', examples: ['=NOT(A1>10)', '=NOT(TRUE)'] },
  { name: 'IFERROR', category: 'Logical', description: 'Returns a value if formula results in error, otherwise returns formula result', syntax: 'IFERROR(value, value_if_error)', args: 'value, error_value', examples: ['=IFERROR(A1/B1, 0)', '=IFERROR(1/0, "Error")'] },
];

export interface FormulaAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onCommit?: (value?: string) => void;
  onEscape?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export const FormulaAutocomplete: React.FC<FormulaAutocompleteProps> = ({
  value,
  onChange,
  onCommit,
  onEscape,
  placeholder,
  disabled = false,
  className = '',
  inputRef: externalInputRef,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedFormula, setSelectedFormula] = useState<FormulaDefinition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputElementRef = externalInputRef || inputRef;

  // Extract the current word being typed (for autocomplete)
  const getCurrentWord = (text: string, cursorPosition: number): { word: string; start: number; end: number } => {
    // Find the start of the current word (skip = if present)
    let start = cursorPosition - 1;
    while (start >= 0 && /[A-Za-z0-9_]/.test(text[start])) {
      start--;
    }
    start++;
    
    // Find the end of the current word
    let end = cursorPosition;
    while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) {
      end++;
    }

    const word = text.substring(start, end);
    return { word, start, end };
  };

  // Get suggestions based on current input
  const suggestions = useMemo(() => {
    if (!value || !showSuggestions) return [];

    const cursorPos = inputElementRef.current?.selectionStart || value.length;
    const { word } = getCurrentWord(value, cursorPos);

    if (word.length < 1) return [];

    const query = word.toUpperCase();
    return FORMULA_DEFINITIONS.filter(formula =>
      formula.name.toUpperCase().startsWith(query)
    ).slice(0, 10); // Limit to 10 suggestions
  }, [value, showSuggestions, inputElementRef]);

  // Update selected formula when selection changes
  useEffect(() => {
    if (suggestions.length > 0 && selectedIndex >= 0 && selectedIndex < suggestions.length) {
      setSelectedFormula(suggestions[selectedIndex]);
    } else {
      setSelectedFormula(null);
    }
  }, [selectedIndex, suggestions]);

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    // Show suggestions if typing a formula (starts with =) and has text
    if (newValue.startsWith('=') && newValue.length > 1) {
      const cursorPos = e.target.selectionStart || 0;
      const { word } = getCurrentWord(newValue, cursorPos);
      if (word.length >= 1) {
        setShowSuggestions(true);
        setSelectedIndex(0);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  // Handle key down
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter' && onCommit) {
        e.preventDefault();
        onCommit();
      } else if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          insertSuggestion(suggestions[selectedIndex]);
        } else if (onCommit) {
          onCommit();
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setSelectedFormula(null);
        if (onEscape) {
          onEscape();
        }
        break;
      case 'Tab':
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          e.preventDefault();
          insertSuggestion(suggestions[selectedIndex]);
        }
        break;
    }

    // Scroll selected item into view
    if (suggestionsRef.current && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const selectedElement = suggestionsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  // Insert suggestion into input
  const insertSuggestion = (formula: FormulaDefinition) => {
    if (!inputElementRef.current) return;

    const input = inputElementRef.current;
    const cursorPos = input.selectionStart || 0;
    const { word, start, end } = getCurrentWord(value, cursorPos);

    const before = value.substring(0, start);
    const after = value.substring(end);
    const newValue = before + formula.name + '(' + after;

    onChange(newValue);
    setShowSuggestions(false);
    setSelectedFormula(null);

    // Set cursor position after the inserted function name and opening parenthesis
    setTimeout(() => {
      const newCursorPos = start + formula.name.length + 1;
      input.setSelectionRange(newCursorPos, newCursorPos);
      input.focus();
    }, 0);
  };

  // Handle suggestion click
  const handleSuggestionClick = (formula: FormulaDefinition) => {
    insertSuggestion(formula);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSuggestions]);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputElementRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (value.startsWith('=') && value.length > 1) {
            const cursorPos = inputElementRef.current?.selectionStart || 0;
            const { word } = getCurrentWord(value, cursorPos);
            if (word.length >= 1) {
              setShowSuggestions(true);
            }
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={className || 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'}
      />

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto"
          style={{ top: '100%' }}
        >
          {suggestions.map((formula, index) => (
            <div
              key={formula.name}
              onClick={() => handleSuggestionClick(formula)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`px-4 py-2 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                index === selectedIndex
                  ? 'bg-blue-50 border-l-4 border-l-blue-500'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{formula.name}</div>
                  <div className="text-sm text-gray-600">{formula.description}</div>
                </div>
                <div className="ml-4 px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded">
                  {formula.category}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formula Syntax Popup */}
      {selectedFormula && showSuggestions && (
        <div
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl p-4"
          style={{ top: showSuggestions && suggestions.length > 0 ? `${(suggestions.length * 56) + 4}px` : '100%' }}
        >
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Syntax:</div>
              <code className="text-blue-600 font-mono text-sm block">{selectedFormula.syntax}</code>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Description:</div>
              <div className="text-sm text-gray-700">{selectedFormula.description}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Arguments:</div>
              <div className="text-sm text-gray-700 font-medium">{selectedFormula.args}</div>
            </div>
            {selectedFormula.examples.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Example:</div>
                <code className="text-blue-600 font-mono text-xs block bg-gray-50 p-2 rounded">
                  {selectedFormula.examples[0]}
                </code>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
