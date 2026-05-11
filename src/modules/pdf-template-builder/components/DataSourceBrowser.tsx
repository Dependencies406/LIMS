/**
 * Data Source Browser Component
 * Modal for browsing and selecting data sources
 */

import React, { useState, useMemo } from 'react';
import { getDataSourceDiscovery } from '../../../services/dataSourceDiscoveryService';
import type { DataSourceItem } from '../types';

export interface DataSourceBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (key: string) => void;
  filterType?: 'text' | 'image' | 'number' | 'date';
}

export const DataSourceBrowser: React.FC<DataSourceBrowserProps> = ({
  isOpen,
  onClose,
  filterType,
  onSelect,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Re-read the singleton on every render so HMR-updated data sources are always current.
  // getDataSourceDiscovery() returns the singleton (or builds a fresh one after resetDiscovery()).
  const discovery = getDataSourceDiscovery();
  const categories = useMemo(() => discovery.getCategories(), [discovery]);
  const dataSourcesByCategory = useMemo(() => discovery.getDataSourcesByCategory(), [discovery]);

  // Filter data sources
  const filteredDataSources = useMemo(() => {
    let sources: DataSourceItem[] = [];

    if (selectedCategory) {
      sources = dataSourcesByCategory.get(selectedCategory) || [];
    } else {
      sources = discovery.getAllDataSources();
    }

    // Filter by type if specified
    if (filterType) {
      sources = sources.filter(s => s.type === filterType);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      sources = sources.filter(s =>
        s.key.toLowerCase().includes(query) ||
        s.label.toLowerCase().includes(query) ||
        s.description?.toLowerCase().includes(query)
      );
    }

    return sources;
  }, [selectedCategory, searchQuery, filterType, dataSourcesByCategory, discovery]);

  const handleSelect = (key: string) => {
    onSelect(key);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Browse Data Sources</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Search and filters */}
        <div className="px-6 py-4 border-b border-gray-200 space-y-4">
          <input
            type="text"
            placeholder="Search data sources..."
            value={searchQuery || ''}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md"
          />

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-md text-sm ${
                selectedCategory === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Categories
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-md text-sm ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Data sources list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredDataSources.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p>No data sources found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDataSources.map((source) => (
                <button
                  key={source.key}
                  onClick={() => handleSelect(source.key)}
                  className="w-full text-left p-4 border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{source.label}</div>
                      <div className="text-sm text-gray-600 mt-1">{source.key}</div>
                      {source.description && (
                        <div className="text-sm text-gray-500 mt-1">{source.description}</div>
                      )}
                    </div>
                    <div className="ml-4">
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                        {source.type}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

