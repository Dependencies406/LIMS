# Bug Report: Chrome freeze + growing RAM on opening a calibration record

## Environment

- Repo: `C:\Users\seela\Desktop\LIMS-New`
- Branch: `feature/analysis-module`
- Dev server: Vite, `http://localhost:5173`, confirmed running from this exact directory
- Reporter: user, testing in their own logged-in Chrome session (not reproducible by the assistant — no login credentials available to the assistant's browser tooling)

## Symptom

Opening a Draft calibration record (Job → "Universal Testing Machine" item → Record) freezes the Chrome tab entirely ("Page Unresponsive" dialog). While frozen, **RAM usage climbs continuously** (observed in Windows Task Manager), which is consistent with an unbounded/tight loop rather than a one-time expensive computation. Windows Task Manager only shows memory, not which JS function is hot, and the tab cannot be inspected via Chrome's own Task Manager (Shift+Esc) while it is unresponsive.

The record page itself renders correctly up to a point — reporting-unit selector, per-column unit selectors ("UUC Reading 1", "STD Reading 1", "STD Convert 1"), a warning banner about `REPORT_TO_N` needing a reporting unit, and the Environment Condition table (3 rounds) all display. The area below that, where the recording grid (a TREB spreadsheet) should mount, is blank in the screenshot taken at that point — the freeze appears to happen during or shortly after the grid-mount step.

## Immediate prior context (relevant, may or may not be the cause)

Two changes were made in this session shortly before the bug was first hit:

1. **A large feature phase (ADR-015): display-time unit conversion for non-force units.** Added a new pure pipeline (`src/services/columnConversion.ts`), a rule library service (`src/services/unitConversionRuleService.ts`), wiring into three render paths (draft grid, read-only grid, PDF), a builder-UI opt-in checkbox per formula column ("Convert for display" + source unit), a D3 cross-check warning, D7 commit-time snapshot freezing in `calibrationRecordService.commitRecord`, and an admin UI (`src/components/UnitConversionRulesManagerModal.tsx`). Full test suite (1183 tests) and `tsc --noEmit` were clean after this phase. See `docs/adr/ADR-015-display-time-unit-conversion.md` for the spec this implements.

2. **A separate, smaller bug fix, unrelated to ADR-015 in origin:** the user reported `createDraftRecord` throwing "Item ... has no equipment type assigned" even after picking a type in the Job/Item form's "Equipment type (name)" dropdown. Investigation found that dropdown (`src/components/JobModal.tsx`) only ever wrote `equipment[i].name` (a display-label string), never `equipment[i].equipmentTypeId` (the actual foreign key `calibrationRecordService.createDraftRecord` requires, pointing at a `certificate_number_configs` document — see the doc comment on `CertificateNumberConfig` in `src/types/index.ts` around line 544 for the ADR-012 rationale). **No code path anywhere in the app had ever set `equipmentTypeId` on an item before this fix.** The fix added `handleEquipmentTypeNameChange` in `JobModal.tsx`, which on every name-dropdown change also resolves `certificateNumberConfigService.getConfigByEquipmentName(value)` and sets `equipmentTypeId` from the matched config's `id` (clearing it if no match). It also changed `handleEquipmentChange` from reading a closure `equipment` array to a functional `setEquipment(prev => ...)` update, specifically to avoid a stale-closure race between the synchronous `name` write and the async `equipmentTypeId` write.

**This second fix is very likely why this is the first time anyone has gotten far enough to actually mount the recording grid against a real Firestore-backed template/record at all** — before it, `createDraftRecord` threw immediately and the grid-mount code path was presumably only ever exercised by unit tests against small synthetic fixtures, never against this real template's real data. That reframes the bug: it may not be caused by anything added this session at all, just newly *reachable*.

## What has been ruled out so far (with reasoning, not just assumption)

- **The ADR-015 conversion pipeline itself, for the one column confirmed so far.** The user checked the "STD Convert 1" column's builder config: type `formula`, unit mode `Selectable` (choices `mV/V, N, kN, gF, kgF`), formula `((STD_C1*READ_STDR1) + (STD_C2*READ_STDR1**2) + (STD_C3*READ_...` (truncated in the screenshot), and **"Convert for display" is unchecked** — has never been checked. Every conversion-related code path added this session gates on `column.conversionEnabled` as its very first check (e.g. `src/services/recordingGridDocument.ts`'s `buildGridDocument` data-row loop: `if (col.column.type === 'formula' && col.column.conversionEnabled && ...)`; `findConversionSourceUnitMismatch`'s first line is `if (column.type !== 'formula' || !column.conversionEnabled) return null;`). With it off, these paths are true no-ops for this column.
- **NOT YET CONFIRMED for the other two formula-looking columns** ("UUC Reading 1", "STD Reading 1") — only STD Convert 1's config has been checked. This is an open item.
- **Row count is not the cause in the "huge dataset" sense** — the template's default row count is 5, not anomalously large.
- **`sameAs` unit-mode cycles are not implicated** — the columns visible are `selectable`, not `sameAs`; `resolveColumnUnitMap`'s cycle detection (`src/services/recordingGridDocument.ts`) was independently re-verified by hand-tracing a 2-cycle and confirmed to terminate correctly (a fresh `Set` per top-level key, `seen.has(key)` checked before recursing) — this logic was not modified this session, only given new callers.
- **`unitConversionRuleService.getAll()` is not a listener and shouldn't retry-loop** — it's a one-shot `getDocs` call with a plain single-field `orderBy('createdAt')`, which doesn't require a composite Firestore index. Reviewed the full file (`src/services/unitConversionRuleService.ts`) — no obvious hang source.
- **Cross-referenced the isolation test suite** — `src/services/__tests__/columnConversionIsolation.test.ts` (16 files grepped for conversion-shaped identifiers) still passes, confirming the recalculation engine (`recordRecalculation.ts`, `recorderTemplateMockup.ts`, the whole `src/modules/recorder/formula/` module) has zero knowledge of conversion and can't be looping because of it.

## Not yet ruled out / not yet investigated

- Whether "UUC Reading 1" or "STD Reading 1" have `conversionEnabled: true` (would reopen the ADR-015 pipeline as a suspect if so).
- The exact chain of code that runs on **first mount of a real record against real Firestore data**, independent of ADR-015 — i.e. `RecordingGrid.tsx`'s TREB `CreateSpreadsheet` + `applyLayout` + `buildGridDocument`, `useLiveRecalculation.ts`'s `computeStandardWarnings`, and whatever `resolveColumnUnitMap`/`effectiveColumnUnit` do against this template's actual column set (5 rows × however many columns, some `selectable`).
- Whether this template has a `type: 'standard'` reference-standard picker column (ADR-014) at all — "STD" in the visible column names may just mean "the Standard side of a UUC-vs-STD comparison," not the reference-standard picker feature. If it IS a `standard` column, `RecordingGrid.tsx`'s native `SetValidation` dropdown wiring and `useLiveRecalculation.ts`'s `computeStandardWarnings` (which now also runs the new D3 cross-check per formula column per row) become relevant.
- Firestore data shape mismatches: whether any field on the real record/template document arrives as an unconverted Firestore `Timestamp` where a `Date` is expected, or `columnUnits`/`conversionSnapshots` arrive as something unexpected that a `?? {}`/`?.` guard doesn't actually cover in every call site.
- A CPU profile has not yet been captured. The user was asked (not yet done) to open Chrome DevTools' Performance tab, start recording *before* navigating into the record, trigger the freeze, wait ~10s, then stop and check the Bottom-Up tab sorted by Self Time — this is the standard way to get the actual hot function despite the tab being unresponsive to input (V8's sampling profiler doesn't require the JS thread to cooperate). This is the single most useful next artifact — everything above is static-analysis inference, not a confirmed root cause.

## Key files touched this session (for review)

- `src/services/columnConversion.ts` (new) — pure D8 conversion pipeline
- `src/services/unitConversionRuleService.ts` (new)
- `src/services/conversionRuleValidation.ts` (new)
- `src/services/recordingGridDocument.ts` — `buildGridDocument`, `findConversionSourceUnitMismatch`, `findConversionFailures`, `resolveColumnUnitMap` (pre-existing, unmodified logic, new callers only)
- `src/modules/recorder/components/RecordingGrid.tsx` — `applyLayout`, `updateComputedValues`
- `src/modules/recorder/hooks/useLiveRecalculation.ts` — `computeStandardWarnings` (D3 cross-check added)
- `src/pages/RecordEntryPage.tsx` — loads `conversionRules`, computes `conversionFailures` via `useMemo`
- `src/services/calibrationRecordService.ts` — `commitRecord` (D7 snapshot; only runs at commit, not at record open, so unlikely relevant to this specific freeze)
- `src/components/JobModal.tsx` — `handleEquipmentTypeNameChange`, `handleEquipmentChange` (the equipment-type-id fix)

All of the above compiled clean under `npx tsc --noEmit` and the full Vitest suite (1183 tests / 66 files) was green at the time these changes were made. That only proves the code type-checks and the existing unit tests still pass — none of the existing tests exercise a real Firestore-backed record load with TREB actually mounted in a browser, which is exactly the gap this bug seems to live in.
