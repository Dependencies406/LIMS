import { describe, it, expect, vi } from 'vitest';
import {
  getRecordTableColumns,
  computeSectionSpans,
  formatRecordValueForPdf,
  renderRecordTable,
  computeRecordTableLayout,
  distributeRecordTableColumnWidths,
  resolveDegradedText,
  resolveRecordTableCellLines,
  evaluateRecordTableColumnFit,
  evaluateRecordTableOverflowFit,
  clampRecordTableMaxWrapLines,
  RECORD_TABLE_MIN_COLUMN_WIDTH,
  RECORD_TABLE_FONT_FLOOR,
  RECORD_TABLE_DEFAULT_MAX_WRAP_LINES,
  RECORD_TABLE_MIN_WRAP_LINES,
  RECORD_TABLE_MAX_WRAP_LINES,
} from '../renderRecordTable';
import { layoutTextToLines } from '../../pdfTextLayoutService';
import type { RecordTableElement } from '../../../modules/pdf-template-builder/types';
import type { ConversionRule, RecorderTemplate, RecordColumn, CalibrationRecord } from '../../../types';
import type { RendererHelpers } from '../rendererHelpers';

/**
 * A minimal, font-size-AWARE fake jsPDF, unlike the fixed `length*k` mock
 * used elsewhere in this codebase's PDF tests (e.g. pdfTextLayoutService's)
 * — Phase 27's degradation math (`shrinkFontToFit`) derives the required
 * font size directly from how text width scales with font size, so the
 * fake must actually scale, or every "does it still overflow after
 * shrinking" check would be measuring against the wrong width.
 */
function mockPdf(charWidthPerPt = 0.5) {
  let fontSize = 10;
  return {
    setFontSize: vi.fn((s: number) => { fontSize = s; }),
    getFontSize: () => fontSize,
    setFillColor: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    setTextColor: vi.fn(),
    rect: vi.fn(),
    text: vi.fn(),
    getTextWidth: (s: string) => String(s ?? '').length * fontSize * charWidthPerPt,
  } as any;
}

/** Real `wrapTextForCell` (mirrors `pdfTemplateRenderer.ts`'s private method) over the untouched `layoutTextToLines`. */
const testHelpers: RendererHelpers = {
  applyContentFont: () => {},
  normalizePdfText: (t: string) => t,
  formatDate: (v: unknown) => String(v ?? ''),
  wrapTextForCell: (text, maxWidth, fontSize, pdf) => {
    const raw = String(text ?? '');
    const paragraphs = raw.split(/\r?\n/);
    const out: string[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      out.push(...layoutTextToLines({ text: paragraphs[i] ?? '', maxWidth, pdf, fontSize }));
      if (i < paragraphs.length - 1) out.push('');
    }
    return out.length > 0 ? out : [''];
  },
};

function template(): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'UTM',
    equipmentTypeId: 'eqtype1',
    roundCount: 3,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['UTM'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [
      {
        id: 'CAL', label: 'Calibration', order: 0,
        columns: [
          { id: 'R1', label: 'Round 1', order: 0, type: 'number' },
          { id: 'R2', label: 'Round 2', order: 1, type: 'number' },
          { id: 'R3', label: 'Round 3', order: 2, type: 'number' },
        ],
      },
      {
        id: 'NOTE', label: 'Notes', order: 1,
        columns: [{ id: 'REM', label: 'Remark', order: 0, type: 'text' }],
      },
    ],
    summaryFields: [],
    customFunctions: [],
    status: 'active',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    updatedBy: 'u1',
  } as RecorderTemplate;
}

