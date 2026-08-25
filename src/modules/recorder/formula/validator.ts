/**
 * validator.ts — the verifier of docs/FORMULA_GRAMMAR.md §7.
 *
 * Validates without executing anything. All nine checks live here:
 *
 *   1. parse, reporting syntax errors with line and column
 *   2. resolve every identifier per §4
 *   3. check arity for every call
 *   4. enforce context restrictions (col_* and SUMMARY_* are summary-only)
 *   5. enforce every collision rule of §4
 *   6. validate each ENV_* round index against roundCount
 *   7. topologically sort the custom-function call graph; reject cycles
 *   8. topologically sort the column dependency graph; reject cycles
 *   9. verify function bodies use only their own parameters, builtins, and
 *      other custom functions
 *
 * Nothing here evaluates an expression, so a template can be checked before any
 * data exists.
 */

import type { ExpressionNode, FunctionDefinitionNode } from './ast';
import { walk } from './ast';
import {
  BUILTIN_FUNCTIONS,
  COLUMN_AGGREGATES,
  describeArity,
  isBuiltin,
  isColumnAggregate,
} from './builtins';
import { FormulaSyntaxError } from './errors';
import { parseExpression, parseFunctionDefinition } from './parser';

/**
 * ADR-017 D4 added 'block' as a THIRD context. Every context check below is
 * written so that adding it is a no-op for 'row' and 'summary' — a check that
 * used to read `context !== 'summary'` became `context === 'row'` rather than
 * gaining an `|| context === 'block'` clause, because the former cannot
 * accidentally relax the row rule while the latter can. `blockContextIsolation.test.ts`
 * is the guard that this stayed true.
 */
export type FormulaContextKind = 'row' | 'summary' | 'block';

export interface ValidationIssue {
  message: string;
  line?: number;
  column?: number;
}

export interface CustomFunctionSignature {
  name: string;
  params: string[];
}

export interface TemplateShape {
  /** Every valid column reference, e.g. ['CAL_NOM', 'CAL_IND']. */
  columns: string[];
  /** Drives the valid ENV_*_R{n} range (ADR-009). */
  roundCount: number;
  /** Summary field ids WITHOUT the SUMMARY_ prefix, e.g. ['MAXDEV']. */
  summaryFieldIds: string[];
  /** Declared custom functions, for call resolution and arity checks. */
  customFunctions: CustomFunctionSignature[];
  /**
   * ADR-017 D4: the columns of the ONE block being validated, e.g.
   * ['BUD_SRC', 'BUD_VAL'] — a block formula sees its own block's columns
   * for its own row, and nothing from any other block (cross-block
   * references are explicitly out of scope, D4).
   *
   * Absent/empty in row and summary context, which is what keeps this field
   * inert for every template authored before ADR-017.
   */
  blockColumns?: string[];
}

export interface ExpressionValidationResult {
  issues: ValidationIssue[];
  /** Present only when the source parsed. */
  ast?: ExpressionNode;
}

const ENV_PATTERN = /^ENV_(TEMP|RH)_R(\d+)$/;

/** How to name the current context in an error message. */
function contextNoun(context: FormulaContextKind): string {
  if (context === 'summary') return 'a summary field';
  if (context === 'block') return 'a report block';
  return 'a column formula';
}

/**
 * Every valid `STD_*` name (ADR-013 D4). Duplicated here rather than imported
 * from services/ because the formula module is deliberately standalone — it
 * depends on nothing outside itself, so it can be reasoned about and tested in
 * isolation. `referenceStandardVariables.STANDARD_VARIABLE_NAMES` builds the
 * same list; a test asserts the two agree.
 */
export const STANDARD_VARIABLES = [
  'STD_C0', 'STD_C1', 'STD_C2', 'STD_C3', 'STD_C4', 'STD_C5',
  'STD_TO_N',
  'STD_UCAL', 'STD_UA', 'STD_UB', 'STD_UC',
  'STD_RESOLUTION',
];

/**
 * Every valid `REPORT_*` name (ADR-014 D5). Record-scoped, so unlike
 * `STANDARD_VARIABLES` these are legal in a summary field too.
 *
 * Named to pair with `STD_TO_N`: the conversion an author writes reads
 * `polynomial(R) * STD_TO_N / REPORT_TO_N`, and the two halves of that
 * expression are meant to look like each other.
 *
 * Exported (Phase 10 Task 6) so the help/variable-docs module can import it
 * rather than retyping it — the same reasoning that keeps
 * `STANDARD_VARIABLE_NAMES` as the single source for `STD_*`.
 */
