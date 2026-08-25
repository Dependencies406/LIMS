/**
 * ast.ts
 *
 * Abstract syntax tree for the formula language specified in
 * docs/FORMULA_GRAMMAR.md. One node type per production in §2.
 *
 * Every node carries the source position of its leading token so the verifier
 * (§7.1) can report syntax and resolution errors with line and column.
 *
 * Types only — no behaviour, no dependencies.
 */

export interface Position {
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
}

/** `+ - * / **` — the arithmetic operators of §2 `additive`/`multiplicative`/`power`. */
export type BinaryOperator = '+' | '-' | '*' | '/' | '**';

/** §2 `comp_op`. */
export type ComparisonOperator = '==' | '!=' | '<' | '<=' | '>' | '>=';

export type LogicalOperator = 'and' | 'or';

export interface NumberLiteralNode {
  type: 'NumberLiteral';
  value: number;
  position: Position;
}

export interface StringLiteralNode {
  type: 'StringLiteral';
  value: string;
  position: Position;
}

/**
 * A bare name. The grammar deliberately does not distinguish column references,
 * ENV_*, SUMMARY_*, or function parameters — §4 assigns meaning afterwards in
 * the validator. This is what lets ENV_TEMP_R1 work with no grammar change
 * (ADR-009).
 */
export interface IdentifierNode {
  type: 'Identifier';
  name: string;
  position: Position;
}

export interface UnaryMinusNode {
  type: 'UnaryMinus';
  operand: ExpressionNode;
  position: Position;
}

export interface NotNode {
  type: 'Not';
  operand: ExpressionNode;
  position: Position;
}

export interface BinaryNode {
  type: 'Binary';
  operator: BinaryOperator;
  left: ExpressionNode;
  right: ExpressionNode;
  position: Position;
}

export interface ComparisonNode {
  type: 'Comparison';
  operator: ComparisonOperator;
  left: ExpressionNode;
  right: ExpressionNode;
  position: Position;
}

export interface LogicalNode {
  type: 'Logical';
  operator: LogicalOperator;
  left: ExpressionNode;
  right: ExpressionNode;
  position: Position;
}

/** `whenTrue if condition else whenFalse` — source order, not evaluation order. */
export interface TernaryNode {
  type: 'Ternary';
  whenTrue: ExpressionNode;
  condition: ExpressionNode;
  whenFalse: ExpressionNode;
  position: Position;
}

export interface CallNode {
  type: 'Call';
  callee: string;
  args: ExpressionNode[];
  position: Position;
  /** Position of the callee name itself, for "unknown function" errors. */
  calleePosition: Position;
}

export type ExpressionNode =
  | NumberLiteralNode
  | StringLiteralNode
  | IdentifierNode
  | UnaryMinusNode
  | NotNode
  | BinaryNode
  | ComparisonNode
  | LogicalNode
  | TernaryNode
  | CallNode;

/** §2 `funcdef` — exactly one `return` of exactly one expression (§5). */
export interface FunctionDefinitionNode {
  type: 'FunctionDefinition';
  name: string;
  namePosition: Position;
  params: string[];
  paramPositions: Position[];
  body: ExpressionNode;
  position: Position;
}

/**
 * Walks every node in an expression tree, parents before children.
 * Used by the validator to collect identifiers and calls.
 */
export function walk(node: ExpressionNode, visit: (node: ExpressionNode) => void): void {
  visit(node);
  switch (node.type) {
    case 'NumberLiteral':
    case 'StringLiteral':
    case 'Identifier':
      return;
    case 'UnaryMinus':
    case 'Not':
      walk(node.operand, visit);
      return;
    case 'Binary':
    case 'Comparison':
    case 'Logical':
      walk(node.left, visit);
      walk(node.right, visit);
      return;
    case 'Ternary':
      walk(node.whenTrue, visit);
      walk(node.condition, visit);
      walk(node.whenFalse, visit);
      return;
    case 'Call':
      node.args.forEach((arg) => walk(arg, visit));
      return;
  }
}
