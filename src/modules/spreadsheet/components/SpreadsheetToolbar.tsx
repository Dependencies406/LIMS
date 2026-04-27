/**
 * Shared toolbar for all spreadsheet modals and pages.
 * Renders Undo, Redo, optional Templates, and Custom format.
 * Use this in EquipmentSpreadsheetModal, SpreadsheetTemplateManagerModal, and SpreadsheetPage
 * so the spreadsheet UI is identical everywhere.
 */

import React, { useRef, useState, useEffect } from 'react';

const btnClass =
  'flex items-center gap-1.5 px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-white hover:border-primary-400 hover:text-primary-700 text-xs text-gray-600 font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-300 disabled:hover:text-gray-600';

export interface SpreadsheetToolbarProps {
  /** Undo handler */
  onUndo: () => void;
  /** Redo handler */
  onRedo: () => void;
  /** Whether undo is disabled */
  canUndo: boolean;
  /** Whether redo is disabled */
  canRedo: boolean;
  /** Show Templates button (e.g. equipment modal) */
  showTemplates?: boolean;
  /** Called when user clicks Templates */
  onOpenTemplates?: () => void;
  /** Ref set by SpreadsheetGrid: apply style (e.g. number_format) to current selection */
  applyStyleRef: React.MutableRefObject<((style: { number_format?: string }) => void) | null>;
  /** Extra buttons or content after the standard buttons */
  children?: React.ReactNode;
}

export const SpreadsheetToolbar: React.FC<SpreadsheetToolbarProps> = ({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  showTemplates = false,
  onOpenTemplates,
  applyStyleRef,
  children,
}) => {
  const [showCustomFormatPopup, setShowCustomFormatPopup] = useState(false);
  const [customFormatValue, setCustomFormatValue] = useState('mmm dd, yyyy');
  const customFormatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showCustomFormatPopup) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (customFormatRef.current && !customFormatRef.current.contains(e.target as Node)) {
        setShowCustomFormatPopup(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCustomFormatPopup]);

  const handleApplyCustomFormat = () => {
    const fmt = customFormatValue.trim();
    if (fmt) {
      applyStyleRef.current?.({ number_format: fmt });
      setShowCustomFormatPopup(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={onUndo} disabled={!canUndo} className={btnClass} title="Undo (Ctrl+Z)">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
        Undo
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} className={btnClass} title="Redo (Ctrl+Y)">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
        </svg>
        Redo
      </button>

      {showTemplates && onOpenTemplates && (
        <button
          type="button"
          onClick={onOpenTemplates}
          className={btnClass}
          title="Apply a spreadsheet template"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="2" y="3" width="20" height="4" rx="1" />
            <rect x="2" y="9" width="9" height="12" rx="1" />
            <rect x="13" y="9" width="9" height="12" rx="1" />
          </svg>
          Templates
        </button>
      )}

      <div className="relative" ref={customFormatRef}>
        <button
          type="button"
          onClick={() => setShowCustomFormatPopup((v) => !v)}
          className={btnClass}
          title="Custom number/date format (e.g. mmm dd, yyyy)"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Custom format
        </button>
        {showCustomFormatPopup && (
          <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white p-3 shadow-lg min-w-[220px]">
            <label className="text-xs font-medium text-gray-600 block mb-1">Format string</label>
            <input
              type="text"
              value={customFormatValue}
              onChange={(e) => setCustomFormatValue(e.target.value)}
              placeholder="e.g. mmm dd, yyyy"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 mb-2"
              autoFocus
            />
            <p className="text-[10px] text-gray-500 mb-2">
              Examples: mmm dd yyyy, d/m/yy, 0.00, #,##0.00
            </p>
            <div className="flex justify-end gap-1">
              <button
                type="button"
                onClick={() => setShowCustomFormatPopup(false)}
                className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded border border-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyCustomFormat}
                className="px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 rounded border border-primary-200"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      {children}
    </div>
  );
};
