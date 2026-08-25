/**
 * lexer.ts
 *
 * Tokenizer for the formula engine's expression language (design
 * docs/FORMULA_ENGINE_DESIGN.md §2). Grammar surface is deliberately small:
 * numbers, identifiers (variables/function names), the four arithmetic
 * operators, `^`, comparison operators (for IF), commas, and parens.
 *
 * No cell references, no string literals, no assignment — this is not a
 * general spreadsheet language, it computes one numeric expression from a
 * fixed set of named inputs.
 */

export type TokenType =
  | 'number'
  | 'identifier'
  | 'operator'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  /** 1-based column, for error messages. */
  pos: number;
}

const OPERATORS = ['+', '-', '*', '/', '^', '<=', '>=', '<>', '<', '>', '='] as const;

export class FormulaSyntaxError extends Error {
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(`${message} (at position ${pos})`);
    this.name = 'FormulaSyntaxError';
    this.pos = pos;
  }
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

/** Tokenize a formula expression. Throws {@link FormulaSyntaxError} on invalid input. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    const pos = i + 1;

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'lparen', value: ch, pos }); i += 1; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ch, pos }); i += 1; continue; }
    if (ch === ',') { tokens.push({ type: 'comma', value: ch, pos }); i += 1; continue; }

    if (isDigit(ch) || (ch === '.' && isDigit(source[i + 1] ?? ''))) {
      let j = i;
      let sawDot = false;
      while (j < n && (isDigit(source[j]) || (source[j] === '.' && !sawDot))) {
        if (source[j] === '.') sawDot = true;
        j += 1;
      }
      // optional exponent: 1e10, 1.5E-3
      if (j < n && (source[j] === 'e' || source[j] === 'E')) {
        let k = j + 1;
        if (source[k] === '+' || source[k] === '-') k += 1;
        if (isDigit(source[k] ?? '')) {
          j = k;
          while (j < n && isDigit(source[j])) j += 1;
        }
      }
      const text = source.slice(i, j);
      tokens.push({ type: 'number', value: text, pos });
      i = j;
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < n && isIdentChar(source[j])) j += 1;
      tokens.push({ type: 'identifier', value: source.slice(i, j), pos });
      i = j;
      continue;
    }

    // two-character operators first
    const two = source.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      tokens.push({ type: 'operator', value: two, pos });
      i += 2;
      continue;
    }

    if ((OPERATORS as readonly string[]).includes(ch)) {
      tokens.push({ type: 'operator', value: ch, pos });
      i += 1;
      continue;
    }

    throw new FormulaSyntaxError(`Unexpected character '${ch}'`, pos);
  }

  tokens.push({ type: 'eof', value: '', pos: n + 1 });
  return tokens;
}
