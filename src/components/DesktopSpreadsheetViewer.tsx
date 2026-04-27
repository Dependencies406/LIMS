/**
 * Desktop Spreadsheet Viewer Component
 * Displays spreadsheet data from the Python desktop app
 * Handles column-based format with templates
 */

import React, { useMemo } from 'react';

export interface ColumnDefinition {
  name: string;
  type: 'input' | 'formula' | 'result';
  formula?: string;
  width?: number;
  [key: string]: any;
}

export interface DesktopSpreadsheetData {
  templateName?: string;
  equipmentName?: string;
  columns: Record<string, ColumnDefinition>;
  columnOrder?: string[]; // Order of columns to display
  data: Record<string, Record<string, any>>;
  templateId?: string;
}

export interface DesktopSpreadsheetViewerProps {
  spreadsheetData: DesktopSpreadsheetData;
}

export const DesktopSpreadsheetViewer: React.FC<DesktopSpreadsheetViewerProps> = ({ spreadsheetData }) => {
  // Debug: Log the received data structure
  React.useEffect(() => {
    console.log('DesktopSpreadsheetViewer - Received data:', {
      templateName: spreadsheetData.templateName,
      equipmentName: spreadsheetData.equipmentName,
      columnKeys: Object.keys(spreadsheetData.columns || {}),
      columnOrder: spreadsheetData.columnOrder,
      dataKeys: Object.keys(spreadsheetData.data || {}),
      firstColumn: spreadsheetData.columns ? Object.values(spreadsheetData.columns)[0] : null,
    });
  }, [spreadsheetData]);

  // Parse the data structure
  const { columns, rows, columnOrder } = useMemo(() => {
    const columns = spreadsheetData.columns || {};
    const data = spreadsheetData.data || {};
    
    // CRITICAL: Use columnOrder array if available (from desktop app)
    // This ensures columns display in the correct order
    let columnOrder: string[];
    if (spreadsheetData.columnOrder && Array.isArray(spreadsheetData.columnOrder) && spreadsheetData.columnOrder.length > 0) {
      // Use the provided column order
      columnOrder = spreadsheetData.columnOrder.filter(colName => colName in columns);
      
      // Add any missing columns that aren't in the order array
      const missingCols = Object.keys(columns).filter(colName => !columnOrder.includes(colName));
      if (missingCols.length > 0) {
        columnOrder = [...columnOrder, ...missingCols];
      }
    } else {
      // Fallback: use sorted keys (for legacy templates)
      columnOrder = Object.keys(columns).sort();
    }
    
    // Get rows (convert string keys to numbers and sort)
    const rowKeys = Object.keys(data).map(k => parseInt(k, 10)).filter(k => !isNaN(k)).sort((a, b) => a - b);
    
    const rows = rowKeys.map(rowIndex => {
      const rowData = data[String(rowIndex)] || {};
      return { rowIndex, data: rowData };
    });
    
    return { columns, rows, columnOrder };
  }, [spreadsheetData]);

  // Format cell value for display
  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    
    if (typeof value === 'number') {
      // Format numbers with appropriate precision
      if (Number.isInteger(value)) {
        return String(value);
      }
      // For decimals, show up to 6 significant digits
      return value.toFixed(6).replace(/\.?0+$/, '');
    }
    
    return String(value);
  };

  // Get column type styling
  const getColumnHeaderClass = (colType: string): string => {
    switch (colType) {
      case 'formula':
      case 'result':
        return 'bg-blue-100 text-blue-900 font-semibold';
      case 'input':
        return 'bg-green-100 text-green-900 font-semibold';
      default:
        return 'bg-gray-100 text-gray-900 font-semibold';
    }
  };

  // Get cell styling based on column type
  const getCellClass = (colType: string): string => {
    switch (colType) {
      case 'formula':
      case 'result':
        return 'bg-blue-50';
      case 'input':
        return 'bg-white';
      default:
        return 'bg-white';
    }
  };

  if (!columns || Object.keys(columns).length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="font-medium">No spreadsheet data available</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header Info */}
      {(spreadsheetData.templateName || spreadsheetData.equipmentName) && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          {spreadsheetData.templateName && (
            <div className="text-sm">
              <span className="font-semibold text-gray-700">Template:</span>
              <span className="ml-2 text-gray-900">{spreadsheetData.templateName}</span>
            </div>
          )}
          {spreadsheetData.equipmentName && (
            <div className="text-sm mt-1">
              <span className="font-semibold text-gray-700">Equipment:</span>
              <span className="ml-2 text-gray-900">{spreadsheetData.equipmentName}</span>
            </div>
          )}
        </div>
      )}

      {/* Spreadsheet Table */}
      <div className="overflow-x-auto border border-gray-300 rounded-lg shadow-sm">
        <table className="min-w-full border-collapse bg-white">
          <thead>
            <tr>
              {/* Row number header */}
              <th className="sticky left-0 z-20 w-16 p-3 bg-gray-200 border-b-2 border-r-2 border-gray-400 text-center text-xs font-bold text-gray-700">
                #
              </th>
              {/* Column headers */}
              {columnOrder.map((colKey) => {
                const col = columns[colKey];
                
                // Safety check: ensure column definition exists
                if (!col || typeof col !== 'object') {
                  console.warn(`Missing column definition for: ${colKey}`);
                  return (
                    <th key={colKey} className="min-w-[120px] p-3 border-b-2 border-gray-400 border-r border-gray-300 text-left text-xs bg-red-100">
                      <span className="font-bold text-red-700">{colKey} (ERROR)</span>
                    </th>
                  );
                }
                
                // Get column name - try multiple possible fields
                const columnName = col.name || colKey;
                const columnType = col.type || 'input';
                
                return (
                  <th
                    key={colKey}
                    className={`min-w-[120px] p-3 border-b-2 border-gray-400 border-r border-gray-300 text-left text-xs ${getColumnHeaderClass(columnType)}`}
                    title={col.formula ? `Formula: ${col.formula}` : `Type: ${columnType}`}
                  >
                    <div className="flex flex-col">
                      <span className="font-bold">{columnName}</span>
                      {columnType !== 'input' && (
                        <span className="text-[10px] mt-1 opacity-75">
                          {columnType === 'formula' ? '📊 Formula' : '🎯 Result'}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columnOrder.length + 1}
                  className="p-8 text-center text-gray-500"
                >
                  <p>No data rows available</p>
                  <p className="text-sm mt-2">Record data in the desktop app to see it here</p>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.rowIndex} className="hover:bg-gray-50 transition-colors">
                  {/* Row number */}
                  <td className="sticky left-0 z-10 w-16 p-3 bg-gray-100 border-r-2 border-gray-300 text-center text-xs font-semibold text-gray-600">
                    {row.rowIndex + 1}
                  </td>
                  {/* Data cells */}
                  {columnOrder.map((colKey) => {
                    const col = columns[colKey] || {};
                    const columnType = col.type || 'input';
                    const cellValue = row.data[colKey];
                    return (
                      <td
                        key={`${row.rowIndex}-${colKey}`}
                        className={`p-3 border-r border-b border-gray-300 text-sm ${getCellClass(columnType)}`}
                        title={col.formula ? `Formula: ${col.formula}` : ''}
                      >
                        <span className={columnType !== 'input' ? 'font-medium text-blue-900' : 'text-gray-900'}>
                          {formatCellValue(cellValue)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="mt-3 text-xs text-gray-500 flex items-center justify-between">
        <div>
          <span className="font-medium">{rows.length}</span> rows × <span className="font-medium">{columnOrder.length}</span> columns
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-100 border border-green-300 mr-1.5"></div>
            <span>Input</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-100 border border-blue-300 mr-1.5"></div>
            <span>Calculated</span>
          </div>
        </div>
      </div>
    </div>
  );
};























