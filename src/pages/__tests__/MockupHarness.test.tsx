/** @vitest-environment jsdom */
/**
 * MockupHarness.test.tsx
 *
 * ADR-014 Phase 14 Task 1: the template builder's test harness must be able
 * to exercise a `standard` column and REPORT_TO_N without creating a job and
 * a record. This renders the REAL harness component (not a reimplementation)
 * and drives it through real DOM interactions — selecting an option, typing
 * a reading, clicking Evaluate — asserting on what the harness actually
 * renders, the same evidence a template author would see.
 *
 * evaluateMockup itself is untouched (Phase 13/14 constraint); these tests
 * prove the HARNESS now calls it correctly (4 args, REPORT_TO_N in env).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { RecorderTemplate } from '../../types';

// MockupHarness lives in RecorderTemplateBuilderPage.tsx, which transitively
// imports ../services/firebase (via AuthContext, recorderTemplateService,
// etc.) — mock it so rendering the harness never touches real Firebase, the
// same guard used for EquipmentDetailPage's normalizeEquationName tests.
vi.mock('../../services/firebase', async () => {
  const { createFakeFirestore } = await import('../../services/__tests__/fakeFirestore');
  return { ...createFakeFirestore(), auth: {}, deleteField: () => ({ __deleteField: true }) };
});

import * as firebaseMock from '../../services/firebase';
import { MockupHarness } from '../RecorderTemplateBuilderPage';

beforeEach(() => {
  (firebaseMock as any).store.clear();
});

// This project has no global RTL setupFiles (unlike Jest's default),
// so cleanup between tests is not automatic — each render() would otherwise
// accumulate in jsdom's document, breaking role/name queries across tests.
afterEach(cleanup);

function seedEquipment(id: string, overrides: Record<string, unknown> = {}) {
  const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
  store.set(`equipmentControl/${id}`, {
    data: {
      name: `Transducer ${id}`,
      category: 'FRC',
      serialNumber: `SN-${id}`,
      isReferenceStandard: true,
      status: 'active',
      nextCalibrationDate: '2099-01-01',
      ...overrides,
    },
    version: 0,
  });
}

function seedEquation(equipmentId: string, equationId: string, descendingCoefficients: number[]) {
  const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
  store.set(`equipmentControl/${equipmentId}/conversionEquations/${equationId}`, {
    data: {
      name: `${equipmentId} range`,
      inputUnit: 'mV/V',
      outputUnit: 'N',
      degree: descendingCoefficients.length - 1,
      coefficients: descendingCoefficients.map((value) => ({ value, inputMode: 'decimal', raw: String(value) })),
      divisor: 1,
      createdAt: new Date(),
    },
    version: 0,
  });
}

function templateWithStandard(): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'T',
    equipmentTypeId: 'eq1',
    roundCount: 0,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [
      {
        id: 'M', label: 'M', order: 0,
        columns: [
          { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
          { id: 'R', label: 'Reading', order: 1, type: 'number' },
          { id: 'F', label: 'Force', order: 2, type: 'formula', expression: 'STD_C1 * M_R' },
        ],
      },
    ],
    summaryFields: [],
    customFunctions: [],
    status: 'draft',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u',
    updatedBy: 'u',
  } as RecorderTemplate;
}

function templateWithReportUnit(): RecorderTemplate {
  return {
    id: 'tpl2',
    name: 'T2',
    equipmentTypeId: 'eq1',
    roundCount: 0,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [
      {
        id: 'M', label: 'M', order: 0,
        columns: [
          { id: 'R', label: 'Reading', order: 0, type: 'number' },
          { id: 'F', label: 'Reported', order: 1, type: 'formula', expression: 'M_R / REPORT_TO_N' },
        ],
      },
    ],
    summaryFields: [],
    customFunctions: [],
    status: 'draft',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u',
    updatedBy: 'u',
  } as RecorderTemplate;
}

describe('MockupHarness — standard column resolves STD_* (Task 1, tests 1-2)', () => {
  it('with a standard selected, STD_C1 resolves to a number, not awaiting-input', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq1', [10, 0]); // F = 10R

    render(<MockupHarness template={templateWithStandard()} />);

    // Options load asynchronously (loadStandardOptions) — wait for the real option to appear.
    const select = await screen.findByRole('combobox', { name: 'M_STDSEL (row 1)' });
    await waitFor(() => expect(select.querySelectorAll('option').length).toBeGreaterThan(1));

    fireEvent.change(select, { target: { value: 'EQ-A::eq1' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'M_R (row 1)' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    const cell = screen.getByTestId('M_F-row0');
    expect(cell.textContent).toBe('20'); // 10 * 2
    expect(cell.textContent).not.toBe('…');
  });

  it('with NO standard selected, STD_C1 gives awaiting-input, not a fabricated 0', async () => {
    seedEquipment('EQ-A');
    seedEquation('EQ-A', 'eq1', [10, 0]);

    render(<MockupHarness template={templateWithStandard()} />);

    const select = await screen.findByRole('combobox', { name: 'M_STDSEL (row 1)' });
    await waitFor(() => expect(select.querySelectorAll('option').length).toBeGreaterThan(1));
    // Deliberately leave the "— none —" default selected.

    fireEvent.change(screen.getByRole('spinbutton', { name: 'M_R (row 1)' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    const cell = screen.getByTestId('M_F-row0');
    expect(cell.textContent).toBe('…'); // the quiet awaiting-input glyph (ADR-010)
  });

  it('says plainly when no equipment is flagged as a reference standard yet', async () => {
    // No equipment seeded at all. findByText rejects (failing the test) if
    // the message never appears — no extra matcher needed.
    render(<MockupHarness template={templateWithStandard()} />);
    await screen.findByText(/No equipment is flagged as a reference standard yet/);
  });
});

describe('MockupHarness — REPORT_TO_N (Task 1, test 3)', () => {
  it('is null (awaiting-input) when no report unit is chosen', () => {
    render(<MockupHarness template={templateWithReportUnit()} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'M_R (row 1)' }), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    expect(screen.getByTestId('M_F-row0').textContent).toBe('…');
  });

  it('resolves once a report unit is chosen', () => {
    render(<MockupHarness template={templateWithReportUnit()} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Report unit' }), { target: { value: 'kN' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'M_R (row 1)' }), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    // 20000 N / REPORT_TO_N(kN=1000) = 20
    expect(screen.getByTestId('M_F-row0').textContent).toBe('20');
  });

  it('never defaults to N — re-selecting the empty option goes back to awaiting-input', () => {
    render(<MockupHarness template={templateWithReportUnit()} />);
    const reportSelect = screen.getByRole('combobox', { name: 'Report unit' });

    fireEvent.change(reportSelect, { target: { value: 'N' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'M_R (row 1)' }), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
    expect(screen.getByTestId('M_F-row0').textContent).toBe('5'); // 5 / 1

    fireEvent.change(reportSelect, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
    expect(screen.getByTestId('M_F-row0').textContent).toBe('…');
  });
});

/**
 * Phase 15 Task 1 (superseded): the harness is where an author previews what
 * the real sheet will look like, so a 'selectable' column's unit must be
 * pickable HERE too — otherwise the only previewable state is the unpicked
 * one, and the author can never see the header they will actually ship.
 */
