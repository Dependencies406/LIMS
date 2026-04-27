/**
 * Element Properties Panel
 * Panel for editing selected element properties
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { PdfElement, TextElement, LineElement, RectangleElement, ImageElement, ChartElement, EquipmentTableElement, EquipmentTableColumnDef, DocumentsTableElement, DocumentsTableColumnDef, TrebTableElement, PdfPage } from '../types';
import { EQUIPMENT_TABLE_DEFAULT_COLUMNS, DOCUMENTS_TABLE_DEFAULT_COLUMNS } from '../types';
import { DataSourceBrowser } from './DataSourceBrowser';
import { getDataSourceDiscovery } from '../../../services/dataSourceDiscoveryService';
import { getAvailableTemplates } from '../../../services/spreadsheetTemplateService';
import type { SpreadsheetTemplate } from '../../spreadsheet-templates/types';
import { useAuth } from '../../../contexts/AuthContext';

// Stable wrapper to keep input focus during rapid re-renders.
// Defining this at module scope avoids React remounting children due to changing component identity.
const PropertySection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h4 className="text-sm font-semibold text-gray-900 mb-2">{title}</h4>
    {children}
  </div>
);

export interface ElementPropertiesPanelProps {
  element: PdfElement | null;
  template?: any;
  page?: PdfPage | null;
  onUpdate: (updates: Partial<PdfElement>) => void;
  onTemplateUpdate?: (updates: any) => void;
  onPageUpdate?: (updates: Partial<PdfPage>) => void;
  onDelete?: () => void;
}

export const ElementPropertiesPanel: React.FC<ElementPropertiesPanelProps> = ({
  element,
  template,
  page,
  onUpdate,
  onTemplateUpdate,
  onPageUpdate,
  onDelete,
}) => {
  const { currentUser } = useAuth();
  const [showDataSourceBrowser, setShowDataSourceBrowser] = useState(false);
  const [dataSourceField, setDataSourceField] = useState<'text' | 'image' | null>(null);

  // Spreadsheet templates for treb-table elements (same source as Spreadsheet Template Builder / Equipment spreadsheet picker)
  const [spreadsheetTemplates, setSpreadsheetTemplates] = useState<SpreadsheetTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  useEffect(() => {
    setTemplatesLoading(true);
    getAvailableTemplates(currentUser?.uid ?? '')
      .then(setSpreadsheetTemplates)
      .catch(() => setSpreadsheetTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [currentUser?.uid]);

  // Get data source type for format controls
  const dataSourceType = useMemo(() => {
    if (element?.type === 'text') {
      const textEl = element as TextElement;
      if (textEl.dataSource?.key) {
        const discovery = getDataSourceDiscovery();
        const ds = discovery.getDataSource(textEl.dataSource.key);
        return ds?.type || 'text';
      }
    }
    return null;
  }, [element]);

  // Show Page Settings when no element is selected
  if (!element) {
    const pageSizeValue = page?.pageSize || template?.pageSize || 'A4';
    const orientationValue = page?.orientation ?? template?.orientation ?? 'portrait';
    return (
      <div className="p-6" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Page Settings</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Page Size</label>
            <select
              value={pageSizeValue}
              onChange={(e) => {
                if (onPageUpdate) {
                  onPageUpdate({ pageSize: e.target.value as PdfPage['pageSize'] });
                } else {
                  onTemplateUpdate?.({ pageSize: e.target.value });
                }
              }}
              className="w-full px-3 py-2 text-sm border rounded-md"
              style={{ borderColor: '#D1D5DB' }}
            >
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
              <option value="A3">A3</option>
              <option value="A5">A5</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Orientation</label>
            <select
              value={orientationValue}
              onChange={(e) => {
                const orientation = e.target.value as 'portrait' | 'landscape';
                if (onPageUpdate) {
                  onPageUpdate({ orientation });
                } else {
                  onTemplateUpdate?.({ orientation });
                }
              }}
              className="w-full px-3 py-2 text-sm border rounded-md"
              style={{ borderColor: '#D1D5DB' }}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Page Number Pattern</label>
            <select
              value={template?.pagePattern || 'number'}
              onChange={(e) => onTemplateUpdate?.({ pagePattern: e.target.value as 'number' | 'page-number' | 'page-of-total' })}
              className="w-full px-3 py-2 text-sm border rounded-md"
              style={{ borderColor: '#D1D5DB' }}
            >
              <option value="number">X (Just a Number)</option>
              <option value="page-number">Page X (Page with number)</option>
              <option value="page-of-total">Page X of Y (Y is the total page)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {template?.pagePattern === 'number' && 'Example: 1, 2, 3'}
              {template?.pagePattern === 'page-number' && 'Example: Page 1, Page 2, Page 3'}
              {template?.pagePattern === 'page-of-total' && 'Example: Page 1 of 3, Page 2 of 3'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Margins</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-gray-500 mb-1">Top</label>
                <input
                  type="number"
                  defaultValue="20"
                  className="w-full px-2 py-1 border rounded"
                  disabled
                  style={{ borderColor: '#D1D5DB' }}
                />
              </div>
              <div>
                <label className="block text-gray-500 mb-1">Bottom</label>
                <input
                  type="number"
                  defaultValue="20"
                  className="w-full px-2 py-1 border rounded"
                  disabled
                  style={{ borderColor: '#D1D5DB' }}
                />
              </div>
              <div>
                <label className="block text-gray-500 mb-1">Left</label>
                <input
                  type="number"
                  defaultValue="20"
                  className="w-full px-2 py-1 border rounded"
                  disabled
                  style={{ borderColor: '#D1D5DB' }}
                />
              </div>
              <div>
                <label className="block text-gray-500 mb-1">Right</label>
                <input
                  type="number"
                  defaultValue="20"
                  className="w-full px-2 py-1 border rounded"
                  disabled
                  style={{ borderColor: '#D1D5DB' }}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">Margins are not applied in PDF output yet.</p>
          </div>

          {template?.elements && (
            <div className="pt-4 border-t" style={{ borderTopColor: '#E5E7EB' }}>
              <div className="text-xs text-gray-500">
                <div className="mb-1">Total Elements: <span className="font-semibold text-gray-700">{template.elements.length}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const handleUpdate = (updates: Partial<PdfElement>) => {
    onUpdate(updates);
  };

  const openDataSourceBrowser = (field: 'text' | 'image') => {
    setDataSourceField(field);
    setShowDataSourceBrowser(true);
  };

  const handleDataSourceSelect = (key: string) => {
    if (element.type === 'text' || element.type === 'image') {
      // Get the actual data source type from discovery service
      const discovery = getDataSourceDiscovery();
      const ds = discovery.getDataSource(key);
      const dataSourceType = ds?.type || (element.type === 'text' ? 'text' : 'image');
      
      handleUpdate({
        dataSource: {
          type: dataSourceType,
          key,
        },
      });
    }
    setShowDataSourceBrowser(false);
    setDataSourceField(null);
  };

  const renderDeleteButton = () => (
    onDelete ? (
      <button
        type="button"
        onClick={onDelete}
        className="px-2 py-1 text-xs border border-red-200 rounded text-red-700 bg-red-50 hover:bg-red-100"
        title="Delete selected element"
      >
        Delete Element
      </button>
    ) : null
  );

  const renderPaginationControls = (el: PdfElement) => (
    <div className="pt-3 border-t border-gray-200 space-y-3">
      <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Overflow Pagination</h4>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Pagination Mode</label>
        <select
          value={el.paginationMode ?? (el.overflowRole ?? 'static')}
          onChange={(e) => handleUpdate({ paginationMode: e.target.value as 'static' | 'dynamic' })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="static">Static (repeat unchanged)</option>
          <option value="dynamic">Dynamic (split on overflow)</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={el.repeatOnOverflowPages ?? true}
          onChange={(e) => handleUpdate({ repeatOnOverflowPages: e.target.checked })}
          className="w-4 h-4"
        />
        <label className="text-sm text-gray-700">Repeat full element on overflow pages</label>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Overflow Priority</label>
        <input
          type="number"
          value={el.overflowPriority ?? 0}
          onChange={(e) => handleUpdate({ overflowPriority: parseInt(e.target.value, 10) || 0 })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>
    </div>
  );

  // Render based on element type
  if (element.type === 'text') {
    const textEl = element as TextElement;
    return (
      <>
        <div className="p-6 space-y-4" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm text-gray-900">Text Element Properties</h3>
            {renderDeleteButton()}
          </div>

          <PropertySection title="Position & Size">
            {/* Position */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">X Position</label>
                <input
                  type="number"
                  value={textEl.x ?? 0}
                  onChange={(e) => handleUpdate({ x: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Y Position</label>
                <input
                  type="number"
                  value={textEl.y ?? 0}
                  onChange={(e) => handleUpdate({ y: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            {/* Size (for text box dimensions) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Width (px)</label>
                <input
                  type="number"
                  min="20"
                  value={textEl.width || 150}
                  onChange={(e) => handleUpdate({ width: parseFloat(e.target.value) || 150 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Auto"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Height (px)</label>
                <input
                  type="number"
                  min="20"
                  value={textEl.height || 30}
                  onChange={(e) => handleUpdate({ height: parseFloat(e.target.value) || 30 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Auto"
                />
              </div>
            </div>
          </PropertySection>

          <PropertySection title="Content">
            {/* Text Content - Static or Data Source */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Content Type</label>
              <div className="mb-2">
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="radio"
                    name={`text-source-${textEl.id}`}
                    checked={!textEl.dataSource && textEl.staticText !== undefined}
                    onChange={() => handleUpdate({ dataSource: undefined, staticText: textEl.staticText || '' })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Static Text</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`text-source-${textEl.id}`}
                    checked={!!textEl.dataSource}
                    onChange={() => handleUpdate({
                      dataSource: textEl.dataSource || { type: 'text', key: '' },
                      staticText: undefined
                    })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Data Source</span>
                </label>
              </div>

              {!textEl.dataSource ? (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Static Text</label>
                  <textarea
                    value={textEl.staticText || ''}
                    onChange={(e) => handleUpdate({ staticText: e.target.value })}
                    placeholder="Enter static text here..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Data Source</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={textEl.dataSource?.key || ''}
                      onChange={(e) => handleUpdate({
                        dataSource: {
                          type: 'text',
                          key: e.target.value,
                        },
                      })}
                      placeholder="e.g., job.customer, equipment.name"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                    <button
                      onClick={() => openDataSourceBrowser('text')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                    >
                      📖 Browse
                    </button>
                  </div>

                  {/* Date Format - Show when data source is date type */}
                  {dataSourceType === 'date' && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Date Format</label>
                      <select
                        value={textEl.dateFormat || 'DD/MM/YYYY'}
                        onChange={(e) => handleUpdate({ dateFormat: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="DD/MM/YYYY">DD/MM/YYYY (e.g., 25/12/2024)</option>
                        <option value="MM/DD/YYYY">MM/DD/YYYY (e.g., 12/25/2024)</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD (e.g., 2024-12-25)</option>
                        <option value="DD-MM-YYYY">DD-MM-YYYY (e.g., 25-12-2024)</option>
                        <option value="MMMM D, YYYY">Long date (e.g., February 24, 2026)</option>
                        <option value="Month DD, YYYY">Month DD, YYYY (e.g., December 25, 2024)</option>
                        <option value="DD Month YYYY">DD Month YYYY (e.g., 25 December 2024)</option>
                        <option value="DD/MM/YY">DD/MM/YY (e.g., 25/12/24)</option>
                        <option value="MM/DD/YY">MM/DD/YY (e.g., 12/25/24)</option>
                        <option value="DD MMM YYYY">DD MMM YYYY (e.g., 25 Dec 2024)</option>
                        <option value="MMM DD, YYYY">MMM DD, YYYY (e.g., Dec 25, 2024)</option>
                        <option value="DD MMMM YYYY">DD MMMM YYYY (e.g., 25 December 2024)</option>
                        <option value="MMMM DD, YYYY">MMMM DD, YYYY (e.g., December 25, 2024)</option>
                        <option value="">Default (ISO format)</option>
                      </select>
                    </div>
                  )}

                  {/* Number Format - Show when data source is number type */}
                  {dataSourceType === 'number' && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Number Format</label>
                      <select
                        value={textEl.numberFormat || ''}
                        onChange={(e) => handleUpdate({ numberFormat: e.target.value || undefined })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="">Default (no formatting)</option>
                        <option value="0">Integer (e.g., 1234)</option>
                        <option value="0.0">One decimal (e.g., 1234.5)</option>
                        <option value="0.00">Two decimals (e.g., 1234.50)</option>
                        <option value="0.000">Three decimals (e.g., 1234.500)</option>
                        <option value="0,0">Integer with thousands separator (e.g., 1,234)</option>
                        <option value="0,0.0">One decimal with thousands separator (e.g., 1,234.5)</option>
                        <option value="0,0.00">Two decimals with thousands separator (e.g., 1,234.50)</option>
                        <option value="0,0.000">Three decimals with thousands separator (e.g., 1,234.500)</option>
                        <option value="0.0%">Percentage one decimal (e.g., 12.5%)</option>
                        <option value="0.00%">Percentage two decimals (e.g., 12.50%)</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          </PropertySection>

          <PropertySection title="Formatting">
            {/* Font */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Font</label>
              <select
                value={textEl.font || 'Helvetica'}
                onChange={(e) => handleUpdate({ font: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="Helvetica">Helvetica</option>
                <option value="Times">Times</option>
                <option value="Courier">Courier</option>
              </select>
            </div>

            {/* Font Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Font Size</label>
              <input
                type="number"
                min="6"
                max="72"
                value={textEl.fontSize || 12}
                onChange={(e) => handleUpdate({ fontSize: parseInt(e.target.value) || 12 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            {/* Alignment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alignment</label>
              <select
                value={textEl.align || 'left'}
                onChange={(e) => handleUpdate({ align: e.target.value as 'left' | 'center' | 'right' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>

            {/* Style */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={textEl.bold || false}
                  onChange={(e) => handleUpdate({ bold: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm">Bold</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={textEl.italic || false}
                  onChange={(e) => handleUpdate({ italic: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm">Italic</span>
              </label>
            </div>

            {/* Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
              <input
                type="color"
                value={textEl.color || '#000000'}
                onChange={(e) => {
                  const colorValue = e.target.value;
                  if (colorValue) {
                    handleUpdate({ color: colorValue });
                  }
                }}
                className="w-full h-10 border border-gray-300 rounded-md"
              />
            </div>
          </PropertySection>

          {/* Overflow & Pagination (final block) */}
          {renderPaginationControls(textEl)}
        </div>

        {showDataSourceBrowser && dataSourceField === 'text' && (
          <DataSourceBrowser
            isOpen={showDataSourceBrowser}
            onClose={() => setShowDataSourceBrowser(false)}
            onSelect={handleDataSourceSelect}
            filterType="text"
          />
        )}
      </>
    );
  }

  if (element.type === 'line') {
    const lineEl = element as LineElement;
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Line Element Properties</h3>
          {renderDeleteButton()}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">X1</label>
            <input
              type="number"
              value={lineEl.x1 ?? 0}
              onChange={(e) => handleUpdate({ x1: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Y1</label>
            <input
              type="number"
              value={lineEl.y1 ?? 0}
              onChange={(e) => handleUpdate({ y1: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">X2</label>
            <input
              type="number"
              value={lineEl.x2 ?? 0}
              onChange={(e) => handleUpdate({ x2: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Y2</label>
            <input
              type="number"
              value={lineEl.y2 ?? 0}
              onChange={(e) => handleUpdate({ y2: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
          <input
            type="color"
            value={lineEl.color || '#000000'}
            onChange={(e) => {
              const colorValue = e.target.value;
              if (colorValue) {
                handleUpdate({ color: colorValue });
              }
            }}
            className="w-full h-10 border border-gray-300 rounded-md"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Width</label>
          <input
            type="number"
            min="1"
            max="10"
            value={lineEl.width || 1}
            onChange={(e) => handleUpdate({ width: parseInt(e.target.value) || 1 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>
    );
  }

  if (element.type === 'rectangle') {
    const rectEl = element as RectangleElement;
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Rectangle Element Properties</h3>
          {renderDeleteButton()}
        </div>

        <PropertySection title="Position & Size">
          {/* X/Y */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">X</label>
              <input
                type="number"
                value={rectEl.x ?? 0}
                onChange={(e) => handleUpdate({ x: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Y</label>
              <input
                type="number"
                value={rectEl.y ?? 0}
                onChange={(e) => handleUpdate({ y: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          {/* Width/Height */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Width</label>
              <input
                type="number"
                value={rectEl.width || 200}
                onChange={(e) => handleUpdate({ width: parseFloat(e.target.value) || 200 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Height</label>
              <input
                type="number"
                value={rectEl.height || 100}
                onChange={(e) => handleUpdate({ height: parseFloat(e.target.value) || 100 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </PropertySection>

        <PropertySection title="Appearance">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fill Color</label>
            <input
              type="color"
              value={rectEl.fillColor || '#ffffff'}
              onChange={(e) => {
                const colorValue = e.target.value;
                if (colorValue) {
                  handleUpdate({ fillColor: colorValue });
                }
              }}
              className="w-full h-10 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stroke Color</label>
            <input
              type="color"
              value={rectEl.strokeColor || '#000000'}
              onChange={(e) => {
                const colorValue = e.target.value;
                if (colorValue) {
                  handleUpdate({ strokeColor: colorValue });
                }
              }}
              className="w-full h-10 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stroke Width</label>
            <input
              type="number"
              min="0"
              max="10"
              value={rectEl.strokeWidth || 1}
              onChange={(e) => handleUpdate({ strokeWidth: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </PropertySection>
        {renderPaginationControls(rectEl)}
      </div>
    );
  }

  if (element.type === 'image') {
    const imgEl = element as ImageElement;
    return (
      <>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">Image Element Properties</h3>
            {renderDeleteButton()}
          </div>

          <PropertySection title="Position & Size">
            {/* X/Y */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">X</label>
                <input
                  type="number"
                  value={imgEl.x ?? 0}
                  onChange={(e) => handleUpdate({ x: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Y</label>
                <input
                  type="number"
                  value={imgEl.y ?? 0}
                  onChange={(e) => handleUpdate({ y: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            {/* Width/Height */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Width</label>
                <input
                  type="number"
                  value={imgEl.width || 200}
                  onChange={(e) => handleUpdate({ width: parseFloat(e.target.value) || 200 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Height</label>
                <input
                  type="number"
                  value={imgEl.height || 150}
                  onChange={(e) => handleUpdate({ height: parseFloat(e.target.value) || 150 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          </PropertySection>

          <PropertySection title="Content / Source">
            {/* Image Source - URL/Path or Data Source */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Image Source Type</label>
              <div className="mb-2">
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="radio"
                    name={`image-source-${imgEl.id}`}
                    checked={!imgEl.dataSource && (imgEl.imageUrl !== undefined || imgEl.imagePath !== undefined)}
                    onChange={() => handleUpdate({
                      dataSource: undefined,
                      imageUrl: imgEl.imageUrl || '',
                      imagePath: imgEl.imagePath || ''
                    })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Direct URL/Path</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`image-source-${imgEl.id}`}
                    checked={!!imgEl.dataSource}
                    onChange={() => handleUpdate({
                      dataSource: imgEl.dataSource || { type: 'image', key: '' },
                      imageUrl: undefined,
                      imagePath: undefined
                    })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Data Source</span>
                </label>
              </div>

              {!imgEl.dataSource ? (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Image URL or Path</label>
                  <input
                    type="text"
                    value={imgEl.imageUrl || imgEl.imagePath || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.startsWith('http://') || value.startsWith('https://')) {
                        handleUpdate({ imageUrl: value, imagePath: undefined });
                      } else {
                        handleUpdate({ imagePath: value, imageUrl: undefined });
                      }
                    }}
                    placeholder="Enter image URL or file path..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Data Source</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={imgEl.dataSource?.key || ''}
                      onChange={(e) => handleUpdate({
                        dataSource: {
                          type: 'image',
                          key: e.target.value,
                        },
                      })}
                      placeholder="e.g., logo, signature"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                    <button
                      onClick={() => openDataSourceBrowser('image')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                    >
                      📖 Browse
                    </button>
                  </div>
                </div>
              )}
            </div>
          </PropertySection>
          {renderPaginationControls(imgEl)}
        </div>

        {showDataSourceBrowser && dataSourceField === 'image' && (
          <DataSourceBrowser
            isOpen={showDataSourceBrowser}
            onClose={() => setShowDataSourceBrowser(false)}
            onSelect={handleDataSourceSelect}
            filterType="image"
          />
        )}
      </>
    );
  }

  if (element.type === 'equipment-table') {
    const tableEl = element as EquipmentTableElement;
    const columns = (tableEl.columns && tableEl.columns.length > 0)
      ? [...tableEl.columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : EQUIPMENT_TABLE_DEFAULT_COLUMNS.map((def, idx) => ({
          id: def.id,
          label: def.label,
          visible: true,
          width: def.defaultWidth,
          align: 'left' as const,
          order: idx,
        }));
    const updateColumns = (next: EquipmentTableColumnDef[]) => {
      const withOrder = next.map((c, i) => ({ ...c, order: i }));
      onUpdate({ columns: withOrder });
    };
    const moveColumn = (index: number, dir: 'up' | 'down') => {
      const newCols = [...columns];
      const swap = dir === 'up' ? index - 1 : index + 1;
      if (swap < 0 || swap >= newCols.length) return;
      [newCols[index], newCols[swap]] = [newCols[swap], newCols[index]];
      updateColumns(newCols);
    };
    const setColumn = (index: number, patch: Partial<EquipmentTableColumnDef>) => {
      const newCols = columns.map((c, i) => (i === index ? { ...c, ...patch } : c));
      updateColumns(newCols);
    };
    return (
      <div className="p-6 space-y-4" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-gray-900">Equipment Table Properties</h3>
          {renderDeleteButton()}
        </div>

        {(() => {
          return (
            <>
              {/* Block 1: Position & Size */}
              <PropertySection title="Position & Size">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">X Position</label>
                    <input
                      type="number"
                      value={tableEl.x ?? 0}
                      onChange={(e) => handleUpdate({ x: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Y Position</label>
                    <input
                      type="number"
                      value={tableEl.y ?? 0}
                      onChange={(e) => handleUpdate({ y: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Table Width (pt)</label>
                  <input
                    type="number"
                    min={100}
                    value={tableEl.width ?? 500}
                    onChange={(e) => handleUpdate({ width: parseFloat(e.target.value) || 500 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Table Height (pt)</label>
                  <p className="text-xs text-gray-500 mb-1">Bounds the table body for PDF pagination; extra rows continue on continuation pages.</p>
                  <input
                    type="number"
                    min={40}
                    value={tableEl.height ?? 200}
                    onChange={(e) => handleUpdate({ height: parseFloat(e.target.value) || 200 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </PropertySection>

              {/* Block 2: Columns */}
              <PropertySection title="Columns">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Columns (check to show, use ↑↓ to reorder)</label>
                  <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-md p-2">
                    {columns.map((col, index) => (
                      <div key={col.id} className="flex items-center gap-2 flex-wrap border-b border-gray-100 pb-2 last:border-0">
                        <input
                          type="checkbox"
                          checked={col.visible !== false}
                          onChange={(e) => setColumn(index, { visible: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium text-gray-700 min-w-[100px]">{col.label}</span>
                        <div className="flex flex-col gap-0.5">
                          <button type="button" onClick={() => moveColumn(index, 'up')} disabled={index === 0} className="w-6 h-5 flex items-center justify-center rounded border text-xs disabled:opacity-40">↑</button>
                          <button type="button" onClick={() => moveColumn(index, 'down')} disabled={index === columns.length - 1} className="w-6 h-5 flex items-center justify-center rounded border text-xs disabled:opacity-40">↓</button>
                        </div>
                        <select
                          value={col.align || 'left'}
                          onChange={(e) => setColumn(index, { align: e.target.value as 'left' | 'center' | 'right' })}
                          className="px-2 py-1 text-xs border border-gray-300 rounded"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs">
                          <span>Width:</span>
                          <input
                            type="number"
                            min={20}
                            value={col.width ?? 60}
                            onChange={(e) => setColumn(index, { width: parseFloat(e.target.value) || 60 })}
                            className="w-14 px-1 py-0.5 border border-gray-300 rounded text-xs"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </PropertySection>

              {/* Block 3: Style */}
              <PropertySection title="Style">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Border Color</label>
                    <input type="color" value={tableEl.borderColor ?? '#000000'} onChange={(e) => handleUpdate({ borderColor: e.target.value })} className="w-full h-9 border border-gray-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Border Width</label>
                    <input type="number" min={0} max={5} value={tableEl.borderWidth ?? 1} onChange={(e) => handleUpdate({ borderWidth: parseInt(e.target.value, 10) || 1 })} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cell Font Size</label>
                    <input type="number" min={6} max={14} value={tableEl.fontSize ?? 9} onChange={(e) => handleUpdate({ fontSize: parseInt(e.target.value, 10) || 9 })} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Header Font Size</label>
                    <input type="number" min={6} max={14} value={tableEl.headerFontSize ?? 10} onChange={(e) => handleUpdate({ headerFontSize: parseInt(e.target.value, 10) || 10 })} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={tableEl.headerStyle?.bold !== false}
                    onChange={(e) => handleUpdate({ headerStyle: { ...tableEl.headerStyle, bold: e.target.checked } })}
                    className="w-4 h-4"
                  />
                  <label className="text-sm text-gray-700">Header bold</label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Header Background</label>
                  <input type="color" value={tableEl.headerStyle?.backgroundColor ?? '#f0f0f0'} onChange={(e) => handleUpdate({ headerStyle: { ...tableEl.headerStyle, backgroundColor: e.target.value } })} className="w-full h-9 border border-gray-300 rounded-md" />
                </div>
              </PropertySection>

              {/* Block 4: Overflow & Pagination */}
              {renderPaginationControls(tableEl)}
            </>
          );
        })()}
      </div>
    );
  }

  if (element.type === 'documents-table') {
    const tableEl = element as DocumentsTableElement;
    const columns = (tableEl.columns && tableEl.columns.length > 0)
      ? [...tableEl.columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : DOCUMENTS_TABLE_DEFAULT_COLUMNS.map((def, idx) => ({
          id: def.id,
          label: def.label,
          visible: true,
          width: def.defaultWidth,
          align: 'left' as const,
          order: idx,
        }));
    const updateColumns = (next: DocumentsTableColumnDef[]) => {
      const withOrder = next.map((c, i) => ({ ...c, order: i }));
      onUpdate({ columns: withOrder });
    };
    const moveColumn = (index: number, dir: 'up' | 'down') => {
      const newCols = [...columns];
      const swap = dir === 'up' ? index - 1 : index + 1;
      if (swap < 0 || swap >= newCols.length) return;
      [newCols[index], newCols[swap]] = [newCols[swap], newCols[index]];
      updateColumns(newCols);
    };
    const setColumn = (index: number, patch: Partial<DocumentsTableColumnDef>) => {
      const newCols = columns.map((c, i) => (i === index ? { ...c, ...patch } : c));
      updateColumns(newCols);
    };
    return (
      <div className="p-6 space-y-4" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-gray-900">Documents Index Table</h3>
          {renderDeleteButton()}
        </div>
        <p className="text-xs text-gray-600">
          Renders the full document index (same order as the Documents Index page). Data source: <code className="bg-gray-100 px-1 rounded">documentIndex.list</code>.
        </p>

        {(() => {
          return (
            <>
              {/* Block 1: Position & Size */}
              <PropertySection title="Position & Size">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">X Position</label>
                    <input
                      type="number"
                      value={tableEl.x ?? 0}
                      onChange={(e) => handleUpdate({ x: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Y Position</label>
                    <input
                      type="number"
                      value={tableEl.y ?? 0}
                      onChange={(e) => handleUpdate({ y: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Table Width (pt)</label>
                  <input
                    type="number"
                    min={100}
                    value={tableEl.width ?? 500}
                    onChange={(e) => handleUpdate({ width: parseFloat(e.target.value) || 500 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Table Height (pt)</label>
                  <p className="text-xs text-gray-500 mb-1">Viewport for the table; overflow splits across PDF pages with repeated headers.</p>
                  <input
                    type="number"
                    min={40}
                    value={tableEl.height ?? 200}
                    onChange={(e) => handleUpdate({ height: parseFloat(e.target.value) || 200 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </PropertySection>

              {/* Block 2: Columns */}
              <PropertySection title="Columns">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Columns (check to show, use ↑↓ to reorder)</label>
                  <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-md p-2">
                    {columns.map((col, index) => (
                      <div key={col.id} className="flex items-center gap-2 flex-wrap border-b border-gray-100 pb-2 last:border-0">
                        <input
                          type="checkbox"
                          checked={col.visible !== false}
                          onChange={(e) => setColumn(index, { visible: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium text-gray-700 min-w-[100px]">{col.label}</span>
                        <div className="flex flex-col gap-0.5">
                          <button type="button" onClick={() => moveColumn(index, 'up')} disabled={index === 0} className="w-6 h-5 flex items-center justify-center rounded border text-xs disabled:opacity-40">↑</button>
                          <button type="button" onClick={() => moveColumn(index, 'down')} disabled={index === columns.length - 1} className="w-6 h-5 flex items-center justify-center rounded border text-xs disabled:opacity-40">↓</button>
                        </div>
                        <select
                          value={col.align || 'left'}
                          onChange={(e) => setColumn(index, { align: e.target.value as 'left' | 'center' | 'right' })}
                          className="px-2 py-1 text-xs border border-gray-300 rounded"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs">
                          <span>Width:</span>
                          <input
                            type="number"
                            min={20}
                            value={col.width ?? 60}
                            onChange={(e) => setColumn(index, { width: parseFloat(e.target.value) || 60 })}
                            className="w-14 px-1 py-0.5 border border-gray-300 rounded text-xs"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </PropertySection>

              {/* Block 3: Style */}
              <PropertySection title="Style">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Border Color</label>
                    <input type="color" value={tableEl.borderColor ?? '#000000'} onChange={(e) => handleUpdate({ borderColor: e.target.value })} className="w-full h-9 border border-gray-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Border Width</label>
                    <input type="number" min={0} max={5} value={tableEl.borderWidth ?? 1} onChange={(e) => handleUpdate({ borderWidth: parseInt(e.target.value, 10) || 1 })} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cell Font Size</label>
                    <input type="number" min={6} max={14} value={tableEl.fontSize ?? 9} onChange={(e) => handleUpdate({ fontSize: parseInt(e.target.value, 10) || 9 })} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Header Font Size</label>
                    <input type="number" min={6} max={14} value={tableEl.headerFontSize ?? 10} onChange={(e) => handleUpdate({ headerFontSize: parseInt(e.target.value, 10) || 10 })} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={tableEl.headerStyle?.bold !== false}
                    onChange={(e) => handleUpdate({ headerStyle: { ...tableEl.headerStyle, bold: e.target.checked } })}
                    className="w-4 h-4"
                  />
                  <label className="text-sm text-gray-700">Header bold</label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Header Background</label>
                  <input type="color" value={tableEl.headerStyle?.backgroundColor ?? '#f0f0f0'} onChange={(e) => handleUpdate({ headerStyle: { ...tableEl.headerStyle, backgroundColor: e.target.value } })} className="w-full h-9 border border-gray-300 rounded-md" />
                </div>
              </PropertySection>

              {/* Block 4: Overflow & Pagination */}
              {renderPaginationControls(tableEl)}
            </>
          );
        })()}
      </div>
    );
  }

  if (element.type === 'chart') {
    const chartEl = element as ChartElement;
    return (
      <div className="p-6 space-y-4" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-gray-900">Chart Element Properties</h3>
          {renderDeleteButton()}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chart Type</label>
          <select
            value={chartEl.chartType || 'line'}
            onChange={(e) => handleUpdate({ chartType: e.target.value as ChartElement['chartType'] })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="scatter">Scatter</option>
            <option value="line">Line</option>
            <option value="bar">Bar</option>
            <option value="column">Column</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={chartEl.title || ''}
            onChange={(e) => handleUpdate({ title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Chart title"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">X Axis Label</label>
          <input
            type="text"
            value={chartEl.xAxisLabel || ''}
            onChange={(e) => handleUpdate({ xAxisLabel: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="X axis"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Y Axis Label</label>
          <input
            type="text"
            value={chartEl.yAxisLabel || ''}
            onChange={(e) => handleUpdate({ yAxisLabel: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Y axis"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">X Position</label>
            <input
              type="number"
              value={chartEl.x ?? 0}
              onChange={(e) => handleUpdate({ x: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Y Position</label>
            <input
              type="number"
              value={chartEl.y ?? 0}
              onChange={(e) => handleUpdate({ y: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Width</label>
            <input
              type="number"
              min={50}
              value={chartEl.width ?? 300}
              onChange={(e) => handleUpdate({ width: parseFloat(e.target.value) || 300 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Height</label>
            <input
              type="number"
              min={50}
              value={chartEl.height ?? 200}
              onChange={(e) => handleUpdate({ height: parseFloat(e.target.value) || 200 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data Source Key (optional)</label>
          <input
            type="text"
            value={chartEl.dataSource?.key || ''}
            onChange={(e) => handleUpdate({
              dataSource: e.target.value
                ? { type: 'chart', key: e.target.value, range: chartEl.dataSource?.range }
                : undefined,
            })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="e.g. measurements.data, spreadsheet.range"
          />
        </div>
        {renderPaginationControls(chartEl)}
      </div>
    );
  }

  if (element.type === 'treb-table') {
    const trebEl = element as TrebTableElement;
    const templateId = trebEl.spreadsheetTemplateId || '';
    const selectedTemplate = spreadsheetTemplates.find((t) => t.id === templateId) ?? null;
    const availableTabs = selectedTemplate?.tabs ?? [];
    const sourceTabId = trebEl.sourceTabId || '';
    const tabValid = availableTabs.some((tab) => tab.id === sourceTabId);

    return (
      <div className="p-6 space-y-4" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-gray-900">TREB Table Properties</h3>
          {renderDeleteButton()}
        </div>

        {(() => {
          return (
            <>
              {/* Block 1: Position & Size */}
              <PropertySection title="Position & Size">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">X Position</label>
                    <input
                      type="number"
                      value={trebEl.x ?? 0}
                      onChange={(e) => handleUpdate({ x: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Y Position</label>
                    <input
                      type="number"
                      value={trebEl.y ?? 0}
                      onChange={(e) => handleUpdate({ y: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Width (pt)</label>
                  <input
                    type="number"
                    min={50}
                    value={trebEl.width ?? 300}
                    onChange={(e) => handleUpdate({ width: parseFloat(e.target.value) || 300 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </PropertySection>

              {/* Block 2: Content / Source */}
              <PropertySection title="Content / Source">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Spreadsheet Template</label>
                  <select
                    value={templateId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      const nextTpl = spreadsheetTemplates.find((t) => t.id === nextId) ?? null;
                      const nextTabId = nextTpl?.tabs?.[0]?.id ?? '';
                      handleUpdate({
                        spreadsheetTemplateId: nextId,
                        sourceTabId: nextTabId,
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    disabled={templatesLoading}
                  >
                    <option value="">{templatesLoading ? 'Loading…' : '— Select template —'}</option>
                    {spreadsheetTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tab Selection</label>
                  <select
                    value={tabValid ? sourceTabId : ''}
                    onChange={(e) => handleUpdate({ sourceTabId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    disabled={templatesLoading || !templateId || availableTabs.length === 0}
                  >
                    <option value="">{templatesLoading ? 'Loading…' : '— Select tab —'}</option>
                    {availableTabs.map((tab) => (
                      <option key={tab.id} value={tab.id}>{tab.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Render Range (e.g. A1:F15)</label>
                  <input
                    type="text"
                    value={trebEl.renderRange ?? ''}
                    onChange={(e) => handleUpdate({ renderRange: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Optional"
                  />
                </div>
              </PropertySection>

              {/* Block 3: Style */}
              <PropertySection title="Style">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Font Size</label>
                  <input
                    type="number"
                    min={6}
                    max={24}
                    value={trebEl.fontSize ?? 9}
                    onChange={(e) => handleUpdate({ fontSize: parseInt(e.target.value, 10) || 9 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Border Width</label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={trebEl.borderWidth ?? 1}
                    onChange={(e) => handleUpdate({ borderWidth: parseInt(e.target.value, 10) ?? 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </PropertySection>

              {/* Block 4: Overflow & Pagination */}
              {renderPaginationControls(trebEl)}
            </>
          );
        })()}
      </div>
    );
  }

  return null;
};

