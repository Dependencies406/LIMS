/**
 * Plans and applies backfilling a stable `id` onto Job.equipment[] items that
 * are missing one (ADR-002 Phase 2 — item identity is a hard gate for later
 * phases). Pure logic, no I/O — this is what
 * scripts/backfillEquipmentIds.ts calls after fetching data from Firestore.
 */

export interface EquipmentLike {
  id?: string;
  [key: string]: unknown;
}

export interface JobLike {
  id: string;
  equipment: EquipmentLike[];
}

export interface JobBackfillPlan {
  jobId: string;
  /** Index positions within Job.equipment[] that will get a newly generated id. */
  indicesToFill: number[];
  /** The ids to assign, aligned 1:1 with indicesToFill. */
  generatedIds: string[];
}

export interface BackfillReport {
  totalJobs: number;
  totalEquipmentItems: number;
  itemsAlreadyHavingId: number;
  itemsMissingId: number;
  jobsNeedingChanges: JobBackfillPlan[];
}

function hasStableId(item: EquipmentLike): boolean {
  return typeof item.id === 'string' && item.id.trim().length > 0;
}

/**
 * Scans jobs and decides which equipment items need a backfilled id. Never
 * mutates its input. Idempotent by construction: an item that already has an
 * id is never included in a plan, so re-running against already-backfilled
 * data always produces empty plans.
 */
export function planEquipmentIdBackfill(jobs: JobLike[], generateId: () => string): BackfillReport {
  let totalEquipmentItems = 0;
  let itemsAlreadyHavingId = 0;
  let itemsMissingId = 0;
  const jobsNeedingChanges: JobBackfillPlan[] = [];

  for (const job of jobs) {
    const indicesToFill: number[] = [];
    const generatedIds: string[] = [];

    job.equipment.forEach((item, index) => {
      totalEquipmentItems += 1;
      if (hasStableId(item)) {
        itemsAlreadyHavingId += 1;
      } else {
        itemsMissingId += 1;
        indicesToFill.push(index);
        generatedIds.push(generateId());
      }
    });

    if (indicesToFill.length > 0) {
      jobsNeedingChanges.push({ jobId: job.id, indicesToFill, generatedIds });
    }
  }

  return {
    totalJobs: jobs.length,
    totalEquipmentItems,
    itemsAlreadyHavingId,
    itemsMissingId,
    jobsNeedingChanges,
  };
}

/**
 * Produces the new equipment array for one job's plan. Only the planned
 * indices are touched — every other field on every item, including any id
 * already present elsewhere in the array, is left exactly as it was.
 */
export function applyBackfillPlan(equipment: EquipmentLike[], plan: JobBackfillPlan): EquipmentLike[] {
  const next = [...equipment];
  plan.indicesToFill.forEach((index, i) => {
    next[index] = { ...next[index], id: plan.generatedIds[i] };
  });
  return next;
}

export function formatBackfillReport(report: BackfillReport): string {
  const lines: string[] = [];
  lines.push(`Jobs scanned: ${report.totalJobs}`);
  lines.push(`Equipment items scanned: ${report.totalEquipmentItems}`);
  lines.push(`  already have an id: ${report.itemsAlreadyHavingId}`);
  lines.push(`  missing an id (would be backfilled): ${report.itemsMissingId}`);
  lines.push(`Jobs requiring a write: ${report.jobsNeedingChanges.length}`);

  if (report.jobsNeedingChanges.length > 0) {
    lines.push('');
    lines.push('Jobs to update:');
    for (const plan of report.jobsNeedingChanges) {
      lines.push(`  - ${plan.jobId}: ${plan.indicesToFill.length} item(s) at index [${plan.indicesToFill.join(', ')}]`);
    }
  }

  return lines.join('\n');
}
