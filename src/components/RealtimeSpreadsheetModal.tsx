/**
 * Realtime Spreadsheet Modal Component
 * Spreadsheet with real-time collaboration support
 * TODO: Full implementation with presence and real-time sync
 */

import React from 'react';
import { SpreadsheetModal } from './SpreadsheetModal';
import type { TemplateSchema, FlattenedCellData } from '../types/template';

interface RealtimeSpreadsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  template?: TemplateSchema | null;
  initialData?: FlattenedCellData[];
  onSave?: (data: FlattenedCellData[]) => void;
}

export const RealtimeSpreadsheetModal: React.FC<RealtimeSpreadsheetModalProps> = ({
  isOpen,
  onClose,
  template,
  initialData,
  onSave,
}) => {
  // TODO: Add real-time sync hooks and presence indicators
  return (
    <SpreadsheetModal
      isOpen={isOpen}
      onClose={onClose}
      template={template}
      initialData={initialData}
      onSave={onSave}
    />
  );
};

