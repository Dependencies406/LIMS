# Handoff: New "Data Recorder" Module — Codebase Context

## 1. Project Overview
"lims-desktop" — a Laboratory Information Management System (LIMS) web app for
managing equipment calibration/control, customers, jobs/service requests,
PDF/document generation and templating, and spreadsheet-based workflows. React
SPA backed by Firebase (Auth/Firestore/Storage). [package.json:1-3]

## 2. Tech Stack
- React 18.2, react-router-dom 6.21, TypeScript 5.2, Vite 5 build/dev server. [package.json:12-51]
- State: zustand 4.3.7 (present as dep; usage not verified in files read this session — [UNVERIFIED] scope of use).
- Validation: zod 4.4.3 (present; specific recorder-relevant usage not verified — [UNVERIFIED]).
- Firebase 9.22.1: Auth, Firestore, Storage — single init module. [src/services/firebase.ts:1-54]
- PDF/export stack: jspdf, jspdf-autotable, exceljs, html2canvas, handsontable, jszip, mammoth — for document/spreadsheet features (likely not needed by a recorder unless it exports data).
- Test: vitest 3.2.4 + @testing-library/react 16.3.2, run via `npm test` (vitest run) or `npm run test:watch`. [package.json:9-10]
- Styling: tailwindcss 3.4.17 + postcss/autoprefixer.

## 3. Architecture Map
- `src/services/` — flat directory of ~40 singleton service objects, one file per
  domain concern (e.g. `equipmentConstantService.ts`, `conversionEquationService.ts`,
  `jobService.ts`). Pattern: import shared Firestore helpers from `./firebase`,
  define local mapper functions, export a plain object literal with methods
  (`subscribe`, `add`, `update`, `delete`, sometimes pure helpers like `evaluate`).
- `src/pages/` — route-level page components, `src/pages/equipment/` holds
  equipment-specific pages (dashboard, detail, calibration plan, usage log,
  registration wizard, retirement).
- `src/components/` — reusable UI components, with sub-folders per domain
  (`jobs`, `customers`, `users`, `pdf`, `builtin`, `common`) plus `__tests__/`.
- `src/modules/` — larger self-contained feature modules (calibration, forms,
  pdf-template-builder, report-designer, spreadsheet, spreadsheet-templates).
  A new "data recorder" module would likely fit here as `src/modules/<name>/`
  if it's a self-contained feature, OR as a `src/services/<name>Service.ts` +
  UI wired into `EquipmentDetailPage.tsx` if it's equipment-scoped like the
  constants/conversion-equation features below. [UNVERIFIED which the designer
  intends — see Scope Questions already raised].
- `src/types/index.ts` (817 lines) — single central file with all shared
  TypeScript interfaces/types, grouped by domain with comment-banner headers
  (e.g. `// ─── Conversion Equations ───`).
- `src/dataLifecycle/` — currently just `firestoreOwnership.ts` plus
  DEPLOYMENT.md/README.md notes; not read in depth this session — [UNVERIFIED]
  whether relevant to a recorder's data lifecycle/retention needs.
- `src/contexts/` — React Context providers: AuthContext, CompanyInfoContext,
  PdfSettingsContext, PermissionContext.
- `src/config/firebase.ts` — Firebase project config (not read in depth this session).

## 4. Data Sources (existing, potentially tappable)
- Equipment constants (`k1, k2, …`) entered manually per equipment record via
  `equipmentConstantService`. [src/services/equipmentConstantService.ts:71-127]
- Conversion equations (polynomial, degree 1–5) entered manually per equipment,
  used to convert a raw input value to a calibrated output value via
  `.evaluate(equation, inputValue)`. [src/services/conversionEquationService.ts:132-141]
- Both are wired into `EquipmentDetailPage.tsx` via dedicated tabs
  (`ConversionEquationTab`, constants tab) with a `TrialPanel` that lets a user
  type a raw value and see the converted result live.
  [src/pages/equipment/EquipmentDetailPage.tsx:1062-1067, 1480-1521, 1691-1761]
- No existing sensor/hardware input, file-import, or streaming data source was
  found in files read this session — the "raw input value" in `TrialPanel` is
  manual user text entry, not an automated recording. [UNVERIFIED whether any
  hardware/serial/file-based ingestion exists elsewhere in the repo.]

