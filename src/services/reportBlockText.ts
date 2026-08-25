/**
 * reportBlockText.ts
 *
 * ADR-017 D5/D6/D7 — the text half of report blocks.
 *
 * D6: placeholders resolve through the EXISTING formula evaluator, in block
 * context. There is deliberately no second expression syntax: `{...}` only
 * delimits where an expression starts and ends, and everything inside it is
 * handed to `parseExpression` unchanged. A template author who can write a
 * formula column can write a placeholder.
 *
 * D7 is the one deliberate divergence from ADR-010's strictness in this
 * codebase: an unresolved placeholder renders a LOUD marker and does NOT
 * block commit, because prose is not a measurement and blocking a whole
 * record over one optional sentence is disproportionate. The risk that
 * accepts — a certificate carrying a marker — is contained by two things,
 * both of which must stay true:
 *
 *   1. the marker is conspicuous everywhere it renders (record view, review
 *      screen, PDF preview) — never grey, never small; and
 *   2. `blocksApproval` gates APPROVE, the last step before a certificate
 *      leaves the laboratory (the D7 safeguard, which the owner had not
 *      struck when this was implemented).
 *
 * Together those keep the workflow moving for the technician while still
 * making it impossible to issue a defective certificate.
 */

import type { FormulaValue } from '../modules/recorder/formula';

/**
 * The visible marker for a placeholder that could not be resolved (D7).
 *
 * Format is fixed and matched by `findUnresolvedMarkers` rather than
 * re-derived at each call site, so the review screen, the record view and
 * the PDF cannot drift into recognising different things as "unresolved".
 */
export function unresolvedMarker(expression: string): string {
  return `[unresolved: ${expression}]`;
}

/** Matches any marker `unresolvedMarker` produced. */
const UNRESOLVED_MARKER_PATTERN = /\[unresolved: ([^\]]*)\]/g;

/**
 * One `{expression}` found in a text block.
 *
 * Nested braces are NOT supported and are not silently tolerated: the
 * expression language has no use for `{}`, so a nested brace is far more
 * likely a typo than an intent, and the non-greedy match below ends the
 * placeholder at the first `}` — which then fails to parse and surfaces as
 * an authoring error at Verify rather than as a mystery at render time.
 */
export interface TextPlaceholder {
  /** The full `{...}` as it appears in the source, including braces. */
  raw: string;
  /** The expression source between the braces, trimmed. */
  expression: string;
}

const PLACEHOLDER_PATTERN = /\{([^{}]*)\}/g;

/** Every placeholder in a block's text, in source order, duplicates included. */
export function extractPlaceholders(text: string): TextPlaceholder[] {
  const found: TextPlaceholder[] = [];
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    found.push({ raw: match[0], expression: match[1].trim() });
  }
  return found;
}

export interface InterpolationResult {
  /** The text with every placeholder replaced by a value or a marker. */
  text: string;
  /** The expression source of each placeholder that could not be resolved. */
  unresolved: string[];
}

/**
 * Replaces every `{expression}` with its evaluated value, or with a D7
 * marker when it cannot be resolved.
 *
 * `resolve` is INJECTED rather than this module importing the evaluator,
 * for the same reason `resetTemplateVersion` takes its record-count function
 * as a parameter: the caller already holds the fully-built block context
 * (measurement rows, summary values, env, this block's own row), and
 * rebuilding it here would mean this module knowing about records, templates
 * and standards — none of which it otherwise touches.
 *
 * A `resolve` that THROWS is an unresolved placeholder, not a crash: that is
 * exactly the D7 case (an awaiting-input value, a bad name, a division by
 * zero inside a sentence).
 */
export function interpolateBlockText(
  text: string,
  resolve: (expression: string) => FormulaValue,
): InterpolationResult {
  const unresolved: string[] = [];
  const out = text.replace(PLACEHOLDER_PATTERN, (_full, inner: string) => {
    const expression = inner.trim();
    if (!expression) {
      // `{}` has nothing to resolve. Treated as unresolved rather than
      // silently deleted, so an accidental empty placeholder is visible.
      unresolved.push('');
      return unresolvedMarker('');
    }
    try {
      const value = resolve(expression);
      return String(value);
    } catch {
      unresolved.push(expression);
      return unresolvedMarker(expression);
    }
  });
  return { text: out, unresolved };
}

/**
 * The expressions of every marker present in already-rendered text.
 *
 * Used by the approve gate, which reads the text a record actually carries
 * rather than re-running interpolation — so a marker that reached the record
 * by any route at all (including a snapshot taken at commit) still stops
 * approval.
 */
export function findUnresolvedMarkers(renderedText: string): string[] {
  return [...renderedText.matchAll(UNRESOLVED_MARKER_PATTERN)].map((m) => m[1]);
}

/**
 * THE D7 SAFEGUARD. True when this rendered text must not be approved.
 *
 * Deliberately a separate, named predicate rather than an inline
 * `.includes('[unresolved')` at the call site: the approve gate is the last
 * thing standing between a marker and an issued certificate, so what it
 * tests should be greppable and testable on its own.
 */
export function blocksApproval(renderedText: string): boolean {
  return findUnresolvedMarkers(renderedText).length > 0;
}

/**
 * The effective text of a text block for one record (D5).
 *
 * Precedence, and the reasoning for it:
 *   1. `snapshot` — frozen at commit. Once taken it ALWAYS wins, so a later
 *      template edit can never move text on a committed record (ADR-005).
 *   2. `override` — the technician's per-record edit, for per-job remarks.
 *   3. `templateDefault` — an unedited block on a draft shows the template's
 *      current wording, so template improvements reach drafts that have not
 *      been touched.
 *
 * An override of `''` is a REAL override (the technician deliberately
 * cleared the sentence), which is why this checks `!== undefined` rather
 * than truthiness — falling back to the template default there would
 * silently reinstate text somebody chose to delete.
 */
export function effectiveBlockText(args: {
  templateDefault?: string;
  override?: string;
  snapshot?: string;
}): string {
  if (args.snapshot !== undefined) return args.snapshot;
  if (args.override !== undefined) return args.override;
  return args.templateDefault ?? '';
}
