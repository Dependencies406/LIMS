/**
 * JobAttachmentsPanel
 * Displays and manages file attachments for a job (Notes tab).
 *
 * - Drag-and-drop or click-to-browse
 * - Multiple concurrent uploads with per-file progress
 * - Download / delete per attachment
 * - 50 MB limit per file
 * - Uploads go to Firebase Storage immediately; metadata is persisted when the
 *   parent job form is saved.
 */

import React, { useState, useCallback, useRef } from 'react';
import type { FileAttachment } from '../types';
import {
  uploadJobAttachment,
  deleteJobAttachment,
  formatFileSize,
  getFileCategory,
  MAX_FILE_SIZE_BYTES,
  type FileCategory,
} from '../services/jobAttachmentService';

// ─── Icons ────────────────────────────────────────────────────────────────────

const UploadCloudIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const SpinnerIcon = () => (
  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

// ─── File type icon / colour ──────────────────────────────────────────────────

interface FileBadgeConfig {
  bg: string;
  text: string;
  label: string;
  icon: React.ReactNode;
}

function getFileBadge(cat: FileCategory): FileBadgeConfig {
  switch (cat) {
    case 'pdf':
      return {
        bg: 'bg-red-50 border-red-100',
        text: 'text-red-600',
        label: 'PDF',
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        ),
      };
    case 'image':
      return {
        bg: 'bg-purple-50 border-purple-100',
        text: 'text-purple-600',
        label: 'IMG',
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        ),
      };
    case 'spreadsheet':
      return {
        bg: 'bg-green-50 border-green-100',
        text: 'text-green-600',
        label: 'XLS',
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
            <line x1="12" y1="13" x2="12" y2="17" />
          </svg>
        ),
      };
    case 'document':
      return {
        bg: 'bg-blue-50 border-blue-100',
        text: 'text-blue-600',
        label: 'DOC',
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="13" y1="17" x2="8" y2="17" />
          </svg>
        ),
      };
    default:
      return {
        bg: 'bg-gray-50 border-gray-200',
        text: 'text-gray-500',
        label: 'FILE',
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
        ),
      };
  }
}

// ─── Upload-in-progress entry ─────────────────────────────────────────────────

interface PendingUpload {
  id: string;         // temp client-side key
  fileName: string;
  fileSize: number;
  progress: number;   // 0–100
  error?: string;
}

// ─── Date formatting ──────────────────────────────────────────────────────────

