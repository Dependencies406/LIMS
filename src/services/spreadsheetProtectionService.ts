/**
 * Spreadsheet protection: password to unlock locked cells.
 * Stores only a SHA-256 hash in Firestore; never stores plain password.
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const PROTECTION_DOC = 'system/spreadsheetProtection';

export interface SpreadsheetProtectionSettings {
  hasPassword: boolean;
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get protection settings (whether a password is set).
 * Does not return the hash to the UI; only hasPassword.
 */
export async function getProtectionSettings(): Promise<SpreadsheetProtectionSettings> {
  const docRef = doc(db, PROTECTION_DOC);
  const snap = await getDoc(docRef);
  const hash = snap.exists() ? (snap.data()?.unlockPasswordHash as string | undefined) : undefined;
  return {
    hasPassword: !!hash && hash.length > 0,
  };
}

/**
 * For internal use / password verification: get the stored hash.
 * Caller must only use it to compare with hashed input, not expose to UI.
 */
export async function getUnlockPasswordHash(): Promise<string | null> {
  const docRef = doc(db, PROTECTION_DOC);
  const snap = await getDoc(docRef);
  const hash = snap.exists() ? (snap.data()?.unlockPasswordHash as string | undefined) : undefined;
  return hash && hash.length > 0 ? hash : null;
}

/**
 * Verify that the given password matches the stored unlock password.
 */
export async function verifyUnlockPassword(password: string): Promise<boolean> {
  const storedHash = await getUnlockPasswordHash();
  if (!storedHash) return false;
  const inputHash = await hashPassword(password);
  return inputHash === storedHash;
}

/**
 * Set or change the unlock password. Pass empty string to clear.
 * Stores only the hash. Requires updatedBy (e.g. current user uid).
 */
export async function setUnlockPassword(
  newPassword: string,
  updatedBy: string
): Promise<void> {
  const docRef = doc(db, PROTECTION_DOC);
  if (!newPassword.trim()) {
    await setDoc(docRef, {
      unlockPasswordHash: null,
      updatedAt: serverTimestamp(),
      updatedBy,
    });
    return;
  }
  const hash = await hashPassword(newPassword.trim());
  await setDoc(
    docRef,
    {
      unlockPasswordHash: hash,
      updatedAt: serverTimestamp(),
      updatedBy,
    },
    { merge: true }
  );
}
