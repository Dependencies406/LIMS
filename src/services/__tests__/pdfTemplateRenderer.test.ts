/**
 * Unit tests for PDF Template Renderer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from '../../types';
import type { PdfTemplate, TextElement, EquipmentTableElement, DocumentsTableElement } from '../../modules/pdf-template-builder/types';
import { EQUIPMENT_TABLE_DEFAULT_COLUMNS, DOCUMENTS_TABLE_DEFAULT_COLUMNS } from '../../modules/pdf-template-builder/types';
import { formatDateForDisplay } from '../../utils/dateDisplayFormatter';

const hoisted = vi.hoisted(() => ({
  addPage: vi.fn(),
  textCalls: [] as string[][],
  documentList: vi.fn(),
  setFontCalls: [] as Array<[string, string]>,
  addFontCalls: [] as Array<[string, string, string]>,
}));

vi.mock('jspdf', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      const text = vi.fn((...args: unknown[]) => {
        const line = args[0];
        if (typeof line === 'string') hoisted.textCalls.push([line]);
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
        rect: vi.fn(),
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
});