describe('getRecordTableColumns — `sections` filter (Phase 27 Task 1)', () => {
  it('filters to the given sections, in the given order — not template order', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0, sections: ['NOTE', 'CAL'] } as RecordTableElement;
    const cols = getRecordTableColumns(el, template());
    expect(cols.map((c) => c.key)).toEqual(['NOTE_REM', 'CAL_R1', 'CAL_R2', 'CAL_R3']);
  });

  it('omitted `sections` keeps every section, in template order — the existing-template case (Phase 29 test 1)', () => {
    const omitted = getRecordTableColumns({ id: 'e1', type: 'record-table', x: 0, y: 0 } as RecordTableElement, template());
    expect(omitted.map((c) => c.key)).toEqual(['CAL_R1', 'CAL_R2', 'CAL_R3', 'NOTE_REM']);
  });

  it('`sections: []` renders NOTHING — it does NOT fall back to all (Phase 29 test 2, the reported bug)', () => {
    const empty = getRecordTableColumns({ id: 'e1', type: 'record-table', x: 0, y: 0, sections: [] } as RecordTableElement, template());
    expect(empty).toEqual([]);
  });

  it('`sections` then `columns` narrows within the surviving sections', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0, sections: ['CAL'], columns: ['CAL_R2', 'CAL_R1'] } as RecordTableElement;
    const cols = getRecordTableColumns(el, template());
    expect(cols.map((c) => c.key)).toEqual(['CAL_R2', 'CAL_R1']);
  });

  it('a `columns` key from a section excluded by `sections` is dropped, not an error', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0, sections: ['CAL'], columns: ['CAL_R1', 'NOTE_REM'] } as RecordTableElement;
    const cols = getRecordTableColumns(el, template());
    expect(cols.map((c) => c.key)).toEqual(['CAL_R1']);
  });

  it('a section id absent from the (possibly newer) pinned template is skipped silently, without crashing', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0, sections: ['CAL', 'GHOST', 'NOTE'] } as RecordTableElement;
    expect(() => getRecordTableColumns(el, template())).not.toThrow();
    const cols = getRecordTableColumns(el, template());
    expect(cols.map((c) => c.sectionId)).toEqual(['CAL', 'CAL', 'CAL', 'NOTE']);
  });

  it('a `sections` filter that matches nothing leaves zero columns (render-nothing case), without crashing', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0, sections: ['GHOST'] } as RecordTableElement;
    expect(getRecordTableColumns(el, template())).toEqual([]);
  });
});

describe('getRecordTableColumns — column selection round-trips on the element', () => {
  it('includes every column, in template order, when element.columns is omitted', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0 } as RecordTableElement;
    const cols = getRecordTableColumns(el, template());
    expect(cols.map((c) => c.key)).toEqual(['CAL_R1', 'CAL_R2', 'CAL_R3', 'NOTE_REM']);
  });

  it('`columns: []` renders NOTHING — it does NOT fall back to all (Phase 29 test 3, same fix as `sections`)', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0, columns: [] } as RecordTableElement;
    const cols = getRecordTableColumns(el, template());
    expect(cols).toEqual([]);
  });

  it('round-trips a specific subset in the exact saved order, not template order', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0, columns: ['CAL_R3', 'CAL_R1'] } as RecordTableElement;
    const cols = getRecordTableColumns(el, template());
    expect(cols.map((c) => c.key)).toEqual(['CAL_R3', 'CAL_R1']);
  });

  it('drops a saved key that no longer exists in the (possibly newer) template, without crashing', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0, columns: ['CAL_R1', 'CAL_R99', 'NOTE_REM'] } as RecordTableElement;
    const cols = getRecordTableColumns(el, template());
    expect(cols.map((c) => c.key)).toEqual(['CAL_R1', 'NOTE_REM']);
  });

  it('re-selecting after a round-trip (serialize/deserialize as plain JSON) produces the same columns', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0, columns: ['CAL_R2', 'CAL_R1'] } as RecordTableElement;
    const roundTripped = JSON.parse(JSON.stringify(el)) as RecordTableElement;
    expect(getRecordTableColumns(roundTripped, template()).map((c) => c.key)).toEqual(['CAL_R2', 'CAL_R1']);
  });
});

describe('getRecordTableColumns — column header includes unit (Phase 15 Task 1, superseded)', () => {
  function templateWithFixedUnit(): RecorderTemplate {
    const t = template();
    (t.sections[0].columns[0] as RecordColumn).unitMode = 'fixed';
    (t.sections[0].columns[0] as RecordColumn).unit = 'N';
    return t;
  }

  function templateWithSelectableUnit(): RecorderTemplate {
    const t = template();
    (t.sections[0].columns[0] as RecordColumn).unitMode = 'selectable';
    (t.sections[0].columns[0] as RecordColumn).unitChoices = ['N', 'kN'];
    return t;
  }

  it('renders "label (unit)" for a fixed-unit column', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0 } as RecordTableElement;
    const cols = getRecordTableColumns(el, templateWithFixedUnit());
    expect(cols.find((c) => c.key === 'CAL_R1')!.label).toBe('Round 1 (N)');
  });

  it('renders "label (chosen)" for a selectable column when a record columnUnits map is passed', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0 } as RecordTableElement;
    const cols = getRecordTableColumns(el, templateWithSelectableUnit(), { CAL_R1: 'kN' });
    expect(cols.find((c) => c.key === 'CAL_R1')!.label).toBe('Round 1 (kN)');
  });

  it('renders the plain label for a selectable column with nothing chosen', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0 } as RecordTableElement;
    const cols = getRecordTableColumns(el, templateWithSelectableUnit());
    expect(cols.find((c) => c.key === 'CAL_R1')!.label).toBe('Round 1');
  });

  it('renders the plain label, no stray parentheses, for a column with no unit', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0 } as RecordTableElement;
    const cols = getRecordTableColumns(el, template());
    expect(cols.find((c) => c.key === 'CAL_R1')!.label).toBe('Round 1');
    expect(cols.map((c) => c.label).join('')).not.toContain('(');
  });

  it('exposes the resolved unit on the column plan itself — the same value the conversion pipeline uses as its target unit', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0 } as RecordTableElement;
    const cols = getRecordTableColumns(el, templateWithFixedUnit());
    expect(cols.find((c) => c.key === 'CAL_R1')!.unit).toBe('N');
  });
});

