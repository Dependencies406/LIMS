# Phase 35D Result — Client switched to the allocation function; Generate opened to technicians

Date: 2026-09-06
Branch: `feature/trace-ui`
Status: **COMPLETE, pending the owner's hosting deploy (Task 5e).**

The browser can no longer advance the certificate counter. Allocation is a call
to `allocateCertificateNumber`, and any signed-in user may press Generate
(ADR-019 D2/D3/D4). The allocation maths moved into a pure module so that
deleting the client's copy did not delete the only tests of it.

This supersedes the first issue's result, which stopped at Task 3a.

---

## 1. Pre-work and the gate

### 1.1 Pre-work (CLAUDE.md RULE 3/4/8) — verbatim

```
=== PWD ===
/c/Users/seela/Desktop/LIMS-New
=== git branch ===
  feature/analysis-module
  feature/calculation-trace
  feature/ci-test-gate
  feature/data-recorder
* feature/trace-ui
  master
  recovery-before-20251128-113145
  recovery/20251128-115142
=== git worktree list ===
C:/Users/seela/Desktop/LIMS-New  0305d35 [feature/trace-ui]
=== git status ===
On branch feature/trace-ui
Your branch is up to date with 'origin/feature/trace-ui'.

Changes not staged for commit:
	modified:   docs/DATA_MGMT_MODULE_GLOSSARY.md
	modified:   firestore.rules
	modified:   functions/src/index.ts
	modified:   package-lock.json
	modified:   package.json
	modified:   scripts/backfillEquipmentIds.ts
	modified:   scripts/reportEquipmentTypeNames.ts
	modified:   scripts/reportRecordPermissionRolloutReadiness.ts
	modified:   src/App.tsx
	modified:   src/components/JobModal.tsx
	modified:   src/main.tsx
	modified:   src/services/firebase.ts

Untracked files:
	docs/PHASE_34_PROMPT_PERMISSION_MODEL_AUDIT.md
	docs/PHASE_34_RESULT.md
	docs/PHASE_35A_PROMPT_PROVE_SERVER_ALLOCATION_GROUND.md
	docs/PHASE_35A_RESULT.md
	docs/PHASE_35B_PROMPT_REPAIR_ADMIN_SCRIPTS.md
	docs/PHASE_35B_RESULT.md
	docs/PHASE_35C_PROMPT_SERVER_SIDE_ALLOCATION.md
	docs/PHASE_35C_RESULT.md
	docs/PHASE_35D_PROMPT_SWITCH_CLIENT_TO_FUNCTION.md
	docs/PHASE_35D_RESULT.md
	docs/PROJECT_INSTRUCTION.md
	docs/adr/ADR-019-certificate-number-allocation.md
	functions/src/allocateCertificateNumber.ts
	functions/src/ping.ts
	scripts/__tests__/
	scripts/reportCertificateNumberConfigs.ts
	src/components/__tests__/JobModalCertificateNumberAdminGate.test.tsx
	src/dev/
```

Node processes, full command lines:

```
ProcessId   : 25752
CommandLine : "C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js" "-y"
              "@modelcontextprotocol/server-pdf" "--stdio"

ProcessId   : 20900
CommandLine : "C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js" -y
              @modelcontextprotocol/server-pdf --stdio

ProcessId   : 28320
CommandLine : "node" "C:\Users\seela\AppData\Local\npm-cache\_npx\6583fba12287d067\node_modules\.bin\..\@modelcontextprotocol\server-pdf\dist\index.js" --stdio

ProcessId   : 20344
CommandLine : "node" "C:\Users\seela\AppData\Local\npm-cache\_npx\6583fba12287d067\node_modules\.bin\..\@modelcontextprotocol\server-pdf\dist\index.js" --stdio
```

| Check | Result |
|---|---|
| Working directory | `C:\Users\seela\Desktop\LIMS-New` |
| Branch | `feature/trace-ui` — as expected |
| Worktrees | Exactly one: `C:/Users/seela/Desktop/LIMS-New` |
| Anything from `LIMS-New-Backup` | **None.** No process references that path. |
| Dev server | **Not running.** All four node processes are MCP `server-pdf` helpers, unrelated to this repo. |

### 1.2 Task 1 — THE GATE: PASSED

```
401
{"error":{"message":"You must be logged in to allocate a certificate number.","status":"UNAUTHENTICATED"}}
```

The function's own message, in the callable protocol's JSON envelope — so the
endpoint is reachable and the body executes.

---

## 2. Task 3a — the re-confirmed caller list

