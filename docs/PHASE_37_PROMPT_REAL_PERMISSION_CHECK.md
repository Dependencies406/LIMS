# Phase 37 — Replace the fake permission scanner with a real one

> **RUN THIS AFTER PHASE 36 IS COMPLETE AND VERIFIED.** Both phases edit
> `roleService.ts`. Task 1 refuses to start if Phase 36's changes are not present.

## Model and effort

**Claude Opus 5 · Effort: High**

Two of the three pieces are small. The third is a deletion inside a 35 KB
component — removing a button, its handler, its state and its result modal without
disturbing the rest of a screen the owner uses daily. And `roleService.ts` will
have been edited by Phase 36 hours earlier, so this must build on that, not around
it.

**Stop and report, rather than working around, if:**

- Phase 36's changes are not in the tree (Task 1).
- Removing the scanner would require touching anything beyond the files named.
- The new test does not fail before the fix (Task 3).

## Context for a fresh session

Governing: `docs/PHASE_34_RESULT.md` §3 (the three ungrantable permissions) and
`docs/PHASE_36_RESULT.md`.

### What is wrong

The Roles screen has a **"Scan for New Permissions"** button. It reports
*"0 new permission(s) found in the codebase — All Up To Date!"*, and it is
structurally incapable of reporting anything else.

Verified by reading the exact path the button takes:

- `RoleManagementModal.tsx:321` is the button; `:112` `handleScanForPermissions`
  calls `permissionDiscoveryService.scanForNewFeatures()`; `:643` renders the
  "Discovered Permissions" result modal, which has its OWN second handler,
  `handleAddDiscoveredPermissions` at `:132`, with its button at `:753`.
  **Both handlers and both buttons go.**
- `permissionDiscoveryService.ts:217-228` — `scanForNewFeatures()` calls
  `discoverFromRegistry()` and returns `findNewPermissions(...)` of it.
- `discoverFromRegistry()` (`:136-150`) reads `permissionRegistry`, an in-memory
  `Map` (`:241-247`) populated only by `register()` (`:267`).
- **Nothing in `src/` ever calls `permissionRegistry.register()`.** Verified by
  repository-wide search. The Map is empty on every page load.
- The other three discovery methods — `discoverFromRoutes()` (`:70-87`),
  `discoverFromActions()` (`:92-111`), `discoverFromServices()` (`:116-133`) —
  have bodies consisting entirely of comments describing what a real
  implementation *would* do, followed by `return discovered` on an empty array.

So the scan compares an empty set against the permission list, finds nothing
missing, and shows a green tick. It would show the same tick on any codebase.

**It also cannot be repaired in place**: it runs in a browser, and a browser cannot
read source files. "Scans the codebase" is not a thing that code can do.

**Why it matters beyond being a dead button:** it is a control that reports
compliance without performing a check. The owner is a quality manager; a screen
asserting that permissions are in step with the application, wired to nothing, is
worse than no screen at all.

### The check that should exist, and what it would catch

**16 distinct permission strings are consulted through `usePermission()` across 21
call sites** in `src/`. Verified list:

    documentIndex.manage, equipmentControl.deleteDocuments, jobs.create,
    jobs.delete, jobs.edit, jobs.generatePdf, recorderTemplates.edit,
    recorderTemplates.publish, records.approve, records.commit, records.review,
    records.revise, staffPerformance.exportLogs, staffPerformance.view,
    staffTraining.manage, staffTraining.view

**Three of them are not in `ALL_PERMISSIONS`**, so the Roles screen never offers
them and no role can ever hold them:

| Permission | Live call site |
|---|---|
| `equipmentControl.deleteDocuments` | `src/pages/equipment/EquipmentDetailPage.tsx:2560` |
| `staffTraining.view` | `src/pages/StaffPage.tsx:855` |
| `staffTraining.manage` | `src/pages/StaffPage.tsx:856` |

Because `usePermission` returns false for a permission no role can hold, and
admins bypass it (`PermissionContext.tsx:89`), the practical effect today is
**admin-only, permanently, with no way to delegate**. Nobody but an admin can view
or manage training records, or delete an equipment document.

