/**
 * referenceStandardOptions.ts
 *
 * ADR-014 D3: the choices a record's `standard` column offers.
 *
 * A reference standard is now an (equipment, equation) pair — one transducer
 * with one calibrated range. The picker is presented flattened, as
 * "equipment — range", because that is how the metrologist thinks about it and
 * it keeps selection to a single click per row.
 *
 * Only equipment explicitly flagged `isReferenceStandard` appears. Filtering on
 * an id or name convention was rejected (D3): a device would silently appear or
 * disappear as naming drifted.
 */

import type { ConversionEquation, EquipmentRecord } from '../types';
import { conversionEquationService } from './conversionEquationService';
import { equipmentControlService } from './equipmentControlService';
import { forceUnitToNewtons } from './forceUnits';
import {
  checkForceInRange,
  checkStandardDueDate,
  equationToStandardSource,
  makeStandardKey,
  type StandardVariableSource,
  type StandardWarning,
} from './referenceStandardVariables';

export interface StandardOption {
  /** The composite value stored in the cell — `equipmentId::equationId`. */
  key: string;
  /** "CAL-FRC-001 — 1-10 N" */
  label: string;
  equipment: EquipmentRecord;
  equation: ConversionEquation;
}

/** Flattened "equipment — range" label for one pair. */
export function standardOptionLabel(
  equipment: EquipmentRecord,
  equation: ConversionEquation,
): string {
  return `${equipment.id} — ${equation.name}`;
}

/**
 * Rewrites labels IN PLACE so no two options share one (ADR-014 Phase 14
 * Task 4).
 *
 * Two equations under one equipment can be named identically — the equation
 * form rejects new duplicates (`EquationConfigModal`), but existing data can
 * already contain them, so `loadStandardOptions` must survive that case
 * rather than merely prevent new ones. `invertStandardLabels`
 * (`recordingGridDocument.ts`) builds label -> key by overwriting on
 * collision, so a duplicate label would make one equation's coefficients
 * unreachable through the picker — the technician picks what looks like
 * equation A and silently gets equation B's numbers. Same class of defect as
 * the coefficient-order trap: an identifier that does not uniquely identify.
 *
 * Disambiguation appends the equation's own document id, which is
 * unconditionally unique — not the range or any other equation FIELD, since
 * two colliding equations could plausibly share those too.
 */
function disambiguateLabels(options: StandardOption[]): StandardOption[] {
  const counts = new Map<string, number>();
  for (const option of options) counts.set(option.label, (counts.get(option.label) ?? 0) + 1);

  const disambiguated = options.map((option) =>
    (counts.get(option.label) ?? 0) > 1
      ? { ...option, label: `${option.label} (${option.equation.id})` }
      : option,
  );

  // Defensive, not merely hopeful: appending a unique equation id to every
  // colliding label makes injectivity provable, not just likely — assert it
  // rather than trust the construction silently.
  const labels = new Set(disambiguated.map((o) => o.label));
  if (labels.size !== disambiguated.length) {
    throw new Error('loadStandardOptions: labels are not unique after disambiguation — this is a bug.');
  }

  return disambiguated;
}

/**
 * Every selectable (equipment, equation) pair, in equipment order then the
 * equation order the equipment page shows. Labels are guaranteed distinct
 * (see `disambiguateLabels`) — never two identical labels resolving to
 * different coefficients.
 *
 * Equipment flagged as a reference standard but carrying NO equations is
 * omitted: there is nothing to select, and offering the device alone would
 * let a row name a standard with no coefficients.
 */
export async function loadStandardOptions(): Promise<StandardOption[]> {
  const allEquipment = await equipmentControlService.getAllEquipment();
  const usable = allEquipment.filter((e) => e.isReferenceStandard);

  const options: StandardOption[] = [];
  for (const equipment of usable) {
    const equations = await conversionEquationService.getAll(equipment.id);
    for (const equation of equations) {
      options.push({
        key: makeStandardKey(equipment.id, equation.id),
        label: standardOptionLabel(equipment, equation),
        equipment,
        equation,
      });
    }
  }
  return disambiguateLabels(options);
}

