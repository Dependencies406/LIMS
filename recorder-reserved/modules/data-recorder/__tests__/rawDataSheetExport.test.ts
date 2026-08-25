import { describe, it, expect } from 'vitest';
import { serializeExport, parseExport, EXPORT_FORMAT } from '../export/rawDataSheetExport';
import type { CalibrationRawDataSheet, SheetVoidRecord } from '../../../types';

function fixtureSheet(id: string, overrides: Partial<CalibrationRawDataSheet> = {}): CalibrationRawDataSheet {
  return {
    id,
    kind: 'original',
    amends: null,
    jobId: 'job-1',
    requestNo: 'SCS-CAL-26024',
    receivedDate: '2026-07-04',
    calibrationDate: '2026-07-14',
    uuc: {
      equipmentName: 'Seat Belt Anchorage Testing Machine',
      manufacturer: 'ARIES', model: '-', serial: 'Asset Tag: 2590-019-941-6510',
      readingUnit: 'N', resolution: 0.01,
    },
    calibrationRange: '4000-40000 N',
    direction: 'Tension',
    standards: [{
      equipmentId: 'CAL-FRC-004', equationId: 'eq-tensile-10-100',
      code: 'CAL-FRC-004 — Tensile 10-100 kN', name: 'Force Transducer',
      manufacturer: 'GTM', model: 'KTN-P', serial: '66782', dueDate: '2026-12-09',
      equationName: 'Tensile 10-100 kN', degree: 3,
      coefficients: [0.013808275839619, -0.001364919581744, -125.01507375942, 0],
      divisor: 1, inputUnit: 'mV/V', outputUnit: 'kN',
    }],
    envStandard: {
      equipmentId: 'CAL-THM-001', code: 'CAL-THM-001', name: 'Thermo Hygrometer',
      serial: 'SMART1704050462A', range: '10.00 - 35.00 °C', dueDate: '2026-09-03',
    },
    env: [{ t: 25, h: 52 }, { t: 25, h: 49 }, { t: 25.5, h: 50 }],
    machineCondition: 'Normal',
    decimalPlaces: 2,
    rows: [{
      calPoint: 4000, standardEquipmentId: 'CAL-FRC-004', equationId: 'eq-tensile-10-100',
      cells: {
        inc1: { uuc: 4000, sig: -0.03202, force: 4002.98 },
        inc2: { uuc: 4000, sig: -0.03201, force: 4001.73 },
        inc3: { uuc: 4000, sig: -0.03201, force: 4001.73 },
        dec3: { uuc: null, sig: null, force: null },
      },
    }],
    recordedByUid: 'uid-nattawat',
    recordedByName: 'Nattawat Rooplor',
    createdAt: new Date('2026-07-14T04:31:22.123Z'),   // ms precision must survive
    schemaVersion: 1,
    ...overrides,
  };
}

function fixtureVoid(id: string, sheetId: string): SheetVoidRecord {
  return {
    id, sheetId, reason: 'duplicate entry',
    recordedByUid: 'uid-nattawat', recordedByName: 'Nattawat Rooplor',
    createdAt: new Date('2026-07-16T02:15:30.500Z'), schemaVersion: 1,
  };
}

