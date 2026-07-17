# DESIGN — Data Recorder Module (v2, sheet-based)

Status: **design approved via interactive prototype** (2026-07-14) — ready for Stage B.
Prototype: https://claude.ai/code/artifact/a4a2876e-9fba-4a02-96c0-f75ac3cc2fe9
Modeled on the owner's real workbook: `Demo File.xlsb` (SCS-CAL-26024, ISO 7500-1 load-cell calibration).

v1 of this document designed a single-reading record; the owner corrected it: **one record
= one whole calibration raw-data sheet**. This version supersedes v1 entirely.

## 1. Record = CalibrationRawDataSheet

New section in `src/types/index.ts`:

```ts
// ─── Data Recorder (Calibration Raw Data Sheets) ────────────────────────────

export type ForceUnit = 'N' | 'kN' | 'kgf' | 'gf';
export type SheetKind = 'original' | 'amendment';
export type CalDirection = 'Tension' | 'Compression';
export type SeriesKey = 'inc1' | 'inc2' | 'inc3' | 'dec3';

export interface MeasurementCell {
  uuc: number | null;      // UUC reading (in uuc.readingUnit)
  sig: number | null;      // STD indicator signal (mV/V) — the raw source of truth
  force: number | null;    // computed at save: convert(evaluate(equation, sig)) → readingUnit
}

export interface SheetRow {
  calPoint: number;
  standardEquipmentId: string;  // reference-standard equipment doc ID
  equationId: string;           // conversionEquations doc ID under that equipment
  cells: Record<SeriesKey, MeasurementCell>;
}

/** Audit snapshot of one reference standard + equation as used at save time. */
export interface StandardSnapshot {
  equipmentId: string; equationId: string;
  code: string;                 // display label, e.g. "CAL-FRC-004 (250 kN, Tensile 10-100 kN)"
  name: string; manufacturer?: string; model?: string; serial?: string;
  dueDate?: Date;
  equationName: string; degree: number;
  coefficients: number[];       // highest power first, matching ConversionEquation order
  divisor: number; inputUnit: string; outputUnit: string;
}

export interface EnvStandardSnapshot {   // thermo-hygrometer — REQUIRED on every sheet
  equipmentId: string; code: string; name: string;
  serial?: string; range?: string; dueDate?: Date;
}

export interface CalibrationRawDataSheet {
  id: string;
  kind: SheetKind;
  amends: string | null;          // original sheet ID when kind==='amendment'
  amendmentReason?: string;       // required for amendments
  jobId: string | null;           // link to Jobs module
  requestNo: string;              // e.g. SCS-CAL-26024
  receivedDate?: Date;
  calibrationDate: Date;
  uuc: { equipmentName: string; manufacturer?: string; model?: string; serial?: string;
         readingUnit: ForceUnit; resolution?: number; };
  calibrationRange: string;
  direction: CalDirection;
  standards: StandardSnapshot[];  // every standard/equation the rows actually use
  envStandard: EnvStandardSnapshot;
  env: { t: number; h: number }[];        // 3 rounds, all required before save
  machineCondition: string;
  decimalPlaces: number;
  rows: SheetRow[];
  recordedByUid: string; recordedByName: string;   // from AuthContext, snapshotted
  createdAt: Date;                // serverTimestamp — authoritative audit time
  schemaVersion: number;          // 1
}
export type CalibrationRawDataSheetInput = Omit<CalibrationRawDataSheet, 'id' | 'createdAt'>;
```

Append-only (R3): no `updatedAt`, no update/delete anywhere. Corrections = amendment
sheets referencing the original.

## 2. Conversion binding (owner-confirmed)

- Reference standards (CAL-FRC-xxx) are **existing equipment records**; their calibration
  factors are **ConversionEquation docs** at `equipmentControl/{id}/conversionEquations/*`
  (name, inputUnit, outputUnit, degree 1–5, coefficients, divisor).
- **Per-row selection**: each grid row picks reference equipment + equation (each equation
  covers one range+direction). No sheet-level single standard.
- STD-Force = `convertForce(conversionEquationService.evaluate(equation, sig),
  equation.outputUnit, sheet.uuc.readingUnit)` — reuse `evaluate()`, never reimplement.
- **Force unit handler** (`forceUnits.ts`, pure): N/kN/kgf/gf via newton base
  (kgf = 9.80665 N, gf = 0.00980665 N). UUC reading unit selectable per sheet.
- The "Reference Standards" header block is **derived** from the rows' actual selections;
  saved sheets carry `standards[]` snapshots so history survives later recalibration.
- **Formula adjustable later**: equations stay editable in the app (existing tab). New
  sheets pick up new coefficients automatically; saved sheets are immutable, but an
  amendment recomputes all forces from the stored raw `sig` values with current equations.
- Environment readings require a **thermo-hygrometer** (CAL-THM-xxx equipment) selected
  on every sheet, snapshotted, listed among the standards.
- [OPEN — verify in Stage B step 1] how to filter equipment lists: which field/category on
  equipment records distinguishes reference standards (force) and thermo-hygrometers from
  UUCs. If none exists, add a filter by equipment category value agreed with the owner.

## 3. Storage

- Top-level collection **`rawDataSheets/{id}`** (renamed from v1 `dataRecords` — the
  record is a sheet). Rules (append-only enforced server-side):

```
match /rawDataSheets/{sheetId} {
  allow read, create: if request.auth != null;
  allow update, delete: if false;
}
```

- Cursor pagination everywhere (`orderBy('createdAt','desc')`, `limit(50)`, `startAfter`) — R6.
- `firestore.indexes.json`: composite `(jobId ASC, createdAt DESC)` and
  `(requestNo ASC, createdAt DESC)` on `rawDataSheets`.