function templateWithUnits(): RecorderTemplate {
  return {
    id: 'tpl3',
    name: 'T3',
    equipmentTypeId: 'eq1',
    roundCount: 0,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [
      {
        id: 'M', label: 'Measurements', order: 0,
        columns: [
          { id: 'R', label: 'Reading', order: 0, type: 'number', unitMode: 'selectable', unitChoices: ['N', 'kN', 'kgF'] },
          { id: 'FIX', label: 'Nominal', order: 1, type: 'number', unitMode: 'fixed', unit: 'mm' },
          { id: 'PLAIN', label: 'Remark', order: 2, type: 'text' },
          { id: 'DBL', label: 'Doubled', order: 3, type: 'formula', expression: 'M_R * 2' },
        ],
      },
    ],
    summaryFields: [],
    customFunctions: [],
    status: 'draft',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u',
    updatedBy: 'u',
  } as RecorderTemplate;
}

describe('MockupHarness — column unit is previewable (Phase 15)', () => {
  it('a fixed-unit column shows "label (unit)" in the header', () => {
    render(<MockupHarness template={templateWithUnits()} />);
    expect(screen.getByText('Nominal (mm)')).toBeTruthy();
  });

  it('a column with no unit shows the plain label, no parentheses', () => {
    render(<MockupHarness template={templateWithUnits()} />);
    expect(screen.getByText('Remark')).toBeTruthy();
  });

  it('a selectable column starts unpicked, showing the plain label', () => {
    render(<MockupHarness template={templateWithUnits()} />);
    expect(screen.getByText('Reading')).toBeTruthy();
  });

  it('picking a unit updates that column header to "label (chosen)"', () => {
    render(<MockupHarness template={templateWithUnits()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'M_R unit' }), { target: { value: 'kN' } });
    expect(screen.getByText('Reading (kN)')).toBeTruthy();
  });

  it('changing the picked unit again re-renders the header', () => {
    render(<MockupHarness template={templateWithUnits()} />);
    const picker = screen.getByRole('combobox', { name: 'M_R unit' });
    fireEvent.change(picker, { target: { value: 'kN' } });
    expect(screen.getByText('Reading (kN)')).toBeTruthy();
    fireEvent.change(picker, { target: { value: 'kgF' } });
    expect(screen.getByText('Reading (kgF)')).toBeTruthy();
  });

  it('only selectable columns get a picker — fixed and no-unit columns do not', () => {
    render(<MockupHarness template={templateWithUnits()} />);
    expect(screen.queryByRole('combobox', { name: 'M_FIX unit' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'M_PLAIN unit' })).toBeNull();
  });

  it('NON-NEGOTIABLE: picking a unit changes the header only, never a computed value', () => {
    render(<MockupHarness template={templateWithUnits()} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'M_R (row 1)' }), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
    const before = screen.getByTestId('M_DBL-row0').textContent;
    expect(before).toBe('42');

    fireEvent.change(screen.getByRole('combobox', { name: 'M_R unit' }), { target: { value: 'kN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    expect(screen.getByTestId('M_DBL-row0').textContent).toBe(before);
    expect(screen.getByText('Reading (kN)')).toBeTruthy();
  });
});
