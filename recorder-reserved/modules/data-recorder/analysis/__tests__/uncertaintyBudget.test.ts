import { describe, it, expect } from 'vitest';
import { computeRelativeError, type RelativeErrorInput } from '../relativeError';
import {
  computeUncertaintyBudget,
  formatReportU,
  lookupCmc,
  normalizeToNewtons,
  sampleStdDev,
  type UncertaintyParams,
} from '../uncertaintyBudget';
import { golden, lcdbFor } from './golden';

/**
 * Golden tests for the Unc. Budget sheet (job SCS-CAL-26024, Tension).
 *
 * Replicates D4 (a_F/a_Z from the f0 column, ÷2√3, RSS), D5 (u_cal/A/B/C are
 * already standard uncertainties — raw RSS) and D6 (Report-U truncated to two
 * significant figures, as a string).
 */

const TENSION = golden.directions.tension;

function expectClose(actual: number, expected: number, relative = 1e-9): void {
  if (expected === 0) {
    expect(Math.abs(actual)).toBeLessThan(1e-12);
    return;
  }
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(relative);
}

const relativeErrorInput: RelativeErrorInput = {
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

const result = computeUncertaintyBudget({
  relativeError: computeRelativeError(relativeErrorInput),
  uParams,
  cmcSteps: TENSION.cmcCriteria.steps,
  readingUnit: TENSION.header.uucReadingUnit,
});

describe('computeUncertaintyBudget — golden, tension direction', () => {
  it('produces one row per non-zero cal point (the zero row has no budget)', () => {
    expect(result.points).toHaveLength(TENSION.uncBudget.length);
    result.points.forEach((point, i) => {
      expect(point.calPoint).toBe(TENSION.uncBudget[i].A as number);
    });
  });

  it("sources u_cal/A/B/C from the sheet's LCDB standard", () => {
    result.points.forEach((point, i) => {
      const expected = TENSION.uncBudget[i];
      expect(point.uCal).toBe(expected.G as number);
      expect(point.uA).toBe(expected.H as number);
      expect(point.uB).toBe(expected.I as number);
      expect(point.uC_param).toBe(expected.J as number);
    });
  });

  TENSION.uncBudget.forEach((expected, index) => {
    describe(`cal point ${expected.A}`, () => {
      const point = () => result.points[index];

      it('S.D. and u_rep match the workbook', () => {
        expectClose(point().sd, expected.B as number);
        expectClose(point().uRep, expected.C as number);
      });

      it('a_F, a_Z and u_res match the workbook (all zero in the demo)', () => {
        expect(point().aF).toBe(expected.D as number);
        expect(point().aZ).toBe(expected.E as number);
        expect(point().uRes).toBe(expected.F as number);
        expect(point().uRes).toBe(0);
      });

      it('u_std and u_c match the workbook', () => {
        expectClose(point().uStd, expected.K as number);
        expectClose(point().uC, expected.L as number);
      });

      it('V_eff matches the workbook', () => {
        expectClose(point().vEff, expected.M as number);
      });

      it('k and U match the workbook within TINV reimplementation tolerance', () => {
        expectClose(point().k, expected.N as number, 1e-6);
        expectClose(point().U, expected.O as number, 1e-6);
      });

      it('normalizes the cal point to newtons and looks up the CMC exactly', () => {
        expect(point().pointInN).toBe(expected.R as number);
        expect(point().cmc).toBe(expected.S as number);
      });

      it('Report-U matches the workbook string exactly', () => {
        expectClose(point().uReport, expected.U as number, 1e-6);
        expect(point().reportU).toBe(expected.V as string);
        // Column P is the same string, copied.
        expect(point().reportU).toBe(expected.P as string);
      });
    });
  });
});

describe('CMC lookup', () => {
  const tensile = golden.cmcTable.tensile;

  it('is stepwise on ≤ thresholds', () => {
    expect(lookupCmc(50, tensile)).toBe(0.26);
    expect(lookupCmc(100, tensile)).toBe(0.26);
    expect(lookupCmc(100.01, tensile)).toBe(0.21);
    expect(lookupCmc(2000, tensile)).toBe(0.21);
    expect(lookupCmc(2000.01, tensile)).toBe(0.26);
    expect(lookupCmc(247000, tensile)).toBe(0.26);
  });

  it('returns null beyond the last step rather than inventing a value', () => {
    expect(lookupCmc(247001, tensile)).toBeNull();
  });

  it('resolves the compressive column separately', () => {
    expect(lookupCmc(1000, golden.cmcTable.compressive)).toBe(0.59);
    expect(lookupCmc(1000, tensile)).toBe(0.21);
  });

  it('normalizes kN cal points to newtons', () => {
    expect(normalizeToNewtons(4, 'kN')).toBe(4000);
    expect(normalizeToNewtons(4000, 'N')).toBe(4000);
  });
});

describe('Report-U formatting (D6)', () => {
  it('truncates to two significant figures rather than rounding', () => {
    expect(formatReportU(0.4096448425256006)).toBe('0.40');
    expect(formatReportU(0.4137196635983037)).toBe('0.41');
    expect(formatReportU(0.30250997856429157)).toBe('0.30');
    expect(formatReportU(0.26)).toBe('0.26');
    // Rounding would give 0.048 / 1.0 / 0.99 respectively.
    expect(formatReportU(0.0479570563818894)).toBe('0.047');
    expect(formatReportU(0.999)).toBe('0.99');
    expect(formatReportU(1.999)).toBe('1.9');
  });
});

describe('sample standard deviation', () => {
  it('uses the n − 1 denominator, as Excel STDEV.S does', () => {
    expect(sampleStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13808993529939, 12);
  });
});

/**
 * Synthetic coverage for what the demo cannot reach: the demo's zero-row
 * forces are all 0, so u_res is 0 on every golden row.
 */
describe('computeUncertaintyBudget — synthetic cases', () => {
  it('produces a non-zero u_res when the zero row carries residual force', () => {
    // Zero row residual max = 0.02 N; cal point 100 N.
    //   a_F   = 0.02 / 100 × 100      = 0.02 %
    //   a_Z   = 0 (L15 divides by cal point 0)
    //   u_res = 0.02 / (2√3)          = 0.005773502691896258
    //   u_std = RSS(0.01, 0, 0, 0)    = 0.01
    //   u_rep = 0 (identical readings) → V_eff infinite → k falls back to 2
    //   u_c   = √(0.005773502691896258² + 0.01²) = 0.011547005383792517
    const relativeError = computeRelativeError({
      points: [
        { calPoint: 0, forces: { inc1: 0.02, inc2: 0.01, inc3: 0, dec3: 0 } },
        { calPoint: 100, forces: { inc1: 100, inc2: 100, inc3: 100, dec3: null } },
      ],
      resolution: 0.1,
      decimalPlaces: 2,
    });

    const budget = computeUncertaintyBudget({
      relativeError,
      uParams: { uCal: 0.01, uA: 0, uB: 0, uC: 0 },
      cmcSteps: golden.cmcTable.tensile,
      readingUnit: 'N',
    });

    const point = budget.points[0];
    expect(point.aF).toBeCloseTo(0.02, 12);
    expect(point.aZ).toBe(0);
    expect(point.uRes).toBeCloseTo(0.02 / (2 * Math.sqrt(3)), 15);
    expect(point.uStd).toBeCloseTo(0.01, 15);
    expect(point.uC).toBeCloseTo(0.011547005383792517, 15);
    expect(point.k).toBe(2);
    expect(point.U).toBeCloseTo(0.023094010767585034, 15);
    // U < CMC(100 N) = 0.26, so the CMC floor applies.
    expect(point.cmc).toBe(0.26);
    expect(point.reportU).toBe('0.26');
  });

  it('reports U itself when it exceeds the CMC floor', () => {
    const relativeError = computeRelativeError({
      points: [{ calPoint: 100, forces: { inc1: 100, inc2: 98, inc3: 102, dec3: null } }],
      resolution: 0.1,
      decimalPlaces: 2,
    });
    const budget = computeUncertaintyBudget({
      relativeError,
      uParams: { uCal: 0.01, uA: 0, uB: 0, uC: 0 },
      cmcSteps: golden.cmcTable.tensile,
      readingUnit: 'N',
    });

    const point = budget.points[0];
    expect(point.U).toBeGreaterThan(point.cmc as number);
    expect(point.uReport).toBe(point.U);
    expect(point.reportU).toBe(formatReportU(point.U));
  });
});
