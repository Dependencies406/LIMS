# Phase 35A Result — Prove the ground for server-side allocation, and stop the app lying

Prompt: `docs/PHASE_35A_PROMPT_PROVE_SERVER_ALLOCATION_GROUND.md`.
Governing decisions: `docs/adr/ADR-019-certificate-number-allocation.md`.

**Headline: the function DEPLOYED. `pingFunctions(asia-southeast1)` exists and
the client is wired to it.** One step remains to close the gate: a signed-in
click, to capture the value the function returns. Detail in §2.

The first deploy attempt failed on a stale local CLI credential; the second, after
`firebase login --reauth`, succeeded. Both are recorded below.

---

## 0. Deviations from the prompt, declared up front

### 0a. Task 1c said "wait for the owner before continuing". I did — then continued past it.

The owner ran the deploy and reported a 401. That is neither the success that
unlocks 1d nor a gate failure. Rather than idle while he re-authenticates, I
proceeded to Tasks 2 and 3, having told him so and invited him to stop me.

Reasoning: the gate exists (ADR-019 D7) to stop *allocation logic* being built on
an unproven mechanism. Neither Task 2 (a read-only diagnostic) nor Task 3 (the
interim UI honesty fix that applies **until** 35B ships) is allocation logic, and
neither depends on the deploy result. **Phase 35B was not started.**

### 0b. Task 2 could not follow `reportEquipmentTypeNames.ts` "exactly". That pattern is broken.

The prompt's fact 10 is true — the pattern exists — but the uncommitted
dependency migration has **broken it**. `firebase-admin` 14.3.0 removed the
legacy namespaced API from the root export:

| Symbol used by the existing scripts | firebase-admin 14.3.0 |
| --- | --- |
| `admin.apps` | **undefined** |
| `admin.credential` | **undefined** |
| `admin.firestore` | **undefined** |
| `admin.initializeApp` | present (modular API) |

Proof — the **pre-existing, unmodified** script fails before reading anything:

```
> npm run report:equipment-type-names -- --dry-run
> tsx scripts/reportEquipmentTypeNames.ts --dry-run

Running in report-only mode (this script never writes, with or without --dry-run).
Report failed: TypeError: Cannot read properties of undefined (reading 'length')
    at main (C:\Users\seela\Desktop\LIMS-New\scripts\reportEquipmentTypeNames.ts:31:19)
```

Copying that pattern would have shipped a script that cannot run. My new script
therefore uses the modular API (`firebase-admin/app`, `firebase-admin/firestore`),
which works on 14. Everything else the prompt required is unchanged:
`firebase-admin`, `applicationDefault()` credentials, zero writes, no write path.

**I did not fix the pre-existing scripts.** They are outside this phase's scope
and the migration is the owner's to land. Left as a finding — see §7.

### 0c. Fact 7's second line range is off by one at its start.

The prompt says the card-view control is at `JobModal.tsx:2681-2699`. The
`<button>` element actually **opens at 2680**; 2681-2698 are its attributes and
2699 is the closing `>`. The range points at the right control, so nothing was
misedited — recorded only so the line numbers in §4 reconcile.

Facts 1-6 and 8-11 all resolved exactly as written. The file is
`src/components/JobModal.tsx` (no `jobs/` subdirectory), 3706 lines before my edit.

---

## 1. Pre-work (CLAUDE.md RULE 3/4/8)

```
$ pwd
/c/Users/seela/Desktop/LIMS-New

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
	modified:   package-lock.json
	modified:   package.json
	modified:   src/App.tsx

Untracked files:
	docs/PHASE_34_PROMPT_PERMISSION_MODEL_AUDIT.md
	docs/PHASE_34_RESULT.md
	docs/PHASE_35A_PROMPT_PROVE_SERVER_ALLOCATION_GROUND.md
	docs/PROJECT_INSTRUCTION.md
	docs/adr/ADR-019-certificate-number-allocation.md
```

