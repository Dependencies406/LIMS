/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraftAutosave, findRecoverableDraft, mergeSaveState } from '../useDraftAutosave';
import type { DraftStorage } from '../../../../services/draftRecovery';

const mocks = vi.hoisted(() => ({
  updateDraftRecord: vi.fn(),
  commitRecord: vi.fn(),
}));

vi.mock('../../../../services/calibrationRecordService', () => ({
  calibrationRecordService: {
    updateDraftRecord: (...args: unknown[]) => mocks.updateDraftRecord(...args),
    commitRecord: (...args: unknown[]) => mocks.commitRecord(...args),
  },
}));

function fakeStorage(): DraftStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('useDraftAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.updateDraftRecord.mockReset();
    mocks.commitRecord.mockReset();
    mocks.updateDraftRecord.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes a local backup synchronously, before the debounce fires', () => {
    const storage = fakeStorage();
    renderHook(() =>
      useDraftAutosave({ recordId: 'rec1', rows: [{ A: 1 }], environment: [], enabled: true, storage }),
    );
    expect(storage.getItem('lims-draft-backup:rec1')).not.toBeNull();
    expect(mocks.updateDraftRecord).not.toHaveBeenCalled();
  });

  it('debounces the server save and calls updateDraftRecord with the latest rows/environment', async () => {
    const storage = fakeStorage();
    renderHook(() =>
      useDraftAutosave({ recordId: 'rec1', rows: [{ A: 1 }], environment: [], enabled: true, storage, debounceMs: 1000 }),
    );
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(mocks.updateDraftRecord).toHaveBeenCalledTimes(1);
    expect(mocks.updateDraftRecord).toHaveBeenCalledWith('rec1', { rows: [{ A: 1 }], environment: [] });
  });

  it('never calls commitRecord, no matter how many autosave cycles run', async () => {
    const storage = fakeStorage();
    const { rerender } = renderHook(
      ({ rows }) => useDraftAutosave({ recordId: 'rec1', rows, environment: [], enabled: true, storage, debounceMs: 500 }),
      { initialProps: { rows: [{ A: 1 }] } },
    );
    await act(async () => vi.advanceTimersByTime(500));
    rerender({ rows: [{ A: 2 }] });
    await act(async () => vi.advanceTimersByTime(500));
    rerender({ rows: [{ A: 3 }] });
    await act(async () => vi.advanceTimersByTime(500));

    expect(mocks.updateDraftRecord).toHaveBeenCalled();
    expect(mocks.commitRecord).not.toHaveBeenCalled();
  });

  it('does nothing at all — local or server — when disabled', async () => {
    const storage = fakeStorage();
    renderHook(() =>
      useDraftAutosave({ recordId: 'rec1', rows: [{ A: 1 }], environment: [], enabled: false, storage, debounceMs: 500 }),
    );
    await act(async () => vi.advanceTimersByTime(500));
    expect(storage.getItem('lims-draft-backup:rec1')).toBeNull();
    expect(mocks.updateDraftRecord).not.toHaveBeenCalled();
  });

  it('resets the debounce timer on rapid successive edits (only the final value is saved)', async () => {
    const storage = fakeStorage();
    const { rerender } = renderHook(
      ({ rows }) => useDraftAutosave({ recordId: 'rec1', rows, environment: [], enabled: true, storage, debounceMs: 1000 }),
      { initialProps: { rows: [{ A: 1 }] } },
    );
    await act(async () => vi.advanceTimersByTime(500));
    rerender({ rows: [{ A: 2 }] });
    await act(async () => vi.advanceTimersByTime(500));
    // Only 500ms since the second edit — should not have fired yet.
    expect(mocks.updateDraftRecord).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(500));
    expect(mocks.updateDraftRecord).toHaveBeenCalledTimes(1);
    expect(mocks.updateDraftRecord).toHaveBeenCalledWith('rec1', { rows: [{ A: 2 }], environment: [] });
  });
});

describe('findRecoverableDraft', () => {
  it('returns null when there is no local backup', () => {
    const storage = fakeStorage();
    expect(findRecoverableDraft('rec1', [], [], storage)).toBeNull();
  });

  it('returns the backup when it differs from the server (unintentional close)', () => {
    const storage = fakeStorage();
    storage.setItem(
      'lims-draft-backup:rec1',
      JSON.stringify({ recordId: 'rec1', rows: [{ A: 1 }], environment: [], savedAt: '2026-01-01T00:00:00.000Z' }),
    );
    const found = findRecoverableDraft('rec1', [{ A: 0 }], [], storage);
    expect(found?.rows).toEqual([{ A: 1 }]);
  });

  it('returns null when the local backup matches the server exactly (nothing to recover)', () => {
    const storage = fakeStorage();
    storage.setItem(
      'lims-draft-backup:rec1',
      JSON.stringify({ recordId: 'rec1', rows: [{ A: 1 }], environment: [], savedAt: '2026-01-01T00:00:00.000Z' }),
    );
    expect(findRecoverableDraft('rec1', [{ A: 1 }], [], storage)).toBeNull();
  });
});

// ── Phase 23 Task 4: mergeSaveState — Save Draft + autosave merged display ──

describe('mergeSaveState', () => {
  const idleAuto = { isSaving: false, lastSavedAt: null, lastError: null };
  const idleManual = { saving: false, savedAt: null, error: null };

  it('test 8: reports saving when either the manual save or autosave is in flight', () => {
    expect(mergeSaveState({ ...idleManual, saving: true }, idleAuto).saving).toBe(true);
    expect(mergeSaveState(idleManual, { ...idleAuto, isSaving: true }).saving).toBe(true);
    expect(mergeSaveState(idleManual, idleAuto).saving).toBe(false);
  });

  it('the MORE RECENT of the two savedAt timestamps wins, regardless of which source it came from', () => {
    const earlier = new Date('2026-01-01T10:00:00Z');
    const later = new Date('2026-01-01T10:05:00Z');

    // Manual save happened after the last autosave.
    expect(mergeSaveState({ ...idleManual, savedAt: later }, { ...idleAuto, lastSavedAt: earlier }).savedAt).toBe(later);
    // Autosave happened after the last manual save.
    expect(mergeSaveState({ ...idleManual, savedAt: earlier }, { ...idleAuto, lastSavedAt: later }).savedAt).toBe(later);
  });

  it('falls back to whichever source actually has a savedAt when the other has none', () => {
    const savedAt = new Date('2026-01-01T10:00:00Z');
    expect(mergeSaveState({ ...idleManual, savedAt }, idleAuto).savedAt).toBe(savedAt);
    expect(mergeSaveState(idleManual, { ...idleAuto, lastSavedAt: savedAt }).savedAt).toBe(savedAt);
    expect(mergeSaveState(idleManual, idleAuto).savedAt).toBeNull();
  });

  it('a manual save error is reported over a stale autosave error', () => {
    expect(mergeSaveState({ ...idleManual, error: 'manual failed' }, { ...idleAuto, lastError: 'auto failed' }).error).toBe(
      'manual failed',
    );
  });

  it('falls back to the autosave error when there is no manual error', () => {
    expect(mergeSaveState(idleManual, { ...idleAuto, lastError: 'auto failed' }).error).toBe('auto failed');
  });
});
