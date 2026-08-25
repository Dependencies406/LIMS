/**
 * seedFormulaSet.ts
 *
 * The seed FormulaSet for sheetType 'force-iso7500-1' — a formula-engine
 * expression of the SAME logic already hardcoded and golden-tested in
 * ../relativeError.ts and ../uncertaintyBudget.ts. This is Session 2's
 * "not hand-typed, not guessed" requirement: every step's `expression` is a
 * literal transcription of an existing line of code, cited below, and its
 * correctness is PROVEN (not just asserted) by the regression test in
 * __tests__/forceIso75001Regression.test.ts, which runs both this FormulaSet
 * and the original hardcoded functions over the same inputs and requires
 * identical output.
 *
 * Two structural facts stay OUTSIDE the formula language, matching design
 * §1's "NOT editable this stage" list, and are supplied as RAW INPUTS
 * instead of formula steps:
 *   - incCount / hasDec — which series are actually present. The formula
 *     language has no concept of "AVERAGE skips blanks"; the adapter
 *     (engineAdapter.ts) resolves that once per point and hands the count
 *     down, exactly mirroring relativeError.ts's toForce()/filter() calls.
 *   - zeroForce / zeroF0 — the zero row is found once per sheet, not per
 *     formula (design: "zero-row detection... structural, per D1").
 *     zeroF0 is always literally 0 — see uncertaintyBudget.ts:166-167's own
 *     comment: the zero row's own f0 divides by cal point 0, which the f0
 *     formula's own IF-guard (below) already forces to 0 structurally.
 *
 * Step order is fixed and mirrors the interface field order exactly:
 *   Relative Error   — relativeError.ts:109-146 (RelativeErrorPoint)
 *   Uncertainty Budget — uncertaintyBudget.ts:50-86 (UncertaintyBudgetPoint)
 */

import { COVERAGE_ALPHA } from '../studentT';
import type { FormulaSet } from './formulaSet';

export const FORCE_ISO7500_1_SHEET_TYPE = 'force-iso7500-1';

/**
 * Relative Error steps, derived from relativeError.ts's computePoint()
 * (lines 232-306):
 *
 *   fAvg — line 243-250: AVERAGE of present increasing forces (Excel skips
 *     blanks), 0 when none present, ROUNDed to decimalPlaces. incCount and
 *     the zero-substituted fi1/fi2/fi3 (adapter's toForceOrZero) reproduce
 *     "skips blanks" without the formula language needing range semantics:
 *     an absent value contributes 0 to the sum and 0 to incCount.
 *   q1/q2/q3 — line 253-255: ratioPercent(calPoint - fi, fi), IFERROR-to-0
 *     when fi is 0 or absent (relativeError.ts uses `fi1 ?? 0` for both).
 *   qAvg — line 258: AVERAGE(q1, q2, q3) — the IFERROR'd zeros count.
 *   b — line 261, per D2: MAX − MIN over {q1, q2, q3}, NOT the workbook's
 *     q1 − q3.
 *   f0 — line 264/216-228, per D3: max zero-row force ÷ this cal point.
 *   v — line 267-268: (fi3 − fd3) / fAvg, IFERROR-to-0. The '-' NO_VALUE
 *     sentinel (no decreasing series) is a structural decision made by the
 *     adapter, not a formula branch — see the module doc above.
 *   a — line 271: resolution ÷ cal point.
 */
const RELATIVE_ERROR_STEPS: FormulaSet['steps'] = [
  {
    name: 'fAvg',
    inputs: ['fi1', 'fi2', 'fi3', 'incCount', 'decimalPlaces'],
    expression: 'ROUND(IF(incCount = 0, 0, (fi1 + fi2 + fi3) / incCount), decimalPlaces)',
  },
  {
    name: 'q1',
    inputs: ['calPoint', 'fi1'],
    expression: 'IF(fi1 = 0, 0, (calPoint - fi1) / fi1 * 100)',
  },
  {
    name: 'q2',
    inputs: ['calPoint', 'fi2'],
    expression: 'IF(fi2 = 0, 0, (calPoint - fi2) / fi2 * 100)',
  },
  {
    name: 'q3',
    inputs: ['calPoint', 'fi3'],
    expression: 'IF(fi3 = 0, 0, (calPoint - fi3) / fi3 * 100)',
  },
  {
    name: 'qAvg',
    inputs: ['q1', 'q2', 'q3'],
    expression: 'AVERAGE(q1, q2, q3)',
  },
  {
    name: 'b',
    inputs: ['q1', 'q2', 'q3'],
    expression: 'MAX(q1, q2, q3) - MIN(q1, q2, q3)',
  },
  {
    name: 'f0',
    inputs: ['calPoint', 'zeroForce'],
    expression: 'IF(calPoint = 0, 0, zeroForce / calPoint * 100)',
  },
  {
    name: 'v',
    inputs: ['fAvg', 'fi3', 'fd3'],
    expression: 'IF(fAvg = 0, 0, (fi3 - fd3) / fAvg * 100)',
  },
  {
    name: 'a',
    inputs: ['calPoint', 'resolution'],
    expression: 'IF(calPoint = 0, 0, resolution / calPoint * 100)',
  },
];

