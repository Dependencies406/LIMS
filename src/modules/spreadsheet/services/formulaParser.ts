/**
 * Formula Parser
 * Pure parser for Excel-like formulas
 * 
 * This module provides tokenization, parsing, and validation
 * of spreadsheet formulas without any evaluation logic.
 */

/**
 * Token types for formula parsing
 */
export type TokenType =
  | 'NUMBER'
  | 'CELL_REF'
  | 'CELL_RANGE'
  | 'VARIABLE'
  | 'CROSS_TAB_REF' // New: TabName.ColumnValue
  | 'FUNCTION'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'COLON'
  | 'DOT' // New: for cross-tab references
  | 'WHITESPACE'
  | 'EOF';

/**
 * Token for formula parsing
 */
export interface Token {
  /** Token type */
  type: TokenType;
  /** Token value */
  value: string;
  /** Position in source string */
  position: number;
  /** Line number (always 1 for formulas) */
  line: number;
  /** Column number */
  column: number;
}

/**
 * AST node types
 */
export type ASTNodeType =
  | 'NUMBER'
  | 'CELL_REF'
  | 'CELL_RANGE'
  | 'VARIABLE'
  | 'CROSS_TAB_REF'
  | 'FUNCTION'
  | 'BINARY_OP'
  | 'UNARY_OP';

/**
 * Base AST node interface
 */
export interface ASTNode {
  /** Node type */
  type: ASTNodeType;
  /** Source position */
  position: number;
}

/**
 * Number literal node
 */
export interface NumberNode extends ASTNode {
  type: 'NUMBER';
  value: number;
}

/**
 * Cell reference node
 */
export interface CellRefNode extends ASTNode {
  type: 'CELL_REF';
  cellId: string;
  row: number;
  column: number;
}

/**
 * Cell range node
 */
export interface CellRangeNode extends ASTNode {
  type: 'CELL_RANGE';
  startCell: string;
  endCell: string;
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

/**
 * Variable reference node
 */
export interface VariableNode extends ASTNode {
  type: 'VARIABLE';
  name: string;
}

/**
 * Cross-tab reference node (TabName.ColumnValue)
 */
export interface CrossTabRefNode extends ASTNode {
  type: 'CROSS_TAB_REF';
  tabName: string;
  columnValue: string;
}

/**
 * Function call node
 */
export interface FunctionNode extends ASTNode {
  type: 'FUNCTION';
  name: string;
  arguments: ASTNode[];
}

/**
 * Binary operator node
 */
export interface BinaryOpNode extends ASTNode {
  type: 'BINARY_OP';
  operator: '+' | '-' | '*' | '/' | '^';
  left: ASTNode;
  right: ASTNode;
}

/**
 * Unary operator node
 */
export interface UnaryOpNode extends ASTNode {
  type: 'UNARY_OP';
  operator: '+' | '-';
  operand: ASTNode;
}

/**
 * Union type for all AST nodes
 */
export type ASTNodeUnion =
  | NumberNode
  | CellRefNode
  | CellRangeNode
  | VariableNode
  | CrossTabRefNode
  | FunctionNode
  | BinaryOpNode
  | UnaryOpNode;

/**
 * Parsing error
 */
export interface ParseError {
  /** Error message */
  message: string;
  /** Position where error occurred */
  position: number;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Expected token or value */
  expected?: string;
  /** Actual token or value found */
  found?: string;
}

/**
 * Parse result
 */
export interface ParseResult {
  /** Success status */
  success: boolean;
  /** AST root node (if successful) */
  ast?: ASTNodeUnion;
  /** Parse errors (if any) */
  errors: ParseError[];
}

/**
 * Formula tokenizer
 */
class FormulaTokenizer {
  private source: string;
  private position: number;
  private line: number;
  private column: number;

  constructor(source: string) {
    // Remove leading = if present
    this.source = source.startsWith('=') ? source.substring(1) : source;
    this.position = 0;
    this.line = 1;
    this.column = 1;
  }

  /**
   * Get current character
   */
  private current(): string {
    return this.position < this.source.length ? this.source[this.position] : '\0';
  }

