import { describe, it, expect } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS } from '../roleService';

describe('DEFAULT_ROLE_PERMISSIONS.standardUser — records.* permissions (ADR-005, Phase 5d)', () => {
  it('does NOT include records.review or records.approve — review/approve are admin-only', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.standardUser).not.toContain('records.review');
    expect(DEFAULT_ROLE_PERMISSIONS.standardUser).not.toContain('records.approve');
  });

  it('DOES include records.commit and records.revise — technicians record, commit, and raise revisions', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.standardUser).toContain('records.commit');
    expect(DEFAULT_ROLE_PERMISSIONS.standardUser).toContain('records.revise');
  });

  it('admin includes all four records.* permissions', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain('records.commit');
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain('records.review');
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain('records.approve');
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain('records.revise');
  });
});
