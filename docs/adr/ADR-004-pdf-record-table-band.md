# ADR-004: Record table renders as a dynamic element in the existing slice-plan pagination

Date: 2026-07-30
Status: Accepted (**revised** — supersedes the original draft of this ADR)
Resolves: the open question about `treb-table` pagination

> **Revision note.** The first version of this ADR was based on a misreading. It
> documented `src/types/pdfTemplate.ts` (`ReportTemplate` / `ReportSection` /
> `DataSourceKey`, absolute `Position` in mm) and proposed a new
> `jspdf-autotable`-based element that would *displace* subsequent elements by its
> measured height. **All three premises were wrong:** that type system is not
> what the renderer uses, the renderer already has a pagination mechanism, and it
> has no displacement model. Corrected below.

## Context — corrected

### There are two parallel PDF template systems, and one is not wired up

| System | Types | Positions | Renderer | Live? |
|---|---|---|---|---|
| A | `src/types/pdfTemplate.ts` — `ReportTemplate`, `ReportSection`, `ReportElement`, `DataSourceKey` | mm | none found | **No live callers found** |
| B | `src/modules/pdf-template-builder/types.ts` — `PdfElementType`, `PdfElement`, `pages` | pt | `src/services/pdfTemplateRenderer.ts` | **Yes** |

System A is imported only by `src/components/pdf/PdfTemplateEditor.tsx` and
`src/utils/pdfAlignmentHelpers.ts`. `PdfTemplateEditor` is exported from
`src/components/pdf/index.ts` but **no import of it was found anywhere in
application code** — only in its own `README.md`. It is a strong dead-code
candidate.

**Per project `CLAUDE.md` RULE 2, nothing here authorises deleting it.** This is a
report of what was found, not a recommendation to remove anything. Confirming
liveness requires checking the router and the settings pages directly.

**This module therefore targets System B.**

### System B already has a generic overflow/pagination mechanism

```ts
// pdfTemplateRenderer.ts:72-77
export type ElementSlicePlan = {
  elementId: string;
  slices: Array<{ start: number; end: number }>;
  splitCount: number;
};
```

The documented model (`pdfTemplateRenderer.ts:169-175`):

- Per template page, sub-page count = `max(splitCount)` among **dynamic** elements
  on that page (`countSubPagesFromPlans`, `:380-392`).
- `buildElementSlicePlansForTemplatePage` (`:394-415`) builds a plan per dynamic
  element, dispatching by element type.
- The render loop emits `subCount` physical pages per template page, calling
  `pdf.addPage(...)` between them (`:200-203`).

`planEquipmentTableElement` (`:417-430`) is the reference implementation:

```
measureEquipmentTableHeights(pdf, element, jobData) -> { headerHeight, rowHeights }
getTableViewportHeight(element, pageDimensions)     -> available height
computeTableRowSlices(headerHeight, rowHeights, viewport) -> slices
-> { elementId, slices, splitCount: slices.length }
```

Two details that matter a great deal here:

- **Header repeat is already solved.** `computeTableRowSlices` (`:354-378`) begins
  every slice with `used = headerHeight`, so each continuation page reserves room
  for the header.
- **Viewport** is the element's explicit `height`, or else
  `pageHeight - element.y - 50pt` bottom margin (`getTableViewportHeight`,
  `:344-349`).

### There is no displacement model

Absolute positions stay fixed. Overflow produces **sub-pages**, and a dynamic
element renders its slice into the same absolute box on each one. Static elements
**repeat** on overflow pages rather than move — `shouldRepeatOnOverflowPages`
returns `el.repeatOnOverflowPages ?? true` (`:340-342`).

`elementIsDynamic` (`:326-333`) defaults `equipment-table`, `documents-table`, and
`treb-table` to dynamic; everything else is static with opt-in via an "Overflow
Pagination control in the properties panel".

### `treb-table` does not paginate

Explicitly excluded, in two places:

- `:174` — "`treb-table`: always drawn in full on every sub-page (splitCount 1 for
  planning)."
- `:384-387` — `countSubPagesFromPlans` forces `maxSub = max(maxSub, 1)` for
  `treb-table` and skips its plan.

So although `treb-table` is *marked* dynamic, it is **never sliced**. A
`treb-table` taller than its viewport will not break across pages, and it repeats
in full on every sub-page. **Reusing it would not give us pagination.**

## Decision

Add a **`record-table`** element to System B that implements the existing
slice-plan contract — the same way `equipment-table` does.

1. Add `'record-table'` to `PdfElementType`
   (`modules/pdf-template-builder/types.ts:9-19`).
2. Define `RecordTableElement` with the record's column selection
   (`SECTIONID_COLUMNID` keys), section-grouping header, and cell/header styles.
3. Implement `measureRecordTableHeights` and `planRecordTableElement`, modelled
   on `measureEquipmentTableHeights` / `planEquipmentTableElement`.
4. Register it in `elementIsDynamic` (default dynamic) and in the dispatch inside
   `buildElementSlicePlansForTemplatePage`.
5. Bind summary values as ordinary scalar elements via `record.summary.<id>`
   (ADR-010) — no table machinery needed for those.

**No new pagination engine. No `jspdf-autotable` integration. No displacement
logic.**

## Consequences

Positive:

- **Substantially cheaper than the original plan.** Pagination, sub-page
  counting, header repeat, and viewport computation all already exist and are
  exercised by two shipping element types.
- Consistent behaviour with `equipment-table` and `documents-table`, so authors
  encounter one overflow model rather than two.
- Inherits `pdfFontManager` and the `linebreak` / `grapheme-splitter` handling, so
  Thai and complex-script layout is not re-fought.
- The "mixed layout model will confuse authors" worry from the original draft
  **disappears** — there is no displacement, so nothing moves unexpectedly.
- Dynamic column count (rounds as columns, ADR-006) is not a problem for this
  mechanism: `measure*Heights` computes from the actual column set at render time.

Negative and accepted:

- Column widths must still be computed or declared proportionally, since the
  column count varies with round count.
- The slice model is row-wise only. A record table too **wide** for the page will
  not split across pages; it must fit, be scaled, or use landscape. Worth
  confirming against your widest real template before Phase 6.
- The overflow model is documented as "v1" (`:170`) and assumes non-overlapping
  vertical layout for stacked dynamic tables. A record table stacked with another
  dynamic table on one page inherits that limitation.
- `measureRecordTableHeights` must handle wrapped text in cells to compute row
  heights correctly, mirroring whatever `measureEquipmentTableHeights` does.

## Follow-up

- **`treb-table`'s non-pagination is a latent bug for existing users**, not just a
  constraint on us: a spreadsheet tab taller than its box silently fails to
  break. Worth raising separately from this module.
- If `record-table` and `treb-table` end up overlapping in purpose, prefer
  `record-table` for records and leave `treb-table` for template-tab rendering.
