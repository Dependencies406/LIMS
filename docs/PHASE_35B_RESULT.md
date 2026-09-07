# Phase 35B Result — Repair the admin scripts

Prompt: `docs/PHASE_35B_PROMPT_REPAIR_ADMIN_SCRIPTS.md`.

**Headline: Task 2's repair is done and proven correct (Task 1, Task 3). Task 4's
test is written, placed exactly where specified, and proven to catch the
regression — but it cannot be honestly reported as raising `npm test`'s count,
because the project's real vitest config never scans `scripts/` at all. See §0
and §5 for why, and what I did about it without touching a file outside this
phase's permitted list.**

---

## 0. A prompt contradiction found in Task 4 — stopped and reported, not guessed

Task 4 says: add `scripts/__tests__/adminScriptImports.test.ts`, then Task 5 says
the count "must be 83 files and 1721 + (tests you added)."

The project's actual test runner config (`vite.config.ts`, `test.include`) is:

```
include: ['src/**/*.{test,spec}.{ts,tsx}'],
```

This glob **structurally cannot match** `scripts/__tests__/adminScriptImports.test.ts`
— it does not start with `src/`. I confirmed this is not a filtering fluke by
asking vitest to run that exact file directly:

```
$ npx vitest run scripts/__tests__/adminScriptImports.test.ts

No test files found, exiting with code 1
filter: scripts/__tests__/adminScriptImports.test.ts
include: src/**/*.{test,spec}.{ts,tsx}
```

And by confirming `npm test` afterward still reports the pre-existing count —
**82 files / 1721 tests**, unchanged (full output in §5).

**The fix would be editing `vite.config.ts`'s `include` pattern.** That file is
not on this phase's permitted list ("Touch ONLY these files: the three scripts
named in fact 2, the new test file, and docs/PHASE_35B_RESULT.md. Anything
else — stop and ask."), so per the prompt's own instruction — "If a stated fact
in this prompt turns out to be wrong, STOP and report it" — I did not touch it.

**What I did instead**, to satisfy everything Task 4 actually asks for without
guessing at scope I wasn't given:

1. Wrote the test file exactly at the path and with exactly the two assertions
   specified, discovering scripts by reading the directory (not a hard-coded
   list) — this part of Task 4 is fully satisfied and is real, correct code
   sitting in the repo at the right path, ready to start running the moment the
   config is widened.
2. To produce the "prove it fails, then prove it passes" evidence Task 4 asks
   for, I ran it under a **temporary vitest config file that lives outside the
   repo**, in my scratchpad directory, purely as a test harness for verification
   — never committed, never referenced by any repo file, and deleted before
   finishing (see §4). This is not a workaround that ships; it is the same kind
   of throwaway proof step as running `node -e "..."` to check a runtime fact.
3. I did **not** edit `vite.config.ts`, `package.json`, or move the test file to
   `src/` to make it "just work" — either would be scope not on the permitted
   list, and moving it to `src/` would also violate Task 4's own instruction to
   put it at `scripts/__tests__/`.

**Net effect the owner should know:** the test is real, correct, sitting at the
right path, and demonstrated (outside the real config) to catch the exact
regression it's meant to catch. It will silently not run under `npm test` until
someone (with authority over `vite.config.ts`) adds a `scripts/**` pattern to
`test.include`. This is a **one-line owner decision**, not a coding problem:

```diff
- include: ['src/**/*.{test,spec}.{ts,tsx}'],
+ include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.ts'],
```

I recommend it, but did not make it, since it is outside my permitted scope for
this phase.

---

## 1. Pre-work (CLAUDE.md RULE 3/4/8)

```
$ git branch
  feature/analysis-module
  feature/calculation-trace
  feature/ci-test-gate
  feature/data-recorder
* feature/trace-ui
  master
  recovery-before-20251128-113145
  recovery/20251128-115142

$ git worktree list
C:/Users/seela/Desktop/LIMS-New  0305d35 [feature/trace-ui]

$ git status
On branch feature/trace-ui
Your branch is up to date with 'origin/feature/trace-ui'.

Changes not staged for commit:
	modified:   docs/DATA_MGMT_MODULE_GLOSSARY.md
	modified:   functions/src/index.ts
	modified:   package-lock.json
	modified:   package.json
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
	docs/PROJECT_INSTRUCTION.md
	docs/adr/ADR-019-certificate-number-allocation.md
	functions/src/ping.ts
	scripts/reportCertificateNumberConfigs.ts
	src/components/__tests__/JobModalCertificateNumberAdminGate.test.tsx
	src/dev/
```

