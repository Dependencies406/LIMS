# Phase 11 — Reference standards and mV/V → force conversion

## Model and effort

**Claude Opus 5 · Effort: High**

Opus, despite ADR-013 having settled every design question, for two reasons:

1. It **modifies the evaluator's empty-value semantics** — a narrow exception where
   `STD_C*` resolves to 0 instead of erroring. Every formula in the system depends on
   those semantics. A careless implementation weakens ADR-010 globally, and nothing
   would visibly break.
2. **Errors here produce plausible wrong numbers on calibration certificates**, not
   crashes. That is the same consequence profile that put Phase 3 on Opus, and the
   Excel workbook this replaces has been quietly wrong by 0.30 % for years precisely
   because a wrong number looks like a number.

This phase is **foundation only**. Directions (ADR-013 D7) and the per-point
uncertainty budget (D8) are separate later phases — D8 largely falls out of this one
for free, but should be verified on its own.

---

## Prompt

```
Read first, in order:
  - CLAUDE.md — hard rules
  - docs/adr/ADR-013-reference-standards-and-signal-conversion.md — THE SPECIFICATION
  - docs/FORMULA_GRAMMAR.md — especially §4 (name resolution), §6 (semantics), §7b
  - docs/adr/ADR-009-environment-references.md — the ENV_ pattern you are copying
  - docs/adr/ADR-010-evaluation-contexts-and-summary-fields.md — strict empty semantics
  - docs/adr/ADR-005-record-lifecycle.md — snapshotting, for D6
  - docs/adr/ADR-011-number-precision-and-formatting.md — precision
  - docs/PLAIN_LANGUAGE_GUIDE.md — terminology

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

Run and report:
    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Verify any dev server points at THIS directory. There is a large amount of
pre-existing uncommitted work on this branch that is NOT yours, including recent
edits to RecorderTemplateBuilderPage.tsx and possibly EnvironmentBlock.tsx. LEAVE IT
ALONE. recorder-reserved/ is an archive — do not modify, import from, or delete it.

STOP and ask if anything differs.

## WHAT ALREADY EXISTS — verify; this list may be stale. If it does not match, STOP.

  - src/modules/recorder/formula/ — interpreter and verifier (Phase 3). ENV_ resolution
    already exists there; STD_ follows the same path. READ IT before designing.
  - src/services/recorderTemplateService.ts — templates and versions (Phase 4)
  - src/services/calibrationRecordService.ts — records, commit, snapshotting (Phase 5a)
  - src/services/certificateNumberConfigService.ts — IS the equipment type (ADR-012)

## SCOPE

### Task 1: ReferenceStandard entity (ADR-013 D2)

New top-level Firestore collection, new service following house conventions
(exported object literal, subscribe/getAll/add/update, serverTimestamp on
createdAt/updatedAt, a toDate mapper).

Fields per D2. Coefficients as an ORDERED ARRAY (D1):

    /** coefficients[i] multiplies R^i. coefficients[0] is the constant term. */
    coefficients: number[];

NOT three named fields. Read D1 for why.

Deactivate, never delete — these are referenced by historical records.

Firestore rules: this collection needs a rule block. SHOW ME the proposed rule before
applying it. Admin-write is the likely answer, matching certificate_number_configs.

### Task 2: Admin UI for manual coefficient entry (D2)

Admin-only management: list, create, edit, deactivate.

The coefficient inputs MUST display the equation they populate, e.g.
`F = c1*R + c2*R^2 + c3*R^3`, updating as rows are added. Whoever transcribes a NIMT
certificate has to see what they are filling in — the absence of exactly that display
is what allowed the Excel defect to survive undetected for years. This is a
requirement, not decoration.

Show input unit and output unit clearly. Support a variable number of coefficients.

### Task 3: The `standard` column type (D3)

New RecordColumn type 'standard'. Renders a dropdown over ACTIVE reference standards.
Stored cell value is the standard's document id.

  - A new row INHERITS the previous row's selection (D3, and the "negative and
    accepted" note) — reduces clicks and mis-picks
  - WARN, do not block, when the chosen standard's range does not bracket the row's
    force level or its direction disagrees. Metrologist's judgement overrides the
    system.

Add to the template builder's column-type list, with a properties panel consistent
with the labelled pattern used by the other column types.

### Task 4: The STD_ reserved namespace (D4) — THE HIGHEST-RISK TASK

Follow the ENV_ implementation exactly. Read it first; do not invent a parallel path.

  - Add 'STD' to RESERVED_SECTION_IDS alongside ENV and SUMMARY
  - Resolve STD_* from the standard selected IN THE CURRENT ROW — row-scoped, not
    record-scoped. This is the difference from ENV_, which broadcasts.
  - Variables: STD_C0..STD_C5, STD_TO_N, STD_UCAL, STD_UA, STD_UB, STD_UC,
    STD_RESOLUTION
  - No grammar change. If you find yourself editing lexer.ts or parser.ts, stop and
    re-read ADR-009 — you have taken the wrong approach.

#### The empty-value exception — implement this precisely

STD_C0..STD_C5 beyond the stored polynomial degree resolve to **0**, NOT to an error.
Absent higher terms of a polynomial genuinely are zero; this is not missing data.

EVERY other empty remains an error per ADR-010. In particular:

  - a row with NO standard selected → 'awaiting-input' error for every STD_*,
    including the coefficient slots
  - STD_UCAL and friends, when the standard has no such value → error, NOT 0
  - no other reserved or column variable changes behaviour

You MUST add a test asserting this exception does not leak — that ordinary empty
columns, ENV_ values, and STD_ non-coefficient variables all still error. If the
exception leaks, ADR-010's strict semantics are silently weakened everywhere and
nothing visibly breaks. That is the failure mode this task exists to avoid.

### Task 5: Unit normalisation (D5)

A single table mapping unit → newtons: N=1, kN=1000, kgF=9.80665, gF=0.00980665.
Expose the selected standard's factor as STD_TO_N. Do NOT build a unit-pair matrix.

The UUC's own unit belongs on the record or template; expose it so a formula can
divide by it. Name it clearly.

### Task 6: Snapshot standards at commit (D6)

commitRecord must snapshot EACH ROW's standard — coefficients, uncertainty
contributors, serial number, calibration and due dates.

Evaluation at commit MUST use the snapshot, not the live standard document. Prove it
with a test in the same shape as Phase 5a's pinned-template proof: commit a record,
then edit the live standard's coefficients, and show the committed record's numbers do
not move.

Also warn (do not block) if a selected standard's due date precedes the calibration
date being recorded.

## OUT OF SCOPE — do not build

  - Directions (ADR-013 D7) — later phase
  - Per-point uncertainty budget (D8) — later phase; it should fall out of Task 4,
    but verify it separately
  - Relative error / machine class / the certificate report
  - Any migration of existing Excel data

## CONSTRAINTS

- Do NOT change the grammar. STD_ is a resolution concern, exactly like ENV_.
- Do NOT add a built-in conversion function. ADR-013 rejects it explicitly, with
  reasons — read them.
- Do NOT round during evaluation (ADR-011). The workbook's ROUND(...,5) is not adopted.
- Do NOT replicate the workbook's C*R third term. See D1.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing uncommitted
  work.
- SHOW ME proposed Firestore rules before applying them.
- New markdown goes in docs/ (RULE 9).
- If unsure, say so and ask (RULE 1, RULE 7).

## TESTS

Beyond the usual round-trip coverage:

  1. THE ARITHMETIC. Using the real CAL-FRC-001 coefficients
     (A=25.001904548237, B=-0.039616880251316, C=0.075709296790966), assert the cubic
     evaluation gives ~1.00002 at R=0.04 and ~9.99927 at R=0.4. Add a comment stating
     these are the values that proved the workbook wrong, and that the linear-third-term
     form would give 1.00304 and 10.02471. This test is the regression guard against
     anyone "simplifying" the polynomial later.
  2. Coefficient slots beyond the stored degree resolve to 0.
  3. THE LEAK TEST — ordinary empty columns, ENV_ values, and STD_UCAL still error.
  4. A row with no standard selected gives 'awaiting-input' for every STD_*.
  5. Two rows using DIFFERENT standards each evaluate with their own coefficients.
     This is the whole point of the phase; test it directly.
  6. Unit normalisation across all four units, both directions of conversion.
  7. Snapshot proof — edit the live standard, committed numbers do not move.
  8. Full precision preserved; no rounding during evaluation.

Run npm test and tsc --noEmit. Report both.

NOTE: uncommitted edits by earlier sessions to RecorderTemplateBuilderPage.tsx and
possibly EnvironmentBlock.tsx may never have been compiled — one session's sandbox
failed to start. Your type-check covers them. If it reports errors there, fix them and
say so.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Any point where "WHAT ALREADY EXISTS" did not match the code
  3. Diff summary per file
  4. Proposed Firestore rules, shown BEFORE applying
  5. npm test and tsc output, including whether the pre-existing edits compiled
  6. Confirmation you did NOT change lexer.ts or parser.ts — and if you did, why
  7. The exact code path where the STD_C* zero-default is applied, and how you
     confined it so it cannot affect other empty values
  8. Proof that two rows with different standards evaluate independently
  9. Anything unverified, stated as UNVERIFIED
```

---

## Before this reaches a certificate

Two things belong to the owner, not to a coding session.

**Verify the coefficients against the NIMT certificate.** The arithmetic in ADR-013
strongly indicates a cubic fit, but it is inference from two data points. The
certificate should state the equation form. Confirm it before any certificate is
issued from the new path.

**Decide what happens to certificates already issued.** Every force value the
workbook produced is high by up to ~0.30 % at the low end of range and low above
R = 1. ADR-013 records the magnitude deliberately and takes no position on remediation
— that is a decision for the laboratory and possibly its accreditation body.
