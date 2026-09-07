# Phase 36 Result — Four capabilities made real

Date: 2026-09-07
Branch: `feature/trace-ui`
Status: **COMPLETE, pending the owner's deploys (§7) and five box-unticks (§6).**

Four permissions that the Roles screen offered but nothing enforced are now real
in both places at once: refused by `firestore.rules`, and gated in the UI so the
app never offers an action the database will reject.

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
(14 modified files, all from phases 35B-35D; roleService.ts NOT among them)
```

Node processes, full command lines:

```
ProcessId   : 27004   npx-cli.js -y @modelcontextprotocol/server-pdf --stdio
ProcessId   : 21720   ...\@modelcontextprotocol\server-pdf\dist\index.js --stdio
ProcessId   : 16896   npx-cli.js "-y" "@modelcontextprotocol/server-pdf" "--stdio"
ProcessId   : 18584   ...\@modelcontextprotocol\server-pdf\dist\index.js --stdio
ProcessId   : 11608   "C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs/node_modules/npm/bin/npm-cli.js" run dev
ProcessId   : 15496   "node" "C:\Users\seela\Desktop\LIMS-New\node_modules\.bin\..\vite\bin\vite.js"
```

| Check | Result |
|---|---|
| Working directory | `C:\Users\seela\Desktop\LIMS-New` |
| Branch | `feature/trace-ui` |
| Worktrees | Exactly one: `C:/Users/seela/Desktop/LIMS-New` |
| **Dev server (vite, PID 15496)** | `C:\Users\seela\Desktop\LIMS-New\node_modules\...\vite\bin\vite.js` — **the project root.** RULE 3 satisfied. |
| Anything from `LIMS-New-Backup` | **None.** |

---

## 2. Task 1 — THE GATE: **PASSED**

The owner opened the running app as an administrator and reported
Settings → Users & Roles → Roles:

> **Administrator** — System role — **59 permissions**
> **Standard user** — System role — **39 permissions**
> *(caption: "Default role for standard accounts (legacy user.role value: staff)")*
> **No other roles.** The screen shows exactly these two cards.

| Question | Expected | Reported | |
|---|---|---|---|
| a. Administrator exists, count | 59 | **59** | ✅ |
| b. Standard user exists, count | 39 | **39** | ✅ |
| c. Other custom roles | — | **none** | ✅ |

**This is what made the rest of the phase safe to write.** The rules below fail
closed: `callerHasPermission()` returns false when the role document is missing
or lacks the action, for every role *including admin*. Had `roles/admin` held
fewer than 59, deploying them would have locked the laboratory out of its own
data. It holds all 59, so every capability gated below remains available to an
administrator on day one.

---

## 3. Task 2 — `firestore.rules`

Four blocks changed; **nothing else**. Each received its own local copy of
`callerRole()` and `callerHasPermission(action)`, transcribed from the `records`
block (`firestore.rules:283-295`) including the fail-closed comment. Deliberately
duplicated rather than hoisted, per the phase constraint. The `records` block
itself does not appear in the diff.

### Hunk 1 — `customers` (was :53-56)

```diff
     match /customers/{customerId} {
-      allow read: if true; // Public read for autocomplete in service request form
-      allow write: if request.auth != null;
+      function callerRole() { ... }
+      function callerHasPermission(action) { ... }
+
+      // PUBLIC READ IS DELIBERATE AND MUST STAY. The unauthenticated service
+      // request form autocompletes the customer name against this collection.
+      allow read: if true;
+      allow create, update: if request.auth != null;
+      allow delete: if request.auth != null && callerHasPermission('customers.delete');
     }
