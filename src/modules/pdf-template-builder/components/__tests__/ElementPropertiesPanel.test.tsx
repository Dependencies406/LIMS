/** @vitest-environment jsdom */
/**
 * Phase 29 — the record-table Sections/Columns picker: empty-selection
 * semantics, orphan-id surfacing, select/deselect-all, and the recorder
 * template refresh control. Component-level (not just `getRecordTableColumns`
 * unit tests in `renderRecordTable.test.ts`) because the reported bugs were
 * all in the panel's OWN derivation of checkbox state, not in the renderer.
 *
 * The checkbox markup has no `<label>`/`htmlFor` association with its text
 * (pre-existing, not a Phase 29 concern), so tests locate a checkbox via its
 * sibling label text rather than an accessible name.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import type { RecorderTemplate } from '../../../../types';
import type { RecordTableElement } from '../../types';

afterEach(() => {
  cleanup();
  hoisted.getAllTemplates.mockClear();
});

const hoisted = vi.hoisted(() => ({
  getAllTemplates: vi.fn(),
}));

vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1', role: 'admin' } }),
}));

vi.mock('../../../../services/recorderTemplateService', () => ({
  recorderTemplateService: { getAllTemplates: hoisted.getAllTemplates },
}));

vi.mock('../../../../services/spreadsheetTemplateService', () => ({
  getAvailableTemplates: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../services/dataSourceDiscoveryService', () => ({
  getDataSourceDiscovery: () => ({
    getAllDataSources: () => [],
    getDataSource: () => undefined,
  }),
}));

import { ElementPropertiesPanel } from '../ElementPropertiesPanel';

function template(overrides: Partial<RecorderTemplate> = {}): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'UTM',
    equipmentTypeId: 'eqtype1',
    roundCount: 2,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['UTM'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [
      {
        id: 'CAL', label: 'Calibration', order: 0,
        columns: [
          { id: 'R1', label: 'Round 1', order: 0, type: 'number' },
          { id: 'R2', label: 'Round 2', order: 1, type: 'number' },
        ],
      },
      {
        id: 'NOTE', label: 'Notes', order: 1,
        columns: [{ id: 'REM', label: 'Remark', order: 0, type: 'text' }],
      },
    ],
    summaryFields: [],
    customFunctions: [],
    status: 'active',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  } as RecorderTemplate;
}

function baseElement(overrides: Partial<RecordTableElement> = {}): RecordTableElement {
  return {
    id: 'rt1',
    type: 'record-table',
    x: 0,
    y: 0,
    width: 400,
    recorderTemplateId: 'tpl1',
    ...overrides,
  } as RecordTableElement;
}

/**
 * The checkbox for a section, found via its sibling label text inside the
 * Sections panel specifically (see file header) — the same section label
 * also appears a second time, in gray, as each of its columns' section tag
 * in the Columns panel, so an unscoped text query is ambiguous.
 */
function sectionCheckbox(label: string): HTMLInputElement {
  const panel = within(screen.getByText('Sections').parentElement!);
  const el = panel.getByText(label);
  const checkbox = el.parentElement!.querySelector('input[type="checkbox"]');
  if (!checkbox) throw new Error(`No checkbox found next to section label "${label}"`);
  return checkbox as HTMLInputElement;
}

async function renderPanel(element: RecordTableElement, onUpdate = vi.fn()) {
  const utils = render(<ElementPropertiesPanel element={element} onUpdate={onUpdate} />);
  await waitFor(() => expect(screen.getByText('Sections')).toBeTruthy());
  return { ...utils, onUpdate };
}

