/**
 * conversionEquationAdapter.test.ts
 *
 * ADR-014 D4's guard. The adapter converts stored descending coefficients to
 * canonical ascending, and getting it backwards produces a plausible-looking
 * wrong number rather than an error — so the test is arithmetic, not shape.
 *
 * ── The numbers below are the ones that proved the Excel workbook wrong ──────
 *
 * CAL-FRC-001's NIMT certificate coefficients, evaluated as the documented
 * cubic `F = A·R + B·R² + C·R³`, reproduce the nominal calibration points:
 *
 *     R = 0.04  →  1.00002 N   (nominal 1 N)
 *     R = 0.4   →  9.99927 N   (nominal 10 N)
 *
 * The workbook's implemented form (`A·R + B·R² + C·R`) gives 1.00304 and
 * 10.02471 instead — off by ~0.30 % at the bottom of range, roughly six times
 * the standard's own claimed uncertainty. ADR-013 §1 records the full analysis.
 *
 * That is why these exact values guard this function: they are known-good
 * against a traceable certificate, and they are sensitive to coefficient order.
 */

import { describe, it, expect } from 'vitest';
import {
  toCanonicalAscending,
  evaluateAscending,
  type StoredPolynomial,
} from '../conversionEquationAdapter';

// CAL-FRC-001, from the NIMT calibration certificate (ADR-013 §1).
const A = 25.001904548237; // multiplies R
const B = -0.039616880251316; // multiplies R²
const C = 0.075709296790966; // multiplies R³
const CONSTANT = 0;

/** How CAL-FRC-001 is actually stored: index 0 is the HIGHEST degree. */
const CAL_FRC_001: StoredPolynomial = {
  degree: 3,
  coefficients: [{ value: C }, { value: B }, { value: A }, { value: CONSTANT }],
};

/** The ascending order the rest of the system expects: index i multiplies Rⁱ. */
const EXPECTED_ASCENDING = [CONSTANT, A, B, C];

describe('toCanonicalAscending — the one place coefficient order is converted', () => {
  it('reverses stored descending into canonical ascending', () => {
    expect(toCanonicalAscending(CAL_FRC_001)).toEqual(EXPECTED_ASCENDING);
  });

  it('puts the constant term at index 0 and the highest degree last', () => {
    const ascending = toCanonicalAscending(CAL_FRC_001);
    expect(ascending[0]).toBe(CONSTANT);
    expect(ascending[3]).toBe(C);
  });

  it('returns exactly degree + 1 entries', () => {
    expect(toCanonicalAscending(CAL_FRC_001)).toHaveLength(4);
  });

  it('preserves full precision — no rounding at the boundary (ADR-011, ADR-013 D9)', () => {
    const ascending = toCanonicalAscending(CAL_FRC_001);
    expect(ascending[1]).toBe(25.001904548237);
    expect(ascending[2]).toBe(-0.039616880251316);
    expect(ascending[3]).toBe(0.075709296790966);
  });
});

describe('THE ARITHMETIC GUARD — real CAL-FRC-001 values against the certificate', () => {
  const ascending = toCanonicalAscending(CAL_FRC_001);

  it('yields 1.00002 at R = 0.04 (nominal 1 N)', () => {
    expect(evaluateAscending(ascending, 0.04)).toBeCloseTo(1.00002, 5);
  });

  it('yields 9.99927 at R = 0.4 (nominal 10 N)', () => {
    expect(evaluateAscending(ascending, 0.4)).toBeCloseTo(9.99927, 5);
  });
});

/**
 * ── PROOF THIS TEST CAN FAIL ────────────────────────────────────────────────
 *
 * A test that cannot fail is worse than no test. These assert that the WRONG
 * coefficient order does NOT produce the certificate values — so if the adapter
 * ever stops reversing, the guard above genuinely catches it rather than
 * passing on both orders.
 */
describe('the reversed order does NOT give those values — proof the guard bites', () => {
  // What you get by skipping the reversal: the stored array read as ascending.
  const WRONG = CAL_FRC_001.coefficients.map((c) => c.value); // [C, B, A, 0]

  it('the wrong order is genuinely a different array', () => {
    expect(WRONG).not.toEqual(EXPECTED_ASCENDING);
  });

  it('at R = 0.04 the wrong order misses 1.00002 entirely', () => {
    const wrong = evaluateAscending(WRONG, 0.04);
    expect(wrong).not.toBeCloseTo(1.00002, 5);
    // ~0.1141 rather than ~1.00002 — off by nearly a factor of 9, and still a
    // perfectly ordinary-looking number. Nothing throws.
    expect(wrong).toBeCloseTo(0.11413, 4);
  });

  it('at R = 0.4 the wrong order misses 9.99927 entirely', () => {
    const wrong = evaluateAscending(WRONG, 0.4);
    expect(wrong).not.toBeCloseTo(9.99927, 5);
    expect(wrong).toBeCloseTo(4.06017, 4);
  });

  it('an adapter that returned the stored order unchanged would fail the guard', () => {
    // Exactly the assertion from the guard block above, applied to the
    // unreversed array. If this ever passes, the guard has stopped working.
    expect(() => {
      expect(evaluateAscending(WRONG, 0.04)).toBeCloseTo(1.00002, 5);
    }).toThrow();
  });
});

describe('edge cases', () => {
  it('handles a degree-1 equation', () => {
    // Stored [slope, intercept] → ascending [intercept, slope].
    const linear: StoredPolynomial = {
      degree: 1,
      coefficients: [{ value: 10 }, { value: 2 }],
    };
    expect(toCanonicalAscending(linear)).toEqual([2, 10]);
    expect(evaluateAscending(toCanonicalAscending(linear), 3)).toBe(32);
  });

  it('fills missing slots with 0 rather than undefined', () => {
    const sparse: StoredPolynomial = { degree: 3, coefficients: [{ value: 5 }] };
    // Only the highest-degree entry is stored; the rest are absent.
    expect(toCanonicalAscending(sparse)).toEqual([0, 0, 0, 5]);
  });

  it('ignores entries beyond the stated degree, matching evaluate()', () => {
    const extra: StoredPolynomial = {
      degree: 1,
      coefficients: [{ value: 10 }, { value: 2 }, { value: 999 }],
    };
    expect(toCanonicalAscending(extra)).toEqual([2, 10]);
  });

  it('treats a non-finite stored coefficient as 0 rather than propagating NaN', () => {
    const bad: StoredPolynomial = {
      degree: 1,
      coefficients: [{ value: Number.NaN }, { value: 2 }],
    };
    expect(toCanonicalAscending(bad)).toEqual([2, 0]);
  });
});
