/** @vitest-environment jsdom */
/**
 * RecordingGrid.test.tsx
 *
 * Phase 19 — the write/event feedback-loop guards (required tests 1-5). See
 * docs/PHASE_19_PROMPT_FIX_GRID_FEEDBACK_LOOP.md for the full analysis: a
 * programmatic write in `updateComputedValues`/`addRow` can trigger TREB's
 * own `document-change` event, which — unguarded — re-triggers
 * `onRowsChange` -> the parent's recalculation -> another `updateComputedValues`
 * call -> another write -> another event, without bound.
 *
 * `@trebco/treb` is mocked here: a real TREB spreadsheet needs a live
 * canvas/DOM surface this project doesn't otherwise exercise in tests (no
 * RecordingGrid.test.tsx existed before this phase — see the file's own
 * header comment on that). The fake `EmbeddedSpreadsheet` below implements
 * exactly the public methods RecordingGrid.tsx calls, and exposes a
 * `__trigger` helper so a test can simulate TREB publishing a
 * `document-change` event — including synchronously from inside a mocked
 * write method, which is how test 1 proves the SYNCHRONOUS half of the
 * guard without needing TREB's real (asynchronous) event timing.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { TREB } from '@trebco/treb';
import { RecordingGrid, type RecordingGridHandle } from '../RecordingGrid';
import type { ConversionRule, RecorderTemplate } from '../../../../types';

afterEach(cleanup);

// ── Fake TREB ────────────────────────────────────────────────────────────

interface FakeSheet {
  SetRange: ReturnType<typeof vi.fn>;
  GetRange: ReturnType<typeof vi.fn>;
  ApplyStyle: ReturnType<typeof vi.fn>;
  MergeCells: ReturnType<typeof vi.fn>;
  SetValidation: ReturnType<typeof vi.fn>;
  SetColumnWidth: ReturnType<typeof vi.fn>;
  Freeze: ReturnType<typeof vi.fn>;
  Resize: ReturnType<typeof vi.fn>;
  /** Phase 20 Task 5 — runs `func` synchronously, matching TREB's real Batch (confirmed from source: grid.js's `Batch` calls `func()` directly). */
  Batch: ReturnType<typeof vi.fn>;
  Cancel: ReturnType<typeof vi.fn>;
  Subscribe: ReturnType<typeof vi.fn>;
  /** Phase 21 Task 3 */
  GetSelection: ReturnType<typeof vi.fn>;
  DeleteRows: ReturnType<typeof vi.fn>;
  /** Phase 21 Task 4a */
  GetSheetID: ReturnType<typeof vi.fn>;
  AddSheet: ReturnType<typeof vi.fn>;
  /** Phase 22 Task 2 */
  ScrollTo: ReturnType<typeof vi.fn>;
  /** Test helper only — simulates TREB publishing a document-change event. */
  __trigger: (event: { type: string }) => void;
}

let lastSheet: FakeSheet | null = null;
/** What GetRange returns for the data area (2 columns: M_R, M_F) — mutated per test to simulate a user edit changing a cell. */
let gridRangeValue: unknown = [[null, null]];
/** What GetSelection(false) returns — an unqualified TREB address label, e.g. "A3". Empty string = nothing selected. */
let selectionLabel = '';
/** Incrementing fake sheet IDs — GetSheetID(0) returns the first, each AddSheet call returns the next. */
let nextFakeSheetId = 1;

function createFakeSheet(): FakeSheet {
  let changeCallback: ((event: { type: string }) => void) | null = null;
  const sheet: FakeSheet = {
    SetRange: vi.fn(),
    GetRange: vi.fn(() => gridRangeValue),
    ApplyStyle: vi.fn(),
    MergeCells: vi.fn(),
    SetValidation: vi.fn(),
    SetColumnWidth: vi.fn(),
    Freeze: vi.fn(),
    Resize: vi.fn(),
    Batch: vi.fn((func: () => void) => {
      func();
      return [];
    }),
    Cancel: vi.fn(),
    Subscribe: vi.fn((cb: (event: { type: string }) => void) => {
      changeCallback = cb;
      return 1;
    }),
    GetSelection: vi.fn(() => selectionLabel),
    DeleteRows: vi.fn(),
    GetSheetID: vi.fn(() => nextFakeSheetId++),
    AddSheet: vi.fn(() => nextFakeSheetId++),
    ScrollTo: vi.fn(),
    __trigger: (event) => changeCallback?.(event),
  };
  return sheet;
}

let lastCreateOptions: any = null;

