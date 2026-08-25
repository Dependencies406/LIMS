# Data & Information Management Module — Pre-Design Audit

Date: 2026-07-30
Purpose: establish verified facts about the current codebase before designing the
Data & Information Management Module, so the design does not duplicate or
contradict what already exists.

Every claim below cites the file and line range it was read from. Claims that
could not be verified in this session are marked **[UNVERIFIED]**.

---

## 1. There is no Python runtime anywhere in this stack

| Surface | Runtime | Evidence |
|---|---|---|
| Frontend | Browser / Vite / React 18 | `package.json:12-35` |
| Cloud Functions | **Node 22 + TypeScript** | `functions/package.json:10-22` |

- No `pyodide`, `brython`, or any Python-to-WASM package in either
  `package.json` or `functions/package.json`.
- No `.py` source files found under `functions/`.
- `functions/` contains only `package.json`, `package-lock.json`,
  `tsconfig.json` — no `src/` or `lib/` was found, so **[UNVERIFIED]** whether
  any Cloud Function is actually deployed. `main` points at `lib/index.js`,
  which was not found.

**Consequence:** the requirement *"Formula Engine: A Python code set which
defined by user"* has no execution target today. See ADR-001.

**Note on the RowZero reference:** RowZero executes user Python **server-side**
in sandboxed containers. A Firebase-hosted SPA has no equivalent compute tier
without adding one.

---

## 2. Recorded data is currently embedded inside the Job document

```ts
// src/types/index.ts:196-208
export interface Job {
  id: string;
  jobId: string;
  ...
  equipment: Equipment[];          // items are an EMBEDDED ARRAY
}

// src/types/index.ts:100-120
export interface Equipment {
  name: string;
  ...
  id?: string;                     // OPTIONAL — items may have no stable id
  certificateNumber?: string;
  spreadsheetData?: EquipmentSpreadsheetData;   // recorded data, INLINE
}

// src/types/index.ts:87-98
export interface EquipmentSpreadsheetData {
  templateId?: string;
  hotData?: unknown[][];           // untyped 2D array
  formulaResults?: Record<string, unknown>;
  [key: string]: unknown;          // open-ended
}
```

Three consequences for the new module:

1. **Firestore 1 MiB per-document hard limit.** Record data for *all* items on a
   job shares one document with the job itself. Sections x columns x reading
   rows x environmental readings per round, times N items, is on a collision
   course with that ceiling.
2. **Write contention.** Realtime recalculation + autosave rewrites the *whole
   job document* on every change. Two staff recording two different items on the
   same job will fight over one document.
3. **No stable item identity.** `Equipment.id` is optional. A record cannot be
   reliably bound to an item that may not have an id. The workflow requirement
   *"verify if item already bounded to record or not"* needs this fixed first.

`Equipment` items also carry no `equipmentType` field — only `name`. See §4.

---

## 2b. AUDIT GAP — an entire prior recorder module was missed

**Added 2026-07-30, after Phase 0. This is a correction to a failure in the
original audit.**

A substantially complete prior data-recorder module exists at
**`recorder-reserved/`** in the **repository root** — outside `src/`.

**Why it was missed:** the original audit's first glob of the repo root returned
"100 of 39617 files", dominated by `.git/objects`. That truncated listing was
treated as sufficient knowledge of the top-level layout, and every subsequent
search was scoped to `src/**` and `docs/**`. A plain directory listing of the
root would have found it immediately.

**Status (confirmed by the owner, 2026-07-30): NOT IN USE. Retained as an
archive / reference only.** It is not the foundation for the new module, and it
is not to be deleted.

### What it contains

