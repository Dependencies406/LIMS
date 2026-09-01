/**
 * recordCalculationTrace.test.ts
 *
 * Phase 33 Task 2 — the record-level trace orchestrator, tested as a pure
 * module before any UI is built on it (per the prompt's explicit instruction).
 *
 * Covers: values match `evaluateMockup`, cross-column splicing (row, summary,
 * block), shared subexpressions, cycle handling, and a 30-row performance
 * measurement (reported to console, not asserted as a hard pass/fail — see
 * docs/PHASE_33_RESULT.md for the number and judgement).
 */

import { describe, it, expect } from 'vitest';
import { traceRecord, standardIdentityFromSnapshot, type TraceRecordInput } from '../recordCalculationTrace';
import { evaluateMockup } from '../recorderTemplateMockup';
import type { ComputedTraceNode, TraceNode } from '../../modules/recorder/formula';
import type { RecorderTemplate, ReportBlock, ReferenceStandardSnapshot } from '../../types';

function baseTemplate(overrides: Partial<RecorderTemplate> = {}): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'T',
    equipmentTypeId: 'eq1',
    roundCount: 1,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: {
      parts: ['T'],
      separator: '-',
      includeYear: false,
      yearDigits: 2,
      numberPadding: 3,
      resetPolicy: 'never',
    },
    sections: [],
    summaryFields: [],
    customFunctions: [],
    reportBlocks: [],
    status: 'active',
    version: 1,
    createdAt: new Date(),
    ...overrides,
  } as RecorderTemplate;
}

/** One section (`CAL`) with NOM/IND (input) and a chain of formula columns. */
function chainTemplate(): RecorderTemplate {
  return baseTemplate({
    sections: [
      {
        id: 'CAL',
        label: 'Calibration',
        order: 0,
        columns: [
          { id: 'NOM', label: 'Nominal', order: 0, type: 'number' },
          { id: 'IND', label: 'Indicated', order: 1, type: 'number' },
          { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'CAL_IND - CAL_NOM' },
          { id: 'PCT', label: 'Percent error', order: 3, type: 'formula', expression: 'CAL_ERR / CAL_NOM * 100' },
          // A second column referencing the SAME dependency (CAL_ERR) as PCT —
          // shared-subexpression case.
          { id: 'DBL', label: 'Double error', order: 4, type: 'formula', expression: 'CAL_ERR * 2' },
        ],
      },
    ],
    summaryFields: [
      { id: 'MAXPCT', label: 'Max % error', type: 'number', expression: 'col_max(CAL_PCT)' },
      { id: 'MAXPCT_PLUS1', label: 'Max % error + 1', type: 'number', expression: 'SUMMARY_MAXPCT + 1' },
    ],
    reportBlocks: [
      {
        id: 'BLK',
        label: 'Uncertainty budget',
        order: 0,
        kind: 'table',
        columns: [
          { id: 'U', label: 'Contribution', order: 0, type: 'number' },
          {
            id: 'TOTAL',
            label: 'Total',
            order: 1,
            type: 'formula',
            expression: 'BLK_U + SUMMARY_MAXPCT_PLUS1 + col_mean(CAL_ERR)',
          },
        ],
        defaultRowCount: 1,
      } as ReportBlock,
    ],
  });
}

const ROWS = [
  { CAL_NOM: 10, CAL_IND: 10.5 },
  { CAL_NOM: 20, CAL_IND: 19.0 },
  { CAL_NOM: 30, CAL_IND: 30.6 },
];

function find(node: TraceNode, label: string): TraceNode | null {
  if (node.label === label) return node;
  if (node.provenance !== 'computed') return null;
  for (const child of node.inputs) {
    const hit = find(child, label);
    if (hit) return hit;
  }
  return null;
}

