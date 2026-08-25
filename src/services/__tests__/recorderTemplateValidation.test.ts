import { describe, it, expect } from 'vitest';
import { customFunctionToSource, verifyTemplate, isTemplatePublishable, findMissingConversionFactorWarnings } from '../recorderTemplateValidation';
import type { RecorderTemplate } from '../../types';

function baseTemplate(overrides: Partial<RecorderTemplate> = {}): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'UTM Calibration',
    equipmentTypeId: 'eqtype1',
    roundCount: 2,
    defaultRowCount: 5,
    allowRowAdd: true,
    recordNumberFormat: {
      parts: ['UTM'],
      separator: '-',
      includeYear: true,
      yearDigits: 2,
      numberPadding: 3,
      resetPolicy: 'never',
    },
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
    ],
    summaryFields: [
      { id: 'MAXDEV', label: 'Max Deviation', type: 'number', expression: 'col_max(CAL_ERR)' },
    ],
    customFunctions: [],
    status: 'draft',
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    updatedBy: 'u1',
    ...overrides,
  };
}

describe('customFunctionToSource', () => {
  it('builds parseable def source from structured fields', () => {
    const source = customFunctionToSource({ name: 'error', params: ['nominal', 'indicated'], expression: 'indicated - nominal' });
    expect(source).toBe('def error(nominal, indicated):\n    return indicated - nominal');
  });

  it('handles zero parameters', () => {
    expect(customFunctionToSource({ name: 'two', params: [], expression: '2' })).toBe('def two():\n    return 2');
  });
});

describe('verifyTemplate — a clean template passes', () => {
  it('has no issues', () => {
    expect(verifyTemplate(baseTemplate())).toEqual([]);
    expect(isTemplatePublishable(baseTemplate())).toBe(true);
  });

  it('validates a template using custom functions', () => {
    const template = baseTemplate({
      customFunctions: [{ name: 'error', params: ['nominal', 'indicated'], expression: 'indicated - nominal' }],
      sections: [
        {
          id: 'CAL',
          label: 'Calibration',
          order: 0,
          columns: [
            { id: 'NOM', label: 'Nominal', order: 0, type: 'number' },
            { id: 'IND', label: 'Indicated', order: 1, type: 'number' },
            { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'error(CAL_NOM, CAL_IND)' },
          ],
        },
      ],
    });
    expect(verifyTemplate(template)).toEqual([]);
  });
});

describe('verifyTemplate — reserved section ids (domain model §2)', () => {
  it('rejects ENV as an author-defined section id', () => {
    const template = baseTemplate({
      sections: [{ id: 'ENV', label: 'Environment', order: 0, columns: [] }],
    });
    const issues = verifyTemplate(template);
    expect(issues.some((i) => i.message.includes("Section id 'ENV' is reserved"))).toBe(true);
  });

  it('rejects SUMMARY as an author-defined section id', () => {
    const template = baseTemplate({
      sections: [{ id: 'SUMMARY', label: 'Summary', order: 0, columns: [] }],
    });
    const issues = verifyTemplate(template);
    expect(issues.some((i) => i.message.includes("Section id 'SUMMARY' is reserved"))).toBe(true);
  });

  it('makes a reserved-id template unpublishable', () => {
    const template = baseTemplate({ sections: [{ id: 'ENV', label: 'x', order: 0, columns: [] }] });
    expect(isTemplatePublishable(template)).toBe(false);
  });
});

