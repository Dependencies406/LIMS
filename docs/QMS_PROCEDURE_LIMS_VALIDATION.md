# Validation of the Laboratory Information Management System

**Draft procedure for the quality manual — plain language**

Date drafted: 2026-08-25
Supporting technical decisions: `docs/adr/ADR-018-recorder-template-validation.md`

> This is a draft for the Quality Manager to adapt to the laboratory's own document
> numbering, revision control and approval format. The clause mapping and the method
> are the substance; the headings should be replaced with your QMS house style.

---

## 1. Purpose

To describe how the laboratory satisfies itself that its calibration software
produces correct results before that software is used to generate accredited
certificates, and how that satisfaction is recorded.

## 2. Scope

Applies to the laboratory's calibration web application, comprising:

- **The platform** — the calculation engine, number formatting rules, unit
  conversion, certificate rendering and access-control rules that are common to all
  calibrations.
- **Recorder Templates** — the definition of how one type of equipment is recorded:
  its columns, its formulas and its certificate layout. Each type of equipment has
  its own.

Does not apply to: general office software, or to the measurement methods
themselves, which are validated under the laboratory's method validation procedure.

## 3. Requirements addressed

| Clause | Requirement | How this procedure addresses it |
|---|---|---|
| 7.11.2 | The system shall be validated for functionality before introduction; changes shall be authorized, documented and validated before implementation | Sections 5 and 6 |
| 7.11.6 | Calculations and data transfers shall be checked in an appropriate and systematic manner | Section 5.3 — the Calculation Trace |
| 7.5 | Technical records shall contain sufficient information to enable the calibration to be repeated | Records pin the exact template version used; the trace shows every input and its origin |
| 8.4 | Control of records | Section 7 |
| 8.5 | Risk and opportunity | Section 8 — accepted risks are stated, not hidden |

## 4. Responsibility

| Who | Does what |
|---|---|
| Quality Manager | Authorises a template version for use; reviews and signs the Validation Dossier; maintains this procedure |
| Quality Manager | Prepares reference cases and their expected values |

> **Note, to be resolved by the laboratory.** The two rows above are the same
> person. The laboratory has accepted that one person may author, validate and
> authorise a template version, because a second competent person is not currently
> available. This is a known limitation and is recorded as an accepted risk in
> section 8. It should be revisited whenever a second competent person becomes
> available.

## 5. Method

### 5.1 Platform validation

Performed automatically whenever a change to the application is released.

The application's automated test suite is executed before any release is permitted
to reach the live system. A release whose tests do not pass **cannot be deployed** —
this is enforced by the system, not by procedure.

Each successful run produces a **Platform Validation Report** recording the date,
the exact version of the software released, the test results and the tool versions
used. This report is retained.

The Platform Validation Report covers the shared calculation and reporting
machinery. **It is not validation of any individual Recorder Template.**

### 5.2 Reference cases

Before a Recorder Template can be validated, at least one **reference case** must
exist for it: a set of input values for which the correct answers are already known
independently of the application.

Reference cases may come from:

| Source | Notes |
|---|---|
| Hand calculation | The Quality Manager calculates the result manually and records the working. Genuinely independent. |
| The laboratory's existing spreadsheet | Available immediately. **See the caution below.** |
| A worked example published in a standard | The strongest source, where the standard provides one. |
| A proficiency test or interlaboratory comparison result | An external body supplied the correct answer. |

Each reference case records which source it came from, and the numeric tolerance
within which the application's answer is accepted.

> **Caution on spreadsheet-sourced cases.** Comparing the application against an
> existing spreadsheet demonstrates that the application reproduces that
> spreadsheet. If the spreadsheet contains an error, the application will be
> recorded as validated while reproducing that error. Where a spreadsheet is used as
> the source, the laboratory should be able to state why its calculations are
> believed correct. Where practical, prefer a hand calculation or a published
> worked example.

### 5.3 Checking the calculation — the Calculation Trace

