import { describe, it, expect } from 'vitest';
import {
  planEquipmentIdBackfill,
  applyBackfillPlan,
  formatBackfillReport,
  type JobLike,
} from '../equipmentIdBackfill';

function idGen(prefix = 'gen') {
  let n = 0;
  return () => `${prefix}_${++n}`;
}

describe('planEquipmentIdBackfill', () => {
  it('plans a fill for every item missing an id', () => {
    const jobs: JobLike[] = [
      { id: 'job1', equipment: [{ name: 'A' }, { name: 'B', id: 'existing' }, { name: 'C' }] },
    ];
    const report = planEquipmentIdBackfill(jobs, idGen());

    expect(report.totalJobs).toBe(1);
    expect(report.totalEquipmentItems).toBe(3);
    expect(report.itemsAlreadyHavingId).toBe(1);
    expect(report.itemsMissingId).toBe(2);
    expect(report.jobsNeedingChanges).toHaveLength(1);
    expect(report.jobsNeedingChanges[0].indicesToFill).toEqual([0, 2]);
    expect(report.jobsNeedingChanges[0].generatedIds).toEqual(['gen_1', 'gen_2']);
  });

  it('produces an empty plan when every item already has an id (idempotent)', () => {
    const jobs: JobLike[] = [
      { id: 'job1', equipment: [{ name: 'A', id: 'a1' }, { name: 'B', id: 'b1' }] },
    ];
    const report = planEquipmentIdBackfill(jobs, idGen());

    expect(report.itemsMissingId).toBe(0);
    expect(report.jobsNeedingChanges).toHaveLength(0);
  });

  it('treats an empty-string or whitespace-only id as missing', () => {
    const jobs: JobLike[] = [
      { id: 'job1', equipment: [{ name: 'A', id: '' }, { name: 'B', id: '   ' }] },
    ];
    const report = planEquipmentIdBackfill(jobs, idGen());

    expect(report.itemsMissingId).toBe(2);
    expect(report.jobsNeedingChanges[0].indicesToFill).toEqual([0, 1]);
  });

  it('skips jobs with no equipment needing changes, only lists jobs that do', () => {
    const jobs: JobLike[] = [
      { id: 'job-complete', equipment: [{ name: 'A', id: 'a1' }] },
      { id: 'job-incomplete', equipment: [{ name: 'B' }] },
    ];
    const report = planEquipmentIdBackfill(jobs, idGen());

    expect(report.jobsNeedingChanges.map(p => p.jobId)).toEqual(['job-incomplete']);
  });

  it('never mutates the input jobs array', () => {
    const jobs: JobLike[] = [{ id: 'job1', equipment: [{ name: 'A' }] }];
    const snapshotBefore = JSON.stringify(jobs);
    planEquipmentIdBackfill(jobs, idGen());
    expect(JSON.stringify(jobs)).toBe(snapshotBefore);
  });

  it('handles jobs with zero equipment items', () => {
    const jobs: JobLike[] = [{ id: 'job1', equipment: [] }];
    const report = planEquipmentIdBackfill(jobs, idGen());
    expect(report.totalEquipmentItems).toBe(0);
    expect(report.jobsNeedingChanges).toHaveLength(0);
  });
});

describe('applyBackfillPlan', () => {
  it('fills only the planned indices, leaving everything else untouched', () => {
    const equipment = [{ name: 'A' }, { name: 'B', id: 'existing' }, { name: 'C' }];
    const plan = { jobId: 'job1', indicesToFill: [0, 2], generatedIds: ['id-a', 'id-c'] };

    const result = applyBackfillPlan(equipment, plan);

    expect(result[0]).toEqual({ name: 'A', id: 'id-a' });
    expect(result[1]).toEqual({ name: 'B', id: 'existing' }); // untouched
    expect(result[2]).toEqual({ name: 'C', id: 'id-c' });
  });

  it('never overwrites an id already present on an untouched item', () => {
    const equipment = [{ name: 'A', id: 'must-not-change' }, { name: 'B' }];
    const plan = { jobId: 'job1', indicesToFill: [1], generatedIds: ['new-id'] };

    const result = applyBackfillPlan(equipment, plan);

    expect(result[0].id).toBe('must-not-change');
    expect(result[1].id).toBe('new-id');
  });

  it('does not mutate the original equipment array', () => {
    const equipment = [{ name: 'A' }];
    const plan = { jobId: 'job1', indicesToFill: [0], generatedIds: ['new-id'] };

    applyBackfillPlan(equipment, plan);

    expect(equipment[0].id).toBeUndefined();
  });

  it('preserves all other fields on the filled item', () => {
    const equipment = [{ name: 'A', manufacturer: 'Acme', serialNumber: 'SN1' }];
    const plan = { jobId: 'job1', indicesToFill: [0], generatedIds: ['new-id'] };

    const result = applyBackfillPlan(equipment, plan);

    expect(result[0]).toEqual({ name: 'A', manufacturer: 'Acme', serialNumber: 'SN1', id: 'new-id' });
  });
});

describe('plan + apply round trip is idempotent across two passes', () => {
  it('a second plan against already-backfilled data finds nothing left to do', () => {
    const jobs: JobLike[] = [
      { id: 'job1', equipment: [{ name: 'A' }, { name: 'B' }] },
    ];

    const firstPlan = planEquipmentIdBackfill(jobs, idGen());
    const backfilled = applyBackfillPlan(jobs[0].equipment, firstPlan.jobsNeedingChanges[0]);

    const jobsAfter: JobLike[] = [{ id: 'job1', equipment: backfilled }];
    const secondReport = planEquipmentIdBackfill(jobsAfter, idGen());

    expect(secondReport.itemsMissingId).toBe(0);
    expect(secondReport.jobsNeedingChanges).toHaveLength(0);
  });
});

describe('formatBackfillReport', () => {
  it('summarizes counts and lists jobs needing a write', () => {
    const jobs: JobLike[] = [{ id: 'job1', equipment: [{ name: 'A' }] }];
    const report = planEquipmentIdBackfill(jobs, idGen());
    const text = formatBackfillReport(report);

    expect(text).toContain('Jobs scanned: 1');
    expect(text).toContain('missing an id (would be backfilled): 1');
    expect(text).toContain('job1');
  });

  it('omits the job list when nothing needs changing', () => {
    const jobs: JobLike[] = [{ id: 'job1', equipment: [{ name: 'A', id: 'a1' }] }];
    const text = formatBackfillReport(planEquipmentIdBackfill(jobs, idGen()));

    expect(text).not.toContain('Jobs to update:');
  });
});
