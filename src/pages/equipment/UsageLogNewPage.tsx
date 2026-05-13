import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useEquipmentDetail } from '../../hooks/useEquipment';

interface FormState {
  date: string;
  // Section B
  visualInspection: 'pass' | 'fail' | '';
  functionalCheck: 'pass' | 'fail' | '';
  documentCheck: 'valid' | 'expired' | 'na' | '';
  refValuesVerified: boolean;
  correctionValue: string;
  // Section C
  equipmentCondition: 'normal' | 'abnormal' | '';
  abnormalDetails: string;
  actionTaken: string;
  // Section D
  notes: string;
}

type RadioOption<T extends string> = { value: T; label: string; color?: string };

function RadioGroup<T extends string>({
  label,
  required,
  options,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  options: RadioOption<T>[];
  value: T | '';
  onChange: (v: T) => void;
}) {
  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
      <p className="text-sm font-medium text-gray-800 mb-3">
        {label} {required && <span className="text-red-500">*</span>}
      </p>
      <div className="flex flex-wrap gap-4">
        {options.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="text-primary-600"
            />
            <span className={`text-sm font-medium ${opt.color || 'text-gray-700'}`}>
              {opt.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export const UsageLogNewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const { equipment, addUsageLog } = useEquipmentDetail(id);

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState<FormState>({
    date: today,
    visualInspection: '',
    functionalCheck: '',
    documentCheck: '',
    refValuesVerified: false,
    correctionValue: '',
    equipmentCondition: '',
    abnormalDetails: '',
    actionTaken: '',
    notes: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  // Auto-set documentCheck based on nextCalibrationDate
  useEffect(() => {
    if (!equipment) return;
    if (!equipment.requiresCalibration) {
      setForm((f) => ({ ...f, documentCheck: 'na' }));
    } else if (equipment.nextCalibrationDate) {
      const due = new Date(equipment.nextCalibrationDate);
      const today = new Date();
      setForm((f) => ({ ...f, documentCheck: due < today ? 'expired' : 'valid' }));
    }
  }, [equipment]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const hasFailure =
    form.visualInspection === 'fail' ||
    form.functionalCheck === 'fail' ||
    form.documentCheck === 'expired' ||
    form.equipmentCondition === 'abnormal';

  const overallResult: 'pass' | 'fail' = hasFailure ? 'fail' : 'pass';

  const canSubmit =
    form.visualInspection !== '' &&
    form.functionalCheck !== '' &&
    form.documentCheck !== '' &&
    form.equipmentCondition !== '' &&
    (!form.equipmentCondition || form.equipmentCondition !== 'abnormal' || form.abnormalDetails);

  async function handleSubmitConfirmed() {
    if (!id || !currentUser || !equipment) return;
    setSubmitting(true);
    setShowWarning(false);
    try {
      await addUsageLog({
        equipmentId: id,
        date: form.date,
        operator: currentUser.email,
        operatorName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.email,
        visualInspection: form.visualInspection as 'pass' | 'fail',
        functionalCheck: form.functionalCheck as 'pass' | 'fail',
        documentCheck: form.documentCheck as 'valid' | 'expired' | 'na',
        refValuesVerified: form.refValuesVerified || undefined,
        correctionValue: form.correctionValue || undefined,
        equipmentCondition: form.equipmentCondition as 'normal' | 'abnormal',
        abnormalDetails: form.abnormalDetails || undefined,
        actionTaken: form.actionTaken || undefined,
        notes: form.notes || undefined,
        overallResult,
      });
      success(
        overallResult === 'pass'
          ? 'Usage log recorded — PASS'
          : 'Usage log recorded — FAIL. Equipment status updated to Out of Service.'
      );
      navigate(`/equipment/${id}`);
    } catch (err: unknown) {
      showError((err as Error).message || 'Failed to save usage log');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit() {
    if (hasFailure) {
      setShowWarning(true);
    } else {
      handleSubmitConfirmed();
    }
  }

  if (!equipment) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/equipment/${id}`)} className="text-gray-400 hover:text-gray-600 text-sm">
            ← {id}
          </button>
          <span className="text-gray-300">/</span>
          <div>
            <h1 className="text-xl font-bold text-gray-900">New Usage Log</h1>
            <p className="text-sm text-gray-500 mt-0.5">LAB-FM-QP-05-005 — Pre-use Check</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Section A — Session Information */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">A — Session Information</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-0.5">Equipment ID</p>
                <p className="text-sm font-mono font-medium text-gray-900">{equipment.id}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-0.5">Operator</p>
                <p className="text-sm text-gray-900">{currentUser?.email}</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-0.5">Equipment Name</p>
              <p className="text-sm text-gray-900">{equipment.name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date of Use <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.date}
                max={today}
                onChange={(e) => set('date', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </section>

        {/* Section B — Pre-use Checks */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">B — Pre-use Checks (§3.4.2)</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <RadioGroup
              label="1. Visual Inspection — Physical condition check (no cracks, damage, or contamination)"
              required
              options={[
                { value: 'pass', label: 'Pass', color: 'text-green-700' },
                { value: 'fail', label: 'Fail', color: 'text-red-700' },
              ]}
              value={form.visualInspection}
              onChange={(v) => set('visualInspection', v)}
            />

            <RadioGroup
              label="2. Functional & Stability Check — Measurement function and reading stability within expected range"
              required
              options={[
                { value: 'pass', label: 'Pass', color: 'text-green-700' },
                { value: 'fail', label: 'Fail', color: 'text-red-700' },
              ]}
              value={form.functionalCheck}
              onChange={(v) => set('functionalCheck', v)}
            />

            <RadioGroup
              label="3. Calibration Documentation Check — Calibration certificate current status"
              required
              options={[
                { value: 'valid', label: 'Valid', color: 'text-green-700' },
                { value: 'expired', label: 'Expired', color: 'text-red-700' },
                { value: 'na', label: 'N/A', color: 'text-gray-500' },
              ]}
              value={form.documentCheck}
              onChange={(v) => set('documentCheck', v)}
            />

            {equipment.calibrationProcedure && (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.refValuesVerified}
                    onChange={(e) => set('refValuesVerified', e.target.checked)}
                    className="mt-0.5 text-primary-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">4. Reference / Correction Values Verified</p>
                    <p className="text-xs text-gray-500 mt-0.5">Correction values confirmed current and up-to-date per {equipment.calibrationProcedure}</p>
                  </div>
                </label>
                {form.refValuesVerified && (
                  <div className="mt-3">
                    <input
                      type="text"
                      value={form.correctionValue}
                      onChange={(e) => set('correctionValue', e.target.value)}
                      placeholder="Note correction value applied (e.g. +0.05 N)"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Section C — Equipment Condition */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">C — Equipment Condition</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <RadioGroup
              label="Overall Equipment Condition after completing checks above"
              required
              options={[
                { value: 'normal', label: 'Normal', color: 'text-green-700' },
                { value: 'abnormal', label: 'Abnormal', color: 'text-red-700' },
              ]}
              value={form.equipmentCondition}
              onChange={(v) => set('equipmentCondition', v)}
            />

            {form.equipmentCondition === 'abnormal' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Abnormal Details <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={form.abnormalDetails}
                    onChange={(e) => set('abnormalDetails', e.target.value)}
                    rows={3}
                    placeholder="Describe the issue (damage, overload, suspect result, …)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Action Taken <span className="text-red-500">*</span></label>
                  <select
                    value={form.actionTaken}
                    onChange={(e) => set('actionTaken', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">— Select action —</option>
                    <option value="Tagged Out of Service">Tagged Out of Service</option>
                    <option value="Repair Requested">Repair Requested</option>
                    <option value="Sent for Verification">Sent for Verification</option>
                    <option value="Other">Other (specify in notes)</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Section D — Notes & Submission */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">D — Notes & Submission</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">General Notes / Remarks</label>
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={3}
                placeholder="Any additional observations about the equipment or measurement session"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Overall result preview */}
            <div className={`rounded-lg p-3 text-center ${overallResult === 'pass' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className="text-xs text-gray-500 mb-1">Calculated Overall Result</p>
              <p className={`text-lg font-bold ${overallResult === 'pass' ? 'text-green-700' : 'text-red-700'}`}>
                {overallResult.toUpperCase()}
              </p>
              {overallResult === 'fail' && (
                <p className="text-xs text-red-600 mt-1">Equipment status will be set to Out of Service</p>
              )}
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => navigate(`/equipment/${id}`)}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving…' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-red-600 text-xl">⚠</span>
              </div>
              <h3 className="text-base font-semibold text-gray-900">Submit with Failures?</h3>
            </div>
            <p className="text-sm text-gray-600">
              One or more checks failed or the equipment condition is abnormal. Submitting will:
            </p>
            <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
              <li>Record overall result as FAIL</li>
              <li>Set equipment status to Out of Service</li>
              <li>Alert the lab manager</li>
            </ul>
            <p className="text-sm text-gray-600">Do not use this instrument until it is cleared by a manager.</p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowWarning(false)}
                className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
              >
                Go Back
              </button>
              <button
                onClick={handleSubmitConfirmed}
                disabled={submitting}
                className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-40"
              >
                {submitting ? 'Saving…' : 'Submit Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
