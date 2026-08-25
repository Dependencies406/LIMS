/**
 * formulaSuggestions.ts
 *
 * Autocomplete for the three formula inputs (column formula, summary field,
 * custom function body), built as a PURE module — text + caret offset +
 * context in, ranked candidates out. No React, no DOM, so every rule below
 * is directly unit-testable without mounting a component.
 *
 * NOTHING here retypes a name list. Every candidate is sourced from an
 * existing Phase 10 module:
 *   - variables:        formulaVariableList.ts's buildRowFormulaVariables /
 *                        buildSummaryFormulaVariables
 *   - builtin functions: builtins.ts's BUILTIN_FUNCTIONS, described by
 *                        builtinDocs.ts's BUILTIN_DOCS
 *   - column aggregates: builtins.ts's COLUMN_AGGREGATES, described by
 *                        builtinDocs.ts's AGGREGATE_DOCS
 *   - custom functions:  the template's OWN draft.customFunctions — no
 *                        document lists these, since they are per-template
 *
 * Context rules mirror validator.ts's resolveExpression exactly (cited
 * inline below), rather than re-deriving them:
 *   - builtins have NO context gate in the validator — legal everywhere.
 *   - column aggregates are summary-only and banned inside a function body
 *     ("Column aggregates cannot be used inside a custom function" /
 *     "Column aggregates can only be used in summary fields").
 *   - custom functions have no context gate either — callable from a row
 *     formula, a summary field, or another custom function's body (the
 *     body-isolation rule restricts VALUES, not function calls: step 9 lists
 *     "other custom functions" as legal inside a body).
 *   - inside a function body, only `params` resolve as values at all — no
 *     column, ENV_*, STD_*, or SUMMARY_* name is legal there (validator:
 *     "A custom function cannot use '<name>' directly. Pass it in as a
 *     parameter instead.").
 *
 * ONE DISAGREEMENT FOUND vs. this phase's own prompt, resolved in favour of
 * the validator (the prompt says so itself: "the validator is
 * authoritative"): the prompt's context table lists plain "columns" as
 * legal in a summary field. They are not — validator.ts's resolver rejects
 * EVERY bare column identifier in summary context unconditionally:
 *
 *   if (context === 'summary') {
 *     issues.push({ message: `'${name}' is a column, which has no single
 *       value in a summary field. Use a column aggregate such as
 *       col_mean(${name}).` ... });
 *   }
 *
 * `buildSummaryFormulaVariables` already encodes this correctly (its own
 * comment: "No plain columns and no STD_* here — neither resolves in
 * summary context"), so no fix was needed there — only the prompt's
 * English description was wrong. The only place a bare column name is ever
 * legal in summary context is as an aggregate's own argument
 * (`col_mean(CAL_IND)`), which is the separate, position-based rule below.
 */

import type { RecorderTemplate } from '../types';
import { buildRowFormulaVariables, buildSummaryFormulaVariables } from './formulaVariableList';
import { BUILTIN_FUNCTIONS, COLUMN_AGGREGATES, describeArity } from '../modules/recorder/formula/builtins';
import { BUILTIN_DOCS, AGGREGATE_DOCS } from '../modules/recorder/formula/builtinDocs';

export type SuggestionKind = 'variable' | 'builtin' | 'aggregate' | 'custom' | 'param';

export interface FormulaSuggestion {
  name: string;
  kind: SuggestionKind;
  /** One-line, plain language. */
  description: string;
  /** Present for callable kinds (builtin/aggregate/custom) — e.g. "ROUND(value, decimals)". */
  signature?: string;
  /** The formula's own column/field name — visible so the author learns why it's unselectable, never insertable. */
  disabled?: boolean;
  disabledReason?: string;
}

export type FormulaAuthoringContext =
  | { kind: 'row'; sectionId: string; columnId: string }
  | { kind: 'summary'; fieldId: string }
  | { kind: 'function'; params: string[] };

/** The subset of a template's fields this module reads — matches what `draft` in the builder page already has. */
export type SuggestionsTemplate = Pick<RecorderTemplate, 'sections' | 'roundCount' | 'summaryFields' | 'customFunctions'>;