Matches fact 3 exactly. No divergence, so no stop.

| Symbol | Location | Resolves config by |
|---|---|---|
| `generateCertificateNumber(configId)` | `certificateNumberGeneratorService.ts:245` (internal) | — |
| `generateCertificateNumber(configId)` | **`EquipmentSpreadsheetModal.tsx:1085`** | **array position** (`certificateConfigs[0]`) |
| `generateCertificateNumberForEquipment(name)` | `JobModal.tsx:1182` | equipment **name** |
| `previewCertificateNumber(configId)` | test only — no production caller | — |
| `formatCertificateNumberFromConfig` | no callers at all | — |

---

## 3. The diff, file by file

### 3.1 `functions/src/certificateNumberMath.ts` — **NEW**

The allocation maths as pure functions — `LAB_TIME_ZONE`, `labYearMonth`,
`shouldReset`, `nextNumber`, `formatCertificateNumber` — with no Firebase
imports and no clock reads, so the app's vitest suite can import and test them
directly across the package boundary.

### 3.2 `functions/src/allocateCertificateNumber.ts`

Deletes its inline formatter and inline reset logic and imports them from
`./certificateNumberMath`; the year and month now come from `labYearMonth` in
Asia/Bangkok instead of the host's UTC (ADR-019 D8).

```diff
+import {
+  formatCertificateNumber,
+  labYearMonth,
+  nextNumber as computeNextNumber,
+  shouldReset as computeShouldReset,
+} from './certificateNumberMath';

-        const now = new Date();
-        const currentYear = now.getFullYear();
-
-        let shouldReset = false;
-        if (config.resetPolicy === 'yearly') {
-          shouldReset = config.currentYear !== currentYear;
-        } else if (config.resetPolicy === 'monthly') {
-          shouldReset =
-            !config.lastResetAt ||
-            config.lastResetAt.getFullYear() !== currentYear ||
-            config.lastResetAt.getMonth() !== now.getMonth();
-        }
-        const baseNumber = shouldReset ? 0 : config.currentNumber;
-        const nextNumber = baseNumber + 1;
+        const now = new Date();
+        const currentYear = labYearMonth(now).year;
+
+        const shouldReset = computeShouldReset(config, now);
+        const nextNumber = computeNextNumber(config, shouldReset);
```

`currentYear`'s missing-field default also moved to lab time. The write set is
unchanged — still `currentNumber`, `currentSequence`, `currentYear`,
`lastAllocatedAt`, plus `lastResetAt` on reset, and still never `updatedAt`.

### 3.3 `src/services/certificateNumberGeneratorService.ts`

Deletes the client-side allocation transaction; turns
`generateCertificateNumberForEquipment` into a callable invocation; adds the
lab-time helpers and the reciprocal twin comment; keeps preview and formatting.

- **`generateCertificateNumber` (`:65-148`) — DELETED**, along with the
  `db`/`doc`/`getDoc`/`runTransaction`/`Timestamp` imports it needed.
- `generateCertificateNumberForEquipment(equipmentName, jobId, equipmentIndex)`
  now calls `httpsCallable(functions, 'allocateCertificateNumber')` and returns
  `result.data.certificateNumber`. No try/catch, so the server's
  human-readable message reaches the caller unchanged; **no retry**, because a
  retry after a timeout burns a number (ADR-019 D6).
- `previewCertificateNumber` and `formatCertificateNumber` kept, both now
  evaluating year and month via `labYearMonth`.
- The one-sided twin comment at `:26` is replaced with a reciprocal one naming
  `functions/src/certificateNumberMath.ts` and pointing at the test that
  enforces the pairing.

### 3.4 `src/components/JobModal.tsx`

Passes the job id and equipment index to the callable, and removes the interim
admin gate so any signed-in user may press Generate.

After the gate removal the file's diff against HEAD is **only** the call site —
which is the proof Task 4a asked for, that every gated expression returned to
exactly its pre-35A form:

```diff
-      const certificateNumber = await generateCertificateNumberForEquipment(equipmentName);
+      const certificateNumber = await generateCertificateNumberForEquipment(
+        equipmentName,
+        currentJob.id,
+        equipmentIndex
+      );
```

`CERTIFICATE_NUMBER_ADMIN_ONLY_TITLE` and its doc comment are gone; the four
`!isAdmin` terms are gone; `isAdmin` remains in the `useAuth()` destructure
(`:126`) because it is still used at `:1512`.

### 3.5 `src/components/EquipmentSpreadsheetModal.tsx`