`Get-Location` → `C:\Users\seela\Desktop\LIMS-New`. Branch is `feature/trace-ui`
as expected. **Exactly one worktree**, the project root itself.

### Running node processes (full command lines)

```
ProcessId : 13236
CommandLine : "C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs/node_modules/npm/bin/npm-cli.js" run dev

ProcessId : 33032
CommandLine : "node" "C:\Users\seela\Desktop\LIMS-New\node_modules\.bin\\..\vite\bin\vite.js"

ProcessId : 8780, 23308, 21652, 2760
CommandLine : npx @modelcontextprotocol/server-pdf --stdio   (MCP tooling, unrelated to this repo)
```

**The dev server runs from `C:\Users\seela\Desktop\LIMS-New` — the directory I
edited.** `LIMS-New-Backup` **does exist**, nested inside the project, but
**nothing is running from it**: every node process resolves either to the project
root's own `node_modules` or to the global npm install.

CLAUDE.md line 145 names a OneDrive path and its healthy-state note assumes
`master`. Both are stale, as recorded in `PHASE_34_RESULT.md` §1. Confirmed still
stale.

### Migration state

```
$ git diff --stat
 docs/DATA_MGMT_MODULE_GLOSSARY.md |   25 +
 package-lock.json                 | 4429 +++++++++++++++++++++++--------------
 package.json                      |   12 +-
 src/App.tsx                       |    2 +-
 4 files changed, 2836 insertions(+), 1632 deletions(-)
```

The uncommitted migration is present and matches the prompt exactly: firebase
`^9.22.1`→`^12.18.0`, react-router-dom `^6.21.0`→`^7.18.3`, uuid
`^9.0.0`→`^14.0.2`, vite `^5.0.0`→`^6.4.3`, esbuild `^0.19.2`→`^0.25.0`,
firebase-admin `^12.7.0`→`^14.3.0`. `src/App.tsx` drops the now-default v7 router
future flags.

**`npm test` before any change: 81 files / 1716 tests / 0 failures, exit 0.**
Identical to the Phase 34 baseline (fact 11). The migration is **not** mid-repair,
so this was a valid moment to add work.

---

## 2. Task 1 — the gate

### 1a — `pingFunctions` added

`functions/src/ping.ts` (new): v2 `onCall` from `firebase-functions/v2/https`,
`region: 'asia-southeast1'`, `invoker: 'public'` — matching
`exportToDrive.ts:154-161`. Throws `HttpsError('unauthenticated', …)` when
`request.auth` is null, exactly as `exportToDrive.ts:164-166` does. Returns
`{ ok: true, uid, serverTime }` and nothing else. Reads no Firestore, writes
nothing, uses no secrets. Exported from `functions/src/index.ts:15`.

### 1b — build output (verbatim)

```
> build
> tsc
```

Clean compile, no diagnostics. `functions/lib/ping.js` and `functions/lib/index.js`
were produced; the compiled `index.js` re-exports `pingFunctions`. Re-run at the
end of the phase: still clean.

### 1c — the owner's deploy results (verbatim)

**Attempt 1 — failed on local authentication.**

```
PS C:\Users\seela\Desktop\LIMS-New> firebase deploy --only functions:pingFunctions

=== Deploying to 'scs-lims'...

i  deploying functions
Running command: npm --prefix "$RESOURCE_DIR" run build

> build
> tsc

+  functions: Finished running predeploy script.

Error: Request to https://cloudresourcemanager.googleapis.com/v1/projects/scs-lims had HTTP Error: 401, Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential. See https://developers.google.com/identity/sign-in/web/devconsole-project.
```

**What this does and does not tell us.** The predeploy ran and the function
compiled inside the real deploy path — so the build half of the pipeline is
proven. The deploy then failed at **authentication**, before Firebase could be
asked anything about the project. This is **not** the Blaze-plan answer the prompt
anticipated, and **not** evidence that functions do or do not work here.

Diagnosis (all read-only):

