# Phase 35D — Switch the app to the allocation function, and open it to technicians

> **SECOND ISSUE — supersedes the first.** The first issue was stopped correctly at
> Task 3a by two blockers it was right to refuse: a second caller the prompt did
> not know about, and fourteen tests the constraints forbade touching. Nothing was
> changed. Both are resolved below by the planner, with the tasks reordered so the
> timezone work no longer targets code that gets deleted first.

## Model and effort

**Claude Opus 5 · Effort: High**

The allocation transaction is already live and correct (35C). What remains is
surgery on files with existing callers and tests, in a 3700-line component with two
near-identical render sites — plus one piece of real design: moving the allocation
maths into a shared, testable module so that deleting the client's copy does not
delete the only executable checks on it.

**Stop and report, rather than working around, if:**

- Task 1's gate fails.
- The cross-package test import in Task 3d does not work (see 3d — there is no
  acceptable fallback that drops the coverage).
- Removing the interim admin gate would change anything other than who may press
  Generate.

## Context for a fresh session

Governing: `docs/adr/ADR-019-certificate-number-allocation.md` — **note D8, added
2026-09-06**, which is the timezone decision. (The first issue of this prompt cited
D7 for it; D7 is about Cloud Functions being unverified. That was a planner error.)
History: `docs/PHASE_35C_RESULT.md`.

### The function is live

Confirmed 2026-09-06. The Cloud Run service `allocatecertificatenumber` had an
**empty IAM policy**; two redeploys did not add the `allUsers -> roles/run.invoker`
binding, and it was added by hand. It now returns 401 with
`"You must be logged in to allocate a certificate number."`
**Do not redeploy the function in this phase.**

### Verified facts

1. **The callable's contract** (`functions/src/allocateCertificateNumber.ts:153-157`):
   v2 `onCall`, `region: 'asia-southeast1'`.
   In `{ equipmentName: string, jobId: string, equipmentIndex: number }`;
   out `{ certificateNumber, number, year, configId }`. Errors carry
   human-readable messages: `unauthenticated`, `invalid-argument`, `not-found`,
   `failed-precondition`, `already-exists`.

2. **The client is already wired.** `src/services/firebase.ts` exports
   `functions = getFunctions(firebaseApp, 'asia-southeast1')` and `httpsCallable`.
   No new dependency needed.

3. **There are TWO callers of the client allocation path**, not one:
   - `JobModal.tsx:12` / `:1182` — `generateCertificateNumberForEquipment(equipmentName)`,
     resolving the config **by equipment name**.
   - `EquipmentSpreadsheetModal.tsx:27` / `:1085` —
     `generateCertificateNumber(configToUse.id)`, where `configToUse` is
     `certificateConfigs[0]`, i.e. **by array position**.

4. **`EquipmentSpreadsheetModal` is unreachable.** A repository-wide search finds no
   render site; the only other mention is a comment at
   `src/modules/spreadsheet/components/SpreadsheetToolbar.tsx:4`. It still compiles,
   so it still constrains `tsc`. It already receives `job` and `equipmentIndex` as
   props.

5. **`src/services/__tests__/certificateNumberGeneratorService.test.ts` holds 14
   tests**, in six groups: concurrency (2), `lastAllocatedAt` vs `updatedAt` /
   ADR-012 (3), end-to-end format and increment (2), yearly reset (3), monthly
   reset (3), and — at `:233-248` — **one test asserting the preview matches what
   an allocation would actually produce.** That last one is the only executable
   guard against the client and server formatters drifting apart, which 35C
   recorded as accepted debt.

6. **The interim admin gate** (35A, always temporary):
   `CERTIFICATE_NUMBER_ADMIN_ONLY_TITLE` at `JobModal.tsx:53`; used at `:2700`,
   `:2708-2709` (card view) and `:3128`, `:3130` (table view). Each is a leading
   `!isAdmin ||` term plus a leading `!isAdmin ?` branch in the `title`.
   **`isAdmin` is used elsewhere at `:1524`** — keep the `useAuth()` destructure.

7. **Its test**, `src/components/__tests__/JobModalCertificateNumberAdminGate.test.tsx`,
   asserts a non-admin sees the control DISABLED. ADR-019 D2 makes that wrong.

8. **Temporary scaffolding:** `src/dev/pingFunctionsProbe.ts` and two TEMPORARY
   lines at the bottom of `src/main.tsx`.

9. **The client allocation code:** `certificateNumberGeneratorService.ts` —
   `formatCertificateNumber` `:26-56`, `generateCertificateNumber` `:65-148`,
   `previewCertificateNumber` `:174-220` (read-only, KEEP),
   `generateCertificateNumberForEquipment` `:240-246`.

10. **Hosting deploy runs the tests** (`firebase.json:4-8` predeploy: `npm test`,
    validation report, `npm run build`). A failing test blocks the deploy.

