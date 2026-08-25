import { describe, it, expect } from 'vitest';
import {
  topologicalSort,
  validateColumnFormulas,
  validateCustomFunctions,
  validateExpression,
  type TemplateShape,
} from '../validator';

const template: TemplateShape = {
  columns: ['CAL_NOM', 'CAL_IND', 'CAL_ERR', 'CAL_TOL'],
  roundCount: 3,
  summaryFieldIds: ['MAXDEV', 'VERDICT'],
  customFunctions: [
    { name: 'error', params: ['nominal', 'indicated'] },
    { name: 'verdict', params: ['maxdev', 'tol'] },
  ],
};

function rowIssues(source: string): string[] {
  return validateExpression(source, { context: 'row', template }).issues.map((i) => i.message);
}

function summaryIssues(source: string): string[] {
  return validateExpression(source, { context: 'summary', template }).issues.map((i) => i.message);
}

const bareTemplate = {
  columns: template.columns,
  roundCount: template.roundCount,
  summaryFieldIds: template.summaryFieldIds,
};

function functionIssues(...sources: string[]): string[] {
  return validateCustomFunctions(sources, bareTemplate).issues.map((i) => i.message);
}

// ── Step 1: syntax ──────────────────────────────────────────────────────────

describe('step 1 — syntax errors carry a position', () => {
  it('reports line and column', () => {
    const [issue] = validateExpression('1 +', { context: 'row', template }).issues;
    expect(issue.line).toBe(1);
    expect(issue.column).toBeGreaterThan(0);
  });

  it('returns no AST when parsing failed', () => {
    expect(validateExpression('1 +', { context: 'row', template }).ast).toBeUndefined();
  });

  it('returns the AST when parsing succeeded', () => {
    expect(validateExpression('1 + 1', { context: 'row', template }).ast).toBeDefined();
  });
});

// ── Step 2: name resolution ─────────────────────────────────────────────────

describe('step 2 — identifier resolution', () => {
  it('accepts a known column in a row formula', () => {
    expect(rowIssues('CAL_IND - CAL_NOM')).toEqual([]);
  });

  it('rejects an unknown column and suggests the closest name', () => {
    const [message] = rowIssues('CAL_INDD');
    expect(message).toContain("'CAL_INDD' is not a column in this template.");
    expect(message).toContain("Did you mean 'CAL_IND'?");
  });

  it('rejects an unknown function and suggests the closest name', () => {
    const [message] = rowIssues('ROUNDD(1, 2)');
    expect(message).toContain("Unknown function 'ROUNDD'.");
    expect(message).toContain("Did you mean 'ROUND'?");
  });

  it('omits a suggestion when nothing is close', () => {
    expect(rowIssues('ZZZZZZZZZZZZ')[0]).not.toContain('Did you mean');
  });

  it('accepts a declared custom function', () => {
    expect(rowIssues('error(CAL_NOM, CAL_IND)')).toEqual([]);
  });
});

// ── Step 3: arity ───────────────────────────────────────────────────────────

describe('step 3 — arity', () => {
  it('rejects too few builtin arguments', () => {
    expect(rowIssues('ROUND(1)')[0]).toBe('ROUND expects 2 argument(s), got 1.');
  });

  it('rejects too many builtin arguments', () => {
    expect(rowIssues('ABS(1, 2)')[0]).toBe('ABS expects 1 argument(s), got 2.');
  });

  it('accepts an optional argument within range', () => {
    expect(rowIssues('TRUNC(1)')).toEqual([]);
    expect(rowIssues('TRUNC(1, 2)')).toEqual([]);
  });

  it('rejects a variadic call with no arguments', () => {
    expect(rowIssues('MAX()')[0]).toBe('MAX expects at least 1 argument(s), got 0.');
  });

  it('checks custom function arity at authoring time', () => {
    expect(rowIssues('error(CAL_NOM)')[0]).toBe('error expects 2 argument(s), got 1.');
  });
});

// ── Step 4: context restrictions ────────────────────────────────────────────

