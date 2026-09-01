/** @vitest-environment jsdom */
/**
 * RecordingGridSelection.test.tsx
 *
 * Phase 33 Task 3 — verifies `onCellSelect` (the selection-tracking added to
 * RecordingGrid so a Calculation Trace is reachable from a selected cell in
 * ANY record status), and — per the prompt's explicit "verify this, do not
 * assume it" — that a selection event never writes anything to the grid.
 *
 * A separate file, not an addition to RecordingGrid.test.tsx, per Phase 33's
 * constraint against modifying existing tests: this file builds its own
 * minimal fake TREB rather than touching the established Phase 19 one.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { TREB } from '@trebco/treb';
import { RecordingGrid, type RecordingGridHandle, type SelectedTraceableCell } from '../RecordingGrid';
import type { RecorderTemplate } from '../../../../types';

afterEach(cleanup);

interface FakeSheet {
  SetRange: ReturnType<typeof vi.fn>;
  GetRange: ReturnType<typeof vi.fn>;
  ApplyStyle: ReturnType<typeof vi.fn>;
  MergeCells: ReturnType<typeof vi.fn>;
  SetValidation: ReturnType<typeof vi.fn>;
  SetColumnWidth: ReturnType<typeof vi.fn>;
  Freeze: ReturnType<typeof vi.fn>;
  Resize: ReturnType<typeof vi.fn>;
  Batch: ReturnType<typeof vi.fn>;
  Cancel: ReturnType<typeof vi.fn>;
  Subscribe: ReturnType<typeof vi.fn>;
  GetSelection: ReturnType<typeof vi.fn>;
  DeleteRows: ReturnType<typeof vi.fn>;
  GetSheetID: ReturnType<typeof vi.fn>;
  AddSheet: ReturnType<typeof vi.fn>;
  ScrollTo: ReturnType<typeof vi.fn>;
  __fireSelection: () => void;
}

/** `qualified` label GetSelection(true) returns; `plain` is what GetSelection(false) returns. Set per test. */
let qualifiedLabel = '';
let plainLabel = '';
let nextFakeSheetId = 1;
let lastSheet: FakeSheet | null = null;

function createFakeSheet(): FakeSheet {
  let subscribed: ((event: { type: string }) => void) | null = null;
  const sheet: FakeSheet = {
    SetRange: vi.fn(),
    GetRange: vi.fn(() => [[null, null]]),
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
      subscribed = cb;
      return 1;
    }),
    GetSelection: vi.fn((qualified?: boolean) => (qualified ? qualifiedLabel : plainLabel)),
    DeleteRows: vi.fn(),
    GetSheetID: vi.fn(() => nextFakeSheetId++),
    AddSheet: vi.fn(() => nextFakeSheetId++),
    ScrollTo: vi.fn(),
    __fireSelection: () => subscribed?.({ type: 'selection' }),
  };
  return sheet;
}

vi.mock('@trebco/treb', () => ({
  TREB: {
    CreateSpreadsheet: vi.fn(() => {
      lastSheet = createFakeSheet();
      return lastSheet;
    }),
  },
}));

