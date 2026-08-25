# ADR-017: Report blocks — tables and text with their own row axis

Date: 2026-08-20
Status: Accepted

**Extends [ADR-010](ADR-010-evaluation-contexts-and-summary-fields.md)** with a third
evaluation context, and **[ADR-004](ADR-004-pdf-record-table-band.md)** with a second
table element. Summary fields are not replaced; see D10.

## Context

Summary fields compute one value per record. A certificate needs more than that: an
uncertainty budget with a row per contributor, a conformity statement, a methods
paragraph, sometimes several tables.

These cannot be sections. Phase 21 established the invariant that a `RecordRow` spans
every section — row 3 is one calibration point in all of them, and that shared row axis is
what keeps a measurement aligned with its own results. A budget has a row per
*contributor*; a statement has no rows at all. Forcing them onto the calibration-point
axis would mean a 5-point run produces exactly 5 budget rows, which is nonsense.

The PDF side is already half-built. `RecordTableElement` (`pdf-template-builder/types.ts:298`)
selects `${sectionId}_${columnId}` keys and renders them from the record's **pinned
snapshot**, never the live template. That design is right and this ADR reuses its shape.

## Decisions

### D1 — A report block is a new entity with its own row axis

A block has its own ordered columns and its own rows, independent of calibration points.
One template may hold many blocks, ordered for the report.

Column types match sections — text, number, selection, formula — so an author learns one
model. `standard` is excluded: a block row is not a calibration point.

### D2 — Blocks belong to one template and are pinned on publish

No shared library. A block lives inside its template and is copied into the published
version snapshot exactly like sections, so a committed record reproduces from its own
snapshot without reaching outside it (ADR-005).

Reuse across templates is a real want and can be added later as **copy-on-insert**. It
must never become a live link — a published snapshot cannot depend on a document that can
still change.

### D3 — Block cells are typed or computed, like section columns

Typed columns for hand-entered contributors, formula columns for combinations. Computing
uncertainty elsewhere and retyping the answer is how transcription errors reach
certificates.

### D4 — A third evaluation context: block context

A block formula sees:

- **Column aggregates** over measurement data (`col_mean`, `col_max`, …)
- **`SUMMARY_*`**, `ENV_*`, `REPORT_TO_N`
- **Its own block's columns, for its own row**

It does **not** see `STD_*`. That resolves per calibration point and has no meaning in a
block row. Referencing it is a validation error, not a null.

Blocks evaluate **after** all measurement rows and after summary fields, so aggregates are
available. Block-to-block references across different blocks are out of scope; if they
turn out to be needed, that is a later amendment with its own cycle detection.

The strict empty semantics of ADR-010 apply unchanged.

### D5 — Static text: template default, editable per record

A text block carries wording authored on the template. A technician may override it for
one record — needed for per-job remarks.

Because it becomes record data, **the effective text is snapshotted at commit** (ADR-005).
A template edit never moves text on an already-committed record.

An unedited block on a draft shows the template's current default. Once edited, the
record's own copy wins.

### D6 — Text may interpolate values, using the existing formula language

Placeholders resolve through the same evaluator, in the D4 context. No second syntax.

The template verifier must check placeholders the same way it checks column formulas — an
unknown name is an authoring error and must surface at Verify, not on a certificate.

### D7 — An unresolved placeholder renders a visible marker and does NOT block commit

**This is a deliberate divergence from ADR-010's strictness**, chosen by the owner on
2026-08-20. Everywhere else, an unresolvable value blocks the commit. Here the sentence
prints with a conspicuous marker — e.g. `[unresolved: ENV_TEMP_R1]` — and the record can
still be committed.

The reasoning for the divergence: prose is not a measurement, and blocking a whole record
because one optional sentence cannot resolve is disproportionate.

The risk it accepts: **a certificate could be issued with a marker printed on it.**

> **Proposed safeguard — the owner may strike this.** Do not block *commit*, but do block
> *approve*. The approver is the last gate before a certificate leaves the laboratory, so
> an unresolved marker should stop there rather than at the technician's desk. This keeps
> the workflow moving and still makes it impossible to issue a defective certificate.

The marker must be visually loud in the record view, in the review screen, and in any PDF
preview — never a subtle grey. A marker nobody notices is worse than blocking.

### D8 — Saved sample data lives outside the template

Test data is stored in its own collection, keyed by template id.

It must **never** enter the published version snapshot. Anything on the template document
is copied into every published version and pinned by every record — test data inside a
calibration record would be indefensible.

Sample data keyed to columns that no longer exist is stale, not an error: ignore unknown
keys, keep the rest, and say how many were dropped.

### D9 — A new PDF element for blocks, mirroring `record-table`

`report-block-table` and `report-block-text`, shaped like `RecordTableElement`: the
element names the block, and the renderer reads content from the record's **pinned
snapshot**, never the live template. Any authoring-time template reference is for the
properties panel only, exactly as `recorderTemplateId` already is.

### D10 — Summary fields stay

Blocks do not replace them. A summary field remains the right tool for one value per
record, and `SUMMARY_*` is referenced by blocks (D4) and by the existing PDF path.
Removing them would break every template already using them.

## Consequences

Positive:

- Budgets, statements and multiple tables become expressible
- Report content reproduces from the pinned snapshot like everything else
- One formula language, one set of column types, one evaluator
- Test data stops being retyped, without polluting records

Negative and accepted:

- A third evaluation context to document, validate and test
- D7 accepts that a marker can reach a committed record. Mitigated by loud rendering and,
  if the safeguard stands, by the approve gate.
- Per-record text means report wording is now record data, with the snapshot obligations
  that carries
- Blocks are per-template, so a standard budget is retyped per template until
  copy-on-insert exists
