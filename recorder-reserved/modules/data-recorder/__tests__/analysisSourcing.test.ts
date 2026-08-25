import { describe, it, expect } from 'vitest';
import type {
  CalibrationRawDataSheet,
  ConversionEquation,
  SheetRow,
  StandardSnapshot,
} from '../../../types';
import { computeRelativeError } from '../analysis';
import {
  buildUncertaintyBudgetPoints,
  equipmentIdsNeedingCurrentEquation,
  resolveCmcSteps,
  resolveUncertaintyParams,
} from '../analysisSourcing';

function equation(overrides: Partial<ConversionEquation> = {}): ConversionEquation {
  return {
    id: 'eq1',
    name: 'Tensile 10-100 kN',
    inputUnit: 'mV/V',
    outputUnit: 'kN',
    degree: 1,
    coefficients: [{ value: 1, inputMode: 'decimal', raw: '1' }, { value: 0, inputMode: 'decimal', raw: '0' }],
    divisor: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    createdBy: 'seed',
    ...overrides,
  };
}

function snapshot(overrides: Partial<StandardSnapshot> = {}): StandardSnapshot {
  return {
    equipmentId: 'CAL-FRC-004',
    equationId: 'eq1',
    code: 'CAL-FRC-004 — Tensile 10-100 kN',
    name: 'Force Transducer',
    equationName: 'Tensile 10-100 kN',
    degree: 1,
    coefficients: [1, 0],
    divisor: 1,
    inputUnit: 'mV/V',
    outputUnit: 'kN',
    ...overrides,
  };
}

function row(overrides: Partial<SheetRow> = {}): SheetRow {
  return {
    calPoint: 4000,
    standardEquipmentId: 'CAL-FRC-004',
    equationId: 'eq1',
    cells: {
      inc1: { uuc: 4000, sig: 1, force: 4000 },
      inc2: { uuc: 4000, sig: 1, force: 4000.1 },
      inc3: { uuc: 4000, sig: 1, force: 4000.2 },
      dec3: { uuc: null, sig: null, force: null },
    },
    ...overrides,
  };
}

function sheet(overrides: Partial<CalibrationRawDataSheet> = {}): CalibrationRawDataSheet {
  return {
    id: 'sheet1',
    kind: 'original',
    amends: null,
    jobId: 'job1',
    requestNo: 'SCS-CAL-26024',
    calibrationDate: '2026-01-01',
    uuc: { equipmentName: 'UUC', readingUnit: 'N' },
    calibrationRange: '0-247 kN',
    direction: 'Tension',
    standards: [snapshot()],
    envStandard: { equipmentId: 'CAL-THM-001', code: 'CAL-THM-001', name: 'Thermo' },
    env: [{ t: 25, h: 50 }, { t: 25, h: 50 }, { t: 25, h: 50 }],
    machineCondition: 'Normal',
    decimalPlaces: 2,
    rows: [row()],
    recordedByUid: 'u1',
    recordedByName: 'Someone',
    createdAt: new Date(0),
    schemaVersion: 2,
    ...overrides,
  };
}

describe('resolveUncertaintyParams', () => {
  it('uses the snapshot when it carries a full set of u_cal/A/B/C', () => {
    const snap = snapshot({ uCal: 0.1, uA: 0.05, uB: 0.02, uC: 0.01 });
    const result = resolveUncertaintyParams(snap, undefined);
    expect(result.source).toBe('snapshot');
    expect(result.params).toEqual({ uCal: 0.1, uA: 0.05, uB: 0.02, uC: 0.01 });
  });

  it('falls back to the current equation when the snapshot is missing any of the four fields', () => {
    const snap = snapshot({ uCal: 0.1, uA: 0.05, uB: undefined, uC: 0.01 });
    const eq = equation({ uCal: 0.2, uA: 0.06, uB: 0.03, uC: 0.02 });
    const result = resolveUncertaintyParams(snap, eq);
    expect(result.source).toBe('current-equation');
    expect(result.params).toEqual({ uCal: 0.2, uA: 0.06, uB: 0.03, uC: 0.02 });
  });

  it('falls back to the current equation when there is no snapshot at all (pre-D7 sheet)', () => {
    const eq = equation({ uCal: 0.2, uA: 0.06, uB: 0.03, uC: 0.02 });
    const result = resolveUncertaintyParams(undefined, eq);
    expect(result.source).toBe('current-equation');
  });

  it('reports unavailable (and zeroes the params) when neither source has a full set', () => {
    const snap = snapshot();
    const eq = equation();
    const result = resolveUncertaintyParams(snap, eq);
    expect(result.source).toBe('unavailable');
    expect(result.params).toEqual({ uCal: 0, uA: 0, uB: 0, uC: 0 });
  });

  it('treats a partial current-equation fallback as still unavailable', () => {
    const eq = equation({ uCal: 0.2, uA: 0.06 });
    const result = resolveUncertaintyParams(undefined, eq);
    expect(result.source).toBe('unavailable');
  });
});