describe('step 4 — context restrictions', () => {
  it('rejects col_* in a row formula', () => {
    expect(rowIssues('col_mean(CAL_ERR)')[0]).toBe(
      'Column aggregates can only be used in summary fields and report blocks, not in column formulas.',
    );
  });

  it('rejects SUMMARY_* in a row formula', () => {
    expect(rowIssues('SUMMARY_MAXDEV')[0]).toBe(
      'Summary fields can only be used in other summary fields and report blocks, not in column formulas.',
    );
  });

  it('accepts col_* in a summary field', () => {
    expect(summaryIssues('col_mean(CAL_ERR)')).toEqual([]);
  });

  it('accepts SUMMARY_* in a summary field', () => {
    expect(summaryIssues('SUMMARY_MAXDEV * 2')).toEqual([]);
  });

  it('rejects a bare column in a summary field, pointing at the aggregate', () => {
    const [message] = summaryIssues('CAL_ERR');
    expect(message).toContain('has no single value in a summary field');
    expect(message).toContain('col_mean(CAL_ERR)');
  });

  it('rejects an unknown summary field', () => {
    expect(summaryIssues('SUMMARY_NOPE')[0]).toContain("'SUMMARY_NOPE' is not a summary field");
  });

  it('requires a bare column name as the aggregate argument', () => {
    expect(summaryIssues('col_mean(CAL_ERR * 2)')[0]).toContain(
      'must be a plain column name, not an expression',
    );
  });

  it('rejects an aggregate over an unknown column', () => {
    expect(summaryIssues('col_mean(NOPE)')[0]).toContain("'NOPE' is not a column in this template.");
  });

  it('does not double-report the aggregate argument as a bare column', () => {
    expect(summaryIssues('col_mean(CAL_ERR)')).toHaveLength(0);
  });

  it('rejects the wrong aggregate arity', () => {
    expect(summaryIssues('col_mean(CAL_ERR, CAL_TOL)')[0]).toBe('col_mean expects 1 argument, got 2.');
  });
});

// ── Step 6: ENV round indices ───────────────────────────────────────────────

describe('step 6 — ENV_* round indices (ADR-009)', () => {
  it('accepts every round within roundCount', () => {
    expect(rowIssues('ENV_TEMP_R1 + ENV_RH_R3')).toEqual([]);
  });

  it('rejects a round beyond roundCount', () => {
    expect(rowIssues('ENV_TEMP_R4')[0]).toBe(
      "'ENV_TEMP_R4' refers to round 4, but this template has 3 round(s).",
    );
  });

  it('rejects a malformed ENV name', () => {
    expect(rowIssues('ENV_PRESSURE_R1')[0]).toBe(
      "'ENV_PRESSURE_R1' is not a valid environment value. Use ENV_TEMP_R{n} or ENV_RH_R{n}.",
    );
  });

  it('rejects round 0 — indices are 1-based', () => {
    expect(rowIssues('ENV_TEMP_R0')[0]).toContain('refers to round 0');
  });

  it('allows ENV_* in a summary field too', () => {
    expect(summaryIssues('ENV_TEMP_R1')).toEqual([]);
  });
});

// ── §8 / Step 5: collision rules ────────────────────────────────────────────

