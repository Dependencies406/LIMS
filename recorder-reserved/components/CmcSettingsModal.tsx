import React, { useState, useEffect } from 'react';
import type { CmcSettings, CmcScopeStep } from '../types';
import { ShieldIcon, AlertTriangleIcon, CheckIcon, PlusIcon, TrashIcon } from './common';

interface CmcSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: CmcSettings;
  onSave: (settings: CmcSettings) => Promise<void>;
}

type Direction = 'tension' | 'compression';

function validateSteps(steps: CmcScopeStep[]): string[] {
  const errors: string[] = [];
  steps.forEach((step, i) => {
    if (!Number.isFinite(step.toN) || step.toN <= 0) {
      errors.push(`Row ${i + 1}: "to N" must be a positive number.`);
    }
    if (!Number.isFinite(step.cmcPercent) || step.cmcPercent < 0) {
      errors.push(`Row ${i + 1}: CMC (%) must be a non-negative number.`);
    }
  });
  return errors;
}

export const CmcSettingsModal: React.FC<CmcSettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onSave,
}) => {
  const [settings, setSettings] = useState<CmcSettings>(currentSettings);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(currentSettings);
      setErrors([]);
    }
  }, [isOpen, currentSettings]);

  if (!isOpen) return null;

  const updateSteps = (direction: Direction, steps: CmcScopeStep[]) => {
    const next = { ...settings, directions: { ...settings.directions, [direction]: steps } };
    setSettings(next);
    setErrors([...validateSteps(next.directions.tension), ...validateSteps(next.directions.compression)]);
  };

  const handleStepChange = (direction: Direction, idx: number, field: keyof CmcScopeStep, value: number) => {
    const steps = settings.directions[direction].map((s, i) => (i === idx ? { ...s, [field]: value } : s));
    updateSteps(direction, steps);
  };

  const handleAddStep = (direction: Direction) => {
    updateSteps(direction, [...settings.directions[direction], { toN: 0, cmcPercent: 0 }]);
  };

  const handleRemoveStep = (direction: Direction, idx: number) => {
    updateSteps(direction, settings.directions[direction].filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    const errs = [...validateSteps(settings.directions.tension), ...validateSteps(settings.directions.compression)];
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

  const renderDirection = (direction: Direction, label: string) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <button
          type="button"
          onClick={() => handleAddStep(direction)}
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
        >
          <PlusIcon className="w-3.5 h-3.5" /> Add step
        </button>
      </div>
      <div className="space-y-2">
        {settings.directions[direction].map((step, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-gray-400 mb-0.5">to N</label>
              <input
                type="number"
                value={step.toN}
                onChange={(e) => handleStepChange(direction, idx, 'toN', parseFloat(e.target.value) || 0)}
                className="input w-full font-mono text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-gray-400 mb-0.5">CMC (%)</label>
              <input
                type="number"
                step="0.01"
                value={step.cmcPercent}
                onChange={(e) => handleStepChange(direction, idx, 'cmcPercent', parseFloat(e.target.value) || 0)}
                className="input w-full font-mono text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => handleRemoveStep(direction, idx)}
              className="mt-4 text-gray-300 hover:text-red-500 transition-colors"
              aria-label="Remove step"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
        {settings.directions[direction].length === 0 && (
          <p className="text-xs text-gray-400 italic">No steps configured.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="modal" onClick={handleCancel}>
      <div className="modal-content max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <ShieldIcon className="w-4 h-4 text-rose-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 leading-tight">Force CMC Table</h2>
              <p className="text-xs text-gray-400 mt-0.5">Calibration and Measurement Capability, per ISO 7500-1 direction</p>
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
              <CheckIcon className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
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

          {renderDirection('tension', 'Tension')}
          <div className="border-t border-gray-100" />
          {renderDirection('compression', 'Compression')}

          <p className="text-[11px] text-gray-400 leading-relaxed">
            Cal. points are normalized to N (kN × 1000) and matched against the smallest "to N" step
            that is ≥ the point. Report-U on a saved sheet uses this table for its direction; if this
            table is empty for that direction, Report-U is shown as unavailable rather than silently
            using U alone.
          </p>
        </div>
      </div>
    </div>
  );
};
