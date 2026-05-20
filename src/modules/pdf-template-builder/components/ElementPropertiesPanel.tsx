/**
 * Element Properties Panel
 * Panel for editing selected element properties
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { PdfElement, TextElement, LineElement, RectangleElement, ImageElement, CheckboxElement, ChartElement, EquipmentTableElement, EquipmentTableColumnDef, DocumentsTableElement, DocumentsTableColumnDef, TrebTableElement, PdfPage } from '../types';
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

// ── Checkbox data-source combobox ─────────────────────────────────────────────
/**
 * Searchable dropdown that scans the data-source registry for boolean fields
 * and lets the user pick one (or type a custom key) for a checkbox element.
 */
const CheckboxDataSourcePicker: React.FC<{
  value: string;
  onChange: (key: string) => void;
}> = ({ value, onChange }) => {
  const [query, setQuery]         = useState(value);
  const [open, setOpen]           = useState(false);
  const containerRef              = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);

  // Keep the text field in sync when the parent value changes
  useEffect(() => { setQuery(value); }, [value]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // Gather boolean data sources from the registry (run once per render of the panel)
  const allBooleanSources = useMemo(() => {
    const discovery = getDataSourceDiscovery();
    return discovery
      .getAllDataSources()
      .filter((ds) => ds.type === 'boolean')
      .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allBooleanSources;
    return allBooleanSources.filter(
      (ds) =>
        ds.key.toLowerCase().includes(q) ||
        ds.label.toLowerCase().includes(q) ||
        ds.description?.toLowerCase().includes(q),
    );
  }, [query, allBooleanSources]);

  // Group filtered results by category
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const ds of filtered) {
      if (!map.has(ds.category)) map.set(ds.category, []);
      map.get(ds.category)!.push(ds);
    }
    return map;
  }, [filtered]);

  const handleSelect = useCallback((key: string) => {
    onChange(key);
    setQuery(key);
    setOpen(false);
  }, [onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    // Propagate free-text immediately so partially-typed keys are not lost
    onChange(e.target.value);
  };

  const handleClear = () => {
    setQuery('');
    onChange('');
    inputRef.current?.focus();
  };

  const countLabel =
    allBooleanSources.length === 0
      ? 'No boolean fields registered'
      : `${allBooleanSources.length} field${allBooleanSources.length !== 1 ? 's' : ''} available`;

  return (
    <div ref={containerRef} className="relative">
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-gray-700">
          Data Source&nbsp;
          <span className="text-gray-400 font-normal">(truthy = checked)</span>
        </label>
        <span className="text-xs text-gray-400">{countLabel}</span>
      </div>

      {/* Input + scan button */}
      <div className="flex gap-1">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={() => setOpen(true)}
            placeholder="Select or type a field key…"
            className="w-full pl-2 pr-7 py-1.5 border border-gray-300 rounded-md text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 leading-none"
              title="Clear"
            >×</button>
          )}
        </div>

        {/* Scan / open dropdown button */}
        <button
          type="button"
          onClick={() => { setOpen((o) => !o); inputRef.current?.focus(); }}
          className="flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 text-gray-600 whitespace-nowrap flex-shrink-0"
          title="Scan available boolean fields"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Scan
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 overflow-y-auto"
          style={{ maxHeight: '260px' }}
        >
          {grouped.size === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-400 text-center">No matching fields</div>
          ) : (
            Array.from(grouped.entries()).map(([category, sources]) => (
              <div key={category}>
                {/* Category header */}
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100 sticky top-0">
                  {category}
                </div>
                {sources.map((ds) => (
                  <button
                    key={ds.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                    onClick={() => handleSelect(ds.key)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-gray-50 last:border-0 ${
                      value === ds.key ? 'bg-blue-50 text-blue-800' : 'text-gray-800'
                    }`}
                  >
                    <div className="font-medium truncate">{ds.label}</div>
                    <div className="font-mono text-gray-400 truncate mt-0.5">{ds.key}</div>
                    {ds.description && (
                      <div className="text-gray-400 mt-0.5 line-clamp-1">{ds.description}</div>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      <p className="mt-1 text-xs text-gray-400">
        Leave blank to use the static checked state above.
      </p>
    </div>
  );
};

// ── Lock icons ────────────────────────────────────────────────────────────────
const LockClosedIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M11 6V5a3 3 0 0 0-6 0v1H3.5A1.5 1.5 0 0 0 2 7.5v5A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12.5 6H11zm-5 0V5a2 2 0 1 1 4 0v1H6zm2 4.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
  </svg>
);
const LockOpenIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M11 1a3 3 0 0 0-3 3v2H3.5A1.5 1.5 0 0 0 2 7.5v5A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12.5 6H10V4a1 1 0 0 1 2 0v1h1V4a2 2 0 0 0-2-3zm-3 9.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
  </svg>
);

// ── Linked Width + Height inputs with aspect-ratio lock ───────────────────────
interface LockedDimensionsProps {
  width: number;
  height: number;
  locked: boolean;
  onUpdate: (updates: { width?: number; height?: number; lockAspectRatio?: boolean }) => void;
  widthLabel?: string;
  heightLabel?: string;
  widthNote?: string;
  heightNote?: string;
  minWidth?: number;
  minHeight?: number;
}

const LockedDimensions: React.FC<LockedDimensionsProps> = ({
  width,
  height,
  locked,
  onUpdate,
  widthLabel = 'Width (pt)',
  heightLabel = 'Height (pt)',
  widthNote,
  heightNote,
  minWidth = 10,
  minHeight = 10,
}) => {
  const handleWidthChange = (raw: string) => {
    const newW = Math.max(minWidth, parseFloat(raw) || minWidth);
    if (locked && width > 0 && height > 0) {
      onUpdate({ width: newW, height: Math.round((newW / width) * height) });
    } else {
      onUpdate({ width: newW });
    }
  };

  const handleHeightChange = (raw: string) => {
    const newH = Math.max(minHeight, parseFloat(raw) || minHeight);
    if (locked && width > 0 && height > 0) {
      onUpdate({ height: newH, width: Math.round((newH / height) * width) });
    } else {
      onUpdate({ height: newH });
    }
  };

  const LINE_COLOR = locked ? '#c73636' : '#E5E7EB';

  return (
    <div className="flex items-stretch gap-3">
      {/* Inputs */}
      <div className="flex-1 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{widthLabel}</label>
          {widthNote && <p className="text-xs text-gray-500 mb-1">{widthNote}</p>}
          <input
            type="number"
            min={minWidth}
            value={width}
            onChange={(e) => handleWidthChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{heightLabel}</label>
          {heightNote && <p className="text-xs text-gray-500 mb-1">{heightNote}</p>}
          <input
            type="number"
            min={minHeight}
            value={height}
            onChange={(e) => handleHeightChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>

      {/* Lock column */}
      <div className="flex flex-col items-center" style={{ paddingTop: '1.6rem' }}>
        {/* Top connector */}
        <div style={{ width: 1, flex: 1, backgroundColor: LINE_COLOR, minHeight: 6 }} />
        {/* Lock button */}
        <button
          type="button"
          onClick={() => onUpdate({ lockAspectRatio: !locked })}
          title={locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          className="flex items-center justify-center w-7 h-7 rounded border transition-colors flex-shrink-0"
          style={{
            backgroundColor: locked ? '#c73636' : '#FFFFFF',
            borderColor: locked ? '#c73636' : '#D1D5DB',
            color: locked ? '#FFFFFF' : '#6B7280',
          }}
        >
          {locked ? <LockClosedIcon /> : <LockOpenIcon />}
        </button>
        {/* Bottom connector */}
        <div style={{ width: 1, flex: 1, backgroundColor: LINE_COLOR, minHeight: 6 }} />
      </div>
    </div>
  );
};

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
              <label className="block text-sm font-medium text-gray-700 mb-2">Alignment</label>

              {/* Horizontal alignment */}
              <div className="mb-2">
                <p className="text-xs text-gray-500 mb-1">Horizontal</p>
                <div className="flex gap-1">
                  {([
                    { value: 'left',   title: 'Align Left',   icon: (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                        <rect x="1" y="2" width="14" height="1.5" rx="0.5"/>
                        <rect x="1" y="5.5" width="9" height="1.5" rx="0.5"/>
                        <rect x="1" y="9" width="14" height="1.5" rx="0.5"/>
                        <rect x="1" y="12.5" width="9" height="1.5" rx="0.5"/>
                      </svg>
                    )},
                    { value: 'center', title: 'Align Center', icon: (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                        <rect x="1" y="2" width="14" height="1.5" rx="0.5"/>
                        <rect x="3.5" y="5.5" width="9" height="1.5" rx="0.5"/>
                        <rect x="1" y="9" width="14" height="1.5" rx="0.5"/>
                        <rect x="3.5" y="12.5" width="9" height="1.5" rx="0.5"/>
                      </svg>
                    )},
                    { value: 'right',  title: 'Align Right',  icon: (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                        <rect x="1" y="2" width="14" height="1.5" rx="0.5"/>
                        <rect x="6" y="5.5" width="9" height="1.5" rx="0.5"/>
                        <rect x="1" y="9" width="14" height="1.5" rx="0.5"/>
                        <rect x="6" y="12.5" width="9" height="1.5" rx="0.5"/>
                      </svg>
                    )},
                  ] as const).map(({ value, title, icon }) => {
                    const active = (textEl.align || 'left') === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        title={title}
                        onClick={() => handleUpdate({ align: value })}
                        className="flex items-center justify-center w-9 h-9 rounded border transition-colors"
                        style={{
                          backgroundColor: active ? '#c73636' : '#FFFFFF',
                          borderColor: active ? '#c73636' : '#D1D5DB',
                          color: active ? '#FFFFFF' : '#374151',
                        }}
                      >
                        {icon}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vertical alignment */}
              <div>
                <p className="text-xs text-gray-500 mb-1">Vertical</p>
                <div className="flex gap-1">
                  {([
                    { value: 'top',    title: 'Align Top',    icon: (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                        <rect x="1" y="1" width="14" height="1.5" rx="0.5"/>
                        <rect x="4.5" y="3.5" width="7" height="9" rx="1" fillOpacity="0.25"/>
                        <rect x="4.5" y="3.5" width="7" height="1.5" rx="0.5"/>
                      </svg>
                    )},
                    { value: 'middle', title: 'Align Middle',  icon: (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                        <rect x="1" y="7.25" width="14" height="1.5" rx="0.5"/>
                        <rect x="4.5" y="3" width="7" height="10" rx="1" fillOpacity="0.25"/>
                        <rect x="4.5" y="7.25" width="7" height="1.5" rx="0.5"/>
                      </svg>
                    )},
                    { value: 'bottom', title: 'Align Bottom',  icon: (
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                        <rect x="1" y="13.5" width="14" height="1.5" rx="0.5"/>
                        <rect x="4.5" y="3.5" width="7" height="9" rx="1" fillOpacity="0.25"/>
                        <rect x="4.5" y="11" width="7" height="1.5" rx="0.5"/>
                      </svg>
                    )},
                  ] as const).map(({ value, title, icon }) => {
                    const active = (textEl.verticalAlign || 'top') === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        title={title}
                        onClick={() => handleUpdate({ verticalAlign: value })}
                        className="flex items-center justify-center w-9 h-9 rounded border transition-colors"
                        style={{
                          backgroundColor: active ? '#c73636' : '#FFFFFF',
                          borderColor: active ? '#c73636' : '#D1D5DB',
                          color: active ? '#FFFFFF' : '#374151',
                        }}
                      >
                        {icon}
                      </button>
                    );
                  })}
                </div>
              </div>
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

          {/* Width/Height with lock */}
          <LockedDimensions
            width={rectEl.width || 200}
            height={rectEl.height || 100}
            locked={!!rectEl.lockAspectRatio}
            onUpdate={handleUpdate}
            widthLabel="Width"
            heightLabel="Height"
            minWidth={10}
            minHeight={10}
          />
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

            {/* Width/Height with lock */}
            <LockedDimensions
              width={imgEl.width || 200}
              height={imgEl.height || 150}
              locked={!!imgEl.lockAspectRatio}
              onUpdate={handleUpdate}
              widthLabel="Width"
              heightLabel="Height"
              minWidth={10}
              minHeight={10}
            />
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
                <LockedDimensions
                  width={tableEl.width ?? 500}
                  height={tableEl.height ?? 200}
                  locked={!!tableEl.lockAspectRatio}
                  onUpdate={handleUpdate}
                  widthLabel="Table Width (pt)"
                  heightLabel="Table Height (pt)"
                  heightNote="Bounds the table body for PDF pagination; extra rows continue on continuation pages."
                  minWidth={100}
                  minHeight={40}
                />
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
                <LockedDimensions
                  width={tableEl.width ?? 500}
                  height={tableEl.height ?? 200}
                  locked={!!tableEl.lockAspectRatio}
                  onUpdate={handleUpdate}
                  widthLabel="Table Width (pt)"
                  heightLabel="Table Height (pt)"
                  heightNote="Viewport for the table; overflow splits across PDF pages with repeated headers."
                  minWidth={100}
                  minHeight={40}
                />
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

        <LockedDimensions
          width={chartEl.width ?? 300}
          height={chartEl.height ?? 200}
          locked={!!chartEl.lockAspectRatio}
          onUpdate={handleUpdate}
          widthLabel="Width"
          heightLabel="Height"
          minWidth={50}
          minHeight={50}
        />

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

  // ── Checkbox element ─────────────────────────────────────────────────────────
  if (element.type === 'checkbox') {
    const cbEl = element as CheckboxElement;
    return (
      <div className="p-6 space-y-4" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "Roboto", sans-serif' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-gray-900">Checkbox Properties</h3>
          {renderDeleteButton()}
        </div>

        {/* Position & Size */}
        <PropertySection title="Position & Size">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">X (pt)</label>
              <input
                type="number"
                value={Math.round(cbEl.x ?? 0)}
                onChange={(e) => handleUpdate({ x: parseFloat(e.target.value) || 0 })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Y (pt)</label>
              <input
                type="number"
                value={Math.round(cbEl.y ?? 0)}
                onChange={(e) => handleUpdate({ y: parseFloat(e.target.value) || 0 })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Width (pt)</label>
              <input
                type="number"
                min={10}
                value={Math.round(cbEl.width ?? (cbEl.size ?? 10) + (cbEl.label ? 100 : 0))}
                onChange={(e) => handleUpdate({ width: parseFloat(e.target.value) || 10 })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Height (pt)</label>
              <input
                type="number"
                min={10}
                value={Math.round(cbEl.height ?? (cbEl.size ?? 10))}
                onChange={(e) => handleUpdate({ height: parseFloat(e.target.value) || 10 })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
        </PropertySection>

        {/* Checkbox appearance */}
        <PropertySection title="Checkbox">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Box Size (pt)</label>
                <input
                  type="number"
                  min={4}
                  max={40}
                  value={cbEl.size ?? 10}
                  onChange={(e) => handleUpdate({ size: parseFloat(e.target.value) || 10 })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Check Style</label>
                <select
                  value={cbEl.checkStyle ?? 'checkmark'}
                  onChange={(e) => handleUpdate({ checkStyle: e.target.value as CheckboxElement['checkStyle'] })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                >
                  <option value="checkmark">Checkmark ✓</option>
                  <option value="x">Cross ✗</option>
                  <option value="filled">Filled ■</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cb-checked"
                checked={cbEl.checked ?? false}
                onChange={(e) => handleUpdate({ checked: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="cb-checked" className="text-sm text-gray-700">Checked (static default)</label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Border Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={cbEl.strokeColor ?? '#000000'}
                    onChange={(e) => handleUpdate({ strokeColor: e.target.value })}
                    className="w-8 h-8 rounded border border-gray-300 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={cbEl.strokeColor ?? '#000000'}
                    onChange={(e) => handleUpdate({ strokeColor: e.target.value })}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm font-mono"
                    placeholder="#000000"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Check Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={cbEl.checkColor ?? '#000000'}
                    onChange={(e) => handleUpdate({ checkColor: e.target.value })}
                    className="w-8 h-8 rounded border border-gray-300 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={cbEl.checkColor ?? '#000000'}
                    onChange={(e) => handleUpdate({ checkColor: e.target.value })}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm font-mono"
                    placeholder="#000000"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Border Width (pt)</label>
              <input
                type="number"
                min={0.25}
                max={5}
                step={0.25}
                value={cbEl.strokeWidth ?? 0.75}
                onChange={(e) => handleUpdate({ strokeWidth: parseFloat(e.target.value) || 0.75 })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
        </PropertySection>

        {/* Label */}
        <PropertySection title="Label">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Label Text</label>
              <input
                type="text"
                value={cbEl.label ?? ''}
                onChange={(e) => handleUpdate({ label: e.target.value || undefined })}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                placeholder="Optional label beside checkbox"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Label Position</label>
                <select
                  value={cbEl.labelPosition ?? 'right'}
                  onChange={(e) => handleUpdate({ labelPosition: e.target.value as 'left' | 'right' })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                >
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Font Size (pt)</label>
                <input
                  type="number"
                  min={6}
                  max={32}
                  value={cbEl.labelFontSize ?? 9}
                  onChange={(e) => handleUpdate({ labelFontSize: parseInt(e.target.value, 10) || 9 })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cb-label-bold"
                checked={cbEl.labelBold ?? false}
                onChange={(e) => handleUpdate({ labelBold: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="cb-label-bold" className="text-sm text-gray-700">Bold label</label>
            </div>
          </div>
        </PropertySection>

        {/* Data source (dynamic checked state) */}
        <PropertySection title="Data Source">
          <CheckboxDataSourcePicker
            value={cbEl.dataSource?.key ?? ''}
            onChange={(key) =>
              handleUpdate({ dataSource: key.trim() ? { type: 'boolean', key: key.trim() } : undefined })
            }
          />
        </PropertySection>

        {renderPaginationControls(cbEl)}
      </div>
    );
  }

  return null;
};

