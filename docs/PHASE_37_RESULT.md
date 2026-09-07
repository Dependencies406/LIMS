# Phase 37 Result — Three orphaned permissions made grantable; the fake scanner removed

Date: 2026-09-07
Branch: `feature/trace-ui`
Status: **COMPLETE, pending the owner's deploy (§9).**

Ran immediately after Phase 36 in the same session, once the owner answered
Phase 36's role-document gate. An earlier issue of this prompt stopped at Task 1a
because Phase 36 had not landed; that stop was correct, and this result
supersedes it.

---

## 1. Pre-work

Same session and tree as `PHASE_36_RESULT.md` §1.

| Check | Result |
|---|---|
| Working directory | `C:\Users\seela\Desktop\LIMS-New` |
| Branch | `feature/trace-ui` |
| Worktrees | Exactly one: `C:/Users/seela/Desktop/LIMS-New` |
| **Dev server (vite, PID 15496)** | `C:\Users\seela\Desktop\LIMS-New\node_modules\...\vite\bin\vite.js` — **the project root.** RULE 3 satisfied. |
| Anything from `LIMS-New-Backup` | **None.** |

Other node processes: PID 11608 (`npm run dev`, the parent of the vite process)
and four MCP `server-pdf` helpers, unrelated to this repo.

---

## 2. Task 1 — the three findings

### 1a — Phase 36 landed (in this session)

`docs/PHASE_36_RESULT.md` now exists and `roleService.ts` carries all five
Phase 36 exclusions. `standardUser` where Phase 37 began: **34**.

*On the prompt's first issue this gate FAILED* — Phase 36 had never run,
`standardUser` was 39, and nothing was edited. It was unblocked when the owner
reported Administrator = 59, Standard user = 39, no other roles.

### 1b — the scanner was provably inert

**`scanForNewFeatures()` returned `[]`. Unconditionally, on every call.**

| Step | Line | What happened |
|---|---|---|
| 1 | `:217` | `scanForNewFeatures()` → `await this.discoverFromRegistry()` |
| 2 | `:139` | → `permissionRegistry.getAll()` |
| 3 | `:293` | → `Array.from(this.registeredPermissions.values())` |
| 4 | `:241` | `registeredPermissions` is `new Map()`, mutated **only** by `register()` (`:267`) |
| 5 | — | `register()` was called **nowhere** — the Map was always empty |
| 6 | `:227` | `findNewPermissions([])` → `[]` |

```
$ grep -rn "permissionRegistry.register(" src/
src/services/permissionDiscoveryService.ts:258:   * permissionRegistry.register('jobs.export', ...);
src/services/permissionDiscoveryService.ts:263:   *   permissionRegistry.register('jobs.export', ...);
```

**Two hits, both inside a JSDoc `@example` block in the file itself** — comment
text, not code. Zero hits anywhere else, exactly as the prompt predicted.

The other three sources were equally empty: `discoverFromRoutes()` (`:75`),
`discoverFromActions()` (`:93`) and `discoverFromServices()` (`:118`) each
declared `const discovered = []`, contained nothing but commentary describing
what a real implementation *would* do, and returned that empty array.

So the button reported "0 new permission(s) found" every time it was pressed, no
matter what the codebase contained.

### 1c — the call-site list, re-derived

By walking `src/` for `usePermission(<string literal>)` and diffing against
`ALL_PERMISSIONS` parsed from `roleService.ts`:

```
ALL_PERMISSIONS entries          : 59
distinct usePermission() strings : 16
total call sites                 : 20

=== MISSING from ALL_PERMISSIONS (3) ===
  equipmentControl.deleteDocuments   src/pages/equipment/EquipmentDetailPage.tsx:2560
  staffTraining.manage               src/pages/StaffPage.tsx:856
  staffTraining.view                 src/pages/StaffPage.tsx:855
```

**My list matches the prompt's exactly.** Both cited ranges were accurate
(StaffPage 850-860 → actual 855-856; EquipmentDetailPage 2555-2565 → actual 2560).