  /**
   * Advance to next character
   */
  private advance(): void {
    if (this.current() === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    this.position++;
  }

  /**
   * Check if at end of input
   */
  private isEOF(): boolean {
    return this.position >= this.source.length;
  }

  /**
   * Skip whitespace
   */
  private skipWhitespace(): void {
    while (!this.isEOF() && /\s/.test(this.current())) {
      this.advance();
    }
  }

  /**
   * Tokenize the formula
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isEOF()) {
      this.skipWhitespace();
      if (this.isEOF()) break;

      const startPos = this.position;
      const startLine = this.line;
      const startCol = this.column;

      const char = this.current();

      // Number
      // Do not treat "-" as number start here; unary minus is handled by parser.
      // This prevents subtraction operators from being consumed by readNumber.
      if (this.isDigit(char) || char === '.') {
        const token = this.readNumber(startPos, startLine, startCol);
        if (token) {
          tokens.push(token);
          continue;
        }
      }

      // Cell reference or range
      if (this.isLetter(char)) {
        const token = this.readCellReference(startPos, startLine, startCol);
        if (token) {
          tokens.push(token);
          continue;
        }
      }

      // Operator
      if (this.isOperator(char)) {
        const token = this.readOperator(startPos, startLine, startCol);
        if (token) {
          tokens.push(token);
          continue;
        }
      }

      // Parentheses
      if (char === '(') {
        tokens.push({
          type: 'LPAREN',
          value: '(',
          position: startPos,
          line: startLine,
          column: startCol,
        });
        this.advance();
        continue;
      }

      if (char === ')') {
        tokens.push({
          type: 'RPAREN',
          value: ')',
          position: startPos,
          line: startLine,
          column: startCol,
        });
        this.advance();
        continue;
      }

      // Comma
      if (char === ',') {
        tokens.push({
          type: 'COMMA',
          value: ',',
          position: startPos,
          line: startLine,
          column: startCol,
        });
        this.advance();
        continue;
      }

      // Colon (for ranges)
      if (char === ':') {
        tokens.push({
          type: 'COLON',
          value: ':',
          position: startPos,
          line: startLine,
          column: startCol,
        });
        this.advance();
        continue;
      }

      // Dot (for cross-tab references)
      if (char === '.') {
        tokens.push({
          type: 'DOT',
          value: '.',
          position: startPos,
          line: startLine,
          column: startCol,
        });
        this.advance();
        continue;
      }

      // Unknown character
      throw new Error(
        `Unexpected character '${char}' at position ${startPos} (line ${startLine}, column ${startCol})`
      );
    }

    // Add EOF token
    tokens.push({
      type: 'EOF',
      value: '',
      position: this.position,
      line: this.line,
      column: this.column,
    });

    return tokens;
  }

  /**
   * Check if character is a digit
   */
  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  /**
   * Check if character is a letter
   */
  private isLetter(char: string): boolean {
    return /[a-zA-Z]/.test(char);
  }

  /**
   * Check if character is an operator
   */
  private isOperator(char: string): boolean {
    return /[+\-*/^]/.test(char);
  }

  /**
   * Read number token
   */
  private readNumber(startPos: number, startLine: number, startCol: number): Token | null {
    let value = '';

    // Handle negative sign (only at start)
    if (this.current() === '-') {
      value += this.current();
      this.advance();
    }

    // Read integer part
    while (this.isDigit(this.current())) {
      value += this.current();
      this.advance();
    }

    // Read decimal part
    if (this.current() === '.' && this.isDigit(this.peek(1))) {
      // Decimal detected (flag removed - not used)
      value += this.current();
      this.advance();
      while (this.isDigit(this.current())) {
        value += this.current();
        this.advance();
      }
    }

    // Read exponent part
    if ((this.current() === 'e' || this.current() === 'E') && 
        (this.isDigit(this.peek(1)) || (this.peek(1) === '+' || this.peek(1) === '-'))) {
      // Exponent detected (flag removed - not used)
      value += this.current();
      this.advance();
      if (this.current() === '+' || this.current() === '-') {
        value += this.current();
        this.advance();
      }
      while (this.isDigit(this.current())) {
        value += this.current();
        this.advance();
      }
    }

    if (value === '' || value === '-') {
      return null;
    }

    return {
      type: 'NUMBER',
      value,
      position: startPos,
      line: startLine,
      column: startCol,
    };
  }

  /**
   * Peek at character n positions ahead
   */
  private peek(offset: number): string {
    const pos = this.position + offset;
    return pos < this.source.length ? this.source[pos] : '\0';
  }

  /**
   * Read cell reference or variable/function or cross-tab reference
   */
  private readCellReference(startPos: number, startLine: number, startCol: number): Token | null {
    let value = '';

    // Read letters and numbers (for identifiers)
    while (this.isLetter(this.current()) || this.isDigit(this.current()) || this.current() === '_') {
      value += this.current();
      this.advance();
    }

    // Check if followed by digits after letters only (cell reference like A1, B2)
    // This distinguishes A1 (cell) from A1B (variable)
    if (value.match(/^[A-Z]+$/) && this.isDigit(this.current())) {
      // Read digits (row part)
      while (this.isDigit(this.current())) {
        value += this.current();
        this.advance();
      }

      // Validate cell reference format
      const match = value.match(/^([A-Z]+)(\d+)$/);
      if (match) {
        return {
          type: 'CELL_REF',
          value,
          position: startPos,
          line: startLine,
          column: startCol,
        };
      }
    }

    // Check if followed by dot (cross-tab reference: TabName.ColumnValue)
    if (this.current() === '.' && value.length > 0) {
      // This will be handled by the parser as a cross-tab reference
      // Return as VARIABLE for now, parser will combine with DOT token
      return {
        type: 'VARIABLE',
        value,
        position: startPos,
        line: startLine,
        column: startCol,
      };
    }

    // Could be a function or variable
    // Check if followed by opening parenthesis (function)
    if (this.current() === '(') {
      return {
        type: 'FUNCTION',
        value: value.toUpperCase(),
        position: startPos,
        line: startLine,
        column: startCol,
      };
    }

    // Otherwise it's a variable
    if (value.length > 0) {
      return {
        type: 'VARIABLE',
        value,
        position: startPos,
        line: startLine,
        column: startCol,
      };
    }

    return null;
  }

  /**
   * Read operator token
   */
  private readOperator(startPos: number, startLine: number, startCol: number): Token | null {
    const char = this.current();
    if (this.isOperator(char)) {
      this.advance();
      return {
        type: 'OPERATOR',
        value: char,
        position: startPos,
        line: startLine,
        column: startCol,
      };
    }
    return null;
  }
}

/**
 * Formula parser
 */
class FormulaParser {
  private tokens: Token[];
  private currentIndex: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.currentIndex = 0;
  }

