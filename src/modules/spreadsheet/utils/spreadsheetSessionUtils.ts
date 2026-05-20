/**
 * Single top-layer load/serialize for all spreadsheet contexts (equipment, template, standalone).
 * Use these everywhere so document handling is consistent across the app.
 */

import type { TREBDocument } from '@trebco/treb';
import { normalizeTrebDocumentForLoad } from './trebDocumentUtils';

/**
 * Load and normalize a TREB document from any source (equipment, template, Firestore).
 * Call this once when opening a spreadsheet so display and dates are consistent.
 */
export function loadDocumentForSpreadsheet(doc: TREBDocument | null | undefined): TREBDocument | null {
  if (doc == null || typeof doc !== 'object') return null;
  return normalizeTrebDocumentForLoad(doc);
}

/**
 * Serialize TREB document for storage. Use the same shape for equipment and templates
 * so persistence and re-load are consistent.
 */
export function serializeDocumentForStorage(doc: TREBDocument | null | undefined): TREBDocument | null {
  if (doc == null || typeof doc !== 'object') return null;
  return normalizeTrebDocumentForLoad(doc);
}
