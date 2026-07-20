/**
 * conversionEquationService.ts
 *
 * Manages polynomial conversion equations attached to equipment records.
 * Firestore path: equipmentControl/{equipmentId}/conversionEquations/{id}
 *
 * These equations are accessible by any future part of the app that needs
 * to convert raw sensor readings to calibrated output values.
 */

import type { ConversionEquation, ConversionEquationInput, EquationCoefficient } from '../types';
import {
  db,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from './firebase';

// ─── Firestore mapper ────────────────────────────────────────────────────────

function toDate(v: unknown): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  return new Date(v as string);
}

function mapCoefficient(raw: unknown): EquationCoefficient {
  if (raw && typeof raw === 'object') {
    const c = raw as Record<string, unknown>;
    return {
      value: Number(c.value ?? 0),
      inputMode: (c.inputMode as 'decimal' | 'scientific') ?? 'decimal',
      raw: String(c.raw ?? c.value ?? '0'),
    };
  }
  // legacy: plain number stored directly
  const n = Number(raw ?? 0);
  return { value: n, inputMode: 'decimal', raw: String(n) };
}

function mapEquation(id: string, data: Record<string, unknown>): ConversionEquation {
  const rawCoeffs = Array.isArray(data.coefficients) ? data.coefficients : [];
  return {
    id,
    name: (data.name as string) || '',
    inputUnit: (data.inputUnit as string) || '',
    outputUnit: (data.outputUnit as string) || '',
    degree: Number(data.degree ?? 1),
    coefficients: rawCoeffs.map(mapCoefficient),
    divisor: Number(data.divisor ?? 1),
    notes: data.notes as string | undefined,
    uCal: data.uCal !== undefined ? Number(data.uCal) : undefined,
    uA: data.uA !== undefined ? Number(data.uA) : undefined,
    uB: data.uB !== undefined ? Number(data.uB) : undefined,
    uC: data.uC !== undefined ? Number(data.uC) : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    createdBy: (data.createdBy as string) || '',
  };
}

// ─── Collection helper ───────────────────────────────────────────────────────

function equationsCol(equipmentId: string) {
  return collection(db, 'equipmentControl', equipmentId, 'conversionEquations');
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const conversionEquationService = {
  /** Real-time listener — returns an unsubscribe function. */
  subscribe(
    equipmentId: string,
    callback: (equations: ConversionEquation[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const q = query(equationsCol(equipmentId), orderBy('createdAt', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        const equations = snap.docs.map((d) =>
          mapEquation(d.id, d.data() as Record<string, unknown>)
        );
        callback(equations);
      },
      (err) => onError?.(err)
    );
  },

  /** Fetch all equations for an equipment record (one-shot). */
  async getAll(equipmentId: string): Promise<ConversionEquation[]> {
    const q = query(equationsCol(equipmentId), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapEquation(d.id, d.data() as Record<string, unknown>));
  },

  /** Add a new equation. Returns the new document ID. */
  async add(equipmentId: string, input: ConversionEquationInput): Promise<string> {
    const ref = await addDoc(equationsCol(equipmentId), {
      ...input,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  /** Update an existing equation. */
  async update(
    equipmentId: string,
    equationId: string,
    data: Partial<ConversionEquationInput>
  ): Promise<void> {
    await updateDoc(doc(equationsCol(equipmentId), equationId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  /** Delete an equation. */
  async delete(equipmentId: string, equationId: string): Promise<void> {
    await deleteDoc(doc(equationsCol(equipmentId), equationId));
  },

  /**
   * Evaluate an equation for a given input value.
   * output = (A·xⁿ + B·xⁿ⁻¹ + … + constant) / divisor
   */
  evaluate(equation: ConversionEquation, inputValue: number): number {
    const { coefficients, degree, divisor } = equation;
    let numerator = 0;
    for (let i = 0; i <= degree; i++) {
      const coeff = coefficients[i]?.value ?? 0;
      const power = degree - i;
      numerator += coeff * Math.pow(inputValue, power);
    }
    return divisor !== 0 ? numerator / divisor : numerator;
  },
};
