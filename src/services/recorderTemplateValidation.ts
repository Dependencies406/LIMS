/**
 * recorderTemplateValidation.ts
 *
 * The "verifier" surface for RecorderTemplate authoring (Task 3's Verify
 * button) and the hard gate `recorderTemplateService.publishTemplate` runs
 * before freezing a version.
 *
 * This does NOT reimplement any part of the expression language — it only
 * adapts a RecorderTemplate's structured fields (sections/columns/
 * customFunctions/summaryFields) into calls against the Phase 3 interpreter's
 * public API (src/modules/recorder/formula/index.ts). All parsing, name
 * resolution, arity checking, cycle detection, and context rules live there.
 *
 * Pure logic, no Firestore — so it is independently unit-testable and callable
 * from the browser before any data exists.
 */

import type { CustomFunction, RecordColumn, RecordSection, RecorderTemplate } from '../types';
import {
  validateColumnFormulas,
  validateCustomFunctions,
  validateExpression,
  type ColumnFormula,
  type TemplateShape,
  type ValidationIssue,
} from '../modules/recorder/formula';

/** Reserved by the formula language (ADR-009, ADR-010, ADR-013); an author may not reuse them. */
export const RESERVED_SECTION_IDS = ['ENV', 'SUMMARY', 'STD'] as const;

/** Shared by section ids, column ids, and summary field ids (domain model §2). */
import { extractPlaceholders } from './reportBlockText';

const ID_PATTERN = /^[A-Z][A-Z0-9]*$/;

function idIssue(kind: string, id: string): ValidationIssue {
  return { message: `${kind} id '${id}' must be uppercase letters/digits, starting with a letter (e.g. 'CAL', 'R1').` };
}

/** `def name(params): return expression` — the source shape Phase 3's parser expects. */
export function customFunctionToSource(fn: CustomFunction): string {
  return `def ${fn.name}(${fn.params.join(', ')}):\n    return ${fn.expression}`;
}

function formulaColumnName(section: RecordSection, column: RecordColumn): string {
  return `${section.id}_${column.id}`;
}

/**
 * Structural checks that don't need the interpreter at all: reserved ids,
 * id shape, and duplicate ids. Runs before anything is handed to Phase 3.
 */
function validateStructure(template: RecorderTemplate): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenSectionIds = new Set<string>();

  for (const section of template.sections) {
    if ((RESERVED_SECTION_IDS as readonly string[]).includes(section.id)) {
      issues.push({
        message: `Section id '${section.id}' is reserved by the formula language and cannot be used for an author-defined section.`,
      });
      continue;
    }
    if (!ID_PATTERN.test(section.id)) {
      issues.push(idIssue('Section', section.id));
    }
    if (seenSectionIds.has(section.id)) {
      issues.push({ message: `Section id '${section.id}' is used more than once.` });
    }
    seenSectionIds.add(section.id);

    const seenColumnIds = new Set<string>();
    for (const column of section.columns) {
      if (!ID_PATTERN.test(column.id)) {
        issues.push(idIssue(`Column (in section '${section.id}')`, column.id));
      }
      if (seenColumnIds.has(column.id)) {
        issues.push({ message: `Column id '${column.id}' is used more than once in section '${section.id}'.` });
      }
      seenColumnIds.add(column.id);

      if (column.type === 'formula' && !column.expression?.trim()) {
        issues.push({ message: `Formula column '${formulaColumnName(section, column)}' has no expression.` });
      }
      if (column.type === 'selection' && (!column.choices || column.choices.length === 0)) {
        issues.push({ message: `Selection column '${formulaColumnName(section, column)}' has no choices.` });
      }
      // Phase 15 Task 1 (superseded): a 'selectable' unit with fewer than 2
      // allowed units gives the technician nothing to pick — either 0 (they
      // pick from an empty list) or 1 (the choice is a foregone conclusion,
      // which is what 'fixed' mode is for).
      if (column.unitMode === 'selectable' && (!column.unitChoices || column.unitChoices.length < 2)) {
        issues.push({
          message: `Column '${formulaColumnName(section, column)}' has selectable units but fewer than 2 allowed units — add at least 2, or switch to Fixed.`,
        });
      }
      if (column.unitMode === 'sameAs' && !column.unitSourceColumn) {
        issues.push({
          message: `Column '${formulaColumnName(section, column)}' inherits its unit from another column but none is selected — pick one, or change its Unit mode.`,
        });
      }
    }
  }

  const seenSummaryIds = new Set<string>();
  for (const field of template.summaryFields) {
    if (!ID_PATTERN.test(field.id)) {
      issues.push(idIssue('Summary field', field.id));
    }
    if (seenSummaryIds.has(field.id)) {
      issues.push({ message: `Summary field id '${field.id}' is used more than once.` });
    }
    seenSummaryIds.add(field.id);
    if (!field.expression?.trim()) {
      issues.push({ message: `Summary field 'SUMMARY_${field.id}' has no expression.` });
    }
  }

  if (template.roundCount < 1) {
    issues.push({ message: 'roundCount must be at least 1.' });
  }

  issues.push(...validateUnitReferences(template));

  return issues;
}

