/**
 * exportToDrive Cloud Function
 * Exports all LIMS job data + file attachments to a specified Google Drive folder.
 *
 * Setup required (one-time):
 *   1. Enable Google Drive API in Google Cloud Console
 *   2. Create an OAuth2 Desktop client in Cloud Console → Credentials
 *   3. Get a refresh token via Google OAuth Playground (developers.google.com/oauthplayground)
 *      - Scope: https://www.googleapis.com/auth/drive
 *      - Sign in as the Drive folder owner
 *   4. Store 3 secrets:
 *      firebase functions:secrets:set DRIVE_CLIENT_ID
 *      firebase functions:secrets:set DRIVE_CLIENT_SECRET
 *      firebase functions:secrets:set DRIVE_REFRESH_TOKEN
 *   5. Share your target Drive folder with the Google account used in step 3 (Editor role)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import { Readable } from 'stream';

// -------------------------------------------------------------------
// Secrets: OAuth2 user credentials (stored in Secret Manager)
// These allow uploads to run as the actual Google account owner,
// bypassing the service account "no storage quota" limitation.
// -------------------------------------------------------------------
const driveClientId     = defineSecret('DRIVE_CLIENT_ID');
const driveClientSecret = defineSecret('DRIVE_CLIENT_SECRET');
const driveRefreshToken = defineSecret('DRIVE_REFRESH_TOKEN');

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
export interface BackupPermission {
  /** 'user' requires email. 'domain' requires domain. 'anyone' needs neither. */
  type: 'user' | 'group' | 'domain' | 'anyone';
  /** 'reader' = view only | 'commenter' = view+comment | 'writer' = full edit */
  role: 'reader' | 'commenter' | 'writer';
  /** Required when type = 'user' or 'group' */
  email?: string;
  /** Required when type = 'domain' (e.g. 'yourcompany.com') */
  domain?: string;
}

export interface ExportRequest {
  /** Google Drive folder ID to place the backup inside */
  folderId: string;
  /** Permissions to apply to the new backup folder */
  permissions?: BackupPermission[];
  /** Whether to upload file attachments (default: true) */
  includeAttachments?: boolean;
  /** Whether to include soft-deleted jobs (default: false) */
  includeDeleted?: boolean;
}

export interface ExportResult {
  success: boolean;
  backupFolderName: string;
  backupFolderId: string;
  folderLink: string;
  summary: {
    exportedAt: string;
    totalJobs: number;
    totalAttachments: number;
    errors: string[];
  };
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** Recursively convert Firestore Timestamps → ISO strings for JSON export */
function serializeDoc(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  // Firestore Timestamp (admin SDK)
  if (
    typeof obj === 'object' &&
    obj !== null &&
    '_seconds' in obj &&
    '_nanoseconds' in obj
  ) {
    const ts = obj as { _seconds: number; _nanoseconds: number };
    return new Date(ts._seconds * 1000).toISOString();
  }
  // Firestore Timestamp (toDate method)
  if (typeof (obj as any)?.toDate === 'function') {
    return (obj as any).toDate().toISOString();
  }
  if (Array.isArray(obj)) return obj.map(serializeDoc);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeDoc(val);
    }
    return result;
  }
  return obj;
}

/** Convert a plain string/Buffer to a Readable stream */
function toStream(data: string | Buffer): Readable {
  const r = new Readable();
  r.push(data);
  r.push(null);
  return r;
}

