/**
 * uncertaintyBudget.ts
 *
 * Measurement-uncertainty budget for sheetType `force-iso7500-1`.
 * Pure functions: no React, no Firestore, no I/O.
 *
 * Implements docs/STAGE_D_FORMULA_SPEC.md §3–§4 verbatim, as modified by the
 * binding decisions in docs/STAGE_D_EXECUTION_PLAN.md §0:
 *   D4 — a_F / a_Z are the f0 column values (NOT the resolution), ÷2√3, RSS.
 *   D5 — u_cal/A/B/C are already standard uncertainties: RSS them raw.
 *   D6 — Report-U is max(U, CMC) TRUNCATED to 2 significant figures, as a string.
 *
 * The uncertainty parameters and the CMC steps arrive as ARGUMENTS: their
 * storage home lands in Session 2, and these functions stay storage-agnostic.
 *
 * Column letters in comments refer to the workbook's Unc. Budget sheet.
 */

import { truncToDecimals } from './numeric';
import type { RelativeErrorPoint, RelativeErrorResult } from './relativeError';
import { coverageFactor } from './studentT';

// ─── Input shapes ────────────────────────────────────────────────────────────

/** LCDB uncertainty contributions for one standard + range + direction (%). */
export interface UncertaintyParams {
  uCal: number;
  uA: number;
  uB: number;
  uC: number;
}

/** One CMC step: forces up to and including `toN` newtons carry `cmc` %. */
export interface CmcStep {
  toN: number;
  cmc: number;
}

export interface UncertaintyBudgetInput {
  relativeError: RelativeErrorResult;
  uParams: UncertaintyParams;
  /** Direction-resolved CMC steps, ascending by `toN`. */
  cmcSteps: CmcStep[];
  /** The sheet's UUC reading unit — cal points normalize to N for CMC lookup. */
  readingUnit: string;
}

// ─── Output shapes ───────────────────────────────────────────────────────────

export interface UncertaintyBudgetPoint {
  /** A — cal point in the UUC reading unit. */
  calPoint: number;
  /** B — sample standard deviation of q1..q3 (%). */
  sd: number;
  /** C — u_rep = S.D. / √2. */
  uRep: number;
  /** D — a_F (from the f0 column, per Q4/D4). */
  aF: number;
  /** E — a_Z (the zero row's f0, per Q4/D4). */
  aZ: number;
  /** F — u_res. */
  uRes: number;
  /** G, H, I, J — the LCDB contributions, echoed for display. */
  uCal: number;
  uA: number;
  uB: number;
  uC_param: number;
  /** K — u_std, plain RSS with no √3 divisor (Q5/D5). */
  uStd: number;
  /** L — combined standard uncertainty. */
  uC: number;
  /** M — effective degrees of freedom (Welch–Satterthwaite, Type-A term only). */
  vEff: number;
  /** N — coverage factor. */
  k: number;
  /** O / T — expanded uncertainty (%). */
  U: number;
  /** R — cal point normalized to newtons for the CMC lookup. */
  pointInN: number;
  /** S — CMC (%); null when the point is beyond the last CMC step. */
  cmc: number | null;
  /** U — max(U, CMC) as a number. */
  uReport: number;
  /** V / P — the truncated 2-significant-figure string. */
  reportU: string;
}

