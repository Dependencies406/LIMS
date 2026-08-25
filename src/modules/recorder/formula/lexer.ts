/**
 * lexer.ts
 *
 * Turns formula source text into a flat token list. Implements the terminal
 * productions of docs/FORMULA_GRAMMAR.md §2 — `identifier`, `number`,
 * `string` — plus the operators, keywords, and the NEWLINE/INDENT tokens the
 * `funcdef` production needs.
 *
 * Several of §2's "deliberate restrictions" are detected here rather than in
 * the parser, because they are lexical: `//`, `%`, and backslash-escaped quotes
 * inside strings. Each raises the exact message the specification requires.
 *
 * No eval, no new Function, no dynamic code construction anywhere — the entire
 * security argument of ADR-001 rests on that.
 */

import type { Position } from './ast';
import { FormulaSyntaxError } from './errors';

export type TokenType =
  | 'number'
  | 'string'
  | 'identifier'
  | 'keyword'
  | 'operator'
  | 'punctuation'
  | 'newline'
  | 'indent'
  | 'eof';

export interface Token {
  type: TokenType;
  /** Source text of the token; for strings, the decoded contents. */
  value: string;
  /** Numeric value, present only on `number` tokens. */
  numberValue?: number;
  position: Position;
}

/**
 * Words the grammar gives meaning to. Everything else that matches
 * `identifier` stays an identifier and is resolved later by §4.
 */
export const KEYWORDS = ['if', 'else', 'and', 'or', 'not', 'def', 'return'] as const;

const KEYWORD_SET = new Set<string>(KEYWORDS);

/** Longest-first, so `**` beats `*` and `<=` beats `<`. */
const OPERATORS = ['**', '==', '!=', '<=', '>=', '+', '-', '*', '/', '<', '>'];

const PUNCTUATION = ['(', ')', ',', ':'];

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentifierStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch);
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let lineStart = 0;
  /** True while we are still at the very start of a line (leading whitespace). */
  let atLineStart = true;

  const positionAt = (i: number): Position => ({ line, column: i - lineStart + 1 });

  const push = (type: TokenType, value: string, position: Position, numberValue?: number) => {
    const token: Token = { type, value, position };
    if (numberValue !== undefined) token.numberValue = numberValue;
    tokens.push(token);
  };

  while (index < source.length) {
    const ch = source[index];

    // ── Line breaks ─────────────────────────────────────────────────────
    if (ch === '\n') {
      push('newline', '\n', positionAt(index));
      index += 1;
      line += 1;
      lineStart = index;
      atLineStart = true;
      continue;
    }

    if (ch === '\r') {
      index += 1;
      continue;
    }

    // ── Whitespace ──────────────────────────────────────────────────────
    if (ch === ' ' || ch === '\t') {
      const start = index;
      while (index < source.length && (source[index] === ' ' || source[index] === '\t')) {
        index += 1;
      }
      // Leading whitespace on a line that has real content is the INDENT the
      // `funcdef` production requires before `return`.
      if (atLineStart && index < source.length && source[index] !== '\n' && source[index] !== '\r') {
        push('indent', source.slice(start, index), positionAt(start));
      }
      atLineStart = false;
      continue;
    }

    atLineStart = false;

    // ── Comments (`#` to end of line) ───────────────────────────────────
    if (ch === '#') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }

    // ── Strings ─────────────────────────────────────────────────────────
    if (ch === '"') {
      const startPosition = positionAt(index);
      index += 1;
      let value = '';
      let closed = false;
      while (index < source.length) {
        const c = source[index];
        if (c === '\\' && source[index + 1] === '"') {
          // §2: no escape sequences. The grammar's `string` production is
          // "any character except the closing quote", so an escaped quote is
          // simply not expressible.
          throw new FormulaSyntaxError(
            'Quotes cannot be used inside text. Use different wording.',
            positionAt(index),
          );
        }
        if (c === '"') {
          closed = true;
          index += 1;
          break;
        }
        if (c === '\n') break;
        value += c;
        index += 1;
      }
      if (!closed) {
        throw new FormulaSyntaxError('Unterminated text value — a closing quote is missing.', startPosition);
      }
      push('string', value, startPosition);
      continue;
    }

    // ── Numbers, including scientific notation ──────────────────────────
    if (isDigit(ch)) {
      const start = index;
      const startPosition = positionAt(index);
      while (index < source.length && isDigit(source[index])) index += 1;

      if (source[index] === '.' && isDigit(source[index + 1])) {
        index += 1;
        while (index < source.length && isDigit(source[index])) index += 1;
      }

      // Exponent, but only when it really is one: `1e-3` yes, `1 else` no.
      if (source[index] === 'e' || source[index] === 'E') {
        const sign = source[index + 1];
        const afterSign = sign === '+' || sign === '-' ? source[index + 2] : sign;
        if (afterSign !== undefined && isDigit(afterSign)) {
          index += sign === '+' || sign === '-' ? 2 : 1;
          while (index < source.length && isDigit(source[index])) index += 1;
        }
      }

      const text = source.slice(start, index);
      push('number', text, startPosition, Number(text));
      continue;
    }

    // ── Identifiers and keywords ────────────────────────────────────────
    if (isIdentifierStart(ch)) {
      const start = index;
      const startPosition = positionAt(index);
      while (index < source.length && isIdentifierPart(source[index])) index += 1;
      const text = source.slice(start, index);
      push(KEYWORD_SET.has(text) ? 'keyword' : 'identifier', text, startPosition);
      continue;
    }

    // ── Explicitly unsupported operators, with the required messages ────
    if (ch === '/' && source[index + 1] === '/') {
      throw new FormulaSyntaxError('`//` is not supported. Use `/`.', positionAt(index));
    }

    if (ch === '%') {
      throw new FormulaSyntaxError('`%` is not supported.', positionAt(index));
    }

    // ── Operators ───────────────────────────────────────────────────────
    const operator = OPERATORS.find((op) => source.startsWith(op, index));
    if (operator) {
      push('operator', operator, positionAt(index));
      index += operator.length;
      continue;
    }

    // ── Punctuation ─────────────────────────────────────────────────────
    if (PUNCTUATION.includes(ch)) {
      push('punctuation', ch, positionAt(index));
      index += 1;
      continue;
    }

    throw new FormulaSyntaxError(`Unexpected character '${ch}'.`, positionAt(index));
  }

  push('eof', '', positionAt(index));
  return tokens;
}
