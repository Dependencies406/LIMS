/** @vitest-environment jsdom */
/**
 * RecorderTemplateBuilderPage.test.tsx
 *
 * The layout-refactor task's own required tests, against the REAL page
 * component — not a reimplementation of it — so a control that got silently
 * dropped during the Task 2/3 restructure would fail here, not just look
 * fine in a manual click-through.
 *
 * Renders through react-router (the component reads `templateId` via
 * useParams) with AuthContext/usePermission mocked to a fixed admin user —
 * this page's own permission GATING is untouched by this refactor and out
 * of scope, so the mock just needs to let every control render, not
 * exercise the gating itself.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
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
import { RecorderTemplateBuilderPage } from '../RecorderTemplateBuilderPage';

beforeEach(() => {
  (firebaseMock as any).store.clear();
});
afterEach(cleanup);

/**
 * A template exercising every Phase 15 unit mode across two sections, so
 * the layout refactor's required tests all have real material to check
 * against: landscape order, an unfocused section's error still reachable,
 * navigator focus, and both fixed/selectable unit round-trips.
 */
async function seedTemplate(): Promise<string> {
  const id = await recorderTemplateService.createTemplate({
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
          // Non-empty and valid on purpose: verifyTemplate's structural pass
          // returns EARLY on ANY structural issue (an empty expression is
          // one), before it ever reaches the interpreter check that would
          // flag CAL_BROKEN below — an empty seed here would silently starve
          // the badge tests of the issue they're supposed to find.
          { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'READ_R1', unitMode: 'fixed', unit: 'N' },
        ],
      },
      {
        id: 'CAL', label: 'Calibration', order: 1,
        columns: [
          // Deliberately broken — references an identifier that does not
          // exist — so a real verifyTemplate() issue lands on THIS section,
          // which is not the one focused by default (READ is).
          { id: 'BROKEN', label: 'Broken', order: 0, type: 'formula', expression: 'NOPE + 1' },
        ],
      },
    ],
    summaryFields: [],
    customFunctions: [],
    createdBy: 'admin1',
    updatedBy: 'admin1',
  } as Omit<RecorderTemplate, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'version'>);
  return id;
}

/**
 * Phase 26 Task 6: the builder is now tabbed, so a control that used to be
 * on one long page may live behind a tab. Nothing was dropped — see
 * `builderTabInventory.test.tsx`, which asserts the full control inventory
 * survives — but a test wanting a control outside the default Sections tab
 * has to navigate to it first, exactly as an owner now does.
 */
