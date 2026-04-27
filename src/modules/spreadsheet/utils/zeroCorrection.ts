import { generateCellId, type SpreadsheetModel } from '../models/SpreadsheetModel';

export interface CellEvaluationSnapshot {
  value: unknown;
  displayValue: string;
  error?: string;
}

export interface ZeroCorrectionColumnIndexes {
  round: number;
  reading: number;
  genericZero: number;
  zeroByRound: Map<number, number>;
}

export interface RowZeroCorrectionResult {
  rowIndex: number;
  roundId: number;
  rawValue: number;
  zeroValue: number;
  finalValue: number;
  readingColumnIndex: number;
}

const ROUND_ALIASES = [
  'round',
  'roundno',
  'round_no',
  'roundid',
  'replicate',
  'replicateindex',
  'replicate_index',
];

const READING_ALIASES = [
  'reading_val',
  'reading',
  'raw',
  'rawreading',
  'raw_value',
  'value',
];

const GENERIC_ZERO_ALIASES = ['zero', 'zerovalue', 'zero_value', 'globalzero', 'zero_global'];

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toNumberOrZero(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const parsed = Number.parseFloat(String(value).trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function findColumnIndexByAliases(
  normalizedColumnKeys: string[][],
  aliases: string[]
): number {
  const normalizedAliases = aliases.map(normalizeKey);
  for (let index = 0; index < normalizedColumnKeys.length; index += 1) {
    const keySet = normalizedColumnKeys[index];
    if (keySet.some((key) => normalizedAliases.includes(key))) {
      return index;
    }
  }
  return -1;
}

function getCellValueForRow(
  spreadsheet: SpreadsheetModel,
  rowIndex: number,
  columnIndex: number,
  evaluationResults?: Map<string, CellEvaluationSnapshot>
): unknown {
  if (columnIndex < 0) {
    return undefined;
  }
  const cellId = generateCellId(rowIndex, columnIndex);
  const evalResult = evaluationResults?.get(cellId);
  if (evalResult && !evalResult.error) {
    if (evalResult.value !== null && evalResult.value !== undefined) {
      return evalResult.value;
    }
    if (evalResult.displayValue !== undefined && evalResult.displayValue !== '') {
      return evalResult.displayValue;
    }
  }
  const cell = spreadsheet.cells?.get(cellId);
  if (!cell) {
    return undefined;
  }
  if (cell.rawValue !== null && cell.rawValue !== undefined && cell.rawValue !== '') {
    return cell.rawValue;
  }
  if (cell.displayValue !== undefined && cell.displayValue !== '') {
    return cell.displayValue;
  }
  return undefined;
}

export function resolveZeroCorrectionColumnIndexes(
  spreadsheet: SpreadsheetModel
): ZeroCorrectionColumnIndexes | null {
  const columnCount = spreadsheet.columnOrder?.length || spreadsheet.columnCount || 0;
  if (columnCount <= 0) {
    return null;
  }

  const normalizedColumnKeys: string[][] = [];
  for (let col = 0; col < columnCount; col += 1) {
    const columnName = spreadsheet.columnOrder?.[col] || '';
    const colDef = columnName && spreadsheet.columnDefinitions
      ? spreadsheet.columnDefinitions.get(columnName)
      : undefined;
    const candidates = [columnName, colDef?.name, colDef?.columnValue]
      .filter((value): value is string => !!value && value.trim() !== '')
      .map(normalizeKey);
    normalizedColumnKeys[col] = candidates;
  }

  const round = findColumnIndexByAliases(normalizedColumnKeys, ROUND_ALIASES);
  const reading = findColumnIndexByAliases(normalizedColumnKeys, READING_ALIASES);
  const genericZero = findColumnIndexByAliases(normalizedColumnKeys, GENERIC_ZERO_ALIASES);

  if ([round, reading].some((index) => index < 0)) {
    return null;
  }

  const zeroByRound = new Map<number, number>();
  for (let col = 0; col < normalizedColumnKeys.length; col += 1) {
    const keys = normalizedColumnKeys[col];
    for (const key of keys) {
      // Match:
      // - zero_r5        -> zeror5
      // - zero_round_5   -> zeroround5
      // - zero5          -> zero5
      const directRoundMatch = key.match(/^zeror(\d+)$/);
      const roundWordMatch = key.match(/^zeroround(\d+)$/);
      const compactMatch = key.match(/^zero(\d+)$/);
      const match = directRoundMatch || roundWordMatch || compactMatch;
      if (match) {
        const roundId = Number.parseInt(match[1], 10);
        if (Number.isFinite(roundId) && roundId > 0 && !zeroByRound.has(roundId)) {
          zeroByRound.set(roundId, col);
        }
      }
    }
  }

  return { round, reading, genericZero, zeroByRound };
}

export function computeRowZeroCorrection(
  spreadsheet: SpreadsheetModel,
  rowIndex: number,
  indexes: ZeroCorrectionColumnIndexes | null,
  evaluationResults?: Map<string, CellEvaluationSnapshot>
): RowZeroCorrectionResult | null {
  if (!indexes) {
    return null;
  }

  const roundRaw = getCellValueForRow(spreadsheet, rowIndex, indexes.round, evaluationResults);
  const roundId = Math.round(toNumberOrZero(roundRaw));
  if (!Number.isFinite(roundId) || roundId <= 0) {
    return null;
  }

  const rawReading = getCellValueForRow(spreadsheet, rowIndex, indexes.reading, evaluationResults);
  const rawValue = toNumberOrZero(rawReading);

  const zeroColumnIndex = indexes.zeroByRound.get(roundId) ?? indexes.genericZero;
  const zeroInput = getCellValueForRow(spreadsheet, rowIndex, zeroColumnIndex, evaluationResults);

  const zeroValue = toNumberOrZero(zeroInput);
  const finalValue = rawValue - zeroValue;

  return {
    rowIndex,
    roundId,
    rawValue,
    zeroValue,
    finalValue,
    readingColumnIndex: indexes.reading,
  };
}
