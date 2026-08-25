import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../firebase', async () => {
  const { createFakeFirestore } = await import('./fakeFirestore');
  return createFakeFirestore();
});

import * as firebaseMock from '../firebase';
import { unitConversionRuleService } from '../unitConversionRuleService';
import type { ConversionRuleInput } from '../../types';

beforeEach(() => {
  (firebaseMock as any).store.clear();
});

function baseInput(overrides: Partial<ConversionRuleInput> = {}): ConversionRuleInput {
  return {
    name: 'mV/V to %',
    fromUnit: 'mV/V',
    toUnit: '%',
    expression: 'VALUE * 100',
    active: true,
    createdBy: 'admin1',
    ...overrides,
  };
}

describe('unitConversionRuleService — save-time enforcement (tests 1 & 2, at the service boundary)', () => {
  it('add() writes a valid rule and it round-trips', async () => {
    const id = await unitConversionRuleService.add(baseInput());
    const all = await unitConversionRuleService.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(id);
    expect(all[0].expression).toBe('VALUE * 100');
    expect(all[0].active).toBe(true);
  });

  it('add() throws and writes nothing for a force-to-force pair', async () => {
    await expect(unitConversionRuleService.add(baseInput({ fromUnit: 'N', toUnit: 'kgF', expression: 'VALUE * 9.80665' })))
      .rejects.toThrow(/STD_TO_N/);
    expect(await unitConversionRuleService.getAll()).toHaveLength(0);
  });

  it('add() throws and writes nothing for an expression referencing anything but VALUE', async () => {
    await expect(unitConversionRuleService.add(baseInput({ expression: 'VALUE * STD_C0' })))
      .rejects.toThrow(/STD_C0/);
    expect(await unitConversionRuleService.getAll()).toHaveLength(0);
  });

  it('update() re-validates the MERGED result, not just the patch', async () => {
    const id = await unitConversionRuleService.add(baseInput());
    const existing = (await unitConversionRuleService.getAll())[0];
    // Patch only fromUnit/toUnit to a force pair — expression untouched by
    // the patch, but the merged rule is still invalid and must be refused.
    await expect(unitConversionRuleService.update(id, existing, { fromUnit: 'N', toUnit: 'kN', expression: 'VALUE * 1000' }))
      .rejects.toThrow(/STD_TO_N/);
  });

  it('update() accepts a valid patch (e.g. notes only)', async () => {
    const id = await unitConversionRuleService.add(baseInput());
    const existing = (await unitConversionRuleService.getAll())[0];
    await unitConversionRuleService.update(id, existing, { notes: 'Transducer output scaling' });
    const updated = (await unitConversionRuleService.getAll())[0];
    expect(updated.notes).toBe('Transducer output scaling');
  });
});

describe('unitConversionRuleService — deactivate, never delete (D2)', () => {
  it('deactivate() sets active: false but the document still exists', async () => {
    const id = await unitConversionRuleService.add(baseInput());
    await unitConversionRuleService.deactivate(id);
    const all = await unitConversionRuleService.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].active).toBe(false);
  });

  it('activate() reverses a deactivation', async () => {
    const id = await unitConversionRuleService.add(baseInput());
    await unitConversionRuleService.deactivate(id);
    await unitConversionRuleService.activate(id);
    expect((await unitConversionRuleService.getAll())[0].active).toBe(true);
  });

  it('there is no delete method exposed at all', () => {
    expect((unitConversionRuleService as any).delete).toBeUndefined();
  });
});