describe('computeSectionSpans', () => {
  it('groups contiguous same-section columns into one span', () => {
    const cols = getRecordTableColumns({ id: 'e1', type: 'record-table', x: 0, y: 0 } as RecordTableElement, template());
    const spans = computeSectionSpans(cols);
    expect(spans).toEqual([
      { sectionLabel: 'Calibration', startIndex: 0, endIndex: 2 },
      { sectionLabel: 'Notes', startIndex: 3, endIndex: 3 },
    ]);
  });

  it('does not merge non-contiguous columns from the same section (e.g. after reordering)', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0, columns: ['CAL_R1', 'NOTE_REM', 'CAL_R2'] } as RecordTableElement;
    const cols = getRecordTableColumns(el, template());
    const spans = computeSectionSpans(cols);
    expect(spans).toEqual([
      { sectionLabel: 'Calibration', startIndex: 0, endIndex: 0 },
      { sectionLabel: 'Notes', startIndex: 1, endIndex: 1 },
      { sectionLabel: 'Calibration', startIndex: 2, endIndex: 2 },
    ]);
  });
});

describe('formatRecordValueForPdf (ADR-011)', () => {
  const numberCol: RecordColumn = { id: 'X', label: 'X', order: 0, type: 'number', numberFormat: { notation: 'fixed', decimals: 2 } };
  const sciCol: RecordColumn = { id: 'X', label: 'X', order: 0, type: 'number', numberFormat: { notation: 'scientific', decimals: 3 } };
  const textCol: RecordColumn = { id: 'X', label: 'X', order: 0, type: 'text' };

  it('formats fixed notation to the declared decimals', () => {
    expect(formatRecordValueForPdf(1.23456, numberCol)).toBe('1.23');
  });

  it('formats scientific notation with uppercase E and always-signed exponent', () => {
    expect(formatRecordValueForPdf(7.882e21, sciCol)).toBe('7.882E+21');
  });

  it('never rounds a text column value', () => {
    expect(formatRecordValueForPdf('hello', textCol)).toBe('hello');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatRecordValueForPdf(null, numberCol)).toBe('');
    expect(formatRecordValueForPdf(undefined, numberCol)).toBe('');
  });
});

describe('formatRecordValueForPdf — ADR-015 conversion pipeline (Task 3/4, the PDF render path)', () => {
  const RULE: ConversionRule = {
    id: 'r1', name: 'mV/V to %', fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * 100',
    active: true, createdAt: new Date(), updatedAt: new Date(), createdBy: 'admin1',
  };
  const convertingFormulaCol: RecordColumn = {
    id: 'A', label: 'A', order: 0, type: 'formula', expression: '0.5',
    conversionEnabled: true, conversionSourceUnit: 'mV/V',
  };
  const plainFormulaCol: RecordColumn = { id: 'A', label: 'A', order: 0, type: 'formula', expression: '0.5' };

  it('a conversionEnabled formula column is converted before printing (test 3/8, PDF path)', () => {
    const text = formatRecordValueForPdf(0.5, convertingFormulaCol, { targetUnit: '%', rules: [RULE] });
    expect(text).toBe('50');
  });

  it('no conversion object supplied: behaves exactly as before this phase (backward compatible)', () => {
    expect(formatRecordValueForPdf(0.5, convertingFormulaCol)).toBe('0.5');
  });

  it('a formula column WITHOUT conversionEnabled is never converted, even with a matching rule (D9, PDF path)', () => {
    expect(formatRecordValueForPdf(0.5, plainFormulaCol, { targetUnit: '%', rules: [RULE] })).toBe('0.5');
  });

  it('D6: no rule for the pair — raw value printed, with a visible " [!]" marker, never blank, never throws', () => {
    expect(() => formatRecordValueForPdf(0.5, convertingFormulaCol, { targetUnit: '%', rules: [] })).not.toThrow();
    const text = formatRecordValueForPdf(0.5, convertingFormulaCol, { targetUnit: '%', rules: [] });
    expect(text).toBe('0.5 [!]');
  });
});

