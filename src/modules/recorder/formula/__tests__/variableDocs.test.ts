/**
 * variableDocs.test.ts
 *
 * Phase 10 Task 6: makes drift between the STD_ and REPORT_ variable lists
 * and their documentation a build failure, the same guarantee
 * builtinDocs.test.ts gives the function whitelist.
 */

import { describe, it, expect } from 'vitest';
import { STANDARD_VARIABLE_NAMES } from '../../../../services/referenceStandardVariables';
import { REPORT_VARIABLES } from '../validator';
import { STD_DOCS, REPORT_DOCS, ENV_PATTERN_DOCS, type VariableDoc } from '../variableDocs';

describe('STD_DOCS matches STANDARD_VARIABLE_NAMES exactly', () => {
  it('every STD_* name in STANDARD_VARIABLE_NAMES has a doc entry', () => {
    const missing = STANDARD_VARIABLE_NAMES.filter((name) => !(name in STD_DOCS));
    expect(missing).toEqual([]);
  });

  it('every STD_DOCS entry names a real variable in STANDARD_VARIABLE_NAMES', () => {
    const stale = Object.keys(STD_DOCS).filter((name) => !STANDARD_VARIABLE_NAMES.includes(name));
    expect(stale).toEqual([]);
  });

  it('has exactly as many entries as the source list — no accidental duplicate keys collapsing count', () => {
    expect(Object.keys(STD_DOCS)).toHaveLength(STANDARD_VARIABLE_NAMES.length);
  });
});

describe('REPORT_DOCS matches REPORT_VARIABLES exactly', () => {
  it('every REPORT_* name has a doc entry', () => {
    const missing = REPORT_VARIABLES.filter((name) => !(name in REPORT_DOCS));
    expect(missing).toEqual([]);
  });

  it('every REPORT_DOCS entry names a real variable', () => {
    const stale = Object.keys(REPORT_DOCS).filter((name) => !REPORT_VARIABLES.includes(name));
    expect(stale).toEqual([]);
  });
});

function collectBilinguals(doc: VariableDoc, path: string) {
  const out: Array<{ path: string; en: string; th: string }> = [];
  out.push({ path: `${path}.summary`, ...doc.summary });
  if (doc.example?.note) out.push({ path: `${path}.example.note`, ...doc.example.note });
  if (doc.warning) out.push({ path: `${path}.warning`, ...doc.warning });
  return out;
}

const ALL_VARIABLE_DOCS: Array<[string, VariableDoc]> = [
  ...Object.entries(STD_DOCS),
  ...Object.entries(REPORT_DOCS),
];

describe('every Bilingual field in the variable docs has both en and th non-empty', () => {
  for (const [name, doc] of ALL_VARIABLE_DOCS) {
    for (const { path, en, th } of collectBilinguals(doc, name)) {
      it(`${path} has non-empty en and th`, () => {
        expect(en.trim().length).toBeGreaterThan(0);
        expect(th.trim().length).toBeGreaterThan(0);
      });
    }
  }

  for (const doc of ENV_PATTERN_DOCS) {
    it(`${doc.pattern}.summary has non-empty en and th`, () => {
      expect(doc.summary.en.trim().length).toBeGreaterThan(0);
      expect(doc.summary.th.trim().length).toBeGreaterThan(0);
    });
  }

  it('sanity: walked a non-trivial number of fields', () => {
    const total = ALL_VARIABLE_DOCS.reduce((sum, [name, doc]) => sum + collectBilinguals(doc, name).length, 0);
    expect(total).toBeGreaterThan(10);
  });
});

describe('scope is correctly assigned — this is what actually confuses people', () => {
  it('every STD_* entry is row-scoped', () => {
    for (const [name, doc] of Object.entries(STD_DOCS)) {
      expect(doc.scope, `${name} should be row-scoped`).toBe('row');
    }
  });

  it('every REPORT_* entry is record-scoped', () => {
    for (const [name, doc] of Object.entries(REPORT_DOCS)) {
      expect(doc.scope, `${name} should be record-scoped`).toBe('record');
    }
  });
});

describe('coefficient slots (STD_C0..STD_C5) — content that must be right', () => {
  it('covers exactly C0 through C5', () => {
    const coeffNames = STANDARD_VARIABLE_NAMES.filter((n) => /^STD_C\d+$/.test(n));
    expect(coeffNames.sort()).toEqual(['STD_C0', 'STD_C1', 'STD_C2', 'STD_C3', 'STD_C4', 'STD_C5'].sort());
  });

  it('STD_C0 is documented as the constant term', () => {
    expect(STD_DOCS.STD_C0.summary.en.toLowerCase()).toContain('constant');
  });

  it('every coefficient slot documents the zero-default exception to strict empty semantics', () => {
    for (let i = 0; i <= 5; i += 1) {
      const doc = STD_DOCS[`STD_C${i}`];
      expect(doc.warning, `STD_C${i} should document the zero-default exception`).toBeDefined();
      expect(doc.warning!.en).toContain('0');
    }
  });

  it('STD_C1 shows the worked cubic form', () => {
    expect(STD_DOCS.STD_C1.example?.formula).toBe('STD_C1*R + STD_C2*R**2 + STD_C3*R**3');
  });
});

describe('STD_TO_N / REPORT_TO_N — the conversion pair', () => {
  it('both document the same ADR-014 D5 pattern', () => {
    expect(STD_DOCS.STD_TO_N.example?.formula).toBe('polynomial(R) * STD_TO_N / REPORT_TO_N');
    expect(REPORT_DOCS.REPORT_TO_N.example?.formula).toBe('polynomial(R) * STD_TO_N / REPORT_TO_N');
  });
});

describe('STD_RESOLUTION documents that it may read awaiting-input even though nothing is broken', () => {
  it('has a warning mentioning awaiting-input', () => {
    expect(STD_DOCS.STD_RESOLUTION.warning?.en).toContain('awaiting-input');
  });
});

describe('ENV_PATTERN_DOCS covers both generated patterns, matching the validator\'s own shape', () => {
  // The validator's ENV_PATTERN is /^ENV_(TEMP|RH)_R(\d+)$/ — checked here by
  // shape (TEMP and RH, both with an R{n} suffix) rather than importing a
  // private regex, so this test would fail if a third ENV_ kind were ever
  // added to the validator without a matching doc entry.
  it('documents exactly TEMP and RH', () => {
    const kinds = ENV_PATTERN_DOCS.map((d) => d.pattern);
    expect(kinds.sort()).toEqual(['ENV_RH_R{n}', 'ENV_TEMP_R{n}'].sort());
  });

  it('every pattern follows the ENV_{KIND}_R{n} shape the validator expects', () => {
    for (const doc of ENV_PATTERN_DOCS) {
      expect(doc.pattern).toMatch(/^ENV_[A-Z]+_R\{n\}$/);
    }
  });
});