/**
 * `sameAs` unit references, checked across the whole template rather than one
 * column at a time: a reference must name a column that EXISTS, and the
 * reference graph must be acyclic.
 *
 * `resolveColumnUnitMap` already degrades safely (a dangling or cyclic
 * reference renders no unit rather than crashing), so these are reported as
 * author errors HERE — at Verify, where they can be fixed — instead of
 * silently showing a header with a missing unit forever.
 */
function validateUnitReferences(template: RecorderTemplate): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const keyOf = new Map<string, { section: RecordSection; column: RecordColumn }>();
  for (const section of template.sections) {
    for (const column of section.columns) {
      keyOf.set(formulaColumnName(section, column), { section, column });
    }
  }

  for (const [key, { column }] of keyOf) {
    if (column.unitMode !== 'sameAs' || !column.unitSourceColumn) continue;

    if (!keyOf.has(column.unitSourceColumn)) {
      issues.push({
        message: `Column '${key}' inherits its unit from '${column.unitSourceColumn}', which is not a column in this template.`,
      });
      continue;
    }

    // Walk the chain from this column; a key seen twice is a cycle.
    const seen = new Set<string>([key]);
    let cursor: string | undefined = column.unitSourceColumn;
    while (cursor) {
      if (seen.has(cursor)) {
        issues.push({
          message: `Column '${key}' has a circular unit reference (${[...seen, cursor].join(' → ')}) — one column in the loop must define its own unit.`,
        });
        break;
      }
      seen.add(cursor);
      const next: RecordColumn | undefined = keyOf.get(cursor)?.column;
      cursor = next?.unitMode === 'sameAs' ? next.unitSourceColumn : undefined;
    }
  }

  return issues;
}

function buildTemplateShape(template: RecorderTemplate): TemplateShape {
  const columns: string[] = [];
  for (const section of template.sections) {
    for (const column of section.columns) {
      columns.push(formulaColumnName(section, column));
    }
  }
  return {
    columns,
    roundCount: template.roundCount,
    summaryFieldIds: template.summaryFields.map((f) => f.id),
    customFunctions: template.customFunctions.map((fn) => ({ name: fn.name, params: fn.params })),
  };
}

/**
 * Runs the full verifier over a template: structural checks, then every
 * custom function, every formula column (with cycle detection), and every
 * summary field, via the Phase 3 validator. Returns every issue found —
 * an empty array means the template is publishable.
 */
export function verifyTemplate(template: RecorderTemplate): ValidationIssue[] {
  const issues = validateStructure(template);

  // Structural problems (bad ids, reserved names) make the rest of validation
  // unreliable — e.g. a formula column can't be resolved by a malformed id.
  if (issues.length > 0) return issues;

  const shape = buildTemplateShape(template);

  const functionResult = validateCustomFunctions(
    template.customFunctions.map(customFunctionToSource),
    { columns: shape.columns, roundCount: shape.roundCount, summaryFieldIds: shape.summaryFieldIds },
  );
  issues.push(...functionResult.issues);

  const columnFormulas: ColumnFormula[] = [];
  for (const section of template.sections) {
    for (const column of section.columns) {
      if (column.type === 'formula' && column.expression) {
        columnFormulas.push({ column: formulaColumnName(section, column), source: column.expression });
      }
    }
  }
  const columnResult = validateColumnFormulas(columnFormulas, shape);
  issues.push(...columnResult.issues);

  for (const field of template.summaryFields) {
    const result = validateExpression(field.expression, { context: 'summary', template: shape });
    issues.push(
      ...result.issues.map((issue) => ({ ...issue, message: `SUMMARY_${field.id}: ${issue.message}` })),
    );
  }

  issues.push(...verifyReportBlocks(template, shape));

  return issues;
}

/**
 * ADR-017 D4/D6 — Verify-time checking for report blocks.
 *
 * Two things surface here that would otherwise only appear at render time:
 *
 *   - block FORMULA columns, validated in block context, so `STD_*` in a
 *     budget formula is an authoring error the author sees at Verify rather
 *     than an error cell on a live record (D4 is explicit that this is an
 *     error, not a null); and
 *   - text-block PLACEHOLDERS, validated as expressions in the same context,
 *     because D6 requires the verifier to check them "the same way it checks
 *     column formulas — an unknown name is an authoring error and must
 *     surface at Verify, not on a certificate".
 *
 * The D7 divergence (an unresolved placeholder does not block COMMIT) is a
 * RUNTIME rule about a record whose data happens to be incomplete. It is not
 * a licence to publish a template with a misspelt name in it, which is what
 * this catches.
 */