/** Sanitize a string for use as a Drive file/folder name */
function safeName(name: string, fallback = 'unnamed'): string {
  return (name || fallback).replace(/[/\\?%*:|"<>]/g, '_').slice(0, 100);
}

/** Create a Drive folder and return its ID */
async function createDriveFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  const res = await drive.files.create({
    supportsAllDrives: true,   // required for Shared Drives
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return res.data.id!;
}

/** Upload a Buffer/string to Drive as a file */
async function uploadDriveFile(
  drive: ReturnType<typeof google.drive>,
  name: string,
  mimeType: string,
  content: Buffer | string,
  parentId: string
): Promise<void> {
  await drive.files.create({
    supportsAllDrives: true,   // required for Shared Drives
    requestBody: { name, parents: [parentId] },
    media: { mimeType, body: toStream(Buffer.isBuffer(content) ? content : Buffer.from(content)) },
  });
}

// -------------------------------------------------------------------
// Cloud Function
// -------------------------------------------------------------------
export const exportJobsToGoogleDrive = onCall(
  {
    secrets: [driveClientId, driveClientSecret, driveRefreshToken],
    timeoutSeconds: 540,   // 9 minutes max
    memory: '1GiB',
    region: 'asia-southeast1',
    invoker: 'public',     // Allow browser CORS preflight; auth is still enforced inside via request.auth
  },
  async (request): Promise<ExportResult> => {
    // ── Auth guard ────────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be logged in to run a backup.');
    }

    const { folderId, permissions = [], includeAttachments = true, includeDeleted = false } =
      request.data as ExportRequest;

    if (!folderId || typeof folderId !== 'string') {
      throw new HttpsError('invalid-argument', 'folderId is required.');
    }

    // ── Init Firebase Admin ───────────────────────────────────────
    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();
    const bucket = admin.storage().bucket(); // default bucket

    // ── Init Google Drive (OAuth2 user credentials) ───────────────
    // Using the actual Google account owner's credentials so uploads
    // count against their personal quota — not the service account's (which is 0).
    const oauth2Client = new google.auth.OAuth2(
      driveClientId.value(),
      driveClientSecret.value(),
    );
    oauth2Client.setCredentials({
      refresh_token: driveRefreshToken.value(),
    });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // ── Verify target folder exists & is accessible ───────────────
    try {
      await drive.files.get({ fileId: folderId, fields: 'id,name', supportsAllDrives: true });
    } catch {
      throw new HttpsError(
        'not-found',
        `Google Drive folder "${folderId}" not found or not accessible. ` +
          'Make sure the folder is shared with the Google account used to generate the refresh token.'
      );
    }

    // ── Create timestamped backup folder ──────────────────────────
    const timestamp = new Date()
      .toISOString()
      .replace('T', '_')
      .replace(/:/g, '-')
      .slice(0, 19); // e.g. 2025-04-28_14-30-00
    const backupFolderName = `LIMS_Backup_${timestamp}`;
    const backupFolderId = await createDriveFolder(drive, backupFolderName, folderId);

    // ── Fetch all jobs from Firestore ─────────────────────────────
    const jobsSnap = await db.collection('jobs').orderBy('createdAt', 'desc').get();
    const jobs = jobsSnap.docs.filter((d) => {
      const data = d.data();
      if (!includeDeleted && data.isDeleted === true) return false;
      return true;
    });

    const errors: string[] = [];
    let totalAttachments = 0;

    // ── Export each job ───────────────────────────────────────────
    for (const jobDoc of jobs) {
      const rawData = jobDoc.data();
      const jobId: string = rawData.jobId || jobDoc.id;
      const jobTitle: string = rawData.title || 'Untitled';

      try {
        // Create job subfolder: "SCS-CAL-26001 - Job Title"
        const jobFolderName = safeName(`${jobId} - ${jobTitle}`);
        const jobFolderId = await createDriveFolder(drive, jobFolderName, backupFolderId);

        // Serialize and upload job JSON
        const serialized = serializeDoc({ id: jobDoc.id, ...rawData });
        await uploadDriveFile(
          drive,
          'job_data.json',
          'application/json',
          JSON.stringify(serialized, null, 2),
          jobFolderId
        );

        // Upload file attachments
        if (includeAttachments) {
          const equipment: any[] = rawData.equipment || [];

          for (let eqIdx = 0; eqIdx < equipment.length; eqIdx++) {
            const eq = equipment[eqIdx];
            const attachments: any[] = eq.attachments || [];
            if (attachments.length === 0) continue;

            // Create equipment subfolder
            const eqFolderName = safeName(`equipment_${eqIdx}_${eq.name || 'unknown'}`);
            const eqFolderId = await createDriveFolder(drive, eqFolderName, jobFolderId);

            for (const att of attachments) {
              try {
                const storagePath: string = att.storagePath;
                if (!storagePath) {
                  errors.push(`[${jobId}] Attachment missing storagePath: ${att.fileName}`);
                  continue;
                }

                // Download from Firebase Storage
                const [fileBuffer] = await bucket.file(storagePath).download();

                // Upload to Drive
                await uploadDriveFile(
                  drive,
                  safeName(att.fileName || 'attachment'),
                  att.fileType || 'application/octet-stream',
                  fileBuffer,
                  eqFolderId
                );
                totalAttachments++;
              } catch (attErr: any) {
                errors.push(`[${jobId}] Failed to upload "${att.fileName}": ${attErr.message}`);
              }
            }
          }
        }
      } catch (jobErr: any) {
        errors.push(`Failed to process job "${jobId}": ${jobErr.message}`);
      }
    }

    // ── Upload summary JSON ───────────────────────────────────────
    const summary = {
      exportedAt: new Date().toISOString(),
      exportedBy: request.auth.token?.email || request.auth.uid,
      totalJobs: jobs.length,
      totalAttachments,
      includeAttachments,
      includeDeleted,
      errors,
    };

    await uploadDriveFile(
      drive,
      '_backup_summary.json',
      'application/json',
      JSON.stringify(summary, null, 2),
      backupFolderId
    );

    // ── Apply permissions to backup folder ────────────────────────
    for (const perm of permissions) {
      try {
        await drive.permissions.create({
          fileId: backupFolderId,
          requestBody: {
            role: perm.role,
            type: perm.type,
            emailAddress: perm.email,
            domain: perm.domain,
          },
          sendNotificationEmail: false,
        });
      } catch (permErr: any) {
        const target = perm.email || perm.domain || perm.type;
        errors.push(`Failed to set permission for "${target}": ${permErr.message}`);
      }
    }

    // ── Get shareable link ────────────────────────────────────────
    const folderMeta = await drive.files.get({
      fileId: backupFolderId,
      fields: 'webViewLink',
      supportsAllDrives: true,
    });

    return {
      success: errors.length === 0,
      backupFolderName,
      backupFolderId,
      folderLink: folderMeta.data.webViewLink || '',
      summary: {
        exportedAt: summary.exportedAt,
        totalJobs: summary.totalJobs,
        totalAttachments: summary.totalAttachments,
        errors,
      },
    };
  }
);
