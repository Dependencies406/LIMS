/**
 * File Preview Modal
 * Unified preview component for PDF, Excel, and Word files
 */

import React, { useState, useEffect } from 'react';
import type { EquipmentAttachment } from '../types';

export interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: EquipmentAttachment | null;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  isOpen,
  onClose,
  file,
}) => {
  const [previewContent, setPreviewContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'pdf' | 'excel' | 'word' | 'image' | 'unsupported'>('unsupported');
  const [excelSheets, setExcelSheets] = useState<Array<{ name: string; content: string }>>([]);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState<number>(0);

  useEffect(() => {
    if (!isOpen || !file) {
      setPreviewContent('');
      setError(null);
      setPreviewType('unsupported');
      setExcelSheets([]);
      setSelectedSheetIndex(0);
      return;
    }

    const loadPreview = async () => {
      setLoading(true);
      setError(null);

      try {
        const fileType = (file.fileType ?? file.type ?? '').toLowerCase();
        const fileName = (file.fileName ?? file.name ?? '').toLowerCase();
        const fileUrl = file.downloadURL ?? file.url ?? '';

        // Determine file type
        if (fileType.includes('pdf') || fileName.endsWith('.pdf')) {
          setPreviewType('pdf');
          setLoading(false);
        } else if (
          fileType.includes('spreadsheet') ||
          fileType.includes('excel') ||
          fileName.endsWith('.xlsx') ||
          fileName.endsWith('.xls') ||
          fileName.endsWith('.csv')
        ) {
          setPreviewType('excel');
          await loadExcelPreview(fileUrl);
        } else if (
          fileType.includes('word') ||
          fileType.includes('document') ||
          fileName.endsWith('.docx') ||
          fileName.endsWith('.doc')
        ) {
          setPreviewType('word');
          await loadWordPreview(fileUrl);
        } else if (
          fileType.includes('image') ||
          fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)
        ) {
          setPreviewType('image');
          setLoading(false);
        } else {
          setPreviewType('unsupported');
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading preview:', err);
        setError(err instanceof Error ? err.message : 'Failed to load file preview');
        setLoading(false);
      }
    };

    loadPreview();
  }, [isOpen, file]);

  const loadExcelPreview = async (url: string) => {
    try {
      // Fetch the file
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();

      // Dynamic import of exceljs
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      // Generate HTML preview for each sheet separately
      const sheets: Array<{ name: string; content: string }> = [];
      
      workbook.eachSheet((worksheet) => {
        let html = '<div class="excel-preview p-4">';
        html += `<div class="overflow-x-auto">`;
        html += `<table class="min-w-full border-collapse border border-gray-300">`;

        // Get all rows
        const rows: any[][] = [];
        worksheet.eachRow((row) => {
          const rowData: any[] = [];
          row.eachCell((cell, colNumber) => {
            let value = '';
            if (cell.value !== null && cell.value !== undefined) {
              if (typeof cell.value === 'object' && 'text' in cell.value) {
                value = cell.value.text;
              } else if (typeof cell.value === 'object' && 'richText' in cell.value) {
                value = cell.value.richText.map((rt: any) => rt.text).join('');
              } else {
                value = String(cell.value);
              }
            }
            rowData[colNumber - 1] = value;
          });
          rows.push(rowData);
        });

        // Render table
        rows.forEach((row, rowIndex) => {
          html += '<tr>';
          row.forEach((cell) => {
            const cellClass = rowIndex === 0 
              ? 'bg-gray-100 font-semibold p-2 border border-gray-300 text-left'
              : 'p-2 border border-gray-300 text-left';
            html += `<td class="${cellClass}">${escapeHtml(cell || '')}</td>`;
          });
          html += '</tr>';
        });

        html += '</table>';
        html += '</div>';
        html += '</div>';
        
        sheets.push({
          name: worksheet.name,
          content: html
        });
      });

      setExcelSheets(sheets);
      if (sheets.length > 0) {
        setPreviewContent(sheets[0].content);
        setSelectedSheetIndex(0);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error loading Excel:', err);
      throw new Error('Failed to load Excel file. The file may be corrupted or in an unsupported format.');
    }
  };

  const loadWordPreview = async (url: string) => {
    try {
      // Fetch the file
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();

      // Dynamic import of mammoth for .docx files
      const mammoth = await import('mammoth');
      
      // Convert .docx to HTML
      const result = await mammoth.convertToHtml({ arrayBuffer });
      
      setPreviewContent(result.value);
      setLoading(false);
    } catch (err) {
      console.error('Error loading Word document:', err);
      // Fallback: show message that Word preview requires .docx format
      if (url.toLowerCase().endsWith('.doc')) {
        throw new Error('Word .doc files are not supported. Please convert to .docx format.');
      }
      throw new Error('Failed to load Word document. The file may be corrupted or in an unsupported format.');
    }
  };

  const escapeHtml = (text: string): string => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  if (!isOpen || !file) return null;

  return (
    <div className="modal">
      <div className="modal-content max-w-6xl w-full h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 flex-shrink-0 border-b border-gray-200 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 truncate">{file.fileName ?? file.name}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {file.fileType ?? file.type} • {formatFileSize(file.fileSize ?? file.size ?? 0)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-auto bg-gray-50 p-6">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-gray-600">Loading preview...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-600 font-medium mb-2">Preview Error</p>
                <p className="text-gray-600 text-sm mb-4">{error}</p>
                <a
                  href={file.downloadURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                >
                  Download file instead →
                </a>
              </div>
            </div>
          )}

          {!loading && !error && previewType === 'pdf' && (
            <iframe
              src={file.downloadURL}
              className="w-full h-full min-h-[600px] border-0 rounded-lg"
              title={file.fileName}
            />
          )}

          {!loading && !error && previewType === 'image' && (
            <div className="flex items-center justify-center h-full">
              <img
                src={file.downloadURL}
                alt={file.fileName}
                className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
              />
            </div>
          )}

          {!loading && !error && previewType === 'excel' && (
            <div className="bg-white rounded-lg shadow-sm">
              {/* Sheet Tabs */}
              {excelSheets.length > 1 && (
                <div className="border-b border-gray-200 bg-gray-50">
                  <div className="flex overflow-x-auto">
                    {excelSheets.map((sheet, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setSelectedSheetIndex(index);
                          setPreviewContent(sheet.content);
                        }}
                        className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                          selectedSheetIndex === index
                            ? 'border-primary-600 text-primary-600 bg-white'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        {sheet.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Sheet Content */}
              <div className="p-6">
                {excelSheets.length > 1 && (
                  <div className="mb-4 text-sm text-gray-600">
                    Sheet {selectedSheetIndex + 1} of {excelSheets.length}: <span className="font-semibold text-gray-900">{excelSheets[selectedSheetIndex]?.name}</span>
                  </div>
                )}
                <div dangerouslySetInnerHTML={{ __html: previewContent }} />
              </div>
            </div>
          )}

          {!loading && !error && previewType === 'word' && (
            <div className="bg-white rounded-lg shadow-sm p-6 max-w-4xl mx-auto">
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: previewContent }} 
              />
            </div>
          )}

          {!loading && !error && previewType === 'unsupported' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-600 font-medium mb-2">Preview Not Available</p>
                <p className="text-gray-500 text-sm mb-4">
                  This file type cannot be previewed in the browser.
                </p>
                <a
                  href={file.downloadURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download File
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 flex-shrink-0 border-t border-gray-200 flex items-center justify-between bg-white">
          <div className="text-sm text-gray-500">
            Uploaded {formatDate(file.uploadedAt)}
          </div>
          <a
            href={file.downloadURL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </a>
        </div>
      </div>
    </div>
  );
};

// Helper functions
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const formatDate = (date: Date | string | any): string => {
  if (date && typeof date === 'object' && 'toDate' in date) {
    const d = date.toDate();
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  if (d instanceof Date && !isNaN(d.getTime())) {
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return 'Unknown date';
};

