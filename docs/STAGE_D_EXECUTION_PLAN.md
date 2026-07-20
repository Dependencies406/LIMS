# STAGE D EXECUTION PLAN — Relative Error & Uncertainty Analysis Module

Builds design §8c against the extracted STAGE_D_FORMULA_SPEC.md and
STAGE_D_GOLDEN_DATA.json. Three Claude Code sessions in the design's stated
order: pure math first (provable against golden data), then schema/storage,
then UI. Each session commits per step, so recovery = new session + git log.

---

## 0. DECISIONS RECORD (owner, 2026-07-19) — binding for all sessions

- **D1:** Force conversion uses the app's existing
  `conversionEquationService.evaluate()` exactly as-is. The workbook's
  `c3·x` quirk is NOT replicated. Therefore app-computed forces ≠ workbook
  forces, and golden tests feed the workbook's STD-Force VALUES directly into
  the analysis functions (testing analysis math in isolation).
- **D2:** b = max − min over {q1, q2, q3} (NOT the workbook's q1 − q3).
  Golden `b` values and b-derived class values are recomputed in tests from
  the golden q columns; all other columns assert verbatim.
- **D3:** f0 formula stands as extracted: max residual (zero-row) force ÷ cal
  point × 100. Confirmed as the intended definition (usually 0 in practice).
- **D4:** u_res stays wired exactly as the workbook has it (a_F/a_Z from the
  f0 values, ÷2√3 each, RSS). Replicate.
- **D5:** u_cal/A/B/C are already standard uncertainties — RSS them raw, no
  ÷√3. Replicate.
- **D6:** Report-U = max(U, CMC), TRUNCATED (not rounded) to 2 significant
  figures, output as a formatted string. Replicate.
- **D7 [OPEN — must be answered before Session 2]:** storage home for
  u_cal/A/B/C. LCDB shows they vary per range+direction (one value per
  conversion equation), so the recommendation is fields on the
  ConversionEquation document (uCal/uA/uB/uC), edited in the existing
  equation form, snapshotted onto StandardSnapshot at save. Owner to confirm
  vs. the equipment-constant feature.

## 1. Pre-flight (you, before Session 1)

1. Copy into the repo and commit on a new branch `feature/analysis-module`
   (from current master/main state):
   - `docs/STAGE_D_FORMULA_SPEC.md`
   - `docs/STAGE_D_DECISIONS.md` → paste section 0 of this file into it
   - `src/modules/data-recorder/analysis/__tests__/fixtures/STAGE_D_GOLDEN_DATA.json`
2. Spot-check ~5 golden values against the real workbook (one q, u_c, k,
   V_eff, one Report-U string) — you are the oracle's oracle.
3. Answer D7.
4. Confirm the CMC table in the spec §4 matches the current scope of
   accreditation, and that LCDB u_cal/A/B/C values are current.

## 2. Model & effort

| Session | Scope | Model | Effort |
|---|---|---|---|
| 1 | Pure analysis math + inverse-t + golden tests | **Opus** | **xhigh** (numerics + exact-match tests: the correctness-critical core; retries here are the expensive failure mode) |
| 2 | Schema fields + snapshot + mapper + CMC storage + forms | Sonnet | high (pattern-following against existing code) |
| 3 | Read-only analysis tab UI | Sonnet | high |

## 3. SESSION 1 PROMPT — copy below the line into a fresh Claude Code session

---

[TASK: Stage D, Session 1 of 3 — pure analysis module for the Data Recorder
(design §8c): relative error + uncertainty budget for sheetType
force-iso7500-1, with golden tests against the demo workbook. NO schema
changes, NO UI, NO Firestore — pure functions only.]

CONTEXT — read ONCE, in full, in this order, before writing anything:
- docs/STAGE_D_FORMULA_SPEC.md — the authoritative formulas, extracted
  verbatim from the lab's workbook. Implement EXACTLY these formulas as
  modified by docs/STAGE_D_DECISIONS.md (D1–D6). Never silently "correct" a
  formula beyond what a decision states.
- docs/STAGE_D_DECISIONS.md — binding decisions.
- src/modules/data-recorder/analysis/__tests__/fixtures/STAGE_D_GOLDEN_DATA.json
  — the test oracle (workbook cached values; tension direction only).
- docs/DATA_RECORDER_DESIGN.md §8c only — architecture position.
- The CalibrationRawDataSheet types in src/types/index.ts, to shape the
  analysis input from a saved sheet.
- CLAUDE.md rules are binding — session-start git checks; work on branch
  feature/analysis-module (created by me; verify you are on it, clean tree).

STEP 1 — Verify (report findings; STOP and ask if either fails):
  - How the zero point is represented in stored sheet rows (calPoint === 0
    row with force values?) — f0 and a_Z depend on locating it.
  - That rows' cells carry the computed force per series (the analysis reads
    STORED force values; per D1 it never re-runs conversion itself).

