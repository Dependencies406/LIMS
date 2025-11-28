/**
 * Template Selection Modal
 * Allows users to select a template to apply to a spreadsheet
 */

import React, { useState, useEffect } from 'react';
import { Modal } from './common/Modal';
import { templateService } from '../services/templateService';
import { useAuth } from '../contexts/AuthContext';
import type { TemplateSchema } from '../types/template';

interface TemplateSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (template: TemplateSchema) => void;
}

export const TemplateSelectionModal: React.FC<TemplateSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  const { currentUser } = useAuth();
  const [templates, setTemplates] = useState<TemplateSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      loadTemplates();
    }
  }, [isOpen, currentUser]);

  const loadTemplates = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      setError(null);
      const accessibleTemplates = await templateService.getAccessibleTemplates(currentUser.uid);
      setTemplates(accessibleTemplates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (template: TemplateSchema) => {
    onSelect(template);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Template"
      maxWidth="2xl"
    >
      <div className="p-6">
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading templates...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {!loading && !error && templates.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-600">No templates available</p>
          </div>
        )}

        {!loading && !error && templates.length > 0 && (
          <div className="space-y-2">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSelect(template)}
                className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
              >
                <h3 className="font-semibold text-gray-900">{template.name}</h3>
                {template.description && (
                  <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                )}
                <div className="mt-2 text-xs text-gray-500">
                  {template.columns?.length || 0} columns • Updated{' '}
                  {template.updatedAt?.toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

