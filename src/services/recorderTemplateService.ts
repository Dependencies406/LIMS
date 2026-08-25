/**
 * Recorder Template Service
 * Manages RecorderTemplate authoring, versioning, and the ADR-003 invariant
 * that at most one template may be `active` per equipment type.
 *
 * Three collections:
 *   recorderTemplates            — the current (possibly still-drafting) document
 *   recorderTemplateVersions     — immutable published snapshots (ADR-005)
 *   recorderTemplateActiveLocks  — one doc per equipmentTypeId; its existence
 *     and `templateId` value ARE the uniqueness constraint (see publishTemplate)
 *
 * Firestore's Transaction.get() only accepts a DocumentReference, not a Query
 * — there is no way to transactionally ask "does any other active template
 * exist for this equipmentTypeId" via a where() query inside a transaction.
 * The lock collection turns that question into a single-document read at a
 * deterministic path (recorderTemplateActiveLocks/{equipmentTypeId}), which
 * CAN be read-and-written atomically. This is what makes the invariant
 * actually race-free, unlike a read-then-write app-side check.
 */

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  runTransaction
} from './firebase';
import type { RecorderTemplate, RecorderTemplateVersion } from '../types';
import { verifyTemplate, findMissingConversionFactorWarnings, type ConversionFactorWarning } from './recorderTemplateValidation';
import type { ValidationIssue } from '../modules/recorder/formula';

const TEMPLATES_COLLECTION = 'recorderTemplates';
const VERSIONS_COLLECTION = 'recorderTemplateVersions';
const LOCKS_COLLECTION = 'recorderTemplateActiveLocks';

/** Thrown by publishTemplate when the template fails verification. */
export class TemplateNotPublishableError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(`Template has ${issues.length} unresolved issue(s) and cannot be published.`);
    this.name = 'TemplateNotPublishableError';
    this.issues = issues;
  }
}

/**
 * Thrown by resetTemplateVersion when any LIVE (non-voided) record
 * references this template, at any version, in any status. `recordCount`
 * only counts live records (`getRecordCountByTemplateId` already excludes
 * voided ones — ADR-016 D3) — the message says so explicitly, and names
 * voiding as the release valve, so an admin who hits this is never left to
 * discover D3's "voiding is the lever" on their own.
 */
export class TemplateVersionResetBlockedError extends Error {
  readonly recordCount: number;

  constructor(recordCount: number) {
    super(
      `Cannot reset this template's version — ${recordCount} live record(s) reference it (voided records don't count). ` +
        `Resetting would let a future publish silently overwrite a version snapshot an existing record pins (ADR-005). ` +
        `Voiding the blocking records — from the recycle bin — is what would release this reset.`,
    );
    this.name = 'TemplateVersionResetBlockedError';
    this.recordCount = recordCount;
  }
}

/**
 * Thrown by deleteVersion (Phase 25 Task 2b/2c) when any LIVE (non-voided)
 * record still pins this exact (templateId, version) pair. Mirrors
 * TemplateVersionResetBlockedError's shape and reasoning, scoped to one
 * version instead of every version of the template — voided records don't
 * count (ADR-016 D3), same as the reset guard.
 */
export class TemplateVersionDeleteBlockedError extends Error {
  readonly version: number;
  readonly recordCount: number;

  constructor(version: number, recordCount: number) {
    super(
      `Cannot delete version ${version} — ${recordCount} live record(s) still reference it (voided records don't count). ` +
        `Deleting it would destroy the immutable snapshot those records' certificates were measured against (ADR-005).`,
    );
    this.name = 'TemplateVersionDeleteBlockedError';
    this.version = version;
    this.recordCount = recordCount;
  }
}

