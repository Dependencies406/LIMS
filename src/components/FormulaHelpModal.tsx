/**
 * FormulaHelpModal.tsx
 *
 * Phase 10 Task 4: the in-app Help modal for the formula language — the same
 * content as docs/FORMULA_REFERENCE.md, without leaving the template builder.
 *
 * The function and variable lists are GENERATED from `BUILTIN_DOCS` /
 * `AGGREGATE_DOCS` (builtinDocs.ts) and `STD_DOCS` / `REPORT_DOCS` /
 * `ENV_PATTERN_DOCS` (variableDocs.ts) — the same modules
 * `__tests__/builtinDocs.test.ts` and `__tests__/variableDocs.test.ts` pin
 * against the real whitelist. Arity comes from `describeArity()` at render
 * time, never restated in prose. Parts 1 and 3 (basic usage, recipes) are
 * static prose here, matching FORMULA_REFERENCE.md's Part 1 / Part 3 content.
 *
 * Follows the existing Modal/ModalFooter pattern from `./common` — no new
 * modal shell invented.
 */

import React, { useMemo, useState } from 'react';
import { Modal } from './common';
import {
  BUILTIN_FUNCTIONS,
  COLUMN_AGGREGATES,
  describeArity,
  BUILTIN_DOCS,
  AGGREGATE_DOCS,
  type BuiltinDoc,
  type Bilingual,
} from '../modules/recorder/formula';
import { STD_DOCS, REPORT_DOCS, ENV_PATTERN_DOCS, type VariableDoc } from '../modules/recorder/formula/variableDocs';

export type HelpLanguage = 'en' | 'th';
export type HelpTab = 'basics' | 'functions' | 'variables' | 'recipes';

export interface FormulaHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Controlled by the parent so the choice survives close/reopen within the session (owner requirement). */
  language: HelpLanguage;
  onLanguageChange: (language: HelpLanguage) => void;
  /** Which tab to open on — "opening at the relevant section if straightforward" (Task 5). Defaults to 'basics'. */
  initialTab?: HelpTab;
}

const TAB_LABELS: Record<HelpTab, Bilingual> = {
  basics: { en: 'Basics', th: 'พื้นฐาน' },
  functions: { en: 'Functions', th: 'ฟังก์ชัน' },
  variables: { en: 'Variables', th: 'ตัวแปร' },
  recipes: { en: 'Recipes', th: 'สูตรสำเร็จรูป' },
};

function t(text: Bilingual, lang: HelpLanguage): string {
  return lang === 'th' ? text.th : text.en;
}

/** English-only fenced example — visually distinct from prose (monospace, tinted background). */
const Code: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <pre className={`font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap ${className}`}>
    {children}
  </pre>
);

const Warning: React.FC<{ text: Bilingual; lang: HelpLanguage }> = ({ text, lang }) => (
  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
    <span className="text-amber-500 flex-shrink-0" aria-hidden="true">⚠</span>
    <p className="text-xs text-amber-800 leading-relaxed">{t(text, lang)}</p>
  </div>
);

function matchesQuery(name: string, doc: { summary: Bilingual }, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    name.toLowerCase().includes(q) ||
    doc.summary.en.toLowerCase().includes(q) ||
    doc.summary.th.includes(query)
  );
}

// ── Function entry (general builtin or column aggregate) ────────────────────

const FunctionEntry: React.FC<{ name: string; doc: BuiltinDoc; arity?: string; lang: HelpLanguage }> = ({
  name,
  doc,
  arity,
  lang,
}) => (
  <div id={`fn-${name}`} className="rounded-xl border border-gray-200 bg-white p-4 scroll-mt-4">
    <div className="flex items-baseline gap-2 flex-wrap">
      <code className="font-mono text-sm font-semibold text-primary-700">{doc.signature}</code>
      {arity && <span className="text-[10px] text-gray-400">{lang === 'th' ? `จำนวนอาร์กิวเมนต์: ${arity}` : `arity: ${arity}`}</span>}
    </div>
    <p className="text-sm text-gray-700 mt-1.5">{t(doc.summary, lang)}</p>
    <div className="mt-2 space-y-1.5">
      {doc.examples.map((ex, i) => (
        <div key={i}>
          <Code>{ex.formula}{'\n'}→ {ex.result}</Code>
          {ex.note && <p className="text-xs text-gray-500 mt-1">{t(ex.note, lang)}</p>}
        </div>
      ))}
    </div>
    {doc.warning && <Warning text={doc.warning} lang={lang} />}
  </div>
);