vi.mock('@trebco/treb', () => ({
  TREB: {
    CreateSpreadsheet: vi.fn((options: any) => {
      lastCreateOptions = options;
      lastSheet = createFakeSheet();
      return lastSheet;
    }),
  },
}));

// Phase 20 Task 4 — jsdom has no ResizeObserver; a minimal test double that
// records every instance so tests can assert `observe`/`disconnect` calls
// and manually fire the callback.
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  MockResizeObserver as unknown as typeof ResizeObserver;

// ── Fixture ──────────────────────────────────────────────────────────────

/**
 * A `number` input column (M_R) plus a `formula` column (M_F). The formula
 * column matters here — `updateComputedValues`' write loop (ApplyStyle +
 * SetRange) only runs when there is at least one, and tests 1/4 need that
 * write path to actually execute so the guard is exercised for real rather
 * than passing vacuously because no write ever happened.
 */
function template(): RecorderTemplate {
  return {
    id: 'tpl1', name: 'T', equipmentTypeId: 'eq1', roundCount: 1, defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [{
      id: 'M', label: 'M', order: 0,
      columns: [
        { id: 'R', label: 'Reading', order: 0, type: 'number' },
        { id: 'F', label: 'Formula', order: 1, type: 'formula', expression: 'M_R' },
      ],
    }],
    summaryFields: [], customFunctions: [], status: 'active', version: 1,
    createdAt: new Date(), updatedAt: new Date(), createdBy: 'u', updatedBy: 'u',
  } as RecorderTemplate;
}

/**
 * Phase 20 tests 2/3: a `text` column with a long header label (min-width
 * test) and a `text` column seeded with an extremely long value (max-clamp
 * test) — both sized at mount from `computeColumnWidths`, which reads
 * `headerRows[1]` (this column's own header) and `dataRows` only, never the
 * merged section-header row.
 */
function wideTemplate(): RecorderTemplate {
  return {
    id: 'tpl2', name: 'T', equipmentTypeId: 'eq1', roundCount: 1, defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [{
      id: 'M', label: 'Measurement Results (Forward)', order: 0,
      columns: [
        { id: 'H', label: 'This Is A Very Long Column Header Label', order: 0, type: 'text' },
        { id: 'V', label: 'V', order: 1, type: 'text' },
      ],
    }],
    summaryFields: [], customFunctions: [], status: 'active', version: 1,
    createdAt: new Date(), updatedAt: new Date(), createdBy: 'u', updatedBy: 'u',
  } as RecorderTemplate;
}

/** Phase 20 test 4: a `standard` column as the FIRST grid column — Freeze should pin it (column count 1). */
function templateWithStandardFirst(): RecorderTemplate {
  return {
    id: 'tpl3', name: 'T', equipmentTypeId: 'eq1', roundCount: 1, defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [{
      id: 'S', label: 'S', order: 0,
      columns: [
        { id: 'STD', label: 'Used Standard', order: 0, type: 'standard' },
        { id: 'R', label: 'Reading', order: 1, type: 'number' },
      ],
    }],
    summaryFields: [], customFunctions: [], status: 'active', version: 1,
    createdAt: new Date(), updatedAt: new Date(), createdBy: 'u', updatedBy: 'u',
  } as RecorderTemplate;
}

function mountGrid(onRowsChange: (rows: any[]) => void) {
  const ref = React.createRef<RecordingGridHandle>();
  render(<RecordingGrid ref={ref} template={template()} rows={[]} onRowsChange={onRowsChange} />);
  return { ref, sheet: lastSheet! };
}

beforeEach(() => {
  lastSheet = null;
  lastCreateOptions = null;
  gridRangeValue = [[null, null]];
  selectionLabel = '';
  nextFakeSheetId = 1;
  MockResizeObserver.instances = [];
});

// ── Tests ────────────────────────────────────────────────────────────────

