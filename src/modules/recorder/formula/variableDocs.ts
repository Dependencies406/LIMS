/**
 * variableDocs.ts
 *
 * Phase 10 Task 6: documentation for the VARIABLE names a formula may
 * reference — the other half of "what can I type here?", alongside
 * builtinDocs.ts's function documentation.
 *
 * Every list below is IMPORTED, never retyped:
 *   - `STANDARD_VARIABLE_NAMES` (services/referenceStandardVariables.ts) is
 *     already the single source of truth the validator checks `STD_*`
 *     against.
 *   - `REPORT_VARIABLES` (validator.ts) for `REPORT_TO_N`.
 *   - `ENV_*` names are generated per round (`ENV_TEMP_R{n}`, `ENV_RH_R{n}`),
 *     so there is no fixed list to import — `ENV_PATTERN_DOCS` documents the
 *     PATTERN instead, and is checked against the validator's own
 *     `ENV_PATTERN` regex shape by test rather than a name list.
 *
 * ── A NOTED EXCEPTION, not a silent one ──────────────────────────────────
 *
 * `validator.ts` deliberately DUPLICATES `STANDARD_VARIABLE_NAMES` (as
 * `STANDARD_VARIABLES`) rather than importing it, with an explicit comment:
 * "the formula module is deliberately standalone — it depends on nothing
 * outside itself, so it can be reasoned about and tested in isolation."
 * That principle is about the INTERPRETER's trust boundary (ADR-001's
 * eval-free security argument) — the parser, validator and evaluator must
 * stay auditable with zero external dependencies.
 *
 * This file is documentation, not interpreter logic: it has no evaluation
 * behaviour and no security surface, and Phase 10 Task 6 explicitly requires
 * treating `services/referenceStandardVariables.ts` as the STD_* source of
 * truth rather than retyping it a third time. So this file imports across
 * that boundary deliberately — flagged here, not silently done, per the same
 * standard `validator.ts`'s own comment sets. If that standalone-module
 * principle is meant to be absolute rather than interpreter-scoped, this
 * import is the thing to reconsider.
 *
 * `__tests__/variableDocs.test.ts` makes drift a build failure in both
 * directions, the same guarantee builtinDocs.test.ts gives the function list.
 */

import { STANDARD_VARIABLE_NAMES } from '../../../services/referenceStandardVariables';
import { REPORT_VARIABLES } from './validator';
import type { Bilingual } from './builtinDocs';

export type { Bilingual };

export interface VariableDoc {
  summary: Bilingual;
  /** Symbol, not prose — e.g. "%", "N (newtons)". Omitted when the variable has no fixed unit (a coefficient). */
  unit?: string;
  /**
   * Where this variable resolves from — the thing that actually confuses
   * people (Phase 10 background). `row`: from the standard chosen in THIS
   * row (STD_*). `record`: one value broadcast to every row (ENV_*,
   * REPORT_TO_N). `summary-only`: valid only in a summary field (SUMMARY_*,
   * documented separately in FORMULA_REFERENCE.md — it has no fixed name to
   * key a doc entry to, it is per-template).
   */
  scope: 'row' | 'record';
  example?: { formula: string; note?: Bilingual };
  warning?: Bilingual;
}

// ── STD_* — row-scoped, from the standard chosen in THIS row (ADR-013 D4) ───

