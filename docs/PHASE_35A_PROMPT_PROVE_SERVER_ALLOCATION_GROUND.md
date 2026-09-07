# Phase 35A — Prove the ground for server-side allocation, and stop the app lying

## Model and effort

**Claude Opus 5 · Effort: High**

The individual pieces are small. The risk is that two of them touch things this
project has never done — deploying a Cloud Function, and calling one from the app
— on top of an uncommitted major dependency migration. `JobModal.tsx` is 3706
lines with two near-identical certificate-number render sites, and editing the
wrong one produces a change that looks right and does nothing.

Effort is High rather than Maximum because ADR-019 has already settled the design.
Nothing in this phase decides architecture; it proves assumptions and makes one
small honest UI change.

**Stop the session and report, rather than working around, if:**

- Task 1's gate fails — the function does not build, deploy, or answer. That is a
  finding, not an obstacle. Phase 35B depends on it and must be redesigned if it
  fails. Do NOT fall back to widening `firestore.rules`; ADR-019 rejected that.
- Any anchor fact below turns out to be wrong.
- The uncommitted dependency migration (see below) appears to be mid-repair —
  failing tests, broken build — rather than complete.

## Context for a fresh session

Governing documents:
`docs/adr/ADR-019-certificate-number-allocation.md` — the decisions this phase
serves. Read it first; it explains why widening the security rule was rejected.
`docs/adr/ADR-008-record-number-allocation.md` — the accepted risk ADR-019 closes.
`docs/PHASE_34_RESULT.md` — the audit this follows.

### The repository is mid-migration. Read this before touching anything.

`git log -1` is `0305d35 WIP: calculation trace engine + validation docs
(pre-migration backup)`. The working tree carries an **uncommitted major
dependency migration**:

    firebase           ^9.22.1  -> ^12.18.0     (3 major versions)
    react-router-dom   ^6.21.0  -> ^7.18.3      (1 major)
    uuid               ^9.0.0   -> ^14.0.2      (5 major)
    vite               ^5.0.0   -> ^6.4.3       (1 major)
    esbuild            ^0.19.2  -> ^0.25.0
    firebase-admin     ^12.7.0  -> ^14.3.0

with `package.json`, `package-lock.json` and `src/App.tsx` modified. `npm test`
passed 81 files / 1716 tests against this state as of Phase 34.

**Consequence for this phase:** every file you touch must be one the migration does
not touch, so the owner can still commit, revert, or continue the migration
independently. Do not modify `package.json`, `package-lock.json` or `src/App.tsx`.
Do not run `npm install`, `npm update`, or any command that rewrites the lock file.
Do not commit, stash, checkout or revert anything, ever, in this phase.

### Verified facts

Each read directly from the file at the anchor given, on `feature/trace-ui`.

1. **`functions/` exists and holds exactly one function.** `functions/src/index.ts`
   initialises the Admin SDK and exports `exportJobsToGoogleDrive` from
   `./exportToDrive`. That function is a **v2 callable** — `onCall` imported from
   `firebase-functions/v2/https` at `functions/src/exportToDrive.ts:18`, declared
   at `:154` with `region: 'asia-southeast1'` at `:159`.

2. **The app has never called a Cloud Function.** Neither `exportJobsToGoogleDrive`
   nor `firebase/functions` appears anywhere under `src/`. There is no
   `httpsCallable` or `getFunctions` call in the codebase. The owner has never
   successfully run the Drive backup, so **whether functions deploy and run in
   this Firebase project is unproven.** This is the gate.

3. **No new dependency is needed to call one.** `node_modules/firebase` is at
   **12.18.0** and `node_modules/firebase/functions/package.json` exists, so
   `getFunctions` / `httpsCallable` are already available.

4. **`functions/` already has what it needs.** `functions/package.json` declares
   `firebase-functions ^7.3.2`, `firebase-admin ^14.3.0`, `engines.node 22`, and
   `"build": "tsc"`.

5. **`src/services/firebase.ts` is the single place the app wires Firebase.** 89
   lines: it initialises the app (`:44-49`), exports `auth`/`db`/`storage`
   (`:52-54`), and re-exports the SDK functions the app uses (`:57-86`). Anything
   new belongs here, not scattered.

6. **Deploying functions does not deploy the app.** In `firebase.json`, the
   hosting predeploy runs `npm test`, the validation report and `npm run build`
   (`:4-8`); the functions predeploy runs only
   `npm --prefix "$RESOURCE_DIR" run build` (`:38-40`). `firebase deploy --only
   functions:<name>` therefore touches nothing the lab is currently using.

