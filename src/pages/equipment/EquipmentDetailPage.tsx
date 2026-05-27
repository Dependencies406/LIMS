import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEquipmentDetail } from '../../hooks/useEquipment';
import { equipmentService } from '../../services/equipmentControlService';
import { userService } from '../../services/userService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { FilePreviewModal } from '../../components/FilePreviewModal';
import { UsageLogEditModal } from '../../components/UsageLogEditModal';
import type { EquipmentRecord, EquipmentDocument, CalibrationEvent, EquipmentAttachment, UsageLog } from '../../types';
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

type Tab = 'overview' | 'documents' | 'usage-logs' | 'calibration' | 'history';

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
    setSaving(true);
    try {
      await onUpdate({
        name: form.name,
        location: form.location,
        custodian: form.custodian,
        custodianName: form.custodianName,
        calibrationInterval: form.calibrationInterval,
        calibrationProcedure: form.calibrationProcedure,
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