STEP 2 — src/modules/data-recorder/analysis/relativeError.ts (pure):
  computeRelativeError(input) where input is a plain object derived from a
  sheet (calPoint rows with per-series forces, uuc.resolution,
  decimalPlaces). Output per point: fAvg (rounded to decimalPlaces — the
  ONLY rounded intermediate), q1..q3, qAvg, b (per D2: max−min of q1..q3),
  f0 (per D3), v ('-' sentinel when no decreasing series), a, per-parameter
  class, overall class; plus the ISO class-limit table as a typed constant
  (spec §2 table, with the 'N/A' beyond-class-3 rule). Follow the spec's
  IFERROR-to-0 and empty/'-' propagation semantics exactly.

STEP 3 — src/modules/data-recorder/analysis/studentT.ts (pure): two-tailed
  inverse Student-t, tinv(alpha, nu) for REAL (non-integer) nu, matching
  Excel TINV semantics at alpha=0.0455; implement numerically (e.g.
  incomplete-beta CDF + root finding) with no new runtime dependency unless
  a suitable one already exists in package.json. Fallback k=2 when nu is
  invalid (spec §3 col N). Unit-test against the golden k values.

STEP 4 — src/modules/data-recorder/analysis/uncertaintyBudget.ts (pure):
  computeUncertaintyBudget(input) taking the relative-error results plus
  uParams {uCal,uA,uB,uC} and cmcCriteria (direction-resolved steps) AS
  ARGUMENTS (storage for them arrives in Session 2 — keep these functions
  storage-agnostic). Output per point: sd, uRep, aF, aZ, uRes, uStd, uC,
  vEff, k, U, cmc, uReport (number), reportU (the truncated 2-sig-fig
  STRING per D6, exact TEXT/TRUNC semantics from spec §3 col V). CMC
  lookup: cal point normalized to N (kN×1000), stepwise ≤ thresholds.

STEP 5 — Golden tests in src/modules/data-recorder/analysis/__tests__/
  (vitest, existing conventions), driven from the fixture JSON:
  - Relative error, tension: feed the golden per-series FORCE values
    (rawData[].{inc1,inc2,inc3,dec3}.force) + resolution + decimalPlaces.
    Assert verbatim (tolerance 1e-9 relative): fAvg, q1..q3, qAvg, f0, a,
    and their classes. Assert b and b-class against values RECOMPUTED in
    the test from golden q1..q3 (max−min) and the class table — per D2 the
    golden K column itself is superseded; also recompute the expected
    overall class where b-class changes it. v: golden is '-' throughout
    (no decreasing data in the demo) — assert the sentinel.
  - Uncertainty budget, tension: feed golden q-derived inputs + the
    fixture's LCDB uParams for the sheet's standard + tensile cmcCriteria.
    Assert verbatim: sd, uRep, uRes(=0), uStd, uC, vEff at 1e-9 relative;
    k, U at 1e-6 relative (TINV reimplementation tolerance); cmc exact;
    reportU as EXACT STRING. If any reportU string mismatches due to a
    truncation boundary, STOP and report — do not widen tolerance.
  - Synthetic coverage for what the demo can't test: hand-computed cases
    (documented in-test) for v with a decreasing series, f0 with nonzero
    zero-row forces, u_res consequently nonzero, and b where q2 is the
    extreme (max−min ≠ |q1−q3| — proves D2 is implemented).
  Run tests until green.

STEP 6 — Report: files created, any deviation from the spec (never silent),
  numeric tolerances actually needed, known limitations (compression
  direction untested by golden data), and confirmation that NOTHING outside
  src/modules/data-recorder/analysis/ was touched.

RULES:
- Read each existing file at most once; prefer context already loaded.
- Never guess codebase behavior — verify in code or mark [UNVERIFIED].
- If stuck on the same error more than twice, stop and report.
- Modify NOTHING outside src/modules/data-recorder/analysis/ (types stay
  untouched this session — analysis input types live inside the module).
- Code, comments, commit messages: English. Commit per completed step on
  feature/analysis-module; do not push unless I say so.

---

## 4. SESSION 2 PROMPT — after Session 1 is green AND D7 is answered

> Fill ⟨D7 ANSWER⟩ before pasting.

---

[TASK: Stage D, Session 2 of 3 — storage for uncertainty parameters and CMC
(design §8c Prerequisites A and B). Branch feature/analysis-module; Session 1
(pure analysis + golden tests) is committed — do not modify it.]

CONTEXT — read ONCE: docs/STAGE_D_FORMULA_SPEC.md §4–§5,
docs/STAGE_D_DECISIONS.md, docs/DATA_RECORDER_DESIGN.md §8c prerequisites,
the ConversionEquation type + conversionEquationService + its edit form, the
StandardSnapshot type + where snapshots are built at sheet save, and the
legacy-normalization mapper pattern. CLAUDE.md rules binding; verify branch
and clean tree first.

