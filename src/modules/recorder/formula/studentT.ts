/**
 * studentT.ts
 *
 * Two-tailed inverse Student-t, matching Excel's TINV — the coverage factor
 * used throughout calibration uncertainty budgets.
 *
 * Implemented as the regularized incomplete beta function (Lentz continued
 * fraction) plus bisection on t. The project has no statistics dependency and
 * none is added.
 *
 * IMPORTANT — Excel's TINV truncates its degrees-of-freedom argument to an
 * integer, so TINV(0.0455, 2.9) and TINV(0.0455, 2.09) return the identical
 * value as TINV(0.0455, 2). Reproducing the lab's existing spreadsheets
 * REQUIRES that truncation; a true real-valued inverse-t would not match.
 * docs/FORMULA_GRAMMAR.md §3 calls this out explicitly as a required quirk.
 *
 * Written fresh for this module, using the same approach as the archived
 * engine at recorder-reserved/modules/data-recorder/analysis/studentT.ts,
 * which this deliberately does not import — that tree is a read-only archive.
 *
 * One deliberate difference from the archive: that version baked in the
 * workbook's `=IFERROR(TINV(...), 2)` fallback. Here, an out-of-domain TINV is
 * an error (FORMULA_GRAMMAR §6), so this returns NaN and the builtin layer
 * raises. Pure functions only.
 */

const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

const CF_MAX_ITERATIONS = 300;
const CF_EPSILON = 3e-16;
const CF_TINY = 1e-300;

/** Natural log of the gamma function (Lanczos approximation, g = 7, n = 9). */
export function logGamma(x: number): number {
  if (x < 0.5) {
    // Reflection formula, for completeness; callers here always pass x > 0.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let series = LANCZOS_COEFFICIENTS[0];
  for (let i = 1; i < LANCZOS_G + 2; i += 1) {
    series += LANCZOS_COEFFICIENTS[i] / (z + i);
  }
  const t = z + LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(series);
}

/** Continued-fraction expansion for the incomplete beta function. */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < CF_TINY) d = CF_TINY;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= CF_MAX_ITERATIONS; m += 1) {
    const m2 = 2 * m;

    let numerator = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < CF_TINY) d = CF_TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < CF_TINY) c = CF_TINY;
    d = 1 / d;
    h *= d * c;

    numerator = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < CF_TINY) d = CF_TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < CF_TINY) c = CF_TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < CF_EPSILON) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-tailed probability P(|T| > t) for `df` degrees of freedom — what TINV inverts. */
export function studentTTwoTailedP(t: number, df: number): number {
  if (t <= 0) return 1;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/**
 * Excel TINV(probability, deg_freedom): the t value whose two-tailed
 * probability equals `alpha`, with `nu` TRUNCATED to an integer.
 *
 * Returns NaN where Excel returns #NUM! (alpha outside (0, 1], nu < 1) so the
 * caller can raise an invalid-computation error.
 */
export function tinv(alpha: number, nu: number): number {
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) return Number.NaN;
  if (!Number.isFinite(nu)) return Number.NaN;
  const df = Math.trunc(nu);
  if (df < 1) return Number.NaN;
  if (alpha === 1) return 0;

  // P(|T| > t) decreases monotonically in t, so plain bisection is safe and
  // converges to the last representable bit well inside the iteration budget.
  let low = 0;
  let high = 1;
  while (studentTTwoTailedP(high, df) > alpha && high < 1e12) high *= 2;

  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (mid === low || mid === high) break;
    if (studentTTwoTailedP(mid, df) > alpha) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}
