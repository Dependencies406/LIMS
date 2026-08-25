import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CalibrationRecord, Job, RecorderTemplate } from '../../types';

vi.mock('../firebase', async () => {
  const { createFakeFirestore } = await import('./fakeFirestore');
  return createFakeFirestore();
});

import * as firebaseMock from '../firebase';
import {
  calibrationRecordService,
  RecordNotCommittableError,
  trimTrailingEmptyRows,
  trimDraftRows,
  reviewBlockedReason,
  approveBlockedReason,
  excludeVoided,
} from '../calibrationRecordService';
import { recorderTemplateService } from '../recorderTemplateService';
import { unitConversionRuleService } from '../unitConversionRuleService';

beforeEach(() => {
  (firebaseMock as any).store.clear();
});

// ── Fixtures ─────────────────────────────────────────────────────────────

function seedJob(jobId: string, itemId: string, equipmentTypeId: string, overrides: Partial<Job> = {}) {
  const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
  store.set(`jobs/${jobId}`, {
    data: {
      jobId,
      title: 'Test Job',
      customerName: 'Acme Labs',
      customerAddress: '123 Main St',
      customerContact: 'Jane Doe',
      customerEmail: 'jane@acme.test',
      customerPhone: '555-1234',
      assignedStaff: 'Tech One',
      receivedDate: '2026-01-01',
      equipment: [
        {
          id: itemId,
          name: 'UTM-1',
          manufacturer: 'Acme',
          model: 'X100',
          serialNumber: 'SN-1',
          assetTag: 'AT-1',
          accessories: 'None',
          machineLocation: 'Lab A',
          resolution: '0.01N',
          unit: 'N',
          certificateNumber: '',
          equipmentTypeId,
        },
      ],
      ...overrides,
    },
    version: 0,
  });
}

/** Creates + publishes a template with one formula column and one summary field. */
async function seedActiveTemplate(equipmentTypeId: string, overrides: Partial<RecorderTemplate> = {}) {
  const id = await recorderTemplateService.createTemplate({
    name: 'UTM Calibration',
    equipmentTypeId,
    roundCount: 2,
    defaultRowCount: 3,
    allowRowAdd: true,
    recordNumberFormat: {
      parts: ['UTM'],
      separator: '-',
      includeYear: false,
      yearDigits: 2,
      numberPadding: 3,
      resetPolicy: 'never',
    },
    sections: [
      {
        id: 'CAL',
        label: 'Calibration',
        order: 0,
        columns: [
          { id: 'NOM', label: 'Nominal', order: 0, type: 'number' },
          { id: 'IND', label: 'Indicated', order: 1, type: 'number' },
          { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'CAL_IND - CAL_NOM' },
        ],
      },
    ],
    summaryFields: [{ id: 'MAXDEV', label: 'Max Deviation', type: 'number', expression: 'col_max(CAL_ERR)' }],
    customFunctions: [],
    createdBy: 'admin1',
    updatedBy: 'admin1',
    ...overrides,
  });
  await recorderTemplateService.publishTemplate(id, 'admin1');
  return id;
}

const JOB_ID = 'job1';
const ITEM_ID = 'item1';
const EQTYPE_ID = 'eqtype1';

async function setupDraft(): Promise<{ templateId: string; recordId: string }> {
  seedJob(JOB_ID, ITEM_ID, EQTYPE_ID);
  const templateId = await seedActiveTemplate(EQTYPE_ID);
  const recordId = await calibrationRecordService.createDraftRecord(JOB_ID, ITEM_ID, 'tech1');
  return { templateId, recordId };
}

function completeRows(): CalibrationRecord['rows'] {
  return [
    { CAL_NOM: 100, CAL_IND: 100.2 },
    { CAL_NOM: 200, CAL_IND: 199.5 },
    { CAL_NOM: 300, CAL_IND: 300.4 },
  ];
}

function completeEnvironment(): CalibrationRecord['environment'] {
  return [
    { roundIndex: 1, temperatureC: 20.5, relativeHumidity: 55 },
    { roundIndex: 2, temperatureC: 20.7, relativeHumidity: 54 },
  ];
}

// ── Task 1: field round trip ────────────────────────────────────────────────

describe('createDraftRecord — every field round-trips', () => {
  it('persists jobId, itemId, equipmentTypeId, templateId, templateVersion, contextSnapshot, status', async () => {
    const { templateId, recordId } = await setupDraft();
    const record = await calibrationRecordService.getRecordById(recordId);

    expect(record).not.toBeNull();
    expect(record!.jobId).toBe(JOB_ID);
    expect(record!.itemId).toBe(ITEM_ID);
    expect(record!.equipmentTypeId).toBe(EQTYPE_ID);
    expect(record!.templateId).toBe(templateId);
    expect(record!.templateVersion).toBe(1);
    expect(record!.status).toBe('draft');
    expect(record!.recordNumber).toBeUndefined();
    expect(record!.createdBy).toBe('tech1');
    expect(record!.createdAt).toBeInstanceOf(Date);
  });

  it('captures the context snapshot from job and item at creation', async () => {
    const { recordId } = await setupDraft();
    const record = await calibrationRecordService.getRecordById(recordId);

    expect(record!.contextSnapshot.job).toEqual({
      jobId: JOB_ID,
      title: 'Test Job',
      customerName: 'Acme Labs',
      customerAddress: '123 Main St',
      customerContact: 'Jane Doe',
      customerEmail: 'jane@acme.test',
      customerPhone: '555-1234',
      assignedStaff: 'Tech One',
      receivedDate: '2026-01-01',
    });
    expect(record!.contextSnapshot.item).toEqual({
      name: 'UTM-1',
      manufacturer: 'Acme',
      model: 'X100',
      serialNumber: 'SN-1',
      assetTag: 'AT-1',
      accessories: 'None',
      machineLocation: 'Lab A',
      resolution: '0.01N',
      unit: 'N',
      certificateNumber: '',
    });
    expect(record!.contextSnapshot.capturedAt).toBeInstanceOf(Date);
  });

  it('seeds defaultRowCount empty rows when it is below the starting-row cap, each a distinct object', async () => {
    const { recordId } = await setupDraft();
    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.rows).toHaveLength(3);
    expect(record!.rows[0]).toEqual({});
    expect(record!.rows[0]).not.toBe(record!.rows[1]);
  });

  it('Phase 21 Task 2: caps a large defaultRowCount so a new draft never starts with a wall of blank rows', async () => {
    seedJob('job-wide', 'item-wide', 'eqtype-wide');
    await seedActiveTemplate('eqtype-wide', { defaultRowCount: 50 });
    const recordId = await calibrationRecordService.createDraftRecord('job-wide', 'item-wide', 'tech1');

    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.rows.length).toBeLessThan(50);
    expect(record!.rows).toHaveLength(5);
  });

  it('seeds an empty environment array', async () => {
    const { recordId } = await setupDraft();
    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.environment).toEqual([]);
  });

  it('rejects creating a draft for an item with no equipmentTypeId', async () => {
    seedJob('job2', 'item2', '', {});
    // Overwrite equipmentTypeId to '' explicitly on the seeded item.
    const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
    const job = store.get('jobs/job2')!;
    job.data.equipment[0].equipmentTypeId = '';

    await expect(calibrationRecordService.createDraftRecord('job2', 'item2', 'tech1')).rejects.toThrow(
      /no equipment type assigned/,
    );
  });
});

