/**
 * thaiPdfFontService
 *
 * Loads Sarabun (Thai + Latin) TTF fonts into a jsPDF document instance.
 *
 * Font loading order (first success wins):
 *   1. /fonts/Sarabun-Regular.ttf  — self-hosted in public/fonts/ (fastest, no CORS)
 *   2. Google Fonts GitHub CDN      — online fallback if not self-hosted
 *   3. Helvetica                    — ASCII-only last resort (Thai will be garbled)
 *
 * To self-host (recommended):
 *   node scripts/downloadFonts.mjs
 * This places the TTF files in public/fonts/ and is done once.
 *
 * Usage:
 *   const fontName = await registerThaiFont(pdf);
 *   pdf.setFont(fontName, 'normal');
 *   pdf.setFont(fontName, 'bold');
 */

import jsPDF from 'jspdf';

export const THAI_FONT = 'Sarabun';

// Sources tried in order for each weight
const SOURCES = {
  normal: [
    '/fonts/Sarabun-Regular.ttf',
    'https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Regular.ttf',
  ],
  bold: [
    '/fonts/Sarabun-Bold.ttf',
    'https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Bold.ttf',
  ],
};

// Minimum expected byte size — anything smaller is likely an HTML error page
const MIN_FONT_BYTES = 50_000;

// ─── Session-level cache (avoids re-fetching across PDF generations) ──────────

let fetchPromise: Promise<{ normal: string | null; bold: string | null }> | null = null;

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  // Process in chunks to avoid call-stack overflow on large buffers
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

async function tryFetchFontBase64(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < MIN_FONT_BYTES) continue; // reject HTML error pages
      // Validate TrueType magic bytes: 00 01 00 00  or  'true'  or  'OTTO'
      const magic = new Uint8Array(buf, 0, 4);
      const magicHex = Array.from(magic).map((b) => b.toString(16).padStart(2, '0')).join('');
      const isTtf = magicHex === '00010000' || magicHex === '74727565' || magicHex === '4f54544f';
      if (!isTtf) continue;
      return arrayBufferToBase64(buf);
    } catch {
      continue;
    }
  }
  return null;
}

function getFontData(): Promise<{ normal: string | null; bold: string | null }> {
  if (!fetchPromise) {
    fetchPromise = Promise.all([
      tryFetchFontBase64(SOURCES.normal),
      tryFetchFontBase64(SOURCES.bold),
    ]).then(([normal, bold]) => ({ normal, bold }));
  }
  return fetchPromise;
}

/**
 * Register the Sarabun font into a jsPDF instance.
 *
 * Returns the font family name to pass to `pdf.setFont()`.
 * If loading fails, returns `'helvetica'` as a safe fallback.
 *
 * Call this once per PDF document, immediately after `new jsPDF(...)`.
 */
export async function registerThaiFont(pdf: jsPDF): Promise<string> {
  const { normal, bold } = await getFontData();

  if (!normal || !bold) {
    console.warn(
      '[thaiPdfFontService] Thai font unavailable — falling back to Helvetica.\n' +
      '  Run `node scripts/downloadFonts.mjs` to self-host the font files.'
    );
    return 'helvetica';
  }

  pdf.addFileToVFS('Sarabun-Regular.ttf', normal);
  pdf.addFont('Sarabun-Regular.ttf', THAI_FONT, 'normal');

  pdf.addFileToVFS('Sarabun-Bold.ttf', bold);
  pdf.addFont('Sarabun-Bold.ttf', THAI_FONT, 'bold');

  return THAI_FONT;
}
