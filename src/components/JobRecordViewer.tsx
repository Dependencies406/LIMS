/**
 * Job Record Viewer Component
 * Fetches and displays measurement record data from a JSON file URL
 * Displays data in a table format with columns and rows
 */

import React, { useState, useEffect } from 'react';

export interface JobRecordViewerProps {
  recordUrl: string;
}

interface RecordData {
  columns: string[];
  rows: Array<Record<string, any>>;
}

export const JobRecordViewer: React.FC<JobRecordViewerProps> = ({ recordUrl }) => {
  const [data, setData] = useState<RecordData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Return early if no URL provided
    if (!recordUrl || recordUrl.trim() === '') {
      setLoading(false);
      setData(null);
      return;
    }

    // Reset state when URL changes
    setLoading(true);
    setError(null);
    setData(null);

    // Fetch the JSON data
    const fetchRecordData = async () => {
      try {
        const response = await fetch(recordUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch record: ${response.status} ${response.statusText}`);
        }

        const jsonData: RecordData = await response.json();

        // Validate data structure
        if (!jsonData || !Array.isArray(jsonData.columns) || !Array.isArray(jsonData.rows)) {
          throw new Error('Invalid data format: expected columns and rows arrays');
        }

        setData(jsonData);
      } catch (err) {
        console.error('Error fetching record data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load record');
      } finally {
        setLoading(false);
      }
    };

    fetchRecordData();
  }, [recordUrl]);

  // Return null if no URL or no data
  if (!recordUrl || recordUrl.trim() === '') {
    return null;
  }

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex flex-col items-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p className="text-sm text-gray-600">Loading measurement record...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  // Return null if no data
  if (!data || !data.columns || data.columns.length === 0 || !data.rows || data.rows.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-sm text-gray-600">No measurement record data available</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-auto">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-300">
                {data.columns.map((column, index) => (
                  <th
                    key={index}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200 last:border-r-0"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`hover:bg-gray-50 transition-colors ${
                    rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }`}
                >
                  {data.columns.map((column, colIndex) => (
                    <td
                      key={colIndex}
                      className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200 last:border-r-0 whitespace-nowrap"
                    >
                      {row[column] !== null && row[column] !== undefined
                        ? String(row[column])
                        : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
          {data.rows.length} {data.rows.length === 1 ? 'record' : 'records'} • {data.columns.length} {data.columns.length === 1 ? 'column' : 'columns'}
        </div>
      </div>
    </div>
  );
};























