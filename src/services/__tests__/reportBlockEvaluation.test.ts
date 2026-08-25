/**
 * reportBlockEvaluation.test.ts
 *
 * Phase 26 Task 2 — test 6 and the end-to-end block pipeline.
 *
 * `blockContextIsolation.test.ts` proves the CONTEXT is correct and confined.
 * This proves the ORCHESTRATION is: that blocks run after measurement rows
 * and after summary fields (ADR-017 D4), over their own row axis, and that a
 * template with no blocks is completely unaffected.
 */

import { describe, it, expect } from 'vitest';
import { evaluateMockup } from '../recorderTemplateMockup';
import type { RecorderTemplate, ReportBlock } from '../../types';

function template(blocks: ReportBlock[] = []): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'T',
    equipmentTypeId: 'eq1',
    roundCount: 1,
    defaultRowCount: 1,
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
    ],
    summaryFields: [{ id: 'MAXDEV', label: 'Max deviation', type: 'number', expression: 'col_max(CAL_ERR)' }],
    customFunctions: [],
    reportBlocks: blocks,
    status: 'active',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u',
    updatedBy: 'u',
  } as RecorderTemplate;
}

/** An uncertainty-budget-shaped block: a row per contributor, not per point. */
const BUDGET: ReportBlock = {
  id: 'BUD',
  label: 'Uncertainty budget',
  order: 0,
  kind: 'table',
  defaultRowCount: 2,
  columns: [
    { id: 'SRC', label: 'Source', order: 0, type: 'text' },
    { id: 'VAL', label: 'Value', order: 1, type: 'number' },
    { id: 'SQ', label: 'Squared', order: 2, type: 'formula', expression: 'BUD_VAL ** 2' },
  ],
};

const ROWS = [
  { CAL_NOM: 100, CAL_IND: 101 },
  { CAL_NOM: 200, CAL_IND: 202 },
];

describe('test 6: blocks evaluate AFTER measurement rows and AFTER summary fields', () => {
  it('a block formula can read SUMMARY_*, which is only possible if summary already ran', () => {
    const block: ReportBlock = {
      ...BUDGET,
      columns: [
        { id: 'SRC', label: 'Source', order: 0, type: 'text' },
        { id: 'FROMSUM', label: 'From summary', order: 1, type: 'formula', expression: 'SUMMARY_MAXDEV * 10' },
      ],
    };
    const result = evaluateMockup(template([block]), ROWS, {}, {}, { BUD: [{ BUD_SRC: 'repeatability' }] });

    // col_max(CAL_ERR) over errors 1 and 2 = 2, so 2 * 10 = 20.
    expect(result.summary.MAXDEV.value).toBe(2);
    expect(result.blocks.BUD[0].BUD_FROMSUM.value).toBe(20);
  });

  it('a block formula can read a column aggregate, which needs every measurement row final', () => {
    const block: ReportBlock = {
      ...BUDGET,
      columns: [
        { id: 'MEAN', label: 'Mean error', order: 0, type: 'formula', expression: 'col_mean(CAL_ERR)' },
      ],
    };
    const result = evaluateMockup(template([block]), ROWS, {}, {}, { BUD: [{}] });
    expect(result.blocks.BUD[0].BUD_MEAN.value).toBe(1.5);
  });

  it('the block row axis is its OWN — 2 measurement rows can produce 3 block rows', () => {
    // The precise thing that makes a block not a section (ADR-017 Context):
    // a 2-point run must not be forced to produce exactly 2 budget rows.
    const result = evaluateMockup(template([BUDGET]), ROWS, {}, {}, {
      BUD: [{ BUD_VAL: 1 }, { BUD_VAL: 2 }, { BUD_VAL: 3 }],
    });
    expect(result.rows).toHaveLength(2);
    expect(result.blocks.BUD).toHaveLength(3);
    expect(result.blocks.BUD.map((r) => r.BUD_SQ.value)).toEqual([1, 4, 9]);
  });

  it('a block formula sees its own row only — not the row beside it', () => {
    const result = evaluateMockup(template([BUDGET]), ROWS, {}, {}, {
      BUD: [{ BUD_VAL: 2 }, { BUD_VAL: 5 }],
    });
    expect(result.blocks.BUD[0].BUD_SQ.value).toBe(4);
    expect(result.blocks.BUD[1].BUD_SQ.value).toBe(25);
  });
});

