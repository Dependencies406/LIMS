/**
 * formulaReferenceCoverage.test.ts
 *
 * Phase 15 Task 4b: reads docs/FORMULA_REFERENCE.md and asserts every name
 * in BUILTIN_FUNCTIONS, COLUMN_AGGREGATES, and STANDARD_VARIABLE_NAMES
 * appears somewhere in it — a drift guard, not a document generator. If a
 * name is missing here, either the document is stale or the name was never
 * documented; either way this test is meant to fail until someone fixes the
 * document by hand.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { BUILTIN_FUNCTIONS, COLUMN_AGGREGATES } from '../../modules/recorder/formula/builtins';
import { STANDARD_VARIABLE_NAMES } from '../referenceStandardVariables';

const REFERENCE_DOC_PATH = resolve(__dirname, '../../../docs/FORMULA_REFERENCE.md');
const doc = readFileSync(REFERENCE_DOC_PATH, 'utf-8');

describe('docs/FORMULA_REFERENCE.md mentions every builtin, aggregate, and STD_* name', () => {
  it('mentions every BUILTIN_FUNCTIONS name', () => {
    const missing = Object.keys(BUILTIN_FUNCTIONS).filter((name) => !doc.includes(name));
    expect(missing).toEqual([]);
  });

  it('mentions every COLUMN_AGGREGATES name', () => {
    const missing = COLUMN_AGGREGATES.filter((name) => !doc.includes(name));
    expect(missing).toEqual([]);
  });

  it('mentions every STANDARD_VARIABLE_NAMES name', () => {
    const missing = STANDARD_VARIABLE_NAMES.filter((name) => !doc.includes(name));
    expect(missing).toEqual([]);
  });
});
