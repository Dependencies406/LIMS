/**
 * formulaVariableList.ts
 *
 * Phase 10 Task 7: pure logic behind the in-context "Variables you can use"
 * disclosure — what names are actually insertable at a given formula input,
 * given the template the author is looking at RIGHT NOW.
 *
 * Deliberately separate from the disclosure's rendering (FormulaVariableDisclosure.tsx):
 * this file only computes WHICH names apply and WHAT each one means; the
 * component only draws them and handles clicks. That split is what makes
 * "assert against a fixture template" (Task 7's test requirement) possible
 * without mounting the whole template builder page.
 *
 * Real names only — never a pattern like SECTIONID_COLUMNID. The author is
 * looking at their own template; these are ITS actual column names, built
 * from the section and column IDs as typed so far.
 */

import type { RecordColumn, RecordSection, RecorderTemplate, SummaryField } from '../types';
import { STD_DOCS, REPORT_DOCS, ENV_PATTERN_DOCS } from '../modules/recorder/formula/variableDocs';

export interface FormulaVariableEntry {
  name: string;
  /** One-line hover meaning. From Task 6 docs for built-ins; the column/field's own label for author-defined names. */
  title: string;
  /** Column formula's own name — a formula cannot reference itself (rejected by Verify as a dependency loop). */
  disabled?: boolean;
}

export interface FormulaVariableGroup {
  label: string;
  entries: FormulaVariableEntry[];
}

function envGroup(roundCount: number): FormulaVariableGroup {
  const entries: FormulaVariableEntry[] = [];
  for (let round = 1; round <= roundCount; round += 1) {
    for (const doc of ENV_PATTERN_DOCS) {
      // ENV_PATTERN_DOCS' `pattern` is literally "ENV_TEMP_R{n}" — substitute the real round number.
      entries.push({ name: doc.pattern.replace('{n}', String(round)), title: doc.summary.en.replace('{n}', String(round)) });
    }
  }
  return { label: 'Environment', entries };
}

function standardGroup(): FormulaVariableGroup {
  return {
    label: 'Reference standard',
    entries: Object.entries(STD_DOCS).map(([name, doc]) => ({ name, title: doc.summary.en })),
  };
}

function reportGroup(): FormulaVariableGroup {
  return {
    label: 'Reporting',
    entries: Object.entries(REPORT_DOCS).map(([name, doc]) => ({ name, title: doc.summary.en })),
  };
}

/** Every column across every section, flattened, with its formula-variable name. */
function flattenColumns(sections: RecordSection[]): Array<{ name: string; column: RecordColumn }> {
  return sections.flatMap((s) =>
    s.columns
      .filter((c) => c.id) // an author mid-typing a new column has no id yet — nothing to insert
      .map((c) => ({ name: `${s.id}_${c.id}`, column: c })),
  );
}

/**
 * Variables available at a COLUMN FORMULA input (row context), for the
 * column identified by (sectionId, columnId).
 *
 * `hasStandardColumn`: the Reference standard group is included only when
 * the template actually has a `standard` column — otherwise every STD_*
 * would resolve to awaiting-input regardless of what is typed, per ADR-013 D4.
 */
export function buildRowFormulaVariables(
  template: Pick<RecorderTemplate, 'sections' | 'roundCount'>,
  sectionId: string,
  columnId: string,
  hasStandardColumn: boolean,
): FormulaVariableGroup[] {
  const selfName = `${sectionId}_${columnId}`;
  const columnEntries: FormulaVariableEntry[] = flattenColumns(template.sections).map(({ name, column }) => ({
    name,
    title: column.label || name,
    disabled: name === selfName,
  }));

  const groups: FormulaVariableGroup[] = [
    { label: "This row's columns", entries: columnEntries },
    envGroup(template.roundCount),
  ];
  if (hasStandardColumn) groups.push(standardGroup());
  groups.push(reportGroup());
  return groups;
}

/**
 * Variables available at a SUMMARY FIELD input (summary context), for the
 * field identified by `fieldId`.
 *
 * No plain columns and no STD_* here — neither resolves in summary context
 * (FORMULA_GRAMMAR §4/§6). Column aggregates (col_mean, …) are functions, not
 * variables, and are covered by the Help modal's Functions tab, not this list.
 */
export function buildSummaryFormulaVariables(
  template: Pick<RecorderTemplate, 'summaryFields' | 'roundCount'>,
  fieldId: string,
): FormulaVariableGroup[] {
  const summaryEntries: FormulaVariableEntry[] = template.summaryFields
    .filter((f: SummaryField) => f.id)
    .map((f) => ({
      name: `SUMMARY_${f.id}`,
      title: f.label || f.id,
      disabled: f.id === fieldId,
    }));

  return [
    envGroup(template.roundCount),
    reportGroup(),
    { label: 'Summary fields', entries: summaryEntries },
  ];
}
