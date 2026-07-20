# STAGE D FORMULA SPEC — Relative Error & Uncertainty Budget (force-iso7500-1)

Provenance: extracted programmatically from `Demo_File.xlsx` (Save-As of
`Demo File.xlsb`), job SCS-CAL-26024, on 2026-07-19. Formula text was read from the
workbook cells verbatim (openpyxl, formula pass); expected values in the companion
`STAGE_D_GOLDEN_DATA.json` are the workbook's cached calculated values (value pass).
The 1st- and 2nd-direction sheets were diffed cell-by-cell: **formula structure is
identical** (one whitespace-only difference), so one implementation covers both
directions. The demo workbook contains measurement data for the **Tension**
direction only; Compression sheets hold the zero row and the compressive CMC
criteria but no readings.

This file is the authoritative reference for implementing
`src/modules/data-recorder/analysis/relativeError.ts` and
`uncertaintyBudget.ts`. Implement the workbook's math EXACTLY as written here,
except where a Decision (§7) says otherwise. Never silently "correct" a formula.

Notation: `A15`-style coordinates are the workbook's; `n` = a cal-point row.
Header parameters: `res` = UUC resolution (F7), `dp` = decimal places (H7),
`uucUnit` (F6), `stdUnit` (K8), direction (F9), standard key (K2).

---

## 1. Force conversion (Raw Data sheets, cols D/G/J/M)

Excel (D22, representative):
```
=IF(C22="","",ROUND(((($O$12*C22)+($O$13*C22^2)+($O$14*C22))/$O$15),5))
```
Plain math, with `x` = STD signal (mV/V), `c1..c3` = LCDB "Convert D-F Degree 1..3",
`div` = divisor:

    force = ROUND( (c1·x + c2·x² + c3·x) / div , 5)

- Coefficients come from LCDB via `INDEX/MATCH` on the standard key (K2).
- Divisor (O15): 1 if uucUnit == stdUnit; 10⁻³ if `N→kN` **and also 10⁻³ if
  `kN→N`** (both cross cases map to 10^-3 in the formula — only the N/kN pair
  exists in this workbook, and for this job uucUnit=N, stdUnit=kN, div=0.001).
- **[QUIRK Q1] The third term is `c3·x`, NOT `c3·x³`.** The LCDB column is named
  "Degree 3" but the formula applies it linearly. This is numerically material:
  for the first tension point, the workbook force 4002.53912 N reproduces only
  with the linear term (the cubic version gives ≈4002.98 N). Every downstream
  golden value embeds Q1. Consequence for the app: `conversionEquationService`
  presumably evaluates a true polynomial, so app-computed forces will NOT match
  workbook forces unless a decision is made (see D1).
- Zero row (row 21) in Relative Error pulls via `OFFSET(D21,0,-2)` = the UUC
  column; all zero-row values are 0 in the demo, so this quirk has no numeric
  effect here, but note the reference is to the UUC reading at zero, not the
  computed force.

## 2. Relative Error sheet — per cal point n (rows 15=zero, 16..24=points)

