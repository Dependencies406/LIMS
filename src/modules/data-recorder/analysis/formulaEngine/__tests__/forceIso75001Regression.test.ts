import { describe, it, expect } from 'vitest';
import { computeRelativeError, NO_VALUE, type RelativeErrorInput } from '../../relativeError';
import { computeUncertaintyBudget, type UncertaintyParams } from '../../uncertaintyBudget';
import { golden, lcdbFor } from '../../__tests__/golden';
import { FORCE_ISO7500_1_FORMULA_SET } from '../seedFormulaSet';
import { computeForceIso75001ViaFormulaSet } from '../engineAdapter';

/**
 * Session 2's actual deliverable: proof that the seeded FormulaSet,
 * evaluated through the formula engine, reproduces relativeError.ts and
 * uncertaintyBudget.ts's output EXACTLY (not just "close") for every point
 * in the same golden fixture Stage D was verified against, plus two
 * synthetic cases the golden data cannot exercise (no decreasing series,
 * no nonzero zero-row residual — see relativeError.test.ts's own synthetic
 * suite, whose numbers are reused here as a second oracle).
 *
 * A mismatch here is a blocker per the session brief: it means the seed
 * FormulaSet's expression for some step does not actually match the
 * hardcoded logic it claims to transcribe.
 */

function expectCloseOrEqual(actual: number, expected: number, relative = 1e-9): void {
  if (expected === 0) {
    expect(Math.abs(actual)).toBeLessThan(1e-12);
    return;
  }
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(relative);
}

// ─── Golden fixture, tension direction (job SCS-CAL-26024) ──────────────────

describe('formula engine vs hardcoded functions — golden, tension direction', () => {
  const TENSION = golden.directions.tension;

  const input: RelativeErrorInput = {
    points: TENSION.rawData.map((row) => ({
      calPoint: row.calPoint,
      forces: {
        inc1: row.inc1.force,
        inc2: row.inc2.force,
        inc3: row.inc3.force,
        dec3: row.dec3.force,
      },
    })),
    resolution: TENSION.header.uucResolution,
    decimalPlaces: TENSION.header.decimalPlaces,
  };

  const lcdb = lcdbFor(TENSION.header.standardKey);
  const uParams: UncertaintyParams = {
    uCal: lcdb['u_cal (%)'] as number,
    uA: lcdb['A (%)'] as number,
    uB: lcdb['B (%)'] as number,
    uC: lcdb['C (%)'] as number,
  };
  const opts = { uParams, cmcSteps: TENSION.cmcCriteria.steps, readingUnit: TENSION.header.uucReadingUnit };

  const hardcodedRelError = computeRelativeError(input);
  const hardcodedBudget = computeUncertaintyBudget({
    relativeError: hardcodedRelError,
    uParams,
    cmcSteps: opts.cmcSteps,
    readingUnit: opts.readingUnit,
  });
  const engineResult = computeForceIso75001ViaFormulaSet(FORCE_ISO7500_1_FORMULA_SET, input, opts);

  it('produces the same number of points as the hardcoded functions', () => {
    expect(engineResult).toHaveLength(hardcodedRelError.points.length);
  });

  hardcodedRelError.points.forEach((expectedPoint, index) => {
    describe(`cal point ${expectedPoint.calPoint} (row ${index})`, () => {
      const actual = () => engineResult[index];

      it('isZeroRow matches', () => {
        expect(actual().isZeroRow).toBe(expectedPoint.isZeroRow);
      });

      it('relative-error fields match exactly', () => {
        const re = actual().relativeError;
        expectCloseOrEqual(re.fAvg, expectedPoint.fAvg);
        expectCloseOrEqual(re.q1, expectedPoint.q1);
        expectCloseOrEqual(re.q2, expectedPoint.q2);
        expectCloseOrEqual(re.q3, expectedPoint.q3);
        expectCloseOrEqual(re.qAvg, expectedPoint.qAvg);
        expectCloseOrEqual(re.b, expectedPoint.b);
        expectCloseOrEqual(re.f0, expectedPoint.f0);
        expectCloseOrEqual(re.a, expectedPoint.a);
        if (expectedPoint.v === NO_VALUE) {
          expect(re.v).toBe(NO_VALUE);
        } else {
          expectCloseOrEqual(re.v as number, expectedPoint.v as number);
        }
      });
    });
  });

  // Uncertainty budget rows exclude the zero row, same as computeUncertaintyBudget.
  const nonZeroPoints = hardcodedRelError.points.filter((p) => !p.isZeroRow);

  nonZeroPoints.forEach((_, budgetIndex) => {
    const expected = hardcodedBudget.points[budgetIndex];
    const engineOverallIndex = engineResult.findIndex(
      (p) => !p.isZeroRow && p.calPoint === expected.calPoint,
    );

    describe(`uncertainty budget, cal point ${expected.calPoint}`, () => {
      it('was computed (not skipped) by the engine', () => {
        expect(engineOverallIndex).toBeGreaterThanOrEqual(0);
        expect(engineResult[engineOverallIndex].uncertaintyBudget).not.toBeNull();
      });

      it('every field matches exactly, including the Report-U string', () => {
        const ub = engineResult[engineOverallIndex].uncertaintyBudget!;
        expectCloseOrEqual(ub.sd, expected.sd);
        expectCloseOrEqual(ub.uRep, expected.uRep);
        expectCloseOrEqual(ub.uRes, expected.uRes);
        expectCloseOrEqual(ub.uStd, expected.uStd);
        expectCloseOrEqual(ub.uC, expected.uC);
        expectCloseOrEqual(ub.vEff, expected.vEff);
        // Tighter than Stage D's own 1e-6 TINV tolerance: the engine's TINV
        // built-in calls the EXACT SAME tinv()/FALLBACK_K used by
        // coverageFactor(), not a fresh reimplementation.
        expectCloseOrEqual(ub.k, expected.k, 1e-12);
        expectCloseOrEqual(ub.U, expected.U, 1e-12);
        expectCloseOrEqual(ub.uReport, expected.uReport, 1e-12);
        expect(ub.reportU).toBe(expected.reportU);
      });
    });
  });
});

