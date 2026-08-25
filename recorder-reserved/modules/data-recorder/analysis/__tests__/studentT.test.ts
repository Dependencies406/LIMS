import { describe, it, expect } from 'vitest';
import { COVERAGE_ALPHA, coverageFactor, studentTTwoTailedP, tinv } from '../studentT';
import { golden } from './golden';

/**
 * The workbook's k column is `=IFERROR(TINV(0.0455, V_eff), 2)`. These tests
 * pin our reimplementation to the workbook's own cached k values.
 */
describe('studentT — Excel TINV equivalence', () => {
  const budget = golden.directions.tension.uncBudget;

  it.each(budget.map((row) => [row.A as number, row.M as number, row.N as number]))(
    'cal point %s: TINV(0.0455, V_eff=%s) = k',
    (_calPoint, vEff, k) => {
      expect(coverageFactor(vEff)).toBeCloseTo(k, 12);
      // Relative tolerance 1e-6 as specified for the TINV reimplementation.
      expect(Math.abs(coverageFactor(vEff) - k) / k).toBeLessThan(1e-6);
    },
  );

  /**
   * Excel truncates deg_freedom to an integer. The golden data proves it:
   * six distinct V_eff values between 2.09 and 2.55 all share one k.
   */
  it('truncates the degrees of freedom to an integer, as Excel does', () => {
    const sharedK = 4.5265507600819905;
    for (const vEff of [2.0910543304474616, 2.0929377807241245, 2.1754659379122994,
      2.4677012377544125, 2.5395068735596897, 2.5411388811108346]) {
      expect(coverageFactor(vEff)).toBeCloseTo(sharedK, 12);
    }
    expect(coverageFactor(2)).toBeCloseTo(sharedK, 12);
    expect(coverageFactor(2.999999)).toBeCloseTo(sharedK, 12);
    // ...and a real-valued inverse-t would NOT be constant across that range.
    expect(coverageFactor(3)).not.toBeCloseTo(sharedK, 6);
  });

  it('matches the closed-form t distribution for nu = 2', () => {
    // For nu = 2 the CDF inverts analytically:
    //   P(|T| > t) = 1 - t / sqrt(2 + t^2)  =>  t = a*sqrt(2)/sqrt(1-a^2), a = 1-alpha
    const a = 1 - COVERAGE_ALPHA;
    const expected = (a * Math.sqrt(2)) / Math.sqrt(1 - a * a);
    expect(tinv(COVERAGE_ALPHA, 2)).toBeCloseTo(expected, 12);
  });

  it('agrees with published two-tailed t values at alpha = 0.05', () => {
    expect(tinv(0.05, 1)).toBeCloseTo(12.7062, 4);
    expect(tinv(0.05, 10)).toBeCloseTo(2.2281, 4);
    expect(tinv(0.05, 30)).toBeCloseTo(2.0423, 4);
    expect(tinv(0.05, 1000)).toBeCloseTo(1.9623, 4);
  });

  it('round-trips through the two-tailed CDF', () => {
    for (const df of [1, 2, 5, 9, 40]) {
      const t = tinv(COVERAGE_ALPHA, df);
      expect(studentTTwoTailedP(t, df)).toBeCloseTo(COVERAGE_ALPHA, 12);
    }
  });

  it('falls back to k = 2 where Excel would raise #NUM!', () => {
    expect(tinv(COVERAGE_ALPHA, 0.5)).toBeNaN();
    expect(coverageFactor(0.5)).toBe(2);
    expect(coverageFactor(0)).toBe(2);
    expect(coverageFactor(-1)).toBe(2);
    expect(coverageFactor(Number.NaN)).toBe(2);
    // u_rep = 0 makes V_eff infinite; Excel's TINV errors, so k falls back.
    expect(coverageFactor(Number.POSITIVE_INFINITY)).toBe(2);
  });
});