  /**
   * Get current token
   */
  private current(): Token {
    return this.tokens[this.currentIndex] || this.tokens[this.tokens.length - 1];
  }

  /**
   * Check if current token matches type
   */
  private match(type: TokenType): boolean {
    return this.current().type === type;
  }

  /**
   * Advance to next token
   */
  private advance(): Token {
    if (this.currentIndex < this.tokens.length) {
      this.currentIndex++;
    }
    return this.current();
  }

  /**
   * Consume token of expected type
   */
  private consume(type: TokenType, errorMessage?: string): Token {
    if (this.match(type)) {
      const token = this.current();
      this.advance();
      return token;
    }
    throw new Error(
      errorMessage ||
        `Expected ${type}, found ${this.current().type} at position ${this.current().position}`
    );
  }

  /**
   * Parse formula to AST
   */
  parse(): ASTNodeUnion {
    if (this.match('EOF')) {
      throw new Error('Empty formula');
    }

    const expr = this.parseExpression();
    
    if (!this.match('EOF')) {
      throw new Error(
        `Unexpected token ${this.current().type} at position ${this.current().position}`
      );
    }

    return expr;
  }

  /**
   * Parse expression (lowest precedence)
   */
  private parseExpression(): ASTNodeUnion {
    return this.parseAddition();
  }

  /**
   * Parse addition and subtraction
   */
  private parseAddition(): ASTNodeUnion {
    let left = this.parseMultiplication();

    while (this.match('OPERATOR') && (this.current().value === '+' || this.current().value === '-')) {
      const operator = this.current().value as '+' | '-';
      const position = this.current().position;
      this.advance();
      const right = this.parseMultiplication();

      left = {
        type: 'BINARY_OP',
        operator,
        left,
        right,
        position,
      } as BinaryOpNode;
    }

    return left;
  }

  /**
   * Parse multiplication and division
   */
  private parseMultiplication(): ASTNodeUnion {
    let left = this.parseExponentiation();

    while (
      this.match('OPERATOR') &&
      (this.current().value === '*' || this.current().value === '/')
    ) {
      const operator = this.current().value as '*' | '/';
      const position = this.current().position;
      this.advance();
      const right = this.parseExponentiation();

      left = {
        type: 'BINARY_OP',
        operator,
        left,
        right,
        position,
      } as BinaryOpNode;
    }

    return left;
  }

