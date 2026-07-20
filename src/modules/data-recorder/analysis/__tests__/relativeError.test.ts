import { describe, it, expect } from 'vitest';
import {
  ISO7500_1_CLASS_LIMITS,
  classifyParameter,
  computeRelativeError,
  type ClassValue,
  type RelativeErrorInput,
} from '../relativeError';
import { golden, type GoldenNumber } from './golden';

/**
 * Golden tests for the Relative Error sheet, driven from the workbook's own
 * cached values (job SCS-CAL-26024, Tension).
 *
 * Per D1 the analysis is fed the workbook's STORED per-series FORCE values —
 * it never re-runs the conversion, so the workbook's c3·x quirk (Q1) is out of
 * scope here and the analysis math is tested in isolation.
 *
 * Per D2 the workbook's K column (b = q1 − q3) is superseded by max − min over
 * {q1, q2, q3}. K is therefore NOT asserted verbatim: the expected b is
 * recomputed in-test from the golden q columns, and the expected classes are
 * recomputed with it.
 */

const TENSION = golden.directions.tension;

/** Relative comparison; exact zero must be exactly (near) zero. */
function expectClose(actual: number, expected: number, relative = 1e-9): void {
  if (expected === 0) {
    expect(Math.abs(actual)).toBeLessThan(1e-12);
    return;
  }
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(relative);
}

function toInput(direction: typeof TENSION): RelativeErrorInput {
  return {
    points: direction.rawData.map((row) => ({
      calPoint: row.calPoint,
      forces: {
        inc1: row.inc1.force,
        inc2: row.inc2.force,
        inc3: row.inc3.force,
        dec3: row.dec3.force,
      },
    })),
    resolution: direction.header.uucResolution,
    decimalPlaces: direction.header.decimalPlaces,
  };
}

/** Worst class across a row, ignoring the '-' sentinel (Excel MAX skips text). */
function worstOf(values: ClassValue[]): ClassValue {
  const numeric = values.filter((v): v is 0.5 | 1 | 2 | 3 => typeof v === 'number');
  return numeric.length === 0 ? '-' : numeric.reduce((a, b) => (b > a ? b : a));
}