describe('traceRecord values match evaluateMockup', () => {
  it('row formula columns', () => {
    const template = chainTemplate();
    const trace = traceRecord({ template, rows: ROWS, env: {} });
    const mockup = evaluateMockup(template, ROWS, {});

    ROWS.forEach((_row, i) => {
      for (const key of ['CAL_ERR', 'CAL_PCT', 'CAL_DBL']) {
        expect(trace.rows[i][key].value, `row ${i} ${key}`).toBe(mockup.rows[i][key].value);
      }
    });
  });

  it('summary fields', () => {
    const template = chainTemplate();
    const trace = traceRecord({ template, rows: ROWS, env: {} });
    const mockup = evaluateMockup(template, ROWS, {});
    expect(trace.summary.MAXPCT.value).toBe(mockup.summary.MAXPCT.value);
    expect(trace.summary.MAXPCT_PLUS1.value).toBe(mockup.summary.MAXPCT_PLUS1.value);
  });

  it('report block cells', () => {
    const template = chainTemplate();
    const blockRows = { BLK: [{ BLK_U: 5 }] };
    const trace = traceRecord({ template, rows: ROWS, env: {}, blockRows });
    const mockup = evaluateMockup(template, ROWS, {}, {}, blockRows);
    expect(trace.blocks.BLK[0].BLK_TOTAL.value).toBe(mockup.blocks.BLK[0].BLK_TOTAL.value);
  });
});

describe('cross-column references are spliced, not left as bare reference nodes', () => {
  it('CAL_PCT splices CAL_ERR\'s full subtree, down to entered leaves', () => {
    const template = chainTemplate();
    const trace = traceRecord({ template, rows: ROWS, env: {} });
    const pct = trace.rows[0].CAL_PCT;

    const err = find(pct, 'CAL_ERR') as ComputedTraceNode;
    expect(err).toBeDefined();
    expect(err.provenance).toBe('computed');
    // Spliced, not a bare unexpanded reference: it has the real expression
    // and real entered inputs underneath it, not null/[] placeholders.
    expect(err.expression).toBe('CAL_IND - CAL_NOM');
    expect(err.inputs.length).toBeGreaterThan(0);
    expect(find(err, 'CAL_IND')).toMatchObject({ provenance: 'entered', value: 10.5 });
    expect(find(err, 'CAL_NOM')).toMatchObject({ provenance: 'entered', value: 10 });
  });

  it('a summary field splices a formula column reached only through col_mean', () => {
    const template = chainTemplate();
    const blockRows = { BLK: [{ BLK_U: 5 }] };
    const trace = traceRecord({ template, rows: ROWS, env: {}, blockRows });
    const total = trace.blocks.BLK[0].BLK_TOTAL;

    // col_mean(CAL_ERR) inside BLK_TOTAL: each row value should be the
    // SPLICED CAL_ERR subtree for that row, not a bare entered-looking number.
    const aggregate = find(total, 'col_mean(CAL_ERR)') as ComputedTraceNode;
    expect(aggregate).toBeDefined();
    expect(aggregate.inputs).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const rowErr = aggregate.inputs[i] as ComputedTraceNode;
      expect(rowErr.provenance).toBe('computed');
      expect(rowErr.expression).toBe('CAL_IND - CAL_NOM');
    }

    // BLK_TOTAL also references SUMMARY_MAXPCT_PLUS1, which itself
    // references SUMMARY_MAXPCT — both should be spliced, two levels deep.
    const summaryPlus1 = find(total, 'SUMMARY_MAXPCT_PLUS1') as ComputedTraceNode;
    expect(summaryPlus1.expression).toBe('SUMMARY_MAXPCT + 1');
    const summaryMax = find(summaryPlus1, 'SUMMARY_MAXPCT') as ComputedTraceNode;
    expect(summaryMax.expression).toBe('col_max(CAL_PCT)');
  });
});

