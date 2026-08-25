# DESIGN — Analysis Formula Engine (Stage E)

Status: **draft — awaiting approval, no implementation yet**

Scope confirmed with the owner (per this conversation):
- **Per-step formula editing** — each named calculation step becomes an editable
  expression, not a full free-form spreadsheet. No new steps, no new columns;
  the existing dependency order (relative error → uncertainty budget) stays fixed.
- **Admin-only, versioned, sheet-pinned** — only admins edit formulas; edits
  create a new immutable version; every sheet records which version computed
  its analysis, so a formula edit never silently changes an already-issued
  sheet's numbers. This mirrors `StandardSnapshot` (§1 of the main design).

## 0. What exists today (the thing being replaced)

`src/modules/data-recorder/analysis/relativeError.ts` and
`uncertaintyBudget.ts` are **hardcoded TypeScript functions** — every formula
(`q1 = (nominal − Fi1) / Fi1 × 100`, `b = max(q1,q2,q3) − min(...)`, the RSS
combination, truncation) is a literal expression in the source, verified once
against the demo workbook by golden tests (Stage D). Two supporting
"function libraries" already exist and are NOT formulas themselves — they are
numerical algorithms/utilities the formulas call: `numeric.ts` (Excel-faithful
ROUND/TRUNC) and `studentT.ts` (TINV via incomplete-beta + bisection).
Non-formula inputs (uncertainty parameters, CMC steps, class-limit table) are
already externalized to Firestore/config (Stage D Session 2).

This design keeps that separation: **formulas become data; the numeric/stats
functions stay code**, exposed to formulas as callable built-ins (`ROUND`,
`TRUNC`, `TINV`, `SQRT`, `ABS`, `MAX`, `MIN`, `AVERAGE`, `IF`) — the same
relationship Excel has between cell formulas and its own built-in functions.

## 1. Editable steps (the fixed set — no new steps this stage)

One `FormulaSet` per `sheetType` (today: `force-iso7500-1`) contains a named
step for every currently-hardcoded formula. Each step declares its **input
variables** (other steps by name, evaluated in the existing fixed order, plus
raw sheet inputs) and one **expression string**.

**Relative Error steps** (per cal point): `fAvg`, `q1`, `q2`, `q3`, `qAvg`,
`b`, `f0`, `v`, `a`.
**Uncertainty Budget steps** (per non-zero cal point): `sd`, `uRep`, `uRes`
(from `aF`/`aZ`, themselves references to `f0`), `uStd`, `uC`, `vEff`, `U`,
`uReport`, `reportU`.

**NOT editable this stage** (fixed, matches the "no new steps/columns"
scope): the ISO 7500-1 class-limit table and CMC steps (already
data-editable via existing settings, just not formula-shaped); the
`classifyParameter`/`worstClass` selection logic; the TINV/incomplete-beta
algorithm and ROUND/TRUNC semantics (available as built-ins, not edited);
the zero-row detection and per-series force sourcing (structural, per D1).

## 2. Formula representation & engine

- **Expression strings**, not free-form spreadsheet cells — e.g. step `b`'s
  expression is literally `MAX(q1, q2, q3) - MIN(q1, q2, q3)`. Variables are
  the step's declared inputs by name; no arbitrary cross-references.
- **A small hand-rolled parser/evaluator** — no new runtime dependency,
  matching the project's established constraint (Stage D's TINV was
  self-implemented for the same reason). Grammar: numbers, the declared
  variable names, `+ - * / ^`, comparison operators for `IF`, and a fixed
  built-in function set (`ROUND`, `TRUNC`, `ABS`, `MAX`, `MIN`, `SQRT`,
  `AVERAGE`, `IF`, `RSS`, `TINV`). No cell references, no free variable
  creation, no loops — this bounds the engine to "editable arithmetic,"
  matching the approved scope, not a general spreadsheet.
- **Safety:** no `eval`/`Function` construction from admin input. The parser
  produces a small AST evaluated by a plain recursive interpreter — the
  standard safe approach for user-supplied formulas, and testable in
  isolation like `studentT.ts`.
- **Validation before publish:** a formula must parse, reference only
  declared variables/built-ins, and successfully evaluate against the
  Stage D golden fixture inputs without throwing (numeric result, not
  necessarily matching the golden VALUE — an admin is allowed to
  deliberately change the math). Parse/reference errors block publishing;
  a numeric mismatch against golden values is a non-blocking warning shown
  in the editor ("this changes q1 for the demo sheet from X to Y").

## 2b. Versioning DEFERRED during initial development (owner decision, 2026-07-24)

Sections 3 and 4 below (append-only `FormulaSet` versions, sheet-level
`analysisFormulaVersion` pinning) are **not built in Sessions 1–2**. During
development the module uses exactly ONE mutable `FormulaSet` per
`sheetType` — an admin edit overwrites it in place, and every sheet always
evaluates against whatever is current. This trades away reproducibility of
already-issued sheets ONLY for the duration of active development, so the
formula math can be iterated on quickly without version-history churn.

