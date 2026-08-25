/**
 * referenceStandardVariables.ts
 *
 * ADR-013 D4: turns the reference standard selected in ONE ROW into the
 * `STD_*` variable map the evaluator resolves against — exactly the shape
 * `env` already has for `ENV_*` (ADR-009). No grammar change; `STD_` is a
 * name-resolution concern only.
 *
 * The difference from `ENV_`: `env` is record-scoped and broadcast to every
 * row, whereas this is built PER ROW from that row's own standard column.
 * Two rows using different standards therefore evaluate with different
 * coefficients, which is the entire point of the phase.
 *
 * ── ADR-014: WHERE THE DATA NOW COMES FROM ─────────────────────────────────
 *
 * The source is a `ConversionEquation` plus its parent equipment record, not
 * the retired `ReferenceStandard` entity. One transducer is ONE equipment
 * record with one equation per calibrated range (D1).
 *
 * `buildStandardVariables` still takes a plain `StandardVariableSource` rather
 * than the equation itself, deliberately:
 *
 *   - The conversion from stored to canonical form happens ONCE, in
 *     `equationToStandardSource` below, which is the only caller that touches
 *     a `ConversionEquation`. Coefficients reach this function already
 *     canonical ascending (D4).
 *   - A committed record replays from its SNAPSHOT, not from live equations
 *     (D6). The snapshot is not a `ConversionEquation` and never will be.
 *     Both paths produce the same structural source, so `buildStandardVariables`
 *     has exactly one input shape and no idea which path it came from.
 *
 * ── THE ONE EXCEPTION TO ADR-010's STRICT EMPTY SEMANTICS ──────────────────
 *
 * `STD_C0`..`STD_C5` beyond the stored polynomial degree resolve to 0 rather
 * than raising `awaiting-input`. A polynomial's absent higher terms genuinely
 * ARE zero; that is not missing data.
 *
 * The exception is confined here, structurally, by two facts:
 *
 *   1. It lives ONLY in `buildStandardVariables`, in the coefficient loop.
 *      Nothing else in the codebase substitutes a value for an empty one.
 *   2. `buildStandardVariables` is only ever called with a standard in hand.
 *      A row with NO standard selected never reaches this function — the
 *      caller passes `null` for the whole map and the evaluator raises
 *      `awaiting-input` for every `STD_*`, coefficient slots included.
 *
 * Everything else the standard might be missing (`uCal`, `uA`, `uB`, `uC`,
 * `resolution`) is written as `null` and therefore still errors, per ADR-010.
 * The evaluator's `STD_` branch is a byte-for-byte copy of its `ENV_` branch;
 * it has no knowledge of this exception and cannot apply it to anything else.
 */

import type { CellValue } from '../modules/recorder/formula';
import type {
  ConversionEquation,
  EquipmentRecord,
  ForceUnit,
  ReferenceStandardSnapshot,
} from '../types';
import { toCanonicalAscending } from './conversionEquationAdapter';
import { forceUnitToNewtons } from './forceUnits';

/** Highest coefficient slot exposed to formulas (ADR-013 D4). */
export const MAX_COEFFICIENT_INDEX = 5;

/** Every valid `STD_*` name. The validator checks against exactly this list. */
export const STANDARD_VARIABLE_NAMES: string[] = [
  ...Array.from({ length: MAX_COEFFICIENT_INDEX + 1 }, (_, i) => `STD_C${i}`),
  'STD_TO_N',
  'STD_UCAL',
  'STD_UA',
  'STD_UB',
  'STD_UC',
  'STD_RESOLUTION',
];

/**
 * What `buildStandardVariables` needs, stated structurally so both the live
 * path (`equationToStandardSource`) and the committed path (a stored
 * `ReferenceStandardSnapshot`) satisfy it without either knowing about the
 * other.
 *
 * `coefficients` here is ALWAYS canonical ascending — `coefficients[i]`
 * multiplies `Rⁱ`. Anything holding the stored descending order must pass
 * through `toCanonicalAscending` before it gets here (ADR-014 D4).
 */
export interface StandardVariableSource {
  /** Canonical ASCENDING. Index i multiplies R^i; index 0 is the constant. */
  coefficients: number[];
  /** Force unit the polynomial produces. Drives STD_TO_N. */
  outputUnit: string;
  resolution?: number;
  uCal?: number;
  uA?: number;
  uB?: number;
  uC?: number;
}

