import { describe, it, expect } from 'vitest';
import {
  buildGridLayout,
  buildGridDocument,
  extractInputRows,
  invertStandardLabels,
  findStandardDependentFormulaColumns,
  findColumnUnitReportUnitMismatches,
  findConversionSourceUnitMismatch,
  findConversionFailures,
  numberFormatToTrebFormat,
  mergeComputedIntoRow,
  findStandardColumn,
  inheritedStandardValue,
  formatColumnHeader,
  effectiveColumnUnit,
  parseCommaSeparatedList,
  findSelectableUnitColumns,
  isValidColumnUnitChoice,
  resolveColumnUnitMap,
  joinLabelAndUnit,
  SECTION_HEADER_ROW,
  COLUMN_HEADER_ROW,
  FIRST_DATA_ROW,
} from '../recordingGridDocument';
import type { ConversionRule, RecorderTemplate } from '../../types';

function baseTemplate(overrides: Partial<RecorderTemplate> = {}): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'UTM',
    equipmentTypeId: 'eqtype1',
    roundCount: 2,
    defaultRowCount: 3,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['UTM'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [
      {
        id: 'CAL',
        label: 'Calibration',
        order: 0,
        columns: [
          { id: 'NOM', label: 'Nominal', order: 0, type: 'number', numberFormat: { notation: 'fixed', decimals: 2 } },
          { id: 'IND', label: 'Indicated', order: 1, type: 'number', numberFormat: { notation: 'fixed', decimals: 2 } },
          { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'CAL_IND - CAL_NOM' },
        ],
      },
      {
        id: 'NOTE',
        label: 'Notes',
        order: 1,
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
  };
}

function templateWithStandard() {
  return baseTemplate({
    sections: [
      {
        id: 'M', label: 'M', order: 0,
        columns: [
          { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
          { id: 'R', label: 'Reading', order: 1, type: 'number' },
        ],
      },
    ],
  });
}

describe('buildGridLayout', () => {
  it('assigns sequential column indices across sections', () => {
    const layout = buildGridLayout(baseTemplate());
    expect(layout.columns.map((c) => c.key)).toEqual(['CAL_NOM', 'CAL_IND', 'CAL_ERR', 'NOTE_REM']);
    expect(layout.columns.map((c) => c.gridColumnIndex)).toEqual([0, 1, 2, 3]);
  });

  it('computes one section merge per section, spanning its columns', () => {
    const layout = buildGridLayout(baseTemplate());
    expect(layout.sectionMerges).toEqual([
      { area: { start: { row: 0, column: 0 }, end: { row: 0, column: 2 } }, label: 'Calibration' },
      { area: { start: { row: 0, column: 3 }, end: { row: 0, column: 3 } }, label: 'Notes' },
    ]);
  });

  it('falls back to the section id as the label when label is empty', () => {
    const template = baseTemplate({
      sections: [{ id: 'X', label: '', order: 0, columns: [{ id: 'A', label: 'a', order: 0, type: 'text' }] }],
    });
    const layout = buildGridLayout(template);
    expect(layout.sectionMerges[0].label).toBe('X');
  });

  it('produces no merges for an empty section list', () => {
    const layout = buildGridLayout(baseTemplate({ sections: [] }));
    expect(layout.columns).toEqual([]);
    expect(layout.sectionMerges).toEqual([]);
  });

  it('skips a merge for a section with zero columns', () => {
    const template = baseTemplate({
      sections: [
        { id: 'EMPTY', label: 'Empty', order: 0, columns: [] },
        { id: 'CAL', label: 'Cal', order: 1, columns: [{ id: 'A', label: 'a', order: 0, type: 'text' }] },
      ],
    });
    const layout = buildGridLayout(template);
    expect(layout.sectionMerges).toHaveLength(1);
    expect(layout.sectionMerges[0].label).toBe('Cal');
  });
});

describe('numberFormatToTrebFormat', () => {
  it('fixed notation with decimals', () => {
    expect(numberFormatToTrebFormat({ notation: 'fixed', decimals: 2 })).toBe('0.00');
  });

  it('fixed notation with zero decimals', () => {
    expect(numberFormatToTrebFormat({ notation: 'fixed', decimals: 0 })).toBe('0');
  });

  it('scientific notation with decimals — decimals control mantissa precision (ADR-011)', () => {
    expect(numberFormatToTrebFormat({ notation: 'scientific', decimals: 3 })).toBe('0.000E+00');
  });

  it('scientific notation with zero decimals', () => {
    expect(numberFormatToTrebFormat({ notation: 'scientific', decimals: 0 })).toBe('0E+00');
  });
});

describe('buildGridDocument', () => {
  const rows = [
    { CAL_NOM: 100, CAL_IND: 100.2, CAL_ERR: 0.2, NOTE_REM: 'ok' },
    { CAL_NOM: 200, CAL_IND: null, NOTE_REM: null },
  ];

  it('places section labels only at each merge start column', () => {
    const doc = buildGridDocument(baseTemplate(), rows);
    expect(doc.headerRows[SECTION_HEADER_ROW]).toEqual(['Calibration', undefined, undefined, 'Notes']);
  });

  it('places a column label for every column', () => {
    const doc = buildGridDocument(baseTemplate(), rows);
    // Phase 22 Task 1: a formula column's header carries a "ƒ " marker —
    // "a symbol... not colour alone" — so it reads as calculated even to a
    // colour-blind reader or a screen reader.
    expect(doc.headerRows[COLUMN_HEADER_ROW]).toEqual(['Nominal', 'Indicated', 'ƒ Error', 'Remark']);
  });

  it('builds one data row per record row, values in column order', () => {
    const doc = buildGridDocument(baseTemplate(), rows);
    expect(doc.dataRows).toEqual([
      [100, 100.2, 0.2, 'ok'],
      [200, undefined, undefined, undefined],
    ]);
  });

  it('converts null to undefined (empty cell) in data rows', () => {
    const doc = buildGridDocument(baseTemplate(), rows);
    expect(doc.dataRows[1][1]).toBeUndefined(); // CAL_IND was null
  });

  it('locks the formula column across every data row', () => {
    const doc = buildGridDocument(baseTemplate(), rows);
    expect(doc.lockedRanges).toEqual([
      { start: { row: FIRST_DATA_ROW, column: 2 }, end: { row: FIRST_DATA_ROW + 1, column: 2 } },
    ]);
  });

  it('does not lock input or text columns', () => {
    const doc = buildGridDocument(baseTemplate(), rows);
    const lockedColumns = doc.lockedRanges.map((r) => r.start.column);
    expect(lockedColumns).not.toContain(0); // CAL_NOM
    expect(lockedColumns).not.toContain(1); // CAL_IND
    expect(lockedColumns).not.toContain(3); // NOTE_REM
  });

  it('produces no locked ranges when there are no rows yet', () => {
    const doc = buildGridDocument(baseTemplate(), []);
    expect(doc.lockedRanges).toEqual([]);
  });

  it('Phase 22 Task 1: assigns a role to every column — number/text as input, formula as formula, standard as standard', () => {
    const template: RecorderTemplate = {
      ...baseTemplate(),
      sections: [{
        id: 'S', label: 'S', order: 0,
        columns: [
          { id: 'STD', label: 'Std', order: 0, type: 'standard' },
          { id: 'N', label: 'N', order: 1, type: 'number' },
          { id: 'T', label: 'T', order: 2, type: 'text' },
          { id: 'F', label: 'F', order: 3, type: 'formula', expression: 'S_N' },
        ],
      }],
    };
    const doc = buildGridDocument(template, [{}]);
    const roleByColumn = Object.fromEntries(doc.columnRoles.map((r) => [r.area.start.column, r.role]));
    expect(roleByColumn).toEqual({ 0: 'standard', 1: 'input', 2: 'input', 3: 'formula' });
  });

  it('a column role range spans every seeded data row', () => {
    const doc = buildGridDocument(baseTemplate(), rows); // 2 rows
    const nomRole = doc.columnRoles.find((r) => r.area.start.column === 0)!;
    expect(nomRole.area).toEqual({ start: { row: FIRST_DATA_ROW, column: 0 }, end: { row: FIRST_DATA_ROW + 1, column: 0 } });
  });

  it('produces no role ranges when there are no rows yet (mirrors lockedRanges)', () => {
    const doc = buildGridDocument(baseTemplate(), []);
    expect(doc.columnRoles).toEqual([]);
  });

  it('emits a number format for declaring number columns AND for every formula column', () => {
    // Phase 26 Task 1: a formula column with no author format now gets the
    // "at most 4 decimals, no trailing zeros" default mask, which is what
    // fixes the reported ##### overflow and -5.42e-15 float noise. Number
    // columns are unchanged: no declaration, no format.
    const doc = buildGridDocument(baseTemplate(), rows);
    expect(doc.numberFormats).toEqual([
      { columnIndex: 0, format: '0.00' },
      { columnIndex: 1, format: '0.00' },
      { columnIndex: 2, format: '0.####' },
    ]);
  });

  it('computes totalRows as header rows plus data rows', () => {
    const doc = buildGridDocument(baseTemplate(), rows);
    expect(doc.totalRows).toBe(FIRST_DATA_ROW + 2);
  });
});

describe('effectiveColumnUnit (Phase 15 Task 1 supersession)', () => {
  it('fixed mode returns the set unit', () => {
    expect(effectiveColumnUnit({ unitMode: 'fixed', unit: 'N' })).toBe('N');
  });

  it('fixed mode with no unit set returns undefined', () => {
    expect(effectiveColumnUnit({ unitMode: 'fixed' })).toBeUndefined();
  });

  it('selectable mode returns the chosen unit when given one', () => {
    expect(effectiveColumnUnit({ unitMode: 'selectable', unitChoices: ['N', 'kN'] }, 'kN')).toBe('kN');
  });

  it('selectable mode with nothing chosen returns undefined', () => {
    expect(effectiveColumnUnit({ unitMode: 'selectable', unitChoices: ['N', 'kN'] })).toBeUndefined();
  });

  it('no unitMode returns undefined regardless of a stray unit/chosen value', () => {
    expect(effectiveColumnUnit({ unit: 'N' }, 'kN')).toBeUndefined();
  });
});

describe('formatColumnHeader (Phase 15 Task 1, superseded by fixed/selectable)', () => {
  it('fixed mode renders "label (unit)"', () => {
    expect(formatColumnHeader({ id: 'NOM', label: 'Nominal', unitMode: 'fixed', unit: 'N' })).toBe('Nominal (N)');
  });

  it('selectable mode renders "label (chosen)" once something is picked', () => {
    expect(formatColumnHeader({ id: 'NOM', label: 'Nominal', unitMode: 'selectable', unitChoices: ['N', 'kN'] }, 'kN')).toBe('Nominal (kN)');
  });

  it('selectable mode with nothing chosen yet renders plain label, no parentheses', () => {
    expect(formatColumnHeader({ id: 'NOM', label: 'Nominal', unitMode: 'selectable', unitChoices: ['N', 'kN'] })).toBe('Nominal');
  });

  it('neither mode set renders the plain label with no stray parentheses', () => {
    expect(formatColumnHeader({ id: 'NOM', label: 'Nominal' })).toBe('Nominal');
  });

  it('fixed mode with an empty unit string renders the plain label, no stray parentheses', () => {
    expect(formatColumnHeader({ id: 'NOM', label: 'Nominal', unitMode: 'fixed', unit: '' })).toBe('Nominal');
  });

  it('falls back to id when label is blank, still joining the unit', () => {
    expect(formatColumnHeader({ id: 'NOM', label: '', unitMode: 'fixed', unit: 'kN' })).toBe('NOM (kN)');
  });
});

describe('parseCommaSeparatedList (Phase 15 Task 1 supersession)', () => {
  it('parses "N, kN, kgF" into three trimmed entries', () => {
    expect(parseCommaSeparatedList('N, kN, kgF')).toEqual(['N', 'kN', 'kgF']);
  });

  it('drops blank entries from stray/trailing commas', () => {
    expect(parseCommaSeparatedList('N,, kN,')).toEqual(['N', 'kN']);
  });

  it('returns an empty array for blank input', () => {
    expect(parseCommaSeparatedList('')).toEqual([]);
  });
});

describe('buildGridDocument — column header includes unit (Phase 15 Task 1, superseded)', () => {
  const rows = [
    { CAL_NOM: 100, CAL_IND: 100.2, CAL_ERR: 0.2, NOTE_REM: 'ok' },
    { CAL_NOM: 200, CAL_IND: null, NOTE_REM: null },
  ];

  function templateWithUnits() {
    return baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'Calibration', order: 0,
          columns: [
            { id: 'NOM', label: 'Nominal', order: 0, type: 'number', numberFormat: { notation: 'fixed', decimals: 2 }, unitMode: 'fixed', unit: 'N' },
            { id: 'IND', label: 'Indicated', order: 1, type: 'number', numberFormat: { notation: 'fixed', decimals: 2 }, unitMode: 'selectable', unitChoices: ['N', 'kN'] },
            { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'CAL_IND - CAL_NOM', unitMode: 'fixed', unit: 'N' },
          ],
        },
        {
          id: 'NOTE', label: 'Notes', order: 1,
          columns: [{ id: 'REM', label: 'Remark', order: 0, type: 'text' }],
        },
      ],
    });
  }

  it('renders "label (unit)" for fixed columns, "label (chosen)" for a selectable column with a choice, plain label for a selectable column with none chosen yet', () => {
    const doc = buildGridDocument(templateWithUnits(), rows, {}, { CAL_IND: 'kN' });
    // Phase 22 Task 1: the formula column's "ƒ " marker composes with its unit suffix.
    expect(doc.headerRows[COLUMN_HEADER_ROW]).toEqual(['Nominal (N)', 'Indicated (kN)', 'ƒ Error (N)', 'Remark']);
  });

  it('a selectable column with nothing chosen yet renders the plain label, no parentheses', () => {
    const doc = buildGridDocument(templateWithUnits(), rows);
    expect(doc.headerRows[COLUMN_HEADER_ROW]).toEqual(['Nominal (N)', 'Indicated', 'ƒ Error (N)', 'Remark']);
  });

  it('a template with no units anywhere renders headers unchanged from today, aside from Phase 22\'s formula marker', () => {
    const doc = buildGridDocument(baseTemplate(), rows);
    expect(doc.headerRows[COLUMN_HEADER_ROW]).toEqual(['Nominal', 'Indicated', 'ƒ Error', 'Remark']);
    expect(doc.headerRows[COLUMN_HEADER_ROW].join('')).not.toContain('(');
  });

  it('changing a column unit (fixed or the chosen unit) does not change any data row value', () => {
    const withUnits = buildGridDocument(templateWithUnits(), rows, {}, { CAL_IND: 'kN' });
    const without = buildGridDocument(baseTemplate(), rows);
    expect(withUnits.dataRows).toEqual(without.dataRows);
  });
});

