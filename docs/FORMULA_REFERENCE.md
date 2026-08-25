# สูตรคำนวณ: คู่มืออ้างอิง / Formula Reference

*A reference for writing formulas in this system, written for someone who
calibrates instruments, not someone who writes software. This document does
not decide anything — [`FORMULA_GRAMMAR.md`](FORMULA_GRAMMAR.md) is the
specification. If anything here ever disagrees with that document or with
the running software, the software is right and this page needs fixing.*

*คู่มืออ้างอิงสำหรับการเขียนสูตรในระบบนี้ เขียนขึ้นสำหรับผู้ที่ทำงานสอบเทียบเครื่องมือ
ไม่ใช่ผู้ที่เขียนโปรแกรม เอกสารนี้ไม่ใช่ข้อกำหนดที่ตัดสินใจเอง — [`FORMULA_GRAMMAR.md`](FORMULA_GRAMMAR.md)
คือข้อกำหนดที่แท้จริง หากเนื้อหาในหน้านี้ขัดแย้งกับเอกสารนั้นหรือกับซอฟต์แวร์ที่ใช้งานจริงเมื่อใด
ให้ถือว่าซอฟต์แวร์ถูกต้อง และต้องแก้ไขหน้านี้*

There is also a **Help** button inside the template builder, next to the
formula fields, showing this same content without leaving the page.

นอกจากนี้ยังมีปุ่ม **Help** อยู่ในหน้าสร้างเทมเพลต ข้างช่องกรอกสูตร ซึ่งแสดงเนื้อหาเดียวกันนี้
โดยไม่ต้องออกจากหน้าจอ

---

## Part 1 — Basic usage / การใช้งานพื้นฐาน

### What a formula is / สูตรคืออะไร

A formula is a single calculation. You type it once, in a formula column or
a summary field, and it runs automatically.

สูตรคือการคำนวณหนึ่งรายการ คุณพิมพ์เพียงครั้งเดียวในคอลัมน์สูตร (formula column)
หรือช่องสรุปผล (summary field) แล้วระบบจะคำนวณให้อัตโนมัติ

There are exactly **two places** you type a formula:

มีเพียง **สองที่** เท่านั้นที่คุณสามารถพิมพ์สูตรได้:

| | English | ภาษาไทย |
|---|---|---|
| **Column formula** | Runs **once per row** — once per calibration point. Sees the other columns of that same row and the record's environment values. | คำนวณ **ครั้งเดียวต่อหนึ่งแถว** — ครั้งเดียวต่อจุดสอบเทียบหนึ่งจุด มองเห็นคอลัมน์อื่นในแถวเดียวกัน และค่าสภาพแวดล้อม (environment) ของบันทึกนั้น |
| **Summary field** | Runs **once per record**, after every row is filled in. Sees environment values, other summary fields, and can aggregate a whole column at once. | คำนวณ **ครั้งเดียวต่อหนึ่งบันทึก** หลังจากกรอกทุกแถวครบแล้ว มองเห็นค่าสภาพแวดล้อม ช่องสรุปผลอื่น และสามารถรวมค่าทั้งคอลัมน์ได้ในครั้งเดียว |

A column formula can never see a summary field — a summary field depends on
every row, so the reverse would be circular and could never resolve.

คอลัมน์สูตรจะมองไม่เห็นช่องสรุปผลได้เลย — เพราะช่องสรุปผลขึ้นอยู่กับทุกแถว
หากให้มองย้อนกลับได้จะกลายเป็นการอ้างอิงวนซ้ำที่ไม่มีวันคำนวณจบ

### Referring to a column / การอ้างอิงถึงคอลัมน์

A column is written `SECTIONID_COLUMNID` — the Section ID and Column ID you
typed when building the template, joined with an underscore. For example, a
section with ID `CAL` containing a column with ID `IND` is written `CAL_IND`
in a formula.

คอลัมน์เขียนในรูปแบบ `SECTIONID_COLUMNID` — คือรหัสหมวด (Section ID) และรหัสคอลัมน์
(Column ID) ที่คุณพิมพ์ไว้ตอนสร้างเทมเพลต นำมาต่อกันด้วยขีดล่าง (underscore) เช่น
หมวดที่มีรหัส `CAL` ซึ่งมีคอลัมน์รหัส `IND` จะเขียนในสูตรว่า `CAL_IND`

Both IDs are the short, uppercase codes you enter in the template builder —
**Section ID** at the top of each section, **Column ID** at the top of each
column — not the display labels shown on screen.

รหัสทั้งสองคือรหัสสั้นตัวพิมพ์ใหญ่ที่คุณกรอกไว้ในหน้าสร้างเทมเพลต — **Section ID**
อยู่ด้านบนของแต่ละหมวด และ **Column ID** อยู่ด้านบนของแต่ละคอลัมน์ — ไม่ใช่ป้ายชื่อ
ที่แสดงบนหน้าจอ (display label)

### Environment values / ค่าสภาพแวดล้อม

`ENV_TEMP_R1`, `ENV_RH_R1`, `ENV_TEMP_R2`, `ENV_RH_R2`, … — one temperature
and one humidity reading per round, numbered `R1`, `R2` and so on up to the
template's round count. The same value is used by every row within that
round (it is not per-row).