describe('verifyTemplate — id shape and duplicates', () => {
  it('rejects a lowercase section id', () => {
    const template = baseTemplate({ sections: [{ id: 'cal', label: 'x', order: 0, columns: [] }] });
    expect(verifyTemplate(template).some((i) => i.message.includes('Section id'))).toBe(true);
  });

  it('rejects a duplicate section id', () => {
    const template = baseTemplate({
      sections: [
        { id: 'CAL', label: 'a', order: 0, columns: [] },
        { id: 'CAL', label: 'b', order: 1, columns: [] },
      ],
    });
    expect(verifyTemplate(template).some((i) => i.message.includes('used more than once'))).toBe(true);
  });

  it('rejects a duplicate column id within one section', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL',
          label: 'x',
          order: 0,
          columns: [
            { id: 'NOM', label: 'a', order: 0, type: 'text' },
            { id: 'NOM', label: 'b', order: 1, type: 'text' },
          ],
        },
      ],
    });
    expect(verifyTemplate(template).some((i) => i.message.includes("Column id 'NOM'"))).toBe(true);
  });

  it('rejects a duplicate summary field id', () => {
    const template = baseTemplate({
      summaryFields: [
        { id: 'MAXDEV', label: 'a', type: 'number', expression: '1' },
        { id: 'MAXDEV', label: 'b', type: 'number', expression: '2' },
      ],
    });
    expect(verifyTemplate(template).some((i) => i.message.includes('Summary field id'))).toBe(true);
  });

  it('requires roundCount at least 1', () => {
    expect(verifyTemplate(baseTemplate({ roundCount: 0 })).some((i) => i.message.includes('roundCount'))).toBe(true);
  });

  it('requires a formula column to have an expression', () => {
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'x', order: 0, columns: [{ id: 'ERR', label: 'e', order: 0, type: 'formula' }] }],
    });
    expect(verifyTemplate(template).some((i) => i.message.includes('has no expression'))).toBe(true);
  });

  it('requires a selection column to have choices', () => {
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'x', order: 0, columns: [{ id: 'C1', label: 'c', order: 0, type: 'selection' }] }],
    });
    expect(verifyTemplate(template).some((i) => i.message.includes('has no choices'))).toBe(true);
  });
});

describe('verifyTemplate — invokes the Phase 3 verifier for real', () => {
  it('surfaces an unknown-column error from a formula column', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL',
          label: 'x',
          order: 0,
          columns: [{ id: 'ERR', label: 'e', order: 0, type: 'formula', expression: 'NOPE + 1' }],
        },
      ],
      summaryFields: [],
    });
    const issues = verifyTemplate(template);
    expect(issues.some((i) => i.message.includes("'NOPE' is not a column"))).toBe(true);
  });

  it('surfaces a context violation: col_* used in a formula column', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL',
          label: 'x',
          order: 0,
          columns: [
            { id: 'NOM', label: 'a', order: 0, type: 'number' },
            { id: 'ERR', label: 'e', order: 1, type: 'formula', expression: 'col_mean(CAL_NOM)' },
          ],
        },
      ],
      summaryFields: [],
    });
    expect(verifyTemplate(template).some((i) => i.message.includes('Column aggregates can only be used in summary fields'))).toBe(true);
  });

  it('surfaces a cycle between two formula columns', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL',
          label: 'x',
          order: 0,
          columns: [
            { id: 'A', label: 'a', order: 0, type: 'formula', expression: 'CAL_B + 1' },
            { id: 'B', label: 'b', order: 1, type: 'formula', expression: 'CAL_A + 1' },
          ],
        },
      ],
      summaryFields: [],
    });
    expect(verifyTemplate(template).some((i) => i.message.includes('depend on each other in a loop'))).toBe(true);
  });

  it('surfaces a cycle between two custom functions', () => {
    const template = baseTemplate({
      customFunctions: [
        { name: 'a', params: ['x'], expression: 'b(x)' },
        { name: 'b', params: ['x'], expression: 'a(x)' },
      ],
    });
    expect(verifyTemplate(template).some((i) => i.message.includes('call each other in a loop'))).toBe(true);
  });

  it('surfaces an ENV round index beyond roundCount', () => {
    const template = baseTemplate({
      roundCount: 1,
      sections: [
        {
          id: 'CAL',
          label: 'x',
          order: 0,
          columns: [{ id: 'ERR', label: 'e', order: 0, type: 'formula', expression: 'ENV_TEMP_R2' }],
        },
      ],
      summaryFields: [],
    });
    expect(verifyTemplate(template).some((i) => i.message.includes('this template has 1 round'))).toBe(true);
  });

  it('prefixes summary field issues with SUMMARY_<id>', () => {
    const template = baseTemplate({ summaryFields: [{ id: 'MAXDEV', label: 'x', type: 'number', expression: 'NOPE' }] });
    const issues = verifyTemplate(template);
    expect(issues.some((i) => i.message.startsWith('SUMMARY_MAXDEV: '))).toBe(true);
  });

  it('rejects a bare column reference used directly in a summary field', () => {
    const template = baseTemplate({ summaryFields: [{ id: 'X', label: 'x', type: 'number', expression: 'CAL_ERR' }] });
    expect(verifyTemplate(template).some((i) => i.message.includes('col_mean(CAL_ERR)'))).toBe(true);
  });
});

