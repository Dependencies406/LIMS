/**
 * draftRecovery.ts
 *
 * Task 5 (ADR-005: "the unintentional close handler... must never
 * auto-commit"). Local-storage-backed safety net for an in-progress Draft:
 * the debounced server autosave (`updateDraftRecord`) can lose the last few
 * keystrokes if the tab closes mid-debounce, so every change is also written
 * synchronously to localStorage. On reopening a draft, the caller compares
 * this local backup against the server's last-saved rows/environment; if
 * they differ, that is exactly the signature of an unintentional close, and
 * the caller can offer to restore it.
 *
 * `storage` is injected (rather than reading `window.localStorage` directly)
 * so this stays pure and unit-testable without a DOM environment.
 */

import type { RecordRow, RoundEnvironment } from '../types';

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalDraftBackup {
  recordId: string;
  rows: RecordRow[];
  environment: RoundEnvironment[];
  savedAt: string;
}

const KEY_PREFIX = 'lims-draft-backup:';

function keyFor(recordId: string): string {
  return `${KEY_PREFIX}${recordId}`;
}

export function saveLocalDraftBackup(
  storage: DraftStorage,
  recordId: string,
  rows: RecordRow[],
  environment: RoundEnvironment[],
): void {
  const backup: LocalDraftBackup = { recordId, rows, environment, savedAt: new Date().toISOString() };
  storage.setItem(keyFor(recordId), JSON.stringify(backup));
}

export function loadLocalDraftBackup(storage: DraftStorage, recordId: string): LocalDraftBackup | null {
  const raw = storage.getItem(keyFor(recordId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.recordId === recordId &&
      Array.isArray(parsed.rows) &&
      Array.isArray(parsed.environment) &&
      typeof parsed.savedAt === 'string'
    ) {
      return parsed as LocalDraftBackup;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearLocalDraftBackup(storage: DraftStorage, recordId: string): void {
  storage.removeItem(keyFor(recordId));
}

/** True when the local backup holds content the server doesn't have — the signal an unintentional close actually happened. */
export function localBackupDiffersFromServer(
  local: LocalDraftBackup,
  serverRows: RecordRow[],
  serverEnvironment: RoundEnvironment[],
): boolean {
  return (
    JSON.stringify(local.rows) !== JSON.stringify(serverRows) ||
    JSON.stringify(local.environment) !== JSON.stringify(serverEnvironment)
  );
}
