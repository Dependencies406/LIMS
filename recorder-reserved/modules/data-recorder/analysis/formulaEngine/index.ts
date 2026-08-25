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

// ─── Session 2: seed generation + wiring (design §8, amended §2b) ────────────
// NOT wired into analysis/index.ts or AnalysisResultsSection.tsx this
// session — see the module docs on seedFormulaSet.ts and engineAdapter.ts.

export {
  FORCE_ISO7500_1_SHEET_TYPE,
  FORCE_ISO7500_1_FORMULA_SET,
  RELATIVE_ERROR_STEP_NAMES,
  UNCERTAINTY_BUDGET_STEP_NAMES,
  generateSeedFormulaSet,
} from './seedFormulaSet';

export { computeForceIso75001ViaFormulaSet } from './engineAdapter';
export type {
  EngineForceIso75001Point,
  EngineForceIso75001Options,
  EngineRelativeErrorPoint,
  EngineUncertaintyBudgetPoint,
} from './engineAdapter';

// ─── Session 3: admin editor preview dataset ─────────────────────────────────

export {
  PREVIEW_RELATIVE_ERROR_INPUT,
  PREVIEW_UNCERTAINTY_PARAMS,
  PREVIEW_CMC_STEPS,
  PREVIEW_READING_UNIT,
  PREVIEW_SOURCE_LABEL,
} from './previewData';