describe('RecordingGrid — the write/event feedback-loop guards', () => {
  it('test 2: a document-change caused by a genuine user edit DOES call onRowsChange', () => {
    const onRowsChange = vi.fn();
    const { sheet } = mountGrid(onRowsChange);

    gridRangeValue = [[7, null]];
    act(() => sheet.__trigger({ type: 'document-change' }));

    expect(onRowsChange).toHaveBeenCalledTimes(1);
    expect(onRowsChange).toHaveBeenCalledWith([{ M_R: 7 }]);
  });

  it('test 1: a document-change fired SYNCHRONOUSLY from within a programmatic write does NOT call onRowsChange', () => {
    const onRowsChange = vi.fn();
    const { ref, sheet } = mountGrid(onRowsChange);

    // Simulate TREB publishing document-change synchronously, from inside
    // one of updateComputedValues' own write calls (SetRange, called once
    // per formula column after that column's per-row ApplyStyle calls) —
    // the re-entrancy flag (Task 2a) is what has to catch this case.
    sheet.SetRange.mockImplementationOnce(() => {
      sheet.__trigger({ type: 'document-change' });
    });

    act(() => {
      ref.current!.updateComputedValues([{ M_F: { value: 5 } }]);
    });

    // Prerequisite: prove the write path actually ran (otherwise this test
    // would pass vacuously without exercising the guard at all).
    expect(sheet.SetRange).toHaveBeenCalled();
    expect(onRowsChange).not.toHaveBeenCalled();
  });

  it('test 3: deep-equal extracted rows do not re-emit; changed rows do', () => {
    const onRowsChange = vi.fn();
    const { sheet } = mountGrid(onRowsChange);

    gridRangeValue = [[7, null]];
    act(() => sheet.__trigger({ type: 'document-change' }));
    expect(onRowsChange).toHaveBeenCalledTimes(1);

    // Same underlying value — re-triggering must NOT re-emit.
    act(() => sheet.__trigger({ type: 'document-change' }));
    expect(onRowsChange).toHaveBeenCalledTimes(1);

    // A genuinely different value must emit again.
    gridRangeValue = [[8, null]];
    act(() => sheet.__trigger({ type: 'document-change' }));
    expect(onRowsChange).toHaveBeenCalledTimes(2);
    expect(onRowsChange).toHaveBeenLastCalledWith([{ M_R: 8 }]);
  });

  it('test 4: the guard clears correctly when a write throws, and the subscription still works afterward', () => {
    const onRowsChange = vi.fn();
    const { ref, sheet } = mountGrid(onRowsChange);

    sheet.ApplyStyle.mockImplementationOnce(() => {
      throw new Error('injected failure');
    });

    expect(() => {
      act(() => {
        ref.current!.updateComputedValues([{ M_F: { value: 5 } }]);
      });
    }).toThrow('injected failure');

    // Prerequisite: prove the write path actually ran.
    expect(sheet.ApplyStyle).toHaveBeenCalled();

    // A genuine user edit afterward must still propagate — the flag must
    // not be left permanently `true` by the thrown write.
    gridRangeValue = [[9, null]];
    act(() => sheet.__trigger({ type: 'document-change' }));
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    expect(onRowsChange).toHaveBeenCalledWith([{ M_R: 9 }]);
  });

  it('test 5: addRow is covered by the same guard — a synchronous document-change from inside it does not call onRowsChange', () => {
    const onRowsChange = vi.fn();
    const { ref, sheet } = mountGrid(onRowsChange);

    sheet.SetRange.mockImplementationOnce(() => {
      sheet.__trigger({ type: 'document-change' });
    });

    act(() => {
      ref.current!.addRow();
    });

    // Prerequisite: prove the write path actually ran.
    expect(sheet.SetRange).toHaveBeenCalled();
    expect(onRowsChange).not.toHaveBeenCalled();
  });
});

