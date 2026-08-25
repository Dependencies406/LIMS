# Phase 15 — Column units in the header, and two drift guards

## Model and effort

**Claude Sonnet 5 · Effort: Medium**

One new optional schema field plus display plumbing, one warn-only consistency check,
and two small drift guards. No engine changes, no new arithmetic.

Medium rather than Low because the unit field touches several render paths (grid, PDF,
mockup harness, read-only view) and carries one invariant that must be **proven**, not
assumed: the unit is a label and must never enter a calculation. See Task 1's
"non-negotiable" note.

## Why this phase exists

**The request.** A column header shows `UUC Reading 1` with no unit. A calibration
worksheet says `UUC Reading 1 (N)`. There is currently nowhere to put that — the owner
can only fake it by typing the unit into the `label`, which then also lands in the PDF
and the grid with no way to style or check it.

**Two holes found while verifying Phase 10.** Both are one-test fixes, and both are the
same failure mode this project keeps hitting — a duplicated list with no guard:

1. `validator.ts:66-77` hardcodes its own copy of the `STD_*` list, and its own comment
   claims *"a test asserts the two agree."* **No such test exists** — the Phase 10
   session searched and reported this honestly rather than quietly adding it.
2. `docs/FORMULA_REFERENCE.md` is hand-transcribed prose. Phase 10 generated the module
   and the modal from `BUILTIN_FUNCTIONS`, but the markdown is the one surface that can
   still silently go stale.

---

## Prompt

