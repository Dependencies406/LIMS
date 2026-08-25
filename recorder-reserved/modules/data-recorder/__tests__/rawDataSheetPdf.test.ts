import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalibrationRawDataSheet, SheetRow } from '../../../types';

// ─── Mocks (style of pdfTemplateRenderer.test.ts: jspdf fully mocked) ────────

const callOrder: string[] = [];
const textCalls: string[] = [];
const autoTableCalls: Array<Record<string, unknown>> = [];

vi.mock('jspdf', () => {
  class MockJsPdf {
    ctorOptions: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.ctorOptions = options;
      (MockJsPdf as unknown as { last: MockJsPdf }).last = this;
    }
    internal = { pageSize: { getWidth: () => 297, getHeight: () => 210 } };
    addFileToVFS = vi.fn();
    addFont = vi.fn();
    setFont = vi.fn();
    setFontSize = vi.fn();
    setTextColor = vi.fn();
    setDrawColor = vi.fn();
    line = vi.fn();
    addPage = vi.fn();
    setPage = vi.fn();
    getNumberOfPages = vi.fn(() => 1);
    save = vi.fn();
    text = vi.fn((content: string) => {
      callOrder.push('text');
      textCalls.push(content);
    });
  }
  return { default: MockJsPdf };
});

vi.mock('jspdf-autotable', () => ({
  default: vi.fn((pdf: Record<string, unknown>, options: Record<string, unknown>) => {
    callOrder.push('autoTable');
    autoTableCalls.push(options);
    (pdf as { lastAutoTable?: { finalY: number } }).lastAutoTable = { finalY: 60 };
  }),
}));

vi.mock('../../../services/pdfFontManager', () => ({
  pdfFontManager: {
    ensureFontsReadyForPdf: vi.fn(async () => {
      callOrder.push('ensureFonts');
      return true;
    }),
    applyFont: vi.fn(() => {
      callOrder.push('applyFont');
      return { family: 'Sarabun', style: 'normal', usedThaiFont: true, containsThai: true, registeredForCurrentPdf: true };
    }),
  },
}));

import { buildRawDataSheetPdf } from '../pdf/rawDataSheetPdf';

// ─── Fixture ─────────────────────────────────────────────────────────────────

function row(calPoint: number): SheetRow {
  return {
    calPoint, standardEquipmentId: 'CAL-FRC-004', equationId: 'eq1',
    cells: {
      inc1: { uuc: calPoint, sig: -0.032, force: calPoint + 2.5 },
      inc2: { uuc: calPoint, sig: -0.0321, force: calPoint + 1.7 },
      inc3: { uuc: calPoint, sig: -0.0319, force: calPoint + 1.1 },
      dec3: { uuc: null, sig: null, force: null },
    },
  };
}

function sheet(rows: SheetRow[], overrides: Partial<CalibrationRawDataSheet> = {}): CalibrationRawDataSheet {
  return {
    id: 'sheet-pdf-test-1',
    kind: 'original', amends: null,
    jobId: 'job-1', requestNo: 'SCS-CAL-26024',
    receivedDate: '2026-07-04', calibrationDate: '2026-07-14',
    uuc: { equipmentName: 'Seat Belt Anchorage Testing Machine', serial: 'AT-1', readingUnit: 'N', resolution: 0.01 },
    calibrationRange: '4000-40000 N', direction: 'Tension',
    standards: [{
      equipmentId: 'CAL-FRC-004', equationId: 'eq1',
      code: 'CAL-FRC-004 — Tensile 10-100 kN', name: 'Force Transducer',
      serial: '66782', dueDate: '2026-12-09', equationName: 'Tensile 10-100 kN',
      degree: 3, coefficients: [0.0138, -0.0013, -125.015, 0], divisor: 1,
      inputUnit: 'mV/V', outputUnit: 'kN',
    }],
    envStandard: { equipmentId: 'CAL-THM-001', code: 'CAL-THM-001', name: 'Thermo Hygrometer', serial: 'S1' },
    env: [{ t: 25, h: 52 }, { t: 25, h: 49 }, { t: 25, h: 50 }],
    machineCondition: 'Normal', decimalPlaces: 2,
    rows,
    recordedByUid: 'u1', recordedByName: 'Nattawat Rooplor',
    createdAt: new Date('2026-07-14T05:00:00Z'), schemaVersion: 1,
    ...overrides,
  };
}

beforeEach(() => {
  callOrder.length = 0;
  textCalls.length = 0;
  autoTableCalls.length = 0;
  vi.clearAllMocks();
});

// ─── Smoke tests ─────────────────────────────────────────────────────────────

describe('buildRawDataSheetPdf (smoke)', () => {
  it('renders 0, 1 and 12 measurement rows without throwing', async () => {
    await expect(buildRawDataSheetPdf(sheet([]))).resolves.toBeTruthy();
    await expect(buildRawDataSheetPdf(sheet([row(4000)]))).resolves.toBeTruthy();
    const many = Array.from({ length: 12 }, (_, i) => row(i * 4000));
    await expect(buildRawDataSheetPdf(sheet(many))).resolves.toBeTruthy();
  });

  it('uses A4 landscape', async () => {
    const pdf = await buildRawDataSheetPdf(sheet([row(4000)])) as unknown as { ctorOptions: Record<string, unknown> };
    expect(pdf.ctorOptions.orientation).toBe('landscape');
    expect(pdf.ctorOptions.format).toBe('a4');
  });

  it('registers Thai fonts BEFORE drawing any text', async () => {
    await buildRawDataSheetPdf(sheet([row(4000)]));
    const firstText = callOrder.indexOf('text');
    expect(callOrder.indexOf('ensureFonts')).toBeGreaterThanOrEqual(0);
    expect(callOrder.indexOf('ensureFonts')).toBeLessThan(firstText);
    expect(callOrder.indexOf('applyFont')).toBeLessThan(firstText);
  });

  it('passes every measurement row to the grid table', async () => {
    const many = Array.from({ length: 12 }, (_, i) => row(i * 4000));
    await buildRawDataSheetPdf(sheet(many));
    const grid = autoTableCalls[autoTableCalls.length - 1];
    expect((grid.body as unknown[]).length).toBe(12);
    // 2 fixed columns + 4 series × 3
    expect((grid.body as unknown[][])[0].length).toBe(14);
  });

  it('marks amendments in the subtitle', async () => {
    await buildRawDataSheetPdf(sheet([row(4000)], {
      kind: 'amendment', amends: 'sheet-original-9', amendmentReason: 'typo',
    }));
    expect(textCalls.some((t) => t.includes('Amendment of') && t.includes('typo'))).toBe(true);
  });

  it('includes the thermo-hygrometer row in the standards table', async () => {
    await buildRawDataSheetPdf(sheet([row(4000)]));
    const standardsTable = autoTableCalls[1];
    const body = standardsTable.body as string[][];
    expect(body.some((r) => r[0] === 'CAL-THM-001' && r[6] === 'Env.')).toBe(true);
  });
});