export interface CaretContext {
  /** What has been typed so far in the token touching the caret — the filter query. Empty when the caret isn't in/against an identifier. */
  tokenPrefix: string;
  /** Start offset of the FULL token (identifier chars on both sides of the caret) — the replacement range on accept. */
  tokenStart: number;
  tokenEnd: number;
  /** Name of the nearest enclosing open call the caret sits inside, exactly as typed (for the signature hint). */
  enclosingCallName: string | null;
  /**
   * True only when the caret is in the FIRST argument position of an
   * aggregate call (`col_mean(`, `col_max(`, …) — the one spot the grammar
   * allows nothing but a bare column name (validator: "The argument to
   * ${callee} must be a plain column name, not an expression").
   */
  isAggregateArgumentPosition: boolean;
}

export interface SignatureHint {
  name: string;
  signature: string;
  description?: string;
}

export interface FormulaSuggestionsResult {
  caret: CaretContext;
  suggestions: FormulaSuggestion[];
  signatureHint: SignatureHint | null;
}

const IDENT_CHAR = /[A-Za-z0-9_]/;
const AGGREGATE_NAME_SET = new Set<string>(COLUMN_AGGREGATES);

interface EnclosingCall {
  name: string;
  /** Index of the top-level comma-separated argument the caret is in, 0-based. */
  argIndex: number;
}

/**
 * Scans backward from `offset` for the nearest unmatched `(` and the
 * identifier immediately before it — i.e. what call (if any) the caret is
 * textually inside the argument list of. Handles nesting (an enclosing
 * ROUND( around an inner col_mean( resolves to ROUND, not col_mean, once
 * the inner call's own parens are balanced) and ignores a bare grouping
 * paren with no identifier before it (`(a + b) * c`).
 */
function findEnclosingCall(text: string, offset: number): EnclosingCall | null {
  let depth = 0;
  for (let i = offset - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === ')') {
      depth += 1;
    } else if (ch === '(') {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      let j = i - 1;
      while (j >= 0 && /\s/.test(text[j])) j -= 1;
      const end = j + 1;
      while (j >= 0 && IDENT_CHAR.test(text[j])) j -= 1;
      const start = j + 1;
      if (start === end) return null; // a grouping paren, not a call
      const name = text.slice(start, end);

      let argIndex = 0;
      let innerDepth = 0;
      for (let k = i + 1; k < offset; k += 1) {
        const c2 = text[k];
        if (c2 === '(') innerDepth += 1;
        else if (c2 === ')') innerDepth -= 1;
        else if (c2 === ',' && innerDepth === 0) argIndex += 1;
      }
      return { name, argIndex };
    }
  }
  return null;
}

/** Pure text analysis of one caret position — see `CaretContext` for what each field means. */
export function analyzeCaretPosition(text: string, caretOffset: number): CaretContext {
  const offset = Math.max(0, Math.min(caretOffset, text.length));

  let start = offset;
  while (start > 0 && IDENT_CHAR.test(text[start - 1])) start -= 1;
  let end = offset;
  while (end < text.length && IDENT_CHAR.test(text[end])) end += 1;

  const tokenPrefix = text.slice(start, offset);
  const enclosing = findEnclosingCall(text, start);
  const isAggregateArgumentPosition = !!enclosing
    && AGGREGATE_NAME_SET.has(enclosing.name.toLowerCase())
    && enclosing.argIndex === 0;

  return {
    tokenPrefix,
    tokenStart: start,
    tokenEnd: end,
    enclosingCallName: enclosing?.name ?? null,
    isAggregateArgumentPosition,
  };
}

/** Every column in the template, sourced from `buildRowFormulaVariables`'s own "This row's columns" group — never re-flattened here. */
function allColumnCandidates(template: SuggestionsTemplate): FormulaSuggestion[] {
  // sectionId/columnId are deliberately '' — no real column ever has a blank
  // id, so nothing is marked `disabled`, which is correct here: an
  // aggregate's argument has no "self" column to exclude.
  const groups = buildRowFormulaVariables(template, '', '', false);
  const columnGroup = groups.find((g) => g.label === "This row's columns");
  return (columnGroup?.entries ?? []).map((entry) => ({
    name: entry.name,
    kind: 'variable' as const,
    description: entry.title,
  }));
}

