/**
 * builtinDocs.ts
 *
 * Human-readable documentation for the function whitelist, keyed to the
 * EXACT names in `BUILTIN_FUNCTIONS` (builtins.ts) and `COLUMN_AGGREGATES`.
 *
 * This is prose ABOUT the whitelist, never a second copy OF it. Arity is
 * read from `describeArity()` at render time (Help modal / FORMULA_REFERENCE
 * generation) — it is deliberately not restated here, where it could drift
 * from `BUILTIN_FUNCTIONS`'s own `minArgs`/`maxArgs`.
 *
 * `__tests__/builtinDocs.test.ts` makes drift a build failure in both
 * directions: every builtin must have an entry, and every entry must name a
 * real builtin. It also asserts every worked example's `formula` parses, and
 * every `Bilingual` field has both `en` and `th` non-empty.
 *
 * All prose is bilingual (Thai + English, owner decision 2026-08-04) EXCEPT:
 * function names, keywords, formula examples, and variable-name patterns,
 * which are English because they are what you literally type.
 *
 * Every numeric example here was computed against the REAL implementation
 * (numeric.ts / studentT.ts), not worked out by hand — see the phase's
 * verification notes. `ROUND`, `TRUNC`, `STDEV`, `RSS`, `AVERAGE`, `TINV`
 * values are exact.
 */

/** Prose that must exist in both languages. */
export interface Bilingual {
  en: string;
  th: string;
}

export interface BuiltinDoc {
  /** One line, plain language. */
  summary: Bilingual;
  /** e.g. "ROUND(value, decimals)" — English only, it is code. */
  signature: string;
  examples: Array<{
    /** English only — this is what you literally type. */
    formula: string;
    result: string;
    note?: Bilingual;
  }>;
  /** For the mandatory traps: ROUND vs Python, TINV's missing fallback, col_* argument shape. */
  warning?: Bilingual;
}