describe('findSelectableUnitColumns (Phase 15 Task 1 supersession)', () => {
  it('finds every column in unitMode selectable', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [
            { id: 'NOM', label: 'Nominal', order: 0, type: 'number', unitMode: 'fixed', unit: 'N' },
            { id: 'IND', label: 'Indicated', order: 1, type: 'number', unitMode: 'selectable', unitChoices: ['N', 'kN'] },
          ],
        },
      ],
    });
    expect(findSelectableUnitColumns(template).map((c) => c.key)).toEqual(['CAL_IND']);
  });

  it('returns an empty array when no column uses selectable', () => {
    expect(findSelectableUnitColumns(baseTemplate())).toEqual([]);
  });
});

describe('isValidColumnUnitChoice (Phase 15 Task 1 supersession)', () => {
  const column = { unitMode: 'selectable' as const, unitChoices: ['N', 'kN', 'kgF'] };

  it('accepts a value that is in unitChoices', () => {
    expect(isValidColumnUnitChoice(column, 'kN')).toBe(true);
  });

  it('rejects arbitrary text not in unitChoices', () => {
    expect(isValidColumnUnitChoice(column, 'banana')).toBe(false);
  });

  it('rejects everything for a non-selectable column', () => {
    expect(isValidColumnUnitChoice({ unitMode: 'fixed', unitChoices: ['N'] }, 'N')).toBe(false);
  });

  it('rejects everything when unitChoices is missing', () => {
    expect(isValidColumnUnitChoice({ unitMode: 'selectable' }, 'N')).toBe(false);
  });
});