describe('RecordingGrid — Phase 20: layout (column widths, freeze, resize)', () => {
  it('test 1: column widths are set after seeding', () => {
    const { sheet } = mountGrid(vi.fn());
    expect(sheet.SetColumnWidth).toHaveBeenCalled();
  });

  it('test 2: a long header is not truncated at the chosen minimum width', () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={wideTemplate()} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;

    // Column 0's header is 40 chars; the minimum-width clamp (90px) fits
    // only ~9 chars at the estimator's 7px/char, so this column must have
    // been sized WIDER than the minimum, or the label would be truncated.
    const call = sheet.SetColumnWidth.mock.calls.find((c: unknown[]) => c[0] === 0);
    expect(call).toBeDefined();
    const width = call![1] as number;
    expect(width).toBeGreaterThan(90);
  });

  it('test 3: a long invalid-computation-length value in the seed does not blow a column past the maximum', () => {
    const ref = React.createRef<RecordingGridHandle>();
    const longValue = 'x'.repeat(200); // far longer than any header
    render(
      <RecordingGrid
        ref={ref}
        template={wideTemplate()}
        rows={[{ M_H: 'short', M_V: longValue }]}
        onRowsChange={vi.fn()}
      />,
    );
    const sheet = lastSheet!;

    // Column 1 ("V") has a one-character header but a 200-char seeded
    // value — without the max clamp this would be ~1424px wide.
    const call = sheet.SetColumnWidth.mock.calls.find((c: unknown[]) => c[0] === 1);
    expect(call).toBeDefined();
    const width = call![1] as number;
    expect(width).toBeLessThanOrEqual(260);
  });

  it('test 4: Freeze is called with the derived row/column counts — pinned when the first column is `standard`, 0 when it is not', () => {
    // Default fixture: R (number) then F (formula) — no standard column at all.
    const plain = mountGrid(vi.fn());
    expect(plain.sheet.Freeze).toHaveBeenCalledWith(2, 0);

    // A template whose FIRST column is the standard picker.
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={templateWithStandardFirst()} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;
    expect(sheet.Freeze).toHaveBeenCalledWith(2, 1);
  });

  it('test 5: a ResizeObserver is attached to the container at mount and disconnected on unmount', () => {
    const ref = React.createRef<RecordingGridHandle>();
    const { unmount } = render(<RecordingGrid ref={ref} template={template()} rows={[]} onRowsChange={vi.fn()} />);

    expect(MockResizeObserver.instances.length).toBe(1);
    const observer = MockResizeObserver.instances[0];
    expect(observer.observe).toHaveBeenCalledTimes(1);
    expect(observer.disconnect).not.toHaveBeenCalled();

    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it('ResizeObserver firing calls sheet.Resize()', () => {
    const { sheet } = mountGrid(vi.fn());
    const observer = MockResizeObserver.instances[0];
    observer.callback([] as any, observer as any);
    expect(sheet.Resize).toHaveBeenCalled();
  });
});

describe('RecordingGrid — Phase 21 Task 2: row count matches reality', () => {
  it('seeds exactly rows.length, never padded up to a large template.defaultRowCount', () => {
    const wideDefaultTemplate: RecorderTemplate = { ...template(), defaultRowCount: 50 };
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={wideDefaultTemplate} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;

    // The data-seed SetRange call at FIRST_DATA_ROW (2) — its row array
    // length is the actual number of rows seeded.
    const dataCall = sheet.SetRange.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[0] as any).start?.row === 2,
    );
    expect(dataCall).toBeDefined();
    expect((dataCall![1] as unknown[]).length).toBe(1); // min 1, not 50
  });

  it('seeds exactly rows.length when the record already has data, regardless of defaultRowCount', () => {
    const wideDefaultTemplate: RecorderTemplate = { ...template(), defaultRowCount: 50 };
    const ref = React.createRef<RecordingGridHandle>();
    render(
      <RecordingGrid
        ref={ref}
        template={wideDefaultTemplate}
        rows={[{ M_R: 1 }, { M_R: 2 }]}
        onRowsChange={vi.fn()}
      />,
    );
    const sheet = lastSheet!;
    const dataCall = sheet.SetRange.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[0] as any).start?.row === 2,
    );
    expect((dataCall![1] as unknown[]).length).toBe(2);
  });
});

