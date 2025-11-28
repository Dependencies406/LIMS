/**
 * Template Builder Component
 * Allows users to create and edit spreadsheet templates with columns, formulas, and metadata
 * Includes dirty-state tracking and validation integration
 */

import React, { useState, useEffect } from 'react';
import { templateService, DuplicateTemplateNameError } from '../services/templateService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { validateCompleteTemplate } from '../utils/validationHelpers';
import type { TemplateSchema, ColumnDefinition, TemplateFormula } from '../types/template';
import { Modal } from './common/Modal';

interface TemplateBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  template?: TemplateSchema | null; // If provided, edit mode; otherwise, create mode
  onSave?: (template: TemplateSchema) => void;
}

export const TemplateBuilder: React.FC<TemplateBuilderProps> = ({
  isOpen,
  onClose,
  template,
  onSave,
}) => {
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState<ColumnDefinition[]>([]);
  const [formulas, setFormulas] = useState<TemplateFormula[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (template) {
        // Edit mode
        setName(template.name);
        setDescription(template.description || '');
        setColumns(template.columns || []);
        setFormulas(template.formulas || []);
      } else {
        // Create mode
        setName('');
        setDescription('');
        setColumns([]);
        setFormulas([]);
      }
      setIsDirty(false);
    }
  }, [isOpen, template]);

  const handleAddColumn = () => {
    const newColumn: ColumnDefinition = {
      id: `col_${Date.now()}`,
      header: `Column ${columns.length + 1}`,
      type: 'text',
      required: false,
    };
    setColumns([...columns, newColumn]);
    setIsDirty(true);
  };

  const handleUpdateColumn = (index: number, updates: Partial<ColumnDefinition>) => {
    const updated = [...columns];
    updated[index] = { ...updated[index], ...updates };
    setColumns(updated);
    setIsDirty(true);
  };

  const handleDeleteColumn = (index: number) => {
    const updated = columns.filter((_, i) => i !== index);
    setColumns(updated);
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!currentUser) {
      showError('You must be logged in to save templates');
      return;
    }

    const templateData: TemplateSchema = {
      id: template?.id,
      name: name.trim(),
      description: description.trim(),
      ownerId: currentUser.uid,
      columns,
      formulas,
      isPublic: false,
      createdAt: template?.createdAt || new Date(),
      updatedAt: new Date(),
      version: (template?.version || 0) + 1,
    };

    // Validate
    const validation = validateCompleteTemplate(templateData);
    if (!validation.isValid) {
      showError(`Validation errors: ${validation.errors.join(', ')}`);
      return;
    }

    try {
      setSaving(true);
      
      if (template?.id) {
        // Update existing
        await templateService.updateTemplate(template.id, templateData);
        success('Template updated successfully');
      } else {
        // Create new
        const newId = await templateService.createTemplate(templateData);
        templateData.id = newId;
        success('Template created successfully');
      }

      setIsDirty(false);
      if (onSave) {
        onSave(templateData);
      }
      onClose();
    } catch (err) {
      if (err instanceof DuplicateTemplateNameError) {
        showError(err.message);
      } else {
        showError('Failed to save template');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (isDirty && !confirm('You have unsaved changes. Are you sure you want to close?')) {
          return;
        }
        onClose();
      }}
      title={template ? 'Edit Template' : 'Create Template'}
      maxWidth="6xl"
    >
      <div className="p-6">
        {/* Template Metadata */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Template Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setIsDirty(true);
            }}
            className="input"
            placeholder="Enter template name"
          />

          <label className="block text-sm font-medium text-gray-700 mb-2 mt-4">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setIsDirty(true);
            }}
            className="input"
            rows={3}
            placeholder="Enter template description"
          />
        </div>

        {/* Columns */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Columns</h3>
            <button onClick={handleAddColumn} className="btn btn-primary">
              + Add Column
            </button>
          </div>

          {columns.length === 0 && (
            <p className="text-gray-500 text-center py-4">
              No columns yet. Add your first column to get started.
            </p>
          )}

          <div className="space-y-4">
            {columns.map((col, index) => (
              <div key={col.id} className="border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Header
                    </label>
                    <input
                      type="text"
                      value={col.header}
                      onChange={(e) =>
                        handleUpdateColumn(index, { header: e.target.value })
                      }
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type
                    </label>
                    <select
                      value={col.type}
                      onChange={(e) =>
                        handleUpdateColumn(index, {
                          type: e.target.value as ColumnDefinition['type'],
                        })
                      }
                      className="input"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="formula">Formula</option>
                      <option value="dropdown">Dropdown</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Default Value
                    </label>
                    <input
                      type="text"
                      value={col.defaultValue || ''}
                      onChange={(e) =>
                        handleUpdateColumn(index, { defaultValue: e.target.value })
                      }
                      className="input"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => handleDeleteColumn(index)}
                      className="btn btn-danger w-full"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {col.type === 'formula' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Formula
                    </label>
                    <input
                      type="text"
                      value={col.formula || ''}
                      onChange={(e) =>
                        handleUpdateColumn(index, { formula: e.target.value })
                      }
                      className="input"
                      placeholder="e.g., =A1+B1"
                    />
                  </div>
                )}

                {col.type === 'dropdown' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Options (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={col.options?.join(', ') || ''}
                      onChange={(e) =>
                        handleUpdateColumn(index, {
                          options: e.target.value.split(',').map((s) => s.trim()),
                        })
                      }
                      className="input"
                      placeholder="Option 1, Option 2, Option 3"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || columns.length === 0}
            className="btn btn-primary"
          >
            {saving ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

