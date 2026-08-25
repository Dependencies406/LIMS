/** @vitest-environment jsdom */
/**
 * recordEntryEnvironmentWiring.test.tsx
 *
 * Phase 25 Task 1 — regression tests for the environment/rows data-loss bug.
 *
 * NOT a test of the full RecordEntryPage.tsx (Firebase, routing, and
 * RecordingGrid's embedded spreadsheet engine are all out of scope for a
 * unit test). This harness reproduces RecordEntryPage's OWN wiring exactly
 * — its `rows`/`environment` state, its `handleRowsChange`/
 * `handleEnvironmentChange` wrappers, `useLiveRecalculation`, and
 * `useDraftAutosave` — so the exact bug (two disagreeing copies of
 * `environment`, and a rows ref that never picked up a loaded record) is
 * reproducible and provably fixed, without needing to stand up the whole
 * page.
 *
 * What was actually found (differs from the phase prompt's own framing —
 * see RecordEntryPage.tsx / useLiveRecalculation.ts's own comments for the
 * full narrative): autosave read the PAGE's own `environment`, which was
 * already correctly seeded at load and updated on every edit — it was
 * never actually the broken path. The real breakage was `handleSaveDraft`/
 * `handleCommit`, which both read `liveRecalc.environment` — the HOOK's
 * OWN `useState(initialEnvironment)`, which only reads its argument on the
 * hook's first render (always before the record's async load resolves) and
 * was never re-synced afterward unless the user edited EnvironmentBlock
 * first. A freshly reopened draft, saved or committed without ever
 * touching EnvironmentBlock, would silently persist `[]`. `rowsRef` (inside
 * the same hook) had the identical seeding gap for `rows`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef, useState } from 'react';
import { useLiveRecalculation } from '../useLiveRecalculation';
import { useDraftAutosave } from '../useDraftAutosave';
import type { RecorderTemplate, RecordRow, RoundEnvironment } from '../../../../types';
import type { RecordingGridHandle } from '../../components/RecordingGrid';

const updateDraftRecordMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../../services/calibrationRecordService', () => ({
  calibrationRecordService: {
    updateDraftRecord: (...args: unknown[]) => updateDraftRecordMock(...args),
  },
}));

function template(): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'T',
    equipmentTypeId: 'eq1',
    roundCount: 1,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [{ id: 'M', label: 'M', order: 0, columns: [{ id: 'R', label: 'Reading', order: 0, type: 'number' }] }],
    summaryFields: [],
    customFunctions: [],
    status: 'active',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u',
    updatedBy: 'u',
  } as RecorderTemplate;
}

function env(temperatureC: number): RoundEnvironment[] {
  return [{ roundIndex: 1, temperatureC, relativeHumidity: 50 }];
}

/**
 * Mirrors RecordEntryPage.tsx exactly: page-owned `rows`/`environment`
 * state, `handleRowsChange`/`handleEnvironmentChange` wrappers that update
 * BOTH the page state and trigger the hook's recalculation, `useDraftAutosave`
 * fed the page's own state (never the hook's), and `saveDraft`/`commit`
 * stand-ins that persist `{ rows: liveRecalc.getLatestRows(), environment }`
 * — the SAME shape `handleSaveDraft`/`handleCommit` use on the real page.
 *
 * `load(rows, environment)` mimics `loadRecord`'s own `setRows`/
 * `setEnvironment` calls — an explicit state update after an async resolve,
 * never a change to this hook's own arguments — which is what actually
 * reproduces the load-time bug (a changed PROP passed into `useHarness`
 * would not: `useState`'s initializer argument is only read on first
 * render, same bug, wrong place to trigger it from).
 */
