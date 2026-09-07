# Phase 35C Result — Server-side certificate number allocation

Date: 2026-09-04
Branch: `feature/trace-ui`
Status: **COMPLETE.** Built, compiled, tested, rules deployed, function deployed
and answering. Gate closed 2026-09-06 (see §8.7).

Implements ADR-019 D3/D4/D6. Nothing in `src/` changed; nothing calls the new
function yet. The client switch is Phase 35D.

---

## 1. Pre-work (CLAUDE.md RULE 3/4/8) — verbatim

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
	docs/PROJECT_INSTRUCTION.md
	docs/adr/ADR-019-certificate-number-allocation.md
	functions/src/ping.ts
	scripts/__tests__/
	scripts/reportCertificateNumberConfigs.ts
	src/components/__tests__/JobModalCertificateNumberAdminGate.test.tsx
	src/dev/
```

Node processes, full command lines:

```
ProcessId   : 23060
CommandLine : "C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js" -y
              @modelcontextprotocol/server-pdf --stdio

ProcessId   : 504
CommandLine : "node" "C:\Users\seela\AppData\Local\npm-cache\_npx\6583fba12287d067\node_modules\.bin\..\@modelcontextprotocol\server-pdf\dist\index.js" --stdio

ProcessId   : 34900
CommandLine : "C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs/node_modules/npm/bin/npm-cli.js" run dev

ProcessId   : 34236
CommandLine : "node" "C:\Users\seela\Desktop\LIMS-New\node_modules\.bin\..\vite\bin\vite.js"

ProcessId   : 7812
CommandLine : "C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js" "-y"
              "@modelcontextprotocol/server-pdf" "--stdio"

ProcessId   : 13004
CommandLine : "node" "C:\Users\seela\AppData\Local\npm-cache\_npx\6583fba12287d067\node_modules\.bin\..\@modelcontextprotocol\server-pdf\dist\index.js" --stdio
```

**Findings:**

| Check | Result |
|---|---|
| Working directory | `C:\Users\seela\Desktop\LIMS-New` |
| Branch | `feature/trace-ui` — as expected |
| Worktrees | Exactly one: `C:/Users/seela/Desktop/LIMS-New` |
| Dev server (vite, PID 34236) | `C:\Users\seela\Desktop\LIMS-New\node_modules\...\vite.js` — **the project root** |
| Anything from `LIMS-New-Backup` | **None.** No process references that path. |
| Migration committed? | No — still uncommitted, as expected |

The only non-project node processes are three MCP `server-pdf` helpers, unrelated
to this repo.

---

## 2. Task 1 — The gate (ADR-019 D7)

Command:

```bash
curl -i -X POST https://asia-southeast1-scs-lims.cloudfunctions.net/pingFunctions -H "Content-Type: application/json" -d "{\"data\":{}}"
```

Full response:

```
HTTP/1.1 401 Unauthorized
vary: Origin
content-type: application/json; charset=utf-8
x-cloud-trace-context: 6558e0d2e1ec4c84c0085fd769032467;o=1
date: Fri, 04 Sep 2026 08:25:02 GMT
server: Google Frontend
Content-Length: 95
Alt-Svc: h3=":443"; ma=2592000,h3-29=":443"; ma=2592000

{"error":{"message":"You must be logged in to call this function.","status":"UNAUTHENTICATED"}}
```

### GATE PASSED

The decisive detail is the message string. `"You must be logged in to call this
function."` is not a platform message — it is the literal string written at
`functions/src/ping.ts:33`. Its presence proves, in one response:

1. DNS resolved `asia-southeast1-scs-lims.cloudfunctions.net`.
2. The region in the URL matches the region the function was deployed to.
3. A deployment is live at that name.
4. The platform admitted the request (`invoker: 'public'` is in effect) — this
   is **not** an IAM-level 403 that never reached the code.
5. The function body executed, evaluated `if (!request.auth)`, and threw its own
   `HttpsError('unauthenticated', …)`.

`content-type: application/json` and the callable-protocol error envelope
(`{"error":{"message":…,"status":…}}`) confirm it was the callable framework
that serialised the throw, not an edge proxy.