// ── The composite standard key (ADR-014 D3) ─────────────────────────────────
//
// The `standard` cell must identify BOTH the equipment and the equation, since
// an equation is only meaningful together with the device it belongs to. A
// record cell is a `CellValue` (`number | string | null | undefined`) and
// cannot hold an object, so the pair is encoded as one opaque string.
//
// Everything downstream — `collectStandardIds`, the snapshot map key, the
// evaluator's per-row lookup — treats it as an opaque key and never parses it.
// Only the picker (writing) and the fetch (reading) split it.

const STANDARD_KEY_SEPARATOR = '::';

/** Encodes an (equipmentId, equationId) pair as one cell value. */
export function makeStandardKey(equipmentId: string, equationId: string): string {
  return `${equipmentId}${STANDARD_KEY_SEPARATOR}${equationId}`;
}

/** Splits a composite key, or null when the value is not one. */
export function parseStandardKey(
  key: CellValue,
): { equipmentId: string; equationId: string } | null {
  if (typeof key !== 'string') return null;
  const index = key.indexOf(STANDARD_KEY_SEPARATOR);
  if (index <= 0) return null;
  const equipmentId = key.slice(0, index);
  const equationId = key.slice(index + STANDARD_KEY_SEPARATOR.length);
  if (!equipmentId || !equationId) return null;
  return { equipmentId, equationId };
}

/**
 * Re-sources a live equation into the shape the evaluator consumes (ADR-014).
 *
 * THE ONE PLACE a `ConversionEquation`'s stored descending coefficients become
 * canonical ascending, via the single adapter. Nothing else in the recorder
 * path reads `equation.coefficients` directly.
 *
 * `equation.divisor` is deliberately NOT read here (ADR-014 D5): unit scaling
 * is derived per job from `STD_TO_N` / `REPORT_TO_N`, and applying the stored
 * divisor as well would scale twice.
 */
export function equationToStandardSource(equation: ConversionEquation): StandardVariableSource {
  return {
    coefficients: toCanonicalAscending(equation),
    outputUnit: equation.outputUnit,
    resolution: equation.resolution,
    uCal: equation.uCal,
    uA: equation.uA,
    uB: equation.uB,
    uC: equation.uC,
  };
}

/**
 * Builds the `STD_*` map for one row's standard.
 *
 * Call this ONLY when a standard is actually selected. For an unselected row
 * pass `null` as the evaluator's `std` context instead — do not call this with
 * a fabricated empty standard, which would hand the caller coefficients of 0
 * and silently compute a force of 0 N for a row nobody has filled in.
 */