  /**
   * Parse exponentiation (right-associative)
   */
  private parseExponentiation(): ASTNodeUnion {
    let left = this.parseUnary();

    if (this.match('OPERATOR') && this.current().value === '^') {
      const operator = '^';
      const position = this.current().position;
      this.advance();
      const right = this.parseExponentiation(); // Right-associative

      return {
        type: 'BINARY_OP',
        operator,
        left,
        right,
        position,
      } as BinaryOpNode;
    }

    return left;
  }

  /**
   * Parse unary operators
   */
  private parseUnary(): ASTNodeUnion {
    if (this.match('OPERATOR') && (this.current().value === '+' || this.current().value === '-')) {
      const operator = this.current().value as '+' | '-';
      const position = this.current().position;
      this.advance();
      const operand = this.parseUnary();

      return {
        type: 'UNARY_OP',
        operator,
        operand,
        position,
      } as UnaryOpNode;
    }

    return this.parsePrimary();
  }

  /**
   * Parse primary expressions
   */
  private parsePrimary(): ASTNodeUnion {
    // Number
    if (this.match('NUMBER')) {
      const token = this.current();
      this.advance();
      const value = parseFloat(token.value);
      if (isNaN(value)) {
        throw new Error(`Invalid number: ${token.value} at position ${token.position}`);
      }
      return {
        type: 'NUMBER',
        value,
        position: token.position,
      } as NumberNode;
    }

    // Cell reference
    if (this.match('CELL_REF')) {
      const token = this.current();
      this.advance();

      // Check if followed by colon (range)
      if (this.match('COLON')) {
        this.advance();
        if (!this.match('CELL_REF')) {
          throw new Error(
            `Expected cell reference after colon at position ${this.current().position}`
          );
        }
        const endToken = this.current();
        this.advance();

        const startCoords = this.parseCellId(token.value);
        const endCoords = this.parseCellId(endToken.value);

        return {
          type: 'CELL_RANGE',
          startCell: token.value,
          endCell: endToken.value,
          startRow: startCoords.row,
          startColumn: startCoords.column,
          endRow: endCoords.row,
          endColumn: endCoords.column,
          position: token.position,
        } as CellRangeNode;
      }

      // Single cell reference
      const coords = this.parseCellId(token.value);
      return {
        type: 'CELL_REF',
        cellId: token.value,
        row: coords.row,
        column: coords.column,
        position: token.position,
      } as CellRefNode;
    }

    // Variable or Cross-tab reference
    if (this.match('VARIABLE')) {
      const token = this.current();
      this.advance();
      
      // Check if followed by dot (cross-tab reference)
      if (this.match('DOT')) {
        this.advance(); // Consume dot
        
        // Read column value after dot
        if (this.match('VARIABLE')) {
          const columnToken = this.current();
          this.advance();
          
          return {
            type: 'CROSS_TAB_REF',
            tabName: token.value,
            columnValue: columnToken.value,
            position: token.position,
          } as CrossTabRefNode;
        } else {
          throw new Error(
            `Expected column name after dot in cross-tab reference at position ${this.current().position}`
          );
        }
      }
      
      // Regular variable
      return {
        type: 'VARIABLE',
        name: token.value,
        position: token.position,
      } as VariableNode;
    }

    // Function call
    if (this.match('FUNCTION')) {
      return this.parseFunction();
    }

    // Parenthesized expression
    if (this.match('LPAREN')) {
      this.advance();
      const expr = this.parseExpression();
      this.consume('RPAREN', 'Expected closing parenthesis');
      return expr;
    }

    throw new Error(
      `Unexpected token ${this.current().type} at position ${this.current().position}`
    );
  }

  /**
   * Parse function call
   */
  private parseFunction(): FunctionNode {
    const funcToken = this.current();
    const position = funcToken.position;
    this.advance();

    this.consume('LPAREN', 'Expected opening parenthesis after function name');

    const args: ASTNodeUnion[] = [];

    if (!this.match('RPAREN')) {
      do {
        args.push(this.parseExpression());
      } while (this.match('COMMA') && (this.advance(), true));

      this.consume('RPAREN', 'Expected closing parenthesis');
    } else {
      this.advance(); // Consume closing parenthesis
    }

    return {
      type: 'FUNCTION',
      name: funcToken.value,
      arguments: args,
      position,
    } as FunctionNode;
  }

  /**
   * Parse cell ID to row and column
   */
  private parseCellId(cellId: string): { row: number; column: number } {
    const match = cellId.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      throw new Error(`Invalid cell ID format: ${cellId}`);
    }

    const columnStr = match[1];
    const row = parseInt(match[2], 10) - 1; // Convert to 0-based