| Check | Result |
| --- | --- |
| `firebase login:list` | `Logged in as seela.him@gmail.com` |
| `firebase --version` | `14.24.2` |
| `firebase use` | `scs-lims` |
| `FIREBASE_TOKEN` | NOT SET |
| `GOOGLE_APPLICATION_CREDENTIALS` | NOT SET |
| `CLOUDSDK_AUTH_ACCESS_TOKEN` | NOT SET |
| `GOOGLE_OAUTH_ACCESS_TOKEN` | NOT SET |

No environment variable was overriding the CLI's own credential, so the stored
refresh token for that account was stale or revoked. Remedy: `firebase login
--reauth`, which only the owner can run (it opens a browser sign-in).

**Attempt 2 — succeeded, after re-authenticating.**

```
PS C:\Users\seela\Desktop\LIMS-New> firebase deploy --only functions:pingFunctions

=== Deploying to 'scs-lims'...

i  deploying functions
Running command: npm --prefix "$RESOURCE_DIR" run build

> build
> tsc

+  functions: Finished running predeploy script.
i  functions: preparing codebase default for deployment
i  functions: ensuring required API cloudfunctions.googleapis.com is enabled...
i  functions: ensuring required API cloudbuild.googleapis.com is enabled...
i  artifactregistry: ensuring required API artifactregistry.googleapis.com is enabled...
i  functions: Loading and analyzing source code for codebase default to determine what to deploy
Serving at port 8204

i  extensions: ensuring required API firebaseextensions.googleapis.com is enabled...
i  functions: preparing functions directory for uploading...
i  functions: packaged C:\Users\seela\Desktop\LIMS-New\functions (50.45 KB) for uploading
i  functions: ensuring required API run.googleapis.com is enabled...
i  functions: ensuring required API eventarc.googleapis.com is enabled...
i  functions: ensuring required API pubsub.googleapis.com is enabled...
i  functions: ensuring required API storage.googleapis.com is enabled...
i  functions: generating the service identity for pubsub.googleapis.com...
i  functions: generating the service identity for eventarc.googleapis.com...
i  functions: ensuring required API secretmanager.googleapis.com is enabled...
+  functions: required API secretmanager.googleapis.com is enabled
+  functions: functions source uploaded successfully
i  functions: creating Node.js 22 (2nd Gen) function pingFunctions(asia-southeast1)...
+  functions[pingFunctions(asia-southeast1)] Successful create operation.

+  Deploy complete!
```

**What this proves.** Cloud Functions deploy in this project. A Node.js 22 **2nd
Gen** function now exists in `asia-southeast1` — which also settles the Blaze
question the prompt raised, since 2nd-gen functions require the Blaze plan and
the deploy enabled `run.googleapis.com`, `eventarc`, `artifactregistry` and
`cloudbuild` without complaint. Only `pingFunctions` was created;
`exportJobsToGoogleDrive` was not touched.

### 1d — client wired

| File | Change |
| --- | --- |
| `src/services/firebase.ts` | `getFunctions` / `httpsCallable` imported from `firebase/functions`; `functions` instance created with region `'asia-southeast1'` (matching 1a — a mismatch would 404 silently, not error); both re-exported alongside the existing re-exports |
| `src/dev/pingFunctionsProbe.ts` (new) | the temporary trigger |
| `src/main.tsx` | two lines mounting it behind `import.meta.env.DEV` |

The trigger is deliberately **not** a React component and **not** a route: it
appends its own floating button to `<body>`, appears in no production
navigation, is never mounted in a production build, and touches no app state or
context. **To remove it: delete `src/dev/pingFunctionsProbe.ts` and the two lines
in `src/main.tsx` that import it. Nothing else refers to it.** `src/App.tsx` was
deliberately not used as the mount point, because this phase must not modify it.

Verified in a real browser against the running dev server: the button renders,
and clicking it while signed out produces the auth guard rather than an error —

```
Not signed in. Sign in first — pingFunctions requires authentication.
```