**ADR-019 D7 is discharged for the round trip as far as it can be without a
browser.** A full success with a real signed-in ID token remains unobserved;
that is closed in 35D by a real allocation, as the prompt states.

---

## 3. Task 2 — Field-by-field comparison of the two transactions

`OLD` = `src/services/certificateNumberGeneratorService.ts:132-141` (client,
Web SDK).
`NEW` = `functions/src/allocateCertificateNumber.ts` (server, Admin SDK).

### Fields written to `certificate_number_configs/{configId}`

| Field | OLD (client) | NEW (function) | Match |
|---|---|---|---|
| `currentNumber` | `nextNumber` | `nextNumber` | ✅ |
| `currentSequence` | `nextNumber` | `nextNumber` | ✅ |
| `currentYear` | `currentYear` (four-digit) | `currentYear` (four-digit) | ✅ |
| `lastAllocatedAt` | `Timestamp.now()` | `Timestamp.now()` | ✅ |
| `lastResetAt` | `Timestamp.now()` — **only when `shouldReset`** | `Timestamp.now()` — **only when `shouldReset`** | ✅ |
| `yearlyReset` | **not written** (derived on read) | **not written** (derived on read) | ✅ |
| `updatedAt` | **NOT WRITTEN** | **NOT WRITTEN** | ✅ |
| any other field | none | none | ✅ |

**`updatedAt` appears in neither column.** This is the point of ADR-012: that
field means "a human last edited this equipment type". If allocation wrote it,
every certificate number taken would look like an equipment-type edit and the
field would stop meaning anything. Both implementations write `lastAllocatedAt`
instead, so the two timestamps stay distinguishable.

Both use `update()` (not `set()`), so fields not listed are left untouched
rather than deleted.

### Fields READ from the config document

Both apply the same defaulting, transcribed from `documentToConfig`
(`certificateNumberConfigService.ts:31-52`):

| Field | Both |
|---|---|
| `name` | `data.name \|\| ''` |
| `prefix` | `data.prefix \|\| ''` |
| `separator` | `data.separator \|\| '-'` |
| `includeYear` | `data.includeYear !== false` |
| `numberPadding` | `data.numberPadding \|\| 3` |
| `currentNumber` | `data.currentNumber \|\| 0` |
| `currentYear` | `data.currentYear ?? new Date().getFullYear()` |
| `resetPolicy` | `data.resetPolicy \|\| 'never'` |
| `lastResetAt` | `data.lastResetAt?.toDate() \|\| undefined` |
| `isActive` | `data.isActive !== false` |

The NEW code uses `data.lastResetAt?.toDate?.()` (optional-call on `toDate`)
rather than `?.toDate()`. Same result for a real `Timestamp`; it additionally
survives a malformed non-Timestamp value instead of throwing, which is what the
client's `||  undefined` fallback already implied.

### Formatting — mechanically verified identical

The two copies of `formatCertificateNumber` were diffed as text:

```
$ diff -w -B old_fmt.txt new_fmt.txt
(no output)
IDENTICAL (ignoring whitespace) — the only differences were trailing spaces on blank lines
```

Every difference the raw `diff` reported was a trailing space on a blank line in
the client file. **The logic is character-for-character the same.**

---

## 4. Task 2d — Reset policy, side by side

**OLD** — `certificateNumberGeneratorService.ts:105-121`:

```ts
const now = new Date();
const currentYear = now.getFullYear();

let shouldReset = false;
if (config.resetPolicy === 'yearly') {
  shouldReset = config.currentYear !== currentYear;
} else if (config.resetPolicy === 'monthly') {
  shouldReset =
    !config.lastResetAt ||
    config.lastResetAt.getFullYear() !== currentYear ||
    config.lastResetAt.getMonth() !== now.getMonth();
}

const baseNumber = shouldReset ? 0 : config.currentNumber;

// Increment number
const nextNumber = baseNumber + 1;
```

**NEW** — `functions/src/allocateCertificateNumber.ts`:

```ts
const now = new Date();
const currentYear = now.getFullYear();

let shouldReset = false;
if (config.resetPolicy === 'yearly') {
  shouldReset = config.currentYear !== currentYear;
} else if (config.resetPolicy === 'monthly') {
  shouldReset =
    !config.lastResetAt ||
    config.lastResetAt.getFullYear() !== currentYear ||
    config.lastResetAt.getMonth() !== now.getMonth();
}
// Any other resetPolicy (including 'never') never resets.

const baseNumber = shouldReset ? 0 : config.currentNumber;
const nextNumber = baseNumber + 1;
```

Mechanical diff:

```
$ diff -w -B old_reset.txt new_reset.txt
15,16d14
<
<       // Increment number
```

The only difference is a deleted blank line and a deleted comment. **The
executable logic is character-identical.** `'never'` — and any unrecognised
policy string — falls through both `if`s and never resets, in both.

### ⚠ One behavioural consequence of the move, NOT covered by the prompt

`new Date().getFullYear()` reads the **host's local timezone**.

- OLD ran in the technician's browser: Asia/Bangkok, UTC+7.
- NEW runs in Cloud Functions: **UTC**.

For roughly seven hours each New Year — 1 Jan 00:00–07:00 Bangkok time — the
browser would say the new year while the server still says the old one. With
`resetPolicy: 'yearly'` (ADR-019 D5), an allocation in that window would
continue the *old* year's series and print the old two-digit year, where the
client would have reset to `001`.

This is a **new** risk created by moving to the server, not an existing one. It
was transcribed literally as instructed, and is flagged here rather than
silently "fixed", because choosing the lab's timezone is the owner's decision,
not a transcription detail. The blast radius is small and self-correcting (the
first allocation after 07:00 resets normally), but the numbers issued in that
window would carry the previous year.

**Recommendation for 35D or a follow-up:** pin the function's timezone
explicitly (`TZ: 'Asia/Bangkok'` in the function options, or compute the year
via `Intl.DateTimeFormat` with that zone) — and make the same change in both
twins.

---

## 5. Task 3 — The allocation ledger

New collection `certificateNumberAllocations`. One document per number ever
issued, created inside the same transaction that increments the counter.

**Document id:** the formatted certificate number itself, e.g. `SCS-UMT-26001`.

**Fields:**

| Field | Type | Meaning |
|---|---|---|
| `certificateNumber` | string | The formatted number (same as the doc id) |
| `number` | number | The raw running number, e.g. `1` |
| `year` | number | Full four-digit year (ADR-019 D5) |
| `configId` | string | Issuing `certificate_number_configs` document |
| `configName` | string | Its `name`, captured at issue time |
| `jobId` | string | The job that consumed the number (ADR-019 D6) |
| `equipmentIndex` | number | Which item within that job |
| `allocatedBy` | string | Caller's Firebase Auth uid |
| `allocatedAt` | Timestamp | Server clock at issue |

**Why the document id choice prevents duplicates:** the write is
`transaction.create()`, not `set()` — Firestore refuses the write if a document
with that id already exists and aborts the whole transaction, so the counter
increment is rolled back too. Because the id *is* the number, a duplicate
certificate number is not merely unlikely but **structurally impossible: the
database itself refuses the second one, even if the counter logic is wrong.**
That converts the answer to *"what prevents two certificates carrying the same
number?"* from a promise into a demonstration, which is the stated purpose of
ADR-019 D3.

It also satisfies D6: every gap in the register is explainable, because every
number ever issued has a row naming the job, the item, and the person.

**Retry burns a number.** A client that times out and retries may allocate a
number it never uses. ADR-019 D6 accepts burned numbers, so no idempotency key
was added in this phase (and none was requested). See §9.

---

## 6. Task 4 — The rules diff

```diff
@@ -770,6 +770,23 @@ service cloud.firestore {
       allow create, update, delete: if request.auth != null;
     }

+    // Certificate Number Allocation Ledger (ADR-019 D6) — one document per
+    // certificate number ever issued, whose document id IS the number itself.
+    //
+    // Read: any authenticated user, so a gap in the certificate register can be
+    // explained by looking up which job and which person consumed a number.
+    //
+    // Write: DENIED TO EVERY CLIENT, unconditionally. Only the
+    // allocateCertificateNumber Cloud Function writes here, and it uses the
+    // Admin SDK, which bypasses security rules entirely. Denying all client
+    // writes is what makes the ledger trustworthy: a client cannot forge,
+    // amend, or erase the record of a number it was issued, so the create-only
+    // document id remains a real uniqueness guarantee rather than a convention.
+    match /certificateNumberAllocations/{allocationId} {
+      allow read: if request.auth != null;
+      allow write: if false;
+    }
+
     // Default rule: deny all other access
     match /{document=**} {
       allow read, write: if false;
```

