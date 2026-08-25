/**
 * forceUnits.ts
 *
 * Force unit handler for the Data Recorder module.
 * Converts between the units a reference-standard equation may output and the
 * unit the UUC (unit under calibration) reads in.
 *
 * All conversions go through newton (SI base):
 *   kgf and gf use standard gravity g0 = 9.80665 m/s² (ISO 80000-4).
 */

import type { ForceUnit } from '../../types';

/** Conversion factor of each supported unit to newton. */
export const FORCE_UNIT_FACTORS: Record<ForceUnit, number> = {
  N: 1,
  kN: 1000,
  kgf: 9.80665,
  gf: 0.00980665,
};

export const FORCE_UNITS: ForceUnit[] = ['N', 'kN', 'kgf', 'gf'];

/** Type guard: is this string one of the supported force units? */
export function isForceUnit(u: string): u is ForceUnit {
  return (FORCE_UNITS as string[]).includes(u);
}

/**
 * Convert a force value between supported units.
 * Returns null when the value is null/undefined/NaN or either unit is unsupported
 * (callers render null as "-", matching the raw-data sheet convention).
 */
export function convertForce(
  value: number | null | undefined,
  from: string,
  to: string,
): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (!isForceUnit(from) || !isForceUnit(to)) return null;
  if (from === to) return value;
  return (value * FORCE_UNIT_FACTORS[from]) / FORCE_UNIT_FACTORS[to];
}