/** STD_C0..STD_C5: coefficient of R^i. Generated so all six read consistently — see the file header. */
function coefficientDoc(i: number): VariableDoc {
  const power = i === 0 ? '' : i === 1 ? '·R' : `·R${['⁰', '¹', '²', '³', '⁴', '⁵'][i] ?? `^${i}`}`;
  return {
    summary: {
      en: i === 0
        ? `The constant term of the standard's calibration polynomial (multiplies R⁰, i.e. it stands alone).`
        : `The coefficient that multiplies R${i === 1 ? '' : `^${i}`} in the standard's calibration polynomial.`,
      th: i === 0
        ? `พจน์คงที่ (constant term) ของสมการพหุนามการสอบเทียบของมาตรฐาน (คูณด้วย R⁰ คือไม่คูณกับ R เลย)`
        : `สัมประสิทธิ์ที่คูณกับ R${i === 1 ? '' : `^${i}`} ในสมการพหุนามการสอบเทียบของมาตรฐาน`,
    },
    example: i === 1 ? {
      formula: 'STD_C1*R + STD_C2*R**2 + STD_C3*R**3',
      note: {
        en: 'The full worked form for a cubic calibration polynomial (R is the standard\'s raw reading). See FORMULA_REFERENCE.md Part 1 for a real worked number.',
        th: 'รูปแบบเต็มของสมการพหุนามกำลังสามสำหรับการสอบเทียบ (R คือค่าที่มาตรฐานอ่านได้ดิบๆ) ดูตัวอย่างตัวเลขจริงได้ใน FORMULA_REFERENCE.md ส่วนที่ 1',
      },
    } : undefined,
    warning: {
      en: 'One deliberate exception to "empty is an error" (ADR-013 D4): a coefficient slot beyond the standard\'s stored polynomial degree resolves to 0, not awaiting-input. A polynomial\'s absent higher terms genuinely ARE zero — a 2nd-degree standard leaves STD_C3, STD_C4, STD_C5 at 0 automatically, so a formula written for the highest degree you might ever use still works for a lower-degree standard without change.',
      th: 'ข้อยกเว้นเดียวที่ตั้งใจไว้จากกฎ "ค่าว่างคือข้อผิดพลาด" (ADR-013 D4): ช่องสัมประสิทธิ์ที่เกินระดับขั้น (degree) ของพหุนามที่มาตรฐานนั้นบันทึกไว้ จะมีค่าเป็น 0 ไม่ใช่ awaiting-input เพราะพจน์ระดับสูงที่ไม่มีอยู่จริงของพหุนามคือศูนย์จริงๆ — มาตรฐานระดับขั้น 2 จะทำให้ STD_C3, STD_C4, STD_C5 เป็น 0 โดยอัตโนมัติ ทำให้สูตรที่เขียนไว้สำหรับระดับขั้นสูงสุดที่อาจใช้ ยังคงใช้ได้กับมาตรฐานระดับขั้นต่ำกว่าโดยไม่ต้องแก้ไข',
    },
    scope: 'row',
  };
}

const STD_C_DOCS: Record<string, VariableDoc> = Object.fromEntries(
  Array.from({ length: 6 }, (_, i) => [`STD_C${i}`, coefficientDoc(i)]),
);

const STD_TO_N_DOC: VariableDoc = {
  summary: {
    en: 'The factor that converts the standard\'s own calibrated output unit to newtons.',
    th: 'ตัวคูณที่แปลงหน่วยผลลัพธ์ที่มาตรฐานถูกสอบเทียบไว้ ให้เป็นหน่วยนิวตัน (newton)',
  },
  unit: 'newtons per unit',
  scope: 'row',
  example: {
    formula: 'polynomial(R) * STD_TO_N / REPORT_TO_N',
    note: {
      en: 'The full ADR-014 D5 conversion pattern. Both factors exist because the standard reads out in ONE unit (whatever it was calibrated in — kN, kgF, …) and the certificate reports in ANOTHER (whatever the record\'s reporting unit is set to) — these are frequently different, and the same transducer may be used on jobs reporting in different units. Converting through newtons in the middle means adding a new unit means adding one row to the newton table, not a combinatorial matrix.',
      th: 'รูปแบบการแปลงหน่วยแบบเต็มตาม ADR-014 D5 มีตัวคูณสองตัวเพราะมาตรฐานให้ผลอ่านเป็นหน่วยหนึ่ง (แล้วแต่ว่าถูกสอบเทียบไว้ในหน่วยใด เช่น kN, kgF ฯลฯ) แต่ใบรับรองรายงานผลเป็นอีกหน่วยหนึ่ง (แล้วแต่หน่วยการรายงานที่ตั้งไว้ในบันทึกนั้น) — สองหน่วยนี้มักไม่เหมือนกัน และทรานสดิวเซอร์ตัวเดียวกันอาจถูกใช้ในงานที่รายงานผลคนละหน่วยกันได้ การแปลงผ่านหน่วยนิวตันตรงกลางทำให้การเพิ่มหน่วยใหม่เป็นเพียงการเพิ่มแถวเดียวในตารางนิวตัน ไม่ใช่การสร้างตารางแปลงหน่วยแบบไขว้ที่ซับซ้อนขึ้นเรื่อยๆ',
    },
  },
};

