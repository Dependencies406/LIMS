/**
 * relativeError.ts
 *
 * ISO 7500-1:2018 relative-error analysis for sheetType `force-iso7500-1`.
 * Pure functions: no React, no Firestore, no I/O.
 *
 * Implements docs/STAGE_D_FORMULA_SPEC.md §2 verbatim, as modified by the
 * binding decisions in docs/STAGE_D_EXECUTION_PLAN.md §0:
 *   D1 — forces are read from storage; conversion is never re-run here.
 *   D2 — b = max − min over {q1, q2, q3} (NOT the workbook's q1 − q3).
 *   D3 — f0 = max zero-row force ÷ cal point × 100, as extracted.
 *
 * Column letters in comments refer to the workbook's Relative Error sheet.
 */

import { roundHalfAwayFromZero } from './numeric';

// ─── Class limits (spec §2, ISO 7500-1:2018 table printed in the sheet) ──────

/** The four machine classes, ordered best (0.5) to worst (3). */
export type ClassNumber = 0.5 | 1 | 2 | 3;

/** A class cell: a class number, 'N/A' beyond class 3, or '-' when the
 *  underlying parameter has no value (no decreasing series). */
export type ClassValue = ClassNumber | 'N/A' | typeof NO_VALUE;

/** The five classified parameters, keyed as in {@link ClassLimits}. */
export type ClassParameter = 'q' | 'b' | 'v' | 'f0' | 'a';

export interface ClassLimits {
  cls: ClassNumber;
  /** Max permissible relative indication error (%). */
  q: number;
  /** Max permissible relative repeatability error (%). */
  b: number;
  /** Max permissible relative reversibility error (%). */
  v: number;
  /** Max permissible relative zero error (%). */
  f0: number;
  /** Max permissible relative resolution (%). */
  a: number;
}

export const ISO7500_1_CLASS_LIMITS: readonly ClassLimits[] = [
  { cls: 0.5, q: 0.5, b: 0.5, v: 0.75, f0: 0.05, a: 0.25 },
  { cls: 1, q: 1, b: 1, v: 1.5, f0: 0.1, a: 0.5 },
  { cls: 2, q: 2, b: 2, v: 3, f0: 0.2, a: 1 },
  { cls: 3, q: 3, b: 3, v: 4.5, f0: 0.3, a: 1.5 },
] as const;

/** Sentinel the workbook prints where a value cannot exist (no decreasing series). */
export const NO_VALUE = '-';
export type NoValue = typeof NO_VALUE;

/**
 * Smallest class whose limit for `parameter` is ≥ |value| (spec §2 cols P..T).
 * Beyond class 3 the workbook prints "N/A"; the '-' sentinel propagates.
 */
export function classifyParameter(
  parameter: ClassParameter,
  value: number | NoValue,
): ClassValue {
  if (value === NO_VALUE) return NO_VALUE;
  if (!Number.isFinite(value)) return 'N/A';
  const magnitude = Math.abs(value);
  for (const row of ISO7500_1_CLASS_LIMITS) {
    if (magnitude <= row[parameter]) return row.cls;
  }
  return 'N/A';
}

// ─── Input / output shapes ───────────────────────────────────────────────────

/**
 * A stored force per series. `null` means the cell was never filled; the
 * fixture's '-' text is accepted as the same thing.
 */
export type StoredForce = number | null | undefined | NoValue;

export interface SeriesForces {
  inc1: StoredForce;
  inc2: StoredForce;
  inc3: StoredForce;
  dec3: StoredForce;
}

export interface RelativeErrorPointInput {
  /** Nominal cal point in the UUC reading unit; 0 marks the zero row. */
  calPoint: number;
  forces: SeriesForces;
}

export interface RelativeErrorInput {
  points: RelativeErrorPointInput[];
  /** UUC resolution in the UUC reading unit (sheet uuc.resolution). */
  resolution: number;
  /** Sheet decimalPlaces — F_avg is the only rounded intermediate. */
  decimalPlaces: number;
}

export interface RelativeErrorClasses {
  q: ClassValue;
  b: ClassValue;
  v: ClassValue;
  f0: ClassValue;
  a: ClassValue;
}

