/**
 * Component Config Modal
 * General component configuration modal
 * TODO: Full implementation
 */

import React from 'react';
import { Modal } from './common/Modal';

interface ComponentConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  componentId?: string;
  onSave?: (config: any) => void;
}

export const ComponentConfigModal: React.FC<ComponentConfigModalProps> = ({
  isOpen,
  onClose,
  componentId,
  onSave,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Component Configuration"
      maxWidth="2xl"
    >
      <div className="p-6">
        <p className="text-gray-600 mb-4">TODO: Implement component configuration</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