```
$ git diff --stat -- firestore.rules
 firestore.rules | 17 +++++++++++++++++
 1 file changed, 17 insertions(+)
```

**17 insertions, 0 deletions.** Nothing was removed or altered.
`certificate_number_configs` (:161-165) is untouched, as required. The change
only *adds* a read permission on a collection that did not exist before.

---

## 7. Task 5 — Build and tests

### 5a. Functions build

```
$ npm --prefix functions run build

> build
> tsc
```

Clean — `tsc` printed nothing, which is success. Under `strict: true`. Artifact
verified:

```
$ ls -la functions/lib/ | grep -i alloc
-rw-r--r-- 1 seela 197610 18585 Sep  4 15:28 allocateCertificateNumber.js
-rw-r--r-- 1 seela 197610  8320 Sep  4 15:28 allocateCertificateNumber.js.map

$ node -e "console.log(Object.keys(require('./functions/lib/allocateCertificateNumber.js')))"
exports: [ 'allocateCertificateNumber' ]
```

### 5b. Test suite

| | Files | Tests |
|---|---|---|
| Baseline (Phase 35A/35B) | 82 | 1721 |
| After this phase | **82** | **1721** |

```
 Test Files  82 passed (82)
      Tests  1721 passed (1721)
   Start at  15:28:44
   Duration  42.95s
```

**Unchanged, as required.** Expected: this phase touches no file under `src/`
and adds no test. The three files changed are `functions/src/allocateCertificateNumber.ts`
(new), `functions/src/index.ts` (one export line), and `firestore.rules` — none
is in the vitest surface.

### 5c. Deploy — handed to the owner

Not run by this session. Commands issued to the owner:

```
firebase deploy --only functions:allocateCertificateNumber
firebase deploy --only firestore:rules
```

---

## 8. Owner's deploy results, and the Task 5d curl

### 8.1 Functions — three attempts, and what they actually did

**Attempt 1 — failed at source discovery.**

```
i  functions: Loading and analyzing source code for codebase default to determine what to deploy
Serving at port 8008

Error: User code failed to load. Cannot determine backend specification. Timeout after 10000.
```

The CLI's discovery step loads `functions/lib/index.js` in a child process and
waits 10 s for it to describe its exports. This is a known-flaky step on Windows
and it is **not** deterministic — attempt 2 passed the same step seconds later
with the same code. The new module also adds no new weight to the import graph:
`exportToDrive.ts` already imports `firebase-admin/firestore` and the far heavier
`googleapis`, and `allocateCertificateNumber.ts` does no top-level work
(`getFirestore()` is called inside the handler, not at module scope).

**Attempt 2 — got through, then was cut off mid-create.**

```
+  functions: functions source uploaded successfully
i  functions: creating Node.js 22 (2nd Gen) function allocateCertificateNumber(asia-southeast1)...
```

Output ends there. The create call had already been submitted to the API, so it
continued server-side after the CLI stopped.

**Attempt 3 — generic failure.**

```
i  functions: packaged C:\Users\seela\Desktop\LIMS-New\functions (66.12 KB) for uploading

Error: An unexpected error has occurred.
```

### 8.2 Root cause of attempt 3 — a self-blocking CLI crash, unrelated to this code

Attempt 2 left a half-written function record. Extracted from the live API:

```
pingFunctions              state=ACTIVE     hasBuildConfig=True
allocateCertificateNumber  state=DEPLOYING  hasBuildConfig=False   <- malformed
exportJobsToGoogleDrive    state=ACTIVE     hasBuildConfig=True
```

`firebase functions:list --debug` exposed the real error the CLI was hiding:

