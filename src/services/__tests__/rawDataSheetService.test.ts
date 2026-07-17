import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalibrationRawDataSheetInput, CalibrationRawDataSheet } from '../../types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const addDoc = vi.fn();
const getDoc = vi.fn();
const getDocs = vi.fn();
const updateDoc = vi.fn();
const deleteDoc = vi.fn();
const setDoc = vi.fn();
const batchSet = vi.fn();
const batchCommit = vi.fn();

vi.mock('../firebase', () => ({
  db: {},
  collection: vi.fn(() => 'SHEETS_COL'),
  doc: vi.fn((_col: unknown, id: string) => ({ id })),
  addDoc: (...a: unknown[]) => addDoc(...a),
  getDoc: (...a: unknown[]) => getDoc(...a),
  getDocs: (...a: unknown[]) => getDocs(...a),
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  deleteDoc: (...a: unknown[]) => deleteDoc(...a),
  setDoc: (...a: unknown[]) => setDoc(...a),
  query: (...a: unknown[]) => a,
  orderBy: (...a: unknown[]) => ({ orderBy: a }),
  where: (...a: unknown[]) => ({ where: a }),
  limit: (n: number) => ({ limit: n }),
  serverTimestamp: () => 'SERVER_TS',
  Timestamp: { fromDate: (d: Date) => ({ __timestamp: d.toISOString() }) },
}));

vi.mock('firebase/firestore', () => ({
  startAfter: (c: unknown) => ({ startAfter: c }),
  documentId: () => '__name__',
  writeBatch: () => ({ set: batchSet, commit: batchCommit }),
}));

import { rawDataSheetService } from '../rawDataSheetService';

// ─── Fixture ─────────────────────────────────────────────────────────────────

function sheetInput(overrides: Partial<CalibrationRawDataSheetInput> = {}): CalibrationRawDataSheetInput {
  return {
    kind: 'original',
    amends: null,
    jobId: 'job-1',
    requestNo: 'SCS-CAL-26024',
    calibrationDate: '2026-07-14',
    uuc: { equipmentName: 'Seat Belt Anchorage Testing Machine', readingUnit: 'N', resolution: 0.01 },
    calibrationRange: '4000-40000 N',
    direction: 'Tension',
    standards: [{
      equipmentId: 'CAL-FRC-004', equationId: 'eq1',
      code: 'CAL-FRC-004 — Tensile 10-100 kN', name: 'Force Transducer',
      equationName: 'Tensile 10-100 kN', degree: 3,
      coefficients: [0.0138, -0.0013, -125.015, 0], divisor: 1,
      inputUnit: 'mV/V', outputUnit: 'kN',
    }],
    envStandard: { equipmentId: 'CAL-THM-001', code: 'CAL-THM-001', name: 'Thermo Hygrometer' },
    env: [{ t: 25, h: 52 }, { t: 25, h: 49 }, { t: 25, h: 50 }],
    machineCondition: 'Normal',
    decimalPlaces: 2,
    rows: [{
      calPoint: 4000, standardEquipmentId: 'CAL-FRC-004', equationId: 'eq1',
      cells: {
        inc1: { uuc: 4000, sig: -0.03202, force: 4002.98 },
        inc2: { uuc: null, sig: null, force: null },
        inc3: { uuc: null, sig: null, force: null },
        dec3: { uuc: null, sig: null, force: null },
      },
    }],
    recordedByUid: 'uid-1',
    recordedByName: 'Nattawat Rooplor',
    schemaVersion: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  addDoc.mockResolvedValue({ id: 'new-sheet-1' });
});

// ─── Append-only invariant ───────────────────────────────────────────────────

describe('append-only invariant', () => {
  it('exposes no update/delete/mutating methods', () => {
    const keys = Object.keys(rawDataSheetService);
    for (const key of keys) {
      expect(key).not.toMatch(/update|delete|remove|set(?!tings)/i);
    }
    expect(keys.sort()).toEqual(
      ['add', 'amend', 'exportAll', 'getAmendmentsOf', 'getById', 'getPage', 'importSheets'].sort(),
    );
  });

  it('never calls updateDoc/deleteDoc/setDoc during add or amend', async () => {
    await rawDataSheetService.add(sheetInput());
    getDoc.mockResolvedValue({ exists: () => true });
    await rawDataSheetService.amend('orig-1', sheetInput({ amendmentReason: 'typo at 8000 N' }));
    expect(updateDoc).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });
});

