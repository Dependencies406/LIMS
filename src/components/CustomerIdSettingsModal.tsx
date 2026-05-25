import React, { useState, useEffect } from 'react';
import type { CustomerIdSettings } from '../types';
import { previewCustomerId, validateCustomerIdSettings } from '../services/customerIdService';
import { InfoIcon, AlertTriangleIcon, XIcon, CheckIcon } from './common';

// Inline icon – reuse HashIcon shape but with a person silhouette feel;
// using the standard customer/ID card icon
const CustomerIdIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <line x1="2" y1="10" x2="22" y2="10" />
  </svg>
);

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
  onSave,
}) => {
  const [settings, setSettings] = useState<CustomerIdSettings>(currentSettings);
  const [errors, setErrors]     = useState<string[]>([]);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(currentSettings);
      setErrors([]);
    }
  }, [isOpen, currentSettings]);

  const handleChange = (field: keyof CustomerIdSettings, value: string | number | boolean) => {
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    setErrors(validateCustomerIdSettings(updated));
  };

  const handleSave = async () => {
    const errs = validateCustomerIdSettings(settings);
    if (errs.length > 0) { setErrors(errs); return; }
    setSaving(true);
    try { await onSave(settings); onClose(); }
    catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleCancel = () => {
    setSettings(currentSettings);
    setErrors([]);
    onClose();
  };

  const previewCurrent = previewCustomerId(settings);
  const previewNext    = previewCustomerId({ ...settings, currentSequence: settings.currentSequence + 1 });

  if (!isOpen) return null;

  return (
    <div className="modal" onClick={handleCancel}>
      <div className="modal-content max-w-4xl" onClick={e => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <CustomerIdIcon className="w-5 h-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 leading-tight">Customer ID Configuration</h2>
              <p className="text-xs text-gray-400 mt-0.5">Configure the auto-generated customer ID format</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
            >
              <XIcon className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || errors.length > 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <CheckIcon className="w-3.5 h-3.5" />
              )}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────────── */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* ── Left: Form fields ── */}
            <div className="space-y-5">

              {/* Validation banner */}
              {errors.length > 0 && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                  <AlertTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800 mb-1">Validation Errors</p>
                    <ul className="space-y-0.5">
                      {errors.map((err, i) => <li key={i} className="text-xs text-red-700">{err}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {/* Prefix */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Prefix <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={settings.prefix}
                  onChange={e => handleChange('prefix', e.target.value)}
                  className="input w-full font-mono tracking-widest uppercase"
                  placeholder="CM"
                  maxLength={10}
                />
                <p className="text-xs text-gray-400">Short abbreviation for customer IDs (max 10 chars)</p>
              </div>

              {/* Year & Sequence row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">
                    Current Year <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={settings.currentYear}
                    onChange={e => handleChange('currentYear', parseInt(e.target.value) || 0)}
                    className="input w-full font-mono"
                    min="2000"
                    max="2099"
                  />
                  <p className="text-xs text-gray-400">Last 2 digits used in ID</p>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">
                    Next Sequence <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={settings.currentSequence}
                    onChange={e => handleChange('currentSequence', parseInt(e.target.value) || 0)}
                    className="input w-full font-mono"
                    min="1"
                    max="999"
                  />
                  <p className="text-xs text-gray-400">Range 1 – 999</p>
                </div>
              </div>

              {/* Yearly Reset toggle */}
              <div className="flex items-center justify-between px-4 py-3.5 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-700">Automatic Yearly Reset</p>
                  <p className="text-xs text-gray-400 mt-0.5">Resets sequence to 1 on new year</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.yearlyReset}
                  onClick={() => handleChange('yearlyReset', !settings.yearlyReset)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                    settings.yearlyReset ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    settings.yearlyReset ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Warning note */}
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <AlertTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900 mb-1">Heads Up</p>
                  <ul className="text-xs text-amber-800 space-y-1">
                    <li>• Changes only apply to new customers – existing IDs are never modified</li>
                    <li>• The sequence counter increments automatically with each new customer</li>
                    <li>• Avoid gaps in the sequence to prevent duplicate IDs</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* ── Right: Live preview ── */}
            <div className="space-y-4">

              {/* Live label */}
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Live Preview</span>
              </div>

              {/* Format card */}
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
                <InfoIcon className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-blue-700 mb-1.5">ID Format</p>
                  <code className="text-xs font-mono bg-blue-100 text-blue-800 px-2.5 py-1 rounded-lg">
                    [PREFIX]-[YY][XXX]
                  </code>
                </div>
              </div>

              {/* Current ID */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 pt-4 pb-1">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Next Customer Will Be</p>
                </div>
                <div className="px-5 pb-4">
                  <div className="mt-2 rounded-lg bg-teal-50 border border-teal-200 px-5 py-4 flex items-center justify-between">
                    <code className="font-mono text-2xl font-bold text-teal-700 tracking-wider">
                      {previewCurrent}
                    </code>
                    <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse flex-shrink-0" />
                  </div>
                </div>
                <div className="border-t border-gray-100 px-5 py-3.5 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Customer After That</p>
                  <code className="font-mono text-base text-gray-500">{previewNext}</code>
                </div>
              </div>

              {/* Format breakdown */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Format Breakdown</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {[
                    { label: 'Prefix',          value: settings.prefix || 'PREFIX' },
                    { label: 'Year (2 digits)',  value: settings.currentYear.toString().slice(-2) },
                    { label: 'Sequence',         value: settings.currentSequence.toString().padStart(3, '0') },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between px-5 py-2.5">
                      <span className="text-xs text-gray-500">{label}</span>
                      <code className="text-xs font-mono font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded">
                        {value}
                      </code>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
