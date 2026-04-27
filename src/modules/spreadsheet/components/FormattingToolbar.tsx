/**
 * Formatting Toolbar Component
 * Provides alignment and decimal precision controls for spreadsheet cells
 */

import React from 'react';
import type { CellFormat } from '../models/SpreadsheetModel';

export interface FormattingToolbarProps {
  selectedCell?: { id: string; format?: CellFormat } | null;
  isReadOnly?: boolean;
  onFormatChange?: (format: Partial<CellFormat>) => void;
}

export const FormattingToolbar: React.FC<FormattingToolbarProps> = ({
  selectedCell,
  isReadOnly = false,
  onFormatChange,
}) => {
  const currentFormat = selectedCell?.format;
  const currentAlignment = currentFormat?.alignment || 'left';
  const currentDecimalPlaces = currentFormat?.decimalPlaces ?? 2;

  const handleAlignmentChange = (alignment: CellFormat['alignment']) => {
    if (isReadOnly || !onFormatChange) return;
    onFormatChange({ alignment });
  };

  const handleDecimalPrecisionChange = (increase: boolean) => {
    if (isReadOnly || !onFormatChange) return;
    const newPrecision = Math.max(0, Math.min(10, increase ? currentDecimalPlaces + 1 : currentDecimalPlaces - 1));
    onFormatChange({ decimalPlaces: newPrecision });
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-gray-50 border-b border-gray-200">
      {/* Alignment Controls */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        <span className="text-xs text-gray-600 mr-1">Align:</span>
        <button
          type="button"
          onClick={() => handleAlignmentChange('left')}
          disabled={isReadOnly}
          className={`w-8 h-8 flex items-center justify-center rounded border transition-colors ${
            currentAlignment === 'left'
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-white border-gray-300 hover:bg-gray-50'
          } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          title="Align Left"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h8" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => handleAlignmentChange('center')}
          disabled={isReadOnly}
          className={`w-8 h-8 flex items-center justify-center rounded border transition-colors ${
            currentAlignment === 'center'
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-white border-gray-300 hover:bg-gray-50'
          } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          title="Align Center"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => handleAlignmentChange('right')}
          disabled={isReadOnly}
          className={`w-8 h-8 flex items-center justify-center rounded border transition-colors ${
            currentAlignment === 'right'
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-white border-gray-300 hover:bg-gray-50'
          } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          title="Align Right"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Decimal Precision Controls */}
      <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
        <span className="text-xs text-gray-600 mr-1">Decimals:</span>
        <button
          type="button"
          onClick={() => handleDecimalPrecisionChange(false)}
          disabled={isReadOnly || currentDecimalPlaces <= 0}
          className={`w-8 h-8 flex items-center justify-center rounded border transition-colors ${
            isReadOnly || currentDecimalPlaces <= 0
              ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
              : 'bg-white border-gray-300 hover:bg-gray-50 cursor-pointer'
          }`}
          title="Decrease Decimal Places"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span className="text-xs font-medium text-gray-700 min-w-[2rem] text-center">
          {currentDecimalPlaces}
        </span>
        <button
          type="button"
          onClick={() => handleDecimalPrecisionChange(true)}
          disabled={isReadOnly || currentDecimalPlaces >= 10}
          className={`w-8 h-8 flex items-center justify-center rounded border transition-colors ${
            isReadOnly || currentDecimalPlaces >= 10
              ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
              : 'bg-white border-gray-300 hover:bg-gray-50 cursor-pointer'
          }`}
          title="Increase Decimal Places"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Content Controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            if (isReadOnly || !onFormatChange) return;
            // Clear cell value - handled by parent
            onFormatChange({ clearValue: true } as any);
          }}
          disabled={isReadOnly}
          className={`w-8 h-8 flex items-center justify-center rounded border transition-colors ${
            isReadOnly
              ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
              : 'bg-white border-gray-300 hover:bg-gray-50 cursor-pointer'
          }`}
          title="Clear Cell"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => {
            if (isReadOnly || !onFormatChange) return;
            // Reset formatting to defaults
            onFormatChange({ 
              alignment: 'left',
              decimalPlaces: 2,
              resetFormat: true 
            } as any);
          }}
          disabled={isReadOnly}
          className={`w-8 h-8 flex items-center justify-center rounded border transition-colors ${
            isReadOnly
              ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
              : 'bg-white border-gray-300 hover:bg-gray-50 cursor-pointer'
          }`}
          title="Reset Formatting"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>
  );
};

