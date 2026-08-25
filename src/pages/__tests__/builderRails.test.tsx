/** @vitest-environment jsdom */
/**
 * builderRails.test.tsx
 *
 * The Report Blocks and Custom Functions tabs each gained the same left rail
 * the Sections tab already had, so a template with several blocks or a dozen
 * functions can be navigated instead of scrolled.
 *
 * What matters here, and what these assert:
 *   - every entry is listed (nothing is filtered by focus, same as the
 *     Sections rail — an item with a problem must stay reachable);
 *   - clicking an entry selects it, so the rail shows where you are;
 *   - the issue dot appears on the entry that actually has the issue, and
 *     not on a clean one;
 *   - the rails follow the SAME aria-label convention as the Sections rail,
 *     since tests and assistive tech query by it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { RecorderTemplate, ReportBlock } from '../../types';

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
import { RecorderTemplateBuilderPage, buildReportIssueBadges } from '../RecorderTemplateBuilderPage';

beforeEach(() => {
  (firebaseMock as any).store.clear();
  window.sessionStorage.clear();
});
afterEach(cleanup);

const BUDGET: ReportBlock = {
  id: 'BUD', label: 'Uncertainty budget', order: 0, kind: 'table', defaultRowCount: 2,
  columns: [
    { id: 'SRC', label: 'Source', order: 0, type: 'text' },
    { id: 'VAL', label: 'Value', order: 1, type: 'number' },
    { id: 'SQ', label: 'Squared', order: 2, type: 'formula', expression: 'BUD_VAL ** 2' },
  ],
};

const STATEMENT: ReportBlock = {
  id: 'STMT', label: 'Conformity statement', order: 1, kind: 'text',
  columns: [], defaultRowCount: 0, text: 'Assessed against ISO 7500-1.',
};

async function seedTemplate(blocks: ReportBlock[] = [BUDGET, STATEMENT]): Promise<string> {
  return recorderTemplateService.createTemplate({
    name: 'UTM Calibration',
    equipmentTypeId: 'eqtype1',
    roundCount: 1,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['UTM'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [{
      id: 'CAL', label: 'Calibration', order: 0,
      columns: [
        { id: 'IND', label: 'Indicated', order: 0, type: 'number' },
        { id: 'ERR', label: 'Error', order: 1, type: 'formula', expression: 'CAL_IND * 2' },
      ],
    }],
    summaryFields: [
      { id: 'MAXDEV', label: 'Max Deviation', type: 'number', expression: 'col_max(CAL_ERR)' },
      { id: 'MEANERR', label: 'Mean Error', type: 'number', expression: 'col_mean(CAL_ERR)' },
    ],
    customFunctions: [
      { name: 'half', params: ['a'], expression: 'a / 2' },
      { name: 'rss', params: ['a', 'b'], expression: '(a ** 2 + b ** 2) ** 0.5' },
    ],
    reportBlocks: blocks,
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

const gotoTab = (label: string) => fireEvent.click(screen.getByLabelText(`${label} tab`));

async function openBuilder(blocks: ReportBlock[] = [BUDGET, STATEMENT]) {
  const id = await seedTemplate(blocks);
  renderPage(id);
  await screen.findByLabelText('Sections tab');
}

describe('Report Blocks rail', () => {
  it('exists, and follows the same aria-label convention as the Sections rail', async () => {
    await openBuilder();
    gotoTab('Report Blocks');
    expect(screen.getByLabelText('Report block navigator')).toBeTruthy();
    // The Sections rail is still its own, unchanged.
    gotoTab('Sections');
    expect(screen.getByLabelText('Section and column navigator')).toBeTruthy();
  });

  it('lists every block, table and text alike', async () => {
    await openBuilder();
    gotoTab('Report Blocks');
    const rail = screen.getByLabelText('Report block navigator');
    expect(within(rail).getByLabelText('Focus block BUD')).toBeTruthy();
    expect(within(rail).getByLabelText('Focus block STMT')).toBeTruthy();
  });

  it("lists a table block's columns beneath it", async () => {
    await openBuilder();
    gotoTab('Report Blocks');
    const rail = screen.getByLabelText('Report block navigator');
    expect(within(rail).getByLabelText('Focus block column BUD_SRC')).toBeTruthy();
    expect(within(rail).getByLabelText('Focus block column BUD_VAL')).toBeTruthy();
    expect(within(rail).getByLabelText('Focus block column BUD_SQ')).toBeTruthy();
  });

  it('lists no columns for a TEXT block — it has no row axis', async () => {
    await openBuilder();
    gotoTab('Report Blocks');
    const rail = screen.getByLabelText('Report block navigator');
    expect(within(rail).queryByLabelText(/Focus block column STMT_/)).toBeNull();
  });

  it('clicking a block entry selects it', async () => {
    await openBuilder();
    gotoTab('Report Blocks');
    const entry = screen.getByLabelText('Focus block STMT');
    expect(entry.className).not.toContain('bg-primary-50');
    fireEvent.click(entry);
    expect(screen.getByLabelText('Focus block STMT').className).toContain('bg-primary-50');
  });

  it('clicking a block COLUMN entry selects that column, not the whole block', async () => {
    await openBuilder();
    gotoTab('Report Blocks');
    fireEvent.click(screen.getByLabelText('Focus block column BUD_VAL'));
    expect(screen.getByLabelText('Focus block column BUD_VAL').className).toContain('bg-primary-50');
    expect(screen.getByLabelText('Focus block BUD').className).not.toContain('bg-primary-50');
  });

  it('says so plainly when there are no blocks yet', async () => {
    await openBuilder([]);
    gotoTab('Report Blocks');
    const rail = screen.getByLabelText('Report block navigator');
    expect(within(rail).getByText('No report blocks yet')).toBeTruthy();
  });

  it('a newly added block appears in the rail immediately', async () => {
    await openBuilder([]);
    gotoTab('Report Blocks');
    fireEvent.click(screen.getByText('+ Add table block'));
    const rail = screen.getByLabelText('Report block navigator');
    // No id typed yet, so it falls back to a positional label.
    expect(within(rail).getByLabelText('Focus block Block 1')).toBeTruthy();
  });
});

describe('Custom Functions rail', () => {
  it('exists, with both groups', async () => {
    await openBuilder();
    gotoTab('Custom Functions');
    const rail = screen.getByLabelText('Function and summary field navigator');
    expect(within(rail).getByText('Custom Functions')).toBeTruthy();
    expect(within(rail).getByText('Summary Fields')).toBeTruthy();
  });

  it('lists every custom function and every summary field', async () => {
    await openBuilder();
    gotoTab('Custom Functions');
    const rail = screen.getByLabelText('Function and summary field navigator');
    expect(within(rail).getByLabelText('Focus function half')).toBeTruthy();
    expect(within(rail).getByLabelText('Focus function rss')).toBeTruthy();
    expect(within(rail).getByLabelText('Focus summary field MAXDEV')).toBeTruthy();
    expect(within(rail).getByLabelText('Focus summary field MEANERR')).toBeTruthy();
  });

  it('clicking a function selects it', async () => {
    await openBuilder();
    gotoTab('Custom Functions');
    fireEvent.click(screen.getByLabelText('Focus function rss'));
    expect(screen.getByLabelText('Focus function rss').className).toContain('bg-primary-50');
  });

  it('clicking a summary field selects it, and deselects the function', async () => {
    await openBuilder();
    gotoTab('Custom Functions');
    fireEvent.click(screen.getByLabelText('Focus function half'));
    fireEvent.click(screen.getByLabelText('Focus summary field MAXDEV'));
    expect(screen.getByLabelText('Focus summary field MAXDEV').className).toContain('bg-primary-50');
    expect(screen.getByLabelText('Focus function half').className).not.toContain('bg-primary-50');
  });

  it('shows the summary field by its formula name, so the rail matches what formulas reference', async () => {
    await openBuilder();
    gotoTab('Custom Functions');
    const rail = screen.getByLabelText('Function and summary field navigator');
    expect(within(rail).getByText('SUMMARY_MAXDEV')).toBeTruthy();
  });
});

describe('rail issue dots are attributed to the right entry', () => {
  it('marks the block and the block column that actually carry the issue', () => {
    const badges = buildReportIssueBadges(
      [BUDGET],
      [],
      [{ message: 'BUD_SQ: STD_C1 refers to the reference standard...' }],
    );
    expect(badges.blocks.BUD).toBe(true);
    expect(badges.blockColumns.BUD_SQ).toBe(true);
    // A clean sibling column is NOT marked.
    expect(badges.blockColumns.BUD_VAL).toBeUndefined();
  });

  it('marks a block from a block-level message', () => {
    const badges = buildReportIssueBadges(
      [BUDGET, STATEMENT],
      [],
      [{ message: "Report block 'STMT', placeholder {NOPE}: 'NOPE' is not a column in this template." }],
    );
    expect(badges.blocks.STMT).toBe(true);
    expect(badges.blocks.BUD).toBeUndefined();
  });

  it('marks the summary field that carries the issue, not its sibling', () => {
    const badges = buildReportIssueBadges(
      [],
      [
        { id: 'MAXDEV', label: 'M', type: 'number', expression: 'x' },
        { id: 'MEANERR', label: 'M2', type: 'number', expression: 'y' },
      ],
      [{ message: "SUMMARY_MAXDEV: 'x' is not a column in this template." }],
    );
    expect(badges.summaryFields.MAXDEV).toBe(true);
    expect(badges.summaryFields.MEANERR).toBeUndefined();
  });

  it('marks nothing before Verify has run', () => {
    expect(buildReportIssueBadges([BUDGET], [], null)).toEqual({ blocks: {}, blockColumns: {}, summaryFields: {} });
    expect(buildReportIssueBadges([BUDGET], [], [])).toEqual({ blocks: {}, blockColumns: {}, summaryFields: {} });
  });
});
