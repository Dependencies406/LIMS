/**
 * formulaVariableList.test.ts
 *
 * Phase 10 Task 7: the pure logic behind the in-context "Variables you can
 * use" disclosure. Asserted against a fixture template, never a hardcoded
 * string — this is what proves the disclosure shows the AUTHOR'S real
 * column names, not a pattern.
 */

import { describe, it, expect } from 'vitest';
import { buildRowFormulaVariables, buildSummaryFormulaVariables } from '../formulaVariableList';
import { STANDARD_VARIABLE_NAMES } from '../referenceStandardVariables';
import type { RecorderTemplate } from '../../types';

function fixtureTemplate(overrides: Partial<RecorderTemplate> = {}): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'UTM Calibration',
    equipmentTypeId: 'eq1',
    roundCount: 2,
    defaultRowCount: 3,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [
      {
        id: 'CAL', label: 'Calibration', order: 0,
        columns: [
          { id: 'NOM', label: 'Nominal', order: 0, type: 'number' },
          { id: 'IND', label: 'Indicated', order: 1, type: 'number' },
          { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'CAL_IND - CAL_NOM' },
        ],
      },
      {
        id: 'READ', label: 'Reading', order: 1,
        columns: [
          { id: 'STD1', label: 'Standard', order: 0, type: 'standard' },
          { id: 'R1', label: 'Raw Reading', order: 1, type: 'number' },
        ],
      },
    ],
    summaryFields: [
      { id: 'MAXDEV', label: 'Max Deviation', type: 'number', expression: 'col_max(CAL_ERR)' },
      { id: 'VERDICT', label: 'Verdict', type: 'text', expression: '"PASS"' },
    ],
    customFunctions: [],
    status: 'draft',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u',
    updatedBy: 'u',
    ...overrides,
  } as RecorderTemplate;
}

describe('buildRowFormulaVariables — real column names, built from section/column IDs', () => {
  it('lists every column across every section, using the actual SECTIONID_COLUMNID names', () => {
    const template = fixtureTemplate();
    const groups = buildRowFormulaVariables(template, 'CAL', 'ERR', false);
    const columnGroup = groups.find((g) => g.label === "This row's columns")!;
    const names = columnGroup.entries.map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['CAL_NOM', 'CAL_IND', 'CAL_ERR', 'READ_STD1', 'READ_R1']));
  });

  it('never shows a generic pattern like SECTIONID_COLUMNID', () => {
    const template = fixtureTemplate();
    const groups = buildRowFormulaVariables(template, 'CAL', 'ERR', false);
    const allNames = groups.flatMap((g) => g.entries.map((e) => e.name));
    expect(allNames).not.toContain('SECTIONID_COLUMNID');
  });

  it('skips a column with no id yet (still being typed)', () => {
    const template = fixtureTemplate({
      sections: [{ id: 'CAL', label: 'Calibration', order: 0, columns: [{ id: '', label: '', order: 0, type: 'number' }] }],
    });
    const groups = buildRowFormulaVariables(template, 'CAL', 'X', false);
    const columnGroup = groups.find((g) => g.label === "This row's columns")!;
    expect(columnGroup.entries).toEqual([]);
  });
});

describe('buildRowFormulaVariables — the formula column\'s OWN name is unavailable', () => {
  it('marks the current column disabled, and no other column', () => {
    const template = fixtureTemplate();
    const groups = buildRowFormulaVariables(template, 'CAL', 'ERR', false);
    const columnGroup = groups.find((g) => g.label === "This row's columns")!;
    const self = columnGroup.entries.find((e) => e.name === 'CAL_ERR')!;
    const other = columnGroup.entries.find((e) => e.name === 'CAL_IND')!;
    expect(self.disabled).toBe(true);
    expect(other.disabled).toBeFalsy();
  });

  it('reproduces the owner\'s exact bug scenario: READ_STD1 referencing itself is caught here', () => {
    // The owner's first working template had a formula column named READ_STD1
    // whose expression referenced READ_STD1 — its own output. This is what
    // makes that mistake visible BEFORE typing, not after Verify fails.
    const template = fixtureTemplate({
      sections: [
        {
          id: 'READ', label: 'Reading', order: 0,
          columns: [{ id: 'STD1', label: 'Standard reading', order: 0, type: 'formula', expression: '' }],
        },
      ],
    });
    const groups = buildRowFormulaVariables(template, 'READ', 'STD1', false);
    const columnGroup = groups.find((g) => g.label === "This row's columns")!;
    expect(columnGroup.entries.find((e) => e.name === 'READ_STD1')?.disabled).toBe(true);
  });
});

