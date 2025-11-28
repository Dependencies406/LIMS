/**
 * Template Manager Component
 * Lists, creates, edits, and deletes templates via templateService
 */

import React, { useState, useEffect } from 'react';
import { templateService, DuplicateTemplateNameError } from '../services/templateService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import type { TemplateSchema } from '../types/template';
import { TemplateSelectionModal } from './TemplateSelectionModal';
import { Modal } from './common/Modal';

interface TemplateManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (template: TemplateSchema) => void;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const [templates, setTemplates] = useState<TemplateSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateSchema | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (isOpen && currentUser) {
      loadTemplates();
    }
  }, [isOpen, currentUser]);

  const loadTemplates = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      const userTemplates = await templateService.getTemplatesByOwner(currentUser.uid);
      setTemplates(userTemplates);
    } catch (err) {
      showError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      await templateService.deleteTemplate(templateId);
      success('Template deleted successfully');
      loadTemplates();
    } catch (err) {
      showError('Failed to delete template');
    }
  };

  const handleSelect = (template: TemplateSchema) => {
    if (onSelect) {
      onSelect(template);
    }
    setSelectedTemplate(template);
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Template Manager"
        maxWidth="4xl"
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">My Templates</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              + Create Template
            </button>
          </div>

          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            </div>
          )}

          {!loading && templates.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-600">No templates yet. Create your first template!</p>
            </div>
          )}

          {!loading && templates.length > 0 && (
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    {template.description && (
                      <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                    )}
                    <div className="mt-2 text-xs text-gray-500">
                      {template.columns?.length || 0} columns •{' '}
                      {template.updatedAt?.toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleSelect(template)}
                      className="btn btn-secondary text-sm"
                    >
                      Select
                    </button>
                    <button
                      onClick={() => template.id && handleDelete(template.id)}
                      className="btn btn-danger text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* TODO: Add TemplateBuilder modal for create/edit */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
            <h3 className="text-lg font-semibold mb-4">Create Template</h3>
            <p className="text-gray-600 mb-4">
              TODO: Implement template creation form with TemplateBuilder integration
            </p>
            <button
              onClick={() => setShowCreateModal(false)}
              className="btn btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