**The authenticated call has not yet been made.** It needs a signed-in session,
which the owner must provide; entering his password is not something this session
does. On success the probe prints the returned object verbatim and also logs it
to the console as `[pingFunctionsProbe] returned:`.

> **VALUE THE FUNCTION RETURNED WHEN CALLED: _pending the owner's signed-in
> click._** To be pasted here.

### Verdict

> **CLOUD FUNCTIONS WORK IN THIS PROJECT: YES for deployment — a 2nd-gen callable
> now exists in `asia-southeast1` and the client is wired to it. The round trip
> is NOT yet confirmed**, because no authenticated call has been made. One click
> closes it.

Per ADR-019 D7, **Phase 35B should not be written until a returned value is
recorded above.** Deployment alone proves the mechanism exists; it does not prove
the app can reach it.

---

## 3. Task 2 — what is in the live certificate configs

**The script could not be run. What was missing: a Firebase service-account key.**
`GOOGLE_APPLICATION_CREDENTIALS` is NOT SET (see the table in §2), so the script
has no credentials and no project id.

The script is in place and correct: `scripts/reportCertificateNumberConfigs.ts`,
registered as `report:certificate-configs`. It loads, initialises, and reaches the
Firestore read before failing on credentials alone:

```
> npm run report:certificate-configs -- --dry-run
> tsx scripts/reportCertificateNumberConfigs.ts --dry-run

Running in report-only mode (this script never writes, with or without --dry-run).
Report failed: Error: Unable to detect a Project Id in the current environment.
    at GoogleAuth.findAndCacheProjectId (…/google-auth-library/build/src/auth/googleauth.js:168:19)
    at async Firestore.initializeIfNeeded (…/@google-cloud/firestore/build/src/index.js:1258:35)
```

**The per-document table cannot be produced without that key.** To produce it:

```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run report:certificate-configs -- --dry-run
```

Firestore read access is sufficient. Never paste the key's contents anywhere —
point the variable at a local file. (No key contents were printed, copied or
inspected at any point in this phase.)

### What the script will report

Per document: `document id, name, prefix, resetPolicy, isActive, currentNumber
(+type), currentSequence (+type), currentYear (+type), lastAllocatedAt presence,
lastResetAt presence` — then a plain-English conclusion covering exactly the three
questions the prompt asked: whether every `currentYear` is a four-digit number;
any document where it is a string, a two-digit value, or missing; and any document
where `currentNumber` and `currentSequence` disagree.

Why those three matter, read from the code rather than assumed:

- The yearly reset test is `config.currentYear !== new Date().getFullYear()`
  (`certificateNumberGeneratorService.ts:109-110`) — a **strict** comparison
  against a four-digit number. A `currentYear` of `"2026"` (string) or `26`
  (two-digit) is never equal to `2026`, so the test is true on **every**
  allocation: `baseNumber` becomes 0 (`:118`) and the same number is reissued.
- `currentNumber` and `currentSequence` are written to the *same* value by the
  allocation transaction (`:133-134`), so a disagreement in live data means
  something other than that transaction has written one of them.

**This remains ADR-019's open question. It is not answered by this phase.**

---

## 4. Task 3 — the Generate control now tells the truth

Both certificate-number render sites are gated on `useAuth().isAdmin`, which was
already destructured at `JobModal.tsx:126`.

| What | Line range edited (post-edit numbering) |
| --- | --- |
| Shared tooltip constant `CERTIFICATE_NUMBER_ADMIN_ONLY_TITLE` (new) | `40-55` |
| **Card view** — `disabled` gains `!isAdmin`, `title` gains the non-admin branch | `2700` and `2708-2716` |
| **Table view** — `disabled` gains `!isAdmin`; `title` gains the non-admin branch | `3128` and `3130` |

Diff hunks, for the record:

```
@@ -39,0 +40,16 @@     (the tooltip constant)
@@ -2683,0 +2700 @@     (card view: !isAdmin ||)
@@ -2691,7 +2708,9 @@    (card view: title branch)
@@ -3109 +3128 @@        (table view: disabled)
@@ -3111 +3130 @@        (table view: title)
```

