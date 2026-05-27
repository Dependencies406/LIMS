/**
 * Job Attachment Service
 * Handles file uploads and deletions for job-level attachments.
 *
 * Storage path: jobs/{jobDocId}/attachments/{timestamp}_{sanitizedFileName}
 * Firestore: attachments array on the jobs/{jobDocId} document (persisted on job save)
 */

import { storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import type { FileAttachment } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format bytes into a human-readable string (e.g. "1.2 MB"). */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Returns a simple icon-category string based on MIME type / extension. */
export type FileCategory = 'pdf' | 'image' | 'spreadsheet' | 'document' | 'other';

export function getFileCategory(mimeType: string, fileName: string): FileCategory {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    /\.(xlsx?|csv|ods)$/i.test(fileName)
  )
    return 'spreadsheet';
  if (
    mimeType.includes('word') ||
    mimeType.includes('document') ||
    mimeType.includes('text') ||
    /\.(docx?|txt|rtf|odt)$/i.test(fileName)
  )
    return 'document';
  return 'other';
}

// ─── Max file size ─────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload a single file to Firebase Storage under jobs/{jobDocId}/attachments/.
 * Returns a FileAttachment object with the download URL and storage path.
 *
 * @param jobDocId   - Firestore document ID of the job (may be a pre-generated ID for new jobs)
 * @param file       - The File object to upload
 * @param uploadedBy - UID of the authenticated user
 * @param onProgress - Optional callback receiving 0–100 progress
 */
export async function uploadJobAttachment(
  jobDocId: string,
  file: File,
  uploadedBy: string,
  onProgress?: (pct: number) => void
): Promise<FileAttachment> {
  const timestamp = Date.now();
  const sanitized = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const storageName = `${timestamp}_${sanitized}`;
  const storagePath = `jobs/${jobDocId}/attachments/${storageName}`;

  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise<FileAttachment>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress) {
          onProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        }
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          const attachment: FileAttachment = {
            id: `${timestamp}_${Math.random().toString(36).slice(2, 9)}`,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            url,
            storagePath,
            uploadedAt: new Date(),
            uploadedBy,
          };
          resolve(attachment);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a job attachment from Firebase Storage.
 * Firestore metadata is removed when the parent job document is next saved.
 */
export async function deleteJobAttachment(attachment: FileAttachment): Promise<void> {
  if (!attachment.storagePath) return; // legacy attachment without path — skip storage delete
  const storageRef = ref(storage, attachment.storagePath);
  await deleteObject(storageRef);
}
