/**
 * evaluator.ts
 *
 * Evaluates a parsed AST (ast.ts) against a variable scope. Comparison
 * operators return 1/0 (truthy/falsy for IF), matching how spreadsheet
 * formula languages treat booleans as numbers.
 *
 * Division by zero and other non-finite results THROW rather than silently
 * producing Infinity/NaN — the workbook's own IFERROR-wrapped divisions
 * (design §2 "IFERROR-to-0" semantics) must be expressed explicitly with
 * IF(denominator = 0, 0, numerator / denominator) in this language; silently
 * swallowing a divide-by-zero here would hide a real authoring mistake in
 * formulas that DON'T intend that guard.
 */

import type { AstNode } from './ast';
import { callBuiltin } from './builtins';

export class FormulaEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaEvaluationError';
  }
}

export type Scope = Readonly<Record<string, number>>;

function requireFinite(value: number, context: string): number {
  if (!Number.isFinite(value)) {
    throw new FormulaEvaluationError(`${context} produced a non-finite result (${value})`);
  }
  return value;
}

export function evaluate(node: AstNode, scope: Scope): number {
  switch (node.kind) {
    case 'number':
      return node.value;

    case 'variable': {
      const value = scope[node.name];
      if (value === undefined) {
        throw new FormulaEvaluationError(`Unknown variable '${node.name}'`);
      }
      return value;
    }

    case 'unary': {
      const operand = evaluate(node.operand, scope);
      return node.op === '-' ? -operand : operand;
    }

    case 'binary': {
      const left = evaluate(node.left, scope);
      const right = evaluate(node.right, scope);
      switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/':
          if (right === 0) throw new FormulaEvaluationError('Division by zero');
          return left / right;
        case '^':
          return requireFinite(left ** right, `${left} ^ ${right}`);
        case '=': return left === right ? 1 : 0;
        case '<>': return left !== right ? 1 : 0;
        case '<': return left < right ? 1 : 0;
        case '>': return left > right ? 1 : 0;
        case '<=': return left <= right ? 1 : 0;
        case '>=': return left >= right ? 1 : 0;
        default:
          // Unreachable: BinaryOp's members are all handled above (TS narrows
          // `node` itself to `never` here, so no further property access is safe).
          throw new FormulaEvaluationError('Unknown operator');
      }
    }

    case 'call': {
      // IF short-circuits so only the taken branch needs to be well-defined
      // (e.g. IF(x = 0, 0, 1 / x) must not evaluate 1/x when x = 0).
      if (node.name === 'IF') {
        if (node.args.length !== 3) {
          throw new FormulaEvaluationError('IF expects 3 arguments');
        }
        const condition = evaluate(node.args[0], scope);
        return condition !== 0 ? evaluate(node.args[1], scope) : evaluate(node.args[2], scope);
      }
      const args = node.args.map((arg) => evaluate(arg, scope));
      return callBuiltin(node.name, args);
    }

    default: {
      const exhaustive: never = node;
      throw new FormulaEvaluationError(`Unknown node kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