describe('RecordingGrid — Phase 21 Task 3: delete the selected row', () => {
  function mountTwoRowGrid(onRowsChange: (rows: any[]) => void, isReadOnly = false) {
    const ref = React.createRef<RecordingGridHandle>();
    render(
      <RecordingGrid
        ref={ref}
        template={template()}
        rows={[{ M_R: 1 }, { M_R: 2 }]}
        isReadOnly={isReadOnly}
        onRowsChange={onRowsChange}
      />,
    );
    return { ref, sheet: lastSheet! };
  }

  it('test 6: deleting the selected row calls DeleteRows and re-emits the remaining rows', () => {
    const onRowsChange = vi.fn();
    const { ref, sheet } = mountTwoRowGrid(onRowsChange);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    // Row 2 (the second data row) is selected — FIRST_DATA_ROW is 2 (0-based),
    // so data row 2 is grid row 3 (0-based) => label row 4 (1-based).
    selectionLabel = 'A4';
    sheet.GetRange.mockImplementation((range: any) => {
      if (range.start.row === 3) return [[2, null]]; // the row about to be deleted
      if (range.start.row === 2) return [[1, null]]; // the row that remains
      return [[null, null]];
    });

    act(() => {
      ref.current!.deleteSelectedRow();
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(sheet.DeleteRows).toHaveBeenCalledWith(3, 1);
    expect(onRowsChange).toHaveBeenCalledWith([{ M_R: 1 }]);

    confirmSpy.mockRestore();
  });

  it('does not delete when the user cancels the confirmation', () => {
    const onRowsChange = vi.fn();
    const { ref, sheet } = mountTwoRowGrid(onRowsChange);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    selectionLabel = 'A4';

    act(() => {
      ref.current!.deleteSelectedRow();
    });

    expect(sheet.DeleteRows).not.toHaveBeenCalled();
    expect(onRowsChange).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('test 7a: refuses to delete a header row', () => {
    const onRowsChange = vi.fn();
    const { ref, sheet } = mountTwoRowGrid(onRowsChange);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    selectionLabel = 'A2'; // 0-based row 1 = COLUMN_HEADER_ROW, before FIRST_DATA_ROW (2)

    act(() => {
      ref.current!.deleteSelectedRow();
    });

    expect(sheet.DeleteRows).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();

    alertSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it('test 7b: refuses to delete on a read-only record', () => {
    const onRowsChange = vi.fn();
    const { ref, sheet } = mountTwoRowGrid(onRowsChange, true);
    selectionLabel = 'A4';

    act(() => {
      ref.current!.deleteSelectedRow();
    });

    expect(sheet.DeleteRows).not.toHaveBeenCalled();
    expect(onRowsChange).not.toHaveBeenCalled();
  });

  it('refuses to delete the last remaining row', () => {
    const onRowsChange = vi.fn();
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={template()} rows={[{ M_R: 1 }]} onRowsChange={onRowsChange} />);
    const sheet = lastSheet!;
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    selectionLabel = 'A3'; // the only data row

    act(() => {
      ref.current!.deleteSelectedRow();
    });

    expect(sheet.DeleteRows).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();

    alertSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it('test 8: the delete write goes through the Phase 19 guard — a synchronous document-change fired from inside DeleteRows does not double-emit', () => {
    const onRowsChange = vi.fn();
    const { ref, sheet } = mountTwoRowGrid(onRowsChange);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    selectionLabel = 'A4';
    sheet.GetRange.mockImplementation((range: any) => {
      if (range.start.row === 3) return [[2, null]];
      if (range.start.row === 2) return [[1, null]];
      return [[null, null]];
    });
    // Simulate TREB publishing document-change synchronously from inside
    // DeleteRows itself (structure changes are documented to fire it too).
    sheet.DeleteRows.mockImplementationOnce(() => {
      sheet.__trigger({ type: 'document-change' });
    });

    act(() => {
      ref.current!.deleteSelectedRow();
    });

    // If the guard were bypassed, the synchronous document-change would
    // ALSO call onRowsChange, on top of deleteSelectedRow's own explicit
    // re-emit — exactly two calls instead of one.
    expect(onRowsChange).toHaveBeenCalledTimes(1);
    expect(onRowsChange).toHaveBeenCalledWith([{ M_R: 1 }]);

    confirmSpy.mockRestore();
  });
});

describe('RecordingGrid — Phase 21 Task 4a: Summary Fields tab', () => {
  function templateWithSummary(): RecorderTemplate {
    return {
      ...template(),
      summaryFields: [
        { id: 'MAXDEV', label: 'Max Deviation', type: 'number', expression: 'col_max(M_F)' },
        { id: 'VERDICT', label: 'Verdict', type: 'text', expression: '"PASS"' },
      ],
    } as RecorderTemplate;
  }

  it('creates a Summary sheet and turns on the tab bar only when the template has summary fields', () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={templateWithSummary()} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;

    expect(lastCreateOptions.tab_bar).toBe(true);
    expect(sheet.AddSheet).toHaveBeenCalledWith('Summary');
  });

  it('does not create a Summary sheet, and leaves the tab bar off, for a template with no summary fields', () => {
    const { sheet } = mountGrid(vi.fn());
    expect(lastCreateOptions.tab_bar).toBe(false);
    expect(sheet.AddSheet).not.toHaveBeenCalled();
  });

  it('seeds one labeled row per summary field at mount', () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={templateWithSummary()} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;

    const summarySheetId = sheet.AddSheet.mock.results[0].value;
    const labelCalls = sheet.SetRange.mock.calls.filter(
      (c: unknown[]) => (c[0] as any).sheet_id === summarySheetId,
    );
    expect(labelCalls.map((c: unknown[]) => c[1])).toEqual(['Max Deviation', 'Verdict']);
  });

  it('updateSummaryValues writes values into the Summary sheet, styled the same way as a formula column', () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={templateWithSummary()} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;
    const summarySheetId = sheet.AddSheet.mock.results[0].value;
    sheet.SetRange.mockClear();

    act(() => {
      ref.current!.updateSummaryValues({
        MAXDEV: { value: 0.4 },
        VERDICT: { value: null, error: { kind: 'awaiting-input', message: 'not ready' } },
      });
    });

    const valueCalls = sheet.SetRange.mock.calls.filter((c: unknown[]) => (c[0] as any).sheet_id === summarySheetId);
    expect(valueCalls).toEqual([
      [{ row: 0, column: 1, sheet_id: summarySheetId }, 0.4],
      [{ row: 1, column: 1, sheet_id: summarySheetId }, undefined],
    ]);
  });

  it('updateSummaryValues is a no-op for a template with no summary fields', () => {
    const { ref, sheet } = mountGrid(vi.fn());
    act(() => {
      ref.current!.updateSummaryValues({ ANYTHING: { value: 1 } });
    });
    expect(sheet.AddSheet).not.toHaveBeenCalled();
  });

  it('updateSummaryValues goes through the Phase 19 guard', () => {
    const onRowsChange = vi.fn();
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={templateWithSummary()} rows={[]} onRowsChange={onRowsChange} />);
    const sheet = lastSheet!;

    sheet.SetRange.mockImplementationOnce(() => {
      sheet.__trigger({ type: 'document-change' });
    });

    act(() => {
      ref.current!.updateSummaryValues({ MAXDEV: { value: 0.4 } });
    });

    expect(onRowsChange).not.toHaveBeenCalled();
  });
});

describe('RecordingGrid — Phase 22 Task 1: column role styling', () => {
  function templateWithRoles(): RecorderTemplate {
    return {
      ...template(),
      sections: [{
        id: 'S', label: 'Sec', order: 0,
        columns: [
          { id: 'STD', label: 'Used Standard', order: 0, type: 'standard' },
          { id: 'IN', label: 'Reading', order: 1, type: 'number' },
          { id: 'F', label: 'Formula', order: 2, type: 'formula', expression: 'S_IN' },
        ],
      }],
    } as RecorderTemplate;
  }

  function lastFillFor(sheet: FakeSheet, row: number, column: number): string | undefined {
    const calls = sheet.ApplyStyle.mock.calls.filter(
      (c: unknown[]) => (c[0] as any).start.row === row && (c[0] as any).start.column === column && (c[1] as any).fill,
    );
    return calls.length > 0 ? (calls[calls.length - 1][1] as any).fill.text : undefined;
  }

  it('test 1: input, formula and standard columns each get their distinct role style at mount, with no rows populated', () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={templateWithRoles()} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;

    expect(lastFillFor(sheet, 2, 0)).toBe('#e0e7ff'); // standard
    expect(lastFillFor(sheet, 2, 1)).toBe('#fef9c3'); // input
    expect(lastFillFor(sheet, 2, 2)).toBe('#f3f4f6'); // formula
  });

  it('regression: a row added via addRow() gets the same role tints as the mount-time rows, not left blank/white', () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={templateWithRoles()} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;

    act(() => {
      ref.current!.addRow();
    });

    // The mount seeded row 2 (FIRST_DATA_ROW); addRow appends at row 3.
    expect(lastFillFor(sheet, 3, 0)).toBe('#e0e7ff'); // standard
    expect(lastFillFor(sheet, 3, 1)).toBe('#fef9c3'); // input
    expect(lastFillFor(sheet, 3, 2)).toBe('#f3f4f6'); // formula
  });

  it("marks a formula column's header with a symbol, not colour alone", () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={templateWithRoles()} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;

    const headerCall = sheet.SetRange.mock.calls.find((c: unknown[]) => (c[0] as any).start?.row === 1);
    const headerRow = headerCall![1][0] as string[];
    expect(headerRow[2]).toContain('ƒ');
    expect(headerRow[0]).not.toContain('ƒ');
    expect(headerRow[1]).not.toContain('ƒ');
  });

  it('test 2: an invalid-computation cell keeps its error style, not the role tint', () => {
    const { ref, sheet } = mountGrid(vi.fn()); // default fixture: M_R (number), M_F (formula)

    act(() => {
      ref.current!.updateComputedValues([{ M_F: { value: null, error: { kind: 'invalid-computation', message: 'bad' } } }]);
    });

    expect(lastFillFor(sheet, 2, 1)).toBe('#fee2e2');
  });

  it('test 3: a conversion-failure cell keeps its amber marker, not the role tint', () => {
    const conversionFailureTemplate: RecorderTemplate = {
      ...template(),
      sections: [{
        id: 'S', label: 'Sec', order: 0,
        columns: [
          {
            id: 'F', label: 'Formula', order: 0, type: 'formula', expression: '1',
            conversionEnabled: true, conversionSourceUnit: 'mV/V', unitMode: 'fixed', unit: 'N',
          } as any,
        ],
      }],
    } as RecorderTemplate;
    const ref = React.createRef<RecordingGridHandle>();
    render(
      <RecordingGrid ref={ref} template={conversionFailureTemplate} rows={[{ S_F: 5 }]} onRowsChange={vi.fn()} conversionRules={[]} />,
    );
    const sheet = lastSheet!;

    expect(lastFillFor(sheet, 2, 0)).toBe('#fef3c7');
  });
});