11. **Baseline: 82 files / 1721 tests / 0 failures.** Branch `feature/trace-ui`;
    the dependency migration is still uncommitted — do not touch `package.json`,
    `package-lock.json` or `src/App.tsx`.

### The two planner decisions that unblock this

**Decision 1 — `EquipmentSpreadsheetModal` is repointed at the callable, using the
equipment name.** Not deleted. It is unreachable today, so the behaviour change is
theoretical; and selecting a certificate series by array position
(`certificateConfigs[0]`) is not defensible for certificate numbering — if that
component is ever revived, resolving by name (and failing loudly with the
callable's `not-found` when the name is unknown) is the behaviour we want.
Deleting a 2000-line component is a CLAUDE.md RULE 2 decision for the owner and is
explicitly **not** part of this phase.

**Decision 2 — that test file is replaced, not deleted.** Thirteen of the fourteen
test logic that still exists; it has merely moved to the server. Deleting them
outright would move allocation to a place with no test runner at all and remove the
last executable checks in the same stroke. So Task 2 extracts the allocation maths
into a plain module with no Firebase imports, and Task 3d re-tests it — including a
new twin-agreement test that is strictly stronger than the preview test it
replaces. The two concurrency tests do retire: they tested a client-side
transaction that no longer exists, and the property they guarded is now enforced by
the server transaction plus the ledger document id (35C Task 3).

## Prompt

    Read first:
      - CLAUDE.md — hard rules, especially RULE 1 and RULE 2
      - docs/PHASE_35D_PROMPT_SWITCH_CLIENT_TO_FUNCTION.md — this file
      - docs/adr/ADR-019-certificate-number-allocation.md — especially D2, D4, D8
      - functions/src/allocateCertificateNumber.ts — ALL of it
      - src/services/certificateNumberGeneratorService.ts — ALL of it
      - src/services/__tests__/certificateNumberGeneratorService.test.ts — ALL of it
      - src/services/firebase.ts
      - src/components/JobModal.tsx lines 40-60, 1130-1200, 2690-2720, 3120-3140
      - src/components/EquipmentSpreadsheetModal.tsx lines 20-35 and 1060-1100

    ## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)
        git branch
        git worktree list
        git status
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
          Select-Object ProcessId, CommandLine | Format-List

    Report each FULL path. Confirm nothing runs from LIMS-New-Backup. Project root
    is C:\Users\seela\Desktop\LIMS-New. Expected branch: feature/trace-ui.

    ## Task 1 — THE GATE

        try { Invoke-RestMethod -Uri "https://asia-southeast1-scs-lims.cloudfunctions.net/allocateCertificateNumber" -Method Post -ContentType "application/json" -Body '{"data":{}}' }
        catch { $_.Exception.Response.StatusCode.value__; $_.ErrorDetails.Message }

    Expect 401 and "You must be logged in to allocate a certificate number."
    Anything else — STOP.

    ## Task 2 — Extract the allocation maths so it can be tested

    Create `functions/src/certificateNumberMath.ts`, containing ONLY pure functions
    — no `firebase-admin`, no `firebase-functions`, no I/O, nothing that reads a
    clock except through an argument you pass in:

      - `LAB_TIME_ZONE = 'Asia/Bangkok'` (ADR-019 D8)
      - `labYearMonth(d: Date): { year: number; month: number }` — computed with
        `Intl.DateTimeFormat` in `LAB_TIME_ZONE`; 4-digit year, 0-based month
      - `shouldReset(config, now)` — the yearly/monthly/never decision, using
        `labYearMonth` for BOTH `now` and `lastResetAt`
      - `nextNumber(config, shouldReset)`
      - `formatCertificateNumber(config, number, companyAbbreviation, year)` —
        moved verbatim from the function's current copy

    Then make `allocateCertificateNumber.ts` import and use them, deleting its
    inline copies. Its behaviour must not change except that the year and month are
    now computed in Bangkok time rather than UTC (D8).

    Do NOT redeploy the function. Note in the report that the server keeps running
    its previous build until it is next deployed, so the server-side timezone fix
    is not live yet.

    ## Task 3 — Switch the client, and rebuild the coverage

    3a. Re-confirm the caller list from fact 3 before editing. If it differs from
        what is stated there, STOP and report.

    3b. `certificateNumberGeneratorService.ts`:
        - change `generateCertificateNumberForEquipment` to
          `(equipmentName: string, jobId: string, equipmentIndex: number)` and have
          it call `httpsCallable(functions, 'allocateCertificateNumber')`,
          returning `result.data.certificateNumber`
        - **DELETE `generateCertificateNumber` (`:65-148`)** — the client must no
          longer be able to advance the counter
        - KEEP `previewCertificateNumber` and `formatCertificateNumber`
        - let the server's error message reach the caller unchanged; add no retry
          (a retry after a timeout burns a number — ADR-019 D6)
        - make `previewCertificateNumber` and the client `formatCertificateNumber`
          use lab time for the year and month, matching D8 and Task 2. Keep the
          client's own copy of the formatter — do NOT import across packages in
          application code; the twin-agreement test in 3d is what keeps them honest
        - replace the one-sided twin comment at `:26` with a reciprocal one naming
          `functions/src/certificateNumberMath.ts`

    3c. Update both call sites:
        - `JobModal.tsx:1182` — pass `currentJob.id` and the equipment index
        - `EquipmentSpreadsheetModal.tsx:1085` — call the same function with the
          equipment's **name**, the job id and the equipment index (planner
          Decision 1). Remove the `certificateConfigs[0]` selection. Do NOT delete
          the component.

    3d. Replace `src/services/__tests__/certificateNumberGeneratorService.test.ts`
        (planner Decision 2). The replacement must:
        - import `functions/src/certificateNumberMath.ts` directly from the test
          and re-test the reset and formatting behaviour the old file covered:
          yearly reset (3 cases), monthly reset (3), format and increment (2),
          plus a lab-timezone case — an instant that is 2027 in Bangkok but 2026
          in UTC must yield 2027
        - add a **twin-agreement test**: run the client `formatCertificateNumber`
          and the function's over the same table of configs and numbers, and assert
          the outputs are identical, character for character. This replaces the old
          preview-matches-actual test and is stronger
        - keep any `previewCertificateNumber` coverage that still applies
        - drop the two concurrency tests, stating in the report that they tested a
          client transaction that no longer exists

        If vitest cannot import from `functions/src/` (the `include` glob controls
        discovery, not imports, so it should work) — STOP and report. Do not
        substitute a copy of the maths into the test; that would test nothing.

    ## Task 4 — Open it to technicians, clear the scaffolding

    4a. Remove the interim admin gate at all four places in fact 6 and delete
        `CERTIFICATE_NUMBER_ADMIN_ONLY_TITLE`. Each expression must return to
        exactly what it was before 35A — verify against `git diff`, not memory. Do
        NOT remove `isAdmin` from the `useAuth()` destructure (still used at :1524).

    4b. Replace `JobModalCertificateNumberAdminGate.test.tsx` with a test asserting
        the NEW behaviour: a non-admin sees Generate ENABLED, and so does an admin.
        Rename the file to match. Together with 3d these are the ONLY existing test
        files you may change. Any other — STOP.

    4c. Delete `src/dev/pingFunctionsProbe.ts` and the two TEMPORARY lines at the
        end of `src/main.tsx`; remove `src/dev/` if empty. Leave
        `functions/src/ping.ts` alone.

    ## Task 5 — Prove it, hand over the deploy

    5a. `npx tsc --noEmit` clean (covers `src/` only).
    5b. `npm --prefix functions run build` clean.
    5c. `npm test` — report before and after, and account for every changed count.
    5d. `npm run build` succeeds.
    5e. STOP and give the owner:

            firebase deploy --only hosting

        Tell him the predeploy runs the full suite first, so a failure blocks the
        deploy rather than shipping it; and that Firebase Console -> Hosting ->
        release history -> Rollback restores the previous version at once.

    ## Task 6 — Report

    docs/PHASE_35D_RESULT.md containing:
      1. Pre-work verbatim and Task 1's gate response
      2. The re-confirmed caller list
      3. Diff of every changed file, one sentence each
      4. Proof the client can no longer write to `certificate_number_configs` on
         the allocation path: name the deleted code, show nothing calls it
      5. The twin-agreement test's name and the cases it covers
      6. A statement that the server still runs its pre-D8 build until redeployed
      7. Test counts before and after, every delta accounted for; tsc, functions
         build and app build output
      8. git status, every file accounted for
      9. Anything that contradicted this prompt

    ## Constraints

      - Do NOT touch `package.json`, `package-lock.json`, `src/App.tsx`.
      - Do NOT change `firestore.rules`; do NOT deploy rules or functions.
      - Do NOT delete `EquipmentSpreadsheetModal.tsx` (RULE 2 — owner's decision).
      - Do NOT modify any existing test except the two named in 3d and 4b.
      - Do NOT add dependencies; do NOT run npm install/update/ci.
      - Do NOT commit, stash, checkout, revert, or create a branch or worktree.
      - Do NOT add a permission or role check to Generate (ADR-019 D2).
      - Do NOT add a client-side retry around the callable.
      - Do NOT import across packages in application code — only in the test.
      - Do NOT deploy. Task 5e hands the command over.
      - If a stated fact here turns out to be wrong, STOP and report it. Assume
        this prompt contains an error and find it.

## Done when

The owner deploys, signs in **as the Standard user whose "Missing or insufficient
permissions" started this whole series**, opens the demo job, presses Generate —
and gets a certificate number.

Then, as an admin, he confirms he can still edit a prefix in Settings ->
Certificate Number Manager, and that the Standard user still cannot.

And `certificateNumberAllocations` holds one new document, named after the number
issued, recording which job and which person took it.
