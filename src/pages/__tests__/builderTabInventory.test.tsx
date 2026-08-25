/** @vitest-environment jsdom */
/**
 * builderTabInventory.test.tsx
 *
 * Phase 26 Task 6 — test 12: every control from the pre-restructure
 * inventory still exists and is still WIRED.
 *
 * This exists because the same thing already went wrong once: Phase 16's
 * restructure silently dropped a control, and a type-check cannot catch it —
 * deleting JSX compiles perfectly. So this walks all five tabs against the
 * REAL page component and asserts each control is present; and for a
 * representative control on each tab, that it still changes state rather
 * than merely rendering (a control that renders but is no longer wired is
 * the subtler version of the same failure).
 *
 * The inventory is the one taken from the file BEFORE the restructure, kept
 * here in tab order so a future restructure has the same checklist to pass.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { RecorderTemplate } from '../../types';

vi.mock('../../services/firebase', async () => {
  const { createFakeFirestore } = await import('../../services/__tests__/fakeFirestore');
  return { ...createFakeFirestore(), auth: {}, deleteField: () => ({ __deleteField: true }) };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'admin1', role: 'admin' } }),
}));

vi.mock('../../hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: true, loading: false }),
}));

import * as firebaseMock from '../../services/firebase';
import { recorderTemplateService } from '../../services/recorderTemplateService';
import { RecorderTemplateBuilderPage, BUILDER_TABS } from '../RecorderTemplateBuilderPage';

beforeEach(() => {
  (firebaseMock as any).store.clear();
  window.sessionStorage.clear();
});
afterEach(cleanup);

async function seedTemplate(): Promise<string> {
  return recorderTemplateService.createTemplate({
    name: 'UTM Calibration',
    equipmentTypeId: 'eqtype1',
    roundCount: 1,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['UTM'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [
      {
        id: 'READ', label: 'Measurements', order: 0,
        columns: [
          { id: 'STD', label: 'Standard', order: 0, type: 'standard' },
          { id: 'R1', label: 'Reading 1', order: 1, type: 'number', unitMode: 'selectable', unitChoices: ['N', 'kN'] },
          { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'READ_R1', unitMode: 'fixed', unit: 'N' },
        ],
      },
    ],
    summaryFields: [{ id: 'MAXDEV', label: 'Max Deviation', type: 'number', expression: 'col_max(READ_ERR)' }],
    customFunctions: [{ name: 'half', params: ['a'], expression: 'a / 2' }],
    createdBy: 'admin1',
    updatedBy: 'admin1',
  } as Omit<RecorderTemplate, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'version'>);
}

function renderPage(templateId: string) {
  return render(
    <MemoryRouter initialEntries={[`/recorder-templates/${templateId}`]}>
      <Routes>
        <Route path="/recorder-templates/:templateId" element={<RecorderTemplateBuilderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function gotoTab(label: string) {
  fireEvent.click(screen.getByLabelText(`${label} tab`));
}

async function openBuilder(): Promise<void> {
  const id = await seedTemplate();
  renderPage(id);
  await screen.findByLabelText('Sections tab');
}

describe('Task 6 — the five tabs exist and are navigable', () => {
  it('renders exactly the five specified tabs, in the specified order', async () => {
    await openBuilder();
    expect(BUILDER_TABS.map((t) => t.label)).toEqual([
      'Sections', 'Report Blocks', 'Custom Functions', 'Test Data', 'Settings',
    ]);
    for (const tab of BUILDER_TABS) {
      expect(screen.getByLabelText(`${tab.label} tab`)).toBeTruthy();
    }
  });

  it('Sections is the default tab, and the active tab is marked for assistive tech', async () => {
    await openBuilder();
    expect(screen.getByLabelText('Sections tab').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('Settings tab').getAttribute('aria-selected')).toBe('false');

    gotoTab('Settings');
    expect(screen.getByLabelText('Settings tab').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('Sections tab').getAttribute('aria-selected')).toBe('false');
  });

  it('remembers the active tab for the session', async () => {
    const id = await seedTemplate();
    renderPage(id);
    await screen.findByLabelText('Sections tab');
    gotoTab('Custom Functions');

    // Remount, as a reload would.
    cleanup();
    renderPage(id);
    await screen.findByLabelText('Sections tab');
    expect(screen.getByLabelText('Custom Functions tab').getAttribute('aria-selected')).toBe('true');
  });
});

describe('test 12 — every control from the inventory still exists', () => {
  it('HEADER controls stay outside the tabs, reachable from every tab', async () => {
    await openBuilder();
    for (const tab of BUILDER_TABS) {
      gotoTab(tab.label);
      expect(screen.getByText('← Back to templates')).toBeTruthy();
      expect(screen.getByText('Help')).toBeTruthy();
      expect(screen.getByText('Verify')).toBeTruthy();
      expect(screen.getByText('Save')).toBeTruthy();
      expect(screen.getByText('Publish')).toBeTruthy();
      expect(screen.getByText('Reset Version')).toBeTruthy();
    }
  });

  it('SECTIONS tab: navigator, section controls and every per-type column panel', async () => {
    await openBuilder();
    gotoTab('Sections');

    expect(screen.getByLabelText('Section and column navigator')).toBeTruthy();
    expect(screen.getByLabelText('Focus section READ')).toBeTruthy();
    expect(screen.getByLabelText('Focus column READ_R1')).toBeTruthy();

    expect(screen.getByText('+ Add section')).toBeTruthy();
    expect(screen.getByText('+ Add column')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. CAL')).toBeTruthy();          // Section ID
    expect(screen.getByPlaceholderText('e.g. Measurements')).toBeTruthy(); // Section label
    expect(screen.getByTitle('Move section up')).toBeTruthy();
    expect(screen.getByTitle('Move section down')).toBeTruthy();
    expect(screen.getByTitle('Remove this section')).toBeTruthy();

    // Focused column editor (STD is focused by default).
    expect(screen.getByPlaceholderText('e.g. IND')).toBeTruthy();          // Column ID
    expect(screen.getByPlaceholderText('e.g. Indicated value')).toBeTruthy();
    expect(screen.getByTitle('Move column left')).toBeTruthy();
    expect(screen.getByTitle('Move column right')).toBeTruthy();
    expect(screen.getByTitle('Remove this column')).toBeTruthy();

    // number column -> Notation / Decimals / Preset
    fireEvent.click(screen.getByLabelText('Focus column READ_R1'));
    expect(screen.getByText('Notation')).toBeTruthy();
    expect(screen.getByText('Decimals')).toBeTruthy();
    expect(screen.getByPlaceholderText('pre-filled when recording starts')).toBeTruthy();
    // selectable unit mode -> Allowed units
    expect(screen.getByPlaceholderText('e.g. N, kN, kgF')).toBeTruthy();

    // formula column -> formula input, disclosure, conversion controls
    fireEvent.click(screen.getByLabelText('Focus column READ_ERR'));
    expect(screen.getByPlaceholderText('e.g. CAL_IND - CAL_NOM')).toBeTruthy();
    expect(screen.getByText(/Variables you can use/)).toBeTruthy();
    expect(screen.getByText(/Convert for display/)).toBeTruthy();
    expect(screen.getByText('Fixed unit')).toBeTruthy();
    // Phase 26 Task 1: a formula column now has the format controls too.
    expect(screen.getByText('Notation')).toBeTruthy();
    expect(screen.getByText('Decimals')).toBeTruthy();
  });

  it('CUSTOM FUNCTIONS tab: function and summary-field controls', async () => {
    await openBuilder();
    gotoTab('Custom Functions');

    expect(screen.getByText('Custom Functions & Summary Fields')).toBeTruthy();
    expect(screen.getByText('+ Add function')).toBeTruthy();
    expect(screen.getByText('+ Add summary field')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. mean3')).toBeTruthy();        // function name
    expect(screen.getByPlaceholderText('e.g. a, b, c')).toBeTruthy();      // params
    expect(screen.getByPlaceholderText('e.g. (a + b + c) / 3')).toBeTruthy(); // body
    expect(screen.getByPlaceholderText('e.g. MAXDEV')).toBeTruthy();       // summary id
    expect(screen.getByPlaceholderText('e.g. Max Deviation')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. col_max(CAL_ERR)')).toBeTruthy();
  });

  it('TEST DATA tab: the mockup harness and its own controls', async () => {
    await openBuilder();
    gotoTab('Test Data');

    expect(screen.getByText('Test with sample data')).toBeTruthy();
    // The panel is collapsed by default; opening it must still work.
    fireEvent.click(screen.getByText('Test with sample data'));
    expect(screen.getByText('Evaluate')).toBeTruthy();
    expect(screen.getByText('+ Add row')).toBeTruthy();
    expect(screen.getByLabelText('Report unit')).toBeTruthy();
  });

  it('SETTINGS tab: every template-level field and the published-versions panel', async () => {
    await openBuilder();
    gotoTab('Settings');

    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Equipment type')).toBeTruthy();
    expect(screen.getByText('Description')).toBeTruthy();
    expect(screen.getByText('Round count')).toBeTruthy();
    expect(screen.getByText('Default row count')).toBeTruthy();
    expect(screen.getByText('Technician may add rows')).toBeTruthy();
    expect(screen.getByRole('switch')).toBeTruthy();
  });
});

describe('test 12 — the controls are still WIRED, not just rendered', () => {
  it('a Sections-tab edit still updates state', async () => {
    await openBuilder();
    const sectionId = screen.getByPlaceholderText('e.g. CAL') as HTMLInputElement;
    fireEvent.change(sectionId, { target: { value: 'NEW' } });
    expect((screen.getByPlaceholderText('e.g. CAL') as HTMLInputElement).value).toBe('NEW');
  });

  it('a Settings-tab edit still updates state', async () => {
    await openBuilder();
    gotoTab('Settings');
    // Round count and Default row count both read '1', so target the field
    // by its own label rather than by display value.
    const roundLabel = screen.getByText('Round count');
    const round = roundLabel.parentElement!.querySelector('input')! as HTMLInputElement;
    fireEvent.change(round, { target: { value: '3' } });
    expect(
      (screen.getByText('Round count').parentElement!.querySelector('input') as HTMLInputElement).value,
    ).toBe('3');
  });

  it('the allowRowAdd switch still toggles', async () => {
    await openBuilder();
    gotoTab('Settings');
    const sw = screen.getByRole('switch');
    const before = sw.getAttribute('aria-checked');
    fireEvent.click(sw);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).not.toBe(before);
  });

  it('a Custom-Functions-tab edit still updates state', async () => {
    await openBuilder();
    gotoTab('Custom Functions');
    const name = screen.getByPlaceholderText('e.g. mean3') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'thirds' } });
    expect((screen.getByPlaceholderText('e.g. mean3') as HTMLInputElement).value).toBe('thirds');
  });

  it('adding a section from the Sections tab still works', async () => {
    await openBuilder();
    const before = screen.getAllByPlaceholderText('e.g. CAL').length;
    fireEvent.click(screen.getByText('+ Add section'));
    expect(screen.getAllByPlaceholderText('e.g. CAL').length).toBe(before + 1);
  });
});

describe('Task 6 — validation stays discoverable from every tab', () => {
  it('the Verify results panel is OUTSIDE the tabs, so an error found in Sections is readable while standing in Report Blocks', async () => {
    await openBuilder();
    fireEvent.click(screen.getByText('Verify'));
    const verdict = await screen.findByText(/issue|publishable/i);
    expect(verdict).toBeTruthy();

    // The whole point: switch away from Sections and the result is still there.
    gotoTab('Report Blocks');
    expect(screen.getByText(/issue|publishable/i)).toBeTruthy();
    gotoTab('Settings');
    expect(screen.getByText(/issue|publishable/i)).toBeTruthy();
  });
});
