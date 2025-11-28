/**
 * Spreadsheet Modal Component
 * Main spreadsheet UI with template application support
 * TODO: Full implementation with Handsontable integration
 */

import React, { useState } from 'react';
import { Modal } from './common/Modal';
import type { TemplateSchema, FlattenedCellData } from '../types/template';
import { generateSpreadsheetData } from '../services/templateApplicationService';

interface SpreadsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  template?: TemplateSchema | null;
  initialData?: FlattenedCellData[];
  onSave?: (data: FlattenedCellData[]) => void;
}

export const SpreadsheetModal: React.FC<SpreadsheetModalProps> = ({
  isOpen,
  onClose,
  template,
  initialData,
  onSave,
}) => {
  const [data, setData] = useState<FlattenedCellData[]>(initialData || []);

  React.useEffect(() => {
    if (template && isOpen) {
      const result = generateSpreadsheetData(template, 10);
      setData(result.data);
    }
  }, [template, isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Spreadsheet"
      maxWidth="6xl"
    >
      <div className="p-6">
        <p className="text-gray-600 mb-4">
          TODO: Implement full spreadsheet with Handsontable integration:
        </p>
        <ul className="list-disc list-inside text-gray-600 mb-4 space-y-1">
          <li>Handsontable grid rendering</li>
          <li>Formula calculation</li>
          <li>Template application</li>
          <li>Real-time sync (if needed)</li>
          <li>Save/load functionality</li>
        </ul>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
          <button
            onClick={() => onSave && onSave(data)}
            className="btn btn-primary"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
};

