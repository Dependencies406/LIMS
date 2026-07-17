/**
 * rawDataSheetService.ts
 *
 * Calibration raw-data sheets for the Data Recorder module.
 * Firestore path: rawDataSheets/{id}   (top-level collection)
 *
 * APPEND-ONLY BY DESIGN (audit trail):
 *   - Sheets are never updated; there is no update method and firestore.rules
 *     denies updates.
 *   - Corrections are new "amendment" sheets whose `amends` field references
 *     the original sheet's document ID, with a mandatory amendmentReason.
 *   - Cancellation is a void marker (rawDataSheetVoids), not a deletion.
 *   - Every sheet stores recorder identity and a serverTimestamp createdAt.
 *   - EXCEPTION (owner decision 2026-07-14): deleteSheetPermanently() exists
 *     for admins only — firestore.rules restricts delete to role == 'admin',
 *     and deletion is refused while amendments reference the sheet.
 *
 * Each sheet snapshots the reference standards/equations and thermo-hygrometer
 * used, so saved records stay audit-true after later recalibrations.
 */

import type {
  CalibrationRawDataSheet,
  CalibrationRawDataSheetInput,
  SheetVoidRecord,
} from '../types';
import {
  db,
  collection,
  doc,
  addDoc,
  deleteDoc,
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

function voidsCol() {
  return collection(db, 'rawDataSheetVoids');
}

function mapVoid(id: string, data: Record<string, unknown>): SheetVoidRecord {
  return {
    ...(data as unknown as SheetVoidRecord),
    id,
    createdAt: toDate(data.createdAt),
  };
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
   * VOID a sheet: append a cancellation marker to rawDataSheetVoids.
   * The sheet document itself is never modified or deleted (R3). Requires a
   * reason and an existing, not-already-voided sheet.
   */
  async voidSheet(
    sheetId: string,
    reason: string,
    recordedByUid: string,
    recordedByName: string,
  ): Promise<string> {
    const trimmed = reason.trim();
    if (!trimmed) throw new Error('reason is required to void a sheet');
    const sheetSnap = await getDoc(doc(sheetsCol(), sheetId));
    if (!sheetSnap.exists()) throw new Error(`sheet not found: ${sheetId}`);
    const existing = await getDocs(query(voidsCol(), where('sheetId', '==', sheetId)));
    if (!existing.empty) throw new Error('sheet is already voided');
    const ref = await addDoc(voidsCol(), {
      sheetId,
      reason: trimmed,
      recordedByUid,
      recordedByName,
      schemaVersion: RAW_DATA_SHEET_SCHEMA_VERSION,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  /**
   * ADMIN-ONLY hard delete (owner decision — relaxes R3 for admins).
   * firestore.rules is the real gate (delete requires role == 'admin');
   * this method additionally refuses to delete a sheet that amendments still
   * reference (delete the amendments first), and removes the sheet's void
   * marker so no orphan is left behind.
   */
  async deleteSheetPermanently(sheetId: string): Promise<void> {
    const snap = await getDoc(doc(sheetsCol(), sheetId));
    if (!snap.exists()) throw new Error(`sheet not found: ${sheetId}`);
    const amendments = await getDocs(
      query(sheetsCol(), where('amends', '==', sheetId), limit(1)),
    );
    if (!amendments.empty) {
      throw new Error('sheet has amendments referencing it; delete those first');
    }
    const voidSnap = await getDocs(query(voidsCol(), where('sheetId', '==', sheetId)));
    for (const voidDoc of voidSnap.docs) {
      await deleteDoc(doc(voidsCol(), voidDoc.id));
    }
    await deleteDoc(doc(sheetsCol(), sheetId));
  },

  /** Void markers for the given sheet IDs, keyed by sheetId (chunked 'in' queries). */
  async getVoidsForSheets(sheetIds: string[]): Promise<Map<string, SheetVoidRecord>> {
    const out = new Map<string, SheetVoidRecord>();
    for (let i = 0; i < sheetIds.length; i += ID_QUERY_CHUNK) {
      const ids = sheetIds.slice(i, i + ID_QUERY_CHUNK);
      if (ids.length === 0) continue;
      const snap = await getDocs(query(voidsCol(), where('sheetId', 'in', ids)));
      snap.docs.forEach((d) => {
        const record = mapVoid(d.id, d.data() as Record<string, unknown>);
        out.set(record.sheetId, record);
      });
    }
    return out;
  },

  /** Fetch every void marker (for JSON export), oldest first. */
  async exportAllVoids(): Promise<SheetVoidRecord[]> {
    const out: SheetVoidRecord[] = [];
    let cursor: QueryDocumentSnapshot | undefined;
    for (;;) {
      const constraints: QueryConstraint[] = [orderBy('createdAt', 'asc')];
      if (cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(EXPORT_PAGE_SIZE));
      const snap = await getDocs(query(voidsCol(), ...constraints));
      snap.docs.forEach((d) => out.push(mapVoid(d.id, d.data() as Record<string, unknown>)));
      if (snap.docs.length < EXPORT_PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    return out;
  },

  /** Import void markers, preserving IDs and skipping existing (idempotent). */
  async importVoids(voids: SheetVoidRecord[]): Promise<{ imported: number; skipped: number }> {
    const existing = new Set<string>();
    for (let i = 0; i < voids.length; i += ID_QUERY_CHUNK) {
      const ids = voids.slice(i, i + ID_QUERY_CHUNK).map((v) => v.id);
      if (ids.length === 0) continue;
      const snap = await getDocs(query(voidsCol(), where(documentId(), 'in', ids)));
      snap.docs.forEach((d) => existing.add(d.id));
    }
    const toWrite = voids.filter((v) => !existing.has(v.id));
    for (let i = 0; i < toWrite.length; i += IMPORT_BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const record of toWrite.slice(i, i + IMPORT_BATCH_SIZE)) {
        const { id, createdAt, ...rest } = record;
        batch.set(doc(voidsCol(), id), {
          ...stripUndefined(rest),
          createdAt: Timestamp.fromDate(toDate(createdAt)),
        });
      }
      await batch.commit();
    }
    return { imported: toWrite.length, skipped: existing.size };
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
