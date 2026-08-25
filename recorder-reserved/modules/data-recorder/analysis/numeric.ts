/**
 * numeric.ts
 *
 * Decimal helpers shared by the analysis module. Everything here exists to
 * reproduce Excel's decimal behaviour (ROUND = half away from zero, TRUNC =
 * toward zero) without the binary-representation drift that a naive
 * `x * 10 ** dp` introduces. The shift is done through the number's decimal
 * exponent (via toExponential) so that e.g. 0.26 shifted by 2 is exactly 26,
 * not 26.000000000000004.
 *
 * Pure functions only.
 */

/** Multiply `x` by 10^exp without going through a binary power-of-ten. */
export function shiftDecimal(x: number, exp: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const [mantissa, e] = x.toExponential().split('e');
  return Number(`${mantissa}e${Number(e) + exp}`);
}

/**
 * Excel ROUND semantics: half away from zero, to `dp` decimal places.
 * JavaScript's Math.round is half-UP (rounds -2.5 to -2), so the sign is
 * handled explicitly.
 */
export function roundHalfAwayFromZero(x: number, dp: number): number {
  if (!Number.isFinite(x)) return x;
  const sign = x < 0 ? -1 : 1;
  const shifted = shiftDecimal(Math.abs(x), dp);
  return sign * shiftDecimal(Math.round(shifted), -dp);
}

/** Excel TRUNC semantics: drop digits beyond `dp` places, toward zero. */
export function truncToDecimals(x: number, dp: number): number {
  if (!Number.isFinite(x)) return x;
  const sign = x < 0 ? -1 : 1;
  const shifted = shiftDecimal(Math.abs(x), dp);
  return sign * shiftDecimal(Math.floor(shifted), -dp);
}