Also established: **`usePermission()` is the only permission-consultation idiom in
the app** — `grep` for `.can('…')` and `hasPermission('…')` returns nothing. A
scanner looking only for `usePermission` is not missing a second mechanism.

---

## 3. Task 2 — the three permissions

```diff
+  // Equipment Control permissions (equipment records and their attached documents)
+  { action: 'equipmentControl.deleteDocuments', category: 'Equipment Control', description: 'Delete documents attached to an equipment record' },
+
   // Recorder Templates permissions (admin-only per Data & Info Management domain model)
```

```diff
   { action: 'staffPerformance.exportLogs', category: 'Staff Performance', description: 'Export staff performance logs' },
+
+  // Staff Training permissions (LAB-FM-QP-03-005 training records)
+  { action: 'staffTraining.view', category: 'Staff Training', description: 'View staff training records and competence history' },
+  { action: 'staffTraining.manage', category: 'Staff Training', description: 'Add, edit, and remove staff training records' },
 ];
```

Placed so the Roles screen groups them sensibly: Equipment Control beside
Equipment Types, Staff Training beside Staff Performance.

```diff
+    // Phase 37 — three permissions the app was already consulting but that no
+    // role could grant, because they were missing from ALL_PERMISSIONS. Adding
+    // them makes the checks real; excluding them here follows the same line the
+    // owner drew in Phase 36. Deleting an equipment document is destructive,
+    // and training records are competence records the quality manager owns.
+    // Either can now be granted by ticking a box in the Roles screen.
+    if (
+      action === 'equipmentControl.deleteDocuments' ||
+      action === 'staffTraining.view' ||
+      action === 'staffTraining.manage'
+    ) {
+      return false;
+    }
```

| | Before | After |
|---|---|---|
| `ALL_PERMISSIONS` | 59 | **62** |
| `DEFAULT_ROLE_PERMISSIONS.standardUser` | 34 | **34** (held) |
| `usePermission` strings missing from the list | 3 | **0** |

`PermissionAction` was **not** changed — verified it already contained all three,
and `git status` shows `src/types/index.ts` untouched.

**Note for the Roles screen:** these are three new boxes that no existing role
holds, so Administrator's card will keep reading **59** until they are ticked.
Nothing breaks either way — an unticked box means the control stays disabled,
which is exactly the behaviour all three had before this phase. Tick them on
Administrator if an admin should be able to delete equipment documents and manage
training records.

---

## 4. Task 3 — the real check

**`src/services/__tests__/permissionCallSites.test.ts`** — 5 tests.

It reads source from disk rather than importing it, because the thing being
checked is a *string literal in a file*: the type system cannot see the mismatch
(`PermissionAction` already contained all three), and an import graph would only
cover files something happens to import.

- Walks `src/` recursively via `readdirSync`/`statSync` — **no hard-coded file
  list**, so a permission added in a new file next year is covered automatically.
  Skips `node_modules` and `dist`.
- Excludes itself, with a test asserting the exclusion works — otherwise its own
  regex and comments would surface as bogus orphans.
- Asserts **one direction only**: every permission consulted must be listed. The
  converse is deliberately not asserted; 43 listed permissions have no call site,
  and that backlog belongs to `PHASE_34_RESULT.md`, not here.
- Includes a `callSites.length > 10` guard, so a broken walk fails loudly instead
  of passing vacuously forever.
- Records in its own test that dynamic calls (`usePermission(someVar)`) cannot be
  resolved from source — a stated limitation rather than an unnoticed hole.

### Proof it is real

`staffTraining.view` was removed from `ALL_PERMISSIONS`, the test run, then
restored and the file hash compared:

```
--- FAILING RUN ---
1 permission(s) are checked by the app but cannot be granted by any role.
  staffTraining.view
      consulted at src/pages/StaffPage.tsx:855
      but missing from ALL_PERMISSIONS in src/services/roleService.ts

FAIL src/services/__tests__/permissionCallSites.test.ts > every usePermission() string exists in ALL_PERMISSIONS
Tests  2 failed | 3 passed (5)

--- RESTORED: hash match = YES ---

--- PASSING RUN ---
Test Files  1 passed (1)
     Tests  5 passed (5)
```