describe('computeRelativeError — golden, tension direction', () => {
  const result = computeRelativeError(toInput(TENSION));

  it('returns one row per raw-data row, in order', () => {
    expect(result.points).toHaveLength(TENSION.relativeError.length);
    result.points.forEach((point, i) => {
      expect(point.calPoint).toBe(TENSION.relativeError[i].A as number);
    });
  });

  it('identifies the zero row and its f0 (a_Z source)', () => {
    expect(result.zeroRow).not.toBeNull();
    expect(result.zeroRow?.calPoint).toBe(0);
    expect(result.zeroF0).toBe(0);
  });

  TENSION.relativeError.forEach((expected, index) => {
    const calPoint = expected.A as number;

    describe(`cal point ${calPoint}`, () => {
      const point = () => computeRelativeError(toInput(TENSION)).points[index];

      it('F_avg matches the workbook (rounded to decimalPlaces)', () => {
        expectClose(point().fAvg, expected.F as number);
      });

      it('q1..q3 and q_avg match the workbook', () => {
        expectClose(point().q1, expected.G as number);
        expectClose(point().q2, expected.H as number);
        expectClose(point().q3, expected.I as number);
        expectClose(point().qAvg, expected.J as number);
      });

      it('f0 and a match the workbook', () => {
        expectClose(point().f0, expected.L as number);
        expectClose(point().a, expected.N as number);
      });

      it('v matches the workbook sentinel/value', () => {
        const goldenV = expected.M as GoldenNumber;
        if (goldenV === '-') expect(point().v).toBe('-');
        else expectClose(point().v as number, goldenV);
      });

      it('b is max − min over {q1, q2, q3} (D2 supersedes column K)', () => {
        const qs = [expected.G, expected.H, expected.I] as number[];
        const expectedB = Math.max(...qs) - Math.min(...qs);
        expectClose(point().b, expectedB);
        // The workbook's own K is q1 − q3; identical only when q2 is not extreme.
        expect(Math.abs(expectedB)).toBeGreaterThanOrEqual(
          Math.abs(expected.K as number) - 1e-12,
        );
      });

      it('per-parameter classes match (b-class recomputed per D2)', () => {
        const p = point();
        const qs = [expected.G, expected.H, expected.I] as number[];
        const expectedB = Math.max(...qs) - Math.min(...qs);

        // Columns P..T align 1:1 with the value columns J..N — confirmed by the
        // '-' in column S tracking the '-' in column M (v).
        expect(p.classes.q).toBe(expected.P as number);
        expect(p.classes.b).toBe(classifyParameter('b', expectedB));
        expect(p.classes.f0).toBe(expected.R as number);
        expect(p.classes.a).toBe(expected.T as number);

        const goldenV = expected.S as GoldenNumber;
        if (goldenV === '-') expect(p.classes.v).toBe('-');
        else expect(p.classes.v).toBe(goldenV);
      });

      it('overall class is the worst parameter class', () => {
        const p = point();
        const expectedOverall = worstOf([
          p.classes.q,
          p.classes.b,
          p.classes.v,
          p.classes.f0,
          p.classes.a,
        ]);
        expect(p.overallClass).toBe(expectedOverall);
        // The demo machine is class 0.5 throughout, and D2 does not change it
        // (every |b| stays far below the 0.5 % limit).
        expect(p.overallClass).toBe(expected.U as number);
        expect(p.overallClass).toBe(expected.O as number);
      });
    });
  });

  it('reports class 0.5 for the machine overall', () => {
    expect(result.overallClass).toBe(0.5);
  });

  it('has no decreasing series anywhere in the demo workbook', () => {
    expect(
      result.points.filter((p) => !p.isZeroRow).every((p) => p.v === '-'),
    ).toBe(true);
  });
});

describe('class limit table', () => {
  it('matches the workbook table verbatim', () => {
    expect(
      ISO7500_1_CLASS_LIMITS.map((r) => [r.cls, r.q, r.b, r.v, r.f0, r.a]),
    ).toEqual(TENSION.classTable);
  });

  it('picks the smallest class whose limit covers |value|', () => {
    expect(classifyParameter('q', 0.5)).toBe(0.5);
    expect(classifyParameter('q', -0.5)).toBe(0.5);
    expect(classifyParameter('q', 0.500001)).toBe(1);
    expect(classifyParameter('f0', 0.06)).toBe(1);
    expect(classifyParameter('v', 0.8)).toBe(1);
    expect(classifyParameter('a', 1.4)).toBe(3);
  });

  it("returns 'N/A' beyond class 3", () => {
    expect(classifyParameter('q', 3.0001)).toBe('N/A');
    expect(classifyParameter('a', 99)).toBe('N/A');
  });

  it("propagates the '-' sentinel", () => {
    expect(classifyParameter('v', '-')).toBe('-');
  });
});

/**
 * Synthetic coverage for behaviour the demo workbook cannot exercise: it has
 * no decreasing series, no non-zero zero-row forces, and no point where q2 is
 * the extreme value. All expected numbers below are hand-computed.
 */