describe('updateDraftRecord — round trip and draft-only guard', () => {
  it('persists rows and environment updates', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, {
      rows: completeRows(),
      environment: completeEnvironment(),
    });

    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.rows).toEqual(completeRows());
    expect(record!.environment).toEqual(completeEnvironment());
  });

  it('rejects editing a record that is no longer a draft', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');

    await expect(
      calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows() }),
    ).rejects.toThrow(/no longer a draft/);
  });
});

// Phase 15 Task 1 (superseded): the 'selectable' unit picker's per-record
// choice, written through this SAME updateDraftRecord path — mirrors the
// two tests above exactly, one field over.
describe('updateDraftRecord — columnUnits round trip and draft-only guard (Phase 15)', () => {
  it('persists columnUnits and survives commit unrestated (partial-merge, same as reportUnit)', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, {
      rows: completeRows(),
      environment: completeEnvironment(),
      columnUnits: { CAL_ERR: 'kN' },
    });

    const beforeCommit = await calibrationRecordService.getRecordById(recordId);
    expect(beforeCommit!.columnUnits).toEqual({ CAL_ERR: 'kN' });

    await calibrationRecordService.commitRecord(recordId, 'tech1');
    const afterCommit = await calibrationRecordService.getRecordById(recordId);
    expect(afterCommit!.columnUnits).toEqual({ CAL_ERR: 'kN' });
  });

  it('rejects a columnUnits edit once the record is no longer a draft', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');

    await expect(
      calibrationRecordService.updateDraftRecord(recordId, { columnUnits: { CAL_ERR: 'kgF' } }),
    ).rejects.toThrow(/no longer a draft/);
  });
});

// ── Task 6: item binding ────────────────────────────────────────────────────

describe('resolveRecordForItem — item binding (Task 6)', () => {
  it('resolves to create when no record exists', async () => {
    seedJob(JOB_ID, ITEM_ID, EQTYPE_ID);
    await seedActiveTemplate(EQTYPE_ID);

    const resolution = await calibrationRecordService.resolveRecordForItem(JOB_ID, ITEM_ID);
    expect(resolution.action).toBe('create');
  });

  it('resolves to reopen when a draft exists', async () => {
    const { recordId } = await setupDraft();
    const resolution = await calibrationRecordService.resolveRecordForItem(JOB_ID, ITEM_ID);
    expect(resolution).toMatchObject({ action: 'reopen' });
    expect((resolution as any).record.id).toBe(recordId);
  });

  it('resolves to readonly when a committed-or-later record exists', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');

    const resolution = await calibrationRecordService.resolveRecordForItem(JOB_ID, ITEM_ID);
    expect(resolution).toMatchObject({ action: 'readonly' });
    expect((resolution as any).record.status).toBe('committed');
  });

  it('resolves to create again after the current record is superseded', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');
    await calibrationRecordService.createRevision(recordId, 'correction needed', 'tech1');

    // The revision itself is a fresh draft, so resolveRecordForItem should
    // find the REVISION (reopen), not fall through to create.
    const resolution = await calibrationRecordService.resolveRecordForItem(JOB_ID, ITEM_ID);
    expect(resolution.action).toBe('reopen');
  });
});

// ── Task 3: allocation at commit, transactional, idempotent ────────────────

describe('commitRecord — number allocation only at first commit', () => {
  it('a draft has no record number', async () => {
    const { recordId } = await setupDraft();
    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.recordNumber).toBeUndefined();
  });

  it('allocates a formatted number on commit', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });

    const result = await calibrationRecordService.commitRecord(recordId, 'tech1');
    expect(result.recordNumber).toBe('UTM-001');

    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.recordNumber).toBe('UTM-001');
    expect(record!.status).toBe('committed');
    expect(record!.committedBy).toBe('tech1');
    expect(record!.committedAt).toBeInstanceOf(Date);
  });

  it('increments across records sharing the same template', async () => {
    seedJob(JOB_ID, ITEM_ID, EQTYPE_ID);
    seedJob('job2', 'item2', EQTYPE_ID);
    await seedActiveTemplate(EQTYPE_ID);

    const id1 = await calibrationRecordService.createDraftRecord(JOB_ID, ITEM_ID, 'tech1');
    await calibrationRecordService.updateDraftRecord(id1, { rows: completeRows(), environment: completeEnvironment() });
    const result1 = await calibrationRecordService.commitRecord(id1, 'tech1');

    const id2 = await calibrationRecordService.createDraftRecord('job2', 'item2', 'tech1');
    await calibrationRecordService.updateDraftRecord(id2, { rows: completeRows(), environment: completeEnvironment() });
    const result2 = await calibrationRecordService.commitRecord(id2, 'tech1');

    expect(result1.recordNumber).toBe('UTM-001');
    expect(result2.recordNumber).toBe('UTM-002');
  });

  it('is idempotent — retrying commit on an already-committed record returns the same number without incrementing again', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });

    const first = await calibrationRecordService.commitRecord(recordId, 'tech1');
    const retry = await calibrationRecordService.commitRecord(recordId, 'tech1');

    expect(retry.recordNumber).toBe(first.recordNumber);

    // Prove the counter was only incremented once: a second, DIFFERENT
    // record commits to the very next number, not skipping one.
    seedJob('job3', 'item3', EQTYPE_ID);
    const id2 = await calibrationRecordService.createDraftRecord('job3', 'item3', 'tech1');
    await calibrationRecordService.updateDraftRecord(id2, { rows: completeRows(), environment: completeEnvironment() });
    const result2 = await calibrationRecordService.commitRecord(id2, 'tech1');
    expect(result2.recordNumber).toBe('UTM-002');
  });

  it('rejects committing a record that is reviewed/approved/superseded', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');
    await calibrationRecordService.reviewRecord(recordId, { signatureData: 'sig', signerName: 'Reviewer', signedDate: new Date() }, 'reviewer1');

    await expect(calibrationRecordService.commitRecord(recordId, 'tech1')).rejects.toThrow(/Cannot commit/);
  });

  it('concurrent commits for different records on the same template never duplicate numbers', async () => {
    seedJob(JOB_ID, ITEM_ID, EQTYPE_ID);
    seedJob('job2', 'item2', EQTYPE_ID);
    seedJob('job3', 'item3', EQTYPE_ID);
    await seedActiveTemplate(EQTYPE_ID);

    const ids = await Promise.all([
      calibrationRecordService.createDraftRecord(JOB_ID, ITEM_ID, 'tech1'),
      calibrationRecordService.createDraftRecord('job2', 'item2', 'tech1'),
      calibrationRecordService.createDraftRecord('job3', 'item3', 'tech1'),
    ]);
    await Promise.all(
      ids.map((id) => calibrationRecordService.updateDraftRecord(id, { rows: completeRows(), environment: completeEnvironment() })),
    );

    const results = await Promise.all(ids.map((id) => calibrationRecordService.commitRecord(id, 'tech1')));
    const numbers = results.map((r) => r.recordNumber);

    expect(new Set(numbers).size).toBe(3);
    expect(numbers.sort()).toEqual(['UTM-001', 'UTM-002', 'UTM-003']);
  });
});