```
TypeError: Cannot read properties of undefined (reading 'runtime')
    at Object.endpointFromFunction (firebase-tools/lib/gcp/cloudfunctionsv2.js:313:54)
    at loadExistingBackend (firebase-tools/lib/deploy/functions/backend.js:199:36)
```

`loadExistingBackend` enumerates already-deployed functions **before** the CLI
looks at any local source. It read the record with no `buildConfig`, dereferenced
`buildConfig.runtime`, and threw — surfacing as "An unexpected error has
occurred."

**This was not caused by the code in this phase.** `firebase functions:list`,
which never reads local source at all, crashed with the identical stack trace,
reproduced three times. While the malformed record existed, *every*
`firebase deploy --only functions:*` was blocked at that same first step, and
retrying could not clear it — attempt 3 demonstrated exactly that.

`firebase functions:delete` would not have rescued it either:
`firebase-tools/lib/commands/functions-delete.js:36` calls the same
`backend.existingBackend(context)`. The Firebase CLI could not clean up after
itself here; only `gcloud` bypasses it.

### 8.3 It resolved itself — deleting would have been wrong

No destructive action was taken. The endpoint was polled instead:

```
08:53:54Z  attempt 1  HTTP 404
08:54:55Z  attempt 2  HTTP 404
08:55:55Z  attempt 3  HTTP 403   <- STATE CHANGED

allocateCertificateNumber state=ACTIVE hasBuildConfig=True updateTime=2026-09-04T08:55:58Z
```

The interrupted create **completed server-side ~8 minutes later.** Had the stuck
record been deleted on the assumption it was abandoned, it would have destroyed a
deploy that was still in flight. The `updateTime` sitting still and the absent
`buildConfig` both pointed at "abandoned", and both were misleading.

With a well-formed record present, the CLI recovered on its own:

```
$ firebase functions:list
| allocateCertificateNumber | v2 | callable | asia-southeast1 | 256  | nodejs22 |
| exportJobsToGoogleDrive   | v2 | callable | asia-southeast1 | 1024 | nodejs22 |
| pingFunctions             | v2 | callable | asia-southeast1 | 256  | nodejs22 |
```

### 8.4 Firestore rules — DEPLOYED, clean

```
$ firebase deploy --only firestore:rules

=== Deploying to 'scs-lims'...

i  deploying firestore
i  firestore: ensuring required API firestore.googleapis.com is enabled...
i  firestore: reading indexes from firestore.indexes.json...
i  cloud.firestore: checking firestore.rules for compilation errors...
+  cloud.firestore: rules file firestore.rules compiled successfully
i  firestore: uploading rules firestore.rules...
+  firestore: released rules firestore.rules to cloud.firestore

+  Deploy complete!
```

**Task 4 is live.** The `certificateNumberAllocations` rule is in force: readable
by any authenticated user, writable by no client.

### 8.5 Task 5d curl — GATE NOT PASSED *at the time of writing* (resolved, see §8.7)

```
$ curl -i -X POST https://asia-southeast1-scs-lims.cloudfunctions.net/allocateCertificateNumber -H "Content-Type: application/json" -d "{\"data\":{}}"

HTTP/1.1 403 Forbidden
date: Fri, 04 Sep 2026 08:56:24 GMT
content-type: text/html; charset=UTF-8
server: Google Frontend
Content-Length: 320

<html><head>
<title>403 Forbidden</title>
</head>
<body>
<h1>Error: Forbidden</h1>
<h2>Your client does not have permission to get URL <code>/allocateCertificateNumber</code> from this server.</h2>
</body></html>
```

Control, same instant: `pingFunctions -> HTTP 401`.

**This is a FAILURE by the standard this phase set for itself.** The Task 1 gate
criterion states that "a platform-level 403 that never reaches the function is a
FAILURE". This is exactly that: an HTML page from Google Frontend, not the
callable protocol's JSON envelope, and not this function's own
`"You must be logged in to allocate a certificate number."`

The function body has still never executed.

**Diagnosis — supported, but NOT proven.**

Established facts:

- `pingFunctions`, with byte-identical `onCall` options (`region: 'asia-southeast1'`,
  `invoker: 'public'`), answers 401 from the same host at the same moment.
