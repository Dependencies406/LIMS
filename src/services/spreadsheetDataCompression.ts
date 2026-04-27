/**
 * Compress/decompress equipment spreadsheet data for Firestore storage.
 * Large fields (trebDocument, computedGrids, spreadsheetModel) are stored as compressed
 * strings when saving; decompressed on load so the rest of the app sees the usual shape.
 */

import type { EquipmentSpreadsheetData } from '../types';
import { compressJson, decompressJson } from '../utils/compression';

/** Stored shape when compressed: _*Compressed strings and _compressed flag. Original fields omitted. */
export type CompressedSpreadsheetData = Omit<EquipmentSpreadsheetData, 'trebDocument' | 'computedGrids' | 'spreadsheetModel'> & {
  _trebDocumentCompressed?: string;
  _computedGridsCompressed?: string;
  _spreadsheetModelCompressed?: string;
  _compressed?: boolean;
};

/**
 * Prepare spreadsheetData for Firestore: compress trebDocument, computedGrids, and spreadsheetModel
 * into _*Compressed strings, set _compressed: true, and omit the originals so the document is smaller.
 */
export function compressSpreadsheetDataForFirestore(
  data: EquipmentSpreadsheetData | undefined | null
): EquipmentSpreadsheetData | undefined | null {
  if (data == null) return data;
  const dataAny = data as unknown as Record<string, unknown>;
  if (dataAny._compressed === true) return data;
  const out = { ...data } as unknown as Record<string, unknown>;
  let hasCompressed = false;

  if (data.trebDocument != null && typeof data.trebDocument === 'object') {
    out._trebDocumentCompressed = compressJson(data.trebDocument);
    delete out.trebDocument;
    hasCompressed = true;
  }
  if (data.computedGrids != null && typeof data.computedGrids === 'object') {
    out._computedGridsCompressed = compressJson(data.computedGrids);
    delete out.computedGrids;
    hasCompressed = true;
  }
  if (data.spreadsheetModel != null && typeof data.spreadsheetModel === 'object') {
    out._spreadsheetModelCompressed = compressJson(data.spreadsheetModel);
    delete out.spreadsheetModel;
    hasCompressed = true;
  }

  if (hasCompressed) {
    out._compressed = true;
  }
  return out as unknown as EquipmentSpreadsheetData;
}

/**
 * Restore spreadsheetData from Firestore: if _compressed, decompress _*Compressed fields
 * into trebDocument, computedGrids, spreadsheetModel, then remove _* and _compressed.
 * If not compressed, return data as-is (backward compatibility).
 */
export function decompressSpreadsheetDataFromFirestore(data: unknown): EquipmentSpreadsheetData | undefined | null {
  if (data == null) return data as undefined | null;
  const d = data as Record<string, unknown>;
  if (d._compressed !== true) {
    return data as EquipmentSpreadsheetData;
  }
  const out: Record<string, unknown> = { ...d };

  if (typeof d._trebDocumentCompressed === 'string') {
    out.trebDocument = decompressJson(d._trebDocumentCompressed);
    delete out._trebDocumentCompressed;
  }
  if (typeof d._computedGridsCompressed === 'string') {
    out.computedGrids = decompressJson(d._computedGridsCompressed);
    delete out._computedGridsCompressed;
  }
  if (typeof d._spreadsheetModelCompressed === 'string') {
    out.spreadsheetModel = decompressJson(d._spreadsheetModelCompressed);
    delete out._spreadsheetModelCompressed;
  }
  delete out._compressed;
  return out as unknown as EquipmentSpreadsheetData;
}

/**
 * Decompress spreadsheetData for every equipment item on a job (mutates job.equipment).
 * Call once after loading a job (from main doc or after hydrating from subcollection).
 */
export function decompressJobEquipmentSpreadsheetData(
  job: { equipment?: Array<{ spreadsheetData?: unknown }> }
): void {
  if (!job.equipment?.length) return;
  for (let i = 0; i < job.equipment.length; i++) {
    const sd = job.equipment[i].spreadsheetData;
    if (sd != null) {
      job.equipment[i].spreadsheetData = decompressSpreadsheetDataFromFirestore(sd) ?? sd;
    }
  }
}
