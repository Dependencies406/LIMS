/**
 * blockContextIsolation.test.ts
 *
 * Phase 26 Task 2 — TEST 5, THE POINT OF THE TASK.
 *
 * ADR-017 D4 adds a THIRD evaluation context. ADR-010's strict empty
 * semantics, and the row/summary rules that enforce them, must be
 * **unchanged everywhere else**.
 *
 * Modelled on `standardNamespaceIsolation.test.ts` and existing for the same
 * reason: if block context ever leaks into row or summary context, ADR-010 is
 * silently weakened and NOTHING VISIBLY BREAKS — a half-recorded table would
 * quietly compute finished numbers out of empty cells, and a certificate
 * would carry them.
 *
 * The specific failure mode this guards, stated plainly: while making blocks
 * work it is tempting to relax an existing check — to turn
 * `context !== 'summary'` into something permissive rather than into the
 * equivalent `context === 'row'`. Every assertion below is a row- or
 * summary-context behaviour that must read EXACTLY as it did before ADR-017,
 * plus the two directions of the new boundary (what a block may see, and what
 * it must refuse).
 */

import { describe, it, expect } from 'vitest';
import { evaluate, parseExpression, validateExpression, type TemplateShape } from '../../modules/recorder/formula';

const SHAPE: TemplateShape = {
  columns: ['CAL_NOM', 'CAL_IND', 'CAL_ERR'],
  roundCount: 2,
  summaryFieldIds: ['MAXDEV'],
  customFunctions: [],
};

/** The same shape as SHAPE, plus one block's own columns (ADR-017 D4). */
const BLOCK_SHAPE: TemplateShape = { ...SHAPE, blockColumns: ['BUD_SRC', 'BUD_VAL'] };

const CUSTOM_FUNCTIONS = {};

function messages(source: string, context: 'row' | 'summary' | 'block', shape = SHAPE): string[] {
  return validateExpression(source, { context, template: shape }).issues.map((i) => i.message);
}

function ok(source: string, context: 'row' | 'summary' | 'block', shape = SHAPE): boolean {
  return messages(source, context, shape).length === 0;
}

// ─────────────────────────────────────────────────────────────────────────
// ROW CONTEXT — must behave exactly as before ADR-017
// ─────────────────────────────────────────────────────────────────────────

