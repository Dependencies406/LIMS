/**
 * Phase 36 — the five capabilities a technician must be genuinely prevented
 * from using, not merely discouraged from.
 *
 * These are the first permissions in this codebase that are real in BOTH
 * places: enforced by `firestore.rules` and gated in the UI. Phase 34 found 37
 * switches wired to nothing; this test exists so these five do not quietly
 * rejoin them.
 *
 * IMPORTANT — what this test does NOT prove. `DEFAULT_ROLE_PERMISSIONS` seeds
 * NEW role documents only. The `roles/staff` document already in Firestore
 * still holds whatever it was created with, and changing this constant does
 * not rewrite it. The owner must untick the five boxes in
 * Settings -> Users & Roles -> Roles for the change to reach an existing role.
 */

import { describe, it, expect } from 'vitest';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '../roleService';

/** The five the owner drew a line under in Phase 36. */
const PHASE_36_EXCLUSIONS = [
  'customers.delete',
  'jobs.delete',
  'serviceRequests.cancel',
  'serviceRequests.convert',
  'staffPerformance.view',
] as const;

describe('DEFAULT_ROLE_PERMISSIONS.standardUser — Phase 36 exclusions', () => {
  it.each(PHASE_36_EXCLUSIONS)('does NOT grant %s by default', (permission) => {
    expect(DEFAULT_ROLE_PERMISSIONS.standardUser).not.toContain(permission);
  });

  it('still grants the everyday work a technician must be able to do', () => {
    // Spot-checks across three different areas: if an over-broad exclusion
    // filter ever swallows one of these, this fails rather than silently
    // shipping a role that cannot do its job.
    expect(DEFAULT_ROLE_PERMISSIONS.standardUser).toContain('jobs.edit');
    expect(DEFAULT_ROLE_PERMISSIONS.standardUser).toContain('customers.edit');
    expect(DEFAULT_ROLE_PERMISSIONS.standardUser).toContain('records.commit');
  });

  it('totals 34 permissions', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.standardUser).toHaveLength(34);
  });

  it('is exactly ALL_PERMISSIONS minus the documented exclusions', () => {
    // Pins the relationship rather than just the number, so a permission added
    // to ALL_PERMISSIONS without a deliberate decision shows up here.
    const excluded = ALL_PERMISSIONS.map((p) => p.action).filter(
      (a) => !(DEFAULT_ROLE_PERMISSIONS.standardUser as string[]).includes(a)
    );
    expect(excluded).toHaveLength(ALL_PERMISSIONS.length - 34);
    for (const permission of PHASE_36_EXCLUSIONS) {
      expect(excluded).toContain(permission);
    }
  });
});

describe('DEFAULT_ROLE_PERMISSIONS.admin — unchanged by Phase 36', () => {
  it.each(PHASE_36_EXCLUSIONS)('still grants %s', (permission) => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain(permission);
  });

  it('holds every permission there is', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toHaveLength(ALL_PERMISSIONS.length);
  });
});
