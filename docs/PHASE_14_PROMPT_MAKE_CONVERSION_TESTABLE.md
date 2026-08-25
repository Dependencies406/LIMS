# Phase 14 — Make the conversion equation testable and its data enterable

## Model and effort

**Claude Sonnet 5 · Effort: Medium**

No engine changes, no metrology decisions, no TREB work. This is form fields, wiring,
and one validation guard. Every design question is already settled by ADR-013/014.

Sonnet rather than Opus because nothing here computes a force — it supplies inputs to
arithmetic that Phase 12 already proved correct and Phase 13 already wired. Medium
rather than High because the four tasks are independent and small.

**One exception worth reading carefully: Task 3's unit question.** It is the only place
in this phase where getting it wrong produces a misleading number rather than a missing
one. It is called out explicitly in that task.

## Why this phase exists

Phase 13 delivered a working picker on the record entry page. But the feature still
cannot be exercised or populated:

1. **The template builder's own test harness cannot test it.** It renders a plain text
   box for `standard` columns and calls the evaluator without any standards map. A
   template author gets `…` (awaiting-input) and no way to proceed.
2. **`REPORT_TO_N` has no source.** `CalibrationRecord.reportUnit` exists and is
   persisted, but no UI sets it, so it is always `undefined` and any formula using
   `REPORT_TO_N` reads awaiting-input forever.
3. **`rangeMin`/`rangeMax`/`resolution` have no entry UI.** They are on the type, and
   `conversionEquationService` maps them both ways, but the equation form never writes
   them. The out-of-range warning is implemented, tested, and cannot fire on real data.
   `STD_RESOLUTION` is permanently awaiting-input.
4. **Two equations can produce the same picker label**, and the reverse lookup silently
   keeps only one. Selecting the other gives the wrong coefficients — a wrong force,
   with no error.

Items 1–3 are missing inputs. Item 4 is a correctness defect.

---

## Prompt

