/**
 * conversionRuleValidation.ts
 *
 * ADR-015 D2/D4/D5 — the save-time checks for a conversion rule, pure and
 * Firestore-free (same separation `recorderTemplateValidation.ts` keeps from
 * `recorderTemplateService.ts`). `unitConversionRuleService.add`/`.update`
 * call this and refuse to write when it finds anything.
 *
 * Uses the EXISTING formula parser/validator (`validateExpression`, `walk`)
 * — no second expression syntax, no hand-rolled tokenizer.
 */

import { validateExpression, parseExpression, walk, type TemplateShape } from '../modules/recorder/formula';
import { isForceUnit } from './forceUnits';

export interface ConversionRuleValidationIssue {
  message: string;
}

export interface ConversionRuleDraft {
  fromUnit: string;
  toUnit: string;
  expression: string;
}

/** The one variable a conversion rule's expression may use (D4). */
export const CONVERSION_RULE_VARIABLE = 'VALUE';

/**
 * A synthetic single-column shape fed to the EXISTING validator so
 * `VALUE` resolves as a plain column reference and gets real parse + arity
 * checking for free. `roundCount: 0` means any `ENV_*` reference fails its
 * own round-range check rather than silently passing.
 */
const RULE_SHAPE: TemplateShape = { columns: [CONVERSION_RULE_VARIABLE], roundCount: 0, summaryFieldIds: [], customFunctions: [] };

/**
 * D4: no identifier but `VALUE` is legal, full stop — not "legal depending
 * on context" the way `STD_*`/`ENV_*`/`SUMMARY_*` are for a column formula.
 * `validateExpression` with `RULE_SHAPE` above would actually let a bare
 * `STD_C0` or `ENV_TEMP_R1` PASS (row context legitimately allows those
 * prefixes on their own terms) — this walk is what closes that gap: it
 * doesn't care what KIND of name it is, only whether it is `VALUE`.
 */
function findDisallowedIdentifiers(source: string): string[] {
  let ast;
  try {
    ast = parseExpression(source);
  } catch {
    return []; // a syntax error is already reported by validateExpression below
  }
  const bad = new Set<string>();
  walk(ast, (node) => {
    if (node.type === 'Identifier' && node.name !== CONVERSION_RULE_VARIABLE) bad.add(node.name);
  });
  return [...bad];
}

/**
 * Validates one rule draft. An empty array means it may be saved.
 *
 * Order matches how an author would want to see it: the two structural
 * refusals (force/force, fromUnit===toUnit) first since fixing either
 * changes nothing about the expression, then expression correctness.
 */
export function validateConversionRule(draft: ConversionRuleDraft): ConversionRuleValidationIssue[] {
  const issues: ConversionRuleValidationIssue[] = [];
  const fromUnit = draft.fromUnit?.trim() ?? '';
  const toUnit = draft.toUnit?.trim() ?? '';
  const expression = draft.expression?.trim() ?? '';

  if (!fromUnit) issues.push({ message: 'From unit is required.' });
  if (!toUnit) issues.push({ message: 'To unit is required.' });
  if (!expression) issues.push({ message: 'Expression is required.' });

  if (fromUnit && toUnit && fromUnit === toUnit) {
    issues.push({ message: 'From unit and To unit must be different — a rule that converts a unit to itself does nothing.' });
  }

  // D5: the boundary that keeps this from becoming a second force-conversion
  // implementation. The newton table already covers all sixteen force pairs
  // exactly; a hand-entered rule for one would be a second, untested
  // implementation of something already correct.
  if (fromUnit && toUnit && isForceUnit(fromUnit) && isForceUnit(toUnit)) {
    issues.push({
      message: `"${fromUnit}" and "${toUnit}" are both force units. Force conversion is already exact via STD_TO_N / REPORT_TO_N in the formula — a conversion rule for this pair is not allowed.`,
    });
  }

  if (expression) {
    const result = validateExpression(expression, { context: 'row', template: RULE_SHAPE });
    for (const issue of result.issues) issues.push({ message: issue.message });

    for (const name of findDisallowedIdentifiers(expression)) {
      issues.push({
        message: `A conversion rule expression may only use ${CONVERSION_RULE_VARIABLE}. '${name}' is not allowed — a conversion that depends on anything else is a formula, not a conversion (use a formula column instead).`,
      });
    }
  }

  return issues;
}

export function isConversionRuleValid(draft: ConversionRuleDraft): boolean {
  return validateConversionRule(draft).length === 0;
}
