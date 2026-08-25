/**
 * forceUnits.ts
 *
 * ADR-013 D5: normalise every force unit through newtons with ONE factor per
 * unit, replacing the workbook's hard-coded 2x2 (UUC unit, standard unit)
 * matrix in `O15`.
 *
 * Conversion is then `value * STD_TO_N / UUC_TO_N` — written in the template
 * by the author, visibly. Adding a unit means adding one row here, not
 * extending a matrix combinatorially.
 *
 * g = 9.80665 exactly, the standard gravity the workbook's orphan `Raw_Data`
 * sheet was already using.
 */

import type { ForceUnit } from '../types';

/** Multiplier taking one unit of the key to newtons. */
export const FORCE_UNIT_TO_NEWTONS: Record<ForceUnit, number> = {
  N: 1,
  kN: 1000,
  kgF: 9.80665,
  gF: 0.00980665,
};

export const FORCE_UNITS = Object.keys(FORCE_UNIT_TO_NEWTONS) as ForceUnit[];

export function isForceUnit(value: string): value is ForceUnit {
  return Object.prototype.hasOwnProperty.call(FORCE_UNIT_TO_NEWTONS, value);
}

/**
 * The newtons-per-unit factor, or null for an unrecognised unit.
 *
 * Returns null rather than defaulting to 1: silently treating an unknown unit
 * as newtons is exactly the class of quiet wrong answer this module exists to
 * prevent. Callers surface it as an error.
 */
export function forceUnitToNewtons(unit: string | undefined | null): number | null {
  if (!unit || !isForceUnit(unit)) return null;
  return FORCE_UNIT_TO_NEWTONS[unit];
}
