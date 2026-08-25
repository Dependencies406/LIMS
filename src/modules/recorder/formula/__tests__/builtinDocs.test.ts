/**
 * builtinDocs.test.ts
 *
 * Phase 10 Task 2: makes drift between the function whitelist and its
 * documentation a build failure rather than a silent rot.
 *
 * Two directions checked for both families (general builtins and column
 * aggregates), plus two content guarantees:
 *   - every documented example's `formula` actually parses (run through the
 *     real parser — a worked example cannot be syntactically wrong)
 *   - every `Bilingual` field has BOTH `en` and `th` non-empty (no
 *     half-translated entry can ship, and no newly added function can have
 *     English-only docs)
 */

import { describe, it, expect } from 'vitest';
import { BUILTIN_FUNCTIONS, COLUMN_AGGREGATES } from '../builtins';
import { BUILTIN_DOCS, AGGREGATE_DOCS, type BuiltinDoc, type Bilingual } from '../builtinDocs';
import { parseExpression } from '../parser';

describe('BUILTIN_DOCS matches BUILTIN_FUNCTIONS exactly', () => {
  it('every builtin has a doc entry', () => {
    const missing = Object.keys(BUILTIN_FUNCTIONS).filter((name) => !(name in BUILTIN_DOCS));
    expect(missing).toEqual([]);
  });

  it('every doc entry names a real builtin', () => {
    const stale = Object.keys(BUILTIN_DOCS).filter((name) => !(name in BUILTIN_FUNCTIONS));
    expect(stale).toEqual([]);
  });
});

describe('AGGREGATE_DOCS matches COLUMN_AGGREGATES exactly', () => {
  it('every column aggregate has a doc entry', () => {
    const missing = COLUMN_AGGREGATES.filter((name) => !(name in AGGREGATE_DOCS));
    expect(missing).toEqual([]);
  });

  it('every doc entry names a real column aggregate', () => {
    const stale = Object.keys(AGGREGATE_DOCS).filter((name) => !(COLUMN_AGGREGATES as readonly string[]).includes(name));
    expect(stale).toEqual([]);
  });
});

/** Every Bilingual field reachable from one doc entry, with a path for failure messages. */
function collectBilinguals(doc: BuiltinDoc, docName: string): Array<{ path: string; value: Bilingual }> {
  const out: Array<{ path: string; value: Bilingual }> = [];
  out.push({ path: `${docName}.summary`, value: doc.summary });
  doc.examples.forEach((ex, i) => {
    if (ex.note) out.push({ path: `${docName}.examples[${i}].note`, value: ex.note });
  });
  if (doc.warning) out.push({ path: `${docName}.warning`, value: doc.warning });
  return out;
}

const ALL_DOCS: Array<[string, BuiltinDoc]> = [
  ...Object.entries(BUILTIN_DOCS),
  ...Object.entries(AGGREGATE_DOCS).map(([k, v]) => [`col_*.${k}`, v] as [string, BuiltinDoc]),
];

describe('every documented example formula actually parses', () => {
  for (const [name, doc] of ALL_DOCS) {
    doc.examples.forEach((example, i) => {
      it(`${name} example ${i + 1}: ${example.formula}`, () => {
        expect(() => parseExpression(example.formula)).not.toThrow();
      });
    });
  }
});

describe('every Bilingual field has both en and th non-empty', () => {
  for (const [name, doc] of ALL_DOCS) {
    const bilinguals = collectBilinguals(doc, name);
    for (const { path, value } of bilinguals) {
      it(`${path} has non-empty en and th`, () => {
        expect(value.en.trim().length).toBeGreaterThan(0);
        expect(value.th.trim().length).toBeGreaterThan(0);
      });
    }
  }

  it('sanity: this test suite actually walked a non-trivial number of fields', () => {
    const total = ALL_DOCS.reduce((sum, [name, doc]) => sum + collectBilinguals(doc, name).length, 0);
    expect(total).toBeGreaterThan(10);
  });
});

describe('every doc has a non-empty English signature', () => {
  for (const [name, doc] of ALL_DOCS) {
    it(`${name}.signature is non-empty`, () => {
      expect(doc.signature.trim().length).toBeGreaterThan(0);
    });
  }
});

describe('every doc has at least one example', () => {
  for (const [name, doc] of ALL_DOCS) {
    it(`${name} has at least one example`, () => {
      expect(doc.examples.length).toBeGreaterThan(0);
    });
  }
});

// ── The three mandatory warnings (FORMULA_GRAMMAR §3, §7b) ──────────────────

describe('the three mandatory warnings are present', () => {
  it('ROUND documents the half-away-from-zero divergence from Python', () => {
    expect(BUILTIN_DOCS.ROUND.warning).toBeDefined();
    expect(BUILTIN_DOCS.ROUND.warning!.en.toLowerCase()).toContain('python');
  });

  it('TINV documents the absence of a silent IFERROR fallback', () => {
    expect(BUILTIN_DOCS.TINV.warning).toBeDefined();
    expect(BUILTIN_DOCS.TINV.warning!.en).toContain('TINV(0.05, CAL_NU) if CAL_NU >= 1 else 2');
  });

  it('every column aggregate documents the bare-column-argument restriction', () => {
    for (const name of COLUMN_AGGREGATES) {
      expect(AGGREGATE_DOCS[name].warning, `${name} should warn about the bare-argument rule`).toBeDefined();
    }
  });
});