export const BUILTIN_DOCS: Record<string, BuiltinDoc> = {
  ABS: {
    summary: {
      en: 'The absolute value — always positive, direction dropped.',
      th: 'ค่าสัมบูรณ์ (absolute value) — ค่าที่เป็นบวกเสมอ โดยตัดทิศทาง (เครื่องหมาย) ทิ้งไป',
    },
    signature: 'ABS(value)',
    examples: [
      {
        formula: 'ABS(-5.2)',
        result: '5.2',
        note: {
          en: 'Useful for a deviation that could be over or under and you only care about the size.',
          th: 'มีประโยชน์เมื่อค่าเบี่ยงเบนอาจเป็นบวกหรือลบก็ได้ และคุณสนใจแค่ขนาดของมัน',
        },
      },
    ],
  },

  SQRT: {
    summary: {
      en: 'The square root. A negative input is treated as an error, not a missing/blank result.',
      th: 'รากที่สอง (square root) หากใส่ค่าลบจะถือเป็นข้อผิดพลาด (error) ไม่ใช่ค่าว่าง',
    },
    signature: 'SQRT(value)',
    examples: [
      {
        formula: 'SQRT(2.25)',
        result: '1.5',
      },
    ],
  },

  ROUND: {
    summary: {
      en: 'Rounds to a fixed number of decimal places — half-away-from-zero, matching Excel.',
      th: 'ปัดเศษ (round) ให้เหลือทศนิยมตามจำนวนที่กำหนด — ปัดออกจากศูนย์เมื่อเท่ากับครึ่งพอดี เหมือน Excel',
    },
    signature: 'ROUND(value, decimals)',
    examples: [
      {
        formula: 'ROUND(12.345, 2)',
        result: '12.35',
      },
      {
        formula: 'ROUND(2.5, 0)',
        result: '3',
        note: {
          en: 'Exactly half rounds AWAY from zero, not to the nearest even number.',
          th: 'ค่าที่เป็นครึ่งพอดีจะถูกปัด "ออกจากศูนย์" ไม่ใช่ปัดเข้าหาเลขคู่ที่ใกล้ที่สุด',
        },
      },
    ],
    warning: {
      en: 'ROUND is NOT Python\'s round(). Python uses banker\'s rounding (half-to-even): round(0.5) is 0, round(-0.5) is 0. This ROUND rounds half away from zero instead, matching Excel: ROUND(0.5, 0) is 1, ROUND(-0.5, 0) is -1. This is deliberate, so results reconcile against the lab\'s existing spreadsheets — not an oversight.',
      th: 'ROUND ในที่นี้ไม่เหมือน round() ของ Python ซึ่งใช้การปัดแบบ banker\'s rounding (ปัดเข้าหาเลขคู่): round(0.5) ได้ 0, round(-0.5) ได้ 0 แต่ ROUND ในระบบนี้ปัด "ออกจากศูนย์" เสมอเมื่อเจอค่าครึ่งพอดี เหมือน Excel: ROUND(0.5, 0) ได้ 1, ROUND(-0.5, 0) ได้ -1 ความแตกต่างนี้ตั้งใจให้เป็นแบบนี้ เพื่อให้ผลลัพธ์ตรงกับสเปรดชีตเดิมของห้องปฏิบัติการ ไม่ใช่ข้อผิดพลาด',
    },
  },

  TRUNC: {
    summary: {
      en: 'Cuts off digits beyond the given decimal place, toward zero — it does not round. Decimals default to 0.',
      th: 'ตัดทศนิยมส่วนที่เกินตำแหน่งที่กำหนด โดยตัด "เข้าหาศูนย์" — ไม่ใช่การปัดเศษ ถ้าไม่ระบุตำแหน่งทศนิยม ค่าเริ่มต้นคือ 0',
    },
    signature: 'TRUNC(value [, decimals])',
    examples: [
      {
        formula: 'TRUNC(12.789, 1)',
        result: '12.7',
      },
      {
        formula: 'TRUNC(-12.789)',
        result: '-12',
        note: {
          en: 'Toward zero, so a negative number gets LARGER (less negative), not more negative.',
          th: 'ตัดเข้าหาศูนย์ ดังนั้นเลขลบจะมีค่า "มากขึ้น" (ลบน้อยลง) ไม่ใช่ลบมากขึ้น',
        },
      },
    ],
  },

  MAX: {
    summary: {
      en: 'The largest of two or more values.',
      th: 'ค่าที่มากที่สุดจากค่าตั้งแต่สองค่าขึ้นไป',
    },
    signature: 'MAX(value1, value2, ...)',
    examples: [
      {
        formula: 'MAX(1.02, 0.98, 1.05)',
        result: '1.05',
      },
    ],
  },

  MIN: {
    summary: {
      en: 'The smallest of two or more values.',
      th: 'ค่าที่น้อยที่สุดจากค่าตั้งแต่สองค่าขึ้นไป',
    },
    signature: 'MIN(value1, value2, ...)',
    examples: [
      {
        formula: 'MIN(1.02, 0.98, 1.05)',
        result: '0.98',
      },
    ],
  },

  AVERAGE: {
    summary: {
      en: 'The arithmetic mean of two or more values, within one row.',
      th: 'ค่าเฉลี่ยเลขคณิต (arithmetic mean) ของค่าตั้งแต่สองค่าขึ้นไป ภายในแถวเดียวกัน',
    },
    signature: 'AVERAGE(value1, value2, ...)',
    examples: [
      {
        formula: 'AVERAGE(10, 10.02, 9.98)',
        result: '10',
        note: {
          en: 'For averaging a whole COLUMN across every row, in a summary field, use col_mean instead.',
          th: 'หากต้องการหาค่าเฉลี่ยของทั้ง "คอลัมน์" ในทุกแถว ให้ใช้ col_mean ในช่องสรุปผล (summary field) แทน',
        },
      },
    ],
  },

  SUM: {
    summary: {
      en: 'The total of two or more values, within one row.',
      th: 'ผลรวมของค่าตั้งแต่สองค่าขึ้นไป ภายในแถวเดียวกัน',
    },
    signature: 'SUM(value1, value2, ...)',
    examples: [
      {
        formula: 'SUM(1.01, 0.99, 1.00)',
        result: '3',
      },
    ],
  },

  RSS: {
    summary: {
      en: 'Root-sum-square: square each value, add them, take the square root. The standard way to combine independent uncertainty components.',
      th: 'รากที่สองของผลรวมกำลังสอง (root-sum-square) — ยกกำลังสองแต่ละค่า บวกกัน แล้วถอดรากที่สอง เป็นวิธีมาตรฐานในการรวมองค์ประกอบความไม่แน่นอน (uncertainty) ที่เป็นอิสระต่อกัน',
    },
    signature: 'RSS(value1, value2, ...)',
    examples: [
      {
        formula: 'RSS(3, 4)',
        result: '5',
        note: {
          en: 'sqrt(3² + 4²) = sqrt(25) = 5. In real use the arguments are uncertainty contributors, e.g. RSS(U_A, U_B, U_C).',
          th: 'sqrt(3² + 4²) = sqrt(25) = 5 ในการใช้งานจริง อาร์กิวเมนต์คือองค์ประกอบความไม่แน่นอนแต่ละตัว เช่น RSS(U_A, U_B, U_C)',
        },
      },
    ],
  },

  STDEV: {
    summary: {
      en: 'Sample standard deviation (dividing by n−1), of two or more values within one row.',
      th: 'ส่วนเบี่ยงเบนมาตรฐานของกลุ่มตัวอย่าง (sample standard deviation, หารด้วย n−1) ของค่าตั้งแต่สองค่าขึ้นไปภายในแถวเดียวกัน',
    },
    signature: 'STDEV(value1, value2, ...)',
    examples: [
      {
        formula: 'STDEV(10, 12, 14)',
        result: '2',
        note: {
          en: 'Needs at least 2 values — a single reading has no defined spread.',
          th: 'ต้องมีอย่างน้อย 2 ค่า เพราะการอ่านค่าเดียวไม่มีการกระจายตัวที่นิยามได้',
        },
      },
    ],
  },

  TINV: {
    summary: {
      en: 'The two-tailed inverse Student-t value (coverage factor) for a given significance level and degrees of freedom.',
      th: 'ค่าผกผันของการแจกแจงที (Student-t) แบบสองด้าน (two-tailed) หรือตัวประกอบครอบคลุม (coverage factor) สำหรับระดับนัยสำคัญและองศาอิสระที่กำหนด',
    },
    signature: 'TINV(alpha, degrees_of_freedom)',
    examples: [
      {
        formula: 'TINV(0.05, 10)',
        result: '2.2281388519862766',
        note: {
          en: 'The conventional 95%-confidence coverage factor at 10 degrees of freedom. Matches standard statistical tables.',
          th: 'ตัวประกอบครอบคลุมที่ระดับความเชื่อมั่น 95% ตามธรรมเนียม เมื่อองศาอิสระเท่ากับ 10 ตรงกับตารางสถิติมาตรฐาน',
        },
      },
    ],
    warning: {
      en: 'TINV has NO silent fallback. The lab\'s old workbook used =IFERROR(TINV(...), 2), quietly substituting the conventional coverage factor k=2 whenever degrees of freedom hit zero (a single reading with no repeats). That silent substitution is gone. Write it explicitly instead: TINV(0.05, CAL_NU) if CAL_NU >= 1 else 2 — so a reviewer can see exactly when k=2 was used and why, instead of it being hidden inside the formula.',
      th: 'TINV ไม่มีการ "สำรอง" ค่าอัตโนมัติแบบเงียบๆ อีกต่อไป สเปรดชีตเดิมของห้องปฏิบัติการเคยใช้ =IFERROR(TINV(...), 2) ซึ่งจะแทนที่ด้วยตัวประกอบครอบคลุมตามธรรมเนียม k=2 โดยอัตโนมัติเมื่อองศาอิสระเป็นศูนย์ (มีการอ่านค่าเดียวไม่มีการทำซ้ำ) พฤติกรรมที่ซ่อนอยู่แบบนั้นถูกตัดออกแล้ว ต้องเขียนเงื่อนไขให้เห็นชัดเจนแทน: TINV(0.05, CAL_NU) if CAL_NU >= 1 else 2 — เพื่อให้ผู้ตรวจสอบเห็นชัดว่า k=2 ถูกใช้เมื่อใดและเพราะเหตุใด แทนที่จะซ่อนอยู่ภายในสูตร',
    },
  },
};