export interface UncertaintyBudgetResult {
  points: UncertaintyBudgetPoint[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Rectangular-distribution divisor the workbook applies to a_F and a_Z. */
const TWO_ROOT_THREE = 2 * Math.sqrt(3);

/** Square root of the sum of squares (Excel SQRT(SUMSQ(...))). */
function rss(...values: number[]): number {
  return Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
}

/** Excel STDEV.S — sample standard deviation (n − 1 denominator). */
export function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sumSquares = values.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
}

/**
 * R — `=IF($F$6="kN", A15*1000, A15)`.
 *
 * The workbook only ever sees N and kN, so only those are handled. Any other
 * unit passes through unchanged, matching the formula's ELSE branch.
 * [UNVERIFIED for kgf/gf — the workbook has no such case.]
 */
export function normalizeToNewtons(calPoint: number, readingUnit: string): number {
  return readingUnit === 'kN' ? calPoint * 1000 : calPoint;
}

/**
 * S — stepwise CMC lookup: the first step whose threshold the point does not
 * exceed. Beyond the last step the workbook's nested IF yields FALSE; null is
 * returned so the caller can surface "no CMC" rather than invent one.
 */
export function lookupCmc(pointInN: number, steps: CmcStep[]): number | null {
  for (const step of [...steps].sort((a, b) => a.toN - b.toN)) {
    if (pointInN <= step.toN) return step.cmc;
  }
  return null;
}

/**
 * V — `=TEXT(TRUNC(U, 1-INT(LOG10(ABS(U)))), "0."&REPT("0", ...))`.
 *
 * Truncation (not rounding) to 2 significant figures, rendered as a string, so
 * that the reported uncertainty is never smaller than the computed one after
 * the final digit is dropped... which is what the lab's convention intends.
 *
 * [UNVERIFIED] For values ≥ 10 the decimal count goes to 0 or below and Excel's
 * "0." format renders a trailing point. The demo's Report-U values all lie in
 * [0.04, 0.42] (2 decimals), so that branch is untested; here it degrades to a
 * plain integer string.
 */
export function formatReportU(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  const decimals = 1 - Math.floor(Math.log10(Math.abs(value)));
  const truncated = truncToDecimals(value, decimals);
  return truncated.toFixed(Math.max(decimals, 0));
}

// ─── Main computation ────────────────────────────────────────────────────────

function computePoint(
  point: RelativeErrorPoint,
  input: UncertaintyBudgetInput,
): UncertaintyBudgetPoint {
  const { uParams } = input;

  // B, C — Type A from the three increasing-series indication errors.
  const sd = sampleStdDev([point.q1, point.q2, point.q3]);
  const uRep = sd / Math.SQRT2;

  // D, E, F — Q4/D4: both arms come from the f0 column, not the resolution.
  // a_Z is the zero row's own f0, which divides by cal point 0 and is
  // therefore structurally 0; kept explicit to mirror the workbook.
  const aF = point.f0;
  const aZ = input.relativeError.zeroF0;
  const uRes = rss(aF / TWO_ROOT_THREE, aZ / TWO_ROOT_THREE);

  // K — Q5/D5: raw RSS, no distribution divisor.
  const uStd = rss(uParams.uCal, uParams.uA, uParams.uB, uParams.uC);

  // L, M, N, O.
  const uC = rss(uRep, uRes, uStd);
  const vEff = uRep === 0 ? Number.POSITIVE_INFINITY : uC ** 4 / (uRep ** 4 / 2);
  const k = coverageFactor(vEff);
  const U = uC * k;

  // R, S, U, V.
  const pointInN = normalizeToNewtons(point.calPoint, input.readingUnit);
  const cmc = lookupCmc(pointInN, input.cmcSteps);
  const uReport = cmc !== null && U < cmc ? cmc : U;

  return {
    calPoint: point.calPoint,
    sd,
    uRep,
    aF,
    aZ,
    uRes,
    uCal: uParams.uCal,
    uA: uParams.uA,
    uB: uParams.uB,
    uC_param: uParams.uC,
    uStd,
    uC,
    vEff,
    k,
    U,
    pointInN,
    cmc,
    uReport,
    reportU: formatReportU(uReport),
  };
}

/**
 * Compute the uncertainty budget for every non-zero cal point.
 *
 * The zero row has no budget row in the workbook and is skipped here too; its
 * f0 still feeds a_Z through {@link RelativeErrorResult.zeroF0}.
 */
export function computeUncertaintyBudget(
  input: UncertaintyBudgetInput,
): UncertaintyBudgetResult {
  return {
    points: input.relativeError.points
      .filter((p) => !p.isZeroRow)
      .map((p) => computePoint(p, input)),
  };
}