describe('resolveCmcSteps', () => {
  const settings = {
    schemaVersion: 1,
    directions: {
      tension: [{ toN: 100, cmcPercent: 0.26 }],
      compression: [],
    },
  };

  it('resolves the steps for the sheet direction and marks them available', () => {
    const result = resolveCmcSteps(settings, 'Tension');
    expect(result.available).toBe(true);
    expect(result.steps).toEqual([{ toN: 100, cmc: 0.26 }]);
  });

  it('is unavailable when the direction has no configured steps', () => {
    const result = resolveCmcSteps(settings, 'Compression');
    expect(result.available).toBe(false);
    expect(result.steps).toEqual([]);
  });

  it('is unavailable when settings themselves are missing', () => {
    expect(resolveCmcSteps(null, 'Tension').available).toBe(false);
    expect(resolveCmcSteps(undefined, 'Tension').available).toBe(false);
  });
});

describe('equipmentIdsNeedingCurrentEquation', () => {
  it('is empty when every used standard snapshot has a full parameter set', () => {
    const s = sheet({ standards: [snapshot({ uCal: 0.1, uA: 0.05, uB: 0.02, uC: 0.01 })] });
    expect(equipmentIdsNeedingCurrentEquation(s)).toEqual([]);
  });

  it('lists the equipment id when the row snapshot lacks the fields', () => {
    const s = sheet({ standards: [snapshot()] });
    expect(equipmentIdsNeedingCurrentEquation(s)).toEqual(['CAL-FRC-004']);
  });

  it('lists the equipment id when the row has no matching snapshot at all', () => {
    const s = sheet({ standards: [] });
    expect(equipmentIdsNeedingCurrentEquation(s)).toEqual(['CAL-FRC-004']);
  });
});

describe('buildUncertaintyBudgetPoints', () => {
  const relativeErrorInput = {
    points: [{ calPoint: 4000, forces: { inc1: 4000, inc2: 4000.1, inc3: 4000.2, dec3: null } }],
    resolution: 0.1,
    decimalPlaces: 2,
  };

  it("tags each point with the source of its uncertainty parameters", () => {
    const s = sheet({ standards: [snapshot({ uCal: 0.1, uA: 0.05, uB: 0.02, uC: 0.01 })] });
    const relativeError = computeRelativeError(relativeErrorInput);
    const results = buildUncertaintyBudgetPoints(s, relativeError, [{ toN: 247000, cmc: 0.26 }], 'N', new Map());
    expect(results).toHaveLength(1);
    expect(results[0].paramsSource).toBe('snapshot');
    expect(results[0].point.uCal).toBe(0.1);
  });

  it('uses the current equation map when the snapshot is incomplete', () => {
    const s = sheet({ standards: [snapshot()] });
    const relativeError = computeRelativeError(relativeErrorInput);
    const currentEquations = new Map([
      ['CAL-FRC-004::eq1', equation({ uCal: 0.3, uA: 0.06, uB: 0.03, uC: 0.02 })],
    ]);
    const results = buildUncertaintyBudgetPoints(s, relativeError, [{ toN: 247000, cmc: 0.26 }], 'N', currentEquations);
    expect(results[0].paramsSource).toBe('current-equation');
    expect(results[0].point.uCal).toBe(0.3);
  });

  it('skips the zero row (it has no budget row in the workbook either)', () => {
    const s = sheet({
      rows: [
        row({ calPoint: 0, cells: {
          inc1: { uuc: 0, sig: 0, force: 0 },
          inc2: { uuc: 0, sig: 0, force: 0 },
          inc3: { uuc: 0, sig: 0, force: 0 },
          dec3: { uuc: null, sig: null, force: null },
        } }),
        row(),
      ],
      standards: [snapshot({ uCal: 0.1, uA: 0.05, uB: 0.02, uC: 0.01 })],
    });
    const relativeError = computeRelativeError({
      points: [
        { calPoint: 0, forces: { inc1: 0, inc2: 0, inc3: 0, dec3: 0 } },
        relativeErrorInput.points[0],
      ],
      resolution: 0.1,
      decimalPlaces: 2,
    });
    const results = buildUncertaintyBudgetPoints(s, relativeError, [{ toN: 247000, cmc: 0.26 }], 'N', new Map());
    expect(results).toHaveLength(1);
    expect(results[0].point.calPoint).toBe(4000);
  });
});
