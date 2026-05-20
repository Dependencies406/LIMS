import React, { useRef, useState, useCallback } from 'react';
import type { FileAttachment } from '../types';
import { db, doc, updateDoc, serverTimestamp, deleteField } from '../services/firebase';
import {
  uploadStatementOfConformityReferencePdf,
  deleteJobAttachment,
  formatFileSize,
} from '../services/fileUploadService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
export type StatementOfConformityPdfUploadProps = {
  jobId: string;
  attachment?: FileAttachment;
  disabled?: boolean;
  onUpdated: () => void;
};

export const StatementOfConformityPdfUpload: React.FC<StatementOfConformityPdfUploadProps> = ({
  jobId,
  attachment,
  disabled = false,
  onUpdated,
}) => {
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handlePick = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  const handleFile = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || !currentUser) return;
      const file = files[0];
      setUploading(true);
      try {
        if (attachment?.id) {
          await deleteJobAttachment(attachment.id);
        }
        const meta = await uploadStatementOfConformityReferencePdf(
          jobId,
          file,
          currentUser.uid,
        );
        await updateDoc(doc(db, 'jobs', jobId), {
          'serviceInformation.statementOfConformityReferencePdf': {
            id: meta.id,
            name: meta.name,
            size: meta.size,
            type: meta.type,
            url: meta.url,
            uploadedAt: meta.uploadedAt,
            uploadedBy: meta.uploadedBy,
          },
          updatedAt: serverTimestamp(),
        });
        success('Statement of conformity reference PDF uploaded');
        onUpdated();
      } catch (e) {
        showError(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [jobId, currentUser, attachment?.id, success, showError, onUpdated]
  );

  const handleRemove = async () => {
    if (!attachment?.id || disabled || deleting) return;
    if (!window.confirm('Remove this PDF from the job?')) return;
    setDeleting(true);
    try {
      await deleteJobAttachment(attachment.id);
      await updateDoc(doc(db, 'jobs', jobId), {
        'serviceInformation.statementOfConformityReferencePdf': deleteField(),
        updatedAt: serverTimestamp(),
      });
      success('Reference PDF removed');
      onUpdated();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-800 mb-1">Reference document (PDF)</p>
      <p className="text-xs text-gray-500 mb-3">
        Optional. Upload a signed paper or other PDF reference alongside the requirements above.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files)}
        disabled={disabled || uploading}
      />

      {attachment ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-600 hover:underline truncate min-w-0"
          >
            {attachment.name}
          </a>
          <span className="text-xs text-gray-500 shrink-0">
            {formatFileSize(attachment.size)}
          </span>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePick}
              disabled={disabled || uploading || deleting}
              className="text-sm px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={disabled || uploading || deleting}
              className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handlePick}
          disabled={disabled || uploading}
          className="text-sm px-4 py-2 rounded-lg border border-primary-300 bg-primary-50 text-primary-900 hover:bg-primary-100 disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Upload PDF'}
        </button>
      )}
    </div>
  );
};
