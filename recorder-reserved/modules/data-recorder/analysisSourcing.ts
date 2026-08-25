/**
 * analysisSourcing.ts
 *
 * Pure resolution logic feeding the read-only analysis tab (design §8c
 * Session 3): which uncertainty parameters and CMC steps to hand the
 * analysis module, plus the honesty labels the UI must show whenever the
 * answer isn't "exactly as recorded on the sheet". No React, no Firestore —
 * callers supply already-fetched data (snapshots, current equations, CMC
 * settings) so this stays independently testable.
 */

import type {
  CalDirection,
  CalibrationRawDataSheet,
  CalibrationRawDataSheetInput,
  CmcSettings,
  ConversionEquation,
  StandardSnapshot,
} from '../../types';
import {
  computeUncertaintyBudget,
  type CmcStep,
  type RelativeErrorPoint,
  type RelativeErrorResult,
  type UncertaintyBudgetPoint,
  type UncertaintyParams,
} from './analysis';
import { snapshotForRow } from './sheetLogic';

type AnySheet = CalibrationRawDataSheet | CalibrationRawDataSheetInput;

// ─── Uncertainty parameters ──────────────────────────────────────────────────

/** Where the four u_cal/A/B/C values displayed for a cal point came from. */
export type UncertaintyParamsSource = 'snapshot' | 'current-equation' | 'unavailable';

export interface ResolvedUncertaintyParams {
  params: UncertaintyParams;
  source: UncertaintyParamsSource;
}

interface UParamsLike {
  uCal?: number;
  uA?: number;
  uB?: number;
  uC?: number;
}

function fullParams(v: UParamsLike | undefined): UncertaintyParams | null {
  if (!v) return null;
  if (v.uCal === undefined || v.uA === undefined || v.uB === undefined || v.uC === undefined) {
    return null;
  }
  return { uCal: v.uCal, uA: v.uA, uB: v.uB, uC: v.uC };
}

/**
 * Per D7, u_cal/A/B/C are snapshotted onto StandardSnapshot at save time.
 * Sheets recorded before that (or a snapshot that somehow lost the fields)
 * fall back to the CURRENT conversion equation's values — never invented,
 * never silently equal to the snapshot's absence.
 */
export function resolveUncertaintyParams(
  snapshot: StandardSnapshot | undefined,
  currentEquation: ConversionEquation | undefined,
): ResolvedUncertaintyParams {
  const fromSnapshot = fullParams(snapshot);
  if (fromSnapshot) return { params: fromSnapshot, source: 'snapshot' };

  const fromCurrent = fullParams(currentEquation);
  if (fromCurrent) return { params: fromCurrent, source: 'current-equation' };

  return { params: { uCal: 0, uA: 0, uB: 0, uC: 0 }, source: 'unavailable' };
}

/**
 * Distinct standardEquipmentId values whose rows will need the CURRENT
 * conversion equation fetched, because their snapshot lacks a full set of
 * u_cal/A/B/C. Lets the caller batch-fetch only what's actually missing.
 */
export function equipmentIdsNeedingCurrentEquation(sheet: AnySheet): string[] {
  const ids = new Set<string>();
  for (const row of sheet.rows) {
    if (!row.standardEquipmentId) continue;
    const snapshot = snapshotForRow(sheet, row);
    if (!fullParams(snapshot)) ids.add(row.standardEquipmentId);
  }
  return [...ids];
}

export const PARAMS_FALLBACK_NOTICE =
  'Some measurement points on this sheet have no uncertainty parameters (u_cal, A, B, C) recorded ' +
  'at save time — the system uses the equation\'s CURRENT values instead, which may not match ' +
  'what was actually used on the day of measurement if the equation was edited afterward.';

export const PARAMS_UNAVAILABLE_NOTICE =
  'Some measurement points on this sheet have no uncertainty parameters from either the sheet ' +
  'or the current equation — the system computes u_std as 0 for those points, so their results are incomplete.';

// ─── CMC ──────────────────────────────────────────────────────────────────────

export interface ResolvedCmc {
  steps: CmcStep[];
  /** false when the direction has no configured steps — Report U must not be shown. */
  available: boolean;
}

export function resolveCmcSteps(
  settings: CmcSettings | null | undefined,
  direction: CalDirection,
): ResolvedCmc {
  const dirSteps = settings
    ? direction === 'Tension'
      ? settings.directions.tension
      : settings.directions.compression
    : undefined;
  if (!dirSteps || dirSteps.length === 0) return { steps: [], available: false };
  return {
    steps: dirSteps.map((s) => ({ toN: s.toN, cmc: s.cmcPercent })),
    available: true,
  };
}

export const CMC_UNAVAILABLE_NOTICE =
  'CMC has not been configured for this direction (Settings → CMC) — the Report U column cannot ' +
  'be shown (only the computed U value is displayed, not a value compared against CMC).';

// ─── Uncertainty budget, resolved per cal point ──────────────────────────────

export interface SourcedUncertaintyBudgetPoint {
  point: UncertaintyBudgetPoint;
  paramsSource: UncertaintyParamsSource;
}

/**
 * Build the Uncertainty Budget table for a sheet, resolving u_cal/A/B/C
 * independently for each cal point (a sheet's rows may reference different
 * reference standards) rather than assuming one set of parameters for the
 * whole sheet.
 *
 * `currentEquationsByKey` maps `${equipmentId}::${equationId}` to the LIVE
 * ConversionEquation, needed only for rows whose snapshot lacks the fields.
 */
export function buildUncertaintyBudgetPoints(
  sheet: AnySheet,
  relativeError: RelativeErrorResult,
  cmcSteps: CmcStep[],
  readingUnit: string,
  currentEquationsByKey: Map<string, ConversionEquation>,
): SourcedUncertaintyBudgetPoint[] {
  const results: SourcedUncertaintyBudgetPoint[] = [];

  relativeError.points.forEach((relPoint: RelativeErrorPoint, index: number) => {
    if (relPoint.isZeroRow) return;
    const row = sheet.rows[index];
    const snapshot = row ? snapshotForRow(sheet, row) : undefined;
    const currentEquation = row
      ? currentEquationsByKey.get(`${row.standardEquipmentId}::${row.equationId}`)
      : undefined;
    const { params, source } = resolveUncertaintyParams(snapshot, currentEquation);

    const singlePoint: RelativeErrorResult = {
      points: [relPoint],
      zeroRow: relativeError.zeroRow,
      zeroF0: relativeError.zeroF0,
      overallClass: relativeError.overallClass,
    };
    const budget = computeUncertaintyBudget({
      relativeError: singlePoint,
      uParams: params,
      cmcSteps,
      readingUnit,
    });
    results.push({ point: budget.points[0], paramsSource: source });
  });

  return results;
}
