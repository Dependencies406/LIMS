# Phase 26 — Report blocks, and a builder that isn't scattered

## Model and effort

**Claude Opus 5 · Effort: High**

Opus for one reason: **Task 2 adds a third evaluation context** to an engine that
currently has two. ADR-010's row/summary split is load-bearing for every number on every
certificate, and a third context done carelessly weakens the empty-value semantics
globally without anything visibly breaking — the same consequence profile that put Phases
3, 11 and 12 on Opus.

Everything else here is contained. If the phase must be split, **Tasks 1 and 5-7 can ship
separately from Tasks 2-4** — say so and do the small ones first.

## Sequencing

Task 6 (tabbed workspace) restructures `RecorderTemplateBuilderPage.tsx`, which Tasks 2-5
all add UI to. Do the restructure **first**, then build the new panels into it. Doing it
last means moving everything twice.

---

## Prompt

```
Read first, in order:
  - CLAUDE.md — hard rules
  - docs/adr/ADR-017-report-blocks.md — THE SPEC for Tasks 2-4. D4 and D7 are the two
    with teeth.
  - docs/adr/ADR-010-evaluation-contexts-and-summary-fields.md — the two existing
    contexts and the strict empty semantics you must not weaken
  - docs/adr/ADR-005-record-lifecycle.md — snapshotting, version pinning
  - docs/adr/ADR-011-number-precision-and-formatting.md — display vs stored
  - docs/adr/ADR-004-pdf-record-table-band.md — and read
    src/modules/pdf-template-builder/types.ts:298 (RecordTableElement). Task 4 mirrors
    its shape; do not invent a different one.
  - src/modules/recorder/formula/validator.ts and evaluator.ts — where a context lives
  - src/services/recorderTemplateMockup.ts — evaluateMockup, the row/summary ordering
  - src/pages/RecorderTemplateBuilderPage.tsx — ALL of it before restructuring it

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List

Report each FULL path. `LIMS-New-Backup` exists nested INSIDE the project — confirm no
dev server runs from it; do not modify it (RULE 2, RULE 6).

## TASK 1 — Decimal places on formula columns

`recordingGridDocument.ts:618` applies `numberFormat` only when
`col.column.type === 'number'`, and the builder's Notation/Decimals panel is gated the
same way (`RecorderTemplateBuilderPage.tsx:841`). So a computed column renders at raw
float precision — the `#####` overflow and the `-5.42e-15` the owner reported.

`SummaryField` already carries `numberFormat` (`types/index.ts:901`). Extend the same
field to formula columns; do not invent a parallel mechanism.

  - Apply it in the grid, the mockup harness, the read-only view AND the PDF record
    table. List every path you covered.
  - Rounding is DISPLAY ONLY (ADR-011). The stored value stays full precision. Add a
    test asserting a formatted column's stored value is unchanged.
  - Existing formula columns have no numberFormat. Choose a default, state it, and
    confirm existing templates render no worse than today.

## TASK 2 — The report-block model and its evaluation context

Implement ADR-017 D1-D4. This is the task Opus is here for.

  - New entity per D1: own columns, own rows, per template, pinned on publish (D2).
    Column types text/number/selection/formula — NOT `standard` (D1).
  - Third evaluation context per D4: column aggregates, SUMMARY_*, ENV_*, REPORT_TO_N,
    and the block's own columns for its own row. **`STD_*` is a validation error in
    block context**, not a null.
  - Blocks evaluate AFTER measurement rows and AFTER summary fields.
  - Cross-block references are out of scope. Reject them with a clear message rather
    than half-supporting them.

### The isolation test — this is the point of the task

ADR-010's strict empty semantics must be **unchanged everywhere else**. Add a test in
the same shape as `standardNamespaceIsolation.test.ts`: adding block context must not
change how an empty cell behaves in row context or summary context, and must not make
any previously-erroring case succeed.

If you find yourself relaxing an existing check to make blocks work, stop — that is the
failure mode this test exists to catch.

## TASK 3 — Report text, per-record override, interpolation

ADR-017 D5-D7.

  - Template default; technician may override per record; effective text snapshotted at
    commit (D5).
  - Placeholders resolve through the existing evaluator in block context (D6). No second
    syntax. The template verifier must check placeholder names at Verify time.
  - **D7: an unresolved placeholder renders a loud visible marker and does NOT block
    commit.** This is a deliberate divergence from ADR-010 — implement it as written.
  - **Implement the D7 safeguard: block APPROVE while any marker is unresolved.** If the
    owner has struck that from the ADR by the time you read it, follow the ADR. Report
    which you implemented.
  - The marker must be conspicuous in the record view, the review screen and the PDF
    preview. Not grey, not small.

## TASK 4 — PDF elements for blocks

Per D9: `report-block-table` and `report-block-text`, shaped like `RecordTableElement`.