const STD_UNCERTAINTY_DOCS: Record<string, VariableDoc> = {
  STD_UCAL: {
    summary: {
      en: 'The standard\'s own calibration uncertainty, as reported on its calibration certificate.',
      th: 'ค่าความไม่แน่นอนจากการสอบเทียบ (calibration uncertainty) ของมาตรฐานเอง ตามที่ระบุไว้ในใบรับรองการสอบเทียบของมาตรฐานนั้น',
    },
    unit: '%',
    scope: 'row',
  },
  STD_UA: {
    summary: {
      en: 'Uncertainty contributor A for this standard, from its calibration data (LCDB).',
      th: 'องค์ประกอบความไม่แน่นอน A ของมาตรฐานนี้ จากข้อมูลการสอบเทียบ (LCDB)',
    },
    unit: '%',
    scope: 'row',
  },
  STD_UB: {
    summary: {
      en: 'Uncertainty contributor B for this standard, from its calibration data (LCDB).',
      th: 'องค์ประกอบความไม่แน่นอน B ของมาตรฐานนี้ จากข้อมูลการสอบเทียบ (LCDB)',
    },
    unit: '%',
    scope: 'row',
  },
  STD_UC: {
    summary: {
      en: 'Uncertainty contributor C for this standard, from its calibration data (LCDB).',
      th: 'องค์ประกอบความไม่แน่นอน C ของมาตรฐานนี้ จากข้อมูลการสอบเทียบ (LCDB)',
    },
    unit: '%',
    scope: 'row',
    example: {
      formula: 'RSS(STD_UA, STD_UB, STD_UC)',
      note: {
        en: 'Combining the three contributors with root-sum-square, the standard way to combine independent uncertainty components.',
        th: 'รวมองค์ประกอบทั้งสามด้วยรากที่สองของผลรวมกำลังสอง (root-sum-square) ซึ่งเป็นวิธีมาตรฐานในการรวมองค์ประกอบความไม่แน่นอนที่เป็นอิสระต่อกัน',
      },
    },
  },
};

const STD_RESOLUTION_DOC: VariableDoc = {
  summary: {
    en: 'The standard\'s own readout resolution.',
    th: 'ความละเอียดในการอ่านค่า (readout resolution) ของมาตรฐานเอง',
  },
  scope: 'row',
  warning: {
    en: 'Only populated if someone entered a resolution value on the Conversion Equation for this standard (added to the equation form in an earlier phase). If nobody has, STD_RESOLUTION correctly reads awaiting-input — that is expected, not a bug, and the fix is to fill in the field on the equipment\'s Conversion Equation, not to change the formula.',
    th: 'ค่านี้จะมีค่าก็ต่อเมื่อมีผู้กรอกค่าความละเอียดไว้ในสมการแปลงหน่วย (Conversion Equation) ของมาตรฐานนั้น (ช่องนี้ถูกเพิ่มเข้ามาในเฟสก่อนหน้า) หากยังไม่มีผู้กรอก STD_RESOLUTION จะแสดงผลเป็น awaiting-input ซึ่งถูกต้องแล้ว ไม่ใช่ข้อผิดพลาด วิธีแก้คือไปกรอกค่าความละเอียดที่สมการแปลงหน่วยของอุปกรณ์นั้น ไม่ใช่แก้ที่สูตร',
  },
};

/**
 * Keyed to `STANDARD_VARIABLE_NAMES` — the SAME list the validator checks
 * `STD_*` against. `variableDocs.test.ts` asserts every name here is one of
 * those, and every one of those has an entry here.
 */
