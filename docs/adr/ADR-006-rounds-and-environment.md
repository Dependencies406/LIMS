# ADR-006: Rounds are ordinary columns; round count is a template-level setting

Date: 2026-07-30
Status: Accepted

## Context

The draft requirement stated: "Every template shall have environmental record
field which force user to record temperature in degree celsius and relative
humidity every reading round." The term "reading round" was never defined, and it
determines the entire record data model.

Clarified during grilling: **rounds are repeated reading columns, not repeated
rows.** Ten calibration points measured three times is a **ten-row table with
three reading columns** — not thirty rows and not three row-groups.

Also clarified: a formula variable is `SECTIONID_COLUMNID`, where the column part
identifies a specific column. Since each round *is* its own column with its own
id, **no round index is needed in the formula syntax.**

## Decision

**1. Rounds are ordinary columns.** There is no repeating-column-group construct.
A template author who wants three rounds creates three columns (e.g. `R1`, `R2`,
`R3`) inside a section. A mean across rounds is written explicitly:

```python
def mean3(a, b, c):
    return (a + b + c) / 3
```

used as `mean3(READ_R1, READ_R2, READ_R3)`.

**2. One row axis per record.** Sections are **column groups** — analogous to a
spanning header cell in Excel — not nested tables. One row = one calibration
point. This makes row-by-row evaluation unambiguous and matches the draft's own
phrase "sections (columns group)".

**3. Round count is a template-level setting**, fixed when the template is
authored. It drives **only** the Environment Block. Reading columns remain
free-form ordinary columns.

**4. The Environment Block is built-in, fixed, and non-deletable.** Every
template automatically has a round-indexed block of temperature (deg C) and
relative humidity (%), exactly `roundCount` entries, required and validated.
The author cannot rename or remove it.

## Consequences

Positive:

- **The formula language needs no round syntax at all.** This is a significant
  simplification — no round indices, no group-aggregate functions, no variable
  arity. It keeps ADR-001's subset genuinely small.
- The grid is stable and statically checkable: the PDF template author knows the
  exact column count at authoring time, and every formula reference can be
  validated against a known column set before any data exists.
- The single row axis makes cross-section references well-defined on every row.
- The "shall have" requirement is structurally guaranteed rather than left to
  author discipline.

Negative and accepted:

- **A template is tied to its round count.** A five-round job needs a different
  template — and because templates are 1:1 with equipment type (ADR-003), that
  means a different equipment type or a template revision (ADR-005). If varying
  round counts per job turn out to be common in practice, this decision is the
  first thing to revisit.
- Explicit round columns mean formulas must be rewritten when round count
  changes; they are not round-count agnostic.
- Nothing links a specific reading column to a specific round number. The
  environment block knows there are three rounds; it does not know that `R2` is
  round 2. Consequently the PDF cannot automatically label "Round 2" over the
  right column — the author must label columns themselves. (The rejected
  alternative below would have fixed this.)

## Rejected alternatives

- **Tag columns with a `roundIndex`** — one optional field per column, no formula
  syntax change, and it would let the PDF auto-label rounds and let the
  environment block derive its own count. Rejected in favour of the simpler
  template-level setting. Worth reconsidering if round labelling on certificates
  becomes a requirement.
- **Independent add/remove-rounds control on the environment block** — most
  explicit, but the environment rounds and the reading columns could silently
  drift out of step.
- **Per-row temperature and RH columns** — zero ambiguity, but verbose for the
  technician and repetitive on the certificate; contradicts the per-round
  clarification.
- **Technician sets round count per record** — rejected in favour of fixing it in
  the template, which preserves static validation.

## Resolved: how formulas reference environmental values

Settled by [ADR-009](ADR-009-environment-references.md): a reserved `ENV` section
with auto-generated per-round columns (`ENV_TEMP_R1`, `ENV_RH_R1`, ...), treated
as read-only scalars broadcast to every row. No grammar change, since those names
already match the `SECTIONID_COLUMNID` pattern.