Repointed at the same callable, resolving by equipment **name** instead of
`certificateConfigs[0]` (planner Decision 1); the component itself is untouched
otherwise and **not** deleted.

```diff
-import { generateCertificateNumber } from '../services/certificateNumberGeneratorService';
+import { generateCertificateNumberForEquipment } from '../services/certificateNumberGeneratorService';

-    const configToUse = certificateConfigs[0];
-    console.log('[EquipmentSpreadsheetModal] Using certificate config:', configToUse.id, configToUse.name);
-
     setGeneratingCertificateNumber(true);
     try {
-      const certificateNumber = await generateCertificateNumber(configToUse.id);
+      const certificateNumber = await generateCertificateNumberForEquipment(
+        String(equipment.name || '').trim(),
+        job.id,
+        equipmentIndex
+      );
```

### 3.6 `src/services/__tests__/certificateNumberGeneratorService.test.ts` — replaced

Rebuilt to test `functions/src/certificateNumberMath.ts` directly, plus the
twin-agreement test and the surviving preview coverage. 14 tests → 18.

### 3.7 `src/components/__tests__/JobModalCertificateNumberGenerateControl.test.tsx` — replaces `…AdminGate.test.tsx`

Asserts the new behaviour — Generate is ENABLED for a non-admin and for an
admin, at both render sites — and that no control still advertises the retired
admin-only explanation. 5 tests → 6. Renamed because the old name described a
gate that no longer exists.

### 3.8 `src/main.tsx` and `src/dev/`

The two TEMPORARY Phase 35A probe lines are removed and
`src/dev/pingFunctionsProbe.ts` is deleted; `src/dev/` was then empty and was
removed. `functions/src/ping.ts` is left in place as a diagnostic.

`git diff -- src/main.tsx` is now **empty** — the file is byte-identical to
HEAD, which confirms the probe lines were its only modification and that
nothing else was disturbed.

---

## 4. Proof: the client can no longer write to `certificate_number_configs` on the allocation path

The deleted code is `generateCertificateNumber` in
`src/services/certificateNumberGeneratorService.ts:65-148` — the
`runTransaction` that read the config, computed the next number, and wrote
`currentNumber` / `currentSequence` / `currentYear` / `lastAllocatedAt` back.

Nothing calls it, because it no longer exists:

```
$ grep -rn "generateCertificateNumber\b" src/ --include=*.ts --include=*.tsx | grep -v ForEquipment
src/services/certificateNumberConfigService.ts:203:      // generateCertificateNumber's allocation transaction. A plain updateDoc
src/services/__tests__/certificateNumberGeneratorService.test.ts:5: * `generateCertificateNumber` transaction. The fourteen tests that used to live
```

Both hits are prose inside comments. **There is no call site and no
declaration.**

```
$ grep -n "runTransaction" src/services/certificateNumberGeneratorService.ts
7: * `runTransaction` that used to advance `certificate_number_configs.currentNumber`
```

Also a comment. The service imports no Firestore write primitive at all any
more — only `functions` and `httpsCallable`.

Both call sites now route through the server:

```
src/components/JobModal.tsx:1166                 generateCertificateNumberForEquipment(
src/components/EquipmentSpreadsheetModal.tsx:1088 generateCertificateNumberForEquipment(
```

**What still writes that collection, correctly:**
`certificateNumberConfigService.ts` (`:168` `setDoc`, `:206` and `:268`
`runTransaction`) — creating, editing and manually resetting an equipment type.
That is *configuration editing*, which ADR-019 D4 deliberately leaves
admin-only, and `firestore.rules:161-165` is unchanged and still enforces it.
The allocation path is the only thing that moved.

Net effect: a browser cannot advance the counter whatever it sends. The rule
refuses the write for non-admins, and no client code attempts it any more.

---

## 5. The twin-agreement test

**File:** `src/services/__tests__/certificateNumberGeneratorService.test.ts`
**Suite:** `twin agreement — the client and Cloud Function formatters must not drift`

| Test | What it covers |
|---|---|
| `agrees character for character across every combination` | Runs the client's `formatCertificateNumber` (via `formatCertificateNumberFromConfig`) and the function's over the **cartesian product** of 8 configs × 8 numbers × 4 abbreviations × 4 years = **1024 comparisons**, asserting exact string equality each time. A final assertion pins the comparison count at 1024 so the loops cannot silently collapse to zero and pass vacuously. |
| `agrees on the year split — four-digit in, last two digits out (ADR-019 D5)` | Pins the actual output (`UTM-26001`, `UTM-07001`), so both copies drifting *together* would still be caught. |