/**
 * Uncertainty Budget steps, derived from uncertaintyBudget.ts's
 * computePoint() (lines 154-206):
 *
 *   sd — line 161: sample std dev of q1, q2, q3 (STDEV built-in wraps the
 *     same sampleStdDev() this formula must match).
 *   uRep — line 162: sd / √2.
 *   uRes — line 167-169, per D4: RSS(f0/2√3, zeroF0/2√3). f0 is THIS
 *     point's own relative-error f0 step (already in scope — the combined
 *     FormulaSet runs relative-error steps first); zeroF0 is the raw input
 *     (always 0, see module doc).
 *   uStd — line 172, per D5: raw RSS of uCal/uA/uB/uC_param, no divisor.
 *   uC — line 175: RSS(uRep, uRes, uStd).
 *   vEff — line 176: uC⁴ / (uRep⁴ / 2), or Infinity when uRep = 0 (IF
 *     short-circuits so the division is never evaluated in that branch,
 *     matching the original ternary exactly).
 *   k — line 177: TINV(COVERAGE_ALPHA, vEff) — the built-in bakes in the
 *     workbook's own IFERROR-to-2 fallback (see builtins.ts).
 *   U — line 178: uC × k.
 *   uReport — line 183: max(U, CMC) when CMC applies, else U. cmcAvailable
 *     is a raw input (0/1) because "whether CMC applies" is itself
 *     structural (lookupCmc's null-beyond-last-step case), matching how
 *     the 'v' step's hasDec sentinel decision is kept out of the formula.
 *   reportU — a numeric passthrough of uReport. The workbook's TEXT/TRUNC
 *     string formatting (line 145-150, formatReportU) is dynamic-precision
 *     string construction, not arithmetic — it stays as the existing,
 *     UNMODIFIED formatReportU() function, applied by the adapter to this
 *     step's numeric result. This is a deliberate, documented deviation:
 *     see docs/FORMULA_ENGINE_DESIGN.md and the Session 2 report.
 */
const UNCERTAINTY_BUDGET_STEPS: FormulaSet['steps'] = [
  {
    name: 'sd',
    inputs: ['q1', 'q2', 'q3'],
    expression: 'STDEV(q1, q2, q3)',
  },
  {
    name: 'uRep',
    inputs: ['sd'],
    expression: 'sd / SQRT(2)',
  },
  {
    name: 'uRes',
    inputs: ['f0', 'zeroF0'],
    expression: 'RSS(f0 / (2 * SQRT(3)), zeroF0 / (2 * SQRT(3)))',
  },
  {
    name: 'uStd',
    inputs: ['uCal', 'uA', 'uB', 'uC_param'],
    expression: 'RSS(uCal, uA, uB, uC_param)',
  },
  {
    name: 'uC',
    inputs: ['uRep', 'uRes', 'uStd'],
    expression: 'RSS(uRep, uRes, uStd)',
  },
  {
    name: 'vEff',
    inputs: ['uRep', 'uC', 'infinityConst'],
    expression: 'IF(uRep = 0, infinityConst, uC^4 / (uRep^4 / 2))',
  },
  {
    name: 'k',
    inputs: ['vEff'],
    expression: `TINV(${COVERAGE_ALPHA}, vEff)`,
  },
  {
    name: 'U',
    inputs: ['uC', 'k'],
    expression: 'uC * k',
  },
  {
    name: 'uReport',
    inputs: ['cmcAvailable', 'cmc', 'U'],
    expression: 'IF(cmcAvailable = 0, U, IF(U < cmc, cmc, U))',
  },
  {
    name: 'reportU',
    inputs: ['uReport'],
    expression: 'uReport',
  },
];

/**
 * Registry of seed-FormulaSet builders, keyed by sheetType. Adding support
 * for a new analysis type is an additive entry here, not an edit to a
 * branch — see sheetTypeDefinitionService.ts for the matching
 * SheetTypeDefinition registry.
 */
const SEED_FORMULA_SETS: Record<string, () => FormulaSet> = {
  [FORCE_ISO7500_1_SHEET_TYPE]: () => ({
    sheetType: FORCE_ISO7500_1_SHEET_TYPE,
    steps: [
      ...RELATIVE_ERROR_STEPS.map((s) => ({ ...s, group: 'Relative Error' })),
      ...UNCERTAINTY_BUDGET_STEPS.map((s) => ({ ...s, group: 'Uncertainty Budget' })),
    ],
  }),
};

/** Generate the seed FormulaSet for a given sheetType; throws if unregistered. */
export function generateSeedFormulaSet(sheetType: string): FormulaSet {
  const build = SEED_FORMULA_SETS[sheetType];
  if (!build) {
    throw new Error(`No seed FormulaSet defined for sheetType '${sheetType}'`);
  }
  return build();
}

/** The seed FormulaSet for 'force-iso7500-1', generated once at module load. */
export const FORCE_ISO7500_1_FORMULA_SET: FormulaSet = generateSeedFormulaSet(
  FORCE_ISO7500_1_SHEET_TYPE,
);

/** Step-name groupings, for UI code that displays the two sections separately. */
export const RELATIVE_ERROR_STEP_NAMES: readonly string[] = RELATIVE_ERROR_STEPS.map((s) => s.name);
export const UNCERTAINTY_BUDGET_STEP_NAMES: readonly string[] = UNCERTAINTY_BUDGET_STEPS.map((s) => s.name);
