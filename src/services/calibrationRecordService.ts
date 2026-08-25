/**
 * Calibration Record Service
 *
 * Records live in their own top-level `records` collection (ADR-002) — never
 * inline on the Job document. Four-state lifecycle plus Superseded (ADR-005):
 * Draft (editable, no number) -> Committed (immutable data, number allocated)
 * -> Reviewed -> Approved. A correction never mutates a committed record; it
 * creates a linked Revision.
 *
 * Evaluation reuses recorderTemplateMockup's evaluateMockup — which itself
 * calls only the Phase 3 interpreter (src/modules/recorder/formula) — so
 * commit-time evaluation and the template author's "test with sample data"
 * panel share one code path. Nothing here parses or evaluates an expression
 * directly.
 */

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  runTransaction,
} from './firebase';
import type {
  CalibrationRecord,
  ConversionCellSnapshot,
  ConversionRule,
  DigitalSignature,
  Job,
  RecordContextSnapshot,
  RecordRow,
  RecorderTemplate,
  ReferenceStandardSnapshot,
  RoundEnvironment,
} from '../types';
import { recorderTemplateService } from './recorderTemplateService';
import { evaluateMockup, findStandardColumnKey, isRowEmpty, type StandardsById } from './recorderTemplateMockup';
import { environmentToEnvMap } from './recordEnvironment';
import { resolveStandardsByKeys } from './standardResolutionService';
import { toStandardSnapshot } from './referenceStandardVariables';
import { resolveColumnUnitMap } from './recordingGridDocument';
import { convertColumnDisplayValue } from './columnConversion';
import { unitConversionRuleService } from './unitConversionRuleService';

/** Firestore cannot store `undefined`, and snapshot dates must go in as Timestamps. */
function standardSnapshotToDocument(snapshot: ReferenceStandardSnapshot): any {
  const out: any = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) continue;
    out[key] = value instanceof Date ? Timestamp.fromDate(value) : value;
  }
  return out;
}

/**
 * Phase 21 Task 2: `defaultRowCount` is the template author's stated
 * intended row count, but seeding that many BLANK rows verbatim on every
 * new draft produces a wall of unusable rows for a template where it's set
 * large (the reported symptom). A NEW draft now starts with at most this
 * many rows — a template whose author set a smaller `defaultRowCount` still
 * gets exactly that (unchanged behaviour), but nothing is ever seeded with
 * more than this, regardless of the template's setting. The technician
 * grows from there with `addRow` and shrinks with Task 3's delete;
 * `defaultRowCount` is otherwise unused for display — RecordingGrid now
 * seeds exactly `rows.length` (see its own file), never padding a shorter
 * record back up to `defaultRowCount`.
 */
const DRAFT_STARTING_ROW_CAP = 5;

/**
 * Phase 22 Task 3: trims TRAILING wholly-empty rows down to the last row
 * that actually holds data, with a minimum of 1 — existing records made
 * before `DRAFT_STARTING_ROW_CAP` existed can still carry a large
 * `defaultRowCount`'s worth of blank rows, and the grid now faithfully
 * shows every one of them (Phase 21 Task 2 stopped padding short records
 * UP, but never trimmed a long one down).
 *
 * "Wholly empty" reuses Phase 21's `isRowEmpty` — no second definition.
 * Only a run of blank rows at the very END is dropped: a blank row BETWEEN
 * two rows that hold data is deliberate spacing or a skipped calibration
 * point, and is left exactly as recorded, whatever its position.
 *
 * Pure and status-blind by itself — `trimDraftRows` below is the ADR-005
 * gate; call THAT from application code, not this directly, so the
 * draft-only rule lives in exactly one place and cannot be forgotten by a
 * future caller.
 */
export function trimTrailingEmptyRows(template: RecorderTemplate, rows: RecordRow[]): RecordRow[] {
  let lastNonEmptyIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (!isRowEmpty(template, rows[i])) lastNonEmptyIndex = i;
  }
  const keep = Math.max(lastNonEmptyIndex + 1, 1);
  return rows.slice(0, keep);
}

/**
 * Phase 22 Task 3 — the ADR-005 gate: a no-op for anything other than a
 * draft (`removedCount: 0`, the SAME rows array back, not a copy), so a
 * committed/reviewed/approved/superseded record's data can never be
 * touched by this feature no matter what a caller passes in. Still pure —
 * no Firestore write here; the caller persists via the existing
 * `updateDraftRecord` when `removedCount > 0`.
 */
export function trimDraftRows(
  status: CalibrationRecord['status'],
  template: RecorderTemplate,
  rows: RecordRow[],
): { rows: RecordRow[]; removedCount: number } {
  if (status !== 'draft') return { rows, removedCount: 0 };
  const trimmed = trimTrailingEmptyRows(template, rows);
  return { rows: trimmed, removedCount: rows.length - trimmed.length };
}

/**
 * ADR-016 D1/D3/D4 — the ONE shared filter every record LISTING must pass
 * through, so a future query cannot forget to exclude voided records. Only
 * a fetch-by-known-id (`getRecordById`) is exempt — that's a deliberate
 * "get exactly this document" operation, needed to view or restore a
 * SPECIFIC voided record from the recycle bin, not a listing.
 *
 * Applied CLIENT-SIDE, after the query returns, rather than as a
 * `where('status','!=','voided')` Firestore clause: combining that
 * inequality with either of this file's existing query's equality filters
 * (jobId+itemId, or templateId) would need a new Firestore composite index
 * that cannot be deployed from this environment — and both queries already
 * return small, bounded result sets (one item's records, one template's
 * records), so filtering after the read costs nothing meaningful. See
 * `getRecordsForItem`/`getRecordCountByTemplateId` for the two call sites.
 */
