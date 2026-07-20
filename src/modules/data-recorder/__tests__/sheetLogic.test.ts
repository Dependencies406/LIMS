import { describe, it, expect } from 'vitest';
import type { ConversionEquation, EquipmentRecord } from '../../../types';
import { snapshotFromOption, optionKey, type StandardOption } from '../sheetLogic';

function equipment(overrides: Partial<EquipmentRecord> = {}): EquipmentRecord {
  return {
    id: 'CAL-FRC-004',
    name: 'Force Transducer',
    category: 'FRC',
    manufacturer: 'HBM',
    model: 'U10M',
    serialNumber: 'SN-001',
    location: 'Lab A',
    status: 'active' as EquipmentRecord['status'],
    custodian: 'someone@example.com',
    authorizedUsers: [],
    requiresCalibration: true,
    externalProvider: false,
    registrationDate: '2020-01-01',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    createdBy: 'seed',
    ...overrides,
  };
}

function equation(overrides: Partial<ConversionEquation> = {}): ConversionEquation {
  return {
    id: 'eq1',
    name: 'Tensile 10-100 kN',
    inputUnit: 'mV/V',
    outputUnit: 'kN',
    degree: 3,
    coefficients: [
      { value: 0.0138, inputMode: 'decimal', raw: '0.0138' },
      { value: -0.0013, inputMode: 'decimal', raw: '-0.0013' },
      { value: -125.015, inputMode: 'decimal', raw: '-125.015' },
      { value: 0, inputMode: 'decimal', raw: '0' },
    ],
    divisor: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    createdBy: 'seed',
    ...overrides,
  };
}

function option(eq: ConversionEquation, eq2 = equipment()): StandardOption {
  return {
    key: optionKey(eq2.id, eq.id),
    equipmentId: eq2.id,
    equationId: eq.id,
    code: `${eq2.id} — ${eq.name}`,
    equipment: eq2,
    equation: eq,
  };
}

describe('snapshotFromOption uncertainty parameters (Stage D D7)', () => {
  it('omits uCal/uA/uB/uC when the equation has none (equation predates Session 2)', () => {
    const snap = snapshotFromOption(option(equation()));
    expect(snap.uCal).toBeUndefined();
    expect(snap.uA).toBeUndefined();
    expect(snap.uB).toBeUndefined();
    expect(snap.uC).toBeUndefined();
  });

  it('carries uCal/uA/uB/uC onto the snapshot when present on the equation', () => {
    const snap = snapshotFromOption(
      option(equation({ uCal: 0.15, uA: 0.05, uB: 0.03, uC: 0.02 })),
    );
    expect(snap).toMatchObject({ uCal: 0.15, uA: 0.05, uB: 0.03, uC: 0.02 });
  });
});
