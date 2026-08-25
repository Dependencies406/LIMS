/**
 * ast.ts
 *
 * AST node shapes produced by the parser and consumed by the evaluator.
 * Plain data — no behavior — so the same tree can be validated (which
 * variables/functions it references) without evaluating it.
 */

export type AstNode =
  | { kind: 'number'; value: number }
  | { kind: 'variable'; name: string }
  | { kind: 'unary'; op: '-' | '+'; operand: AstNode }
  | { kind: 'binary'; op: BinaryOp; left: AstNode; right: AstNode }
  | { kind: 'call'; name: string; args: AstNode[] };

export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '<' | '>' | '<=' | '>=' | '=' | '<>';

/** Walk the tree and collect every distinct variable name it references. */
export function collectVariables(node: AstNode, into: Set<string> = new Set()): Set<string> {
  switch (node.kind) {
    case 'variable':
      into.add(node.name);
      break;
    case 'unary':
      collectVariables(node.operand, into);
      break;
    case 'binary':
      collectVariables(node.left, into);
      collectVariables(node.right, into);
      break;
    case 'call':
      node.args.forEach((arg) => collectVariables(arg, into));
      break;
    case 'number':
      break;
  }
  return into;
}

/** Walk the tree and collect every distinct function name it calls. */
export function collectFunctionCalls(node: AstNode, into: Set<string> = new Set()): Set<string> {
  switch (node.kind) {
    case 'call':
      into.add(node.name);
      node.args.forEach((arg) => collectFunctionCalls(arg, into));
      break;
    case 'unary':
      collectFunctionCalls(node.operand, into);
      break;
    case 'binary':
      collectFunctionCalls(node.left, into);
      collectFunctionCalls(node.right, into);
      break;
    case 'variable':
    case 'number':
      break;
  }
  return into;
}
