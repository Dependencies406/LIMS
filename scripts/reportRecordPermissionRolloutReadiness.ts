/**
 * Reports whether Firestore is ready for the Phase 5d fail-closed `records`
 * rules (ADR-005, "Missing role documents fail CLOSED"):
 *   - whether roles/admin exists, and its permissions array
 *   - whether roles/staff exists, and its permissions array
 *   - how many users have role == 'admin'
 *
 * With fail-closed rules, a missing roles/admin document means NOBODY can
 * approve anything — and it cannot be fixed from inside the app, only via
 * the Firebase console. This script exists to check that BEFORE the rules
 * are deployed, not after.
 *
 * READ-ONLY. This script performs zero writes; there is no write path
 * implemented. `--dry-run` is accepted for forward compatibility with a
 * future write-capable tool, but has no effect today — every run is
 * already a dry run. Do not run this without checking with the project
 * owner first — it was written to be run by them, not automatically.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npm run report:record-permission-rollout -- --dry-run
 *
 * Requires a Firebase service-account key (Firestore read access is enough)
 * referenced via GOOGLE_APPLICATION_CREDENTIALS. Never paste that key's
 * contents into chat, a commit, or anywhere else — point the env var at a
 * local file only.
 */

import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

  console.log('');
  console.log('=== roles/admin ===');
  const adminRoleSnap = await db.collection('roles').doc('admin').get();
  if (adminRoleSnap.exists) {
    const permissions = adminRoleSnap.data()?.permissions;
    console.log('EXISTS.');
    console.log('permissions:', Array.isArray(permissions) ? permissions : '(no permissions array on the document)');
    if (Array.isArray(permissions) && !permissions.includes('records.review')) {
      console.log("WARNING: roles/admin's permissions array does not include 'records.review'.");
    }
    if (Array.isArray(permissions) && !permissions.includes('records.approve')) {
      console.log("WARNING: roles/admin's permissions array does not include 'records.approve'.");
    }
  } else {
    console.log("MISSING. With fail-closed rules, admins will have ZERO records.* permissions until this document exists.");
  }

  console.log('');
  console.log('=== roles/staff ===');
  const staffRoleSnap = await db.collection('roles').doc('staff').get();
  if (staffRoleSnap.exists) {
    const permissions = staffRoleSnap.data()?.permissions;
    console.log('EXISTS.');
    console.log('permissions:', Array.isArray(permissions) ? permissions : '(no permissions array on the document)');
    if (Array.isArray(permissions) && !permissions.includes('records.commit')) {
      console.log("WARNING: roles/staff's permissions array does not include 'records.commit'.");
    }
    if (Array.isArray(permissions) && !permissions.includes('records.revise')) {
      console.log("WARNING: roles/staff's permissions array does not include 'records.revise'.");
    }
  } else {
    console.log("MISSING. With fail-closed rules, staff will have ZERO records.* permissions until this document exists.");
  }

  console.log('');
  console.log('=== users with role == \'admin\' ===');
  const adminUsersSnap = await db.collection('users').where('role', '==', 'admin').get();
  console.log(`Count: ${adminUsersSnap.size}`);
  if (adminUsersSnap.size < 2) {
    console.log(
      "WARNING: fewer than 2 admin accounts. Review and approve are both admin-only and approver != reviewer, " +
      "so a single admin cannot complete both steps on the same record — every record would stall at 'reviewed'.",
    );
  }
  adminUsersSnap.forEach((doc) => {
    const data = doc.data();
    console.log(`  - ${doc.id} (${data.email ?? 'no email on record'})`);
  });

  console.log('');
  console.log('This script makes no changes. Review the output above against docs/PHASE_5C_RULES_MANUAL_VERIFICATION.md before publishing firestore.rules.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Report failed:', err);
    process.exit(1);
  });