// ── Task 4: evaluation against the PINNED version ───────────────────────────

describe('commitRecord — evaluates against the PINNED template version, not the live one', () => {
  it('proves this by editing the live template after drafting, then showing the committed values reflect the OLD pinned snapshot', async () => {
    const { templateId, recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });

    // Edit the LIVE template's formula AFTER the draft was created (still
    // pinned to version 1) and publish a v2 with a very different formula.
    await recorderTemplateService.updateTemplate(templateId, {
      sections: [
        {
          id: 'CAL',
          label: 'Calibration',
          order: 0,
          columns: [
            { id: 'NOM', label: 'Nominal', order: 0, type: 'number' },
            { id: 'IND', label: 'Indicated', order: 1, type: 'number' },
            // Deliberately different formula from v1's `CAL_IND - CAL_NOM`.
            { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: '(CAL_IND - CAL_NOM) * 1000' },
          ],
        },
      ],
    });
    await recorderTemplateService.publishTemplate(templateId, 'admin1');

    const versions = await recorderTemplateService.getAllVersions(templateId);
    expect(versions).toHaveLength(2); // v1 (pinned) and v2 (live) both exist

    await calibrationRecordService.commitRecord(recordId, 'tech1');
    const record = await calibrationRecordService.getRecordById(recordId);

    // v1's formula: CAL_IND - CAL_NOM = 100.2 - 100 = 0.2 for the first row.
    // If evaluation had used the live v2 formula instead, this would be 200.
    expect(record!.rows[0].CAL_ERR).toBeCloseTo(0.2, 10);
    expect(record!.templateVersion).toBe(1);
  });

  it('the record number format also stays pinned to what was recordNumberFormat at pin time — even though allocation reads the version at commit time, not draft time', async () => {
    // This documents current behavior precisely: templateVersion is pinned at
    // draft creation, so commitRecord always reads recorderTemplateVersions
    // for that exact pinned version — republishing changes the LIVE template
    // and creates a new version, but never rewrites the old one.
    const { templateId, recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });

    const pinnedVersionBefore = await recorderTemplateService.getVersion(templateId, 1);
    await recorderTemplateService.publishTemplate(templateId, 'admin1');
    const pinnedVersionAfter = await recorderTemplateService.getVersion(templateId, 1);

    expect(pinnedVersionAfter!.snapshot).toEqual(pinnedVersionBefore!.snapshot);
  });

  it('persists the evaluated summary', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');

    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.summary.MAXDEV).toBeCloseTo(0.4, 10);
  });
});

// ── environment.length === roundCount, and incomplete records cannot commit ─

describe('commitRecord — completeness checks', () => {
  it('rejects commit when environment.length !== roundCount', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, {
      rows: completeRows(),
      environment: [{ roundIndex: 1, temperatureC: 20, relativeHumidity: 50 }], // only 1, template needs 2
    });

    await expect(calibrationRecordService.commitRecord(recordId, 'tech1')).rejects.toThrow(RecordNotCommittableError);
  });

  it('rejects commit when a row referenced by a formula is incomplete (strict empty semantics)', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, {
      rows: [{ CAL_NOM: 100, CAL_IND: null }, ...completeRows().slice(1)],
      environment: completeEnvironment(),
    });

    await expect(calibrationRecordService.commitRecord(recordId, 'tech1')).rejects.toThrow(RecordNotCommittableError);
  });

  it('reports every issue found, not just the first', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, {
      rows: [{ CAL_NOM: 100, CAL_IND: null }],
      environment: [],
    });

    try {
      await calibrationRecordService.commitRecord(recordId, 'tech1');
      throw new Error('expected commit to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(RecordNotCommittableError);
      const issues = (error as RecordNotCommittableError).issues;
      expect(issues.some((i) => i.includes('Environment data has 0 round'))).toBe(true);
      expect(issues.some((i) => i.toLowerCase().includes('no value yet'))).toBe(true);
    }
  });

  it('does not allocate a number when commit is rejected', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: [], environment: [] });

    await expect(calibrationRecordService.commitRecord(recordId, 'tech1')).rejects.toThrow();

    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.status).toBe('draft');
    expect(record!.recordNumber).toBeUndefined();
  });
});

// ── Phase 21 Task 1a: rows with every input blank are dropped, not validated ──

describe('commitRecord — Phase 21 Task 1a: blank-row handling', () => {
  it('test 1: a record with trailing entirely-blank rows commits successfully, and the blank rows are dropped from the stored record', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, {
      rows: [...completeRows(), {}, {}], // two rows the technician never touched
      environment: completeEnvironment(),
    });

    const result = await calibrationRecordService.commitRecord(recordId, 'tech1');
    expect(result.recordNumber).toBeDefined();

    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.rows).toHaveLength(3);
  });

  it('test 2: a trailing row with SOME inputs filled is not treated as blank, and still blocks commit when incomplete', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, {
      rows: [...completeRows(), { CAL_NOM: 999 }], // one input filled, the rest missing
      environment: completeEnvironment(),
    });

    await expect(calibrationRecordService.commitRecord(recordId, 'tech1')).rejects.toThrow(RecordNotCommittableError);
  });

  it('test 3: a column aggregate ignores rows skipped as blank', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, {
      rows: [...completeRows(), {}, {}],
      environment: completeEnvironment(),
    });

    await calibrationRecordService.commitRecord(recordId, 'tech1');
    const record = await calibrationRecordService.getRecordById(recordId);
    // Same MAXDEV as plain completeRows() (0.4) — the two blank rows never
    // reached evaluateMockup, so they could not perturb the aggregate.
    expect(record!.summary.MAXDEV).toBeCloseTo(0.4, 10);
  });

  it('a blank row interspersed BEFORE a genuinely incomplete row still names the real row number', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, {
      // Row 1 blank (dropped), row 2 half-filled (kept, incomplete), row 3 complete.
      rows: [{}, { CAL_NOM: 100, CAL_IND: null }, { CAL_NOM: 300, CAL_IND: 300.4 }],
      environment: completeEnvironment(),
    });

    try {
      await calibrationRecordService.commitRecord(recordId, 'tech1');
      throw new Error('expected commit to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(RecordNotCommittableError);
      const issues = (error as RecordNotCommittableError).issues;
      // The technician sees this as row 2 in the grid — the original
      // position, not its position after blank rows are filtered out.
      expect(issues.some((i) => i.startsWith('Row 2,'))).toBe(true);
    }
  });
});

// ── Task 2: lifecycle transitions ───────────────────────────────────────────