describe('formatRecordValueForPdf — ADR-015 D7: a frozen snapshot overrides the live rule library', () => {
  const convertingFormulaCol: RecordColumn = {
    id: 'A', label: 'A', order: 0, type: 'formula', expression: '0.5',
    conversionEnabled: true, conversionSourceUnit: 'mV/V',
  };

  it('uses the snapshot\'s convertedValue directly, ignoring whatever the live rules would produce', () => {
    const liveRuleThatWouldDisagree: ConversionRule = {
      id: 'r-live', name: 'edited rule', fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * 999999',
      active: true, createdAt: new Date(), updatedAt: new Date(), createdBy: 'admin1',
    };
    const text = formatRecordValueForPdf(0.5, convertingFormulaCol, {
      targetUnit: '%',
      rules: [liveRuleThatWouldDisagree],
      snapshot: {
        ruleId: 'r-old', ruleName: 'original rule', expression: 'VALUE * 100',
        sourceUnit: 'mV/V', targetUnit: '%', rawValue: 0.5, convertedValue: 50, capturedAt: new Date(),
      },
    });
    // 50, from the FROZEN snapshot — not 499999.5, which the live rule would give.
    expect(text).toBe('50');
  });

  it('falls back to the live rules when no snapshot is present (a draft, or an older record)', () => {
    const RULE: ConversionRule = {
      id: 'r1', name: 'mV/V to %', fromUnit: 'mV/V', toUnit: '%', expression: 'VALUE * 100',
      active: true, createdAt: new Date(), updatedAt: new Date(), createdBy: 'admin1',
    };
    const text = formatRecordValueForPdf(0.5, convertingFormulaCol, { targetUnit: '%', rules: [RULE] });
    expect(text).toBe('50');
  });
});

describe('getRecordTableColumns — sameAs unit inheritance (Phase 15)', () => {
  function templateWithInheritedUnit(): RecorderTemplate {
    const t = template();
    (t.sections[0].columns[0] as RecordColumn).unitMode = 'selectable';
    (t.sections[0].columns[0] as RecordColumn).unitChoices = ['N', 'kN'];
    (t.sections[0].columns[1] as RecordColumn).unitMode = 'sameAs';
    (t.sections[0].columns[1] as RecordColumn).unitSourceColumn = 'CAL_R1';
    return t;
  }

  it('the PDF band prints the inherited unit on the referring column', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0 } as RecordTableElement;
    const cols = getRecordTableColumns(el, templateWithInheritedUnit(), { CAL_R1: 'kN' });
    expect(cols.find((c) => c.key === 'CAL_R1')!.label).toBe('Round 1 (kN)');
    expect(cols.find((c) => c.key === 'CAL_R2')!.label).toBe('Round 2 (kN)');
  });

  it('an unpicked source leaves both headers plain', () => {
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0 } as RecordTableElement;
    const cols = getRecordTableColumns(el, templateWithInheritedUnit());
    expect(cols.find((c) => c.key === 'CAL_R2')!.label).toBe('Round 2');
  });
});

describe('distributeRecordTableColumnWidths (Phase 27 Task 2, steps 1-4)', () => {
  it('never gives a column less than the minimum width, even when the table is impossibly narrow', () => {
    const widths = distributeRecordTableColumnWidths([500, 500, 500, 500, 500], 100, RECORD_TABLE_MIN_COLUMN_WIDTH);
    expect(widths.every((w) => w >= RECORD_TABLE_MIN_COLUMN_WIDTH)).toBe(true);
    // Step 4: impossible layout still renders at the minimum (accepted overflow), not less.
    expect(widths.every((w) => w === RECORD_TABLE_MIN_COLUMN_WIDTH)).toBe(true);
  });

  it('distributes proportionally to natural width when everything fits, not equally (step 2)', () => {
    const widths = distributeRecordTableColumnWidths([50, 150], 200, 20);
    expect(widths[0]).toBeCloseTo(50, 6);
    expect(widths[1]).toBeCloseTo(150, 6);
    expect(widths[1]).toBeGreaterThan(widths[0]); // the long-text column gets more (test 8)
  });

  it('sums exactly to totalWidth whenever the layout is possible', () => {
    const fitting = distributeRecordTableColumnWidths([10, 500, 30], 300, 36);
    expect(fitting.reduce((a, b) => a + b, 0)).toBeCloseTo(300, 6);

    const overflowingNatural = distributeRecordTableColumnWidths([40, 400], 200, 36);
    expect(overflowingNatural.reduce((a, b) => a + b, 0)).toBeCloseTo(200, 6);
  });

  it('floors every column at the minimum, then gives the hungrier column more of what is left over (step 3)', () => {
    const widths = distributeRecordTableColumnWidths([40, 400], 200, 36);
    expect(widths[0]).toBeGreaterThanOrEqual(36);
    expect(widths[1]).toBeGreaterThanOrEqual(36);
    expect(widths[1]).toBeGreaterThan(widths[0]);
  });
});

