/**
 * jobShareTokenService.ts
 *
 * Creates and manages temporary customer-signing tokens stored in the
 * `jobShareTokens` Firestore collection.
 *
 * Security model:
 *  - Tokens are public-readable (so the unauthenticated sign page can load them).
 *  - Only authenticated users may CREATE tokens.
 *  - Unauthenticated users may UPDATE a token ONLY to set `customerSignature`
 *    and `used` — the Firestore rule enforces the field restriction.
 *  - Token lifespan: TOKEN_TTL_MS (12 hours).
 */

import {
  db,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from './firebase';
import type { Job, JobShareToken, DigitalSignature } from '../types';

/** How long a signing link stays valid (12 hours). */
export const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const COLLECTION = 'jobShareTokens';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically random token string (URL-safe). */
function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Convert a Firestore value to a Date (handles Timestamp and plain dates).
 *  Returns epoch (Jan 1 1970) for null/undefined so callers that check
 *  "now > expiresAt" correctly treat missing expiry as already-expired.
 */
function toDate(value: unknown): Date {
  if (!value) return new Date(0); // treat missing/null as epoch (expired)
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && 'toDate' in (value as object)) {
    return (value as { toDate: () => Date }).toDate();
  }
  const d = new Date(value as string | number);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively removes keys whose value is `undefined` from a plain object.
 * Firestore rejects documents that contain `undefined` — this prevents that error.
 */
function stripUndefined<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined) as unknown as T;
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefined(v)]),
  ) as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new share token for the given job.
 * Returns the token string (used as both the Firestore doc ID and the URL
 * path parameter).
 *
 * Must be called by an authenticated user.
 */
export async function createShareToken(job: Job, createdByUid: string): Promise<string> {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  const snapshot = stripUndefined({
    title: job.title,
    ...(job.customerName        ? { customerName: job.customerName }               : {}),
    customerContact:               job.customerContact,
    ...(job.customerAddress     ? { customerAddress: job.customerAddress }         : {}),
    ...(job.customerPhone       ? { customerPhone: job.customerPhone }             : {}),
    ...(job.customerEmail       ? { customerEmail: job.customerEmail }             : {}),
    status:                        job.status,
    ...(job.appointmentDate     ? { scheduleDate: job.appointmentDate }            : {}),
    equipment:                     (job.equipment ?? []).map(eq => stripUndefined(eq)),
    ...(job.serviceInformation  ? {
      serviceInformation: stripUndefined({
        serviceRequested:      job.serviceInformation.serviceRequested,
        statementOfConformity: job.serviceInformation.statementOfConformity,
      }),
    } : {}),
    workAuthorizationStatement:    job.workAuthorization?.workAuthorizationStatement ?? '',
    ...(job.comments            ? { comments: job.comments }                       : {}),
  });

  const tokenDoc = {
    jobId:      job.id,
    jobNumber:  job.jobId,
    jobSnapshot: snapshot,
    expiresAt:  Timestamp.fromDate(expiresAt),
    createdAt:  serverTimestamp(),
    createdBy:  createdByUid,
    used:       false,
  };

  await setDoc(doc(db, COLLECTION, token), tokenDoc);

  return token;
}

/**
 * Loads a share token document from Firestore.
 * Returns null if the token doesn't exist, has expired, or was already used.
 */
export async function getShareToken(tokenId: string): Promise<JobShareToken | null> {
  const snap = await getDoc(doc(db, COLLECTION, tokenId));
  if (!snap.exists()) return null;

  const data = snap.data();
  const expiresAt = toDate(data.expiresAt);

  if (new Date() > expiresAt) return null;   // expired
  if (data.used) return null;                // already signed

  return {
    id: snap.id,
    jobId: data.jobId,
    jobNumber: data.jobNumber,
    jobSnapshot: data.jobSnapshot,
    expiresAt,
    createdAt: toDate(data.createdAt),
    createdBy: data.createdBy,
    used: data.used,
    customerSignature: data.customerSignature,
  } as JobShareToken;
}

/**
 * Same as `getShareToken` but does NOT filter by expiry / used status.
 * Used internally to display a "token was already signed" message on the
 * customer-sign page even after the token is consumed.
 */
export async function getShareTokenRaw(tokenId: string): Promise<JobShareToken | null> {
  const snap = await getDoc(doc(db, COLLECTION, tokenId));
  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    id: snap.id,
    jobId: data.jobId,
    jobNumber: data.jobNumber,
    jobSnapshot: data.jobSnapshot,
    expiresAt: toDate(data.expiresAt),
    createdAt: toDate(data.createdAt),
    createdBy: data.createdBy,
    used: data.used,
    customerSignature: data.customerSignature,
  } as JobShareToken;
}

/**
 * Records the customer's signature on the token document.
 * This is an unauthenticated write — Firestore rules restrict it to
 * setting only `customerSignature` and `used` on unexpired, unsigned tokens.
 */
export async function signShareToken(
  tokenId: string,
  signature: DigitalSignature,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, tokenId), {
    customerSignature: {
      signatureData: signature.signatureData,
      signerName: signature.signerName,
      signedDate: signature.signedDate instanceof Date
        ? Timestamp.fromDate(signature.signedDate)
        : signature.signedDate,
    },
    used: true,
  });
}

/**
 * Looks for a pending (signed-but-not-yet-imported) signature for a job.
 * Returns the first matching signature found, or null.
 *
 * Only searches tokens that have `used === true` AND have a `customerSignature`.
 * The job modal calls this on mount to auto-import customer signatures.
 */
export async function getPendingSignatureForJob(
  jobId: string,
): Promise<{ tokenId: string; signature: DigitalSignature } | null> {
  const q = query(
    collection(db, COLLECTION),
    where('jobId', '==', jobId),
    where('used', '==', true),
  );

  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const data = d.data();
    if (data.customerSignature?.signatureData) {
      return {
        tokenId: d.id,
        signature: {
          signatureData: data.customerSignature.signatureData,
          signerName: data.customerSignature.signerName ?? '',
          signedDate: toDate(data.customerSignature.signedDate),
        },
      };
    }
  }

  return null;
}

/**
 * Deletes a token document after the signature has been imported into the job.
 * Must be called by an authenticated user.
 */
export async function deleteShareToken(tokenId: string): Promise<void> {
  const { deleteDoc } = await import('./firebase');
  await deleteDoc(doc(db, COLLECTION, tokenId));
}

/**
 * Returns the full public URL for a sharing token.
 * Uses VITE_APP_URL (the production hosting URL) when available,
 * so links always point to the live site even when generated from localhost.
 * Falls back to window.location.origin for local-only dev setups.
 */
export function buildSigningUrl(token: string): string {
  const base =
    (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') ||
    window.location.origin;
  return `${base}/customer-sign/${token}`;
}
