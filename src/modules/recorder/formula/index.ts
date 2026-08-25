/**
 * The Expression Interpreter (ADR-001), implementing the language specified in
 * docs/FORMULA_GRAMMAR.md.
 *
 * Pure logic — no UI, no Firestore, no side effects. Parse, validate, evaluate.
 *
 * Security note: nothing in this module calls eval(), new Function(), or
 * constructs code dynamically. Expressions are parsed to an AST and interpreted
 * by an explicit switch. That is the whole security argument of ADR-001 —
 * template documents are user-writable, so a formula must never be able to do
 * anything except arithmetic.
 */

export type {
  BinaryOperator,
  CallNode,
  ComparisonNode,
  ComparisonOperator,
  ExpressionNode,
  FunctionDefinitionNode,
  IdentifierNode,
  LogicalNode,
  LogicalOperator,
  NotNode,
  NumberLiteralNode,
  Position,
  StringLiteralNode,
  TernaryNode,
  UnaryMinusNode,
} from './ast';
export { walk } from './ast';

export type { FormulaErrorKind } from './errors';
export { FormulaEvaluationError, FormulaSyntaxError } from './errors';

export type { Token, TokenType } from './lexer';
export { KEYWORDS, tokenize } from './lexer';

export { parseExpression, parseFunctionDefinition } from './parser';

export type { BuiltinFunction, ColumnAggregateName } from './builtins';
export {
  BUILTIN_FUNCTIONS,
  COLUMN_AGGREGATES,
  callBuiltin,
  describeArity,
  isBuiltin,
  isColumnAggregate,
} from './builtins';

export {
  roundHalfAwayFromZero,
  sampleStandardDeviation,
  shiftDecimal,
  truncateToDecimals,
} from './numeric';
export { incompleteBeta, logGamma, studentTTwoTailedP, tinv } from './studentT';

export type {
  CellValue,
  CustomFunctionBinding,
  EvaluationContext,
  FormulaValue,
  RowEvaluationContext,
  SummaryEvaluationContext,
} from './evaluator';
export { MAX_CALL_DEPTH, evaluate } from './evaluator';

export type {
  ColumnFormula,
  ColumnGraphValidationResult,
  CustomFunctionSignature,
  CustomFunctionValidationResult,
  ExpressionValidationResult,
  FormulaContextKind,
  TemplateShape,
  TopologicalSortResult,
  ValidationIssue,
} from './validator';
export {
  RESERVED_FUNCTION_NAMES,
  REPORT_VARIABLES,
  topologicalSort,
  validateColumnFormulas,
  validateCustomFunctions,
  validateExpression,
} from './validator';

export type { Bilingual, BuiltinDoc } from './builtinDocs';
export { AGGREGATE_DOCS, BUILTIN_DOCS } from './builtinDocs';