const VariableEntry: React.FC<{ name: string; doc: VariableDoc; lang: HelpLanguage }> = ({ name, doc, lang }) => (
  <div id={`var-${name}`} className="rounded-xl border border-gray-200 bg-white p-4 scroll-mt-4">
    <div className="flex items-baseline gap-2 flex-wrap">
      <code className="font-mono text-sm font-semibold text-primary-700">{name}</code>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
        {doc.scope === 'row'
          ? (lang === 'th' ? 'ต่อแถว (row)' : 'per-row')
          : (lang === 'th' ? 'ต่อบันทึก (record)' : 'per-record')}
      </span>
      {doc.unit && <span className="text-[10px] text-gray-400">{doc.unit}</span>}
    </div>
    <p className="text-sm text-gray-700 mt-1.5">{t(doc.summary, lang)}</p>
    {doc.example && (
      <div className="mt-2">
        <Code>{doc.example.formula}</Code>
        {doc.example.note && <p className="text-xs text-gray-500 mt-1">{t(doc.example.note, lang)}</p>}
      </div>
    )}
    {doc.warning && <Warning text={doc.warning} lang={lang} />}
  </div>
);

// ── Static prose (Part 1 / Part 3), mirrors FORMULA_REFERENCE.md ────────────

const BasicsTab: React.FC<{ lang: HelpLanguage }> = ({ lang }) => (
  <div className="space-y-5 text-sm text-gray-700 leading-relaxed">
    <section>
      <h3 className="font-semibold text-gray-900 mb-1">{lang === 'th' ? 'สูตรคืออะไร' : 'What a formula is'}</h3>
      <p>
        {lang === 'th'
          ? 'มีเพียงสองที่เท่านั้นที่คุณสามารถพิมพ์สูตรได้: คอลัมน์สูตร (formula column) คำนวณครั้งเดียวต่อหนึ่งแถว และช่องสรุปผล (summary field) คำนวณครั้งเดียวต่อหนึ่งบันทึก หลังจากทุกแถวกรอกครบแล้ว คอลัมน์สูตรจะมองไม่เห็นช่องสรุปผลได้เลย เพราะช่องสรุปผลขึ้นอยู่กับทุกแถว'
          : 'There are exactly two places you type a formula: a column formula, which runs once per row, and a summary field, which runs once per record after every row is filled in. A column formula can never see a summary field — a summary field depends on every row, so the reverse would be circular.'}
      </p>
    </section>
    <section>
      <h3 className="font-semibold text-gray-900 mb-1">{lang === 'th' ? 'การอ้างอิงถึงคอลัมน์' : 'Referring to a column'}</h3>
      <p>
        {lang === 'th'
          ? 'คอลัมน์เขียนในรูปแบบ SECTIONID_COLUMNID — รหัสหมวดและรหัสคอลัมน์ที่คุณพิมพ์ไว้ตอนสร้างเทมเพลต ต่อกันด้วยขีดล่าง เช่น CAL_IND'
          : 'A column is written SECTIONID_COLUMNID — the Section ID and Column ID you typed when building the template, joined with an underscore, e.g. CAL_IND.'}
      </p>
      <Code>CAL_IND</Code>
    </section>
    <section>
      <h3 className="font-semibold text-gray-900 mb-1">{lang === 'th' ? 'ค่าสภาพแวดล้อมและช่องสรุปผลอื่น' : 'Environment values and other summary fields'}</h3>
      <p>
        {lang === 'th'
          ? 'ENV_TEMP_R1, ENV_RH_R1 ... หนึ่งค่าต่อรอบ ใช้ร่วมกันทุกแถวในรอบนั้น SUMMARY_<id> อ้างอิงช่องสรุปผลอื่น ใช้ได้เฉพาะในช่องสรุปผลด้วยกันเท่านั้น'
          : 'ENV_TEMP_R1, ENV_RH_R1, … one value per round, shared by every row of that round. SUMMARY_<id> refers to another summary field — valid only inside another summary field.'}
      </p>
    </section>
    <section>
      <h3 className="font-semibold text-gray-900 mb-1">{lang === 'th' ? 'ค่าจากมาตรฐานอ้างอิง' : 'Reference-standard values'}</h3>
      <p>
        {lang === 'th'
          ? 'STD_* มาจากมาตรฐานที่เลือกไว้ในคอลัมน์ standard ของแถวนั้นเอง (ต่อแถว) ส่วน REPORT_TO_N เป็นค่าต่อบันทึก ดูรายละเอียดทั้งหมดในแท็บ "ตัวแปร"'
          : 'STD_* comes from the standard chosen in that row\'s own standard column (row-scoped). REPORT_TO_N is record-scoped. Full detail is in the Variables tab.'}
      </p>
      <Code>polynomial(R) * STD_TO_N / REPORT_TO_N</Code>
    </section>
    <section>
      <h3 className="font-semibold text-gray-900 mb-1">
        {lang === 'th' ? 'สูตรไม่สามารถอ้างอิงถึงคอลัมน์ของตัวเองได้' : 'A formula cannot reference its own column'}
      </h3>
      <p>
        {lang === 'th'
          ? 'หากทำเช่นนี้ ปุ่ม Verify จะรายงานว่าพบการอ้างอิงวนซ้ำ (dependency loop) วิธีแก้คือสร้างคอลัมน์กรอกข้อมูลดิบแยกต่างหาก แล้วให้สูตรอ้างอิงคอลัมน์นั้นแทน'
          : 'Doing this makes Verify report a dependency loop. The fix is almost always a separate input column for the raw value, referenced by the formula column instead of itself.'}
      </p>
    </section>
    <section>
      <h3 className="font-semibold text-gray-900 mb-1">{lang === 'th' ? 'ฟังก์ชันที่กำหนดเอง' : 'Custom functions'}</h3>
      <Code>{'def percent_error(nominal, indicated):\n    return (indicated - nominal) / nominal * 100'}</Code>
      <p className="mt-1.5">
        {lang === 'th'
          ? 'อินพุตเดียวของฟังก์ชันคือพารามิเตอร์ของมันเอง — เนื้อหาภายในจะอ้างอิงคอลัมน์, ENV_, STD_, หรือ SUMMARY_ โดยตรงไม่ได้ ฟังก์ชันเรียกฟังก์ชันอื่นได้ แต่ต้องไม่เกิดการเรียกวนซ้ำ'
          : 'A function\'s only inputs are its parameters — its body cannot reach columns, ENV_, STD_, or SUMMARY_ directly. Functions may call each other, but must not form a loop.'}
      </p>
    </section>
    <section>
      <h3 className="font-semibold text-gray-900 mb-1">
        {lang === 'th' ? 'สิ่งที่จงใจไม่อนุญาต' : 'What is deliberately not allowed'}
      </h3>
      <ul className="list-disc list-inside space-y-0.5">
        <li>{lang === 'th' ? 'การวนซ้ำ (loops)' : 'Loops'}</li>
        <li>{lang === 'th' ? 'บล็อก if/else — ใช้ a if condition else b แทน' : 'if/else blocks — use a if condition else b instead'}</li>
        <li>{lang === 'th' ? 'การเปรียบเทียบต่อเนื่อง 0 &lt; x &lt; 10 — ใช้ 0 &lt; x and x &lt; 10 แทน' : 'Chained comparisons 0 < x < 10 — use 0 < x and x < 10 instead'}</li>
        <li>{lang === 'th' ? '// และ %' : '// and %'}</li>
        <li>{lang === 'th' ? 'เครื่องหมายคำพูดภายในข้อความ' : 'Quotes inside text'}</li>
      </ul>
    </section>
    <section>
      <h3 className="font-semibold text-gray-900 mb-1">
        {lang === 'th' ? 'ช่องว่างคือข้อผิดพลาด ไม่ใช่ศูนย์' : 'Empty cells are an error, not zero'}
      </h3>
      <p>
        {lang === 'th'
          ? 'สูตรใดที่ใช้ค่าว่างจะกลายเป็น awaiting-input คอลัมน์ที่ยังกรอกไม่ครบจะยืนยันบันทึกไม่ได้ และฟังก์ชันสรุปผลที่คำนวณจากคอลัมน์ที่มีช่องว่างจะถือเป็นข้อผิดพลาด เพราะค่าเฉลี่ยจากข้อมูลไม่ครบไม่มีความหมาย และใบรับรองต้องไม่ปฏิบัติต่อข้อมูลที่ขาดหายเหมือนเป็นศูนย์'
          : 'A formula using an empty value becomes awaiting-input. An incomplete column cannot be committed, and an aggregate over a column with any empty cell is an error — a mean over incomplete data is meaningless, and a certificate must never silently treat missing data as zero.'}
      </p>
    </section>
    <section>
      <h3 className="font-semibold text-gray-900 mb-1">{lang === 'th' ? 'ตัวเลขและความละเอียด' : 'Numbers and precision'}</h3>
      <p>
        {lang === 'th'
          ? 'ทุกการคำนวณเก็บและประมวลผลด้วยความละเอียดเต็ม การตั้งค่าทศนิยมมีผลแค่การแสดงผล สามารถใช้สัญกรณ์วิทยาศาสตร์ได้ เช่น 11.5e-6'
          : 'Full precision is stored and calculated throughout; the decimals setting only affects display. Scientific notation is allowed, e.g. 11.5e-6.'}
      </p>
    </section>
  </div>
);