describe('computeRecordTableLayout + resolveDegradedText — degradation order (Phase 27 Task 2.3)', () => {
  function fixtureRecord(rows: Array<Record<string, unknown>>): CalibrationRecord {
    return { id: 'rec1', rows } as unknown as CalibrationRecord;
  }

  it('shrinks the font to fit and does NOT truncate when the font floor alone is enough', () => {
    const pdf = mockPdf(0.5);
    const col = { key: 'CAL_R1', label: '1234567890', align: 'left' as const, sectionId: 'CAL', sectionLabel: 'Calibration', column: { id: 'R1', label: '1234567890', order: 0, type: 'text' } as RecordColumn };
    const rawText = '1234567890'; // 10 chars, natural width @ fontSize 10 = 10*10*0.5 = 50
    const rows = [{ CAL_R1: rawText }];

    const layout = computeRecordTableLayout({
      pdf, columns: [col], rows, conversionRules: [], conversionSnapshotFor: () => undefined,
      totalWidth: 48, // content width 40 after 2*4pt padding -> required font = 10 * 40/50 = 8 (above the floor of 6)
      fontSize: 10, headerFontSize: 10, sectionHeaderFontSize: 10,
      showSectionHeaders: false, spans: [], cellPadding: 4,
      cellBold: false, headerBold: true, sectionHeaderBold: true, helpers: testHelpers,
    });

    expect(layout.cellFontSize).toBeLessThan(10);
    expect(layout.cellFontSize).toBeGreaterThan(RECORD_TABLE_FONT_FLOOR);

    const width = Math.max(1, layout.colWidths[0] - 4 * 2);
    const text = resolveDegradedText(pdf, rawText, width, layout.cellFontSize);
    expect(text).toBe(rawText); // untruncated — no ellipsis
  });

  it('regression: a five-section-worth of columns in a pathologically narrow table degrades by font-shrink then ellipsis, never single-character lines', () => {
    const pdf = mockPdf(0.5);
    const el = { id: 'e1', type: 'record-table', x: 0, y: 0 } as RecordTableElement;
    const cols = getRecordTableColumns(el, template()); // 4 columns: CAL_R1, CAL_R2, CAL_R3, NOTE_REM
    const longRemark = 'A fairly long remark that will not fit in a narrow column';
    const rows = [{ CAL_R1: 123.456, CAL_R2: 234.567, CAL_R3: 345.678, NOTE_REM: longRemark }];
    const record = fixtureRecord(rows);
    const spans = computeSectionSpans(cols);

    const layout = computeRecordTableLayout({
      pdf, columns: cols, rows: record.rows, conversionRules: [], conversionSnapshotFor: () => undefined,
      totalWidth: 60, // the reported bug's scenario: many columns squeezed into far too little width
      fontSize: 9, headerFontSize: 9, sectionHeaderFontSize: 9,
      showSectionHeaders: true, spans, cellPadding: 4,
      cellBold: false, headerBold: true, sectionHeaderBold: true, helpers: testHelpers,
    });

    // Step 4 (impossible layout): every column still gets exactly the minimum, never less.
    expect(layout.colWidths.every((w) => w >= RECORD_TABLE_MIN_COLUMN_WIDTH)).toBe(true);
    // Step 3a: font shrunk all the way to the floor — there's no room left otherwise.
    expect(layout.cellFontSize).toBe(RECORD_TABLE_FONT_FLOOR);

    const remarkIndex = cols.findIndex((c) => c.key === 'NOTE_REM');
    const width = Math.max(1, layout.colWidths[remarkIndex] - 4 * 2);
    const text = resolveDegradedText(pdf, longRemark, width, layout.cellFontSize);
    const lines = testHelpers.wrapTextForCell(text, width, layout.cellFontSize, pdf);

    // The regression this test guards: NEVER one character (or a handful of
    // characters) per line stacked down the page — the Phase 27 bug.
    expect(lines.length).toBe(1);
    expect(text.endsWith('…')).toBe(true); // ellipsis truncated (step 3b)
    expect(lines[0].replace('…', '').length).toBeGreaterThan(1);
  });
});

