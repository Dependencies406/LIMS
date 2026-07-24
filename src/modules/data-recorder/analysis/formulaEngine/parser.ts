/**
 * parser.ts
 *
 * Recursive-descent parser producing the AST (ast.ts) from tokens (lexer.ts).
 * Precedence, low to high: comparison (=,<>,<,>,<=,>=) < additive (+,-) <
 * multiplicative (*,/) < unary (-,+) < power (^, right-associative) < atom.
 * This mirrors ordinary spreadsheet/math precedence, including `^` binding
 * tighter than unary minus so `-2^2` parses as `-(2^2)` = -4, matching Excel.
 */

import { tokenize, FormulaSyntaxError, type Token } from './lexer';
import type { AstNode, BinaryOp } from './ast';

const COMPARISON_OPS = new Set(['=', '<>', '<', '>', '<=', '>=']);

class Parser {
  private tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private advance(): Token {
    const t = this.tokens[this.index];
    this.index += 1;
    return t;
  }

  private expect(type: Token['type'], display: string): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new FormulaSyntaxError(`Expected ${display}, got '${t.value || t.type}'`, t.pos);
    }
    return this.advance();
  }

  parseExpression(): AstNode {
    const node = this.parseComparison();
    if (this.peek().type !== 'eof') {
      const t = this.peek();
      throw new FormulaSyntaxError(`Unexpected token '${t.value}'`, t.pos);
    }
    return node;
  }

  private parseComparison(): AstNode {
    let left = this.parseAdditive();
    while (this.peek().type === 'operator' && COMPARISON_OPS.has(this.peek().value)) {
      const op = this.advance().value as BinaryOp;
      const right = this.parseAdditive();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseAdditive(): AstNode {
    let left = this.parseMultiplicative();
    while (this.peek().type === 'operator' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.advance().value as BinaryOp;
      const right = this.parseMultiplicative();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): AstNode {
    let left = this.parseUnary();
    while (this.peek().type === 'operator' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.advance().value as BinaryOp;
      const right = this.parseUnary();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseUnary(): AstNode {
    if (this.peek().type === 'operator' && (this.peek().value === '-' || this.peek().value === '+')) {
      const op = this.advance().value as '-' | '+';
      const operand = this.parseUnary();
      return { kind: 'unary', op, operand };
    }
    return this.parsePower();
  }

  private parsePower(): AstNode {
    const base = this.parseAtom();
    if (this.peek().type === 'operator' && this.peek().value === '^') {
      this.advance();
      const exponent = this.parseUnary(); // right-associative, allows 2^-1
      return { kind: 'binary', op: '^', left: base, right: exponent };
    }
    return base;
  }

  private parseAtom(): AstNode {
    const t = this.peek();

    if (t.type === 'number') {
      this.advance();
      return { kind: 'number', value: Number(t.value) };
    }

    if (t.type === 'lparen') {
      this.advance();
      const inner = this.parseComparison();
      this.expect('rparen', "')'");
      return inner;
    }

    if (t.type === 'identifier') {
      this.advance();
      if (this.peek().type === 'lparen') {
        this.advance();
        const args: AstNode[] = [];
        if (this.peek().type !== 'rparen') {
          args.push(this.parseComparison());
          while (this.peek().type === 'comma') {
            this.advance();
            args.push(this.parseComparison());
          }
        }
        this.expect('rparen', "')'");
        return { kind: 'call', name: t.value.toUpperCase(), args };
      }
      return { kind: 'variable', name: t.value };
    }

    throw new FormulaSyntaxError(`Unexpected token '${t.value || t.type}'`, t.pos);
  }
}

/** Parse a formula expression string into an AST. Throws {@link FormulaSyntaxError}. */
export function parseFormula(source: string): AstNode {
  const tokens = tokenize(source);
  return new Parser(tokens).parseExpression();
}

export { FormulaSyntaxError } from './lexer';
