/**
 * PDF Component Field Modal
 * Component configuration modal for fields injection
 * TODO: Full implementation with component field management
 */

import React from 'react';
import { Modal } from './common/Modal';

interface PdfComponentFieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  componentId?: string;
  onSave?: (fields: any) => void;
}

export const PdfComponentFieldModal: React.FC<PdfComponentFieldModalProps> = ({
  isOpen,
  onClose,
  componentId,
  onSave,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Component Field Configuration"
      maxWidth="2xl"
    >
      <div className="p-6">
        <p className="text-gray-600 mb-4">
          TODO: Implement component field configuration with:
        </p>
        <ul className="list-disc list-inside text-gray-600 mb-4 space-y-1">
          <li>Field injection UI</li>
          <li>Component field mapping</li>
          <li>Validation rules</li>
        </ul>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