describe('RecordingGrid — Phase 22 Task 2: section banding and jump', () => {
  function multiSectionTemplate(): RecorderTemplate {
    return {
      ...template(),
      sections: [
        { id: 'A', label: 'Section A', order: 0, columns: [{ id: 'X', label: 'X', order: 0, type: 'number' }] },
        { id: 'B', label: 'Section B', order: 1, columns: [{ id: 'Y', label: 'Y', order: 0, type: 'number' }] },
        { id: 'C', label: 'Section C', order: 2, columns: [{ id: 'Z', label: 'Z', order: 0, type: 'number' }] },
      ],
    } as RecorderTemplate;
  }

  it('test 4: adjacent sections get different header tints', () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={multiSectionTemplate()} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;

    const fillFor = (column: number) => {
      const calls = sheet.ApplyStyle.mock.calls.filter(
        (c: unknown[]) => (c[0] as any).start.row === 0 && (c[0] as any).start.column === column && (c[1] as any).fill,
      );
      return calls.length > 0 ? (calls[calls.length - 1][1] as any).fill.text : undefined;
    };

    const tintA = fillFor(0);
    const tintB = fillFor(1);
    const tintC = fillFor(2);
    expect(tintA).toBeDefined();
    expect(tintB).toBeDefined();
    expect(tintC).toBeDefined();
    expect(tintA).not.toBe(tintB);
    expect(tintB).not.toBe(tintC);
  });

  it('a heavier left border marks every section boundary except before the first section', () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={multiSectionTemplate()} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;

    const borderCalls = sheet.ApplyStyle.mock.calls.filter((c: unknown[]) => (c[1] as any).border_left);
    const borderedColumns = borderCalls.map((c: unknown[]) => (c[0] as any).start.column).sort();
    expect(borderedColumns).toEqual([1, 2]); // section B and C's first columns, not A's (column 0)
  });

  it("test 5: section jump scrolls only the x-axis to the section's first column, leaving the y-axis (and frozen headers) untouched", () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={multiSectionTemplate()} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;

    act(() => {
      ref.current!.scrollToSection('C');
    });

    expect(sheet.ScrollTo).toHaveBeenCalledWith({ row: 2, column: 2 }, { x: true, y: false });
  });

  it('section jump is a no-op for an unknown section id', () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(<RecordingGrid ref={ref} template={multiSectionTemplate()} rows={[]} onRowsChange={vi.fn()} />);
    const sheet = lastSheet!;

    act(() => {
      ref.current!.scrollToSection('NOPE');
    });

    expect(sheet.ScrollTo).not.toHaveBeenCalled();
  });
});

