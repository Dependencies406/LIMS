# Data & Information Management Module — Glossary (Ubiquitous Language)

Date: 2026-07-30
Status: agreed during design grilling session

These terms are binding. Code, UI labels, Firestore field names, and future docs
should use exactly these words. Where a term replaces sloppier language from the
original draft, the superseded phrasing is noted.

---

## Core entities

**Equipment Type**
A class of instrument (e.g. "Digital Caliper", "Pressure Gauge"). **This is the
same record as the certificate number configuration** — one instrument type, one
certificate series, one Recorder Template, strictly 1:1:1 (ADR-012).

Its Firestore **document id** is the stable key referenced by `Equipment` and
`RecorderTemplate`. Its `name` is a display label and may be renamed freely,
because nothing keys on it.

> **For developers:** the underlying collection is named
> `certificate_number_configs`, and fields called `equipmentTypeId` point at
> documents in it. The mismatch is deliberate — renaming the collection would mean
> copying live certificate counters. See ADR-012.

*Supersedes:* the separate `EquipmentType` entity created by ADR-003 and built in
Phase 1, now retired. *Replaces:* the dead free-text
`CertificateNumberConfig.equipmentType` string, which was never persisted.

**Certificate Number Category** — *do not use.* The old UI wording ("Add
category", "Edit category") for what is now called an Equipment Type. The
laboratory says "equipment type"; the interface should too.

**Recorder Template**
The authored definition of how one Equipment Type is recorded: its sections,
columns, custom functions, round count, and record-number format. Bound 1:1 to
an Equipment Type.
*Not to be confused with:* Spreadsheet Template (TREB document), PDF Report
Template, or the legacy column/formula Template. See ADR-007.

**Recorder Template Version**
An immutable published snapshot of a Recorder Template, including its custom
functions. Records pin to a version, never to a mutable template. This is what
makes a closed record reproducible.

**Record**
One filled-in instance of a Recorder Template, bound to exactly one Item on one
Job. Lives in its own top-level Firestore collection — **not** inline on the job
document. Carries a lifecycle state and a pinned template version.
*Replaces:* "Record Doc" from the draft.

**Item**
One piece of customer equipment on a job — an element of `Job.equipment`. Must
have a stable, non-optional `id` before it can be bound to a Record.
*Note:* the codebase type is named `Equipment`; "Item" is the domain word used
in the UI ("Items tab") and is preferred in conversation to avoid collision with
Equipment Type.

---

**Allocate (a certificate number)**
To consume the next number in an Equipment Type's certificate series and bind it
to a job item. Allocation is **clerical, not an act of authority** (ADR-019 D1):
any signed-in user may allocate. It is distinct from **configuring** a series
(prefix, padding, reset policy), which remains admin-only. Prefer "allocate" over
"generate" — "generate" suggests a number is computed and could be recomputed,
when in fact it is taken from a sequence and cannot be taken twice.

> **For developers:** the UI control is still labelled Generate. That is the
> superseded wording; new code, docs and labels should say Allocate.

**Burned number**
A certificate number that was allocated and will never appear on an issued
certificate — typically because the job was cancelled afterwards. Burned numbers
leave a **gap** in the certificate register. Gaps are accepted (ADR-019 D6) and
must be explainable: the system records which job consumed each number. Burned
numbers are never recycled, following ADR-008's reasoning for record numbers.

**Certificate register**
The ordered sequence of certificate numbers issued for an Equipment Type. An
assessor reads it for duplicates and unexplained gaps; those two failure modes are
what ADR-019's server-side allocation exists to prevent and to explain.

---

## Template structure

**Section**
A named **group of columns** within the single record table — analogous to a
merged header cell spanning several columns in Excel. A section is *not* a
separate table and does *not* have its own row axis.
Carries a `sectionId` used as the first half of a formula variable.

**Column**
One field within a section. Carries a `columnId` used as the second half of a
formula variable. Has a type: `text`, `number` (with decimal places),
`selection` (fixed choice list), or `formula` (computed, read-only).

**Row Axis**
The record has **one** row axis shared by all sections. One row = one
calibration point. Because sections are column groups rather than nested
tables, row-by-row formula evaluation is unambiguous.

**Round**
One repetition of a measurement across the same set of calibration points.
Rounds are represented as **ordinary additional columns**, not as repeated rows
and not as a special repeating-group construct. Three rounds over ten
calibration points is a ten-row table with three reading columns.
*Consequence:* the formula language needs no round syntax. A mean across rounds
is written by naming the three columns explicitly.

**Round Count**
A template-level integer declaring how many rounds the template expects. It
drives **only** the Environment Block. Reading columns remain free-form.
See ADR-006.

**Environment Block**
A built-in, fixed, non-deletable per-round structure holding temperature (deg C)
and relative humidity (%). Exactly `roundCount` entries. Cannot be renamed or
removed by the template author, satisfying the "every template shall have"
requirement.

**Custom Function**
A user-authored, named, single-expression function in Python-like syntax,
stored on the template and evaluated by the interpreter. Form:
`def name(params): return <expression>`. See ADR-001.

**Formula Variable**
A reference of the form `SECTIONID_COLUMNID` resolving to that column's value
**in the current row**. There is no row index and no round index in the syntax.

**Reserved Section**
A section id the template author may not use, because the system generates it:
`ENV` (environmental values, ADR-009) and `SUMMARY` (record-level fields,
ADR-010). These two are the only reserved ids.

**Row Context**
The evaluation context for formula columns. Runs once per row. Sees
`SECTIONID_COLUMNID` for the current row and `ENV_*` broadcast scalars. Cannot
see summary fields or use column aggregates.

**Summary Context**
The evaluation context for summary fields. Runs once per record, after all rows.
Sees `ENV_*`, other `SUMMARY_*` fields, and column aggregates.

**Summary Field**
A record-level computed value (maximum deviation, mean error, pass/fail verdict),
referenced as `SUMMARY_<id>` and bindable into the PDF. Introduced because row
formulas alone could not produce any record-level value. (ADR-010)

**Number Format**
A per-column display setting: `notation` (`fixed` or `scientific`) plus
`decimals`, which means decimal places in fixed mode and mantissa precision in
scientific mode. **Display only** — stored values are always full precision.
(ADR-011)

**Round-on-Display**
The precision policy: values are stored and computed at full precision, and
rounded only when rendered to the grid or the PDF. Formulas and aggregates always
consume unrounded values. (ADR-011)

**Column Aggregate**
A whitelisted function computing across all rows of one column —
`col_mean`, `col_max`, `col_min`, `col_sum`, `col_count`, `col_stdev`. Valid only
in the summary context; the argument must be a bare column reference. These
supply row-spanning computation without admitting loops into the language.

---

## Record lifecycle

**Draft**
Created, editable, carries **no record number**. Not yet part of the quality
record.

**Committed**
Explicitly saved by the technician. A record number is allocated atomically at
this moment. Data becomes immutable.

**Reviewed** / **Approved**
Successive sign-off states, aligning with the existing
`technicalReviewerSignature` on the job types.

**Superseded**
A committed record replaced by a Revision. Retained, never deleted, and linked
to its replacement.

**Revision**
A new Record created to correct a Committed (or later) record. Links back to the
record it supersedes. Corrections never mutate a committed record in place.
See ADR-005.

---

## PDF

**PDF Report Template**
The existing `ReportTemplate` in `src/types/pdfTemplate.ts` — sections of
absolutely-positioned elements. Reused as-is, not replaced.

**Record Table Band**
A new, flowing PDF element that renders a Record's row data as a table with a
dynamic row count, repeated column headers on continuation pages, and measured
height that displaces subsequent elements. The one genuinely new piece of PDF
machinery. See ADR-004.

---

## Validation (ADR-018)

**Calculation Trace**
The recursive record of how one value was produced: its formula, its substituted
expression, its raw result, its displayed result, and — for each input — either
that input's own trace or its provenance. Rendered one line per formula,
expandable. The primary evidence for clause 7.11.6.
*Not to be confused with:* the legacy `formulaVerificationService`, which builds
the same shape for the old spreadsheet module against `SpreadsheetModel` and
cannot be pointed at a Record.

**Provenance**
The origin tag carried by every non-computed value in a trace: `entered`,
`reference-standard`, `template-constant`, `environment`, or `record-scalar`.
Provenance is what makes a calculation *checkable* rather than merely visible.

**Reference Case**
One set of input values with known-correct expected outputs, used to validate a
Recorder Template Version. Carries a `source` (`hand-calculation`,
`legacy-workbook`, `published-example`, `pt-ilc`) and its own declared numeric
tolerance. The software equivalent of a reference standard.

**Validation Dossier**
The retained evidence that one Recorder Template Version was validated: its
reference cases, the traces produced, the comparison outcome, any deviations, and
the signature. One per version, immutable once signed, stored at
`recorderTemplateValidations/${templateId}_v${version}` and rendered to PDF.
*Never edited.* A correction produces a new dossier that supersedes the old one.

**Superseded Dossier**
A dossier whose template has been republished past the version it validated. Marked
automatically, displayed as a **revalidation due** badge on the template. Blocks
nothing (ADR-018 D7/D8).

**Impact Class**
The classification of a template change produced by diffing the new snapshot
against the validated one: **Cosmetic**, **Structural**, or **Computational**.
Determines whether revalidation is recommended or required, and is itself retained
as documented evidence of the change.

**Platform Validation Report**
Tier 1 evidence: the retained result of the automated test suite for one deployed
commit — commit SHA, date, suite counts, tool versions, hosting release. Covers the
interpreter, formatting rules, unit conversion, PDF renderer and Firestore rules,
so that per-template dossiers need not re-prove them.

**Reported Value**
Any value that appears on the generated certificate. Compared as an **exact
string** during validation — unlike stored values, which are compared within a
declared tolerance. The distinction exists because a maths error and a
formatting/truncation error are different defects (ADR-018 D5).

---

## Terms deliberately avoided

| Do not say | Say instead | Why |
|---|---|---|
| "Record Doc" | Record | "Doc" invites confusion with Document Index items and Firestore documents |
| "Template" unqualified | Recorder Template / PDF Report Template / Spreadsheet Template | Four template systems already exist; bare "template" is ambiguous |
| "reading round" as a set of rows | Round (a column) | Settled: rounds are columns, not row groups |
| `equipmentType` (string) | Equipment Type (entity) `equipmentTypeId` | The string field is dead code and always empty |
| "Formula Engine" for the whole stack | Expression Interpreter (evaluates) vs Custom Function (authored unit) | Separates the runtime from the authored artifact |
| "validation" for a syntax check | Verification (static) vs Validation (evidence of correct results) | `verifyTemplate()` proves the template parses; it proves nothing about correctness |
| "the tool passed" | The reference case passed, within its declared tolerance | A pass is meaningless without naming the case and the tolerance |