The renderer reads block content from the record's **pinned snapshot**, never the live
template. Any template reference on the element is authoring-time only for the properties
panel — copy how `recorderTemplateId` is already documented and used.

## TASK 5 — Sample data that persists, and fill-down

**5a. Sample data (D8).** Its own collection keyed by template id. It must NEVER enter
the published version snapshot — add a test asserting a published snapshot contains no
sample data. Unknown column keys are ignored, not errors; report how many were dropped.

**5b. Fill-down.** In the recording grid, apply the first row's value down the whole
column. Confirm first, stating how many cells will be overwritten. Applies to input
columns only — never a formula column. The write goes inside Phase 19's
`isProgrammaticWriteRef` guard.

## TASK 6 — Tabbed workspace — DO THIS FIRST

Phase 16 added a navigator rail and landscape columns; the owner still finds the builder
scattered and scroll-heavy.

Restructure into top-level tabs, each filling the viewport with no competing panels:
**Sections · Report Blocks · Custom Functions · Test Data · Settings**. Phase 16's rail
navigates *within* the active tab.

  - Inventory every interactive control before moving anything, and report the list.
    A refactor that silently drops a control will not fail a type-check — this already
    happened once in Phase 16.
  - Validation badges must remain visible across tabs. An error in Sections must be
    discoverable while standing in Report Blocks, or the tabs have hidden the problem
    rather than organised it.
  - Remember the active tab for the session.
  - Keep every existing aria-label; tests query by them.

## CONSTRAINTS

- Do NOT weaken ADR-010's empty-value semantics in row or summary context.
- Do NOT allow STD_* in block context.
- Do NOT let sample data reach a published snapshot or a record.
- Do NOT let a block PDF element read the live template at render time.
- Do NOT round during evaluation (ADR-011). Task 1 is display only.
- Do NOT remove summary fields (ADR-017 D10).
- Do NOT weaken, reorder or bypass Phase 19's guards.
- Do NOT drop any existing control in the Task 6 restructure.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or LIMS-New-Backup/.
- SHOW ME proposed Firestore rules before applying them (Task 5a needs a new collection).
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. A formula column honours its decimals in grid, harness, read-only view and PDF
  2. A formatted column's STORED value is full precision, unrounded
  3. Block context resolves aggregates, SUMMARY_*, ENV_*, REPORT_TO_N and its own row
  4. STD_* in a block formula is a validation error
  5. THE ISOLATION TEST — row and summary context behave identically to before
  6. Blocks evaluate after summary fields
  7. Per-record text overrides the template default; the template default moving does
     not change a committed record
  8. An unresolved placeholder renders a marker, commits, and blocks approve
  9. A published version snapshot contains NO sample data
 10. Sample data with unknown column keys loads the rest and reports the drop count
 11. Fill-down confirms, overwrites input columns, never touches a formula column, and
     goes through the Phase 19 guard
 12. Every control from the Task 6 inventory still exists and is still wired
 13. Phase 19's RecordingGrid tests pass UNCHANGED, break-and-revert still fails them
     when guards are disabled

Run npm test and tsc --noEmit. Report both, with before and after counts.

## DEFINITION OF DONE

  1. Pre-work, branch, LIMS-New-Backup confirmation
  2. Proposed Firestore rules, shown BEFORE applying
  3. The Task 6 control inventory, and confirmation every item survived
  4. Every render path where formula-column decimals now apply
  5. Where block context is defined, and how you confined it so it cannot affect row or
     summary context — plus the isolation test that would catch it if it did
  6. Whether you implemented the D7 approve-gate safeguard, or the ADR had removed it
  7. Confirmation sample data cannot reach a snapshot, and where that is enforced
  8. Diff summary per file
  9. npm test and tsc output
 10. Anything unverified, stated as UNVERIFIED — this phase is heavily visual, so list
     exactly what the owner must check by eye
```

---

## The thing I'd want you to reconsider

**D7 lets a certificate carry `[unresolved: …]`.** You chose the marker over blocking the
commit, and the reasoning holds — prose is not a measurement, and one broken sentence
shouldn't strand a whole record.

But the gap between "committed" and "issued to a customer" is exactly one approval. So the
ADR proposes blocking **approve** rather than commit: the technician still works and
commits freely, and the marker cannot survive to a certificate. It's marked as strikeable
in ADR-017 D7 if you disagree.

## What I'd add that you didn't ask for

**Nothing in this phase.** It is already five features plus a restructure, and Task 2
changes the evaluation engine. Two things are queued and worth naming so they don't get
lost:

- **Phase 17 (formula autocomplete)** is written and unrun. It would help block formulas
  as much as column formulas — worth running after this, not during.
- **Phase 10 (formula help, bilingual)** is written and unrun. Block context adds a third
  set of rules an author must learn; the reference document should describe it before the
  laboratory starts using blocks in anger.