    let column = 0;
    for (let i = 0; i < columnStr.length; i++) {
      column = column * 26 + (columnStr.charCodeAt(i) - 64);
    }
    column -= 1; // Convert to 0-based

    return { row, column };
  }
}

/**
 * Formula validator
 */
class FormulaValidator {
  /**
   * Validate AST structure
   */
  static validateAST(ast: ASTNodeUnion, errors: ParseError[] = []): boolean {
    try {
      this.validateNode(ast, errors);
      return errors.length === 0;
    } catch (error) {
      errors.push({
        message: error instanceof Error ? error.message : String(error),
        position: 0,
        line: 1,
        column: 1,
      });
      return false;
    }
  }

  /**
   * Validate AST node
   */
  private static validateNode(node: ASTNodeUnion, errors: ParseError[]): void {
    switch (node.type) {
      case 'NUMBER':
        if (typeof node.value !== 'number' || !Number.isFinite(node.value)) {
          errors.push({
            message: `Invalid number value: ${node.value}`,
            position: node.position,
            line: 1,
            column: 1,
          });
        }
        break;

      case 'CELL_REF':
        if (!node.cellId || !/^[A-Z]+\d+$/.test(node.cellId)) {
          errors.push({
            message: `Invalid cell reference: ${node.cellId}`,
            position: node.position,
            line: 1,
            column: 1,
          });
        }
        break;

      case 'CELL_RANGE':
        if (!node.startCell || !node.endCell) {
          errors.push({
            message: 'Invalid cell range',
            position: node.position,
            line: 1,
            column: 1,
          });
        }
        break;

      case 'VARIABLE':
        if (!node.name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(node.name)) {
          errors.push({
            message: `Invalid variable name: ${node.name}`,
            position: node.position,
            line: 1,
            column: 1,
          });
        }
        break;

      case 'CROSS_TAB_REF':
        const crossTabNode = node as CrossTabRefNode;
        if (!crossTabNode.tabName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(crossTabNode.tabName)) {
          errors.push({
            message: `Invalid tab name: ${crossTabNode.tabName}`,
            position: node.position,
            line: 1,
            column: 1,
          });
        }
        if (!crossTabNode.columnValue || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(crossTabNode.columnValue)) {
          errors.push({
            message: `Invalid column value: ${crossTabNode.columnValue}`,
            position: node.position,
            line: 1,
            column: 1,
          });
        }
        break;

      case 'FUNCTION':
        if (!node.name || node.name.length === 0) {
          errors.push({
            message: 'Function name is required',
            position: node.position,
            line: 1,
            column: 1,
          });
        }
        // Validate arguments
        for (const arg of node.arguments) {
          this.validateNode(arg as ASTNodeUnion, errors);
        }
        break;

      case 'BINARY_OP':
        if (!['+', '-', '*', '/', '^'].includes(node.operator)) {
          errors.push({
            message: `Invalid operator: ${node.operator}`,
            position: node.position,
            line: 1,
            column: 1,
          });
        }
        this.validateNode(node.left as ASTNodeUnion, errors);
        this.validateNode(node.right as ASTNodeUnion, errors);
        break;

      case 'UNARY_OP':
        if (!['+', '-'].includes(node.operator)) {
          errors.push({
            message: `Invalid unary operator: ${node.operator}`,
            position: node.position,
            line: 1,
            column: 1,
          });
        }
        this.validateNode(node.operand as ASTNodeUnion, errors);
        break;
    }
  }
}

/**
 * Tokenize formula string
 */
export function tokenizeFormula(formula: string): Token[] {
  try {
    const tokenizer = new FormulaTokenizer(formula);
    return tokenizer.tokenize();
  } catch (error) {
    throw new Error(
      `Tokenization error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Parse formula to AST
 */
export function parseFormulaToAST(formula: string): ParseResult {
  const errors: ParseError[] = [];

  try {
    // Tokenize
    const tokens = tokenizeFormula(formula);

    // Parse
    const parser = new FormulaParser(tokens);
    const ast = parser.parse();

    // Validate
    const isValid = FormulaValidator.validateAST(ast, errors);

    return {
      success: isValid && errors.length === 0,
      ast: isValid ? ast : undefined,
      errors,
    };
  } catch (error) {
    errors.push({
      message: error instanceof Error ? error.message : String(error),
      position: 0,
      line: 1,
      column: 1,
    });

    return {
      success: false,
      errors,
    };
  }
}

/**
 * Validate formula syntax
 */
export function validateFormula(formula: string): ParseResult {
  return parseFormulaToAST(formula);
}

