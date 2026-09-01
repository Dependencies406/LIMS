# ADR-018: Two-tier validation with a Calculation Trace as the primary evidence

Date: 2026-08-25
Status: Accepted

## Context

ISO/IEC 17025:2017 **7.11.2** requires that the laboratory information management
system be *validated for functionality before introduction*, and that changes be
*authorized, documented and validated before implementation*. **7.11.6** requires
that *calculations and data transfers be checked in an appropriate and systematic
manner*. **7.5** requires technical records sufficient to repeat a calibration.
**8.4** governs how the resulting evidence is retained.

Nothing in this codebase currently satisfies any of them.

### Verified state of the code (2026-08-25)

Read directly, not inferred:

| Fact | Where |
|---|---|
| `verifyTemplate()` and `isTemplatePublishable()` are the only template checks | `src/services/recorderTemplateValidation.ts:197,325` |
| Those checks are **static only** — reserved ids, id shape, duplicates, empty expressions, empty choice lists, then parse/arity/cycle checks delegated to the interpreter | same file, `validateStructure` + `verifyTemplate` |
| `recorderTemplateService.verifyTemplate` documents itself as "what `publishTemplate` enforces as a hard gate" | `src/services/recorderTemplateService.ts:219-226` |
| `publishTemplate(id, publishedBy)` returns `{ version: number }`; collections are `recorderTemplates`, `recorderTemplateVersions`, `recorderTemplateActiveLocks` | `recorderTemplateService.ts:42-44,379` |
| `RecorderTemplateVersion` is `{ id: \`${templateId}_v${version}\`, templateId, version, snapshot, publishedAt, publishedBy }` | `src/types/index.ts:1046-1054` |
| `CalibrationRecord.templateVersion` is pinned at creation and never re-resolved | `src/types/index.ts:1121-1123` |
| A step-by-step calculation trace with `StepApproval { reviewerName, approvedDate }` already exists — but for the **old spreadsheet module**, against `SpreadsheetModel`, not the recorder | `src/services/formulaVerificationService.ts:11-45` |
| `npm test` is `vitest run` | `package.json:9` |
| The merge workflow runs `npm ci` then `npm run build` and **no test step** | `.github/workflows/firebase-hosting-merge.yml:18-19` |
| The only two workflows are the Firebase Hosting deploy pair | `.github/workflows/` |

**The gap in one sentence:** a template version can be frozen and used to produce
accredited certificates on the strength of a *syntax check*, and application code
can reach production without the 300+ existing tests ever executing.

### What a static check is not

`verifyTemplate()` answers "does this template parse?". Clause 7.11.2 asks "does
this system produce correct results?". A template whose every formula parses,
whose ids are unique and whose functions resolve can still compute the wrong
number on every row of every certificate, and today nothing in the system would
record that anyone had ever looked.

## Decision

### D1 — Two tiers, one tool

**Tier 1 — Platform Validation.** The interpreter, the number-format and
round-on-display rules, the unit-conversion library, the PDF renderer and the
Firestore rules are validated **per release**, by the existing automated test
suite, executed in CI and retained as a **Platform Validation Report** tied to the
deployed commit.

**Tier 2 — Template Validation.** Each published `RecorderTemplateVersion` gets its
own **Validation Dossier**, which *relies on* Tier 1 and does not re-prove it.

Rationale: Tier 2 evidence is only as good as Tier 1. A dossier that says "the app
computed 200.14 N" is worthless if nobody has shown the interpreter evaluates
arithmetic correctly. Splitting them also puts each cost where it belongs — Tier 1
is paid once per release by a machine, Tier 2 once per template version by a person.

### D2 — The Calculation Trace is the primary evidence

The tool's core is **not** a pass/fail comparator. It is a **Calculation Trace**:
for any value the system produces, a structure showing where that value came from,
recursively, down to values that were entered or read rather than computed.

Every node carries a **provenance**, one of:

| Provenance | Meaning |
|---|---|
| `entered` | A person typed it. Carries who, and which round/row. |
| `reference-standard` | Read from the equipment register / conversion equation. Carries equipment id, certificate identity, calibration due date. |
| `template-constant` | From the pinned template version (custom function body, coefficient, choice list). |
| `computed` | Produced by a formula. Carries the expression, the substituted expression, the raw result, and the displayed result. |
| `environment` | From the Environment Block for that round. |
| `record-scalar` | Record-level value such as `REPORT_TO_N` or a selected column unit. |