The application can show, for any number it produces, **how that number was
obtained**: the formula used, the values put into it, the arithmetic performed, and
where each input value came from — whether it was typed by a technician, read from
the calibration certificate of a reference standard, or taken from the template
itself.

This is called the **Calculation Trace**. It is the primary evidence that
calculations have been checked, and it is what the Quality Manager reviews.

Reviewing a trace means checking the *working*, not only the answer. In particular:

1. Each formula is the one the method requires.
2. Each input came from where it should have come from, and reference standards
   used were in calibration on the date of the work.
3. The arithmetic, as shown substituted, is correct.
4. The value printed on the certificate is the value the record holds, correctly
   rounded and correctly labelled with its unit.

Item 4 is a **data transfer** check, not a calculation check. Clause 7.11.6 requires
both.

### 5.4 Validation of a Recorder Template version

When a new version of a Recorder Template is published:

1. The reference cases for that equipment type are entered into the application.
2. The application computes the results and produces the Calculation Trace for each.
3. The results are compared against the known-correct answers. Stored values must
   agree within the declared tolerance; values that appear on the certificate must
   agree exactly, character for character, including their rounding and unit.
4. The Quality Manager reviews the traces.
5. Any difference between what the application does and what the standard method
   would do is recorded as a **deviation**, with the reason it is acceptable.
6. The Quality Manager signs.

The result is a **Validation Dossier**: one per template version, retained, and
never edited after signature. A correction is issued as a new dossier that
supersedes the old one.

## 6. Changes to a template

When a template is republished, the application compares the new version against the
version that was validated and classifies the change:

| Class | Examples | Action |
|---|---|---|
| Cosmetic | A label, a column width, the number of decimal places shown | Revalidation not normally required |
| Structural | A column added or removed, a choice list changed | Revalidation recommended |
| Computational | Any change to a formula, a function, a unit rule, or what a certificate field is bound to | **Revalidation required** |

The application marks the previous dossier as **superseded** and displays a
"revalidation due" indicator against the template, together with what changed.

> **Important limitation.** The indicator is a warning only. The application does
> **not** prevent an unvalidated template version from being used to record real
> calibrations. Ensuring validation happens before use is a responsibility under this
> procedure, not a control enforced by the software. See section 8.

## 7. Records

| Record | Where held | Retained |
|---|---|---|
| Platform Validation Report | Generated by the release pipeline, retained with the release | Per the laboratory's retention period for quality records |
| Validation Dossier | In the application, and as a signed PDF for the audit file | As above |
| Calculation Trace | Reproducible on demand from any record; included in full within each Validation Dossier | As above |

Validation Dossiers are not editable once signed, in the same way that committed
calibration records are not editable.

## 8. Known limitations and accepted risks

Stated openly so they can be answered if raised, rather than discovered.

| # | Limitation | Status |
|---|---|---|
| 1 | One person may author, validate and authorise the same template version. There is no independent check at the template level. | Accepted; revisit when a second competent person is available |
| 2 | The application does not prevent use of an unvalidated template version. Compliance with "validated before introduction" rests on this procedure. | Accepted |
| 3 | The Recorder Template currently in use for force calibration (ISO 7500-1) was introduced before this procedure existed and has no Validation Dossier. It is grandfathered; validation applies from its next version onward. | Accepted; open |
| 4 | Certain calculations deliberately reproduce the behaviour of the laboratory's earlier spreadsheet, including in the uncertainty budget. These have not been reconciled against the GUM or ISO 7500-1. | Open — separate technical review, outside this procedure |
| 5 | There is no log of system failures and the actions taken on them, as required by clause 7.11.3 e). | Open — not yet addressed |
| 6 | Assurance over external providers of the information system (Firebase, Google Cloud, GitHub) required by clause 7.11.4 is not addressed by this procedure. | Open — separate document |

## 9. Revision

To be completed by the laboratory in its usual format.