function builtinCandidates(): FormulaSuggestion[] {
  return Object.entries(BUILTIN_FUNCTIONS).map(([name, fn]) => ({
    name,
    kind: 'builtin' as const,
    description: BUILTIN_DOCS[name]?.summary.en ?? '',
    signature: BUILTIN_DOCS[name]?.signature ?? `${name}(${describeArity(fn)} argument(s))`,
  }));
}

function aggregateCandidates(): FormulaSuggestion[] {
  return COLUMN_AGGREGATES.map((name) => ({
    name,
    kind: 'aggregate' as const,
    description: AGGREGATE_DOCS[name]?.summary.en ?? '',
    signature: AGGREGATE_DOCS[name]?.signature ?? `${name}(COLUMN)`,
  }));
}

function customFunctionCandidates(template: SuggestionsTemplate): FormulaSuggestion[] {
  return template.customFunctions
    .filter((fn) => fn.name) // an author mid-typing a new function has no name yet — nothing to suggest
    .map((fn) => ({
      name: fn.name,
      kind: 'custom' as const,
      description: fn.expression ? `Custom function: ${fn.expression}` : 'Custom function',
      signature: `${fn.name}(${fn.params.join(', ')})`,
    }));
}

/** Every candidate legal in `context`, BEFORE the caret-position (aggregate-argument) override and BEFORE prefix filtering. */
function baseCandidates(context: FormulaAuthoringContext, template: SuggestionsTemplate, hasStandardColumn: boolean): FormulaSuggestion[] {
  const candidates: FormulaSuggestion[] = [];

  if (context.kind === 'function') {
    // validator step 9 / `insideFunctionBody`: parameters are the ONLY
    // values that resolve — no column, ENV_*, STD_*, or SUMMARY_* name.
    for (const param of context.params) {
      candidates.push({ name: param, kind: 'param', description: 'Parameter of this function' });
    }
  } else if (context.kind === 'row') {
    for (const group of buildRowFormulaVariables(template, context.sectionId, context.columnId, hasStandardColumn)) {
      for (const entry of group.entries) {
        candidates.push({
          name: entry.name,
          kind: 'variable',
          description: entry.title,
          disabled: entry.disabled,
          disabledReason: entry.disabled ? "A formula cannot reference its own column — this would be a dependency loop." : undefined,
        });
      }
    }
  } else {
    // context.kind === 'summary'
    for (const group of buildSummaryFormulaVariables(template, context.fieldId)) {
      for (const entry of group.entries) {
        candidates.push({
          name: entry.name,
          kind: 'variable',
          description: entry.title,
          disabled: entry.disabled,
          disabledReason: entry.disabled ? 'A summary field cannot reference itself — this would be a dependency loop.' : undefined,
        });
      }
    }
  }

  // Builtins: no context gate in the validator (isBuiltin(callee) is
  // checked before any context branch) — legal in row, summary, and
  // function-body contexts alike.
  candidates.push(...builtinCandidates());

  // Aggregates: summary-only (validator: "Column aggregates can only be
  // used in summary fields" / "cannot be used inside a custom function").
  if (context.kind === 'summary') {
    candidates.push(...aggregateCandidates());
  }

  // Custom functions: no context gate either — legal in row, summary, AND
  // another custom function's body (step 9 explicitly allows calling other
  // custom functions from inside one).
  candidates.push(...customFunctionCandidates(template));

  return candidates;
}

/**
 * Drops a repeated `kind:name` pair, keeping the first occurrence.
 *
 * Two columns can legitimately share one `${sectionId}_${columnId}` key
 * WHILE a template is still being edited — an author can type the same
 * Column ID into two different columns before renaming one away, and
 * nothing stops that state from existing transiently (it's caught by
 * `verifyTemplate`'s "Column id '<id>' is used more than once" check at
 * Verify time, not prevented from ever existing). When it does,
 * `buildRowFormulaVariables`'s flattened column list legitimately contains
 * two entries with the same `name` — offering the same insertable name
 * twice is confusing regardless of why, and left un-deduped it also
 * produces two suggestions with an identical React key downstream.
 */
