import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { equipmentService, EQUIPMENT_CATEGORIES } from '../../services/equipmentService';
import { useEquipment } from '../../hooks/useEquipment';
import type { EquipmentDocument } from '../../types';

// ─── Step indicators ─────────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  const steps = ['Qualification', 'Verification', 'Registration'];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((label, i) => {
        const num = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                  done
                    ? 'bg-green-500 border-green-500 text-white'
                    : active
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}
              >
                {done ? '✓' : num}
              </div>
              <span className={`text-xs mt-1 font-medium ${active ? 'text-primary-700' : done ? 'text-green-600' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-4 ${done ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Step 1 — Qualification ──────────────────────────────────────────────────

interface QualState {
  affectsValidity: boolean | null;
  requiresTraceability: boolean | null;
  isExternal: boolean | null;
}

function Step1Qualification({
  onNext,
}: {
  onNext: (qual: QualState) => void;
}) {
  const [state, setState] = useState<QualState>({
    affectsValidity: null,
    requiresTraceability: null,
    isExternal: null,
  });

  const canProceed =
    state.affectsValidity !== null &&
    state.requiresTraceability !== null &&
    state.isExternal !== null;

  const excluded = state.affectsValidity === false && state.requiresTraceability === false;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Step 1 / 3 — Equipment Qualification</h2>
        <p className="text-sm text-gray-500 mt-1">§3.1 — Determine whether this equipment requires entry into the quality system.</p>
      </div>

      <QualQuestion
        label="Does the accuracy or uncertainty of this instrument affect test result validity?"
        value={state.affectsValidity}
        onChange={(v) => setState((s) => ({ ...s, affectsValidity: v }))}
      />

      <QualQuestion
        label="Does this instrument require metrological traceability (calibration)?"
        value={state.requiresTraceability}
        onChange={(v) => setState((s) => ({ ...s, requiresTraceability: v }))}
      />

      <QualQuestion
        label="Is this an external/rental instrument?"
        value={state.isExternal}
        onChange={(v) => setState((s) => ({ ...s, isExternal: v }))}
      />

      {excluded && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <strong>Not eligible for quality system.</strong> This instrument does not affect test validity and does not require traceability. It will be excluded from the quality system. Only instruments that require calibration-controlled records should be registered here.
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={() => onNext(state)}
          disabled={!canProceed || excluded}
          className="px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next: Verification →
        </button>
      </div>
    </div>
  );
}

function QualQuestion({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <p className="text-sm font-medium text-gray-800 mb-3">{label}</p>
      <div className="flex gap-4">
        {[true, false].map((v) => (
          <label key={String(v)} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={value === v}
              onChange={() => onChange(v)}
              className="text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">{v ? 'Yes' : 'No'}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2 — Verification ───────────────────────────────────────────────────

interface VerifState {
  verificationResult: 'pass' | 'fail' | '';
  externalProvider: string;
  verificationFile: File | null;
  certFile: File | null;
}

function Step2Verification({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: (v: VerifState) => void;
}) {
  const [state, setState] = useState<VerifState>({
    verificationResult: '',
    externalProvider: '',
    verificationFile: null,
    certFile: null,
  });

  const canProceed = state.verificationResult === 'pass' && state.verificationFile !== null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Step 2 / 3 — Verification</h2>
        <p className="text-sm text-gray-500 mt-1">§3.2 — Upload completed verification form and calibration certificate.</p>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            LAB-FM-QP-05-001 Verification Form <span className="text-red-500">*</span>
          </label>
          <FileInput
            accept=".xlsx,.xls"
            value={state.verificationFile}
            onChange={(f) => setState((s) => ({ ...s, verificationFile: f }))}
            placeholder="Upload completed verification form (.xlsx)"
          />
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Calibration Certificate (if available)
          </label>
          <FileInput
            accept=".pdf"
            value={state.certFile}
            onChange={(f) => setState((s) => ({ ...s, certFile: f }))}
            placeholder="Upload calibration certificate (.pdf)"
          />
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Verification Result <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-4">
            {(['pass', 'fail'] as const).map((v) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={state.verificationResult === v}
                  onChange={() => setState((s) => ({ ...s, verificationResult: v }))}
                  className="text-primary-600"
                />
                <span className={`text-sm font-medium ${v === 'pass' ? 'text-green-700' : 'text-red-700'}`}>
                  {v === 'pass' ? 'Pass' : 'Fail'}
                </span>
              </label>
            ))}
          </div>
          {state.verificationResult === 'fail' && (
            <p className="mt-2 text-sm text-red-600">
              Failed verification — this equipment cannot be registered into the quality system.
            </p>
          )}
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            External Provider (if applicable)
          </label>
          <input
            type="text"
            value={state.externalProvider}
            onChange={(e) => setState((s) => ({ ...s, externalProvider: e.target.value }))}
            placeholder="e.g. National Institute of Metrology"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {canProceed && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          Verification complete. Your registration will be submitted for manager approval. Step 3 (Registration Detail) will unlock once a manager approves.
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
        >
          ← Back
        </button>
        <button
          onClick={() => onNext(state)}
          disabled={!canProceed}
          className="px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next: Registration →
        </button>
      </div>
    </div>
  );
}

// ─── Step 3 — Registration Detail (= LAB-FM-QP-05-003) ──────────────────────

interface RegState {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  location: string;
  custodian: string;
  custodianName: string;
  authorizedUsers: string;
  requiresCalibration: boolean;
  calibrationInterval: string;
  calibrationProcedure: string;
  externalProvider: boolean;
  usagePeriodStart: string;
  usagePeriodEnd: string;
  registrationDate: string;
  notes: string;
  specFile: File | null;
  requestFile: File | null;
}

function Step3Registration({
  isExternal,
  requiresCalibration,
  onBack,
  onSubmit,
  submitting,
}: {
  isExternal: boolean;
  requiresCalibration: boolean;
  onBack: () => void;
  onSubmit: (reg: RegState) => void;
  submitting: boolean;
}) {
  const { currentUser } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  const [state, setState] = useState<RegState>({
    id: '',
    name: '',
    category: isExternal ? 'EXP' : '',
    manufacturer: '',
    model: '',
    serialNumber: '',
    location: '',
    custodian: currentUser?.email || '',
    custodianName: `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim(),
    authorizedUsers: currentUser?.email || '',
    requiresCalibration,
    calibrationInterval: '12',
    calibrationProcedure: '',
    externalProvider: isExternal,
    usagePeriodStart: '',
    usagePeriodEnd: '',
    registrationDate: today,
    notes: '',
    specFile: null,
    requestFile: null,
  });

  const [idSuggesting, setIdSuggesting] = useState(false);
  const [idError, setIdError] = useState('');
  const set = (key: keyof RegState, value: unknown) =>
    setState((s) => ({ ...s, [key]: value }));

  async function suggestId() {
    if (!state.category) return;
    setIdSuggesting(true);
    try {
      const suggested = await equipmentService.suggestEquipmentId(state.category);
      set('id', suggested);
      setIdError('');
    } finally {
      setIdSuggesting(false);
    }
  }

  function validateId(val: string) {
    if (!val) { setIdError('Required'); return; }
    if (!equipmentService.validateEquipmentId(val)) {
      setIdError('Must match format CAL-AAA-NNN (e.g. CAL-FRC-001)');
    } else {
      setIdError('');
    }
  }

  const canSubmit =
    state.id &&
    !idError &&
    state.name &&
    state.category &&
    state.manufacturer &&
    state.model &&
    state.serialNumber &&
    state.location &&
    state.custodian &&
    state.authorizedUsers &&
    state.registrationDate;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Step 3 / 3 — Registration Detail</h2>
        <p className="text-sm text-gray-500 mt-1">This form creates the LAB-FM-QP-05-003 equipment registry record.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Equipment ID */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Equipment ID <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={state.id}
              onChange={(e) => { set('id', e.target.value.toUpperCase()); validateId(e.target.value.toUpperCase()); }}
              placeholder="CAL-FRC-001"
              className={`flex-1 border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 ${idError ? 'border-red-400' : 'border-gray-300'}`}
            />
            <button
              type="button"
              onClick={suggestId}
              disabled={!state.category || idSuggesting}
              className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
            >
              {idSuggesting ? '…' : 'Suggest ID'}
            </button>
          </div>
          {idError && <p className="text-xs text-red-500 mt-1">{idError}</p>}
          <p className="text-xs text-gray-400 mt-1">Format: CAL-[TYPE]-[SEQ] — select a Category first, then click Suggest ID.</p>
        </div>

        {/* Name */}
        <Field label="Equipment Name" required>
          <input
            type="text"
            value={state.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Load Cell 1 kN"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </Field>

        {/* Category */}
        <Field label="Category Code" required>
          <select
            value={state.category}
            onChange={(e) => { set('category', e.target.value); set('id', ''); setIdError(''); }}
            disabled={isExternal}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
          >
            <option value="">Select category…</option>
            {EQUIPMENT_CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
            ))}
          </select>
        </Field>

        {/* Manufacturer */}
        <Field label="Manufacturer" required>
          <input
            type="text"
            value={state.manufacturer}
            onChange={(e) => set('manufacturer', e.target.value)}
            placeholder="e.g. HBM, Fluke, Mettler Toledo"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </Field>

        {/* Model */}
        <Field label="Model / Part Number" required>
          <input
            type="text"
            value={state.model}
            onChange={(e) => set('model', e.target.value)}
            placeholder="e.g. U2A"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </Field>

        {/* Serial Number */}
        <Field label="Serial Number" required>
          <input
            type="text"
            value={state.serialNumber}
            onChange={(e) => set('serialNumber', e.target.value)}
            placeholder="e.g. SN-12345"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </Field>

        {/* Location */}
        <Field label="Location" required>
          <input
            type="text"
            value={state.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="e.g. Lab Room A"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </Field>

        {/* Custodian */}
        <Field label="Custodian (email)" required>
          <input
            type="email"
            value={state.custodian}
            onChange={(e) => set('custodian', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </Field>

        {/* Custodian Name */}
        <Field label="Custodian Name">
          <input
            type="text"
            value={state.custodianName}
            onChange={(e) => set('custodianName', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </Field>

        {/* Authorized Users */}
        <div className="md:col-span-2">
          <Field label="Authorised Users (comma-separated emails)" required>
            <input
              type="text"
              value={state.authorizedUsers}
              onChange={(e) => set('authorizedUsers', e.target.value)}
              placeholder="user1@scs.co.th, user2@scs.co.th"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-400 mt-1">Min. 1 user. These names appear on the status label (LAB-FM-QP-05-004).</p>
          </Field>
        </div>

        {/* Requires Calibration */}
        <div className="md:col-span-2 bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Requires Calibration</span>
            <button
              type="button"
              onClick={() => set('requiresCalibration', !state.requiresCalibration)}
              disabled={true}
              className={`relative inline-flex h-6 w-11 rounded-full transition-colors cursor-not-allowed ${state.requiresCalibration ? 'bg-primary-600' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow mt-1 transition-transform ${state.requiresCalibration ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-gray-500">(set in Step 1)</span>
          </div>
        </div>

        {/* Calibration fields */}
        {state.requiresCalibration && (
          <>
            <Field label="Calibration Interval (months)" required>
              <input
                type="number"
                min={1}
                max={120}
                value={state.calibrationInterval}
                onChange={(e) => set('calibrationInterval', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </Field>
            <Field label="Calibration Procedure Ref.">
              <input
                type="text"
                value={state.calibrationProcedure}
                onChange={(e) => set('calibrationProcedure', e.target.value)}
                placeholder="e.g. CP-FRC-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </Field>
          </>
        )}

        {/* External Provider */}
        {isExternal && (
          <>
            <Field label="Usage Period Start" required>
              <input
                type="date"
                value={state.usagePeriodStart}
                onChange={(e) => set('usagePeriodStart', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </Field>
            <Field label="Usage Period End" required>
              <input
                type="date"
                value={state.usagePeriodEnd}
                min={state.usagePeriodStart}
                onChange={(e) => set('usagePeriodEnd', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </Field>
          </>
        )}

        {/* Registration Date */}
        <Field label="Registration Date" required>
          <input
            type="date"
            value={state.registrationDate}
            onChange={(e) => set('registrationDate', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </Field>

        {/* Notes */}
        <div className="md:col-span-2">
          <Field label="Notes">
            <textarea
              value={state.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="Handling instructions, remarks…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </Field>
        </div>

        {/* Spec sheet */}
        <div className="md:col-span-2">
          <Field label="Manufacturer Spec Sheet (.pdf, .xlsx, .png)">
            <FileInput
              accept=".pdf,.xlsx,.xls,.png"
              value={state.specFile}
              onChange={(f) => set('specFile', f)}
              placeholder="Upload spec sheet (optional)"
            />
          </Field>
        </div>

        {/* LAB-FM-QP-05-002 */}
        <div className="md:col-span-2">
          <Field label="LAB-FM-QP-05-002 Registration Request Form (.xlsx)">
            <FileInput
              accept=".xlsx,.xls"
              value={state.requestFile}
              onChange={(f) => set('requestFile', f)}
              placeholder="Upload registration request form (optional)"
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
        >
          ← Back
        </button>
        <button
          onClick={() => onSubmit(state)}
          disabled={!canSubmit || submitting}
          className="px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : 'Submit Registration'}
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function FileInput({
  accept,
  value,
  onChange,
  placeholder,
}: {
  accept: string;
  value: File | null;
  onChange: (f: File | null) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex-1 flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-50 text-sm text-gray-500">
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
        />
        {value ? (
          <span className="text-gray-800 font-medium truncate">{value.name}</span>
        ) : (
          <span>{placeholder}</span>
        )}
      </label>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="text-gray-400 hover:text-red-500 text-lg leading-none">
          ×
        </button>
      )}
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export const RegistrationWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const { createEquipment } = useEquipment();

  const [step, setStep] = useState(1);
  const [qual, setQual] = useState<QualState>({ affectsValidity: null, requiresTraceability: null, isExternal: null });
  const [verif, setVerif] = useState<VerifState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(reg: RegState) {
    if (!currentUser) return;
    setSubmitting(true);
    try {
      const authorizedUsers = reg.authorizedUsers
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);

      const equipmentId = await createEquipment({
        id: reg.id,
        name: reg.name,
        category: reg.category,
        manufacturer: reg.manufacturer,
        model: reg.model,
        serialNumber: reg.serialNumber,
        location: reg.location,
        custodian: reg.custodian,
        custodianName: reg.custodianName,
        authorizedUsers,
        requiresCalibration: reg.requiresCalibration,
        calibrationInterval: reg.calibrationInterval ? parseInt(reg.calibrationInterval) : undefined,
        calibrationProcedure: reg.calibrationProcedure,
        externalProvider: reg.externalProvider,
        usagePeriodStart: reg.usagePeriodStart || undefined,
        usagePeriodEnd: reg.usagePeriodEnd || undefined,
        registrationDate: reg.registrationDate,
        notes: reg.notes,
        createdBy: currentUser.email,
      });

      // Upload attachments
      const uploadQueue: Array<{ file: File; docType: EquipmentDocument['docType'] }> = [];
      if (verif?.verificationFile) uploadQueue.push({ file: verif.verificationFile, docType: 'verification' });
      if (verif?.certFile) uploadQueue.push({ file: verif.certFile, docType: 'certificate' });
      if (reg.specFile) uploadQueue.push({ file: reg.specFile, docType: 'spec_sheet' });
      if (reg.requestFile) uploadQueue.push({ file: reg.requestFile, docType: 'registration' });

      for (const item of uploadQueue) {
        try {
          await equipmentService.uploadDocument(equipmentId, item.docType, item.file, currentUser.email);
        } catch (e) {
          console.error('File upload failed (non-critical):', e);
        }
      }

      success(`Equipment ${equipmentId} submitted. Awaiting manager approval.`);
      navigate('/equipment');
    } catch (err: unknown) {
      showError((err as Error).message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/equipment')} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Equipment
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Register New Equipment</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <StepBar current={step} />

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {step === 1 && (
            <Step1Qualification
              onNext={(q) => { setQual(q); setStep(2); }}
            />
          )}
          {step === 2 && (
            <Step2Verification
              onBack={() => setStep(1)}
              onNext={(v) => { setVerif(v); setStep(3); }}
            />
          )}
          {step === 3 && (
            <Step3Registration
              isExternal={qual.isExternal === true}
              requiresCalibration={qual.requiresTraceability === true || qual.affectsValidity === true}
              onBack={() => setStep(2)}
              onSubmit={handleSubmit}
              submitting={submitting}
            />
          )}
        </div>
      </div>
    </div>
  );
};