describe('verifyTemplate — selectable unit needs at least 2 choices (Phase 15 supersession)', () => {
  function withUnitColumn(overrides: Partial<{ unitMode: 'fixed' | 'selectable'; unit: string; unitChoices: string[] }>) {
    return baseTemplate({
      sections: [
        {
          id: 'CAL', label: 'x', order: 0,
          columns: [{ id: 'NOM', label: 'x', order: 0, type: 'number', ...overrides }],
        },
      ],
      summaryFields: [],
    });
  }

  it('errors when selectable has no unitChoices at all', () => {
    const issues = verifyTemplate(withUnitColumn({ unitMode: 'selectable' }));
    expect(issues.some((i) => i.message.includes('CAL_NOM') && i.message.includes('selectable'))).toBe(true);
  });

  it('errors when selectable has exactly 1 choice', () => {
    const issues = verifyTemplate(withUnitColumn({ unitMode: 'selectable', unitChoices: ['N'] }));
    expect(issues.some((i) => i.message.includes('CAL_NOM'))).toBe(true);
  });

  it('is clean when selectable has 2+ choices', () => {
    expect(verifyTemplate(withUnitColumn({ unitMode: 'selectable', unitChoices: ['N', 'kN'] }))).toEqual([]);
  });

  it('fixed mode with no unit set is not an error — same as no unit at all', () => {
    expect(verifyTemplate(withUnitColumn({ unitMode: 'fixed' }))).toEqual([]);
  });

  it('fixed mode with a unit set is not an error', () => {
    expect(verifyTemplate(withUnitColumn({ unitMode: 'fixed', unit: 'N' }))).toEqual([]);
  });

  it('no unitMode at all is not an error', () => {
    expect(verifyTemplate(withUnitColumn({}))).toEqual([]);
  });
});