`ENV_TEMP_R1`, `ENV_RH_R1`, `ENV_TEMP_R2`, `ENV_RH_R2` ฯลฯ — คือค่าอุณหภูมิและ
ความชื้นหนึ่งค่าต่อหนึ่งรอบ กำหนดหมายเลขเป็น `R1`, `R2` ไปเรื่อยๆ จนถึงจำนวนรอบของ
เทมเพลตนั้น ค่าเดียวกันนี้จะถูกใช้ร่วมกันในทุกแถวภายในรอบนั้น (ไม่ใช่ค่าเฉพาะต่อแถว)

### Referring to other summary fields / การอ้างอิงถึงช่องสรุปผลอื่น

`SUMMARY_<id>` — the field ID you gave a summary field, prefixed with
`SUMMARY_`. Valid **only inside another summary field**, never in a column
formula.

`SUMMARY_<id>` — คือรหัสของช่องสรุปผลที่คุณตั้งไว้ นำหน้าด้วย `SUMMARY_` ใช้ได้
**เฉพาะภายในช่องสรุปผลอื่นเท่านั้น** ห้ามใช้ในคอลัมน์สูตร

### Reference-standard values / ค่าจากมาตรฐานอ้างอิง

This is the section the owner went looking for and did not find — it did
not exist until this phase.

นี่คือส่วนที่เจ้าของระบบพยายามค้นหาแต่ไม่พบ — เพราะยังไม่เคยมีอยู่ก่อนเฟสนี้

**The scope rule, stated plainly:** `STD_*` values come from the reference
standard chosen **in that row's own `standard` column** — two rows using
different standards get different `STD_C1`, different `STD_TO_N`, and so on.
`REPORT_TO_N` is different: it is **record-scoped**, one value for the whole
record, the same in every row.

**กฎเรื่องขอบเขต (scope) พูดให้ชัดเจน:** ค่า `STD_*` มาจากมาตรฐานอ้างอิงที่เลือกไว้
**ในคอลัมน์ standard ของแถวนั้นเอง** — สองแถวที่เลือกใช้มาตรฐานต่างกัน จะได้ `STD_C1`,
`STD_TO_N` ฯลฯ ที่ต่างกันไปด้วย ส่วน `REPORT_TO_N` ต่างออกไป: เป็นค่าที่ผูกกับ
**ทั้งบันทึก (record-scoped)** คือมีค่าเดียวใช้ร่วมกันทุกแถว

