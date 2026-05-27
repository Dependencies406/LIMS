import React, { useState, useEffect } from 'react';
import type { JobIdSettings } from '../types';
import { previewJobId, validateJobIdSettings } from '../services/jobIdService';
import { HashIcon, AlertTriangleIcon, XIcon, CheckIcon } from './common';

interface JobIdSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: JobIdSettings;
  onSave: (settings: JobIdSettings) => Promise<void>;
}

export const JobIdSettingsModal: React.FC<JobIdSettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onSave,
}) => {
  const [settings, setSettings] = useState<JobIdSettings>(currentSettings);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(currentSettings);
      setErrors([]);
    }
  }, [isOpen, currentSettings]);

  const handleChange = (field: keyof JobIdSettings, value: string | number | boolean) => {
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    setErrors(validateJobIdSettings(updated));
  };

  const handleSave = async () => {
    const errs = validateJobIdSettings(settings);
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

  const previewCurrent = previewJobId(settings);

  if (!isOpen) return null;

  const orgPart   = settings.organizationPrefix || 'ORG';
  const typePart  = settings.jobTypePrefix      || 'TYPE';
  const yearPart  = settings.currentYear.toString().slice(-2);
  const seqPart   = settings.currentSequence.toString().padStart(3, '0');

  return (
    <div className="modal" onClick={handleCancel}>
      <div
        className="modal-content max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <HashIcon className="w-4 h-4 text-primary-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 leading-tight">Request Number Format</h2>
              <p className="text-xs text-gray-400 mt-0.5">Auto-generated job ID configuration</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || errors.length > 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <CheckIcon className="w-3.5 h-3.5" />
              )}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="p-5 space-y-5">

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <ul className="space-y-0.5">
                {errors.map((err, i) => (
                  <li key={i} className="text-xs text-red-700">{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Live preview ─────────────────────────────────── */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Next job ID</p>
            <p className="font-mono text-3xl font-bold text-gray-900 tracking-wider leading-none">
              {previewCurrent}
            </p>
            {/* Colour-coded breakdown under the ID */}
            <div className="flex items-center gap-1 mt-3 flex-wrap">
              <span className="font-mono text-xs font-semibold text-primary-600 bg-primary-50 border border-primary-100 px-1.5 py-0.5 rounded"
                title="Organization prefix">{orgPart}</span>
              <span className="text-xs text-gray-300">–</span>
              <span className="font-mono text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded"
                title="Job type prefix">{typePart}</span>
              <span className="text-xs text-gray-300">–</span>
              <span className="font-mono text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded"
                title="Year (last 2 digits)">{yearPart}</span>
              <span className="font-mono text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded"
                title="Sequence number">{seqPart}</span>
            </div>
          </div>

          {/* ── Form ─────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Prefixes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-600">
                  Organization prefix
                </label>
                <input
                  type="text"
                  value={settings.organizationPrefix}
                  onChange={e => handleChange('organizationPrefix', e.target.value.toUpperCase())}
                  className="input w-full font-mono text-sm tracking-widest"
                  placeholder="SCS"
                  maxLength={10}
                />
                <p className="text-[10px] text-gray-400">Shown in{' '}
                  <span className="font-mono font-semibold text-primary-600">{orgPart}</span>
                </p>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-600">
                  Job type prefix
                </label>
                <input
                  type="text"
                  value={settings.jobTypePrefix}
                  onChange={e => handleChange('jobTypePrefix', e.target.value.toUpperCase())}
                  className="input w-full font-mono text-sm tracking-widest"
                  placeholder="CAL"
                  maxLength={10}
                />
                <p className="text-[10px] text-gray-400">Shown in{' '}
                  <span className="font-mono font-semibold text-violet-600">{typePart}</span>
                </p>
              </div>
            </div>

            {/* Year & Sequence */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-600">Year</label>
                <input
                  type="number"
                  value={settings.currentYear}
                  onChange={e => handleChange('currentYear', parseInt(e.target.value) || 0)}
                  className="input w-full font-mono text-sm"
                  min="2000"
                  max="2099"
                />
                <p className="text-[10px] text-gray-400">Last 2 digits → <span className="font-mono font-semibold text-amber-600">{yearPart}</span></p>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-600">Next sequence</label>
                <input
                  type="number"
                  value={settings.currentSequence}
                  onChange={e => handleChange('currentSequence', parseInt(e.target.value) || 0)}
                  className="input w-full font-mono text-sm"
                  min="1"
                  max="999"
                />
                <p className="text-[10px] text-gray-400">1–999 → <span className="font-mono font-semibold text-emerald-600">{seqPart}</span></p>
              </div>
            </div>

            {/* Yearly reset toggle */}
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">Auto-reset sequence yearly</p>
                <p className="text-xs text-gray-400 mt-0.5">Restarts at 001 each new year</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.yearlyReset}
                onClick={() => handleChange('yearlyReset', !settings.yearlyReset)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
                  settings.yearlyReset ? 'bg-primary-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  settings.yearlyReset ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>

          {/* ── Footer note ───────────────────────────────────── */}
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Changes apply to new jobs only — existing IDs are never modified. The counter increments automatically after each job is created.
          </p>
        </div>
      </div>
    </div>
  );
};