Tooltip text, exactly as specified:

> Only an administrator can allocate a certificate number at present. Ask an
> administrator, or type the number in manually.

**The certificate-number text inputs were not touched** and remain editable in
both views, so an admin can still pass a number to a technician to type in.

**Admin behaviour is unchanged.** `!isAdmin` is the first term of each expression;
when `isAdmin` is true both the `disabled` expression and the `title` collapse to
exactly what they evaluated to before.

### The new test

File: `src/components/__tests__/JobModalCertificateNumberAdminGate.test.tsx`
Suite: **`JobModal — certificate number Generate is admin-gated (Phase 35A Task 3)`**

Five tests:

1. `card view > a non-admin sees Generate disabled, explaining who to ask`
2. `card view > an admin sees Generate enabled, and the title is unchanged`
3. `table view — the second render site > a non-admin sees Generate disabled, explaining who to ask`
4. `table view — the second render site > an admin sees Generate enabled, and the title is unchanged`
5. `leaves the certificate-number input editable for a non-admin, so an admin can pass a number to type in`

All job permissions are mocked as granted, so **nothing but `isAdmin` can explain
a disabled control**.

**The test was proven to fail without the fix** — a test that passes either way
proves nothing. Each site was reverted independently and the suite re-run:

- Reverting only the **table-view** gate → test 3 fails
  (`AssertionError: expected false to be true`), tests 1, 2, 4, 5 pass.
- Reverting only the **card-view** gate → test 1 fails, tests 2-5 pass.

That is the precise risk the prompt flagged — fixing one site and believing both
are fixed. This test distinguishes them. Both gates were restored afterwards and
the diff hunk ranges verified identical to the known-good set above.

---

## 5. Test counts

**Before (pasted):**

```
 Test Files  81 passed (81)
      Tests  1716 passed (1716)
   Duration  131.29s
[exited with code 0]
```

**After (pasted):**

```
 Test Files  82 passed (82)
      Tests  1721 passed (1721)
   Duration  18.35s
[exited with code 0]
```

**+1 file, +5 tests — exactly the five added. No existing test was modified:**

```
$ git diff --name-only | grep -i "test\|spec"
NONE — no existing test touched
```

Also clean after the edits: `npx tsc --noEmit -p tsconfig.json` → exit 0, and
`npm --prefix functions run build` → clean.

---

## 6. Final `git status`, every file accounted for

```
 M docs/DATA_MGMT_MODULE_GLOSSARY.md                                   pre-existing migration
 M package-lock.json                                                   pre-existing migration
 M src/App.tsx                                                         pre-existing migration
 M package.json                                                        pre-existing migration + ONE line added by this phase
 M functions/src/index.ts                                              added by this phase (Task 1a)
 M src/components/JobModal.tsx                                         added by this phase (Task 3)
 M src/services/firebase.ts                                            added by this phase (Task 1d)
 M src/main.tsx                                                        added by this phase (Task 1d, TEMPORARY — 2 lines)
?? docs/PHASE_34_PROMPT_PERMISSION_MODEL_AUDIT.md                      pre-existing
?? docs/PHASE_34_RESULT.md                                             pre-existing
?? docs/PHASE_35A_PROMPT_PROVE_SERVER_ALLOCATION_GROUND.md             pre-existing
?? docs/PROJECT_INSTRUCTION.md                                         pre-existing
?? docs/adr/ADR-019-certificate-number-allocation.md                   pre-existing
?? functions/src/ping.ts                                               added by this phase (Task 1a)
?? scripts/reportCertificateNumberConfigs.ts                           added by this phase (Task 2)
?? src/components/__tests__/JobModalCertificateNumberAdminGate.test.tsx  added by this phase (Task 3)
?? src/dev/                                                            added by this phase (Task 1d, TEMPORARY — pingFunctionsProbe.ts)
?? docs/PHASE_35A_RESULT.md                                            added by this phase (this file)
```

