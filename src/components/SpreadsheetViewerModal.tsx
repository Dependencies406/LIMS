/**
 * Spreadsheet Viewer Modal
 * Simple read-only modal for viewing spreadsheet data
 * No editing capabilities - just displays the data
 * Detects and handles both web app (cell-based) and desktop app (column-based) formats
 */

import React from 'react';
import type { Equipment, EquipmentSpreadsheetData } from '../types';
import type { SpreadsheetModel } from '../modules/spreadsheet/models/SpreadsheetModel';
import { SpreadsheetViewer } from './SpreadsheetViewer';
import { DesktopSpreadsheetViewer, type DesktopSpreadsheetData } from './DesktopSpreadsheetViewer';

export interface SpreadsheetViewerModalProps {
  isOpen: boolean;
  equipment: Equipment;
  equipmentIndex: number;
  onClose: () => void;
}

export const SpreadsheetViewerModal: React.FC<SpreadsheetViewerModalProps> = ({
  isOpen,
  equipment,
  equipmentIndex,
  onClose,
}) => {
  if (!isOpen) return null;

  // Detect which format the data is in and prepare accordingly
  const { dataFormat, webAppData, desktopAppData } = React.useMemo(() => {
    if (!equipment.spreadsheetData?.spreadsheetModel) {
      return { dataFormat: null, webAppData: null, desktopAppData: null };
    }

    const model = equipment.spreadsheetData.spreadsheetModel as any;
    
    // Check if this is desktop app format (has 'columns' and 'data' fields)
    if (model.columns && typeof model.columns === 'object') {
      return {
        dataFormat: 'desktop',
        webAppData: null,
        desktopAppData: model as DesktopSpreadsheetData,
      };
    }
    
    // Otherwise, assume it's web app format (has 'cells' field)
    if (model.cells) {
      const processedModel: SpreadsheetModel = {
        ...model,
        cells: model.cells instanceof Map 
          ? model.cells 
          : (model.cells && typeof model.cells === 'object' 
              ? model.cells 
              : {}),
        formulas: model.formulas instanceof Map 
          ? model.formulas 
          : (model.formulas && typeof model.formulas === 'object' 
              ? model.formulas 
              : {}),
        variables: model.variables instanceof Map 
          ? model.variables 
          : (model.variables && typeof model.variables === 'object' 
              ? model.variables 
              : {}),
      };
      return {
        dataFormat: 'webapp',
        webAppData: processedModel,
        desktopAppData: null,
      };
    }
    
    return { dataFormat: null, webAppData: null, desktopAppData: null };
  }, [equipment.spreadsheetData]);

  if (!dataFormat) {
    return (
      <div className="modal" onClick={onClose}>
        <div className="modal-content max-w-4xl" onClick={(e) => e.stopPropagation()}>
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">
                {equipment.name || `Equipment ${equipmentIndex + 1}`} - Spreadsheet Data
              </h2>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="text-center py-8 text-gray-500">
              <p>No spreadsheet data available for this equipment</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content max-w-[1920px] max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 p-6 bg-white">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {equipment.name || `Equipment ${equipmentIndex + 1}`} - Spreadsheet Data
              </h2>
              <p className="text-gray-600 mt-1 text-sm flex items-center">
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View-only mode - Data from {dataFormat === 'desktop' ? 'Desktop App' : 'Web App'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
              title="Close"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-50 p-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            {dataFormat === 'desktop' && desktopAppData ? (
              <DesktopSpreadsheetViewer spreadsheetData={desktopAppData} />
            ) : dataFormat === 'webapp' && webAppData ? (
              <SpreadsheetViewer spreadsheetModel={webAppData} />
            ) : (
              <div className="p-8 text-center text-gray-500">
                <p>Unable to display spreadsheet data</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};























