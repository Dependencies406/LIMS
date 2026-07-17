# Stage B Implementation Prompt — Data Recorder Module

Copy everything below the line into a fresh Claude Code session in this repo.

---

[TASK: Implement the Data Recorder module (Stage B) — build exactly what
docs/DATA_RECORDER_DESIGN.md specifies]

CONTEXT:
- The design is APPROVED (v2, sheet-based). Read docs/DATA_RECORDER_DESIGN.md ONCE
  in full before touching anything — it contains the record schema, storage layout,
  module structure, conversion binding, and test plan. Do not redesign.
- The approved interactive prototype (visual + behavioral reference):
  https://claude.ai/code/artifact/a4a2876e-9fba-4a02-96c0-f75ac3cc2fe9
- Codebase conventions: docs/handoff_recorder_context.md section 7, and copy the style of
  src/services/equipmentConstantService.ts / conversionEquationService.ts.
- CLAUDE.md rules are binding — especially the session-start git/dev-server checks.

STEPS — do them in this order, and report completion of each step as you go:

STEP 0 — Session safety (CLAUDE.md):
  - git branch / git worktree list / git status; check nothing serves :5173 from
    another worktree. Repo may be on detached HEAD at 51295f9 with uncommitted work:
    run `git switch -c feature/data-recorder` from the current state (preserves the
    working tree). Do NOT touch master, do NOT clean anything up.

STEP 1 — Verify the two [OPEN]/[UNVERIFIED] points from the design (§2):
  - How equipment records are categorized, so the pickers can list (a) force reference
    standards, (b) thermo-hygrometers. Check equipmentControlService + Equipment type.
    If no usable field exists, STOP and ask me which category values to use.
  - Confirm ConversionEquation coefficient ordering against
    conversionEquationService.evaluate() (highest power first) before writing the
    snapshot mapping.

STEP 2 — Types: add the "Data Recorder (Calibration Raw Data Sheets)" section from
  design §1 to src/types/index.ts (banner-comment style, *Input via Omit).

STEP 3 — Force unit handler: src/modules/data-recorder/forceUnits.ts (pure; N/kN/kgf/gf
  via newton base) + src/modules/data-recorder/__tests__/forceUnits.test.ts. Run tests.

STEP 4 — Service: src/services/rawDataSheetService.ts per design §4 — add / amend /
  getPage (cursor pagination) / getById / getAmendmentsOf / exportAll / importSheets
  (batched setDoc preserving IDs, skip existing). NO update, NO delete methods.
  Tests in src/services/__tests__/rawDataSheetService.test.ts with ./firebase mocked
  (follow src/services/__tests__/documentsTemplatePrintService.test.ts mocking style):
  append-only invariant, amendment semantics, import skip-existing counts. Run tests.

STEP 5 — Export/import: src/modules/data-recorder/export/rawDataSheetExport.ts —
  pure serializeExport/parseExport, zod-validated envelope per design §6.
  Round-trip losslessness test (deep equality incl. Date ms, IDs, amends, snapshots).

STEP 6 — UI (Thai text for everything end-users see; match prototype layout):
  DataRecorderListPage + SheetEditorPage (routes /data-records, /data-records/new,
  /data-records/:id, /data-records/:id/amend) + components per design §4-5, including
  the SaveConfirmModal immutability warning (validation first, then confirm dialog,
  then save). MeasurementGrid must use self-contained styles. Amendment editor
  recomputes forces from stored raw signals using current equations.

STEP 7 — PDF: src/modules/data-recorder/pdf/rawDataSheetPdf.ts — jsPDF A4 LANDSCAPE +
  jspdf-autotable; await pdfFontManager.ensureFontsReadyForPdf(pdf) before any text
  (Thai needs Sarabun). Content per design §6. Smoke test (mock jspdf like
  src/services/__tests__/pdfTemplateRenderer.test.ts). Run tests.

STEP 8 — Integration points (ONLY these existing files may be modified):
  - src/App.tsx: the /data-records routes
  - src/components/Layout.tsx: one nav item { path: '/data-records', label: 'บันทึกข้อมูล' }
  - src/types/index.ts: the new section (step 2)
  - firestore.rules: rawDataSheets block (allow read, create; update/delete: if false)
  - firestore.indexes.json: (jobId ASC, createdAt DESC), (requestNo ASC, createdAt DESC)

STEP 9 — Verify:
  - npm test (all green) and npm run build (clean).
  - npm run dev; walk through: create sheet → thermo + 3 env rounds enforced →
    per-row standard selection → live force conversion → save confirmation → sheet
    read-only → amendment with reason → export JSON → re-import (all skipped) → PDF
    downloads with Thai text rendered.
  - Finish with a summary: files created/changed, how to try it, deviations from
    DESIGN.md (if reality forced any — never diverge silently), known limitations,
    and remind me that firestore.rules + indexes need `firebase deploy` before the
    filtered queries work in production.

RULES (unchanged from Stage A):
- Read each existing file at most once; prefer context already loaded.
- Never guess codebase behavior — verify in code or mark [UNVERIFIED].
- If stuck on the same error more than twice, stop and report.
- Do not modify existing modules beyond the integration points listed in STEP 8.
- UI text visible to end users: Thai. Code, comments, commit messages: English.
- Commit at the end of each completed step on feature/data-recorder with a clear
  English message; do not push unless I say so.