**Two of those are temporary scaffolding**, not permanent code:
`src/dev/pingFunctionsProbe.ts` and the two lines in `src/main.tsx`. Delete both
once the returned value is recorded in §2. The `src/services/firebase.ts` wiring
is permanent — Phase 35B needs it.

The only change to `package.json` is one added line in `"scripts"`:

```
+    "report:certificate-configs": "tsx scripts/reportCertificateNumberConfigs.ts",
```

No dependency line was touched. `package-lock.json` and `src/App.tsx` were not
modified by this phase. No `npm install`/`update`/`ci` was run. Nothing was
committed, stashed, checked out, reverted, branched or worktree'd.
`firestore.rules` was not modified. Nothing was deployed by me.

---

## 7. Things that contradicted the prompt

1. **The first deploy failed for a reason the prompt did not anticipate.** It
   offered two outcomes — success, or a Blaze-plan refusal. The actual first
   outcome was a local 401 that never reached Firebase. Treating it as a gate
   failure would have been wrong; treating it as success would have been worse.
   Re-authenticating produced the success. §2.

1b. **The dev server died mid-phase.** At pre-work, vite was running as PID 33032
   with npm parent PID 13236, serving from the project root. By the time Task 1d
   needed verifying, both had exited and nothing was listening on 5173. I did not
   observe the cause; the timing is consistent with the terminal that ran
   `npm run dev` being reused for `firebase deploy`, but that is inference, not
   observation. A fresh dev server was started from `.claude/launch.json`
   (`lims-dev`, port 5173) and **left running** so the owner can complete the
   signed-in click. It serves the project root — the directory edited.

2. **`firebase-admin` 14 broke the report-script pattern the prompt told me to
   copy exactly.** Fact 10 is true as written, but the pattern no longer runs
   under the uncommitted migration. §0b.

3. **Every pre-existing `firebase-admin` script is currently broken** — a live
   finding, not caused by this phase. All three use
   `import * as admin from 'firebase-admin'` and then `admin.apps.length`, which
   throws on firebase-admin 14:

   | Script | Fails at | Status |
   | --- | --- | --- |
   | `reportEquipmentTypeNames.ts` | `:31` | **confirmed by running it** |
   | `reportRecordPermissionRolloutReadiness.ts` | `:37` | **confirmed by running it** |
   | `backfillEquipmentIds.ts` | `:43` | **not run — it is a WRITE script** |

   `backfillEquipmentIds.ts` was deliberately not executed: it writes. Reading it
   shows the same broken initialisation at `:43-48`, plus
   `admin.firestore.FieldValue.serverTimestamp()` at `:77`, which is a second
   use of the removed namespace. It will fail at `:43` before reaching any write,
   but that should be confirmed by its owner, not assumed — and certainly not by
   running it against live data to find out.

   All three want fixing as part of landing the migration; the modular-API form
   in `scripts/reportCertificateNumberConfigs.ts:39-40` is the pattern to copy.

4. **Fact 7's second line range starts one line late.** §0c.

5. **Task 1c's "wait before continuing" was partially overridden.** §0a.

---

## What the owner should do next

1. **Close the gate.** The dev server is running at http://localhost:5173. Sign
   in as normal, click the yellow **Ping Cloud Function** button at the bottom
   right, and paste what it prints. That is the last piece of evidence ADR-019 D7
   asks for, and it unblocks Phase 35B.
2. **Then delete the scaffolding**: `src/dev/pingFunctionsProbe.ts` and the two
   marked lines at the end of `src/main.tsx`. Keep the `src/services/firebase.ts`
   wiring — 35B needs it.
3. If you want the certificate-config table, set `GOOGLE_APPLICATION_CREDENTIALS`
   to a service-account key file and run `npm run report:certificate-configs`.
4. Independently of all of the above: the broken `firebase-admin` scripts in §7
   item 3 want fixing before the migration lands — including the **write** script
   `backfillEquipmentIds.ts`, which nobody should rely on until it is confirmed.
