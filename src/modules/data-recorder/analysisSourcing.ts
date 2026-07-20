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
  'บางจุดวัดในชีตนี้ไม่มีค่าพารามิเตอร์ความไม่แน่นอน (u_cal, A, B, C) ที่บันทึกไว้ ณ เวลาบันทึกชีต — ' +
  'ระบบใช้ค่า "ปัจจุบัน" ของสมการแทน ซึ่งอาจไม่ตรงกับค่าที่ใช้จริงในวันที่วัด หากสมการถูกแก้ไขภายหลัง';

export const PARAMS_UNAVAILABLE_NOTICE =
  'บางจุดวัดในชีตนี้ไม่พบค่าพารามิเตอร์ความไม่แน่นอนทั้งจากชีต และจากสมการปัจจุบัน — ' +
  'ระบบคำนวณ u_std เป็น 0 ที่จุดดังกล่าว ผลลัพธ์ของจุดนั้นจึงไม่สมบูรณ์';

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
  'ยังไม่ได้ตั้งค่า CMC สำหรับทิศทางนี้ (ตั้งค่า → CMC) — คอลัมน์ Report U จึงไม่สามารถแสดงได้ ' +
  '(แสดงเฉพาะค่า U ที่คำนวณได้ ไม่ใช่ค่าที่ผ่านการเทียบกับ CMC)';

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