The failure names **the permission and the file:line**, so whoever sees the red
test knows what to add without reading this document.

---

## 5. Task 4 — the fake scanner removed (CLAUDE.md RULE 2)

### RULE 2 pre-flight

Before deleting: the feature was proven inert (§1b), every consumer enumerated,
and the owner authorised the deletion by choosing it from an explicit list of
exactly what would be removed.

The prompt named four things. **A search found more state than it listed** —
reported rather than silently handled:

| Prompt says | Actually present |
|---|---|
| the import at `:5` | ✅ `:5` |
| "its handler and any state it owns (around `:115`)" | **two** handlers — `handleScanForPermissions` `:112`, `handleAddDiscoveredPermissions` `:132` — and **four** state vars: `showDiscoveryModal` `:38`, `discoveredPermissions` `:39`, `scanning` `:40`, `selectedDiscoveries` `:41` |
| the button (`:338`) | `:338` is the button's *label text*; `onClick` is `:321`, the block starts `:318` |
| the result modal (`:643` onward) | `:643` is the heading; the block is `{showDiscoveryModal && (` at `:638` through `:766` |

All four state vars sat together under their own `// Permission discovery state`
comment, and every use was inside the scanner's own handlers and JSX — **nothing
was shared with the rest of the screen.** That is what made the removal safe, and
it is why the extra items did not trigger the prompt's "STOP if any step reveals
another consumer" clause: they were more of the same feature, not a new consumer.

### 4a — `RoleManagementModal.tsx`

```
$ git diff --stat -- src/components/RoleManagementModal.tsx
 src/components/RoleManagementModal.tsx | 215 ---------------------------------
 1 file changed, 215 deletions(-)
```

**Pure deletion — 215 lines removed, 0 added.** 833 lines → 618. (A first pass
left one whitespace-only line where the state block had been; it was normalised
so the diff contains no insertions at all.)

```
$ grep -n "discoveredPermissions\|showDiscovery\|handleScan\|handleAddDiscovered\|scanning\|selectedDiscoveries\|permissionDiscovery\|DiscoveredPermission\|Scan for New" src/components/RoleManagementModal.tsx
  ZERO
```

Nothing else on the screen was touched — it is in daily use.

### 4b — the service file

```
$ grep -rn "permissionDiscoveryService" src/     # immediately before deleting
src/services/permissionDiscoveryService.ts:42:  export const permissionDiscoveryService = {
src/services/permissionDiscoveryService.ts:255:  * import { permissionRegistry } from '../services/permissionDiscoveryService';
```

Both remaining hits were **self-references inside the file itself** — zero
external consumers. Deleted: `src/services/permissionDiscoveryService.ts`, 310 lines.

### 4c — proof of complete removal

```
'permissionDiscovery'  -> 0 hits
'permissionRegistry'   -> 0 hits
'DiscoveredPermission' -> 0 hits
'Scan for New'         -> 0 hits

$ npx tsc --noEmit
(clean)
```

`tsc` could not be clean if anything still referenced the deleted module, so that
is the load-bearing half of the proof — the greps merely say where to look.

---

## 6. What could NOT be tested