describe('step 5 — §4 collision rules, exact messages', () => {
  it('rejects a function named after a builtin', () => {
    expect(functionIssues('def ROUND(x):\n    return x')).toContain(
      "'ROUND' is a built-in function name and cannot be reused.",
    );
  });

  it('rejects a function named after a column aggregate', () => {
    expect(functionIssues('def col_mean(x):\n    return x')).toContain(
      "'col_mean' is a column aggregate name and cannot be reused.",
    );
  });

  it('rejects a function named after an existing column', () => {
    expect(functionIssues('def CAL_IND(x):\n    return x')).toContain(
      "'CAL_IND' is already a column in this template and cannot be reused as a function name.",
    );
  });

  it('rejects a function name beginning with ENV_', () => {
    expect(functionIssues('def ENV_thing(x):\n    return x')).toContain(
      "A custom function name cannot begin with 'ENV_', 'SUMMARY_', 'STD_' or 'REPORT_'.",
    );
  });

  it('rejects a function name beginning with SUMMARY_', () => {
    expect(functionIssues('def SUMMARY_thing(x):\n    return x')).toContain(
      "A custom function name cannot begin with 'ENV_', 'SUMMARY_', 'STD_' or 'REPORT_'.",
    );
  });

  // ADR-013 D4: STD_ joins ENV_ and SUMMARY_ as a reserved prefix.
  it('rejects a function name beginning with STD_', () => {
    expect(functionIssues('def STD_thing(x):\n    return x')).toContain(
      "A custom function name cannot begin with 'ENV_', 'SUMMARY_', 'STD_' or 'REPORT_'.",
    );
  });

  it('rejects a duplicate function name', () => {
    expect(
      functionIssues('def f(x):\n    return x', 'def f(y):\n    return y'),
    ).toContain("A custom function named 'f' is already defined.");
  });

  it('rejects a parameter named after an existing column', () => {
    expect(functionIssues('def f(CAL_IND):\n    return CAL_IND')).toContain(
      "Parameter 'CAL_IND' is already a column in this template. Choose a different name.",
    );
  });

  it('rejects a parameter beginning with ENV_, SUMMARY_ or STD_', () => {
    expect(functionIssues('def f(ENV_x):\n    return ENV_x')).toContain(
      "A parameter name cannot begin with 'ENV_', 'SUMMARY_', 'STD_' or 'REPORT_'.",
    );
    expect(functionIssues('def g(SUMMARY_x):\n    return SUMMARY_x')).toContain(
      "A parameter name cannot begin with 'ENV_', 'SUMMARY_', 'STD_' or 'REPORT_'.",
    );
    expect(functionIssues('def h(STD_x):\n    return STD_x')).toContain(
      "A parameter name cannot begin with 'ENV_', 'SUMMARY_', 'STD_' or 'REPORT_'.",
    );
  });

  it('rejects a repeated parameter name', () => {
    expect(functionIssues('def f(a, a):\n    return a')).toContain(
      "Parameter 'a' is listed more than once.",
    );
  });

  it('accepts a clean function set', () => {
    expect(
      functionIssues(
        'def error(nominal, indicated):\n    return indicated - nominal',
        'def percent_error(nominal, indicated):\n    return error(nominal, indicated) / nominal * 100',
      ),
    ).toEqual([]);
  });
});

// ── Step 9: function-body isolation ─────────────────────────────────────────

describe('step 9 — a function body may only use its own parameters', () => {
  it('rejects a body reaching for a column', () => {
    expect(functionIssues('def f(a):\n    return a + CAL_IND')[0]).toBe(
      "A custom function cannot use 'CAL_IND' directly. Pass it in as a parameter instead.",
    );
  });

  it('rejects a body reaching for ENV_*', () => {
    expect(functionIssues('def f(a):\n    return a + ENV_TEMP_R1')[0]).toBe(
      "A custom function cannot use 'ENV_TEMP_R1' directly. Pass it in as a parameter instead.",
    );
  });

  it('rejects a body reaching for SUMMARY_*', () => {
    expect(functionIssues('def f(a):\n    return a + SUMMARY_MAXDEV')[0]).toBe(
      "A custom function cannot use 'SUMMARY_MAXDEV' directly. Pass it in as a parameter instead.",
    );
  });

  it('rejects a body using a column aggregate', () => {
    expect(functionIssues('def f(a):\n    return a + col_mean(CAL_ERR)')[0]).toContain(
      'Column aggregates cannot be used inside a custom function.',
    );
  });

  it('rejects an unknown name in a body, suggesting a parameter', () => {
    expect(functionIssues('def f(nominal):\n    return nominl')[0]).toContain("Did you mean 'nominal'?");
  });

  it('allows builtins inside a body', () => {
    expect(functionIssues('def f(a):\n    return ROUND(ABS(a), 2)')).toEqual([]);
  });
});

// ── §8 / Step 7: custom function cycles ─────────────────────────────────────

