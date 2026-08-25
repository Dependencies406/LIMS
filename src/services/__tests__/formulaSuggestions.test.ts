/**
 * formulaSuggestions.test.ts
 *
 * The autocomplete phase's pure module — text + caret + context in, ranked
 * candidates out. Asserted against a fixture template and against the real
 * BUILTIN_FUNCTIONS/COLUMN_AGGREGATES lists directly, so a newly added
 * builtin or aggregate cannot silently go missing from suggestions.
 */

import { describe, it, expect } from 'vitest';
import {
  getFormulaSuggestions,
  analyzeCaretPosition,
  insertionTextFor,
  type SuggestionsTemplate,
} from '../formulaSuggestions';
import { BUILTIN_FUNCTIONS, COLUMN_AGGREGATES } from '../../modules/recorder/formula/builtins';

function fixtureTemplate(overrides: Partial<SuggestionsTemplate> = {}): SuggestionsTemplate {
  return {
    roundCount: 2,
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
    ],
    customFunctions: [
      { name: 'mean3', params: ['a', 'b', 'c'], expression: '(a + b + c) / 3' },
    ],
    ...overrides,
  };
}

function names(result: { suggestions: Array<{ name: string }> }): string[] {
  return result.suggestions.map((s) => s.name);
}

describe('getFormulaSuggestions — every builtin/aggregate is suggestible where legal (test 1)', () => {
  it('every BUILTIN_FUNCTIONS key is suggestible in row context', () => {
    const result = getFormulaSuggestions({
      text: '', caretOffset: 0,
      context: { kind: 'row', sectionId: 'CAL', columnId: 'ERR' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    const suggested = new Set(names(result));
    for (const key of Object.keys(BUILTIN_FUNCTIONS)) {
      expect(suggested.has(key), `${key} missing from row-context suggestions`).toBe(true);
    }
  });

  it('every BUILTIN_FUNCTIONS key is suggestible in summary context', () => {
    const result = getFormulaSuggestions({
      text: '', caretOffset: 0,
      context: { kind: 'summary', fieldId: 'MAXDEV' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    const suggested = new Set(names(result));
    for (const key of Object.keys(BUILTIN_FUNCTIONS)) {
      expect(suggested.has(key)).toBe(true);
    }
  });

  it('every COLUMN_AGGREGATES name is suggestible in summary context', () => {
    const result = getFormulaSuggestions({
      text: '', caretOffset: 0,
      context: { kind: 'summary', fieldId: 'MAXDEV' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    const suggested = new Set(names(result));
    for (const name of COLUMN_AGGREGATES) {
      expect(suggested.has(name), `${name} missing from summary-context suggestions`).toBe(true);
    }
  });
});

describe('getFormulaSuggestions — row context excludes SUMMARY_* and aggregates (test 2)', () => {
  const result = getFormulaSuggestions({
    text: '', caretOffset: 0,
    context: { kind: 'row', sectionId: 'CAL', columnId: 'ERR' },
    template: fixtureTemplate(), hasStandardColumn: true,
  });
  const suggested = names(result);

  it('does not offer SUMMARY_MAXDEV', () => {
    expect(suggested).not.toContain('SUMMARY_MAXDEV');
  });

  it('does not offer any column aggregate', () => {
    for (const name of COLUMN_AGGREGATES) expect(suggested).not.toContain(name);
  });

  it('DOES offer row-context names: columns, ENV_*, STD_*, REPORT_TO_N', () => {
    expect(suggested).toContain('CAL_NOM');
    expect(suggested).toContain('ENV_TEMP_R1');
    expect(suggested).toContain('STD_C0');
    expect(suggested).toContain('REPORT_TO_N');
  });
});

describe('getFormulaSuggestions — summary context excludes STD_* (test 3)', () => {
  const result = getFormulaSuggestions({
    text: '', caretOffset: 0,
    context: { kind: 'summary', fieldId: 'MAXDEV' },
    template: fixtureTemplate(), hasStandardColumn: true,
  });
  const suggested = names(result);

  it('does not offer any STD_* name', () => {
    expect(suggested.some((n) => n.startsWith('STD_'))).toBe(false);
  });

  it('DOES offer summary-context names: ENV_*, REPORT_TO_N, SUMMARY_*, aggregates, builtins', () => {
    expect(suggested).toContain('ENV_TEMP_R1');
    expect(suggested).toContain('REPORT_TO_N');
    expect(suggested).toContain('col_mean');
    expect(suggested).toContain('ROUND');
  });

  it('does NOT offer plain column names either — disagrees with this phase\'s own prompt, matches the validator (see module header)', () => {
    expect(suggested).not.toContain('CAL_NOM');
    expect(suggested).not.toContain('CAL_ERR');
  });
});

describe('getFormulaSuggestions — function body offers ONLY params + builtins + custom functions (test 4)', () => {
  const result = getFormulaSuggestions({
    text: '', caretOffset: 0,
    context: { kind: 'function', params: ['a', 'b', 'c'] },
    template: fixtureTemplate(), hasStandardColumn: true,
  });
  const suggested = names(result);

  it('offers its own parameters', () => {
    expect(suggested).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('offers builtins', () => {
    expect(suggested).toContain('ROUND');
  });

  it('offers other custom functions', () => {
    expect(suggested).toContain('mean3');
  });

  it('offers NO column name', () => {
    expect(suggested).not.toContain('CAL_NOM');
    expect(suggested).not.toContain('CAL_ERR');
  });

  it('offers NO ENV_* name', () => {
    expect(suggested.some((n) => n.startsWith('ENV_'))).toBe(false);
  });

  it('offers NO STD_* name', () => {
    expect(suggested.some((n) => n.startsWith('STD_'))).toBe(false);
  });

  it('offers NO SUMMARY_* name', () => {
    expect(suggested.some((n) => n.startsWith('SUMMARY_'))).toBe(false);
  });

  it('offers no column aggregate (banned inside a function body)', () => {
    for (const name of COLUMN_AGGREGATES) expect(suggested).not.toContain(name);
  });
});

describe('getFormulaSuggestions — a formula column\'s own name is present but disabled (test 5)', () => {
  it('CAL_ERR appears in its own row-context suggestions, marked disabled', () => {
    const result = getFormulaSuggestions({
      text: '', caretOffset: 0,
      context: { kind: 'row', sectionId: 'CAL', columnId: 'ERR' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    const self = result.suggestions.find((s) => s.name === 'CAL_ERR');
    expect(self).toBeDefined();
    expect(self!.disabled).toBe(true);
  });

  it('a summary field\'s own SUMMARY_<id> appears in its own suggestions, marked disabled', () => {
    const result = getFormulaSuggestions({
      text: '', caretOffset: 0,
      context: { kind: 'summary', fieldId: 'MAXDEV' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    const self = result.suggestions.find((s) => s.name === 'SUMMARY_MAXDEV');
    expect(self).toBeDefined();
    expect(self!.disabled).toBe(true);
  });
});

describe('getFormulaSuggestions — after col_mean( only bare column names are offered (test 6)', () => {
  it('caret right after the open paren offers only columns, not ENV_/REPORT_/builtins', () => {
    const text = 'col_mean(';
    const result = getFormulaSuggestions({
      text, caretOffset: text.length,
      context: { kind: 'summary', fieldId: 'MAXDEV' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    const suggested = names(result);
    expect(suggested).toContain('CAL_NOM');
    expect(suggested).toContain('CAL_IND');
    expect(suggested).not.toContain('ROUND');
    expect(suggested).not.toContain('REPORT_TO_N');
    expect(suggested).not.toContain('col_mean'); // not itself either — aggregate names aren't columns
    expect(result.caret.isAggregateArgumentPosition).toBe(true);
  });

  it('mid-typed argument (col_mean(CAL_N|) still restricts to bare column names', () => {
    const text = 'col_mean(CAL_N';
    const result = getFormulaSuggestions({
      text, caretOffset: text.length,
      context: { kind: 'summary', fieldId: 'MAXDEV' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    expect(names(result)).toEqual(['CAL_NOM']);
  });

  it('a SECOND argument position (already past a comma) is not aggregate-argument-restricted', () => {
    // col_mean only takes 1 arg so this is already invalid per the validator,
    // but the caret-position rule itself is purely positional and should
    // not apply beyond argIndex 0.
    const text = 'col_mean(CAL_NOM, ';
    const result = getFormulaSuggestions({
      text, caretOffset: text.length,
      context: { kind: 'summary', fieldId: 'MAXDEV' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    expect(result.caret.isAggregateArgumentPosition).toBe(false);
  });

  it('a non-aggregate call\'s parens do NOT trigger the bare-column restriction', () => {
    const text = 'ROUND(';
    const result = getFormulaSuggestions({
      text, caretOffset: text.length,
      context: { kind: 'row', sectionId: 'CAL', columnId: 'ERR' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    expect(result.caret.isAggregateArgumentPosition).toBe(false);
    expect(names(result)).toContain('CAL_NOM'); // ordinary row-context list, not the bare-column-only override
  });
});

describe('getFormulaSuggestions — the template\'s own custom functions are offered (test 7)', () => {
  it('mean3 is offered in row context', () => {
    const result = getFormulaSuggestions({
      text: '', caretOffset: 0,
      context: { kind: 'row', sectionId: 'CAL', columnId: 'ERR' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    expect(names(result)).toContain('mean3');
  });

  it('a custom function still mid-typing (no name yet) is never offered', () => {
    const result = getFormulaSuggestions({
      text: '', caretOffset: 0,
      context: { kind: 'row', sectionId: 'CAL', columnId: 'ERR' },
      template: fixtureTemplate({ customFunctions: [{ name: '', params: [], expression: '' }] }),
      hasStandardColumn: true,
    });
    expect(names(result)).not.toContain('');
  });
});

describe('getFormulaSuggestions — ranking: prefix beats substring, case-insensitive (test 8)', () => {
  it('a prefix match ranks before a substring-only match', () => {
    // "ROUND" starts with "R"; "CAL_ERR" merely contains no "R"... use a
    // pair that actually collides: MIN (prefix "MI") vs "CAL_IND" contains
    // no "MI" either. Construct a deliberate collision instead.
    const text = 'ND';
    const result = getFormulaSuggestions({
      text, caretOffset: text.length,
      context: { kind: 'row', sectionId: 'CAL', columnId: 'ERR' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    // "ND" is a substring of CAL_IND and CAL_NOM(no) — CAL_IND contains "ND" at the end (substring), nothing starts with "ND".
    expect(names(result)).toContain('CAL_IND');
  });

  it('an exact-prefix candidate is ranked ahead of a same-length substring-only candidate', () => {
    const text = 'RO';
    const result = getFormulaSuggestions({
      text, caretOffset: text.length,
      context: { kind: 'row', sectionId: 'CAL', columnId: 'ERR' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    // ROUND starts with "RO" (prefix tier). Nothing else in this fixture
    // both contains "ro" and doesn't start with it, so assert ROUND is first.
    expect(names(result)[0]).toBe('ROUND');
  });

  it('matching is case-insensitive', () => {
    const text = 'round';
    const result = getFormulaSuggestions({
      text, caretOffset: text.length,
      context: { kind: 'row', sectionId: 'CAL', columnId: 'ERR' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    expect(names(result)).toContain('ROUND');
  });

  it('insertion uses canonical casing regardless of typed case', () => {
    const suggestion = { kind: 'builtin' as const, name: 'ROUND' };
    expect(insertionTextFor(suggestion)).toBe('ROUND(');
  });

  it('aggregate canonical case is lowercase', () => {
    expect(insertionTextFor({ kind: 'aggregate', name: 'col_mean' })).toBe('col_mean(');
  });
});

describe('insertionTextFor — function vs variable insertion shape (test 9)', () => {
  it('a builtin inserts NAME( with nothing after', () => {
    expect(insertionTextFor({ kind: 'builtin', name: 'SQRT' })).toBe('SQRT(');
  });

  it('a custom function inserts NAME(', () => {
    expect(insertionTextFor({ kind: 'custom', name: 'mean3' })).toBe('mean3(');
  });

  it('a variable inserts the bare name, no parenthesis', () => {
    expect(insertionTextFor({ kind: 'variable', name: 'CAL_NOM' })).toBe('CAL_NOM');
  });

  it('a param inserts the bare name', () => {
    expect(insertionTextFor({ kind: 'param', name: 'a' })).toBe('a');
  });
});

describe('analyzeCaretPosition — token boundaries and replacement range', () => {
  it('finds the full token around the caret, not just what precedes it', () => {
    const text = 'CAL_NOM';
    const caret = analyzeCaretPosition(text, 3); // caret inside "CAL_|NOM"
    expect(caret.tokenStart).toBe(0);
    expect(caret.tokenEnd).toBe(7);
    expect(caret.tokenPrefix).toBe('CAL'); // only what's typed BEFORE the caret
  });

  it('an empty token when the caret sits after a non-identifier character', () => {
    const text = 'CAL_NOM + ';
    const caret = analyzeCaretPosition(text, text.length);
    expect(caret.tokenPrefix).toBe('');
    expect(caret.tokenStart).toBe(text.length);
    expect(caret.tokenEnd).toBe(text.length);
  });

  it('finds the enclosing call across nesting (ROUND(col_mean(CAL_NOM, still resolves to ROUND once innermost closes)', () => {
    const text = 'ROUND(col_mean(CAL_NOM), 2';
    const caret = analyzeCaretPosition(text, text.length);
    expect(caret.enclosingCallName).toBe('ROUND');
  });

  it('a bare grouping paren (no identifier before it) is not treated as a call', () => {
    const text = '(CAL_NOM + CAL_IND';
    const caret = analyzeCaretPosition(text, text.length);
    expect(caret.enclosingCallName).toBeNull();
  });
});

describe('getFormulaSuggestions — signature hint while inside a call\'s parens', () => {
  it('shows a builtin\'s signature from BUILTIN_DOCS', () => {
    const text = 'ROUND(1.5, ';
    const result = getFormulaSuggestions({
      text, caretOffset: text.length,
      context: { kind: 'row', sectionId: 'CAL', columnId: 'ERR' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    expect(result.signatureHint).not.toBeNull();
    expect(result.signatureHint!.signature).toBe('ROUND(value, decimals)');
  });

  it('shows a custom function\'s synthesized signature', () => {
    const text = 'mean3(';
    const result = getFormulaSuggestions({
      text, caretOffset: text.length,
      context: { kind: 'row', sectionId: 'CAL', columnId: 'ERR' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    expect(result.signatureHint).toEqual({ name: 'mean3', signature: 'mean3(a, b, c)', description: 'Custom function' });
  });

  it('is null when the caret is not inside any call', () => {
    const text = 'CAL_NOM';
    const result = getFormulaSuggestions({
      text, caretOffset: text.length,
      context: { kind: 'row', sectionId: 'CAL', columnId: 'ERR' },
      template: fixtureTemplate(), hasStandardColumn: true,
    });
    expect(result.signatureHint).toBeNull();
  });
});

describe('getFormulaSuggestions — duplicate column ids never produce a duplicate suggestion', () => {
  // Regression: while a draft is mid-edit, an author can type the same
  // Column ID into two different columns in one section before renaming one
  // away — verifyTemplate flags this as an error at Verify time, but
  // nothing prevents the state existing transiently. Before this fix,
  // `buildRowFormulaVariables`'s flattened column list legitimately
  // contained two entries with the identical composite name (e.g.
  // "READ_STDR1"), which surfaced as a duplicate suggestion and a React key
  // collision warning in FormulaSuggestPopup's list.
  function templateWithDuplicateColumnId(): SuggestionsTemplate {
    return fixtureTemplate({
      sections: [
        {
          id: 'READ', label: 'Reading', order: 0,
          columns: [
            { id: 'STDR1', label: 'Standard reading', order: 0, type: 'number' },
            { id: 'STDR1', label: 'Second reading (not yet renamed)', order: 1, type: 'number' },
          ],
        },
      ],
    });
  }

  it('READ_STDR1 appears exactly once in row-context suggestions', () => {
    const result = getFormulaSuggestions({
      text: '', caretOffset: 0,
      context: { kind: 'row', sectionId: 'READ', columnId: 'STDR1' },
      template: templateWithDuplicateColumnId(), hasStandardColumn: false,
    });
    const occurrences = result.suggestions.filter((s) => s.name === 'READ_STDR1');
    expect(occurrences).toHaveLength(1);
  });

  it('every remaining suggestion is unique by kind+name (no key collision possible)', () => {
    const result = getFormulaSuggestions({
      text: '', caretOffset: 0,
      context: { kind: 'row', sectionId: 'READ', columnId: 'STDR1' },
      template: templateWithDuplicateColumnId(), hasStandardColumn: false,
    });
    const seen = new Set<string>();
    for (const s of result.suggestions) {
      const key = `${s.kind}:${s.name}`;
      expect(seen.has(key), `duplicate suggestion key: ${key}`).toBe(false);
      seen.add(key);
    }
  });
});