- The 403 is served by Google Frontend ahead of the container, so nothing in the
  function's code can produce or prevent it.
- The deploy that created this function was cut off partway through.

Most consistent explanation: `invoker: 'public'` is applied by firebase-tools as a
*post-create* IAM step (binding `allUsers` to `roles/run.invoker` on the Cloud Run
service), and the interrupted deploy never reached it. The function exists; its
front door was never unlocked.

**This was NOT verified directly.** The confirming check —
`gcloud run services get-iam-policy allocatecertificatenumber --region=asia-southeast1`
— could not run:

```
ERROR: (gcloud.run.services.get-iam-policy) There was a problem refreshing your
current auth tokens: ('invalid_grant: Bad Request', ...)
Please run: $ gcloud auth login
```

gcloud's stored credentials are stale. Re-authenticating was not requested,
because the remedy is the same whether or not the IAM binding is the precise
cause: **re-run the deploy.** The CLI is unblocked (§8.3), so a normal deploy now
runs every step it skipped, including the invoker binding.

### 8.6 Outstanding — one command

Re-verified 2026-09-06: state unchanged. `allocateCertificateNumber` still
returns 403; `pingFunctions` still returns 401; the redeploy has not been run.

```
firebase deploy --only functions:allocateCertificateNumber
```

**Why this command works, verified in the CLI's source rather than assumed.**

Two things had to be true for a redeploy to fix the invoker binding, and both
were checked against `firebase-tools@14.24.2`:

1. *The update path re-applies the invoker.* `updateV2Function`
   (`lib/deploy/functions/release/fabricator.js:389-440`) ends by computing
   `invoker = endpoint.httpsTrigger.invoker` and, when truthy, calling
   `run.setInvokerUpdate(project, serviceName, invoker)`. The function declares
   `invoker: 'public'`, so the binding is re-applied on update, not only on
   create.

2. *The function will not be skipped as unchanged.* This one is the trap. No
   source file changed since the failed deploy, so the deployed
   `firebase-functions-hash` still matches, and firebase-tools normally skips
   such functions ("Skipping the deploy of unchanged functions"). A skipped
   function never reaches `updateV2Function`, so the IAM step would never run
   and the deploy would report success while changing nothing.

   The skip predicate (`lib/deploy/functions/release/planner.js:18-22`) is:

   ```js
   const toSkipPredicate = (id) => !!(!want[id].targetedByOnly &&
       have[id].state === "ACTIVE" &&
       have[id].hash && want[id].hash &&
       want[id].hash === have[id].hash);
   ```

   `targetedByOnly` is set from the `--only` filters at
   `lib/deploy/functions/prepare.js:235`. Naming the function explicitly in
   `--only functions:allocateCertificateNumber` therefore makes
   `targetedByOnly` true, `!targetedByOnly` false, and the whole predicate
   false — the function is **not** skipped despite the matching hash, and takes
   the update path.

   **A bare `firebase deploy --only functions` would very likely skip it and
   fix nothing.** The explicit function name is load-bearing here, not tidiness.

Then re-run the §8.5 curl. **Expected on success:**

```
{"error":{"message":"You must be logged in to allocate a certificate number.","status":"UNAUTHENTICATED"}}
```

A JSON envelope carrying that function's own message closes Task 5d on the same
evidence that closed Task 1 (§2). Anything else — a further 403, or an HTML body
— means the invoker binding is not the cause and the IAM policy needs inspecting
directly, which requires `gcloud auth login` first (gcloud's stored refresh
token is still `invalid_grant` as of 2026-09-06).

Until that returns 401, **this phase is not finished**, and 35D must not be
started on top of it: 35D would switch the client onto a function that currently
refuses every caller at the door.

### 8.7 RESOLVED — 2026-09-06

The gate now passes:

```powershell
try { Invoke-RestMethod -Uri "https://asia-southeast1-scs-lims.cloudfunctions.net/allocateCertificateNumber" -Method Post -ContentType "application/json" -Body '{"data":{}}' }
catch { $_.Exception.Response.StatusCode.value__; $_.ErrorDetails.Message }

401
{"error":{"message":"You must be logged in to allocate a certificate number.","status":"UNAUTHENTICATED"}}
```

