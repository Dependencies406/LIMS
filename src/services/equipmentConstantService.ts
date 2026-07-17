/**
 * equipmentConstantService.ts
 *
 * Manages named constants (k1, k2, k3, …) bound to an equipment record.
 * Firestore path: equipmentControl/{equipmentId}/constants/{id}
 *
 * Each constant stores:
 *   key        — "k1", "k2", "k3" … (auto-assigned, sequential)
 *   value      — parsed numeric value
 *   rawValue   — original string as typed by the user
 *   unit       — optional physical unit
 *   description — optional label / meaning
 *   notes      — optional free-text reference
 *
 * Note: legacy documents stored as "C1", "C2", "C3" are normalised to
 * "k1", "k2", "k3" at read time by normalizeKey() below.
 */

import type { EquipmentConstant, EquipmentConstantInput } from '../types';
import {
  db,
  collection,
  doc,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from './firebase';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalise a stored constant key to the canonical k{n} format.
 * Handles legacy documents saved as "C1", "C2", "C3" transparently.
 */
function normalizeKey(key: string): string {
  const m = key.match(/^[Cc](\d+)$/);
  return m ? `k${m[1]}` : key;
}

function toDate(v: unknown): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  return new Date(v as string);
}

function mapConstant(id: string, data: Record<string, unknown>): EquipmentConstant {
  return {
    id,
    key:         normalizeKey((data.key as string) || ''),
    value:       Number(data.value ?? 0),
    rawValue:    (data.rawValue as string) || String(data.value ?? '0'),
    unit:        data.unit as string | undefined,
    description: data.description as string | undefined,
    notes:       data.notes as string | undefined,
    createdAt:   toDate(data.createdAt),
    updatedAt:   toDate(data.updatedAt),
    createdBy:   (data.createdBy as string) || '',
  };
}

function constantsCol(equipmentId: string) {
  return collection(db, 'equipmentControl', equipmentId, 'constants');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const equipmentConstantService = {

  /**
   * Real-time listener — returns an unsubscribe function.
   * Results are ordered by createdAt ascending so C1 is always first.
   */
  subscribe(
    equipmentId: string,
    callback: (constants: EquipmentConstant[]) => void,
    onError?: (err: Error) => void,
  ): () => void {
    const q = query(constantsCol(equipmentId), orderBy('createdAt', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        const constants = snap.docs.map((d) =>
          mapConstant(d.id, d.data() as Record<string, unknown>)
        );
        callback(constants);
      },
      (err) => onError?.(err),
    );
  },

  /**
   * Add a new constant.
   * The caller must pass `key` (use `nextKey()` to compute it).
   * Returns the new Firestore document ID.
   */
  async add(equipmentId: string, input: EquipmentConstantInput): Promise<string> {
    const ref = await addDoc(constantsCol(equipmentId), {
      ...input,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  /** Delete a constant by document ID. */
  async delete(equipmentId: string, constantId: string): Promise<void> {
    await deleteDoc(doc(constantsCol(equipmentId), constantId));
  },

  /**
   * Given an existing list of constants, return the next sequential key.
   * e.g. [] → "k1", ["k1","k2"] → "k3", ["k1","k3"] → "k4" (fills after max)
   * Keys are already normalised (k{n}) by the time they reach this function.
   */
  nextKey(existing: EquipmentConstant[]): string {
    const nums = existing.map((c) => {
      const m = c.key.match(/^k(\d+)$/i);
      return m ? parseInt(m[1], 10) : 0;
    });
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `k${max + 1}`;
  },
};
