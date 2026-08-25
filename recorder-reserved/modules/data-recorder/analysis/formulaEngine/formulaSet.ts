/**
 * formulaSet.ts
 *
 * A FormulaSet is an ordered list of named steps, each an editable
 * expression over declared inputs (prior step names + raw variables).
 * Session 1 scope: in-memory only — no Firestore, no versioning (design
 * §2b defers that). `evaluateFormulaSet` runs the steps in their declared
 * order and returns every step's result alongside the raw inputs, so later
 * steps (and callers) can read any prior value by name.
 */

import { parseFormula, FormulaSyntaxError } from './parser';
import { evaluate, FormulaEvaluationError, type Scope } from './evaluator';
import { collectVariables, collectFunctionCalls, type AstNode } from './ast';
import { BUILTIN_FUNCTIONS } from './builtins';

export interface FormulaStep {
  name: string;
  /** Declared inputs this step's expression may reference — enforced at validation time. */
  inputs: string[];
  expression: string;
  /**
   * Optional UI grouping label (e.g. 'Relative Error', 'Uncertainty Budget').
   * Purely presentational — has no effect on validation or evaluation order.
   * Steps without a group render together under a single ungrouped section.
   */
  group?: string;
}

export interface FormulaSet {
  sheetType: string;
  steps: FormulaStep[];
}

export interface FormulaValidationIssue {
  step: string;
  message: string;
}

/**
 * Validate a FormulaSet: every expression must parse, reference only its
 * OWN declared inputs (not other steps' inputs, not undeclared names), and
 * call only known built-in functions. Returns an empty array when valid.
 *
 * This does NOT check that inputs are actually available at evaluation time
 * (e.g. a step referencing a later step by name) — {@link evaluateFormulaSet}
 * catches that as a runtime "unknown variable" error, since detecting
 * forward references requires knowing the full step order, which this
 * function deliberately doesn't assume.
 */
export function validateFormulaSet(set: FormulaSet): FormulaValidationIssue[] {
  const issues: FormulaValidationIssue[] = [];
  const seenNames = new Set<string>();

  for (const step of set.steps) {
    if (seenNames.has(step.name)) {
      issues.push({ step: step.name, message: `Duplicate step name '${step.name}'` });
    }
    seenNames.add(step.name);

    let ast: AstNode;
    try {
      ast = parseFormula(step.expression);
    } catch (err) {
      const message = err instanceof FormulaSyntaxError ? err.message : String(err);
      issues.push({ step: step.name, message });
      continue;
    }

    const declaredInputs = new Set(step.inputs);
    const usedVariables = collectVariables(ast);
    for (const name of usedVariables) {
      if (!declaredInputs.has(name)) {
        issues.push({
          step: step.name,
          message: `References undeclared variable '${name}' (declared inputs: ${step.inputs.join(', ') || 'none'})`,
        });
      }
    }

    const usedFunctions = collectFunctionCalls(ast);
    for (const name of usedFunctions) {
      if (!(name in BUILTIN_FUNCTIONS) && name !== 'IF') {
        issues.push({ step: step.name, message: `Calls unknown function '${name}'` });
      }
    }
  }

  return issues;
}

/**
 * Evaluate every step in `set.steps`, in order, starting from `rawInputs`.
 * Each step's result is added to the scope under its own name before the
 * next step runs, so step N+1 may reference step N's result — this is what
 * gives the fixed evaluation order described in design §1/§5.
 *
 * Throws {@link FormulaSyntaxError} or {@link FormulaEvaluationError} on the
 * first failing step (wrapped with the step's name for context).
 */
export function evaluateFormulaSet(set: FormulaSet, rawInputs: Scope): Record<string, number> {
  const scope: Record<string, number> = { ...rawInputs };

  for (const step of set.steps) {
    let ast: AstNode;
    try {
      ast = parseFormula(step.expression);
    } catch (err) {
      if (err instanceof FormulaSyntaxError) {
        throw new FormulaSyntaxError(`[${step.name}] ${err.message}`, err.pos);
      }
      throw err;
    }
    try {
      scope[step.name] = evaluate(ast, scope);
    } catch (err) {
      if (err instanceof FormulaEvaluationError) {
        throw new FormulaEvaluationError(`[${step.name}] ${err.message}`);
      }
      throw err;
    }
  }

  return scope;
}