describe('shared subexpressions are traced once and referenced from both places', () => {
  it('CAL_PCT and CAL_DBL both splice the SAME CAL_ERR content', () => {
    const template = chainTemplate();
    const trace = traceRecord({ template, rows: ROWS, env: {} });
    const errViaPct = find(trace.rows[1].CAL_PCT, 'CAL_ERR');
    const errViaDbl = find(trace.rows[1].CAL_DBL, 'CAL_ERR');
    expect(errViaPct).toEqual(errViaDbl);
    // And it matches the column's own root trace exactly (same value, same subtree).
    expect((errViaPct as ComputedTraceNode).value).toBe(trace.rows[1].CAL_ERR.value);
    expect((errViaPct as ComputedTraceNode).inputs).toEqual(trace.rows[1].CAL_ERR.inputs);
  });
});

describe('custom functions expand with the correct body text', () => {
  // Regression coverage for a real near-miss: `customFunctionToSource` wraps
  // a function's body in `def name(...):\n    return <expr>` for the
  // EVALUATOR's parser. `traceRecord`'s `buildCustomFunctions` must hand
  // `traceExpression` the body text ALONE (`fn.expression`), not that wrapped
  // form — passing the wrapped source would make the child node's
  // `expression`/`substituted` either fail to parse as a bare expression or
  // render the literal `def ...: return ...` text instead of just the body.
  it('the expanded body shows the bare expression, not the def-wrapped source', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL',
          label: 'Calibration',
          order: 0,
          columns: [
            { id: 'NOM', label: 'Nominal', order: 0, type: 'number' },
            { id: 'IND', label: 'Indicated', order: 1, type: 'number' },
            { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'err(CAL_NOM, CAL_IND)' },
          ],
        },
      ],
      customFunctions: [{ name: 'err', params: ['n', 'i'], expression: 'i - n' }],
    });
    const rows = [{ CAL_NOM: 10, CAL_IND: 10.5 }];
    const trace = traceRecord({ template, rows, env: {} });
    const mockup = evaluateMockup(template, rows, {});

    expect(trace.rows[0].CAL_ERR.value).toBe(mockup.rows[0].CAL_ERR.value);
    expect(trace.rows[0].CAL_ERR.value).toBe(0.5);

    const body = trace.rows[0].CAL_ERR.inputs.find(
      (n) => n.provenance === 'computed' && (n as ComputedTraceNode).origin.kind === 'custom-function',
    ) as ComputedTraceNode;
    expect(body).toBeDefined();
    // The bare body — NOT "def err(n, i):\n    return i - n".
    expect(body.expression).toBe('i - n');
    expect(body.substituted).toBe('10.5 - 10');
    expect(body.expression).not.toContain('def ');
    expect(body.expression).not.toContain('return');
  });
});

describe('cycles are marked clearly, never a hang', () => {
  it('two formula columns referencing each other produce an explicit error node', () => {
    // Deliberately bypasses validateColumnFormulas's own authoring-time cycle
    // rejection — simulates a snapshot pinned by an older validator, per the
    // prompt's own scenario.
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL',
          label: 'Calibration',
          order: 0,
          columns: [
            { id: 'A', label: 'A', order: 0, type: 'formula', expression: 'CAL_B + 1' },
            { id: 'B', label: 'B', order: 1, type: 'formula', expression: 'CAL_A + 1' },
          ],
        },
      ],
    });

    const start = Date.now();
    const trace = traceRecord({ template, rows: [{}], env: {} });
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThan(1000); // no hang
    const a = trace.rows[0].CAL_A;
    const b = trace.rows[0].CAL_B;
    // At least one side of the cycle must be explicitly, visibly marked —
    // never silently absent from the trace.
    const marked = [a, b].filter((n) => n.error?.kind === 'invalid-computation' && /circular/i.test(n.error.message));
    expect(marked.length).toBeGreaterThan(0);
  });
});