The function's own message, in the callable protocol's JSON envelope. **Task 5d
is closed and Phase 35C is complete.**

**The §8.5 diagnosis was right; the §8.6 remedy was wrong.**

The Cloud Run service `allocatecertificatenumber` was indeed missing its
`allUsers → roles/run.invoker` binding — its IAM policy was empty. That part of
§8.5 held up.

But §8.6 argued from the CLI source that
`firebase deploy --only functions:allocateCertificateNumber` would re-apply the
binding, on the grounds that `--only` sets `targetedByOnly` and so defeats the
skip-unchanged predicate at `planner.js:18-22`. **That prediction was wrong.**
The owner reports two redeploys did not add the binding. It was fixed by hand:

```
gcloud run services add-iam-policy-binding ...
```

The reading of the skip predicate was accurate as far as it went; the error was
concluding that reaching `updateV2Function` would therefore fix the IAM policy.
Source-reading established what the CLI *intends* to do, not what it actually
achieved against this service. §8.5's caveat — that a persistent 403 would mean
"the invoker binding is not the cause and the IAM policy needs inspecting
directly" — was the part worth acting on, and inspecting it directly is what
resolved it.

Recorded because §8.6 stood as a confident, wrong recommendation, and the next
person to hit an unreachable function should not follow it.

## 9. Accepted debt

**a. Duplicated formatting logic — two twins that must move together.**
`formatCertificateNumber` now exists twice: `src/services/certificateNumberGeneratorService.ts:26-56`
and `functions/src/allocateCertificateNumber.ts`. The browser bundle and the
Cloud Functions bundle share no code in this project — `functions/` has its own
`package.json` and `tsconfig.json` and cannot import from `src/`. If the two
ever disagree, numbers issued before and after a deploy will be shaped
differently and the certificate register will hold two formats. The new copy
carries a `⚠️ TWIN IMPLEMENTATION` header naming its partner; §10 records that
the reciprocal comment in `src/` could not be added in this phase.

**b. Name-based config lookup.**
The function resolves the config by matching `equipmentName` against
`certificate_number_configs.name`, because that is what the client does today
(`certificateNumberConfigService.ts:291-296`). Renaming an equipment type
therefore breaks allocation for it until the caller passes the new name, and two
configs sharing a name would resolve non-deterministically. Passing `configId`
directly would be strictly better and is the natural fix once 35D controls the
call site. Deliberately not "improved" here, per the prompt.

**c. No unit tests for the function body.**
`functions/` has no test runner at all — no vitest, no jest, no test script in
`functions/package.json`. Adding one is outside this phase and would have
changed the 82/1721 count the phase is required to hold constant. Compensating
evidence used instead: `tsc --strict` compiles clean, and the two riskiest
transcriptions (formatter, reset policy) were verified character-identical by
mechanical `diff` (§3, §4). The counter arithmetic and the ledger's
already-exists behaviour remain **unexercised** until a real allocation in 35D.

**d. A retry burns a number.**
A client that times out and retries allocates a fresh number; the first may
never appear on a certificate. ADR-019 D6 accepts this and the ledger makes each
gap explainable. No idempotency key was added, as instructed.

**e. Timezone divergence between the twins.** See §4. UTC on the server vs
Asia/Bangkok in the browser, material only in a ~7-hour window each New Year.

---

## 10. Things that contradicted the prompt

Four. None blocked the work; all are recorded because the prompt asked to be
treated as containing errors.

### 10.1 — `isActive !== false` vs `isActive == true` (prompt §2c)

The prompt says to resolve the config "among configs with `isActive !== false`".
The client does **not** do that. `getConfigByEquipmentName` calls
`getActiveConfigs`, which runs a Firestore query:

```ts
// certificateNumberConfigService.ts:111-115
const q = query(
  collection(db, COLLECTION_NAME),
  where('isActive', '==', true),
  orderBy('name', 'asc')
);
```

`where('isActive', '==', true)` and `isActive !== false` differ for one case: a
document with **no** `isActive` field. The query excludes it; `!== false` would
include it (and `documentToConfig` would report `isActive: true` for it).

