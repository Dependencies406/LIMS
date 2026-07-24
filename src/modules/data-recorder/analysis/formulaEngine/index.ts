/**
 * Public API of the formula engine (design docs/FORMULA_ENGINE_DESIGN.md).
 *
 * Session 1 scope: pure parser/evaluator + built-in function library +
 * FormulaSet validation/evaluation. No Firestore, no versioning, no UI —
 * those land in later sessions per the design's execution plan.
 */

export { tokenize, FormulaSyntaxError } from './lexer';
export type { Token, TokenType } from './lexer';

export { parseFormula } from './parser';
export type { AstNode, BinaryOp } from './ast';
export { collectVariables, collectFunctionCalls } from './ast';

export { evaluate, FormulaEvaluationError } from './evaluator';
export type { Scope } from './evaluator';

export { BUILTIN_FUNCTIONS, callBuiltin } from './builtins';
export type { BuiltinFunction } from './builtins';

export { validateFormulaSet, evaluateFormulaSet } from './formulaSet';
export type { FormulaStep, FormulaSet, FormulaValidationIssue } from './formulaSet';
