import React, { useState, useEffect } from 'react';
import type { CustomerIdSettings } from '../types';
import { previewCustomerId, validateCustomerIdSettings } from '../services/customerIdService';

interface CustomerIdSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: CustomerIdSettings;
  onSave: (settings: CustomerIdSettings) => Promise<void>;
}

export const CustomerIdSettingsModal: React.FC<CustomerIdSettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onSave
}) => {
  const [settings, setSettings] = useState<CustomerIdSettings>(currentSettings);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Update local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSettings(currentSettings);
      setErrors([]);
    }
  }, [isOpen, currentSettings]);

  const handleChange = (field: keyof CustomerIdSettings, value: string | number | boolean) => {
    const updatedSettings = { ...settings, [field]: value };
    setSettings(updatedSettings);
    
    // Validate on change
    const validationErrors = validateCustomerIdSettings(updatedSettings);
    setErrors(validationErrors);
  };

  const handleSave = async () => {
    // Final validation
    const validationErrors = validateCustomerIdSettings(settings);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSaving(true);
    try {
      await onSave(settings);
      onClose();
    } catch (error) {
      console.error('Error saving customer ID settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setSettings(currentSettings);
    setErrors([]);
    onClose();
  };

  // Generate preview IDs
  const currentPreviewId = previewCustomerId(settings);
  const nextPreviewId = previewCustomerId({
    ...settings,
    currentSequence: settings.currentSequence + 1
  });

  if (!isOpen) return null;

  return (
    <div className="modal" onClick={handleCancel}>
      <div className="modal-content max-w-4xl" onClick={e => e.stopPropagation()}>
        {/* Header with action buttons */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Customer ID Configuration</h2>
          <div className="flex items-center space-x-3">
            {/* Cancel Button */}
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving}
              title="Cancel"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Save Button */}
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center justify-center w-10 h-10 rounded-lg border border-primary-500 bg-primary-600 hover:bg-primary-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving || errors.length > 0}
              title={saving ? 'Saving...' : 'Save Settings'}
            >
              {saving ? (
                <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
            {/* Settings Panel */}
            <div className="space-y-6 overflow-y-auto pr-2">
              {/* Errors */}
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="text-red-800 font-semibold mb-2">⚠️ Validation Errors:</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {errors.map((error, index) => (
                      <li key={index} className="text-red-700 text-sm">{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Configuration Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <span className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-blue-600 text-sm">🔧</span>
                  </span>
                  Customer ID Configuration
                </h3>
                
                {/* Prefix */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">Prefix <span className="text-red-500">*</span></label>
                    <p className="text-xs text-gray-500">Short abbreviation for customer ID (max 10 chars)</p>
                  </div>
                  <div className="w-48">
                    <input
                      type="text"
                      value={settings.prefix}
                      onChange={(e) => handleChange('prefix', e.target.value)}
                      className="input text-sm"
                      placeholder="e.g., CUS"
                      maxLength={10}
                    />
                  </div>
                </div>

                {/* Current Year */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">Current Year <span className="text-red-500">*</span></label>
                    <p className="text-xs text-gray-500">Year for customer ID (last 2 digits used)</p>
                  </div>
                  <div className="w-48">
                    <input
                      type="number"
                      value={settings.currentYear}
                      onChange={(e) => handleChange('currentYear', parseInt(e.target.value) || 0)}
                      className="input text-sm"
                      min="2000"
                      max="2099"
                    />
                  </div>
                </div>

                {/* Current Sequence */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">Next Customer Sequence <span className="text-red-500">*</span></label>
                    <p className="text-xs text-gray-500">Number for the NEXT customer to be created (1-999)</p>
                  </div>
                  <div className="w-48">
                    <input
                      type="number"
                      value={settings.currentSequence}
                      onChange={(e) => handleChange('currentSequence', parseInt(e.target.value) || 0)}
                      className="input text-sm"
                      min="1"
                      max="999"
                    />
                  </div>
                </div>

                {/* Yearly Reset Option */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700">Automatic Yearly Reset</label>
                    <p className="text-xs text-gray-500">Reset sequence to 1 when year changes</p>
                  </div>
                  <div className="w-48">
                    <label className="flex items-center justify-end">
                      <input
                        type="checkbox"
                        checked={settings.yearlyReset}
                        onChange={(e) => handleChange('yearlyReset', e.target.checked)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Important Notes */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <span className="text-xl mr-3">⚠️</span>
                  <div>
                    <h4 className="font-semibold text-yellow-900 mb-2">Important Notes</h4>
                    <ul className="text-xs text-yellow-800 space-y-1">
                      <li>• Changes affect new customers only (existing IDs unchanged)</li>
                      <li>• Sequence increments automatically with each customer</li>
                      <li>• Be cautious to avoid duplicate IDs</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Panel */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Preview</h3>
              </div>
              
              {/* Format Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <span className="text-xl mr-3">💡</span>
                  <div>
                    <h4 className="font-semibold text-blue-900 mb-2">Customer ID Format</h4>
                    <p className="text-sm text-blue-800">
                      <code className="bg-blue-100 px-2 py-1 rounded font-mono">[PREFIX]-[YY][XXX]</code>
                    </p>
                  </div>
                </div>
              </div>

              {/* Preview Examples */}
              <div className="bg-white border border-gray-300 rounded-lg p-5 space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">Next Customer Will Be:</p>
                  <div className="bg-gradient-to-r from-primary-50 to-primary-100 border-2 border-primary-300 rounded-lg p-4">
                    <code className="font-mono text-2xl font-bold text-primary-700">
                      {currentPreviewId}
                    </code>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">Customer After That:</p>
                  <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                    <code className="font-mono text-xl text-gray-700">
                      {nextPreviewId}
                    </code>
                  </div>
                </div>
              </div>

              {/* Visual Breakdown */}
              <div className="bg-white border border-gray-300 rounded-lg p-5">
                <h4 className="text-sm font-semibold text-gray-800 mb-3">Format Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center py-2 border-b border-gray-200">
                    <span className="text-gray-600">Prefix:</span>
                    <code className="bg-gray-100 px-2 py-1 rounded font-mono text-primary-600">{settings.prefix || 'PREFIX'}</code>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-200">
                    <span className="text-gray-600">Year:</span>
                    <code className="bg-gray-100 px-2 py-1 rounded font-mono text-primary-600">{settings.currentYear.toString().slice(-2)}</code>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600">Sequence:</span>
                    <code className="bg-gray-100 px-2 py-1 rounded font-mono text-primary-600">{settings.currentSequence.toString().padStart(3, '0')}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