Rationale: 7.11.6 says *calculations and data transfers*, not *results*. The clause
is about the working. A trace with provenance is checkable by a metrologist; a JSON
diff is not. It also directly serves 7.5 — a record whose every number can be
traced back to its inputs and its pinned template version is a record that can be
repeated.

**Precedent:** `formulaVerificationService.ts` already implements this shape for
the old spreadsheet module. This is a port of a proven idea onto the recorder's
interpreter, not an invention. It is **not** a reuse — that service is coupled to
`SpreadsheetModel` and cannot be pointed at a `CalibrationRecord`.

### D3 — Trace depth: one line per formula, expandable

Each computed value renders as one line — inputs, substituted expression, raw
result, displayed result. Any input that was itself computed is expandable in
place. Nothing is hidden; nothing is unrolled by default.

Rejected: full per-operation expansion. A single row of a force calibration with a
full uncertainty budget becomes pages, and reviewers stop reading — which defeats
the control.

### D4 — Coverage runs through to the printed certificate

The trace covers the calculation, the provenance of every input, **and** the
record → PDF transfer: for a generated certificate, the tool reconciles the values
placed by the report blocks and the Record Table Band against the record they came
from, and reports any value that does not match.

Rationale: the record → PDF binding is a genuine data transfer under 7.11.6, and it
is the one that can break silently — a report block edit changes what is printed
without touching a single number in the record.

Out of scope for now: JSON export/import round trip, and the Firestore ↔ offline
cache path. Named here so their exclusion is a decision, not an oversight.

### D5 — Comparison semantics: tolerance on raw, exact on reported

A reference case passes when:

- every **stored, full-precision** value is within a declared numeric tolerance of
  its expected value, **and**
- every value that **appears on the certificate** matches its expected value as an
  **exact string** — including the 2-significant-figure truncated `U` string, the
  number format, and the unit.

These are recorded as two distinct defect classes. A maths error and a
formatting/truncation error are different failures with different consequences, and
under 7.8 the printed form is itself a requirement.

The tolerance is declared **per reference case**, not globally, and stored in the
dossier. A case that passes only under a loose tolerance says so in writing.

### D6 — Reference cases come from hand calculation and legacy workbooks

Owner decision, 2026-08-25. Both sources are permitted; each case records which one
it came from in a `source` field (`hand-calculation` | `legacy-workbook` |
`published-example` | `pt-ilc`).

**Recorded risk, accepted by the owner:** cases sourced from a legacy workbook prove
only that the application reproduces that workbook. Decisions D1–D6 of Stage D
deliberately replicated known workbook behaviours (force polynomial third term
applied linearly rather than cubed; `u_res` wired to `f0` rather than the
resolution; `u_std` combined without √3; `b` as max−min of q1..q3). A dossier built
solely on workbook cases carries those behaviours forward as validated.

Reconciling those behaviours against GUM / ISO 7500-1 is **explicitly out of scope
for this tool** (owner decision, 2026-08-25). It is recorded here as an open
technical question, not as a defect claim — none of the four has been re-derived by
this analysis.

### D7 — Documentation only. No enforcement gate at the template tier

Owner decision, 2026-08-25. A template version may be used to record real jobs
whether or not a Validation Dossier exists. The dossier gates nothing.

Note the deliberate asymmetry with Tier 1, where the CI test step **does** block
deployment (D9). Code is gated by machine; templates are gated by procedure.

**Recorded consequence:** 7.11.2's "before introduction" is satisfied by procedure
and not by the software. If the procedure is not followed, the system will not
notice. This is a knowingly accepted risk, not an omission.

### D8 — Staleness is detected, never blocked

A dossier is pinned to `(templateId, version)`. When a template is republished past
its validated version, the dossier is marked **Superseded** and the template shows a
**revalidation due** badge. Nothing is blocked. Recording continues.

Rationale: without this, a signed dossier keeps asserting "validated" while pointing
at a version that no longer exists — evidence that has become false. A false record
of validation is a worse position than a missing one. Detection is the cheapest
control that prevents it and does not reintroduce the gate D7 rejected.

Impact classification (D10) supplies the *reason* the badge appears.

### D9 — Tier 1 is the existing test suite, gated and retained

Add a test step to both GitHub workflows and block deploy on failure. Render each
passing run as a retained **Platform Validation Report** carrying: commit SHA,
date, suite result counts, tool versions, and the deployed hosting release.

