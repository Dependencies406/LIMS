/**
 * sheetTypeDefinitionService.ts
 *
 * Storage for admin-editable SheetTypeDefinitions — the generalized
 * description of a data-recorder sheet's shape (header fields, series
 * layout, env-round count) that lets new analysis types be defined without
 * a code change. Firestore doc: sheetTypeDefinitions/{id} (read/write:
 * authenticated — see firestore.rules `match /sheetTypeDefinitions/{id}`).
 *
 * Same "seed on first read" pattern as analysisFormulaSetService.ts and
 * cmcService.get(): one mutable document per sheet type, seeded from the
 * registry below on first read and persisted from then on.
 */

import { db, doc, getDoc, setDoc, getDocs, collection } from './firebase';
import type { SheetTypeDefinition } from '../types';
import { FORCE_SHEET_TYPE, SERIES } from '../modules/data-recorder/sheetLogic';

const COLLECTION = 'sheetTypeDefinitions';

/**
 * Seed builders, keyed by sheetType id. 'force-iso7500-1' is hand-built to
 * exactly mirror today's fixed CalibrationRawDataSheet shape (SERIES from
 * sheetLogic.ts, 3 env rounds), so existing Firestore documents already
 * conform — no data migration needed. Adding a new sheet type is an
 * additive entry here, matching the seedFormulaSet.ts registry.
 */
const SEED_SHEET_TYPE_DEFINITIONS: Record<string, () => SheetTypeDefinition> = {
  [FORCE_SHEET_TYPE]: () => ({
    id: FORCE_SHEET_TYPE,
    displayName: 'Force — ISO 7500-1',
    headerFields: [
      { key: 'equipmentName', label: 'UUC Equipment Name', type: 'text', required: true },
      { key: 'manufacturer', label: 'Manufacturer', type: 'text' },
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'serial', label: 'Serial', type: 'text' },
      { key: 'readingUnit', label: 'Reading Unit', type: 'select', required: true, options: ['N', 'kN', 'kgf', 'gf'] },
      { key: 'resolution', label: 'Resolution', type: 'number' },
      { key: 'calibrationRange', label: 'Calibration Range', type: 'text', required: true },
      { key: 'direction', label: 'Direction', type: 'select', required: true, options: ['Tension', 'Compression'] },
      { key: 'machineCondition', label: 'Machine Condition', type: 'text', required: true },
    ],
    series: SERIES.map((s, i) => ({
      key: s.key,
      label: s.label,
      direction: s.group === 'inc' ? 'increasing' : 'decreasing',
      order: i,
    })),
    envRounds: 3,
    schemaVersion: 1,
  }),
};

export const sheetTypeDefinitionService = {
  /**
   * Load the SheetTypeDefinition for a sheetType id, seeding it from the
   * registry above (and persisting that seed) if no document exists yet.
   * New sheet types that have no seed entry are created via `set()` from
   * the admin editor, not via `get()` — an unknown, un-persisted id here
   * throws rather than silently materializing an empty definition.
   */
  async get(id: string): Promise<SheetTypeDefinition> {
    const docRef = doc(db, COLLECTION, id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as SheetTypeDefinition;
    }
    const build = SEED_SHEET_TYPE_DEFINITIONS[id];
    if (!build) {
      throw new Error(`No SheetTypeDefinition found or seeded for id '${id}'`);
    }
    const seeded = build();
    await setDoc(docRef, seeded);
    return seeded;
  },

  /** List every sheet type definition that has been persisted so far. */
  async list(): Promise<SheetTypeDefinition[]> {
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs.map((d) => d.data() as SheetTypeDefinition);
  },

  /** Create or overwrite the SheetTypeDefinition for a sheetType id. */
  async set(id: string, definition: SheetTypeDefinition): Promise<void> {
    await setDoc(doc(db, COLLECTION, id), definition);
  },
};