function gotoTab(label: string) {
  fireEvent.click(screen.getByLabelText(`${label} tab`));
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

describe('RecorderTemplateBuilderPage — Task 1 inventory survives the refactor', () => {
  it('every control type from the inventory is present: section id/label, move/remove, column id/label/type/unit-mode, per-type panels, formula input + disclosure', async () => {
    const id = await seedTemplate();
    renderPage(id);
    await screen.findByText('Sections & Columns');

    // Section-level controls (two sections are seeded, so these are plural).
    expect(screen.getByDisplayValue('READ')).toBeTruthy();
    expect(screen.getByDisplayValue('Measurements')).toBeTruthy();
    expect(screen.getAllByTitle('Move section up').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Remove this section').length).toBeGreaterThan(0);

    // READ_STD is focused by default (first section, first column) — its
    // full editor, including the standard-column info panel, is visible.
    expect(screen.getByText('Reference standard picker')).toBeTruthy();

    // Focus R1 (selectable unit) and confirm its full editor's controls exist.
    fireEvent.click(screen.getByTestId('column-card-READ_R1'));
    expect(screen.getByDisplayValue('R1')).toBeTruthy();
    expect(screen.getByDisplayValue('Reading 1')).toBeTruthy();
    expect(screen.getByTitle('Move column left')).toBeTruthy();
    expect(screen.getByTitle('Remove this column')).toBeTruthy();
    expect(screen.getByText(/Allowed units/)).toBeTruthy();

    // Focus ERR (formula + fixed unit) and confirm the formula input, the
    // Phase 10 disclosure toggle, and the fixed-unit input all exist.
    fireEvent.click(screen.getByTestId('column-card-READ_ERR'));
    expect(screen.getByPlaceholderText('e.g. CAL_IND - CAL_NOM')).toBeTruthy();
    expect(screen.getByText(/Variables you can use/)).toBeTruthy();
    expect(screen.getByText('Fixed unit')).toBeTruthy();

    // Custom Functions & Summary Fields (moved to their own tab by Phase 26
    // Task 6, not dropped).
    gotoTab('Custom Functions');
    expect(screen.getByText('Custom Functions & Summary Fields')).toBeTruthy();
    expect(screen.getByText('+ Add function')).toBeTruthy();
    expect(screen.getByText('+ Add summary field')).toBeTruthy();

    // The mockup harness toggle, now on the Test Data tab.
    gotoTab('Test Data');
    expect(screen.getByText('Test with sample data')).toBeTruthy();
  });
});

describe('RecorderTemplateBuilderPage — navigator focus (Task 2)', () => {
  it('clicking a navigator column entry focuses it — its full editor replaces the compact card', async () => {
    const id = await seedTemplate();
    renderPage(id);
    await screen.findByText('Sections & Columns');

    // Not focused yet: R1 renders as its compact card (an "Expand column" button).
    expect(screen.getByLabelText('Expand column READ_R1')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Focus column READ_R1'));

    // Now focused: the compact button is gone, replaced by the full editor
    // (its Column ID input, among other things, now exists).
    expect(screen.queryByLabelText('Expand column READ_R1')).toBeNull();
    expect(screen.getByDisplayValue('R1')).toBeTruthy();
  });

  it('clicking a navigator section entry focuses that section without a specific column', async () => {
    const id = await seedTemplate();
    renderPage(id);
    await screen.findByText('Sections & Columns');

    fireEvent.click(screen.getByLabelText('Focus section CAL'));

    // No column in CAL is focused (CAL_BROKEN is its only column, and it's
    // now compact, not expanded) — section focus alone does not force-open
    // a column's full editor.
    expect(screen.getByLabelText('Expand column CAL_BROKEN')).toBeTruthy();
  });
});

describe('RecorderTemplateBuilderPage — validation badges (Task 2)', () => {
  it('after Verify, the section/column that actually has an issue gets a badge; a clean one does not', async () => {
    const id = await seedTemplate();
    renderPage(id);
    await screen.findByText('Sections & Columns');

    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await screen.findByText(/issue.*found/);

    // CAL_BROKEN's issue badge — the navigator entry now shows a red dot
    // (rendered as a title attribute on a <span>, since it's a plain div).
    const brokenEntry = screen.getByLabelText('Focus column CAL_BROKEN');
    expect(within(brokenEntry).getByTitle('Has a validation issue — see Verify')).toBeTruthy();

    const calSection = screen.getByLabelText('Focus section CAL');
    expect(within(calSection).getByTitle('Has a validation issue — see Verify')).toBeTruthy();

    // READ_STD (clean) has no badge in the navigator.
    const stdEntry = screen.getByLabelText('Focus column READ_STD');
    expect(within(stdEntry).queryByTitle('Has a validation issue — see Verify')).toBeNull();
  });

  it('an error in an UNFOCUSED section is still reachable — not hidden by the READ-focused default view', async () => {
    const id = await seedTemplate();
    renderPage(id);
    await screen.findByText('Sections & Columns');

    // Default focus is READ (section 0), not CAL — confirm that first.
    expect(screen.getByText('Reference standard picker')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await screen.findByText(/issue.*found/);

    // CAL's badge is visible in the nav WITHOUT ever focusing CAL — nothing
    // about the issue was filtered out by READ being the focused section.
    const calSection = screen.getByLabelText('Focus section CAL');
    expect(within(calSection).getByTitle('Has a validation issue — see Verify')).toBeTruthy();

    // And CAL_BROKEN itself is still fully present in the main content
    // area (as a compact card), not removed from the DOM by the focus.
    expect(screen.getByTestId('column-card-CAL_BROKEN')).toBeTruthy();

    // Clicking it reaches the real editor.
    fireEvent.click(screen.getByLabelText('Focus column CAL_BROKEN'));
    expect(screen.getByDisplayValue('BROKEN')).toBeTruthy();
  });
});

describe('RecorderTemplateBuilderPage — landscape column order (Task 3)', () => {
  it('columns render left to right in template order within their section', async () => {
    const id = await seedTemplate();
    renderPage(id);
    await screen.findByText('Sections & Columns');

    const row = screen.getByTestId('section-columns-READ');
    const cards = within(row).getAllByTestId(/^column-card-READ_/);
    expect(cards.map((el) => el.getAttribute('data-testid'))).toEqual([
      'column-card-READ_STD',
      'column-card-READ_R1',
      'column-card-READ_ERR',
    ]);
  });
});

describe('RecorderTemplateBuilderPage — Phase 10 variable disclosure (must keep working)', () => {
  it('opens and inserts the clicked variable at the cursor in the formula input', async () => {
    const id = await seedTemplate();
    renderPage(id);
    await screen.findByText('Sections & Columns');

    fireEvent.click(screen.getByTestId('column-card-READ_ERR'));
    const formulaInput = screen.getByPlaceholderText('e.g. CAL_IND - CAL_NOM') as HTMLInputElement;
    // Seeded non-empty (see seedTemplate's comment); clear it first so the
    // insertion's landing position is unambiguous.
    fireEvent.change(formulaInput, { target: { value: '' } });
    expect(formulaInput.value).toBe('');

    fireEvent.click(screen.getByText(/Variables you can use/));
    // "READ_R1" also appears as plain text in the navigator (a <span>
    // inside a button whose ACCESSIBLE NAME is overridden by aria-label to
    // "Focus column READ_R1") — querying by role+accessible-name lands only
    // on the disclosure's own button, whose name really is "READ_R1".
    fireEvent.click(screen.getByRole('button', { name: 'READ_R1' }));

    expect(formulaInput.value).toBe('READ_R1');
  });
});

describe('RecorderTemplateBuilderPage — custom function Parameters field accepts a typed comma', () => {
  it('typing a trailing comma is not erased before the next character can be typed', async () => {
    const id = await seedTemplate();
    renderPage(id);
    await screen.findByText('Sections & Columns');

    // Phase 26 Task 6: custom functions have their own tab now. The panel
    // inside it is still open by default (see showFunctionsPanel), so only
    // the tab click is new.
    gotoTab('Custom Functions');
    fireEvent.click(screen.getByText('+ Add function'));

    const paramsInput = screen.getByPlaceholderText('e.g. a, b, c') as HTMLInputElement;
    fireEvent.change(paramsInput, { target: { value: 'a,' } });
    // The naive version (value={params.join(', ')}, reparsed+rejoined every
    // keystroke) would have snapped this back to "a", silently deleting the
    // comma just typed — see CommaListInput's own doc comment.
    expect(paramsInput.value).toBe('a,');

    fireEvent.change(paramsInput, { target: { value: 'a, b' } });
    expect(paramsInput.value).toBe('a, b');
  });
});

describe('RecorderTemplateBuilderPage — Phase 15 unit inputs round-trip (must keep working)', () => {
  it('fixed unit: shows the seeded unit and can be changed', async () => {
    const id = await seedTemplate();
    renderPage(id);
    await screen.findByText('Sections & Columns');

    fireEvent.click(screen.getByTestId('column-card-READ_ERR'));
    const fixedUnitInput = screen.getByPlaceholderText('e.g. N, °C, mV/V') as HTMLInputElement;
    expect(fixedUnitInput.value).toBe('N');

    fireEvent.change(fixedUnitInput, { target: { value: 'kN' } });
    expect(fixedUnitInput.value).toBe('kN');
  });

  it('selectable unit: shows the seeded choices, joined, and can be extended', async () => {
    const id = await seedTemplate();
    renderPage(id);
    await screen.findByText('Sections & Columns');

    fireEvent.click(screen.getByTestId('column-card-READ_R1'));
    const choicesInput = screen.getByPlaceholderText('e.g. N, kN, kgF') as HTMLInputElement;
    expect(choicesInput.value).toBe('N, kN');

    fireEvent.change(choicesInput, { target: { value: 'N, kN, kgF' } });
    expect(choicesInput.value).toBe('N, kN, kgF');
  });
});
