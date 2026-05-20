import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PdfFontManager } from '../pdfFontManager';

function makePdfMock() {
  return {
    addFileToVFS: vi.fn(),
    addFont: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
  } as any;
}

describe('PdfFontManager', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as any);
  });

  it('registers fonts per jsPDF instance while caching binary loads', async () => {
    const manager = new PdfFontManager();
    const pdf1 = makePdfMock();
    const pdf2 = makePdfMock();

    await manager.ensureFontsReadyForPdf(pdf1);
    await manager.ensureFontsReadyForPdf(pdf2);

    expect(pdf1.addFont).toHaveBeenCalledTimes(4);
    expect(pdf2.addFont).toHaveBeenCalledTimes(4);
    expect((global.fetch as any).mock.calls.length).toBe(4);
  });

  it('applies Sarabun automatically for Thai samples', async () => {
    const manager = new PdfFontManager();
    const pdf = makePdfMock();
    await manager.ensureFontsReadyForPdf(pdf);

    const applied = manager.applyFont(pdf, {
      textSample: 'ภาษาไทย ทดสอบ',
      requestedFamily: 'helvetica',
      requestedStyle: 'bold',
      fontSize: 10,
    });

    expect(applied.usedThaiFont).toBe(true);
    expect(pdf.setFont).toHaveBeenCalledWith('Sarabun', 'bold');
  });
});

