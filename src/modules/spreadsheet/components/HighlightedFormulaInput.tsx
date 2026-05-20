/**
 * Highlighted Formula Input Component
 * Displays formula with syntax highlighting (like Excel formula bar)
 */

import React, { useRef, useEffect, useState } from 'react';
import { parseFormulaForHighlighting, getSegmentColor, getSegmentBackgroundColor, type HighlightedSegment } from '../utils/formulaHighlighter';

export interface HighlightedFormulaInputProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  columnNames: string[];
  error?: boolean;
}

export const HighlightedFormulaInput: React.FC<HighlightedFormulaInputProps> = ({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  disabled,
  className = '',
  columnNames,
  error = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const segments = parseFormulaForHighlighting(value, columnNames);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    // Native input handles cursor position automatically - no manual syncing needed
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  // Get computed styles from input to match overlay exactly
  useEffect(() => {
    if (inputRef.current && overlayRef.current) {
      const inputStyle = window.getComputedStyle(inputRef.current);
      const overlay = overlayRef.current;
      const overlayContent = overlay.querySelector('div') as HTMLElement;
      
      // Match all font and spacing properties exactly
      overlay.style.fontSize = inputStyle.fontSize;
      overlay.style.fontFamily = inputStyle.fontFamily;
      overlay.style.fontWeight = inputStyle.fontWeight;
      overlay.style.letterSpacing = inputStyle.letterSpacing;
      // EXACT PADDING MATCH: No offset hacks - overlay must match input exactly
      overlay.style.padding = inputStyle.padding;
      overlay.style.paddingTop = inputStyle.paddingTop;
      overlay.style.paddingBottom = inputStyle.paddingBottom;
      overlay.style.paddingLeft = inputStyle.paddingLeft;
      overlay.style.paddingRight = inputStyle.paddingRight;
      overlay.style.lineHeight = inputStyle.lineHeight;
      overlay.style.boxSizing = inputStyle.boxSizing;
      overlay.style.borderWidth = inputStyle.borderWidth;
      overlay.style.borderStyle = inputStyle.borderStyle;
      overlay.style.height = inputStyle.height;
      overlay.style.minHeight = inputStyle.minHeight;
      overlay.style.verticalAlign = 'baseline'; // Match input's text alignment
      
      // Match content container exactly - ensure it aligns with input text
      if (overlayContent) {
        overlayContent.style.fontSize = inputStyle.fontSize;
        overlayContent.style.fontFamily = inputStyle.fontFamily;
        overlayContent.style.fontWeight = inputStyle.fontWeight;
        overlayContent.style.letterSpacing = inputStyle.letterSpacing;
        overlayContent.style.lineHeight = inputStyle.lineHeight;
        overlayContent.style.verticalAlign = 'baseline';
        // Ensure the content starts at the same vertical position as input text
        overlayContent.style.marginTop = '0';
        overlayContent.style.marginBottom = '0';
      }
    }
  }, [value, isFocused]);

  return (
    <div className="highlighted-formula-input relative w-full bg-white" style={{ isolation: 'isolate', backgroundColor: '#FFFFFF' }}>
      {/* Overlay with highlighted text - positioned behind input */}
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none px-3 py-2 text-sm overflow-hidden bg-white"
        style={{
          zIndex: 1,
          backgroundColor: '#FFFFFF',
          display: 'block', // Use block instead of flex for better text alignment
        }}
      >
        {value ? (
          <div 
            className="bg-white whitespace-nowrap overflow-hidden" 
            style={{ 
              backgroundColor: '#FFFFFF',
              display: 'inline-block',
              lineHeight: 'inherit',
            }}
          >
            {segments.map((segment, index) => {
              const color = getSegmentColor(segment.type);
              const bgColor = getSegmentBackgroundColor(segment.type);
              
              return (
                <span
                  key={index}
                  style={{
                    color: color, // Use the specific color for each segment type
                    backgroundColor: bgColor,
                    // Keep font-weight normal so overlay character widths match input (cursor alignment)
                    fontWeight: 'normal',
                    // ZERO-WIDTH HIGHLIGHTING: No padding, margin, or spacing that changes text width
                    padding: '0',
                    margin: '0',
                    borderRadius: segment.type === 'column' ? '2px' : '0',
                    whiteSpace: 'pre',
                    // Ensure colors are not overridden by inheritance
                    WebkitTextFillColor: color,
                    display: 'inline',
                    verticalAlign: 'baseline',
                  }}
                >
                  {segment.text}
                </span>
              );
            })}
          </div>
        ) : (
          <span 
            className="text-gray-400 bg-white" 
            style={{ 
              color: '#9CA3AF', 
              backgroundColor: '#FFFFFF',
              verticalAlign: 'baseline',
            }}
          >
            {placeholder}
          </span>
        )}
      </div>
      
      {/* Input with transparent text and background, visible caret - on top of overlay */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        // Native input handles cursor position automatically - no manual event handlers needed
        placeholder=""
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded text-sm text-transparent relative bg-transparent ${
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
            : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
        } ${className}`}
        style={{
          caretColor: '#000000',
          color: 'transparent',
          backgroundColor: 'transparent', // Transparent background so overlay shows through
          zIndex: 2,
          position: 'relative',
          // EXACT PADDING MATCH: No offset - must match overlay exactly
        }}
      />
    </div>
  );
};