```
Read first, in order:
  - CLAUDE.md — hard rules
  - docs/adr/ADR-014-equipment-register-is-the-reference-standard.md — D3, D5, and
    the 2026-08-04 correction block
  - docs/adr/ADR-013-reference-standards-and-signal-conversion.md — D3 (warn, never
    block), D5 (the newton table)
  - docs/adr/ADR-010-evaluation-contexts-and-summary-fields.md — the two error kinds,
    and why awaiting-input is not an error state to "fix"
  - src/services/referenceStandardOptions.ts — loadStandardOptions,
    optionsToStandardsById, standardOptionLabel, checkOptionWarnings
  - src/services/referenceStandardVariables.ts — checkForceInRange,
    checkStandardDueDate, checkDivisorAgreement, checkOutputUnitRecognised
  - src/services/forceUnits.ts — FORCE_UNITS, forceUnitToNewtons
  - src/pages/RecordEntryPage.tsx — how Phase 13 wired the picker; you are copying
    this pattern into the builder's harness

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Verify any dev server points at THIS directory. ~180 uncommitted entries on this
branch are the archive migration plus Phases 8-13 — NOT yours. Leave them alone.
recorder-reserved/ is an archive.

STOP and ask if anything differs.

## VERIFIED FACTS — checked 2026-08-14. Confirm each still holds; STOP if not.

  - evaluateMockup(template, rawRows, env, standardsById = {}) at
    recorderTemplateMockup.ts:105 — the 4th parameter already exists and already
    resolves STD_* per row (line 134-139). You do NOT need to change this function.
  - MockupHarness at RecorderTemplateBuilderPage.tsx:654 calls it with THREE
    arguments (line 687), and renders inputs as
    `type={c.type === 'number' ? 'number' : 'text'}` (line 729) — no 'standard' case.
  - MockupHarness builds `env` from ENV_TEMP_R*/ENV_RH_R* only (line 660-663, 682-686).
    REPORT_TO_N is therefore absent from the harness entirely.
  - CalibrationRecord.reportUnit?: ForceUnit exists (types/index.ts:903);
    calibrationRecordService.updateDraft already accepts 'reportUnit' (line 390);
    RecordEntryPage reads state?.record.reportUnit (line 160). Nothing WRITES it.
  - ConversionEquation has resolution/rangeMin/rangeMax (types/index.ts:1188-1189),
    and conversionEquationService maps all three (line 59-61). The equation form in
    EquipmentDetailPage (state ~1542, validation ~1588, save payload ~1608) sets
    none of them.
  - The equation form validates name non-empty only (line 1588). No uniqueness check.
  - standardOptionLabel returns `${equipment.id} — ${equation.name}`.
    invertStandardLabels (recordingGridDocument.ts:227) overwrites on duplicate label.

## TASK 1 — Make the template builder's test harness able to test a standard column

This is the task the owner is blocked on. A template author must be able to verify a
conversion formula without creating a job and a record.

In MockupHarness:

  - Load options once, with loadStandardOptions(), ONLY when the template actually
    has a `standard` column. Templates without one must not incur Firestore reads.
  - Render `standard` columns as a <select> of option labels — not a text input.
    Include an empty "— none —" choice, because "no standard selected" is a state
    worth being able to test (it should produce awaiting-input, per ADR-010).
  - The <select>'s stored value is the composite key. Display the label. Same
    separation as the grid.
  - Pass optionsToStandardsById(options) as evaluateMockup's 4th argument.
  - Add a REPORT UNIT selector to the harness (FORCE_UNITS, plus an empty choice)
    and put REPORT_TO_N into the env map via forceUnitToNewtons. Without this, any
    formula using REPORT_TO_N reads awaiting-input in the harness even though it
    would work in a real record — a misleading result, which is worse than no result.
  - Show checkOptionWarnings output for the selected option, using the row's computed
    force values. Read Task 3's unit note BEFORE deciding what to pass as those forces.

If zero reference standards exist, say so in the panel ("No equipment is flagged as a
reference standard yet") rather than rendering an empty dropdown with no explanation.

Do NOT change evaluateMockup's signature or behaviour. It already does the right
thing; only its caller is wrong.

## TASK 2 — A reporting-unit selector on the record

`REPORT_TO_N` is the other half of ADR-014 D5's
`polynomial(R) * STD_TO_N / REPORT_TO_N`. Right now it is always null.

  - Add a reporting-unit control to RecordEntryPage, FORCE_UNITS only, persisted via
    the existing updateDraft path (it already accepts 'reportUnit' — do not add a
    second write path).
  - Editable while the record is a Draft; read-only once committed. It changes every
    computed force, so it must be pinned by the same lifecycle rule as the rest of
    the record (ADR-005).
  - When unset AND the template uses REPORT_TO_N, say so where the user can see it.
    An unexplained column of `…` is the exact opacity ADR-010's error kinds exist to
    avoid. Detect "uses REPORT_TO_N" structurally, the same way
    findStandardDependentFormulaColumns detects STD_* — not by a naming convention.
  - Do NOT default it to N. A silent default would put newtons on a certificate that
    should have read kN. Unset must stay visibly unset.

Check whether reportUnit is already included in the commit snapshot. If it is not,
report that — do NOT change snapshot behaviour in this phase without saying so first.

## TASK 3 — rangeMin / rangeMax / resolution on the equation form

Add the three missing fields to the equation form in EquipmentDetailPage, alongside
the existing divisor and uncertainty inputs. All three optional; blank means unset,
not zero (ADR-010 semantics — do not coerce blank to 0).

Label them so a transcriber knows what they are for:
  - rangeMin/rangeMax — "the calibrated range these coefficients are valid over",
    stated in the equation's own output unit
  - resolution — the standard's readout resolution, exposed as STD_RESOLUTION

### The unit question — decide this explicitly and say what you decided

`checkForceInRange` compares a force value directly against rangeMin/rangeMax, and
those bounds are documented as being in the equation's `outputUnit`.

But a template formula following ADR-014 D5 divides by `REPORT_TO_N`, so its output
is in the REPORT unit, not the equation's output unit. Feeding that straight into
checkForceInRange compares two different units: a 10 kN point reported in N arrives
as 10000, gets compared against a range of 2–20, and warns when nothing is wrong.

A warning that fires when nothing is wrong gets ignored, and then it is not a warning.

Resolve it — convert to a common unit before comparing (STD_TO_N/REPORT_TO_N are both
available), or narrow what gets passed in. Either is acceptable. What is NOT acceptable
is comparing raw numbers and hoping the units line up. State your choice and where you
enforced it, and cover it with a test that would fail under the naive comparison.

## TASK 4 — Close the duplicate-label hole

Two equations under one equipment may both be named e.g. "1-10 kN". Both then produce
the label `CAL-FRC-001 — 1-10 kN`. invertStandardLabels keeps whichever came last, so
picking that label can resolve to the OTHER equation's coefficients: a plausible wrong
force, no error, straight onto a certificate. This is the same class of defect as the
coefficient-order trap, from the same cause — an identifier that does not uniquely
identify.

Both halves, please:

  - **Prevent new collisions.** Reject a duplicate equation name within one equipment
    on save, with a message naming the conflict. Case- and whitespace-insensitive
    comparison; a name differing only in trailing space is a collision to a human.
  - **Survive existing ones.** Data may already contain duplicates, so validation
    alone is not enough. Make loadStandardOptions guarantee distinct labels —
    disambiguate on collision (append the range, or a short id suffix) rather than
    emitting two identical ones. Assert injectivity where the map is built.

A test proving two same-named equations still resolve to their own distinct
coefficients is the one that matters here.

## OUT OF SCOPE

Directions (ADR-013 D7), the per-point uncertainty budget (D8), relative error,
machine class, the certificate report. Do not start them.

## CONSTRAINTS

- Do NOT change the formula grammar, the evaluator, the adapter, the composite key
  format, or any snapshot behaviour. Phases 12 and 13 verified all of it.
- Do NOT change evaluateMockup's signature.
- Do NOT default reportUnit to any value.
- Do NOT coerce blank numeric inputs to 0.
- Do NOT add a second write path for reportUnit; updateDraft already accepts it.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing work.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. The harness resolves STD_* after a standard is chosen — a formula using STD_C1
     produces a number, not awaiting-input
  2. The harness with NO standard chosen still gives awaiting-input for every STD_*
  3. REPORT_TO_N resolves in the harness once a report unit is chosen, and is null
     when it is not
  4. Two same-named equations under one equipment resolve to their OWN coefficients
     (Task 4 — the correctness test)
  5. Duplicate equation names are rejected on save, including differing only by case
     or trailing whitespace
  6. The range warning fires for a genuinely out-of-range force and does NOT fire
     for an in-range force reported in a different unit from the equation's output
     unit (Task 3 — must fail under the naive comparison)
  7. Blank rangeMin/rangeMax/resolution round-trip as undefined, never 0
  8. standardNamespaceIsolation.test.ts still passes UNMODIFIED

Run npm test and tsc --noEmit. Report both. Baseline is 45 files / 725 tests.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Any point where "VERIFIED FACTS" did not match the code
  3. Diff summary per file
  4. Your Task 3 unit decision, where it is enforced, and the test that would fail
     under the naive comparison
  5. Your Task 4 disambiguation rule, and confirmation labels are injective by
     construction rather than by luck
  6. Whether reportUnit is included in the commit snapshot — reported, not changed
  7. Confirmation the grammar, evaluator, adapter, composite key format and snapshot
     behaviour are all untouched
  8. npm test and tsc output
  9. Anything unverified, stated as UNVERIFIED — in particular say plainly whether
     you exercised the harness dropdown in a browser, or only in tests
```

---

## The test to run the moment this lands

In the template builder's test harness, with a `standard` column, a `number` column
for the mV/V reading, and a formula column:

```
STD_C1*READ_R1 + STD_C2*READ_R1**2 + STD_C3*READ_R1**3
```

Pick CAL-FRC-001, enter `R = 0.04`, and the formula column should read **1.00002**.

That single number exercises the picker, the composite key, the coefficient-direction
adapter, and `STD_*` resolution at once. `1.00304` means the coefficients are being
read in the wrong order. ADR-013's arithmetic table has the second checkpoint:
`R = 0.4` → **9.99927**.

## Still outstanding for the owner, not for a coding session

**The NIMT certificate check.** ADR-013 D1 inferred a cubic fit from two data points.
The certificate should state the equation form explicitly. This underpins every force
this pipeline will produce — confirm it before any certificate is issued.

**What happens to certificates already issued** from the Excel workbook, which was
high by up to ~0.30 % at the low end. ADR-013 records the magnitude and deliberately
takes no position; it is a decision for the laboratory and possibly its accreditation
body.