describe('renderRecordTable — section header spans stay aligned with variable column widths (Phase 27 Task 2)', () => {
  it('every section span\'s drawn rect width equals the sum of its columns\' drawn rect widths', () => {
    const pdf = mockPdf(0.5);
    const tpl = template();
    // Give CAL_R2 a much longer natural width than its siblings so the
    // distribution is genuinely non-uniform, not accidentally equal.
    const record = {
      id: 'rec1', rows: [{ CAL_R1: 1, CAL_R2: 222222222, CAL_R3: 3, NOTE_REM: 'x' }],
      conversionSnapshots: {}, columnUnits: {},
    } as unknown as CalibrationRecord;
    const element = { id: 'rt', type: 'record-table', x: 10, y: 10, width: 400 } as RecordTableElement;
    const cols = getRecordTableColumns(element, tpl, {});
    const spans = computeSectionSpans(cols); // [{Calibration, 0..2}, {Notes, 3..3}]

    renderRecordTable(pdf, element, { record, recordTemplate: tpl, conversionRules: [] }, undefined, testHelpers);

    // Draw order (renderRecordTable.ts Pass 2): section-header band first
    // (fill+stroke rect per span), then the column-header band (fill+stroke
    // rect per column) — read the actual drawn geometry back out of the
    // `rect` spy rather than recomputing it, so this is a genuine
    // regression check on what got drawn, not a tautology.
    const rectCalls = (pdf.rect as any).mock.calls as Array<[number, number, number, number, string?]>;
    const spanRects = rectCalls.slice(0, spans.length * 2).filter((_, i) => i % 2 === 0);
    const colRects = rectCalls
      .slice(spans.length * 2, spans.length * 2 + cols.length * 2)
      .filter((_, i) => i % 2 === 0);

    const distinctColWidths = new Set(colRects.map((c) => Math.round(c[2])));
    expect(distinctColWidths.size).toBeGreaterThan(1); // genuinely non-uniform widths
    expect(colRects.reduce((sum, c) => sum + c[2], 0)).toBeCloseTo(400, 5); // columns fill the element width

    for (const span of spans) {
      const spanRectWidth = spanRects[spans.indexOf(span)][2];
      const columnsSumWidth = colRects.slice(span.startIndex, span.endIndex + 1).reduce((sum, c) => sum + c[2], 0);
      expect(spanRectWidth).toBeCloseTo(columnsSumWidth, 5);
      const spanRectX = spanRects[spans.indexOf(span)][0];
      expect(spanRectX).toBeCloseTo(colRects[span.startIndex][0], 5); // spans start flush with their first column
    }
  });

  it('an element with neither `sections` nor `columns` renders every column, unchanged from before this phase', () => {
    const pdf = mockPdf(0.5);
    const tpl = template();
    const record = {
      id: 'rec1', rows: [{ CAL_R1: 1, CAL_R2: 2, CAL_R3: 3, NOTE_REM: 'x' }],
      conversionSnapshots: {}, columnUnits: {},
    } as unknown as CalibrationRecord;
    const element = { id: 'rt', type: 'record-table', x: 0, y: 0, width: 500 } as RecordTableElement;

    renderRecordTable(pdf, element, { record, recordTemplate: tpl, conversionRules: [] }, undefined, testHelpers);

    const cols = getRecordTableColumns(element, tpl, {});
    expect(cols.map((c) => c.key)).toEqual(['CAL_R1', 'CAL_R2', 'CAL_R3', 'NOTE_REM']);
    expect(pdf.rect).toHaveBeenCalled();
  });
});

describe('evaluateRecordTableColumnFit (Phase 27 Task 3 — Properties Panel warning)', () => {
  it('flags a selection that would push columns below the minimum width', () => {
    const result = evaluateRecordTableColumnFit(15, 400); // ~26.7pt/column, well under the 36pt minimum
    expect(result.belowMinimum).toBe(true);
    expect(result.columnCount).toBe(15);
    expect(result.approxColumnWidth).toBeCloseTo(400 / 15, 6);
  });

  it('does not flag a selection with comfortable room per column', () => {
    const result = evaluateRecordTableColumnFit(4, 400); // 100pt/column
    expect(result.belowMinimum).toBe(false);
  });

  it('does not flag (and does not divide by zero) when there are no columns selected', () => {
    const result = evaluateRecordTableColumnFit(0, 400);
    expect(result.belowMinimum).toBe(false);
    expect(Number.isFinite(result.approxColumnWidth)).toBe(true);
  });

  it('sits exactly on the boundary the renderer itself uses', () => {
    const exactlyAtMinimum = evaluateRecordTableColumnFit(10, RECORD_TABLE_MIN_COLUMN_WIDTH * 10);
    expect(exactlyAtMinimum.belowMinimum).toBe(false);
    const justUnder = evaluateRecordTableColumnFit(10, RECORD_TABLE_MIN_COLUMN_WIDTH * 10 - 1);
    expect(justUnder.belowMinimum).toBe(true);
  });
});