Branch is `feature/trace-ui` as expected, with the dependency migration still
uncommitted (unchanged from Phases 35A). **Exactly one worktree**, at the project
root.

### Node processes (full command lines)

```
ProcessId : 7040
CommandLine : "C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev

ProcessId : 35712
CommandLine : "node" "C:\Users\seela\Desktop\LIMS-New\node_modules\.bin\..\vite\bin\vite.js"

ProcessId : 8780, 23308, 21652, 2760
CommandLine : npx @modelcontextprotocol/server-pdf --stdio   (MCP tooling, unrelated to this repo)
```

**Nothing runs from `LIMS-New-Backup`.** Every node process resolves either to
the project root's own `node_modules` or to the global npm/MCP install. The dev
server (this time PID 35712/7040 — a fresh instance started during Phase 35A
after the original one died mid-session) serves `C:\Users\seela\Desktop\LIMS-New`,
the directory edited in this phase.

CLAUDE.md line 145's OneDrive path and its `master`-branch healthy-state
assumption are both stale, as already recorded in `PHASE_34_RESULT.md` §1.

---

## 2. Task 1 — the premise, confirmed before fixing anything

```
$ node -e "const a=require('firebase-admin'); for (const k of ['apps','credential','firestore','initializeApp']) console.log(k, typeof a[k]);"
apps undefined
credential undefined
firestore undefined
initializeApp function
```

`admin.apps`, `admin.credential` and `admin.firestore` are genuinely `undefined`
on the installed firebase-admin 14.3.0. The premise is real.

```
$ npm run report:equipment-type-names

> lims-desktop@0.1.0 report:equipment-type-names
> tsx scripts/reportEquipmentTypeNames.ts

Note: this script performs zero writes regardless of flags; pass --dry-run for clarity if you like.
Report failed: TypeError: Cannot read properties of undefined (reading 'length')
    at main (C:\Users\seela\Desktop\LIMS-New\scripts\reportEquipmentTypeNames.ts:31:19)
```

```
$ npm run report:record-permission-rollout

> lims-desktop@0.1.0 report:record-permission-rollout
> tsx scripts/reportRecordPermissionRolloutReadiness.ts

Note: this script performs zero writes regardless of flags; pass --dry-run for clarity if you like.
Report failed: TypeError: Cannot read properties of undefined (reading 'length')
    at main (C:\Users\seela\Desktop\LIMS-New\scripts\reportRecordPermissionRolloutReadiness.ts:37:19)
```

Both fail at exactly the line numbers the prompt named (`:31` and `:37`).

`backfillEquipmentIds.ts` was **not run**, per instruction. Read instead:

- Lines 43-48: identical `admin.apps.length` / `admin.initializeApp(...admin.credential.applicationDefault())` / `admin.firestore()` pattern — same failure mode, same line-for-line shape as the two confirmed-broken scripts.
- Line 77: `admin.firestore.FieldValue.serverTimestamp()` — a **second**, distinct
  use of the removed namespace, inside the write path.

The premise holds for all three files. Proceeding to Task 2.

---

## 3. Task 2 — the repair

Per-file, every changed line:

### `scripts/reportEquipmentTypeNames.ts`

```diff
-import * as admin from 'firebase-admin';
+import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
+import { getFirestore } from 'firebase-admin/firestore';
 import { buildNameReport, formatNameReport, type NameSource } from '../src/utils/equipmentTypeNameReport';

-  if (!admin.apps.length) {
-    admin.initializeApp({
-      credential: admin.credential.applicationDefault(),
+  if (!getApps().length) {
+    initializeApp({
+      credential: applicationDefault(),
     });
   }
-  const db = admin.firestore();
+  const db = getFirestore();
```

### `scripts/reportRecordPermissionRolloutReadiness.ts`

```diff
-import * as admin from 'firebase-admin';
+import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
+import { getFirestore } from 'firebase-admin/firestore';

-  if (!admin.apps.length) {
-    admin.initializeApp({
-      credential: admin.credential.applicationDefault(),
+  if (!getApps().length) {
+    initializeApp({
+      credential: applicationDefault(),
     });
   }
-  const db = admin.firestore();
+  const db = getFirestore();
```