| Area | Files |
|---|---|
| Formula engine | `analysis/formulaEngine/`: `lexer.ts`, `parser.ts`, `ast.ts`, `evaluator.ts`, `builtins.ts`, `formulaSet.ts`, `seedFormulaSet.ts`, `engineAdapter.ts`, `previewData.ts` — each with tests |
| Uncertainty | `uncertaintyBudget.ts`, `studentT.ts` (TINV via incomplete-beta + bisection), `relativeError.ts`, `numeric.ts` (Excel-faithful ROUND/TRUNC), `__tests__/golden.ts` |
| Recording UI | `SheetEditorPage.tsx`, `MeasurementGrid.tsx`, `EnvironmentBlock.tsx`, `SheetHeaderBlocks.tsx`, `AnalysisResultsSection.tsx`, `DataRecorderListPage.tsx` |
| Lifecycle | `SaveConfirmModal.tsx`, `VoidSheetModal.tsx`, `DeleteSheetModal.tsx`, `PdfPreviewModal.tsx` |
| Output | `pdf/rawDataSheetPdf.ts`, `export/rawDataSheetExport.ts` |
| Services | `rawDataSheetService.ts`, `analysisFormulaSetService.ts`, `sheetTypeDefinitionService.ts`, `cmcService.ts` |
| Design docs | `DATA_RECORDER_DESIGN.md`, `FORMULA_ENGINE_DESIGN.md`, `STAGE_D_FORMULA_SPEC.md`, `STAGE_D_EXECUTION_PLAN.md`, `STAGE_D_DECISIONS.md` |

### Why it does not replace the new module

It is **hardcoded to a single sheet type** (`force-iso7500-1`, ISO 7500-1
load-cell calibration) with a **fixed set of named calculation steps** and an
explicit "no new steps, no new columns" scope
(`FORMULA_ENGINE_DESIGN.md` §1). The new requirement — author-defined sections
and columns, one template per equipment type — is precisely the generalization
that module deliberately excluded.

### Convergence with our ADRs

The prior design independently reached the same conclusions, which is reassuring
about the current design:

| Our ADR | `recorder-reserved` equivalent |
|---|---|
| ADR-001 — hand-rolled AST interpreter, never `eval` | "small hand-rolled parser/evaluator… no `eval`/`Function` construction… plain recursive interpreter" |
| ADR-005 — version pinning | "Admin-only, versioned, sheet-pinned… a formula edit never silently changes an already-issued sheet's numbers" |
| ADR-005 — revisions supersede, never mutate | "Append-only… Corrections = amendment sheets referencing the original" |
| ADR-006 — per-round environment block | `env: { t, h }[]  // 3 rounds, all required before save` |
| ADR-011 — declared decimal places | `decimalPlaces: number` on the sheet |
| Context snapshot | `StandardSnapshot`, `EnvStandardSnapshot`, snapshotted `recordedByName` |

### Value to harvest (as reference, not as a live dependency)

- The **builtin function list** — `ROUND`, `TRUNC`, `ABS`, `MAX`, `MIN`, `SQRT`,
  `AVERAGE`, `IF`, `RSS`, `TINV` — is a validated starting point for ADR-001's
  whitelist.
- **`studentT.ts` (TINV)** and **`numeric.ts` (Excel-faithful ROUND/TRUNC)** are
  non-trivial numerical algorithms, already implemented and tested.
- **Golden test fixtures** validated against a real workbook
  (`Demo File.xlsb`, SCS-CAL-26024) — valuable regression material.
- **`uncertaintyBudget.ts`** — relevant if the decision to keep uncertainty out
  of scope is ever revisited.

---

## 3. Four template systems already exist

The proposed module as drafted would be the **fifth**.

| # | System | Key files | What it does |
|---|---|---|---|
| 1 | Column/formula templates | `services/templateService.ts`, `types/template.ts`, `components/TemplateBuilder.tsx` | Columns + formulas, `hot-formula-parser` |
| 2 | TREB spreadsheet templates | `services/spreadsheetTemplateService.ts`, `modules/spreadsheet-templates/types.ts` | `@trebco/treb` 38.6 docs, tabs, print areas, unlock-password hash |
| 3 | Spreadsheet engine module | `modules/spreadsheet/services/{formulaParser,spreadsheetEngine,uncertaintyEngine}.ts` | Own tokenizer/parser/AST, cross-tab refs, uncertainty |
| 4 | PDF template builder | `services/pdfTemplateService.ts`, `modules/pdf-template-builder/**`, `types/pdfTemplate.ts` | Canvas builder + renderer |

