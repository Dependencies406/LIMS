/**
 * unitConversionRuleService.ts
 *
 * ADR-015 D2 — the shared, admin-managed conversion-rule library. One
 * top-level collection, reusable across every template, looked up at RENDER
 * time by `(fromUnit, toUnit)` — never bound to a column or template at
 * save time, which is what keeps this working through Phase 15's
 * `selectable`/`sameAs` header modes (D2's own rationale).
 *
 * Conventions follow `conversionEquationService.ts` exactly: exported
 * object literal, subscribe/getAll/add/update, `serverTimestamp()` on
 * write, a `toDate` mapper on read. Collection is top-level rather than a
 * subcollection (there is no single parent entity a shared rule belongs
 * to), matching `certificateNumberConfigService.ts`'s `COLLECTION_NAME`
 * pattern for that shape instead.
 */

import type { ConversionRule, ConversionRuleInput } from '../types';
import {
  db,
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from './firebase';
import { validateConversionRule } from './conversionRuleValidation';

const COLLECTION_NAME = 'unitConversionRules';

// ─── Firestore mapper ────────────────────────────────────────────────────────

function toDate(v: unknown): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  if (typeof (v as any).toDate === 'function') return (v as any).toDate();
  return new Date(v as string);
}

function mapRule(id: string, data: Record<string, unknown>): ConversionRule {
  return {
    id,
    name: (data.name as string) || '',
    fromUnit: (data.fromUnit as string) || '',
    toUnit: (data.toUnit as string) || '',
    expression: (data.expression as string) || '',
    notes: data.notes as string | undefined,
    active: data.active !== false,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    createdBy: (data.createdBy as string) || '',
  };
}

function rulesCol() {
  return collection(db, COLLECTION_NAME);
}

/** Throws, naming every issue, if `input` fails ADR-015 D2/D4/D5 validation. Called before every write — a rule is never half-valid in Firestore. */
function assertValid(input: Pick<ConversionRuleInput, 'fromUnit' | 'toUnit' | 'expression'>): void {
  const issues = validateConversionRule(input);
  if (issues.length > 0) {
    throw new Error(issues.map((i) => i.message).join(' '));
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const unitConversionRuleService = {
  /** Real-time listener — returns an unsubscribe function. */
  subscribe(
    callback: (rules: ConversionRule[]) => void,
    onError?: (err: Error) => void,
  ): () => void {
    const q = query(rulesCol(), orderBy('createdAt', 'asc'));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => mapRule(d.id, d.data() as Record<string, unknown>))),
      (err) => onError?.(err),
    );
  },

  /** Fetch every rule (one-shot) — active and inactive alike; callers filter for their own purpose (e.g. render-time lookup wants active only). */
  async getAll(): Promise<ConversionRule[]> {
    const q = query(rulesCol(), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapRule(d.id, d.data() as Record<string, unknown>));
  },

  /** Add a new rule. Refuses (throws) if it fails D4/D5 validation — never partially written. Returns the new document ID. */
  async add(input: ConversionRuleInput): Promise<string> {
    assertValid(input);
    const ref = await addDoc(rulesCol(), {
      ...input,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  /**
   * Update an existing rule. Re-validates the RESULT of merging `data` onto
   * `existing` — a partial patch (e.g. only `notes`) must not skip
   * validation just because `fromUnit`/`toUnit`/`expression` weren't in the
   * patch, and a patch that DOES touch one of those must be checked against
   * the merged whole, not the patch alone.
   */
  async update(ruleId: string, existing: ConversionRule, data: Partial<ConversionRuleInput>): Promise<void> {
    const merged = { ...existing, ...data };
    assertValid(merged);
    await updateDoc(doc(rulesCol(), ruleId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Deactivate, never delete (D2): a committed record's `conversionSnapshots`
   * may name this rule by id, and ADR-005's whole premise is that committed
   * data does not move — deleting the rule document would leave that
   * reference dangling. `active: false` simply removes it from future
   * render-time lookups (Task 3 only considers `active` rules) and from the
   * admin list's default view.
   */
  async deactivate(ruleId: string): Promise<void> {
    await updateDoc(doc(rulesCol(), ruleId), {
      active: false,
      updatedAt: serverTimestamp(),
    });
  },

  /** Re-activate a previously deactivated rule. */
  async activate(ruleId: string): Promise<void> {
    await updateDoc(doc(rulesCol(), ruleId), {
      active: true,
      updatedAt: serverTimestamp(),
    });
  },
};
