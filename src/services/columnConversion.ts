/**
 * columnConversion.ts
 *
 * ADR-015 D1/D8 — the display-time conversion pipeline, as a pure function.
 * No React, no Firestore, no TREB. Every render path (grid, read-only view,
 * PDF) calls `convertColumnDisplayValue` with the same inputs and gets the
 * same answer.
 *
 * D8's six steps, exactly:
 *   1. raw value        — passed in untouched; this module never recomputes it
 *   2. source unit       — `column.conversionSourceUnit`, as declared (the
 *                          STD_C* cross-check against a standard's outputUnit
 *                          is Task 2's job, at author/record-entry time — a
 *                          WARNING, not something this render-time function
 *                          re-derives on every cell)
 *   3. target unit        — passed in already resolved (the header's
 *                          EFFECTIVE unit: fixed, the record's `columnUnits`
 *                          selection, or a `sameAs` chain — all of that is
 *                          `resolveColumnUnitMap`'s job, upstream of this)
 *   4. equal, or disabled  → stop, return the raw value untouched
 *   5. no rule for the pair → D6 failure
 *   6. apply at FULL PRECISION — this function does NOT round. `displayValue`
 *      is the full-precision number; the caller's EXISTING ADR-011 rounding
 *      (TREB's per-column `numberFormat`, or `formatRecordValueForPdf`)
 *      applies to it exactly as it already applies to an unconverted raw
 *      value. Rounding here too would round twice.
 *
 * D1's non-negotiable boundary: this module reads a raw NUMBER and a few
 * PLAIN STRINGS (units) — never a `RecordRow`, never the evaluator, never
 * anything from `modules/recorder/formula/*` other than importing its
 * PARSER/EVALUATOR to run a RULE's own expression (that dependency runs
 * services -> formula module, same direction `recordRecalculation.ts` and
 * `recorderTemplateValidation.ts` already use — never the reverse).
 * `columnConversionIsolation.test.ts` asserts the formula module itself
 * imports nothing from here.
 */

import type { RecordColumn, ConversionRule, ConversionFailure, ConversionFailureReason } from '../types';
import {
  parseExpression,
  evaluate,
  FormulaEvaluationError,
  type RowEvaluationContext,
} from '../modules/recorder/formula';

/** The one variable a rule's expression may reference (ADR-015 D4) — mirrors conversionRuleValidation.ts's constant without importing it, since that module is validation-time and this is render-time; both name the literal 'VALUE'. */
const RULE_VARIABLE = 'VALUE';

export interface ConversionApplied {
  rule: ConversionRule;
  sourceUnit: string;
  targetUnit: string;
  /** The value BEFORE conversion — carried through so a caller building a D7 snapshot has both numbers without re-deriving. */
  rawValue: number;
}

export interface ConversionResult {
  /**
   * Full precision, NOT yet rounded — feed this through the caller's own
   * per-column ADR-011 rounding. Equals the raw value when conversion
   * wasn't applicable (disabled, units equal) or when it failed (D6: show
   * raw, never blank).
   */
  displayValue: number;
  /** Present when conversion was actually applied — absent otherwise. */
  applied?: ConversionApplied;
  /** Present when conversion was NEEDED but could not be applied (D6) — absent when not applicable at all. */
  failure?: ConversionFailure;
}

export interface ConvertColumnDisplayValueInput {
  rawValue: number;
  /** Only the two fields this pipeline actually reads — deliberately narrow so a caller can pass a full RecordColumn without this module caring about the rest of its shape. */
  column: Pick<RecordColumn, 'conversionEnabled' | 'conversionSourceUnit'>;
  /** The header's already-resolved EFFECTIVE unit (D8 step 3) — undefined when the column has no unit at all. */
  targetUnit: string | undefined;
  /** The rule library. Only `active` entries are eligible (D2: a deactivated rule must not be found by new lookups, even though it may still be named in an old commit snapshot). */
  rules: ConversionRule[];
}

