/**
 * reportBlockText.test.ts
 *
 * Phase 26 Task 3 — ADR-017 D5/D6/D7.
 *
 * Test 7: a per-record override beats the template default, and moving the
 *         template default does NOT move text on a committed record.
 * Test 8: an unresolved placeholder renders a marker, still COMMITS, and
 *         BLOCKS APPROVE (the D7 safeguard, which was still in the ADR).
 */

import { describe, it, expect } from 'vitest';
import {
  extractPlaceholders,
  interpolateBlockText,
  effectiveBlockText,
  blocksApproval,
  findUnresolvedMarkers,
  unresolvedMarker,
} from '../reportBlockText';
import { evaluate, parseExpression } from '../../modules/recorder/formula';
import { verifyTemplate } from '../recorderTemplateValidation';
import type { RecorderTemplate, ReportBlock } from '../../types';

/** A resolver over a real block context, so these exercise the actual evaluator (D6). */
function resolver(overrides: {
  block?: Record<string, number | string | null>;
  rows?: Array<Record<string, number | string | null>>;
  summary?: Record<string, number | string | null>;
  env?: Record<string, number | string | null>;
} = {}) {
  return (expression: string) =>
    evaluate(parseExpression(expression), {
      kind: 'block',
      block: overrides.block ?? {},
      rows: overrides.rows ?? [],
      summary: overrides.summary ?? {},
      env: overrides.env ?? {},
      customFunctions: {},
    });
}

describe('D6: placeholders resolve through the existing evaluator, with no second syntax', () => {
  it('extracts placeholders in source order', () => {
    expect(extractPlaceholders('a {X} b {Y+1} c').map((p) => p.expression)).toEqual(['X', 'Y+1']);
  });

  it('trims whitespace inside the braces', () => {
    expect(extractPlaceholders('{  SUMMARY_MAX  }')[0].expression).toBe('SUMMARY_MAX');
  });

  it('resolves a SUMMARY_ reference inside a sentence', () => {
    const result = interpolateBlockText(
      'Maximum deviation was {SUMMARY_MAXDEV} N.',
      resolver({ summary: { SUMMARY_MAXDEV: 0.42 } }),
    );
    expect(result.text).toBe('Maximum deviation was 0.42 N.');
    expect(result.unresolved).toEqual([]);
  });

  it('resolves a column aggregate — the same language, not a second one', () => {
    const result = interpolateBlockText(
      'Mean was {col_mean(CAL_IND)}.',
      resolver({ rows: [{ CAL_IND: 2 }, { CAL_IND: 4 }] }),
    );
    expect(result.text).toBe('Mean was 3.');
  });

  it('resolves arithmetic, because the whole expression language is available', () => {
    const result = interpolateBlockText('{SUMMARY_A * 2 + 1}', resolver({ summary: { SUMMARY_A: 5 } }));
    expect(result.text).toBe('11');
  });

  it('leaves text with no placeholders completely untouched', () => {
    const source = 'Calibration performed in accordance with ISO 7500-1.';
    expect(interpolateBlockText(source, resolver()).text).toBe(source);
  });
});

describe('test 8 (part 1): an unresolved placeholder renders a LOUD marker', () => {
  it('an unknown name becomes a marker naming the expression', () => {
    const result = interpolateBlockText('Class {NOPE}.', resolver());
    expect(result.text).toBe('Class [unresolved: NOPE].');
    expect(result.unresolved).toEqual(['NOPE']);
  });

  it('an awaiting-input value becomes a marker, not a blank or a zero', () => {
    // The dangerous alternative: silently rendering nothing, so a sentence
    // reads as complete when a value is missing.
    const result = interpolateBlockText('Temp was {ENV_TEMP_R1}.', resolver({ env: { ENV_TEMP_R1: null } }));
    expect(result.text).toBe('Temp was [unresolved: ENV_TEMP_R1].');
  });

  it('a genuine computation fault becomes a marker too', () => {
    const result = interpolateBlockText('{1 / 0}', resolver());
    expect(result.unresolved).toEqual(['1 / 0']);
  });

  it('STD_ in a text block is unresolved — a block row is not a calibration point', () => {
    const result = interpolateBlockText('{STD_C1}', resolver());
    expect(result.text).toBe('[unresolved: STD_C1]');
  });

  it('an empty placeholder is marked, never silently deleted', () => {
    const result = interpolateBlockText('a {} b', resolver());
    expect(result.text).toBe('a [unresolved: ] b');
    expect(result.unresolved).toEqual(['']);
  });

  it('resolved and unresolved placeholders coexist — one failure does not void the sentence', () => {
    const result = interpolateBlockText(
      '{SUMMARY_OK} then {NOPE}',
      resolver({ summary: { SUMMARY_OK: 7 } }),
    );
    expect(result.text).toBe('7 then [unresolved: NOPE]');
    expect(result.unresolved).toEqual(['NOPE']);
  });

  it('the marker format is produced by ONE helper, so every surface recognises it', () => {
    expect(unresolvedMarker('X')).toBe('[unresolved: X]');
    expect(findUnresolvedMarkers(`a ${unresolvedMarker('X')} b`)).toEqual(['X']);
  });
});