Overlap with the draft requirements:

- **"Template Manager: define sections and columns"** — #1 does columns
  (`ColumnDefinition`), #2 does tabs, #3 does the grid. None does
  *section-grouped* columns, which is genuinely new.
- **"UI: spreadsheet style like Excel or Google Sheet, input into specific
  columns only"** — #2 already is a real spreadsheet (TREB) and already carries
  `unlockPasswordHash` (`modules/spreadsheet-templates/types.ts:21-22`) plus a
  `SpreadsheetProtectionSettingsModal.tsx`. Cell protection is already plumbed.
- **"Formula Engine"** — #1 (`services/formulaEngine.ts:37-91`) wraps
  `hot-formula-parser` with SUM/AVERAGE/MAX/MIN/COUNT/IF. #3 is a full
  hand-written parser with an AST. Two engines already.
- **Two grid libraries coexist:** `handsontable` 12.2 **and** `@trebco/treb`
  38.6 (`package.json:13,14,20,21`). Which one the new UI uses is undecided.

---

## 4. `equipmentType` is a dead field — it never reaches Firestore

`CertificateNumberConfig` declares it (`types/index.ts:531-548`), and it is
**read** in two places:

- `services/certificateNumberConfigService.ts:33` — `equipmentType: docData.equipmentType || ''`
- `services/certificateNumberGeneratorService.ts:81` — `equipmentType: configData.equipmentType || ''`

But `configToDocument` (`services/certificateNumberConfigService.ts:53-76`)
**does not write it**, and `updateConfig` (`:187-201`) has no branch for it.
`CertificateNumberManagerModal.tsx:108` sets it to `''` via an `any` cast.

So `equipmentType` is always `''` on read. The same omission affects
`currentSequence`, `currentYear`, and `yearlyReset` — all declared and read,
none written.

**What is actually used as "equipment type" today** is
`CertificateNumberConfig.name`:

- `getConfigByEquipmentName()` matches on `.name`
  (`certificateNumberConfigService.ts:247-252`)
- `getEquipmentNames()` / `subscribeToEquipmentNames()` project `.name` into the
  equipment-type dropdowns (`:258-315`)
- `JobModal.tsx:2583,3001` and `ServiceRequestModal.tsx:836` render those names
  via `equipmentTypeSelectOptions(certificateEquipmentTypeNames, eq.name)` —
  matched against `Equipment.name`, a free-text field.

**Consequence:** the restriction *"1 equipment type can only apply to 1
template"* currently has no stable key to hang on. The de-facto key is a mutable
free-text display string. See ADR-003.

---

## 5. The PDF render engine is ~80% built already

This is the part the requirements flag as unsolved. Most of it exists.

> **CORRECTION (added after deeper reading — see ADR-004 revision).**
> This section originally described `src/types/pdfTemplate.ts` as *the* PDF
> system. That was wrong. There are **two** parallel PDF template systems:
>
> | | Types | Units | Renderer | Live? |
> |---|---|---|---|---|
> | **A** | `src/types/pdfTemplate.ts` (`ReportTemplate`, `ReportSection`, `DataSourceKey`) | mm | none found | **No live callers found** |
> | **B** | `src/modules/pdf-template-builder/types.ts` (`PdfElementType`, `PdfElement`, `pages`) | pt | `services/pdfTemplateRenderer.ts` | **Yes** |
>
> System A is imported only by `components/pdf/PdfTemplateEditor.tsx` and
> `utils/pdfAlignmentHelpers.ts`; `PdfTemplateEditor` has **no import anywhere in
> application code** outside its own README. Strong dead-code candidate —
> **but per `CLAUDE.md` RULE 2 this is a report, not a deletion recommendation.**
>
> **The existing-systems count in §3 is therefore five, not four**, and the
> proposed module would have been the sixth.
>
> Critically, **System B already has a working generic pagination mechanism**
> (`ElementSlicePlan`, `computeTableRowSlices`, sub-pages) with header repeat
> already handled, and **`treb-table` is explicitly excluded from it**. The two
> "real gaps" listed at the end of this section are restated correctly in
> ADR-004. The inventory below describes System A and is retained only for
> reference.

