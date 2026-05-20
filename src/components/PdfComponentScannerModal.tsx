/**
 * PDF Component Scanner Modal
 * Displays all available PDF components and data sources
 */

import React, { useState, useEffect } from 'react';
import { getPdfComponentScanner, type ScanResult } from '../services/pdfComponentScanner';

export interface PdfComponentScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PdfComponentScannerModal: React.FC<PdfComponentScannerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'components' | 'dataSources'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const scanner = getPdfComponentScanner();

  const handleScan = () => {
    setLoading(true);
    try {
      const result = scanner.scan();
      setScanResult(result);
    } catch (error) {
      console.error('Error scanning components:', error);
      alert('Failed to scan components. Please check the console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportJson = () => {
    if (!scanResult) return;
    const json = scanner.exportAsJson(scanResult);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdf-components-scan-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = (type: 'components' | 'dataSources' | 'both') => {
    if (!scanResult) return;
    const csv = scanner.exportAsCsv(scanResult, type);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdf-components-scan-${type}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-scan on open
  useEffect(() => {
    if (isOpen && !scanResult) {
      handleScan();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredComponents = scanResult
    ? scanResult.components.filter(comp => {
        if (selectedSection && comp.section !== selectedSection) return false;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            comp.name.toLowerCase().includes(query) ||
            comp.type.toLowerCase().includes(query) ||
            comp.sectionName.toLowerCase().includes(query) ||
            comp.description?.toLowerCase().includes(query)
          );
        }
        return true;
      })
    : [];

  const filteredDataSources = scanResult
    ? scanResult.dataSources.filter(ds => {
        if (selectedCategory && ds.category !== selectedCategory) return false;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            ds.key.toLowerCase().includes(query) ||
            ds.label.toLowerCase().includes(query) ||
            ds.category.toLowerCase().includes(query) ||
            ds.description?.toLowerCase().includes(query)
          );
        }
        return true;
      })
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">PDF Component Scanner</h2>
            <p className="text-sm text-gray-500 mt-1">
              Discover all available PDF components and data sources
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-3xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <button
              onClick={handleScan}
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>Scan Components</span>
                </>
              )}
            </button>
            {scanResult && (
              <span className="text-sm text-gray-600">
                Last scanned: {scanResult.timestamp.toLocaleString()}
              </span>
            )}
          </div>
          {scanResult && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportJson}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export JSON
              </button>
              <button
                onClick={() => handleExportCsv('both')}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-gray-200 flex gap-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('components')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'components'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Components ({scanResult?.components.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('dataSources')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'dataSources'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Data Sources ({scanResult?.dataSources.length || 0})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!scanResult ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-gray-500 mb-4">Click "Scan Components" to discover all available PDF components</p>
              <button
                onClick={handleScan}
                disabled={loading}
                className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Scanning...' : 'Start Scan'}
              </button>
            </div>
          ) : activeTab === 'overview' ? (
            <div className="space-y-6">
              {/* Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-3xl font-bold text-blue-600">{scanResult.statistics.totalSections}</div>
                  <div className="text-sm text-gray-600 mt-1">Sections</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-3xl font-bold text-green-600">{scanResult.statistics.totalComponents}</div>
                  <div className="text-sm text-gray-600 mt-1">Components</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-3xl font-bold text-purple-600">{scanResult.statistics.totalDataSources}</div>
                  <div className="text-sm text-gray-600 mt-1">Data Sources</div>
                </div>
              </div>

              {/* Sections */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Sections</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {scanResult.sections.map(section => (
                    <div key={section.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{section.icon}</span>
                        <div className="flex-1">
                          <div className="font-semibold">{section.name}</div>
                          <div className="text-sm text-gray-600">{section.description}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {section.componentCount} components, {section.dataSourceCount} data sources
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Components by Type */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Components by Type</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(scanResult.statistics.componentsByType).map(([type, count]) => (
                    <div key={type} className="border border-gray-200 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-gray-700">{count}</div>
                      <div className="text-sm text-gray-600 mt-1">{type}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Sources by Category */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Data Sources by Category</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(scanResult.statistics.dataSourcesByCategory).map(([category, count]) => (
                    <div key={category} className="border border-gray-200 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-gray-700">{count}</div>
                      <div className="text-sm text-gray-600 mt-1">{category}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : activeTab === 'components' ? (
            <div className="space-y-4">
              {/* Search and Filter */}
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Search components..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md"
                />
                <select
                  value={selectedSection || ''}
                  onChange={(e) => setSelectedSection(e.target.value || null)}
                  className="px-4 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">All Sections</option>
                  {scanResult.sections.map(section => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Components List */}
              <div className="space-y-2">
                {filteredComponents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No components found</div>
                ) : (
                  filteredComponents.map(comp => (
                    <div key={comp.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{comp.icon}</span>
                        <div className="flex-1">
                          <div className="font-semibold">{comp.name}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{comp.type}</span>
                            <span className="ml-2">in {comp.sectionName}</span>
                          </div>
                          {comp.description && (
                            <div className="text-sm text-gray-500 mt-1">{comp.description}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Search and Filter */}
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Search data sources..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md"
                />
                <select
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="px-4 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">All Categories</option>
                  {Object.keys(scanResult.statistics.dataSourcesByCategory).map(category => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              {/* Data Sources List */}
              <div className="space-y-2">
                {filteredDataSources.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No data sources found</div>
                ) : (
                  filteredDataSources.map(ds => (
                    <div key={ds.key} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold">{ds.label}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{ds.key}</span>
                            <span className="ml-2">
                              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">{ds.type}</span>
                              <span className="ml-2 bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs">{ds.category}</span>
                            </span>
                          </div>
                          {ds.description && (
                            <div className="text-sm text-gray-500 mt-1">{ds.description}</div>
                          )}
                          {(ds.sections && ds.sections.length > 0) ? (
                            <div className="text-xs text-gray-400 mt-1">
                              Sections: {ds.sections.join(', ')}
                            </div>
                          ) : ds.section ? (
                            <div className="text-xs text-gray-400 mt-1">Section: {ds.section}</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