describe('extractInputRows', () => {
  it('extracts only editable-column values, skipping formula columns', () => {
    const layout = buildGridLayout(baseTemplate());
    const gridValues = [
      [100, 100.2, 999 /* stale formula display, must be ignored */, 'ok'],
    ];
    const rows = extractInputRows(layout, gridValues);
    expect(rows).toEqual([{ CAL_NOM: 100, CAL_IND: 100.2, NOTE_REM: 'ok' }]);
    expect(rows[0]).not.toHaveProperty('CAL_ERR');
  });

  it('treats an empty string or undefined cell as null (empty), not a value', () => {
    const layout = buildGridLayout(baseTemplate());
    const gridValues = [[undefined, '', 0, undefined]];
    const rows = extractInputRows(layout, gridValues);
    expect(rows[0].CAL_NOM).toBeNull();
    expect(rows[0].CAL_IND).toBeNull();
    // A real 0 is NOT empty — must be preserved.
    expect(rows[0].NOTE_REM).toBeNull();
  });

  it('preserves a real zero value, distinct from empty', () => {
    const layout = buildGridLayout(baseTemplate());
    const rows = extractInputRows(layout, [[0, 0, undefined, undefined]]);
    expect(rows[0].CAL_NOM).toBe(0);
    expect(rows[0].CAL_IND).toBe(0);
  });

  it('coerces a boolean cell to a text TRUE/FALSE value', () => {
    const layout = buildGridLayout(baseTemplate());
    const rows = extractInputRows(layout, [[undefined, undefined, undefined, true]]);
    expect(rows[0].NOTE_REM).toBe('TRUE');
  });

  it('handles multiple rows independently', () => {
    const layout = buildGridLayout(baseTemplate());
    const rows = extractInputRows(layout, [
      [1, 2, 99, 'a'],
      [3, 4, 98, 'b'],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].CAL_NOM).toBe(3);
  });
});