The 8 configs deliberately include the awkward shapes: `/` and empty
separators, padding 1 and 6, an empty prefix, and a prefix already containing
separators. Numbers span 1 → 123456 so padding overflow is exercised.

This replaces the old "preview matches what an allocation would actually
produce" test and is strictly stronger: **that test compared two calls into the
same implementation; this one compares the two implementations against each
other.** It is the executable half of the twin comments — 35C could write only
the comment, and only on one side.

Also added, the lab-timezone case Task 2c asked for:
`returns the BANGKOK year for an instant that is still the previous year in UTC`
— `2026-12-31T17:30:00Z` is `2027-01-01T00:30` Bangkok, asserted to yield year
2027 and month 0, alongside `instant.getUTCFullYear() === 2026` to show exactly
what the old code saw. `shouldReset` is then asserted to reset at that instant
for a counter still marked 2026.

---

## 6. The server still runs its pre-D8 build

**The Cloud Function was NOT redeployed in this phase**, as instructed.

`functions/src/allocateCertificateNumber.ts` and the new
`functions/src/certificateNumberMath.ts` compile cleanly, but the deployed
revision of `allocateCertificateNumber` is still the 35C build. **Until the
function is next deployed, the server computes the numbering year and month in
UTC, not Asia/Bangkok.**

Consequence while that remains true: the browser's preview uses lab time and
the server's allocation uses UTC, so for 1 Jan 00:00–07:00 Bangkok they would
disagree — the preview would show the new year while the issued number carried
the old one. This is the exact divergence D8 exists to close, and it is closed
in the source but not yet in production.

Per ADR-019 D8 the lab does not work on 1 January, so this is insurance rather
than a live defect. It should nonetheless ship with the next
`firebase deploy --only functions:allocateCertificateNumber`, which is **not**
part of this phase.

---

## 7. Verification

### 7.1 `npx tsc --noEmit` (Task 5a)

```
$ npx tsc --noEmit
tsc: CLEAN (no output)
```

Covers `src/` only; `tsconfig.json` excludes `src/**/__tests__/**`, so the
cross-package test import is not type-checked here — it is exercised by vitest
instead.

### 7.2 `npm --prefix functions run build` (Task 5b)

```
$ npm --prefix functions run build

> build
> tsc
```

Clean, under `strict: true`.

### 7.3 `npm test` (Task 5c)

| | Files | Tests |
|---|---|---|
| Before (35C baseline) | 82 | 1721 |
| **After** | **82** | **1726** |

```
 Test Files  82 passed (82)
      Tests  1726 passed (1726)
   Duration  16.88s
```

Every delta accounted for:

| Change | Files | Tests |
|---|---|---|
| `certificateNumberGeneratorService.test.ts` rewritten | ±0 (replaced in place) | 14 → 18 = **+4** |
| `…AdminGate.test.tsx` → `…GenerateControl.test.tsx` | ±0 (one file replaced one-for-one) | 5 → 6 = **+1** |
| **Total** | **0** | **+5** |

1721 + 5 = 1726. ✅ No other test file was touched.

### 7.4 `npm run build` (Task 5d)

```
✓ built in 15.29s
dist/assets/index-C1LzaPuu.js   4,946.18 kB │ gzip: 1,297.77 kB
```

Succeeds. The chunk-size and `exceljs` dynamic-import warnings are pre-existing
and unrelated to this phase.

---

## 8. git status — every file accounted for

| File | Status | This phase? |
|---|---|---|
| `functions/src/certificateNumberMath.ts` | new | ✅ Task 2 |
| `functions/src/allocateCertificateNumber.ts` | new (35C), edited | ✅ Task 2 |
| `src/services/certificateNumberGeneratorService.ts` | modified | ✅ Task 3b |
| `src/components/JobModal.tsx` | modified | ✅ Tasks 3c, 4a |
| `src/components/EquipmentSpreadsheetModal.tsx` | modified | ✅ Task 3c |
| `src/services/__tests__/certificateNumberGeneratorService.test.ts` | modified | ✅ Task 3d |
| `src/components/__tests__/JobModalCertificateNumberGenerateControl.test.tsx` | new | ✅ Task 4b |
| `src/components/__tests__/JobModalCertificateNumberAdminGate.test.tsx` | **deleted** | ✅ Task 4b |
| `src/dev/pingFunctionsProbe.ts`, `src/dev/` | **deleted** | ✅ Task 4c |
| `src/main.tsx` | **reverted to HEAD** (no diff) | ✅ Task 4c |
| `docs/PHASE_35D_RESULT.md` | new | ✅ Task 6 |
| `firestore.rules`, `functions/src/index.ts`, `functions/src/ping.ts` | 35C, untouched here | — |
| `package.json`, `package-lock.json`, `src/App.tsx` | uncommitted migration, **untouched** | — |
| `docs/*`, `scripts/*` | earlier phases, untouched | — |

