import { describe, it, expect } from 'vitest';
import {
  evaluate,
  parseExpression,
  validateColumnFormulas,
  validateCustomFunctions,
  validateExpression,
  type CellValue,
  type CustomFunctionBinding,
  type TemplateShape,
} from '../index';

/**
 * End-to-end: author a small ISO 7500-1-shaped template, validate it the way
 * the authoring UI will, then evaluate a record the way the recording UI will.
 * Exercises the public surface from index.ts rather than the internals.
 */

const FUNCTION_SOURCES = [
  'def error(nominal, indicated):\n    return indicated - nominal',
  'def percent_error(nominal, indicated):\n    return error(nominal, indicated) / nominal * 100',
  'def verdict(maxdev, tol):\n    return "PASS" if maxdev <= tol else "FAIL"',
];

const template: TemplateShape = {
  columns: ['CAL_NOM', 'CAL_IND', 'CAL_ERR', 'CAL_PCT'],
  roundCount: 2,
  summaryFieldIds: ['MAXDEV', 'VERDICT'],
  customFunctions: [
    { name: 'error', params: ['nominal', 'indicated'] },
    { name: 'percent_error', params: ['nominal', 'indicated'] },
    { name: 'verdict', params: ['maxdev', 'tol'] },
  ],
};

function library(): Record<string, CustomFunctionBinding> {
  const result = validateCustomFunctions(FUNCTION_SOURCES, {
    columns: template.columns,
    roundCount: template.roundCount,
    summaryFieldIds: template.summaryFieldIds,
  });
  expect(result.issues).toEqual([]);
  const out: Record<string, CustomFunctionBinding> = {};
  for (const def of result.definitions) {
    out[def.name] = { name: def.name, params: def.params, body: def.body };
  }
  return out;
}

describe('authoring a template', () => {
  it('validates the custom function set and orders it callees-first', () => {
    const result = validateCustomFunctions(FUNCTION_SOURCES, {
      columns: template.columns,
      roundCount: template.roundCount,
      summaryFieldIds: template.summaryFieldIds,
    });
    expect(result.issues).toEqual([]);
    expect(result.evaluationOrder.indexOf('error')).toBeLessThan(
      result.evaluationOrder.indexOf('percent_error'),
    );
  });

  it('validates the formula columns and their dependency order', () => {
    const result = validateColumnFormulas(
      [
        { column: 'CAL_ERR', source: 'error(CAL_NOM, CAL_IND)' },
        { column: 'CAL_PCT', source: 'ROUND(percent_error(CAL_NOM, CAL_IND), 3)' },
      ],
      template,
    );
    expect(result.issues).toEqual([]);
    expect(result.evaluationOrder).toHaveLength(2);
  });

  it('validates the summary fields', () => {
    expect(
      validateExpression('col_max(CAL_ERR)', { context: 'summary', template }).issues,
    ).toEqual([]);
    expect(
      validateExpression('verdict(SUMMARY_MAXDEV, 0.5)', { context: 'summary', template }).issues,
    ).toEqual([]);
  });
});

describe('recording against that template', () => {
  const customFunctions = library();
  const env = { ENV_TEMP_R1: 20.5, ENV_RH_R1: 55, ENV_TEMP_R2: 20.7, ENV_RH_R2: 54 };

  const rows: Array<Record<string, CellValue>> = [
    { CAL_NOM: 100, CAL_IND: 100.2 },
    { CAL_NOM: 200, CAL_IND: 200.1 },
    { CAL_NOM: 300, CAL_IND: 299.6 },
  ];

  function computeErrors(): number[] {
    const ast = parseExpression('error(CAL_NOM, CAL_IND)');
    return rows.map(
      (row) => evaluate(ast, { kind: 'row', row, env, customFunctions }) as number,
    );
  }

  it('computes the error column row by row', () => {
    const errors = computeErrors();
    expect(errors[0]).toBeCloseTo(0.2, 10);
    expect(errors[1]).toBeCloseTo(0.1, 10);
    expect(errors[2]).toBeCloseTo(-0.4, 10);
  });

  it('computes a summary field over the completed column', () => {
    const errors = computeErrors();
    const withErrors = rows.map((row, i) => ({ ...row, CAL_ERR: errors[i] }));

    const maxdev = evaluate(parseExpression('col_max(CAL_ERR)'), {
      kind: 'summary',
      rows: withErrors,
      env,
      summary: {},
      customFunctions,
    });
    expect(maxdev).toBeCloseTo(0.2, 10);

    const verdict = evaluate(parseExpression('verdict(SUMMARY_MAXDEV, 0.5)'), {
      kind: 'summary',
      rows: withErrors,
      env,
      summary: { SUMMARY_MAXDEV: maxdev as number },
      customFunctions,
    });
    expect(verdict).toBe('PASS');
  });

  it('reports awaiting-input while the table is still being filled in', () => {
    // Three rows computed, then the technician adds a fourth and has not
    // entered its reading yet — the realistic mid-session state.
    const errors = computeErrors();
    const partial: Array<Record<string, CellValue>> = [
      ...rows.map((row, i) => ({ ...row, CAL_ERR: errors[i] })),
      { CAL_NOM: 400, CAL_IND: null, CAL_ERR: null },
    ];
    const ast = parseExpression('col_max(CAL_ERR)');
    expect(() =>
      evaluate(ast, { kind: 'summary', rows: partial, env, summary: {}, customFunctions }),
    ).toThrow(/not filled in for every row/);
  });

  it('treats a brand-new row that lacks the key entirely as awaiting input, not a bad column', () => {
    const errors = computeErrors();
    const partial: Array<Record<string, CellValue>> = [
      ...rows.map((row, i) => ({ ...row, CAL_ERR: errors[i] })),
      { CAL_NOM: 400 },
    ];
    expect(() =>
      evaluate(parseExpression('col_max(CAL_ERR)'), {
        kind: 'summary',
        rows: partial,
        env,
        summary: {},
        customFunctions,
      }),
    ).toThrow(/not filled in for every row/);
  });

  it('applies a temperature correction using a per-round ENV scalar', () => {
    const value = evaluate(parseExpression('CAL_IND * (1 + 11.5e-6 * (ENV_TEMP_R2 - 20))'), {
      kind: 'row',
      row: rows[0],
      env,
      customFunctions,
    });
    expect(value).toBeCloseTo(100.2 * (1 + 11.5e-6 * 0.7), 10);
  });
});

describe('the verifier catches an authoring mistake before any data exists', () => {
  it('flags a summary formula that tried to use a bare column', () => {
    const issues = validateExpression('CAL_ERR * 2', { context: 'summary', template }).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('col_mean(CAL_ERR)');
  });

  it('flags an ENV round beyond the template roundCount', () => {
    const issues = validateExpression('ENV_TEMP_R3', { context: 'row', template }).issues;
    expect(issues[0].message).toContain('this template has 2 round(s)');
  });
});
