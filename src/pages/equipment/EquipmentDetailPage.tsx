import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEquipmentDetail } from '../../hooks/useEquipment';
import { equipmentService } from '../../services/equipmentControlService';
import { conversionEquationService } from '../../services/conversionEquationService';
import { equipmentConstantService } from '../../services/equipmentConstantService';
import { userService } from '../../services/userService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { FilePreviewModal } from '../../components/FilePreviewModal';
import { UsageLogEditModal } from '../../components/UsageLogEditModal';
import type {
  EquipmentRecord, EquipmentDocument, CalibrationEvent, EquipmentAttachment, UsageLog,
  ConversionEquation, EquationCoefficient, EquipmentConstant,
} from '../../types';
import type { User } from '../../types';

/** Map an EquipmentDocument to the shape FilePreviewModal expects. */
function toAttachment(doc: EquipmentDocument): EquipmentAttachment {
  return {
    id: doc.id,
    fileName: doc.name,
    fileType: doc.type,
    fileSize: doc.size,
    downloadURL: doc.url,
    storagePath: doc.storagePath || '',
    uploadedAt: doc.uploadedAt,
    uploadedBy: doc.uploadedBy,
  };
}

type Tab = 'overview' | 'documents' | 'usage-logs' | 'calibration' | 'history' | 'equations' | 'constants';

function formatDate(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB');
}

function formatTs(d?: Date): string {
  if (!d) return '—';
  return (
    d.toLocaleDateString('en-GB') +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</h3>
      {action}
    </div>
  );
}

function FieldRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 w-40 flex-shrink-0">{label}</span>
      <span className={`text-sm text-gray-900 text-right flex-1 ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${equipmentService.getStatusColor(status as any)}`}
    >
      {equipmentService.getStatusLabel(status as any)}
    </span>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  eq,
  onUpdate,
  isAdmin,
}: {
  eq: EquipmentRecord;
  onUpdate: (data: Partial<EquipmentRecord>) => Promise<void>;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...eq });
  // Calibration points are stored as number[] but edited as a comma-separated string
  const [calPointsRaw, setCalPointsRaw] = useState(
    eq.calibrationPoints?.join(', ') ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
  const { success, error: showError } = useToast();

  useEffect(() => {
    userService
      .getAllUsers()
      .then((users: User[]) => {
        const map = new Map<string, string>();
        users.forEach((u) => {
          const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.displayName || u.email;
          map.set(u.uid, name);
          if (u.email) map.set(u.email, name);
        });
        setUserMap(map);
      })
      .catch(console.error);
  }, []);

  const resolveName = (uid: string) => userMap.get(uid) || uid;
  const custodianDisplay = eq.custodianName || resolveName(eq.custodian);
  const authorizedDisplay = eq.authorizedUsers.map(resolveName).join(', ') || '—';

  async function handleSave() {
    // Parse calibration points — reject any non-numeric tokens
    const parsedPoints = calPointsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number);
    if (parsedPoints.some(isNaN)) {
      showError('Calibration points must be numbers only (e.g. 500, 1000, 2000).');
      return;
    }

    setSaving(true);
    try {
      await onUpdate({
        name: form.name,
        location: form.location,
        custodian: form.custodian,
        custodianName: form.custodianName,
        calibrationInterval: form.calibrationInterval,
        calibrationProcedure: form.calibrationProcedure,
        calibrationPoints: parsedPoints.length > 0 ? parsedPoints : undefined,
        calibrationUnit: form.calibrationUnit?.trim() || undefined,
        notes: form.notes,
      });
      success('Equipment updated');
      setEditing(false);
    } catch (err: unknown) {
      showError((err as Error).message || 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <SectionCard>
          <SectionHeader title="Edit Details" />
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'name', label: 'Name' },
              { key: 'location', label: 'Location' },
              { key: 'custodian', label: 'Custodian (email / UID)' },
              { key: 'custodianName', label: 'Custodian Display Name' },
              { key: 'calibrationProcedure', label: 'Calibration Procedure' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
                <input
                  type="text"
                  value={(form as any)[key] || ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            ))}
            {eq.requiresCalibration && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Calibration Interval (months)
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={form.calibrationInterval || ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, calibrationInterval: parseInt(e.target.value) || undefined }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            )}

            {/* Calibration points — numbers only */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Calibration Points
                <span className="ml-1 text-xs font-normal text-gray-400">(numbers only, comma-separated)</span>
              </label>
              <input
                type="text"
                value={calPointsRaw}
                onChange={(e) => setCalPointsRaw(e.target.value)}
                placeholder="e.g. 500, 1000, 2000, 5000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">Enter numeric values only. Unit is set in the next field.</p>
            </div>

            {/* Calibration unit — separate from point values */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Calibration Unit
                <span className="ml-1 text-xs font-normal text-gray-400">(applies to all points)</span>
              </label>
              <input
                type="text"
                value={form.calibrationUnit || ''}
                onChange={(e) => setForm((f) => ({ ...f, calibrationUnit: e.target.value }))}
                placeholder="e.g. N, kN, kg, MPa"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes</label>
              <textarea
                value={form.notes || ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 pb-5">
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Identity & Specs */}
      <SectionCard>
        <SectionHeader
          title="Identity & Specifications"
          action={
            isAdmin ? (
              <button
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-primary-600 hover:text-primary-800 transition-colors"
              >
                Edit
              </button>
            ) : undefined
          }
        />
        <div className="px-5 py-1 divide-y divide-gray-50">
          <FieldRow label="Equipment ID" value={eq.id} mono />
          <FieldRow label="Name" value={eq.name} />
          <FieldRow label="Category" value={eq.category} />
          <FieldRow label="Manufacturer" value={eq.manufacturer} />
          <FieldRow label="Model" value={eq.model} />
          <FieldRow label="Serial Number" value={eq.serialNumber} mono />
          {eq.capacity && <FieldRow label="Capacity" value={eq.capacity} />}
          {eq.usageRange && <FieldRow label="Usage Range" value={eq.usageRange} />}
        </div>
      </SectionCard>

      {/* Location & Custodian */}
      <SectionCard>
        <SectionHeader title="Location & Custodianship" />
        <div className="px-5 py-1 divide-y divide-gray-50">
          <FieldRow label="Location" value={eq.location} />
          <FieldRow label="Custodian" value={custodianDisplay} />
          <FieldRow label="Authorized Users" value={authorizedDisplay} />
          <FieldRow
            label="Registered"
            value={formatDate(eq.registrationDate)}
          />
        </div>
      </SectionCard>

      {/* Calibration */}
      <SectionCard>
        <SectionHeader title="Calibration" />
        <div className="px-5 py-1 divide-y divide-gray-50">
          <FieldRow
            label="Requires Calibration"
            value={
              eq.requiresCalibration ? (
                <span className="text-green-700 font-medium">Yes</span>
              ) : (
                <span className="text-gray-400">No</span>
              )
            }
          />
          {eq.requiresCalibration && (
            <>
              <FieldRow
                label="Interval"
                value={eq.calibrationInterval ? `${eq.calibrationInterval} months` : '—'}
              />
              <FieldRow label="Procedure" value={eq.calibrationProcedure || '—'} />
              <FieldRow
                label="External Provider"
                value={eq.externalProvider ? 'Yes' : 'No'}
              />
              <FieldRow
                label="Last Calibration"
                value={formatDate(eq.lastCalibrationDate)}
              />
              <FieldRow
                label="Next Calibration"
                value={
                  eq.nextCalibrationDate ? (
                    <span
                      className={
                        eq.status === 'overdue'
                          ? 'text-red-600 font-semibold'
                          : eq.status === 'due_soon'
                          ? 'text-amber-600 font-semibold'
                          : ''
                      }
                    >
                      {formatDate(eq.nextCalibrationDate)}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              {eq.calibrationPoints && eq.calibrationPoints.length > 0 && (
                <FieldRow
                  label="Calibration Points"
                  mono
                  value={
                    <span>
                      {eq.calibrationPoints.join(', ')}
                      {eq.calibrationUnit ? (
                        <span className="ml-1.5 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full not-mono">
                          {eq.calibrationUnit}
                        </span>
                      ) : null}
                    </span>
                  }
                />
              )}
            </>
          )}
        </div>
      </SectionCard>

      {/* Notes */}
      {eq.notes && (
        <SectionCard>
          <SectionHeader title="Notes" />
          <p className="px-5 py-4 text-sm text-gray-700 leading-relaxed">{eq.notes}</p>
        </SectionCard>
      )}
    </div>
  );
}

// ─── Documents Tab ───────────────────────────────────────────────────────────

const DOC_LABELS: Partial<Record<EquipmentDocument['docType'], string>> = {
  verification: 'LAB-FM-QP-05-001 — Verification',
  registration: 'LAB-FM-QP-05-002 — Registration Request',
  spec_sheet: 'Specification Sheet',
  certificate: 'Calibration Certificate',
  retirement: 'LAB-FM-QP-05-008 — Retirement Request',
};

const DOC_ICONS: Partial<Record<EquipmentDocument['docType'], string>> = {
  verification: '✓',
  registration: '📋',
  spec_sheet: '📄',
  certificate: '🏅',
  retirement: '🗄️',
};

function DocumentsTab({
  docs,
  onUpload,
  onDelete,
  onPreview,
  isAdmin,
  canDelete,
}: {
  docs: EquipmentDocument[];
  onUpload: (docType: EquipmentDocument['docType'], file: File) => Promise<void>;
  onDelete: (doc: EquipmentDocument) => Promise<void>;
  onPreview: (doc: EquipmentDocument) => void;
  isAdmin: boolean;
  canDelete: boolean;
}) {
  const [uploading, setUploading] = useState<EquipmentDocument['docType'] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { error: showError } = useToast();

  async function handleFile(docType: EquipmentDocument['docType'], file: File) {
    setUploading(docType);
    try {
      await onUpload(docType, file);
    } catch (err: unknown) {
      showError((err as Error).message || 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  async function handleDelete(d: EquipmentDocument) {
    if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    setDeleting(d.id);
    try {
      await onDelete(d);
    } catch (err: unknown) {
      showError((err as Error).message || 'Delete failed');
    } finally {
      setDeleting(null);
    }
  }

  const docTypes: EquipmentDocument['docType'][] = [
    'verification', 'registration', 'spec_sheet', 'certificate', 'retirement',
  ];

  return (
    <div className="space-y-3">
      {docTypes.map((docType) => {
        const typeDocs = docs.filter((d) => d.docType === docType);
        const hasFiles = typeDocs.length > 0;

        return (
          <SectionCard key={docType}>
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <span className="text-base">{DOC_ICONS[docType]}</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{DOC_LABELS[docType]}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {hasFiles ? `${typeDocs.length} file${typeDocs.length > 1 ? 's' : ''}` : 'No files uploaded'}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <label
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                    uploading === docType
                      ? 'opacity-50 cursor-default border-gray-200 text-gray-400'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  <input
                    type="file"
                    className="hidden"
                    accept={
                      docType === 'certificate' || docType === 'spec_sheet'
                        ? '.pdf,.xlsx,.png'
                        : '.xlsx,.xls,.pdf'
                    }
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(docType, f);
                    }}
                  />
                  {uploading === docType ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    '+ Upload'
                  )}
                </label>
              )}
            </div>

            {hasFiles && (
              <ul className="divide-y divide-gray-50">
                {typeDocs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 font-medium truncate">{d.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatTs(d.uploadedAt)}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button
                        onClick={() => onPreview(d)}
                        className="text-xs font-medium text-primary-600 hover:text-primary-800 transition-colors"
                      >
                        Preview
                      </button>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        Download
                      </a>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(d)}
                          disabled={deleting === d.id}
                          className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-40 transition-colors"
                        >
                          {deleting === d.id ? '…' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

// ─── Usage Logs Tab ───────────────────────────────────────────────────────────

function UsageLogsTab({
  equipmentId,
  logs,
  isAdmin,
  onEdit,
  onDelete,
  deletingId,
}: {
  equipmentId: string;
  logs: UsageLog[];
  isAdmin: boolean;
  onEdit: (log: UsageLog) => void;
  onDelete: (log: UsageLog) => void;
  deletingId: string | null;
}) {
  const recent = logs.slice(0, 5);
  const passCount = logs.filter((l) => l.overallResult === 'pass').length;
  const passRate = logs.length ? Math.round((passCount / logs.length) * 100) : null;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      {logs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <SectionCard className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-800">{logs.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total Sessions</p>
          </SectionCard>
          <SectionCard className="p-4 text-center">
            <p
              className={`text-2xl font-bold ${
                passRate !== null && passRate >= 90
                  ? 'text-green-600'
                  : passRate !== null && passRate >= 70
                  ? 'text-amber-600'
                  : 'text-red-600'
              }`}
            >
              {passRate !== null ? `${passRate}%` : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Pass Rate</p>
          </SectionCard>
          <SectionCard className="p-4 text-center">
            <p className="text-2xl font-bold text-gray-800">
              {logs.filter((l) => l.overallResult === 'fail').length}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Failed Sessions</p>
          </SectionCard>
        </div>
      )}

      {/* Recent entries */}
      <SectionCard>
        <SectionHeader
          title={`Recent Sessions (${recent.length} of ${logs.length})`}
          action={
            <Link
              to={`/equipment/${equipmentId}/usage-log/new`}
              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              + Add Log
            </Link>
          }
        />

        {recent.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-gray-400">No usage logs recorded yet.</p>
            <Link
              to={`/equipment/${equipmentId}/usage-log/new`}
              className="inline-block mt-3 text-xs font-medium text-primary-600 hover:underline"
            >
              Record first usage →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recent.map((log) => (
              <div
                key={log.id}
                className={`px-5 py-3.5 flex items-start justify-between gap-4 ${
                  log.overallResult === 'fail' ? 'bg-red-50/50' : ''
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  {/* Result pill */}
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 mt-0.5 ${
                      log.overallResult === 'pass'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {log.overallResult === 'pass' ? '✓' : '✗'} {log.overallResult.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">
                        {new Date(log.date).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </span>
                      <span className="text-xs text-gray-400">by {log.operatorName || log.operator}</span>
                      {log.linkedJobRef && (
                        <span className="text-xs font-mono text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">
                          {log.linkedJobRef}
                        </span>
                      )}
                    </div>
                    {log.overallResult === 'fail' && (
                      <p className="text-xs text-red-600 mt-1">
                        {log.equipmentCondition === 'abnormal' && log.abnormalDetails
                          ? `Abnormal: ${log.abnormalDetails}`
                          : 'One or more checks failed'}
                        {log.actionTaken ? ` · ${log.actionTaken}` : ''}
                      </p>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() => onEdit(log)}
                      className="text-xs font-medium text-primary-600 hover:text-primary-800 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(log)}
                      disabled={deletingId === log.id}
                      className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-40 transition-colors"
                    >
                      {deletingId === log.id ? '…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {logs.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">{logs.length} total sessions</span>
            <Link
              to={`/equipment/${equipmentId}/usage-log`}
              className="text-xs font-medium text-primary-600 hover:text-primary-800 transition-colors"
            >
              View full history →
            </Link>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Calibration Tab ─────────────────────────────────────────────────────────

function CalibrationTab({
  events,
  equipmentId,
  onAdd,
  isAdmin,
}: {
  events: CalibrationEvent[];
  equipmentId: string;
  onAdd: (event: Omit<CalibrationEvent, 'id' | 'createdAt'>) => Promise<string>;
  isAdmin: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    sentDate: '',
    calibrationDate: '',
    receivedDate: '',
    calibrationLab: '',
    certificateNumber: '',
    result: '' as 'pass' | 'fail' | '',
    conditionBeforeSend: '',
    conditionAfterReceive: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();

  async function handleSave() {
    if (!form.sentDate || !form.calibrationLab) return;
    setSaving(true);
    try {
      await onAdd({
        equipmentId,
        sentDate: form.sentDate,
        calibrationDate: form.calibrationDate || undefined,
        receivedDate: form.receivedDate || undefined,
        calibrationLab: form.calibrationLab,
        certificateNumber: form.certificateNumber || undefined,
        result: (form.result as 'pass' | 'fail') || undefined,
        conditionBeforeSend: form.conditionBeforeSend || undefined,
        conditionAfterReceive: form.conditionAfterReceive || undefined,
        notes: form.notes || undefined,
        createdBy: currentUser?.email || '',
      });
      success('Calibration event recorded');
      setAdding(false);
      setForm({
        sentDate: '', calibrationDate: '', receivedDate: '', calibrationLab: '', certificateNumber: '',
        result: '', conditionBeforeSend: '', conditionAfterReceive: '', notes: '',
      });
    } catch (err: unknown) {
      showError((err as Error).message || 'Failed to record calibration');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Record form */}
      {isAdmin && !adding && (
        <div className="flex justify-end">
          <button
            onClick={() => setAdding(true)}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
          >
            + Record Calibration
          </button>
        </div>
      )}

      {adding && (
        <SectionCard>
          <SectionHeader title="New Calibration Event" />
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Sent Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.sentDate}
                onChange={(e) => setForm((f) => ({ ...f, sentDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Calibration Date
                <span className="ml-1 text-xs font-normal text-gray-400">(used to compute next due)</span>
              </label>
              <input
                type="date"
                value={form.calibrationDate}
                onChange={(e) => setForm((f) => ({ ...f, calibrationDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Received Date</label>
              <input
                type="date"
                value={form.receivedDate}
                onChange={(e) => setForm((f) => ({ ...f, receivedDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Calibration Lab <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.calibrationLab}
                onChange={(e) => setForm((f) => ({ ...f, calibrationLab: e.target.value }))}
                placeholder="Lab name or provider…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Certificate Number</label>
              <input
                type="text"
                value={form.certificateNumber}
                onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))}
                placeholder="e.g. CERT-2025-0042"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Result</label>
              <select
                value={form.result}
                onChange={(e) => setForm((f) => ({ ...f, result: e.target.value as any }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">— Select result —</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Condition Before Send</label>
              <input
                type="text"
                value={form.conditionBeforeSend}
                onChange={(e) => setForm((f) => ({ ...f, conditionBeforeSend: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Condition After Receive</label>
              <input
                type="text"
                value={form.conditionAfterReceive}
                onChange={(e) => setForm((f) => ({ ...f, conditionAfterReceive: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end px-5 pb-5">
            <button
              onClick={() => setAdding(false)}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.sentDate || !form.calibrationLab || saving}
              className="px-5 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Event'}
            </button>
          </div>
        </SectionCard>
      )}

      {/* Events list */}
      <SectionCard>
        <SectionHeader title={`Calibration History (${events.length})`} />
        {events.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No calibration events recorded.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {events.map((ev, idx) => (
              <div key={ev.id} className="px-5 py-4 flex gap-4 items-start">
                {/* Timeline dot */}
                <div className="flex flex-col items-center flex-shrink-0 mt-1">
                  <div
                    className={`w-2.5 h-2.5 rounded-full border-2 ${
                      ev.result === 'pass'
                        ? 'border-green-500 bg-green-100'
                        : ev.result === 'fail'
                        ? 'border-red-500 bg-red-100'
                        : 'border-gray-300 bg-gray-100'
                    }`}
                  />
                  {idx < events.length - 1 && (
                    <div className="w-px flex-1 bg-gray-100 mt-1 min-h-[20px]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">{ev.calibrationLab}</span>
                    <div className="flex items-center gap-2">
                      {ev.result && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            ev.result === 'pass'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {ev.result.toUpperCase()}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{formatTs(ev.createdAt)}</span>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span>Sent: {formatDate(ev.sentDate)}</span>
                    {ev.receivedDate && <span>Received: {formatDate(ev.receivedDate)}</span>}
                    {ev.certificateNumber && (
                      <span className="font-mono text-gray-700">Cert: {ev.certificateNumber}</span>
                    )}
                  </div>
                  {ev.notes && (
                    <p className="text-xs text-gray-500 mt-1.5 italic">{ev.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ equipment }: { equipment: EquipmentRecord }) {
  const events = [
    { ts: equipment.updatedAt, label: 'Last updated', detail: `Status: ${equipmentService.getStatusLabel(equipment.status as any)}` },
    { ts: equipment.createdAt, label: 'Equipment registered', detail: `by ${equipment.createdBy}` },
  ].filter((e) => e.ts);

  return (
    <SectionCard>
      <SectionHeader title="Audit Trail" />
      <div className="divide-y divide-gray-50">
        {events.map((ev, idx) => (
          <div key={idx} className="px-5 py-3.5 flex gap-4 items-start">
            <div className="flex flex-col items-center flex-shrink-0 mt-1">
              <div className="w-2 h-2 rounded-full bg-primary-400" />
              {idx < events.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1 min-h-[16px]" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">{ev.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{ev.detail}</p>
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
              {formatTs(ev.ts)}
            </span>
          </div>
        ))}
      </div>
      <div className="px-5 py-3 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          Full audit trail tracking — status changes, approvals, and document uploads.
        </p>
      </div>
    </SectionCard>
  );
}

// ─── Conversion Equation Tab ──────────────────────────────────────────────────

const DEGREE_LABELS = ['', 'A', 'B', 'C', 'D', 'E', 'F'];
const DEGREE_OPTIONS = [
  { value: 1, label: '1st degree  (linear)' },
  { value: 2, label: '2nd degree  (quadratic)' },
  { value: 3, label: '3rd degree  (cubic)' },
  { value: 4, label: '4th degree' },
  { value: 5, label: '5th degree' },
];

/** Renders the human-readable equation preview string */
function buildEquationPreview(degree: number, inputUnit: string, outputUnit: string, divisor: string): string {
  const inp = inputUnit || 'input';
  const out = outputUnit || 'output';
  const div = divisor && divisor !== '1' ? `/ ${divisor}` : '';
  const superscripts: Record<number, string> = { 2: '²', 3: '³', 4: '⁴', 5: '⁵' };

  const terms = Array.from({ length: degree + 1 }, (_, i) => {
    const label = DEGREE_LABELS[i + 1]; // A, B, C …
    const power = degree - i;
    if (power === 0) return `${label}`;
    if (power === 1) return `${label}·[${inp}]`;
    return `${label}·[${inp}]${superscripts[power] ?? `^${power}`}`;
  });

  const numerator = terms.join(' + ');
  return div
    ? `[${out}] = (${numerator}) ${div}`
    : `[${out}] = ${numerator}`;
}

/** Parse a string (decimal or scientific) to a number safely */
function parseCoeffValue(raw: string): number {
  const n = Number(raw.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/** Make a fresh set of zero-initialised coefficients for a given degree */
function makeCoefficients(degree: number): EquationCoefficient[] {
  return Array.from({ length: degree + 1 }, () => ({
    value: 0,
    inputMode: 'decimal' as const,
    raw: '0',
  }));
}

// ── Trial calculator panel (inline, per-equation) ───────────────────────────

/** Format a result number — show scientific notation for very large/small values */
function formatResult(n: number): string {
  if (!isFinite(n)) return 'Error';
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e9 || abs < 1e-4)) {
    return n.toExponential(6);
  }
  // strip unnecessary trailing zeros up to 8 decimal places
  return parseFloat(n.toFixed(8)).toString();
}

function TrialPanel({ eq }: { eq: ConversionEquation }) {
  const [inputRaw, setInputRaw] = useState('');

  const inputNum = inputRaw.trim() === '' ? null : Number(inputRaw.replace(/,/g, ''));
  const isValidInput = inputRaw.trim() !== '' && inputNum !== null && isFinite(inputNum!);
  const result = isValidInput ? conversionEquationService.evaluate(eq, inputNum!) : null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Trial Calculator
      </p>
      <div className="flex items-stretch gap-3 flex-wrap">
        {/* Input */}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] text-gray-400 mb-1">Input value</label>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-200 transition-all bg-white">
            <input
              type="text"
              value={inputRaw}
              onChange={(e) => setInputRaw(e.target.value)}
              placeholder="0.00"
              className="flex-1 px-3 py-2 text-sm font-mono bg-transparent outline-none min-w-0"
            />
            <span className="px-2.5 py-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 whitespace-nowrap font-medium">
              {eq.inputUnit || '—'}
            </span>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-end pb-2 text-gray-300">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </div>

        {/* Output */}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[10px] text-gray-400 mb-1">Output value</label>
          <div className={`flex items-center rounded-lg border overflow-hidden transition-all ${
            result !== null
              ? 'border-primary-300 bg-primary-50'
              : 'border-gray-200 bg-gray-50'
          }`}>
            <span className={`flex-1 px-3 py-2 text-sm font-mono font-semibold min-w-0 truncate ${
              result !== null ? 'text-primary-800' : 'text-gray-300'
            }`}>
              {result !== null
                ? formatResult(result)
                : inputRaw.trim() !== '' && !isValidInput
                  ? <span className="text-red-400 font-normal text-xs">Invalid number</span>
                  : '—'}
            </span>
            <span className={`px-2.5 py-2 text-xs border-l whitespace-nowrap font-medium ${
              result !== null
                ? 'text-primary-600 bg-primary-100 border-primary-200'
                : 'text-gray-400 bg-gray-100 border-gray-200'
            }`}>
              {eq.outputUnit || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Step breakdown — shown only when a valid result exists */}
      {result !== null && (
        <div className="mt-2.5 bg-gray-50 rounded-lg px-3.5 py-2.5 border border-gray-100">
          <p className="text-[10px] text-gray-400 mb-1 font-medium">Calculation breakdown</p>
          <div className="space-y-0.5">
            {eq.coefficients.map((c, idx) => {
              const power = eq.degree - idx;
              const label = DEGREE_LABELS[idx + 1];
              const term = c.value * Math.pow(inputNum!, power);
              const superscripts: Record<number, string> = { 2: '²', 3: '³', 4: '⁴', 5: '⁵' };
              const termStr = power === 0
                ? label
                : power === 1
                ? `${label}·${inputNum}`
                : `${label}·${inputNum}${superscripts[power] ?? `^${power}`}`;
              return (
                <p key={idx} className="font-mono text-[10px] text-gray-500">
                  {termStr} = {c.raw} × {power === 0 ? 1 : parseFloat((Math.pow(inputNum!, power)).toFixed(8))} = <span className="text-gray-700">{formatResult(term)}</span>
                </p>
              );
            })}
            {eq.divisor !== 1 && (
              <p className="font-mono text-[10px] text-gray-500 border-t border-gray-200 mt-1 pt-1">
                Numerator sum ÷ {eq.divisor} = <span className="text-primary-700 font-semibold">{formatResult(result)} {eq.outputUnit}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Equation config modal ────────────────────────────────────────────────────

interface EquationModalProps {
  equipmentId: string;
  editing: ConversionEquation | null;
  onSave: (eq: ConversionEquation) => void;
  onClose: () => void;
  currentUser: string;
}

function EquationConfigModal({ equipmentId, editing, onSave, onClose, currentUser }: EquationModalProps) {
  const { success } = useToast();
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState(editing?.name ?? '');
  const [inputUnit, setInputUnit] = useState(editing?.inputUnit ?? '');
  const [outputUnit, setOutputUnit] = useState(editing?.outputUnit ?? '');
  const [degree, setDegree] = useState(editing?.degree ?? 2);
  const [divisorRaw, setDivisorRaw] = useState(String(editing?.divisor ?? 1));
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [coefficients, setCoefficients] = useState<EquationCoefficient[]>(
    editing?.coefficients ?? makeCoefficients(2)
  );
  const [uCalRaw, setUCalRaw] = useState(editing?.uCal !== undefined ? String(editing.uCal) : '');
  const [uARaw, setUARaw] = useState(editing?.uA !== undefined ? String(editing.uA) : '');
  const [uBRaw, setUBRaw] = useState(editing?.uB !== undefined ? String(editing.uB) : '');
  const [uCRaw, setUCRaw] = useState(editing?.uC !== undefined ? String(editing.uC) : '');

  function setError(msg: string) {
    setInlineError(msg);
    // auto-clear after 6 s
    setTimeout(() => setInlineError(null), 6000);
  }

  // Re-initialise coefficients when degree changes, preserving existing values
  function handleDegreeChange(newDegree: number) {
    setDegree(newDegree);
    setCoefficients((prev) => {
      const next = makeCoefficients(newDegree);
      prev.forEach((c, i) => { if (i < next.length) next[i] = c; });
      return next;
    });
  }

  function handleCoeffRaw(idx: number, raw: string) {
    setCoefficients((prev) =>
      prev.map((c, i) =>
        i === idx ? { ...c, raw, value: parseCoeffValue(raw) } : c
      )
    );
  }

  function handleCoeffMode(idx: number, mode: 'decimal' | 'scientific') {
    setCoefficients((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, inputMode: mode } : c))
    );
  }

  async function handleSave() {
    setInlineError(null);

    // Validation — errors shown inline inside the modal
    if (!name.trim()) { setError('Please enter an equation name.'); return; }
    if (!inputUnit.trim()) { setError('Please enter an input unit.'); return; }
    if (!outputUnit.trim()) { setError('Please enter an output unit.'); return; }
    const divisorNum = parseCoeffValue(divisorRaw);
    if (divisorNum === 0) { setError('Divisor cannot be zero.'); return; }

    const uFields: [string, string][] = [
      ['u_cal (%)', uCalRaw], ['A (%)', uARaw], ['B (%)', uBRaw], ['C (%)', uCRaw],
    ];
    for (const [label, raw] of uFields) {
      if (raw.trim() !== '' && (Number.isNaN(Number(raw)) || Number(raw) < 0)) {
        setError(`${label} must be a non-negative number.`);
        return;
      }
    }

    setSaving(true);
    try {
      // Build payload — omit notes/uncertainty fields if empty (avoid storing empty/undefined)
      const payload: Parameters<typeof conversionEquationService.add>[1] = {
        name: name.trim(),
        inputUnit: inputUnit.trim(),
        outputUnit: outputUnit.trim(),
        degree,
        coefficients,
        divisor: divisorNum,
        createdBy: currentUser,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(uCalRaw.trim() !== '' ? { uCal: Number(uCalRaw) } : {}),
        ...(uARaw.trim() !== '' ? { uA: Number(uARaw) } : {}),
        ...(uBRaw.trim() !== '' ? { uB: Number(uBRaw) } : {}),
        ...(uCRaw.trim() !== '' ? { uC: Number(uCRaw) } : {}),
      };

      let saved: ConversionEquation;
      if (editing) {
        await conversionEquationService.update(equipmentId, editing.id, payload);
        saved = { ...editing, ...payload, updatedAt: new Date() };
        success('Equation updated');
      } else {
        const newId = await conversionEquationService.add(equipmentId, payload);
        saved = { ...payload, id: newId, createdAt: new Date(), updatedAt: new Date() };
        success('Equation saved');
      }
      onSave(saved);
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to save equation';
      console.error('[EquationConfigModal] save error:', err);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const preview = buildEquationPreview(degree, inputUnit, outputUnit, divisorRaw);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {editing ? 'Edit Conversion Equation' : 'Add Conversion Equation'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Configure a polynomial to convert raw input readings</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Inline error banner — always visible inside the modal */}
        {inlineError && (
          <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-700 flex-1">{inlineError}</p>
            <button onClick={() => setInlineError(null)} className="text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Equation Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Load Cell Calibration Curve"
              className="input-field w-full"
            />
          </div>

          {/* Units */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Input Unit <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={inputUnit}
                onChange={(e) => setInputUnit(e.target.value)}
                placeholder="e.g. mV/V, kN, N"
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Output Unit <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={outputUnit}
                onChange={(e) => setOutputUnit(e.target.value)}
                placeholder="e.g. kN, N, kg"
                className="input-field w-full"
              />
            </div>
          </div>

          {/* Degree selector */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Polynomial Degree</label>
            <div className="flex gap-2 flex-wrap">
              {DEGREE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleDegreeChange(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    degree === opt.value
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Equation preview */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Equation Preview</p>
            <p className="font-mono text-sm text-gray-800 break-all leading-relaxed">{preview}</p>
          </div>

          {/* Divisor */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Divisor <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={divisorRaw}
              onChange={(e) => setDivisorRaw(e.target.value)}
              placeholder="e.g. 1, 1000, 9.81"
              className="input-field w-48 font-mono"
            />
            <p className="text-[11px] text-gray-400 mt-1">The entire numerator is divided by this value. Use 1 to skip division.</p>
          </div>

          {/* Coefficients */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-3">Coefficients</label>
            <div className="space-y-2.5">
              {coefficients.map((coeff, idx) => {
                const label = DEGREE_LABELS[idx + 1];
                const power = degree - idx;
                const termDesc =
                  power === 0
                    ? 'constant term'
                    : power === 1
                    ? `coefficient of [${inputUnit || 'input'}]`
                    : `coefficient of [${inputUnit || 'input'}]${['²','³','⁴','⁵'][power-2] ?? `^${power}`}`;

                return (
                  <div key={idx} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                    {/* Label */}
                    <div className="w-6 text-center">
                      <span className="text-sm font-bold text-primary-700 font-mono">{label}</span>
                    </div>
                    {/* Description */}
                    <p className="text-[11px] text-gray-400 w-44 flex-shrink-0">{termDesc}</p>
                    {/* Mode toggle */}
                    <div className="flex rounded-md border border-gray-200 overflow-hidden flex-shrink-0">
                      {(['decimal', 'scientific'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => handleCoeffMode(idx, mode)}
                          className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                            coeff.inputMode === mode
                              ? 'bg-primary-600 text-white'
                              : 'bg-white text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {mode === 'decimal' ? '0.000' : '1E+0'}
                        </button>
                      ))}
                    </div>
                    {/* Value input */}
                    <input
                      type="text"
                      value={coeff.raw}
                      onChange={(e) => handleCoeffRaw(idx, e.target.value)}
                      placeholder={coeff.inputMode === 'scientific' ? '2.12230E+01' : '21.1223'}
                      className="input-field flex-1 font-mono text-sm min-w-0"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Uncertainty parameters (Stage D — LCDB u_cal/A/B/C) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              ค่าความไม่แน่นอน (%) — Stage D
            </label>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">u_cal (%)</label>
                <input
                  type="text"
                  value={uCalRaw}
                  onChange={(e) => setUCalRaw(e.target.value)}
                  placeholder="e.g. 0.15"
                  className="input-field w-full font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">A (%)</label>
                <input
                  type="text"
                  value={uARaw}
                  onChange={(e) => setUARaw(e.target.value)}
                  placeholder="e.g. 0.05"
                  className="input-field w-full font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">B (%)</label>
                <input
                  type="text"
                  value={uBRaw}
                  onChange={(e) => setUBRaw(e.target.value)}
                  placeholder="e.g. 0.03"
                  className="input-field w-full font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">C (%)</label>
                <input
                  type="text"
                  value={uCRaw}
                  onChange={(e) => setUCRaw(e.target.value)}
                  placeholder="e.g. 0.02"
                  className="input-field w-full font-mono text-sm"
                />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              ค่าจาก LCDB ของมาตรฐานอ้างอิง ใช้คำนวณ Uncertainty Budget — เว้นว่างได้หากยังไม่ทราบค่า
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Reference standard, conditions, source document…"
              className="input-field w-full resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0 bg-gray-50">
          <button type="button" onClick={onClose} className="btn btn-secondary px-5">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary px-6 min-w-[100px]"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving…
              </span>
            ) : editing ? 'Update' : 'Save Equation'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Conversion Equations Tab ─────────────────────────────────────────────────

function ConversionEquationTab({
  equipmentId,
  isAdmin,
  currentUser,
}: {
  equipmentId: string;
  isAdmin: boolean;
  currentUser: string;
}) {
  const { success, error: showError } = useToast();
  const [equations, setEquations] = useState<ConversionEquation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ConversionEquation | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = conversionEquationService.subscribe(
      equipmentId,
      (eqs) => { setEquations(eqs); setLoading(false); },
      (err) => { console.error(err); setLoading(false); }
    );
    return unsub;
  }, [equipmentId]);

  function handleAdd() { setEditing(null); setShowModal(true); }
  function handleEdit(eq: ConversionEquation) { setEditing(eq); setShowModal(true); }
  function handleSaved(eq: ConversionEquation) {
    setEquations((prev) => {
      const idx = prev.findIndex((e) => e.id === eq.id);
      return idx >= 0 ? prev.map((e, i) => (i === idx ? eq : e)) : [...prev, eq];
    });
    setShowModal(false);
  }

  async function handleDelete(eq: ConversionEquation) {
    if (!window.confirm(`Delete equation "${eq.name}"? This cannot be undone.`)) return;
    setDeletingId(eq.id);
    try {
      await conversionEquationService.delete(equipmentId, eq.id);
      setEquations((prev) => prev.filter((e) => e.id !== eq.id));
      success('Equation deleted');
    } catch (err: unknown) {
      showError((err as Error).message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Conversion Equations</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Polynomial equations for converting raw sensor readings to calibrated output values
            </p>
          </div>
          {isAdmin && (
            <button onClick={handleAdd} className="btn btn-primary text-sm flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Equation
            </button>
          )}
        </div>

        {/* Empty state */}
        {equations.length === 0 && (
          <SectionCard>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-500">No equations yet</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                Add a polynomial conversion equation to transform raw readings to calibrated output values.
              </p>
              {isAdmin && (
                <button onClick={handleAdd} className="btn btn-primary mt-5 text-sm">
                  Add First Equation
                </button>
              )}
            </div>
          </SectionCard>
        )}

        {/* Equation cards */}
        {equations.map((eq) => {
          const preview = buildEquationPreview(eq.degree, eq.inputUnit, eq.outputUnit, String(eq.divisor));
          return (
            <SectionCard key={eq.id}>
              <div className="px-5 py-4">
                {/* Card header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-gray-900">{eq.name}</h4>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-100">
                        {DEGREE_OPTIONS.find((d) => d.value === eq.degree)?.label ?? `Degree ${eq.degree}`}
                      </span>
                    </div>
                    {/* Unit row */}
                    <p className="text-xs text-gray-500 mt-1">
                      <span className="font-medium">{eq.inputUnit}</span>
                      <span className="mx-1.5 text-gray-300">→</span>
                      <span className="font-medium">{eq.outputUnit}</span>
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleEdit(eq)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(eq)}
                        disabled={deletingId === eq.id}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Equation preview */}
                <div className="mt-3 bg-gray-50 rounded-lg px-3.5 py-2.5 border border-gray-100">
                  <p className="font-mono text-xs text-gray-700 break-all leading-relaxed">{preview}</p>
                </div>

                {/* Coefficients table */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {eq.coefficients.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white rounded-lg border border-gray-100 px-3 py-2">
                      <span className="text-xs font-bold text-primary-700 font-mono w-4">{DEGREE_LABELS[idx + 1]}</span>
                      <span className="text-xs font-mono text-gray-800 truncate" title={c.raw}>{c.raw}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
                    <span className="text-[10px] text-gray-400 font-medium w-10">÷</span>
                    <span className="text-xs font-mono text-gray-800">{eq.divisor}</span>
                  </div>
                </div>

                {eq.notes && (
                  <p className="mt-2.5 text-xs text-gray-400 italic">{eq.notes}</p>
                )}

                {/* Trial calculator */}
                <TrialPanel eq={eq} />

                <p className="text-[10px] text-gray-300 mt-3">
                  Added {new Date(eq.createdAt).toLocaleDateString('en-GB')} · {eq.createdBy}
                </p>
              </div>
            </SectionCard>
          );
        })}
      </div>

      {showModal && (
        <EquationConfigModal
          equipmentId={equipmentId}
          editing={editing}
          onSave={handleSaved}
          onClose={() => setShowModal(false)}
          currentUser={currentUser}
        />
      )}
    </>
  );
}

// ─── Equipment Constants Tab ──────────────────────────────────────────────────

function ConstantsTab({
  equipmentId,
  isAdmin,
  currentUser,
}: {
  equipmentId: string;
  isAdmin: boolean;
  currentUser: string;
}) {
  const { success, error: showError } = useToast();
  const [constants, setConstants] = useState<EquipmentConstant[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ rawValue: '', unit: '', description: '', notes: '' });

  useEffect(() => {
    setLoading(true);
    const unsub = equipmentConstantService.subscribe(
      equipmentId,
      (cs) => { setConstants(cs); setLoading(false); },
      (err) => { console.error('[ConstantsTab]', err); setLoading(false); },
    );
    return unsub;
  }, [equipmentId]);

  function resetForm() {
    setForm({ rawValue: '', unit: '', description: '', notes: '' });
  }

  async function handleAdd() {
    const raw = form.rawValue.trim();
    if (!raw) { showError('Enter a value for the constant.'); return; }
    const n = Number(raw.replace(/,/g, ''));
    if (isNaN(n)) { showError('Value must be a number (e.g. 1.234 or 2.12E+01).'); return; }

    setSaving(true);
    try {
      const key = equipmentConstantService.nextKey(constants);
      await equipmentConstantService.add(equipmentId, {
        key,
        value: n,
        rawValue: raw,
        ...(form.unit.trim()        ? { unit:        form.unit.trim()        } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.notes.trim()       ? { notes:       form.notes.trim()       } : {}),
        createdBy: currentUser,
      });
      success(`${key} added`);
      resetForm();
      setAdding(false);
    } catch (err: unknown) {
      showError((err as Error).message || 'Failed to add constant');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: EquipmentConstant) {
    if (!window.confirm(`Delete constant ${c.key}? This cannot be undone.`)) return;
    setDeletingId(c.id);
    try {
      await equipmentConstantService.delete(equipmentId, c.id);
      success(`${c.key} deleted`);
    } catch (err: unknown) {
      showError((err as Error).message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const nextKey = equipmentConstantService.nextKey(constants);

  return (
    <div className="space-y-4">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Equipment Constants</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Named numeric constants (k1, k2, k3 …) bound to this equipment — referenced in
            conversion equations and calibration calculations.
          </p>
        </div>
        {isAdmin && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="btn btn-primary text-sm flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Constant
          </button>
        )}
      </div>

      {/* ── Inline add form ──────────────────────────────────────────────── */}
      {adding && (
        <SectionCard>
          <SectionHeader title={`New Constant — ${nextKey}`} />
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Key preview (read-only) */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Constant Key
                </label>
                <div className="flex items-center h-9 border border-gray-200 bg-gray-50 rounded-lg px-3">
                  <span className="font-mono text-sm font-bold text-primary-700">{nextKey}</span>
                  <span className="ml-2 text-xs text-gray-400">(auto-assigned)</span>
                </div>
              </div>

              {/* Value */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.rawValue}
                  onChange={(e) => setForm((f) => ({ ...f, rawValue: e.target.value }))}
                  placeholder="e.g. 1.23456 or 2.12230E+01"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Unit */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Unit <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="e.g. N/mV/V, kg, °C/mV"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Sensitivity coefficient"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Notes */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Source document, reference standard, conditions…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end px-5 pb-5">
            <button
              onClick={() => { setAdding(false); resetForm(); }}
              className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-5 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : `Add ${nextKey}`}
            </button>
          </div>
        </SectionCard>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {constants.length === 0 && !adding && (
        <SectionCard>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4.871 4A17.926 17.926 0 002 12c0 2.874.673 5.59 1.871 8m14.13 0a17.926
                     17.926 0 001.999-8 17.926 17.926 0 00-1.999-8M9 9h1m4 0h1M9 15h1m4
                     0h1M7 12h10" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500">No constants defined</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              Add equipment-specific constants (k1, k2, k3 …) used in calibration equations
              and calculations.
            </p>
            {isAdmin && (
              <button onClick={() => setAdding(true)} className="btn btn-primary mt-5 text-sm">
                Add First Constant
              </button>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Constants list ───────────────────────────────────────────────── */}
      {constants.length > 0 && (
        <SectionCard>
          <SectionHeader title={`Constants (${constants.length})`} />
          <div className="divide-y divide-gray-50">
            {constants.map((c) => (
              <div key={c.id} className="px-5 py-4 flex items-start gap-4">

                {/* Key badge */}
                <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100
                                flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary-700 font-mono">{c.key}</span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-base font-semibold text-gray-900">
                      {c.rawValue}
                    </span>
                    {c.unit && (
                      <span className="text-xs font-medium text-gray-500 bg-gray-100
                                       px-2 py-0.5 rounded-full">
                        {c.unit}
                      </span>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-xs text-gray-600 mt-0.5">{c.description}</p>
                  )}
                  {c.notes && (
                    <p className="text-xs text-gray-400 mt-0.5 italic">{c.notes}</p>
                  )}
                  <p className="text-[10px] text-gray-300 mt-1.5">
                    Added {new Date(c.createdAt).toLocaleDateString('en-GB')} · {c.createdBy}
                  </p>
                </div>

                {/* Delete */}
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={deletingId === c.id}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50
                               transition-colors disabled:opacity-40 flex-shrink-0 mt-0.5"
                    title={`Delete ${c.key}`}
                  >
                    {deletingId === c.id ? (
                      <span className="inline-block w-4 h-4 border-2 border-gray-300
                                       border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5
                             7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export const EquipmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const { hasPermission: canDeleteDocs } = usePermission('equipmentControl.deleteDocuments');

  const {
    equipment,
    usageLogs,
    calibrationEvents,
    documents,
    loading,
    error,
    addCalibrationEvent,
    uploadDocument,
    deleteDocument,
    updateUsageLog,
    deleteUsageLog,
  } = useEquipmentDetail(id);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [previewDoc, setPreviewDoc] = useState<EquipmentDocument | null>(null);
  const [editingLog, setEditingLog] = useState<UsageLog | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'documents', label: 'Documents', count: documents.length || undefined },
    { key: 'usage-logs', label: 'Usage Logs', count: usageLogs.length || undefined },
    { key: 'calibration', label: 'Calibration', count: calibrationEvents.length || undefined },
    { key: 'history', label: 'History' },
    { key: 'equations', label: 'Conversion Equations' },
    { key: 'constants', label: 'Constants' },
  ];

  async function handleLogEdit(data: Partial<Omit<UsageLog, 'id' | 'createdAt'>>) {
    if (!editingLog) return;
    try {
      await updateUsageLog(editingLog.id, data);
      success('Usage log updated');
      setEditingLog(null);
    } catch (err: unknown) {
      showError((err as Error).message || 'Update failed');
    }
  }

  async function handleLogDelete(log: UsageLog) {
    if (
      !window.confirm(
        `Delete usage log for ${new Date(log.date).toLocaleDateString('en-GB')} by ${
          log.operatorName || log.operator
        }? This cannot be undone.`
      )
    )
      return;
    setDeletingLogId(log.id);
    try {
      await deleteUsageLog(log.id);
      success('Usage log deleted');
    } catch (err: unknown) {
      showError((err as Error).message || 'Delete failed');
    } finally {
      setDeletingLogId(null);
    }
  }

  async function handleUpdate(data: Partial<EquipmentRecord>) {
    if (!id) return;
    await equipmentService.updateEquipment(id, data as any);
  }

  async function handleDocUpload(docType: EquipmentDocument['docType'], file: File) {
    if (!id || !currentUser) return;
    await uploadDocument(docType, file, currentUser.email);
    success(`${file.name} uploaded`);
  }

  async function handleDocDelete(doc: EquipmentDocument) {
    await deleteDocument(doc.id, doc.storagePath);
    success(`${doc.name} deleted`);
  }

  async function handlePreviewRecord() {
    if (!equipment) return;
    try {
      const { generateEquipmentDatasheetBytes } = await import('../../services/equipmentExportService');
      const bytes = await generateEquipmentDatasheetBytes(equipment, calibrationEvents);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      showError('Failed to generate equipment record PDF');
      console.error(err);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading equipment…</p>
        </div>
      </div>
    );
  }

  if (error || !equipment) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{error || 'Equipment not found'}</p>
          <button
            onClick={() => navigate('/equipment')}
            className="text-sm font-medium text-primary-600 hover:underline"
          >
            â† Back to Equipment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 pt-4 pb-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm mb-3">
            <button
              onClick={() => navigate('/equipment')}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              Equipment
            </button>
            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-mono text-gray-600 font-medium">{equipment.id}</span>
          </div>

          {/* Identity row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              {/* Equipment avatar */}
              <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900 font-mono">{equipment.id}</h1>
                  <StatusBadge status={equipment.status} />
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{equipment.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {equipment.category}
                  {equipment.manufacturer ? ` · ${equipment.manufacturer}` : ''}
                  {equipment.model ? ` ${equipment.model}` : ''}
                  {equipment.location ? ` · ${equipment.location}` : ''}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handlePreviewRecord}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Preview Record
              </button>
              <Link
                to={`/equipment/${id}/usage-log/new`}
                className="px-3 py-1.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                + Usage Log
              </Link>
              {isAdmin && equipment.status !== 'retired' && (
                <Link
                  to={`/equipment/${id}/retire`}
                  className="px-3 py-1.5 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
                >
                  Retire
                </Link>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 mt-4 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      activeTab === tab.key
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 py-5">
        {activeTab === 'overview' && (
          <OverviewTab eq={equipment} onUpdate={handleUpdate} isAdmin={isAdmin} />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab
            docs={documents}
            onUpload={handleDocUpload}
            onDelete={handleDocDelete}
            onPreview={setPreviewDoc}
            isAdmin={isAdmin}
            canDelete={canDeleteDocs}
          />
        )}
        {activeTab === 'usage-logs' && (
          <UsageLogsTab
            equipmentId={id!}
            logs={usageLogs}
            isAdmin={isAdmin}
            onEdit={setEditingLog}
            onDelete={handleLogDelete}
            deletingId={deletingLogId}
          />
        )}
        {activeTab === 'calibration' && (
          <CalibrationTab
            events={calibrationEvents}
            equipmentId={id!}
            onAdd={addCalibrationEvent}
            isAdmin={isAdmin}
          />
        )}
        {activeTab === 'history' && <HistoryTab equipment={equipment} />}
        {activeTab === 'equations' && (
          <ConversionEquationTab
            equipmentId={id!}
            isAdmin={isAdmin}
            currentUser={currentUser?.email ?? ''}
          />
        )}
        {activeTab === 'constants' && (
          <ConstantsTab
            equipmentId={id!}
            isAdmin={isAdmin}
            currentUser={currentUser?.email ?? ''}
          />
        )}
      </div>

      {/* Usage log edit modal */}
      {editingLog && (
        <UsageLogEditModal
          log={editingLog}
          onSave={handleLogEdit}
          onClose={() => setEditingLog(null)}
        />
      )}

      {/* Document preview modal */}
      <FilePreviewModal
        isOpen={previewDoc !== null}
        onClose={() => setPreviewDoc(null)}
        file={previewDoc ? toAttachment(previewDoc) : null}
      />
    </div>
  );
};
