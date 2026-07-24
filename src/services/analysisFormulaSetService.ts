/**
 * analysisFormulaSetService.ts
 *
 * Storage for the Data Recorder analysis module's editable FormulaSets
 * (docs/FORMULA_ENGINE_DESIGN.md). Firestore doc: analysisFormulaSets/{sheetType}
 * (read/write: authenticated — see firestore.rules `match /analysisFormulaSets/{sheetType}`).
 *
 * Per design §2b, VERSIONING IS DEFERRED during initial development: this is
 * ONE MUTABLE document per sheetType, not the append-only versions/
 * subcollection + pointer-doc scheme §3 describes as the target end state.
 * An edit overwrites this document in place. Do not build the versions/
 * subcollection, admin-only write rule, or the sheet-level
 * analysisFormulaVersion pinning field until that follow-up session.
 */

import { db, doc, getDoc, setDoc } from './firebase';
import type { FormulaSet } from '../modules/data-recorder/analysis/formulaEngine';
import { generateSeedFormulaSet } from '../modules/data-recorder/analysis/formulaEngine';

const COLLECTION = 'analysisFormulaSets';

export const analysisFormulaSetService = {
  /**
   * Load the FormulaSet for a sheetType, initializing it from the seed
   * (generateSeedFormulaSet) and persisting that seed if no document exists
   * yet — same "seed on first read" pattern as cmcService.get().
   */
  async get(sheetType: string): Promise<FormulaSet> {
    const docRef = doc(db, COLLECTION, sheetType);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as FormulaSet;
    }
    const seeded = generateSeedFormulaSet(sheetType);
    await setDoc(docRef, seeded);
    return seeded;
  },

  /** Overwrite the FormulaSet for a sheetType. */
  async set(sheetType: string, formulaSet: FormulaSet): Promise<void> {
    await setDoc(doc(db, COLLECTION, sheetType), formulaSet);
  },
};