describe('reviewRecord / approveRecord — lifecycle transitions', () => {
  async function commitADraft() {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');
    return recordId;
  }

  it('reviews a committed record', async () => {
    const recordId = await commitADraft();
    const signature = { signatureData: 'sig1', signerName: 'Reviewer One', signedDate: new Date() };
    await calibrationRecordService.reviewRecord(recordId, signature, 'reviewer1');

    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.status).toBe('reviewed');
    expect(record!.reviewerSignature).toEqual(signature);
    expect(record!.reviewedAt).toBeInstanceOf(Date);
    expect(record!.reviewedBy).toBe('reviewer1');
  });

  it('rejects reviewing a draft', async () => {
    const { recordId } = await setupDraft();
    await expect(
      calibrationRecordService.reviewRecord(recordId, { signatureData: 's', signerName: 'x', signedDate: new Date() }, 'reviewer1'),
    ).rejects.toThrow(/must be committed first/);
  });

  it('approves a reviewed record', async () => {
    const recordId = await commitADraft();
    await calibrationRecordService.reviewRecord(recordId, { signatureData: 's', signerName: 'Reviewer', signedDate: new Date() }, 'reviewer1');
    const signature = { signatureData: 'sig2', signerName: 'Approver One', signedDate: new Date() };
    await calibrationRecordService.approveRecord(recordId, signature, 'approver1');

    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.status).toBe('approved');
    expect(record!.approverSignature).toEqual(signature);
    expect(record!.approvedBy).toBe('approver1');
  });

  it('rejects approving a committed-but-not-reviewed record', async () => {
    const recordId = await commitADraft();
    await expect(
      calibrationRecordService.approveRecord(recordId, { signatureData: 's', signerName: 'x', signedDate: new Date() }, 'approver1'),
    ).rejects.toThrow(/must be reviewed first/);
  });
});

// ── Task 2: revisions link both ways, never mutate the original ────────────

