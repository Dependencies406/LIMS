/**
 * Missing Data Warning Modal
 * Shows missing data/components and asks user to continue or cancel
 */

import React from 'react';
import type { MissingDataReport } from '../services/pdfDataResolver';
import { sections } from '../modules/pdf-template-builder/components/sections';

export interface MissingDataWarningModalProps {
  isOpen: boolean;
  missingData: MissingDataReport[];
  onContinue: () => void;
  onCancel: () => void;
}

export const MissingDataWarningModal: React.FC<MissingDataWarningModalProps> = ({
  isOpen,
  missingData,
  onContinue,
  onCancel,
}) => {
  if (!isOpen) {
    return null;
  }

  // Group missing data by section
  const bySection = new Map<string, MissingDataReport[]>();
  for (const report of missingData) {
    if (!bySection.has(report.section)) {
      bySection.set(report.section, []);
    }
    bySection.get(report.section)!.push(report);
  }

  const getSectionName = (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    return section?.name || sectionId;
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'missing': return 'Missing';
      case 'null': return 'Null';
      case 'empty': return 'Empty';
      case 'invalid': return 'Invalid';
      default: return reason;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-yellow-50">
          <div>
            <h2 className="text-xl font-semibold text-yellow-900">⚠️ Missing Data Detected</h2>
            <p className="text-sm text-yellow-700 mt-1">
              Some components in the template don't have data available
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Missing Data List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-4">
              The following {missingData.length} component(s) will be rendered as <strong>"N/A"</strong>:
            </p>
          </div>

          <div className="space-y-4">
            {Array.from(bySection.entries()).map(([sectionId, reports]) => (
              <div key={sectionId} className="border border-gray-200 rounded-md p-4">
                <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <span>{sections.find(s => s.id === sectionId)?.icon || '📋'}</span>
                  <span>{getSectionName(sectionId)}</span>
                  <span className="text-xs font-normal text-gray-500">
                    ({reports.length} missing)
                  </span>
                </div>
                <div className="space-y-2 ml-6">
                  {reports.map((report) => (
                    <div key={report.elementId} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{report.elementName}</span>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                          {getReasonLabel(report.reason)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 ml-4">
                        Data source: <code className="bg-gray-100 px-1 rounded">{report.dataSource}</code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-900">
              <strong>Note:</strong> If you continue, missing components will be displayed as "N/A" in the generated PDF.
              You can edit the template later to remove or update these components.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onContinue}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Continue with N/A
          </button>
        </div>
      </div>
    </div>
  );
};
