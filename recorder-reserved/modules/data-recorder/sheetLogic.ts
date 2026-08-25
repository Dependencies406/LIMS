/**
 * sheetLogic.ts
 *
 * Pure/shared logic for the Data Recorder module: series layout, standard
 * options built from equipment + conversion equations, force computation
 * (reusing conversionEquationService.evaluate), draft editing model, and
 * validation. No React, no Firestore reads here.
 */

import type {
  CalibrationRawDataSheet,
  CalibrationRawDataSheetInput,
  ConversionEquation,
  EquipmentRecord,
  ForceUnit,
  SeriesKey,
  SheetRow,
  StandardSnapshot,
} from '../../types';
import { conversionEquationService } from '../../services/conversionEquationService';
import { convertForce } from './forceUnits';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Sheet-type discriminator for the current (force / ISO 7500-1) implementation. */
export const FORCE_SHEET_TYPE = 'force-iso7500-1';

/** Equipment categories treated as force reference standards. */
export const STANDARD_CATEGORIES = ['FRC'];
/** Equipment categories treated as environment (thermo-hygrometer) standards.
 *  Official list uses TMP; real equipment IDs also show THM — accept both. */
export const ENV_CATEGORIES = ['TMP', 'THM'];

export const SERIES: { key: SeriesKey; label: string; group: 'inc' | 'dec' }[] = [
  { key: 'inc1', label: 'Increasing 1', group: 'inc' },
  { key: 'inc2', label: 'Increasing 2', group: 'inc' },
  { key: 'inc3', label: 'Increasing 3', group: 'inc' },
  { key: 'dec3', label: 'Decreasing 3', group: 'dec' },
];


// ─── Standard options (equipment × equation) ─────────────────────────────────

/** One selectable reference-standard entry: an equipment + one of its equations. */
export interface StandardOption {
  key: string;                 // `${equipmentId}::${equationId}`
  equipmentId: string;
  equationId: string;
  code: string;                // "CAL-FRC-004 — Tensile 10-100 kN"
  equipment: EquipmentRecord;
  equation: ConversionEquation;
}

export function optionKey(equipmentId: string, equationId: string): string {
  return `${equipmentId}::${equationId}`;
}

export function buildStandardOptions(
  standards: EquipmentRecord[],
  equationsByEquipment: Record<string, ConversionEquation[]>,
): StandardOption[] {
  const options: StandardOption[] = [];
  for (const equipment of standards) {
    for (const equation of equationsByEquipment[equipment.id] ?? []) {
      options.push({
        key: optionKey(equipment.id, equation.id),
        equipmentId: equipment.id,
        equationId: equation.id,
        code: `${equipment.id} — ${equation.name || equation.outputUnit}`,
        equipment,
        equation,
      });
    }
  }
  return options;
}

export function snapshotFromOption(option: StandardOption): StandardSnapshot {
  const { equipment, equation } = option;
  return {
    equipmentId: equipment.id,
    equationId: equation.id,
    code: option.code,
    name: equipment.name,
    manufacturer: equipment.manufacturer || undefined,
    model: equipment.model || undefined,
    serial: equipment.serialNumber || undefined,
    dueDate: equipment.nextCalibrationDate || undefined,
    equationName: equation.name,
    degree: equation.degree,
    coefficients: equation.coefficients.map((c) => c.value),
    divisor: equation.divisor,
    inputUnit: equation.inputUnit,
    outputUnit: equation.outputUnit,
    uCal: equation.uCal,
    uA: equation.uA,
    uB: equation.uB,
    uC: equation.uC,
  };
}

// ─── Force computation ───────────────────────────────────────────────────────

/**
 * Compute STD-Force from a raw signal using either a live equation or a saved
 * snapshot, converted to the sheet's UUC reading unit via the unit handler.
 * Reuses conversionEquationService.evaluate — snapshots are rehydrated into
 * the equation shape it expects.
 */
export function computeForce(
  source: ConversionEquation | StandardSnapshot,
  sig: number | null,
  readingUnit: ForceUnit,
): number | null {
  if (sig === null || Number.isNaN(sig)) return null;
  // Snapshots carry equationName + number[] coefficients; live equations don't.
  const equation: ConversionEquation = 'equationName' in source
    ? rehydrateSnapshot(source)
    : source;
  const raw = conversionEquationService.evaluate(equation, sig);
  return convertForce(raw, equation.outputUnit, readingUnit);
}

function rehydrateSnapshot(snap: StandardSnapshot): ConversionEquation {
  return {
    id: snap.equationId,
    name: snap.equationName,
    inputUnit: snap.inputUnit,
    outputUnit: snap.outputUnit,
    degree: snap.degree,
    coefficients: snap.coefficients.map((value) => ({
      value,
      inputMode: 'decimal' as const,
      raw: String(value),
    })),
    divisor: snap.divisor,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    createdBy: '',
  };
}

