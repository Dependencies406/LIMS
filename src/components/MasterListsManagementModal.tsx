import React, { useEffect, useState } from 'react';
import { CalibrationMethodListSettingsModal } from './CalibrationMethodListSettingsModal';
import { ManufacturerListSettingsModal } from './ManufacturerListSettingsModal';
import { ModelListSettingsModal } from './ModelListSettingsModal';

export type MasterListsTab = 'methods' | 'manufacturers' | 'models';

export interface MasterListsManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: MasterListsTab;
}

export const MasterListsManagementModal: React.FC<MasterListsManagementModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'methods',
}) => {
  const [tab, setTab] = useState<MasterListsTab>(initialTab);

  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal-content max-w-2xl max-h-[min(92vh,900px)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-20 flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Equipment master lists</h2>
              <p className="text-sm text-gray-600 mt-1">
                Calibration methods, manufacturers, and models for equipment fields
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-shrink-0">
              <div
                className="flex flex-wrap rounded-lg bg-gray-100 p-1 gap-1"
                role="tablist"
                aria-label="Equipment master lists"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'methods'}
                  aria-label="Calibration methods"
                  onClick={() => setTab('methods')}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    tab === 'methods'
                      ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span className="hidden sm:inline">Calibration methods</span>
                  <span className="sm:hidden">Methods</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'manufacturers'}
                  aria-label="Manufacturers"
                  onClick={() => setTab('manufacturers')}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    tab === 'manufacturers'
                      ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span className="hidden md:inline">Manufacturers</span>
                  <span className="md:hidden">Mfr.</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'models'}
                  aria-label="Models"
                  onClick={() => setTab('models')}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    tab === 'models'
                      ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Models
                </button>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="self-end sm:self-center text-gray-500 hover:text-gray-700 text-2xl leading-none px-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <CalibrationMethodListSettingsModal
            embedded
            isOpen={tab === 'methods'}
            onClose={() => {}}
          />
          <ManufacturerListSettingsModal
            embedded
            isOpen={tab === 'manufacturers'}
            onClose={() => {}}
          />
          <ModelListSettingsModal embedded isOpen={tab === 'models'} onClose={() => {}} />
        </div>
      </div>
    </div>
  );
};
