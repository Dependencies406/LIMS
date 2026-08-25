/**
 * parser.ts
 *
 * Recursive-descent parser implementing docs/FORMULA_GRAMMAR.md §2 exactly.
 * One function per production, in the same order, so the code can be read
 * side-by-side with the specification.
 *
 * The precedence chain is what produces the two consequences §2 requires:
 *   -2 ** 2   === -4    because `unary` sits ABOVE `power`, so the minus
 *                       applies to the result of the exponentiation
 *   2 ** 3 ** 2 === 512 because `power` recurses into `unary` on its right,
 *                       making `**` right-associative
 *
 * Produces an AST only. Nothing here executes anything.
 */

import type {
  BinaryOperator,
  ComparisonOperator,
  ExpressionNode,
  FunctionDefinitionNode,
  Position,
} from './ast';
import { FormulaSyntaxError } from './errors';
import { tokenize, type Token } from './lexer';

const COMPARISON_OPERATORS: ComparisonOperator[] = ['==', '!=', '<', '<=', '>', '>='];

class Parser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    if (token.type !== 'eof') this.index += 1;
    return token;
  }

  private at(type: Token['type'], value?: string): boolean {
    const token = this.peek();
    return token.type === type && (value === undefined || token.value === value);
  }

  private accept(type: Token['type'], value?: string): Token | null {
    if (this.at(type, value)) return this.next();
    return null;
  }

  private expect(type: Token['type'], value?: string): Token {
    if (this.at(type, value)) return this.next();
    const token = this.peek();
    const wanted = value !== undefined ? `'${value}'` : type;
    const found = token.type === 'eof' ? 'end of formula' : `'${token.value}'`;
    throw new FormulaSyntaxError(`Expected ${wanted} but found ${found}.`, token.position);
  }

  /** Skips NEWLINE / INDENT tokens, which carry no meaning inside an expression. */
  private skipLayout(): void {
    while (this.at('newline') || this.at('indent')) this.next();
  }

  // ── expression = ternary ────────────────────────────────────────────────
  parseExpression(): ExpressionNode {
    return this.parseTernary();
  }

  // ── ternary = or_expr , [ "if" , or_expr , "else" , expression ] ────────
  private parseTernary(): ExpressionNode {
    const whenTrue = this.parseOr();
    if (!this.at('keyword', 'if')) return whenTrue;

    this.next(); // 'if'
    const condition = this.parseOr();
    this.expect('keyword', 'else');
    const whenFalse = this.parseExpression();
    return { type: 'Ternary', whenTrue, condition, whenFalse, position: whenTrue.position };
  }

  // ── or_expr = and_expr , { "or" , and_expr } ────────────────────────────
  private parseOr(): ExpressionNode {
    let left = this.parseAnd();
    while (this.at('keyword', 'or')) {
      this.next();
      const right = this.parseAnd();
      left = { type: 'Logical', operator: 'or', left, right, position: left.position };
    }
    return left;
  }

  // ── and_expr = not_expr , { "and" , not_expr } ──────────────────────────
  private parseAnd(): ExpressionNode {
    let left = this.parseNot();
    while (this.at('keyword', 'and')) {
      this.next();
      const right = this.parseNot();
      left = { type: 'Logical', operator: 'and', left, right, position: left.position };
    }
    return left;
  }

  // ── not_expr = [ "not" ] , comparison ───────────────────────────────────
  private parseNot(): ExpressionNode {
    const notToken = this.accept('keyword', 'not');
    if (!notToken) return this.parseComparison();

    // The production allows at most one `not`; a second is a distinct,
    // named restriction rather than a generic parse failure.
    if (this.at('keyword', 'not')) {
      throw new FormulaSyntaxError('Repeated `not` is not supported.', this.peek().position);
    }

    const operand = this.parseComparison();
    return { type: 'Not', operand, position: notToken.position };
  }

  // ── comparison = additive , [ comp_op , additive ] ──────────────────────
  private parseComparison(): ExpressionNode {
    const left = this.parseAdditive();
    if (!this.atComparisonOperator()) return left;

    const operator = this.next().value as ComparisonOperator;
    const right = this.parseAdditive();

    // Exactly one comparison. Python allows chaining, but its semantics there
    // are subtle; §2 excludes it in favour of a precise message.
    if (this.atComparisonOperator()) {
      throw new FormulaSyntaxError(
        'Chained comparisons are not supported. Write `0 < x and x < 10` instead.',
        this.peek().position,
      );
    }

    return { type: 'Comparison', operator, left, right, position: left.position };
  }

  private atComparisonOperator(): boolean {
    const token = this.peek();
    return token.type === 'operator' && COMPARISON_OPERATORS.includes(token.value as ComparisonOperator);
  }

  // ── additive = multiplicative , { ( "+" | "-" ) , multiplicative } ──────
  private parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative();
    while (this.at('operator', '+') || this.at('operator', '-')) {
      const operator = this.next().value as BinaryOperator;
      const right = this.parseMultiplicative();
      left = { type: 'Binary', operator, left, right, position: left.position };
    }
    return left;
  }

  // ── multiplicative = unary , { ( "*" | "/" ) , unary } ──────────────────
  private parseMultiplicative(): ExpressionNode {
    let left = this.parseUnary();
    while (this.at('operator', '*') || this.at('operator', '/')) {
      const operator = this.next().value as BinaryOperator;
      const right = this.parseUnary();
      left = { type: 'Binary', operator, left, right, position: left.position };
    }
    return left;
  }

  // ── unary = [ "-" ] , power ─────────────────────────────────────────────
  private parseUnary(): ExpressionNode {
    const minus = this.accept('operator', '-');
    if (!minus) return this.parsePower();
    const operand = this.parsePower();
    return { type: 'UnaryMinus', operand, position: minus.position };
  }

  // ── power = primary , [ "**" , unary ] ──────────────────────────────────
  private parsePower(): ExpressionNode {
    const base = this.parsePrimary();
    if (!this.at('operator', '**')) return base;
    this.next();
    // Recursing into `unary` (not `power`) is what makes ** right-associative
    // and lets `2 ** -1` parse.
    const exponent = this.parseUnary();
    return { type: 'Binary', operator: '**', left: base, right: exponent, position: base.position };
  }

  // ── primary = number | string | identifier [ "(" [arg_list] ")" ]
  //           | "(" expression ")" ─────────────────────────────────────────
  private parsePrimary(): ExpressionNode {
    const token = this.peek();

    if (token.type === 'number') {
      this.next();
      return { type: 'NumberLiteral', value: token.numberValue ?? Number(token.value), position: token.position };
    }

    if (token.type === 'string') {
      this.next();
      return { type: 'StringLiteral', value: token.value, position: token.position };
    }

    if (token.type === 'identifier') {
      this.next();
      if (this.at('punctuation', '(')) {
        this.next();
        const args = this.parseArgumentList();
        this.expect('punctuation', ')');
        return {
          type: 'Call',
          callee: token.value,
          args,
          position: token.position,
          calleePosition: token.position,
        };
      }
      return { type: 'Identifier', name: token.value, position: token.position };
    }

    if (token.type === 'punctuation' && token.value === '(') {
      this.next();
      const inner = this.parseExpression();
      this.expect('punctuation', ')');
      return inner;
    }

    const found = token.type === 'eof' ? 'end of formula' : `'${token.value}'`;
    throw new FormulaSyntaxError(`Expected a value but found ${found}.`, token.position);
  }

  // ── arg_list = expression , { "," , expression } ────────────────────────
  private parseArgumentList(): ExpressionNode[] {
    if (this.at('punctuation', ')')) return [];
    const args: ExpressionNode[] = [this.parseExpression()];
    while (this.accept('punctuation', ',')) {
      args.push(this.parseExpression());
    }
    return args;
  }

  // ── funcdef = "def" identifier "(" [param_list] ")" ":" NEWLINE
  //             INDENT "return" expression ────────────────────────────────
  parseFunctionDefinition(): FunctionDefinitionNode {
    this.skipLayout();
    const defToken = this.expect('keyword', 'def');
    const nameToken = this.expect('identifier');

    this.expect('punctuation', '(');
    const params: string[] = [];
    const paramPositions: Position[] = [];
    if (!this.at('punctuation', ')')) {
      do {
        const param = this.expect('identifier');
        params.push(param.value);
        paramPositions.push(param.position);
      } while (this.accept('punctuation', ','));
    }
    this.expect('punctuation', ')');
    this.expect('punctuation', ':');

    this.expect('newline');
    this.skipLayout();
    this.expect('keyword', 'return');

    const body = this.parseExpression();

    this.skipLayout();
    if (!this.at('eof')) {
      const token = this.peek();
      throw new FormulaSyntaxError(
        `A custom function must contain exactly one \`return\` of one expression. Found '${token.value}' after it.`,
        token.position,
      );
    }

    return {
      type: 'FunctionDefinition',
      name: nameToken.value,
      namePosition: nameToken.position,
      params,
      paramPositions,
      body,
      position: defToken.position,
    };
  }

  expectEndOfInput(): void {
    this.skipLayout();
    if (!this.at('eof')) {
      const token = this.peek();
      throw new FormulaSyntaxError(`Unexpected '${token.value}' after the end of the formula.`, token.position);
    }
  }
}

/** Parses a single formula-bar expression. Throws FormulaSyntaxError. */
export function parseExpression(source: string): ExpressionNode {
  const parser = new Parser(tokenize(source));
  const node = parser.parseExpression();
  parser.expectEndOfInput();
  return node;
}

/** Parses one `def name(params): return <expression>` block. Throws FormulaSyntaxError. */
export function parseFunctionDefinition(source: string): FunctionDefinitionNode {
  return new Parser(tokenize(source)).parseFunctionDefinition();
}