### `scripts/backfillEquipmentIds.ts`

```diff
-import * as admin from 'firebase-admin';
+import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
+import { getFirestore, FieldValue } from 'firebase-admin/firestore';
 import {
   planEquipmentIdBackfill,
   ...

-  if (!admin.apps.length) {
-    admin.initializeApp({
-      credential: admin.credential.applicationDefault(),
+  if (!getApps().length) {
+    initializeApp({
+      credential: applicationDefault(),
     });
   }
-  const db = admin.firestore();
+  const db = getFirestore();

     await db.collection('jobs').doc(plan.jobId).update({
       equipment: nextEquipment,
-      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
+      updatedAt: FieldValue.serverTimestamp(),
     });
```

Nothing else in any of the three files changed — same reporting logic, same
console output strings, same comment blocks, same `--dry-run`/`--apply` flag
handling. `git diff --stat` for the three:

```
 scripts/backfillEquipmentIds.ts                   | 13 +++++++------
 scripts/reportEquipmentTypeNames.ts               | 11 ++++++-----
 scripts/reportRecordPermissionRolloutReadiness.ts | 11 ++++++-----
 3 files changed, 19 insertions(+), 16 deletions(-)
```

`scripts/reportCertificateNumberConfigs.ts` was **not modified** — confirmed by
`git status` showing it only ever as untracked (`??`), never `M`.

### Task 2d — grep for remaining `admin.` usage

```
$ grep -n "admin\." scripts/reportEquipmentTypeNames.ts scripts/reportRecordPermissionRolloutReadiness.ts scripts/backfillEquipmentIds.ts
(no output — grep exit code 1)
```

**Zero remaining hits in all three files.**

---

## 4. Task 3 — proving the repair, as far as it can be proven

### 3a — typecheck

```
$ npx tsc --noEmit
(no output — exit 0)
```

**Caveat, not a failure:** `tsconfig.json`'s `include` is `["src"]`. This `tsc`
invocation, run exactly as the prompt specified, does not actually load any file
under `scripts/` — it passes trivially because it never looked. To get real
signal, I additionally compiled all four `firebase-admin`-touching scripts
together (the three repaired plus the untouched reference) with matching
compiler flags:

```
$ npx tsc --noEmit --skipLibCheck --module esnext --target es2022 --moduleResolution bundler --strict \
    scripts/reportEquipmentTypeNames.ts scripts/reportRecordPermissionRolloutReadiness.ts \
    scripts/backfillEquipmentIds.ts scripts/reportCertificateNumberConfigs.ts
(no output — exit 0)
```

Clean, with no diagnostics, run against the known-good reference file for
comparison.

### 3b — both report scripts, past the init block

```
$ npm run report:equipment-type-names
Note: this script performs zero writes regardless of flags; pass --dry-run for clarity if you like.
Report failed: Error: Unable to detect a Project Id in the current environment.
To learn more about authentication and Google APIs, visit:
https://cloud.google.com/docs/authentication/getting-started
    at GoogleAuth.findAndCacheProjectId (...google-auth-library/build/src/auth/googleauth.js:168:19)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async Firestore.initializeIfNeeded (...@google-cloud/firestore/build/src/index.js:1258:35)
```

**`reportEquipmentTypeNames.ts` reaches Firestore call: YES** — no `admin.apps`
error; fails only on missing credentials/project id.

```
$ npm run report:record-permission-rollout
Note: this script performs zero writes regardless of flags; pass --dry-run for clarity if you like.

=== roles/admin ===
Report failed: Error: Unable to detect a Project Id in the current environment.
...
    at async main (C:\Users\seela\Desktop\LIMS-New\scripts\reportRecordPermissionRolloutReadiness.ts:47:25)
```

**`reportRecordPermissionRolloutReadiness.ts` reaches Firestore call: YES** — it
even printed its first section header (`=== roles/admin ===`) before the network
call failed, proving its report logic runs past initialisation.

### 3c — backfill script, report-only, no flags, no `--apply`

```
$ npm run backfill:equipment-ids
Running in report-only mode (pass --apply to actually write).
Backfill failed: Error: Unable to detect a Project Id in the current environment.
...
    at async Firestore.initializeIfNeeded (...@google-cloud/firestore/build/src/index.js:1258:35)
```