describe('RecordingGrid — Phase 23 Task 1: updateHeaders (unit change without remount)', () => {
  function templateWithConvertibleFormula(): RecorderTemplate {
    return {
      ...template(),
      sections: [{
        id: 'M', label: 'M', order: 0,
        columns: [
          { id: 'R', label: 'Reading', order: 0, type: 'number' },
          {
            id: 'F', label: 'Formula', order: 1, type: 'formula', expression: 'M_R',
            unitMode: 'selectable', unitChoices: ['mV/V', 'N'],
            conversionEnabled: true, conversionSourceUnit: 'mV/V',
          } as any,
        ],
      }],
    } as RecorderTemplate;
  }

  const conversionRules: ConversionRule[] = [
    {
      id: 'rule1', name: 'mV/V to N', fromUnit: 'mV/V', toUnit: 'N', expression: 'VALUE * 2',
      active: true, createdAt: new Date(), updatedAt: new Date(), createdBy: 'u',
    },
  ];

  function lastFillFor(sheet: FakeSheet, row: number, column: number): string | undefined {
    const calls = sheet.ApplyStyle.mock.calls.filter(
      (c: unknown[]) => (c[0] as any).start.row === row && (c[0] as any).start.column === column && (c[1] as any).fill,
    );
    return calls.length > 0 ? (calls[calls.length - 1][1] as any).fill.text : undefined;
  }

  it('test 1: a typed input value survives updateHeaders — no remount, value unchanged', () => {
    const onRowsChange = vi.fn();
    const ref = React.createRef<RecordingGridHandle>();
    render(
      <RecordingGrid
        ref={ref}
        template={templateWithConvertibleFormula()}
        rows={[]}
        onRowsChange={onRowsChange}
        conversionRules={conversionRules}
      />,
    );
    const sheet = lastSheet!;
    const createCallsBeforeUpdate = (TREB.CreateSpreadsheet as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

    // Simulate the technician having typed 7 into the input column.
    gridRangeValue = [[7, null]];
    act(() => sheet.__trigger({ type: 'document-change' }));
    expect(onRowsChange).toHaveBeenCalledWith([{ M_R: 7 }]);

    act(() => {
      ref.current!.updateHeaders({ M_F: 'N' }, [{ M_F: { value: 10 } }]);
    });

    // No remount: CreateSpreadsheet was not called again.
    expect((TREB.CreateSpreadsheet as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(createCallsBeforeUpdate);

    // The typed value is still what it was — re-triggering the SAME
    // underlying grid state must not re-emit a changed value.
    onRowsChange.mockClear();
    act(() => sheet.__trigger({ type: 'document-change' }));
    expect(onRowsChange).not.toHaveBeenCalled(); // unchanged (rowsEqual guard) — still M_R: 7
  });

  it('test 2: header text and the converted display value both update on a unit change', () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(
      <RecordingGrid
        ref={ref}
        template={templateWithConvertibleFormula()}
        rows={[]}
        onRowsChange={vi.fn()}
        conversionRules={conversionRules}
      />,
    );
    const sheet = lastSheet!;
    sheet.SetRange.mockClear();

    act(() => {
      ref.current!.updateHeaders({ M_F: 'N' }, [{ M_F: { value: 5 } }]);
    });

    // Header row (row 1) rewritten with the new unit.
    const headerCall = sheet.SetRange.mock.calls.find((c: unknown[]) => (c[0] as any).start?.row === 1);
    expect(headerCall).toBeDefined();
    const headerRow = headerCall![1][0] as string[];
    expect(headerRow[1]).toContain('N');
    expect(headerRow[1]).toContain('ƒ');

    // Formula column's DISPLAY value converted: 5 * 2 = 10 (the rule's expression).
    const valueCall = sheet.SetRange.mock.calls.find(
      (c: unknown[]) => (c[0] as any).start?.row === 2 && (c[0] as any).start?.column === 1,
    );
    expect(valueCall).toBeDefined();
    expect(valueCall![1]).toEqual([[10]]);
  });

  it('test 3: role tints and column widths survive the header rewrite', () => {
    const ref = React.createRef<RecordingGridHandle>();
    render(
      <RecordingGrid
        ref={ref}
        template={templateWithConvertibleFormula()}
        rows={[]}
        onRowsChange={vi.fn()}
        conversionRules={conversionRules}
      />,
    );
    const sheet = lastSheet!;
    const widthCallsBefore = sheet.SetColumnWidth.mock.calls.length;

    act(() => {
      ref.current!.updateHeaders({ M_F: 'N' }, [{ M_F: { value: 5 } }]);
    });

    // Widths are never touched by updateHeaders.
    expect(sheet.SetColumnWidth.mock.calls.length).toBe(widthCallsBefore);

    // The formula column's cell fill is still the formula role tint
    // (COMPUTED_CELL_STYLE, applied by the shared writeFormulaColumnValues
    // helper) — not wiped by the header rewrite.
    expect(lastFillFor(sheet, 2, 1)).toBe('#f3f4f6');
  });

  it('updateHeaders goes through the Phase 19 guard', () => {
    const onRowsChange = vi.fn();
    const ref = React.createRef<RecordingGridHandle>();
    render(
      <RecordingGrid
        ref={ref}
        template={templateWithConvertibleFormula()}
        rows={[]}
        onRowsChange={onRowsChange}
        conversionRules={conversionRules}
      />,
    );
    const sheet = lastSheet!;

    sheet.SetRange.mockImplementationOnce(() => {
      sheet.__trigger({ type: 'document-change' });
    });

    act(() => {
      ref.current!.updateHeaders({ M_F: 'N' }, [{ M_F: { value: 5 } }]);
    });

    expect(onRowsChange).not.toHaveBeenCalled();
  });
});
