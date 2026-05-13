import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEquipmentDetail } from '../../hooks/useEquipment';
import { equipmentService } from '../../services/equipmentService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import type { EquipmentRecord, EquipmentDocument, CalibrationEvent } from '../../types';

type Tab = 'overview' | 'documents' | 'usage-logs' | 'calibration' | 'cal-plan' | 'history';

function formatDate(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB');
}

function formatTs(d?: Date): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${equipmentService.getStatusColor(status as any)}`}>
      {equipmentService.getStatusLabel(status as any)}
    </span>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ eq, onUpdate, isAdmin }: {
  eq: EquipmentRecord;
  onUpdate: (data: Partial<EquipmentRecord>) => Promise<void>;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...eq });
  const [saving, setSaving] = useState(false);
  const { success, error: showError } = useToast();

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

  const fields: { label: string; value: string }[] = [
    { label: 'Equipment ID', value: eq.id },
    { label: 'Name', value: eq.name },
    { label: 'Category', value: eq.category },
    { label: 'Manufacturer', value: eq.manufacturer },
    { label: 'Model', value: eq.model },
    { label: 'Serial Number', value: eq.serialNumber },
    { label: 'Location', value: eq.location },
    { label: 'Custodian', value: eq.custodianName ? `${eq.custodianName} (${eq.custodian})` : eq.custodian },
    { label: 'Authorised Users', value: eq.authorizedUsers.join(', ') || '—' },
    { label: 'Requires Calibration', value: eq.requiresCalibration ? 'Yes' : 'No' },
    { label: 'Calibration Interval', value: eq.calibrationInterval ? `${eq.calibrationInterval} months` : '—' },
    { label: 'Calibration Procedure', value: eq.calibrationProcedure || '—' },
    { label: 'External Provider', value: eq.externalProvider ? 'Yes' : 'No' },
    { label: 'Registration Date', value: formatDate(eq.registrationDate) },
    { label: 'Last Calibration', value: formatDate(eq.lastCalibrationDate) },
    { label: 'Next Calibration', value: formatDate(eq.nextCalibrationDate) },
    { label: 'Notes', value: eq.notes || '—' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusBadge status={eq.status} />
        </div>
        {isAdmin && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
          >
            Edit
          </button>
        )}
        {editing && (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: 'name', label: 'Name' },
            { key: 'location', label: 'Location' },
            { key: 'custodian', label: 'Custodian (email)' },
            { key: 'custodianName', label: 'Custodian Name' },
            { key: 'calibrationProcedure', label: 'Calibration Procedure' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Calibration Interval (months)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={form.calibrationInterval || ''}
                onChange={(e) => setForm((f) => ({ ...f, calibrationInterval: parseInt(e.target.value) || undefined }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={form.notes || ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {fields.map(({ label, value }) => (
            <div key={label} className="border-b border-gray-100 pb-2">
              <dt className="text-xs font-medium text-gray-500">{label}</dt>
              <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// ─── Documents Tab ───────────────────────────────────────────────────────────

const DOC_LABELS: Record<EquipmentDocument['docType'], string> = {
  verification: 'LAB-FM-QP-05-001 Verification',
  registration: 'LAB-FM-QP-05-002 Registration Request',
  spec_sheet: 'Spec Sheet',
  certificate: 'Calibration Certificate',
  cal_plan: 'LAB-FM-QP-05-007 Calibration Plan',
  retirement: 'LAB-FM-QP-05-008 Retirement Request',
};

function DocumentsTab({ docs, onUpload, isAdmin }: {
  docs: EquipmentDocument[];
  onUpload: (docType: EquipmentDocument['docType'], file: File) => Promise<void>;
  isAdmin: boolean;
}) {
  const [uploading, setUploading] = useState<EquipmentDocument['docType'] | null>(null);
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

  const docTypes: EquipmentDocument['docType'][] = ['verification', 'registration', 'spec_sheet', 'certificate', 'cal_plan', 'retirement'];

  return (
    <div className="space-y-3">
      {docTypes.map((docType) => {
        const typeDocs = docs.filter((d) => d.docType === docType);
        return (
          <div key={docType} className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">{DOC_LABELS[docType]}</span>
              {isAdmin && (
                <label className={`text-xs px-2.5 py-1 rounded border cursor-pointer hover:bg-white ${uploading === docType ? 'opacity-50' : 'border-gray-300'}`}>
                  <input
                    type="file"
                    className="hidden"
                    accept={docType === 'certificate' || docType === 'spec_sheet' ? '.pdf,.xlsx,.png' : '.xlsx,.xls,.pdf'}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(docType, f); }}
                  />
                  {uploading === docType ? 'Uploading…' : '+ Upload'}
                </label>
              )}
            </div>
            {typeDocs.length === 0 ? (
              <p className="text-xs text-gray-400">No files uploaded</p>
            ) : (
              <ul className="space-y-1.5">
                {typeDocs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 truncate max-w-[300px]">{d.name}</span>
                    <div className="flex items-center gap-3 text-gray-400 flex-shrink-0">
                      <span>{formatTs(d.uploadedAt)}</span>
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                        Download
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Usage Logs Tab ───────────────────────────────────────────────────────────

function UsageLogsTab({ equipmentId }: { equipmentId: string }) {
  // Render minimal summary; full view is at /equipment/:id/usage-log
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          to={`/equipment/${equipmentId}/usage-log/new`}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
        >
          + Add Usage Log
        </Link>
      </div>
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-sm text-gray-500 text-center">
        <Link to={`/equipment/${equipmentId}/usage-log`} className="text-primary-600 hover:underline font-medium">
          View full usage log history →
        </Link>
      </div>
    </div>
  );
}

// ─── Calibration Tab ─────────────────────────────────────────────────────────

function CalibrationTab({ events, equipmentId, onAdd, isAdmin }: {
  events: CalibrationEvent[];
  equipmentId: string;
  onAdd: (event: Omit<CalibrationEvent, 'id' | 'createdAt'>) => Promise<string>;
  isAdmin: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    sentDate: '',
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
      setForm({ sentDate: '', receivedDate: '', calibrationLab: '', certificateNumber: '', result: '', conditionBeforeSend: '', conditionAfterReceive: '', notes: '' });
    } catch (err: unknown) {
      showError((err as Error).message || 'Failed to record calibration');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {isAdmin && !adding && (
        <div className="flex justify-end">
          <button
            onClick={() => setAdding(true)}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700"
          >
            Record Calibration
          </button>
        </div>
      )}

      {adding && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">New Calibration Event</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sent Date *</label>
              <input type="date" value={form.sentDate} onChange={(e) => setForm((f) => ({ ...f, sentDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Received Date</label>
              <input type="date" value={form.receivedDate} onChange={(e) => setForm((f) => ({ ...f, receivedDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Calibration Lab *</label>
              <input type="text" value={form.calibrationLab} onChange={(e) => setForm((f) => ({ ...f, calibrationLab: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Certificate Number</label>
              <input type="text" value={form.certificateNumber} onChange={(e) => setForm((f) => ({ ...f, certificateNumber: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Result</label>
              <select value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value as any }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">— Select —</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Condition Before Send</label>
              <input type="text" value={form.conditionBeforeSend} onChange={(e) => setForm((f) => ({ ...f, conditionBeforeSend: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Condition After Receive</label>
              <input type="text" value={form.conditionAfterReceive} onChange={(e) => setForm((f) => ({ ...f, conditionAfterReceive: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={!form.sentDate || !form.calibrationLab || saving} className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No calibration events recorded.</p>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <div key={ev.id} className="bg-white rounded-lg border border-gray-200 p-4 text-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-800">{ev.calibrationLab}</span>
                <div className="flex items-center gap-2">
                  {ev.result && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ev.result === 'pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {ev.result.toUpperCase()}
                    </span>
                  )}
                  <span className="text-gray-400 text-xs">{formatTs(ev.createdAt)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <span>Sent: {formatDate(ev.sentDate)}</span>
                {ev.receivedDate && <span>Received: {formatDate(ev.receivedDate)}</span>}
                {ev.certificateNumber && <span>Cert: {ev.certificateNumber}</span>}
              </div>
              {ev.notes && <p className="text-xs text-gray-500 mt-2">{ev.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cal Plan Tab ─────────────────────────────────────────────────────────────

function CalPlanTab({ docs, onUpload, isAdmin }: {
  docs: EquipmentDocument[];
  onUpload: (docType: EquipmentDocument['docType'], file: File) => Promise<void>;
  isAdmin: boolean;
}) {
  const planDocs = docs.filter((d) => d.docType === 'cal_plan');
  const { error: showError } = useToast();
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try { await onUpload('cal_plan', file); }
    catch (err: unknown) { showError((err as Error).message || 'Upload failed'); }
    finally { setUploading(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">LAB-FM-QP-05-007 Calibration Plan — reviewed every 4 months.</p>
        {isAdmin && (
          <label className={`text-xs px-2.5 py-1.5 rounded border cursor-pointer hover:bg-gray-50 ${uploading ? 'opacity-50' : 'border-gray-300'}`}>
            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {uploading ? 'Uploading…' : '+ Upload Plan'}
          </label>
        )}
      </div>
      {planDocs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No calibration plan uploaded.</p>
      ) : (
        <ul className="space-y-2">
          {planDocs.map((d) => (
            <li key={d.id} className="flex items-center justify-between bg-gray-50 rounded-lg border border-gray-200 px-4 py-3 text-sm">
              <span className="text-gray-800">{d.name}</span>
              <div className="flex items-center gap-3 text-gray-400 text-xs">
                <span>{formatTs(d.uploadedAt)}</span>
                <a href={d.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">Download</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ equipment }: { equipment: EquipmentRecord }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">Audit trail — status changes, approvals, uploads.</p>
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-sm text-gray-600">
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <span className="text-gray-400 text-xs whitespace-nowrap">{formatTs(equipment.createdAt)}</span>
            <span>Equipment registered by {equipment.createdBy}</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-gray-400 text-xs whitespace-nowrap">{formatTs(equipment.updatedAt)}</span>
            <span>Last updated — Status: <StatusBadge status={equipment.status} /></span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export const EquipmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, currentUser } = useAuth();
  const { success } = useToast();

  const {
    equipment,
    calibrationEvents,
    documents,
    loading,
    error,
    addCalibrationEvent,
    uploadDocument,
  } = useEquipmentDetail(id);

  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'documents', label: 'Documents' },
    { key: 'usage-logs', label: 'Usage Logs' },
    { key: 'calibration', label: 'Calibration' },
    { key: 'cal-plan', label: 'Cal. Plan' },
    { key: 'history', label: 'History' },
  ];

  async function handleUpdate(data: Partial<EquipmentRecord>) {
    if (!id) return;
    await equipmentService.updateEquipment(id, data as any);
  }

  async function handleDocUpload(docType: EquipmentDocument['docType'], file: File) {
    if (!id || !currentUser) return;
    await uploadDocument(docType, file, currentUser.email);
    success(`${file.name} uploaded`);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error || !equipment) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-3">{error || 'Equipment not found'}</p>
          <button onClick={() => navigate('/equipment')} className="text-primary-600 hover:underline text-sm">
            Back to Equipment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/equipment')} className="text-gray-400 hover:text-gray-600 text-sm">
              ← Equipment
            </button>
            <span className="text-gray-300">/</span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900 font-mono">{equipment.id}</h1>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${equipmentService.getStatusColor(equipment.status)}`}>
                  {equipmentService.getStatusLabel(equipment.status)}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{equipment.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/equipment/${id}/usage-log/new`}
              className="px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
            >
              + Usage Log
            </Link>
            {isAdmin && equipment.status !== 'retired' && (
              <Link
                to={`/equipment/${id}/retire`}
                className="px-3 py-1.5 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50"
              >
                Retire
              </Link>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-6 py-6 max-w-4xl">
        {activeTab === 'overview' && (
          <OverviewTab eq={equipment} onUpdate={handleUpdate} isAdmin={isAdmin} />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab docs={documents} onUpload={handleDocUpload} isAdmin={isAdmin} />
        )}
        {activeTab === 'usage-logs' && (
          <UsageLogsTab equipmentId={id!} />
        )}
        {activeTab === 'calibration' && (
          <CalibrationTab events={calibrationEvents} equipmentId={id!} onAdd={addCalibrationEvent} isAdmin={isAdmin} />
        )}
        {activeTab === 'cal-plan' && (
          <CalPlanTab docs={documents} onUpload={handleDocUpload} isAdmin={isAdmin} />
        )}
        {activeTab === 'history' && (
          <HistoryTab equipment={equipment} />
        )}
      </div>
    </div>
  );
};