```

Splits the blanket `write` so that create and update stay open to any
authenticated user (unchanged in effect) while delete requires the permission —
and keeps the public read the service-request form depends on.

### Hunk 2 — `serviceRequests` (was :481-486)

```diff
-      allow read, update, delete: if request.auth != null;
+      allow read: if request.auth != null;
+      allow update: if request.auth != null && (
+        callerHasPermission('serviceRequests.convert') ||
+        callerHasPermission('serviceRequests.cancel')
+      );
+      allow delete: if request.auth != null && callerHasPermission('serviceRequests.delete');
```

Keeps the public `create` (how a customer submits without an account), and gates
update on either request permission — with a comment recording *why* it cannot be
finer: **cancelling and converting are both updates to the same document, and by
the time the write arrives they differ only in field values the client controls.**
A rule cannot tell them apart. The finer distinction is the UI's job (§4), and a
user holding neither permission is refused here regardless.

### Hunk 3 — `jobs` (was :595-599)

```diff
-      allow read, write: if request.auth != null;
+      allow read, create, update: if request.auth != null;
+      allow delete: if request.auth != null && callerHasPermission('jobs.delete');
```

Splits `write` into its three verbs **only** so delete can be gated; create and
update are unchanged in effect.

**On the subcollections.** This block contains seven nested matches (`documents`,
`spreadsheets`, `attachments`, `equipment`, `serviceRequests`, `notifications`,
`calibrations`). None was touched, and none is affected: Firestore rules do not
cascade, so each subcollection's own `allow read, write: if request.auth != null`
continues to govern it — including its delete behaviour. A comment in the file
now says so, because the risk of someone later "tidying" the parent and silently
changing seven subcollections is real.

### Hunk 4 — `staffLogs/{staffId}/actions/{actionId}` (was :708-719)

```diff
       allow read: if request.auth != null && (
-        request.auth.uid == staffId || getUserRole() == 'admin'
+        request.auth.uid == staffId ||
+        callerRole() == 'admin' ||
+        callerHasPermission('staffPerformance.view')
       );
```

Widens the read so the `staffPerformance.view` box means what it says. **Nothing
was taken away** — a role without the permission is still limited to its own
activity, exactly as before.

Verification:

```
$ git diff -- firestore.rules | grep -c "records/{recordId}"
0                                    # records block untouched
braces: 148 open / 148 close, balanced
```

---

## 4. Task 3 — the UI gates

Every control is **disabled with an explanatory title**, never hidden — following
the pattern Phase 35A used. A button that silently vanishes leaves the user
unable to tell whether the action is missing, broken, or simply not theirs.

### 3a — Customer deletion

| file:line | Change |
|---|---|
| `src/components/CustomerModal.tsx:4` | import `usePermission` |
| `src/components/CustomerModal.tsx:13` | `CUSTOMER_DELETE_NOT_PERMITTED_TITLE` |
| `src/components/CustomerModal.tsx:31` | `usePermission('customers.delete')` |
| `src/components/CustomerModal.tsx:306` | `disabled={loading \|\| !canDeleteCustomer}` |
| `src/components/CustomerModal.tsx:307` | explanatory `title` |

**Correction to the prompt:** it names `src/pages/CustomersPage.tsx` as a place a
customer is deleted. It has no delete control — grep for delete/remove returns
nothing. `CustomerModal.tsx` is the only one, and it calls `deleteDoc` directly
rather than going through `customerService`.

### 3b — Service requests

| file:line | Change |
|---|---|
| `src/pages/PendingJobsPage.tsx:8` | import `usePermission` |
| `src/pages/PendingJobsPage.tsx:19,21` | the two explanatory titles |
| `src/pages/PendingJobsPage.tsx:29-30` | `usePermission('serviceRequests.convert' / '.cancel')` |
| `src/pages/PendingJobsPage.tsx:478,481-482` | Convert gated + title |
| `src/pages/PendingJobsPage.tsx:492,494` | Cancel gated + title |

---

## 5. Task 4 — the Standard user default

`DEFAULT_ROLE_PERMISSIONS.standardUser` gains five exclusions, with a comment
naming the phase and the reason. **39 → 34.**

```diff
+    // Phase 36 — the capabilities the owner decided a technician must be
+    // genuinely prevented from using, rather than merely discouraged from.
+    // Each is now enforced in firestore.rules AND gated in the UI, so these
+    // are the first permissions in this list that are real in both places.
+    if (
+      action === 'customers.delete' ||
+      action === 'jobs.delete' ||
+      action === 'serviceRequests.cancel' ||
+      action === 'serviceRequests.convert' ||
+      action === 'staffPerformance.view'
+    ) {
+      return false;
+    }
```

---

## 6. ⚠ THIS CHANGES NOTHING FOR THE EXISTING ROLE — read this

`DEFAULT_ROLE_PERMISSIONS` **seeds new role documents only.** It is a constant
used when a role is created. Changing it does **not** rewrite anything already in
Firestore.

**The `roles/staff` document in your database still holds its 39 permissions**,
and will continue to, until you change it by hand. Until then a Standard user
still *has* all five — though the UI now hides the controls and the rules now
refuse the writes, so the practical effect is already in force once you deploy.

To make the role document match, open **Settings → Users & Roles → Roles → Standard user**
(the pencil icon) and untick these five boxes:

| Category | Box to untick |
|---|---|
| **Customers** | Delete customers |
| **Jobs** | Delete jobs |
| **Service Requests** | Cancel service requests |
| **Service Requests** | Convert service requests to jobs |
| **Staff Performance** | View staff performance dashboard and metrics for all staff |

The count on the card should read **34 permissions** afterwards. Leave
**Administrator at 59** — untouched.

---

## 7. Tests

### New files

| File | Tests |
|---|---|
| `src/services/__tests__/roleDefaultsPhase36.test.ts` | 14 |
| `src/components/__tests__/CustomerModalDeleteGate.test.tsx` | 4 |
| `src/pages/__tests__/PendingJobsPageRequestGates.test.tsx` | 7 |

No existing test was modified.

### Proof each test is real — revert, fail, restore

Every gate was individually reverted, the test run, then restored and the file
hash compared. **A test that has never failed has never been tested.**

**Proof 1 — CustomerModal delete gate** (`disabled={loading || !canDeleteCustomer}` → `disabled={loading}`):

```
× a user WITHOUT customers.delete sees Delete disabled, and is told who to ask
  → expected false to be true // Object.is equality