describe('clampRecordTableMaxWrapLines (Phase 28 Task 1)', () => {
  it('defaults when omitted or not a finite number', () => {
    expect(clampRecordTableMaxWrapLines(undefined)).toBe(RECORD_TABLE_DEFAULT_MAX_WRAP_LINES);
    expect(clampRecordTableMaxWrapLines(NaN)).toBe(RECORD_TABLE_DEFAULT_MAX_WRAP_LINES);
  });

  it('clamps to the permitted range', () => {
    expect(clampRecordTableMaxWrapLines(0)).toBe(RECORD_TABLE_MIN_WRAP_LINES);
    expect(clampRecordTableMaxWrapLines(-5)).toBe(RECORD_TABLE_MIN_WRAP_LINES);
    expect(clampRecordTableMaxWrapLines(1000)).toBe(RECORD_TABLE_MAX_WRAP_LINES);
  });

  it('passes an in-range integer through unchanged, and rounds a fractional one', () => {
    expect(clampRecordTableMaxWrapLines(4)).toBe(4);
    expect(clampRecordTableMaxWrapLines(2.4)).toBe(2);
    expect(clampRecordTableMaxWrapLines(2.6)).toBe(3);
  });
});

describe('evaluateRecordTableOverflowFit (Phase 28 Task 3 — extends the Phase 27 warning, not a second banner)', () => {
  it('adds nothing extra outside wrap mode', () => {
    const ellipsis = evaluateRecordTableOverflowFit(15, 400, 'ellipsis');
    const shrinkOnly = evaluateRecordTableOverflowFit(15, 400, 'shrink-only');
    expect(ellipsis.belowMinimum).toBe(true);
    expect(ellipsis.wrapLikelyToTruncate).toBe(false);
    expect(shrinkOnly.wrapLikelyToTruncate).toBe(false);
  });

  it('flags wrap-will-likely-truncate exactly when the same selection is already below the minimum AND mode is wrap', () => {
    const belowMinWrap = evaluateRecordTableOverflowFit(15, 400, 'wrap'); // ~26.7pt/column
    expect(belowMinWrap.belowMinimum).toBe(true);
    expect(belowMinWrap.wrapLikelyToTruncate).toBe(true);

    const comfortableWrap = evaluateRecordTableOverflowFit(4, 400, 'wrap'); // 100pt/column
    expect(comfortableWrap.belowMinimum).toBe(false);
    expect(comfortableWrap.wrapLikelyToTruncate).toBe(false);
  });
});