describe('block evaluation keeps ADR-010 strict semantics', () => {
  it('an empty block cell leaves its formula awaiting-input, not zero', () => {
    const result = evaluateMockup(template([BUDGET]), ROWS, {}, {}, { BUD: [{ BUD_VAL: null }] });
    expect(result.blocks.BUD[0].BUD_SQ.error?.kind).toBe('awaiting-input');
    expect(result.blocks.BUD[0].BUD_SQ.value).toBeNull();
  });

  it('an incomplete measurement table makes a block aggregate await input, not compute', () => {
    const block: ReportBlock = {
      ...BUDGET,
      columns: [{ id: 'MEAN', label: 'Mean', order: 0, type: 'formula', expression: 'col_mean(CAL_IND)' }],
    };
    const result = evaluateMockup(
      template([block]),
      [{ CAL_NOM: 100, CAL_IND: 101 }, { CAL_NOM: 200, CAL_IND: null }],
      {}, {}, { BUD: [{}] },
    );
    expect(result.blocks.BUD[0].BUD_MEAN.error?.kind).toBe('awaiting-input');
  });

  it('STD_* in a block formula is reported as an error at evaluation', () => {
    const block: ReportBlock = {
      ...BUDGET,
      columns: [{ id: 'BAD', label: 'Bad', order: 0, type: 'formula', expression: 'STD_C1' }],
    };
    const result = evaluateMockup(template([block]), ROWS, {}, {}, { BUD: [{}] });
    expect(result.blocks.BUD[0].BUD_BAD.error).toBeDefined();
    expect(result.blocks.BUD[0].BUD_BAD.error!.message).toContain('report block row does not have');
  });
});

describe('blocks do not disturb templates that have none', () => {
  it('a template with no reportBlocks evaluates exactly as before, with an empty blocks map', () => {
    const result = evaluateMockup(template(), ROWS, {});
    expect(result.blocks).toEqual({});
    expect(result.rows).toHaveLength(2);
    expect(result.summary.MAXDEV.value).toBe(2);
  });

  it('an absent reportBlocks field (a pre-ADR-017 template) behaves identically to []', () => {
    const withUndefined = template();
    delete (withUndefined as Partial<RecorderTemplate>).reportBlocks;
    const a = evaluateMockup(withUndefined, ROWS, {});
    const b = evaluateMockup(template([]), ROWS, {});
    expect(a.blocks).toEqual(b.blocks);
    expect(a.summary.MAXDEV.value).toBe(b.summary.MAXDEV.value);
  });

  it('a text block contributes no evaluated rows (it has no row axis)', () => {
    const text: ReportBlock = {
      id: 'STMT', label: 'Statement', order: 0, kind: 'text',
      columns: [], defaultRowCount: 0, text: 'Conformity assessed.',
    };
    const result = evaluateMockup(template([text]), ROWS, {}, {}, {});
    expect(result.blocks.STMT).toBeUndefined();
  });
});

describe('a block formula may build on another formula column of its own block', () => {
  it('resolves in dependency order, like section formula columns do', () => {
    const block: ReportBlock = {
      id: 'BUD', label: 'Budget', order: 0, kind: 'table', defaultRowCount: 1,
      columns: [
        { id: 'VAL', label: 'Value', order: 0, type: 'number' },
        // DOUBLE is declared BEFORE the column it depends on, so this only
        // works if the topological sort is actually being applied.
        { id: 'QUAD', label: 'Quadruple', order: 1, type: 'formula', expression: 'BUD_DOUBLE * 2' },
        { id: 'DOUBLE', label: 'Double', order: 2, type: 'formula', expression: 'BUD_VAL * 2' },
      ],
    };
    const result = evaluateMockup(template([block]), ROWS, {}, {}, { BUD: [{ BUD_VAL: 3 }] });
    expect(result.blocks.BUD[0].BUD_DOUBLE.value).toBe(6);
    expect(result.blocks.BUD[0].BUD_QUAD.value).toBe(12);
  });
});
