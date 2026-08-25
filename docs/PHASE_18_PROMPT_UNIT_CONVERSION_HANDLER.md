# Phase 18 — Display-time unit conversion handler

## Model and effort

**Claude Sonnet 5 · Effort: High**

ADR-015 settles every design question, so this is not exploratory. High effort because
the phase adds a new shared entity, a render-time pipeline, and per-cell commit
provenance — and because two invariants must be **proven**, not assumed:

1. Conversion never reaches the formula engine (D1)
2. A converted column's stored value stays raw, so chained formulas cannot
   double-convert (D1)

Both produce wrong numbers rather than errors if broken. That is the same consequence
profile that put Phases 11-13 on high effort.

## Sequencing

Run **after Phase 17**. Phase 17 touches the formula inputs; this phase touches the
column editor around them and the render path beneath. Neither depends on the other's
logic, but they collide in `RecorderTemplateBuilderPage.tsx`.

---

## Prompt

```
Read first, in order:
  - CLAUDE.md — hard rules
  - docs/adr/ADR-015-display-time-unit-conversion.md — THE SPECIFICATION. D1 and D5
    are the two that keep this from becoming a third unit mechanism.
  - docs/adr/ADR-014-equipment-register-is-the-reference-standard.md — D5 and its
    2026-08-04 correction. Read WHY divisor was wrong; this phase must not repeat it.
  - docs/adr/ADR-011-number-precision-and-formatting.md — full precision stored,
    rounding at display. Conversion goes BEFORE that rounding.
  - docs/adr/ADR-005-record-lifecycle.md — snapshotting, for D7
  - docs/adr/ADR-010-evaluation-contexts-and-summary-fields.md — the two error kinds
  - src/services/forceUnits.ts — the exact force table D5 protects
  - src/services/conversionEquationService.ts — the house pattern for a shared,
    admin-managed entity. Follow it; do not invent a different service shape.
  - src/services/recordingGridDocument.ts — where display values are built
  - src/services/pdf-renderers/renderRecordTable.ts — the PDF path
  - src/types/index.ts — RecordColumn's unitMode block (~line 609)

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Verify any dev server points at THIS directory. Pre-existing uncommitted work on this
branch is NOT yours. recorder-reserved/ is an archive. STOP and ask if anything differs.

## TASK 1 — The rule library (ADR-015 D2, D4, D5)

A new shared collection, following conversionEquationService's conventions exactly
(exported object literal, subscribe/getAll/add/update, serverTimestamp, a toDate mapper).

A rule is: fromUnit, toUnit, expression, plus name/notes/active.

  - The expression is parsed by the EXISTING formula parser. No second syntax.
  - Exactly ONE variable is in scope: the column's value. Name it `VALUE`. Any other
    identifier is a validation error at save — reject `STD_*`, `ENV_*`, column names,
    everything (D4). Validate at save time using the existing validator machinery, not
    a hand-rolled check.
  - **Reject any rule where fromUnit AND toUnit are both ForceUnit values** (D5), with
    a message naming `STD_TO_N / REPORT_TO_N` as the correct route. This is the boundary
    that stops this feature becoming a second force-conversion implementation.
  - Reject fromUnit === toUnit.
  - Deactivate, never delete — committed records reference these.
  - Firestore rules: this collection needs a block. SHOW ME the proposed rule before
    applying it. Admin-write is the likely answer, matching the equipment equations.

Admin UI: list, create, edit, deactivate. Show a live preview evaluating the expression
against a sample value, the same way the equation editor shows its equation — an author
transcribing a factor must see what it does.

## TASK 2 — Per-column opt-in and source-unit declaration (D3, D9)

On `formula` columns ONLY (D9):

  - A checkbox enabling conversion for that column
  - A source-unit field — "this column's values are in" — beside the header unit
  - Both hidden entirely for non-formula column types. Do not render a disabled control
    on a text column; it implies the feature exists there.

Cross-check (D3): when the column's expression references any `STD_C*`, compare the
declared source unit against the selected standard's `outputUnit` and warn on
disagreement. Warn, never block — same treatment as checkDivisorAgreement, and for the
same reason. A wrong declaration is the one route by which this design produces a wrong
number, so it must be visible.

## TASK 3 — The render pipeline (D1, D8) — THE CRITICAL TASK

Implement D8's order as a pure, testable module. Take the raw computed value and return
`{ displayValue, applied | failure }`.

    1. raw value (engine output, untouched)
    2. source unit  — the declaration, cross-checked
    3. target unit  — the header's EFFECTIVE unit: fixed, the record's columnUnits
                      selection, or resolved through a sameAs chain
    4. equal, or conversion disabled → stop
    5. look up a rule for (source → target) → none → D6
    6. apply at FULL PRECISION, then ADR-011 display rounding

### The invariants to prove, not assume

**Nothing in src/modules/recorder/formula/ or the recalculation services may import,
read, or know about conversion.** Add a structural test asserting this — the same shape
as the standardNamespaceIsolation leak test, which is the established pattern here.

**A converted column's stored value stays RAW.** Write the test that would catch the
opposite: column A converts, column B is a formula referencing A, and B's result must be
computed from A's RAW value. If B saw the converted value, two conversions would compound
— the exact ADR-014 D5 divisor failure. Prove this test fails if you make the pipeline
write back converted values.

Apply the pipeline in all three render paths: the grid, the read-only record view, and
the PDF record table. If any path is not covered, say so plainly rather than leaving it
silently inconsistent.

## TASK 4 — Failure handling (D6)

No rule, expression error, divide by zero, non-finite result:

  - Show the RAW value with a visible marker
  - Add the failure to the record's warnings, naming the column and the missing pair
  - Never blank the cell, never throw into the render tree

Test each failure mode separately. "It does not crash" is not a test; assert the marker
appears AND the raw number is still shown AND the warning names the pair.

## TASK 5 — Commit provenance (D7)

At commit, each converted cell snapshots: the rule id, its expression, source unit,
target unit, raw value and converted value.

Prove it the same way Phase 5a proved template pinning and Phase 12 proved equation
snapshots: commit, then edit the live rule, and show the committed record's displayed
numbers do not move.

The certificate prints the CONVERTED value (D7).

## OUT OF SCOPE

Directions (ADR-013 D7), the uncertainty budget (D8), relative error, machine class.
Any change to force conversion. Unit inference over expressions. Do not start them.

## CONSTRAINTS

- Do NOT change the formula grammar, lexer, parser, evaluator, validator, or any
  evaluation behaviour. This phase renders; it does not compute.
- Do NOT write converted values back into rows, records, or Firestore as the column's
  value. Raw stays raw (D1).
- Do NOT allow a force→force rule (D5).
- Do NOT let a conversion expression reference anything but VALUE (D4).
- Do NOT round before converting (D1, ADR-011).
- Do NOT offer conversion on non-formula columns (D9).
- Do NOT throw from the render path (D6).
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing work.
- SHOW ME proposed Firestore rules before applying them.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. Force→force rules are rejected at save, naming STD_TO_N / REPORT_TO_N
  2. A rule referencing anything but VALUE is rejected at save
  3. The full D8 order, end to end, for a non-force pair — e.g. a mV/V→% rule
  4. An offset conversion works: (VALUE - 32) * 5 / 9
  5. A downstream formula referencing a converted column sees the RAW value — and the
     test fails if the pipeline writes back converted values
  6. No formula-module or recalculation file references conversion (structural test)
  7. Conversion happens BEFORE display rounding, not after
  8. Target unit resolves correctly for fixed, selectable and sameAs headers
  9. Each failure mode: no rule, bad expression, divide by zero, non-finite — raw value
     shown, marker present, warning names the pair, nothing thrown
 10. Snapshot proof — edit the live rule, committed numbers do not move
 11. Non-formula columns are never offered conversion
 12. standardNamespaceIsolation.test.ts still passes UNMODIFIED

Run npm test and tsc --noEmit. Report both, with before and after counts.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Proposed Firestore rules, shown BEFORE applying
  3. Diff summary per file
  4. The exact place the conversion pipeline is applied, for each of the three render
     paths — or a plain statement that one was not covered, and why
  5. How you proved conversion cannot reach the formula engine, and the test that would
     fail if it could
  6. How you proved a downstream formula sees the raw value — including the
     deliberately-broken run showing that test can fail
  7. Confirmation force→force rules are refused, and where
  8. npm test and tsc output
  9. Anything unverified, stated as UNVERIFIED — say plainly whether you saw a converted
     column render in a browser
```

---

## The one thing that would make this dangerous

D5 is what keeps this from repeating history. The newton table is exact and tested; a
hand-entered rule duplicating it would be indistinguishable from a real measurement when
mistyped, and this project has already shipped two unit mechanisms that disagreed
(`ConversionEquation.divisor`, corrected in ADR-014 D5).

If a session finds itself arguing that force→force rules would be convenient, that is
the moment to stop and re-read ADR-014 D5's correction block.