const RECIPES: Array<{ title: Bilingual; formula: string; note: Bilingual }> = [
  {
    title: { en: 'Error', th: 'ค่าความคลาดเคลื่อน' },
    formula: 'CAL_IND - CAL_NOM',
    note: { en: 'Indicated minus nominal.', th: 'ค่าที่อ่านได้ลบด้วยค่าที่กำหนด' },
  },
  {
    title: { en: 'Percent error, guarded against division by zero', th: 'ค่าคลาดเคลื่อนร้อยละ ป้องกันการหารด้วยศูนย์' },
    formula: '(CAL_IND - CAL_NOM) / CAL_NOM * 100 if CAL_NOM != 0 else 0',
    note: { en: 'The zero-nominal case is visible on the page, not hidden.', th: 'กรณี nominal เป็นศูนย์มองเห็นได้ชัดเจนบนหน้าจอ ไม่ถูกซ่อนไว้' },
  },
  {
    title: { en: 'Repeatability across three rounds', th: 'ความสามารถทำซ้ำได้ตลอดสามรอบ' },
    formula: 'MAX(M_R1, M_R2, M_R3) - MIN(M_R1, M_R2, M_R3)',
    note: { en: 'Spread between the highest and lowest of three repeats.', th: 'ผลต่างระหว่างค่าสูงสุดและต่ำสุดจากการอ่านซ้ำสามครั้ง' },
  },
  {
    title: { en: 'Mean of rounds', th: 'ค่าเฉลี่ยของรอบ' },
    formula: 'AVERAGE(M_R1, M_R2, M_R3)',
    note: { en: 'Average reading across three rounds.', th: 'ค่าเฉลี่ยของการอ่านค่าตลอดสามรอบ' },
  },
  {
    title: { en: 'Standard deviation of rounds (Type A component)', th: 'ส่วนเบี่ยงเบนมาตรฐานของรอบ (องค์ประกอบ Type A)' },
    formula: 'STDEV(M_R1, M_R2, M_R3)',
    note: { en: 'A direct Type A uncertainty contributor.', th: 'องค์ประกอบความไม่แน่นอนประเภท A โดยตรง' },
  },
  {
    title: { en: 'Pass/fail verdict', th: 'ผลตัดสิน ผ่าน/ไม่ผ่าน' },
    formula: '"PASS" if ABS(CAL_ERR) <= CAL_TOL else "FAIL"',
    note: { en: 'Compares the error size against a tolerance column.', th: 'เปรียบเทียบขนาดค่าคลาดเคลื่อนกับคอลัมน์ค่าที่ยอมรับได้' },
  },
  {
    title: { en: 'Maximum deviation across the record (summary field)', th: 'ค่าเบี่ยงเบนสูงสุดตลอดทั้งบันทึก (ช่องสรุปผล)' },
    formula: 'col_max(CAL_ERR)',
    note: { en: 'Must be written in a summary field, not a column formula.', th: 'ต้องเขียนในช่องสรุปผลเท่านั้น ไม่ใช่คอลัมน์สูตร' },
  },
  {
    title: { en: 'Combining uncertainty components', th: 'การรวมองค์ประกอบความไม่แน่นอน' },
    formula: 'RSS(U_A, U_B, U_C)',
    note: { en: 'Root-sum-square of independent contributors.', th: 'รากที่สองของผลรวมกำลังสองของแต่ละองค์ประกอบที่เป็นอิสระต่อกัน' },
  },
  {
    title: { en: 'Expanded uncertainty, explicit TINV pattern', th: 'ความไม่แน่นอนขยาย รูปแบบ TINV แบบเปิดเผย' },
    formula: 'RSS(U_A, U_B, U_C) * (TINV(0.05, CAL_NU) if CAL_NU >= 1 else 2)',
    note: { en: 'TINV where degrees of freedom allow it, k=2 otherwise — visibly.', th: 'ใช้ TINV เมื่อองศาอิสระเอื้ออำนวย และใช้ k=2 ในกรณีอื่น โดยเปิดเผย' },
  },
  {
    title: { en: 'A custom function reused across columns', th: 'ฟังก์ชันที่กำหนดเองใช้ซ้ำในหลายคอลัมน์' },
    formula: 'def percent_error(nominal, indicated):\n    return (indicated - nominal) / nominal * 100 if nominal != 0 else 0',
    note: {
      en: 'Fix a mistake once, in the definition, instead of hunting down every column that copied it.',
      th: 'แก้ไขข้อผิดพลาดเพียงครั้งเดียวที่จุดนิยาม แทนที่จะต้องไล่หาทุกคอลัมน์ที่คัดลอกสูตรนั้นไป',
    },
  },
];