describe('export → import round-trip (R4 losslessness)', () => {
  it('parseExport(serializeExport(x)) deep-equals x, incl. Dates, IDs, amends links, voids', () => {
    const sheets = [
      fixtureSheet('sheet-original'),
      fixtureSheet('sheet-fix', {
        kind: 'amendment', amends: 'sheet-original',
        amendmentReason: 'typo in signal at 8000 N',
        createdAt: new Date('2026-07-15T09:00:00.999Z'),
      }),
    ];
    const voids = [fixtureVoid('void-1', 'sheet-original')];
    const roundTripped = parseExport(serializeExport(sheets, voids, 'uid-nattawat'));
    expect(roundTripped.sheets).toEqual(sheets);
    expect(roundTripped.voids).toEqual(voids);
    expect(roundTripped.sheets[0].createdAt).toBeInstanceOf(Date);
    expect(roundTripped.sheets[0].createdAt.getTime()).toBe(sheets[0].createdAt.getTime());
    expect(roundTripped.sheets[1].amends).toBe('sheet-original');
    expect(roundTripped.voids[0].createdAt.getTime()).toBe(voids[0].createdAt.getTime());
  });

  it('preserves nulls and absent optional fields distinctly', () => {
    const sheet = fixtureSheet('s1');
    delete (sheet as Partial<CalibrationRawDataSheet>).receivedDate;
    const { sheets: [back] } = parseExport(serializeExport([sheet], [], 'u'));
    expect('receivedDate' in back).toBe(false);
    expect(back.rows[0].cells.dec3.sig).toBeNull();
  });

  it('preserves fields the validator does not know about (forward compatibility)', () => {
    const sheet = fixtureSheet('s1') as CalibrationRawDataSheet & { futureField?: string };
    sheet.futureField = 'keep me';
    const { sheets: [back] } = parseExport(serializeExport([sheet], [], 'u')) as
      { sheets: (CalibrationRawDataSheet & { futureField?: string })[] };
    expect(back.futureField).toBe('keep me');
  });

  it('accepts v1 files (no voids array) for backward compatibility', () => {
    const envelope = JSON.parse(serializeExport([fixtureSheet('s1')], [], 'u'));
    envelope.schemaVersion = 1;
    delete envelope.voids;
    const parsed = parseExport(JSON.stringify(envelope));
    expect(parsed.sheets).toHaveLength(1);
    expect(parsed.voids).toEqual([]);
  });

  it('writes the correct envelope', () => {
    const parsedEnvelope = JSON.parse(serializeExport([fixtureSheet('s1')], [fixtureVoid('v1', 's1')], 'uid-x'));
    expect(parsedEnvelope.format).toBe(EXPORT_FORMAT);
    expect(parsedEnvelope.schemaVersion).toBe(2);
    expect(parsedEnvelope.exportedByUid).toBe('uid-x');
    expect(parsedEnvelope.recordCount).toBe(1);
    expect(typeof parsedEnvelope.records[0].createdAt).toBe('string');
    expect(typeof parsedEnvelope.voids[0].createdAt).toBe('string');
  });
});

describe('parseExport rejection', () => {
  it('rejects non-JSON', () => {
    expect(() => parseExport('not json {')).toThrow('File is not valid JSON');
  });

  it('rejects a wrong format marker', () => {
    const file = JSON.stringify({ format: 'other-app', schemaVersion: 1, records: [] });
    expect(() => parseExport(file)).toThrow(/format mismatch/);
  });

  it('rejects an unsupported schema version', () => {
    const file = serializeExport([fixtureSheet('s1')], [], 'u').replace('"schemaVersion": 2,', '"schemaVersion": 99,');
    expect(() => parseExport(file)).toThrow(/Unsupported file version/);
  });

  it('rejects a record with missing required fields, naming the record', () => {
    const envelope = JSON.parse(serializeExport([fixtureSheet('s1')], [], 'u'));
    delete envelope.records[0].recordedByUid;
    expect(() => parseExport(JSON.stringify(envelope))).toThrow(/record 1/);
  });

  it('rejects env with the wrong number of rounds', () => {
    const envelope = JSON.parse(serializeExport([fixtureSheet('s1')], [], 'u'));
    envelope.records[0].env = [{ t: 25, h: 50 }];
    expect(() => parseExport(JSON.stringify(envelope))).toThrow(/incomplete data/);
  });

  it('rejects a void record missing its reason', () => {
    const envelope = JSON.parse(serializeExport([fixtureSheet('s1')], [fixtureVoid('v1', 's1')], 'u'));
    delete envelope.voids[0].reason;
    expect(() => parseExport(JSON.stringify(envelope))).toThrow(/void record with incomplete data/);
  });
});
