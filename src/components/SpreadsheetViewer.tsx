/**
 * Spreadsheet Viewer Component
 * Simple read-only viewer for spreadsheet data
 * Displays data in a table format without requiring the spreadsheet engine
 */

import React, { useMemo } from 'react';
import type { SpreadsheetModel, Cell } from '../modules/spreadsheet/models/SpreadsheetModel';

export interface SpreadsheetViewerProps {
  spreadsheetModel: SpreadsheetModel;
}

export const SpreadsheetViewer: React.FC<SpreadsheetViewerProps> = ({ spreadsheetModel }) => {
  // Convert cells Map to array and find the dimensions
  // Handles data from both web app and Python desktop app
  const { cells, maxRow, maxCol } = useMemo(() => {
    const cellArray: Cell[] = [];
    let maxRow = 0;
    let maxCol = 0;

    // Handle different data formats from web app and Python desktop app
    let cellsData = spreadsheetModel.cells;

    // If cells is a Map, convert to array
    if (cellsData instanceof Map) {
      cellsData.forEach((cell) => {
        if (cell && typeof cell === 'object' && 'row' in cell && 'column' in cell) {
          cellArray.push(cell);
          maxRow = Math.max(maxRow, cell.row || 0);
          maxCol = Math.max(maxCol, cell.column || 0);
        }
      });
    } 
    // Handle serialized format from Firestore (plain object with string keys)
    else if (typeof cellsData === 'object' && cellsData !== null) {
      // Handle both Object.entries format and direct object values
      const entries = Object.entries(cellsData);
      
      entries.forEach(([key, cell]: [string, any]) => {
        // Handle cell data - could be direct cell object or nested
        const cellObj = cell && typeof cell === 'object' ? cell : null;
        
        if (cellObj && 'row' in cellObj && 'column' in cellObj) {
          // Ensure row and column are numbers
          const row = typeof cellObj.row === 'number' ? cellObj.row : parseInt(cellObj.row, 10);
          const col = typeof cellObj.column === 'number' ? cellObj.column : parseInt(cellObj.column, 10);
          
          if (!isNaN(row) && !isNaN(col)) {
            cellArray.push({
              ...cellObj,
              row,
              column: col,
            });
            maxRow = Math.max(maxRow, row);
            maxCol = Math.max(maxCol, col);
          }
        }
      });
    }

    return { cells: cellArray, maxRow, maxCol };
  }, [spreadsheetModel]);

  // Create a 2D grid for easy rendering
  const grid = useMemo(() => {
    const rows: (Cell | null)[][] = [];
    
    // Initialize grid with nulls
    for (let row = 0; row <= maxRow; row++) {
      rows[row] = [];
      for (let col = 0; col <= maxCol; col++) {
        rows[row][col] = null;
      }
    }

    // Populate grid with cells
    cells.forEach((cell) => {
      if (cell.row >= 0 && cell.column >= 0) {
        rows[cell.row][cell.column] = cell;
      }
    });

    return rows;
  }, [cells, maxRow, maxCol]);

  // Get column header - use actual column name from columnDefinitions if available
  const getColumnHeader = (colIndex: number): string => {
    // Strategy 1: Use columnOrder to get column name, then look up in columnDefinitions
    if (spreadsheetModel.columnOrder && Array.isArray(spreadsheetModel.columnOrder) && spreadsheetModel.columnOrder.length > colIndex) {
      const columnName = spreadsheetModel.columnOrder[colIndex];
      if (columnName) {
        // Try to get the header from columnDefinitions using the column name
        if (spreadsheetModel.columnDefinitions) {
          let colDef: any = null;
          if (spreadsheetModel.columnDefinitions instanceof Map) {
            colDef = spreadsheetModel.columnDefinitions.get(columnName);
          } else if (typeof spreadsheetModel.columnDefinitions === 'object') {
            colDef = (spreadsheetModel.columnDefinitions as any)[columnName];
          }
          
          if (colDef && typeof colDef === 'object') {
            // Try header, label, or name property (in order of preference)
            const header = (colDef as any).header || (colDef as any).label || (colDef as any).name || '';
            if (header) {
              return header;
            }
          }
        }
        // If no column definition found, use the column name itself
        return columnName;
      }
    }
    
    // Strategy 2: Try to access columnDefinitions by index (if it's an array-like structure)
    if (spreadsheetModel.columnDefinitions) {
      let colDefs: any = null;
      if (spreadsheetModel.columnDefinitions instanceof Map) {
        // Map doesn't have index-based access, so we need columnOrder
        // This path is already handled above, but keep for safety
        const entries = Array.from(spreadsheetModel.columnDefinitions.entries());
        if (entries.length > colIndex) {
          const [, colDef] = entries[colIndex];
          if (colDef && typeof colDef === 'object') {
            const header = (colDef as any).header || (colDef as any).label || (colDef as any).name || '';
            if (header) {
              return header;
            }
          }
        }
      } else if (Array.isArray(spreadsheetModel.columnDefinitions as any)) {
        // If it's an array, access by index
        const colDefsArray = spreadsheetModel.columnDefinitions as any[];
        if (colDefsArray.length > colIndex) {
          const colDef = colDefsArray[colIndex] as any;
          if (colDef && typeof colDef === 'object') {
            const header = (colDef as any).header || (colDef as any).label || (colDef as any).name || '';
            if (header) {
              return header;
            }
          }
        }
      } else if (typeof spreadsheetModel.columnDefinitions === 'object') {
        // If it's an object, try to get values as array
        const entries = Object.entries(spreadsheetModel.columnDefinitions);
        if (entries.length > colIndex) {
          const [, colDef] = entries[colIndex];
          if (colDef && typeof colDef === 'object') {
            const header = (colDef as any).header || (colDef as any).label || (colDef as any).name || '';
            if (header) {
              return header;
            }
          }
        }
      }
    }
    
    // Strategy 3: Check if row 0 contains headers (common pattern in spreadsheets)
    if (grid.length > 0 && grid[0] && grid[0][colIndex]) {
      const headerCell = grid[0][colIndex];
      const headerValue = getCellDisplayValue(headerCell);
      if (headerValue && headerValue.trim() !== '') {
        return headerValue;
      }
    }
    
    // Final fallback: Generate Excel-style column headers (A, B, C, ...)
    let result = '';
    let num = colIndex;
    do {
      result = String.fromCharCode(65 + (num % 26)) + result;
      num = Math.floor(num / 26) - 1;
    } while (num >= 0);
    return result;
  };

  // Get cell display value
  const getCellDisplayValue = (cell: Cell | null): string => {
    if (!cell) return '';
    
    // If cell has a formula, show the displayValue (calculated result)
    if (cell.formula) {
      return cell.displayValue || '';
    }
    
    // For non-formula cells, show the displayValue or rawValue
    if (cell.displayValue) {
      return cell.displayValue;
    }
    
    if (cell.rawValue !== null && cell.rawValue !== undefined) {
      return String(cell.rawValue);
    }
    
    return '';
  };

  // Get cell styling
  const getCellStyle = (cell: Cell | null): React.CSSProperties => {
    const style: React.CSSProperties = {
      padding: '8px',
      border: '1px solid #e5e7eb',
      backgroundColor: '#ffffff',
      textAlign: 'left',
      fontSize: '14px',
      minWidth: '100px',
    };

    if (!cell) return style;

    // Apply formatting if available
    if (cell.format) {
      if (cell.format.backgroundColor) {
        style.backgroundColor = cell.format.backgroundColor;
      }
      if (cell.format.textColor) {
        style.color = cell.format.textColor;
      }
      if (cell.format.fontSize) {
        style.fontSize = `${cell.format.fontSize}pt`;
      }
      if (cell.format.fontWeight) {
        style.fontWeight = cell.format.fontWeight;
      }
      if (cell.format.alignment) {
        style.textAlign = cell.format.alignment;
      }
    }

    // Highlight formula cells
    if (cell.formula) {
      style.backgroundColor = style.backgroundColor === '#ffffff' 
        ? '#f0f9ff' 
        : style.backgroundColor;
      style.fontStyle = 'italic';
    }

    return style;
  };

  if (cells.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>No spreadsheet data available</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-auto">
      <div className="inline-block min-w-full">
        <table className="border-collapse bg-white">
          <thead>
            <tr>
              {/* Row number column */}
              <th className="w-16 p-2 bg-gray-100 border border-gray-300 text-center text-xs font-semibold text-gray-600 sticky left-0 z-10">
                #
              </th>
              {/* Column headers */}
              {Array.from({ length: maxCol + 1 }, (_, colIndex) => (
                <th
                  key={colIndex}
                  className="min-w-[100px] p-2 bg-gray-100 border border-gray-300 text-center text-xs font-semibold text-gray-600"
                >
                  {getColumnHeader(colIndex)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {/* Row number */}
                <td className="w-16 p-2 bg-gray-50 border border-gray-300 text-center text-xs font-semibold text-gray-600 sticky left-0 z-10">
                  {rowIndex + 1}
                </td>
                {/* Row cells */}
                {row.map((cell, colIndex) => (
                  <td
                    key={`${rowIndex}-${colIndex}`}
                    style={getCellStyle(cell)}
                    className="border border-gray-300"
                    title={cell?.formula ? `Formula: =${cell.formula}` : ''}
                  >
                    {getCellDisplayValue(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};