function verifyReportBlocks(template: RecorderTemplate, shape: TemplateShape): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenBlockIds = new Set<string>();

  for (const block of template.reportBlocks ?? []) {
    const label = block.id || block.label || '(unnamed block)';

    if (!ID_PATTERN.test(block.id)) {
      issues.push({ message: `Report block '${label}': id must be uppercase letters and digits, starting with a letter.` });
      continue;
    }
    if (seenBlockIds.has(block.id)) {
      issues.push({ message: `Report block '${label}': another report block already uses this id.` });
    }
    seenBlockIds.add(block.id);
    // A block shares the section-id namespace, so a collision would make
    // BLOCKID_COLUMNID ambiguous with SECTIONID_COLUMNID.
    if (template.sections.some((section) => section.id === block.id)) {
      issues.push({ message: `Report block '${label}': a section already uses this id, which would make its column names ambiguous.` });
    }

    const blockColumns = block.columns.map((c) => `${block.id}_${c.id}`);
    const blockShape: TemplateShape = { ...shape, blockColumns };

    if (block.kind === 'table') {
      const seenColumnIds = new Set<string>();
      for (const column of block.columns) {
        if (!ID_PATTERN.test(column.id)) {
          issues.push({ message: `Report block '${label}': column id '${column.id}' must be uppercase letters and digits, starting with a letter.` });
          continue;
        }
        if (seenColumnIds.has(column.id)) {
          issues.push({ message: `Report block '${label}': column id '${column.id}' is used more than once.` });
        }
        seenColumnIds.add(column.id);

        if (column.type === 'formula') {
          if (!column.expression) {
            issues.push({ message: `Report block '${label}', column '${column.id}': a formula column needs a formula.` });
            continue;
          }
          const result = validateExpression(column.expression, { context: 'block', template: blockShape });
          issues.push(
            ...result.issues.map((issue) => ({ ...issue, message: `${block.id}_${column.id}: ${issue.message}` })),
          );
        }
        if (column.type === 'selection' && (column.choices ?? []).length === 0) {
          issues.push({ message: `Report block '${label}', column '${column.id}': a selection column needs at least one choice.` });
        }
      }
    } else {
      for (const placeholder of extractPlaceholders(block.text ?? '')) {
        if (!placeholder.expression) {
          issues.push({ message: `Report block '${label}': an empty placeholder {} has nothing to resolve.` });
          continue;
        }
        const result = validateExpression(placeholder.expression, { context: 'block', template: blockShape });
        issues.push(
          ...result.issues.map((issue) => ({
            ...issue,
            message: `Report block '${label}', placeholder ${placeholder.raw}: ${issue.message}`,
          })),
        );
      }
    }
  }

  return issues;
}

/** Convenience for the authoring UI: true only when publish would be allowed. */
export function isTemplatePublishable(template: RecorderTemplate): boolean {
  return verifyTemplate(template).length === 0;
}

export interface ConversionFactorWarning {
  message: string;
}

// Deliberately scoped to STD_C0..STD_C5 only — the polynomial coefficients
// that need a unit conversion to become a force. STD_UCAL/STD_UA/STD_UB/
// STD_UC are percentages and STD_RESOLUTION is already in-unit; warning on
// those would be noise that trains an author to ignore this warning.
const STD_COEFFICIENT_PATTERN = /\bSTD_C[0-5]\b/;
const STD_TO_N_PATTERN = /\bSTD_TO_N\b/;
const REPORT_TO_N_PATTERN = /\bREPORT_TO_N\b/;

/**
 * Phase 15 Task 3 — "the most valuable task in the phase." At template
 * VERIFY time (not record time), warns when a formula column references
 * any `STD_C0`..`STD_C5` but does not reference BOTH `STD_TO_N` and
 * `REPORT_TO_N` in that SAME expression — the canonical unit-conversion
 * pattern `polynomial(R) * STD_TO_N / REPORT_TO_N` (ADR-013 D5).
 *
 * Warn only — never auto-inserts or rewrites the author's formula, and is
 * kept OUT of `verifyTemplate`'s blocking `ValidationIssue[]` on purpose:
 * a column that intentionally reports in the standard's own calibrated
 * unit (no conversion needed) is a legitimate author choice, not an error.
 *
 * When both `STD_TO_N` and `REPORT_TO_N` are present, no further warning
 * about which unit PAIR is used is needed — newton-normalization handles
 * any pair.
 */
export function findMissingConversionFactorWarnings(template: RecorderTemplate): ConversionFactorWarning[] {
  const warnings: ConversionFactorWarning[] = [];
  for (const section of template.sections) {
    for (const column of section.columns) {
      if (column.type !== 'formula' || !column.expression) continue;
      const expr = column.expression;
      if (!STD_COEFFICIENT_PATTERN.test(expr)) continue;
      if (STD_TO_N_PATTERN.test(expr) && REPORT_TO_N_PATTERN.test(expr)) continue;

      const name = formulaColumnName(section, column);
      warnings.push({
        message: `Column '${name}' uses a STD_C coefficient but does not multiply by STD_TO_N and divide by REPORT_TO_N — add "* STD_TO_N / REPORT_TO_N" to convert the result to the record's reporting unit. If the units already match, the factor is 1 and costs nothing to add.`,
      });
    }
  }
  return warnings;
}
