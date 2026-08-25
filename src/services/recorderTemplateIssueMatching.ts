/**
 * recorderTemplateIssueMatching.ts
 *
 * Maps `verifyTemplate`'s flat `ValidationIssue[]` (and Phase 15 Task 3's
 * `ConversionFactorWarning[]`) back onto the section/column each one is
 * ABOUT, so the template builder's navigator panel can badge the exact
 * section or column with a problem instead of only showing one long list at
 * the top of the page.
 *
 * Deliberately does NOT reimplement or re-derive any validation rule — it
 * only parses the STABLE, already-existing message shapes those two
 * functions produce (verified by reading recorderTemplateValidation.ts in
 * full). `verifyTemplate`/`findMissingConversionFactorWarnings` remain the
 * one and only source of truth for what IS an issue; this module only
 * decides WHERE to show it.
 *
 * Two message shapes are matched:
 *   1. Every column-scoped issue after Phase 15 is prefixed with (or
 *      otherwise contains) the column's full key, `SECTIONID_COLUMNID`, as a
 *      whole word — formula-column errors from the Phase 3 interpreter
 *      ("`${formula.column}: ...`"), the Task 1/2/3 unit-mode/unit-reference
 *      messages, "Formula column '...' has no expression.", "Selection
 *      column '...' has no choices.", and every Task 3 conversion-factor
 *      warning ("Column '...' uses a STD_C coefficient...").
 *   2. The two id-shape/reserved-id messages are the only ones that do NOT
 *      embed the full key — they quote the section id and column id
 *      SEPARATELY (`idIssue` in recorderTemplateValidation.ts). Matched by
 *      their own fixed shape instead.
 *
 * An issue that matches neither shape (roundCount, a custom-function-only
 * error, a SUMMARY_ field error, a cross-column formula cycle naming
 * several columns) is simply not attributed to any single section/column —
 * it stays visible in the top Verify banner, which this module never hides
 * or filters (an unattributed issue is a case this module intentionally
 * leaves alone, not a bug).
 */

import type { ConversionFactorWarning } from './recorderTemplateValidation';
import type { RecorderTemplate } from '../types';
import type { ValidationIssue } from '../modules/recorder/formula';

export interface IssueBadge {
  hasError: boolean;
  hasWarning: boolean;
}

export interface IssueBadgeMap {
  /** Keyed by section array index — a section id can be blank/duplicate mid-edit, so index is the stable handle. */
  sections: Record<number, IssueBadge>;
  /** Keyed by `${sectionId}_${columnId}`. */
  columns: Record<string, IssueBadge>;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `Column (in section 'CAL') id 'NOM' must be uppercase...` — idIssue's column-shape, from validateStructure. */
const COLUMN_ID_ISSUE = /Column \(in section '([^']*)'\) id '([^']*)'/;
/** `Section id 'ENV' is reserved...` / `Section id 'CAL' must be uppercase...` / `Section id 'CAL' is used more than once.` */
const SECTION_ID_ISSUE = /^Section id '([^']*)'/;

function mark(badge: IssueBadge | undefined, isWarning: boolean): IssueBadge {
  const next = badge ?? { hasError: false, hasWarning: false };
  if (isWarning) next.hasWarning = true;
  else next.hasError = true;
  return next;
}

/**
 * Builds the section/column badge map from the SAME issues/warnings arrays
 * the Verify button and the Task 3 banner already display. Pass `issues:
 * []` and/or `warnings: []` (or `null`) when Verify hasn't been run yet /
 * the template is clean — every entry is simply absent, matching "no badge
 * shown" for a template with nothing to report.
 */
export function buildIssueBadgeMap(
  template: Pick<RecorderTemplate, 'sections'>,
  issues: ValidationIssue[] | null | undefined,
  warnings: ConversionFactorWarning[] | null | undefined,
): IssueBadgeMap {
  const sections: Record<number, IssueBadge> = {};
  const columns: Record<string, IssueBadge> = {};

  // Every real column key, plus which section index it belongs to, so a
  // whole-key text match can mark both the column AND its parent section in
  // one step.
  const keyToSectionIdx = new Map<string, number>();
  template.sections.forEach((section, sIdx) => {
    if (!section.id) return;
    for (const column of section.columns) {
      if (!column.id) continue;
      keyToSectionIdx.set(`${section.id}_${column.id}`, sIdx);
    }
  });
  // Longest key first, so e.g. `CAL_NOM2` is tried before `CAL_NOM` and a
  // shorter key that happens to be a prefix of a longer real one can't
  // falsely claim a match meant for the longer one.
  const keysByLengthDesc = [...keyToSectionIdx.keys()].sort((a, b) => b.length - a.length);

  const sectionIdById = new Map<string, number>();
  template.sections.forEach((section, sIdx) => {
    if (section.id) sectionIdById.set(section.id, sIdx);
  });

  function markSection(sIdx: number, isWarning: boolean) {
    sections[sIdx] = mark(sections[sIdx], isWarning);
  }
  function markColumn(key: string, sIdx: number, isWarning: boolean) {
    columns[key] = mark(columns[key], isWarning);
    markSection(sIdx, isWarning);
  }

  function attribute(message: string, isWarning: boolean) {
    const columnIdShape = message.match(COLUMN_ID_ISSUE);
    if (columnIdShape) {
      const [, sectionId, columnId] = columnIdShape;
      const sIdx = sectionIdById.get(sectionId);
      if (sIdx !== undefined) {
        if (columnId) markColumn(`${sectionId}_${columnId}`, sIdx, isWarning);
        else markSection(sIdx, isWarning);
      }
      return;
    }

    const sectionIdShape = message.match(SECTION_ID_ISSUE);
    if (sectionIdShape) {
      const sIdx = sectionIdById.get(sectionIdShape[1]);
      if (sIdx !== undefined) markSection(sIdx, isWarning);
      return;
    }

    for (const key of keysByLengthDesc) {
      if (new RegExp(`\\b${escapeRegExp(key)}\\b`).test(message)) {
        markColumn(key, keyToSectionIdx.get(key)!, isWarning);
        // A message can legitimately name more than one column (a formula
        // cycle, a sameAs chain) — keep scanning instead of stopping at the
        // first match, so every column it mentions gets badged.
      }
    }
  }

  for (const issue of issues ?? []) attribute(issue.message, false);
  for (const warning of warnings ?? []) attribute(warning.message, true);

  return { sections, columns };
}