describe('buildRowFormulaVariables — Environment group uses the template\'s real round count', () => {
  it('lists ENV_TEMP_R{n} / ENV_RH_R{n} for exactly roundCount rounds', () => {
    const template = fixtureTemplate({ roundCount: 3 });
    const groups = buildRowFormulaVariables(template, 'CAL', 'ERR', false);
    const envGroup = groups.find((g) => g.label === 'Environment')!;
    const names = envGroup.entries.map((e) => e.name).sort();
    expect(names).toEqual(
      ['ENV_TEMP_R1', 'ENV_RH_R1', 'ENV_TEMP_R2', 'ENV_RH_R2', 'ENV_TEMP_R3', 'ENV_RH_R3'].sort(),
    );
  });
});

describe('buildRowFormulaVariables — Reference standard group only when the template HAS a standard column', () => {
  it('is absent when hasStandardColumn is false', () => {
    const template = fixtureTemplate();
    const groups = buildRowFormulaVariables(template, 'CAL', 'ERR', false);
    expect(groups.find((g) => g.label === 'Reference standard')).toBeUndefined();
  });

  it('is present, with every STANDARD_VARIABLE_NAMES entry, when hasStandardColumn is true', () => {
    const template = fixtureTemplate();
    const groups = buildRowFormulaVariables(template, 'CAL', 'ERR', true);
    const stdGroup = groups.find((g) => g.label === 'Reference standard')!;
    expect(stdGroup).toBeDefined();
    const names = stdGroup.entries.map((e) => e.name).sort();
    expect(names).toEqual([...STANDARD_VARIABLE_NAMES].sort());
  });

  it('REPORT_TO_N is available regardless of hasStandardColumn', () => {
    const withStd = buildRowFormulaVariables(fixtureTemplate(), 'CAL', 'ERR', true);
    const withoutStd = buildRowFormulaVariables(fixtureTemplate(), 'CAL', 'ERR', false);
    expect(withStd.find((g) => g.label === 'Reporting')?.entries.map((e) => e.name)).toContain('REPORT_TO_N');
    expect(withoutStd.find((g) => g.label === 'Reporting')?.entries.map((e) => e.name)).toContain('REPORT_TO_N');
  });
});

describe('buildSummaryFormulaVariables — summary context', () => {
  it('lists other summary fields as SUMMARY_<id>, excluding itself', () => {
    const template = fixtureTemplate();
    const groups = buildSummaryFormulaVariables(template, 'MAXDEV');
    const summaryGroup = groups.find((g) => g.label === 'Summary fields')!;
    const self = summaryGroup.entries.find((e) => e.name === 'SUMMARY_MAXDEV');
    const other = summaryGroup.entries.find((e) => e.name === 'SUMMARY_VERDICT');
    expect(self?.disabled).toBe(true);
    expect(other?.disabled).toBeFalsy();
  });

  it('does NOT include plain columns or STD_* — neither resolves in summary context', () => {
    const template = fixtureTemplate();
    const groups = buildSummaryFormulaVariables(template, 'MAXDEV');
    expect(groups.find((g) => g.label === "This row's columns")).toBeUndefined();
    expect(groups.find((g) => g.label === 'Reference standard')).toBeUndefined();
  });

  it('includes Environment and REPORT_TO_N — both record-scoped, valid in summary context', () => {
    const template = fixtureTemplate({ roundCount: 1 });
    const groups = buildSummaryFormulaVariables(template, 'MAXDEV');
    expect(groups.find((g) => g.label === 'Environment')?.entries.map((e) => e.name)).toEqual(
      expect.arrayContaining(['ENV_TEMP_R1', 'ENV_RH_R1']),
    );
    expect(groups.find((g) => g.label === 'Reporting')?.entries.map((e) => e.name)).toContain('REPORT_TO_N');
  });
});