/**
 * The bare-column-argument / summary-only restriction (FORMULA_GRAMMAR §3)
 * applies identically to all six aggregates, so it is written once and
 * attached to each — never omitted just because a reader started on a
 * different function than col_mean.
 */
function aggregateWarning(fnName: string): Bilingual {
  return {
    en: `Column aggregates are summary-only, and the argument must be a bare column name: ${fnName}(CAL_IND) is valid, ${fnName}(CAL_IND * 2) is not — write a helper formula column instead if you need to aggregate a calculation.`,
    th: `ฟังก์ชันรวมคอลัมน์ (column aggregate) ใช้ได้เฉพาะในช่องสรุปผลเท่านั้น และอาร์กิวเมนต์ต้องเป็นชื่อคอลัมน์เปล่าๆ: ${fnName}(CAL_IND) ใช้ได้ แต่ ${fnName}(CAL_IND * 2) ใช้ไม่ได้ — หากต้องการรวมผลจากการคำนวณ ให้สร้างคอลัมน์สูตรช่วยแยกต่างหากแทน`,
  };
}

export const AGGREGATE_DOCS: Record<string, BuiltinDoc> = {
  col_mean: {
    summary: {
      en: 'The mean of one column across every row of the record. Summary fields only.',
      th: 'ค่าเฉลี่ยของคอลัมน์หนึ่งในทุกแถวของบันทึกนี้ ใช้ได้เฉพาะในช่องสรุปผล (summary field) เท่านั้น',
    },
    signature: 'col_mean(COLUMN)',
    examples: [
      {
        formula: 'col_mean(CAL_IND)',
        result: 'the mean of every row\'s CAL_IND value',
      },
    ],
    warning: aggregateWarning('col_mean'),
  },

  col_max: {
    summary: {
      en: 'The largest value in one column across every row of the record. Summary fields only.',
      th: 'ค่าที่มากที่สุดในคอลัมน์หนึ่ง จากทุกแถวของบันทึกนี้ ใช้ได้เฉพาะในช่องสรุปผลเท่านั้น',
    },
    signature: 'col_max(COLUMN)',
    examples: [
      {
        formula: 'col_max(CAL_ERR)',
        result: 'the largest CAL_ERR across all rows',
        note: {
          en: 'A common use: the maximum deviation across the whole record, for a certificate summary.',
          th: 'การใช้งานทั่วไปคือ ค่าเบี่ยงเบนสูงสุดตลอดทั้งบันทึก สำหรับสรุปผลบนใบรับรอง',
        },
      },
    ],
    warning: aggregateWarning('col_max'),
  },

  col_min: {
    summary: {
      en: 'The smallest value in one column across every row of the record. Summary fields only.',
      th: 'ค่าที่น้อยที่สุดในคอลัมน์หนึ่ง จากทุกแถวของบันทึกนี้ ใช้ได้เฉพาะในช่องสรุปผลเท่านั้น',
    },
    signature: 'col_min(COLUMN)',
    examples: [
      {
        formula: 'col_min(CAL_ERR)',
        result: 'the smallest CAL_ERR across all rows',
      },
    ],
    warning: aggregateWarning('col_min'),
  },

  col_sum: {
    summary: {
      en: 'The total of one column across every row of the record. Summary fields only.',
      th: 'ผลรวมของคอลัมน์หนึ่งจากทุกแถวของบันทึกนี้ ใช้ได้เฉพาะในช่องสรุปผลเท่านั้น',
    },
    signature: 'col_sum(COLUMN)',
    examples: [
      {
        formula: 'col_sum(CAL_ERR)',
        result: 'the sum of every row\'s CAL_ERR value',
      },
    ],
    warning: aggregateWarning('col_sum'),
  },

  col_count: {
    summary: {
      en: 'How many rows this column has values in. Summary fields only, and — like every aggregate — it errors if any row is still empty rather than silently counting only the filled ones.',
      th: 'จำนวนแถวที่คอลัมน์นี้มีค่าอยู่ ใช้ได้เฉพาะในช่องสรุปผลเท่านั้น และเช่นเดียวกับฟังก์ชันรวมทุกตัว จะเกิดข้อผิดพลาดหากยังมีแถวใดว่างอยู่ แทนที่จะนับเฉพาะแถวที่กรอกแล้วแบบเงียบๆ',
    },
    signature: 'col_count(COLUMN)',
    examples: [
      {
        formula: 'col_count(CAL_IND)',
        result: 'the number of rows, once every row is filled in',
      },
    ],
    warning: aggregateWarning('col_count'),
  },

  col_stdev: {
    summary: {
      en: 'Sample standard deviation (n−1) of one column across every row of the record. Summary fields only; needs at least 2 rows.',
      th: 'ส่วนเบี่ยงเบนมาตรฐานของกลุ่มตัวอย่าง (หารด้วย n−1) ของคอลัมน์หนึ่งจากทุกแถวของบันทึกนี้ ใช้ได้เฉพาะในช่องสรุปผลเท่านั้น และต้องมีอย่างน้อย 2 แถว',
    },
    signature: 'col_stdev(COLUMN)',
    examples: [
      {
        formula: 'col_stdev(CAL_IND)',
        result: 'the sample standard deviation of every row\'s CAL_IND value',
        note: {
          en: 'A common Type A uncertainty component: the spread of repeated readings.',
          th: 'เป็นองค์ประกอบความไม่แน่นอนประเภท A (Type A) ที่พบบ่อย คือการกระจายตัวของค่าที่อ่านซ้ำหลายครั้ง',
        },
      },
    ],
    warning: aggregateWarning('col_stdev'),
  },
};