describe('computeRelativeError — synthetic cases', () => {
  it('computes v from a decreasing series and f0 from non-zero zero-row forces', () => {
    // Zero row residuals: max = 0.02 N. Cal point 100 N, resolution 0.1 N.
    //   F_avg = ROUND(mean(100,100,100), 2)      = 100.00
    //   q1..q3 = (100 − 100)/100 × 100           = 0
    //   f0     = 0.02 / 100 × 100                = 0.02 %  → class 0.5
    //   v      = (100 − 99) / 100 × 100          = 1 %     → class 1 (>0.75)
    //   a      = 0.1 / 100 × 100                 = 0.1 %   → class 0.5
    const result = computeRelativeError({
      points: [
        { calPoint: 0, forces: { inc1: 0.02, inc2: 0.01, inc3: 0, dec3: 0 } },
        { calPoint: 100, forces: { inc1: 100, inc2: 100, inc3: 100, dec3: 99 } },
      ],
      resolution: 0.1,
      decimalPlaces: 2,
    });

    const point = result.points[1];
    expect(point.fAvg).toBe(100);
    expect(point.q1).toBe(0);
    expect(point.f0).toBeCloseTo(0.02, 12);
    expect(point.v).toBeCloseTo(1, 12);
    expect(point.a).toBeCloseTo(0.1, 12);
    expect(point.classes.f0).toBe(0.5);
    expect(point.classes.v).toBe(1);
    expect(point.classes.a).toBe(0.5);
    expect(point.overallClass).toBe(1);

    // a_Z divides the zero-row residual by cal point 0, so it stays 0 — a
    // structural property of the workbook's L15 reference (Q3/Q4).
    expect(result.zeroF0).toBe(0);
  });

  it('takes b as max − min even when q2 is the extreme (proves D2)', () => {
    // Forces 100, 98, 100 at cal point 100:
    //   q1 = 0, q2 = (100 − 98)/98 × 100 = 2.040816…, q3 = 0
    //   D2  b = max − min = 2.040816…      → class 3 (>2, ≤3)
    //   Workbook b = q1 − q3 = 0           → would have been class 0.5
    const result = computeRelativeError({
      points: [{ calPoint: 100, forces: { inc1: 100, inc2: 98, inc3: 100, dec3: null } }],
      resolution: 0.1,
      decimalPlaces: 2,
    });

    const point = result.points[0];
    const q2 = (100 - 98) / 98 * 100;
    expect(point.q2).toBeCloseTo(q2, 12);
    expect(point.b).toBeCloseTo(q2, 12);
    expect(point.b).not.toBeCloseTo(point.q1 - point.q3, 6);
    expect(point.classes.b).toBe(3);
    expect(point.overallClass).toBe(3);
  });

  it('treats a sheet with no zero row as f0 = 0', () => {
    const result = computeRelativeError({
      points: [{ calPoint: 100, forces: { inc1: 100, inc2: 100, inc3: 100, dec3: null } }],
      resolution: 0.1,
      decimalPlaces: 2,
    });
    expect(result.zeroRow).toBeNull();
    expect(result.zeroF0).toBe(0);
    expect(result.points[0].f0).toBe(0);
  });

  it('does not mistake a blank trailing row for the zero row', () => {
    // The editor maps an empty cal point to 0 with null forces; only a row
    // carrying a recorded force counts as the zero point.
    const result = computeRelativeError({
      points: [
        { calPoint: 100, forces: { inc1: 100, inc2: 100, inc3: 100, dec3: null } },
        { calPoint: 0, forces: { inc1: null, inc2: null, inc3: null, dec3: null } },
      ],
      resolution: 0.1,
      decimalPlaces: 2,
    });
    expect(result.zeroRow).toBeNull();
  });

  it("accepts the fixture's '-' text as an empty cell", () => {
    const result = computeRelativeError({
      points: [{ calPoint: 100, forces: { inc1: 100, inc2: 100, inc3: 100, dec3: '-' } }],
      resolution: 0.1,
      decimalPlaces: 2,
    });
    expect(result.points[0].v).toBe('-');
    expect(result.points[0].classes.v).toBe('-');
  });

  it('rounds F_avg half away from zero, as Excel ROUND does', () => {
    // mean(100.125, 100.125, 100.125) = 100.125 → 100.13 at 2 dp
    const result = computeRelativeError({
      points: [{ calPoint: 100, forces: { inc1: 100.125, inc2: 100.125, inc3: 100.125, dec3: null } }],
      resolution: 0.1,
      decimalPlaces: 2,
    });
    expect(result.points[0].fAvg).toBe(100.13);
  });
});