describe('createRevision — links both directions, never mutates the committed original', () => {
  async function commitADraft() {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');
    return recordId;
  }

  it('creates a new draft linked via supersedes, and marks the original superseded via supersededBy', async () => {
    const originalId = await commitADraft();
    const originalBefore = await calibrationRecordService.getRecordById(originalId);

    const revisionId = await calibrationRecordService.createRevision(originalId, 'Transcription error in round 2', 'tech2');

    const revision = await calibrationRecordService.getRecordById(revisionId);
    const originalAfter = await calibrationRecordService.getRecordById(originalId);

    expect(revision!.status).toBe('draft');
    expect(revision!.supersedes).toBe(originalId);
    expect(revision!.revisionReason).toBe('Transcription error in round 2');
    expect(revision!.recordNumber).toBeUndefined();

    expect(originalAfter!.status).toBe('superseded');
    expect(originalAfter!.supersededBy).toBe(revisionId);

    // The original's recorded data is untouched — only status/supersededBy changed.
    expect(originalAfter!.rows).toEqual(originalBefore!.rows);
    expect(originalAfter!.summary).toEqual(originalBefore!.summary);
    expect(originalAfter!.recordNumber).toBe(originalBefore!.recordNumber);
  });

  // ── Task 0 (ADR-005 "Revisions keep the original's pinned template version") ──

  it('inherits the original\'s pinned templateVersion — does NOT re-resolve to the current active version', async () => {
    const { templateId, recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');

    // Publish a v2 of the template AFTER the original was committed against v1.
    await recorderTemplateService.updateTemplate(templateId, { roundCount: 3 });
    await recorderTemplateService.publishTemplate(templateId, 'admin1');

    const revisionId = await calibrationRecordService.createRevision(recordId, 'fix a typo', 'tech2');
    const revision = await calibrationRecordService.getRecordById(revisionId);

    expect(revision!.templateId).toBe(templateId);
    expect(revision!.templateVersion).toBe(1); // NOT 2, even though v2 is now active
  });

  it('pre-fills the new draft with the original\'s rows and environment', async () => {
    const originalId = await commitADraft();
    const original = await calibrationRecordService.getRecordById(originalId);

    const revisionId = await calibrationRecordService.createRevision(originalId, 'one cell was wrong', 'tech2');
    const revision = await calibrationRecordService.getRecordById(revisionId);

    expect(revision!.rows).toEqual(original!.rows);
    expect(revision!.environment).toEqual(original!.environment);
  });

  it('deep-copies rows/environment so editing the revision cannot mutate the original', async () => {
    const originalId = await commitADraft();
    const originalBefore = await calibrationRecordService.getRecordById(originalId);
    const revisionId = await calibrationRecordService.createRevision(originalId, 'correction', 'tech2');

    await calibrationRecordService.updateDraftRecord(revisionId, {
      rows: [{ CAL_NOM: 999, CAL_IND: 999 }],
      environment: [{ roundIndex: 1, temperatureC: 99, relativeHumidity: 1 }],
    });

    const originalAfter = await calibrationRecordService.getRecordById(originalId);
    expect(originalAfter!.rows).toEqual(originalBefore!.rows);
    expect(originalAfter!.environment).toEqual(originalBefore!.environment);
  });

  it('a revision that inherits already-complete data can be committed immediately, with no further edits', async () => {
    const originalId = await commitADraft();
    const revisionId = await calibrationRecordService.createRevision(originalId, 'fix', 'tech2');

    // No updateDraftRecord call — the pre-filled data alone must be enough.
    const result = await calibrationRecordService.commitRecord(revisionId, 'tech2');
    expect(result.recordNumber).toBe('UTM-002');
  });

  it('re-captures a fresh context snapshot rather than inheriting the original\'s — a wrong serial number must be correctable', async () => {
    const originalId = await commitADraft();

    // Fix the item's serial number on the job — simulating exactly the
    // paradigm case ADR-005 cites: "a wrong serial number".
    const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
    const job = store.get(`jobs/${JOB_ID}`)!;
    job.data.equipment[0].serialNumber = 'SN-CORRECTED';

    const revisionId = await calibrationRecordService.createRevision(originalId, 'wrong serial number', 'tech2');
    const revision = await calibrationRecordService.getRecordById(revisionId);

    expect(revision!.contextSnapshot.item.serialNumber).toBe('SN-CORRECTED');
  });

  it('rejects revising a draft', async () => {
    const { recordId } = await setupDraft();
    await expect(calibrationRecordService.createRevision(recordId, 'reason', 'tech1')).rejects.toThrow(
      /does not need a revision/,
    );
  });

  it('rejects revising an already-superseded record', async () => {
    const originalId = await commitADraft();
    await calibrationRecordService.createRevision(originalId, 'first correction', 'tech2');

    await expect(calibrationRecordService.createRevision(originalId, 'second correction', 'tech2')).rejects.toThrow(
      /already been superseded/,
    );
  });

  it('requires a non-empty reason', async () => {
    const originalId = await commitADraft();
    await expect(calibrationRecordService.createRevision(originalId, '  ', 'tech2')).rejects.toThrow(/reason is required/);
  });

  it('a revision can itself be committed and gets its own record number', async () => {
    const originalId = await commitADraft();
    const revisionId = await calibrationRecordService.createRevision(originalId, 'fix', 'tech2');

    const result = await calibrationRecordService.commitRecord(revisionId, 'tech2');

    expect(result.recordNumber).toBe('UTM-002');
  });
});

// ── ADR-013 D6: standards are snapshotted at commit ─────────────────────────

describe('commitRecord — reference standard snapshotting (ADR-013 D6, ADR-014 D6)', () => {
  const EQUIP_ID = 'CAL-FRC-001';
  const EQUATION_ID = 'eq-1-10N';
  /** The composite (equipment, equation) key a `standard` cell holds (ADR-014 D3). */
  const STD_ID = `${EQUIP_ID}::${EQUATION_ID}`;

  /**
   * Seeds the equipment record and its conversion equation.
   *
   * `descendingCoefficients` is written in the order Firestore actually holds
   * — index 0 is the HIGHEST degree. The snapshot assertions below expect
   * ASCENDING, so these tests fail if the adapter is ever skipped on the
   * commit path (ADR-014 D4/D6).
   */
  function seedStandard(descendingCoefficients: number[]) {
    const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
    store.set(`equipmentControl/${EQUIP_ID}`, {
      data: {
        name: 'Force transducer',
        category: 'FRC',
        serialNumber: 'SN-001',
        isReferenceStandard: true,
        status: 'active',
        lastCalibrationDate: '2026-01-15',
        nextCalibrationDate: '2027-01-15',
      },
      version: 0,
    });
    store.set(`equipmentControl/${EQUIP_ID}/conversionEquations/${EQUATION_ID}`, {
      data: {
        name: '1-10 N',
        inputUnit: 'mV/V',
        outputUnit: 'N',
        degree: descendingCoefficients.length - 1,
        coefficients: descendingCoefficients.map((value) => ({
          value,
          inputMode: 'decimal',
          raw: String(value),
        })),
        // Deliberately not 1: ADR-014 D5 forbids applying this in the recorder
        // path, so the committed force must be unaffected by it.
        divisor: 1000,
        uCal: 0.047,
        createdAt: new Date('2026-01-15'),
      },
      version: 0,
    });
  }

  /** A template whose force column converts the reading via the row's standard. */
  async function seedStandardTemplate(equipmentTypeId: string) {
    return seedActiveTemplate(equipmentTypeId, {
      sections: [
        {
          id: 'M',
          label: 'Measurement',
          order: 0,
          columns: [
            { id: 'STDSEL', label: 'Standard', order: 0, type: 'standard' },
            { id: 'R', label: 'Reading', order: 1, type: 'number' },
            { id: 'F', label: 'Force', order: 2, type: 'formula', expression: 'STD_C1 * M_R' },
          ],
        },
      ],
      summaryFields: [],
    } as any);
  }

  async function commitWithStandard(): Promise<string> {
    seedJob(JOB_ID, ITEM_ID, EQTYPE_ID);
    seedStandard([10, 0]); // stored descending → F = 10R
    await seedStandardTemplate(EQTYPE_ID);
    const recordId = await calibrationRecordService.createDraftRecord(JOB_ID, ITEM_ID, 'tech1');
    await calibrationRecordService.updateDraftRecord(recordId, {
      rows: [{ M_STDSEL: STD_ID, M_R: 2 }],
      environment: completeEnvironment(),
    });
    await calibrationRecordService.commitRecord(recordId, 'tech1');
    return recordId;
  }

  it('stores a snapshot of every standard the rows reference', async () => {
    const recordId = await commitWithStandard();
    const record = await calibrationRecordService.getRecordById(recordId);

    expect(record!.standardSnapshots).toBeDefined();
    // ASCENDING, though the equation stored [10, 0] descending (ADR-014 D6).
    expect(record!.standardSnapshots![STD_ID].coefficients).toEqual([0, 10]);
    expect(record!.standardSnapshots![STD_ID].serialNumber).toBe('SN-001');
    expect(record!.standardSnapshots![STD_ID].uCal).toBe(0.047);
    // The parent equipment's identity and dates travel with the snapshot.
    expect(record!.standardSnapshots![STD_ID].equipmentId).toBe(EQUIP_ID);
    expect(record!.standardSnapshots![STD_ID].equationId).toBe(EQUATION_ID);
  });

  it('snapshots the CANONICAL ASCENDING coefficients, not the stored descending form', async () => {
    const recordId = await commitWithStandard();
    const record = await calibrationRecordService.getRecordById(recordId);

    const stored = record!.standardSnapshots![STD_ID].coefficients;
    expect(stored).toEqual([0, 10]);
    // The stored form would be [10, 0]. If it ever appears here, a reader
    // downstream could reverse it a second time and invert the polynomial.
    expect(stored).not.toEqual([10, 0]);
  });

  it('does NOT apply the equation divisor (ADR-014 D5) — a divisor of 1000 changes nothing', async () => {
    // seedStandard stores divisor: 1000. Applying it would give 0.02, not 20.
    const recordId = await commitWithStandard();
    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.rows[0].M_F).toBe(20);
  });

  it('evaluates using the standard as it was at commit', async () => {
    const recordId = await commitWithStandard();
    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.rows[0].M_F).toBe(20); // 10 * 2
  });

  /**
   * The Phase 5a pinned-template proof, in the same shape, for standards:
   * recalibrating a transducer must never move the numbers on a certificate
   * that has already been issued.
   */
  it('editing the LIVE standard after commit does not move the committed numbers', async () => {
    const recordId = await commitWithStandard();
    const before = await calibrationRecordService.getRecordById(recordId);

    // The transducer is recalibrated: its coefficients change tenfold.
    seedStandard([100, 0]);

    const after = await calibrationRecordService.getRecordById(recordId);

    // The committed force is still 20, not 200.
    expect(after!.rows[0].M_F).toBe(20);
    expect(after!.rows[0].M_F).toEqual(before!.rows[0].M_F);
    // And the snapshot still carries the coefficients actually used.
    expect(after!.standardSnapshots![STD_ID].coefficients).toEqual([0, 10]);
  });

  it('a record with no standard column commits normally, with an empty snapshot map', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, {
      rows: completeRows(),
      environment: completeEnvironment(),
    });
    await calibrationRecordService.commitRecord(recordId, 'tech1');

    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.standardSnapshots).toEqual({});
  });

  it('refuses to commit a row whose standard cannot be loaded', async () => {
    seedJob(JOB_ID, ITEM_ID, EQTYPE_ID);
    await seedStandardTemplate(EQTYPE_ID);
    const recordId = await calibrationRecordService.createDraftRecord(JOB_ID, ITEM_ID, 'tech1');
    await calibrationRecordService.updateDraftRecord(recordId, {
      rows: [{ M_STDSEL: 'no-such-standard', M_R: 2 }],
      environment: completeEnvironment(),
    });

    await expect(calibrationRecordService.commitRecord(recordId, 'tech1')).rejects.toThrow(
      RecordNotCommittableError,
    );
  });
});

// ── ADR-015 D7: per-cell conversion snapshot, frozen at commit ─────────────