DECISION D7: ⟨D7 ANSWER — e.g. "uCal/uA/uB/uC live on the ConversionEquation
document, edited in the existing equation form"⟩

STEPS:
1. Types: optional uCal/uA/uB/uC (numbers, %) per D7's home; extend
   StandardSnapshot with the same optional fields; bump sheet
   schemaVersion to 2; mapper defaults absent values (house
   legacy-normalization pattern) so old sheets load unchanged.
2. Equation edit form: four labeled inputs (Thai labels for end users,
   e.g. u_cal (%), A (%), B (%), C (%)); persist via the existing service.
3. Sheet save: snapshot the four fields onto StandardSnapshot when present.
4. CMC storage: settings/cmc Firestore document {schemaVersion, directions:
   {tension: steps[], compression: steps[]}} with steps {toN, cmcPercent};
   a small service (get + set) and a minimal admin-visible editor section
   (existing settings/admin surface if one exists — verify; else a simple
   page). Seed values from spec §4. Firestore rules: read for authenticated
   users; write for role admin (copy the existing admin-gate pattern).
5. Tests: mapper defaults (v1 sheet loads, snapshot fields undefined),
   snapshot carries values when present, cmc service get/set with ./firebase
   mocked per house style. Run all tests including Session 1's (must stay
   green untouched).
6. Report: files changed, whether firestore.rules needs a deploy, and the
   data-entry task left for me (typing the LCDB u values into each
   equation via the form — list the equations found).

RULES: as Session 1, but modifiable files are: the types file, the equation
form + service, the sheet-save snapshot builder, the new cmc service/editor,
firestore.rules. Commit per step; no push.

---

## 5. SESSION 3 PROMPT — after Session 2

---

[TASK: Stage D, Session 3 of 3 — read-only analysis tab on the saved-sheet
view (design §8c UI). Branch feature/analysis-module; Sessions 1–2 committed
— do not modify their logic.]

CONTEXT — read ONCE: docs/STAGE_D_FORMULA_SPEC.md §2–§4 (column meanings for
display), the analysis module's public API, SheetEditorPage (read-only mode)
+ the sheet PDF module for layout conventions, settings/cmc service.
CLAUDE.md rules binding; verify branch and clean tree.

STEPS:
1. "ผลการวิเคราะห์" section/tab on the SAVED (read-only) sheet view, computed
   on demand — derived values are never stored on the sheet. Two tables
   mirroring the workbook: Relative Error (per point: Fi1..3, F'i3, F_avg,
   q1..3, q_avg, b, f0, v, a, class columns, overall class + the class-limit
   reference table) and Uncertainty Budget (S.D., u_rep, u_res, u_cal, A, B,
   C, u_std, u_c, V_eff, k, U, CMC, Report U). Thai labels for headings,
   symbol names stay as symbols. Self-contained styles like MeasurementGrid.
2. Parameter sourcing + honesty labels: uParams from the sheet's snapshots
   when present; for older sheets without them, fall back to the CURRENT
   equation values and show a clear Thai notice that current (not
   as-recorded) parameters were used. CMC from settings/cmc by the sheet's
   direction; if missing, show Report-U column as unavailable with a notice
   (never silently show U as Report-U). Amendments: analysis reads the sheet
   being viewed (recomputation is automatic by design).
3. Numeric display: match workbook precision conventions sensibly (report
   what you choose); Report U shown as its exact truncated string.
4. Tests: a component-level or pure formatting test for the fallback/notice
   logic. npm test all green; npm run build clean.
5. Report: files changed, walkthrough checklist for me (open the seeded
   SCS-CAL-26024 tension sheet → verify displayed numbers against the
   workbook; open an old sheet → see the current-parameters notice; empty
   settings/cmc → see the Report-U notice), limitations, and the reminder
   that the certificate-PDF section remains future scope per design §8c.

RULES: as before; modifiable: the data-recorder module UI files + one route/
tab wiring point in SheetEditorPage. Commit per step; no push.

---

## 6. Recovery & discipline

- Crash/compaction: new session, same model → "mid Stage D on
  feature/analysis-module; run `git log --oneline master..HEAD`, read
  docs/STAGE_D_FORMULA_SPEC.md + docs/STAGE_D_DECISIONS.md, continue from
  the first uncommitted step of Session ⟨n⟩: ⟨remaining steps⟩."
- Same error twice → session stops per rules; bring the error here first.
- Any reported deviation from the spec: you accept/reject explicitly.

## 7. Your checklist after Session 3

1. Enter the LCDB u_cal/A/B/C values into each equation via the new form
   (Session 2's report lists them; values are in the golden JSON's lcdb).
2. Verify the analysis tab numbers against the workbook for SCS-CAL-26024.
3. `firebase deploy --only firestore:rules` (settings/cmc rules).
4. Merge feature/analysis-module when satisfied.
