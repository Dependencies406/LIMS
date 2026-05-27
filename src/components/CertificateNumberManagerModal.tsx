/**
 * Certificate Number Manager Modal
 */

import React, { useState, useEffect } from 'react';
import { certificateNumberConfigService } from '../services/certificateNumberConfigService';
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
  resetPolicy: 'never' | 'yearly' | 'monthly';
  isActive: boolean;
}

const DEFAULT_FORM: ConfigFormData = {
  name: '',
  prefix: '',
  separator: '-',
  includeYear: true,
  numberPadding: 3,
  currentNumber: 0,
  resetPolicy: 'never',
  isActive: true,
};

/** Build the certificate number preview string from form values */
function buildPreview(form: ConfigFormData): string {
  const yearStr = new Date().getFullYear().toString().slice(-2);
  const parts: string[] = [form.prefix || 'PREFIX'];
  if (form.includeYear) parts.push(yearStr);
  parts.push(String(form.currentNumber + 1).padStart(form.numberPadding, '0'));
  return parts.join(form.separator || '-');
}

export const CertificateNumberManagerModal: React.FC<CertificateNumberManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { success, error: showError } = useToast();
  const { hasPermission: canEdit } = usePermission('certificateNumbers.edit');

  const [configs, setConfigs]                 = useState<CertificateNumberConfig[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [selectedConfig, setSelectedConfig]   = useState<CertificateNumberConfig | null>(null);
  const [showEditPanel, setShowEditPanel]     = useState(false);
  const [deleteTarget, setDeleteTarget]       = useState<CertificateNumberConfig | null>(null);
  const [saving, setSaving]                   = useState(false);
  const [formData, setFormData]               = useState<ConfigFormData>(DEFAULT_FORM);

  useEffect(() => {
    if (isOpen) loadConfigs();
  }, [isOpen]);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      setConfigs(await certificateNumberConfigService.getAllConfigs());
    } catch (e: any) {
      showError(e.message || 'Failed to load configurations');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setSelectedConfig(null);
    setFormData(DEFAULT_FORM);
    setShowEditPanel(true);
  };

  const openEdit = (config: CertificateNumberConfig) => {
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
    setShowEditPanel(true);
  };

  const handleSave = async () => {
    if (!canEdit) { showError('No permission to edit certificate number configurations'); return; }
    if (!formData.name.trim())   { showError('Name is required'); return; }
    if (!formData.prefix.trim()) { showError('Prefix is required'); return; }
    if (formData.numberPadding < 1 || formData.numberPadding > 10) { showError('Padding must be 1–10'); return; }

    setSaving(true);
    try {
      const configData: Omit<CertificateNumberConfig, 'id' | 'createdAt' | 'updatedAt'> = {
        name: formData.name.trim(),
        equipmentType: (formData as any).equipmentType ?? '',
        prefix: formData.prefix.trim(),
        separator: formData.separator,
        includeYear: formData.includeYear,
        numberPadding: formData.numberPadding,
        currentNumber: formData.currentNumber,
        currentSequence: (formData as any).currentSequence ?? formData.currentNumber,
        currentYear: (formData as any).currentYear ?? new Date().getFullYear(),
        yearlyReset: formData.resetPolicy === 'yearly',
        resetPolicy: formData.resetPolicy,
        isActive: formData.isActive,
        lastResetAt: undefined,
      };
      if (selectedConfig) {
        await certificateNumberConfigService.updateConfig(selectedConfig.id, configData);
        success(`"${formData.name}" updated`);
      } else {
        await certificateNumberConfigService.createConfig(configData);
        success(`"${formData.name}" created`);
      }
      setShowEditPanel(false);
      setSelectedConfig(null);
      await loadConfigs();
    } catch (e: any) {
      showError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleResetNumber = async (configId: string, name: string) => {
    if (!canEdit) { showError('No permission to reset'); return; }
    if (!window.confirm(`Reset the running number for "${name}" back to 0?`)) return;
    setSaving(true);
    try {
      await certificateNumberConfigService.resetNumber(configId);
      success('Counter reset to 0');
      await loadConfigs();
    } catch (e: any) {
      showError(e.message || 'Failed to reset');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !canEdit) return;
    setSaving(true);
    try {
      await certificateNumberConfigService.deleteConfig(deleteTarget.id);
      success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      await loadConfigs();
    } catch (e: any) {
      showError(e.message || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const previewId = buildPreview(formData);
  const yearStr   = new Date().getFullYear().toString().slice(-2);

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal-content max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" /><line x1="13" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 leading-tight">Certificate Numbers</h2>
              <p className="text-xs text-gray-400 mt-0.5">Manage running sequences per equipment type</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canEdit && (
              <button
                type="button"
                onClick={openCreate}
                disabled={loading || saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-40"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add category
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── List ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading…
              </div>
            </div>
          ) : configs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 mb-3">No certificate categories yet</p>
              {canEdit && (
                <button type="button" onClick={openCreate}
                  className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors">
                  Add first category
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {configs.map((config) => {
                const parts: string[] = [config.prefix];
                if (config.includeYear) parts.push(yearStr);
                parts.push('0'.repeat(config.numberPadding));
                const exampleId = parts.join(config.separator);

                return (
                  <div
                    key={config.id}
                    className={`rounded-xl border px-4 py-3.5 flex items-center gap-4 ${
                      config.isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'
                    }`}
                  >
                    {/* Left: name + meta */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{config.name}</span>
                        {!config.isActive && (
                          <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wide">Inactive</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <code className="font-mono text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                          {exampleId}
                        </code>
                        <span className="text-xs text-gray-400">
                          Next: <strong className="text-gray-600 font-mono">#{config.currentNumber + 1}</strong>
                        </span>
                        {config.resetPolicy !== 'never' && (
                          <span className="text-xs text-gray-400 capitalize">{config.resetPolicy} reset</span>
                        )}
                      </div>
                    </div>

                    {/* Right: actions */}
                    {canEdit && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => openEdit(config)}
                          disabled={saving}
                          className="px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          Edit
                        </button>
                        {config.resetPolicy === 'yearly' && (
                          <button
                            type="button"
                            onClick={() => handleResetNumber(config.id, config.name)}
                            disabled={saving}
                            className="px-2.5 py-1.5 text-xs font-medium text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
                            title="Reset running number to 0"
                          >
                            Reset
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(config)}
                          disabled={saving}
                          className="px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Edit panel (overlay) ────────────────────────────── */}
      {showEditPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !saving && setShowEditPanel(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                {selectedConfig ? 'Edit category' : 'New category'}
              </h3>
              <button
                type="button"
                onClick={() => setShowEditPanel(false)}
                disabled={saving}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Live preview */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Next certificate ID</p>
                <p className="font-mono text-2xl font-bold text-gray-900 tracking-wider leading-none">
                  {previewId}
                </p>
                <div className="flex items-center gap-1 mt-2.5 flex-wrap">
                  <span className="font-mono text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded" title="Prefix">
                    {formData.prefix || 'PREFIX'}
                  </span>
                  {formData.includeYear && (
                    <>
                      <span className="text-xs text-gray-300">{formData.separator || '–'}</span>
                      <span className="font-mono text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded" title="Year">
                        {yearStr}
                      </span>
                    </>
                  )}
                  <span className="text-xs text-gray-300">{formData.separator || '–'}</span>
                  <span className="font-mono text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded" title="Sequence">
                    {String(formData.currentNumber + 1).padStart(formData.numberPadding, '0')}
                  </span>
                </div>
              </div>

              {/* Fields */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">Equipment type name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="input w-full text-sm"
                    placeholder="e.g. Balance, Thermometer"
                  />
                  <p className="text-[10px] text-gray-400">Matches the name shown in the job Items tab</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-600">Prefix</label>
                    <input
                      type="text"
                      value={formData.prefix}
                      onChange={e => setFormData({ ...formData, prefix: e.target.value })}
                      className="input w-full font-mono text-sm"
                      placeholder="SCS-UTM"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-600">Separator</label>
                    <input
                      type="text"
                      value={formData.separator}
                      onChange={e => setFormData({ ...formData, separator: e.target.value })}
                      className="input w-full font-mono text-sm"
                      placeholder="-"
                      maxLength={5}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-600">Digit padding</label>
                    <input
                      type="number"
                      value={formData.numberPadding}
                      onChange={e => setFormData({ ...formData, numberPadding: parseInt(e.target.value) || 3 })}
                      className="input w-full font-mono text-sm"
                      min="1" max="10"
                    />
                    <p className="text-[10px] text-gray-400">3 → <span className="font-mono text-emerald-600">001</span></p>
                  </div>
                  {selectedConfig && (
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-600">Last issued #</label>
                      <input
                        type="number"
                        value={formData.currentNumber}
                        onChange={e => setFormData({ ...formData, currentNumber: parseInt(e.target.value) || 0 })}
                        className="input w-full font-mono text-sm"
                        min="0"
                      />
                      <p className="text-[10px] text-gray-400">Next will be +1</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-1 border-t border-gray-100">
                  {/* Include year toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Include year in ID</p>
                      <p className="text-xs text-gray-400">Appends last 2 digits of the year</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.includeYear}
                      onClick={() => setFormData({ ...formData, includeYear: !formData.includeYear })}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
                        formData.includeYear ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        formData.includeYear ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  {/* Reset policy */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Yearly counter reset</p>
                      <p className="text-xs text-gray-400">Restart sequence at 001 each year</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.resetPolicy === 'yearly'}
                      onClick={() => setFormData({ ...formData, resetPolicy: formData.resetPolicy === 'yearly' ? 'never' : 'yearly' })}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
                        formData.resetPolicy === 'yearly' ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        formData.resetPolicy === 'yearly' ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  {/* Active toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Active</p>
                      <p className="text-xs text-gray-400">Inactive categories won't appear in job forms</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.isActive}
                      onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
                        formData.isActive ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        formData.isActive ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Panel footer */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowEditPanel(false)}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-40"
                >
                  {saving ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : null}
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ─────────────────────────────── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !saving && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Delete category?</p>
                <p className="text-xs text-gray-500 mt-1">
                  <span className="font-medium text-gray-700">"{deleteTarget.name}"</span> will be permanently removed. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-40"
              >
                {saving ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