## 5. Existing Storage
- Firestore is the only backend datastore observed. Equipment-scoped data is
  stored under `equipmentControl/{equipmentId}/...` with subcollections:
  `usageLogs`, `calibrationEvents`, `documents`, `conversionEquations`,
  `constants`. [firestore.rules:188-213]
- Firestore security rule for all of the above: `allow read, write: if
  request.auth != null` — any authenticated user, no field-level or role-based
  restriction observed at this path. [firestore.rules:191-212]
- No local storage / IndexedDB usage was verified this session — [UNVERIFIED].
- Document/type schemas for the two closest analogs are fully defined in
  `src/types/index.ts:734-798` (`EquationCoefficient`, `ConversionEquation`,
  `ConversionEquationInput`, `EquipmentConstant`, `EquipmentConstantInput`).
- Firestore timestamps are read via a shared `toDate()` helper duplicated in
  both new service files, converting Firestore `Timestamp`/string/`Date` to
  `Date` uniformly. [src/services/equipmentConstantService.ts:43-48,
  src/services/conversionEquationService.ts:28-33]

## 6. Integration Points
- Any new equipment-scoped module should follow the existing
  `equipmentControl/{equipmentId}/<subcollection>` pattern and add a matching
  `match /<subcollection>/{id} { allow read, write: if request.auth != null; }`
  block in `firestore.rules` (same file, same style as lines 194-212).
- Real-time UI sync uses Firestore `onSnapshot` inside a service `.subscribe()`
  method returning an unsubscribe function — this is the standard integration
  seam for live data, used identically in both new services.
- Page-level wiring happens in `EquipmentDetailPage.tsx`, which imports the
  service and type, holds subscribed data in local `useState`, and renders a
  dedicated tab component — this is the pattern a new recorder tab would follow
  if it is equipment-scoped.
- `conversionEquationService.evaluate()` is a pure function already available
  for converting a raw value to output using a stored equation — a recorder
  that stores measurement readings could reuse this instead of reimplementing
  polynomial evaluation.

## 7. Conventions
- Service objects are plain exported object literals (`export const xService =
  {...}`), not classes.
- File-top JSDoc block states Firestore path and field meanings; inline JSDoc
  on each public method.
- Async CRUD methods (`add`, `update`, `delete`) always stamp
  `serverTimestamp()` on `createdAt`/`updatedAt`.
- `*Input` types are derived via `Omit<T, 'id' | 'createdAt' | 'updatedAt'>`
  rather than hand-duplicated.
- Legacy-data normalization handled defensively at the mapper level (e.g.
  `normalizeKey()` converts old `"C1"` docs to `"k1"` transparently) rather than
  via migration scripts. [src/services/equipmentConstantService.ts:38-41]
- No explicit error-handling/try-catch wrapping observed in these two service
  files; errors from Firestore calls propagate to the caller, and `subscribe`
  takes an optional `onError` callback.
- Tests live beside their domain in `__tests__/` folders
  (`src/services/__tests__/*.test.ts`, `src/components/__tests__/*.test.tsx`),
  named `<subject>.test.ts(x)`, run with vitest.

## 8. Environment
- Dev server: `npm run dev` (Vite). Build: `npm run build`. Preview: `npm run
  preview`. Tests: `npm test` (single run) or `npm run test:watch`.
- No `.env`/emulator config was inspected this session — [UNVERIFIED] whether
  local dev talks to a live Firebase project or an emulator suite.
- Per project CLAUDE.md rules (not code, but binding process constraints): confirm
  which git branch/worktree is active and where the dev server is actually
  serving from before making any edits in the next (implementation) session.

## 9. Constraints Observed
- Firestore rules grant blanket authenticated read/write on equipment
  subcollections — no per-field validation or rate limiting at the rules
  layer, so any client-side validation (e.g. zod) is the only such tool
  currently in the dependency list, not confirmed to be applied to
  equipment subcollections. [UNVERIFIED usage of zod in this specific path]
- No batching/pagination observed in `equipmentConstantService`/
  `conversionEquationService` — both `subscribe`/`getAll` fetch the full
  subcollection unfiltered/unpaged, ordered by `createdAt asc`. A recorder
  producing high-frequency readings should consider this before reusing the
  same unbounded-subscription pattern.
- No auth-role/permission check beyond `request.auth != null` was found gating
  writes to equipment data at the rules layer, though a `PermissionContext`
  exists client-side ([src/contexts] listing only — contents not read this
  session, [UNVERIFIED] what it enforces).