**Present in System A — not wired up** (`types/pdfTemplate.ts`, 495 lines):

- `ReportTemplate` -> `ReportSection[]` (`header` | `body` | `footer`,
  `repeatOnEveryPage`) -> `ReportElement[]`
- Element union (`:380-389`): `static-text`, `dynamic-field`, `image`, `line`,
  `rectangle`, `spacer`, `page-break`, `qr-code`, `signature-field`
- `DataSourceKey` template-literal binding (`:151-160`) over
  `job.*`, `equipment.*`, `equipment[n].*`, `customer.*`, `company.*`,
  `serviceInfo.*`, `workAuth.*`, `spreadsheet.*`
- `PageSettings` (`:28-35`): paper size, orientation, mm margins, page numbers
- Per-field `formatting`: `dateFormat`, `numberFormat.decimals`, prefix/suffix,
  case, trim (`:268-279`)

**Builder UI:** `modules/pdf-template-builder/` — `PdfTemplateBuilderCanvas.tsx`,
`ElementPropertiesPanel.tsx`, `SectionPanel.tsx`, `DataSourceBrowser.tsx`,
`AlignmentToolbar.tsx`, `useUndoRedo.ts`, `useClipboard.ts`, `sectionRegistry.ts`,
plus section definitions for Header/Footer/JobInformation/Equipment/Staff/
ServiceInformation/WorkAuthorization/Comments/FormControls/Spreadsheet.

**Renderer:** `services/pdfTemplateRenderer.ts`, `pdfTextLayoutService.ts`,
`pdfFontManager.ts`, `pdfDataResolver.ts`, `pdfComponentScanner.ts`,
`pdfTemplateValidationService.ts`, `pdfTemplateAuditService.ts` — on
`jspdf` 4.2 + `jspdf-autotable` 5.0. Tests exist
(`services/__tests__/pdfTemplateRenderer.test.ts`, `pdfDataResolver.test.ts`,
`pdfFontManager.test.ts`).

**A spreadsheet-to-PDF element already exists:** the `treb-table` component
renders a chosen TREB tab into the PDF, configured by
`spreadsheetTemplateId` + `sourceTabId`
(`modules/pdf-template-builder/components/sections/SpreadsheetSection.tsx:73-87`).

### The two real gaps

1. **No table binding for record data.** `SpreadsheetDataKey`
   (`types/pdfTemplate.ts:139-146`) exposes only scalars —
   `measurementResult`, `unit`, `method`, `analyst`, `calculatedAt`. The
   spreadsheet section's data sources are only
   `measurements.title` / `.summary` / `.pass_fail`
   (`SpreadsheetSection.tsx:90-94`). There is **no** way to bind "record
   section X, all rows, as a table".

2. **Absolute positioning vs variable-length tables.** Elements position by
   `Position { x, y }` in mm (`types/pdfTemplate.ts:200-203`). A record table
   whose row count is unknown until data arrives cannot be absolutely placed.
   `ReportSection` has `minHeight`/`maxHeight` (`:413-414`) but there is no
   flow/band model, no header-repeat-on-continuation, no orphan/widow control.

**So the PDF question is not "which library".** It is: *how do we add a
repeating, flowing, paginating band to an absolutely-positioned element model?*
See ADR-004.

**Thai text:** `pdfFontManager.ts` plus the `linebreak` and `grapheme-splitter`
dependencies (`package.json:19,26`) indicate Thai/complex-script PDF layout has
already been solved once. Any new render path must reuse it, not bypass it.

---