// ─── Draft editing model (string-valued inputs) ──────────────────────────────

export interface EditableCell { uuc: string; sig: string; }
export interface EditableRow {
  calPoint: string;
  standardKey: string;         // optionKey; '' = not selected
  /** Keyed by series key — widened to string so grids can render a non-fixed series layout. */
  cells: Record<string, EditableCell>;
}

export function blankCell(): EditableCell {
  return { uuc: '', sig: '' };
}

export function blankRow(standardKey = ''): EditableRow {
  return {
    calPoint: '',
    standardKey,
    cells: { inc1: blankCell(), inc2: blankCell(), inc3: blankCell(), dec3: blankCell() },
  };
}

/** New sheets start with a single empty row — calibration points are never preset. */
export function defaultRows(): EditableRow[] {
  return [blankRow()];
}

/** Convert a saved sheet's rows back into the editable model (for amendments). */
export function rowsToEditable(rows: SheetRow[]): EditableRow[] {
  return rows.map((row) => ({
    calPoint: String(row.calPoint),
    standardKey: optionKey(row.standardEquipmentId, row.equationId),
    cells: Object.fromEntries(
      SERIES.map(({ key }) => [key, {
        uuc: row.cells[key].uuc === null ? '' : String(row.cells[key].uuc),
        sig: row.cells[key].sig === null ? '' : String(row.cells[key].sig),
      }]),
    ),
  }));
}

const parseNum = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
};

/**
 * Convert editable rows to typed SheetRows, computing forces from the
 * selected options. Rows without a standard or with an empty cal point are
 * the caller's responsibility to validate first.
 */
export function editableToRows(
  rows: EditableRow[],
  optionsByKey: Map<string, StandardOption>,
  readingUnit: ForceUnit,
): SheetRow[] {
  return rows.map((row) => {
    const option = optionsByKey.get(row.standardKey);
    return {
      calPoint: parseNum(row.calPoint) ?? 0,
      standardEquipmentId: option?.equipmentId ?? '',
      equationId: option?.equationId ?? '',
      cells: Object.fromEntries(
        SERIES.map(({ key }) => {
          const sig = parseNum(row.cells[key].sig);
          return [key, {
            uuc: parseNum(row.cells[key].uuc),
            sig,
            force: option ? computeForce(option.equation, sig, readingUnit) : null,
          }];
        }),
      ) as SheetRow['cells'],
    };
  });
}

/** Distinct standard keys actually used by rows, in first-use order. */
export function usedStandardKeys(rows: EditableRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (row.standardKey && !seen.has(row.standardKey)) {
      seen.add(row.standardKey);
      out.push(row.standardKey);
    }
  }
  return out;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface DraftForValidation {
  envStandardId: string;
  env: { t: string; h: string }[];
  rows: EditableRow[];
  amendmentReason?: string;
  isAmendment: boolean;
}

/** Returns an error message, or null when the draft is valid to save. */
export function validateDraft(draft: DraftForValidation): string | null {
  if (!draft.envStandardId) return 'Please select the Thermo-Hygrometer used to measure the environment';
  if (draft.env.length !== 3 || draft.env.some((r) => r.t.trim() === '' || r.h.trim() === '')) {
    return 'Please fill in all 3 rounds of Environment Condition before saving';
  }
  if (draft.env.some((r) => Number.isNaN(Number(r.t)) || Number.isNaN(Number(r.h)))) {
    return 'Environment Condition values must be numbers';
  }
  const rowsWithData = draft.rows.filter((row) =>
    SERIES.some(({ key }) => row.cells[key].sig.trim() !== ''),
  );
  if (rowsWithData.length === 0) return 'No measurement results yet — enter at least 1 STD-Signal value';
  if (rowsWithData.some((row) => !row.standardKey)) return 'Every row with a measurement must have a reference standard selected';
  if (rowsWithData.some((row) => row.calPoint.trim() === '' || Number.isNaN(Number(row.calPoint)))) {
    return 'Cal. Point must be a number on every row with a measurement';
  }
  if (draft.isAmendment && !(draft.amendmentReason ?? '').trim()) return 'Please state a reason for the amendment';
  return null;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function fmtForce(v: number | null | undefined, dp: number): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(d?: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function shortId(id: string): string {
  return `#${id.slice(-6)}`;
}

/** Resolve a saved row's standard snapshot from the sheet's snapshot list. */
export function snapshotForRow(
  sheet: CalibrationRawDataSheet | CalibrationRawDataSheetInput,
  row: SheetRow,
): StandardSnapshot | undefined {
  return sheet.standards.find(
    (s) => s.equipmentId === row.standardEquipmentId && s.equationId === row.equationId,
  );
}
