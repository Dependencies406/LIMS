/**
 * sheetAdapter.ts
 *
 * Shapes a saved CalibrationRawDataSheet into the analysis module's plain
 * input object. Type-only import of the sheet types — no runtime coupling to
 * the rest of the app, so the analysis functions stay independently testable.
 *
 * Per D1 the analysis reads the STORED force per cell and never re-runs the
 * conversion; this adapter is the only place that knows the sheet's shape.
 */

import type {
  CalibrationRawDataSheet,
  CalibrationRawDataSheetInput,
} from '../../../types';
import type { RelativeErrorInput } from './relativeError';

type AnySheet = CalibrationRawDataSheet | CalibrationRawDataSheetInput;

/**
 * Build the relative-error input from a sheet.
 *
 * A sheet without `uuc.resolution` yields a = 0 (and therefore class 0.5 for
 * the resolution parameter); callers that display the result should say so
 * rather than implying the machine's resolution was assessed.
 */
export function relativeErrorInputFromSheet(sheet: AnySheet): RelativeErrorInput {
  return {
    points: sheet.rows.map((row) => ({
      calPoint: row.calPoint,
      forces: {
        inc1: row.cells.inc1.force,
        inc2: row.cells.inc2.force,
        inc3: row.cells.inc3.force,
        dec3: row.cells.dec3.force,
      },
    })),
    resolution: sheet.uuc.resolution ?? 0,
    decimalPlaces: sheet.decimalPlaces,
  };
}

/** The UUC reading unit, as the CMC lookup needs it. */
export function readingUnitFromSheet(sheet: AnySheet): string {
  return sheet.uuc.readingUnit;
}
