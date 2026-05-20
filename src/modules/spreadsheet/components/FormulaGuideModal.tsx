/**
 * Formula Guide Modal
 * Documentation for spreadsheet formulas with search/filter
 */

import React, { useState, useMemo } from 'react';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';

export interface FormulaGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FormulaDefinition {
  name: string;
  category: 'Math' | 'Statistical' | 'Trigonometric' | 'Logical' | 'Text' | 'Date/Time';
  description: string;
  syntax: string;
  examples: string[];
  args: string;
}

const FORMULAS: FormulaDefinition[] = [
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
  { name: 'IF', category: 'Logical', description: 'Returns one value if condition is non-zero, another if zero', syntax: 'IF(condition, value_if_true, [value_if_false])', args: 'condition, true_value, [false_value]', examples: ['=IF(A1, 100, 0)', '=IF(AND(A1,B1), A1, 0)'] },
  { name: 'AND', category: 'Logical', description: 'Returns 1 if all arguments are non-zero, else 0', syntax: 'AND(value1, value2, ...)', args: 'values', examples: ['=AND(A1, B1)', '=AND(cp, measurement.cp)'] },
  { name: 'OR', category: 'Logical', description: 'Returns 1 if any argument is non-zero, else 0', syntax: 'OR(value1, value2, ...)', args: 'values', examples: ['=OR(A1, B1)', '=OR(cp, measurement.cp)'] },
  { name: 'NOT', category: 'Logical', description: 'Returns 1 when argument is zero, else 0', syntax: 'NOT(value)', args: 'value', examples: ['=NOT(A1)', '=NOT(cp)'] },
  { name: 'IFERROR', category: 'Logical', description: 'Returns fallback when the first expression errors', syntax: 'IFERROR(value, value_if_error)', args: 'value, error_value', examples: ['=IFERROR(A1/B1, 0)', '=IFERROR(1/0, 999)'] },
];

const CATEGORIES = ['All', 'Math', 'Statistical', 'Trigonometric', 'Logical'] as const;

export const FormulaGuideModal: React.FC<FormulaGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showSyntaxNotes, setShowSyntaxNotes] = useState(false);

  const filteredFormulas = useMemo(() => {
    let filtered = FORMULAS;

    // Filter by category
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(f => f.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(f =>
        f.name.toLowerCase().includes(query) ||
        f.description.toLowerCase().includes(query) ||
        f.syntax.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [searchQuery, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="modal-content max-w-6xl w-full h-[95vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 basis-[30%] min-h-[180px] overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-2xl font-bold text-gray-900">Formula Guide</h2>
            <Button onClick={onClose} variant="secondary">
              Close
            </Button>
          </div>

          {/* Search and Filter */}
          <div className="space-y-2.5">
            {/* Search Bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search formulas by name, description, or syntax..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  title="Clear search"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Results Count */}
            <div className="text-xs text-gray-600">
              Showing {filteredFormulas.length} of {FORMULAS.length} formulas
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
              <button
                type="button"
                onClick={() => setShowSyntaxNotes((prev) => !prev)}
                className="w-full flex items-center justify-between text-left"
              >
                <span className="font-semibold">Syntax Notes (Web App)</span>
                <span className="font-mono text-sm">{showSyntaxNotes ? '[-]' : '[+]'}</span>
              </button>
              {showSyntaxNotes && (
                <div className="mt-2 space-y-1">
                  <div>Use formulas with a leading <code className="font-mono">=</code> and operators <code className="font-mono">+ - * / ^</code>.</div>
                  <div>Use column values for normal formulas (for example <code className="font-mono">=cp*1.05</code>) or A1 references (for example <code className="font-mono">=A1*1.05</code>).</div>
                  <div>Cross-tab reference format is <code className="font-mono">TabName.ColumnValue</code> (for example <code className="font-mono">=measurement.cp</code>).</div>
                  <div>String literals and comparison operators (such as <code className="font-mono">&gt;</code>, <code className="font-mono">&lt;</code>, <code className="font-mono">= "text"</code>) are not supported in formulas here.</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Formula List - Scrollable */}
        <div className="basis-[70%] overflow-y-auto px-5 py-4 min-h-0">
          {filteredFormulas.length === 0 ? (
            <Card>
              <div className="text-center py-8 text-gray-500">
                No formulas found matching your search.
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredFormulas.map((formula) => (
                <Card key={formula.name} className="hover:shadow-md transition-shadow">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="text-xl font-bold text-gray-900">{formula.name}</h3>
                          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-primary-100 text-primary-700">
                            {formula.category}
                          </span>
                        </div>
                        <p className="text-gray-700 text-base mb-4 leading-relaxed">{formula.description}</p>
                        <div className="bg-gray-50 p-5 rounded-lg border border-gray-200 mb-4 min-h-[110px]">
                          <div className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Syntax:</div>
                          <code className="text-primary-600 font-mono text-base block mb-3 break-words">{formula.syntax}</code>
                          <div className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Arguments:</div>
                          <div className="text-sm text-gray-700 font-medium">{formula.args}</div>
                        </div>
                        {formula.examples.length > 0 && (
                          <div className="mt-4">
                            <div className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Examples:</div>
                            <div className="space-y-2">
                              {formula.examples.map((example, idx) => (
                                <code key={idx} className="block text-primary-600 font-mono text-sm bg-white p-3 rounded border border-gray-200 hover:bg-gray-50 transition-colors">
                                  {example}
                                </code>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
