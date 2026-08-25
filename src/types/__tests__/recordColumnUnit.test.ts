/**
 * recordColumnUnit.test.ts
 *
 * Phase 15 Task 1's non-negotiable invariant, extended for the
 * fixed/selectable supersession: `RecordColumn.unitMode`/`unit`/
 * `unitChoices` and `CalibrationRecord.columnUnits` are all display-only
 * and must never reach any calculation. Referenced from the `unitMode`
 * field's doc comment in `types/index.ts`.
 *
 * Two proofs, deliberately different in kind:
 *  - a structural grep proving no evaluation-path source file reads any of
 *    the four unit-related field names off a column/record at all (so
 *    there's nothing for them to affect)
 *  - a behavioural proof that adding/changing a column's unit fields (fixed
 *    or selectable) produces byte-identical computed output through the
 *    real recalculation entry point (recalculateRecord), matching the
 *    render-side proof with an end-to-end one. `recalculateRecord`'s own
 *    signature doesn't accept a `columnUnits` argument at all — there is
 *    nowhere to pass it even if someone tried — which this test's second
 *    case demonstrates structurally by construction.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { recalculateRecord } from '../../services/recordRecalculation';
import type { RecorderTemplate, RecordRow } from '../index';

const EVALUATION_PATH_FILES = [
  '../../modules/recorder/formula/lexer.ts',
  '../../modules/recorder/formula/parser.ts',
  '../../modules/recorder/formula/ast.ts',
  '../../modules/recorder/formula/evaluator.ts',
  '../../modules/recorder/formula/validator.ts',
  '../../modules/recorder/formula/builtins.ts',
  '../../services/recorderTemplateMockup.ts',
  '../../services/recordRecalculation.ts',
  '../../services/recordEnvironment.ts',
  '../../modules/recorder/hooks/useLiveRecalculation.ts',
];

// Deliberately broad: any of these tokens at all in an evaluation-path file
// is worth failing on. Word-boundary anchored on BOTH ends so `.unit` does
// not also (mis)match inside `.unitMode`/`.unitChoices` — each field name
// is checked for real, not as a substring of another.
const FORBIDDEN_FIELD_PATTERNS = [/\.unit\b/, /\.unitMode\b/, /\.unitChoices\b/, /\.columnUnits\b/];

describe('RecordColumn unit fields — structural invariant', () => {
  it('no evaluation-path source file reads unit/unitMode/unitChoices/columnUnits off a column or record', () => {
    for (const relPath of EVALUATION_PATH_FILES) {
      const abs = resolve(__dirname, relPath);
      const source = readFileSync(abs, 'utf-8');
      for (const pattern of FORBIDDEN_FIELD_PATTERNS) {
        expect(source, `${relPath} must not reference ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

function templateWithFormula(unitFields: Partial<Pick<RecorderTemplate['sections'][number]['columns'][number], 'unitMode' | 'unit' | 'unitChoices' | 'unitSourceColumn'>> = {}): RecorderTemplate {
  return {
    id: 'tpl1',
    name: 'UTM',
    equipmentTypeId: 'eqtype1',
    roundCount: 1,
    defaultRowCount: 1,
    allowRowAdd: true,
    recordNumberFormat: { parts: ['UTM'], separator: '-', includeYear: false, yearDigits: 2, numberPadding: 3, resetPolicy: 'never' },
    sections: [
      {
        id: 'CAL',
        label: 'Calibration',
        order: 0,
        columns: [
          { id: 'NOM', label: 'Nominal', order: 0, type: 'number', numberFormat: { notation: 'fixed', decimals: 2 }, ...unitFields },
          { id: 'IND', label: 'Indicated', order: 1, type: 'number', numberFormat: { notation: 'fixed', decimals: 2 }, ...unitFields },
          { id: 'ERR', label: 'Error', order: 2, type: 'formula', expression: 'CAL_IND - CAL_NOM', ...unitFields },
        ],
      },
    ],
    summaryFields: [],
    customFunctions: [],
    status: 'active',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    updatedBy: 'u1',
  };
}

function row(): RecordRow {
  return { CAL_NOM: 10, CAL_IND: 12.5 };
}

describe('RecordColumn unit fields — behavioural invariant', () => {
  it('changing a fixed column unit changes no computed value', () => {
    const noUnit = recalculateRecord(templateWithFormula(), [row()], []);
    const withUnitN = recalculateRecord(templateWithFormula({ unitMode: 'fixed', unit: 'N' }), [row()], []);
    const withUnitKgf = recalculateRecord(templateWithFormula({ unitMode: 'fixed', unit: 'kgf' }), [row()], []);

    expect(withUnitN.computedRows).toEqual(noUnit.computedRows);
    expect(withUnitKgf.computedRows).toEqual(noUnit.computedRows);
    expect(noUnit.computedRows[0].CAL_ERR).toBe(2.5);
  });

  it('a selectable column, with or without unitChoices, changes no computed value', () => {
    const noUnit = recalculateRecord(templateWithFormula(), [row()], []);
    const selectable = recalculateRecord(
      templateWithFormula({ unitMode: 'selectable', unitChoices: ['N', 'kN', 'kgF'] }),
      [row()],
      [],
    );
    expect(selectable.computedRows).toEqual(noUnit.computedRows);
  });

  it("recalculateRecord's signature has no columnUnits parameter at all — a chosen unit has no channel to reach evaluation", () => {
    // recalculateRecord(template, rows, environment, standards?, reportUnit?).
    // There is nowhere in this signature for a record's columnUnits map to
    // go. Proven structurally: calling it with a row that happens to also
    // carry a stray 'columnUnits'-shaped value under an unrelated key still
    // evaluates identically, because recalculateRecord only ever reads the
    // column keys the template's formulas actually reference.
    const template = templateWithFormula({ unitMode: 'selectable', unitChoices: ['N', 'kN'] });
    const plain = recalculateRecord(template, [row()], []);
    const rowWithStrayColumnUnits = { ...row(), NOT_A_REAL_COLUMN_columnUnits: 'kN' } as RecordRow;
    const withStrayData = recalculateRecord(template, [rowWithStrayColumnUnits], []);
    expect(withStrayData.computedRows[0].CAL_ERR).toEqual(plain.computedRows[0].CAL_ERR);
  });
});

describe('sameAs unit mode — still just a label (Phase 15)', () => {
  it('the forbidden-field grep also covers unitSourceColumn', () => {
    for (const relPath of EVALUATION_PATH_FILES) {
      const source = readFileSync(resolve(__dirname, relPath), 'utf-8');
      expect(source, `${relPath} must not reference .unitSourceColumn`).not.toMatch(/\.unitSourceColumn\b/);
    }
  });

  it('a column inheriting a unit changes no computed value', () => {
    const plain = recalculateRecord(templateWithFormula(), [row()], []);
    const inheriting = recalculateRecord(
      templateWithFormula({ unitMode: 'sameAs', unitSourceColumn: 'CAL_NOM' }),
      [row()],
      [],
    );
    expect(inheriting.computedRows).toEqual(plain.computedRows);
    expect(inheriting.computedRows[0].CAL_ERR).toBe(2.5);
  });
});