export interface RelativeErrorPoint {
  /** A (nominal cal point). */
  calPoint: number;
  isZeroRow: boolean;
  /** B, C, D — increasing series forces as stored. */
  fi1: number | null;
  fi2: number | null;
  fi3: number | null;
  /** E — decreasing series force as stored; null when absent. */
  fd3: number | null;
  /** F — mean of Fi1..Fi3, ROUNDed to decimalPlaces. The only rounded value. */
  fAvg: number;
  /** G, H, I — relative indication error per series (%). */
  q1: number;
  q2: number;
  q3: number;
  /** J — mean of q1..q3 (%), unrounded. */
  qAvg: number;
  /** K — relative repeatability error (%), per D2: max − min of q1..q3. */
  b: number;
  /** L — relative zero error (%), per D3. */
  f0: number;
  /** M — relative reversibility error (%); '-' with no decreasing series. */
  v: number | NoValue;
  /** N — relative resolution (%). */
  a: number;
  /** P..T. */
  classes: RelativeErrorClasses;
  /** O / U — worst class across the five parameters. */
  overallClass: ClassValue;
  /**
   * Class of q taken over the worst individual series rather than q_avg.
   * The workbook classifies q_avg (col P aligns 1:1 with col J); ISO 7500-1
   * itself classifies each qk. Exposed so the UI can show both without a
   * second pass — `classes.q` remains the workbook-faithful value.
   */
  worstSeriesQClass: ClassValue;
}