**`backfillEquipmentIds.ts` reaches Firestore call: YES** — printed the
report-only banner correctly, failed only on credentials. `--apply` was never
passed, to this run or any other, at any point in this phase.

### 3d — service-account key

```
$ echo "GOOGLE_APPLICATION_CREDENTIALS=[$GOOGLE_APPLICATION_CREDENTIALS]"
GOOGLE_APPLICATION_CREDENTIALS=[]
```

Still unset. 3d does not apply; no key contents were ever read, printed, or
copied.

---

## 5. Task 4 — the regression test

File: `scripts/__tests__/adminScriptImports.test.ts` (new). Discovers files by
`readdirSync` over `scripts/` and filters to those whose contents include the
string `firebase-admin` — not a hard-coded list, so a script added later is
covered automatically. Two assertions per matching file, exactly as specified,
plus one sanity check that discovery itself found something:

- `scripts/__tests__/adminScriptImports.test.ts::scripts/ — firebase-admin import style::found at least one script that mentions firebase-admin (sanity check on discovery itself)`
- `scripts/__tests__/adminScriptImports.test.ts::scripts/ — firebase-admin import style::<path> does not use the legacy namespaced import and does import from firebase-admin/app` (×4, parameterised over the four discovered files: the three repaired scripts plus `reportCertificateNumberConfigs.ts`)

**5 tests total** — 1 sanity + 4 per-file.

### Why it had to run under a probe config, not `npm test`

As detailed in §0, the real `vite.config.ts` `test.include` glob
(`src/**/*.{test,spec}.{ts,tsx}`) cannot match a file under `scripts/`. Proof:

```
$ npx vitest run scripts/__tests__/adminScriptImports.test.ts
No test files found, exiting with code 1
filter: scripts/__tests__/adminScriptImports.test.ts
include: src/**/*.{test,spec}.{ts,tsx}
```

To produce the pass/fail evidence Task 4 asks for, I ran the file under a
throwaway config that lives **outside the repository**, in my scratchpad
directory (never committed, never referenced by anything in the repo, deleted
before finishing this phase):

```ts
// scratchpad/vitest.probe.config.ts — not part of the repo, verification only
export default {
  test: { environment: 'node', include: ['scripts/**/*.test.ts'], pool: 'forks' },
};
```

### Passing run (repaired files, as they exist in the repo right now)

```
$ npx vitest run --root "C:\Users\seela\Desktop\LIMS-New" --config "<scratchpad>\vitest.probe.config.ts"

 ✓ scripts/__tests__/adminScriptImports.test.ts (5 tests) 3ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### Failing run (legacy import temporarily reintroduced in ONE file)

`scripts/reportEquipmentTypeNames.ts`'s two-line modular import was replaced,
**in isolation, in a working-tree edit only**, with the original
`import * as admin from 'firebase-admin';` (the rest of the file — now
referencing `getApps`/`getFirestore`/`applicationDefault`, which no longer
resolve — was left as-is; the point is exercising the import-string assertion,
not producing a script that would run):

```
$ npx vitest run --root "C:\Users\seela\Desktop\LIMS-New" --config "<scratchpad>\vitest.probe.config.ts"

 ❯ scripts/reportEquipmentTypeNames.ts does not use the legacy namespaced import and does import from firebase-admin/app
   AssertionError: expected '/**\n * Reports distinct CertificateNumberConfig…' not to contain 'import * as admin from \'firebase-admin\''

 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```

The test failed exactly where expected, and only there — the other three
files' assertions still passed.

### Restoration confirmed byte-identical to the repaired version

```
$ git diff scripts/reportEquipmentTypeNames.ts
```

produced **exactly** the diff quoted in §3 for this file — nothing more, nothing
less. Re-ran the probe config afterward: 5/5 passing again (identical output to
the first passing run above).

### The real count, confirmed unchanged

```
$ npm test
...
 Test Files  82 passed (82)
      Tests  1721 passed (1721)
