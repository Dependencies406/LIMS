/**
 * UsageLogEditModal â€” shared edit modal for usage log records.
 * Used on both EquipmentDetailPage (Usage Logs tab) and UsageLogHistoryPage.
 *
 * Layout: fixed-height modal (max 90 vh) with a sticky header + footer and
 * a scrollable body so content is never clipped on short screens.
 */
import React, { useState, useEffect, useCallback } from 'react';
import type { UsageLog } from '../types';

// â”€â”€â”€ Toggle button group (replaces plain <input type="radio">) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ToggleOption<T extends string> {
  value: T;
  label: string;
  activeClass: string; // bg + text when selected
}

function ToggleGroup<T extends string>({
  label,
  sublabel,
  options,
  value,
  onChange,
}: {
  label: string;
  sublabel?: string;
  options: ToggleOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-0.5">{label}</p>
      {sublabel && <p className="text-xs text-gray-400 mb-2">{sublabel}</p>}
      <div className="flex gap-2 mt-1.5">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                active
                  ? `${opt.activeClass} border-transparent shadow-sm`
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// â”€â”€â”€ Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Props {
  log: UsageLog;
  onSave: (data: Partial<Omit<UsageLog, 'id' | 'createdAt'>>) => Promise<void>;
  onClose: () => void;
}

export const UsageLogEditModal: React.FC<Props> = ({ log, onSave, onClose }) => {
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    date: log.date,
    visualInspection: log.visualInspection as 'pass' | 'fail',
    functionalCheck: log.functionalCheck as 'pass' | 'fail',
    documentCheck: log.documentCheck as 'valid' | 'expired' | 'na',
    refValuesVerified: log.refValuesVerified ?? false,
    correctionValue: log.correctionValue ?? '',
    equipmentCondition: log.equipmentCondition as 'normal' | 'abnormal',
    abnormalDetails: log.abnormalDetails ?? '',
    actionTaken: log.actionTaken ?? '',
    notes: log.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
    [onClose]
  );
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const hasFailure =
    form.visualInspection === 'fail' ||
    form.functionalCheck === 'fail' ||
    form.documentCheck === 'expired' ||
    form.equipmentCondition === 'abnormal';
  const overallResult: 'pass' | 'fail' = hasFailure ? 'fail' : 'pass';
  const isAbnormal = form.equipmentCondition === 'abnormal';

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        date: form.date,
        visualInspection: form.visualInspection,
        functionalCheck: form.functionalCheck,
        documentCheck: form.documentCheck,
        refValuesVerified: form.refValuesVerified || undefined,
        correctionValue: form.correctionValue || undefined,
        equipmentCondition: form.equipmentCondition,
        abnormalDetails: form.abnormalDetails || undefined,
        actionTaken: form.actionTaken || undefined,
        notes: form.notes || undefined,
        overallResult,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    /* Backdrop â€” clicking outside closes */
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/*
        Modal card:
          - max-h-[90vh] + flex flex-col  â†’ card never taller than viewport
          - header / footer are sticky; body is the only scrolling region
      */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* â”€â”€ Sticky header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Edit Usage Log</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(log.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' Â· '}
              {log.operatorName || log.operator}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors text-lg leading-none"
            aria-label="Close"
          >
            Ã—
          </button>
        </div>

        {/* â”€â”€ Scrollable body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
              Date of Use
            </label>
            <input
              type="date"
              value={form.date}
              max={today}
              onChange={(e) => set('date', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Section B â€” Pre-use Checks */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pre-use Checks</p>

            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">
              <ToggleGroup
                label="Visual Inspection"
                sublabel="Physical condition â€” no cracks, damage or contamination"
                options={[
                  { value: 'pass', label: 'âœ“ Pass', activeClass: 'bg-green-100 text-green-800' },
                  { value: 'fail', label: 'âœ— Fail', activeClass: 'bg-red-100 text-red-800' },
                ]}
                value={form.visualInspection}
                onChange={(v) => set('visualInspection', v)}
              />

              <div className="border-t border-gray-200" />

              <ToggleGroup
                label="Functional & Stability Check"
                sublabel="Measurement function and reading stability within expected range"
                options={[
                  { value: 'pass', label: 'âœ“ Pass', activeClass: 'bg-green-100 text-green-800' },
                  { value: 'fail', label: 'âœ— Fail', activeClass: 'bg-red-100 text-red-800' },
                ]}
                value={form.functionalCheck}
                onChange={(v) => set('functionalCheck', v)}
              />

              <div className="border-t border-gray-200" />

              <ToggleGroup
                label="Calibration Documentation"
                sublabel="Certificate current status"
                options={[
                  { value: 'valid', label: 'âœ“ Valid', activeClass: 'bg-green-100 text-green-800' },
                  { value: 'expired', label: 'âœ— Expired', activeClass: 'bg-red-100 text-red-800' },
                  { value: 'na', label: 'N/A', activeClass: 'bg-gray-200 text-gray-700' },
                ]}
                value={form.documentCheck}
                onChange={(v) => set('documentCheck', v)}
              />
            </div>
          </div>

          {/* Section C â€” Equipment Condition */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Equipment Condition</p>

            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">
              <ToggleGroup
                label="Overall Condition"
                sublabel="After completing checks above"
                options={[
                  { value: 'normal', label: 'âœ“ Normal', activeClass: 'bg-green-100 text-green-800' },
                  { value: 'abnormal', label: 'âš  Abnormal', activeClass: 'bg-amber-100 text-amber-800' },
                ]}
                value={form.equipmentCondition}
                onChange={(v) => set('equipmentCondition', v)}
              />

              {isAbnormal && (
                <>
                  <div className="border-t border-gray-200" />
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                        Abnormal Details <span className="text-red-500 normal-case font-normal tracking-normal">*</span>
                      </label>
                      <textarea
                        value={form.abnormalDetails}
                        onChange={(e) => set('abnormalDetails', e.target.value)}
                        rows={3}
                        placeholder="Describe the issueâ€¦"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                        Action Taken <span className="text-red-500 normal-case font-normal tracking-normal">*</span>
                      </label>
                      <select
                        value={form.actionTaken}
                        onChange={(e) => set('actionTaken', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">â€” Select action â€”</option>
                        <option value="Tagged Out of Service">Tagged Out of Service</option>
                        <option value="Repair Requested">Repair Requested</option>
                        <option value="Sent for Verification">Sent for Verification</option>
                        <option value="Other">Other (specify in notes)</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
              Notes / Remarks
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="Any additional observationsâ€¦"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {/* Recalculated overall result */}
          <div
            className={`rounded-xl p-4 flex items-center justify-between ${
              overallResult === 'pass'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recalculated Result</p>
              <p className="text-xs text-gray-400 mt-0.5">Updates automatically as you change checks above</p>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
                overallResult === 'pass'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {overallResult === 'pass' ? 'âœ“ PASS' : 'âœ— FAIL'}
            </span>
          </div>
        </div>

        {/* â”€â”€ Sticky footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0">
          <p className="text-xs text-gray-400">
            {hasFailure
              ? 'âš  Saving with FAIL will mark equipment Out of Service'
              : 'All checks pass â€” result will be recorded as PASS'}
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 bg-white text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 ${
                hasFailure
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-primary-600 hover:bg-primary-700 text-white'
              }`}
            >
              {saving ? 'Savingâ€¦' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