describe('resolveRecordTableCellLines — overflowMode ladder step 4 (Phase 28 Task 1/2)', () => {
  const LONG_TEXT = 'Fairly long remark exceeding column width substantially today';

  it('ellipsis mode matches Phase 27\'s original two-step computation exactly (test 2)', () => {
    const pdf = mockPdf(0.5);
    const width = 40;
    const fontSize = 8;
    const viaOldPath = testHelpers.wrapTextForCell(resolveDegradedText(pdf, LONG_TEXT, width, fontSize), width, fontSize, pdf);
    const viaNewPath = resolveRecordTableCellLines(pdf, LONG_TEXT, width, fontSize, 'ellipsis', RECORD_TABLE_DEFAULT_MAX_WRAP_LINES, testHelpers.wrapTextForCell);
    expect(viaNewPath).toEqual(viaOldPath);
    expect(viaNewPath.length).toBe(1);
  });

  it('wrap mode produces multiple lines for the same long text ellipsis mode keeps on one (test 3)', () => {
    const pdf = mockPdf(0.5);
    const width = 40;
    const fontSize = 8;
    const ellipsisLines = resolveRecordTableCellLines(pdf, LONG_TEXT, width, fontSize, 'ellipsis', 5, testHelpers.wrapTextForCell);
    const wrapLines = resolveRecordTableCellLines(pdf, LONG_TEXT, width, fontSize, 'wrap', 5, testHelpers.wrapTextForCell);
    expect(ellipsisLines.length).toBe(1);
    expect(wrapLines.length).toBeGreaterThan(1);
    expect(wrapLines.join(' ').replace(/\s+/g, ' ')).toContain('Fairly'); // real wrapped content, not truncated away
  });

  it('wrap mode caps at maxWrapLines and ellipsis-truncates the LAST kept line once there is more text than that (test 4)', () => {
    const pdf = mockPdf(0.5);
    const manyWords = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ');
    const lines = resolveRecordTableCellLines(pdf, manyWords, 40, 8, 'wrap', 2, testHelpers.wrapTextForCell);
    expect(lines.length).toBe(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });

  it('wrap mode does NOT truncate when everything fits within maxWrapLines', () => {
    const pdf = mockPdf(0.5);
    const lines = resolveRecordTableCellLines(pdf, 'short text', 40, 8, 'wrap', 5, testHelpers.wrapTextForCell);
    expect(lines.some((l) => l.includes('…'))).toBe(false);
  });

  it('shrink-only mode returns the full text as a single, untruncated line regardless of width (test 5)', () => {
    const pdf = mockPdf(0.5);
    const lines = resolveRecordTableCellLines(pdf, LONG_TEXT, 20, 8, 'shrink-only', 3, testHelpers.wrapTextForCell);
    expect(lines).toEqual([LONG_TEXT]);
    expect(lines.some((l) => l.includes('…'))).toBe(false);
  });

  it('no mode ever produces a single-character (post-ellipsis) line, even at the 36pt minimum column width at the font floor (test 7)', () => {
    const pdf = mockPdf(0.5);
    const width = RECORD_TABLE_MIN_COLUMN_WIDTH - 4 * 2; // narrowest legal content width
    for (const mode of ['ellipsis', 'wrap', 'shrink-only'] as const) {
      const lines = resolveRecordTableCellLines(pdf, LONG_TEXT, width, RECORD_TABLE_FONT_FLOOR, mode, 3, testHelpers.wrapTextForCell);
      for (const line of lines) {
        const kept = line.endsWith('…') ? line.slice(0, -1) : line;
        if (kept.length > 0) expect(kept.length).toBeGreaterThan(1);
      }
    }
  });
});

describe('computeRecordTableLayout — font shrink is mode-agnostic (Phase 28 Task 1 "step 3 ALWAYS runs", test 6)', () => {
  it('has no `mode` parameter at all — shrink cannot be skipped by any overflowMode, structurally', () => {
    const pdf = mockPdf(0.5);
    const col = { key: 'CAL_R1', label: 'X', align: 'left' as const, sectionId: 'CAL', sectionLabel: 'Calibration', column: { id: 'R1', label: 'X', order: 0, type: 'text' } as RecordColumn };
    const longText = 'Fairly long remark exceeding column width substantially today';
    const layout = computeRecordTableLayout({
      pdf, columns: [col], rows: [{ CAL_R1: longText }], conversionRules: [], conversionSnapshotFor: () => undefined,
      totalWidth: 48, fontSize: 10, headerFontSize: 10, sectionHeaderFontSize: 10,
      showSectionHeaders: false, spans: [], cellPadding: 4,
      cellBold: false, headerBold: true, sectionHeaderBold: true, helpers: testHelpers,
    });
    expect(layout.cellFontSize).toBeLessThan(10);
    expect(layout.cellFontSize).toBeGreaterThanOrEqual(RECORD_TABLE_FONT_FLOOR);
  });
});

describe('renderRecordTable — overflowMode defaulting (Phase 28 Task 1, "byte-identical" requirement, tests 1 & 6)', () => {
  function fixtureRecord() {
    return {
      id: 'rec1',
      rows: [{ CAL_R1: 1, CAL_R2: 2, CAL_R3: 3, NOTE_REM: 'Fairly long remark exceeding column width substantially today' }],
      conversionSnapshots: {}, columnUnits: {},
    } as unknown as CalibrationRecord;
  }

  it('an element with no `overflowMode` draws IDENTICAL text and geometry to one with `overflowMode: \'ellipsis\'` set explicitly', () => {
    const pdfA = mockPdf(0.5);
    const pdfB = mockPdf(0.5);
    const tpl = template();
    const jobData = { record: fixtureRecord(), recordTemplate: tpl, conversionRules: [] };
    const elA = { id: 'rt', type: 'record-table', x: 0, y: 0, width: 60 } as RecordTableElement; // no overflowMode
    const elB = { id: 'rt', type: 'record-table', x: 0, y: 0, width: 60, overflowMode: 'ellipsis' as const } as RecordTableElement;

    renderRecordTable(pdfA, elA, jobData, undefined, testHelpers);
    renderRecordTable(pdfB, elB, jobData, undefined, testHelpers);

    const textA = (pdfA.text as any).mock.calls;
    const textB = (pdfB.text as any).mock.calls;
    expect(textA).toEqual(textB);
    const rectA = (pdfA.rect as any).mock.calls;
    const rectB = (pdfB.rect as any).mock.calls;
    expect(rectA).toEqual(rectB);
    expect(textA.length).toBeGreaterThan(0); // sanity: something was actually drawn
  });
});
