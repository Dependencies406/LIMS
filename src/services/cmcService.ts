/**
 * cmcService.ts
 *
 * Stage D Prerequisite B — the force CMC (Calibration and Measurement
 * Capability) scope table, per ISO 7500-1 direction. Firestore doc:
 * system/cmc (admin-write, authenticated-read — see firestore.rules
 * `match /system/{document}`, no rule change needed for this path).
 */

import { db, doc, getDoc, setDoc } from './firebase';
import type { CmcSettings } from '../types';

const CMC_SETTINGS_DOC = 'system/cmc';

export const CMC_SETTINGS_SCHEMA_VERSION = 1;

/** Seeded from STAGE_D_FORMULA_SPEC.md §4 (current scope of accreditation). */
export const DEFAULT_CMC_SETTINGS: CmcSettings = {
  schemaVersion: CMC_SETTINGS_SCHEMA_VERSION,
  directions: {
    tension: [
      { toN: 100, cmcPercent: 0.26 },
      { toN: 2000, cmcPercent: 0.21 },
      { toN: 247000, cmcPercent: 0.26 },
    ],
    compression: [
      { toN: 100, cmcPercent: 0.26 },
      { toN: 2000, cmcPercent: 0.59 },
      { toN: 247000, cmcPercent: 0.29 },
    ],
  },
};

export const cmcService = {
  /** Load the CMC table, initializing it with the spec's default scope if missing. */
  async get(): Promise<CmcSettings> {
    const docRef = doc(db, CMC_SETTINGS_DOC);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as CmcSettings;
    }
    await setDoc(docRef, DEFAULT_CMC_SETTINGS);
    return DEFAULT_CMC_SETTINGS;
  },

  /** Overwrite the CMC table. */
  async set(settings: CmcSettings): Promise<void> {
    const docRef = doc(db, CMC_SETTINGS_DOC);
    await setDoc(docRef, settings);
  },
};