```

**Unchanged from the Phase 35A baseline.** Not 83 files, not 1721+5 tests — the
new test genuinely does not execute under the project's real configuration, for
the structural reason in §0. This is not a bug in the test; it is a gap between
where Task 4 places the file and what `vite.config.ts` scans.

---

## 6. Test counts

| | Files | Tests |
| --- | --- | --- |
| Before (Phase 35A end) | 82 | 1721 |
| After (`npm test`, this phase) | **82 (unchanged)** | **1721 (unchanged)** |
| After (probe config, verification only — not the real suite) | +1 (83) | +5 (1726) |

**No existing test was altered:**

```
$ git diff --name-only | grep -i "test\|spec"
(no output)
```

---

## 7. Final `git status`, every file accounted for

```
 M docs/DATA_MGMT_MODULE_GLOSSARY.md                                     pre-existing migration
 M package-lock.json                                                     pre-existing migration
 M package.json                                                          pre-existing migration
 M src/App.tsx                                                           pre-existing migration
 M functions/src/index.ts                                                pre-existing (Phase 35A)
 M src/components/JobModal.tsx                                           pre-existing (Phase 35A)
 M src/main.tsx                                                          pre-existing (Phase 35A, temporary)
 M src/services/firebase.ts                                              pre-existing (Phase 35A)
 M scripts/backfillEquipmentIds.ts                                       changed by this phase (Task 2)
 M scripts/reportEquipmentTypeNames.ts                                   changed by this phase (Task 2)
 M scripts/reportRecordPermissionRolloutReadiness.ts                     changed by this phase (Task 2)
?? docs/PHASE_34_PROMPT_PERMISSION_MODEL_AUDIT.md                        pre-existing
?? docs/PHASE_34_RESULT.md                                               pre-existing
?? docs/PHASE_35A_PROMPT_PROVE_SERVER_ALLOCATION_GROUND.md               pre-existing
?? docs/PHASE_35A_RESULT.md                                              pre-existing
?? docs/PHASE_35B_PROMPT_REPAIR_ADMIN_SCRIPTS.md                         pre-existing
?? docs/PROJECT_INSTRUCTION.md                                           pre-existing
?? docs/adr/ADR-019-certificate-number-allocation.md                     pre-existing
?? functions/src/ping.ts                                                 pre-existing (Phase 35A)
?? scripts/reportCertificateNumberConfigs.ts                             pre-existing (Phase 35A) — NOT touched this phase
?? src/components/__tests__/JobModalCertificateNumberAdminGate.test.tsx  pre-existing (Phase 35A)
?? src/dev/                                                              pre-existing (Phase 35A, temporary)
?? scripts/__tests__/                                                    changed by this phase (Task 4 — adminScriptImports.test.ts)
?? docs/PHASE_35B_RESULT.md                                              changed by this phase (this file)
```

Only the files this phase was permitted to touch were touched: the three
scripts named in fact 2, the new test file, and this report.
`scripts/reportCertificateNumberConfigs.ts` was read but not modified.
`package.json`, `package-lock.json`, `src/App.tsx` were not touched. No
`npm install`/`update`/`ci` was run. Nothing was committed, stashed, checked
out, reverted, branched, or worktree'd. `--apply` was never passed to the
backfill script. `firestore.rules` was not touched and nothing was deployed.

---

## 8. Things that contradicted the prompt

1. **Task 4 places a test where the real test runner cannot find it.** The full
   account is in §0. This is the one open item from this phase: a one-line
   change to `vite.config.ts`'s `test.include`, which is the owner's call, not
   mine to make under this phase's file list.

2. Nothing else in the prompt's stated facts, line numbers, or file contents was
   found to be wrong. Facts about line numbers for the three scripts' imports
   (22/29/25) and init blocks (31-36/37-42/43-48) and the backfill script's
   line 77 all matched exactly.

---

## What the owner should do next

1. **Decide on `vite.config.ts`.** If you want
   `scripts/__tests__/adminScriptImports.test.ts` to actually run as part of
   `npm test`, add a `scripts/**` pattern to `test.include`. I did not make this
   change — it's outside this phase's permitted files, and it's a real decision
   about the test runner's scope, not a repair to an admin script.
2. **The three scripts are fixed and safe to use** once you have a
   service-account key: `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json npm run
   report:equipment-type-names` (and the `record-permission-rollout` equivalent)
   will now reach Firestore. The backfill script will too, in report-only mode;
   remember `--apply` is what makes it write.
3. Everything from Phase 35A that's still open remains open: the signed-in
   click to close the Cloud Functions gate, and the certificate-config table
   (needs the same service-account key).