class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor(_cb: ResizeObserverCallback) {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  MockResizeObserver as unknown as typeof ResizeObserver;

/** One INPUT column (CAL_NOM), one FORMULA column (CAL_ERR), one summary field. */
function template(): RecorderTemplate {
  return {
    id: 'tpl1', name: 'T', equipmentTypeId: 'eq1', roundCount: 1, defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [{
      id: 'CAL', label: 'Calibration', order: 0,
      columns: [
        { id: 'NOM', label: 'Nominal', order: 0, type: 'number' },
        { id: 'ERR', label: 'Error', order: 1, type: 'formula', expression: 'CAL_NOM' },
      ],
    }],
    summaryFields: [{ id: 'MAX', label: 'Max', type: 'number', expression: 'col_max(CAL_ERR)' }],
    customFunctions: [], status: 'active', version: 1, createdAt: new Date(),
  } as RecorderTemplate;
}

function mountGrid(isReadOnly: boolean, onCellSelect: (c: SelectedTraceableCell | null) => void) {
  const ref = React.createRef<RecordingGridHandle>();
  render(
    <RecordingGrid ref={ref} template={template()} rows={[{ CAL_NOM: 10 }]} isReadOnly={isReadOnly} onCellSelect={onCellSelect} />,
  );
  return ref;
}

describe('RecordingGrid selection tracking (Phase 33 Task 3)', () => {
  it('reports a formula column selection on the main sheet', () => {
    const onCellSelect = vi.fn();
    act(() => {
      mountGrid(false, onCellSelect);
    });
    // Column index 1 = CAL_ERR (formula), row 2 = FIRST_DATA_ROW (0-based) -> "B3"
    qualifiedLabel = 'Sheet1!B3';
    plainLabel = 'B3';
    act(() => {
      lastSheet!.__fireSelection();
    });
    expect(onCellSelect).toHaveBeenCalledWith({
      kind: 'row', sectionId: 'CAL', columnId: 'ERR', columnKey: 'CAL_ERR', rowIndex: 0,
    });
  });

  it('reports null for a non-formula (input) column', () => {
    const onCellSelect = vi.fn();
    act(() => {
      mountGrid(false, onCellSelect);
    });
    qualifiedLabel = 'Sheet1!A3'; // CAL_NOM — input, not formula
    plainLabel = 'A3';
    act(() => {
      lastSheet!.__fireSelection();
    });
    expect(onCellSelect).toHaveBeenCalledWith(null);
  });

  it('reports null for a header row', () => {
    const onCellSelect = vi.fn();
    act(() => {
      mountGrid(false, onCellSelect);
    });
    qualifiedLabel = 'Sheet1!B1'; // column header row, not a data row
    plainLabel = 'B1';
    act(() => {
      lastSheet!.__fireSelection();
    });
    expect(onCellSelect).toHaveBeenCalledWith(null);
  });

  it('reports null for a multi-cell selection', () => {
    const onCellSelect = vi.fn();
    act(() => {
      mountGrid(false, onCellSelect);
    });
    qualifiedLabel = 'Sheet1!B3:B4';
    plainLabel = 'B3:B4';
    act(() => {
      lastSheet!.__fireSelection();
    });
    expect(onCellSelect).toHaveBeenCalledWith(null);
  });

  it('reports the summary field on the Summary sheet', () => {
    const onCellSelect = vi.fn();
    act(() => {
      mountGrid(false, onCellSelect);
    });
    qualifiedLabel = 'Summary!B1'; // row 0 -> summaryFields[0] -> "MAX"
    plainLabel = 'B1';
    act(() => {
      lastSheet!.__fireSelection();
    });
    expect(onCellSelect).toHaveBeenCalledWith({ kind: 'summary', fieldId: 'MAX' });
  });

  it('REQUIREMENT 1: fires on a READ-ONLY grid too — a trace must be reachable on a committed-or-later record', () => {
    const onCellSelect = vi.fn();
    act(() => {
      mountGrid(true, onCellSelect); // isReadOnly = true
    });
    qualifiedLabel = 'Sheet1!B3';
    plainLabel = 'B3';
    act(() => {
      lastSheet!.__fireSelection();
    });
    expect(onCellSelect).toHaveBeenCalledWith({
      kind: 'row', sectionId: 'CAL', columnId: 'ERR', columnKey: 'CAL_ERR', rowIndex: 0,
    });
  });

  it('REQUIREMENT 2: a selection event writes NOTHING to the grid, read-only or not', () => {
    for (const isReadOnly of [false, true]) {
      const onCellSelect = vi.fn();
      act(() => {
        mountGrid(isReadOnly, onCellSelect);
      });
      const sheet = lastSheet!;
      // Clear the mount-time calls (applyLayout legitimately writes at mount) —
      // only what happens AFTER a selection event, in response to it, matters.
      sheet.SetRange.mockClear();
      sheet.ApplyStyle.mockClear();
      sheet.SetValidation.mockClear();
      sheet.Batch.mockClear();

      qualifiedLabel = 'Sheet1!B3';
      plainLabel = 'B3';
      act(() => {
        sheet.__fireSelection();
      });

      expect(onCellSelect).toHaveBeenCalled(); // confirms the event was actually processed
      expect(sheet.SetRange).not.toHaveBeenCalled();
      expect(sheet.ApplyStyle).not.toHaveBeenCalled();
      expect(sheet.SetValidation).not.toHaveBeenCalled();
      expect(sheet.Batch).not.toHaveBeenCalled();
    }
  });
});
