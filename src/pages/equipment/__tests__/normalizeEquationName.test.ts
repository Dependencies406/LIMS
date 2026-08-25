/**
 * normalizeEquationName.test.ts
 *
 * ADR-014 Phase 14 Task 4: the exact comparison `EquationConfigModal.handleSave`
 * uses to reject a duplicate equation name — `normalizeEquationName(a) ===
 * normalizeEquationName(b)`. Extracted and unit-tested directly because this
 * page has no router/auth test harness to render the full modal through; this
 * proves the comparison logic itself is correct, which is what the duplicate
 * check actually depends on.
 */

import { describe, it, expect, vi } from 'vitest';

// EquipmentDetailPage.tsx transitively imports ../../services/firebase (via
// AuthContext, equipmentControlService, conversionEquationService, etc.),
// which calls initializeApp/getAuth/getFirestore at module load. Mock it so
// importing the page for this ONE pure function never touches real Firebase
// — the same guard calibrationRecordService.test.ts and friends use.
vi.mock('../../../services/firebase', async () => {
  const { createFakeFirestore } = await import('../../../services/__tests__/fakeFirestore');
  return { ...createFakeFirestore(), auth: {}, deleteField: () => ({ __deleteField: true }) };
});

import { normalizeEquationName } from '../EquipmentDetailPage';

describe('normalizeEquationName — the duplicate-name collision check', () => {
  it('two identical names collide', () => {
    expect(normalizeEquationName('1-10 kN')).toBe(normalizeEquationName('1-10 kN'));
  });

  it('names differing only by case collide', () => {
    expect(normalizeEquationName('1-10 KN')).toBe(normalizeEquationName('1-10 kn'));
  });

  it('names differing only by leading/trailing whitespace collide', () => {
    expect(normalizeEquationName('  1-10 kN  ')).toBe(normalizeEquationName('1-10 kN'));
  });

  it('names differing only by internal whitespace run length collide', () => {
    expect(normalizeEquationName('1-10   kN')).toBe(normalizeEquationName('1-10 kN'));
  });

  it('genuinely different names do NOT collide', () => {
    expect(normalizeEquationName('1-10 kN')).not.toBe(normalizeEquationName('10-100 kN'));
  });

  it('a name that is a substring of another does NOT collide', () => {
    expect(normalizeEquationName('1-10 kN')).not.toBe(normalizeEquationName('1-10 kN range'));
  });
});