**This is not a scope cut, it's a sequencing decision** — §§3–4 are the
target end state and stay in this document unchanged. Before the recorder
module is considered finished, a follow-up session converts the single
mutable doc into the append-only version chain and adds the sheet-pinning
field, exactly as designed below. Nothing in Sessions 1–3 should make that
conversion harder: the formula-evaluation contract (`FormulaSet` shape,
`formulaEngine.ts`'s input/output) is identical either way — only the
storage document's mutability and the sheet's pinning field change later.

## 3. Storage & versioning (append-only, mirrors the rest of the module)

```
analysisFormulaSets/{sheetType}/versions/{version}
  sheetType: string
  version: number                    // 1, 2, 3… monotonic per sheetType
  steps: { [stepName]: { expression: string; inputs: string[] } }
  createdAt: Timestamp
  createdByUid: string
  createdByName: string
  note?: string                      // admin's changelog entry, required
  # NEVER updated or deleted — a correction is a new version, exactly like
  # sheet amendments. This is the same append-only pattern as rawDataSheets.

analysisFormulaSets/{sheetType}   (pointer doc)
  activeVersion: number             // which version new sheets pin to
```

Firestore rules: `versions/*` — `read` authenticated, `create` admin-only,
`update`/`delete: if false` (identical shape to `rawDataSheets`). The
pointer doc — `read` authenticated, `write` admin-only (an ordinary mutable
settings doc, like `settings/cmc`).

**Seeding:** version 1 of `force-iso7500-1` is generated FROM the current
hardcoded formulas (a one-time script/step, not hand-typed), so it is
provably identical to what golden tests already verify — this is the
migration path, not a rewrite.

## 4. Sheet-level pinning (the "snapshot" the owner asked for)

`CalibrationRawDataSheet` gains one optional field:

```ts
analysisFormulaVersion?: number;   // absent on legacy sheets → treated as version 1
```

Set at save time (original and amendment) to the `sheetType`'s current
`activeVersion` — same moment `standards[]` and `envStandard` are
snapshotted, same reasoning: the sheet is immutable, so the formulas that
produced its numbers must be too. Viewing a sheet's analysis tab always
loads and evaluates *that pinned version*, never "whatever is active now."
An admin publishing version 2 does not change the displayed numbers for any
sheet already saved — only sheets saved or amended afterward pick it up.
This is the exact mechanism the owner asked for.

## 5. Evaluation pipeline (replaces the hardcoded call, not the shape)

`sheetAdapter.ts`'s output (points, resolution, decimalPlaces, uParams,
cmcSteps) stays the shared input contract. A new `formulaEngine.ts`:

1. Loads the `FormulaSet` for `(sheetType, sheet.analysisFormulaVersion)`
   (cached per version — versions are immutable, so this is a free cache).
2. For each point, evaluates the relative-error steps in their fixed
   declared order, then the uncertainty-budget steps, feeding each step's
   declared inputs (prior step results + raw inputs) into the parser/evaluator.
3. Produces the exact same `RelativeErrorResult` / `UncertaintyBudgetResult`
   shapes the UI and PDF-adjacent code already consume — **no change to
   `AnalysisResultsSection.tsx`'s contract**, only to what computes it.

The old hardcoded functions in `relativeError.ts`/`uncertaintyBudget.ts` are
kept, unmodified, as the seed-generation source and as a regression oracle:
a test asserts `formulaEngine` output for version 1 equals the hardcoded
functions' output on the golden fixture, point for point. This is the
safety net — it proves the engine reproduces Stage D exactly before anything
switches over.

## 6. Admin editor UI

New admin-only page (`/settings` area, matching the existing admin-visible
CMC editor precedent): per `sheetType`, list the editable steps with their
current expression, a text input for the new expression, live inputs/outputs
shown against the golden fixture point-by-point (so an admin can see the
effect before publishing), and a required changelog note. Publishing creates
a new immutable version and updates the pointer doc's `activeVersion` in one
transaction. Version history is browsable (list of past versions with their
notes/authors/dates) but never editable — consistent with the append-only
theme throughout this module.

## 7. Trade-offs & flags

1. **Scope is intentionally narrower than "Excel"** — no new steps, no
   arbitrary references, no spreadsheet grid. This is "tunable arithmetic
   for known named quantities," which is what "per-step formula editing"
   was scoped to. A true spreadsheet engine is a materially larger project
   (own dependency graph, its own UI, unclear interaction with
   `sheetType`) and isn't recommended unless a concrete need for it shows up.
2. **An admin can silently make the reported class/uncertainty wrong** —
   there is no automatic proof a hand-edited formula is metrologically
   correct, only that it parses and runs. The non-blocking golden-value
   diff in the editor (§2) is the mitigation, not a guarantee.
3. **Version pinning means two sheets recorded on the same day can use
   different formulas** if an admin publishes mid-day — correct per the
   requirement, but worth knowing operationally.
4. **Legacy sheets** (saved before this field exists) default to version 1
   — safe, since version 1 is byte-for-byte the current hardcoded behavior.
5. **Compression-direction formulas remain unverified** by golden data (a
   Stage D limitation, inherited here) — the seeded version 1 replicates
   the hardcoded tension-verified formulas for both directions, same as today.

## 8. Suggested execution (mirrors Stage D's session structure)

| Session | Scope | Why split |
|---|---|---|
| 1 | Formula parser/evaluator + built-ins, pure, unit-tested standalone (no Firestore, no UI) | Correctness-critical core, same reasoning as Stage D Session 1 |
| 2 | FormulaSet storage/rules, seed-version-1 generation, sheet `analysisFormulaVersion` field + snapshot-at-save, `formulaEngine.ts` wired in behind the existing analysis API, regression test vs. hardcoded functions | Schema + wiring, pattern-following |
| 3 | Admin editor UI + version history view | UI, lowest risk |

## 9. Open question for the owner before Session 1

Is "per-step formula editing" meant to be available from day one for
**both** relative-error and uncertainty-budget steps, or would you rather
start with just the relative-error steps (simpler formulas, no coverage-factor/
TINV interaction) and add uncertainty-budget steps in a later stage? Either
is a clean cut in this design; naming it now avoids re-scoping mid-session.
