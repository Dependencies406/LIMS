/**
 * conversionEquationAdapter.ts
 *
 * ADR-014 D4: THE single boundary between how a conversion equation is STORED
 * and how the rest of the system evaluates it.
 *
 * ── The two orders, stated explicitly ────────────────────────────────────────
 *
 *   ConversionEquation (stored):  coefficients[0] = HIGHEST degree
 *                                 [c₃, c₂, c₁, const]        descending
 *
 *   Canonical (everything else):  result[i] multiplies Rⁱ
 *                                 [const, c₁, c₂, c₃]        ascending
 *
 * These are opposite. Reversing is the entire purpose of this function.
 *
 * ── Why this must exist in exactly one place ─────────────────────────────────
 *
 * An inverted polynomial does not throw. It returns a plausible-looking number,
 * and that number goes on a certificate. With the real CAL-FRC-001 coefficients
 * the inverted form yields 0.114 N where the correct answer is 1.00002 N — the
 * same failure mode, from the same cause, as the Excel defect ADR-013 found:
 * an equation whose written form did not match its evaluated form.
 *
 * ADR-014 D4 therefore requires ONE adapter, not two, and not inlined at call
 * sites. If you are about to write `.reverse()` on a coefficient array
 * somewhere else, call this instead.
 */

import type { ConversionEquation } from '../types';

/**
 * The stored fields this adapter reads. Declared structurally rather than as
 * `Pick<ConversionEquation, …>` so tests can build a fixture without
 * assembling a whole Firestore document.
 */
export interface StoredPolynomial {
  /** Length = degree + 1. Index 0 = highest-degree coefficient, last = constant. */
  coefficients: Array<{ value: number }>;
  /** Polynomial degree. Authoritative — extra array entries beyond it are ignored. */
  degree: number;
}

/**
 * Converts a stored (descending) coefficient array to canonical ascending
 * order, where `result[i]` multiplies `Rⁱ` and `result[0]` is the constant term.
 *
 * Returns exactly `degree + 1` entries. A slot the stored array does not supply
 * is 0, matching `conversionEquationService.evaluate`, which reads
 * `coefficients[i]?.value ?? 0` over the same `0..degree` window — so this
 * adapter and that evaluator agree on which entries count and which are absent.
 * Entries beyond `degree` are ignored for the same reason.
 */
export function toCanonicalAscending(equation: StoredPolynomial): number[] {
  const { coefficients, degree } = equation;

  // Read the stored window in descending order, writing each into the ascending
  // slot it belongs in. Stored index i holds the coefficient of R^(degree - i).
  const ascending: number[] = new Array<number>(degree + 1).fill(0);
  for (let i = 0; i <= degree; i += 1) {
    const value = coefficients[i]?.value;
    ascending[degree - i] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
  return ascending;
}

/**
 * Evaluates a canonical ascending coefficient array at `r` — `Σ cᵢ·Rⁱ`.
 *
 * Deliberately NOT the place unit scaling happens: ADR-014 D5 derives that at
 * evaluation time from the report unit, and the stored `divisor` is not applied
 * in the recorder path at all. This returns the raw polynomial in the
 * equation's own output unit.
 */
export function evaluateAscending(ascending: number[], r: number): number {
  let sum = 0;
  for (let i = 0; i < ascending.length; i += 1) {
    sum += ascending[i] * Math.pow(r, i);
  }
  return sum;
}

/** Convenience for the common case of adapting a whole live equation. */
export function equationToCanonicalAscending(equation: ConversionEquation): number[] {
  return toCanonicalAscending(equation);
}