- Sheets are single documents (~10 rows × 4 series ≈ well under the 1 MB doc limit).

## 4. Module structure

```
src/services/rawDataSheetService.ts        — pattern-copy of equipmentConstantService style:
                                             add / amend / getPage / getById / getAmendmentsOf /
                                             exportAll / importSheets. NO update, NO delete.
src/modules/data-recorder/
  index.ts
  DataRecorderListPage.tsx                 — route /data-records (list + filters + toolbar)
  SheetEditorPage.tsx                      — routes /data-records/new, /data-records/:id,
                                             /data-records/:id/amend (edit vs read-only vs amend)
  components/SheetHeaderBlocks.tsx         — Job / UUC / derived Reference Standards blocks
  components/EnvironmentBlock.tsx          — thermo-hygrometer select (required) + 3 rounds
  components/MeasurementGrid.tsx           — per-row standard select, live force computation;
                                             self-contained styles (do not rely on global table CSS)
  components/SaveConfirmModal.tsx          — immutability warning + summary + confirm
  forceUnits.ts                            — pure unit handler
  export/rawDataSheetExport.ts             — pure serialize/parse (zod-validated)
  pdf/rawDataSheetPdf.ts                   — jsPDF A4 LANDSCAPE + autotable + pdfFontManager
  __tests__/ (forceUnits, export round-trip, pdf smoke)
src/services/__tests__/rawDataSheetService.test.ts — append-only + amendment semantics
```

## 5. UI flow (Thai UI text; layout mirrors the prototype)

List → สร้างชีตบันทึกใหม่ / open (read-only) / นำเข้า / ส่งออก JSON.
Editor: header blocks → formula box (coefficients of used standards) → environment
(thermo required, 3 rounds required) → machine condition → measurement grid
(Cal. Point | Standard | 4 series × [UUC, STD-Signal, STD-Force computed]).
Save: validations → **confirmation dialog** warning the sheet becomes immutable and that
future edits require an amendment with a stated reason → snapshot + append.
Read-only sheet: ดูตัวอย่าง PDF · สร้างชีตแก้ไข (prefilled clone + required reason,
forces recomputed from raw signals with current equations).

## 6. Import/export (R4) and PDF (R5)

- JSON envelope `{ format:'lims-data-recorder', schemaVersion:1, exportedAt, exportedByUid,
  recordCount, records[] }`, dates as ISO strings. Import preserves document IDs
  (batched `setDoc`, ≤500/batch), skips existing IDs (idempotent), reports imported/skipped.
- Round-trip losslessness `parseExport(serializeExport(x)) ≡ x` is a tested invariant.
- PDF: **A4 landscape** (grid doesn't fit portrait), header blocks, standards-used table
  (incl. thermo-hygrometer row), environment line, measurement grid, amendment marker,
  Recorded by / Reviewed by / Date signature row. `pdfFontManager.ensureFontsReadyForPdf`
  before any text (Thai requires Sarabun).

## 6b. Post-launch additions (owner-requested, 2026-07-14)

- **Void/cancel ("delete" without deleting, R3-compatible):** a `SheetVoidRecord`
  in its own append-only collection `rawDataSheetVoids/{id}` (rules deny
  update/delete) referencing the sheet by ID with a mandatory reason. Voided
  sheets: hidden from the default list (toggle "แสดงชีตที่ถูกยกเลิก"), badge
  'ยกเลิก', banner + red VOIDED marker on the PDF, amend/void buttons hidden.
  Export format bumped to **v2**: envelope gains a `voids` array; v1 files are
  still importable. Owner explicitly chose this over hard delete.
- **PDF preview:** real jsPDF output shown in-app (blob URL in an iframe modal)
  with download from the modal; replaces the direct-download button.
- **ADMIN-ONLY hard delete (owner decision — explicit R3 relaxation for admins):**
  `deleteSheetPermanently()` + a rules-level gate
  (`allow delete: if ... role == 'admin'`, same get() pattern as the roles
  collection) on both rawDataSheets and rawDataSheetVoids. Guardrails: refused
  while amendments reference the sheet; the sheet's void marker is deleted with
  it; UI button visible to admins only, behind an acknowledgement checkbox that
  states the audit-trail consequence. Updates remain impossible for everyone.

## 7. Trade-offs / carried-over flags (unchanged from v1 unless noted)

1. No update/delete + rules deny — intentional break from house conventions (R3).
2. Import trusts file-supplied `createdAt`/IDs — required for lossless round-trip.
3. Thai UI next to English nav labels — following the task rule.
4. Pagination, not live `onSnapshot` — R6.
5. Rules/indexes need a Firebase deploy; rules-layer append-only not unit-testable (no emulator).
6. NEW: collection renamed `rawDataSheets`; schema v1 starts fresh (prototype's v2/v3 were iterations).
7. NEW: equipment-category filter for standards pickers is [OPEN] (see §2).

## 8. Test plan (vitest, existing conventions)

1. Append-only invariant + amendment semantics (service, `./firebase` mocked).
2. Force unit handler: N↔kN↔kgf↔gf conversions, identity, invalid unit → null.
3. Equation binding: force computation calls `conversionEquationService.evaluate` and
   converts outputUnit → readingUnit (mocked equation).
4. Export→import round-trip deep-equality incl. dates, IDs, `amends`, snapshots.
5. Import idempotency (skip-existing split counts).
6. PDF smoke: 0 / 1 / 12-row sheets, landscape, font setup called first, no throw.

## 9. Stage B preconditions

- Repo was on detached HEAD at `51295f9` with uncommitted work — create
  `feature/data-recorder` from that state first (`git switch -c`), preserving the tree.
- Verify no dev server runs from another worktree (CLAUDE.md rules 3–4).