export function excludeVoided(records: CalibrationRecord[]): CalibrationRecord[] {
  return records.filter((r) => r.status !== 'voided');
}

/**
 * Phase 23 Task 3 — mirrors `firestore.rules`' committed -> reviewed clause
 * EXACTLY (permission AND `request.auth.uid != resource.data.createdBy`),
 * so the UI can refuse to even OFFER Review rather than letting a
 * technician draw a signature only to have Confirm fail. Pure: the caller
 * supplies `canReview` from its own permission check (this function has no
 * way to read roles itself).
 */
export function reviewBlockedReason(
  canReview: boolean,
  currentUserId: string | undefined,
  createdBy: string,
): string | null {
  if (!canReview) return "You don't have permission to review records.";
  if (currentUserId === createdBy) {
    return 'A record must be reviewed by someone other than the person who recorded it.';
  }
  return null;
}

/**
 * Mirrors the reviewed -> approved clause. ADR-005 originally required
 * `approver != reviewedBy`; relaxed 2026-08-19 (the ADR's own named
 * revisit condition) — reviewer and approver may be the same person. Kept
 * as a function, not inlined at the call site, so firestore.rules stays
 * the single source of truth this mirrors — permission-only today, but
 * still the one place to update if that ever changes again.
 */
export function approveBlockedReason(
  canApprove: boolean,
): string | null {
  if (!canApprove) return "You don't have permission to approve records.";
  return null;
}

/** Mirrors `standardSnapshotToDocument` — same Firestore Timestamp conversion, for ADR-015 D7's per-cell conversion snapshot. */
function conversionSnapshotToDocument(snapshot: ConversionCellSnapshot): any {
  return { ...snapshot, capturedAt: Timestamp.fromDate(snapshot.capturedAt) };
}

/**
 * ADR-015 D7: one snapshot per cell where conversion was actually APPLIED at
 * commit (never for a cell where conversion failed, or wasn't enabled — D6's
 * failure is a display-time-only concern with nothing to freeze). Computed
 * from the record's already-evaluated RAW rows (D1: conversion never touches
 * what recalculation itself produces) and the conversion rule library as it
 * stood at the moment of commit — frozen here so editing or deactivating a
 * rule afterward can never move an already-issued certificate's numbers.
 */
function buildConversionSnapshots(
  template: RecorderTemplate,
  evaluatedRows: RecordRow[],
  columnUnits: Record<string, string> | undefined,
  conversionRules: ConversionRule[],
  capturedAt: Date,
): Record<string, ConversionCellSnapshot> {
  const unitByKey = resolveColumnUnitMap(template, columnUnits ?? {});
  const snapshots: Record<string, ConversionCellSnapshot> = {};
  for (const section of template.sections) {
    for (const column of section.columns) {
      if (column.type !== 'formula' || !column.conversionEnabled) continue;
      const columnKey = `${section.id}_${column.id}`;
      const targetUnit = unitByKey[columnKey];
      evaluatedRows.forEach((row, rowIndex) => {
        const rawValue = row[columnKey];
        if (typeof rawValue !== 'number') return;
        const result = convertColumnDisplayValue({ rawValue, column, targetUnit, rules: conversionRules });
        if (!result.applied) return; // no rule, or a failure — nothing to freeze (D6, not D7)
        snapshots[`${rowIndex}:${columnKey}`] = {
          ruleId: result.applied.rule.id,
          ruleName: result.applied.rule.name,
          expression: result.applied.rule.expression,
          sourceUnit: result.applied.sourceUnit,
          targetUnit: result.applied.targetUnit,
          rawValue: result.applied.rawValue,
          convertedValue: result.displayValue,
          capturedAt,
        };
      });
    }
  }
  return snapshots;
}

/** Every distinct standard id referenced by the record's rows, in the row order they first appear. */
function collectStandardIds(rows: RecordRow[], standardColumnKey: string | null): string[] {
  if (!standardColumnKey) return [];
  const ids: string[] = [];
  for (const row of rows) {
    const value = row[standardColumnKey];
    if (typeof value === 'string' && value && !ids.includes(value)) ids.push(value);
  }
  return ids;
}

const RECORDS_COLLECTION = 'records';
const COUNTERS_COLLECTION = 'recordNumberCounters';