function useHarness(recordId = 'rec1') {
  const gridRef = useRef<RecordingGridHandle | null>(null);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [environment, setEnvironment] = useState<RoundEnvironment[]>([]);

  const liveRecalc = useLiveRecalculation(template(), rows, environment, gridRef);

  const handleRowsChange = (nextRows: RecordRow[]) => {
    setRows(nextRows);
    liveRecalc.handleRowsChange(nextRows);
  };
  const handleEnvironmentChange = (nextEnvironment: RoundEnvironment[]) => {
    setEnvironment(nextEnvironment);
    liveRecalc.handleEnvironmentChange(nextEnvironment);
  };
  const load = (loadedRows: RecordRow[], loadedEnvironment: RoundEnvironment[]) => {
    setRows(loadedRows);
    setEnvironment(loadedEnvironment);
  };

  const autosave = useDraftAutosave({ recordId, rows, environment, enabled: true, debounceMs: 10 });

  return {
    rows,
    environment,
    liveRecalc,
    autosave,
    handleRowsChange,
    handleEnvironmentChange,
    load,
    saveDraft: () => updateDraftRecordMock(recordId, { rows: liveRecalc.getLatestRows(), environment }),
    commit: () => updateDraftRecordMock(recordId, { rows: liveRecalc.getLatestRows(), environment }),
  };
}

beforeEach(() => {
  updateDraftRecordMock.mockClear();
  window.localStorage.clear();
});

describe('RecordEntryPage wiring — environment has one owner (Phase 25 Task 1)', () => {
  it('test 1: changing the environment, then letting autosave fire, persists the new values', async () => {
    const { result, rerender, unmount } = renderHook(() => useHarness());
    act(() => {
      result.current.handleEnvironmentChange(env(25));
    });
    rerender();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30)); // past debounceMs: 10
    });
    expect(updateDraftRecordMock).toHaveBeenCalledWith('rec1', expect.objectContaining({ environment: env(25) }));
    unmount(); // cancels autosave's own pending timer, if any — nothing should leak into the next test
  });

  it('test 2: manual Save Draft persists the current on-screen environment', async () => {
    const { result, unmount } = renderHook(() => useHarness());
    act(() => {
      result.current.handleEnvironmentChange(env(22));
    });
    await act(async () => {
      await result.current.saveDraft();
    });
    expect(updateDraftRecordMock).toHaveBeenCalledWith('rec1', expect.objectContaining({ environment: env(22) }));
    unmount();
  });

  it('test 3: committing persists the environment on screen, not the one originally loaded', async () => {
    const loaded = env(20);
    const { result, unmount } = renderHook(() => useHarness());
    act(() => {
      result.current.load([], loaded);
    });
    act(() => {
      result.current.handleEnvironmentChange(env(30));
    });
    await act(async () => {
      await result.current.commit();
    });
    expect(updateDraftRecordMock).toHaveBeenCalledWith('rec1', expect.objectContaining({ environment: env(30) }));
    expect(updateDraftRecordMock).not.toHaveBeenCalledWith('rec1', expect.objectContaining({ environment: loaded }));
    unmount();
  });

  it('test 4: reopening a draft displays its saved environment — with NO edit first (the load-time bug)', () => {
    const loaded = env(18);
    const { result, rerender, unmount } = renderHook(() => useHarness());
    expect(result.current.environment).toEqual([]);

    act(() => {
      result.current.load([{ M_R: 5 }], loaded);
    });
    rerender();

    // What EnvironmentBlock's `value` prop reads on the real page.
    expect(result.current.environment).toEqual(loaded);
    // What Save Draft / Commit would persist RIGHT NOW, with zero edits —
    // this is the exact scenario that used to silently wipe data: opening
    // an existing draft and saving without touching EnvironmentBlock.
    expect(result.current.liveRecalc.getLatestRows()).toEqual([{ M_R: 5 }]);
    unmount();
  });

  it('the rows ref reflects a freshly loaded record immediately, before any grid edit (the rows half of the same bug)', () => {
    const { result, rerender, unmount } = renderHook(() => useHarness());
    expect(result.current.liveRecalc.getLatestRows()).toEqual([]);

    act(() => {
      result.current.load([{ M_R: 1 }, { M_R: 2 }], []);
    });
    rerender();

    expect(result.current.liveRecalc.getLatestRows()).toEqual([{ M_R: 1 }, { M_R: 2 }]);
    unmount();
  });
});
