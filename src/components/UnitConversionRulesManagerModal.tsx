/**
 * UnitConversionRulesManagerModal.tsx
 *
 * ADR-015 D2: admin UI for the shared, render-time unit-conversion rule
 * library (`unitConversionRuleService.ts`) — list / create / edit /
 * deactivate, modeled directly on CertificateNumberManagerModal.tsx's
 * layout (header + list + overlay edit panel), the house pattern for a
 * simple admin-managed collection.
 *
 * Deactivate, never delete (D2) — a committed record's `conversionSnapshots`
 * may still name a rule by id (D7), so there is no delete action here at
 * all, unlike the equipment-type manager this is modeled on.
 *
 * The live preview reuses `convertColumnDisplayValue` — the SAME pipeline
 * every render path (grid, PDF, read-only view) runs — against a synthetic
 * one-rule library built from the form's current (not yet saved) fields.
 * This is deliberate: the preview can never drift from what the rule will
 * actually do once saved, because it is not a second implementation.
 */

import React, { useEffect, useState } from 'react';
import { unitConversionRuleService } from '../services/unitConversionRuleService';
import { validateConversionRule } from '../services/conversionRuleValidation';
import { convertColumnDisplayValue } from '../services/columnConversion';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import type { ConversionRule } from '../types';

interface UnitConversionRulesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RuleFormData {
  name: string;
  fromUnit: string;
  toUnit: string;
  expression: string;
  notes: string;
  active: boolean;
}

const DEFAULT_FORM: RuleFormData = {
  name: '',
  fromUnit: '',
  toUnit: '',
  expression: 'VALUE',
  notes: '',
  active: true,
};

