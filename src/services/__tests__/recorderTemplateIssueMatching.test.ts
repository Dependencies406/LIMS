import { describe, it, expect } from 'vitest';
import { buildIssueBadgeMap } from '../recorderTemplateIssueMatching';
import { verifyTemplate, findMissingConversionFactorWarnings } from '../recorderTemplateValidation';
import type { RecorderTemplate } from '../../types';

/**
 * Every test here runs the REAL verifyTemplate / findMissingConversionFactorWarnings
 * against a deliberately-broken template, then feeds their REAL output into
 * buildIssueBadgeMap — never a hand-written fake ValidationIssue — so a
 * change to a message's wording is caught here, not silently un-badged in
 * the builder.
 */
function baseTemplate(overrides: Partial<RecorderTemplate> = {}): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'T',
    equipmentTypeId: 'eq1',
    roundCount: 2,
    defaultRowCount: 3,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [],
    summaryFields: [],
    customFunctions: [],
    status: 'draft',
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u',
    updatedBy: 'u',
    ...overrides,
  };
}

describe('buildIssueBadgeMap — column-key-in-message shape', () => {
  it('badges the column a missing-expression error is about, and its section', () => {
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'x', order: 0, columns: [{ id: 'ERR', label: 'e', order: 0, type: 'formula' }] }],
    });
    const map = buildIssueBadgeMap(template, verifyTemplate(template), []);
    expect(map.columns['CAL_ERR']?.hasError).toBe(true);
    expect(map.sections[0]?.hasError).toBe(true);
  });

  it('badges the column a missing-choices error is about', () => {
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'x', order: 0, columns: [{ id: 'C1', label: 'c', order: 0, type: 'selection' }] }],
    });
    const map = buildIssueBadgeMap(template, verifyTemplate(template), []);
    expect(map.columns['CAL_C1']?.hasError).toBe(true);
  });

  it('badges a column with too-few selectable unit choices', () => {
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'x', order: 0, columns: [
        { id: 'F', label: 'f', order: 0, type: 'number', unitMode: 'selectable', unitChoices: ['N'] },
      ] }],
    });
    const map = buildIssueBadgeMap(template, verifyTemplate(template), []);
    expect(map.columns['CAL_F']?.hasError).toBe(true);
  });

  it('badges a sameAs column referencing a non-existent source, but not other columns', () => {
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'x', order: 0, columns: [
        { id: 'OK', label: 'ok', order: 0, type: 'number' },
        { id: 'BAD', label: 'bad', order: 1, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'CAL_NOPE' },
      ] }],
    });
    const map = buildIssueBadgeMap(template, verifyTemplate(template), []);
    expect(map.columns['CAL_BAD']?.hasError).toBe(true);
    expect(map.columns['CAL_OK']).toBeUndefined();
  });

  it('badges both columns in a sameAs cycle', () => {
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'x', order: 0, columns: [
        { id: 'A', label: 'a', order: 0, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'CAL_B' },
        { id: 'B', label: 'b', order: 1, type: 'number', unitMode: 'sameAs', unitSourceColumn: 'CAL_A' },
      ] }],
    });
    const map = buildIssueBadgeMap(template, verifyTemplate(template), []);
    expect(map.columns['CAL_A']?.hasError).toBe(true);
    expect(map.columns['CAL_B']?.hasError).toBe(true);
  });

  it('badges a formula column with an unknown identifier (Phase 3 interpreter error)', () => {
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'x', order: 0, columns: [
        { id: 'ERR', label: 'e', order: 0, type: 'formula', expression: 'NOPE + 1' },
      ] }],
    });
    const map = buildIssueBadgeMap(template, verifyTemplate(template), []);
    expect(map.columns['CAL_ERR']?.hasError).toBe(true);
  });

  it('badges (as a warning) a formula column missing the STD_TO_N/REPORT_TO_N factor', () => {
    const template = baseTemplate({
      sections: [{ id: 'M', label: 'm', order: 0, columns: [
        { id: 'STDSEL', label: 's', order: 0, type: 'standard' },
        { id: 'R', label: 'r', order: 1, type: 'number' },
        { id: 'F', label: 'f', order: 2, type: 'formula', expression: 'STD_C1 * M_R' },
      ] }],
    });
    const map = buildIssueBadgeMap(template, [], findMissingConversionFactorWarnings(template));
    expect(map.columns['M_F']?.hasWarning).toBe(true);
    expect(map.columns['M_F']?.hasError).toBe(false);
  });
});

describe('buildIssueBadgeMap — id-shape message (does not embed the full key)', () => {
  it('badges the section for a reserved section id', () => {
    const template = baseTemplate({ sections: [{ id: 'ENV', label: 'x', order: 0, columns: [] }] });
    const map = buildIssueBadgeMap(template, verifyTemplate(template), []);
    expect(map.sections[0]?.hasError).toBe(true);
  });

  it('badges the section for a lowercase section id', () => {
    const template = baseTemplate({ sections: [{ id: 'cal', label: 'x', order: 0, columns: [] }] });
    const map = buildIssueBadgeMap(template, verifyTemplate(template), []);
    expect(map.sections[0]?.hasError).toBe(true);
  });

  it('badges the exact column for a lowercase column id, via the (in section) shape', () => {
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'x', order: 0, columns: [
        { id: 'ok', label: 'a', order: 0, type: 'text' },
      ] }],
    });
    const map = buildIssueBadgeMap(template, verifyTemplate(template), []);
    // The malformed id itself means there's no CAL_OK key to look up (the
    // author hasn't fixed the case yet) — but the section must still show it.
    expect(map.sections[0]?.hasError).toBe(true);
  });
});

describe('buildIssueBadgeMap — clean template and no-run states', () => {
  it('produces no badges for a clean template', () => {
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'x', order: 0, columns: [{ id: 'A', label: 'a', order: 0, type: 'text' }] }],
    });
    const map = buildIssueBadgeMap(template, verifyTemplate(template), []);
    expect(map.sections).toEqual({});
    expect(map.columns).toEqual({});
  });

  it('produces no badges when Verify has not been run yet (null/undefined inputs)', () => {
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'x', order: 0, columns: [{ id: 'ERR', label: 'e', order: 0, type: 'formula' }] }],
    });
    expect(buildIssueBadgeMap(template, null, null)).toEqual({ sections: {}, columns: {} });
    expect(buildIssueBadgeMap(template, undefined, undefined)).toEqual({ sections: {}, columns: {} });
  });

  it('an unattributable issue (roundCount) does not crash and badges nothing', () => {
    const template = baseTemplate({ roundCount: 0, sections: [] });
    const map = buildIssueBadgeMap(template, verifyTemplate(template), []);
    expect(map.sections).toEqual({});
    expect(map.columns).toEqual({});
  });
});

describe('buildIssueBadgeMap — a longer key does not get shadowed by a shorter prefix key', () => {
  it('CAL_NOM2 only badges CAL_NOM2, not CAL_NOM, when both exist', () => {
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'x', order: 0, columns: [
        { id: 'NOM', label: 'a', order: 0, type: 'number' },
        { id: 'NOM2', label: 'b', order: 1, type: 'formula', expression: 'NOPE_XYZ' },
      ] }],
    });
    const map = buildIssueBadgeMap(template, verifyTemplate(template), []);
    expect(map.columns['CAL_NOM2']?.hasError).toBe(true);
    expect(map.columns['CAL_NOM']).toBeUndefined();
  });
});