describe('ElementPropertiesPanel — record-table Sections/Columns picker (Phase 29)', () => {
  it('test 4 (the reported bug): unchecking the last checked section leaves it unchecked, not falling back to "all"', async () => {
    hoisted.getAllTemplates.mockResolvedValue([template()]);
    const onUpdate = vi.fn();
    await renderPanel(baseElement({ sections: ['CAL'] }), onUpdate);

    fireEvent.click(sectionCheckbox('Calibration'));

    expect(onUpdate).toHaveBeenCalledWith({ sections: [] });
  });

  it('test 5: "Select all" (Sections) writes the explicit full list, not undefined', async () => {
    hoisted.getAllTemplates.mockResolvedValue([template()]);
    const onUpdate = vi.fn();
    await renderPanel(baseElement({ sections: ['CAL'] }), onUpdate);

    const sectionsPanel = within(screen.getByText('Sections').parentElement!);
    fireEvent.click(sectionsPanel.getByRole('button', { name: 'Select all' }));

    expect(onUpdate).toHaveBeenCalledWith({ sections: ['CAL', 'NOTE'] });
  });

  it('test 6: "Deselect all" (Sections) writes [] for BOTH sections and columns', async () => {
    hoisted.getAllTemplates.mockResolvedValue([template()]);
    const onUpdate = vi.fn();
    await renderPanel(baseElement({ sections: ['CAL', 'NOTE'], columns: ['CAL_R1'] }), onUpdate);

    const sectionsPanel = within(screen.getByText('Sections').parentElement!);
    fireEvent.click(sectionsPanel.getByRole('button', { name: 'Deselect all' }));

    expect(onUpdate).toHaveBeenCalledWith({ sections: [], columns: [] });
  });

  it('"Select all" / "Deselect all" (Columns) mirror the same contract, scoped to the currently-selected sections', async () => {
    hoisted.getAllTemplates.mockResolvedValue([template()]);
    const onUpdateSelect = vi.fn();
    await renderPanel(baseElement({ sections: ['CAL'] }), onUpdateSelect);
    const columnsPanel = within(screen.getByText('Columns').parentElement!);
    fireEvent.click(columnsPanel.getByRole('button', { name: 'Select all' }));
    expect(onUpdateSelect).toHaveBeenCalledWith({ columns: ['CAL_R1', 'CAL_R2'] }); // NOTE_REM excluded — NOTE isn't selected

    cleanup();
    hoisted.getAllTemplates.mockResolvedValue([template()]);
    const onUpdateDeselect = vi.fn();
    await renderPanel(baseElement({ sections: ['CAL'] }), onUpdateDeselect);
    fireEvent.click(within(screen.getByText('Columns').parentElement!).getByRole('button', { name: 'Deselect all' }));
    expect(onUpdateDeselect).toHaveBeenCalledWith({ columns: [] });
  });

  it('shows a live "N of M selected" count for both lists', async () => {
    hoisted.getAllTemplates.mockResolvedValue([template()]);
    await renderPanel(baseElement({ sections: ['CAL'], columns: ['CAL_R1'] }));

    expect(within(screen.getByText('Sections').parentElement!).getByText('1 of 2 selected')).toBeTruthy();
    expect(within(screen.getByText('Columns').parentElement!).getByText('1 of 2 selected')).toBeTruthy();
  });

  it('test 7: an orphaned section id produces a warning naming it, while the OTHER (valid) section shows its correct checked state', async () => {
    hoisted.getAllTemplates.mockResolvedValue([template()]);
    await renderPanel(baseElement({ sections: ['CAL', 'GHOST'] }));

    const warning = screen.getByText(/not found in this template/i);
    expect(warning.closest('div')?.textContent).toContain('GHOST');
    // The pinned-snapshot caveat must be present, not implying a broken certificate.
    expect(screen.getByText(/pinned template snapshot/i, { selector: 'span' })).toBeTruthy();

    // CAL is valid and selected — must show checked, NOT swept into "all unchecked"
    // just because GHOST (also selected) has no matching checkbox.
    expect(sectionCheckbox('Calibration').checked).toBe(true);
  });

  it('test 8: dropping orphans removes only the unknown id(s), keeping valid selections intact', async () => {
    hoisted.getAllTemplates.mockResolvedValue([template()]);
    const onUpdate = vi.fn();
    await renderPanel(baseElement({ sections: ['CAL', 'GHOST', 'NOTE'] }), onUpdate);

    fireEvent.click(screen.getByRole('button', { name: /Drop 1 unknown id from selection/i }));

    expect(onUpdate).toHaveBeenCalledWith({ sections: ['CAL', 'NOTE'] });
  });

  it('an unrelated toggle does NOT silently drop an orphan — only the explicit "drop" action does', async () => {
    hoisted.getAllTemplates.mockResolvedValue([template()]);
    const onUpdate = vi.fn();
    await renderPanel(baseElement({ sections: ['CAL', 'GHOST'] }), onUpdate);

    fireEvent.click(sectionCheckbox('Notes')); // toggling an unrelated, unselected section on

    expect(onUpdate).toHaveBeenCalledWith({ sections: ['CAL', 'NOTE', 'GHOST'] });
  });

  it('test 10: Refresh list refetches the recorder templates and re-evaluates the orphan warning', async () => {
    hoisted.getAllTemplates.mockResolvedValueOnce([template()]); // CAL + NOTE present
    await renderPanel(baseElement({ sections: ['CAL', 'NOTE'] }));

    expect(screen.queryByText(/not found in this template/i)).toBeNull();
    expect(hoisted.getAllTemplates).toHaveBeenCalledTimes(1);

    // Simulate the template being edited in another tab: NOTE removed.
    hoisted.getAllTemplates.mockResolvedValueOnce([template({ sections: [template().sections[0]] })]);
    fireEvent.click(screen.getByRole('button', { name: /Refresh list/i }));

    await waitFor(() => expect(screen.getByText(/not found in this template/i)).toBeTruthy());
    expect(screen.getByText(/not found in this template/i).closest('div')?.textContent).toContain('NOTE');
    expect(hoisted.getAllTemplates).toHaveBeenCalledTimes(2); // exactly once more — not polled
  });
});
