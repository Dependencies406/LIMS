/**
 * data-recorder-types.ts
 *
 * RESERVED — moved out of src/types/index.ts when the Data Recorder module
 * was pulled from the active app for a from-scratch redesign. Preserved
 * verbatim (not deleted) so the prior implementation can be referenced or
 * restored. See recorder-reserved/ at the project root for the rest of the
 * module (components, hooks, services, docs).
 */

// ─── Data Recorder (Calibration Raw Data Sheets) ──────────────────────────────

/** Force units supported by the recorder's unit handler. */
export type ForceUnit = 'N' | 'kN' | 'kgf' | 'gf';

/** 'original' = first recording; 'amendment' = correction referencing a prior sheet. */
export type SheetKind = 'original' | 'amendment';

export type CalDirection = 'Tension' | 'Compression';

/** Measurement series columns, matching the ISO 7500-1 raw-data workbook layout. */
export type SeriesKey = 'inc1' | 'inc2' | 'inc3' | 'dec3';

export interface MeasurementCell {
  /** UUC reading, in the sheet's uuc.readingUnit. */
  uuc: number | null;
  /** Reference standard indicator signal (mV/V) — the raw source of truth. */
  sig: number | null;
  /** Computed at save: convertForce(evaluate(equation, sig), equation.outputUnit, readingUnit). */
  force: number | null;
}

export interface SheetRow {
  calPoint: number;
  /** Reference-standard equipment doc ID (equipmentControl collection). */
  standardEquipmentId: string;
  /** conversionEquations doc ID under that equipment. */
  equationId: string;
  /**
   * Keyed by series key. Widened from SeriesKey to string so sheet types
   * other than force-iso7500-1 can define their own series layout via
   * SheetTypeDefinition.series — see sheetTypeDefinitionService.ts.
   */
  cells: Record<string, MeasurementCell>;
}

// ─── Sheet Type Definitions (generalizes the recorder beyond force/ISO 7500-1) ─

export type SheetFieldType = 'text' | 'number' | 'select' | 'date';

/** One admin-configurable header field on a generic (non-force) sheet type. */
export interface SheetFieldDef {
  key: string;
  label: string;
  type: SheetFieldType;
  required?: boolean;
  /** Choices when type === 'select'. */
  options?: string[];
}

/** One measurement series/column on a sheet type — generalizes SeriesKey. */
export interface SheetSeriesDef {
  key: string;
  label: string;
  direction: 'increasing' | 'decreasing';
  order: number;
}

/**
 * Admin-editable description of a sheet type's shape: header fields, series
 * layout, and environment-round count. 'force-iso7500-1' has a seed
 * definition mirroring its existing fixed shape (SERIES in sheetLogic.ts,
 * env: EnvRound[3]) so existing documents need no migration — see
 * sheetTypeDefinitionService.ts.
 */
export interface SheetTypeDefinition {
  id: string;
  displayName: string;
  headerFields: SheetFieldDef[];
  series: SheetSeriesDef[];
  envRounds: number;
  schemaVersion: number;
}

/** Audit snapshot of one reference standard + equation exactly as used at save time. */
export interface StandardSnapshot {
  equipmentId: string;
  equationId: string;
  /** Display label, e.g. "CAL-FRC-004 — Tensile 10-100 kN". */
  code: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  dueDate?: string;                // ISO date (mirrors EquipmentRecord.nextCalibrationDate)
  equationName: string;
  degree: number;
  /** Coefficient values, highest power first (same order conversionEquationService.evaluate uses). */
  coefficients: number[];
  divisor: number;
  inputUnit: string;
  outputUnit: string;
  /** Uncertainty parameters (%) from the equation at save time — absent on sheets recorded before D7. */
  uCal?: number;
  uA?: number;
  uB?: number;
  uC?: number;
}

/** Thermo-hygrometer used for the environment readings — required on every sheet. */
export interface EnvStandardSnapshot {
  equipmentId: string;
  code: string;                    // equipment ID, e.g. CAL-THM-001
  name: string;
  serial?: string;
  range?: string;
  dueDate?: string;                // ISO date
}

export interface EnvRound {
  t: number;                       // temperature °C
  h: number;                       // relative humidity %RH
}

export interface CalibrationRawDataSheet {
  id: string;
  /**
   * Calibration work type discriminator. Absent on early documents — readers
   * must default to 'force-iso7500-1' (see rawDataSheetService.mapSheet).
   * Future work types (temperature, pressure, torque, …) add their own value
   * and register a payload editor/renderer in the data-recorder module.
   */
  sheetType?: string;
  kind: SheetKind;
  /** Original sheet ID when kind === 'amendment'; null for originals. */
  amends: string | null;
  /** Required free-text reason when kind === 'amendment'. */
  amendmentReason?: string;
  jobId: string | null;
  requestNo: string;               // e.g. SCS-CAL-26024
  receivedDate?: string;           // ISO date
  calibrationDate: string;         // ISO date
  uuc: {
    equipmentName: string;
    manufacturer?: string;
    model?: string;
    serial?: string;
    readingUnit: ForceUnit;
    resolution?: number;
  };
  calibrationRange: string;
  direction: CalDirection;
  /** Snapshots of every standard/equation the rows actually use (derived, stamped at save). */
  standards: StandardSnapshot[];
  envStandard: EnvStandardSnapshot;
  /** Exactly 3 rounds, all required before save. */
  env: EnvRound[];
  machineCondition: string;
  decimalPlaces: number;
  rows: SheetRow[];
  recordedByUid: string;
  recordedByName: string;
  /** serverTimestamp — authoritative audit write time. Sheets are never updated. */
  createdAt: Date;
  schemaVersion: number;
}

export type CalibrationRawDataSheetInput = Omit<CalibrationRawDataSheet, 'id' | 'createdAt'>;

/** One CMC scope step: cal points up to `toN` newtons use `cmcPercent`. */
export interface CmcScopeStep {
  toN: number;
  cmcPercent: number;
}

/**
 * Force CMC (Calibration and Measurement Capability) table, per ISO 7500-1
 * direction. Firestore doc: system/cmc.
 */
export interface CmcSettings {
  schemaVersion: number;
  directions: {
    tension: CmcScopeStep[];
    compression: CmcScopeStep[];
  };
}

/**
 * Append-only VOID marker: cancels a sheet without deleting it (R3).
 * Stored in its own collection (rawDataSheetVoids); the voided sheet document
 * is never touched. Voided sheets are hidden from the default list view but
 * remain in the audit trail and in exports.
 */
export interface SheetVoidRecord {
  id: string;
  sheetId: string;                 // the voided sheet's document ID
  reason: string;                  // required, like amendmentReason
  recordedByUid: string;
  recordedByName: string;
  createdAt: Date;                 // serverTimestamp
  schemaVersion: number;
}

export type SheetVoidRecordInput = Omit<SheetVoidRecord, 'id' | 'createdAt'>;
