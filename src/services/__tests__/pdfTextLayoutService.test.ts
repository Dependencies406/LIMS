import { describe, it, expect } from 'vitest';
import { computeSafeLineHeight, containsThai, layoutTextToLines } from '../pdfTextLayoutService';

const pdfMock = {
  getTextWidth: (s: string) => String(s).length * 5,
} as any;

describe('pdfTextLayoutService', () => {
  it('detects Thai text', () => {
    expect(containsThai('ภาษาไทย')).toBe(true);
    expect(containsThai('English only')).toBe(false);
  });

  it('uses Thai-safe line height', () => {
    const th = computeSafeLineHeight({ fontSize: 10, text: 'ภาษาไทยทดสอบ' });
    const en = computeSafeLineHeight({ fontSize: 10, text: 'English test' });
    expect(th).toBeGreaterThan(en);
    expect(th).toBeGreaterThanOrEqual(14.5);
  });

  it('wraps Thai text into multiple lines without empty/broken output', () => {
    const text = 'ข้อความภาษาไทยยาวมากสำหรับการทดสอบการตัดบรรทัดในเอกสาร';
    const lines = layoutTextToLines({ text, maxWidth: 40, pdf: pdfMock, fontSize: 10, localeHint: 'th' });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length > 0)).toBe(true);
  });

  it('wraps mixed Thai-English text', () => {
    const text = 'หัวข้อภาษาไทย (GLA-01) พร้อม English content';
    const lines = layoutTextToLines({ text, maxWidth: 55, pdf: pdfMock, fontSize: 10 });
    expect(lines.length).toBeGreaterThan(1);
  });
});