describe('reference standard column (ADR-013 D3)', () => {

  it('finds the standard column in the layout', () => {
    const layout = buildGridLayout(templateWithStandard());
    expect(findStandardColumn(layout)?.key).toBe('M_STDSEL');
  });

  it('returns null when the template has no standard column', () => {
    expect(findStandardColumn(buildGridLayout(baseTemplate()))).toBeNull();
  });

  it('a new row inherits the previous row\'s standard', () => {
    const rows = [{ M_STDSEL: 'stdA', M_R: 1 }, { M_STDSEL: 'stdB', M_R: 2 }];
    expect(inheritedStandardValue(rows, 'M_STDSEL')).toBe('stdB');
  });

  it('inherits nothing when there is no previous row', () => {
    expect(inheritedStandardValue([], 'M_STDSEL')).toBeNull();
  });

  it('inherits nothing when the previous row had no selection', () => {
    expect(inheritedStandardValue([{ M_STDSEL: null }], 'M_STDSEL')).toBeNull();
  });

  it('inherits nothing when the template has no standard column', () => {
    expect(inheritedStandardValue([{ M_R: 1 }], null)).toBeNull();
  });

  it('a standard column is editable, not locked like a formula column', () => {
    const doc = buildGridDocument(templateWithStandard(), [{ M_STDSEL: 'stdA', M_R: 1 }]);
    expect(doc.lockedRanges).toEqual([]);
  });

  // ADR-014 Phase 13: a `standard` cell holds a LABEL in the grid but a
  // composite KEY in RecordRow — extractInputRows reverses label -> key via
  // the map built from the SAME options the picker offered.
  it('extractInputRows resolves a recognised label to its composite key', () => {
    const layout = buildGridLayout(templateWithStandard());
    const rows = extractInputRows(layout, [['CAL-FRC-001 — 1-10 N', 5]], {
      'CAL-FRC-001 — 1-10 N': 'CAL-FRC-001::eq1',
    });
    expect(rows[0].M_STDSEL).toBe('CAL-FRC-001::eq1');
  });

  it('extractInputRows resolves unrecognised text to null — never the raw text itself', () => {
    // This is the storage-level guarantee: whatever landed in the cell
    // (stray paste, a stale label from a deleted equation, anything), if it
    // is not a known label the stored value is unset, never that text.
    const layout = buildGridLayout(templateWithStandard());
    const rows = extractInputRows(layout, [['some pasted garbage', 5]], {
      'CAL-FRC-001 — 1-10 N': 'CAL-FRC-001::eq1',
    });
    expect(rows[0].M_STDSEL).toBeNull();
  });

  it('extractInputRows resolves to null when no label map is supplied at all', () => {
    const layout = buildGridLayout(templateWithStandard());
    const rows = extractInputRows(layout, [['CAL-FRC-001 — 1-10 N', 5]]);
    expect(rows[0].M_STDSEL).toBeNull();
  });

  it('an empty standard cell stays null, not an empty string', () => {
    const layout = buildGridLayout(templateWithStandard());
    const rows = extractInputRows(layout, [['', 5]], { 'CAL-FRC-001 — 1-10 N': 'CAL-FRC-001::eq1' });
    expect(rows[0].M_STDSEL).toBeNull();
  });
});

describe('buildGridDocument — standard column label substitution (ADR-014 Phase 13)', () => {
  const labels = { 'CAL-FRC-001::eq1': 'CAL-FRC-001 — 1-10 N' };

  it('shows the readable label in place of the stored composite key', () => {
    const doc = buildGridDocument(templateWithStandard(), [{ M_STDSEL: 'CAL-FRC-001::eq1', M_R: 5 }], labels);
    const layout = buildGridLayout(templateWithStandard());
    const col = layout.columns.find((c) => c.key === 'M_STDSEL')!;
    expect(doc.dataRows[0][col.gridColumnIndex]).toBe('CAL-FRC-001 — 1-10 N');
  });

  it('falls back to the raw key when it has no matching label (e.g. a deleted equation)', () => {
    const doc = buildGridDocument(templateWithStandard(), [{ M_STDSEL: 'CAL-FRC-001::gone', M_R: 5 }], labels);
    const layout = buildGridLayout(templateWithStandard());
    const col = layout.columns.find((c) => c.key === 'M_STDSEL')!;
    expect(doc.dataRows[0][col.gridColumnIndex]).toBe('CAL-FRC-001::gone');
  });

  it('leaves an unselected row blank, not showing any label', () => {
    const doc = buildGridDocument(templateWithStandard(), [{ M_STDSEL: null, M_R: 5 }], labels);
    const layout = buildGridLayout(templateWithStandard());
    const col = layout.columns.find((c) => c.key === 'M_STDSEL')!;
    expect(doc.dataRows[0][col.gridColumnIndex]).toBeUndefined();
  });

  it('round-trips through invertStandardLabels back to the original key', () => {
    const reversed = invertStandardLabels(labels);
    expect(reversed['CAL-FRC-001 — 1-10 N']).toBe('CAL-FRC-001::eq1');
  });
});

