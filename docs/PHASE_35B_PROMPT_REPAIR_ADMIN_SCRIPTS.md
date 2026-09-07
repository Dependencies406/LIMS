# Phase 35B — Repair the three firebase-admin scripts broken by the migration

> Numbering note: 35B is this repair. The move of certificate-number allocation
> into a Cloud Function — previously called 35B — becomes **35C**, and still
> cannot start until the Phase 35A gate answers YES.

## Model and effort

**Claude Sonnet 5 · Effort: High**

This is mechanical work over settled code. Every replacement is named below,
character for character, and the working pattern already exists in the repository
(`scripts/reportCertificateNumberConfigs.ts`). Nothing here needs a decision made.

Sonnet rather than Opus deliberately: the hard thinking was done in Phase 35A when
the breakage was diagnosed and confirmed by execution. Spending Opus on find-and-
replace is waste.

The one place care is needed is `backfillEquipmentIds.ts`, because it is the only
script that WRITES to Firestore, and because its use of the legacy namespace has a
second, differently-shaped occurrence that a careless pass will miss (Task 2).

**Stop the session and report, rather than working around, if:**

- Any anchor fact below turns out to be wrong.
- A script needs more than the mechanical substitution described — that would mean
  the migration broke something else too, which is a finding, not a chore.
- You are tempted to run `backfillEquipmentIds.ts` with `--apply`. Never do this.

## Context for a fresh session

Governing background: `docs/PHASE_35A_RESULT.md` (where this breakage was found
and confirmed by running the scripts).

### Verified facts

Each verified directly against the installed package and the files themselves, on
`feature/trace-ui`, 2026-09-03.

1. **firebase-admin 14 removed the legacy root namespace.** Confirmed by running
   `require('firebase-admin')` against the installed copy:

       .apps          -> undefined
       .credential    -> undefined
       .firestore     -> undefined
       .initializeApp -> function     (modular API only)

   This arrived with the uncommitted dependency migration
   (`firebase-admin ^12.7.0 -> ^14.3.0`).

2. **Exactly three files are affected. All are in `scripts/`.** A repository-wide
   search for `firebase-admin` imports outside `node_modules` returns:

   | File | Line | Import |
   |---|---|---|
   | `scripts/backfillEquipmentIds.ts` | 25 | `import * as admin from 'firebase-admin'` — BROKEN |
   | `scripts/reportEquipmentTypeNames.ts` | 22 | `import * as admin from 'firebase-admin'` — BROKEN |
   | `scripts/reportRecordPermissionRolloutReadiness.ts` | 29 | `import * as admin from 'firebase-admin'` — BROKEN |
   | `scripts/reportCertificateNumberConfigs.ts` | 39-40 | modular — **already correct, do not touch** |
   | `functions/src/exportToDrive.ts` | 20-22 | modular — fine |
   | `functions/src/index.ts` | 6 | modular — fine |

3. **The deploy chain is NOT affected.** `scripts/writePlatformValidationReport.ts`
   — the script `firebase.json` runs in the hosting predeploy — imports only
   `node:fs`, `node:path`, `node:os` and `node:child_process` (lines 21-24). It
   does not touch firebase-admin. Hosting deployment is not blocked by this bug.

4. **The broken init block is identical in all three files**, at
   `reportEquipmentTypeNames.ts:31-36`, `reportRecordPermissionRolloutReadiness.ts:37-42`,
   and `backfillEquipmentIds.ts:43-48`:

       if (!admin.apps.length) {
         admin.initializeApp({
           credential: admin.credential.applicationDefault(),
         });
       }
       const db = admin.firestore();

5. **`backfillEquipmentIds.ts` has a SECOND legacy usage** that the init-block fix
   does not cover — line 77, inside the write path:

       updatedAt: admin.firestore.FieldValue.serverTimestamp(),

   This is a different shape (a static property on the removed `admin.firestore`
   namespace) and is the single most likely thing to be missed.

6. **`backfillEquipmentIds.ts` is report-only by default.** `--apply` is what makes
   it write (`:39-41`, and the `.update()` at `:75-78`). Running it with no flags
   reads and prints only. The two report scripts never write at all, with or
   without their cosmetic `--dry-run` flag.

