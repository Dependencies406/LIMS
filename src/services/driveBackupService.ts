/**
 * Backup Service
 * Creates a ZIP archive containing all LIMS job data (JSON) + actual attachment files,
 * then triggers a browser download. No Cloud Function or Google setup required.
 */

import JSZip from 'jszip';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { getStorage, ref, getBytes } from 'firebase/storage';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BackupOptions {
  includeDeleted?: boolean;
  /** Called during download to report progress */
  onProgress?: (step: string, current: number, total: number) => void;
}

export interface BackupResult {
  fileName: string;
  totalJobs: number;
  totalAttachments: number;
  failedAttachments: number;
  exportedAt: string;
  fileSizeKb: number;
}

// ── History (localStorage) ────────────────────────────────────────────────────

const HISTORY_KEY = 'lims_backup_history';
const MAX_HISTORY = 10;

export interface BackupHistoryEntry {
  runAt: string;
  fileName: string;
  totalJobs: number;
  totalAttachments: number;
  failedAttachments: number;
  fileSizeKb: number;
}

export function saveBackupHistory(result: BackupResult): void {
  const entry: BackupHistoryEntry = {
    runAt: result.exportedAt,
    fileName: result.fileName,
    totalJobs: result.totalJobs,
    totalAttachments: result.totalAttachments,
    failedAttachments: result.failedAttachments,
    fileSizeKb: result.fileSizeKb,
  };
  try {
    const existing: BackupHistoryEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const updated = [entry, ...existing].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function getBackupHistory(): BackupHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearBackupHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recursively convert Firestore Timestamps → ISO strings */
function serializeFirestore(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'object' && obj !== null) {
    if (typeof (obj as any).toDate === 'function') {
      return (obj as any).toDate().toISOString();
    }
    if ('_seconds' in obj && '_nanoseconds' in obj) {
      const ts = obj as { _seconds: number; _nanoseconds: number };
      return new Date(ts._seconds * 1000).toISOString();
    }
    if (Array.isArray(obj)) return obj.map(serializeFirestore);
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeFirestore(val);
    }
    return result;
  }
  return obj;
}

/** Make a string safe for use as a file/folder name inside a ZIP */
function safeName(name: string, fallback = 'unnamed'): string {
  return (name || fallback)
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim()
    .slice(0, 80);
}

/** Trigger a browser download from a Blob */
function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Timestamp string safe for filenames: 2026-04-28_14-30-00 */
function fileTimestamp(): string {
  return new Date()
    .toISOString()
    .replace('T', '_')
    .replace(/:/g, '-')
    .slice(0, 19);
}

// ── Main export function ──────────────────────────────────────────────────────

/**
 * Build a ZIP backup of all LIMS jobs including actual attachment files.
 *
 * ZIP structure:
 *   LIMS_Backup_YYYY-MM-DD_HH-MM-SS.zip
 *   ├── backup_data.json              ← all job data
 *   └── attachments/
 *       ├── SCS-CAL-26001 - Job Title/
 *       │   ├── equipment_0_Multimeter/
 *       │   │   └── calibration_cert.xlsx
 *       │   └── equipment_1_Thermometer/
 *       │       └── photo.jpg
 *       └── SCS-CAL-26002 - Another Job/
 *           └── ...
 */
export async function downloadBackup(options: BackupOptions = {}): Promise<BackupResult> {
  const { includeDeleted = false, onProgress } = options;
  const db = getFirestore();
  const storage = getStorage();

  // ── Step 1: Fetch all jobs ───────────────────────────────────────
  onProgress?.('Fetching job data…', 0, 1);

  const snapshot = await getDocs(
    query(collection(db, 'jobs'), orderBy('createdAt', 'desc'))
  );

  const allDocs = snapshot.docs;
  const filteredDocs = includeDeleted
    ? allDocs
    : allDocs.filter((d) => d.data().isDeleted !== true);

  const jobs = filteredDocs.map((d) => ({
    _docId: d.id,
    ...(serializeFirestore(d.data()) as Record<string, unknown>),
  }));

  // ── Step 2: Count total attachments across all jobs ──────────────
  let totalAttachments = 0;
  for (const job of jobs) {
    const equipment: any[] = (job.equipment as any[]) || [];
    for (const eq of equipment) {
      totalAttachments += (eq.attachments || []).length;
    }
  }

  // ── Step 3: Build ZIP ────────────────────────────────────────────
  const zip = new JSZip();
  const attachmentsFolder = zip.folder('attachments')!;

  let downloadedCount = 0;
  let failedAttachments = 0;
  const errors: string[] = [];

  for (const job of jobs) {
    const jobId: string = (job.jobId as string) || (job._docId as string);
    const jobTitle: string = (job.title as string) || 'Untitled';
    const jobFolderName = safeName(`${jobId} - ${jobTitle}`);
    const jobFolder = attachmentsFolder.folder(jobFolderName)!;

    const equipment: any[] = (job.equipment as any[]) || [];

    for (let eqIdx = 0; eqIdx < equipment.length; eqIdx++) {
      const eq = equipment[eqIdx];
      const attachments: any[] = eq.attachments || [];
      if (attachments.length === 0) continue;

      const eqFolderName = safeName(`equipment_${eqIdx}_${eq.name || 'unknown'}`);
      const eqFolder = jobFolder.folder(eqFolderName)!;

      for (const att of attachments) {
        downloadedCount++;
        const label = `${jobId} / ${att.fileName || 'file'}`;
        onProgress?.(`Downloading: ${label}`, downloadedCount, totalAttachments);

        try {
          const storagePath: string = att.storagePath;
          if (!storagePath) {
            errors.push(`[${jobId}] Missing storagePath for "${att.fileName}"`);
            failedAttachments++;
            continue;
          }

          // Download from Firebase Storage
          const fileRef = ref(storage, storagePath);
          const fileBytes = await getBytes(fileRef);

          // Add to ZIP
          const safeFileName = safeName(att.fileName || `file_${downloadedCount}`);
          eqFolder.file(safeFileName, fileBytes);
        } catch (err: any) {
          failedAttachments++;
          errors.push(`[${jobId}] Failed "${att.fileName}": ${err.message}`);
        }
      }
    }
  }

  // ── Step 4: Add JSON data file ───────────────────────────────────
  onProgress?.('Creating backup file…', totalAttachments, totalAttachments);

  const exportedAt = new Date().toISOString();
  const backupData = {
    meta: {
      exportedAt,
      appVersion: 'LIMS',
      totalJobs: jobs.length,
      totalAttachments,
      failedAttachments,
      includeDeleted,
      errors: errors.length > 0 ? errors : undefined,
    },
    jobs,
  };

  zip.file('backup_data.json', JSON.stringify(backupData, null, 2));

  // ── Step 5: Generate and download ZIP ────────────────────────────
  onProgress?.('Compressing…', totalAttachments, totalAttachments);

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const timestamp = fileTimestamp();
  const fileName = `LIMS_Backup_${timestamp}.zip`;
  triggerDownload(zipBlob, fileName);

  const fileSizeKb = Math.round(zipBlob.size / 1024);

  return {
    fileName,
    totalJobs: jobs.length,
    totalAttachments,
    failedAttachments,
    exportedAt,
    fileSizeKb,
  };
}