| Col | Meaning | Excel (row 16 form) | Plain math |
|---|---|---|---|
| A | Cal. Point (nominal, uucUnit) | input | F_nom |
| B,C,D | Fi1..Fi3 = STD-Force incr. 1..3 | `='Raw Data'!D22` etc. | from §1 |
| E | F'i3 = STD-Force decreasing | `='Raw Data'!M22` | `"-"` when series absent |
| F | F_avg | `=ROUND(AVERAGE(B:D), $H$7)` | mean of Fi1..Fi3, **rounded to dp** |
| G,H,I | q1..q3 (%) | `=(($A16-B16)/B16)*100` | qk = (F_nom − Fik)/Fik × 100 |
| J | q_avg (%) | `=AVERAGE(G:I)` | mean of q1..q3 (NOT rounded) |
| K | b (%) | `=MAX(G16)-MIN(I16)` | **[QUIRK Q2] = q1 − q3.** `MAX`/`MIN` of single cells are the cells themselves; this is NOT max−min over {q1,q2,q3}. |
| L | f0 (%) | `=(MAX($B$15:$E$15)/$A16)*100` | **[QUIRK Q3]** max of the ZERO-row forces Fi1..F'i3, divided by this row's F_nom. Zero-row forces are 0 in the demo → f0 = 0 everywhere. |
| M | v (%) | `=((D16-E16)/F16)*100` | (Fi3 − F'i3)/F_avg × 100; `"-"` when no decreasing series |
| N | a (%) | `=($F$7/A16)*100` | res / F_nom × 100 |
| O | Class of Machine | `=U16` | overall per-point class |
| P..T | per-parameter class | nested-IF lookup | smallest class row whose limit ≥ ABS(value); `"N/A"` beyond class 3; `"-"` propagates from v |
| U | Max | `=MAX(P16:T16)` | worst (largest) class among P..T |

All errors are computed from UNROUNDED Fi values (only F_avg is rounded; q uses
raw B/C/D). `IFERROR(...,0)` wraps G..I, L, N — division by zero (the zero row)
yields 0, not an error.

### Class limit table (rows 40–43; Ref. ISO 7500-1:2018 printed in the sheet)

| Class | q | b | v | f0 | a |
|---|---|---|---|---|---|
| 0.5 | 0.5 | 0.5 | 0.75 | 0.05 | 0.25 |
| 1 | 1 | 1 | 1.5 | 0.1 | 0.5 |
| 2 | 2 | 2 | 3 | 0.2 | 1 |
| 3 | 3 | 3 | 4.5 | 0.3 | 1.5 |

## 3. Uncertainty Budget sheet — per cal point (rows 15..23 map to Relative
Error rows 16..24; the zero point has no budget row)

| Col | Meaning | Excel (row 15 form) | Plain math |
|---|---|---|---|
| B | S.D. | `=STDEV.S('Relative Error'!G16:I16)` | sample std-dev of q1..q3 (%) |
| C | u_rep | `=B15/SQRT(2)` | S.D./√(n−1), n=3 |
| D | a_F | `='Relative Error'!L16` | **[QUIRK Q4]** pulls the f0 column (L), not resolution (N) |
| E | a_Z | `='Relative Error'!$L$15` | f0 at the zero row (fixed ref) |
| F | u_res | `=SQRT(SUMSQ(D15/(2*SQRT(3)), E15/(2*SQRT(3))))` | √((a_F/2√3)² + (a_Z/2√3)²) — 0 throughout the demo because Q3/Q4 make a_F=a_Z=0 |
| G,H,I,J | u_cal, A, B, C (%) | `INDEX/MATCH` into LCDB cols L..O by standard key | raw LCDB values |
| K | u_std | `=SQRT(SUMSQ(G15:J15))` | **[QUIRK Q5]** plain RSS — NO ÷√3 anywhere, despite the "Distribution Factor √3" label row. The LCDB values are evidently already standard uncertainties. |
| L | u_c | `=SQRT(SUMSQ(C15,F15,K15))` | √(u_rep² + u_res² + u_std²) |
| M | V_eff | `=(L15^4)/((C15^4)/2)` | Welch–Satterthwaite with only the Type-A term (ν=2) |
| N | k | `=IFERROR(TINV(0.0455, M15), 2)` | two-tailed Student-t at 95.45 % with ν=V_eff (non-integer df allowed); fallback 2 |
| O | U | `=L15*N15` | expanded uncertainty (%) |
| R | point in N | `=IF($F$6="kN", A15*1000, A15)` | unit-normalized cal point |
| S | CMC | stepwise: `R≤S11→T11; S11<R≤S12→T12; S12<R≤S13→T13` | CMC (%) from the direction's criteria block |
| T | U | `=O15` | copy |
| U | U-report | `=IF(T15<S15, S15, T15)` | max(U, CMC) |
| V | Trunc to 2 sigs | `=TEXT(TRUNC(U15, 1-INT(LOG10(ABS(U15)))), "0."&REPT("0",...))` | **[QUIRK Q6] TRUNCATED (not rounded) to 2 significant figures, produced as a formatted STRING** (e.g. 0.4096… → "0.40") |
| P | Report U | `=V15` | the string above |

## 4. CMC table (Unc. Budget header block R4:U8) + criteria

Scope table (force thresholds in N → CMC %):

| to N | Compressive | Tensile |
|---|---|---|
| 100 | 0.26 | 0.26 |
| 2000 | 0.59 | 0.21 |
| 247000 | 0.29 | 0.26 |

