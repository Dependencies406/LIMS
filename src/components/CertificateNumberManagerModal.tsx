/**
 * Certificate Number Manager Modal
 * Manages certificate number category configurations
 */

import React, { useState, useEffect } from 'react';
import { certificateNumberConfigService } from '../services/certificateNumberConfigService';
import { previewCertificateNumber } from '../services/certificateNumberGeneratorService';
import { useToast } from '../hooks/useToast';
import { usePermission } from '../hooks/usePermission';
import type { CertificateNumberConfig } from '../types';

interface CertificateNumberManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ConfigFormData {
  name: string;
  prefix: string;
  separator: string;
  includeYear: boolean;
  numberPadding: number;
  currentNumber: number;
  resetPolicy: 'never' | 'yearly';
  isActive: boolean;
}

export const CertificateNumberManagerModal: React.FC<CertificateNumberManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { success, error: showError } = useToast();
  const { hasPermission: canEdit } = usePermission('certificateNumbers.edit');
  
  const [configs, setConfigs] = useState<CertificateNumberConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<CertificateNumberConfig | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<CertificateNumberConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ConfigFormData>({
    name: '',
    prefix: '',
    separator: '-',
    includeYear: true,
    numberPadding: 3,
    currentNumber: 0,
    resetPolicy: 'never',
    isActive: true,
  });

  // Load configs when modal opens
  useEffect(() => {
    if (isOpen) {
      loadConfigs();
    }
  }, [isOpen]);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const allConfigs = await certificateNumberConfigService.getAllConfigs();
      setConfigs(allConfigs);
    } catch (error: any) {
      showError(error.message || 'Failed to load certificate number configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedConfig(null);
    setFormData({
      name: '',
      prefix: '',
      separator: '-',
      includeYear: true,
      numberPadding: 3,
      currentNumber: 0,
      resetPolicy: 'never',
      isActive: true,
    });
    setShowEditModal(true);
  };

  const handleEdit = (config: CertificateNumberConfig) => {
    setSelectedConfig(config);
    setFormData({
      name: config.name,
      prefix: config.prefix,
      separator: config.separator,
      includeYear: config.includeYear !== false,
      numberPadding: config.numberPadding,
      currentNumber: config.currentNumber,
      resetPolicy: config.resetPolicy,
      isActive: config.isActive,
    });
    setShowEditModal(true);
  };

  const handleDelete = (config: CertificateNumberConfig) => {
    setConfigToDelete(config);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!configToDelete || !canEdit) return;

    setSaving(true);
    try {
      await certificateNumberConfigService.deleteConfig(configToDelete.id);
      success(`Certificate number configuration "${configToDelete.name}" deleted successfully`);
      setShowDeleteConfirm(false);
      setConfigToDelete(null);
      await loadConfigs();
    } catch (error: any) {
      showError(error.message || 'Failed to delete configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) {
      showError('You do not have permission to edit certificate number configurations');
      return;
    }

    // Validation
    if (!formData.name.trim()) {
      showError('Name is required');
      return;
    }
    if (!formData.prefix.trim()) {
      showError('Prefix is required');
      return;
    }
    if (formData.numberPadding < 1 || formData.numberPadding > 10) {
      showError('Number padding must be between 1 and 10');
      return;
    }

    setSaving(true);
    try {
      const configData: Omit<CertificateNumberConfig, 'id' | 'createdAt' | 'updatedAt'> = {
        name: formData.name.trim(),
        prefix: formData.prefix.trim(),
        separator: formData.separator,
        includeYear: formData.includeYear,
        numberPadding: formData.numberPadding,
        currentNumber: formData.currentNumber,
        resetPolicy: formData.resetPolicy,
        isActive: formData.isActive,
        lastResetAt: undefined,
      };

      if (selectedConfig) {
        await certificateNumberConfigService.updateConfig(selectedConfig.id, configData);
        success(`Certificate number configuration "${formData.name}" updated successfully`);
      } else {
        await certificateNumberConfigService.createConfig(configData);
        success(`Certificate number configuration "${formData.name}" created successfully`);
      }

      setShowEditModal(false);
      setSelectedConfig(null);
      await loadConfigs();
    } catch (error: any) {
      showError(error.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleResetNumber = async (configId: string) => {
    if (!canEdit) {
      showError('You do not have permission to reset certificate numbers');
      return;
    }

    if (!window.confirm('Are you sure you want to reset the current number to 0? This cannot be undone.')) {
      return;
    }

    setSaving(true);
    try {
      await certificateNumberConfigService.resetNumber(configId);
      success('Certificate number reset successfully');
      await loadConfigs();
    } catch (error: any) {
      showError(error.message || 'Failed to reset certificate number');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Preview next certificate number
  const previewNext = selectedConfig && showEditModal
    ? (async () => {
        try {
          return await previewCertificateNumber(selectedConfig.id);
        } catch {
          return 'Preview unavailable';
        }
      })()
    : null;

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content max-w-6xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Certificate Number Manager</h2>
            <p className="text-sm text-gray-500 mt-1">Manage certificate number category configurations</p>
          </div>
          <div className="flex items-center space-x-3">
            {canEdit && (
              <button
                onClick={handleCreate}
                className="btn btn-primary"
                disabled={loading || saving}
              >
                + Create Category
              </button>
            )}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-gray-500">Loading configurations...</div>
            </div>
          ) : configs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No certificate number configurations found</p>
              {canEdit && (
                <button onClick={handleCreate} className="btn btn-primary">
                  Create First Category
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className={`border rounded-lg p-4 ${config.isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-300'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{config.name}</h3>
                        {!config.isActive && (
                          <span className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded">Inactive</span>
                        )}
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded font-mono">
                          {config.prefix}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>
                          <span className="font-medium">Format:</span>{' '}
                          <code className="bg-gray-100 px-2 py-1 rounded font-mono">
                            {(() => {
                              const parts = [config.prefix];
                              if (config.includeYear) {
                                const currentYear = new Date().getFullYear();
                                parts.push(String(currentYear).slice(-2));
                              }
                              parts.push('0'.repeat(config.numberPadding));
                              return parts.join(config.separator);
                            })()}
                          </code>
                        </p>
                        <p>
                          <span className="font-medium">Current Number:</span> {config.currentNumber}
                        </p>
                        <p>
                          <span className="font-medium">Reset Policy:</span> {config.resetPolicy === 'yearly' ? 'Yearly' : 'Never'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      {canEdit && (
                        <>
                          <button
                            onClick={() => handleEdit(config)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                            disabled={saving}
                          >
                            Edit
                          </button>
                          {config.resetPolicy === 'yearly' && (
                            <button
                              onClick={() => handleResetNumber(config.id)}
                              className="px-3 py-1.5 text-sm border border-orange-300 text-orange-700 rounded hover:bg-orange-50"
                              disabled={saving}
                              title="Reset number to 0"
                            >
                              Reset
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(config)}
                            className="px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded hover:bg-red-50"
                            disabled={saving}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowEditModal(false)}>
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold mb-4">
                {selectedConfig ? 'Edit Category' : 'Create Category'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input w-full"
                    placeholder="e.g., Equipment Calibration"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prefix <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.prefix}
                    onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                    className="input w-full font-mono"
                    placeholder="e.g., SCS-UTM"
                  />
                  <p className="text-xs text-gray-500 mt-1">The prefix text that will appear in certificate numbers (e.g., "SCS-UTM")</p>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="includeYear"
                    checked={formData.includeYear}
                    onChange={(e) => setFormData({ ...formData, includeYear: e.target.checked })}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="includeYear" className="ml-2 text-sm text-gray-700">
                    Include Year (YY - last 2 digits of current year)
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Separator <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.separator}
                      onChange={(e) => setFormData({ ...formData, separator: e.target.value })}
                      className="input w-full"
                      placeholder="-"
                      maxLength={5}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Number Padding <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.numberPadding}
                      onChange={(e) => setFormData({ ...formData, numberPadding: parseInt(e.target.value) || 3 })}
                      className="input w-full"
                      min="1"
                      max="10"
                    />
                    <p className="text-xs text-gray-500 mt-1">Number of digits for running number (e.g., 3 → 001, 002)</p>
                  </div>
                </div>

                {selectedConfig && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Current Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.currentNumber}
                      onChange={(e) => setFormData({ ...formData, currentNumber: parseInt(e.target.value) || 0 })}
                      className="input w-full"
                      min="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">The last issued number. Next certificate will use this number + 1</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reset Policy</label>
                  <select
                    value={formData.resetPolicy}
                    onChange={(e) => setFormData({ ...formData, resetPolicy: e.target.value as 'never' | 'yearly' })}
                    className="input w-full"
                  >
                    <option value="never">Never</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                    Active
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-secondary"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {showDeleteConfirm && configToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold mb-4">Confirm Delete</h3>
              <p className="text-gray-700 mb-6">
                Are you sure you want to delete the certificate number configuration "{configToDelete.name}"?
                This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="btn btn-secondary"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="btn bg-red-600 hover:bg-red-700 text-white"
                  disabled={saving}
                >
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