## 6. Requirement gaps not covered by the draft

These are absent from the draft and are not optional for an ISO/IEC 17025
calibration laboratory. (The codebase shows 17025 intent: statement of
conformity, `uncertaintyEngine.ts`, `technicalReviewerSignature`,
`pdfTemplateAuditService.ts`.)

1. **Template versioning + record pinning.** A committed record must be
   reproducible against the exact template *and formula* version used to produce
   it. `SpreadsheetTemplate.version` exists as a string
   (`modules/spreadsheet-templates/types.ts:17`) and `TemplateBuilder.tsx:97`
   bumps a numeric `version`, but **no record pins the version it was created
   under**. Editing a template today silently changes the meaning of every
   historical record.
2. **"1 equipment type -> 1 template" blocks template evolution.** With a 1:1
   constraint and no version pinning, you cannot run v1 and v2 concurrently, so
   you cannot revise a template without retroactively altering closed records.
   These two requirements are in direct conflict.
3. **Record lifecycle is undefined.** The draft has "click save to commit" and a
   handler for accidental close, but no states (draft / committed / reviewed /
   approved / superseded), no rule for who may edit after commit, no amendment
   or revision path, no audit trail.
4. **"Reading round" is undefined.** Requirement 4 forces temperature + RH
   "every reading round" but never defines a reading round — a row? a group of
   rows? a named phase? This *is* the environmental data model and it is
   unspecified.
5. **Measurement uncertainty is not mentioned at all.** Yet
   `modules/spreadsheet/services/uncertaintyEngine.ts` and
   `models/UncertaintyModel.ts` already exist. Calibration certificates
   generally require it. Unclear whether the new module computes it or delegates.
6. **Record numbering duplicates existing capability, more weakly.** The draft
   proposes fixed parts + `YY001`. `CertificateNumberConfig` already provides
   `prefix`, `separator`, `includeYear`, `numberPadding`, and
   `resetPolicy: 'never' | 'yearly' | 'monthly'` (`types/index.ts:531-548`).
   `YY001` also caps at 999/year with no monthly reset.
7. **Number allocation timing is unspecified.** Allocating on template open
   leaks numbers on abandoned records; allocating on save requires a Firestore
   transaction. Neither is chosen. Note `resetNumber`/`updateConfig`
   (`certificateNumberConfigService.ts:171-242`) use plain `updateDoc`, **not** a
   transaction — concurrent allocation can collide today. **[UNVERIFIED]**
   whether `certificateNumberGeneratorService` uses a transaction; not read in
   full this session.

---

## 7. Security: user-authored code executed in other users' browsers

Per the earlier handoff note, `firestore.rules` grants blanket
`allow read, write: if request.auth != null` on equipment subcollections
(`docs/handoff_recorder_context.md:66-68`, citing `firestore.rules:191-212`).
**[UNVERIFIED]** in this session — `firestore.rules` was not re-read.

If user-authored formula code is stored in Firestore and executed client-side,
then under blanket authenticated write **any** authenticated user can author code
that executes in every other user's browser. That is a stored code-injection
vector, independent of whether the language is Python or JavaScript. Sandboxing
(worker + no DOM/network access) and write authorization on template documents
are both required. `dompurify` is already a dependency (`package.json:16`),
which handles HTML sanitization but not code execution.

---

## 8. Process constraints for the implementation session

Per project `CLAUDE.md` RULE 3/4/8 — the shell workspace was unavailable during
this audit, so **none of the following were verified this session**:

- active branch (`git branch`)
- worktree list (`git worktree list`)
- uncommitted changes (`git status`)
- where the dev server is serving from (`netstat -ano | grep ":5173"`)

`CLAUDE.md` also notes the expected dev-server path as
`C:\Users\seela\OneDrive\Desktop\LIMS-New`, whereas this session's mounted
folder is `C:\Users\seela\Desktop\LIMS-New` (no `OneDrive` segment).
**This discrepancy must be resolved before any file is edited.**