describe('commitRecord — ADR-015 D7: conversion snapshot frozen at commit', () => {
  function templateWithConversionColumn(): Partial<RecorderTemplate> {
    return {
      sections: [
        {
          id: 'CAL', label: 'Calibration', order: 0,
          columns: [
            { id: 'NOM', label: 'Nominal', order: 0, type: 'number' },
            { id: 'IND', label: 'Indicated', order: 1, type: 'number' },
            {
              id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'CAL_IND - CAL_NOM',
              unitMode: 'fixed', unit: '%', conversionEnabled: true, conversionSourceUnit: 'mV/V',
            },
          ],
        },
      ],
    };
  }

  async function setupDraftWithConversion(): Promise<{ templateId: string; recordId: string }> {
    seedJob(JOB_ID, ITEM_ID, EQTYPE_ID);
    const templateId = await seedActiveTemplate(EQTYPE_ID, templateWithConversionColumn());
    const recordId = await calibrationRecordService.createDraftRecord(JOB_ID, ITEM_ID, 'tech1');
    return { templateId, recordId };
  }

  it('freezes ruleId/expression/source/target/raw/converted for each converted cell', async () => {
    const { recordId } = await setupDraftWithConversion();
    const ruleId = await unitConversionRuleService.add({
      name: 'mV/V to %', fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * 100', active: true, createdBy: 'admin1',
    });

    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');

    const committed = await calibrationRecordService.getRecordById(recordId);
    expect(committed?.conversionSnapshots).toBeDefined();

    // Row 0: CAL_ERR = 100.2 - 100 = 0.2 (raw), converted = 0.2 * 100 = 20.
    const snap0 = committed!.conversionSnapshots!['0:CAL_ERR'];
    expect(snap0).toBeDefined();
    expect(snap0.ruleId).toBe(ruleId);
    expect(snap0.ruleName).toBe('mV/V to %');
    expect(snap0.expression).toBe('VALUE * 100');
    expect(snap0.sourceUnit).toBe('mV/V');
    expect(snap0.targetUnit).toBe('%');
    expect(snap0.rawValue).toBeCloseTo(0.2, 10);
    expect(snap0.convertedValue).toBeCloseTo(20, 10);
    expect(snap0.capturedAt).toBeInstanceOf(Date);

    // Row 1: CAL_ERR = 199.5 - 200 = -0.5, converted = -50.
    const snap1 = committed!.conversionSnapshots!['1:CAL_ERR'];
    expect(snap1.rawValue).toBeCloseTo(-0.5, 10);
    expect(snap1.convertedValue).toBeCloseTo(-50, 10);
  });

  it('required test 10: editing the LIVE rule after commit does not move the committed numbers', async () => {
    const { recordId } = await setupDraftWithConversion();
    const ruleId = await unitConversionRuleService.add({
      name: 'mV/V to %', fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * 100', active: true, createdBy: 'admin1',
    });
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');

    const beforeEdit = await calibrationRecordService.getRecordById(recordId);
    const snapshotBeforeEdit = beforeEdit!.conversionSnapshots!['0:CAL_ERR'];
    expect(snapshotBeforeEdit.convertedValue).toBeCloseTo(20, 10);

    // Edit the LIVE rule to something wildly different — if the render path
    // (or, worse, the stored snapshot) re-derived from the live rule, this
    // would move the certificate's numbers.
    const existing = (await unitConversionRuleService.getAll())[0];
    await unitConversionRuleService.update(ruleId, existing, { expression: 'VALUE * 999999' });

    const afterEdit = await calibrationRecordService.getRecordById(recordId);
    const snapshotAfterEdit = afterEdit!.conversionSnapshots!['0:CAL_ERR'];

    expect(snapshotAfterEdit.expression).toBe('VALUE * 100'); // still the OLD expression, not the edited one
    expect(snapshotAfterEdit.convertedValue).toBeCloseTo(20, 10); // still the OLD number
    expect(snapshotAfterEdit).toEqual(snapshotBeforeEdit); // byte-for-byte identical to what commit produced
  });

  it('a formula column without conversionEnabled contributes no entries', async () => {
    const { recordId } = await setupDraft(); // the plain template, no conversion
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');
    const committed = await calibrationRecordService.getRecordById(recordId);
    expect(committed?.conversionSnapshots).toEqual({});
  });

  it('when no rule exists for the declared pair at commit time, no snapshot is created for that cell (D6 failure, not a D7 snapshot)', async () => {
    const { recordId } = await setupDraftWithConversion(); // no rule added
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');
    const committed = await calibrationRecordService.getRecordById(recordId);
    expect(committed?.conversionSnapshots).toEqual({});
  });
});

// ── Phase 22 Task 3: trailing blank-row trim ────────────────────────────────

describe('trimTrailingEmptyRows — pure trim logic', () => {
  it('test 6: trims trailing wholly-empty rows, and leaves a blank row between two populated rows alone', () => {
    const tpl = { sections: [{ id: 'CAL', label: 'x', order: 0, columns: [
      { id: 'NOM', label: 'a', order: 0, type: 'number' },
      { id: 'IND', label: 'b', order: 1, type: 'number' },
    ] }] } as RecorderTemplate;

    const rows = [
      { CAL_NOM: 100, CAL_IND: 100.2 }, // populated
      {},                                // blank, BETWEEN populated rows — must survive
      { CAL_NOM: 200, CAL_IND: 199.5 }, // populated
      {},                                // trailing blank — trimmed
      {},                                // trailing blank — trimmed
    ];

    const result = trimTrailingEmptyRows(tpl, rows);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual({}); // the between-rows blank survived
  });

  it('never trims below a minimum of 1 row, even when every row is blank', () => {
    const tpl = { sections: [{ id: 'CAL', label: 'x', order: 0, columns: [{ id: 'NOM', label: 'a', order: 0, type: 'number' }] }] } as RecorderTemplate;
    const result = trimTrailingEmptyRows(tpl, [{}, {}, {}]);
    expect(result).toHaveLength(1);
  });

  it('does nothing when there are no trailing blank rows', () => {
    const tpl = { sections: [{ id: 'CAL', label: 'x', order: 0, columns: [{ id: 'NOM', label: 'a', order: 0, type: 'number' }] }] } as RecorderTemplate;
    const rows = [{ CAL_NOM: 1 }, { CAL_NOM: 2 }];
    expect(trimTrailingEmptyRows(tpl, rows)).toEqual(rows);
  });
});

describe('trimDraftRows — the ADR-005 gate', () => {
  const tpl = { sections: [{ id: 'CAL', label: 'x', order: 0, columns: [{ id: 'NOM', label: 'a', order: 0, type: 'number' }] }] } as RecorderTemplate;
  const rowsWithTrailingBlanks = [{ CAL_NOM: 1 }, {}, {}];

  it('trims for a draft', () => {
    const result = trimDraftRows('draft', tpl, rowsWithTrailingBlanks);
    expect(result.removedCount).toBe(2);
    expect(result.rows).toHaveLength(1);
  });

  it.each(['committed', 'reviewed', 'approved', 'superseded'] as const)(
    'test 7: is a no-op for a %s record — never trims, returns the SAME array back',
    (status) => {
      const result = trimDraftRows(status, tpl, rowsWithTrailingBlanks);
      expect(result.removedCount).toBe(0);
      expect(result.rows).toBe(rowsWithTrailingBlanks); // same reference, not a copy
    },
  );
});

