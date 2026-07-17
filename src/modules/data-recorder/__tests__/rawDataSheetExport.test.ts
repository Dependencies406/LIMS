import { describe, it, expect } from 'vitest';
import { serializeExport, parseExport, EXPORT_FORMAT } from '../export/rawDataSheetExport';
import type { CalibrationRawDataSheet } from '../../../types';

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

describe('export → import round-trip (R4 losslessness)', () => {
  it('parseExport(serializeExport(x)) deep-equals x, incl. Dates, IDs, amends links', () => {
    const sheets = [
      fixtureSheet('sheet-original'),
      fixtureSheet('sheet-fix', {
        kind: 'amendment', amends: 'sheet-original',
        amendmentReason: 'typo in signal at 8000 N',
        createdAt: new Date('2026-07-15T09:00:00.999Z'),
      }),
    ];
    const roundTripped = parseExport(serializeExport(sheets, 'uid-nattawat'));
    expect(roundTripped).toEqual(sheets);
    expect(roundTripped[0].createdAt).toBeInstanceOf(Date);
    expect(roundTripped[0].createdAt.getTime()).toBe(sheets[0].createdAt.getTime());
    expect(roundTripped[1].amends).toBe('sheet-original');
  });

  it('preserves nulls and absent optional fields distinctly', () => {
    const sheet = fixtureSheet('s1');
    delete (sheet as Partial<CalibrationRawDataSheet>).receivedDate;
    const [back] = parseExport(serializeExport([sheet], 'u'));
    expect('receivedDate' in back).toBe(false);
    expect(back.rows[0].cells.dec3.sig).toBeNull();
  });

  it('preserves fields the validator does not know about (forward compatibility)', () => {
    const sheet = fixtureSheet('s1') as CalibrationRawDataSheet & { futureField?: string };
    sheet.futureField = 'keep me';
    const [back] = parseExport(serializeExport([sheet], 'u')) as (CalibrationRawDataSheet & { futureField?: string })[];
    expect(back.futureField).toBe('keep me');
  });

  it('writes the correct envelope', () => {
    const parsedEnvelope = JSON.parse(serializeExport([fixtureSheet('s1')], 'uid-x'));
    expect(parsedEnvelope.format).toBe(EXPORT_FORMAT);
    expect(parsedEnvelope.schemaVersion).toBe(1);
    expect(parsedEnvelope.exportedByUid).toBe('uid-x');
    expect(parsedEnvelope.recordCount).toBe(1);
    expect(typeof parsedEnvelope.records[0].createdAt).toBe('string');
  });
});

describe('parseExport rejection', () => {
  it('rejects non-JSON', () => {
    expect(() => parseExport('not json {')).toThrow('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง');
  });

  it('rejects a wrong format marker', () => {
    const file = JSON.stringify({ format: 'other-app', schemaVersion: 1, records: [] });
    expect(() => parseExport(file)).toThrow(/format ไม่ตรง/);
  });

  it('rejects an unsupported schema version', () => {
    const file = serializeExport([fixtureSheet('s1')], 'u').replace('"schemaVersion": 1,', '"schemaVersion": 99,');
    expect(() => parseExport(file)).toThrow(/เวอร์ชันไฟล์ไม่รองรับ/);
  });

  it('rejects a record with missing required fields, naming the record', () => {
    const envelope = JSON.parse(serializeExport([fixtureSheet('s1')], 'u'));
    delete envelope.records[0].recordedByUid;
    expect(() => parseExport(JSON.stringify(envelope))).toThrow(/รายการที่ 1/);
  });

  it('rejects env with the wrong number of rounds', () => {
    const envelope = JSON.parse(serializeExport([fixtureSheet('s1')], 'u'));
    envelope.records[0].env = [{ t: 25, h: 50 }];
    expect(() => parseExport(JSON.stringify(envelope))).toThrow(/ข้อมูลไม่ครบ/);
  });
});