describe('step 7 — custom function call graph', () => {
  it('rejects direct recursion', () => {
    expect(functionIssues('def a(x):\n    return a(x)')[0]).toContain('a → a');
  });

  it('rejects indirect recursion', () => {
    const issues = functionIssues(
      'def a(x):\n    return b(x)',
      'def b(x):\n    return a(x)',
    );
    expect(issues.some((m) => m.includes('call each other in a loop'))).toBe(true);
  });

  it('rejects a three-step cycle', () => {
    const issues = functionIssues(
      'def a(x):\n    return b(x)',
      'def b(x):\n    return c(x)',
      'def c(x):\n    return a(x)',
    );
    expect(issues.some((m) => m.includes('call each other in a loop'))).toBe(true);
  });

  it('accepts a deep but acyclic chain, and orders callees first', () => {
    const result = validateCustomFunctions(
      [
        'def a(x):\n    return b(x)',
        'def b(x):\n    return c(x)',
        'def c(x):\n    return x + 1',
      ],
      bareTemplate,
    );
    expect(result.issues).toEqual([]);
    expect(result.evaluationOrder.indexOf('c')).toBeLessThan(result.evaluationOrder.indexOf('b'));
    expect(result.evaluationOrder.indexOf('b')).toBeLessThan(result.evaluationOrder.indexOf('a'));
  });

  it('returns no definitions when any issue was found', () => {
    expect(validateCustomFunctions(['def a(x):\n    return a(x)'], bareTemplate).definitions).toEqual([]);
  });
});

// ── §8 / Step 8: column dependency cycles ───────────────────────────────────

describe('step 8 — column dependency graph', () => {
  it('accepts a formula column referencing another formula column', () => {
    const result = validateColumnFormulas(
      [
        { column: 'CAL_ERR', source: 'CAL_IND - CAL_NOM' },
        { column: 'CAL_TOL', source: 'ABS(CAL_ERR) * 2' },
      ],
      template,
    );
    expect(result.issues).toEqual([]);
    expect(result.evaluationOrder.indexOf('CAL_ERR')).toBeLessThan(
      result.evaluationOrder.indexOf('CAL_TOL'),
    );
  });

  it('rejects a direct column cycle', () => {
    const result = validateColumnFormulas(
      [
        { column: 'CAL_ERR', source: 'CAL_TOL + 1' },
        { column: 'CAL_TOL', source: 'CAL_ERR + 1' },
      ],
      template,
    );
    expect(result.issues.some((i) => i.message.includes('depend on each other in a loop'))).toBe(true);
  });

  it('rejects a self-referencing column', () => {
    const result = validateColumnFormulas([{ column: 'CAL_ERR', source: 'CAL_ERR + 1' }], template);
    expect(result.issues.some((i) => i.message.includes('CAL_ERR → CAL_ERR'))).toBe(true);
  });

  it('rejects an indirect three-column cycle', () => {
    const shape: TemplateShape = { ...template, columns: ['A_X', 'B_X', 'C_X'] };
    const result = validateColumnFormulas(
      [
        { column: 'A_X', source: 'B_X + 1' },
        { column: 'B_X', source: 'C_X + 1' },
        { column: 'C_X', source: 'A_X + 1' },
      ],
      shape,
    );
    expect(result.issues.some((i) => i.message.includes('depend on each other in a loop'))).toBe(true);
  });

  it('prefixes per-column issues with the column name', () => {
    const result = validateColumnFormulas([{ column: 'CAL_ERR', source: 'NOPE' }], template);
    expect(result.issues[0].message.startsWith('CAL_ERR: ')).toBe(true);
  });
});

// ── Topological sort ────────────────────────────────────────────────────────

describe('topologicalSort', () => {
  it('orders dependencies before dependents', () => {
    const result = topologicalSort(['a', 'b'], new Map([['a', ['b']], ['b', []]]));
    expect(result.cycle).toBeNull();
    expect(result.order).toEqual(['b', 'a']);
  });

  it('reports the cycle path', () => {
    const result = topologicalSort(['a', 'b'], new Map([['a', ['b']], ['b', ['a']]]));
    expect(result.cycle).toEqual(['a', 'b', 'a']);
  });

  it('handles an empty graph', () => {
    expect(topologicalSort([], new Map())).toEqual({ order: [], cycle: null });
  });
});