function dedupeCandidates(candidates: FormulaSuggestion[]): FormulaSuggestion[] {
  const seen = new Set<string>();
  const result: FormulaSuggestion[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function rankAndFilter(candidates: FormulaSuggestion[], query: string): FormulaSuggestion[] {
  if (!query) return candidates;
  const q = query.toLowerCase();
  const scored: Array<{ candidate: FormulaSuggestion; tier: 0 | 1 }> = [];
  for (const candidate of candidates) {
    const name = candidate.name.toLowerCase();
    if (name.startsWith(q)) scored.push({ candidate, tier: 0 });
    else if (name.includes(q)) scored.push({ candidate, tier: 1 });
  }
  scored.sort((a, b) => (a.tier - b.tier) || a.candidate.name.localeCompare(b.candidate.name));
  return scored.map((s) => s.candidate);
}

function buildSignatureHint(enclosingCallName: string | null, template: SuggestionsTemplate): SignatureHint | null {
  if (!enclosingCallName) return null;
  const lower = enclosingCallName.toLowerCase();

  const builtinKey = Object.keys(BUILTIN_FUNCTIONS).find((k) => k.toLowerCase() === lower);
  if (builtinKey) {
    return {
      name: builtinKey,
      signature: BUILTIN_DOCS[builtinKey]?.signature ?? `${builtinKey}(...)`,
      description: BUILTIN_DOCS[builtinKey]?.summary.en,
    };
  }

  const aggregateName = COLUMN_AGGREGATES.find((a) => a.toLowerCase() === lower);
  if (aggregateName) {
    return {
      name: aggregateName,
      signature: AGGREGATE_DOCS[aggregateName]?.signature ?? `${aggregateName}(COLUMN)`,
      description: AGGREGATE_DOCS[aggregateName]?.summary.en,
    };
  }

  const customFn = template.customFunctions.find((fn) => fn.name && fn.name.toLowerCase() === lower);
  if (customFn) {
    return { name: customFn.name, signature: `${customFn.name}(${customFn.params.join(', ')})`, description: 'Custom function' };
  }

  return null;
}

export interface FormulaSuggestionsInput {
  text: string;
  caretOffset: number;
  context: FormulaAuthoringContext;
  template: SuggestionsTemplate;
  /**
   * Whether the template has a `standard` column — gates the "Reference
   * standard" (STD_*) group in row context, matching
   * `buildRowFormulaVariables`'s own `hasStandardColumn` parameter (ADR-013
   * D4: without a `standard` column every STD_* is awaiting-input
   * regardless of what's typed).
   */
  hasStandardColumn: boolean;
}

/**
 * The single entry point: given what's typed, where the caret is, and which
 * of the three formula inputs this is, returns the ranked candidate list
 * plus (when the caret sits inside a call's parentheses) a signature hint.
 */
export function getFormulaSuggestions(input: FormulaSuggestionsInput): FormulaSuggestionsResult {
  const caret = analyzeCaretPosition(input.text, input.caretOffset);

  const candidates = dedupeCandidates(
    caret.isAggregateArgumentPosition
      ? allColumnCandidates(input.template)
      : baseCandidates(input.context, input.template, input.hasStandardColumn),
  );

  return {
    caret,
    suggestions: rankAndFilter(candidates, caret.tokenPrefix),
    signatureHint: buildSignatureHint(caret.enclosingCallName, input.template),
  };
}

/**
 * The literal text to splice in when `suggestion` is accepted. A callable
 * kind inserts `NAME(` and leaves the caret right after it — i.e. inside
 * the parentheses — since nothing else is appended (no auto-closing paren,
 * per this phase's explicit constraint). A variable/param inserts its bare
 * name.
 */
export function insertionTextFor(suggestion: Pick<FormulaSuggestion, 'kind' | 'name'>): string {
  return suggestion.kind === 'builtin' || suggestion.kind === 'aggregate' || suggestion.kind === 'custom'
    ? `${suggestion.name}(`
    : suggestion.name;
}
