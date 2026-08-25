/**
 * errors.ts
 *
 * The two error families of the formula language.
 *
 * `FormulaSyntaxError` — the source could not be parsed. Carries line/column so
 * the verifier can report position-accurate errors (§7.1).
 *
 * `FormulaEvaluationError` — the expression parsed and validated, but produced
 * no value. Carries a `kind` because §6 requires the UI to style the two cases
 * very differently: during recording most formulas sit in `awaiting-input` for
 * most of the session, and rendering that as prominently as a genuine mistake
 * would produce a wall of red and train technicians to ignore error styling.
 */

import type { Position } from './ast';

/**
 * `awaiting-input` — a value this expression depends on has not been entered
 *   yet. Expected and transient; the UI should render it quietly.
 * `invalid-computation` — division by zero, a domain error, a type mismatch.
 *   A real mistake; the UI should render it prominently.
 */
export type FormulaErrorKind = 'awaiting-input' | 'invalid-computation';

export class FormulaSyntaxError extends Error {
  readonly line: number;
  readonly column: number;

  constructor(message: string, position: Position) {
    super(message);
    this.name = 'FormulaSyntaxError';
    this.line = position.line;
    this.column = position.column;
  }
}

export class FormulaEvaluationError extends Error {
  readonly kind: FormulaErrorKind;

  constructor(kind: FormulaErrorKind, message: string) {
    super(message);
    this.name = 'FormulaEvaluationError';
    this.kind = kind;
  }
}

/** Shorthand for the common "a required input is not filled in yet" case. */
export function awaitingInput(message: string): FormulaEvaluationError {
  return new FormulaEvaluationError('awaiting-input', message);
}

/** Shorthand for a genuine computation fault. */
export function invalidComputation(message: string): FormulaEvaluationError {
  return new FormulaEvaluationError('invalid-computation', message);
}