describe('test 8 (part 2): the D7 safeguard — commit is allowed, APPROVE is blocked', () => {
  it('rendered text carrying a marker blocks approval', () => {
    const { text } = interpolateBlockText('Class {NOPE}.', resolver());
    expect(blocksApproval(text)).toBe(true);
  });

  it('fully resolved text does not block approval', () => {
    const { text } = interpolateBlockText('Class {SUMMARY_C}.', resolver({ summary: { SUMMARY_C: 1 } }));
    expect(blocksApproval(text)).toBe(false);
  });

  it('text with no placeholders at all never blocks approval', () => {
    expect(blocksApproval('Plain prose.')).toBe(false);
  });

  it('the gate reads the RECORD text, so a marker frozen at commit still stops approval', () => {
    // A record committed with a marker keeps it in its snapshot. Re-running
    // interpolation later might resolve it, but what is on the record is what
    // would be printed, so that is what the gate must test.
    const snapshotted = 'Class [unresolved: SUMMARY_CLASS].';
    expect(blocksApproval(snapshotted)).toBe(true);
    expect(findUnresolvedMarkers(snapshotted)).toEqual(['SUMMARY_CLASS']);
  });

  it('several markers are all reported, not just the first', () => {
    const { text, unresolved } = interpolateBlockText('{A} {B}', resolver());
    expect(unresolved).toEqual(['A', 'B']);
    expect(findUnresolvedMarkers(text)).toEqual(['A', 'B']);
  });
});

describe('test 7: per-record override, and the commit snapshot (D5)', () => {
  it('the template default shows on an unedited draft', () => {
    expect(effectiveBlockText({ templateDefault: 'Template wording.' })).toBe('Template wording.');
  });

  it("the technician's override beats the template default", () => {
    expect(effectiveBlockText({ templateDefault: 'Template wording.', override: 'Job-specific remark.' }))
      .toBe('Job-specific remark.');
  });

  it('an override of empty string is a REAL override, not a fallback to the default', () => {
    // Deliberately clearing a sentence must not silently reinstate it.
    expect(effectiveBlockText({ templateDefault: 'Template wording.', override: '' })).toBe('');
  });

  it('the commit snapshot always wins — a template edit cannot move committed text', () => {
    expect(effectiveBlockText({
      templateDefault: 'Template wording, EDITED AFTER COMMIT.',
      override: 'Override made before commit.',
      snapshot: 'What this record was committed with.',
    })).toBe('What this record was committed with.');
  });

  it('moving the template default does not change a committed record', () => {
    const committed = { override: 'X', snapshot: 'Frozen text.' };
    expect(effectiveBlockText({ ...committed, templateDefault: 'v1' })).toBe('Frozen text.');
    expect(effectiveBlockText({ ...committed, templateDefault: 'v2 — template moved on' })).toBe('Frozen text.');
  });

  it('a draft with neither override nor snapshot follows the template as it changes', () => {
    expect(effectiveBlockText({ templateDefault: 'v1' })).toBe('v1');
    expect(effectiveBlockText({ templateDefault: 'v2' })).toBe('v2');
  });
});

describe('D6: the verifier catches a bad placeholder at Verify time, not on a certificate', () => {
  function template(block: ReportBlock): RecorderTemplate {
    return {
      id: 't', name: 'T', equipmentTypeId: 'e', roundCount: 1, defaultRowCount: 1, allowRowAdd: true,
      recordNumberFormat: { parts: ['T'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
      sections: [{
        id: 'CAL', label: 'C', order: 0,
        columns: [
          { id: 'IND', label: 'I', order: 0, type: 'number' },
          { id: 'ERR', label: 'E', order: 1, type: 'formula', expression: 'CAL_IND * 2' },
        ],
      }],
      summaryFields: [{ id: 'MAXDEV', label: 'M', type: 'number', expression: 'col_max(CAL_ERR)' }],
      customFunctions: [],
      reportBlocks: [block],
      status: 'draft', version: 0,
      createdAt: new Date(), updatedAt: new Date(), createdBy: 'u', updatedBy: 'u',
    } as RecorderTemplate;
  }

  const textBlock = (text: string): ReportBlock =>
    ({ id: 'STMT', label: 'Statement', order: 0, kind: 'text', columns: [], defaultRowCount: 0, text });

  it('a misspelt name in a placeholder is an authoring error at Verify', () => {
    const issues = verifyTemplate(template(textBlock('Max was {SUMMARY_MAXDEVV}.')));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.message.includes('{SUMMARY_MAXDEVV}'))).toBe(true);
  });

  it('a correct placeholder passes Verify', () => {
    expect(verifyTemplate(template(textBlock('Max was {SUMMARY_MAXDEV}.')))).toEqual([]);
  });

  it('STD_ in a placeholder is rejected at Verify (D4), not left to render as a marker', () => {
    const issues = verifyTemplate(template(textBlock('{STD_C1}')));
    expect(issues.some((i) => i.message.includes('report block row does not have'))).toBe(true);
  });

  it('a block FORMULA column referencing STD_ is rejected at Verify too', () => {
    const issues = verifyTemplate(template({
      id: 'BUD', label: 'Budget', order: 0, kind: 'table', defaultRowCount: 1,
      columns: [{ id: 'BAD', label: 'B', order: 0, type: 'formula', expression: 'STD_C1' }],
    }));
    expect(issues.some((i) => i.message.startsWith('BUD_BAD:'))).toBe(true);
  });

  it('a block id colliding with a section id is rejected — it would make names ambiguous', () => {
    const issues = verifyTemplate(template({
      id: 'CAL', label: 'Clash', order: 0, kind: 'table', defaultRowCount: 1, columns: [],
    }));
    expect(issues.some((i) => i.message.includes('a section already uses this id'))).toBe(true);
  });

  it('a block formula may reference its own block columns and passes Verify', () => {
    expect(verifyTemplate(template({
      id: 'BUD', label: 'Budget', order: 0, kind: 'table', defaultRowCount: 2,
      columns: [
        { id: 'VAL', label: 'V', order: 0, type: 'number' },
        { id: 'SQ', label: 'S', order: 1, type: 'formula', expression: 'BUD_VAL ** 2' },
      ],
    }))).toEqual([]);
  });
});
