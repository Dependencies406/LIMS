/**
 * Reports distinct CertificateNumberConfig.name and Equipment.name values
 * currently in use in Firestore, grouped and flagged for near-duplicates —
 * for human review when reconciling equipment type names.
 * `certificate_number_configs` IS the equipment type (ADR-012).
 *
 * READ-ONLY. This script performs zero writes; there is no write path
 * implemented. `--dry-run` is accepted for forward compatibility with a
 * future write-capable reconciliation tool, but has no effect today —
 * every run of this script is already a dry run.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npm run report:equipment-type-names -- --dry-run
 *
 * Requires a Firebase service-account key (Firestore read access is enough)
 * referenced via GOOGLE_APPLICATION_CREDENTIALS. Never paste that key's
 * contents into chat, a commit, or anywhere else — point the env var at a
 * local file only.
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildNameReport, formatNameReport, type NameSource } from '../src/utils/equipmentTypeNameReport';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun
    ? 'Running in report-only mode (this script never writes, with or without --dry-run).'
    : 'Note: this script performs zero writes regardless of flags; pass --dry-run for clarity if you like.');

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
    });
  }
  const db = getFirestore();

  const sources: NameSource[] = [];

  const configsSnap = await db.collection('certificate_number_configs').get();
  configsSnap.forEach((doc) => {
    const name = doc.data().name;
    if (typeof name === 'string' && name.trim()) {
      sources.push({ raw: name, origin: 'certificateNumberConfig', ref: doc.id });
    }
  });

  // Equipment items are embedded inline on each Job document
  // (Job.equipment[]) — there is no separate top-level Equipment collection
  // for this data (see docs/DATA_MGMT_MODULE_AUDIT.md section 2).
  const jobsSnap = await db.collection('jobs').get();
  jobsSnap.forEach((doc) => {
    const equipment = doc.data().equipment;
    if (Array.isArray(equipment)) {
      equipment.forEach((item: any, index: number) => {
        const name = item?.name;
        if (typeof name === 'string' && name.trim()) {
          sources.push({ raw: name, origin: 'equipmentItem', ref: `${doc.id}[${index}]` });
        }
      });
    }
  });

  const report = buildNameReport(sources);

  console.log('');
  console.log(`CertificateNumberConfig.name values read: ${sources.filter(s => s.origin === 'certificateNumberConfig').length}`);
  console.log(`Equipment.name values read: ${sources.filter(s => s.origin === 'equipmentItem').length}`);
  console.log('');
  console.log(formatNameReport(report));
  console.log('');
  console.log('Reconciling near-duplicates requires human judgement — see ADR-003. This script makes no changes.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Report failed:', err);
    process.exit(1);
  });