export function buildStandardVariables(standard: StandardVariableSource): Record<string, CellValue> {
  const variables: Record<string, CellValue> = {};

  // ── The exception, and its only home ────────────────────────────────────
  // Slots within the stored degree take their coefficient; slots beyond it
  // are 0, because an absent higher term of a polynomial IS zero.
  const coefficients = Array.isArray(standard.coefficients) ? standard.coefficients : [];
  for (let i = 0; i <= MAX_COEFFICIENT_INDEX; i += 1) {
    const value = coefficients[i];
    variables[`STD_C${i}`] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  // ── Everything below is ordinary ADR-010 territory: absent means empty, ──
  // ── and an empty consumed by a formula raises awaiting-input. ───────────

  // null (not 1) for an unrecognised unit: defaulting to newtons would apply a
  // silently wrong conversion factor, the exact failure class D5 exists to end.
  variables.STD_TO_N = forceUnitToNewtons(standard.outputUnit);

  variables.STD_UCAL = standard.uCal ?? null;
  variables.STD_UA = standard.uA ?? null;
  variables.STD_UB = standard.uB ?? null;
  variables.STD_UC = standard.uC ?? null;
  variables.STD_RESOLUTION = standard.resolution ?? null;

  return variables;
}

/** Parses an equipment record's ISO date field, or undefined when unset/invalid. */
function toDateOrUndefined(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Freezes a live equation and its parent equipment for storage on a committed
 * record (ADR-013 D6, ADR-014 D6).
 *
 * The stored `coefficients` are CANONICAL ASCENDING — already converted, never
 * the stored descending form. A later reader therefore cannot re-invert them
 * by accident: there is no second reversal anywhere downstream of this point.
 */
export function toStandardSnapshot(
  equipment: EquipmentRecord,
  equation: ConversionEquation,
): ReferenceStandardSnapshot {
  return {
    equipmentId: equipment.id,
    equationId: equation.id,
    displayName: `${equipment.name} — ${equation.name}`,
    equipmentCode: equipment.id,
    coefficients: toCanonicalAscending(equation),
    inputUnit: equation.inputUnit,
    outputUnit: equation.outputUnit,
    resolution: equation.resolution,
    rangeMin: equation.rangeMin,
    rangeMax: equation.rangeMax,
    uCal: equation.uCal,
    uA: equation.uA,
    uB: equation.uB,
    uC: equation.uC,
    serialNumber: equipment.serialNumber,
    calibrationDate: toDateOrUndefined(equipment.lastCalibrationDate),
    dueDate: toDateOrUndefined(equipment.nextCalibrationDate),
    capturedAt: new Date(),
  };
}

// ── Warnings: flag the improbable, never block (ADR-013 D3, D6) ────────────
// Choosing a standard is the metrologist's judgement. These surface a likely
// mistake; none of them prevents recording or committing.

export interface StandardWarning {
  kind: 'range' | 'due-date' | 'unit';
  message: string;
}

/** The minimum a range check needs, from either a live equation or a snapshot. */
export interface StandardRangeSource {
  displayName: string;
  rangeMin?: number;
  rangeMax?: number;
}

/**
 * Warns when a row's force level falls outside the standard's stated range.
 * Silent when either bound is unset — a standard with no numeric range simply
 * cannot be checked, which is not itself worth a warning.
 *
 * Direction disagreement (ADR-013 D3) is NOT checked here: directions are D7
 * and explicitly out of scope for this phase, so no row carries a direction to
 * compare against yet.
 */
export function checkForceInRange(
  standard: StandardRangeSource,
  force: number | null | undefined,
): StandardWarning | null {
  if (force === null || force === undefined || !Number.isFinite(force)) return null;
  if (standard.rangeMin === undefined || standard.rangeMax === undefined) return null;
  if (force >= standard.rangeMin && force <= standard.rangeMax) return null;
  return {
    kind: 'range',
    message: `${force} is outside ${standard.displayName}'s range of ${standard.rangeMin}–${standard.rangeMax}.`,
  };
}

/**
 * Warns when the standard was out of calibration on the date being recorded.
 * Calibrating against an out-of-calibration standard is an accreditation
 * finding (ADR-013 D6) — but it is the metrologist's call, so this warns only.
 */
export function checkStandardDueDate(
  standard: { displayName: string; dueDate?: Date },
  calibrationDate: Date | null | undefined,
): StandardWarning | null {
  if (!standard.dueDate || !calibrationDate) return null;
  if (standard.dueDate >= calibrationDate) return null;
  return {
    kind: 'due-date',
    message: `${standard.displayName} was due for recalibration on ${standard.dueDate.toLocaleDateString()}, before this calibration date.`,
  };
}

/**
 * Warns when a stored `divisor` disagrees with what the equation's own units
 * claim (ADR-014 D5).
 *
 * The equipment calculator computes `raw polynomial ÷ divisor = outputUnit`.
 * So `divisor = 1` is the only value consistent with "the polynomial produces
 * `outputUnit`" — the claim `outputUnit` makes, and the claim the recorder
 * relies on when it multiplies by `STD_TO_N`.
 *
 * A divisor of anything else means the raw polynomial is in a DIFFERENT unit
 * from the one `outputUnit` names. The recorder does not apply the divisor
 * (D5), so such an equation yields a force wrong by exactly that factor —
 * ~1000x for the divisor of 1000 seen in real data.
 *
 * Warning rather than blocking, and surfaced in the equipment UI, is the point:
 * it exposes the bad data instead of silently honouring or silently ignoring it.
 */
export function checkDivisorAgreement(
  equation: { name: string; divisor: number; outputUnit: string },
): StandardWarning | null {
  if (equation.divisor === 1) return null;
  return {
    kind: 'unit',
    message:
      `"${equation.name}" stores a divisor of ${equation.divisor}, but its output unit is ` +
      `"${equation.outputUnit}". Those disagree: dividing by ${equation.divisor} means the ` +
      `polynomial does not produce ${equation.outputUnit} directly. The recorder ignores the ` +
      `divisor and converts using the output unit, so forces from this equation would be off ` +
      `by a factor of ${equation.divisor}. Correct the coefficients or the output unit.`,
  };
}

/**
 * Warns when an equation's output unit is not one the newton table knows
 * (ADR-014). Such a unit makes `STD_TO_N` null, which turns every force
 * formula on that row into `awaiting-input` — correct, but opaque unless the
 * cause is named. Legacy free-text values like "kg" are the expected trigger.
 */
export function checkOutputUnitRecognised(
  standard: { displayName: string; outputUnit: string },
): StandardWarning | null {
  if (forceUnitToNewtons(standard.outputUnit) !== null) return null;
  return {
    kind: 'unit',
    message: `${standard.displayName} has output unit "${standard.outputUnit}", which is not a known force unit (N, kN, kgF, gF). Force cannot be converted until this is corrected.`,
  };
}

/** Re-exported so callers converting units do not reach past this module. */
export type { ForceUnit };
