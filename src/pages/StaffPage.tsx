/**
 * StaffPage.tsx
 * Personnel management — list of staff members with drill-down detail view.
 *
 * Detail view has three tabs:
 *   1. Training Records  — per LAB-FM-QP-03-005
 *   2. Documents         — file uploads (code of conduct, job description, etc.)
 *   3. Performance       — job completion metrics
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { usePermission } from '../hooks/usePermission';
import { userService } from '../services/userService';
import { trainingRecordService } from '../services/trainingRecordService';
import { staffDocumentService } from '../services/staffDocumentService';
import { staffPerformanceService } from '../services/staffPerformanceService';
import { jobLoggingService } from '../services/jobLoggingService';
import { STAFF_DOCUMENT_CATEGORIES } from '../types';
import type {
  User,
  TrainingRecord,
  TrainingFormat,
  TrainingStatus,
  StaffDocument,
  StaffDocumentCategory,
  StaffPerformanceMetrics,
} from '../types';

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TRAINING_FORMATS: TrainingFormat[] = [
  'External Training', 'Internal Training', 'On-the-Job Training',
  'e-Learning', 'Workshop', 'Seminar', 'Conference', 'Other',
];
const TRAINING_STATUSES: TrainingStatus[] = [
  'Completed', 'Planned', 'In Progress', 'Cancelled',
];
const STATUS_STYLES: Record<TrainingStatus, string> = {
  Completed: 'bg-green-100 text-green-800',
  Planned: 'bg-blue-100 text-blue-800',
  'In Progress': 'bg-yellow-100 text-yellow-800',
  Cancelled: 'bg-gray-100 text-gray-500',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function staffDisplayName(u: User): string {
  return `${u.firstName} ${u.lastName}`.trim() || u.email;
}

function initials(u: User): string {
  return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

// â”€â”€â”€ Training Record Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface RecordForm {
  courseName: string; trainingFormat: TrainingFormat;
  duration: string; organizer: string; status: TrainingStatus;
  completionDate: string; certificateUrl: string; remarks: string;
}
const blankForm = (): RecordForm => ({
  courseName: '', trainingFormat: 'External Training',
  duration: '', organizer: '', status: 'Planned',
  completionDate: '', certificateUrl: '', remarks: '',
});

// â”€â”€â”€ Training Record Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface RecordModalProps {
  staffName: string;
  record?: TrainingRecord | null;
  onClose: () => void;
  onSave: (form: RecordForm) => Promise<void>;
}
const RecordModal: React.FC<RecordModalProps> = ({ staffName, record, onClose, onSave }) => {
  const [form, setForm] = useState<RecordForm>(() =>
    record
      ? { courseName: record.courseName, trainingFormat: record.trainingFormat,
          duration: record.duration, organizer: record.organizer, status: record.status,
          completionDate: record.completionDate ?? '', certificateUrl: record.certificateUrl ?? '',
          remarks: record.remarks ?? '' }
      : blankForm(),
  );
  const [saving, setSaving] = useState(false);
  const set = (k: keyof RecordForm, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.courseName.trim()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{record ? 'Edit Training Record' : 'Add Training Record'}</h3>
            <p className="text-sm text-gray-500">Staff: <span className="font-medium text-gray-700">{staffName}</span></p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Course Name / Training Topic <span className="text-red-500">*</span></label>
            <input type="text" value={form.courseName} onChange={(e) => set('courseName', e.target.value)}
              required className="input w-full" placeholder="e.g. ISO/IEC 17025:2017 Requirements" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Training Format</label>
              <select value={form.trainingFormat} onChange={(e) => set('trainingFormat', e.target.value as TrainingFormat)} className="input w-full">
                {TRAINING_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
              <input type="text" value={form.duration} onChange={(e) => set('duration', e.target.value)} className="input w-full" placeholder="e.g. 2 days, 8 hours" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Training Organizer</label>
              <input type="text" value={form.organizer} onChange={(e) => set('organizer', e.target.value)} className="input w-full" placeholder="e.g. NIMT, DSS, TISTR" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value as TrainingStatus)} className="input w-full">
                {TRAINING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Completion Date</label>
              <input type="date" value={form.completionDate} onChange={(e) => set('completionDate', e.target.value)} className="input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Certificate / Assessment (URL)</label>
              <input type="url" value={form.certificateUrl} onChange={(e) => set('certificateUrl', e.target.value)} className="input w-full" placeholder="https://..." />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
            <textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} rows={2} className="input w-full resize-none" placeholder="Optional notes" />
          </div>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={saving || !form.courseName.trim()} className="btn btn-primary disabled:opacity-50">
            {saving ? 'Saving…' : record ? 'Save Changes' : 'Add Record'}
          </button>
        </div>
      </div>
    </div>
  );
};

// â”€â”€â”€ Training Records Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TrainingTab: React.FC<{
  staff: User; isAdmin: boolean; canManage: boolean;
}> = ({ staff, isAdmin, canManage }) => {
  const { success, error: showError } = useToast();
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TrainingRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TrainingRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await trainingRecordService.getRecordsForStaff(staff.uid));
    } catch (err) {
      console.error('[TrainingTab]', err);
      showError('Failed to load training records.');
    } finally { setLoading(false); }
  }, [staff.uid, showError]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form: RecordForm) => {
    if (editingRecord) {
      await trainingRecordService.updateRecord(editingRecord.id, {
        ...form,
        completionDate: form.completionDate || undefined,
        certificateUrl: form.certificateUrl || undefined,
        remarks: form.remarks || undefined,
      });
      success('Training record updated.');
    } else {
      await trainingRecordService.addRecord({
        staffUid: staff.uid,
        staffName: staffDisplayName(staff),
        ...form,
        completionDate: form.completionDate || undefined,
        certificateUrl: form.certificateUrl || undefined,
        remarks: form.remarks || undefined,
      });
      success('Training record added.');
    }
    setModalOpen(false); setEditingRecord(null); load();
  };

  const handleDelete = async (r: TrainingRecord) => {
    setDeletingId(r.id);
    try {
      await trainingRecordService.deleteRecord(r.id);
      success('Record deleted.'); setConfirmDelete(null); load();
    } catch { showError('Failed to delete record.'); }
    finally { setDeletingId(null); }
  };

  const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">LAB-FM-QP-03-005 · บันทึกการอบรมบุคลากร</p>
        {(isAdmin || canManage) && (
          <button type="button" onClick={() => { setEditingRecord(null); setModalOpen(true); }} className="btn btn-primary text-sm">
            + Add Training Record
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">Training History</span>
          <span className="text-xs text-gray-400">{records.length} record{records.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="py-14 text-center text-sm text-gray-400">Loading…</div>
        ) : records.length === 0 ? (
          <div className="py-14 text-center">
            <div className="text-4xl mb-2">📋</div>
            <p className="text-sm text-gray-500">{(isAdmin || canManage) ? 'No records yet — click "Add Training Record".' : 'No training records.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Course / Topic</th>
                  <th className="px-4 py-3 text-left">Format</th>
                  <th className="px-4 py-3 text-left">Duration</th>
                  <th className="px-4 py-3 text-left">Organizer</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Completion Date</th>
                  <th className="px-4 py-3 text-left">Certificate</th>
                  <th className="px-4 py-3 text-left">Remarks</th>
                  {(isAdmin || canManage) && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.courseName}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.trainingFormat}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.duration || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.organizer || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(r.completionDate)}</td>
                    <td className="px-4 py-3">
                      {r.certificateUrl
                        ? <a href={r.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">🔗 View</a>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.remarks || '—'}</td>
                    {(isAdmin || canManage) && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button type="button" onClick={() => { setEditingRecord(r); setModalOpen(true); }} className="text-gray-400 hover:text-blue-600 p-1" title="Edit">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(r)} className="text-gray-400 hover:text-red-600 p-1 ml-1" title="Delete">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <RecordModal staffName={staffDisplayName(staff)} record={editingRecord}
          onClose={() => { setModalOpen(false); setEditingRecord(null); }} onSave={handleSave} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete training record?</h3>
            <p className="text-sm text-gray-600 mb-1 font-medium">{confirmDelete.courseName}</p>
            <p className="text-xs text-gray-400 mb-5">This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmDelete(null)} className="btn btn-secondary">Cancel</button>
              <button type="button" onClick={() => handleDelete(confirmDelete)} disabled={deletingId === confirmDelete.id}
                className="btn bg-red-600 text-white hover:bg-red-700 border-red-600 disabled:opacity-50">
                {deletingId === confirmDelete.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// â”€â”€â”€ Documents Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DocumentsTab: React.FC<{
  staff: User; currentUser: User; isAdmin: boolean; canManage: boolean;
}> = ({ staff, currentUser, isAdmin, canManage }) => {
  const { success, error: showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<StaffDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadCategory, setUploadCategory] = useState<StaffDocumentCategory>('Other');
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StaffDocument | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDocuments(await staffDocumentService.getDocumentsForStaff(staff.uid)); }
    catch (err) { console.error('[DocumentsTab]', err); showError('Failed to load documents.'); }
    finally { setLoading(false); }
  }, [staff.uid, showError]);

  useEffect(() => { load(); }, [load]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      await staffDocumentService.uploadDocument(
        staff.uid, file, uploadCategory,
        currentUser.uid,
        staffDisplayName(currentUser),
        (pct) => setUploadProgress(pct),
      );
      success(`"${file.name}" uploaded.`);
      setShowUploadPanel(false);
      load();
    } catch (err) {
      console.error('[DocumentsTab] Upload failed:', err);
      showError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (d: StaffDocument) => {
    setDeletingId(d.id);
    try {
      await staffDocumentService.deleteDocument(d);
      success('Document deleted.'); setConfirmDelete(null); load();
    } catch { showError('Failed to delete document.'); }
    finally { setDeletingId(null); }
  };

  const categoryIcon: Record<StaffDocumentCategory, string> = {
    'Code of Conduct': '📜', 'Job Description': '📄', 'Employment Contract': '🤝',
    'Training Certificate': '🏆', 'Performance Review': '📊', 'Medical Certificate': '🏥',
    'ID / Passport': '🪪', 'Other': '🔎',
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Personnel files attached to this record</p>
        {(isAdmin || canManage) && (
          <button type="button" onClick={() => setShowUploadPanel((v) => !v)} className="btn btn-primary text-sm">
            {showUploadPanel ? 'Cancel' : '+ Upload Document'}
          </button>
        )}
      </div>

      {/* Upload Panel */}
      {showUploadPanel && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
          <h4 className="text-sm font-semibold text-blue-900">Upload a document</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Document Category</label>
              <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as StaffDocumentCategory)} className="input w-full text-sm">
                {STAFF_DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">File (PDF, images, Word docs)</label>
              <input ref={fileInputRef} type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.xls,.xlsx"
                onChange={handleFileChange} disabled={uploading}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 disabled:opacity-50" />
            </div>
          </div>
          {uploading && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-blue-700">
                <span>Uploading…</span><span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-1.5">
                <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Documents list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">Attached Documents</span>
          <span className="text-xs text-gray-400">{documents.length} file{documents.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="py-14 text-center text-sm text-gray-400">Loading…</div>
        ) : documents.length === 0 ? (
          <div className="py-14 text-center">
            <div className="text-4xl mb-2">📁</div>
            <p className="text-sm text-gray-500">{(isAdmin || canManage) ? 'No documents yet — click "Upload Document" to attach files.' : 'No documents attached.'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50">
                <span className="text-2xl flex-shrink-0" title={d.category}>{categoryIcon[d.category] ?? '🔎'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{d.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {d.category} · {formatBytes(d.size)} · Uploaded {d.uploadedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} by {d.uploadedByName}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={d.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    View
                  </a>
                  {(isAdmin || canManage) && (
                    <button type="button" onClick={() => setConfirmDelete(d)} title="Delete" disabled={deletingId === d.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete document?</h3>
            <p className="text-sm text-gray-600 mb-1 font-medium">{confirmDelete.name}</p>
            <p className="text-xs text-gray-400 mb-5">This will permanently remove the file. This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmDelete(null)} className="btn btn-secondary">Cancel</button>
              <button type="button" onClick={() => handleDelete(confirmDelete)} disabled={deletingId === confirmDelete.id}
                className="btn bg-red-600 text-white hover:bg-red-700 border-red-600 disabled:opacity-50">
                {deletingId === confirmDelete.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// â”€â”€â”€ Performance Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PerformanceTab: React.FC<{ staff: User; isAdmin: boolean; canExportLogs: boolean }> = ({ staff, isAdmin, canExportLogs }) => {
  const { success, error: showError } = useToast();
  const [metrics, setMetrics] = useState<StaffPerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    staffPerformanceService.getAllStaffPerformance().then((all) => {
      if (!cancelled) {
        setMetrics(all.find((m) => m.staffId === staff.uid) ?? null);
        setLoading(false);
      }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [staff.uid]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const text = await jobLoggingService.exportStaffLogsToText(staff.uid);
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `staff-logs-${staff.uid}-${Date.now()}.txt`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      success('Logs exported');
    } catch { showError('Export failed.'); }
    finally { setExporting(false); }
  };

  if (loading) return <div className="py-14 text-center text-sm text-gray-400">Loading performance data…</div>;

  if (!metrics) return (
    <div className="py-14 text-center">
      <div className="text-4xl mb-2">📊</div>
      <p className="text-sm text-gray-500">No job performance data found for this staff member.</p>
    </div>
  );

  const cards = [
    { label: 'Assigned Jobs', value: metrics.totalJobsAssigned, color: 'text-blue-600' },
    { label: 'On Time', value: metrics.jobsCompletedOnTime, color: 'text-green-600' },
    { label: 'Overdue', value: metrics.jobsCompletedOverdue, color: 'text-red-600' },
    { label: 'On-Time %', value: `${metrics.onTimePercentage.toFixed(1)}%`, color: 'text-purple-600' },
    { label: 'In Progress', value: metrics.jobsInProgress, color: 'text-yellow-600' },
    { label: 'Avg Days', value: metrics.averageCompletionDays ? `${metrics.averageCompletionDays.toFixed(1)}d` : 'N/A', color: 'text-gray-700' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Job completion performance metrics</p>
        {(isAdmin || canExportLogs) && (
          <button type="button" onClick={handleExport} disabled={exporting} className="btn btn-secondary text-sm disabled:opacity-50">
            {exporting ? 'Exporting…' : 'Export Logs'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h4 className="text-sm font-semibold text-gray-800 mb-3">On-Time Completion Rate</h4>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-3">
            <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${metrics.onTimePercentage}%` }} />
          </div>
          <span className="text-sm font-semibold text-gray-700 w-12 text-right">{metrics.onTimePercentage.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
};

// â”€â”€â”€ Staff Detail View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type DetailTab = 'training' | 'documents' | 'performance';

const StaffDetailView: React.FC<{
  staff: User;
  currentUser: User;
  isAdmin: boolean;
  canManageTraining: boolean;
  canExportLogs: boolean;
  onBack: () => void;
}> = ({ staff, currentUser, isAdmin, canManageTraining, canExportLogs, onBack }) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('training');

  const tabs: { id: DetailTab; label: string; icon: string }[] = [
    { id: 'training', label: 'Training Records', icon: '📋' },
    { id: 'documents', label: 'Documents', icon: '📁' },
    { id: 'performance', label: 'Performance', icon: '📊' },
  ];

  return (
    <div className="space-y-6">
      {/* Back button + staff header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors w-fit">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Staff List
        </button>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-primary-700 font-bold text-xl">{initials(staff)}</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900">{staffDisplayName(staff)}</h2>
            <p className="text-sm text-gray-500">{staff.position || 'No position'}</p>
            <p className="text-xs text-gray-400 mt-0.5">{staff.email}</p>
          </div>
          <div className="ml-auto flex-shrink-0">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${staff.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
              {staff.isActive !== false ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {tabs.map(({ id, label, icon }) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === id ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80' : 'text-gray-600 hover:text-gray-900'
            }`}>
            <span>{icon}</span><span>{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'training' && (
        <TrainingTab staff={staff} isAdmin={isAdmin} canManage={canManageTraining} />
      )}
      {activeTab === 'documents' && (
        <DocumentsTab staff={staff} currentUser={currentUser} isAdmin={isAdmin} canManage={canManageTraining} />
      )}
      {activeTab === 'performance' && (
        <PerformanceTab staff={staff} isAdmin={isAdmin} canExportLogs={canExportLogs} />
      )}
    </div>
  );
};

// â”€â”€â”€ Staff List View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const StaffListView: React.FC<{
  users: User[];
  loading: boolean;
  onSelect: (user: User) => void;
}> = ({ users, loading, onSelect }) => {
  const [search, setSearch] = useState('');

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      staffDisplayName(u).toLowerCase().includes(q) ||
      (u.position ?? '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading staff…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
        </svg>
        <input type="text" placeholder="Search by name, position, or email…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="input pl-9 w-full sm:max-w-xs" />
      </div>

      {/* Count */}
      <p className="text-xs text-gray-500">{filtered.length} of {users.length} staff member{users.length !== 1 ? 's' : ''}</p>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center">
          <div className="text-4xl mb-2">👥</div>
          <p className="text-sm text-gray-500">{search ? 'No staff match your search.' : 'No staff members found.'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {filtered.map((u) => (
              <li key={u.uid}>
                <button type="button" onClick={() => onSelect(u)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
                  {/* Avatar */}
                  <div className="w-11 h-11 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-700 font-semibold text-sm">{initials(u)}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{staffDisplayName(u)}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.isActive !== false ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{u.position || 'No position'} · {u.email}</p>
                  </div>

                  {/* Chevron */}
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// â”€â”€â”€ Main StaffPage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const StaffPage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const { hasPermission: canViewPerformance } = usePermission('staffPerformance.view');
  const { hasPermission: canExportLogs } = usePermission('staffPerformance.exportLogs');
  const { hasPermission: canViewTraining } = usePermission('staffTraining.view');
  const { hasPermission: canManageTraining } = usePermission('staffTraining.manage');

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<User | null>(null);

  const hasAnyAccess = isAdmin || canViewPerformance || canViewTraining || canManageTraining;

  useEffect(() => {
    userService.getAllUsers().then((all) => {
      setUsers(all.sort((a, b) => staffDisplayName(a).localeCompare(staffDisplayName(b))));
      setLoadingUsers(false);
    }).catch(() => setLoadingUsers(false));
  }, []);

  if (!currentUser) return null;

  if (!hasAnyAccess) {
    return (
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold text-red-800 mb-2">Access Denied</h2>
            <p className="text-red-600">You don't have permission to view the Staff section.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedStaff ? 'Personnel record' : 'Select a staff member to view their record'}
          </p>
        </div>

        {selectedStaff ? (
          <StaffDetailView
            staff={selectedStaff}
            currentUser={currentUser}
            isAdmin={isAdmin}
            canManageTraining={isAdmin || canManageTraining}
            canExportLogs={canExportLogs}
            onBack={() => setSelectedStaff(null)}
          />
        ) : (
          <StaffListView
            users={users}
            loading={loadingUsers}
            onSelect={setSelectedStaff}
          />
        )}
      </div>
    </div>
  );
};
