import GraphemeSplitter from 'grapheme-splitter';
import LineBreaker from 'linebreak';
import jsPDF from 'jspdf';

const THAI_REGEX = /[\u0E00-\u0E7F]/;
const splitter = new GraphemeSplitter();
const DEBUG_PDF_TEXT_LAYOUT = false;
const debugLog = DEBUG_PDF_TEXT_LAYOUT ? (...a: unknown[]) => console.log('[PdfTextLayout]', ...a) : () => {};

export function containsThai(text: string): boolean {
  return THAI_REGEX.test(text || '');
}

function segmentWords(text: string, localeHint?: string): string[] {
  const locale = localeHint || (containsThai(text) ? 'th' : 'en');
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    const seg = new (Intl as any).Segmenter(locale, { granularity: 'word' });
    const out: string[] = [];
    for (const part of seg.segment(text)) {
      out.push(part.segment);
    }
    return out;
  }
  return [text];
}

function unicodeBreakSegments(text: string): string[] {
  const breaker = new (LineBreaker as any)(text);
  const parts: string[] = [];
  let last = 0;
  let bk = breaker.nextBreak();
  while (bk) {
    const next = text.slice(last, bk.position);
    if (next) parts.push(next);
    last = bk.position;
    bk = breaker.nextBreak();
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : [text];
}

function splitByGrapheme(text: string): string[] {
  return splitter.splitGraphemes(text);
}

function chooseSegments(text: string, localeHint?: string): string[] {
  const byWord = segmentWords(text, localeHint).filter((s) => s.length > 0);
  if (containsThai(text)) {
    const byBreak = unicodeBreakSegments(text);
    return byBreak.length >= byWord.length ? byBreak : byWord;
  }
  return byWord.length > 0 ? byWord : unicodeBreakSegments(text);
}

export function detectSegmentationMode(text: string, localeHint?: string): 'intl-word' | 'unicode-linebreak' | 'grapheme' {
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    return 'intl-word';
  }
  if (containsThai(text) || localeHint === 'th') {
    return 'unicode-linebreak';
  }
  return 'grapheme';
}

export function computeSafeLineHeight(params: { fontSize: number; text: string; localeHint?: string }): number {
  const { fontSize, text } = params;
  const hasThai = containsThai(text);
  const multiplier = hasThai ? 1.45 : 1.2;
  return Math.max(fontSize * multiplier, fontSize + 2);
}

export function layoutTextToLines(params: {
  text: string;
  maxWidth: number;
  pdf: jsPDF;
  fontSize: number;
  localeHint?: string;
}): string[] {
  const { text, maxWidth, pdf, localeHint } = params;
  if (!text || text.trim() === '') return [''];
  const source = String(text);
  const width = Math.max(1, maxWidth);
  const segments = chooseSegments(source, localeHint);
  debugLog('layout mode', detectSegmentationMode(source, localeHint), 'segments', segments.length);
  const lines: string[] = [];
  let current = '';

  for (const seg of segments) {
    const candidate = current ? `${current}${seg}` : seg;
    if (pdf.getTextWidth(candidate) <= width || current === '') {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (pdf.getTextWidth(seg) <= width) {
        current = seg;
      } else {
        const graphemes = splitByGrapheme(seg);
        let chunk = '';
        for (const g of graphemes) {
          const test = chunk + g;
          if (pdf.getTextWidth(test) > width && chunk.length > 0) {
            lines.push(chunk);
            chunk = g;
          } else {
            chunk = test;
          }
        }
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