| Variable | Meaning | Unit | Scope |
|---|---|---|---|
| `STD_C0` | Constant term of the calibration polynomial | — | row |
| `STD_C1` | Coefficient multiplying R (the standard's raw reading) | — | row |
| `STD_C2` | Coefficient multiplying R² | — | row |
| `STD_C3` | Coefficient multiplying R³ | — | row |
| `STD_C4` | Coefficient multiplying R⁴ | — | row |
| `STD_C5` | Coefficient multiplying R⁵ | — | row |
| `STD_TO_N` | Factor converting the standard's own output unit to newtons | newtons/unit | row |
| `STD_UCAL` | The standard's own calibration uncertainty | % | row |
| `STD_UA` | Uncertainty contributor A (from LCDB) | % | row |
| `STD_UB` | Uncertainty contributor B (from LCDB) | % | row |
| `STD_UC` | Uncertainty contributor C (from LCDB) | % | row |
| `STD_RESOLUTION` | The standard's own readout resolution | — | row |
| `REPORT_TO_N` | Factor converting THIS record's reporting unit to newtons | newtons/unit | record |

**The coefficient slots, in full.** `STD_C0` is the constant term (it stands
alone, multiplying nothing). `STD_C1` multiplies `R` itself. `STD_C2`
multiplies `R²`. And so on up to `STD_C5`. The full worked form for a cubic
calibration polynomial:

**ช่องสัมประสิทธิ์ ในแบบเต็ม** `STD_C0` คือพจน์คงที่ (ไม่คูณกับอะไรเลย) `STD_C1`
คูณกับ `R` เอง `STD_C2` คูณกับ `R²` ไปเรื่อยๆ จนถึง `STD_C5` รูปแบบเต็มของสมการ
พหุนามกำลังสามสำหรับการสอบเทียบ:

```
STD_C1*R + STD_C2*R**2 + STD_C3*R**3
```

**One deliberate exception to "empty is an error":** a coefficient slot
beyond the standard's stored polynomial degree resolves to `0`, not
`awaiting-input`. A polynomial's absent higher terms genuinely ARE zero — a
degree-2 standard leaves `STD_C3`, `STD_C4`, `STD_C5` at `0` automatically,
so one formula written for the highest degree you might ever need still
works unchanged for a lower-degree standard.

**ข้อยกเว้นเดียวที่ตั้งใจไว้จากกฎ "ค่าว่างคือข้อผิดพลาด":** ช่องสัมประสิทธิ์ที่เกินระดับขั้น
(degree) ของพหุนามที่มาตรฐานนั้นบันทึกไว้ จะมีค่าเป็น `0` ไม่ใช่ `awaiting-input`
เพราะพจน์ระดับสูงที่ไม่มีอยู่จริงของพหุนามคือศูนย์จริงๆ — มาตรฐานระดับขั้น 2 จะทำให้
`STD_C3`, `STD_C4`, `STD_C5` เป็น `0` โดยอัตโนมัติ ทำให้สูตรที่เขียนไว้สำหรับระดับขั้นสูงสุด
ที่อาจใช้ ยังคงใช้ได้กับมาตรฐานระดับขั้นต่ำกว่าโดยไม่ต้องแก้ไข

**Why both `STD_TO_N` and `REPORT_TO_N` exist.** The standard reads out in
**one** unit — whatever it was calibrated in (kN, kgF, …). The certificate
reports in **another** unit — whatever this record's reporting unit is set
to. These are frequently different, and the same transducer may be used on
one job reporting in newtons and another reporting in kilonewtons. The full
conversion pattern, written out end to end:

**เหตุผลที่มีทั้ง `STD_TO_N` และ `REPORT_TO_N`** มาตรฐานให้ผลอ่านเป็น **หนึ่ง** หน่วย
(แล้วแต่ว่าถูกสอบเทียบไว้ในหน่วยใด เช่น kN, kgF ฯลฯ) แต่ใบรับรองรายงานผลเป็น **อีก**
หน่วยหนึ่ง (แล้วแต่หน่วยการรายงานที่ตั้งไว้ในบันทึกนั้น) สองหน่วยนี้มักไม่เหมือนกัน และ
ทรานสดิวเซอร์ตัวเดียวกันอาจถูกใช้ในงานหนึ่งที่รายงานผลเป็นนิวตัน และอีกงานหนึ่งที่รายงาน
เป็นกิโลนิวตันก็ได้ รูปแบบการแปลงหน่วยแบบเต็ม เขียนไว้ครบทุกขั้นตอน:

```
force_in_report_unit = polynomial(R) * STD_TO_N / REPORT_TO_N
```

**A real worked number**, from the reference standard `CAL-FRC-001`'s actual
NIMT calibration certificate coefficients (A = 25.001904548237,
B = −0.039616880251316, C = 0.075709296790966, both units are newtons so
`STD_TO_N` and `REPORT_TO_N` are both `1`):

**ตัวอย่างตัวเลขจริง** จากสัมประสิทธิ์ใบรับรองการสอบเทียบ NIMT จริงของมาตรฐานอ้างอิง
`CAL-FRC-001` (A = 25.001904548237, B = −0.039616880251316, C = 0.075709296790966
ทั้งสองหน่วยเป็นนิวตัน ดังนั้น `STD_TO_N` และ `REPORT_TO_N` จึงเท่ากับ `1` ทั้งคู่):

```
At R = 0.04:
STD_C1*R + STD_C2*R**2 + STD_C3*R**3
= 25.001904548237*0.04 + (-0.039616880251316)*0.04**2 + 0.075709296790966*0.04**3
= 1.00002   (nominal 1 N)
```

This is the same arithmetic ADR-013 documents as proof that the CUBIC form
(not the workbook's defective linear-third-term form) reproduces the
standard's own nominal calibration points.

การคำนวณนี้เป็นชุดเดียวกับที่ ADR-013 บันทึกไว้เป็นหลักฐานว่า รูปแบบ "กำลังสาม"
(ไม่ใช่รูปแบบที่มีข้อบกพร่องแบบ "เชิงเส้นในพจน์ที่สาม" ของสเปรดชีตเดิม) ให้ผลลัพธ์
ตรงกับจุดสอบเทียบตามค่าที่ระบุ (nominal) ของมาตรฐานเอง

**`STD_RESOLUTION`** is only populated if someone entered a resolution value
on the standard's Conversion Equation. If nobody has, `STD_RESOLUTION`
correctly reads `awaiting-input` — that is expected, not a bug, and the fix
is to fill in the field on the equipment's Conversion Equation, not to
change the formula.

**`STD_RESOLUTION`** จะมีค่าก็ต่อเมื่อมีผู้กรอกค่าความละเอียดไว้ในสมการแปลงหน่วย
(Conversion Equation) ของมาตรฐานนั้น หากยังไม่มีผู้กรอก `STD_RESOLUTION` จะแสดงผล
เป็น `awaiting-input` ซึ่งถูกต้องแล้ว ไม่ใช่ข้อผิดพลาด วิธีแก้คือไปกรอกค่าความละเอียดที่
สมการแปลงหน่วยของอุปกรณ์นั้น ไม่ใช่แก้ที่สูตร

### A formula cannot reference its own column / สูตรไม่สามารถอ้างอิงถึงคอลัมน์ของตัวเองได้

A formula column's expression can use any OTHER column, but never the
column it is itself computing — that is a circular definition with no
answer. If you do this, **Verify reports a dependency loop.** The fix is
almost always that you need a separate INPUT column for the raw value, and
the formula column should reference that input column instead of itself.

นิพจน์ของคอลัมน์สูตรสามารถใช้คอลัมน์ *อื่น* ได้ แต่ห้ามใช้คอลัมน์ที่ตัวมันเองกำลังคำนวณ
อยู่ — เพราะเป็นการอ้างอิงวนกลับที่ไม่มีคำตอบ หากทำเช่นนี้ **ปุ่ม Verify จะรายงานว่าพบ
การอ้างอิงวนซ้ำ (dependency loop)** วิธีแก้ในเกือบทุกกรณีคือ คุณต้องการคอลัมน์
สำหรับ "กรอกข้อมูลดิบ" แยกต่างหาก แล้วให้คอลัมน์สูตรอ้างอิงไปยังคอลัมน์กรอกข้อมูลนั้น
แทนที่จะอ้างอิงตัวเอง

### Custom functions / ฟังก์ชันที่กำหนดเอง

```python
def percent_error(nominal, indicated):
    return (indicated - nominal) / nominal * 100
```

**A function's only inputs are its parameters.** A function body cannot
reach out to columns, `ENV_*`, `STD_*`, `REPORT_*` or `SUMMARY_*` directly —
everything it needs must be passed in as an argument. This makes every
custom function independently testable and safe to use from both a column
formula and a summary field without change.

**อินพุตเดียวของฟังก์ชันคือพารามิเตอร์ของมันเอง** เนื้อหาภายในฟังก์ชันจะเอื้อมไปอ้างอิง
คอลัมน์, `ENV_*`, `STD_*`, `REPORT_*` หรือ `SUMMARY_*` โดยตรงไม่ได้ — ทุกอย่างที่
ฟังก์ชันต้องการต้องถูกส่งเข้ามาเป็นอาร์กิวเมนต์เท่านั้น การทำเช่นนี้ทำให้ฟังก์ชันที่กำหนดเอง
แต่ละตัวทดสอบแยกได้อย่างอิสระ และใช้ได้ปลอดภัยทั้งในคอลัมน์สูตรและช่องสรุปผลโดยไม่
ต้องแก้ไข

A function may call other custom functions, but they must not form a loop
(function A calling B calling A, directly or indirectly) — this is rejected
at authoring time, the same as a column dependency loop.

ฟังก์ชันหนึ่งสามารถเรียกใช้ฟังก์ชันที่กำหนดเองตัวอื่นได้ แต่ต้องไม่เกิดการเรียกวนซ้ำ
(ฟังก์ชัน A เรียก B แล้ว B เรียกกลับมาที่ A ไม่ว่าทางตรงหรือทางอ้อม) — ระบบจะปฏิเสธ
ตั้งแต่ตอนเขียน เช่นเดียวกับการอ้างอิงคอลัมน์วนซ้ำ

### What is deliberately not allowed / สิ่งที่จงใจไม่อนุญาต

| Not allowed / ไม่อนุญาต | Write this instead / ให้เขียนแบบนี้แทน |
|---|---|
| Loops | Not available. Use a summary field's column aggregates (`col_mean`, `col_max`, …) for whole-column work. |
| `if` / `elif` / `else` blocks | `a if condition else b` — the one conditional form |
| Chained comparisons: `0 < x < 10` | `0 < x and x < 10` |
| Floor division `//` | `/` |
| Modulo `%` | Not available |
| Quotes inside text: `"say \"hi\""` | Reword to avoid needing a quote inside a quote |

*(Table content is English because these are literal syntax examples.)*

*(เนื้อหาในตารางเป็นภาษาอังกฤษ เพราะเป็นตัวอย่างไวยากรณ์จริงที่ต้องพิมพ์)*

### Empty cells are an error, not zero / ช่องว่างคือข้อผิดพลาด ไม่ใช่ศูนย์

An empty cell is **empty** — not zero, not blank-but-safe. Any formula that
consumes an empty value becomes `awaiting-input`, which is expected and
shown quietly while a record is still being filled in. An incomplete
column cannot be committed, and a summary aggregate (`col_mean`, `col_max`,
…) over a column with even one empty cell is an error, not a value computed
over what happened to be filled in.

ช่องว่างคือ **ค่าว่างจริงๆ** — ไม่ใช่ศูนย์ และไม่ใช่ค่าว่างที่ปลอดภัยที่จะนำไปคำนวณ สูตรใดที่
ใช้ค่าว่างจะกลายเป็น `awaiting-input` ซึ่งเป็นเรื่องปกติ และแสดงผลอย่างเงียบๆ ระหว่างที่
ยังกรอกบันทึกไม่ครบ คอลัมน์ที่ยังกรอกไม่ครบจะยืนยันบันทึก (commit) ไม่ได้ และฟังก์ชัน
สรุปผล (`col_mean`, `col_max` ฯลฯ) ที่คำนวณจากคอลัมน์ที่มีช่องว่างแม้เพียงช่องเดียว
จะถือเป็นข้อผิดพลาด ไม่ใช่ค่าที่คำนวณจากเท่าที่กรอกไว้

Why: a mean over incomplete data is metrologically meaningless, and a
certificate must never silently treat missing data as zero. Erroring makes
incompleteness impossible to overlook.

เหตุผล: ค่าเฉลี่ยที่คำนวณจากข้อมูลไม่ครบไม่มีความหมายทางมาตรวิทยา และใบรับรองต้อง
ไม่มีวันปฏิบัติต่อข้อมูลที่ขาดหายไปราวกับเป็นศูนย์โดยไม่มีการแจ้งเตือน การให้เป็น
ข้อผิดพลาดทำให้ไม่มีทางมองข้ามความไม่ครบถ้วนของข้อมูลไปได้

### Numbers and precision / ตัวเลขและความละเอียด

Every calculation is stored and performed at **full precision** — the
`decimals` setting on a number column only changes how it is *displayed*,
never what is stored or calculated. `col_mean` and every other aggregate
average the true stored values, never the rounded display values.

ทุกการคำนวณจะถูกเก็บและประมวลผลด้วย **ความละเอียดเต็มที่** — การตั้งค่า `decimals`
บนคอลัมน์ตัวเลขมีผลแค่กับ *การแสดงผล* เท่านั้น ไม่มีผลต่อค่าที่เก็บไว้หรือค่าที่นำไปคำนวณ
เลย `col_mean` และฟังก์ชันสรุปผลอื่นทุกตัวจะคำนวณจากค่าจริงที่เก็บไว้เสมอ ไม่ใช่ค่าที่ปัดเศษ
เพื่อแสดงผล

Scientific notation is allowed directly in a formula:

สามารถใช้สัญกรณ์วิทยาศาสตร์ (scientific notation) ในสูตรได้โดยตรง:

```
11.5e-6          # coefficient of thermal expansion, /°C
7.882E+21
1e-3
```

---

## Part 2 — Function reference / อ้างอิงฟังก์ชัน

Every ready-to-use function, in the same order as the whitelist in
[`FORMULA_GRAMMAR.md`](FORMULA_GRAMMAR.md) §3. This section is transcribed
from `builtinDocs.ts` — the same content the in-app Help modal generates
from directly (see Task 4). If the two ever disagree, the running software
is authoritative.

ฟังก์ชันที่พร้อมใช้งานทุกตัว เรียงตามลำดับเดียวกับรายการที่อนุญาต (whitelist) ใน
[`FORMULA_GRAMMAR.md`](FORMULA_GRAMMAR.md) §3 เนื้อหาส่วนนี้คัดลอกมาจาก `builtinDocs.ts`
ซึ่งเป็นแหล่งข้อมูลเดียวกับที่หน้าต่าง Help ในแอปใช้สร้างเนื้อหาโดยตรง หากทั้งสองที่ขัดแย้งกัน
ให้ถือว่าซอฟต์แวร์ที่ใช้งานจริงถูกต้อง

### General functions — valid in both column formulas and summary fields / ฟังก์ชันทั่วไป — ใช้ได้ทั้งในคอลัมน์สูตรและช่องสรุปผล

#### `ABS(value)`

**Arity:** 1 argument.

The absolute value — always positive, direction dropped.

ค่าสัมบูรณ์ (absolute value) — ค่าที่เป็นบวกเสมอ โดยตัดทิศทาง (เครื่องหมาย) ทิ้งไป

```
ABS(-5.2)   →  5.2
```
Useful for a deviation that could be over or under and you only care about
the size. / มีประโยชน์เมื่อค่าเบี่ยงเบนอาจเป็นบวกหรือลบก็ได้ และคุณสนใจแค่ขนาดของมัน

#### `SQRT(value)`

**Arity:** 1 argument.

The square root. A negative input is treated as an error, not a
missing/blank result.

รากที่สอง (square root) หากใส่ค่าลบจะถือเป็นข้อผิดพลาด (error) ไม่ใช่ค่าว่าง

```
SQRT(2.25)   →  1.5
```

#### `ROUND(value, decimals)`

**Arity:** exactly 2 arguments.

Rounds to a fixed number of decimal places — half-away-from-zero, matching
Excel.

ปัดเศษ (round) ให้เหลือทศนิยมตามจำนวนที่กำหนด — ปัดออกจากศูนย์เมื่อเท่ากับครึ่งพอดี
เหมือน Excel

```
ROUND(12.345, 2)   →  12.35
ROUND(2.5, 0)      →  3      (exactly half rounds AWAY from zero)
```

> ⚠ **ROUND is NOT Python's `round()`.** Python uses banker's rounding
> (half-to-even): `round(0.5)` is `0`, `round(-0.5)` is `0`. This `ROUND`
> rounds half away from zero instead, matching Excel: `ROUND(0.5, 0)` is
> `1`, `ROUND(-0.5, 0)` is `-1`. **This is deliberate**, so results
> reconcile against the lab's existing spreadsheets — not an oversight.
>
> ⚠ **ROUND ในที่นี้ไม่เหมือน `round()` ของ Python** ซึ่งใช้การปัดแบบ banker's
> rounding (ปัดเข้าหาเลขคู่): `round(0.5)` ได้ `0`, `round(-0.5)` ได้ `0` แต่
> `ROUND` ในระบบนี้ปัด "ออกจากศูนย์" เสมอเมื่อเจอค่าครึ่งพอดี เหมือน Excel:
> `ROUND(0.5, 0)` ได้ `1`, `ROUND(-0.5, 0)` ได้ `-1` **ความแตกต่างนี้ตั้งใจให้
> เป็นแบบนี้** เพื่อให้ผลลัพธ์ตรงกับสเปรดชีตเดิมของห้องปฏิบัติการ ไม่ใช่ข้อผิดพลาด

#### `TRUNC(value [, decimals])`

**Arity:** 1 to 2 arguments (decimals defaults to 0).

Cuts off digits beyond the given decimal place, toward zero — it does not
round.

ตัดทศนิยมส่วนที่เกินตำแหน่งที่กำหนด โดยตัด "เข้าหาศูนย์" — ไม่ใช่การปัดเศษ

```
TRUNC(12.789, 1)   →  12.7
TRUNC(-12.789)     →  -12    (toward zero: -12 is LARGER than -12.789)
```

#### `MAX(value1, value2, ...)`

**Arity:** 1 or more arguments.

The largest of two or more values.

ค่าที่มากที่สุดจากค่าตั้งแต่สองค่าขึ้นไป

```
MAX(1.02, 0.98, 1.05)   →  1.05
```

#### `MIN(value1, value2, ...)`

**Arity:** 1 or more arguments.

The smallest of two or more values.

ค่าที่น้อยที่สุดจากค่าตั้งแต่สองค่าขึ้นไป

```
MIN(1.02, 0.98, 1.05)   →  0.98
```

#### `AVERAGE(value1, value2, ...)`

**Arity:** 1 or more arguments.

The arithmetic mean of two or more values, within one row.

ค่าเฉลี่ยเลขคณิต (arithmetic mean) ของค่าตั้งแต่สองค่าขึ้นไป ภายในแถวเดียวกัน

```
AVERAGE(10, 10.02, 9.98)   →  10
```
For averaging a whole COLUMN across every row, in a summary field, use
`col_mean` instead. / หากต้องการหาค่าเฉลี่ยของทั้ง "คอลัมน์" ในทุกแถว ให้ใช้ `col_mean`
ในช่องสรุปผลแทน

#### `SUM(value1, value2, ...)`

**Arity:** 1 or more arguments.

The total of two or more values, within one row.

ผลรวมของค่าตั้งแต่สองค่าขึ้นไป ภายในแถวเดียวกัน

```
SUM(1.01, 0.99, 1.00)   →  3
```

#### `RSS(value1, value2, ...)`

**Arity:** 1 or more arguments.

Root-sum-square: square each value, add them, take the square root. The
standard way to combine independent uncertainty components.

รากที่สองของผลรวมกำลังสอง (root-sum-square) — ยกกำลังสองแต่ละค่า บวกกัน แล้วถอด
รากที่สอง เป็นวิธีมาตรฐานในการรวมองค์ประกอบความไม่แน่นอน (uncertainty) ที่เป็นอิสระต่อกัน

```
RSS(3, 4)   →  5      (sqrt(3² + 4²) = sqrt(25) = 5)
```
In real use the arguments are uncertainty contributors, e.g.
`RSS(U_A, U_B, U_C)`. / ในการใช้งานจริง อาร์กิวเมนต์คือองค์ประกอบความไม่แน่นอนแต่ละตัว
เช่น `RSS(U_A, U_B, U_C)`

#### `STDEV(value1, value2, ...)`

**Arity:** 1 or more arguments (needs at least 2 to produce a result).

Sample standard deviation (dividing by n−1), of two or more values within
one row.

ส่วนเบี่ยงเบนมาตรฐานของกลุ่มตัวอย่าง (sample standard deviation, หารด้วย n−1)
ของค่าตั้งแต่สองค่าขึ้นไปภายในแถวเดียวกัน

```
STDEV(10, 12, 14)   →  2
```
Needs at least 2 values — a single reading has no defined spread. /
ต้องมีอย่างน้อย 2 ค่า เพราะการอ่านค่าเดียวไม่มีการกระจายตัวที่นิยามได้

#### `TINV(alpha, degrees_of_freedom)`

**Arity:** exactly 2 arguments.

The two-tailed inverse Student-t value (coverage factor) for a given
significance level and degrees of freedom.

ค่าผกผันของการแจกแจงที (Student-t) แบบสองด้าน (two-tailed) หรือตัวประกอบครอบคลุม
(coverage factor) สำหรับระดับนัยสำคัญและองศาอิสระที่กำหนด

```
TINV(0.05, 10)   →  2.2281388519862766
```
The conventional 95%-confidence coverage factor at 10 degrees of freedom.
Matches standard statistical tables. / ตัวประกอบครอบคลุมที่ระดับความเชื่อมั่น 95%
ตามธรรมเนียม เมื่อองศาอิสระเท่ากับ 10 ตรงกับตารางสถิติมาตรฐาน

> ⚠ **TINV has NO silent fallback.** The lab's old workbook used
> `=IFERROR(TINV(...), 2)`, quietly substituting the conventional coverage
> factor `k=2` whenever degrees of freedom hit zero (a single reading with
> no repeats). That silent substitution is gone. Write it explicitly
> instead:
>
> ```
> TINV(0.05, CAL_NU) if CAL_NU >= 1 else 2
> ```
>
> so a reviewer can see exactly when `k=2` was used and why, instead of it
> being hidden inside the formula.
>
> ⚠ **TINV ไม่มีการ "สำรอง" ค่าอัตโนมัติแบบเงียบๆ อีกต่อไป** สเปรดชีตเดิมของ
> ห้องปฏิบัติการเคยใช้ `=IFERROR(TINV(...), 2)` ซึ่งจะแทนที่ด้วยตัวประกอบครอบคลุม
> ตามธรรมเนียม `k=2` โดยอัตโนมัติเมื่อองศาอิสระเป็นศูนย์ (มีการอ่านค่าเดียวไม่มีการทำซ้ำ)
> พฤติกรรมที่ซ่อนอยู่แบบนั้นถูกตัดออกแล้ว ต้องเขียนเงื่อนไขให้เห็นชัดเจนแทน:
>
> ```
> TINV(0.05, CAL_NU) if CAL_NU >= 1 else 2
> ```
>
> เพื่อให้ผู้ตรวจสอบเห็นชัดว่า `k=2` ถูกใช้เมื่อใดและเพราะเหตุใด แทนที่จะซ่อนอยู่ภายในสูตร

**`IF(cond, a, b)` is deliberately not available.** The ternary
(`a if cond else b`) is the one conditional form.

**`IF(cond, a, b)` จงใจไม่มีให้ใช้** รูปแบบเงื่อนไขแบบเดียวที่มีคือ ternary
(`a if cond else b`)

### Column aggregates — summary fields ONLY / ฟังก์ชันรวมคอลัมน์ — ใช้ได้เฉพาะในช่องสรุปผลเท่านั้น

> ⚠ **Every one of these is summary-only, and its argument must be a bare
> column name — never an expression.** `col_mean(CAL_IND)` is valid;
> `col_mean(CAL_IND * 2)` is not. If you need to aggregate a calculation,
> write a helper formula column first, then aggregate that.
>
> ⚠ **ฟังก์ชันเหล่านี้ทุกตัวใช้ได้เฉพาะในช่องสรุปผลเท่านั้น และอาร์กิวเมนต์ต้องเป็นชื่อ
> คอลัมน์เปล่าๆ — ห้ามเป็นนิพจน์เด็ดขาด** `col_mean(CAL_IND)` ใช้ได้ แต่
> `col_mean(CAL_IND * 2)` ใช้ไม่ได้ หากต้องการรวมผลจากการคำนวณ ให้สร้างคอลัมน์สูตรช่วย
> คำนวณค่านั้นก่อน แล้วค่อยนำคอลัมน์นั้นไปรวมผล

#### `col_mean(COLUMN)`

The mean of one column across every row of the record.

ค่าเฉลี่ยของคอลัมน์หนึ่งในทุกแถวของบันทึกนี้

```
col_mean(CAL_IND)
```

#### `col_max(COLUMN)`

The largest value in one column across every row of the record.

ค่าที่มากที่สุดในคอลัมน์หนึ่ง จากทุกแถวของบันทึกนี้

```
col_max(CAL_ERR)
```
A common use: the maximum deviation across the whole record, for a
certificate summary. / การใช้งานทั่วไปคือ ค่าเบี่ยงเบนสูงสุดตลอดทั้งบันทึก
สำหรับสรุปผลบนใบรับรอง

#### `col_min(COLUMN)`

The smallest value in one column across every row of the record.

ค่าที่น้อยที่สุดในคอลัมน์หนึ่ง จากทุกแถวของบันทึกนี้

```
col_min(CAL_ERR)
```

#### `col_sum(COLUMN)`

The total of one column across every row of the record.

ผลรวมของคอลัมน์หนึ่งจากทุกแถวของบันทึกนี้

```
col_sum(CAL_ERR)
```

#### `col_count(COLUMN)`

How many rows this column has values in. Like every aggregate, it errors if
any row is still empty rather than silently counting only the filled ones.

จำนวนแถวที่คอลัมน์นี้มีค่าอยู่ เช่นเดียวกับฟังก์ชันรวมทุกตัว จะเกิดข้อผิดพลาดหากยังมี
แถวใดว่างอยู่ แทนที่จะนับเฉพาะแถวที่กรอกแล้วแบบเงียบๆ

```
col_count(CAL_IND)
```

#### `col_stdev(COLUMN)`

Sample standard deviation (n−1) of one column across every row of the
record. Needs at least 2 rows.

ส่วนเบี่ยงเบนมาตรฐานของกลุ่มตัวอย่าง (หารด้วย n−1) ของคอลัมน์หนึ่งจากทุกแถวของบันทึกนี้
ต้องมีอย่างน้อย 2 แถว

```
col_stdev(CAL_IND)
```
A common Type A uncertainty component: the spread of repeated readings. /
เป็นองค์ประกอบความไม่แน่นอนประเภท A (Type A) ที่พบบ่อย คือการกระจายตัวของค่าที่อ่านซ้ำ
หลายครั้ง

---

## Part 3 — Ready-to-use recipes / สูตรสำเร็จรูปพร้อมใช้งาน

Copy-paste formulas for real calibration work. Section and column IDs
(`CAL_IND`, `M_R1`, …) are examples — use your own template's actual IDs.

สูตรที่คัดลอกไปใช้ได้ทันทีสำหรับงานสอบเทียบจริง รหัสหมวดและรหัสคอลัมน์ (`CAL_IND`,
`M_R1` ฯลฯ) เป็นเพียงตัวอย่าง — ให้ใช้รหัสจริงของเทมเพลตของคุณเอง

### 1. Error / ค่าความคลาดเคลื่อน

```
CAL_IND - CAL_NOM
```
Indicated value minus nominal value — the most basic calibration result. /
ค่าที่อ่านได้ลบด้วยค่าที่กำหนด (nominal) — ผลการสอบเทียบพื้นฐานที่สุด

### 2. Percent error, guarded against division by zero / ค่าคลาดเคลื่อนร้อยละ ป้องกันการหารด้วยศูนย์

```
(CAL_IND - CAL_NOM) / CAL_NOM * 100 if CAL_NOM != 0 else 0
```
A nominal of exactly zero would otherwise divide by zero. Written as a
ternary so the zero-nominal case is visible on the page, not hidden. /
หาก CAL_NOM เป็นศูนย์พอดี จะทำให้เกิดการหารด้วยศูนย์ เขียนเป็นเงื่อนไข ternary เพื่อให้
กรณีที่ nominal เป็นศูนย์มองเห็นได้ชัดเจนบนหน้าจอ ไม่ถูกซ่อนไว้

### 3. Repeatability across three rounds / ความสามารถทำซ้ำได้ตลอดสามรอบ

```
MAX(M_R1, M_R2, M_R3) - MIN(M_R1, M_R2, M_R3)
```
The spread between the highest and lowest of three repeated readings. /
ผลต่างระหว่างค่าสูงสุดและต่ำสุดจากการอ่านค่าซ้ำสามครั้ง

### 4. Mean of rounds / ค่าเฉลี่ยของรอบ

```
AVERAGE(M_R1, M_R2, M_R3)
```
The average reading across the three rounds of one row. / ค่าเฉลี่ยของการอ่านค่า
ตลอดสามรอบในแถวเดียวกัน

### 5. Standard deviation of rounds, as a Type A uncertainty component / ส่วนเบี่ยงเบนมาตรฐานของรอบ ในฐานะองค์ประกอบความไม่แน่นอนประเภท A

```
STDEV(M_R1, M_R2, M_R3)
```
The spread of the three repeated readings — a direct Type A contributor to
the uncertainty budget. / การกระจายตัวของการอ่านค่าซ้ำสามครั้ง — เป็นองค์ประกอบ
ประเภท A โดยตรงในงบประมาณความไม่แน่นอน (uncertainty budget)

### 6. Pass/fail verdict / ผลตัดสิน ผ่าน/ไม่ผ่าน

```
"PASS" if ABS(CAL_ERR) <= CAL_TOL else "FAIL"
```
Compares the size of the error (regardless of direction) against a
tolerance column. / เปรียบเทียบขนาดของค่าคลาดเคลื่อน (โดยไม่สนทิศทาง) กับคอลัมน์
ค่าความคลาดเคลื่อนที่ยอมรับได้ (tolerance)

### 7. Maximum deviation across the whole record (summary field) / ค่าเบี่ยงเบนสูงสุดตลอดทั้งบันทึก (ช่องสรุปผล)

```
col_max(CAL_ERR)
```
The single largest `CAL_ERR` from any row — a common certificate summary
value. Must be written in a summary field, not a column formula. / ค่า
`CAL_ERR` ที่มากที่สุดจากทุกแถว — เป็นค่าสรุปที่พบบ่อยบนใบรับรอง ต้องเขียนในช่องสรุปผล
เท่านั้น ไม่ใช่คอลัมน์สูตร

### 8. Combining uncertainty components / การรวมองค์ประกอบความไม่แน่นอน

```
RSS(U_A, U_B, U_C)
```
Root-sum-square combination of three independent uncertainty contributors
into one combined standard uncertainty. / การรวมองค์ประกอบความไม่แน่นอนที่เป็น
อิสระต่อกันสามตัว ด้วยวิธีรากที่สองของผลรวมกำลังสอง ให้เป็นค่าความไม่แน่นอนมาตรฐาน
รวมค่าเดียว

### 9. Expanded uncertainty, using the explicit TINV pattern / ความไม่แน่นอนขยาย โดยใช้รูปแบบ TINV แบบเปิดเผย

```
RSS(U_A, U_B, U_C) * (TINV(0.05, CAL_NU) if CAL_NU >= 1 else 2)
```
Combined standard uncertainty multiplied by the coverage factor — using
TINV where degrees of freedom allow it, and the conventional `k=2`
otherwise, VISIBLY. / ความไม่แน่นอนมาตรฐานรวม คูณด้วยตัวประกอบครอบคลุม — ใช้ TINV
เมื่อองศาอิสระเอื้ออำนวย และใช้ `k=2` ตามธรรมเนียมในกรณีอื่น โดยเปิดเผยให้เห็นชัดเจน

### 10. A custom function reused across columns / ฟังก์ชันที่กำหนดเองใช้ซ้ำในหลายคอลัมน์

```python
def percent_error(nominal, indicated):
    return (indicated - nominal) / nominal * 100 if nominal != 0 else 0
```
Then in any column or summary field: `percent_error(CAL_NOM, CAL_IND)`,
`percent_error(M_NOM, M_IND)`, and so on.

A named function beats repeating the same arithmetic in four places: fix a
mistake once, in the definition, instead of hunting down every column that
copied it — and the definition is a single readable statement of what
"percent error" means in this lab, instead of an implicit convention
scattered across the template.

จากนั้นในคอลัมน์หรือช่องสรุปผลใดก็ได้: `percent_error(CAL_NOM, CAL_IND)`,
`percent_error(M_NOM, M_IND)` และอื่นๆ

ฟังก์ชันที่มีชื่อเรียกดีกว่าการเขียนสูตรคำนวณเดิมซ้ำในสี่ที่: แก้ไขข้อผิดพลาดเพียงครั้งเดียว
ที่จุดนิยาม แทนที่จะต้องไล่หาทุกคอลัมน์ที่คัดลอกสูตรนั้นไป และตัวนิยามฟังก์ชันเองก็เป็น
ข้อความที่อ่านเข้าใจได้ชัดเจนเพียงจุดเดียวว่า "ค่าคลาดเคลื่อนร้อยละ" ของห้องปฏิบัติการนี้
หมายถึงอะไร แทนที่จะเป็นข้อตกลงโดยนัยที่กระจัดกระจายอยู่ทั่วเทมเพลต
