# Phase 12 — Connect equipment conversion equations to the Recorder Template

## Model and effort

**Claude Opus 5 · Effort: High**

The design is settled by ADR-014. Opus is warranted by the consequence profile, which
is the same argument that put Phase 3 and Phase 11 on Opus:

1. **The two coefficient arrays run in opposite directions.** An inverted polynomial
   does not throw — it returns a plausible number that goes on a calibration
   certificate. This is the identical failure mode the Excel workbook exhibited for
   years.
2. **Two unit-scaling mechanisms now exist and only one may be applied.** Applying
   both puts every force out by a factor of 1000.

Both failure modes produce *wrong numbers*, not errors. Neither is caught by tests
that only check "does it run".

---

## Prompt

```
Read first, in order:
  - CLAUDE.md — hard rules, especially RULE 2 on deletions
  - docs/adr/ADR-014-equipment-register-is-the-reference-standard.md — THE SPEC
  - docs/adr/ADR-013-reference-standards-and-signal-conversion.md — D1/D4/D6/D8/D9
    still stand; D2/D3/D5 are superseded by ADR-014. Read the superseding notes.
  - docs/FORMULA_GRAMMAR.md — §4 name resolution, §6 semantics
  - docs/adr/ADR-005-record-lifecycle.md — snapshotting
  - src/services/conversionEquationService.ts — the EXISTING equation feature
  - src/services/referenceStandardVariables.ts — the STD_* builder being re-sourced
  - src/modules/recorder/formula/evaluator.ts — the STD_ resolution path

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Verify any dev server points at THIS directory. Large amounts of pre-existing
uncommitted work on this branch are NOT yours — leave them alone. recorder-reserved/
is an archive. STOP and ask if anything differs.

## WHAT ALREADY EXISTS — verify each item before assuming. If any differs, STOP.

  - ConversionEquation + conversionEquationService — equations under
    equipmentControl/{id}/conversionEquations/{id}. HAS REAL DATA (CAL-FRC-001).
    coefficients[0] = HIGHEST degree. Has a `divisor` field.
  - referenceStandardVariables.ts — buildStandardVariables(), toStandardSnapshot(),
    checkForceInRange(), checkStandardDueDate(). Correct; only its input changes.
  - STD_* resolution in evaluator.ts, copied from the ENV_ branch. KEEP.
  - standardNamespaceIsolation.test.ts — the leak test. KEEP AND KEEP PASSING.
  - ReferenceStandard entity + service + ReferenceStandardManagerModal — TO BE
    RETIRED (ADR-014 D2). The owner confirmed it holds NO data.

## SCOPE

### Task 1: The coefficient adapter — do this first, and test it before anything else

Write ONE function converting stored descending coefficients to canonical ascending
(ADR-014 D4). One function, one place. Not inline at call sites.

    /**
     * ConversionEquation stores coefficients[0] = HIGHEST degree (descending).
     * Everything downstream uses ascending: result[i] multiplies R^i.
     * These are opposite. Reversing is the entire purpose of this function.
     */

Test it BEFORE writing anything that depends on it, using the real CAL-FRC-001
values (A=25.001904548237, B=-0.039616880251316, C=0.075709296790966, constant 0):

  - ascending evaluation gives ~1.00002 at R=0.04 and ~9.99927 at R=0.4
  - assert the REVERSED order does NOT give those values — prove the test can fail
  - comment that these are the values that proved the Excel workbook wrong

A test that cannot fail is worse than no test. Demonstrate this one fails when the
adapter is wrong.

### Task 2: Re-source buildStandardVariables()

It currently takes a ReferenceStandard. Change its input to (ConversionEquation +
parent Equipment), producing the SAME STD_* map:

  STD_C0..STD_C5, STD_TO_N, STD_UCAL, STD_UA, STD_UB, STD_UC, STD_RESOLUTION

  - coefficients arrive via the Task 1 adapter — canonical ascending
  - uCal/uA/uB/uC come from the equation (it already carries them)
  - STD_TO_N derives from the equation's outputUnit (ADR-013 D5 table)
  - DO NOT change the STD_C* zero-default rule, and DO NOT change any other empty
    semantics. standardNamespaceIsolation.test.ts must still pass unmodified.

### Task 3: The `standard` column stores (equipmentId, equationId)

Both ids (ADR-014 D3). A picker choosing equipment then its calibrated range, or a
flattened "equipment — range" list.

Show only equipment usable as a reference standard. If no such flag exists on
Equipment, ADD ONE — do not filter on a name convention.

Keep the existing warn-don't-block behaviour for out-of-range and past-due.

### Task 4: Unit scaling — derived only

    force_in_report_unit = polynomial(R) * STD_TO_N / REPORT_TO_N

  - REPORT_TO_N comes from the record's/template's reporting unit
  - DO NOT apply ConversionEquation.divisor anywhere in this path (ADR-014 D5).
    Applying both scales twice — every force wrong by ~1000x.
  - Add a doc comment on `divisor` marking it deprecated for this pipeline
  - On EquipmentDetailPage, warn when a stored divisor disagrees with the factor
    derived from the equation's own units. This surfaces bad data rather than
    silently honouring or ignoring it.

### Task 5: Snapshot at commit

Snapshot the CANONICAL ASCENDING coefficients — already converted, never the stored
descending form — plus units, uncertainty contributors, and the parent equipment's
serial number, calibration date and due date (ADR-014 D6).

Storing the converted form means a later reader cannot re-invert it by accident.

Prove with a test in the same shape as Phase 5a's pinned-template proof: commit,
then edit the live equation's coefficients, and show the committed record's numbers
do not move.

### Task 6: Retire ReferenceStandard — carefully, per RULE 2

  - grep every import of referenceStandardService, the ReferenceStandard type, and
    ReferenceStandardManagerModal. SHOW ME THE LIST before removing anything.
  - Repoint anything still importing them, re-verify clean, THEN remove.
  - DO NOT delete the Firestore collection or its rule block. It is empty; leaving it
    costs nothing and deleting Firestore data is irreversible.
  - Remove the Settings card that opens the modal.

## OUT OF SCOPE

Directions (ADR-013 D7), the per-point uncertainty budget (D8), relative error,
machine class, and the certificate report. Do not start them.

## CONSTRAINTS

- Do NOT change the formula grammar. STD_ is resolution, exactly like ENV_.
  If you find yourself editing lexer.ts or parser.ts, you have taken a wrong turn.
- Do NOT change STD_C* zero-default or any other empty semantics.
- Do NOT apply `divisor` in the recorder path.
- Do NOT round during evaluation (ADR-011).
- Do NOT delete anything without showing the import check first.
- Do NOT touch recorder-reserved/ or pre-existing uncommitted work.
- SHOW ME proposed Firestore rule changes before applying.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. THE ADAPTER (Task 1) — including the proof it fails when reversed
  2. Two rows using DIFFERENT equations each evaluate with their own coefficients.
     This is the entire point of the phase.
  3. Unit scaling across N/kN/kgF/gF, both directions, with REPORT_TO_N
  4. divisor is NOT applied — a stored divisor of 1000 must not change the result
  5. standardNamespaceIsolation.test.ts still passes UNMODIFIED
  6. A row with no equation selected → 'awaiting-input' for every STD_*
  7. Snapshot proof — edit the live equation, committed numbers do not move
  8. Snapshots store ASCENDING coefficients
  9. Full precision preserved; no rounding during evaluation

Run npm test and tsc --noEmit. Report both.

NOTE: uncommitted edits by earlier sessions to RecorderTemplateBuilderPage.tsx and
possibly EnvironmentBlock.tsx may never have been compiled — one session's sandbox
failed to start. Your type-check covers them. If it errors there, fix and say so.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Any point where "WHAT ALREADY EXISTS" did not match the code
  3. The import-check list for every file you propose removing, shown BEFORE removal
  4. Diff summary per file
  5. The single location of the coefficient adapter, and confirmation nothing else
     reverses coefficients
  6. Confirmation `divisor` is not applied in the recorder path, and where you
     verified that
  7. npm test and tsc output, including whether pre-existing edits compiled
  8. Confirmation lexer.ts and parser.ts are unchanged
  9. Anything unverified, stated as UNVERIFIED
```

---

## Before this reaches a certificate

**Verify one conversion by hand.** Take a real mV/V reading, compute the force with a
calculator using `c₁R + c₂R² + c₃R³`, and compare to what the app shows. The
coefficient-order trap is the one defect that testing alone is least likely to catch,
because both orders produce numbers.

**The NIMT certificate check from ADR-013 still stands** — confirm the certificate
states a cubic fit before any certificate is issued from this path.