These are not trivial: training records are competence records (ISO/IEC 17025
clause 6.2), and equipment documents are part of the equipment record.

### Verified facts

1. `ALL_PERMISSIONS` — `roleService.ts:23-110`, **59 entries before this phase**.
2. `PermissionAction` — `src/types/index.ts:3`, a union of **70** strings, which
   already includes all three above. Only the Roles-screen list is missing them.
3. `DEFAULT_ROLE_PERMISSIONS.standardUser` — `roleService.ts:118-139`, an
   exclusion filter over `ALL_PERMISSIONS`. Phase 36 removes five entries from it.
   **Read the actual count out of the tree; do not assume a figure.** Before
   Phase 36 it is 39.
4. Only `RoleManagementModal.tsx` imports `permissionDiscoveryService` (line 5).
   Nothing else in `src/` references it or `permissionRegistry`.
5. **Tests live under `src/` only.** `vite.config.ts` sets
   `test.include: ['src/**/*.{test,spec}.{ts,tsx}']` — a test placed anywhere else
   is silently never run. `tsconfig.json` includes only `src`.
6. Baseline: whatever Phase 36 left. Read it from `docs/PHASE_36_RESULT.md`; do
   not assume.

## Prompt

    Read first:
      - CLAUDE.md — hard rules, especially RULE 1 and RULE 2 (deletions)
      - docs/PHASE_37_PROMPT_REAL_PERMISSION_CHECK.md — this file
      - docs/PHASE_36_RESULT.md — what the previous phase changed
      - src/services/permissionDiscoveryService.ts — ALL of it
      - src/components/RoleManagementModal.tsx lines 1-20, 105-130, 330-345, 635-700
      - src/services/roleService.ts lines 20-140
      - src/pages/StaffPage.tsx lines 850-860 and
        src/pages/equipment/EquipmentDetailPage.tsx lines 2555-2565

    ## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)
        git branch
        git worktree list
        git status
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
          Select-Object ProcessId, CommandLine | Format-List

    Report each FULL path. Confirm nothing runs from LIMS-New-Backup. Project root
    is C:\Users\seela\Desktop\LIMS-New.

    ## Task 1 — THE GATE. Confirm Phase 36 landed, and the premise holds.

    1a. Confirm `docs/PHASE_36_RESULT.md` exists and that `roleService.ts` shows
        Phase 36's exclusions (`customers.delete`, `jobs.delete`,
        `serviceRequests.cancel`, `serviceRequests.convert`,
        `staffPerformance.view`). Report the current `standardUser` count.
        If Phase 36 is not present, STOP — this phase edits the same file.

    1b. Prove the scanner is inert. Report the exact return value of
        `scanForNewFeatures()` by tracing the code, and confirm by search that
        `permissionRegistry.register(` appears nowhere in `src/` outside
        `permissionDiscoveryService.ts`.

    1c. Re-derive the call-site list yourself — every string literal passed to
        `usePermission()` in `src/` — and compare it against `ALL_PERMISSIONS`.
        Report the strings that are missing. Expected: the three named above. If
        the set differs, report it and use YOUR list, not this prompt's.

    ## Task 2 — Make the three permissions grantable

    Add all three to `ALL_PERMISSIONS` in `roleService.ts`, in the existing style,
    with sensible categories and descriptions:

      - `equipmentControl.deleteDocuments` — category "Equipment Control"
      - `staffTraining.view` and `staffTraining.manage` — category "Staff Training"

    Place them so the Roles screen groups them sensibly. `ALL_PERMISSIONS` goes
    from 59 to 62.

    **Exclude all three from `DEFAULT_ROLE_PERMISSIONS.standardUser`**, alongside
    Phase 36's exclusions. Do NOT assume a resulting count — compute it from the
    tree you actually have and report it. Reasoning to put in the
    comment: deleting an equipment document is destructive, and training records
    are competence records the quality manager owns — both follow the same line
    the owner drew in Phase 36. Now that the Roles screen works, he can grant
    either by ticking a box.

    Do NOT change `PermissionAction` — it already contains all three.

    ## Task 3 — The real check

    Add `src/services/__tests__/permissionCallSites.test.ts`. It must, by reading
    the source files from disk:

      - find every string literal passed to `usePermission()` anywhere under `src/`
      - assert every one of them exists in `ALL_PERMISSIONS`
      - on failure, name the offending permission AND the file:line, so whoever
        sees the red test knows exactly what to add

    Discover files by walking the directory, not from a hard-coded list — a
    permission added in a new file next year must be covered automatically.
    Exclude the test file itself from the scan.

    This asserts ONE direction only: every permission the app consults must be
    grantable. Do NOT assert the converse (that every listed permission has a call
    site) — **46 of the 59 are never consulted through `usePermission`**, and that
    backlog is not this phase. (Phase 34's figure of 37 counts a different set: its
    buckets weigh rules enforcement too, not only call sites. Both numbers are
    right about different things.)

    **Prove the test is real.** Run it BEFORE Task 2's change (or temporarily
    revert one of the three additions), show it failing and naming the missing
    permission, then restore and show it passing. Paste both runs. A test that has
    never failed has never been tested.

    ## Task 4 — Remove the fake scanner (CLAUDE.md RULE 2 applies)

    Delete, in this order, showing `git diff` for each step in the report:

    4a. In `RoleManagementModal.tsx`, remove ALL of: the scan button (`:321`) and
        its handler `handleScanForPermissions` (`:112`); the "Discovered
        Permissions" result modal (`:643` onward) INCLUDING its own button (`:753`)
        and handler `handleAddDiscoveredPermissions` (`:132`); every piece of state
        those two handlers own; and the import at `:5`. Verify no other handler or
        state survives orphaned. Remove nothing else — this screen is in daily use.
    4b. `src/services/permissionDiscoveryService.ts` — delete the file.
    4c. Prove the removal is complete: search `src/` for `permissionDiscovery`,
        `permissionRegistry`, `DiscoveredPermission` and "Scan for New" and show
        zero hits. Confirm `npx tsc --noEmit` is clean, which it cannot be if
        anything still references the deleted module.

    If any step reveals another consumer, STOP and report rather than deleting.

    ## Task 5 — Prove and hand over

    5a. `npx tsc --noEmit` clean; `npm test` before and after with every delta
        accounted for; `npm run build` succeeds.
    5b. Write `docs/PHASE_37_RESULT.md`: pre-work; Task 1's three findings; the
        `roleService.ts` diff; the new test with both the failing and passing runs;
        the full deletion diff; the proof of no remaining references; test counts;
        `git status`; anything that contradicted this prompt.
    5c. STOP and hand the owner:

            firebase deploy --only hosting

        No rules change in this phase, so hosting alone. The predeploy runs the
        full suite first, so the new test guards the deploy from now on.

    ## Constraints

      - Do NOT touch `firestore.rules`. Do NOT deploy anything.
      - Do NOT touch `package.json`, `package-lock.json`, `src/App.tsx`.
      - Do NOT modify any existing test.
      - Do NOT change `PermissionAction`.
      - Do NOT wire up, remove, or otherwise touch the other decorative
        permissions — that backlog is a separate phase.
      - Do NOT put the new test outside `src/` (fact 5).
      - Do NOT add dependencies; do NOT run npm install/update/ci.
      - Do NOT commit, stash, checkout, revert, or create a branch or worktree.
      - If a stated fact here turns out to be wrong, STOP and report it. Assume
        this prompt contains an error and find it.

## Done when

1. `npm test` contains a check that fails the build if anyone adds a permission
   check to the app without adding it to the Roles screen — demonstrated by making
   it fail on purpose.
2. The Roles screen offers **Staff Training** and **Equipment Control** permissions
   that were previously impossible to grant, so the owner can delegate viewing
   training records without handing out full admin.
3. The button that always said "All Up To Date!" is gone, along with the module
   behind it, and nothing references either.

The screen now makes one fewer promise, and keeps the ones it makes.