```
Read first, in order:
  - CLAUDE.md — hard rules
  - docs/adr/ADR-011-number-precision-and-formatting.md — display vs stored value.
    This phase adds another display-only concern; follow its precedent exactly.
  - docs/adr/ADR-014-equipment-register-is-the-reference-standard.md — D5, and the
    2026-08-04 correction. D5 is WHY the column unit must not convert anything.
  - docs/adr/ADR-004-pdf-record-table-band.md — how record columns reach the PDF
  - src/types/index.ts — RecordColumn (line 598), NumberFormat
  - src/services/recordingGridDocument.ts — buildGridDocument's header rows
  - src/services/referenceStandardVariables.ts — STANDARD_VARIABLE_NAMES
  - src/modules/recorder/formula/validator.ts — lines 63-91

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Verify any dev server points at THIS directory. ~181 uncommitted entries on this branch
are the archive migration plus Phases 8-14 — NOT yours. recorder-reserved/ is an
archive. STOP and ask if anything differs.

## VERIFIED FACTS — checked 2026-08-14. Confirm each; STOP if any differs.

  - RecordColumn (types/index.ts:598) has id, label, order, type, numberFormat,
    choices, expression, preInput. There is NO unit field.
  - validator.ts:72 declares a local `STANDARD_VARIABLES` array duplicating
    STANDARD_VARIABLE_NAMES, with a comment at line 70 claiming a test asserts they
    agree. Search for that test — the Phase 10 session reported it does not exist.
  - buildGridDocument builds two header rows: section merges, then
    `layout.columns.map((c) => c.column.label || c.column.id)`.

## TASK 1 — An optional `unit` on RecordColumn, shown in the header

Add `unit?: string` to RecordColumn. Free text, not a constrained list: columns hold
mV/V, N, kN, °C, %RH, mm, and dimensionless ratios. The ForceUnit table deliberately
covers force only.

  - A text input in the template builder beside Display label, clearly optional
  - Render as `label (unit)` wherever the header is drawn — grid, mockup harness,
    read-only record view, and the PDF record-table band
  - Store `label` and `unit` SEPARATELY and join them at render time. Do not store a
    combined string: joining is reversible, splitting is not, and the PDF may later
    want them on separate lines.
  - Blank/absent unit renders exactly as today — no empty parentheses
  - Do NOT touch the column ID or the formula variable name. `READ_R1` stays `READ_R1`.
    A unit is not part of an identifier.

### NON-NEGOTIABLE: the unit is a label and must never enter a calculation

ADR-014 D5 already owns force-unit conversion, through `STD_TO_N / REPORT_TO_N`. That
decision exists because `ConversionEquation.divisor` was a SECOND unit mechanism, and
D5's correction records what happens when two mechanisms both look authoritative: every
force wrong by exactly the factor, silently.

A `unit` string that participated in arithmetic would be a third. It must not.

  - No evaluation path may read `column.unit`. Add a test asserting this — grep-style
    over the formula module and the recalculation services, or a structural assertion
    that changing a column's unit does not change any computed value.
  - The builder input must SAY so, in words the owner will read: something like
    "Display only — does not convert values. Use STD_TO_N / REPORT_TO_N for force
    conversion." An author who assumes `(kN)` performs a conversion will produce wrong
    certificates, and the label is where that assumption forms.

This test is the point of the task. The field is trivial; the invariant is not.

## TASK 2 — Warn when the force column's unit disagrees with the report unit

The one legitimate non-arithmetic use of the new field: a consistency check.

If a formula column consuming `STD_*` (use the existing
`findStandardDependentFormulaColumns`) declares a `unit`, and the record's `reportUnit`
is set, and the two are both recognised force units but are NOT the same — warn.

  - **Warn, never block, never convert** (ADR-013 D3's standing rule). The metrologist
    may have a reason; the software may not overrule it.
  - Surface it where the reporting unit is chosen, alongside the Phase 14 banner
  - Compare through `forceUnitToNewtons`, so `N` vs `kN` is caught but an
    unrecognisable unit like `mV/V` is simply skipped rather than warned about
  - A column with no unit set warns about nothing. This must not nag authors who
    never adopt the field.

This turns a decorative field into a real safety net: a template whose header claims kN
inside a record reporting N is now visible, which is the same reasoning as
`checkDivisorAgreement`.

## TASK 3 — Warn when a force formula omits the unit conversion

**This is the most valuable task in the phase. Do it even if something else is cut.**

`REPORT_TO_N` works: `polynomial(R) * STD_TO_N / REPORT_TO_N` normalises through
newtons, so a kN equation reporting in kgF gives `10 → 10000 N → 1019.716 kgF`
correctly, with one factor per unit instead of the workbook's `O15` matrix.

But the conversion is **opt-in prose**. It only happens if the template author types it.
Nothing verifies they did. A formula written as:

    STD_C1*READ_R1 + STD_C2*READ_R1**2 + STD_C3*READ_R1**3

produces a number in the EQUATION's output unit, regardless of what the record's
reporting unit says. The certificate then labels kN values as kgF — off by 101.97x, with
no error anywhere. This is the same defect class as the coefficient-order trap and the
`divisor` double-scale: a plausible number, silently in the wrong unit.

The owner currently has a live template in exactly this state (the conversion was
omitted deliberately for a first end-to-end test).

### The rule

At template VERIFY time, in the builder — where the author is, not at record time:

  - A formula column that references any `STD_C0`…`STD_C5` is producing a force from
    the polynomial.
  - If that same expression does NOT reference BOTH `STD_TO_N` and `REPORT_TO_N`, warn.
  - Scope the check to `STD_C*` specifically, NOT to `STD_*` generally. `STD_UCAL`,
    `STD_UA`, `STD_UB`, `STD_UC` are percentages and `STD_RESOLUTION` is already in the
    equation's unit — none of them need or want the factor. Warning on those would
    train the author to ignore the warning.

### Warn, do not block, and do not auto-insert

  - **Warn.** An author may legitimately want the raw polynomial — a diagnostic column,
    an intermediate step feeding another formula. The metrologist decides (ADR-013 D3).
  - **Do not auto-insert the factor.** Silently rewriting an author's formula is worse
    than the omission: they would no longer know what their own template computes. The
    whole reason ADR-013 D5 puts the conversion in the visible formula rather than in a
    builtin is that a reviewer must be able to SEE the unit handling.
  - The message must name the fix, not just the problem. State that the factor is 1
    when the units already match, so adding it costs nothing and protects the template
    if the reporting unit changes later.

### Also worth surfacing, same check

When both `STD_TO_N` and `REPORT_TO_N` ARE present, nothing more is needed — the
arithmetic handles any pair. Do not warn about unit *combinations*; that is precisely
what newton-normalisation made unnecessary.

Cover with tests both ways: a formula using `STD_C1` without the factor warns; the same
formula with `* STD_TO_N / REPORT_TO_N` does not; a formula using only `STD_UCAL` never
warns.

## TASK 4 — Close the two drift holes

### 4a. Make validator.ts's comment true

Add the test its comment already claims exists: `validator.ts`'s local
`STANDARD_VARIABLES` and `services/referenceStandardVariables.STANDARD_VARIABLE_NAMES`
contain the same names.

Keep the duplication — the formula module's standalone-ness is a deliberate design
choice and a test is the correct way to hold two intentional copies together. Do NOT
"fix" this by importing across the boundary.

Why it matters concretely: raise `MAX_COEFFICIENT_INDEX` to 7 and
`STANDARD_VARIABLE_NAMES` grows, the evaluator resolves `STD_C6`, Phase 10's docs
document it, the disclosure offers it to authors — and the validator rejects it as "not
a valid reference standard value". The author is told a correct formula is wrong.

### 4b. Guard the reference document against going stale

`docs/FORMULA_REFERENCE.md` is hand-written prose — the one Phase 10 surface not
generated from `BUILTIN_FUNCTIONS`.

Do NOT regenerate the whole document; prose written for a non-programmer is worth more
than a generated table. Instead add a test that reads the markdown and asserts every
name in `BUILTIN_FUNCTIONS`, `COLUMN_AGGREGATES` and `STANDARD_VARIABLE_NAMES` appears
somewhere in it. Cheap, and it converts silent rot into a failing test.

## OUT OF SCOPE

Directions (ADR-013 D7), the per-point uncertainty budget (D8), relative error, machine
class, the certificate report. Unit conversion of anything. Do not start them.

## CONSTRAINTS

- Do NOT change the formula grammar, the evaluator, the validator's BEHAVIOUR, the
  adapter, the composite key format, or any snapshot behaviour.
- Do NOT let `unit` participate in any calculation, anywhere.
- Do NOT auto-insert, rewrite or "correct" an author's formula (Task 3). Warn only.
- Do NOT add a builtin that performs the unit conversion. ADR-013 D5 rejects it
  explicitly: the factor stays visible in the formula so a reviewer can see it.
- Do NOT warn about which unit PAIR is in use. Newton-normalisation makes every pair
  valid; only the MISSING factor is worth flagging.
- Do NOT constrain `unit` to ForceUnit — most columns are not forces.
- Do NOT put the unit in the column ID or the variable name.
- Do NOT import services/ into the formula module (see 3a).
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing work.
- Existing templates have no `unit`. They must render exactly as they do today —
  confirm with a test using a fixture that has no unit set anywhere.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. A column with a unit renders `label (unit)`; without one, renders `label` — no
     stray parentheses
  2. Changing a column's unit changes NO computed value (Task 1's invariant)
  3. No evaluation path reads column.unit
  4. The force-column/report-unit mismatch warns for N vs kN, stays silent when the
     units match, when either is unset, and when the column unit is not a force unit
  5. A formula using STD_C1 WITHOUT `* STD_TO_N / REPORT_TO_N` warns (Task 3)
  6. The same formula WITH the factor does not warn
  7. A formula using only STD_UCAL never warns — the check is STD_C* only
  8. The warning does not modify the author's expression (no auto-insert)
  9. The kN → kgF arithmetic is correct end to end: coefficients producing 10 kN with
     reportUnit kgF yields ~1019.716, not 10 and not 10000
 10. validator.ts's STANDARD_VARIABLES equals STANDARD_VARIABLE_NAMES (4a)
 11. FORMULA_REFERENCE.md mentions every builtin, aggregate and STD_* name (4b)
  7. A template with no units anywhere is unchanged in the grid, the harness and the
     PDF
  8. standardNamespaceIsolation.test.ts still passes UNMODIFIED

Run npm test and tsc --noEmit. Report both. Baseline is 53 files / 923 tests.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Any point where "VERIFIED FACTS" did not match the code — in particular, confirm
     whether the test claimed by validator.ts:70 exists
  3. Diff summary per file
  4. Every render path where the unit now appears, listed — and confirmation the PDF
     band was included, or a plain statement that it was not and why
  5. How you proved column.unit cannot reach a calculation, and the test that would
     fail if it could
  6. The exact wording of the Task 3 missing-conversion warning, and confirmation it
     fires on STD_C* only — plus the kN → kgF test's actual computed number
  6. Confirmation the grammar, evaluator behaviour, adapter, composite key format and
     snapshot behaviour are untouched
  7. npm test and tsc output
  8. Anything unverified, stated as UNVERIFIED — including whether you saw the header
     render in a browser
```

---

## Owner items still open, none of them coding work

**Have the Thai translations reviewed.** The Phase 10 session flagged plainly that it is
not a certified technical translator. The terminology it used (ปัดเศษ, ความไม่แน่นอน,
องศาอิสระ, สัมประสิทธิ์) is standard, but `FORMULA_REFERENCE.md` is a document an
assessor may read. Worth a pass by someone in the lab.

**Recipe #2's zero-nominal fallback** returns `0` when the nominal is zero. That was a
judgement call, not a specification — override it if your convention differs.

**The NIMT certificate check.** ADR-013 D1 inferred a cubic fit from two data points.
The certificate should state the equation form. This still underpins every force the
pipeline produces.

**Certificates already issued** from the Excel workbook, which was high by up to
~0.30 % at the low end. ADR-013 records the magnitude and takes no position — a
decision for the laboratory and possibly its accreditation body.