function categorizeFailure(error: unknown): { reason: ConversionFailureReason; detail: string } {
  if (error instanceof FormulaEvaluationError) {
    if (/division by zero/i.test(error.message)) return { reason: 'divide-by-zero', detail: error.message };
    if (/not a finite number/i.test(error.message)) return { reason: 'non-finite-result', detail: error.message };
    return { reason: 'expression-error', detail: error.message };
  }
  return { reason: 'expression-error', detail: error instanceof Error ? error.message : String(error) };
}

/**
 * D8, steps 2–6. The caller already has the raw value (step 1) and the
 * resolved target unit (step 3, via `resolveColumnUnitMap` upstream).
 */
export function convertColumnDisplayValue(input: ConvertColumnDisplayValueInput): ConversionResult {
  const { rawValue, column, targetUnit, rules } = input;
  const sourceUnit = column.conversionSourceUnit?.trim() || undefined;

  // D8 step 4: disabled, or nothing to compare against, or already equal —
  // stop. No rule needed, and this is NOT a failure (D6 is specifically
  // about conversion that WAS needed and could not happen).
  if (!column.conversionEnabled || !sourceUnit || !targetUnit || sourceUnit === targetUnit) {
    return { displayValue: rawValue };
  }

  // Defensive: the engine already guards every arithmetic result against
  // non-finite values before a formula column's raw value ever reaches
  // here, so this should be unreachable in practice — kept because D6
  // names "a non-finite result" as its own failure mode explicitly, and it
  // costs nothing to also guard the INPUT, not just the conversion's own
  // output, against it.
  if (!Number.isFinite(rawValue)) {
    const failure: ConversionFailure = {
      reason: 'non-finite-result',
      message: `Column value is not a finite number, so it could not be converted from ${sourceUnit} to ${targetUnit}. Showing the raw value.`,
      sourceUnit,
      targetUnit,
    };
    return { displayValue: rawValue, failure };
  }

  // D8 step 5.
  const rule = rules.find((r) => r.active && r.fromUnit === sourceUnit && r.toUnit === targetUnit);
  if (!rule) {
    const failure: ConversionFailure = {
      reason: 'no-rule',
      message: `No conversion rule from ${sourceUnit} to ${targetUnit} — showing the value in ${sourceUnit} instead.`,
      sourceUnit,
      targetUnit,
    };
    return { displayValue: rawValue, failure };
  }

  // D8 step 6, full precision.
  let ast;
  try {
    ast = parseExpression(rule.expression);
  } catch (error) {
    const failure: ConversionFailure = {
      reason: 'expression-error',
      message: `Conversion rule "${rule.name}" (${sourceUnit} → ${targetUnit}) has an invalid expression: ${error instanceof Error ? error.message : String(error)}. Showing the raw value.`,
      sourceUnit,
      targetUnit,
    };
    return { displayValue: rawValue, failure };
  }

  const context: RowEvaluationContext = {
    kind: 'row',
    row: { [RULE_VARIABLE]: rawValue },
    env: {},
    std: null,
    customFunctions: {},
  };

  let converted: number;
  try {
    const value = evaluate(ast, context);
    if (typeof value !== 'number') {
      const failure: ConversionFailure = {
        reason: 'expression-error',
        message: `Conversion rule "${rule.name}" (${sourceUnit} → ${targetUnit}) did not produce a number. Showing the raw value.`,
        sourceUnit,
        targetUnit,
      };
      return { displayValue: rawValue, failure };
    }
    converted = value;
  } catch (error) {
    const { reason, detail } = categorizeFailure(error);
    const failure: ConversionFailure = {
      reason,
      message: `Conversion rule "${rule.name}" (${sourceUnit} → ${targetUnit}) failed: ${detail}. Showing the raw value.`,
      sourceUnit,
      targetUnit,
    };
    return { displayValue: rawValue, failure };
  }

  if (!Number.isFinite(converted)) {
    const failure: ConversionFailure = {
      reason: 'non-finite-result',
      message: `Conversion rule "${rule.name}" (${sourceUnit} → ${targetUnit}) produced a non-finite result. Showing the raw value.`,
      sourceUnit,
      targetUnit,
    };
    return { displayValue: rawValue, failure };
  }

  return {
    displayValue: converted,
    applied: { rule, sourceUnit, targetUnit, rawValue },
  };
}