describe('findStandardDependentFormulaColumns (ADR-014 Phase 13)', () => {
  function templateWithForceFormula(expression: string) {
    return baseTemplate({
      sections: [
        {
          id: 'M', label: 'M', order: 0,
          columns: [
            { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
            { id: 'R', label: 'Reading', order: 1, type: 'number' },
            { id: 'F', label: 'Force', order: 2, type: 'formula', expression },
            { id: 'PLAIN', label: 'Plain', order: 3, type: 'formula', expression: 'M_R * 2' },
          ],
        },
      ],
    });
  }

  it('finds a formula column that consumes STD_C1', () => {
    const cols = findStandardDependentFormulaColumns(templateWithForceFormula('STD_C1 * M_R'));
    expect(cols.map((c) => c.key)).toContain('M_F');
  });

  it('does not include a formula column that never references STD_*', () => {
    const cols = findStandardDependentFormulaColumns(templateWithForceFormula('STD_C1 * M_R'));
    expect(cols.map((c) => c.key)).not.toContain('M_PLAIN');
  });

  it.each(['STD_TO_N', 'STD_UCAL', 'STD_RESOLUTION', 'STD_C0', 'STD_C5'])(
    'matches %s too, not just STD_C1',
    (variable) => {
      const cols = findStandardDependentFormulaColumns(templateWithForceFormula(`${variable} + 1`));
      expect(cols.map((c) => c.key)).toContain('M_F');
    },
  );

  it('returns an empty array for a template with no standard column at all', () => {
    expect(findStandardDependentFormulaColumns(baseTemplate())).toEqual([]);
  });
});

describe('findColumnUnitReportUnitMismatches (Phase 15 Task 2, rewired to the effective unit)', () => {
  function templateWithForceColumn(columnUnit?: string) {
    return baseTemplate({
      sections: [
        {
          id: 'M', label: 'M', order: 0,
          columns: [
            { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
            { id: 'R', label: 'Reading', order: 1, type: 'number' },
            {
              id: 'F', label: 'Force', order: 2, type: 'formula',
              expression: 'polynomial(M_R) * STD_TO_N / REPORT_TO_N',
              unitMode: columnUnit !== undefined ? 'fixed' : undefined,
              unit: columnUnit,
            },
          ],
        },
      ],
    });
  }

  function templateWithSelectableForceColumn() {
    return baseTemplate({
      sections: [
        {
          id: 'M', label: 'M', order: 0,
          columns: [
            { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
            { id: 'R', label: 'Reading', order: 1, type: 'number' },
            {
              id: 'F', label: 'Force', order: 2, type: 'formula',
              expression: 'polynomial(M_R) * STD_TO_N / REPORT_TO_N',
              unitMode: 'selectable', unitChoices: ['N', 'kN', 'kgF'],
            },
          ],
        },
      ],
    });
  }

  it('warns when the column unit and reportUnit are both recognized force units that disagree', () => {
    const mismatches = findColumnUnitReportUnitMismatches(templateWithForceColumn('N'), 'kN');
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('N');
    expect(mismatches[0].message).toContain('kN');
  });

  it('is silent when the column unit matches reportUnit', () => {
    expect(findColumnUnitReportUnitMismatches(templateWithForceColumn('kN'), 'kN')).toEqual([]);
  });

  it('is silent when reportUnit is unset', () => {
    expect(findColumnUnitReportUnitMismatches(templateWithForceColumn('N'), undefined)).toEqual([]);
  });

  it('is silent when the column has no unit at all', () => {
    expect(findColumnUnitReportUnitMismatches(templateWithForceColumn(undefined), 'kN')).toEqual([]);
  });

  it('is silent when the column unit is not a recognized force unit', () => {
    expect(findColumnUnitReportUnitMismatches(templateWithForceColumn('°C'), 'kN')).toEqual([]);
  });

  it('is silent when reportUnit is not a recognized force unit', () => {
    expect(findColumnUnitReportUnitMismatches(templateWithForceColumn('N'), 'bogus-unit')).toEqual([]);
  });

  it('uses the effective (chosen) unit for a selectable column, not the choice list', () => {
    const mismatches = findColumnUnitReportUnitMismatches(templateWithSelectableForceColumn(), 'kN', { M_F: 'N' });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toContain('N');
  });

  it('is silent for a selectable column with nothing chosen yet, even though unitChoices contains a disagreeing unit', () => {
    expect(findColumnUnitReportUnitMismatches(templateWithSelectableForceColumn(), 'kN', {})).toEqual([]);
  });

  it('is silent for a selectable column whose chosen unit happens to match reportUnit', () => {
    expect(findColumnUnitReportUnitMismatches(templateWithSelectableForceColumn(), 'kN', { M_F: 'kN' })).toEqual([]);
  });
});

describe('mergeComputedIntoRow', () => {
  it('adds computed values without disturbing existing input values', () => {
    const row = { CAL_NOM: 100, CAL_IND: 100.2 };
    const merged = mergeComputedIntoRow(row, { CAL_ERR: 0.2 });
    expect(merged).toEqual({ CAL_NOM: 100, CAL_IND: 100.2, CAL_ERR: 0.2 });
  });

  it('does not mutate the original row object', () => {
    const row = { CAL_NOM: 100 };
    mergeComputedIntoRow(row, { CAL_ERR: 1 });
    expect(row).toEqual({ CAL_NOM: 100 });
  });

  it('overwrites a stale computed value with the fresh one', () => {
    const row = { CAL_NOM: 100, CAL_ERR: 999 };
    const merged = mergeComputedIntoRow(row, { CAL_ERR: 0.2 });
    expect(merged.CAL_ERR).toBe(0.2);
  });
});

/**
 * Phase 15 'sameAs' unit mode: a column reuses another column's unit, so
 * round columns (Reading 1/2/3) move together when the technician picks once.
 */
describe('resolveColumnUnitMap — sameAs references', () => {
  function tpl(columns: any[]) {
    return baseTemplate({
      sections: [{ id: 'M', label: 'M', order: 0, columns }],
      summaryFields: [],
    });
  }

  it('a sameAs column inherits a fixed source unit', () => {
    const map = resolveColumnUnitMap(tpl([
      { id: 'R1', label: 'Reading 1', order: 0, type: 'number', unitMode: 'fixed', unit: 'N' },
      { id: 'R2', label: 'Reading 2', order: 1, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R1' },
    ]));
    expect(map.M_R1).toBe('N');
    expect(map.M_R2).toBe('N');
  });

  it('a sameAs column inherits the unit PICKED on a selectable source', () => {
    const template = tpl([
      { id: 'R1', label: 'Reading 1', order: 0, type: 'number', unitMode: 'selectable', unitChoices: ['N', 'kN'] },
      { id: 'R2', label: 'Reading 2', order: 1, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R1' },
    ]);
    expect(resolveColumnUnitMap(template, { M_R1: 'kN' }).M_R2).toBe('kN');
  });

  it('an unpicked selectable source leaves the inheriting column with no unit', () => {
    const template = tpl([
      { id: 'R1', label: 'Reading 1', order: 0, type: 'number', unitMode: 'selectable', unitChoices: ['N', 'kN'] },
      { id: 'R2', label: 'Reading 2', order: 1, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R1' },
    ]);
    expect(resolveColumnUnitMap(template, {}).M_R2).toBeUndefined();
  });

  it('follows a chain R3 -> R2 -> R1', () => {
    const map = resolveColumnUnitMap(tpl([
      { id: 'R1', label: 'r1', order: 0, type: 'number', unitMode: 'fixed', unit: 'kgF' },
      { id: 'R2', label: 'r2', order: 1, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R1' },
      { id: 'R3', label: 'r3', order: 2, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R2' },
    ]));
    expect(map.M_R3).toBe('kgF');
  });

  it('a two-column cycle resolves to no unit instead of hanging', () => {
    const map = resolveColumnUnitMap(tpl([
      { id: 'R1', label: 'r1', order: 0, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R2' },
      { id: 'R2', label: 'r2', order: 1, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R1' },
    ]));
    expect(map.M_R1).toBeUndefined();
    expect(map.M_R2).toBeUndefined();
  });

  it('a self-reference resolves to no unit', () => {
    const map = resolveColumnUnitMap(tpl([
      { id: 'R1', label: 'r1', order: 0, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R1' },
    ]));
    expect(map.M_R1).toBeUndefined();
  });

  it('a dangling reference resolves to no unit', () => {
    const map = resolveColumnUnitMap(tpl([
      { id: 'R1', label: 'r1', order: 0, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_NOPE' },
    ]));
    expect(map.M_R1).toBeUndefined();
  });

  it('sameAs with no source selected resolves to no unit', () => {
    const map = resolveColumnUnitMap(tpl([
      { id: 'R1', label: 'r1', order: 0, type: 'number', unitMode: 'sameAs' },
    ]));
    expect(map.M_R1).toBeUndefined();
  });
});

describe('buildGridDocument — sameAs column header follows its source', () => {
  it('both headers show the unit picked once on the source column', () => {
    const template = baseTemplate({
      sections: [{
        id: 'READ', label: 'Measurement Results', order: 0,
        columns: [
          { id: 'UUCR1', label: 'UUC Reading 1', order: 0, type: 'number', unitMode: 'selectable', unitChoices: ['N', 'kN'] },
          { id: 'UUCR2', label: 'UUC Reading 2', order: 1, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'READ_UUCR1' },
        ],
      }],
      summaryFields: [],
    });
    const doc = buildGridDocument(template, [{}], {}, { READ_UUCR1: 'kN' });
    expect(doc.headerRows[COLUMN_HEADER_ROW]).toEqual(['UUC Reading 1 (kN)', 'UUC Reading 2 (kN)']);
  });
});

describe('buildGridDocument — ADR-015 conversion pipeline wired into dataRows (Task 3/8)', () => {
  const RULE: ConversionRule = {
    id: 'r1', name: 'mV/V to %', fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * 100',
    active: true, createdAt: new Date(), updatedAt: new Date(), createdBy: 'admin1',
  };

  it('fixed target unit: a formula column with conversionEnabled is converted (test 8, fixed)', () => {
    const template = baseTemplate({
      sections: [{
        id: 'M', label: 'M', order: 0,
        columns: [
          {
            id: 'A', label: 'A', order: 0, type: 'formula', expression: '0.5',
            unitMode: 'fixed', unit: '%', conversionEnabled: true, conversionSourceUnit: 'mV/V',
          },
        ],
      }],
      summaryFields: [],
    });
    const doc = buildGridDocument(template, [{ M_A: 0.5 }], {}, {}, [RULE]);
    expect(doc.dataRows[0]).toEqual([50]);
    expect(doc.conversionFailures).toEqual([]);
  });

  it('selectable target unit: converts against whichever unit the record chose (test 8, selectable)', () => {
    const template = baseTemplate({
      sections: [{
        id: 'M', label: 'M', order: 0,
        columns: [
          {
            id: 'A', label: 'A', order: 0, type: 'formula', expression: '0.5',
            unitMode: 'selectable', unitChoices: ['%', 'mV/V'],
            conversionEnabled: true, conversionSourceUnit: 'mV/V',
          },
        ],
      }],
      summaryFields: [],
    });
    const converting = buildGridDocument(template, [{ M_A: 0.5 }], {}, { M_A: '%' }, [RULE]);
    expect(converting.dataRows[0]).toEqual([50]);

    // The technician picked the SAME unit the value is already in — D8 step
    // 4's equal-units no-op, not a lookup failure.
    const noOp = buildGridDocument(template, [{ M_A: 0.5 }], {}, { M_A: 'mV/V' }, [RULE]);
    expect(noOp.dataRows[0]).toEqual([0.5]);
    expect(noOp.conversionFailures).toEqual([]);
  });

  it("sameAs target unit: a column converts against the unit its 'sameAs' source resolves to (test 8, sameAs)", () => {
    const template = baseTemplate({
      sections: [{
        id: 'M', label: 'M', order: 0,
        columns: [
          { id: 'SRC', label: 'Source', order: 0, type: 'number', unitMode: 'fixed', unit: '%' },
          {
            id: 'A', label: 'A', order: 1, type: 'formula', expression: '0.5',
            unitMode: 'sameAs', unitSourceColumn: 'M_SRC',
            conversionEnabled: true, conversionSourceUnit: 'mV/V',
          },
        ],
      }],
      summaryFields: [],
    });
    const doc = buildGridDocument(template, [{ M_SRC: 1, M_A: 0.5 }], {}, {}, [RULE]);
    expect(doc.dataRows[0]).toEqual([1, 50]);
  });

  it('no rule for the pair: raw value stays in dataRows, and the cell is named in conversionFailures (D6)', () => {
    const template = baseTemplate({
      sections: [{
        id: 'M', label: 'M', order: 0,
        columns: [
          {
            id: 'A', label: 'A', order: 0, type: 'formula', expression: '0.5',
            unitMode: 'fixed', unit: '%', conversionEnabled: true, conversionSourceUnit: 'mV/V',
          },
        ],
      }],
      summaryFields: [],
    });
    const doc = buildGridDocument(template, [{ M_A: 0.5 }], {}, {}, []); // no rules at all
    expect(doc.dataRows[0]).toEqual([0.5]); // raw value, never blanked
    expect(doc.conversionFailures).toHaveLength(1);
    expect(doc.conversionFailures[0]).toMatchObject({ rowIndex: 0, columnKey: 'M_A' });
    expect(doc.conversionFailures[0].failure.reason).toBe('no-rule');
  });

  it('conversionRules defaults to [] when omitted — no crash, D6 fallback applies', () => {
    const template = baseTemplate({
      sections: [{
        id: 'M', label: 'M', order: 0,
        columns: [
          {
            id: 'A', label: 'A', order: 0, type: 'formula', expression: '0.5',
            unitMode: 'fixed', unit: '%', conversionEnabled: true, conversionSourceUnit: 'mV/V',
          },
        ],
      }],
      summaryFields: [],
    });
    const doc = buildGridDocument(template, [{ M_A: 0.5 }]);
    expect(doc.dataRows[0]).toEqual([0.5]);
    expect(doc.conversionFailures).toHaveLength(1);
  });

  it('a formula column WITHOUT conversionEnabled is never touched, even with a matching rule available (test 11, data layer)', () => {
    const template = baseTemplate({
      sections: [{
        id: 'M', label: 'M', order: 0,
        columns: [
          { id: 'A', label: 'A', order: 0, type: 'formula', expression: '0.5', unitMode: 'fixed', unit: '%' },
        ],
      }],
      summaryFields: [],
    });
    const doc = buildGridDocument(template, [{ M_A: 0.5 }], {}, {}, [RULE]);
    expect(doc.dataRows[0]).toEqual([0.5]);
    expect(doc.conversionFailures).toEqual([]);
  });

  it('a number-type column is never converted even if conversionEnabled were somehow set (D9: formula columns only)', () => {
    const template = baseTemplate({
      sections: [{
        id: 'M', label: 'M', order: 0,
        columns: [
          {
            id: 'A', label: 'A', order: 0, type: 'number',
            conversionEnabled: true, conversionSourceUnit: 'mV/V', unitMode: 'fixed', unit: '%',
          },
        ],
      }],
      summaryFields: [],
    });
    const doc = buildGridDocument(template, [{ M_A: 0.5 }], {}, {}, [RULE]);
    expect(doc.dataRows[0]).toEqual([0.5]);
    expect(doc.conversionFailures).toEqual([]);
  });
});

describe('findConversionSourceUnitMismatch — ADR-015 D3 cross-check', () => {
  function convertingColumn(overrides: Partial<Parameters<typeof findConversionSourceUnitMismatch>[0]> = {}) {
    return {
      id: 'A', label: 'A', order: 0, type: 'formula' as const, expression: 'STD_C1 * M_R',
      conversionEnabled: true, conversionSourceUnit: 'mV/V',
      ...overrides,
    };
  }

  it('warns when the declared source unit disagrees with the standard output unit', () => {
    const warning = findConversionSourceUnitMismatch(convertingColumn(), 'N');
    expect(warning).not.toBeNull();
    expect(warning!.kind).toBe('unit');
    expect(warning!.message).toContain('mV/V');
    expect(warning!.message).toContain('N');
  });

  it('is silent when the declared source unit matches the standard output unit', () => {
    expect(findConversionSourceUnitMismatch(convertingColumn(), 'mV/V')).toBeNull();
  });

  it('is silent when conversionEnabled is false', () => {
    expect(findConversionSourceUnitMismatch(convertingColumn({ conversionEnabled: false }), 'N')).toBeNull();
  });

  it('is silent when no source unit is declared yet', () => {
    expect(findConversionSourceUnitMismatch(convertingColumn({ conversionSourceUnit: undefined }), 'N')).toBeNull();
  });

  it('is silent when no standard output unit is available (nothing selected yet)', () => {
    expect(findConversionSourceUnitMismatch(convertingColumn(), undefined)).toBeNull();
  });

  it('is silent for a non-formula column, even with matching fields set', () => {
    expect(findConversionSourceUnitMismatch(convertingColumn({ type: 'number' as const }), 'N')).toBeNull();
  });

  it('is silent when the expression references only STD_TO_N, not a raw STD_C* coefficient', () => {
    expect(findConversionSourceUnitMismatch(convertingColumn({ expression: 'M_R * STD_TO_N' }), 'N')).toBeNull();
  });

  it('is silent when the expression references no STD_* variable at all', () => {
    expect(findConversionSourceUnitMismatch(convertingColumn({ expression: 'M_R * 2' }), 'N')).toBeNull();
  });

  it('recognizes each coefficient STD_C0 through STD_C5', () => {
    for (let i = 0; i <= 5; i++) {
      const warning = findConversionSourceUnitMismatch(convertingColumn({ expression: `STD_C${i} * M_R` }), 'N');
      expect(warning, `STD_C${i}`).not.toBeNull();
    }
  });
});

describe('findConversionFailures — ADR-015 D6, from freshly computed rowResults', () => {
  const RULE: ConversionRule = {
    id: 'r1', name: 'mV/V to %', fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * 100',
    active: true, createdAt: new Date(), updatedAt: new Date(), createdBy: 'admin1',
  };

  function templateWithConvertingColumn() {
    return baseTemplate({
      sections: [{
        id: 'M', label: 'M', order: 0,
        columns: [
          {
            id: 'A', label: 'A', order: 0, type: 'formula', expression: '0.5',
            unitMode: 'fixed', unit: '%', conversionEnabled: true, conversionSourceUnit: 'mV/V',
          },
        ],
      }],
      summaryFields: [],
    });
  }

  it('reports a failure naming the row and column when no rule exists for the pair', () => {
    const rowResults = [{ M_A: { value: 0.5 } }];
    const failures = findConversionFailures(templateWithConvertingColumn(), rowResults, {}, []);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ rowIndex: 0, columnKey: 'M_A', columnLabel: 'A' });
    expect(failures[0].failure.reason).toBe('no-rule');
  });

  it('reports no failure when a matching rule exists', () => {
    const rowResults = [{ M_A: { value: 0.5 } }];
    const failures = findConversionFailures(templateWithConvertingColumn(), rowResults, {}, [RULE]);
    expect(failures).toEqual([]);
  });

  it('skips a cell that is still awaiting-input or errored — nothing to convert yet', () => {
    const rowResults = [{ M_A: { value: null, error: { kind: 'awaiting-input' as const, message: 'x' } } }];
    const failures = findConversionFailures(templateWithConvertingColumn(), rowResults, {}, []);
    expect(failures).toEqual([]);
  });

  it('skips a column that has not opted into conversion, even with no rule available', () => {
    const template = baseTemplate({
      sections: [{
        id: 'M', label: 'M', order: 0,
        columns: [{ id: 'A', label: 'A', order: 0, type: 'formula', expression: '0.5', unitMode: 'fixed', unit: '%' }],
      }],
      summaryFields: [],
    });
    const failures = findConversionFailures(template, [{ M_A: { value: 0.5 } }], {}, []);
    expect(failures).toEqual([]);
  });

  it('tracks multiple rows independently, in row order', () => {
    const rowResults = [{ M_A: { value: 0.5 } }, { M_A: { value: 1 } }];
    const failures = findConversionFailures(templateWithConvertingColumn(), rowResults, {}, []);
    expect(failures.map((f) => f.rowIndex)).toEqual([0, 1]);
  });
});

describe('buildGridDocument — ADR-015 D7: a frozen snapshot overrides live rules', () => {
  const LIVE_RULE_THAT_WOULD_DISAGREE: ConversionRule = {
    id: 'r-live', name: 'edited rule', fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * 999999',
    active: true, createdAt: new Date(), updatedAt: new Date(), createdBy: 'admin1',
  };

  function templateWithConversionColumn() {
    return baseTemplate({
      sections: [{
        id: 'M', label: 'M', order: 0,
        columns: [
          {
            id: 'A', label: 'A', order: 0, type: 'formula', expression: '0.5',
            unitMode: 'fixed', unit: '%', conversionEnabled: true, conversionSourceUnit: 'mV/V',
          },
        ],
      }],
      summaryFields: [],
    });
  }

  it("uses the snapshot's convertedValue directly, ignoring whatever the live rules would now produce", () => {
    const doc = buildGridDocument(
      templateWithConversionColumn(),
      [{ M_A: 0.5 }],
      {},
      {},
      [LIVE_RULE_THAT_WOULD_DISAGREE],
      { '0:M_A': { ruleId: 'r-old', ruleName: 'original', expression: 'VALUE * 100', sourceUnit: 'mV/V', targetUnit: '%', rawValue: 0.5, convertedValue: 50, capturedAt: new Date() } },
    );
    expect(doc.dataRows[0]).toEqual([50]); // from the snapshot — not 499999.5
    expect(doc.conversionFailures).toEqual([]);
  });

  it('falls back to the live rules for a cell with no snapshot entry (draft, or a cell that failed to convert at commit)', () => {
    const doc = buildGridDocument(
      templateWithConversionColumn(),
      [{ M_A: 0.5 }],
      {},
      {},
      [{ id: 'r1', name: 'mV/V to %', fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * 100', active: true, createdAt: new Date(), updatedAt: new Date(), createdBy: 'admin1' }],
      {}, // no snapshots at all
    );
    expect(doc.dataRows[0]).toEqual([50]);
  });
});
