import jsPDF from 'jspdf';

const THAI_REGEX = /[\u0E00-\u0E7F]/;
const DEBUG_PDF_FONT_MANAGER = false;
const debugLog = DEBUG_PDF_FONT_MANAGER ? (...a: unknown[]) => console.log('[PdfFontManager]', ...a) : () => {};

type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';
type FontBinaryMap = Record<FontStyle, string>;

const SARABUN_FILES: Record<FontStyle, string> = {
  normal: 'Sarabun-Regular.ttf',
  bold: 'Sarabun-Bold.ttf',
  italic: 'Sarabun-Italic.ttf',
  bolditalic: 'Sarabun-BoldItalic.ttf',
};

const SARABUN_URLS: Record<FontStyle, string> = {
  normal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Regular.ttf',
  bold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Bold.ttf',
  italic: 'https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Italic.ttf',
  bolditalic: 'https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-BoldItalic.ttf',
};

export interface ApplyFontParams {
  textSample: string;
  requestedFamily?: string;
  requestedStyle?: FontStyle;
  fontSize: number;
}

export interface AppliedFontInfo {
  family: string;
  style: FontStyle;
  usedThaiFont: boolean;
  containsThai: boolean;
  registeredForCurrentPdf: boolean;
}

export class PdfFontManager {
  private fontBinaryPromise: Promise<FontBinaryMap> | null = null;
  private registeredPdfInstances = new WeakSet<object>();

  private async loadTtfBinary(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed font download: ${url}`);
    }
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return binary;
  }

  private async ensureUnicodeFontDataLoaded(): Promise<FontBinaryMap> {
    if (!this.fontBinaryPromise) {
      this.fontBinaryPromise = (async () => {
        const [normal, bold, italic, bolditalic] = await Promise.all([
          this.loadTtfBinary(SARABUN_URLS.normal),
          this.loadTtfBinary(SARABUN_URLS.bold),
          this.loadTtfBinary(SARABUN_URLS.italic),
          this.loadTtfBinary(SARABUN_URLS.bolditalic),
        ]);
        return { normal, bold, italic, bolditalic };
      })();
    }
    return this.fontBinaryPromise;
  }

  async ensureFontsReadyForPdf(pdf: jsPDF): Promise<boolean> {
    const pdfKey = pdf as unknown as object;
    if (this.registeredPdfInstances.has(pdfKey)) {
      return true;
    }

    try {
      const binaries = await this.ensureUnicodeFontDataLoaded();
      const writablePdf = pdf as any;
      (['normal', 'bold', 'italic', 'bolditalic'] as FontStyle[]).forEach((style) => {
        writablePdf.addFileToVFS(SARABUN_FILES[style], binaries[style]);
        writablePdf.addFont(SARABUN_FILES[style], 'Sarabun', style);
      });
      this.registeredPdfInstances.add(pdfKey);
      debugLog('registered Sarabun for pdf instance');
      return true;
    } catch (error) {
      debugLog('font registration failed', error);
      return false;
    }
  }

  private normalizeStyle(style?: string): FontStyle {
    if (style === 'bold' || style === 'italic' || style === 'bolditalic') return style;
    return 'normal';
  }

  applyFont(pdf: jsPDF, params: ApplyFontParams): AppliedFontInfo {
    const containsThai = THAI_REGEX.test(params.textSample || '');
    const requestedFamily = (params.requestedFamily || 'helvetica').toLowerCase();
    const style = this.normalizeStyle(params.requestedStyle);
    let family = requestedFamily;
    const registeredForCurrentPdf = this.registeredPdfInstances.has(pdf as unknown as object);

    if (containsThai) {
      if (registeredForCurrentPdf) {
        family = 'Sarabun';
      } else {
        console.warn('[PdfFontManager] Thai text detected but Sarabun registration failed; using fallback font.');
      }
    }

    pdf.setFont(family, style);
    pdf.setFontSize(params.fontSize);
    debugLog('applyFont', { family, style, containsThai, registeredForCurrentPdf });

    return {
      family,
      style,
      usedThaiFont: containsThai && family === 'Sarabun',
      containsThai,
      registeredForCurrentPdf,
    };
  }
}

export const pdfFontManager = new PdfFontManager();

