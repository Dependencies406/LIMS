/**
 * Loader for the golden test oracle.
 *
 * Read through fs rather than a JSON import so the fixture needs no tsconfig
 * resolveJsonModule support and stays plain data.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type GoldenNumber = number | '-';

export interface GoldenCell {
  uuc: GoldenNumber;
  sig: GoldenNumber;
  force: GoldenNumber;
}

export interface GoldenRawRow {
  calPoint: number;
  inc1: GoldenCell;
  inc2: GoldenCell;
  inc3: GoldenCell;
  dec3: GoldenCell;
}

/** Relative Error sheet columns A..U, verbatim from the workbook. */
export type GoldenRelativeErrorRow = Record<string, GoldenNumber>;

/** Unc. Budget sheet columns A..P and R..V, verbatim from the workbook. */
export type GoldenBudgetRow = Record<string, number | string>;

export interface GoldenDirection {
  header: {
    uucReadingUnit: string;
    uucResolution: number;
    decimalPlaces: number;
    direction: string;
    standardKey: string;
    stdReadingUnit: string;
  };
  rawData: GoldenRawRow[];
  relativeError: GoldenRelativeErrorRow[];
  classTable: number[][];
  uncBudget: GoldenBudgetRow[];
  cmcCriteria: { direction: string; steps: { toN: number; cmc: number }[] };
}

export interface GoldenLcdbRow {
  EQUIPMENTS: string;
  'u_cal (%)': number | string;
  'A (%)': number | string;
  'B (%)': number | string;
  'C (%)': number | string;
}

export interface GoldenData {
  directions: { tension: GoldenDirection; compression: GoldenDirection };
  cmcTable: { compressive: { toN: number; cmc: number }[]; tensile: { toN: number; cmc: number }[] };
  lcdb: GoldenLcdbRow[];
}

const fixturePath = fileURLToPath(
  new URL('./fixtures/STAGE_D_GOLDEN_DATA.json', import.meta.url),
);

export const golden: GoldenData = JSON.parse(readFileSync(fixturePath, 'utf8'));

/** The LCDB entry a direction's sheet was calibrated against. */
export function lcdbFor(standardKey: string): GoldenLcdbRow {
  const row = golden.lcdb.find((r) => r.EQUIPMENTS === standardKey);
  if (!row) throw new Error(`LCDB entry not found for ${standardKey}`);
  return row;
}