/** Thrown by commitRecord when the record is not ready to commit. */
export class RecordNotCommittableError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Record has ${issues.length} issue(s) and cannot be committed: ${issues.join('; ')}`);
    this.name = 'RecordNotCommittableError';
    this.issues = issues;
  }
}

// ── Firestore <-> domain conversion ─────────────────────────────────────────

const documentToRecord = (docData: any, docId: string): CalibrationRecord => {
  return {
    id: docId,
    recordNumber: docData.recordNumber ?? undefined,
    jobId: docData.jobId,
    itemId: docData.itemId,
    equipmentTypeId: docData.equipmentTypeId,
    templateId: docData.templateId,
    templateVersion: docData.templateVersion,
    contextSnapshot: {
      job: { ...docData.contextSnapshot.job },
      item: { ...docData.contextSnapshot.item },
      capturedAt: docData.contextSnapshot.capturedAt?.toDate() || new Date(),
    },
    environment: (docData.environment || []) as RoundEnvironment[],
    rows: (docData.rows || []) as RecordRow[],
    reportUnit: docData.reportUnit ?? undefined,
    columnUnits: docData.columnUnits ?? undefined,
    standardSnapshots: docData.standardSnapshots
      ? Object.fromEntries(
          Object.entries(docData.standardSnapshots as Record<string, any>).map(([key, snap]) => [
            key,
            {
              ...snap,
              calibrationDate: snap.calibrationDate?.toDate?.() || undefined,
              dueDate: snap.dueDate?.toDate?.() || undefined,
              capturedAt: snap.capturedAt?.toDate?.() || new Date(),
            } as ReferenceStandardSnapshot,
          ]),
        )
      : undefined,
    conversionSnapshots: docData.conversionSnapshots
      ? Object.fromEntries(
          Object.entries(docData.conversionSnapshots as Record<string, any>).map(([key, snap]) => [
            key,
            { ...snap, capturedAt: snap.capturedAt?.toDate?.() || new Date() } as ConversionCellSnapshot,
          ]),
        )
      : undefined,
    summary: docData.summary || {},
    status: docData.status,
    supersedes: docData.supersedes ?? undefined,
    supersededBy: docData.supersededBy ?? undefined,
    revisionReason: docData.revisionReason ?? undefined,
    createdAt: docData.createdAt?.toDate() || new Date(),
    createdBy: docData.createdBy || '',
    committedAt: docData.committedAt?.toDate() || undefined,
    committedBy: docData.committedBy ?? undefined,
    reviewedAt: docData.reviewedAt?.toDate() || undefined,
    reviewedBy: docData.reviewedBy ?? undefined,
    reviewerSignature: docData.reviewerSignature
      ? { ...docData.reviewerSignature, signedDate: docData.reviewerSignature.signedDate?.toDate() || new Date() }
      : undefined,
    approvedAt: docData.approvedAt?.toDate() || undefined,
    approvedBy: docData.approvedBy ?? undefined,
    approverSignature: docData.approverSignature
      ? { ...docData.approverSignature, signedDate: docData.approverSignature.signedDate?.toDate() || new Date() }
      : undefined,
    voidedAt: docData.voidedAt?.toDate() || undefined,
    voidedBy: docData.voidedBy ?? undefined,
    voidReason: docData.voidReason ?? undefined,
    statusBeforeVoid: docData.statusBeforeVoid ?? undefined,
  };
};

const recordToDocument = (record: Omit<CalibrationRecord, 'id'>): any => {
  const docData: any = {
    jobId: record.jobId,
    itemId: record.itemId,
    equipmentTypeId: record.equipmentTypeId,
    templateId: record.templateId,
    templateVersion: record.templateVersion,
    contextSnapshot: {
      job: { ...record.contextSnapshot.job },
      item: { ...record.contextSnapshot.item },
      capturedAt: Timestamp.fromDate(record.contextSnapshot.capturedAt),
    },
    environment: record.environment,
    rows: record.rows,
    summary: record.summary,
    status: record.status,
    createdBy: record.createdBy,
  };

  if (record.recordNumber !== undefined) docData.recordNumber = record.recordNumber;
  if (record.reportUnit !== undefined) docData.reportUnit = record.reportUnit;
  if (record.columnUnits !== undefined) docData.columnUnits = record.columnUnits;
  if (record.standardSnapshots) {
    docData.standardSnapshots = Object.fromEntries(
      Object.entries(record.standardSnapshots).map(([key, snap]) => [key, standardSnapshotToDocument(snap)]),
    );
  }
  if (record.conversionSnapshots) {
    docData.conversionSnapshots = Object.fromEntries(
      Object.entries(record.conversionSnapshots).map(([key, snap]) => [key, conversionSnapshotToDocument(snap)]),
    );
  }
  if (record.supersedes !== undefined) docData.supersedes = record.supersedes;
  if (record.supersededBy !== undefined) docData.supersededBy = record.supersededBy;
  if (record.revisionReason !== undefined) docData.revisionReason = record.revisionReason;
  if (record.createdAt) docData.createdAt = Timestamp.fromDate(record.createdAt);
  if (record.committedAt) docData.committedAt = Timestamp.fromDate(record.committedAt);
  if (record.committedBy !== undefined) docData.committedBy = record.committedBy;
  if (record.reviewedAt) docData.reviewedAt = Timestamp.fromDate(record.reviewedAt);
  if (record.reviewedBy !== undefined) docData.reviewedBy = record.reviewedBy;
  if (record.reviewerSignature) {
    docData.reviewerSignature = {
      ...record.reviewerSignature,
      signedDate: Timestamp.fromDate(record.reviewerSignature.signedDate),
    };
  }
  if (record.approvedAt) docData.approvedAt = Timestamp.fromDate(record.approvedAt);
  if (record.approvedBy !== undefined) docData.approvedBy = record.approvedBy;
  if (record.approverSignature) {
    docData.approverSignature = {
      ...record.approverSignature,
      signedDate: Timestamp.fromDate(record.approverSignature.signedDate),
    };
  }

  return docData;
};

// ── Record number formatting (mirrors certificateNumberGeneratorService's
// approach, adapted for RecorderTemplate.recordNumberFormat's shape) ────────

interface RecordNumberCounterState {
  currentNumber: number;
  currentYear: number;
  lastResetAt?: Date;
}

function formatRecordNumber(
  format: RecorderTemplate['recordNumberFormat'],
  number: number,
  year: number,
): string {
  const parts = [...format.parts];
  const padded = String(number).padStart(format.numberPadding, '0');
  if (format.includeYear) {
    const yearStr = String(year).slice(-format.yearDigits);
    parts.push(yearStr + padded);
  } else {
    parts.push(padded);
  }
  return parts.join(format.separator);
}

/** Evaluates the reset policy the same way certificateNumberGeneratorService does (ADR-008). */
function shouldResetCounter(
  format: RecorderTemplate['recordNumberFormat'],
  counter: RecordNumberCounterState,
  now: Date,
): boolean {
  if (format.resetPolicy === 'yearly') {
    return counter.currentYear !== now.getFullYear();
  }
  if (format.resetPolicy === 'monthly') {
    return (
      !counter.lastResetAt ||
      counter.lastResetAt.getFullYear() !== now.getFullYear() ||
      counter.lastResetAt.getMonth() !== now.getMonth()
    );
  }
  return false;
}

// ── Context snapshot capture ────────────────────────────────────────────────

function buildContextSnapshot(job: Job, item: NonNullable<Job['equipment']>[number]): RecordContextSnapshot {
  return {
    job: {
      jobId: job.jobId || '',
      title: job.title || '',
      customerName: job.customerName || '',
      customerAddress: job.customerAddress || '',
      customerContact: job.customerContact || '',
      customerEmail: job.customerEmail || '',
      customerPhone: job.customerPhone || '',
      assignedStaff: job.assignedStaff || '',
      receivedDate: job.receivedDate || '',
    },
    item: {
      name: item.name || '',
      manufacturer: item.manufacturer || '',
      model: item.model || '',
      serialNumber: item.serialNumber || '',
      assetTag: item.assetTag || '',
      accessories: item.accessories || '',
      machineLocation: item.machineLocation || '',
      resolution: item.resolution || '',
      unit: item.unit || '',
      certificateNumber: item.certificateNumber || '',
    },
    capturedAt: new Date(),
  };
}

async function getJobOrThrow(jobId: string) {
  const jobSnap = await getDoc(doc(db, 'jobs', jobId));
  if (!jobSnap.exists()) {
    throw new Error(`Job ${jobId} not found`);
  }
  return jobSnap.data() as Job;
}

function findItemOrThrow(job: Job, itemId: string) {
  const item = (job.equipment || []).find((eq) => eq.id === itemId);
  if (!item) {
    throw new Error(`Item ${itemId} not found on job ${job.jobId || job.id}`);
  }
  return item;
}


export const calibrationRecordService = {
  async getRecordById(id: string): Promise<CalibrationRecord | null> {
    try {
      const docSnap = await getDoc(doc(db, RECORDS_COLLECTION, id));
      if (!docSnap.exists()) return null;
      return documentToRecord(docSnap.data(), docSnap.id);
    } catch (error) {
      console.error('Error fetching record:', error);
      throw new Error('Failed to fetch record');
    }
  },

  /**
   * Every LIVE (non-voided), non-superseded record for this job/item —
   * should be 0 or 1 under normal operation (resolveRecordForItem is the
   * intended entry point that keeps it that way). Voided records are
   * excluded (ADR-016 D1/D4) via the shared `excludeVoided` filter — this
   * is the one query resolveRecordForItem reads from, so excluding here is
   * what actually frees an item for a new record once its old one is voided.
   */
  async getRecordsForItem(jobId: string, itemId: string): Promise<CalibrationRecord[]> {
    try {
      const q = query(
        collection(db, RECORDS_COLLECTION),
        where('jobId', '==', jobId),
        where('itemId', '==', itemId),
      );
      const snapshot = await getDocs(q);
      return excludeVoided(snapshot.docs.map((d) => documentToRecord(d.data(), d.id)));
    } catch (error) {
      console.error('Error fetching records for item:', error);
      throw new Error('Failed to fetch records for item');
    }
  },

  /**
   * Phase 23 Task 5 / ADR-016 D3 — how many LIVE records (any status other
   * than voided: draft, committed, reviewed, approved, superseded)
   * reference this template, at ANY version. Used to guard a template
   * version reset (ADR-005: resetting the version counter and
   * republishing would silently overwrite the `recorderTemplateVersions`
   * snapshot an existing record's `templateId` + `templateVersion` pins).
   * Voided records are excluded via the shared `excludeVoided` filter —
   * this is the whole point of ADR-016: voiding the blocking test records
   * is what lets a reset through. A single-field equality query — no
   * composite index needed — deliberately matches existing conventions
   * here (`getDocs` + `.length`, not `getCountFromServer`) rather than
   * introducing a Firestore API this codebase uses nowhere else; for the
   * admin-only, infrequent action this guards, the difference is not worth
   * a new dependency surface.
   */
  async getRecordCountByTemplateId(templateId: string): Promise<number> {
    try {
      const q = query(collection(db, RECORDS_COLLECTION), where('templateId', '==', templateId));
      const snapshot = await getDocs(q);
      return excludeVoided(snapshot.docs.map((d) => documentToRecord(d.data(), d.id))).length;
    } catch (error) {
      console.error('Error counting records for template:', error);
      throw new Error('Failed to count records referencing this template');
    }
  },

  /**
   * Phase 25 Task 2b/2c — the LIVE (non-voided) records pinned to one
   * SPECIFIC published version, not every version of the template like
   * `getRecordCountByTemplateId` above. Backs the admin version-cleanup
   * view: a version can only be deleted at zero, and when it can't, the UI
   * names which records are pinning it rather than just disabling a
   * button (Task 2c) — this returns the records themselves, not just a
   * count, so the caller can display record numbers / job / item, not a
   * bare number. Voided records are excluded (ADR-016 D3), consistent with
   * the template-wide count and the reset guard it feeds. Reuses the
   * existing templateId-only query (single-field, already indexed) and
   * filters by `templateVersion` client-side — the same "no new composite
   * index" tradeoff `getRecordCountByTemplateId`'s own doc comment
   * explains, for the same reason: an admin-only, infrequent action over a
   * small, bounded result set.
   */
  async getRecordsPinningTemplateVersion(templateId: string, version: number): Promise<CalibrationRecord[]> {
    try {
      const q = query(collection(db, RECORDS_COLLECTION), where('templateId', '==', templateId));
      const snapshot = await getDocs(q);
      const records = excludeVoided(snapshot.docs.map((d) => documentToRecord(d.data(), d.id)));
      return records.filter((r) => r.templateVersion === version);
    } catch (error) {
      console.error('Error fetching records pinning this template version:', error);
      throw new Error('Failed to fetch records pinning this template version');
    }
  },

  /**
   * ADR-016 Task 4 — every voided record, for the recycle bin. Deliberately
   * the OPPOSITE filter from `excludeVoided` (only voided, never live) — a
   * single-field equality query, no composite index needed.
   */
  async getVoidedRecords(): Promise<CalibrationRecord[]> {
    try {
      const q = query(collection(db, RECORDS_COLLECTION), where('status', '==', 'voided'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => documentToRecord(d.data(), d.id));
    } catch (error) {
      console.error('Error fetching voided records:', error);
      throw new Error('Failed to fetch voided records');
    }
  },

  /**
   * Task 6 item binding: given a job + item, resolves what the technician
   * should see next (domain model §4, workflow step 2).
   */
  async resolveRecordForItem(
    jobId: string,
    itemId: string,
  ): Promise<
    | { action: 'create' }
    | { action: 'reopen'; record: CalibrationRecord }
    | { action: 'readonly'; record: CalibrationRecord }
  > {
    const records = await this.getRecordsForItem(jobId, itemId);
    const current = records.find((r) => r.status !== 'superseded');

    if (!current) return { action: 'create' };
    if (current.status === 'draft') return { action: 'reopen', record: current };
    return { action: 'readonly', record: current };
  },

  /**
   * Creates a Draft record for an item: resolves the item's active template,
   * pins its CURRENT published version, captures the context snapshot, and
   * seeds an empty row/environment shape from the template's defaults.
   */
  async createDraftRecord(jobId: string, itemId: string, userId: string): Promise<string> {
    try {
      const job = await getJobOrThrow(jobId);
      const item = findItemOrThrow(job, itemId);

      if (!item.equipmentTypeId) {
        throw new Error(`Item ${itemId} has no equipment type assigned — link it before recording.`);
      }

      const template = await recorderTemplateService.getActiveTemplateByEquipmentTypeId(item.equipmentTypeId);
      if (!template) {
        throw new Error(`No active recorder template for this item's equipment type.`);
      }

      const version = await recorderTemplateService.getVersion(template.id, template.version);
      if (!version) {
        throw new Error(`Recorder template "${template.name}" is active but its published version is missing.`);
      }

      const now = new Date();
      const record: Omit<CalibrationRecord, 'id'> = {
        jobId,
        itemId,
        equipmentTypeId: item.equipmentTypeId,
        templateId: template.id,
        templateVersion: template.version,
        contextSnapshot: buildContextSnapshot(job, item),
        environment: [],
        rows: Array.from(
          { length: Math.min(version.snapshot.defaultRowCount, DRAFT_STARTING_ROW_CAP) },
          () => ({} as RecordRow),
        ),
        summary: {},
        status: 'draft',
        createdAt: now,
        createdBy: userId,
      };

      const docRef = doc(collection(db, RECORDS_COLLECTION));
      await setDoc(docRef, recordToDocument(record));
      return docRef.id;
    } catch (error: any) {
      console.error('Error creating draft record:', error);
      if (error.message) throw error;
      throw new Error('Failed to create draft record');
    }
  },

  /**
   * Updates a Draft's rows/environment. Transactional, not read-then-write:
   * a plain updateDoc here could race with commitRecord (e.g. a stray
   * autosave landing just after commit) and silently write to a record that
   * is no longer a draft. The transaction re-checks status atomically with
   * the write.
   */
  async updateDraftRecord(
    id: string,
    updates: Partial<Pick<CalibrationRecord, 'environment' | 'rows' | 'reportUnit' | 'columnUnits'>>,
  ): Promise<void> {
    try {
      const recordRef = doc(db, RECORDS_COLLECTION, id);

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(recordRef);
        if (!snap.exists()) {
          throw new Error('Record not found');
        }
        const data = snap.data() as any;
        if (data.status !== 'draft') {
          throw new Error(`Cannot edit a record in status "${data.status}" — it is no longer a draft.`);
        }

        const updateData: any = {};
        if (updates.environment !== undefined) updateData.environment = updates.environment;
        if (updates.rows !== undefined) updateData.rows = updates.rows;
        if (updates.reportUnit !== undefined) updateData.reportUnit = updates.reportUnit;
        if (updates.columnUnits !== undefined) updateData.columnUnits = updates.columnUnits;

        transaction.update(recordRef, updateData);
      });
    } catch (error: any) {
      console.error('Error updating draft record:', error);
      if (error.message) throw error;
      throw new Error('Failed to update draft record');
    }
  },

  /**
   * Commits a Draft: validates completeness against the PINNED template
   * version (never the live template), evaluates row formulas and summary
   * fields via evaluateMockup, allocates the record number transactionally,
   * and freezes the record. Idempotent: calling this again on an
   * already-committed record returns the existing number without
   * re-allocating (see calibrationRecordService.test.ts for the retry proof).
   */
  async commitRecord(id: string, userId: string): Promise<{ recordNumber: string }> {
    try {
      const recordRef = doc(db, RECORDS_COLLECTION, id);

      // ── Freeze this record's reference standards (ADR-013 D6) ────────────
      // Done BEFORE the transaction: Firestore transactions cannot query, and
      // cannot fetch a variable set of documents discovered mid-transaction.
      // Same constraint that put job/item resolution ahead of the transaction
      // in createRevision.
      //
      // The window this opens — a draft edited between this pre-read and the
      // transaction — is closed inside the transaction, which re-reads the
      // record authoritatively and refuses to commit if any row names a
      // standard this pre-fetch did not capture. It fails closed.
      const preRead = await this.getRecordById(id);
      let standardSnapshots: Record<string, ReferenceStandardSnapshot> = {};
      if (preRead && preRead.status === 'draft') {
        const preVersion = await recorderTemplateService.getVersion(preRead.templateId, preRead.templateVersion);
        const preStandardColumnKey = preVersion ? findStandardColumnKey(preVersion.snapshot) : null;
        const referencedIds = collectStandardIds(preRead.rows, preStandardColumnKey);
        if (referencedIds.length > 0) {
          // ADR-014: each key names an (equipment, equation) pair, and the
          // snapshot freezes the CANONICAL ASCENDING coefficients that
          // toStandardSnapshot produces — never the stored descending form.
          const live = await resolveStandardsByKeys(referencedIds);
          standardSnapshots = Object.fromEntries(
            Object.entries(live).map(([key, { equipment, equation }]) => [
              key,
              toStandardSnapshot(equipment, equation),
            ]),
          );
        }
      }

      // ADR-015 D7: same "transactions cannot query" constraint as the
      // standard-snapshot pre-fetch above — the conversion rule library is
      // read once here, and whatever it says at THIS moment is what gets
      // frozen into conversionSnapshots below. An edit to a rule after this
      // point (even mid-transaction) cannot affect this commit.
      const conversionRules = await unitConversionRuleService.getAll();

      const result = await runTransaction(db, async (transaction) => {
        const recordSnap = await transaction.get(recordRef);
        if (!recordSnap.exists()) {
          throw new Error('Record not found');
        }
        const record = documentToRecord(recordSnap.data(), recordSnap.id);

        // Idempotent retry: a commit that already succeeded returns its
        // number rather than erroring or re-allocating.
        if (record.status === 'committed') {
          return { recordNumber: record.recordNumber! };
        }
        if (record.status !== 'draft') {
          throw new Error(`Cannot commit a record in status "${record.status}".`);
        }

        const versionRef = doc(db, 'recorderTemplateVersions', `${record.templateId}_v${record.templateVersion}`);
        const versionSnap = await transaction.get(versionRef);
        if (!versionSnap.exists()) {
          throw new Error('The pinned template version for this record no longer exists.');
        }
        const versionData = versionSnap.data() as any;
        const snapshot: RecorderTemplate = versionData.snapshot;

        const counterRef = doc(db, COUNTERS_COLLECTION, record.templateId);
        const counterSnap = await transaction.get(counterRef);
        const counterData = counterSnap.exists() ? (counterSnap.data() as any) : null;
        const counter: RecordNumberCounterState = {
          currentNumber: counterData?.currentNumber ?? 0,
          currentYear: counterData?.currentYear ?? new Date().getFullYear(),
          lastResetAt: counterData?.lastResetAt?.toDate() || undefined,
        };

        // ── Completeness checks (ADR-006 §4 invariant, ADR-010 strict empty semantics) ──
        const issues: string[] = [];

        if (record.environment.length !== snapshot.roundCount) {
          issues.push(
            `Environment data has ${record.environment.length} round(s) but the template requires ${snapshot.roundCount}.`,
          );
        }

        // Every standard a row names must have been captured above. If not,
        // the draft changed underneath us — refuse rather than evaluate the
        // row as "no standard selected", which would read as missing data.
        const standardColumnKey = findStandardColumnKey(snapshot);
        for (const standardId of collectStandardIds(record.rows, standardColumnKey)) {
          if (!standardSnapshots[standardId]) {
            issues.push(
              `A row references reference standard '${standardId}', which could not be loaded. Reopen the record and re-select it.`,
            );
          }
        }

        const envMap = environmentToEnvMap(record.environment, record.reportUnit);

        // Phase 21 Task 1a: a row where every INPUT column is blank is a row
        // the technician never used — draft creation seeds `defaultRowCount`
        // blank rows (Task 2), and without this, every one of them fails
        // completeness ("STD_C1 has no value") and blocks commit. Dropped
        // entirely here — never evaluated, never stored, never contributing
        // to a `col_*` summary aggregate — rather than kept as empty rows a
        // certificate would then have to know not to print. `originalIndex`
        // is kept only so an issue about a REAL (non-empty, but incomplete)
        // row still names the row number the technician sees in the grid.
        const nonEmptyRows = record.rows
          .map((row, originalIndex) => ({ row, originalIndex }))
          .filter(({ row }) => !isRowEmpty(snapshot, row));

        // Evaluated against the FROZEN snapshots (ADR-013 D6), never the live
        // standard documents — so recalibrating a transducer can never move
        // the numbers on an already-issued certificate.
        const evaluation = evaluateMockup(
          snapshot,
          nonEmptyRows.map((r) => r.row),
          envMap,
          standardSnapshots as StandardsById,
        );

        const evaluatedRows: RecordRow[] = [];
        for (const [filteredIndex, row] of evaluation.rows.entries()) {
          const originalRowNumber = nonEmptyRows[filteredIndex].originalIndex + 1;
          const evaluatedRow: RecordRow = {};
          for (const [key, cell] of Object.entries(row)) {
            if (cell.error) {
              issues.push(`Row ${originalRowNumber}, ${key}: ${cell.error.message}`);
            } else {
              evaluatedRow[key] = cell.value as string | number | null;
            }
          }
          evaluatedRows.push(evaluatedRow);
        }

        const evaluatedSummary: Record<string, string | number | null> = {};
        for (const [fieldId, cell] of Object.entries(evaluation.summary)) {
          if (cell.error) {
            issues.push(`Summary SUMMARY_${fieldId}: ${cell.error.message}`);
          } else {
            evaluatedSummary[fieldId] = cell.value as string | number | null;
          }
        }

        if (issues.length > 0) {
          throw new RecordNotCommittableError(issues);
        }

        // ── Allocate the number (ADR-008: on first commit, in this same transaction) ──
        const now = new Date();
        const reset = shouldResetCounter(snapshot.recordNumberFormat, counter, now);
        const nextNumber = (reset ? 0 : counter.currentNumber) + 1;
        const currentYear = now.getFullYear();
        const recordNumber = formatRecordNumber(snapshot.recordNumberFormat, nextNumber, currentYear);

        // ADR-015 D7: freeze each converted cell now, from the RAW evaluated
        // rows above and the rule library as pre-fetched before this
        // transaction — see buildConversionSnapshots' own doc comment.
        const conversionSnapshots = buildConversionSnapshots(
          snapshot,
          evaluatedRows,
          record.columnUnits,
          conversionRules,
          now,
        );

        transaction.set(counterRef, {
          currentNumber: nextNumber,
          currentYear,
          ...(reset ? { lastResetAt: Timestamp.now() } : counter.lastResetAt ? { lastResetAt: Timestamp.fromDate(counter.lastResetAt) } : {}),
        });

        transaction.update(recordRef, {
          status: 'committed',
          recordNumber,
          rows: evaluatedRows,
          summary: evaluatedSummary,
          // Frozen standards travel with the record (ADR-013 D6), so the
          // numbers above stay re-derivable after any recalibration.
          standardSnapshots: Object.fromEntries(
            Object.entries(standardSnapshots).map(([key, snap]) => [key, standardSnapshotToDocument(snap)]),
          ),
          // ADR-015 D7: frozen per-cell conversion — see buildConversionSnapshots.
          conversionSnapshots: Object.fromEntries(
            Object.entries(conversionSnapshots).map(([key, snap]) => [key, conversionSnapshotToDocument(snap)]),
          ),
          committedAt: serverTimestamp(),
          committedBy: userId,
        });

        return { recordNumber };
      });

      return result;
    } catch (error: any) {
      console.error('Error committing record:', error);
      if (error instanceof RecordNotCommittableError) throw error;
      if (error.message) throw error;
      throw new Error('Failed to commit record');
    }
  },

  /**
   * `reviewedBy` mirrors `commitRecord`'s existing `committedBy` pattern —
   * added (Phase 5c) so firestore.rules can verify the reviewer is the
   * caller (`request.auth.uid`) and enforce separation of duties
   * (reviewer != createdBy) without trusting the client.
   */
  async reviewRecord(id: string, signature: DigitalSignature, userId: string): Promise<void> {
    try {
      const recordRef = doc(db, RECORDS_COLLECTION, id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(recordRef);
        if (!snap.exists()) throw new Error('Record not found');
        const data = snap.data() as any;
        if (data.status !== 'committed') {
          throw new Error(`Cannot review a record in status "${data.status}" — it must be committed first.`);
        }
        transaction.update(recordRef, {
          status: 'reviewed',
          reviewedAt: serverTimestamp(),
          reviewedBy: userId,
          reviewerSignature: { ...signature, signedDate: Timestamp.fromDate(signature.signedDate) },
        });
      });
    } catch (error: any) {
      console.error('Error reviewing record:', error);
      if (error.message) throw error;
      throw new Error('Failed to review record');
    }
  },

  /** `approvedBy` mirrors `reviewedBy` above — same reason (Phase 5c). */
  async approveRecord(id: string, signature: DigitalSignature, userId: string): Promise<void> {
    try {
      const recordRef = doc(db, RECORDS_COLLECTION, id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(recordRef);
        if (!snap.exists()) throw new Error('Record not found');
        const data = snap.data() as any;
        if (data.status !== 'reviewed') {
          throw new Error(`Cannot approve a record in status "${data.status}" — it must be reviewed first.`);
        }
        transaction.update(recordRef, {
          status: 'approved',
          approvedAt: serverTimestamp(),
          approvedBy: userId,
          approverSignature: { ...signature, signedDate: Timestamp.fromDate(signature.signedDate) },
        });
      });
    } catch (error: any) {
      console.error('Error approving record:', error);
      if (error.message) throw error;
      throw new Error('Failed to approve record');
    }
  },

  /**
   * ADR-016 — voids a record: admin-only (enforced by firestore.rules; the
   * UI gates the action the same way, matching other admin-only actions in
   * this codebase), at ANY status, with a mandatory non-empty reason. Soft
   * delete — the document is never removed (`allow delete: if false` stays
   * exactly as written); this only flips `status` to 'voided' and records
   * why.
   *
   * `statusBeforeVoid` is captured from THIS transaction's own read of the
   * record — never inferred, never trusted from a caller-supplied value —
   * matching ADR-016 D5 and the rule's own enforcement
   * (`statusBeforeVoid == resource.data.status`).
   *
   * Returns `remainingLiveCount` — how many LIVE records (this one now
   * excluded) still reference this record's template, at any version.
   * ADR-016 D3's second half: if this was the last one, voiding it just
   * unlocked a version reset, and the caller must say so rather than let
   * that be a silent side effect (Task 5).
   */
  async voidRecord(id: string, voidedBy: string, reason: string): Promise<{ remainingLiveCount: number }> {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new Error('A reason is required to void a record.');
    }
    try {
      const recordRef = doc(db, RECORDS_COLLECTION, id);
      let templateId = '';
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(recordRef);
        if (!snap.exists()) throw new Error('Record not found');
        const data = snap.data() as any;
        if (data.status === 'voided') throw new Error('This record is already voided.');
        templateId = data.templateId;
        transaction.update(recordRef, {
          status: 'voided',
          voidedAt: serverTimestamp(),
          voidedBy,
          voidReason: trimmedReason,
          statusBeforeVoid: data.status,
        });
      });
      const remainingLiveCount = await this.getRecordCountByTemplateId(templateId);
      return { remainingLiveCount };
    } catch (error: any) {
      console.error('Error voiding record:', error);
      if (error.message) throw error;
      throw new Error('Failed to void record');
    }
  },

  /**
   * ADR-016 D5 — restores a voided record to `statusBeforeVoid`. Mirrors
   * firestore.rules' own `restoreTargetStatus()` fallback (falls back to
   * 'draft' if `statusBeforeVoid` is missing or not one of the five real
   * statuses — reachable only for a document that became 'voided' some
   * other way than this service, e.g. a console edit) so the client always
   * requests exactly what the rule will accept; a mismatch here would make
   * every restore attempt fail server-side for no visible reason.
   *
   * Deliberately does NOT clear voidedAt/voidedBy/voidReason/
   * statusBeforeVoid — the rule only allows `status` to move on restore, so
   * they remain a permanent trace that this record was once voided (the
   * same way `supersededBy` is never cleared either).
   */
  async restoreRecord(id: string): Promise<void> {
    try {
      const recordRef = doc(db, RECORDS_COLLECTION, id);
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(recordRef);
        if (!snap.exists()) throw new Error('Record not found');
        const data = snap.data() as any;
        if (data.status !== 'voided') throw new Error('This record is not voided.');
        const validStatuses = ['draft', 'committed', 'reviewed', 'approved', 'superseded'];
        const target = validStatuses.includes(data.statusBeforeVoid) ? data.statusBeforeVoid : 'draft';
        transaction.update(recordRef, { status: target });
      });
    } catch (error: any) {
      console.error('Error restoring record:', error);
      if (error.message) throw error;
      throw new Error('Failed to restore record');
    }
  },

  /**
   * Creates a new Draft that supersedes a committed-or-later record.
   * Corrections never mutate a committed record (ADR-005).
   *
   * INHERITS the original's pinned `templateVersion` and PRE-FILLS the new
   * draft's rows/environment from the original's data (ADR-005, "Revisions
   * keep the original's pinned template version" — decided after Phase 5a,
   * which had this backwards: it re-resolved to the current active template
   * and started empty). The dominant reason to revise is a data error, not a
   * method change — the measurement method didn't change, so the maths must
   * not either. Re-resolving to a newer template version would silently
   * recompute untouched readings with different maths. Pre-filling matches
   * the actual task: the technician corrects one cell, not a full re-record.
   *
   * If the reason to revise IS that the template/formula was wrong, the
   * correct action is a fresh calibration against a newly published template
   * version, not a revision — a revision assumes the method was right.
   *
   * The context snapshot is freshly re-captured from the CURRENT job/item
   * state, not inherited — unlike template version and row data, this is
   * deliberate: ADR-005 itself cites "a wrong serial number" as a paradigm
   * reason to revise, and that lives in the context snapshot. Inheriting the
   * old (wrong) snapshot would make that class of correction impossible.
   *
   * The transaction protects the invariant that actually matters: the
   * original record's status is re-checked atomically with both writes,
   * using the status field itself as the exclusivity claim — if two
   * createRevision calls race, only one can win the transaction.update on
   * `originalRef`; Firestore's optimistic-concurrency retry re-reads the
   * loser's attempt and it correctly sees "already superseded".
   */
  async createRevision(originalId: string, reason: string, userId: string): Promise<string> {
    try {
      if (!reason.trim()) {
        throw new Error('A revision reason is required.');
      }

      const original = await this.getRecordById(originalId);
      if (!original) throw new Error('Record not found');
      if (original.status === 'draft') {
        throw new Error('A draft record does not need a revision — reopen and edit it directly.');
      }
      if (original.status === 'superseded') {
        throw new Error('This record has already been superseded — revise its replacement instead.');
      }

      const job = await getJobOrThrow(original.jobId);
      const item = findItemOrThrow(job, original.itemId);

      // Confirm the pinned version this revision will inherit still exists —
      // a defensive data-integrity check, not a re-resolution to anything current.
      const pinnedVersion = await recorderTemplateService.getVersion(original.templateId, original.templateVersion);
      if (!pinnedVersion) {
        throw new Error('The pinned template version for this record no longer exists.');
      }

      const originalRef = doc(db, RECORDS_COLLECTION, originalId);
      const newRef = doc(collection(db, RECORDS_COLLECTION));

      await runTransaction(db, async (transaction) => {
        const originalSnap = await transaction.get(originalRef);
        if (!originalSnap.exists()) throw new Error('Record not found');
        const originalData = originalSnap.data() as any;

        if (originalData.status === 'draft') {
          throw new Error('A draft record does not need a revision — reopen and edit it directly.');
        }
        if (originalData.status === 'superseded') {
          throw new Error('This record has already been superseded — revise its replacement instead.');
        }

        const now = new Date();
        const revision: Omit<CalibrationRecord, 'id'> = {
          jobId: original.jobId,
          itemId: original.itemId,
          equipmentTypeId: original.equipmentTypeId,
          templateId: original.templateId,
          templateVersion: original.templateVersion,
          contextSnapshot: buildContextSnapshot(job, item),
          // Pre-filled from the original — deep-copied so editing the
          // revision's rows can never reach back and mutate the (immutable,
          // committed-or-later) original's arrays/objects.
          environment: original.environment.map((round) => ({ ...round })),
          rows: original.rows.map((row) => ({ ...row })),
          summary: {},
          status: 'draft',
          supersedes: originalId,
          revisionReason: reason,
          createdAt: now,
          createdBy: userId,
        };

        transaction.set(newRef, recordToDocument(revision));
        transaction.update(originalRef, { status: 'superseded', supersededBy: newRef.id });
      });

      return newRef.id;
    } catch (error: any) {
      console.error('Error creating revision:', error);
      if (error.message) throw error;
      throw new Error('Failed to create revision');
    }
  },
};