export interface RelativeErrorResult {
  points: RelativeErrorPoint[];
  /** The zero row, if the sheet has one. */
  zeroRow: RelativeErrorPoint | null;
  /** L15 — the zero row's own f0, consumed as a_Z by the uncertainty budget. */
  zeroF0: number;
  /** Worst class across every non-zero cal point. */
  overallClass: ClassValue;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize a stored force to a number, or null when the cell is empty. */
function toForce(value: StoredForce): number | null {
  if (value === null || value === undefined || value === NO_VALUE) return null;
  return Number.isFinite(value) ? value : null;
}

/**
 * The workbook wraps the error columns in IFERROR(..., 0): a division by zero
 * (the zero row, or an unfilled series) yields 0 rather than an error.
 *
 * DEVIATION (documented): the spec lists IFERROR on G..I, L and N only, while
 * the zero row's J/K/M are plainly 0 in the workbook's cached values. Applying
 * the same zero-on-undefined rule to every derived percentage reproduces the
 * golden zero row exactly and is the only defined behaviour when F_avg is 0.
 */
function ratioPercent(numerator: number, denominator: number): number {
  if (denominator === 0 || !Number.isFinite(denominator)) return 0;
  const result = (numerator / denominator) * 100;
  return Number.isFinite(result) ? result : 0;
}

/**
 * Excel's MAX ignores text cells, so '-' and 'N/A' are skipped when picking
 * the overall class.
 *
 * DEVIATION (documented, deliberate): a literal MAX would also ignore 'N/A'
 * and report a machine that fails class 3 as class 0.5. 'N/A' therefore wins
 * outright here. No golden row is affected — the demo has no 'N/A' anywhere.
 */
function worstClass(values: ClassValue[]): ClassValue {
  if (values.some((v) => v === 'N/A')) return 'N/A';
  const numeric = values.filter((v): v is ClassNumber => typeof v === 'number');
  if (numeric.length === 0) return NO_VALUE;
  return numeric.reduce((a, b) => (b > a ? b : a));
}

/**
 * Locate the zero row: cal point 0 carrying at least one recorded force.
 *
 * The stored model has no zero-row flag (SheetRow.calPoint is a plain number),
 * and the editor maps an unfilled cal point to 0 as well, so a trailing blank
 * row would otherwise masquerade as the zero point. Requiring a recorded force
 * separates the two.
 */
function findZeroRow(points: RelativeErrorPointInput[]): RelativeErrorPointInput | null {
  return (
    points.find(
      (p) =>
        p.calPoint === 0 &&
        (['inc1', 'inc2', 'inc3', 'dec3'] as const).some(
          (k) => toForce(p.forces[k]) !== null,
        ),
    ) ?? null
  );
}

/** L — max of the ZERO row's forces ÷ this row's cal point × 100 (spec Q3/D3). */
function zeroErrorPercent(
  zeroRow: RelativeErrorPointInput | null,
  calPoint: number,
): number {
  if (!zeroRow) return 0;
  const forces = (['inc1', 'inc2', 'inc3', 'dec3'] as const)
    .map((k) => toForce(zeroRow.forces[k]))
    .filter((f): f is number => f !== null);
  // Excel MAX over an empty/all-text range is 0.
  const maxZeroForce = forces.length === 0 ? 0 : Math.max(...forces);
  return ratioPercent(maxZeroForce, calPoint);
}

// ─── Main computation ────────────────────────────────────────────────────────

function computePoint(
  point: RelativeErrorPointInput,
  zeroRow: RelativeErrorPointInput | null,
  input: RelativeErrorInput,
): RelativeErrorPoint {
  const { calPoint } = point;
  const fi1 = toForce(point.forces.inc1);
  const fi2 = toForce(point.forces.inc2);
  const fi3 = toForce(point.forces.inc3);
  const fd3 = toForce(point.forces.dec3);

  // F — AVERAGE(B:D) rounded to dp. Excel's AVERAGE skips blanks; when every
  // increasing series is blank the range is empty and the mean is 0.
  const increasing = [fi1, fi2, fi3].filter((f): f is number => f !== null);
  const mean =
    increasing.length === 0
      ? 0
      : increasing.reduce((a, b) => a + b, 0) / increasing.length;
  const fAvg = roundHalfAwayFromZero(mean, input.decimalPlaces);

  // G, H, I — qk = (F_nom − Fik) / Fik × 100, IFERROR to 0 (blank series → 0).
  const q1 = ratioPercent(calPoint - (fi1 ?? 0), fi1 ?? 0);
  const q2 = ratioPercent(calPoint - (fi2 ?? 0), fi2 ?? 0);
  const q3 = ratioPercent(calPoint - (fi3 ?? 0), fi3 ?? 0);

  // J — AVERAGE(G:I). The IFERROR'd zeros are real cells, so they count.
  const qAvg = (q1 + q2 + q3) / 3;

  // K — D2: max − min over {q1, q2, q3}, superseding the workbook's q1 − q3.
  const b = Math.max(q1, q2, q3) - Math.min(q1, q2, q3);

  // L — D3.
  const f0 = zeroErrorPercent(zeroRow, calPoint);

  // M — (Fi3 − F'i3) / F_avg × 100; '-' when there is no decreasing series.
  const v: number | NoValue =
    fd3 === null ? NO_VALUE : ratioPercent((fi3 ?? 0) - fd3, fAvg);

  // N — resolution / F_nom × 100.
  const a = ratioPercent(input.resolution, calPoint);

  const classes: RelativeErrorClasses = {
    q: classifyParameter('q', qAvg),
    b: classifyParameter('b', b),
    v: classifyParameter('v', v),
    f0: classifyParameter('f0', f0),
    a: classifyParameter('a', a),
  };

  const worstSeriesQ = [q1, q2, q3].reduce(
    (acc, q) => (Math.abs(q) > Math.abs(acc) ? q : acc),
    0,
  );

  return {
    calPoint,
    isZeroRow: zeroRow !== null && point === zeroRow,
    fi1,
    fi2,
    fi3,
    fd3,
    fAvg,
    q1,
    q2,
    q3,
    qAvg,
    b,
    f0,
    v,
    a,
    classes,
    overallClass: worstClass([classes.q, classes.b, classes.v, classes.f0, classes.a]),
    worstSeriesQClass: classifyParameter('q', worstSeriesQ),
  };
}

/**
 * Compute the full Relative Error table for one sheet.
 *
 * Every point in `input.points` is returned in the order given, including the
 * zero row (which the workbook also prints). `result.points` therefore mirrors
 * the workbook's rows 15..24 one-for-one.
 */
export function computeRelativeError(input: RelativeErrorInput): RelativeErrorResult {
  const zeroInput = findZeroRow(input.points);
  const points = input.points.map((p) => computePoint(p, zeroInput, input));
  const zeroRow = points.find((p) => p.isZeroRow) ?? null;

  return {
    points,
    zeroRow,
    // L15: the zero row's own f0 divides by cal point 0, so IFERROR makes it
    // structurally 0. Kept explicit because the budget's a_Z reads this cell.
    zeroF0: zeroRow ? zeroRow.f0 : 0,
    overallClass: worstClass(
      points.filter((p) => !p.isZeroRow).map((p) => p.overallClass),
    ),
  };
}