**`firestore.rules` remains untested.** The emulator needs a JRE the owner's
machine does not have (recorded in ADR-019's rejected alternatives). Phase 37
changed no rules, so it adds no new untested surface — but Phase 36's four rule
changes are reviewed, not executed, and that should be said plainly rather than
implied away.

**The new test cannot see dynamic call sites.** `usePermission(someVariable)` is
not statically resolvable and would slip past. None exists today; the test states
the limitation in its own assertion so it is a known choice, not a silent gap.

---

## 7. Verification

```
$ npx tsc --noEmit
(clean)

$ npm run build
✓ built in 31.11s
```

The build's chunk-size and `exceljs` dynamic-import warnings are pre-existing and
unrelated.

### Test counts — both phases together

| | Files | Tests |
|---|---|---|
| Before (Phase 35D baseline) | 82 | 1726 |
| **After** | **86** | **1756** |

Every delta accounted for:

| New file | Phase | Tests |
|---|---|---|
| `src/services/__tests__/roleDefaultsPhase36.test.ts` | 36 | +14 |
| `src/components/__tests__/CustomerModalDeleteGate.test.tsx` | 36 | +4 |
| `src/pages/__tests__/PendingJobsPageRequestGates.test.tsx` | 36 | +7 |
| `src/services/__tests__/permissionCallSites.test.ts` | **37** | +5 |
| **Total** | | **+4 files, +30 tests** |

82 + 4 = 86 ✅  1726 + 30 = 1756 ✅
**No existing test was modified**, in either phase.

---

## 8. git status — every file accounted for

| File | Status | Phase |
|---|---|---|
| `firestore.rules` | modified | 36 |
| `src/services/roleService.ts` | modified | 36 + 37 |
| `src/components/CustomerModal.tsx` | modified | 36 |
| `src/pages/PendingJobsPage.tsx` | modified | 36 |
| `src/components/RoleManagementModal.tsx` | modified (−215) | **37** |
| `src/services/permissionDiscoveryService.ts` | **deleted** (−310) | **37** |
| 4 new test files | new | 36 + 37 |
| `docs/PHASE_36_RESULT.md`, `docs/PHASE_37_RESULT.md` | new | — |
| `package.json`, `package-lock.json`, `src/App.tsx` | **untouched** | — |
| `src/types/index.ts` | **untouched** (`PermissionAction` unchanged) | — |

Everything else in `git status` predates these phases (35B–35D). Nothing
committed, stashed, checked out or reverted. No branch or worktree created. No
dependency added; no `npm install/update/ci` run.

---

## 9. Hand over

Phase 36 and Phase 37 share `roleService.ts`, so they ship together. **Phase 36
changed rules, and rules go first:**

```
firebase deploy --only firestore:rules
```

```
firebase deploy --only hosting
```

**Why that order.** If the app shipped first it would hide controls the database
still permits — harmless and invisible. The reverse would let the database refuse
actions the app still offers, which is exactly the bug that began this series: a
Standard user pressing a button and getting `Missing or insufficient permissions.`

The hosting predeploy runs the full suite first, **so the new call-site test now
guards every deploy from here on** — a permission consulted but not grantable
will block the release rather than ship as a dead control.

**Rollback:** Firebase Console → Hosting → release history → Rollback for the
app; redeploy from the previous commit for rules.

Then do **the five box-unticks** in `PHASE_36_RESULT.md` §6 — the deploy enforces
the new behaviour, but the existing `roles/staff` document still lists all 39
permissions until you change it by hand.

---

## 10. Things that contradicted this prompt

1. **Phase 36 had not landed** on the prompt's first issue. Resolved by running
   Phase 36 first in this session, after the owner answered its gate.
2. **Task 4's inventory was incomplete** — a second handler and four state
   variables rather than "any state it owns" (§5). Nothing was shared, so the
   removal was still safe, but the prompt under-described what it was asking to
   delete.
3. **"37 of them do not [have a call site]" is not the figure for this
   mechanism.** By `usePermission`, **46** of 59 were unconsulted before this
   phase (43 of 62 after). The 37 comes from Phase 34's differently-drawn buckets,
   which count rules enforcement as well as UI checks — 37 and 46 measure
   different things and neither is wrong. The instruction it supports (*do not
   assert the converse*) was followed regardless; only the number should not be
   quoted as "call sites missing".
4. **Confirmed correct:** the scanner's inertness, the three missing permissions
   and their exact file:line locations, `PermissionAction` already containing all
   three, `RoleManagementModal.tsx` as the sole consumer, and — the one that
   mattered for Task 3 — that a directory walk from a test under `src/` resolves
   and reads every source file without reaching outside `src/`.