export const STD_DOCS: Record<string, VariableDoc> = {
  ...STD_C_DOCS,
  STD_TO_N: STD_TO_N_DOC,
  ...STD_UNCERTAINTY_DOCS,
  STD_RESOLUTION: STD_RESOLUTION_DOC,
};

// ── REPORT_* — record-scoped: same value for every row (ADR-014 D5) ─────────

export const REPORT_DOCS: Record<string, VariableDoc> = {
  REPORT_TO_N: {
    summary: {
      en: 'The factor that converts the record\'s reporting unit to newtons — the certificate\'s side of the STD_TO_N / REPORT_TO_N conversion pair.',
      th: 'ตัวคูณที่แปลงหน่วยการรายงานผลของบันทึกนี้ ให้เป็นหน่วยนิวตัน (newton) — เป็นอีกด้านหนึ่งของคู่การแปลงหน่วย STD_TO_N / REPORT_TO_N ในฝั่งของใบรับรอง',
    },
    unit: 'newtons per unit',
    scope: 'record',
    example: {
      formula: 'polynomial(R) * STD_TO_N / REPORT_TO_N',
      note: {
        en: 'Never defaulted to a value — if the record has no reporting unit set yet, REPORT_TO_N is empty and any formula using it reads awaiting-input, exactly like an unfilled input.',
        th: 'จะไม่ถูกตั้งค่าเริ่มต้นให้เองเด็ดขาด — หากบันทึกนี้ยังไม่ได้ตั้งหน่วยการรายงานผล REPORT_TO_N จะเป็นค่าว่าง และสูตรใดที่ใช้ค่านี้จะแสดงผลเป็น awaiting-input เหมือนกับช่องที่ยังไม่ได้กรอกข้อมูล',
      },
    },
  },
};

// ── ENV_* — record-scoped, generated per round (ADR-009) ────────────────────

export interface EnvPatternDoc {
  /** The generated name pattern, e.g. "ENV_TEMP_R{n}". English only — it is a variable-name pattern. */
  pattern: string;
  summary: Bilingual;
  unit?: string;
}

/**
 * Documents the TWO env patterns — there is no fixed name list to key to
 * (`ENV_TEMP_R1`, `ENV_TEMP_R2`, … depend on the template's roundCount), so
 * this documents the pattern itself. `variableDocs.test.ts` checks these two
 * pattern strings against the validator's own `ENV_PATTERN` regex shape
 * (`/^ENV_(TEMP|RH)_R(\d+)$/`) so a new env kind added there cannot silently
 * go undocumented here either.
 */
export const ENV_PATTERN_DOCS: EnvPatternDoc[] = [
  {
    pattern: 'ENV_TEMP_R{n}',
    summary: {
      en: 'The recorded temperature for round {n} (1 ≤ n ≤ the template\'s round count) — one value broadcast to every row of that round.',
      th: 'อุณหภูมิที่บันทึกไว้สำหรับรอบที่ {n} (1 ≤ n ≤ จำนวนรอบของเทมเพลตนี้) — เป็นค่าเดียวที่ใช้ร่วมกันทุกแถวในรอบนั้น',
    },
    unit: '°C',
  },
  {
    pattern: 'ENV_RH_R{n}',
    summary: {
      en: 'The recorded relative humidity for round {n} (1 ≤ n ≤ the template\'s round count) — one value broadcast to every row of that round.',
      th: 'ความชื้นสัมพัทธ์ (relative humidity) ที่บันทึกไว้สำหรับรอบที่ {n} (1 ≤ n ≤ จำนวนรอบของเทมเพลตนี้) — เป็นค่าเดียวที่ใช้ร่วมกันทุกแถวในรอบนั้น',
    },
    unit: '%RH',
  },
];

// Re-exported so a consumer of this module never needs a second import of
// the same source-of-truth lists purely to cross-check doc coverage.
export { STANDARD_VARIABLE_NAMES, REPORT_VARIABLES };