Resolved by following the actual client code — `where('isActive','==',true)`
with the same `orderBy('name','asc')` — since §2c's stated intent is "the SAME
way the client does today" and its explicit instruction is not to improve the
matching. The required composite index `(isActive ASC, name ASC)` already exists
at `firestore.indexes.json:46-58`, so this adds no index work.

### 10.2 — The `failed-precondition` guard cannot fire where §2b implies (prompt §2b vs §2c)

§2b asks for `'not-found'` when no active config matches, and
`'failed-precondition'` when "config found but `isActive === false`". If the
lookup only ever returns active configs (§2c), the second condition is
unreachable — an inactive config is simply not found.

The client resolves this by checking twice, and the function now mirrors it
exactly:

- Outer lookup, active-only → miss throws `'not-found'`
  (mirrors `generateCertificateNumberForEquipment`, `:240-245`).
- Re-read inside the transaction → `!config.isActive` throws
  `'failed-precondition'` (mirrors `generateCertificateNumber`, `:98-100`).

So `'failed-precondition'` is reachable and meaningful: it fires when a config is
deactivated in the window between the lookup and the transaction. Both codes
exist as §2b requires; the guard is a TOCTOU check rather than dead code.

### 10.3 — §2g asks for a comment in `src/`; the Constraints forbid touching `src/`

§2g: *"Put a comment at the top of each of the two implementations naming the
other as its twin."* The Constraints say: *"Do NOT change any file under
`src/`."* §5b reinforces it: *"This phase touches no `src/` file."*

Resolved in favour of the constraint, which is stated twice and is the harder
rule. The twin comment was written in full in the **new** file only, naming
`src/services/certificateNumberGeneratorService.ts:26-56` explicitly.

**Outstanding, one line, for 35D:** add the reciprocal `⚠️ TWIN IMPLEMENTATION`
comment above `formatCertificateNumber` at
`certificateNumberGeneratorService.ts:26`, pointing back at
`functions/src/allocateCertificateNumber.ts`. 35D edits that file anyway. Until
then the pairing is documented from one side only — a real, if small, gap in the
protection §2g was asking for.

### 10.4 — The prompt did not anticipate the document-id hazard

`prefix` and `separator` are free-text inputs in the Certificate Number Manager
(`CertificateNumberManagerModal.tsx:396-414`; `separator` is `maxLength={5}`,
`prefix` unbounded). A `/` in either would make the formatted number an illegal
Firestore document id — and specifically, a `/` would **not** raise an error, it
would silently write into a subcollection, quietly voiding the uniqueness
guarantee that §5 calls the strongest thing this phase does.

A narrow `isValidDocumentId` guard was added: rejects empty, `/`, `.`, `..`,
`__…__`, and >1500 bytes, throwing `'failed-precondition'` naming the offending
string. This is the only logic in the function not transcribed from the client;
it exists solely to protect the invariant Task 3 is built on. Recorded here
because it was not in the prompt.

### Also confirmed correct in the prompt

- `firestore.rules` catch-all is at **:774**, as stated.
- `certificate_number_configs` rule is at **:161-165**, as stated.
- Test baseline **82 files / 1721 tests**, as stated.
- Config lookup at **:291-296**, formatter at **:26-56**, reset policy at
  **:105-116**, swallow-on-failure at **:152-158** — all as stated.
- Project root is `C:\Users\seela\Desktop\LIMS-New`; CLAUDE.md line 145's
  OneDrive path is indeed stale.

---

## Files changed

| File | Change |
|---|---|
| `functions/src/allocateCertificateNumber.ts` | **New.** The callable. |
| `functions/src/index.ts` | +1 line: `export { allocateCertificateNumber }` |
| `firestore.rules` | +17 lines: `certificateNumberAllocations` rule, above the catch-all |
| `docs/PHASE_35C_RESULT.md` | **New.** This report. |

No file under `src/` was modified. `src/dev/pingFunctionsProbe.ts` and its two
lines in `src/main.tsx` were left in place for 35D to remove. No dependency was
added to either `package.json`. Nothing was committed, stashed, or checked out.