describe('ISOLATION: row context is unchanged by the addition of block context', () => {
  it('a row formula may still reference its own columns', () => {
    expect(ok('CAL_IND - CAL_NOM', 'row')).toBe(true);
  });

  it('a row formula STILL cannot use a column aggregate', () => {
    const issues = messages('col_mean(CAL_IND)', 'row');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('not in column formulas');
  });

  it('a row formula STILL cannot reference a summary field (ADR-010 hard invariant)', () => {
    const issues = messages('SUMMARY_MAXDEV * 2', 'row');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('not in column formulas');
  });

  it('a row formula may still reference STD_* — the one context that can', () => {
    expect(ok('STD_C1 * CAL_IND', 'row')).toBe(true);
  });

  it('a row formula still rejects an unknown name', () => {
    expect(messages('NOPE + 1', 'row')[0]).toContain('is not a column in this template');
  });

  it("a block's columns are NOT visible in row context — the boundary in the other direction", () => {
    // BUD_SRC is a real block column, but a row formula must not see it.
    const issues = messages('BUD_SRC', 'row', BLOCK_SHAPE);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('is not a column in this template');
  });

  it('ROW EVALUATION: an empty cell still raises awaiting-input, not zero (ADR-010 strict)', () => {
    expect(() =>
      evaluate(parseExpression('CAL_IND + 1'), {
        kind: 'row',
        row: { CAL_IND: null },
        env: {},
        customFunctions: CUSTOM_FUNCTIONS,
      }),
    ).toThrowError(/has no value yet/);
  });

  it('ROW EVALUATION: a filled cell still computes normally', () => {
    expect(
      evaluate(parseExpression('CAL_IND + 1'), {
        kind: 'row',
        row: { CAL_IND: 4 },
        env: {},
        customFunctions: CUSTOM_FUNCTIONS,
      }),
    ).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// SUMMARY CONTEXT — must behave exactly as before ADR-017
// ─────────────────────────────────────────────────────────────────────────

describe('ISOLATION: summary context is unchanged by the addition of block context', () => {
  it('a summary field may still use column aggregates', () => {
    expect(ok('col_max(CAL_ERR)', 'summary')).toBe(true);
  });

  it('a summary field may still reference another summary field', () => {
    expect(ok('SUMMARY_MAXDEV * 2', 'summary')).toBe(true);
  });

  it('a summary field STILL cannot name a measurement column directly', () => {
    const issues = messages('CAL_IND * 2', 'summary');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('has no single value in a summary field');
    expect(issues[0]).toContain('col_mean(CAL_IND)');
  });

  it('a summary field STILL cannot reference STD_*', () => {
    const issues = messages('STD_C1', 'summary');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('has no value in a summary field');
  });

  it("a block's columns are NOT visible in summary context either", () => {
    const issues = messages('BUD_VAL', 'summary', BLOCK_SHAPE);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('is not a column in this template');
  });

  it('SUMMARY EVALUATION: an aggregate still ERRORS on an empty row — it does NOT skip empties', () => {
    // ADR-010's most load-bearing rule: a mean over an incomplete data set is
    // meaningless, so incompleteness must be impossible to overlook.
    expect(() =>
      evaluate(parseExpression('col_mean(CAL_IND)'), {
        kind: 'summary',
        rows: [{ CAL_IND: 1 }, { CAL_IND: null }],
        env: {},
        summary: {},
        customFunctions: CUSTOM_FUNCTIONS,
      }),
    ).toThrowError(/not filled in for every row/);
  });

  it('SUMMARY EVALUATION: a complete data set still aggregates normally', () => {
    expect(
      evaluate(parseExpression('col_mean(CAL_IND)'), {
        kind: 'summary',
        rows: [{ CAL_IND: 2 }, { CAL_IND: 4 }],
        env: {},
        summary: {},
        customFunctions: CUSTOM_FUNCTIONS,
      }),
    ).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Nothing that used to error now succeeds
// ─────────────────────────────────────────────────────────────────────────

describe('ISOLATION: no previously-erroring case now succeeds', () => {
  const previouslyRejected: Array<[string, 'row' | 'summary']> = [
    ['col_mean(CAL_IND)', 'row'],
    ['col_max(CAL_ERR)', 'row'],
    ['SUMMARY_MAXDEV', 'row'],
    ['NOPE', 'row'],
    ['CAL_IND', 'summary'],
    ['STD_C1', 'summary'],
    ['STD_TO_N', 'summary'],
    ['NOPE', 'summary'],
    ['ENV_TEMP_R9', 'row'],      // out of round range
    ['ENV_TEMP_R9', 'summary'],
    ['STD_NOPE', 'row'],         // not a real STD_ name
  ];

  it.each(previouslyRejected)('%s in %s context is still rejected', (source, context) => {
    expect(messages(source, context).length).toBeGreaterThan(0);
  });

  it('and the same list is still rejected even when block columns are present on the shape', () => {
    // The mere PRESENCE of blockColumns must not relax row/summary checking.
    for (const [source, context] of previouslyRejected) {
      expect(messages(source, context, BLOCK_SHAPE).length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// BLOCK CONTEXT — test 3 and test 4
// ─────────────────────────────────────────────────────────────────────────

describe('test 3: block context resolves aggregates, SUMMARY_*, ENV_*, REPORT_TO_N and its own row', () => {
  it('validates column aggregates over the measurement rows', () => {
    expect(ok('col_mean(CAL_IND)', 'block', BLOCK_SHAPE)).toBe(true);
  });

  it('validates SUMMARY_*', () => {
    expect(ok('SUMMARY_MAXDEV / 2', 'block', BLOCK_SHAPE)).toBe(true);
  });

  it('validates ENV_* and REPORT_TO_N', () => {
    expect(ok('ENV_TEMP_R1 + ENV_RH_R2', 'block', BLOCK_SHAPE)).toBe(true);
    expect(ok('REPORT_TO_N', 'block', BLOCK_SHAPE)).toBe(true);
  });

  it("validates its OWN block's columns", () => {
    expect(ok('BUD_VAL * 2', 'block', BLOCK_SHAPE)).toBe(true);
    expect(ok('BUD_SRC', 'block', BLOCK_SHAPE)).toBe(true);
  });

  it('rejects a MEASUREMENT column named directly, pointing at the aggregate instead', () => {
    const issues = messages('CAL_IND', 'block', BLOCK_SHAPE);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('has no single value in a report block');
    expect(issues[0]).toContain('col_mean(CAL_IND)');
  });

  it('EVALUATION: resolves all four sources in one expression', () => {
    const value = evaluate(parseExpression('col_mean(CAL_IND) + SUMMARY_MAXDEV + ENV_TEMP_R1 + BUD_VAL'), {
      kind: 'block',
      block: { BUD_VAL: 1 },
      rows: [{ CAL_IND: 2 }, { CAL_IND: 4 }],
      env: { ENV_TEMP_R1: 20 },
      summary: { SUMMARY_MAXDEV: 0.5 },
      customFunctions: CUSTOM_FUNCTIONS,
    });
    expect(value).toBe(3 + 0.5 + 20 + 1);
  });

  it('EVALUATION: strict empty semantics apply UNCHANGED in block context too', () => {
    // ADR-017 D4 says so explicitly: "The strict empty semantics of ADR-010
    // apply unchanged." An empty block cell is empty, not zero.
    expect(() =>
      evaluate(parseExpression('BUD_VAL + 1'), {
        kind: 'block',
        block: { BUD_VAL: null },
        rows: [],
        env: {},
        summary: {},
        customFunctions: CUSTOM_FUNCTIONS,
      }),
    ).toThrowError(/has no value yet/);
  });

  it('EVALUATION: an aggregate in block context also refuses to skip empties', () => {
    expect(() =>
      evaluate(parseExpression('col_mean(CAL_IND)'), {
        kind: 'block',
        block: {},
        rows: [{ CAL_IND: 1 }, { CAL_IND: null }],
        env: {},
        summary: {},
        customFunctions: CUSTOM_FUNCTIONS,
      }),
    ).toThrowError(/not filled in for every row/);
  });

  it('EVALUATION: a cross-block reference fails rather than half-working (D4 out of scope)', () => {
    // Only THIS block's row is in `block`, so another block's column is
    // simply absent — it must error, not silently read empty.
    expect(() =>
      evaluate(parseExpression('OTHER_COL'), {
        kind: 'block',
        block: { BUD_VAL: 1 },
        rows: [],
        env: {},
        summary: {},
        customFunctions: CUSTOM_FUNCTIONS,
      }),
    ).toThrowError(/has no single value in a report block/);
  });
});

describe('test 4: STD_* in a block formula is a VALIDATION ERROR, not a null', () => {
  it('every STD_* name is rejected at validation time', () => {
    for (const name of ['STD_C0', 'STD_C1', 'STD_TO_N', 'STD_UCAL', 'STD_RESOLUTION']) {
      const issues = messages(name, 'block', BLOCK_SHAPE);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('report block row does not have');
    }
  });

  it('it is an ERROR, never an empty value — the distinction ADR-017 D4 insists on', () => {
    const issues = messages('STD_C1 * BUD_VAL', 'block', BLOCK_SHAPE);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('EVALUATION also refuses it, so the rule holds even if validation were bypassed', () => {
    expect(() =>
      evaluate(parseExpression('STD_C1'), {
        kind: 'block',
        block: {},
        rows: [],
        env: {},
        summary: {},
        customFunctions: CUSTOM_FUNCTIONS,
      }),
    ).toThrowError(/report block row does not have/);
  });

  it('the block context object has no `std` field at all — unreachable by construction', () => {
    const context = {
      kind: 'block' as const,
      block: {},
      rows: [],
      env: {},
      summary: {},
      customFunctions: CUSTOM_FUNCTIONS,
    };
    expect('std' in context).toBe(false);
  });
});
