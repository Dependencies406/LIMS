/**
 * Unit tests for PDF Template Renderer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job, RecorderTemplate, CalibrationRecord } from '../../types';
import type { PdfTemplate, TextElement, EquipmentTableElement, DocumentsTableElement, RecordTableElement, TrebTableElement } from '../../modules/pdf-template-builder/types';
import { EQUIPMENT_TABLE_DEFAULT_COLUMNS, DOCUMENTS_TABLE_DEFAULT_COLUMNS } from '../../modules/pdf-template-builder/types';
import { formatDateForDisplay } from '../../utils/dateDisplayFormatter';

const hoisted = vi.hoisted(() => ({
  addPage: vi.fn(),
  textCalls: [] as string[][],
  // (x, y, w, h) of every pdf.rect(...) call, plus the fill/stroke style arg
  // if given — Phase 28's pagination-consistency tests read row/column
  // geometry back out of these rather than recomputing it.
  rectCalls: [] as Array<[number, number, number, number, string | undefined]>,
  documentList: vi.fn(),
  setFontCalls: [] as Array<[string, string]>,
  addFontCalls: [] as Array<[string, string, string]>,
}));

vi.mock('jspdf', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      const text = vi.fn((...args: unknown[]) => {
        const line = args[0];
        const opts = args[3] as { maxWidth?: number } | undefined;
        if (typeof line === 'string') {
          hoisted.textCalls.push([line, String(args[1]), String(args[2]), opts?.maxWidth != null ? String(opts.maxWidth) : '']);
        }
      });
      return {
        setFontSize: vi.fn(),
        setFont: vi.fn((family: string, style: string) => {
          hoisted.setFontCalls.push([family, style]);
        }),
        setTextColor: vi.fn(),
        setDrawColor: vi.fn(),
        setLineWidth: vi.fn(),
        setFillColor: vi.fn(),
        text,
        addPage: hoisted.addPage,
        rect: vi.fn((x: number, y: number, w: number, h: number, style?: string) => {
          hoisted.rectCalls.push([x, y, w, h, style]);
        }),
        line: vi.fn(),
        addFileToVFS: vi.fn(),
        addFont: vi.fn((file: string, family: string, style: string) => {
          hoisted.addFontCalls.push([file, family, style]);
        }),
        output: vi.fn(() => ({ arraybuffer: new ArrayBuffer(0) })),
        getTextWidth: (s: string) => Math.max(4, String(s).length * 4.5),
        internal: {
          pageSize: {
            width: 595,
            height: 842,
          },
        },
      };
    }),
  };
});

vi.mock('../companyInfoService', () => ({
  getCompanyInfo: vi.fn().mockResolvedValue({ companyName: 'Test Co' }),
}));

vi.mock('../customerService', () => ({
  customerService: {
    getCustomerByCode: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../userService', () => ({
  userService: {
    getUserById: vi.fn().mockResolvedValue({ displayName: 'Staff' }),
  },
}));

vi.mock('../documentIndexService', () => ({
  documentIndexService: {
    list: () => hoisted.documentList(),
  },
}));

// Import after mocks
import { pdfTemplateRenderer } from '../pdfTemplateRenderer';

function defaultEquipmentColumns() {
  return EQUIPMENT_TABLE_DEFAULT_COLUMNS.map((def, idx) => ({
    id: def.id,
    label: def.label,
    visible: def.id === 'name',
    width: def.defaultWidth,
    align: 'left' as const,
    order: idx,
  }));
}

function defaultDocumentsColumns() {
  return DOCUMENTS_TABLE_DEFAULT_COLUMNS.map((def, idx) => ({
    id: def.id,
    label: def.label,
    visible: def.id === 'documentCode' || def.id === 'source',
    width: def.defaultWidth,
    align: 'left' as const,
    order: idx,
  }));
}

describe('PdfTemplateRenderer', () => {
  const mockJob: Job = {
    id: 'job1',
    jobId: 'JOB-001',
    title: 'Test Job',
    status: 'Completed',
    customerCode: 'CUST-001',
    customerName: 'Test Customer',
    customerAddress: '123 Test St',
    equipment: [],
    appointmentDate: '2024-01-01',
    created: new Date('2024-01-01'),
    assignedStaff: [],
  } as Job;

  beforeEach(() => {
    hoisted.addPage.mockClear();
    hoisted.textCalls = [];
    hoisted.rectCalls = [];
    hoisted.setFontCalls = [];
    hoisted.addFontCalls = [];
    hoisted.documentList.mockReset();
    hoisted.documentList.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as any);
  });

  describe('renderTemplate', () => {
    const expectThaiPipelineUsed = () => {
      const usedThaiFont = hoisted.setFontCalls.some(([family]) => family === 'Sarabun');
      expect(usedThaiFont).toBe(true);
    };

    it('should render a simple template', async () => {
      const prepSpy = vi.spyOn(pdfTemplateRenderer, 'prepareJobDataForPdf');
      const template: PdfTemplate = {
        name: 'Test Template',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'el1',
            type: 'text',
            x: 10,
            y: 10,
            text: 'Static Text',
            fontSize: 12,
            color: '#000000',
          } as TextElement,
        ],
      };

      const result = await pdfTemplateRenderer.renderTemplate(template, mockJob);
      expect(result).toBeDefined();
      expect(result.pdf).toBeDefined();
      expect(result.missingData).toBeDefined();
      expect(Array.isArray(result.missingData)).toBe(true);
      expect(prepSpy).toHaveBeenCalledOnce();
      prepSpy.mockRestore();
    });

    it('should detect and report missing data', async () => {
      const template: PdfTemplate = {
        name: 'Test Template',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'el1',
            type: 'text',
            x: 10,
            y: 10,
            dataSource: { type: 'text', key: 'job.missingProperty' },
          } as TextElement,
        ],
      };

      const result = await pdfTemplateRenderer.renderTemplate(template, mockJob, {
        showMissingDataAsNA: false,
      });

      expect(result.missingData.length).toBeGreaterThan(0);
      expect(result.missingData[0].dataSource).toBe('job.missingProperty');
    });

    it('should replace missing data with N/A when option is enabled', async () => {
      const template: PdfTemplate = {
        name: 'Test Template',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'el1',
            type: 'text',
            x: 10,
            y: 10,
            dataSource: { type: 'text', key: 'job.missingProperty' },
          } as TextElement,
        ],
      };

      const result = await pdfTemplateRenderer.renderTemplate(template, mockJob, {
        showMissingDataAsNA: true,
        missingDataLabel: 'N/A',
      });

      expect(result.missingData.length).toBeGreaterThan(0);
      expect(result.pdf).toBeDefined();
    });

    it('should handle templates with multiple elements', async () => {
      const template: PdfTemplate = {
        name: 'Test Template',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'el1',
            type: 'text',
            x: 10,
            y: 10,
            text: 'First Element',
          } as TextElement,
          {
            id: 'el2',
            type: 'text',
            x: 10,
            y: 30,
            text: 'Second Element',
          } as TextElement,
        ],
      };

      const result = await pdfTemplateRenderer.renderTemplate(template, mockJob);
      expect(result).toBeDefined();
      expect(result.pdf).toBeDefined();
    });

    it('should handle empty template', async () => {
      const template: PdfTemplate = {
        name: 'Empty Template',
        description: '',
        pageSize: 'A4',
        elements: [],
      };

      const result = await pdfTemplateRenderer.renderTemplate(template, mockJob);
      expect(result).toBeDefined();
      expect(result.pdf).toBeDefined();
      expect(result.missingData.length).toBe(0);
    });

    it('documents-table: renders document code and PDF source label from documentIndexService.list', async () => {
      hoisted.documentList.mockResolvedValue([
        {
          id: 'd1',
          documentCode: 'QP-99',
          type: 'Quality Procedure',
          revisionNumber: '01',
          documentName: 'Doc A',
          tags: [],
          effectiveDate: new Date('2024-06-01'),
          source: { kind: 'pdf' as const, storagePath: '/p/a.pdf', url: 'https://x/a.pdf', fileName: 'Procedure.pdf' },
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'u',
          updatedBy: 'u',
        },
      ]);

      const template: PdfTemplate = {
        name: 'Doc table',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'dt1',
            type: 'documents-table',
            x: 36,
            y: 72,
            width: 500,
            height: 400,
            columns: defaultDocumentsColumns(),
            dataSource: { type: 'documentIndex', key: 'documentIndex.list' },
          } as DocumentsTableElement,
        ],
      };

      await pdfTemplateRenderer.renderTemplate(template, mockJob);
      const flat = hoisted.textCalls.map((c) => c[0]).join('|');
      expect(flat).toContain('QP-99');
      expect(flat).toContain('PDF: Procedure.pdf');
    });

    it('renderTemplateWithContext falls back to documentIndexService.list when context has no documentIndexItems', async () => {
      hoisted.documentList.mockResolvedValue([
        {
          id: 'dctx1',
          documentCode: 'CTX-01',
          type: 'Quality Procedure',
          revisionNumber: '01',
          documentName: 'Context fallback',
          tags: [],
          effectiveDate: new Date('2024-06-01'),
          source: { kind: 'pdf' as const, storagePath: '/p/ctx.pdf', url: 'https://x/ctx.pdf', fileName: 'ctx.pdf' },
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'u',
          updatedBy: 'u',
        },
      ]);

      const template: PdfTemplate = {
        name: 'Context fallback',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'dt-ctx',
            type: 'documents-table',
            x: 36,
            y: 72,
            width: 500,
            height: 200,
            columns: defaultDocumentsColumns(),
            dataSource: { type: 'documentIndex', key: 'documentIndex.list' },
          } as DocumentsTableElement,
        ],
      };

      await pdfTemplateRenderer.renderTemplateWithContext(template, {
        footer: { text: '', page_number: 1, total_pages: 1 },
      } as any);

      expect(hoisted.documentList).toHaveBeenCalled();
      const flat = hoisted.textCalls.map((c) => c[0]).join('|');
      expect(flat).toContain('CTX-01');
    });

    it('documents-table effectiveDate matches shared web formatter output', async () => {
      const effectiveDate = new Date('2024-01-01T00:30:00+07:00');
      hoisted.documentList.mockResolvedValue([
        {
          id: 'd3',
          documentCode: 'DATE-1',
          type: 'Quality Procedure',
          revisionNumber: '01',
          documentName: 'Date test',
          tags: [],
          effectiveDate,
          source: { kind: 'pdf' as const, storagePath: '/p/a.pdf', url: 'https://x/a.pdf', fileName: 'date.pdf' },
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'u',
          updatedBy: 'u',
        },
      ]);
      const template: PdfTemplate = {
        name: 'Date format',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'dt3',
            type: 'documents-table',
            x: 36,
            y: 72,
            width: 500,
            height: 300,
            columns: defaultDocumentsColumns().map((c) => ({ ...c, visible: c.id === 'effectiveDate' })),
            dataSource: { type: 'documentIndex', key: 'documentIndex.list' },
          } as DocumentsTableElement,
        ],
      };
      await pdfTemplateRenderer.renderTemplate(template, mockJob);
      const expected = formatDateForDisplay(effectiveDate);
      const flat = hoisted.textCalls.map((c) => c[0]).join('|');
      expect(flat).toContain(expected);
    });

    it('uses Thai-capable font when Thai text is rendered', async () => {
      const template: PdfTemplate = {
        name: 'Thai text',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'th1',
            type: 'text',
            x: 10,
            y: 10,
            staticText: 'ภาษาไทย ทดสอบ',
          } as TextElement,
        ],
      };
      await pdfTemplateRenderer.renderTemplate(template, mockJob);
      expectThaiPipelineUsed();
    });

    it('wraps Thai document names across multiple lines in narrow columns', async () => {
      hoisted.documentList.mockResolvedValue([
        {
          id: 'd2',
          documentCode: 'TH-01',
          type: 'Quality Procedure',
          revisionNumber: '01',
          documentName: 'เอกสารภาษาไทยยาวมากสำหรับทดสอบการตัดบรรทัด',
          tags: [],
          effectiveDate: new Date('2024-06-01'),
          source: { kind: 'pdf' as const, storagePath: '/p/a.pdf', url: 'https://x/a.pdf', fileName: 'thai.pdf' },
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'u',
          updatedBy: 'u',
        },
      ]);
      const cols = defaultDocumentsColumns().map((c) =>
        c.id === 'documentCode' || c.id === 'documentName'
          ? { ...c, visible: true, width: c.id === 'documentName' ? 50 : c.width }
          : { ...c, visible: false }
      );
      const template: PdfTemplate = {
        name: 'Thai table',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'dt2',
            type: 'documents-table',
            x: 36,
            y: 72,
            width: 300,
            height: 300,
            columns: cols,
            dataSource: { type: 'documentIndex', key: 'documentIndex.list' },
          } as DocumentsTableElement,
        ],
      };
      await pdfTemplateRenderer.renderTemplate(template, mockJob);
      expectThaiPipelineUsed();
      const thaiLineCalls = hoisted.textCalls.filter((c) => c[0].includes('เอกสาร'));
      expect(thaiLineCalls.length).toBeGreaterThan(0);
    });

    it('treb-table uses Thai-safe font pipeline for normal and merged cells', async () => {
      const template: PdfTemplate = {
        name: 'Treb Thai',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'tb1',
            type: 'treb-table',
            x: 40,
            y: 120,
            width: 300,
            height: 220,
            spreadsheetTemplateId: 's1',
            sourceTabId: 'tab1',
          } as any,
        ],
      };
      await pdfTemplateRenderer.renderTemplate(template, mockJob, {
        trebDataRegistry: {
          tab1: {
            data: [
              ['หัวข้อรวม', 'หัวข้อรวม', 'C3'],
              ['ภาษาไทย + English (A-01)', '123', 'ทดสอบ'],
            ],
            merges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 1 }],
            cellStyles: { '0,0': { bold: true }, '1,0': { bold: false } },
          },
        },
      });
      expectThaiPipelineUsed();
      const flat = hoisted.textCalls.map((c) => c[0]).join('|');
      expect(flat).toContain('ภาษาไทย + English (A');
      expect(flat).toContain('-01)');
    });

    it('repeated Thai-heavy renders stay stable across 3 runs', async () => {
      const template: PdfTemplate = {
        name: 'Thai repeat',
        description: '',
        pageSize: 'A4',
        elements: [
          {
            id: 'th-repeat',
            type: 'text',
            x: 20,
            y: 20,
            width: 240,
            staticText: 'ภาษาไทย ทดสอบ ครั้งที่ 1, 2, 3',
          } as TextElement,
        ],
      };

      for (let i = 0; i < 3; i += 1) {
        hoisted.setFontCalls = [];
        await pdfTemplateRenderer.renderTemplate(template, mockJob);
        expectThaiPipelineUsed();
      }

      // Per-instance font registration should happen for each jsPDF instance.
      expect(hoisted.addFontCalls.length).toBeGreaterThanOrEqual(12);
    });

    it('overflow: static text redrawn on continuation pages; equipment table splits rows; addPage count matches extra pages', async () => {
      const equipment = Array.from({ length: 12 }, (_, i) => ({
        id: `e${i}`,
        name: `Equipment ${i}`,
      }));

      const job: Job = { ...mockJob, equipment } as Job;

      const table: EquipmentTableElement = {
        id: 'eqt',
        type: 'equipment-table',
        x: 40,
        y: 120,
        width: 400,
        height: 48,
        columns: defaultEquipmentColumns(),
      };

      const template: PdfTemplate = {
        name: 'Overflow',
        description: '',
        pageSize: 'A4',
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [
              { id: 't1', type: 'text', x: 40, y: 40, staticText: 'Header static', fontSize: 11 } as TextElement,
              table,
            ],
          },
        ],
        elements: [],
      };

      await pdfTemplateRenderer.renderTemplate(template, job);

      expect(hoisted.addPage.mock.calls.length).toBeGreaterThan(0);
      const staticDraws = hoisted.textCalls.filter((c) => c[0] === 'Header static').length;
      expect(staticDraws).toBe(hoisted.addPage.mock.calls.length + 1);

      const nameDraws = hoisted.textCalls.filter((c) => /^Equipment \d+$/.test(c[0]));
      const seen = new Set(nameDraws.map((c) => c[0]));
      expect(seen.size).toBe(12);
    });

    it('Phase 30 Task 1: equipment-table "No." column renders a computed ordinal 1..N, continuing correctly across continuation pages (test 1)', async () => {
      const equipment = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, name: `Equipment ${i}` }));
      const job: Job = { ...mockJob, equipment } as Job;
      const columns = EQUIPMENT_TABLE_DEFAULT_COLUMNS.map((def, idx) => ({
        id: def.id,
        label: def.label,
        visible: def.id === 'no' || def.id === 'name',
        width: def.defaultWidth,
        align: 'left' as const,
        order: idx,
      }));
      const table: EquipmentTableElement = {
        id: 'eqt', type: 'equipment-table', x: 40, y: 120, width: 400, height: 48, columns,
      };
      const template: PdfTemplate = {
        name: 'Row number',
        description: '',
        pageSize: 'A4',
        pages: [{ id: 'p1', pageNumber: 1, pageSize: 'A4', orientation: 'portrait', elements: [table] }],
        elements: [],
      };

      await pdfTemplateRenderer.renderTemplate(template, job);

      expect(hoisted.addPage.mock.calls.length).toBeGreaterThan(0); // confirms this genuinely paginates

      // Before the fix, `eq['no']` was always undefined and every row's
      // ordinal cell rendered blank — nothing to find at all.
      const ordinalDraws = hoisted.textCalls.map((c) => c[0]).filter((s) => /^\d+$/.test(s));
      const seen = new Set(ordinalDraws);
      for (let n = 1; n <= 12; n++) {
        expect(seen.has(String(n))).toBe(true); // page 2+ continues 1..12, never restarts
      }
      expect(ordinalDraws.length).toBe(12); // exactly one ordinal per row, none dropped or duplicated
    });

    it('Phase 30 Task 3/4: equipment-table shows an honest empty state, not a silent blank, when there is no equipment (test 3)', async () => {
      const job: Job = { ...mockJob, equipment: [] } as Job;
      const table: EquipmentTableElement = {
        id: 'eqt', type: 'equipment-table', x: 40, y: 40, width: 300, height: 100, columns: defaultEquipmentColumns(),
      };
      const template: PdfTemplate = {
        name: 'Empty equipment',
        description: '',
        pageSize: 'A4',
        pages: [{ id: 'p1', pageNumber: 1, pageSize: 'A4', orientation: 'portrait', elements: [table] }],
        elements: [],
      };

      await expect(pdfTemplateRenderer.renderTemplate(template, job)).resolves.not.toThrow();
      expect(hoisted.textCalls.some((c) => c[0] === 'No equipment records.')).toBe(true);
    });

    it('documents-table shows an honest empty state, not a silent blank, when there are no documents (test 3)', async () => {
      hoisted.documentList.mockResolvedValue([]);
      const table: DocumentsTableElement = {
        id: 'dt', type: 'documents-table', x: 40, y: 40, width: 300, height: 100, columns: defaultDocumentsColumns(),
      };
      const template: PdfTemplate = {
        name: 'Empty documents',
        description: '',
        pageSize: 'A4',
        pages: [{ id: 'p1', pageNumber: 1, pageSize: 'A4', orientation: 'portrait', elements: [table] }],
        elements: [],
      };

      await expect(pdfTemplateRenderer.renderTemplate(template, mockJob)).resolves.not.toThrow();
      expect(hoisted.textCalls.some((c) => c[0] === 'No documents.')).toBe(true);
    });

    it('Phase 30 Task 4: treb-table shows a scope-mismatch message — not the generic "Data Not Found" — when trebDataRegistry was never populated for this scope', async () => {
      const template: PdfTemplate = {
        name: 'Treb wrong scope',
        description: '',
        pageSize: 'A4',
        pages: [{
          id: 'p1', pageNumber: 1, pageSize: 'A4', orientation: 'portrait',
          elements: [{ id: 'tt', type: 'treb-table', x: 40, y: 40, width: 200, spreadsheetTemplateId: 'tpl', sourceTabId: 'tab1' } as TrebTableElement],
        }],
        elements: [],
      };

      // renderTemplateWithContext (calibrationRecords/documents/staff) never
      // sets jobData.trebDataRegistry at all — this is the exact shape of
      // the reported treb-table-on-calibrationRecords bug (Phase 27 docs).
      await pdfTemplateRenderer.renderTemplateWithContext(template, { footer: { text: '', page_number: 1, total_pages: 1 } } as any);

      expect(hoisted.textCalls.some((c) => c[0].includes('Not available in this template scope'))).toBe(true);
      expect(hoisted.textCalls.some((c) => c[0] === 'N/A - Data Not Found')).toBe(false);
    });

    it('treb-table keeps the original "Data Not Found" message when the scope is right but this specific tab genuinely has no data (unchanged)', async () => {
      const template: PdfTemplate = {
        name: 'Treb genuinely empty',
        description: '',
        pageSize: 'A4',
        pages: [{
          id: 'p1', pageNumber: 1, pageSize: 'A4', orientation: 'portrait',
          elements: [{ id: 'tt', type: 'treb-table', x: 40, y: 40, width: 200, spreadsheetTemplateId: 'tpl', sourceTabId: 'missing-tab' } as TrebTableElement],
        }],
        elements: [],
      };

      // jobs scope, trebDataRegistry IS populated (as renderTemplate always
      // does), but has no entry at all for this element's sourceTabId.
      await pdfTemplateRenderer.renderTemplate(template, mockJob, { trebDataRegistry: {} });

      expect(hoisted.textCalls.some((c) => c[0] === 'N/A - Data Not Found')).toBe(true);
      expect(hoisted.textCalls.some((c) => c[0].includes('Not available in this template scope'))).toBe(false);
    });

    it('documents-table overflow creates continuation sub-pages', async () => {
      hoisted.documentList.mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => ({
          id: `d${i}`,
          documentCode: `DOC-${i}`,
          type: 'Quality Procedure',
          revisionNumber: '01',
          documentName: `Document ${i}`,
          tags: [],
          effectiveDate: new Date('2024-06-01'),
          source: { kind: 'pdf' as const, storagePath: `/p/${i}.pdf`, url: `https://x/${i}.pdf`, fileName: `${i}.pdf` },
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'u',
          updatedBy: 'u',
        }))
      );

      const template: PdfTemplate = {
        name: 'Docs overflow',
        description: '',
        pageSize: 'A4',
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [
              {
                id: 'docs-overflow',
                type: 'documents-table',
                x: 40,
                y: 80,
                width: 420,
                height: 60,
                columns: defaultDocumentsColumns(),
                paginationMode: 'dynamic',
                dataSource: { type: 'documentIndex', key: 'documentIndex.list' },
              } as DocumentsTableElement,
            ],
          },
        ],
        elements: [],
      };

      await pdfTemplateRenderer.renderTemplate(template, mockJob);
      expect(hoisted.addPage.mock.calls.length).toBeGreaterThan(0);
      const docsRendered = new Set(hoisted.textCalls.map((c) => c[0]).filter((s) => s.startsWith('DOC-')));
      expect(docsRendered.size).toBe(20);
    });

    it('dynamic table that fits in one slice does not create extra pages', async () => {
      hoisted.documentList.mockResolvedValue([
        {
          id: 'd1',
          documentCode: 'DOC-FIT',
          type: 'Quality Procedure',
          revisionNumber: '01',
          documentName: 'Fits one page',
          tags: [],
          effectiveDate: new Date('2024-06-01'),
          source: { kind: 'pdf' as const, storagePath: '/p/fit.pdf', url: 'https://x/fit.pdf', fileName: 'fit.pdf' },
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'u',
          updatedBy: 'u',
        },
      ]);

      const template: PdfTemplate = {
        name: 'Docs fit',
        description: '',
        pageSize: 'A4',
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [
              {
                id: 'docs-fit',
                type: 'documents-table',
                x: 40,
                y: 80,
                width: 420,
                height: 220,
                columns: defaultDocumentsColumns(),
                paginationMode: 'dynamic',
                dataSource: { type: 'documentIndex', key: 'documentIndex.list' },
              } as DocumentsTableElement,
            ],
          },
        ],
        elements: [],
      };

      await pdfTemplateRenderer.renderTemplate(template, mockJob);
      expect(hoisted.addPage.mock.calls.length).toBe(0);
      expect(hoisted.textCalls.some((c) => c[0] === 'DOC-FIT')).toBe(true);
    });

    it('static element with repeatOnOverflowPages=false is not redrawn on continuation pages', async () => {
      const equipment = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, name: `Equipment ${i}` }));
      const job: Job = { ...mockJob, equipment } as Job;
      const template: PdfTemplate = {
        name: 'Static opt-out',
        description: '',
        pageSize: 'A4',
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [
              {
                id: 'static-once',
                type: 'text',
                x: 40,
                y: 40,
                staticText: 'Render once only',
                repeatOnOverflowPages: false,
              } as TextElement,
              {
                id: 'eq-overflow',
                type: 'equipment-table',
                x: 40,
                y: 120,
                width: 400,
                height: 40,
                columns: defaultEquipmentColumns(),
                paginationMode: 'dynamic',
              } as EquipmentTableElement,
            ],
          },
        ],
        elements: [],
      };

      await pdfTemplateRenderer.renderTemplate(template, job);
      expect(hoisted.addPage.mock.calls.length).toBeGreaterThan(0);
      const draws = hoisted.textCalls.filter((c) => c[0] === 'Render once only').length;
      expect(draws).toBe(1);
    });

    it('multi template pages: total sub-pages includes overflow from page 1 before page 2', async () => {
      const equipment = Array.from({ length: 8 }, (_, i) => ({
        id: `e${i}`,
        name: `Row${i}`,
      }));
      const job: Job = { ...mockJob, equipment } as Job;

      const table: EquipmentTableElement = {
        id: 'eqt',
        type: 'equipment-table',
        x: 40,
        y: 100,
        width: 400,
        height: 40,
        columns: defaultEquipmentColumns(),
      };

      const template: PdfTemplate = {
        name: 'Two pages',
        description: '',
        pageSize: 'A4',
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [table],
          },
          {
            id: 'p2',
            pageNumber: 2,
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [
              { id: 't2', type: 'text', x: 40, y: 40, staticText: 'Second template page', fontSize: 11 } as TextElement,
            ],
          },
        ],
        elements: [],
      };

      await pdfTemplateRenderer.renderTemplate(template, job);
      const page2Draws = hoisted.textCalls.filter((c) => c[0] === 'Second template page').length;
      expect(page2Draws).toBe(1);
      expect(hoisted.addPage.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('long dynamic text overflows into continuation slices', async () => {
      const longText = Array.from({ length: 120 }, (_, i) => `Line ${i}`).join(' ');
      const template: PdfTemplate = {
        name: 'Text overflow',
        description: '',
        pageSize: 'A4',
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [
              {
                id: 'tx1',
                type: 'text',
                x: 40,
                y: 60,
                width: 220,
                height: 36,
                staticText: longText,
                paginationMode: 'dynamic',
              } as TextElement,
            ],
          },
        ],
        elements: [],
      };
      await pdfTemplateRenderer.renderTemplate(template, mockJob);
      expect(hoisted.addPage.mock.calls.length).toBeGreaterThan(0);
      expect(hoisted.textCalls.length).toBeGreaterThan(1);
    });

    it('non-overflow dynamic element repeats on overflow pages when another dynamic overflows', async () => {
      hoisted.documentList.mockResolvedValue([
        {
          id: 'd1',
          documentCode: 'DOC-1',
          type: 'Quality Procedure',
          revisionNumber: '01',
          documentName: 'Primary',
          tags: [],
          effectiveDate: new Date('2024-06-01'),
          source: { kind: 'pdf' as const, storagePath: '/p/a.pdf', url: 'https://x/a.pdf', fileName: 'Primary.pdf' },
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'u',
          updatedBy: 'u',
        },
      ]);
      const equipment = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, name: `E${i}` }));
      const job: Job = { ...mockJob, equipment } as Job;
      const template: PdfTemplate = {
        name: 'Repeat dynamic',
        description: '',
        pageSize: 'A4',
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [
              {
                id: 'eq',
                type: 'equipment-table',
                x: 40,
                y: 120,
                width: 350,
                height: 40,
                columns: defaultEquipmentColumns(),
                paginationMode: 'dynamic',
              } as EquipmentTableElement,
              {
                id: 'docs',
                type: 'documents-table',
                x: 40,
                y: 60,
                width: 400,
                height: 200,
                columns: defaultDocumentsColumns(),
                paginationMode: 'dynamic',
                repeatOnOverflowPages: true,
                dataSource: { type: 'documentIndex', key: 'documentIndex.list' },
              } as DocumentsTableElement,
            ],
          },
        ],
        elements: [],
      };
      await pdfTemplateRenderer.renderTemplate(template, job);
      const docRepeats = hoisted.textCalls.filter((c) => c[0] === 'DOC-1').length;
      expect(hoisted.addPage.mock.calls.length).toBeGreaterThan(0);
      expect(docRepeats).toBeGreaterThanOrEqual(2);
    });
  });

  describe('record-table (ADR-004, ADR-006, ADR-011)', () => {
    function recordTemplate(columnCount: number, overrides: Partial<RecorderTemplate> = {}): RecorderTemplate {
      const columns = Array.from({ length: columnCount }, (_, i) => ({
        id: `R${i + 1}`,
        label: `Round ${i + 1}`,
        order: i,
        type: 'number' as const,
        numberFormat: { notation: 'fixed' as const, decimals: 2 },
      }));
      return {
        id: 'tpl1',
        name: 'UTM',
        equipmentTypeId: 'eqtype1',
        roundCount: columnCount,
        defaultRowCount: 1,
        allowRowAdd: true,
        recordNumberFormat: { parts: ['UTM'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
        sections: [{ id: 'CAL', label: 'Calibration', order: 0, columns }],
        summaryFields: [],
        customFunctions: [],
        status: 'active',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'u1',
        updatedBy: 'u1',
        ...overrides,
      } as RecorderTemplate;
    }

    function recordFixture(rows: Array<Record<string, unknown>>, summary: Record<string, unknown> = {}) {
      return {
        id: 'rec1',
        jobId: 'job1',
        itemId: 'item1',
        equipmentTypeId: 'eqtype1',
        templateId: 'tpl1',
        templateVersion: 1,
        contextSnapshot: {} as any,
        environment: [],
        rows,
        summary,
        status: 'committed',
        createdAt: new Date(),
        createdBy: 'u1',
      } as unknown as CalibrationRecord;
    }

    it('a table longer than one page splits into the right number of sub-pages', async () => {
      const template = recordTemplate(2);
      const rows = Array.from({ length: 20 }, (_, i) => ({ CAL_R1: i, CAL_R2: i + 0.5 }));
      const record = recordFixture(rows);

      const pdfTemplate: PdfTemplate = {
        name: 'Record overflow',
        description: '',
        pageSize: 'A4',
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [
              { id: 'rt', type: 'record-table', x: 40, y: 40, width: 300, height: 100 } as RecordTableElement,
            ],
          },
        ],
        elements: [],
      };

      await pdfTemplateRenderer.renderTemplateWithContext(pdfTemplate, { record, recordTemplate: template } as any);

      expect(hoisted.addPage.mock.calls.length).toBeGreaterThan(0);
      // Every row's value must appear at least once across all sub-pages.
      const drawn = new Set(hoisted.textCalls.map((c) => c[0]));
      for (let i = 0; i < 20; i++) {
        expect(drawn.has(i.toFixed(2))).toBe(true);
      }
    });

    it('column headers repeat on every slice', async () => {
      const template = recordTemplate(1);
      const rows = Array.from({ length: 20 }, (_, i) => ({ CAL_R1: i }));
      const record = recordFixture(rows);

      const pdfTemplate: PdfTemplate = {
        name: 'Header repeat',
        description: '',
        pageSize: 'A4',
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [
              { id: 'rt', type: 'record-table', x: 40, y: 40, width: 300, height: 100 } as RecordTableElement,
            ],
          },
        ],
        elements: [],
      };

      await pdfTemplateRenderer.renderTemplateWithContext(pdfTemplate, { record, recordTemplate: template } as any);

      const subPageCount = hoisted.addPage.mock.calls.length + 1;
      expect(subPageCount).toBeGreaterThan(1);
      const headerDraws = hoisted.textCalls.filter((c) => c[0] === 'Round 1').length;
      expect(headerDraws).toBe(subPageCount);
    });

    it('a 3-round and a 5-round template both render with the correct column count', async () => {
      for (const count of [3, 5]) {
        hoisted.textCalls = [];
        const template = recordTemplate(count);
        const record = recordFixture([Object.fromEntries(Array.from({ length: count }, (_, i) => [`CAL_R${i + 1}`, i]))]);

        const pdfTemplate: PdfTemplate = {
          name: `Columns-${count}`,
          description: '',
          pageSize: 'A4',
          pages: [
            {
              id: 'p1',
              pageNumber: 1,
              pageSize: 'A4',
              orientation: 'portrait',
              elements: [
                { id: 'rt', type: 'record-table', x: 40, y: 40, width: 400, height: 300 } as RecordTableElement,
              ],
            },
          ],
          elements: [],
        };

        await pdfTemplateRenderer.renderTemplateWithContext(pdfTemplate, { record, recordTemplate: template } as any);

        const headerLabels = new Set(
          hoisted.textCalls.map((c) => c[0]).filter((s) => /^Round \d+$/.test(s)),
        );
        expect(headerLabels.size).toBe(count);
      }
    });

    it('measures and draws the FORMATTED value — fixed and scientific notation', async () => {
      const template: RecorderTemplate = {
        ...recordTemplate(0),
        sections: [
          {
            id: 'CAL',
            label: 'Calibration',
            order: 0,
            columns: [
              { id: 'FIX', label: 'Fixed', order: 0, type: 'number', numberFormat: { notation: 'fixed', decimals: 2 } },
              { id: 'SCI', label: 'Scientific', order: 1, type: 'number', numberFormat: { notation: 'scientific', decimals: 3 } },
            ],
          },
        ],
      };
      const record = recordFixture([{ CAL_FIX: 1.23456, CAL_SCI: 7.882e21 }]);

      const pdfTemplate: PdfTemplate = {
        name: 'Formatting',
        description: '',
        pageSize: 'A4',
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [
              { id: 'rt', type: 'record-table', x: 40, y: 40, width: 300, height: 200 } as RecordTableElement,
            ],
          },
        ],
        elements: [],
      };

      await pdfTemplateRenderer.renderTemplateWithContext(pdfTemplate, { record, recordTemplate: template } as any);

      const drawn = hoisted.textCalls.map((c) => c[0]);
      expect(drawn).toContain('1.23');
      expect(drawn).toContain('7.882E+21');
      // Never the raw unrounded/unformatted values.
      expect(drawn).not.toContain('1.23456');
      expect(drawn.some((t) => t.includes('e+21'))).toBe(false); // never lowercase e
    });

    it('binds an evaluated summary field as an ordinary scalar text element (record.summary.<id>)', async () => {
      const template = recordTemplate(1);
      const record = recordFixture([{ CAL_R1: 1 }], { MAXDEV: 0.42 });

      const pdfTemplate: PdfTemplate = {
        name: 'Summary binding',
        description: '',
        pageSize: 'A4',
        pages: [
          {
            id: 'p1',
            pageNumber: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            elements: [
              {
                id: 'summary-text',
                type: 'text',
                x: 40,
                y: 40,
                staticText: undefined,
                dataSource: { type: 'text', key: 'record.summary.MAXDEV' },
              } as TextElement,
            ],
          },
        ],
        elements: [],
      };

      await pdfTemplateRenderer.renderTemplateWithContext(pdfTemplate, { record, recordTemplate: template } as any);

      expect(hoisted.textCalls.map((c) => c[0])).toContain('0.42');
    });

    it('respects an explicit element height — a smaller height forces more sub-pages than a larger one', async () => {
      const template = recordTemplate(1);
      const rows = Array.from({ length: 20 }, (_, i) => ({ CAL_R1: i }));

      async function renderWithHeight(height: number): Promise<number> {
        hoisted.addPage.mockClear();
        const record = recordFixture(rows);
        const pdfTemplate: PdfTemplate = {
          name: `Height-${height}`,
          description: '',
          pageSize: 'A4',
          pages: [
            {
              id: 'p1',
              pageNumber: 1,
              pageSize: 'A4',
              orientation: 'portrait',
              elements: [
                { id: 'rt', type: 'record-table', x: 40, y: 40, width: 300, height } as RecordTableElement,
              ],
            },
          ],
          elements: [],
        };
        await pdfTemplateRenderer.renderTemplateWithContext(pdfTemplate, { record, recordTemplate: template } as any);
        return hoisted.addPage.mock.calls.length;
      }

      const shortPages = await renderWithHeight(60);
      const tallPages = await renderWithHeight(700);
      expect(shortPages).toBeGreaterThan(tallPages);
    });

    describe('overflowMode (Phase 28)', () => {
      it('PAGINATION regression (Task 2, test 8): wrap mode\'s taller rows are honored by the paginator — no row is silently dropped or duplicated', async () => {
        const template = recordTemplate(1);
        // Two long cells that must wrap, interleaved with short ones, so a
        // measure/draw height mismatch would show up as a dropped or
        // doubled marker rather than being masked by uniform row heights.
        const longText = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod';
        const rows = [
          { CAL_R1: 'MARK0 short' },
          { CAL_R1: `MARK1 ${longText}` },
          { CAL_R1: 'MARK2 short' },
          { CAL_R1: `MARK3 ${longText}` },
          { CAL_R1: 'MARK4 short' },
          { CAL_R1: 'MARK5 short' },
        ];
        const record = recordFixture(rows);

        const pdfTemplate: PdfTemplate = {
          name: 'Wrap pagination',
          description: '',
          pageSize: 'A4',
          pages: [
            {
              id: 'p1',
              pageNumber: 1,
              pageSize: 'A4',
              orientation: 'portrait',
              elements: [
                { id: 'rt', type: 'record-table', x: 40, y: 40, width: 120, height: 90, overflowMode: 'wrap', maxWrapLines: 4 } as RecordTableElement,
              ],
            },
          ],
          elements: [],
        };

        await pdfTemplateRenderer.renderTemplateWithContext(pdfTemplate, { record, recordTemplate: template } as any);

        expect(hoisted.addPage.mock.calls.length).toBeGreaterThan(0); // this data genuinely needs multiple sub-pages

        for (let i = 0; i < rows.length; i++) {
          const marker = `MARK${i}`;
          const occurrences = hoisted.textCalls.filter((c) => c[0].includes(marker)).length;
          expect(occurrences).toBe(1); // placed on exactly one sub-page — not dropped, not duplicated
        }
      });

      it('PAGINATION regression (Task 2, test 9): continuation pages use identical column width to page 1', async () => {
        const template = recordTemplate(1);
        const rows = Array.from({ length: 15 }, (_, i) => ({ CAL_R1: `row-${i} some moderately long content here` }));
        const record = recordFixture(rows);

        const pdfTemplate: PdfTemplate = {
          name: 'Wrap width consistency',
          description: '',
          pageSize: 'A4',
          pages: [
            {
              id: 'p1',
              pageNumber: 1,
              pageSize: 'A4',
              orientation: 'portrait',
              elements: [
                { id: 'rt', type: 'record-table', x: 40, y: 40, width: 150, height: 80, overflowMode: 'wrap', maxWrapLines: 3 } as RecordTableElement,
              ],
            },
          ],
          elements: [],
        };

        await pdfTemplateRenderer.renderTemplateWithContext(pdfTemplate, { record, recordTemplate: template } as any);

        const subPageCount = hoisted.addPage.mock.calls.length + 1;
        expect(subPageCount).toBeGreaterThan(1); // repetition is only meaningful across more than one sub-page

        // Column headers repeat on every sub-page (existing behaviour); the
        // captured `maxWidth` on each repeat is the column width the header
        // band actually drew with — Phase 27/28 both require this to never
        // drift between sub-pages.
        const headerCalls = hoisted.textCalls.filter((c) => c[0] === 'Round 1');
        expect(headerCalls.length).toBe(subPageCount);
        const maxWidths = new Set(headerCalls.map((c) => c[3]));
        expect(maxWidths.size).toBe(1);
      });

      it('KNOWN GAP, confirmed not fixed here: a row whose height (after header bands) exceeds the viewport is silently dropped, not clipped or looped', async () => {
        const template = recordTemplate(1);
        const hugeText = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
        const record = recordFixture([{ CAL_R1: hugeText }]);

        const pdfTemplate: PdfTemplate = {
          name: 'Oversized wrapped row',
          description: '',
          pageSize: 'A4',
          pages: [
            {
              id: 'p1',
              pageNumber: 1,
              pageSize: 'A4',
              orientation: 'portrait',
              elements: [
                { id: 'rt', type: 'record-table', x: 40, y: 40, width: 80, height: 20, overflowMode: 'wrap', maxWrapLines: 6 } as RecordTableElement,
              ],
            },
          ],
          elements: [],
        };

        // No hang, no throw — that much IS handled.
        await expect(
          pdfTemplateRenderer.renderTemplateWithContext(pdfTemplate, { record, recordTemplate: template } as any)
        ).resolves.not.toThrow();

        // But the row itself never appears anywhere: `computeTableRowSlices`
        // (pdfTemplateRenderer.ts) places it alone in its own slice (its
        // "row doesn't fit, advance by one anyway" fallback), yet the DRAW
        // pass's own `curY >= bottomBoundary` check — evaluated against the
        // element's exact height, not `computeTableRowSlices`' internal
        // `Math.max(24, viewportHeight)` floor — trips before the row is
        // ever drawn, on the only physical page that slice produces (no
        // `addPage` call happens: `splitCount` is 1). Net effect: silent
        // content loss, not a visual clip and not new in this phase — see
        // the write-up for equipment-table sharing the same code path and
        // a proposed fix (not applied here, per the task's own instruction
        // not to fix this unasked).
        expect(hoisted.addPage.mock.calls.length).toBe(0);
        expect(hoisted.textCalls.some((c) => c[0].includes('word0'))).toBe(false);
        // The header bands alone DO still render, so the page isn't blank —
        // just missing its one data row.
        expect(hoisted.textCalls.some((c) => c[0] === 'Round 1')).toBe(true);
      });

      it('shrink-only mode draws the header without a maxWidth constraint, so a wide value is not reflowed by jsPDF\'s own text() wrapping', async () => {
        const template = recordTemplate(1);
        const record = recordFixture([{ CAL_R1: 'A very long value that will not be truncated or wrapped at all' }]);

        const pdfTemplate: PdfTemplate = {
          name: 'Shrink only overflow',
          description: '',
          pageSize: 'A4',
          pages: [
            {
              id: 'p1',
              pageNumber: 1,
              pageSize: 'A4',
              orientation: 'portrait',
              elements: [
                { id: 'rt', type: 'record-table', x: 40, y: 40, width: 80, height: 100, overflowMode: 'shrink-only' } as RecordTableElement,
              ],
            },
          ],
          elements: [],
        };

        await pdfTemplateRenderer.renderTemplateWithContext(pdfTemplate, { record, recordTemplate: template } as any);

        const cellDraw = hoisted.textCalls.find((c) => c[0].startsWith('A very long value'));
        expect(cellDraw).toBeTruthy();
        expect(cellDraw![0]).toBe('A very long value that will not be truncated or wrapped at all'); // whole value, no ellipsis
        expect(cellDraw![3]).toBe(''); // no maxWidth passed — Task 1 ladder step 4c
      });
    });
  });
});
