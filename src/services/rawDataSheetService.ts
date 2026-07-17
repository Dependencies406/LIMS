/**
 * rawDataSheetService.ts
 *
 * Calibration raw-data sheets for the Data Recorder module.
 * Firestore path: rawDataSheets/{id}   (top-level collection)
 *
 * APPEND-ONLY BY DESIGN (audit trail):
 *   - Sheets are never updated or deleted; this service intentionally has no
 *     update/delete methods, and firestore.rules denies update/delete too.
 *   - Corrections are new "amendment" sheets whose `amends` field references
 *     the original sheet's document ID, with a mandatory amendmentReason.
 *   - Every sheet stores recorder identity and a serverTimestamp createdAt.
 *
 * Each sheet snapshots the reference standards/equations and thermo-hygrometer
 * used, so saved records stay audit-true after later recalibrations.
 */

import type { CalibrationRawDataSheet, CalibrationRawDataSheetInput } from '../types';
import {
  db,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
  Timestamp,
} from './firebase';
// Not re-exported by ./firebase; imported directly to avoid modifying it
// (integration points for this feature are fixed by design).
import { startAfter, writeBatch, documentId } from 'firebase/firestore';
import type { QueryDocumentSnapshot, QueryConstraint } from 'firebase/firestore';

export const RAW_DATA_SHEET_SCHEMA_VERSION = 1;

const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 500;
const IMPORT_BATCH_SIZE = 500;
const ID_QUERY_CHUNK = 30; // Firestore 'in' query limit

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDate(v: unknown): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  return new Date(v as string);
}

/** Firestore rejects `undefined` values; JSON round-trip drops them (keeps null). */
function stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function mapSheet(id: string, data: Record<string, unknown>): CalibrationRawDataSheet {
  return {
    ...(data as unknown as CalibrationRawDataSheet),
    id,
    createdAt: toDate(data.createdAt),
  };
}

function sheetsCol() {
  return collection(db, 'rawDataSheets');
}

export interface SheetPageFilter {
  jobId?: string;
  requestNo?: string;
  kind?: 'original' | 'amendment';
}

export interface SheetPage {
  sheets: CalibrationRawDataSheet[];
  /** Opaque cursor for the next page; undefined when this was the last page. */
  nextCursor?: QueryDocumentSnapshot;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const rawDataSheetService = {
  /**
   * Append a new ORIGINAL sheet. Returns the new document ID.
   * kind/amends are forced here so a caller cannot sneak in a fake amendment.
   */
  async add(input: CalibrationRawDataSheetInput): Promise<string> {
    const payload = stripUndefined({
      ...input,
      kind: 'original',
      amends: null,
      schemaVersion: RAW_DATA_SHEET_SCHEMA_VERSION,
    });
    const ref = await addDoc(sheetsCol(), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  /**
   * Append an AMENDMENT sheet referencing an existing original.
   * The original document is never touched. Throws if the original does not
   * exist or the amendment reason is empty.
   */
  async amend(originalId: string, input: CalibrationRawDataSheetInput): Promise<string> {
    const reason = (input.amendmentReason ?? '').trim();
    if (!reason) throw new Error('amendmentReason is required for amendments');
    const origSnap = await getDoc(doc(sheetsCol(), originalId));
    if (!origSnap.exists()) throw new Error(`original sheet not found: ${originalId}`);
    const payload = stripUndefined({
      ...input,
      kind: 'amendment',
      amends: originalId,
      amendmentReason: reason,
      schemaVersion: RAW_DATA_SHEET_SCHEMA_VERSION,
    });
    const ref = await addDoc(sheetsCol(), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  /**
   * Cursor-paginated listing, newest first. Never subscribes to the whole
   * collection — retention is unbounded (design R6).
   */
  async getPage(filter: SheetPageFilter = {}, cursor?: QueryDocumentSnapshot): Promise<SheetPage> {
    const constraints: QueryConstraint[] = [];
    if (filter.jobId) constraints.push(where('jobId', '==', filter.jobId));
    if (filter.requestNo) constraints.push(where('requestNo', '==', filter.requestNo));
    if (filter.kind) constraints.push(where('kind', '==', filter.kind));
    constraints.push(orderBy('createdAt', 'desc'));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(PAGE_SIZE));
    const snap = await getDocs(query(sheetsCol(), ...constraints));
    const sheets = snap.docs.map((d) => mapSheet(d.id, d.data() as Record<string, unknown>));
    return {
      sheets,
      nextCursor: snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1] : undefined,
    };
  },

  /** Fetch one sheet by document ID. */
  async getById(id: string): Promise<CalibrationRawDataSheet | null> {
    const snap = await getDoc(doc(sheetsCol(), id));
    return snap.exists() ? mapSheet(snap.id, snap.data() as Record<string, unknown>) : null;
  },

  /** All amendments referencing the given sheet, oldest first. */
  async getAmendmentsOf(id: string): Promise<CalibrationRawDataSheet[]> {
    const snap = await getDocs(
      query(sheetsCol(), where('amends', '==', id), orderBy('createdAt', 'asc')),
    );
    return snap.docs.map((d) => mapSheet(d.id, d.data() as Record<string, unknown>));
  },

  /**
   * Fetch the entire collection in pages (for JSON export).
   * Ordered by createdAt asc for a stable scan; onProgress reports the running count.
   */
  async exportAll(onProgress?: (count: number) => void): Promise<CalibrationRawDataSheet[]> {
    const out: CalibrationRawDataSheet[] = [];
    let cursor: QueryDocumentSnapshot | undefined;
    for (;;) {
      const constraints: QueryConstraint[] = [orderBy('createdAt', 'asc')];
      if (cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(EXPORT_PAGE_SIZE));
      const snap = await getDocs(query(sheetsCol(), ...constraints));
      snap.docs.forEach((d) => out.push(mapSheet(d.id, d.data() as Record<string, unknown>)));
      onProgress?.(out.length);
      if (snap.docs.length < EXPORT_PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    return out;
  },

  /**
   * Import sheets from a parsed export file, PRESERVING document IDs so
   * amendment links survive. Sheets whose ID already exists are skipped
   * (idempotent re-import). createdAt is restored from the file — required
   * for lossless round-trip (design trade-off #2).
   */
  async importSheets(
    sheets: CalibrationRawDataSheet[],
  ): Promise<{ imported: number; skipped: number }> {
    // Find which IDs already exist (chunked documentId 'in' queries).
    const existing = new Set<string>();
    for (let i = 0; i < sheets.length; i += ID_QUERY_CHUNK) {
      const ids = sheets.slice(i, i + ID_QUERY_CHUNK).map((s) => s.id);
      const snap = await getDocs(query(sheetsCol(), where(documentId(), 'in', ids)));
      snap.docs.forEach((d) => existing.add(d.id));
    }

    const toWrite = sheets.filter((s) => !existing.has(s.id));
    for (let i = 0; i < toWrite.length; i += IMPORT_BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const sheet of toWrite.slice(i, i + IMPORT_BATCH_SIZE)) {
        const { id, createdAt, ...rest } = sheet;
        batch.set(doc(sheetsCol(), id), {
          ...stripUndefined(rest),
          createdAt: Timestamp.fromDate(toDate(createdAt)),
        });
      }
      await batch.commit();
    }
    return { imported: toWrite.length, skipped: existing.size };
  },
};
