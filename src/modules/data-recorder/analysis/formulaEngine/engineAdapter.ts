/**
 * engineAdapter.ts
 *
 * Runs the seeded 'force-iso7500-1' FormulaSet over the SAME input shape
 * the hardcoded relativeError.ts/uncertaintyBudget.ts functions accept
 * (RelativeErrorInput, UncertaintyParams, CmcStep), so its output is
 * directly comparable to theirs — that comparison is the regression test.
 *
 * This file is the ONLY place that re-derives the small structural pieces
 * relativeError.ts keeps private (finding the zero row, treating an absent
 * force as 0) — those functions are not exported, so an equivalent is
 * written here, matching their documented behavior exactly. It does not
 * modify or duplicate relativeError.ts itself.
 *
 * NOT used by AnalysisResultsSection.tsx or analysisSourcing.ts this
 * session — this is Session 2's regression-test harness, not yet the
 * production computation path (design §8c / Session brief).
 */

import type { CmcStep, UncertaintyParams } from '../uncertaintyBudget';
import { formatReportU, lookupCmc, normalizeToNewtons } from '../uncertaintyBudget';
import type { NoValue, RelativeErrorInput, RelativeErrorPointInput, SeriesForces, StoredForce } from '../relativeError';
import { NO_VALUE } from '../relativeError';
import { evaluateFormulaSet } from './formulaSet';
import type { FormulaSet } from './formulaSet';

// ─── Structural helpers (mirror relativeError.ts's private toForce/findZeroRow) ──

function toForceNullable(value: StoredForce): number | null {
  if (value === null || value === undefined || value === NO_VALUE) return null;
  return Number.isFinite(value) ? value : null;
}

function toForceOrZero(value: StoredForce): number {
  return toForceNullable(value) ?? 0;
}

const SERIES_KEYS = ['inc1', 'inc2', 'inc3', 'dec3'] as const;

function hasAnyForce(forces: SeriesForces): boolean {
  return SERIES_KEYS.some((k) => toForceNullable(forces[k]) !== null);
}

/** Mirrors relativeError.ts's private findZeroRow: cal point 0 carrying a recorded force. */
function findZeroRowInput(points: RelativeErrorPointInput[]): RelativeErrorPointInput | null {
  return points.find((p) => p.calPoint === 0 && hasAnyForce(p.forces)) ?? null;
}

/** Mirrors zeroErrorPercent's max-of-present-forces (the numerator only; the ÷calPoint×100 is the f0 formula step). */
function findZeroForce(points: RelativeErrorPointInput[]): number {
  const zeroRow = findZeroRowInput(points);
  if (!zeroRow) return 0;
  const forces = SERIES_KEYS.map((k) => toForceNullable(zeroRow.forces[k])).filter(
    (f): f is number => f !== null,
  );
  return forces.length === 0 ? 0 : Math.max(...forces);
}

// ─── Public result shape ─────────────────────────────────────────────────────

export interface EngineRelativeErrorPoint {
  fAvg: number;
  q1: number;
  q2: number;
  q3: number;
  qAvg: number;
  b: number;
  f0: number;
  v: number | NoValue;
  a: number;
}

export interface EngineUncertaintyBudgetPoint {
  sd: number;
  uRep: number;
  uRes: number;
  uStd: number;
  uC: number;
  vEff: number;
  k: number;
  U: number;
  uReport: number;
  reportU: string;
}

export interface EngineForceIso75001Point {
  calPoint: number;
  isZeroRow: boolean;
  relativeError: EngineRelativeErrorPoint;
  /** null for the zero row — the workbook has no budget row there either. */
  uncertaintyBudget: EngineUncertaintyBudgetPoint | null;
}

export interface EngineForceIso75001Options {
  uParams: UncertaintyParams;
  cmcSteps: CmcStep[];
  readingUnit: string;
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Evaluate the 'force-iso7500-1' seed FormulaSet over every point in
 * `input`, in the same order relativeError.ts/uncertaintyBudget.ts would
 * produce their RelativeErrorPoint/UncertaintyBudgetPoint arrays.
 */
export function computeForceIso75001ViaFormulaSet(
  formulaSet: FormulaSet,
  input: RelativeErrorInput,
  opts: EngineForceIso75001Options,
): EngineForceIso75001Point[] {
  const zeroForce = findZeroForce(input.points);
  const zeroRowRef = findZeroRowInput(input.points);
  // Structural invariant (see seedFormulaSet.ts's module doc): the zero
  // row's own f0 divides by cal point 0, so its own f0 formula result is
  // always 0 — no need to actually evaluate it to know that.
  const zeroF0 = 0;
  const infinityConst = Number.POSITIVE_INFINITY;

  return input.points.map((point) => {
    const isZeroRow = zeroRowRef !== null && point === zeroRowRef;

    const fi1 = toForceOrZero(point.forces.inc1);
    const fi2 = toForceOrZero(point.forces.inc2);
    const fi3 = toForceOrZero(point.forces.inc3);
    const fd3 = toForceOrZero(point.forces.dec3);
    const hasDec = toForceNullable(point.forces.dec3) !== null;
    const incCount = (['inc1', 'inc2', 'inc3'] as const).filter(
      (k) => toForceNullable(point.forces[k]) !== null,
    ).length;

    const pointInN = normalizeToNewtons(point.calPoint, opts.readingUnit);
    const cmc = lookupCmc(pointInN, opts.cmcSteps);

    const rawScope: Record<string, number> = {
      calPoint: point.calPoint,
      fi1,
      fi2,
      fi3,
      fd3,
      incCount,
      resolution: input.resolution,
      decimalPlaces: input.decimalPlaces,
      zeroForce,
      zeroF0,
      uCal: opts.uParams.uCal,
      uA: opts.uParams.uA,
      uB: opts.uParams.uB,
      uC_param: opts.uParams.uC,
      cmcAvailable: cmc === null ? 0 : 1,
      cmc: cmc ?? 0,
      infinityConst,
    };

    const scope = evaluateFormulaSet(formulaSet, rawScope);

    const relativeError: EngineRelativeErrorPoint = {
      fAvg: scope.fAvg,
      q1: scope.q1,
      q2: scope.q2,
      q3: scope.q3,
      qAvg: scope.qAvg,
      b: scope.b,
      f0: scope.f0,
      v: hasDec ? scope.v : NO_VALUE,
      a: scope.a,
    };

    const uncertaintyBudget: EngineUncertaintyBudgetPoint | null = isZeroRow
      ? null
      : {
          sd: scope.sd,
          uRep: scope.uRep,
          uRes: scope.uRes,
          uStd: scope.uStd,
          uC: scope.uC,
          vEff: scope.vEff,
          k: scope.k,
          U: scope.U,
          uReport: scope.uReport,
          reportU: formatReportU(scope.uReport),
        };

    return { calPoint: point.calPoint, isZeroRow, relativeError, uncertaintyBudget };
  });
}
