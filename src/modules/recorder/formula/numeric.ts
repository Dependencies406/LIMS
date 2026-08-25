/**
 * numeric.ts
 *
 * Decimal helpers reproducing Excel's rounding behaviour without the
 * binary-representation drift a naive `x * 10 ** dp` introduces. The shift is
 * done through the number's own decimal exponent (via toExponential) so that,
 * for example, 0.26 shifted by 2 is exactly 26 rather than 26.000000000000004.
 *
 * Written fresh for this module. The same approach is used by the archived
 * engine at recorder-reserved/modules/data-recorder/analysis/numeric.ts, which
 * this deliberately does not import — that tree is a read-only archive.
 *
 * Pure functions only.
 */

/** Multiplies `x` by 10^exp without going through a binary power of ten. */
export function shiftDecimal(x: number, exponent: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const [mantissa, e] = x.toExponential().split('e');
  return Number(`${mantissa}e${Number(e) + exponent}`);
}

/**
 * Excel ROUND semantics: half away from zero, to `dp` decimal places.
 *
 * NOT Python's round(), which is half-to-even. See the warning in
 * docs/FORMULA_GRAMMAR.md §3 and the test that pins this behaviour.
 * JavaScript's Math.round is half-up (it rounds -2.5 to -2), so the sign is
 * handled explicitly here.
 */
export function roundHalfAwayFromZero(x: number, dp: number): number {
  if (!Number.isFinite(x)) return x;
  const sign = x < 0 ? -1 : 1;
  const shifted = shiftDecimal(Math.abs(x), dp);
  return sign * shiftDecimal(Math.round(shifted), -dp);
}

/** Excel TRUNC semantics: drop digits beyond `dp` places, toward zero. */
export function truncateToDecimals(x: number, dp: number): number {
  if (!Number.isFinite(x)) return x;
  const sign = x < 0 ? -1 : 1;
  const shifted = shiftDecimal(Math.abs(x), dp);
  return sign * shiftDecimal(Math.floor(shifted), -dp);
}

/** Sample standard deviation (n−1 denominator). Requires at least two values. */
export function sampleStandardDeviation(values: number[]): number {
  const n = values.length;
  if (n < 2) return Number.NaN;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}