// ─── add() ───────────────────────────────────────────────────────────────────

describe('add', () => {
  it('forces kind=original / amends=null and stamps serverTimestamp on createdAt only', async () => {
    const id = await rawDataSheetService.add(
      // even a hostile caller cannot sneak amendment fields through add()
      sheetInput({ kind: 'amendment', amends: 'someone-else' } as Partial<CalibrationRawDataSheetInput>),
    );
    expect(id).toBe('new-sheet-1');
    const payload = addDoc.mock.calls[0][1];
    expect(payload.kind).toBe('original');
    expect(payload.amends).toBeNull();
    expect(payload.createdAt).toBe('SERVER_TS');
    expect(payload.schemaVersion).toBe(1);
    expect(payload).not.toHaveProperty('updatedAt');
  });

  it('strips undefined optional fields (Firestore rejects undefined)', async () => {
    await rawDataSheetService.add(sheetInput({ receivedDate: undefined }));
    const payload = addDoc.mock.calls[0][1];
    expect('receivedDate' in payload).toBe(false);
    // null must survive (measurement cells use null for "-")
    expect(payload.rows[0].cells.dec3.sig).toBeNull();
  });
});

// ─── amend() ─────────────────────────────────────────────────────────────────

describe('amend', () => {
  it('creates a NEW doc referencing the original; original untouched', async () => {
    getDoc.mockResolvedValue({ exists: () => true });
    const id = await rawDataSheetService.amend('orig-42', sheetInput({
      amendmentReason: 'selected wrong standard on row 3',
    }));
    expect(id).toBe('new-sheet-1');
    const payload = addDoc.mock.calls[0][1];
    expect(payload.kind).toBe('amendment');
    expect(payload.amends).toBe('orig-42');
    expect(payload.amendmentReason).toBe('selected wrong standard on row 3');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('rejects an empty amendment reason', async () => {
    await expect(rawDataSheetService.amend('orig-42', sheetInput({ amendmentReason: '  ' })))
      .rejects.toThrow(/amendmentReason/);
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('rejects amending a non-existent sheet', async () => {
    getDoc.mockResolvedValue({ exists: () => false });
    await expect(rawDataSheetService.amend('ghost', sheetInput({ amendmentReason: 'x' })))
      .rejects.toThrow(/not found/);
    expect(addDoc).not.toHaveBeenCalled();
  });
});

// ─── importSheets() ──────────────────────────────────────────────────────────

describe('importSheets', () => {
  function savedSheet(id: string): CalibrationRawDataSheet {
    return { ...sheetInput(), id, createdAt: new Date('2026-07-10T03:00:00Z') };
  }

  it('preserves IDs, skips existing, restores createdAt from the file', async () => {
    // existence probe: only sheet-a already exists
    getDocs.mockResolvedValue({ docs: [{ id: 'sheet-a' }] });
    batchCommit.mockResolvedValue(undefined);

    const result = await rawDataSheetService.importSheets([savedSheet('sheet-a'), savedSheet('sheet-b')]);

    expect(result).toEqual({ imported: 1, skipped: 1 });
    expect(batchSet).toHaveBeenCalledTimes(1);
    const [ref, payload] = batchSet.mock.calls[0];
    expect(ref.id).toBe('sheet-b');
    expect(payload.createdAt).toEqual({ __timestamp: '2026-07-10T03:00:00.000Z' });
    expect(payload).not.toHaveProperty('id');
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when every ID already exists (idempotent re-import)', async () => {
    getDocs.mockResolvedValue({ docs: [{ id: 'sheet-a' }, { id: 'sheet-b' }] });
    const result = await rawDataSheetService.importSheets([savedSheet('sheet-a'), savedSheet('sheet-b')]);
    expect(result).toEqual({ imported: 0, skipped: 2 });
    expect(batchSet).not.toHaveBeenCalled();
    expect(batchCommit).not.toHaveBeenCalled();
  });
});