Nothing committed, stashed, checked out or reverted. No branch or worktree
created. No dependency added; no `npm install/update/ci` run. `firestore.rules`
unchanged. Nothing deployed.

---

## 9. Things that contradicted this prompt

### 9.1 — `formatCertificateNumber` cannot be both "verbatim" and clock-free

Task 2 requires the module to contain "nothing that reads a clock except
through an argument you pass in", **and** that `formatCertificateNumber` be
"moved verbatim". The current implementation contains:

```ts
const currentYear = year || new Date().getFullYear();
```

which is a clock read. The two instructions cannot both be satisfied exactly.

**Resolved by keeping the signature and behaviour, and making the fallback obey
D8:** the parameter stays optional and the fallback became
`labYearMonth(new Date()).year`. Every one of the four call sites passes an
explicit `year`, so **the branch is unreachable in practice and no behaviour
changed**; but had it ever been reached on the server it would have printed a
UTC year, which is precisely the D8 bug. Making the dead branch lab-time is
strictly safer than leaving it, and safer than removing the parameter (which
would have changed `formatCertificateNumberFromConfig`'s public signature).

Flagged rather than hidden: the module is pure for every real call, not for
every possible call, and its header says so.

### 9.2 — `previewCertificateNumber` has no production caller

Task 3d speaks of "keeping any `previewCertificateNumber` coverage that still
applies", and Task 3d/3b treat preview as a live feature. It is called only
from its own tests — no component invokes it. Keeping it is still right (it is
the executable statement of what a number *will* be, and the reset logic it
mirrors is real), but it is dead code in the shipped app today, not a feature
users can see. Its coverage was kept and extended to four tests, including a new
one asserting preview **writes nothing** — the property that matters most now
that it is the only client-side code touching a config.

### 9.3 — A now-stale comment left in place deliberately

`src/services/certificateNumberConfigService.ts:203` still refers to
"`generateCertificateNumber`'s allocation transaction", which no longer exists.
Correcting it means editing a file this phase has no other reason to touch, so
it was left alone and is recorded here instead. One-line follow-up.

### 9.4 — Fact 6's line number drifted (harmless)

Fact 6 states `isAdmin` is used at `JobModal.tsx:1524`. It is at `:1512` after
the 16-line `CERTIFICATE_NUMBER_ADMIN_ONLY_TITLE` block was removed — the same
usage, shifted by the deletion. The instruction it supports (keep the `useAuth()`
destructure) was followed; `isAdmin` remains at `:126`.

### 9.5 — Confirmed correct

The rest of the prompt held up: the caller list (fact 3), the unreachability of
`EquipmentSpreadsheetModal` (fact 4), the 14 tests in six groups (fact 5), the
four admin-gate sites (fact 6), the scaffolding (fact 8), the code map (fact 9),
the 82/1721 baseline (fact 11), and — the one that mattered most — **the
cross-package test import works**: vitest's `include` glob controls discovery,
not resolution, so `../../../functions/src/certificateNumberMath` imports
cleanly from a test under `src/`.

---

## 10. Task 5e — over to the owner

```
firebase deploy --only hosting
```

This rebuilds and publishes the app. The predeploy hook (`firebase.json:4-8`)
runs `npm test`, then the validation report, then `npm run build` — so **a
failing test blocks the deploy rather than shipping it.** All three have just
been run clean here, so it should pass, but the gate is real.

If anything goes wrong after release: **Firebase Console → Hosting → release
history → Rollback** restores the previous version immediately.

Nothing else needs deploying. `firestore.rules` is unchanged this phase, and the
Cloud Function is deliberately not redeployed (§6).

### After deploying

The phase is done when the owner signs in **as the Standard user that started
all this**, opens the demo job, presses Generate on an item, and gets a
certificate number. Then, as an admin: Settings → Certificate Number Manager
still allows editing a prefix, and the Standard user still cannot. And in
Firestore, `certificateNumberAllocations` holds one new document named after the
number just issued, recording which job and which person took it.