export const REPORT_VARIABLES = ['REPORT_TO_N'];

/** The reserved section prefixes an author may not shadow (§4). */
function isReservedPrefix(name: string): boolean {
  return (
    name.startsWith('ENV_') ||
    name.startsWith('SUMMARY_') ||
    name.startsWith('STD_') ||
    name.startsWith('REPORT_')
  );
}

// ── Suggestions ─────────────────────────────────────────────────────────────

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** §4: "suggesting the closest valid name" where one is close enough to help. */
function suggest(name: string, candidates: string[]): string {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = editDistance(name.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  const threshold = Math.max(2, Math.floor(name.length / 3));
  return best !== null && bestDistance <= threshold ? ` Did you mean '${best}'?` : '';
}

// ── Shared expression walking ───────────────────────────────────────────────

interface ResolutionOptions {
  context: FormulaContextKind;
  template: TemplateShape;
  /** When set, we are inside a custom function body: only these names resolve as values. */
  params?: string[];
  /** Custom function being validated, so self-reference is reported as a cycle not an unknown. */
  ownName?: string;
}

function functionSignatures(template: TemplateShape): Map<string, CustomFunctionSignature> {
  return new Map(template.customFunctions.map((fn) => [fn.name, fn]));
}

/**
 * Steps 2, 3, 4, 6 and 9 for one already-parsed expression.
 */
function resolveExpression(ast: ExpressionNode, options: ResolutionOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { context, template, params } = options;
  const signatures = functionSignatures(template);
  const insideFunctionBody = params !== undefined;

  // A col_* argument is a bare column NAME, not a value reference, and is
  // checked as part of the call below. `walk` would otherwise visit it a
  // second time and wrongly report it as a column used in a summary field.
  const namesHandledAsAggregateArguments = new Set<ExpressionNode>();

  walk(ast, (node) => {
    // ── Calls ───────────────────────────────────────────────────────────
    if (node.type === 'Call') {
      const { callee } = node;
      const position = { line: node.calleePosition.line, column: node.calleePosition.column };

      if (isColumnAggregate(callee)) {
        if (insideFunctionBody) {
          issues.push({
            message: `Column aggregates cannot be used inside a custom function. A custom function's only inputs are its parameters.`,
            ...position,
          });
          return;
        }
        // ADR-017 D4: aggregates are how a block reaches measurement data, so
        // they are legal in summary AND block context. Written as `=== 'row'`
        // (not `!== 'summary' || ...`) so the ROW rule is stated positively and
        // cannot be loosened by a later context being added.
        if (context === 'row') {
          issues.push({
            message: 'Column aggregates can only be used in summary fields and report blocks, not in column formulas.',
            ...position,
          });
          return;
        }
        if (node.args.length !== 1) {
          issues.push({
            message: `${callee} expects 1 argument, got ${node.args.length}.`,
            ...position,
          });
          return;
        }
        const arg = node.args[0];
        if (arg.type !== 'Identifier') {
          issues.push({
            message: `The argument to ${callee} must be a plain column name, not an expression. Write ${callee}(CAL_IND), not ${callee}(CAL_IND * 2).`,
            ...position,
          });
          return;
        }
        namesHandledAsAggregateArguments.add(arg);
        if (!template.columns.includes(arg.name)) {
          issues.push({
            message: `'${arg.name}' is not a column in this template.${suggest(arg.name, template.columns)}`,
            line: arg.position.line,
            column: arg.position.column,
          });
        }
        return;
      }

      if (isBuiltin(callee)) {
        const fn = BUILTIN_FUNCTIONS[callee];
        if (node.args.length < fn.minArgs || (fn.maxArgs !== null && node.args.length > fn.maxArgs)) {
          issues.push({
            message: `${callee} expects ${describeArity(fn)} argument(s), got ${node.args.length}.`,
            ...position,
          });
        }
        return;
      }

      const signature = signatures.get(callee);
      if (!signature) {
        const known = [...Object.keys(BUILTIN_FUNCTIONS), ...signatures.keys()];
        issues.push({
          message: `Unknown function '${callee}'.${suggest(callee, known)}`,
          ...position,
        });
        return;
      }
      if (node.args.length !== signature.params.length) {
        issues.push({
          message: `${callee} expects ${signature.params.length} argument(s), got ${node.args.length}.`,
          ...position,
        });
      }
      return;
    }

    if (node.type !== 'Identifier') return;
    if (namesHandledAsAggregateArguments.has(node)) return;

    // ── Values ──────────────────────────────────────────────────────────
    const { name } = node;
    const position = { line: node.position.line, column: node.position.column };

    // Inside a function body: parameters only (§5).
    if (insideFunctionBody) {
      if (params.includes(name)) return;
      issues.push({
        message: isReservedPrefix(name) || template.columns.includes(name)
          ? `A custom function cannot use '${name}' directly. Pass it in as a parameter instead.`
          : `'${name}' is not a parameter of this function.${suggest(name, params)}`,
        ...position,
      });
      return;
    }

    if (name.startsWith('ENV_')) {
      const match = ENV_PATTERN.exec(name);
      if (!match) {
        issues.push({
          message: `'${name}' is not a valid environment value. Use ENV_TEMP_R{n} or ENV_RH_R{n}.`,
          ...position,
        });
        return;
      }
      const round = Number(match[2]);
      if (round < 1 || round > template.roundCount) {
        issues.push({
          message: `'${name}' refers to round ${round}, but this template has ${template.roundCount} round(s).`,
          ...position,
        });
      }
      return;
    }

    // REPORT_* is record-scoped (ADR-014 D5): the unit the certificate reports
    // in. Valid in BOTH contexts, unlike STD_*, because every row and every
    // summary field of one record reports in the same unit.
    if (name.startsWith('REPORT_')) {
      if (!REPORT_VARIABLES.includes(name)) {
        issues.push({
          message: `'${name}' is not a valid report value.${suggest(name, REPORT_VARIABLES)}`,
          ...position,
        });
      }
      return;
    }

    // STD_* is row-scoped (ADR-013 D4): it resolves from the standard selected
    // in the current row, so it has no meaning in a summary field.
    if (name.startsWith('STD_')) {
      if (!STANDARD_VARIABLES.includes(name)) {
        issues.push({
          message: `'${name}' is not a valid reference standard value.${suggest(name, STANDARD_VARIABLES)}`,
          ...position,
        });
        return;
      }
      if (context !== 'row') {
        // ADR-017 D4 is explicit that STD_* in a block is a VALIDATION ERROR,
        // not a null: a block row is not a calibration point, so there is no
        // standard to resolve against, and silently yielding empty would let
        // a budget quietly compute from nothing.
        issues.push({
          message: context === 'block'
            ? `'${name}' refers to the reference standard of a single calibration point, which a report block row does not have.`
            : `'${name}' refers to the reference standard of a single row, which has no value in a summary field.`,
          ...position,
        });
      }
      return;
    }

    if (name.startsWith('SUMMARY_')) {
      // ADR-017 D4: a block sees SUMMARY_*. ADR-010's hard invariant — a ROW
      // formula may never reference a summary field, because summary fields
      // depend on all rows — is untouched, and is what this `=== 'row'` states.
      if (context === 'row') {
        issues.push({
          message: 'Summary fields can only be used in other summary fields and report blocks, not in column formulas.',
          ...position,
        });
        return;
      }
      const id = name.slice('SUMMARY_'.length);
      if (!template.summaryFieldIds.includes(id)) {
        issues.push({
          message: `'${name}' is not a summary field in this template.${suggest(
            id,
            template.summaryFieldIds,
          )}`,
          ...position,
        });
      }
      return;
    }

    // ADR-017 D4: in block context the block's OWN columns resolve, for its
    // own row — the block's row axis. Checked before the measurement-column
    // lookup below so a block column never falls through to "not a column in
    // this template".
    const blockColumns = template.blockColumns ?? [];
    if (context === 'block' && blockColumns.includes(name)) return;

    // A plain column reference.
    if (!template.columns.includes(name)) {
      const known = [
        ...template.columns,
        ...(context !== 'row' ? template.summaryFieldIds.map((id) => `SUMMARY_${id}`) : []),
        ...(context === 'block' ? blockColumns : []),
      ];
      issues.push({
        message: `'${name}' is not a column in this template.${suggest(name, known)}`,
        ...position,
      });
      return;
    }

    // A MEASUREMENT column named directly outside row context has no single
    // value — one per calibration point — in either summary or block context.
    if (context !== 'row') {
      issues.push({
        message: `'${name}' is a column, which has no single value in ${contextNoun(context)}. Use a column aggregate such as col_mean(${name}).`,
        ...position,
      });
    }
  });

  return issues;
}

function syntaxIssue(error: unknown): ValidationIssue {
  if (error instanceof FormulaSyntaxError) {
    return { message: error.message, line: error.line, column: error.column };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

// ── Public: single expression ───────────────────────────────────────────────

/**
 * Validates one formula-bar expression (a formula column or a summary field).
 * Steps 1, 2, 3, 4 and 6.
 */
export function validateExpression(
  source: string,
  options: { context: FormulaContextKind; template: TemplateShape },
): ExpressionValidationResult {
  let ast: ExpressionNode;
  try {
    ast = parseExpression(source);
  } catch (error) {
    return { issues: [syntaxIssue(error)] };
  }
  return {
    issues: resolveExpression(ast, { context: options.context, template: options.template }),
    ast,
  };
}

// ── Public: custom functions ────────────────────────────────────────────────

export interface CustomFunctionValidationResult {
  issues: ValidationIssue[];
  /** Parsed definitions, in a safe evaluation order. Empty when any issue was found. */
  definitions: FunctionDefinitionNode[];
  /** Function names in dependency order (callees before callers). */
  evaluationOrder: string[];
}

/**
 * Validates the whole set of custom functions for a template: collisions (§4),
 * body isolation (§5, step 9), arity, and the call graph (step 7).
 */
export function validateCustomFunctions(
  sources: string[],
  template: Omit<TemplateShape, 'customFunctions'>,
): CustomFunctionValidationResult {
  const issues: ValidationIssue[] = [];
  const definitions: FunctionDefinitionNode[] = [];

  // ── 1. Parse each definition ──────────────────────────────────────────
  for (const source of sources) {
    try {
      definitions.push(parseFunctionDefinition(source));
    } catch (error) {
      issues.push(syntaxIssue(error));
    }
  }

  // ── 2. Collision rules (§4) ───────────────────────────────────────────
  const seen = new Set<string>();
  for (const def of definitions) {
    const position = { line: def.namePosition.line, column: def.namePosition.column };
    const { name } = def;

    if (isBuiltin(name)) {
      issues.push({ message: `'${name}' is a built-in function name and cannot be reused.`, ...position });
    } else if (isColumnAggregate(name)) {
      issues.push({ message: `'${name}' is a column aggregate name and cannot be reused.`, ...position });
    } else if (template.columns.includes(name)) {
      issues.push({ message: `'${name}' is already a column in this template and cannot be reused as a function name.`, ...position });
    } else if (isReservedPrefix(name)) {
      issues.push({ message: `A custom function name cannot begin with 'ENV_', 'SUMMARY_', 'STD_' or 'REPORT_'.`, ...position });
    } else if (seen.has(name)) {
      issues.push({ message: `A custom function named '${name}' is already defined.`, ...position });
    }
    seen.add(name);

    // Parameter collisions (§4).
    const seenParams = new Set<string>();
    def.params.forEach((param, i) => {
      const paramPosition = {
        line: def.paramPositions[i].line,
        column: def.paramPositions[i].column,
      };
      if (template.columns.includes(param)) {
        issues.push({ message: `Parameter '${param}' is already a column in this template. Choose a different name.`, ...paramPosition });
      } else if (isReservedPrefix(param)) {
        issues.push({ message: `A parameter name cannot begin with 'ENV_', 'SUMMARY_', 'STD_' or 'REPORT_'.`, ...paramPosition });
      } else if (seenParams.has(param)) {
        issues.push({ message: `Parameter '${param}' is listed more than once.`, ...paramPosition });
      }
      seenParams.add(param);
    });
  }

  // ── 3. Body isolation and call resolution (step 9) ────────────────────
  const shape: TemplateShape = {
    ...template,
    customFunctions: definitions.map((def) => ({ name: def.name, params: def.params })),
  };

  for (const def of definitions) {
    issues.push(
      ...resolveExpression(def.body, {
        context: 'row',
        template: shape,
        params: def.params,
        ownName: def.name,
      }),
    );
  }

  // ── 4. Call graph, topologically sorted; cycles rejected (step 7) ─────
  const edges = new Map<string, string[]>();
  for (const def of definitions) {
    const calls: string[] = [];
    walk(def.body, (node) => {
      if (node.type === 'Call' && definitions.some((d) => d.name === node.callee)) {
        calls.push(node.callee);
      }
    });
    edges.set(def.name, calls);
  }

  const sorted = topologicalSort(
    definitions.map((d) => d.name),
    edges,
  );
  if (sorted.cycle) {
    issues.push({
      message: `Custom functions call each other in a loop: ${sorted.cycle.join(' → ')}. Break the loop so each function only uses functions defined before it.`,
    });
  }

  return {
    issues,
    definitions: issues.length === 0 ? definitions : [],
    evaluationOrder: sorted.order,
  };
}

// ── Public: column dependency graph ─────────────────────────────────────────

export interface ColumnFormula {
  /** The column this formula produces, e.g. 'CAL_ERR'. */
  column: string;
  source: string;
}

export interface ColumnGraphValidationResult {
  issues: ValidationIssue[];
  /** Formula columns in dependency order (dependencies before dependents). */
  evaluationOrder: string[];
}

/**
 * Validates every formula column and the dependency graph between them
 * (step 8). A formula column referencing another formula column is legitimate;
 * a cycle is not.
 */
export function validateColumnFormulas(
  formulas: ColumnFormula[],
  template: TemplateShape,
): ColumnGraphValidationResult {
  const issues: ValidationIssue[] = [];
  const edges = new Map<string, string[]>();
  const formulaColumns = new Set(formulas.map((f) => f.column));

  for (const formula of formulas) {
    const result = validateExpression(formula.source, { context: 'row', template });
    issues.push(
      ...result.issues.map((issue) => ({
        ...issue,
        message: `${formula.column}: ${issue.message}`,
      })),
    );

    const dependencies: string[] = [];
    if (result.ast) {
      walk(result.ast, (node) => {
        if (node.type === 'Identifier' && formulaColumns.has(node.name)) {
          dependencies.push(node.name);
        }
      });
    }
    edges.set(formula.column, dependencies);
  }

  const sorted = topologicalSort(
    formulas.map((f) => f.column),
    edges,
  );
  if (sorted.cycle) {
    issues.push({
      message: `Column formulas depend on each other in a loop: ${sorted.cycle.join(' → ')}. Break the loop so each formula only uses values computed before it.`,
    });
  }

  return { issues, evaluationOrder: sorted.order };
}

// ── Topological sort ────────────────────────────────────────────────────────

export interface TopologicalSortResult {
  /** Dependencies first. Partial when a cycle was found. */
  order: string[];
  /** The names forming the first cycle found, closing back on the first entry. */
  cycle: string[] | null;
}

/**
 * Depth-first topological sort. `edges.get(x)` lists what `x` depends on, so
 * dependencies land ahead of dependents in `order`.
 *
 * Shared by the custom-function call graph (step 7) and the column dependency
 * graph (step 8) — the same machinery, as §5 anticipated.
 */
export function topologicalSort(
  nodes: string[],
  edges: Map<string, string[]>,
): TopologicalSortResult {
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  let cycle: string[] | null = null;

  const visit = (node: string): void => {
    if (cycle) return;
    const current = state.get(node);
    if (current === 'done') return;
    if (current === 'visiting') {
      const start = stack.indexOf(node);
      cycle = [...stack.slice(start), node];
      return;
    }

    state.set(node, 'visiting');
    stack.push(node);
    for (const dependency of edges.get(node) ?? []) {
      visit(dependency);
      if (cycle) return;
    }
    stack.pop();
    state.set(node, 'done');
    order.push(node);
  };

  for (const node of nodes) {
    visit(node);
    if (cycle) break;
  }

  return { order, cycle };
}

/** Every name the author may not reuse — useful for authoring-UI autocomplete. */
export const RESERVED_FUNCTION_NAMES = [
  ...Object.keys(BUILTIN_FUNCTIONS),
  ...COLUMN_AGGREGATES,
];