describe('commitRecord/updateDraftRecord — Phase 22 Task 3: trim persists via the existing write path', () => {
  it('test 8: persisting a trim through updateDraftRecord round-trips correctly, and a committed record is never touched by the same call', async () => {
    const { recordId } = await setupDraft(); // seeds 3 blank rows (defaultRowCount: 3)
    const record = await calibrationRecordService.getRecordById(recordId);
    expect(record!.status).toBe('draft');

    const rowsWithData = [{ CAL_NOM: 1, CAL_IND: 1.1 }, {}, {}];
    await calibrationRecordService.updateDraftRecord(recordId, { rows: rowsWithData });

    const reloaded = await calibrationRecordService.getRecordById(recordId);
    const { rows: trimmed, removedCount } = trimDraftRows(reloaded!.status, tplFromSeededTemplate(), reloaded!.rows);
    expect(removedCount).toBe(2);

    await calibrationRecordService.updateDraftRecord(recordId, { rows: trimmed });
    const afterTrim = await calibrationRecordService.getRecordById(recordId);
    expect(afterTrim!.rows).toHaveLength(1);

    // Now commit, and confirm trimDraftRows is a no-op against the committed copy —
    // proving the gate, not just "nobody called it again".
    await calibrationRecordService.updateDraftRecord(recordId, {
      rows: [{ CAL_NOM: 100, CAL_IND: 100.2 }],
      environment: completeEnvironment(),
    });
    await calibrationRecordService.commitRecord(recordId, 'tech1');
    const committed = await calibrationRecordService.getRecordById(recordId);
    expect(committed!.status).toBe('committed');

    const committedResult = trimDraftRows(committed!.status, tplFromSeededTemplate(), committed!.rows);
    expect(committedResult.removedCount).toBe(0);
    expect(committedResult.rows).toBe(committed!.rows);
  });

  /** Matches seedActiveTemplate's own CAL_NOM/CAL_IND/CAL_ERR shape, for isRowEmpty's input-column check. */
  function tplFromSeededTemplate(): RecorderTemplate {
    return {
      sections: [{
        id: 'CAL', label: 'Calibration', order: 0,
        columns: [
          { id: 'NOM', label: 'Nominal', order: 0, type: 'number' },
          { id: 'IND', label: 'Indicated', order: 1, type: 'number' },
          { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'CAL_IND - CAL_NOM' },
        ],
      }],
    } as RecorderTemplate;
  }
});

// ── Phase 23 Task 3: mirror firestore.rules' separation-of-duties gates ────

describe('reviewBlockedReason / approveBlockedReason — mirror firestore.rules exactly', () => {
  it('test 4: review is blocked for the record creator, even with permission', () => {
    expect(reviewBlockedReason(true, 'user-a', 'user-a')).toBe(
      'A record must be reviewed by someone other than the person who recorded it.',
    );
  });

  it('review is permitted for someone other than the creator, with permission', () => {
    expect(reviewBlockedReason(true, 'user-b', 'user-a')).toBeNull();
  });

  it('test 5 (revised 2026-08-19): approve is permitted for the same person who reviewed it, with permission — ADR-005 approver != reviewer relaxed', () => {
    expect(approveBlockedReason(true)).toBeNull();
  });

  it('approve is permitted for someone other than the reviewer too, with permission', () => {
    expect(approveBlockedReason(true)).toBeNull();
  });

  it('test 6: neither is offered without the matching permission, regardless of who the caller is', () => {
    expect(reviewBlockedReason(false, 'user-b', 'user-a')).toBe("You don't have permission to review records.");
    expect(approveBlockedReason(false)).toBe("You don't have permission to approve records.");
  });
});

// ── ADR-016: voiding records ─────────────────────────────────────────────────

describe('excludeVoided — the one shared filter', () => {
  it('drops only voided records, keeps every other status', () => {
    const rows = [
      { id: '1', status: 'draft' },
      { id: '2', status: 'voided' },
      { id: '3', status: 'committed' },
      { id: '4', status: 'superseded' },
    ] as unknown as CalibrationRecord[];
    expect(excludeVoided(rows).map((r) => r.id)).toEqual(['1', '3', '4']);
  });
});

describe('calibrationRecordService — ADR-016 void/restore', () => {
  it('test 1a: voidRecord rejects an empty or whitespace-only reason, client-side, before any write', async () => {
    const { recordId } = await setupDraft();
    await expect(calibrationRecordService.voidRecord(recordId, 'admin1', '')).rejects.toThrow(/reason is required/i);
    await expect(calibrationRecordService.voidRecord(recordId, 'admin1', '   ')).rejects.toThrow(/reason is required/i);

    const stillDraft = await calibrationRecordService.getRecordById(recordId);
    expect(stillDraft!.status).toBe('draft');
  });

  it('voids a draft record and stamps voidedAt/voidedBy/voidReason/statusBeforeVoid', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.voidRecord(recordId, 'admin1', 'test record, not a real calibration');

    const voided = await calibrationRecordService.getRecordById(recordId);
    expect(voided!.status).toBe('voided');
    expect(voided!.statusBeforeVoid).toBe('draft');
    expect(voided!.voidedBy).toBe('admin1');
    expect(voided!.voidReason).toBe('test record, not a real calibration');
    expect(voided!.voidedAt).toBeInstanceOf(Date);
  });

  it('test 7: the document is never hard-deleted — getRecordById still finds it after voiding', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.voidRecord(recordId, 'admin1', 'cleanup');
    const stillExists = await calibrationRecordService.getRecordById(recordId);
    expect(stillExists).not.toBeNull();
  });

  it('test 8: voiding an approved record is permitted (not blocked) — the warning is a UI concern, not a service-layer refusal', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');
    await calibrationRecordService.reviewRecord(
      recordId,
      { signatureData: 's', signerName: 'Reviewer', signedDate: new Date() },
      'reviewer1',
    );
    await calibrationRecordService.approveRecord(
      recordId,
      { signatureData: 's', signerName: 'Approver', signedDate: new Date() },
      'approver1',
    );

    await calibrationRecordService.voidRecord(recordId, 'admin1', 'was recorded against the wrong item entirely');
    const voided = await calibrationRecordService.getRecordById(recordId);
    expect(voided!.status).toBe('voided');
    expect(voided!.statusBeforeVoid).toBe('approved');
  });

  it('refuses to void an already-voided record', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.voidRecord(recordId, 'admin1', 'first void');
    await expect(calibrationRecordService.voidRecord(recordId, 'admin1', 'second void')).rejects.toThrow(/already voided/i);
  });

  it('test 6: restoreRecord returns the exact statusBeforeVoid, and leaves the void trail in place', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.updateDraftRecord(recordId, { rows: completeRows(), environment: completeEnvironment() });
    await calibrationRecordService.commitRecord(recordId, 'tech1');
    await calibrationRecordService.voidRecord(recordId, 'admin1', 'test data');

    await calibrationRecordService.restoreRecord(recordId);
    const restored = await calibrationRecordService.getRecordById(recordId);
    expect(restored!.status).toBe('committed');
    // Trail intentionally NOT cleared (matches supersededBy's own convention).
    expect(restored!.voidReason).toBe('test data');
    expect(restored!.voidedBy).toBe('admin1');
    expect(restored!.statusBeforeVoid).toBe('committed');
  });

  it('restoreRecord falls back to draft when statusBeforeVoid is missing (out-of-band voided document)', async () => {
    const { recordId } = await setupDraft();
    // Simulate a document that reached 'voided' some other way (e.g. a
    // console edit) with no statusBeforeVoid at all — bypass the service's
    // own voidRecord entirely via a raw updateDraftRecord-shaped write is
    // not possible client-side (draft-only), so reach into the fake store
    // directly to model the out-of-band case this fallback exists for.
    const store = (firebaseMock as any).store as Map<string, { data: any; version: number }>;
    const key = `records/${recordId}`;
    const entry = store.get(key)!;
    entry.data.status = 'voided';
    delete entry.data.statusBeforeVoid;

    await calibrationRecordService.restoreRecord(recordId);
    const restored = await calibrationRecordService.getRecordById(recordId);
    expect(restored!.status).toBe('draft');
  });

  it('refuses to restore a record that is not voided', async () => {
    const { recordId } = await setupDraft();
    await expect(calibrationRecordService.restoreRecord(recordId)).rejects.toThrow(/not voided/i);
  });
});