7. **The Generate control is ungated.** `JobModal.tsx:3106-3112`, disabled at
   `:3109` only by
   `!currentJob || generatingCertificateForRow === index || Boolean(String(eq.certificateNumber ?? '').trim())`.
   A grep for `usePermission(` across the file returns only lines 129-132
   (`jobs.edit`, `jobs.create`, `jobs.generatePdf`, `jobs.delete`). Per
   `PHASE_34_RESULT.md` Fact 5, a **second** site at `JobModal.tsx:2681-2699`
   also exposes Generate, gated only by `formDisabled` → `jobs.edit`.
   *Re-verify both line ranges before editing — the file may have moved.*

8. **`isAdmin` is `currentUser?.role?.toLowerCase() === 'admin'`**
   (`src/contexts/AuthContext.tsx:96`), available from `useAuth()`.

9. **`firestore.rules:161-165`** permits writes to `certificate_number_configs`
   only when `users/{uid}.role == 'admin'`. **This phase does not change it.**

10. **A read-only Firestore script pattern already exists.**
    `scripts/reportEquipmentTypeNames.ts` uses `firebase-admin` with
    `applicationDefault()` credentials from `GOOGLE_APPLICATION_CREDENTIALS`, and
    already reads `certificate_number_configs`. `package.json` registers it as
    `report:equipment-type-names` via `tsx`.

11. **Test baseline: 81 files / 1716 tests / 0 failures.**

### What this phase is for

ADR-019 decided that allocating a certificate number moves to a Cloud Function, so
that number integrity is enforced by the server rather than trusted. Before any of
that is built, two assumptions must be proven and one small honesty problem fixed.