/**
 * The `StandardsById` map the evaluator needs, built from loaded options.
 *
 * Used while DRAFTING, against live equations. A committed record replays from
 * its stored snapshots instead (ADR-014 D6) — never from this.
 */
export function optionsToStandardsById(
  options: StandardOption[],
): Record<string, StandardVariableSource> {
  const out: Record<string, StandardVariableSource> = {};
  for (const option of options) {
    out[option.key] = equationToStandardSource(option.equation);
  }
  return out;
}

/**
 * The out-of-range and past-due warnings (ADR-013 D3, D6), computed for ONE
 * option at the moment it is selected in a record row — shown at selection
 * time, not buried on a settings page.
 *
 * `forceValues` are the row's own currently-computed force readings — every
 * value from that row's formula column(s) that actually consume `STD_*`
 * (found via `findStandardDependentFormulaColumns`, not by a naming
 * convention, since a template author can call the column anything). Pass an
 * empty array when none are computed yet (e.g. the reading hasn't been typed
 * in); the range check is silent until there is a number to check.
 *
 * ── THE UNIT MISMATCH (Phase 14 Task 3) ──────────────────────────────────
 *
 * `rangeMin`/`rangeMax` are documented on `ConversionEquation` as being in
 * the equation's OWN `outputUnit`. But a template formula following ADR-014
 * D5 computes `polynomial(R) * STD_TO_N / REPORT_TO_N` — its result is in the
 * RECORD's reporting unit, not the equation's output unit. A 10 kN point
 * reported in N arrives here as `10000`; compared directly against a range of
 * `2–20` (kN), it warns when nothing is wrong. A warning that fires when
 * nothing is wrong gets ignored, and then it is not a warning.
 *
 * `reportUnit` is required here (not defaulted) so this cannot be skipped by
 * omission. Each force is converted from the report unit BACK to the
 * equation's own output unit before comparison — the exact inverse of the
 * template's own `* STD_TO_N / REPORT_TO_N` — via
 * `force * REPORT_TO_N / STD_TO_N`. When either unit is unrecognised or the
 * report unit is unset, the range check is silently skipped for that value
 * rather than comparing incommensurable numbers: an unconvertible comparison
 * is exactly the "hoping the units line up" this fix exists to end, so it is
 * withheld rather than guessed.
 *
 * `calibrationDate` is "now" by default: for a record actively being drafted,
 * the calibration is happening at the moment the technician makes the
 * selection, and `CalibrationRecord` has no separate field recording when the
 * work itself occurred.
 */
export function checkOptionWarnings(
  option: StandardOption,
  forceValues: Array<number | null | undefined>,
  reportUnit: string | null | undefined,
  calibrationDate: Date = new Date(),
): StandardWarning[] {
  const displayName = option.label;
  const warnings: StandardWarning[] = [];

  const dueDateSource = { displayName, dueDate: parseIsoDate(option.equipment.nextCalibrationDate) };
  const dueWarning = checkStandardDueDate(dueDateSource, calibrationDate);
  if (dueWarning) warnings.push(dueWarning);

  const rangeSource = {
    displayName,
    rangeMin: option.equation.rangeMin,
    rangeMax: option.equation.rangeMax,
  };

  const reportToN = forceUnitToNewtons(reportUnit);
  const stdToN = forceUnitToNewtons(option.equation.outputUnit);

  for (const force of forceValues) {
    if (force === null || force === undefined || !Number.isFinite(force)) continue;
    if (reportToN === null || stdToN === null || stdToN === 0) continue; // cannot convert — stay silent, not wrong
    const forceInEquationUnit = (force * reportToN) / stdToN;

    const rangeWarning = checkForceInRange(rangeSource, forceInEquationUnit);
    if (rangeWarning) {
      warnings.push(rangeWarning);
      break; // one range warning per option is enough; don't repeat per force column
    }
  }

  return warnings;
}

function parseIsoDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
