/**
 * standardKey.test.ts
 *
 * ADR-014 D3: the `standard` cell identifies BOTH the equipment and the
 * equation. A record cell is a `CellValue` (`number | string | null |
 * undefined`) and cannot hold an object, so the pair is one opaque string.
 *
 * Everything downstream — the snapshot map key, `collectStandardIds`, the
 * evaluator's per-row lookup — treats it as opaque. Only the picker (writing)
 * and the resolver (reading) split it, and both go through these functions.
 */

import { describe, it, expect } from 'vitest';
import { makeStandardKey, parseStandardKey } from '../referenceStandardVariables';
import { standardOptionLabel } from '../referenceStandardOptions';
import type { EquipmentRecord, ConversionEquation } from '../../types';

describe('makeStandardKey / parseStandardKey', () => {
  it('round-trips an (equipmentId, equationId) pair', () => {
    const key = makeStandardKey('CAL-FRC-001', 'eq-abc');
    expect(parseStandardKey(key)).toEqual({
      equipmentId: 'CAL-FRC-001',
      equationId: 'eq-abc',
    });
  });

  it('keeps the equipment id readable in the stored value', () => {
    // Not cosmetic: a human debugging a record document should be able to see
    // which transducer a row used without running code.
    expect(makeStandardKey('CAL-FRC-001', 'eq1')).toBe('CAL-FRC-001::eq1');
  });

  it('handles hyphens in both ids, which real equipment ids contain', () => {
    const key = makeStandardKey('CAL-FRC-001', 'range-1-10-N');
    expect(parseStandardKey(key)).toEqual({
      equipmentId: 'CAL-FRC-001',
      equationId: 'range-1-10-N',
    });
  });

  it('splits on the FIRST separator, so a separator inside the equation id survives', () => {
    const key = makeStandardKey('EQ1', 'weird::id');
    expect(parseStandardKey(key)).toEqual({ equipmentId: 'EQ1', equationId: 'weird::id' });
  });

  it('returns null for a value that is not a composite key', () => {
    // A legacy cell holding a bare ReferenceStandard id must not be mistaken
    // for a pair — it resolves to nothing, and the row shows awaiting-input.
    expect(parseStandardKey('std-frc-001')).toBeNull();
    expect(parseStandardKey('')).toBeNull();
    expect(parseStandardKey(null)).toBeNull();
    expect(parseStandardKey(undefined)).toBeNull();
    expect(parseStandardKey(42)).toBeNull();
  });

  it('returns null when either half is missing', () => {
    expect(parseStandardKey('::eq1')).toBeNull();
    expect(parseStandardKey('CAL-FRC-001::')).toBeNull();
    expect(parseStandardKey('::')).toBeNull();
  });
});

describe('standardOptionLabel — the flattened "equipment — range" picker entry', () => {
  it('shows the equipment id and the range name together', () => {
    const equipment = { id: 'CAL-FRC-001', name: 'Force transducer' } as EquipmentRecord;
    const equation = { id: 'eq1', name: '1-10 N' } as ConversionEquation;
    // One device with several ranges is several options, which is what makes
    // "one transducer, four calibrated ranges" selectable per row.
    expect(standardOptionLabel(equipment, equation)).toBe('CAL-FRC-001 — 1-10 N');
  });
});
