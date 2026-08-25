/**
 * Backfills a stable `id` onto every Job.equipment[] item that is missing
 * one — item identity is a hard gate for later phases (ADR-002).
 *
 * Default mode is REPORT ONLY: it reads every job and prints exactly what it
 * would change, without writing anything. Pass --apply to actually write the
 * backfilled ids. Never overwrites an id that is already present — only
 * fills items missing one. Safe to re-run: once complete, a second run
 * reports zero remaining work and writes nothing (see
 * src/utils/equipmentIdBackfill.ts, which this script's logic is unit-tested
 * against).
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npm run backfill:equipment-ids                  # report only (default)
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npm run backfill:equipment-ids -- --apply        # actually writes
 *
 * Requires a Firebase service-account key with read+write access to `jobs`,
 * referenced via GOOGLE_APPLICATION_CREDENTIALS. Never paste that key's
 * contents into chat, a commit, or anywhere else — point the env var at a
 * local file only.
 */

import * as admin from 'firebase-admin';
import {
  planEquipmentIdBackfill,
  applyBackfillPlan,
  formatBackfillReport,
  type JobLike,
} from '../src/utils/equipmentIdBackfill';

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply
    ? 'Running in APPLY mode — missing ids WILL be written to Firestore.'
    : 'Running in report-only mode (pass --apply to actually write).');

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
  const db = admin.firestore();

  const jobsSnap = await db.collection('jobs').get();
  const jobs: JobLike[] = jobsSnap.docs.map((doc) => ({
    id: doc.id,
    equipment: Array.isArray(doc.data().equipment) ? doc.data().equipment : [],
  }));

  const report = planEquipmentIdBackfill(jobs, generateId);

  console.log('');
  console.log(formatBackfillReport(report));
  console.log('');

  if (!apply) {
    console.log('No changes written (report-only mode). Re-run with --apply to write.');
    return;
  }

  if (report.jobsNeedingChanges.length === 0) {
    console.log('Nothing to backfill — every item already has an id.');
    return;
  }

  for (const plan of report.jobsNeedingChanges) {
    const job = jobs.find((j) => j.id === plan.jobId)!;
    const nextEquipment = applyBackfillPlan(job.equipment, plan);
    await db.collection('jobs').doc(plan.jobId).update({
      equipment: nextEquipment,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Updated ${plan.jobId}: backfilled ${plan.indicesToFill.length} id(s).`);
  }

  console.log('');
  console.log(`Done — backfilled ${report.itemsMissingId} id(s) across ${report.jobsNeedingChanges.length} job(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