describe('reference-standard identity adapters', () => {
  it('standardIdentityFromSnapshot carries only what the snapshot actually stores', () => {
    const snapshot: ReferenceStandardSnapshot = {
      equipmentId: 'EQ1',
      equationId: 'EQ1-R1',
      displayName: 'Load cell — 10-100 kN',
      equipmentCode: 'CAL-FRC-004',
      coefficients: [0, 1],
      inputUnit: 'mV/V',
      outputUnit: 'kN',
      serialNumber: 'SN-77',
      calibrationDate: new Date('2026-07-09'),
      dueDate: new Date('2027-07-09'),
      capturedAt: new Date('2026-07-09'),
    };
    const identity = standardIdentityFromSnapshot(snapshot);
    expect(identity).toEqual({
      equipmentId: 'EQ1',
      equationId: 'EQ1-R1',
      displayName: 'Load cell — 10-100 kN',
      equipmentCode: 'CAL-FRC-004',
      serialNumber: 'SN-77',
      calibrationDate: '2026-07-09T00:00:00.000Z',
      dueDate: '2027-07-09T00:00:00.000Z',
    });
  });

  it('a STD_* node carries the identity through into the row trace', () => {
    const template = baseTemplate({
      sections: [
        {
          id: 'CAL',
          label: 'Calibration',
          order: 0,
          columns: [
            { id: 'STD', label: 'Standard', order: 0, type: 'standard' },
            { id: 'F', label: 'Force', order: 1, type: 'formula', expression: 'STD_C1 * 2' },
          ],
        },
      ],
    });
    const identity = standardIdentityFromSnapshot({
      equipmentId: 'EQ1',
      equationId: 'EQ1-R1',
      displayName: 'Load cell',
      equipmentCode: 'C1',
      coefficients: [0, 3],
      inputUnit: 'mV/V',
      outputUnit: 'kN',
      capturedAt: new Date(),
    });
    const input: TraceRecordInput = {
      template,
      rows: [{ CAL_STD: 'EQ1::EQ1-R1' }],
      env: {},
      standardsById: { 'EQ1::EQ1-R1': { coefficients: [0, 3], outputUnit: 'kN' } },
      standardIdentityById: { 'EQ1::EQ1-R1': identity },
    };
    const trace = traceRecord(input);
    const stdNode = find(trace.rows[0].CAL_F, 'STD_C1');
    expect(stdNode).toMatchObject({ provenance: 'reference-standard', value: 3, standard: identity });
  });
});

describe('performance: 30 rows, realistic column count', () => {
  it('measures and reports the cost of tracing a full record', () => {
    const columns = Array.from({ length: 8 }, (_, i) => ({
      id: `IN${i}`,
      label: `Input ${i}`,
      order: i,
      type: 'number' as const,
    }));
    const formulaColumns = Array.from({ length: 5 }, (_, i) => ({
      id: `F${i}`,
      label: `Formula ${i}`,
      order: 8 + i,
      type: 'formula' as const,
      // Each formula chains off the previous one (or an input on the first),
      // and off a raw input — a realistic mix of entered + computed inputs.
      expression: i === 0 ? 'CAL_IN0 + CAL_IN1' : `CAL_F${i - 1} + CAL_IN${i}`,
    }));
    const template = baseTemplate({
      sections: [{ id: 'CAL', label: 'Calibration', order: 0, columns: [...columns, ...formulaColumns] }],
      summaryFields: [
        { id: 'MEAN', label: 'Mean', type: 'number', expression: 'col_mean(CAL_F4)' },
        { id: 'MAX', label: 'Max', type: 'number', expression: 'col_max(CAL_F4)' },
      ],
    });
    const rows = Array.from({ length: 30 }, (_, r) =>
      Object.fromEntries(columns.map((c, i) => [`CAL_${c.id}`, r + i])),
    );

    const iterations = 5;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) traceRecord({ template, rows, env: {} });
    const elapsedMs = (performance.now() - start) / iterations;

    console.log(`[Phase 33 Task 2] traceRecord: 30 rows x 13 columns (5 formula) + 2 summary fields: ${elapsedMs.toFixed(2)} ms/call`);
    // Reported, not hard-asserted pass/fail per the prompt ("report the
    // number; if slow, say so") — but a generous ceiling catches a real
    // performance regression (e.g. accidental re-tracing of shared columns)
    // without being a flaky micro-benchmark assertion.
    expect(elapsedMs).toBeLessThan(500);
  });
});
