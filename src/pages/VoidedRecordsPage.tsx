/**
 * VoidedRecordsPage.tsx
 *
 * ADR-016 Task 4 — the admin view for voided calibration records. A
 * DELIBERATELY SEPARATE page from the existing RecycleBinPage.tsx (jobs /
 * customers / documents / templates / users): that page's generic
 * `DeletedItem` shape has no room for record number / job / item /
 * template / prior status, ALL of which this task explicitly asks for, and
 * — more importantly — that page's per-row actions include a REAL
 * permanent-delete for those other entity types. ADR-016 D1 is explicit
 * that no hard-delete exists for records; keeping this page separate means
 * there is no shared "Delete Permanently" code path a future edit to that
 * page could accidentally wire a record into.
 *
 * Admin-only (route-gated, matching RecorderTemplateBuilderPage/
 * RecorderTemplatesListPage's own convention).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { calibrationRecordService } from '../services/calibrationRecordService';
import { recorderTemplateService } from '../services/recorderTemplateService';
import { userService } from '../services/userService';
import { useToast } from '../hooks/useToast';
import type { CalibrationRecord } from '../types';

const PRIOR_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  committed: 'Committed',
  reviewed: 'Reviewed',
  approved: 'Approved',
  superseded: 'Superseded',
};

function formatDate(date?: Date): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export const VoidedRecordsPage: React.FC = () => {
  const { error: showError, success } = useToast();

  const [records, setRecords] = useState<CalibrationRecord[]>([]);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [templateNames, setTemplateNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const voided = await calibrationRecordService.getVoidedRecords();
      setRecords(voided);

      const users = await userService.getAllUsers();
      const uMap = new Map<string, string>();
      users.forEach((u) => {
        uMap.set(u.uid, u.displayName || `${u.firstName} ${u.lastName}`.trim() || u.email || u.uid);
      });
      setUserNames(uMap);

      // Dedupe by (templateId, templateVersion) — many voided records can
      // share the same pinned version, and the version snapshot (not the
      // live, possibly-since-archived template) is what's guaranteed to
      // still exist (ADR-005).
      const uniqueVersions = new Map<string, { templateId: string; version: number }>();
      for (const r of voided) {
        uniqueVersions.set(`${r.templateId}_v${r.templateVersion}`, { templateId: r.templateId, version: r.templateVersion });
      }
      const tMap = new Map<string, string>();
      await Promise.all(
        Array.from(uniqueVersions.entries()).map(async ([key, { templateId, version }]) => {
          try {
            const v = await recorderTemplateService.getVersion(templateId, version);
            tMap.set(key, v?.snapshot.name ?? templateId);
          } catch {
            tMap.set(key, templateId);
          }
        }),
      );
      setTemplateNames(tMap);
    } catch (e: any) {
      showError(e.message || 'Failed to load voided records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templateNameFor = (r: CalibrationRecord) => templateNames.get(`${r.templateId}_v${r.templateVersion}`) ?? r.templateId;

  // ADR-016 Task 4: "which voided records were blocking this template" is
  // the question that brings someone here — filter by template name.
  const templateOptions = useMemo(() => {
    const names = new Set(records.map((r) => templateNameFor(r)));
    return Array.from(names).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, templateNames]);

  const filtered = records.filter((r) => {
    if (templateFilter !== 'all' && templateNameFor(r) !== templateFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const haystack = [
        r.recordNumber ?? '',
        r.contextSnapshot.job.title,
        r.contextSnapshot.item.name,
        templateNameFor(r),
        r.voidReason ?? '',
      ].join(' ').toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  const handleRestore = async (record: CalibrationRecord) => {
    setRestoring(record.id);
    try {
      await calibrationRecordService.restoreRecord(record.id);
      success(`Record restored to ${PRIOR_STATUS_LABEL[record.statusBeforeVoid ?? 'draft'] ?? 'Draft'}.`);
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
    } catch (e: any) {
      showError(e.message || 'Failed to restore record');
    } finally {
      setRestoring(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-gray-500">
          Loading voided records…
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Voided Records</h1>
          <p className="text-sm text-gray-500 mt-1">
            Records that should never have existed — soft-deleted, never removed (ADR-016). Restore returns a record
            to the status it held before voiding. There is no permanent-delete option; that is by design.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="sm:min-w-[240px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Template</label>
            <select
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All templates ({records.length})</option>
              {templateOptions.map((name) => (
                <option key={name} value={name}>
                  {name} ({records.filter((r) => templateNameFor(r) === name).length})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-0 sm:min-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
            <input
              type="text"
              placeholder="Record number, job, item, reason…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-sm text-gray-500">
            {records.length === 0 ? 'No voided records.' : 'No voided records match this filter.'}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Record #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job / Item</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Template</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prior status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Voided by</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Voided at</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{r.recordNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <Link to={`/jobs/${r.jobId}/items/${r.itemId}/record`} className="text-primary-600 hover:underline">
                          {r.contextSnapshot.job.title}
                        </Link>
                        <div className="text-xs text-gray-400">{r.contextSnapshot.item.name}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{templateNameFor(r)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {PRIOR_STATUS_LABEL[r.statusBeforeVoid ?? ''] ?? (
                          <span className="text-amber-600" title="statusBeforeVoid missing or invalid — will restore to Draft">
                            Unknown (→ Draft)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{userNames.get(r.voidedBy ?? '') ?? r.voidedBy ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(r.voidedAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate" title={r.voidReason}>{r.voidReason}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium">
                        <button
                          type="button"
                          onClick={() => handleRestore(r)}
                          disabled={restoring === r.id}
                          className="px-3 py-1.5 text-sm font-medium text-primary-700 border border-primary-300 rounded-lg hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {restoring === r.id ? 'Restoring…' : 'Restore'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoidedRecordsPage;
