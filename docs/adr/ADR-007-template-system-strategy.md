# ADR-007: Extend the TREB and PDF builder systems rather than build a fifth

Date: 2026-07-30
Status: Accepted

## Context

**Four template systems already exist in this codebase.** The module as drafted
would have been the fifth. This is the largest risk in the plan — larger than the
PDF question the requirements flagged.

| # | System | Key files | Purpose |
|---|---|---|---|
| 1 | Column/formula templates | `services/templateService.ts`, `types/template.ts`, `components/TemplateBuilder.tsx` | Columns + formulas via `hot-formula-parser` |
| 2 | TREB spreadsheet templates | `services/spreadsheetTemplateService.ts`, `modules/spreadsheet-templates/types.ts` | `@trebco/treb` 38.6 docs, tabs, print areas, unlock-password hash |
| 3 | Spreadsheet engine module | `modules/spreadsheet/services/{formulaParser,spreadsheetEngine,uncertaintyEngine}.ts` | Own tokenizer/AST, cross-tab refs, uncertainty |
| 4 | PDF template builder | `services/pdfTemplateService.ts`, `modules/pdf-template-builder/**`, `types/pdfTemplate.ts` | Canvas builder + renderer |

Overlap with the draft requirements is substantial:

- "Define sections and columns" — #1 does flat columns (`ColumnDefinition`), #2
  does tabs, #3 does the grid. **Section-grouped columns are genuinely new.**
- "Spreadsheet-style UI, input into specific columns only" — #2 is already a real
  spreadsheet and already carries `unlockPasswordHash`
  (`modules/spreadsheet-templates/types.ts:21-22`) plus
  `SpreadsheetProtectionSettingsModal.tsx`. **Cell protection is already
  plumbed.**
- "Formula Engine" — #1 and #3 are two existing engines.
- "PDF Render Engine" — #4 is ~80% of it (see ADR-004).

Note also that **two grid libraries coexist**: `handsontable` 12.2 and
`@trebco/treb` 38.6 (`package.json:13,14,20,21`).

## Decision

Build the Data & Information Management Module as a **layer on top of the
existing TREB spreadsheet templates (#2) and PDF template builder (#4)**, adding
only what is genuinely new:

- Section-grouped column definitions (new)
- The Recorder Template entity, bound 1:1 to Equipment Type (new — ADR-003)
- The Record entity with lifecycle and version pinning (new — ADR-002, ADR-005)
- The Python-syntax Expression Interpreter, built on #3's tokenizer (new —
  ADR-001)
- The Record Table Band PDF element (new — ADR-004)

Reused rather than rebuilt: the TREB grid and its cell protection, the PDF
element model, builder canvas, renderer, font manager and Thai text handling, and
`#3`'s tokenizer and AST infrastructure.

## Consequences

Positive:

- Avoids duplicating four subsystems.
- Inherits solved problems: cell protection, Thai/complex-script PDF layout,
  undo/redo, clipboard, print areas, template validation and audit.
- Users learn one spreadsheet interaction model, not two.

Negative and accepted:

- **Constrained by existing designs.** TREB's document model and the PDF
  element model were not designed for this use case, and the mixed
  absolute/flowing layout in ADR-004 is a direct consequence.
- Requires reading these systems in depth before building. Much of #2, #3 and #4
  was **not read in depth during the audit** and remains **[UNVERIFIED]** in its
  details — particularly `pdfTemplateRenderer.ts`, `spreadsheetEngine.ts`,
  and TREB's protection semantics.
- Risk of regression in shared code paths that existing features depend on.
- Does not resolve the underlying duplication: systems #1 and #3 still overlap,
  and handsontable and TREB still coexist.

## CORRECTION (2026-07-30, after Phase 5b's TREB research)

This ADR claimed **"Cell protection is already plumbed"**, citing
`unlockPasswordHash` and `SpreadsheetProtectionSettingsModal.tsx`. Verified against
the code during Phase 5b, **that claim was misleading**:

- The only wired protection path is **a human clicking a toolbar button on a
  manually-authored template**, gated by a password. There is no programmatic
  "mark this generated column read-only".
- The app's own attempt to model it as data — `Cell.isLocked` in
  `SpreadsheetModel` — is **dead code**. It is set on the model but never reaches
  TREB's real `style.locked`.

Two further findings that also contradict this ADR's "inherits solved problems"
framing:

- **Spanning section headers have no precedent.** `MergeCells` is used only to
  *read* existing merges for PDF rendering, never to *create* them from a data
  model at runtime.
- **There is no per-cell change event** — only a coarse `document-change` carrying
  no address, so live recalculation means diffing the whole serialized document.
- The one heavily-used wrapper, `SpreadsheetGrid.tsx` (1,411 lines), reaches deep
  into **undocumented TREB internals** (`sheet.grid.active_sheet.CellData`,
  hardcoded internal command keys, DOM `querySelector` toolbar hacks). Fragile and
  version-coupled — not a pattern to replicate.

**This is the same class of error as the ADR-004 correction:** a capability was
asserted from file names and type declarations without reading the implementation
that would have shown it inert.

**The decision itself still stands** — extending TREB remains right, and Phase 5b
did so successfully. But it was **new integration work against TREB's public API**
(`SetRange`, `ApplyStyle`, `MergeCells`, `GetRange`, `Subscribe`), not the wiring-up
of existing plumbing this ADR implied. Phase 5b correctly avoided the
internals-reaching wrapper and accepted a simpler interaction model (no custom
context menu, no toolbar injection) as the price.

## Follow-up: consolidation is deferred, not solved

The cheapest total path was arguably to audit and retire dead systems **first**.
That was not chosen, so the duplication remains. Recommended follow-up, separate
from this module:

1. Determine whether system #1 (`templateService` / `TemplateBuilder.tsx` /
   `formulaEngine.ts`) still has live callers, or is superseded dead code.
2. Determine whether `handsontable` can be dropped in favour of TREB.
3. If #1 is dead, remove it — it is the most confusing overlap, since it owns the
   generic name "Template".

**Do not delete anything on the strength of this ADR.** Per project `CLAUDE.md`
RULE 2, run the diffs and confirm live callers first, then get explicit
authorisation.