The per-sheet criteria block (S11:T13) used by the lookup is **hardcoded per
direction** in each sheet (Tension sheet carries the Tensile column, Compression
sheet the Compressive column); cell S2 merely parses the direction word out of the
standard-key text for display. In the app this becomes a proper lookup by the
sheet's direction — storage home per design §8c Prerequisite B (suggest
`settings/cmc`).

## 5. LCDB (per-standard parameters; full data in the golden JSON)

Columns: No. | EQUIPMENTS (key, e.g. "CAL-FRC-004 (250 kN, Tensile 10-100 kN)") |
Name | Range | Cal. Date | Due Date | Traceability | Equipment Code |
Manufacturer/Model | Accessories | Serial | **u_cal(%) | A(%) | B(%) | C(%)** |
Resolution | **Convert D-F Degree 1 | Degree 2 | Degree 3** | Input Unit |
Output Unit.

- 17 rows: 16 force-standard range/direction entries (CAL-FRC-001..004, each with
  multiple ranges × Tensile/Compressive) + CAL-THM-001 (thermo-hygrometer, all
  parameter columns `-`).
- **Coefficient order is ASCENDING degree (c1=linear, c2=quadratic, c3="cubic",
  used linearly per Q1).** The app's `ConversionEquation.coefficients` is
  documented as highest-power-first — the mapping when snapshotting/seeding must
  reverse order explicitly. u_cal/A/B/C are the values design §8c Prerequisite A
  wants added to ConversionEquation + StandardSnapshot.

## 6. Golden data file

`STAGE_D_GOLDEN_DATA.json` contains, verbatim from the workbook: header
parameters, all raw readings (uuc/sig/force per series), the full Relative Error
grid (A..U per row incl. per-point classes), the full Uncertainty Budget grid
(A..P + R..V), the class table, the CMC table, both directions' CMC criteria, and
the complete LCDB. Tension = full oracle (9 cal points + zero); Compression =
structure/criteria only (no measurements in the demo).

Golden tests must assert against these values as follows: floating-point columns
within a small tolerance (suggest relative 1e-9 — the values are exact cached
doubles, but TINV re-implementation may differ in the last ulps); `Report U`
compared as the exact string; `"-"` sentinels compared literally.

## 7. DECISIONS REQUIRED (owner) before implementation — replicate vs correct

For each quirk: (a) replicate exactly (golden tests pass verbatim) or (b) correct
it (then the affected golden values must be recomputed and the deviation recorded).
The implementing session must refuse to proceed on any undecided item.

- **D1 (Q1, force conversion `c3·x` vs `c3·x³`)** — the big one. The app's
  existing `conversionEquationService.evaluate()` + already-saved sheets define
  what the app stores. If the app evaluates a true polynomial, app forces ≠
  workbook forces, and the analysis golden tests should feed the workbook's
  STD-Force values directly as inputs (testing the analysis math in isolation)
  rather than recomputing from signals. Decide: which conversion is correct for
  the lab, and what the golden tests take as input.
- **D2 (Q2, b = q1 − q3)** — replicate, or use max−min over {q1,q2,q3} (and if
  ISO 7500-1 defines b via forces rather than q, state the intended formula)?
- **D3 (Q3, f0 = max zero-row force / F_nom)** — confirm this matches the lab's
  intended zero-error definition; in the demo it is always 0.
- **D4 (Q4, u_res inputs pull the f0 column, not resolution)** — the design doc
  §8c assumed a resolution-based rectangular term; the workbook wires f0/zero
  values with 2√3. Which is intended?
- **D5 (Q5, u_std = RSS of raw LCDB values, no ÷√3)** — confirm LCDB u_cal/A/B/C
  are already standard uncertainties (labels say "B, Rectangular √3" but the
  formula divides by nothing).
- **D6 (Q6, Report-U truncation-as-string)** — keep truncation to 2 sig figs (a
  conservative-rounding convention) and string output, or switch to numeric
  rounding?

## 8. Owner verification checklist (before any implementation prompt is run)

1. Open the real workbook next to `STAGE_D_GOLDEN_DATA.json` and spot-check ~5
   values: one q, the b of the 8000 N point, one u_c, one V_eff/k pair, one
   Report U string.
2. Answer D1–D6 above.
3. Confirm the CMC table (§4) matches the current scope of accreditation.
4. Confirm the LCDB u_cal/A/B/C values are current (they were calibrated
   2024-12; due 2026-12).