describe('findMissingConversionFactorWarnings (Phase 15 Task 3)', () => {
  function templateWithFormula(expression: string) {
    return baseTemplate({
      sections: [
        {
          id: 'M', label: 'M', order: 0,
          columns: [
            { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
            { id: 'R', label: 'Reading', order: 1, type: 'number' },
            { id: 'F', label: 'Force', order: 2, type: 'formula', expression },
          ],
        },
      ],
      summaryFields: [],
    });
  }

  it('warns when a formula uses STD_C1 without STD_TO_N and REPORT_TO_N', () => {
    const warnings = findMissingConversionFactorWarnings(templateWithFormula('STD_C0 + STD_C1 * M_R'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('M_F');
    expect(warnings[0].message).toContain('STD_TO_N');
    expect(warnings[0].message).toContain('REPORT_TO_N');
  });

  it('does not warn when the formula has both STD_TO_N and REPORT_TO_N', () => {
    const warnings = findMissingConversionFactorWarnings(
      templateWithFormula('(STD_C0 + STD_C1 * M_R) * STD_TO_N / REPORT_TO_N'),
    );
    expect(warnings).toEqual([]);
  });

  it('never warns for a formula using only STD_UCAL (STD_C* scope only)', () => {
    expect(findMissingConversionFactorWarnings(templateWithFormula('STD_UCAL * 2'))).toEqual([]);
  });

  it('never warns for a formula using only STD_RESOLUTION', () => {
    expect(findMissingConversionFactorWarnings(templateWithFormula('M_R + STD_RESOLUTION'))).toEqual([]);
  });

  it('never warns for a formula using only STD_UA/STD_UB/STD_UC', () => {
    expect(findMissingConversionFactorWarnings(templateWithFormula('STD_UA + STD_UB + STD_UC'))).toEqual([]);
  });

  it('warns when only STD_TO_N is present but REPORT_TO_N is missing', () => {
    const warnings = findMissingConversionFactorWarnings(templateWithFormula('STD_C1 * M_R * STD_TO_N'));
    expect(warnings).toHaveLength(1);
  });

  it('warns when only REPORT_TO_N is present but STD_TO_N is missing', () => {
    const warnings = findMissingConversionFactorWarnings(templateWithFormula('STD_C1 * M_R / REPORT_TO_N'));
    expect(warnings).toHaveLength(1);
  });

  it('does not modify the author expression — the column formula is untouched', () => {
    const template = templateWithFormula('STD_C0 + STD_C1 * M_R');
    const original = template.sections[0].columns[2].expression;
    findMissingConversionFactorWarnings(template);
    expect(template.sections[0].columns[2].expression).toBe(original);
  });

  it('does not warn on a column with no expression at all', () => {
    const template = baseTemplate({
      sections: [{ id: 'M', label: 'M', order: 0, columns: [{ id: 'R', label: 'Reading', order: 0, type: 'number' }] }],
      summaryFields: [],
    });
    expect(findMissingConversionFactorWarnings(template)).toEqual([]);
  });
});

describe('verifyTemplate — sameAs unit references (Phase 15)', () => {
  function tpl(columns: any[]) {
    return baseTemplate({
      sections: [{ id: 'M', label: 'M', order: 0, columns }],
      summaryFields: [],
      customFunctions: [],
    });
  }

  it('is clean for a valid reference to a fixed-unit column', () => {
    expect(verifyTemplate(tpl([
      { id: 'R1', label: 'r1', order: 0, type: 'number', unitMode: 'fixed', unit: 'N' },
      { id: 'R2', label: 'r2', order: 1, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R1' },
    ]))).toEqual([]);
  });

  it('is clean for a valid chain R3 -> R2 -> R1', () => {
    expect(verifyTemplate(tpl([
      { id: 'R1', label: 'r1', order: 0, type: 'number', unitMode: 'fixed', unit: 'N' },
      { id: 'R2', label: 'r2', order: 1, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R1' },
      { id: 'R3', label: 'r3', order: 2, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R2' },
    ]))).toEqual([]);
  });

  it('errors when sameAs has no source selected', () => {
    const issues = verifyTemplate(tpl([{ id: 'R1', label: 'r1', order: 0, type: 'number', unitMode: 'sameAs' }]));
    expect(issues.some((i) => i.message.includes('M_R1') && i.message.includes('none is selected'))).toBe(true);
  });

  it('errors when the source column does not exist', () => {
    const issues = verifyTemplate(tpl([
      { id: 'R1', label: 'r1', order: 0, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_GHOST' },
    ]));
    expect(issues.some((i) => i.message.includes('M_GHOST') && i.message.includes('not a column'))).toBe(true);
  });

  it('errors on a two-column cycle', () => {
    const issues = verifyTemplate(tpl([
      { id: 'R1', label: 'r1', order: 0, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R2' },
      { id: 'R2', label: 'r2', order: 1, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R1' },
    ]));
    expect(issues.some((i) => i.message.includes('circular unit reference'))).toBe(true);
  });

  it('errors on a self-reference', () => {
    const issues = verifyTemplate(tpl([
      { id: 'R1', label: 'r1', order: 0, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'M_R1' },
    ]));
    expect(issues.some((i) => i.message.includes('circular unit reference'))).toBe(true);
  });
});