## Prompt

    Read first:
      - CLAUDE.md — hard rules, especially RULE 1 (never assert what you have not
        verified) and RULE 9 (all markdown goes in docs/)
      - docs/PHASE_35A_PROMPT_PROVE_SERVER_ALLOCATION_GROUND.md — this file
      - docs/adr/ADR-019-certificate-number-allocation.md — the governing decisions
      - functions/src/index.ts and functions/src/exportToDrive.ts lines 1-60 and
        150-175 — the only existing function, and the v2 callable pattern to copy
      - functions/package.json and firebase.json — how functions build and deploy
      - src/services/firebase.ts — where Firebase wiring lives
      - src/contexts/AuthContext.tsx — where isAdmin comes from
      - scripts/reportEquipmentTypeNames.ts — the read-only admin script pattern

    ## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)
        git branch
        git worktree list
        git status
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
          Select-Object ProcessId, CommandLine | Format-List

    Report each FULL path. Confirm nothing runs from LIMS-New-Backup (nested INSIDE
    the project). Report the absolute repository path (Get-Location); the project
    root is C:\Users\seela\Desktop\LIMS-New. CLAUDE.md line 145 names a OneDrive
    path and CLAUDE.md's healthy-state note assumes branch `master`; both are stale
    (recorded in PHASE_34_RESULT.md §1). Expected branch: feature/trace-ui.

    Additionally: run `git diff --stat` and report it. Confirm the uncommitted
    dependency migration described above is present and that `npm test` still
    passes. If tests do not pass, STOP — the migration is mid-repair and this is
    the wrong moment to add work on top of it.

    ## Task 1 — THE GATE. Nothing else starts until this passes.

    Prove that a Cloud Function can be deployed and called in this project.

    1a. Add a trivial callable to functions/, in the style of exportToDrive.ts:
        v2 `onCall` from 'firebase-functions/v2/https', region 'asia-southeast1'.
        Name it `pingFunctions`. It must:
          - require authentication (throw HttpsError 'unauthenticated' when
            request.auth is null — copy how exportToDrive.ts does it)
          - return { ok: true, uid, serverTime } and nothing else
          - read no Firestore data and write nothing
        Export it from functions/src/index.ts alongside the existing export.

    1b. Prove it compiles:  npm --prefix functions run build
        Report the output.

    1c. STOP HERE AND HAND BACK TO THE OWNER. Do not deploy.
        Print, as a single copyable line, the exact command the owner must run:

            firebase deploy --only functions:pingFunctions

        Tell him plainly: this deploys ONE new function that reads nothing and
        writes nothing; it does not deploy the app or the security rules; and if
        the project is not on the Blaze plan the command will fail with a message
        saying so — which is the answer we need either way.
        Wait for him to paste the result back before continuing.

    1d. Once he reports success, wire the smallest possible client call:
          - in src/services/firebase.ts, add `getFunctions` and `httpsCallable`
            imports from 'firebase/functions', create the functions instance with
            the region 'asia-southeast1' (the region MUST match 1a or the call
            will 404), export both alongside the existing re-exports
          - add a temporary dev-only trigger the owner can click once — the
            simplest thing that works. It must be trivially removable and must not
            appear in any production navigation.
        Report the object the function returned.

        If deployment or the call fails, STOP and report exactly what failed and
        the error text. Do NOT work around it and do NOT widen firestore.rules.

    ## Task 2 — What is actually in the live certificate configs?

    Add a read-only reporting script following scripts/reportEquipmentTypeNames.ts
    exactly (firebase-admin, applicationDefault credentials, zero writes, no write
    path implemented). Register it in package.json scripts as
    `report:certificate-configs`.

    NOTE: package.json is part of the uncommitted migration. Adding ONE line to the
    "scripts" block is permitted and is the only change you may make to that file.
    Do not touch any dependency line.

    For every document in certificate_number_configs, report:
      document id, name, prefix, resetPolicy, isActive,
      currentNumber (and its JavaScript type),
      currentSequence (and its type),
      currentYear (and its type),
      lastAllocatedAt / lastResetAt presence

    Then state plainly, as a conclusion the owner can read:
      - whether every currentYear is a four-digit number
      - any document where currentYear is a string, a two-digit value, or missing
      - any document where currentNumber and currentSequence disagree

    Running it needs a Firebase service-account key via
    GOOGLE_APPLICATION_CREDENTIALS. If the owner has not supplied one, say so,
    leave the script in place, and continue to Task 3 — this task is diagnostic,
    not blocking. Never print, echo, or copy the key's contents anywhere.

    ## Task 3 — Stop the app offering an action it cannot perform

    Today a non-admin sees Generate, presses it, and gets a raw Firebase error
    string. Until Phase 35B moves allocation to the server, the button must tell
    the truth.

    At BOTH certificate-number render sites (approximately JobModal.tsx:2681-2699
    and :3106-3112 — verify before editing), when the signed-in user is not an
    admin (useAuth().isAdmin === false):
      - disable the Generate control
      - give it a title/tooltip reading:
        "Only an administrator can allocate a certificate number at present.
         Ask an administrator, or type the number in manually."
      - leave the certificate-number text input EDITABLE, so an admin can still
        pass a number to a technician to type in

    Admin behaviour must not change in any way.

    Add a focused test proving: non-admin sees the control disabled; admin sees it
    enabled. Do not modify any existing test.

    ## Task 4 — Report

    Write docs/PHASE_35A_RESULT.md containing:
      1. Pre-work output verbatim, including git diff --stat and the migration state
      2. Task 1: the build output; the owner's deploy result verbatim; the value the
         function returned when called; and a one-line verdict —
         CLOUD FUNCTIONS WORK IN THIS PROJECT: YES / NO
      3. Task 2: the full per-document table, and the plain-English conclusion. If
         the script could not run, say exactly what was missing.
      4. Task 3: the two line ranges you actually edited, and the new test's name
      5. Test counts before and after (paste both). The count must go UP by exactly
         the tests you added, and no existing test may change.
      6. git status at the end, with every changed file accounted for as either
         "pre-existing migration" or "added by this phase"
      7. Anything that contradicted this prompt

    ## Constraints

      - Do NOT modify firestore.rules. Do NOT deploy rules. Do NOT deploy hosting.
      - Do NOT modify package-lock.json or src/App.tsx. The ONLY permitted change
        to package.json is one line in "scripts".
      - Do NOT run npm install / npm update / npm ci, or anything that rewrites the
        lock file.
      - Do NOT commit, stash, checkout, revert, or create a branch or worktree.
      - Do NOT modify existing tests. If you think you must, STOP and explain.
      - Do NOT add dependencies to either package.json. Everything needed is
        already installed (facts 3 and 4).
      - Do NOT move allocation to the server in this phase. That is 35B, and it
        must not start until Task 1 proves it can work.
      - Do NOT deploy anything yourself. Task 1c hands the one deploy command to
        the owner.
      - Do NOT print or copy the contents of any service-account key.
      - If a stated fact in this prompt turns out to be wrong, STOP and report it.
        Assume this prompt contains an error and find it.

## Done when

The owner can read `docs/PHASE_35A_RESULT.md` and see:

1. A yes-or-no answer to **"can this project run Cloud Functions?"**, backed by a
   deploy result and a value the function actually returned — not an opinion.
2. A table of what is really stored in every certificate configuration, and a
   plain sentence saying whether the year values are sound.
3. That signing in as a Standard user, opening a job, and hovering Generate now
   shows a greyed control explaining who to ask — instead of a database error —
   while an admin sees no change at all.
4. Test count up by exactly the new tests, no existing test altered, and every
   changed file accounted for.

Phase 35B — moving allocation into the function — is written only after item 1
says YES.