function formatDate(d: Date | unknown): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date((d as any).seconds ? (d as any).seconds * 1000 : d as any);
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface JobAttachmentsPanelProps {
  /** Firestore document ID of the job (may be pre-generated for a new job). */
  jobDocId: string;
  attachments: FileAttachment[];
  onAttachmentsChange: (attachments: FileAttachment[]) => void;
  currentUserId: string;
  isReadOnly?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const JobAttachmentsPanel: React.FC<JobAttachmentsPanelProps> = ({
  jobDocId,
  attachments,
  onAttachmentsChange,
  currentUserId,
  isReadOnly = false,
}) => {
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload handler ──────────────────────────────────────────────────────────

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || isReadOnly) return;

      const fileArray = Array.from(files);

      // Validate sizes first
      const oversized = fileArray.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
      if (oversized.length > 0) {
        alert(
          `${oversized.map((f) => f.name).join(', ')} exceed${oversized.length === 1 ? 's' : ''} the 50 MB limit.`
        );
        return;
      }

      // Create pending entries
      const pending: PendingUpload[] = fileArray.map((f) => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        fileName: f.name,
        fileSize: f.size,
        progress: 0,
      }));
      setPendingUploads((prev) => [...prev, ...pending]);

      // Upload concurrently; collect all results before calling onAttachmentsChange
      // once — avoids stale-closure overwriting when multiple files finish in parallel.
      const succeeded: FileAttachment[] = [];

      await Promise.allSettled(
        fileArray.map(async (file, i) => {
          const pendingId = pending[i].id;
          try {
            const attachment = await uploadJobAttachment(
              jobDocId,
              file,
              currentUserId,
              (pct) => {
                setPendingUploads((prev) =>
                  prev.map((p) => (p.id === pendingId ? { ...p, progress: pct } : p))
                );
              }
            );
            succeeded.push(attachment);
            setPendingUploads((prev) => prev.filter((p) => p.id !== pendingId));
          } catch (err) {
            console.error('Upload failed:', err);
            setPendingUploads((prev) =>
              prev.map((p) =>
                p.id === pendingId ? { ...p, error: 'Upload failed. Please try again.' } : p
              )
            );
          }
        })
      );

      // Commit all newly uploaded attachments in a single call
      if (succeeded.length > 0) {
        onAttachmentsChange([...attachments, ...succeeded]);
      }
    },
    [jobDocId, currentUserId, attachments, onAttachmentsChange, isReadOnly]
  );

  // ── Drag events ─────────────────────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = async (attachment: FileAttachment) => {
    if (!window.confirm(`Delete "${attachment.name}"? This cannot be undone.`)) return;
    setDeletingId(attachment.id);
    try {
      await deleteJobAttachment(attachment);
    } catch (err) {
      // Storage deletion failed (e.g. network offline) — log it but still remove
      // the reference from the list so the badge and UI update correctly.
      // The orphaned file in Storage can be cleaned up via Firebase Console if needed.
      console.warn('Storage delete failed (file reference removed anyway):', err);
    } finally {
      // Always remove from local state regardless of storage outcome
      onAttachmentsChange(attachments.filter((a) => a.id !== attachment.id));
      setDeletingId(null);
    }
  };

  // ── Remove failed upload ─────────────────────────────────────────────────────

  const dismissError = (id: string) =>
    setPendingUploads((prev) => prev.filter((p) => p.id !== id));

  // ── Render ──────────────────────────────────────────────────────────────────

  const hasFiles = attachments.length > 0 || pendingUploads.length > 0;

  return (
    <div className="space-y-3">
      {/* Drop zone — hidden when read-only */}
      {!isReadOnly && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`group relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-colors select-none ${
            dragging
              ? 'border-primary-400 bg-primary-50'
              : 'border-gray-200 bg-white hover:border-primary-300 hover:bg-primary-50/40'
          }`}
        >
          <div className={`transition-colors ${dragging ? 'text-primary-500' : 'text-gray-300 group-hover:text-primary-400'}`}>
            <UploadCloudIcon />
          </div>
          <div className="text-center">
            <p className={`text-xs font-medium transition-colors ${dragging ? 'text-primary-600' : 'text-gray-500 group-hover:text-primary-600'}`}>
              {dragging ? 'Drop to upload' : 'Click or drag files here'}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">Any file type · Max 50 MB each</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* File list */}
      {hasFiles && (
        <div className="space-y-1.5">
          {/* Committed attachments */}
          {attachments.map((att) => {
            const cat = getFileCategory(att.type, att.name);
            const badge = getFileBadge(cat);
            const isDeleting = deletingId === att.id;

            return (
              <div
                key={att.id}
                className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5 group hover:border-gray-200 hover:bg-gray-50 transition-colors"
              >
                {/* Icon */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center ${badge.bg} ${badge.text}`}>
                  {badge.icon}
                </div>

                {/* Meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate leading-tight">{att.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {formatFileSize(att.size)}
                    {att.uploadedAt && <> · {formatDate(att.uploadedAt)}</>}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Download"
                    className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-primary-50 hover:text-primary-600 hover:border-primary-200 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DownloadIcon />
                  </a>
                  {!isReadOnly && (
                    <button
                      type="button"
                      title="Delete"
                      disabled={isDeleting}
                      onClick={() => handleDelete(att)}
                      className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-40"
                    >
                      {isDeleting ? <SpinnerIcon /> : <TrashIcon />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pending / in-progress uploads */}
          {pendingUploads.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-gray-100 bg-white px-3 py-2.5"
            >
              {p.error ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg border border-red-100 bg-red-50 flex items-center justify-center text-red-400">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{p.fileName}</p>
                      <p className="text-[10px] text-red-500">{p.error}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissError(p.id)}
                    className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg border border-primary-100 bg-primary-50 flex items-center justify-center text-primary-400">
                    <SpinnerIcon />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-700 truncate">{p.fileName}</p>
                      <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{Math.round(p.progress)}%</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all duration-200"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{formatFileSize(p.fileSize)}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state (only when read-only and no files) */}
      {isReadOnly && !hasFiles && (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <svg className="w-8 h-8 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
          <p className="text-xs">No attachments</p>
        </div>
      )}
    </div>
  );
};