const documentToTemplate = (docData: any, docId: string): RecorderTemplate => {
  return {
    id: docId,
    name: docData.name || '',
    description: docData.description || undefined,
    equipmentTypeId: docData.equipmentTypeId || '',
    roundCount: docData.roundCount ?? 1,
    defaultRowCount: docData.defaultRowCount ?? 1,
    allowRowAdd: docData.allowRowAdd !== false,
    recordNumberFormat: docData.recordNumberFormat ?? {
      parts: [],
      separator: '-',
      includeYear: true,
      yearDigits: 2,
      numberPadding: 3,
      resetPolicy: 'never',
    },
    sections: docData.sections || [],
    summaryFields: docData.summaryFields || [],
    customFunctions: docData.customFunctions || [],
    // ADR-017 D2: normalised to [] on read so nothing downstream has to
    // distinguish "absent" (a pre-ADR-017 template) from "empty".
    reportBlocks: docData.reportBlocks || [],
    status: docData.status || 'draft',
    version: docData.version ?? 0,
    createdAt: docData.createdAt?.toDate() || new Date(),
    updatedAt: docData.updatedAt?.toDate() || new Date(),
    createdBy: docData.createdBy || '',
    updatedBy: docData.updatedBy || '',
  };
};

/**
 * Recursively removes keys whose value is `undefined`.
 *
 * Firestore rejects an explicit `undefined` field value outright
 * ("Unsupported field value: undefined"). The top-level fields below are all
 * `!== undefined` guarded, but `sections` / `summaryFields` /
 * `customFunctions` are handed through as whole nested structures, so an
 * optional property left `undefined` INSIDE a column object reached the
 * write untouched and failed the whole save.
 *
 * That is exactly what an optional column property does when it is cleared:
 * setting a column's Unit back to "None" produces `unitMode: undefined`,
 * `unit: undefined`, `unitChoices: undefined`. Stripping the keys is also
 * the semantics we want — `sections` is overwritten as a whole array, so a
 * key absent from the new array is genuinely gone from the stored document,
 * which is what "no unit" means.
 *
 * Only PLAIN objects are descended into; `Timestamp`, `FieldValue`
 * (serverTimestamp) and any other class instance passes through untouched,
 * so this is safe to apply to a fully-built document payload.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      out[key] = stripUndefinedDeep(item);
    }
    return out as T;
  }
  return value;
}

const templateToDocument = (
  template: Omit<RecorderTemplate, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: Date; updatedAt?: Date }
): any => {
  const docData: any = {
    name: template.name,
    equipmentTypeId: template.equipmentTypeId,
    roundCount: template.roundCount,
    defaultRowCount: template.defaultRowCount,
    allowRowAdd: template.allowRowAdd,
    recordNumberFormat: template.recordNumberFormat,
    sections: template.sections,
    summaryFields: template.summaryFields,
    customFunctions: template.customFunctions,
    // ADR-017 D2: blocks live inside their template and are copied into the
    // published version snapshot exactly like sections, so a committed
    // record reproduces from its own snapshot without reaching outside it
    // (ADR-005). `templateToDocument` is what publishTemplate freezes, so
    // this line is the pinning.
    reportBlocks: template.reportBlocks ?? [],
    status: template.status,
    version: template.version,
    createdBy: template.createdBy,
    updatedBy: template.updatedBy,
  };

  if (template.description !== undefined) {
    docData.description = template.description;
  }
  if (template.createdAt) {
    docData.createdAt = Timestamp.fromDate(template.createdAt);
  }
  if (template.updatedAt) {
    docData.updatedAt = Timestamp.fromDate(template.updatedAt);
  }

  return stripUndefinedDeep(docData);
};

const documentToVersion = (docData: any, docId: string): RecorderTemplateVersion => {
  return {
    id: docId,
    templateId: docData.templateId,
    version: docData.version,
    snapshot: documentToTemplate(docData.snapshot, docData.templateId),
    publishedAt: docData.publishedAt?.toDate() || new Date(),
    publishedBy: docData.publishedBy || '',
  };
};

export const recorderTemplateService = {
  /**
   * Structural + interpreter verification (ADR-001 verifier), without touching
   * Firestore. What the authoring UI's Verify button calls, and what
   * publishTemplate enforces as a hard gate.
   */
  verifyTemplate(template: RecorderTemplate): ValidationIssue[] {
    return verifyTemplate(template);
  },

  /**
   * Phase 15 Task 3: warn-only conversion-factor check, run alongside
   * verifyTemplate but kept separate — see findMissingConversionFactorWarnings.
   */
  findMissingConversionFactorWarnings(template: RecorderTemplate): ConversionFactorWarning[] {
    return findMissingConversionFactorWarnings(template);
  },

  async getAllTemplates(): Promise<RecorderTemplate[]> {
    try {
      const q = query(collection(db, TEMPLATES_COLLECTION), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => documentToTemplate(d.data(), d.id));
    } catch (error) {
      console.error('Error fetching recorder templates:', error);
      throw new Error('Failed to fetch recorder templates');
    }
  },

  async getActiveTemplates(): Promise<RecorderTemplate[]> {
    try {
      const q = query(
        collection(db, TEMPLATES_COLLECTION),
        where('status', '==', 'active'),
        orderBy('name', 'asc'),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => documentToTemplate(d.data(), d.id));
    } catch (error) {
      console.error('Error fetching active recorder templates:', error);
      throw new Error('Failed to fetch active recorder templates');
    }
  },

  async getTemplateById(id: string): Promise<RecorderTemplate | null> {
    try {
      const docRef = doc(db, TEMPLATES_COLLECTION, id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return null;
      return documentToTemplate(docSnap.data(), docSnap.id);
    } catch (error) {
      console.error('Error fetching recorder template:', error);
      throw new Error('Failed to fetch recorder template');
    }
  },

  /** The currently active template for an equipment type, if any (for template lookup at record creation, later phases). */
  async getActiveTemplateByEquipmentTypeId(equipmentTypeId: string): Promise<RecorderTemplate | null> {
    try {
      const q = query(
        collection(db, TEMPLATES_COLLECTION),
        where('equipmentTypeId', '==', equipmentTypeId),
        where('status', '==', 'active'),
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      return documentToTemplate(snapshot.docs[0].data(), snapshot.docs[0].id);
    } catch (error) {
      console.error('Error fetching active template for equipment type:', error);
      throw new Error('Failed to fetch active template for equipment type');
    }
  },

  /** Creates a new draft. Does not touch the active-lock — only publishing does. */
  async createTemplate(
    template: Omit<RecorderTemplate, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'version'>
  ): Promise<string> {
    try {
      if (!template.name.trim()) throw new Error('Name is required');
      if (!template.equipmentTypeId) throw new Error('An equipment type is required');

      const now = new Date();
      const docData = templateToDocument({
        ...template,
        status: 'draft',
        version: 0,
        createdAt: now,
        updatedAt: now,
      });

      docData.createdAt = serverTimestamp();
      docData.updatedAt = serverTimestamp();

      const docRef = doc(collection(db, TEMPLATES_COLLECTION));
      await setDoc(docRef, docData);
      return docRef.id;
    } catch (error: any) {
      console.error('Error creating recorder template:', error);
      if (error.message) throw error;
      throw new Error('Failed to create recorder template');
    }
  },

  /**
   * Updates draft content. Cannot change `equipmentTypeId` while the template
   * is `active` — that would desynchronize it from the lock document that
   * still points to this template under the OLD equipmentTypeId. Archive
   * first, then change it, then republish.
   */
  async updateTemplate(
    id: string,
    updates: Partial<
      Omit<RecorderTemplate, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'version'>
    >
  ): Promise<void> {
    try {
      const existing = await this.getTemplateById(id);
      if (!existing) throw new Error('Recorder template not found');

      if (
        updates.equipmentTypeId !== undefined &&
        updates.equipmentTypeId !== existing.equipmentTypeId &&
        existing.status === 'active'
      ) {
        throw new Error(
          'Cannot change the equipment type of an active template. Archive it first.',
        );
      }

      const updateData: any = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.equipmentTypeId !== undefined) updateData.equipmentTypeId = updates.equipmentTypeId;
      if (updates.roundCount !== undefined) updateData.roundCount = updates.roundCount;
      if (updates.defaultRowCount !== undefined) updateData.defaultRowCount = updates.defaultRowCount;
      if (updates.allowRowAdd !== undefined) updateData.allowRowAdd = updates.allowRowAdd;
      if (updates.recordNumberFormat !== undefined) updateData.recordNumberFormat = updates.recordNumberFormat;
      if (updates.sections !== undefined) updateData.sections = updates.sections;
      if (updates.summaryFields !== undefined) updateData.summaryFields = updates.summaryFields;
      if (updates.customFunctions !== undefined) updateData.customFunctions = updates.customFunctions;
      if (updates.reportBlocks !== undefined) updateData.reportBlocks = updates.reportBlocks;
      if (updates.updatedBy !== undefined) updateData.updatedBy = updates.updatedBy;

      updateData.updatedAt = serverTimestamp();

      const docRef = doc(db, TEMPLATES_COLLECTION, id);
      await updateDoc(docRef, stripUndefinedDeep(updateData));
    } catch (error: any) {
      console.error('Error updating recorder template:', error);
      if (error.message) throw error;
      throw new Error('Failed to update recorder template');
    }
  },

  /**
   * Publishes the template: verifies it, then atomically claims the
   * equipment-type lock, freezes an immutable RecorderTemplateVersion
   * snapshot (including customFunctions), and bumps the template's own
   * version/status. All within ONE transaction, so a concurrent publish
   * attempt for the same equipmentTypeId cannot both succeed (ADR-003).
   */
  async publishTemplate(id: string, publishedBy: string): Promise<{ version: number }> {
    try {
      const templateRef = doc(db, TEMPLATES_COLLECTION, id);

      const result = await runTransaction(db, async (transaction) => {
        const templateSnap = await transaction.get(templateRef);
        if (!templateSnap.exists()) {
          throw new Error('Recorder template not found');
        }

        const template = documentToTemplate(templateSnap.data(), templateSnap.id);

        const issues = verifyTemplate(template);
        if (issues.length > 0) {
          throw new TemplateNotPublishableError(issues);
        }

        const lockRef = doc(db, LOCKS_COLLECTION, template.equipmentTypeId);
        const lockSnap = await transaction.get(lockRef);

        if (lockSnap.exists() && lockSnap.data().templateId !== id) {
          throw new Error(
            `Equipment type already has a different active template (${lockSnap.data().templateId}). Archive it first.`,
          );
        }

        const nextVersion = template.version + 1;
        const versionId = `${id}_v${nextVersion}`;
        const versionRef = doc(db, VERSIONS_COLLECTION, versionId);

        const snapshotDoc = templateToDocument({
          ...template,
          version: nextVersion,
          status: 'active',
          updatedBy: publishedBy,
        });

        transaction.set(versionRef, {
          templateId: id,
          version: nextVersion,
          snapshot: snapshotDoc,
          publishedAt: serverTimestamp(),
          publishedBy,
        });

        transaction.update(templateRef, {
          status: 'active',
          version: nextVersion,
          updatedAt: serverTimestamp(),
          updatedBy: publishedBy,
        });

        transaction.set(lockRef, {
          templateId: id,
          equipmentTypeId: template.equipmentTypeId,
          updatedAt: serverTimestamp(),
        });

        return { version: nextVersion };
      });

      return result;
    } catch (error: any) {
      console.error('Error publishing recorder template:', error);
      if (error instanceof TemplateNotPublishableError) throw error;
      if (error.message) throw error;
      throw new Error('Failed to publish recorder template');
    }
  },

  /**
   * Archives the template and releases its equipment-type lock (if it holds
   * one), transactionally, so a competing publish for the same equipment type
   * can never race with the release.
   */
  async archiveTemplate(id: string, updatedBy: string): Promise<void> {
    try {
      const templateRef = doc(db, TEMPLATES_COLLECTION, id);

      await runTransaction(db, async (transaction) => {
        const templateSnap = await transaction.get(templateRef);
        if (!templateSnap.exists()) {
          throw new Error('Recorder template not found');
        }
        const template = documentToTemplate(templateSnap.data(), templateSnap.id);

        const lockRef = doc(db, LOCKS_COLLECTION, template.equipmentTypeId);
        const lockSnap = await transaction.get(lockRef);

        if (lockSnap.exists() && lockSnap.data().templateId === id) {
          transaction.delete(lockRef);
        }

        transaction.update(templateRef, {
          status: 'archived',
          updatedAt: serverTimestamp(),
          updatedBy,
        });
      });
    } catch (error: any) {
      console.error('Error archiving recorder template:', error);
      if (error.message) throw error;
      throw new Error('Failed to archive recorder template');
    }
  },

  /**
   * Phase 23 Task 5 — resets a template's version counter to 0, so the
   * NEXT publish becomes v1 again, for a template still under development
   * whose early publishes were never real recordings.
   *
   * **The guard is the feature (ADR-005).** Every committed record pins a
   * `(templateId, version)` pair to an immutable `recorderTemplateVersions`
   * snapshot; resetting the counter and republishing would silently create
   * a NEW snapshot at a version number an existing record already points
   * at, retroactively changing what that record's certificate claims it
   * was measured against. Refused outright — not warned-and-proceed — if
   * `countRecordsReferencingTemplate` reports ANY record, in ANY status, at
   * ANY version of this template.
   *
   * `countRecordsReferencingTemplate` is an INJECTED function rather than
   * an import of `calibrationRecordService` here, deliberately:
   * `calibrationRecordService.ts` already imports THIS module (to resolve a
   * record's pinned template version), so importing it back would be a
   * circular module dependency. The caller (an admin-only UI action) already
   * has both services in scope and passes
   * `calibrationRecordService.getRecordCountByTemplateId` through.
   *
   * **Race window, stated plainly, not hidden:** Firestore transactions can
   * only `get()` a specific document, never run a `where()` query — so the
   * record-count check can never be made part of the same atomic operation
   * as the reset write itself. This calls `countRecordsReferencingTemplate`
   * TWICE (once up front, once immediately before the transactional write)
   * to narrow the window a stray record-creation could land in, but does
   * NOT eliminate it. A fully race-free guard needs the check and the write
   * to happen server-side in one atomic operation — a Cloud Function — which
   * does not exist in this repository today; this is the best a client-only
   * implementation can honestly guarantee.
   *
   * A currently-`active` template additionally reverts to `draft` and
   * releases its equipment-type lock (mirrors `archiveTemplate`): leaving
   * it `active` with `version: 0` would break `createDraftRecord` for that
   * equipment type immediately (it resolves `recorderTemplateVersions/{id}_v0`,
   * which never exists — versions start at v1).
   *
   * **Also deletes EVERY existing `recorderTemplateVersions` document for
   * this template (revised 2026-08-19 — Phase 25).** An earlier version of
   * this method deleted only the hardcoded `_v1` snapshot, on the
   * assumption that a reset always leaves the counter such that the next
   * publish targets v1. That assumption breaks the moment a template has
   * been reset MORE THAN ONCE, or reset after reaching v2+: the counter can
   * sit at a value whose NEXT slot (e.g. v2, v3) already has an orphaned
   * snapshot from a prior cycle, `_v1`-only deletion leaves it standing,
   * republish targets that slot, and `firestore.rules`' `allow update:
   * if false` refuses it — permanently, exactly as `_v1` alone used to.
   * This happened in practice. Deleting every version this template has
   * ever published removes the entire class of collision, not just the
   * one instance already hit.
   *
   * This is SAFE specifically because it runs only after
   * `countRecordsReferencingTemplate` has already confirmed (twice) that
   * NO record — live, at any version, of this template — exists: by the
   * time deletion happens, nothing in the live system still needs any of
   * these snapshots to resolve. (A VOIDED record may still reference one —
   * see that guard's own doc comment; ADR-016 D3 excludes voided from this
   * count deliberately, and losing a voided record's friendly
   * template-name lookup — it falls back to the raw templateId — is an
   * accepted, non-crashing degradation, not data loss: the void trail
   * itself lives entirely on the record, not on this document.)
   *
   * **Query-inside-transaction limitation:** Firestore transactions can
   * only `get()` a specific document reference, never run a `where()`
   * query — so which version documents exist cannot be discovered from
   * inside the same transaction that deletes them. The list is fetched
   * with a plain `getDocs` query BEFORE `runTransaction` starts, then each
   * resulting reference is deleted inside the transaction (a delete on a
   * reference needs no prior read of that same reference within the
   * transaction — only reads of `templateRef`/`lockRef`, which this method
   * also needs, must precede its writes). A version published in the
   * narrow window between that query and the transaction's commit would
   * not be in the deleted set — the same class of race already accepted
   * and documented for the record-count check itself, narrowed but not
   * eliminated by re-running the count check immediately before the write,
   * same as before.
   */
  async resetTemplateVersion(
    id: string,
    resetBy: string,
    countRecordsReferencingTemplate: (templateId: string) => Promise<number>,
  ): Promise<void> {
    try {
      const recordCount = await countRecordsReferencingTemplate(id);
      if (recordCount > 0) {
        throw new TemplateVersionResetBlockedError(recordCount);
      }

      // Which version documents exist — must run OUTSIDE the transaction
      // (see doc comment: transactions cannot where()-query).
      const versionsQuery = query(collection(db, VERSIONS_COLLECTION), where('templateId', '==', id));
      const versionsSnapshot = await getDocs(versionsQuery);
      const versionRefs = versionsSnapshot.docs.map((d) => doc(db, VERSIONS_COLLECTION, d.id));

      // Second, closer-in-time check — see the doc comment above for why
      // this cannot be made transactionally atomic with the write below.
      const recheckedCount = await countRecordsReferencingTemplate(id);
      if (recheckedCount > 0) {
        throw new TemplateVersionResetBlockedError(recheckedCount);
      }

      const templateRef = doc(db, TEMPLATES_COLLECTION, id);
      await runTransaction(db, async (transaction) => {
        // All reads before any writes (Firestore transaction requirement) —
        // templateSnap and (conditionally) lockSnap first. The version
        // documents are deleted by reference below with no prior read of
        // those SAME references in this transaction, which Firestore
        // permits (the read-before-write rule applies per transaction, to
        // paths this transaction itself reads, not to every path it writes).
        const templateSnap = await transaction.get(templateRef);
        if (!templateSnap.exists()) {
          throw new Error('Recorder template not found');
        }
        const template = documentToTemplate(templateSnap.data(), templateSnap.id);

        let lockRefToDelete: ReturnType<typeof doc> | null = null;
        if (template.status === 'active') {
          const lockRef = doc(db, LOCKS_COLLECTION, template.equipmentTypeId);
          const lockSnap = await transaction.get(lockRef);
          if (lockSnap.exists() && lockSnap.data().templateId === id) {
            lockRefToDelete = lockRef;
          }
        }

        // Writes.
        for (const versionRef of versionRefs) {
          transaction.delete(versionRef);
        }

        const updates: any = {
          version: 0,
          updatedAt: serverTimestamp(),
          updatedBy: resetBy,
        };

        if (template.status === 'active') {
          updates.status = 'draft';
          if (lockRefToDelete) {
            transaction.delete(lockRefToDelete);
          }
        }

        transaction.update(templateRef, updates);
      });
    } catch (error: any) {
      console.error('Error resetting recorder template version:', error);
      if (error instanceof TemplateVersionResetBlockedError) throw error;
      if (error.message) throw error;
      throw new Error('Failed to reset recorder template version');
    }
  },

  /**
   * Phase 25 Task 2b/2c — deletes ONE published version snapshot, without
   * touching the template's own counter or any OTHER version. This is what
   * replaces hand-editing Firestore in the Console for an admin cleaning up
   * a stale version the template's own reset didn't (or, before this
   * phase's 2a fix, couldn't) reach.
   *
   * Refused outright if `countRecordsReferencingVersion` reports ANY live
   * (non-voided — ADR-016 D3) record still pinned to this exact
   * (templateId, version) pair — the same ADR-005 guarantee
   * resetTemplateVersion protects, just scoped to one version instead of
   * every version of the template. `countRecordsReferencingVersion` is
   * INJECTED for the identical reason `countRecordsReferencingTemplate` is
   * on resetTemplateVersion: importing calibrationRecordService here would
   * be circular, since that module already imports this one.
   *
   * No transaction: a single-document delete against a collection whose
   * only OTHER write path (create) requires the caller to already be admin
   * (firestore.rules) needs no read-modify-write atomicity — there's
   * nothing else in this same operation to keep consistent. The same
   * two-checks race-window narrowing as resetTemplateVersion is applied
   * here for the same reason (a record could start pinning this version
   * between the check and the delete) — still not eliminated, same
   * accepted, documented limitation.
   */
  async deleteVersion(
    templateId: string,
    version: number,
    countRecordsReferencingVersion: (templateId: string, version: number) => Promise<number>,
  ): Promise<void> {
    try {
      const recordCount = await countRecordsReferencingVersion(templateId, version);
      if (recordCount > 0) {
        throw new TemplateVersionDeleteBlockedError(version, recordCount);
      }

      const recheckedCount = await countRecordsReferencingVersion(templateId, version);
      if (recheckedCount > 0) {
        throw new TemplateVersionDeleteBlockedError(version, recheckedCount);
      }

      const versionRef = doc(db, VERSIONS_COLLECTION, `${templateId}_v${version}`);
      await deleteDoc(versionRef);
    } catch (error: any) {
      console.error('Error deleting recorder template version:', error);
      if (error instanceof TemplateVersionDeleteBlockedError) throw error;
      if (error.message) throw error;
      throw new Error('Failed to delete recorder template version');
    }
  },

  async getVersionById(versionId: string): Promise<RecorderTemplateVersion | null> {
    try {
      const docRef = doc(db, VERSIONS_COLLECTION, versionId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return null;
      return documentToVersion(docSnap.data(), docSnap.id);
    } catch (error) {
      console.error('Error fetching recorder template version:', error);
      throw new Error('Failed to fetch recorder template version');
    }
  },

  async getVersion(templateId: string, version: number): Promise<RecorderTemplateVersion | null> {
    return this.getVersionById(`${templateId}_v${version}`);
  },

  async getAllVersions(templateId: string): Promise<RecorderTemplateVersion[]> {
    try {
      const q = query(
        collection(db, VERSIONS_COLLECTION),
        where('templateId', '==', templateId),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map((d) => documentToVersion(d.data(), d.id))
        .sort((a, b) => a.version - b.version);
    } catch (error) {
      console.error('Error fetching recorder template versions:', error);
      throw new Error('Failed to fetch recorder template versions');
    }
  },

  /** Deletes a draft that was never published. Published/active templates cannot be deleted — archive them instead. */
  async deleteDraftTemplate(id: string): Promise<void> {
    try {
      const existing = await this.getTemplateById(id);
      if (!existing) return;
      if (existing.status !== 'draft') {
        throw new Error('Only draft templates (never published) can be deleted. Archive a published template instead.');
      }
      await deleteDoc(doc(db, TEMPLATES_COLLECTION, id));
    } catch (error: any) {
      console.error('Error deleting recorder template:', error);
      if (error.message) throw error;
      throw new Error('Failed to delete recorder template');
    }
  },

  subscribeToTemplates(
    callback: (templates: RecorderTemplate[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    try {
      const q = query(collection(db, TEMPLATES_COLLECTION));
      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const templates: RecorderTemplate[] = [];
          querySnapshot.forEach((docSnap) => {
            templates.push(documentToTemplate(docSnap.data(), docSnap.id));
          });
          templates.sort((a, b) => a.name.localeCompare(b.name));
          callback(templates);
        },
        (error) => {
          console.error('Error subscribing to recorder templates:', error);
          if (onError) onError(error);
        },
      );
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up recorder templates subscription:', error);
      if (onError && error instanceof Error) onError(error);
      return () => {};
    }
  },
};