describe('getRecordsForItem / resolveRecordForItem — ADR-016 D4: voided records excluded', () => {
  it('test 2/3: a voided draft no longer blocks resolveRecordForItem — the item accepts a new record', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.voidRecord(recordId, 'admin1', 'wrong item, redo');

    const resolution = await calibrationRecordService.resolveRecordForItem(JOB_ID, ITEM_ID);
    expect(resolution.action).toBe('create');
  });

  it('test 2: getRecordsForItem excludes the voided record entirely', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.voidRecord(recordId, 'admin1', 'wrong item, redo');

    const records = await calibrationRecordService.getRecordsForItem(JOB_ID, ITEM_ID);
    expect(records.find((r) => r.id === recordId)).toBeUndefined();
  });

  it('a LIVE record for the same item is still found normally alongside a voided one', async () => {
    const { recordId } = await setupDraft();
    await calibrationRecordService.voidRecord(recordId, 'admin1', 'wrong item, redo');

    // A fresh draft for the SAME item, now that the old one is voided.
    const newId = await calibrationRecordService.createDraftRecord(JOB_ID, ITEM_ID, 'tech1');
    const records = await calibrationRecordService.getRecordsForItem(JOB_ID, ITEM_ID);
    expect(records.map((r) => r.id)).toEqual([newId]);
  });
});

describe('getRecordCountByTemplateId — ADR-016 D3: counts live records only', () => {
  it('test 4: a voided record does not count toward the template reference count', async () => {
    const { templateId, recordId } = await setupDraft();
    expect(await calibrationRecordService.getRecordCountByTemplateId(templateId)).toBe(1);

    await calibrationRecordService.voidRecord(recordId, 'admin1', 'test record');
    expect(await calibrationRecordService.getRecordCountByTemplateId(templateId)).toBe(0);
  });

  it('test 5: voiding the LAST live record referencing a template makes a previously-refused version reset succeed', async () => {
    const { templateId, recordId } = await setupDraft();
    await recorderTemplateService.publishTemplate(templateId, 'admin1'); // v2, active

    const countFn = (id: string) => calibrationRecordService.getRecordCountByTemplateId(id);
    await expect(recorderTemplateService.resetTemplateVersion(templateId, 'admin1', countFn)).rejects.toThrow();

    const { remainingLiveCount } = await calibrationRecordService.voidRecord(recordId, 'admin1', 'last blocking record');
    expect(remainingLiveCount).toBe(0);

    await expect(recorderTemplateService.resetTemplateVersion(templateId, 'admin1', countFn)).resolves.toBeUndefined();
  });

  it('voiding a record that is NOT the last one reports the remaining live count, not zero', async () => {
    seedJob('job-extra', 'item-extra', EQTYPE_ID);
    const { recordId: firstId } = await setupDraft();
    const secondId = await calibrationRecordService.createDraftRecord('job-extra', 'item-extra', 'tech1');

    const { remainingLiveCount } = await calibrationRecordService.voidRecord(firstId, 'admin1', 'test record');
    expect(remainingLiveCount).toBe(1);
    // secondId is still live.
    expect(await calibrationRecordService.getRecordCountByTemplateId((await calibrationRecordService.getRecordById(secondId))!.templateId)).toBe(1);
  });
});

// ── Phase 25 Task 2b/2c: per-version pin count, and its own voided-exclusion ──

describe('getRecordsPinningTemplateVersion — the per-version pin list behind the version-cleanup admin view', () => {
  it('lists the live record pinned to a specific version, and nothing pinned to a different one', async () => {
    const { templateId, recordId } = await setupDraft(); // draft pins v1
    const pinsV1 = await calibrationRecordService.getRecordsPinningTemplateVersion(templateId, 1);
    expect(pinsV1.map((r) => r.id)).toEqual([recordId]);

    const pinsV2 = await calibrationRecordService.getRecordsPinningTemplateVersion(templateId, 2);
    expect(pinsV2).toEqual([]);
  });

  it('test 7: a voided record does not count as pinning its version — the version becomes deletable after voiding', async () => {
    const { templateId, recordId } = await setupDraft(); // draft pins v1

    // Refused while the (live) draft still pins v1.
    const countFn = (id: string, version: number) =>
      calibrationRecordService.getRecordsPinningTemplateVersion(id, version).then((r) => r.length);
    await expect(recorderTemplateService.deleteVersion(templateId, 1, countFn)).rejects.toThrow(/Cannot delete version 1/);
    expect(await calibrationRecordService.getRecordsPinningTemplateVersion(templateId, 1)).toHaveLength(1);

    await calibrationRecordService.voidRecord(recordId, 'admin1', 'test record');

    // Voided -> excluded from the pin list entirely (ADR-016 D3), same rule
    // getRecordCountByTemplateId already applies template-wide.
    expect(await calibrationRecordService.getRecordsPinningTemplateVersion(templateId, 1)).toEqual([]);

    // test 6: now deletable, since nothing LIVE pins it.
    await expect(recorderTemplateService.deleteVersion(templateId, 1, countFn)).resolves.toBeUndefined();
    expect(await recorderTemplateService.getVersion(templateId, 1)).toBeNull();
  });
});

describe('calibrationRecordService.getVoidedRecords', () => {
  it('lists only voided records, with the full void trail', async () => {
    const { recordId: liveId } = await setupDraft();
    seedJob('job-b', 'item-b', EQTYPE_ID);
    const voidedId = await calibrationRecordService.createDraftRecord('job-b', 'item-b', 'tech1');
    await calibrationRecordService.voidRecord(voidedId, 'admin1', 'duplicate entry');

    const voided = await calibrationRecordService.getVoidedRecords();
    expect(voided.map((r) => r.id)).toEqual([voidedId]);
    expect(voided[0].voidReason).toBe('duplicate entry');
    expect(voided.find((r) => r.id === liveId)).toBeUndefined();
  });
});
