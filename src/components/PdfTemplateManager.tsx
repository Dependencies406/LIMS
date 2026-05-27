/**
 * PDF Template Manager Component
 * Layout editor + preview integration + header/footer reset functionality
 * TODO: Full implementation with header/footer/divider management
 */

import React, { useState } from 'react';
import { Modal } from './common/Modal';
import type { PdfSettings } from '../types/template';

interface PdfTemplateManagerProps {
  isOpen: boolean;
  onClose: () => void;
  pdfSettings?: PdfSettings;
  onSave?: (settings: PdfSettings) => void;
}

export const PdfTemplateManager: React.FC<PdfTemplateManagerProps> = ({
  isOpen,
  onClose,
  pdfSettings,
  onSave,
}) => {
  const [settings, setSettings] = useState<PdfSettings>(
    pdfSettings ?? ({
      templateName: 'Default',
      pageSize: 'A4',
      orientation: 'portrait',
      layout: 'traditional',
    } as unknown as PdfSettings)
  );

  const handleSave = () => {
    if (onSave) {
      onSave(settings);
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="PDF Template Manager"
      maxWidth="4xl"
    >
      <div className="p-6">
        <p className="text-gray-600 mb-4">
          TODO: Implement full PDF template manager with:
        </p>
        <ul className="list-disc list-inside text-gray-600 mb-4 space-y-1">
          <li>Header/footer/divider column management</li>
          <li>Layout editor with drag-and-drop</li>
          <li>Preview integration</li>
          <li>Reset functionality</li>
          <li>Vertical align and padding controls</li>
        </ul>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
          <button onClick={handleSave} className="btn btn-primary">
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
};

