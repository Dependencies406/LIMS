"use strict";
/**
 * exportToDrive Cloud Function
 * Exports all LIMS job data + file attachments to a specified Google Drive folder.
 *
 * Setup required (one-time):
 *   1. Enable Google Drive API in Google Cloud Console
 *   2. Create a Service Account, download the JSON key
 *   3. firebase functions:secrets:set DRIVE_SERVICE_ACCOUNT  (paste the full JSON key)
 *   4. Share your target Drive folder with the service account email (Editor role)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportJobsToGoogleDrive = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const googleapis_1 = require("googleapis");
const stream_1 = require("stream");
// -------------------------------------------------------------------
// Secret: the full Google Service Account JSON (stored in Secret Manager)
// -------------------------------------------------------------------
const driveServiceAccount = (0, params_1.defineSecret)('DRIVE_SERVICE_ACCOUNT');
// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
/** Recursively convert Firestore Timestamps → ISO strings for JSON export */
function serializeDoc(obj) {
    if (obj === null || obj === undefined)
        return obj;
    // Firestore Timestamp (admin SDK)
    if (typeof obj === 'object' &&
        obj !== null &&
        '_seconds' in obj &&
        '_nanoseconds' in obj) {
        const ts = obj;
        return new Date(ts._seconds * 1000).toISOString();
    }
    // Firestore Timestamp (toDate method)
    if (typeof obj?.toDate === 'function') {
        return obj.toDate().toISOString();
    }
    if (Array.isArray(obj))
        return obj.map(serializeDoc);
    if (typeof obj === 'object') {
        const result = {};
        for (const [key, val] of Object.entries(obj)) {
            result[key] = serializeDoc(val);
        }
        return result;
    }
    return obj;
}
/** Convert a plain string/Buffer to a Readable stream */
function toStream(data) {
    const r = new stream_1.Readable();
    r.push(data);
    r.push(null);
    return r;
}
/** Sanitize a string for use as a Drive file/folder name */
function safeName(name, fallback = 'unnamed') {
    return (name || fallback).replace(/[/\\?%*:|"<>]/g, '_').slice(0, 100);
}
/** Create a Drive folder and return its ID */
async function createDriveFolder(drive, name, parentId) {
    const res = await drive.files.create({
        requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        },
        fields: 'id',
    });
    return res.data.id;
}
/** Upload a Buffer/string to Drive as a file */
async function uploadDriveFile(drive, name, mimeType, content, parentId) {
    await drive.files.create({
        requestBody: { name, parents: [parentId] },
        media: { mimeType, body: toStream(Buffer.isBuffer(content) ? content : Buffer.from(content)) },
    });
}
// -------------------------------------------------------------------
// Cloud Function
// -------------------------------------------------------------------
exports.exportJobsToGoogleDrive = (0, https_1.onCall)({
    secrets: [driveServiceAccount],
    timeoutSeconds: 540, // 9 minutes max
    memory: '1GiB',
    region: 'asia-southeast1',
    invoker: 'public', // Allow browser CORS preflight; auth is still enforced inside via request.auth
}, async (request) => {
    // ── Auth guard ────────────────────────────────────────────────
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be logged in to run a backup.');
    }
    const { folderId, permissions = [], includeAttachments = true, includeDeleted = false } = request.data;
    if (!folderId || typeof folderId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'folderId is required.');
    }
    // ── Init Firebase Admin ───────────────────────────────────────
    if (!admin.apps.length)
        admin.initializeApp();
    const db = admin.firestore();
    const bucket = admin.storage().bucket(); // default bucket
    // ── Init Google Drive ─────────────────────────────────────────
    let serviceAccountCredentials;
    try {
        serviceAccountCredentials = JSON.parse(driveServiceAccount.value());
    }
    catch {
        throw new https_1.HttpsError('internal', 'Invalid service account credentials. Check DRIVE_SERVICE_ACCOUNT secret.');
    }
    const auth = new googleapis_1.google.auth.GoogleAuth({
        credentials: serviceAccountCredentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = googleapis_1.google.drive({ version: 'v3', auth });
    // ── Verify target folder exists & is accessible ───────────────
    try {
        await drive.files.get({ fileId: folderId, fields: 'id,name' });
    }
    catch {
        throw new https_1.HttpsError('not-found', `Google Drive folder "${folderId}" not found or the service account has no access to it. ` +
            'Share the folder with the service account email (Editor role).');
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
        if (!includeDeleted && data.isDeleted === true)
            return false;
        return true;
    });
    const errors = [];
    let totalAttachments = 0;
    // ── Export each job ───────────────────────────────────────────
    for (const jobDoc of jobs) {
        const rawData = jobDoc.data();
        const jobId = rawData.jobId || jobDoc.id;
        const jobTitle = rawData.title || 'Untitled';
        try {
            // Create job subfolder: "SCS-CAL-26001 - Job Title"
            const jobFolderName = safeName(`${jobId} - ${jobTitle}`);
            const jobFolderId = await createDriveFolder(drive, jobFolderName, backupFolderId);
            // Serialize and upload job JSON
            const serialized = serializeDoc({ id: jobDoc.id, ...rawData });
            await uploadDriveFile(drive, 'job_data.json', 'application/json', JSON.stringify(serialized, null, 2), jobFolderId);
            // Upload file attachments
            if (includeAttachments) {
                const equipment = rawData.equipment || [];
                for (let eqIdx = 0; eqIdx < equipment.length; eqIdx++) {
                    const eq = equipment[eqIdx];
                    const attachments = eq.attachments || [];
                    if (attachments.length === 0)
                        continue;
                    // Create equipment subfolder
                    const eqFolderName = safeName(`equipment_${eqIdx}_${eq.name || 'unknown'}`);
                    const eqFolderId = await createDriveFolder(drive, eqFolderName, jobFolderId);
                    for (const att of attachments) {
                        try {
                            const storagePath = att.storagePath;
                            if (!storagePath) {
                                errors.push(`[${jobId}] Attachment missing storagePath: ${att.fileName}`);
                                continue;
                            }
                            // Download from Firebase Storage
                            const [fileBuffer] = await bucket.file(storagePath).download();
                            // Upload to Drive
                            await uploadDriveFile(drive, safeName(att.fileName || 'attachment'), att.fileType || 'application/octet-stream', fileBuffer, eqFolderId);
                            totalAttachments++;
                        }
                        catch (attErr) {
                            errors.push(`[${jobId}] Failed to upload "${att.fileName}": ${attErr.message}`);
                        }
                    }
                }
            }
        }
        catch (jobErr) {
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
    await uploadDriveFile(drive, '_backup_summary.json', 'application/json', JSON.stringify(summary, null, 2), backupFolderId);
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
        }
        catch (permErr) {
            const target = perm.email || perm.domain || perm.type;
            errors.push(`Failed to set permission for "${target}": ${permErr.message}`);
        }
    }
    // ── Get shareable link ────────────────────────────────────────
    const folderMeta = await drive.files.get({
        fileId: backupFolderId,
        fields: 'webViewLink',
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
});
//# sourceMappingURL=exportToDrive.js.map