const RecipesTab: React.FC<{ lang: HelpLanguage }> = ({ lang }) => (
  <div className="space-y-3">
    {RECIPES.map((r, i) => (
      <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">{t(r.title, lang)}</p>
        <Code className="mt-1.5">{r.formula}</Code>
        <p className="text-xs text-gray-500 mt-1.5">{t(r.note, lang)}</p>
      </div>
    ))}
  </div>
);

// ── Main modal ────────────────────────────────────────────────────────────

export const FormulaHelpModal: React.FC<FormulaHelpModalProps> = ({
  isOpen,
  onClose,
  language,
  onLanguageChange,
  initialTab = 'basics',
}) => {
  const [tab, setTab] = useState<HelpTab>(initialTab);
  const [query, setQuery] = useState('');

  // Re-open on the requested tab each time the modal opens (Task 5's "?"
  // buttons target a specific tab), without resetting the language choice.
  React.useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab]);

  const functionEntries = useMemo(
    () => Object.entries(BUILTIN_FUNCTIONS).filter(([name]) => matchesQuery(name, BUILTIN_DOCS[name], query)),
    [query],
  );
  const aggregateEntries = useMemo(
    () => COLUMN_AGGREGATES.filter((name) => matchesQuery(name, AGGREGATE_DOCS[name], query)),
    [query],
  );
  const stdEntries = useMemo(
    () => Object.entries(STD_DOCS).filter(([name, doc]) => matchesQuery(name, doc, query)),
    [query],
  );
  const reportEntries = useMemo(
    () => Object.entries(REPORT_DOCS).filter(([name, doc]) => matchesQuery(name, doc, query)),
    [query],
  );

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={language === 'th' ? 'ช่วยเหลือ: สูตรคำนวณ' : 'Formula Help'} size="xlarge">
      <div className="flex flex-col h-[75vh]">
        {/* Language toggle + tabs */}
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex gap-1">
            {(Object.keys(TAB_LABELS) as HelpTab[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === key ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t(TAB_LABELS[key], language)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {(tab === 'functions' || tab === 'variables') && (
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={language === 'th' ? 'ค้นหา…' : 'Search…'}
                className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm w-40"
              />
            )}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
              <button
                type="button"
                onClick={() => onLanguageChange('en')}
                className={`px-2.5 py-1 text-xs font-medium ${language === 'en' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => onLanguageChange('th')}
                className={`px-2.5 py-1 text-xs font-medium ${language === 'th' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                ไทย
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pt-4 pr-1">
          {tab === 'basics' && <BasicsTab lang={language} />}

          {tab === 'functions' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  {language === 'th' ? 'ฟังก์ชันทั่วไป' : 'General functions'}
                </h3>
                <div className="space-y-2">
                  {functionEntries.map(([name, fn]) => (
                    <FunctionEntry key={name} name={name} doc={BUILTIN_DOCS[name]} arity={describeArity(fn)} lang={language} />
                  ))}
                  {functionEntries.length === 0 && (
                    <p className="text-xs text-gray-400">{language === 'th' ? 'ไม่พบผลลัพธ์' : 'No matches'}</p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  {language === 'th' ? 'ฟังก์ชันรวมคอลัมน์ (เฉพาะช่องสรุปผล)' : 'Column aggregates (summary fields only)'}
                </h3>
                <div className="space-y-2">
                  {aggregateEntries.map((name) => (
                    <FunctionEntry key={name} name={name} doc={AGGREGATE_DOCS[name]} lang={language} />
                  ))}
                  {aggregateEntries.length === 0 && (
                    <p className="text-xs text-gray-400">{language === 'th' ? 'ไม่พบผลลัพธ์' : 'No matches'}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'variables' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  {language === 'th' ? 'มาตรฐานอ้างอิง (ต่อแถว)' : 'Reference standard (per-row)'}
                </h3>
                <div className="space-y-2">
                  {stdEntries.map(([name, doc]) => (
                    <VariableEntry key={name} name={name} doc={doc} lang={language} />
                  ))}
                  {stdEntries.length === 0 && (
                    <p className="text-xs text-gray-400">{language === 'th' ? 'ไม่พบผลลัพธ์' : 'No matches'}</p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  {language === 'th' ? 'การรายงานผล (ต่อบันทึก)' : 'Reporting (per-record)'}
                </h3>
                <div className="space-y-2">
                  {reportEntries.map(([name, doc]) => (
                    <VariableEntry key={name} name={name} doc={doc} lang={language} />
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  {language === 'th' ? 'สภาพแวดล้อม (ต่อบันทึก, ต่อรอบ)' : 'Environment (per-record, per round)'}
                </h3>
                <div className="space-y-2">
                  {ENV_PATTERN_DOCS.map((doc) => (
                    <div key={doc.pattern} className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-baseline gap-2">
                        <code className="font-mono text-sm font-semibold text-primary-700">{doc.pattern}</code>
                        {doc.unit && <span className="text-[10px] text-gray-400">{doc.unit}</span>}
                      </div>
                      <p className="text-sm text-gray-700 mt-1.5">{t(doc.summary, language)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'recipes' && <RecipesTab lang={language} />}
        </div>
      </div>
    </Modal>
  );
};

export default FormulaHelpModal;
