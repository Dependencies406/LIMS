/**
 * useDraftAutosave.ts
 *
 * Task 5 (ADR-005): autosaves a Draft's rows/environment and enables
 * recovery after an unintentional close.
 *
 * - Every change is written to a local backup (`draftRecovery.ts`)
 *   SYNCHRONOUSLY — cheap and local, so even a crash the instant after a
 *   keystroke leaves a backup behind.
 * - The same change is written to the server via
 *   `calibrationRecordService.updateDraftRecord` on a debounce, since that's
 *   a network call. This hook imports ONLY `updateDraftRecord` — never
 *   `commitRecord` — so autosave cannot allocate a record number or freeze
 *   the record no matter how it fires; that guarantee is structural, not a
 *   runtime check. `updateDraftRecord` itself also re-checks status=='draft'
 *   transactionally server-side, so even a stray in-flight autosave that
 *   lands after a commit is rejected rather than corrupting a committed
 *   record.
 * - Recovery is offered by comparing the local backup against the server's
 *   last-known rows/environment (`localBackupDiffersFromServer`): they only
 *   differ when the debounced server save never completed — i.e. exactly
 *   the unintentional-close case. There is no separate "was this closed
 *   cleanly" flag to maintain; once local and server agree, there is
 *   nothing to recover, whether that agreement came from a normal autosave
 *   or from the user choosing to discard a stale backup.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { calibrationRecordService } from '../../../services/calibrationRecordService';
import {
  saveLocalDraftBackup,
  loadLocalDraftBackup,
  localBackupDiffersFromServer,
  type DraftStorage,
  type LocalDraftBackup,
} from '../../../services/draftRecovery';
import type { RecordRow, RoundEnvironment } from '../../../types';

function browserStorage(): DraftStorage | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

export interface UseDraftAutosaveOptions {
  recordId: string;
  rows: RecordRow[];
  environment: RoundEnvironment[];
  /** False for read-only / non-draft records — no autosave, local or server, runs at all. */
  enabled: boolean;
  debounceMs?: number;
  storage?: DraftStorage;
}

export interface UseDraftAutosaveResult {
  isSaving: boolean;
  lastSavedAt: Date | null;
  lastError: string | null;
}

/**
 * Phase 23 Task 4: RecordEntryPage's explicit "Save Draft" button writes
 * through the same `updateDraftRecord` path this hook's own debounced
 * autosave uses, but tracks its OWN saving/savedAt/error state locally
 * (this hook exposes no way to feed an external save into its internal
 * state). This merges the two for display, so "Saved at …" always reflects
 * whichever save — automatic or explicit — actually happened most
 * recently, and a save currently in flight on EITHER path shows as saving.
 */
export function mergeSaveState(
  manual: { saving: boolean; savedAt: Date | null; error: string | null },
  auto: UseDraftAutosaveResult,
): { saving: boolean; savedAt: Date | null; error: string | null } {
  const saving = manual.saving || auto.isSaving;
  const savedAt =
    manual.savedAt && (!auto.lastSavedAt || manual.savedAt > auto.lastSavedAt) ? manual.savedAt : auto.lastSavedAt;
  const error = manual.error ?? auto.lastError;
  return { saving, savedAt, error };
}

/** Call once, at mount, before the user has made any edits, to decide whether to offer recovery. */
export function findRecoverableDraft(
  recordId: string,
  serverRows: RecordRow[],
  serverEnvironment: RoundEnvironment[],
  storage?: DraftStorage,
): LocalDraftBackup | null {
  const store = storage ?? browserStorage();
  if (!store) return null;
  const local = loadLocalDraftBackup(store, recordId);
  if (!local) return null;
  return localBackupDiffersFromServer(local, serverRows, serverEnvironment) ? local : null;
}

export function useDraftAutosave({
  recordId,
  rows,
  environment,
  enabled,
  debounceMs = 1500,
  storage,
}: UseDraftAutosaveOptions): UseDraftAutosaveResult {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const store = useMemo(() => storage ?? browserStorage(), [storage]);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !store) return;

    saveLocalDraftBackup(store, recordId, rows, environment);

    const snapshot = JSON.stringify({ rows, environment });
    if (snapshot === lastSavedSnapshotRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsSaving(true);
      calibrationRecordService
        .updateDraftRecord(recordId, { rows, environment })
        .then(() => {
          lastSavedSnapshotRef.current = snapshot;
          setLastSavedAt(new Date());
          setLastError(null);
        })
        .catch((error: unknown) => {
          setLastError(error instanceof Error ? error.message : 'Failed to save draft');
        })
        .finally(() => setIsSaving(false));
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, rows, environment, enabled, store, debounceMs]);

  return { isSaving, lastSavedAt, lastError };
}