Tests  1 failed | 3 passed (4)

--- RESTORED: hash match = YES ---
Tests  4 passed (4)
```

**Proof 2 — Convert gate** (`disabled={!canConvertRequest || …}` → `disabled={…}`):

```
× Convert is gated on serviceRequests.convert > a user WITHOUT the permission sees Convert disabled
× the two permissions are independent > holding neither disables both controls
Tests  2 failed | 5 passed (7)
```

**Proof 3 — Cancel gate** (`disabled={!canCancelRequest}` → `disabled={false}`):

```
× Cancel is gated on serviceRequests.cancel > a user WITHOUT the permission sees Cancel disabled
× the two permissions are independent > holding neither disables both controls
Tests  2 failed | 5 passed (7)

--- RESTORED: hash match = YES ---
Tests  7 passed (7)
```

**Proof 4 — the defaults** (one exclusion, `jobs.delete`, removed):

```
× does NOT grant jobs.delete by default
  → expected [ 'serviceRequests.view', …(34) ] to not include 'jobs.delete'
× totals 34 permissions
  → expected … to have a length of 34 but got 35
× is exactly ALL_PERMISSIONS minus the documented exclusions
Tests  3 failed | 11 passed (14)

--- RESTORED: hash match = YES ---
Tests  14 passed (14)
```

Each gate fails **its own** test independently, and the shared "holding neither"
test catches both service-request gates.

### What could NOT be tested

**`firestore.rules` has no test coverage here, and this phase did not add any.**
Testing rules requires the Firebase emulator, which requires a JRE the owner's
machine does not have (recorded in ADR-019's rejected alternatives). So the four
rule changes in §3 are **reviewed, not executed**. Their correctness rests on
reading, on the transcription being identical to the `records` block that has
been live since Phase 5d, and on the gate answer in §2.

This is the weakest link in the phase and should be stated plainly rather than
implied away: **the UI gates are tested; the rules that back them are not.**

---

## 8. Verification

```
$ npx tsc --noEmit
(clean)

$ npm run build
✓ built in 31.11s
```

Test counts are reported jointly with Phase 37 in `PHASE_37_RESULT.md` §7, since
both phases ran in one session: **82 files / 1726 tests → 86 / 1756**, of which
Phase 36 contributes 3 files and 25 tests.

---

## 9. Hand over — order matters

```
firebase deploy --only firestore:rules
firebase deploy --only hosting
```

**Rules first.** If the app shipped first, it would hide controls the database
still permits — harmless, invisible. The reverse would let the database refuse
actions the app still offers, which is precisely the bug that started this whole
series: a Standard user pressing a button and getting
`Missing or insufficient permissions.`

The hosting predeploy runs the full test suite first, so a failure blocks the
deploy rather than shipping it.

**Rollback:** for the app, Firebase Console → Hosting → release history →
Rollback. For rules, redeploy from the previous commit.

Then do the five unticks in §6.

---

## 10. Things that contradicted this prompt

1. **`CustomersPage.tsx` has no delete control** (§4). One fewer file than the
   prompt implies; `CustomerModal.tsx` is the only site.
2. **`callerRole()` starts at `:283`, not `:284`.** The full helper pair is
   `:283-295`; that is what was transcribed.
3. **`getUserRole()` in the `staffLogs` block is now unused.** The prompt said to
   use `callerRole() == 'admin'` in the widened read, which leaves the older
   helper with no caller. It was **left in place** because the prompt also says
   "Change NOTHING else in firestore.rules". It is dead but harmless; removing it
   is a one-line follow-up. Note the two are not equivalent: `getUserRole()`
   returns null safely for a missing user document, whereas `callerRole()` fails
   closed — which is the intended behaviour here.