Rationale: the suite already exists and is already comprehensive; it is simply
never executed by the pipeline and never recorded. This is the cheapest defensible
Tier 1 evidence available, and it is available immediately.

### D10 — Revalidation is risk-based, driven by a version diff

When a template is republished, the tool diffs the new snapshot against the
validated one and classifies the change:

| Class | Examples | Consequence |
|---|---|---|
| **Cosmetic** | Label text, column width, decimals, section title, description | Dossier marked Superseded, badge shown, revalidation *not* recommended |
| **Structural** | Column added or removed, row count, round count, choice list changed | Revalidation recommended; existing reference cases may no longer bind |
| **Computational** | Formula expression, custom function, summary field, unit rule, conversion binding, report block value binding | Revalidation **required**; the dossier's numeric conclusions no longer apply |

The classification and the diff that produced it are stored on the superseding
version and displayed with the badge. They are themselves documented evidence of a
change, which is part of what 7.11.2 asks for.

### D11 — Evidence lives in Firestore and as a rendered PDF

New immutable collection `recorderTemplateValidations`, document id
`${templateId}_v${version}`, one dossier per validated version. A rendered PDF is
produced for the auditor's file. Retention follows 8.4 alongside records.

Immutability, consistent with ADR-005's treatment of committed records: a signed
dossier is never edited. A correction produces a new dossier that supersedes it and
links back.

### D12 — Authorization: single admin, no separation of duties

Owner decision, 2026-08-25. One admin may author, validate and sign a template
version. `reviewer ≠ createdBy` is **not** carried over from ADR-005 to templates.

**Recorded consequence:** the template tier has no independent check. ADR-005
relaxed `approver ≠ reviewer` for records but deliberately kept `reviewer ≠
createdBy`; this decision drops the control ADR-005 kept, at the layer where a
defect propagates to every certificate produced under the version rather than to
one. Owner declined a compensating control (2026-08-25) on the grounds that the
priority is the calculation process, not the signature chain.

Left open deliberately — see "Open questions".

### D13 — Existing force / ISO 7500-1 template is grandfathered

Owner decision, 2026-08-25. Records already committed under the current force
template version stand. The dossier requirement applies from the next published
version onward.

**Recorded consequence:** live records currently exist with no validation evidence
behind them. If an assessor asks how the force template was validated before
introduction, the honest answer is that it was not, and the remedy on offer is the
Superseded/revalidation path from the next version.

## Consequences

Positive:

- 7.11.6 is satisfied by a mechanism a metrologist can actually read.
- 7.5 reproducibility strengthens: pinned version + deterministic interpreter +
  trace means a number can be re-derived years later.
- Tier 1 costs one CI step and turns an existing suite into evidence.
- The trace has a second, non-compliance use: it is a debugging tool. "Why is this
  number wrong" becomes answerable without reading code.

Negative and accepted:

- The trace must be produced by the **same** evaluation path as normal computation,
  or it documents something the system does not do. This constrains the interpreter:
  evaluation must be instrumentable, not re-implemented for tracing. This is the
  single largest technical risk in the design.
- Storage: dossiers embed reference cases and their expected values.
- D7 and D12 together mean the software provides evidence but enforces nothing at
  the template tier. Compliance rests on procedure.
- D13 leaves a retrospective gap that does not close by itself.

## Open questions

1. **Independence (D12).** Parked at the owner's request, not resolved. Revisit if
   the lab gains a second competent person, or if an assessment raises it.
2. **The Stage D workbook behaviours (D6).** Out of scope here. They remain
   unreconciled against GUM / ISO 7500-1 and are a separate technical review.
3. **7.11.3 e) — "recording system failures and appropriate immediate and
   corrective actions."** Not addressed by this ADR. There is no system-failure log
   in the application today. Separate work.
4. **7.11.4 — external providers.** Firebase, Google Cloud and GitHub are external
   providers of the information management system. The clause requires the
   laboratory to ensure they meet applicable requirements. Not addressed here;
   likely a QMS document rather than software.
5. **Trace retention on records.** D2 produces the trace on demand and for the
   dossier. Whether a committed record should *store* its trace permanently (fuller
   7.5 traceability, significant storage growth) is deferred.

## Revisit when

- A second competent person is available → reopen D12.
- An assessment raises the absence of a gate → reopen D7.
- Storage cost of dossiers becomes material → reconsider embedding reference cases
  versus referencing them.
- Export/import or offline sync is implicated in a real data-integrity incident →
  reopen D4's exclusions.