// ─── Synthetic coverage: branches the golden fixture never exercises ────────
//
// The demo workbook has no decreasing series anywhere and every zero-row
// residual is 0, so the golden comparison above never runs the 'v' formula's
// actual ratio branch or the 'f0' formula's nonzero-numerator branch. These
// cases reuse the exact numeric example from relativeError.test.ts's
// "computes v from a decreasing series and f0 from non-zero zero-row forces"
// synthetic test, so both suites are checking the same known-correct answer.

describe('formula engine vs hardcoded functions — synthetic: decreasing series + nonzero zero row', () => {
  const input: RelativeErrorInput = {
    points: [
      { calPoint: 0, forces: { inc1: 0.02, inc2: 0.01, inc3: 0, dec3: 0 } },
      { calPoint: 100, forces: { inc1: 100, inc2: 100, inc3: 100, dec3: 99 } },
    ],
    resolution: 0.1,
    decimalPlaces: 2,
  };
  const uParams: UncertaintyParams = { uCal: 0.01, uA: 0, uB: 0, uC: 0 };
  const opts = { uParams, cmcSteps: golden.cmcTable.tensile, readingUnit: 'N' };

  const hardcoded = computeRelativeError(input);
  const engineResult = computeForceIso75001ViaFormulaSet(FORCE_ISO7500_1_FORMULA_SET, input, opts);

  it('v (decreasing-series ratio) and f0 (nonzero zero-row) match exactly', () => {
    const expected = hardcoded.points[1];
    const actual = engineResult[1].relativeError;
    expect(expected.v).not.toBe(NO_VALUE);
    expect(actual.v).not.toBe(NO_VALUE);
    expectCloseOrEqual(actual.v as number, expected.v as number);
    expectCloseOrEqual(actual.f0, expected.f0);
    expectCloseOrEqual(actual.fAvg, expected.fAvg);
  });
});

describe('formula engine vs hardcoded functions — synthetic: b takes max−min even when q2 is extreme (D2)', () => {
  const input: RelativeErrorInput = {
    points: [{ calPoint: 100, forces: { inc1: 100, inc2: 98, inc3: 100, dec3: null } }],
    resolution: 0.1,
    decimalPlaces: 2,
  };
  const opts = {
    uParams: { uCal: 0, uA: 0, uB: 0, uC: 0 },
    cmcSteps: golden.cmcTable.tensile,
    readingUnit: 'N',
  };

  it('b matches the hardcoded D2 result, not the workbook column K', () => {
    const expected = computeRelativeError(input).points[0];
    const actual = computeForceIso75001ViaFormulaSet(FORCE_ISO7500_1_FORMULA_SET, input, opts)[0].relativeError;
    expectCloseOrEqual(actual.b, expected.b);
    expect(actual.b).not.toBeCloseTo(actual.q1 - actual.q3, 6);
  });
});

describe('formula engine vs hardcoded functions — synthetic: u_rep = 0 (V_eff -> Infinity -> k fallback)', () => {
  // Identical readings across the increasing series -> sd = 0 -> uRep = 0.
  // The vEff formula's IF must short-circuit to infinityConst WITHOUT
  // evaluating uC^4/(uRep^4/2), which would otherwise divide by zero and
  // throw in the formula evaluator (see evaluator.ts's division guard).
  const input: RelativeErrorInput = {
    points: [{ calPoint: 100, forces: { inc1: 100, inc2: 100, inc3: 100, dec3: null } }],
    resolution: 0.1,
    decimalPlaces: 2,
  };
  const uParams: UncertaintyParams = { uCal: 0.01, uA: 0, uB: 0, uC: 0 };
  const opts = { uParams, cmcSteps: golden.cmcTable.tensile, readingUnit: 'N' };

  it('does not throw, and k/U/reportU match the hardcoded fallback-k=2 result', () => {
    const relativeError = computeRelativeError(input);
    const expected = computeUncertaintyBudget({
      relativeError,
      uParams,
      cmcSteps: opts.cmcSteps,
      readingUnit: opts.readingUnit,
    }).points[0];

    let engineResult: ReturnType<typeof computeForceIso75001ViaFormulaSet>;
    expect(() => {
      engineResult = computeForceIso75001ViaFormulaSet(FORCE_ISO7500_1_FORMULA_SET, input, opts);
    }).not.toThrow();

    const actual = engineResult![0].uncertaintyBudget!;
    expect(expected.vEff).toBe(Number.POSITIVE_INFINITY);
    expect(actual.vEff).toBe(Number.POSITIVE_INFINITY);
    expect(expected.k).toBe(2);
    expect(actual.k).toBe(2);
    expectCloseOrEqual(actual.U, expected.U);
    expect(actual.reportU).toBe(expected.reportU);
  });
});
