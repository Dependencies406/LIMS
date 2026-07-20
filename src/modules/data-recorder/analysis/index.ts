/**
 * Public API of the Data Recorder analysis module (design §8c).
 *
 * Pure, deterministic computation over a saved calibration raw-data sheet.
 * Results are derived on demand and never stored on the sheet document.
 */

export * from './relativeError';
export * from './uncertaintyBudget';
export * from './studentT';
export * from './numeric';
export * from './sheetAdapter';