7. **The working pattern** is `scripts/reportCertificateNumberConfigs.ts:39-40`,
   added and proven in Phase 35A:

       import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
       import { getFirestore } from 'firebase-admin/firestore';

8. **Test baseline: 82 files / 1721 tests / 0 failures.**

9. **The repository still carries the uncommitted dependency migration** —
   `package.json`, `package-lock.json`, `src/App.tsx` modified, on branch
   `feature/trace-ui`. Do not commit, revert, or touch any of them.

### Why this matters

All three scripts are diagnostic or maintenance tools the owner reaches for when
something needs checking. They fail on their first Firestore call, so the failure
only appears at the moment someone needs one — which is the worst time to discover
it. One of them (`reportCertificateNumberConfigs.ts`'s sibling) is the pattern a
Phase 35A prompt instructed a session to copy verbatim; copying a dead file would
have shipped a fourth dead script.

## Prompt

    Read first:
      - CLAUDE.md — hard rules, especially RULE 1 (never assert what you have not
        verified) and RULE 9 (all markdown goes in docs/)
      - docs/PHASE_35B_PROMPT_REPAIR_ADMIN_SCRIPTS.md — this file
      - scripts/reportCertificateNumberConfigs.ts lines 30-60 — the working pattern
        to copy. Do not modify this file.
      - scripts/reportEquipmentTypeNames.ts
      - scripts/reportRecordPermissionRolloutReadiness.ts
      - scripts/backfillEquipmentIds.ts — read ALL of it, not just the init block

    ## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)
        git branch
        git worktree list
        git status
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
          Select-Object ProcessId, CommandLine | Format-List

    Report each FULL path. Confirm nothing runs from LIMS-New-Backup (nested INSIDE
    the project). The project root is C:\Users\seela\Desktop\LIMS-New; CLAUDE.md
    line 145 names a stale OneDrive path and its healthy-state note assumes branch
    `master` — both stale, recorded in PHASE_34_RESULT.md §1. Expected branch:
    feature/trace-ui, with the dependency migration still uncommitted.

    ## Task 1 — Confirm the breakage yourself before fixing it

    Run, and paste the output:

        node -e "const a=require('firebase-admin'); for (const k of ['apps','credential','firestore','initializeApp']) console.log(k, typeof a[k]);"

    Then run each of the two REPORT scripts and paste the error each produces:

        npm run report:equipment-type-names
        npm run report:record-permission-rollout

    Do NOT run backfillEquipmentIds.ts. Confirm its breakage by reading lines 43-48
    and 77 only.

    If the symbols are NOT undefined — if firebase-admin's root namespace is intact
    — then this whole phase is based on a false premise. STOP and report.

    ## Task 2 — Repair the three scripts

    In each of the three files, replace ONLY the firebase-admin plumbing. Change
    nothing else: not the reporting logic, not the console output, not the comment
    blocks, not the `--dry-run` / `--apply` flag handling, not the usage docs.

    2a. The import (line 22 / 29 / 25). Replace
            import * as admin from 'firebase-admin';
        with
            import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
            import { getFirestore } from 'firebase-admin/firestore';
        Keep any other imports in the file exactly as they are.

    2b. The init block (lines 31-36 / 37-42 / 43-48). Replace with
            if (!getApps().length) {
              initializeApp({
                credential: applicationDefault(),
              });
            }
            const db = getFirestore();

    2c. **backfillEquipmentIds.ts ONLY — line 77.** Replace
            admin.firestore.FieldValue.serverTimestamp()
        with
            FieldValue.serverTimestamp()
        and add `FieldValue` to that file's import from 'firebase-admin/firestore':
            import { getFirestore, FieldValue } from 'firebase-admin/firestore';

    2d. Then grep all three files for the string `admin.` and report every
        remaining hit with its line. There should be none. If there is one, it is
        a usage this prompt did not anticipate — report it rather than guessing.

    ## Task 3 — Prove the repair, as far as it can be proven

    There is no service-account key available in this environment
    (GOOGLE_APPLICATION_CREDENTIALS is unset), so none of these scripts can reach
    Firestore. That is expected and is NOT a failure of the repair.

    3a. Typecheck the whole project:  npx tsc --noEmit
        Must be clean. Paste the output.

    3b. Run both REPORT scripts again. Each must now get PAST the init block and
        fail ONLY on absent credentials — a message about default credentials, not
        about `admin.apps` or an undefined property. Paste both outputs and state
        for each: "reaches Firestore call: YES/NO".

    3c. For backfillEquipmentIds.ts, run it with NO FLAGS (report-only mode; the
        `--apply` flag is what makes it write, per fact 6) and confirm the same:
        past the init block, failing only on credentials.
        **NEVER pass --apply. Not once, not to test, not with any key.**

    3d. If the owner has supplied a service-account key via
        GOOGLE_APPLICATION_CREDENTIALS, run the two report scripts fully and paste
        their real output. Still do not pass --apply to the backfill script.
        Never print, echo, or copy the key's contents.

    ## Task 4 — Stop it happening again

    Add a test file `scripts/__tests__/adminScriptImports.test.ts` that, for every
    `.ts` file directly under `scripts/` which mentions firebase-admin at all,
    asserts:
      - it does NOT contain `import * as admin from 'firebase-admin'`
      - it DOES import from 'firebase-admin/app'

    Discover the files by reading the directory, not from a hard-coded list — a
    script added later must be covered automatically. Keep it to those two
    assertions; do not attempt to lint anything else.

    Prove the test is real: temporarily reintroduce the legacy import in ONE
    script, show the test failing, then restore the file and show it passing.
    Paste both runs. Confirm the restored file is byte-identical to the repaired
    version (`git diff` on it should show only your Task 2 changes).

    ## Task 5 — Report

    Write docs/PHASE_35B_RESULT.md containing:
      1. Pre-work output verbatim
      2. Task 1: the node output and both script errors, as proof of the premise
      3. Task 2: a per-file list of every line changed, and the Task 2d grep result
      4. Task 3: tsc output, and for each of the three scripts a line reading
         "reaches Firestore call: YES/NO" with the error text that proves it
      5. Task 4: both test runs (failing and passing), and the test's name
      6. Test counts before and after. Before: 82 files / 1721 tests. After must be
         83 files and 1721 + (tests you added), with NO existing test altered.
      7. git status at the end, every changed file accounted for as either
         "pre-existing migration" or "changed by this phase"
      8. Anything that contradicted this prompt

    ## Constraints

      - Touch ONLY these files: the three scripts named in fact 2, the new test
        file, and docs/PHASE_35B_RESULT.md. Anything else — stop and ask.
      - Do NOT modify scripts/reportCertificateNumberConfigs.ts. It is already
        correct and is the reference.
      - Do NOT modify package.json, package-lock.json, or src/App.tsx.
      - Do NOT run npm install / npm update / npm ci, or anything that rewrites the
        lock file.
      - Do NOT commit, stash, checkout, revert, or create a branch or worktree.
      - Do NOT modify existing tests. If you think you must, STOP and explain.
      - Do NOT add dependencies.
      - Do NOT run backfillEquipmentIds.ts with --apply under any circumstances.
      - Do NOT deploy anything. Do NOT touch firestore.rules.
      - Do NOT print or copy the contents of any service-account key.
      - Do NOT "improve" these scripts while you are in there. Plumbing only.
      - If a stated fact in this prompt turns out to be wrong, STOP and report it.
        Assume this prompt contains an error and find it.

## Done when

The owner can read `docs/PHASE_35B_RESULT.md` and see:

1. Proof the breakage was real, in the form of the errors the scripts produced
   before the fix.
2. All three scripts now running far enough to ask Firestore for data, stopped
   only by the absence of a credentials file — with the error text shown, not
   asserted.
3. A test that fails when the old broken import comes back, demonstrated by making
   it fail on purpose and then pass again.
4. Test count up by exactly the new tests, no existing test altered, and `tsc`
   clean.
5. `backfillEquipmentIds.ts` never run with `--apply`, stated explicitly.
