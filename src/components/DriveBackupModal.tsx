/**
 * Backup & Export Modal
 * Downloads all LIMS job data + actual attachment files as a ZIP archive.
 * No Google Drive or Cloud Function setup required.
 */

import React, { useEffect, useState } from 'react';
import {
  downloadBackup,
  saveBackupHistory,
  getBackupHistory,
  clearBackupHistory,
  type BackupResult,
  type BackupHistoryEntry,
} from '../services/driveBackupService';
import { DownloadIcon, XIcon, AlertTriangleIcon, CheckIcon, InfoIcon } from './common';

interface DriveBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Status = 'idle' | 'running' | 'success' | 'error';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

export const DriveBackupModal: React.FC<DriveBackupModalProps> = ({ isOpen, onClose }) => {
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<BackupResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [history, setHistory] = useState<BackupHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Progress state
  const [progressStep, setProgressStep] = useState('');
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setHistory(getBackupHistory());
      setStatus('idle');
      setResult(null);
      setErrorMsg('');
      setProgressStep('');
      setProgressCurrent(0);
      setProgressTotal(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    setStatus('running');
    setResult(null);
    setErrorMsg('');
    setProgressStep('Starting…');
    setProgressCurrent(0);
    setProgressTotal(0);

    try {
      const res = await downloadBackup({
        includeDeleted,
        onProgress: (step, current, total) => {
          setProgressStep(step);
          setProgressCurrent(current);
          setProgressTotal(total);
        },
      });
      setResult(res);
      saveBackupHistory(res);
      setHistory(getBackupHistory());
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.message || 'Unexpected error. Please try again.');
    }
  };

  const handleClearHistory = () => {
    clearBackupHistory();
    setHistory([]);
  };

  const progressPercent =
    progressTotal > 0 ? Math.round((progressCurrent / progressTotal) * 100) : null;

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal-content max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <DownloadIcon className="w-5 h-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 leading-tight">Backup &amp; Export</h2>
              <p className="text-xs text-gray-400 mt-0.5">Download all job data and attachments as a ZIP archive</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={status === 'running'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <XIcon className="w-3.5 h-3.5" />
            Close
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">

          {/* ── Info box ────────────────────────────────────────── */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
            <InfoIcon className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 space-y-1">
              <p className="font-medium">What's included in the backup?</p>
              <ul className="text-xs text-blue-700 space-y-0.5 list-disc list-inside">
                <li><strong>backup_data.json</strong> — all job records, equipment &amp; measurements</li>
                <li><strong>attachments/</strong> — actual files (calibration certs, photos, datasheets)</li>
                <li>Files are organised by job → equipment inside the ZIP</li>
              </ul>
            </div>
          </div>

          {/* ── Options ─────────────────────────────────────────── */}
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-3">Export Options</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => setIncludeDeleted(e.target.checked)}
                disabled={status === 'running'}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div>
                <span className="text-sm text-gray-700">Include deleted jobs</span>
                <p className="text-xs text-gray-400">Jobs moved to the Recycle Bin</p>
              </div>
            </label>
          </div>

          {/* ── Progress ─────────────────────────────────────────── */}
          {status === 'running' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-900">Backup in progress…</p>
                  <p className="text-xs text-blue-700 mt-0.5 truncate">{progressStep}</p>
                </div>
              </div>

              {/* Progress bar — shown only when downloading attachments */}
              {progressTotal > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-blue-700">
                    <span>Attachments</span>
                    <span>{progressCurrent} / {progressTotal}
                      {progressPercent !== null && ` (${progressPercent}%)`}
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent ?? 0}%` }}
                    />
                  </div>
                </div>
              )}

              <p className="text-xs text-blue-600">
                Do not close this window while the backup is running.
              </p>
            </div>
          )}

          {/* ── Success ──────────────────────────────────────────── */}
          {status === 'success' && result && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <CheckIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-900">Backup downloaded successfully</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    {result.totalJobs} job(s) · {result.totalAttachments} attachment(s) ·{' '}
                    {formatSize(result.fileSizeKb)}
                  </p>
                  {result.failedAttachments > 0 && (
                    <p className="text-xs text-yellow-700 mt-1">
                      ⚠ {result.failedAttachments} attachment(s) could not be downloaded and were skipped.
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-white border border-green-200 rounded px-3 py-2">
                <p className="text-xs text-gray-500">Saved as:</p>
                <p className="text-sm font-mono text-gray-800 mt-0.5 break-all">{result.fileName}</p>
              </div>

              <p className="text-xs text-gray-500">
                Check your browser's Downloads folder. You can save this ZIP to Google Drive,
                a USB drive, or any storage location.
              </p>
            </div>
          )}

          {/* ── Error ────────────────────────────────────────────── */}
          {status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
              <AlertTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-900">Export failed</p>
                <p className="text-xs text-red-700 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* ── History ─────────────────────────────────────────── */}
          {history.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Backup history ({history.length})
                </button>
                {showHistory && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    Clear history
                  </button>
                )}
              </div>

              {showHistory && (
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div
                      key={i}
                      className="text-xs bg-gray-50 rounded-md px-3 py-2 border border-gray-200 space-y-0.5"
                    >
                      <p className="font-mono text-gray-700 truncate">{h.fileName}</p>
                      <p className="text-gray-400">
                        {formatDate(h.runAt)} · {h.totalJobs} jobs ·{' '}
                        {h.totalAttachments} files · {formatSize(h.fileSizeKb)}
                        {h.failedAttachments > 0 && (
                          <span className="text-yellow-600 ml-1">· {h.failedAttachments} failed</span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={status === 'running'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
          >
            <XIcon className="w-3.5 h-3.5" />
            Close
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={status === 'running'}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === 'running' ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Running…
              </>
            ) : (
              <>
                <DownloadIcon className="w-3.5 h-3.5" />
                Download Backup
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