export const UnitConversionRulesManagerModal: React.FC<UnitConversionRulesManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { success, error: showError } = useToast();
  // Gates on isAdmin directly, matching firestore.rules' write rule for
  // unitConversionRules exactly (admin-write, same as certificate_number_configs
  // and reference_standards) — the UI must never offer an action the
  // database will refuse.
  const { isAdmin: canEdit, currentUser } = useAuth();

  const [rules, setRules] = useState<ConversionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRule, setSelectedRule] = useState<ConversionRule | null>(null);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<RuleFormData>(DEFAULT_FORM);
  const [sampleValue, setSampleValue] = useState('1');

  useEffect(() => {
    if (isOpen) loadRules();
  }, [isOpen]);

  const loadRules = async () => {
    setLoading(true);
    try {
      setRules(await unitConversionRuleService.getAll());
    } catch (e: any) {
      showError(e.message || 'Failed to load conversion rules');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setSelectedRule(null);
    setFormData(DEFAULT_FORM);
    setSampleValue('1');
    setShowEditPanel(true);
  };

  const openEdit = (rule: ConversionRule) => {
    setSelectedRule(rule);
    setFormData({
      name: rule.name,
      fromUnit: rule.fromUnit,
      toUnit: rule.toUnit,
      expression: rule.expression,
      notes: rule.notes ?? '',
      active: rule.active,
    });
    setSampleValue('1');
    setShowEditPanel(true);
  };

  const draft = { fromUnit: formData.fromUnit.trim(), toUnit: formData.toUnit.trim(), expression: formData.expression };
  const validationIssues = validateConversionRule(draft);

  const parsedSample = Number(sampleValue);
  const preview = (!Number.isFinite(parsedSample) || validationIssues.length > 0)
    ? null
    : convertColumnDisplayValue({
      rawValue: parsedSample,
      column: { conversionEnabled: true, conversionSourceUnit: draft.fromUnit },
      targetUnit: draft.toUnit,
      rules: [{
        id: 'preview', name: formData.name || 'preview', fromUnit: draft.fromUnit, toUnit: draft.toUnit,
        expression: draft.expression, active: true, createdAt: new Date(), updatedAt: new Date(), createdBy: 'preview',
      }],
    });

  const handleSave = async () => {
    if (!canEdit) { showError('No permission to edit conversion rules'); return; }
    if (!formData.name.trim()) { showError('Name is required'); return; }
    if (validationIssues.length > 0) { showError(validationIssues[0].message); return; }

    setSaving(true);
    try {
      if (selectedRule) {
        await unitConversionRuleService.update(selectedRule.id, selectedRule, {
          name: formData.name.trim(),
          fromUnit: draft.fromUnit,
          toUnit: draft.toUnit,
          expression: formData.expression,
          notes: formData.notes.trim() || undefined,
          active: formData.active,
        });
        success(`"${formData.name}" updated`);
      } else {
        if (!currentUser) { showError('You must be signed in to create a conversion rule'); return; }
        await unitConversionRuleService.add({
          name: formData.name.trim(),
          fromUnit: draft.fromUnit,
          toUnit: draft.toUnit,
          expression: formData.expression,
          notes: formData.notes.trim() || undefined,
          active: formData.active,
          createdBy: currentUser.uid,
        });
        success(`"${formData.name}" created`);
      }
      setShowEditPanel(false);
      setSelectedRule(null);
      await loadRules();
    } catch (e: any) {
      showError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (rule: ConversionRule) => {
    if (!canEdit) { showError('No permission to edit conversion rules'); return; }
    setSaving(true);
    try {
      if (rule.active) {
        await unitConversionRuleService.deactivate(rule.id);
        success(`"${rule.name}" deactivated`);
      } else {
        await unitConversionRuleService.activate(rule.id);
        success(`"${rule.name}" reactivated`);
      }
      await loadRules();
    } catch (e: any) {
      showError(e.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal-content max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 16V4m0 0L3 8m4-4l4 4" />
                <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 leading-tight">Unit Conversions</h2>
              <p className="text-xs text-gray-400 mt-0.5">Display-time conversion rules for calibration record columns</p>
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
                Add rule
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
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 mb-3">No conversion rules yet</p>
              {canEdit && (
                <button type="button" onClick={openCreate}
                  className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors">
                  Add first rule
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`rounded-xl border px-4 py-3.5 flex items-center gap-4 ${
                    rule.active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  {/* Left: name + meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{rule.name}</span>
                      {!rule.active && (
                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wide">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <code className="font-mono text-xs text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                        {rule.fromUnit} → {rule.toUnit}
                      </code>
                      <code className="font-mono text-xs text-gray-500">{rule.expression}</code>
                    </div>
                  </div>

                  {/* Right: actions */}
                  {canEdit && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(rule)}
                        disabled={saving}
                        className="px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(rule)}
                        disabled={saving}
                        className={`px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors disabled:opacity-50 ${
                          rule.active
                            ? 'text-amber-700 border-amber-200 hover:bg-amber-50'
                            : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                        }`}
                      >
                        {rule.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
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
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                {selectedRule ? 'Edit conversion rule' : 'New conversion rule'}
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
              {/* Live preview — runs the SAME pipeline every render path uses. */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Live preview</p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-500">VALUE =</span>
                  <input
                    type="number"
                    value={sampleValue}
                    onChange={(e) => setSampleValue(e.target.value)}
                    className="input w-24 font-mono text-sm"
                  />
                  <span className="text-xs text-gray-400">{draft.fromUnit || 'source'}</span>
                </div>
                {validationIssues.length > 0 ? (
                  <p className="text-xs text-red-600">{validationIssues[0].message}</p>
                ) : preview === null ? (
                  <p className="text-xs text-gray-400">Enter a numeric sample value.</p>
                ) : preview.failure ? (
                  <p className="text-xs text-amber-700">{preview.failure.message}</p>
                ) : (
                  <p className="font-mono text-lg font-bold text-gray-900">
                    {preview.displayValue} <span className="text-sm font-normal text-gray-400">{draft.toUnit}</span>
                  </p>
                )}
              </div>

              {/* Fields */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input w-full text-sm"
                    placeholder="e.g. mV/V to %"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-600">From unit</label>
                    <input
                      type="text"
                      value={formData.fromUnit}
                      onChange={(e) => setFormData({ ...formData, fromUnit: e.target.value })}
                      className="input w-full font-mono text-sm"
                      placeholder="mV/V"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-600">To unit</label>
                    <input
                      type="text"
                      value={formData.toUnit}
                      onChange={(e) => setFormData({ ...formData, toUnit: e.target.value })}
                      className="input w-full font-mono text-sm"
                      placeholder="%"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">Expression</label>
                  <input
                    type="text"
                    value={formData.expression}
                    onChange={(e) => setFormData({ ...formData, expression: e.target.value })}
                    className="input w-full font-mono text-sm"
                    placeholder="VALUE * 100"
                  />
                  <p className="text-[10px] text-gray-400">
                    The only variable available is <code className="font-mono">VALUE</code> — the column's raw computed value.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">Notes <span className="font-normal text-gray-400">(optional)</span></label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input w-full text-sm"
                    rows={2}
                  />
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Active</p>
                    <p className="text-xs text-gray-400">Inactive rules are never used to convert — deactivate rather than delete</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.active}
                    onClick={() => setFormData({ ...formData, active: !formData.active })}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${
                      formData.active ? 'bg-primary-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      formData.active ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
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
                  disabled={saving || validationIssues.length > 0}
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
    </div>
  );
};
