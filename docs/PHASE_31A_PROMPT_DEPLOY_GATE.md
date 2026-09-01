# Phase 31A — Gate the deploy path that is actually used

## Model and effort

**Claude Sonnet 5 · Effort: Medium**

Small and mechanical, with one genuinely dangerous step: this phase touches the
command that publishes the live application for an accredited laboratory. Read the
safety rules in Task 4 before running anything.

## Why this phase exists

Phase 31 added a test gate to the two GitHub Actions workflows. That work is
correct, and the report script it produced is real — but it was pointed at the
wrong door.

**Verified on the owner's machine, 2026-08-25:**

| Fact | Evidence |
|---|---|
| `firebase.json` hosting block has `public`, `ignore`, `rewrites` — and **no `predeploy`** | `firebase.json` |
| The only `predeploy` in the file is on `functions`, and it only builds the functions | `firebase.json` |
| `.firebase/hosting.ZGlzdA.cache` exists (`ZGlzdA` = base64 `dist`) and was last written **2026-08-25 10:16 Bangkok** | `.firebase/` |
| `dist/index.html` was last built **2026-08-25 09:29 Bangkok** | `dist/` |
| Zero GitHub Actions runs have ever executed on either workflow | Reported by the Phase 31 session |

`.firebase/hosting.*.cache` is written by the Firebase CLI when hosting is deployed
**from this machine**. Taken together: the application is published by a manual
`firebase deploy` run locally, and it was published a few hours before the Phase 31
session began. GitHub Actions is not a broken pipeline — it is a pipeline nobody
uses.

**Consequence:** the gate Phase 31 built gates nothing, and the path that is really
used has no gate at all. `firebase deploy --only hosting` uploads whatever happens
to be sitting in `dist/`. It does not rebuild, and it does not test.

This corrects a false premise in `ADR-018` D9, which assumed CI was the deploy
path because two workflow files existed. Same class of error as the published
corrections on ADR-004 and ADR-007: a capability asserted from a file's existence
without checking whether it runs.

**Owner decision, 2026-08-25:** gate the local deploy path AND keep the Actions
gate, so the control is already in place if deployment ever moves to CI.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules, especially RULE 1 (never assert what you have not verified)
  - docs/PHASE_31A_PROMPT_DEPLOY_GATE.md — this file
  - docs/PHASE_31_PROMPT_CI_TEST_GATE.md — what the previous phase set out to do
  - docs/PHASE_31_RESULT.md — what it actually achieved, and what it found
  - docs/adr/ADR-018-recorder-template-validation.md — D1 and D9
  - firebase.json — the whole file
  - scripts/writePlatformValidationReport.ts — the report script Phase 31 added

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List

Report each FULL path. Confirm nothing runs from LIMS-New-Backup (nested INSIDE the
project at C:\Users\seela\Desktop\LIMS-New\LIMS-New-Backup\ — never modify it).

Continue on the Phase 31 branch if it is unmerged; otherwise branch feature/deploy-gate

## Task 0 — Clear the Phase 31 probe test, if it is still present

Phase 31 left a deliberately failing test at src/__ci_probe__/deliberateFailure.test.ts
on the branch and on origin.

  1. Confirm whether it is still there, locally and on origin.
  2. Before deleting it, copy its FULL contents into docs/PHASE_31_RESULT.md as an
     appendix, so the probe can be recreated verbatim later.
  3. Delete the file and push. This is an ordinary commit — do NOT force-push and do
     NOT rewrite history.
  4. Confirm `npm test` is green again and report the numbers.

A deliberately failing test on a pushed branch is a hazard: whoever hits it under
time pressure will remove the gate rather than the probe.

## Task 1 — Verify the finding yourself. Do not take this prompt's word for it.

RULE 1 applies to prompts as much as to code. Independently confirm:

  1. Read firebase.json. Does the hosting block have a predeploy hook? Quote it.
  2. Does .firebase/hosting.*.cache exist? What is its modification time?
  3. Run `git log --oneline -15` and report what has landed recently.
  4. If the GitHub CLI is available, run `gh run list --limit 20` and report the
     output verbatim. If it is not available, say so — do not guess.

If any of these contradicts the table above, STOP and report before changing
anything.

## Task 2 — Measure before you decide the shape of the hook

Run `npm test` and report the WALL-CLOCK duration, not just pass/fail.

This number decides whether the gate is livable. A gate that adds 20 seconds to a
deploy will survive; one that adds four minutes will be worked around within a
month, and a control that gets worked around is worse than no control because it
creates a false record.

Report the duration and state plainly whether you think it is acceptable. If it is
slow, propose the cheapest fix (e.g. a faster reporter, or a separate fast subset)
but do NOT implement it in this phase without asking.

## Task 3 — Add the predeploy hook

Add to the HOSTING block of firebase.json:

    "predeploy": ["npm test", "npm run build"]

Order matters and is deliberate:
  - Tests first: do not spend build time on code that has already failed.
  - Build second: this also fixes a second problem the previous design missed —
    today `firebase deploy --only hosting` uploads whatever is already in dist/,
    which need not correspond to any committed or tested source.

Two things you must VERIFY rather than assume:

  a) **Working directory.** Firebase runs predeploy hooks with $RESOURCE_DIR set;
     for hosting, that is the public directory (dist), not the project root. Confirm
     by experiment where `npm test` actually runs from. If it resolves to dist/,
     the hook must be written so it runs from the project root instead. Report what
     you found — do not assume the documented behaviour.

  b) **Windows.** This is the ONLY machine that deploys, and it is Windows. The
     Phase 31 session already hit an npm exec failure on Windows. Whatever you write
     must work in the shell Firebase actually spawns here. Test it; do not reason
     about it.

Do NOT touch the functions predeploy, the firestore block, the storage block, the
rewrites, or .firebaserc.

## Task 4 — Prove the gate blocks. SAFETY RULES FIRST.

This is a production system for an accredited laboratory. Read all four rules
before running any deploy command.

  RULE A: Every deploy command in this task MUST be scoped `--only hosting`.
          Never run a bare `firebase deploy`.
  RULE B: To prove the FAILURE case, break a test and run the deploy. The hook runs
          BEFORE anything is uploaded, so a working gate means nothing reaches
          production. This is safe precisely because the gate works — and if
          anything IS uploaded, you have found that the gate does not work, which is
          the single most important possible finding of this phase. Report it
          immediately and stop.
  RULE C: To prove the PASS case, do NOT deploy to live. Use a preview channel:
          `firebase hosting:channel:deploy phase31a-verify --expires 1d`
          First confirm whether predeploy hooks run on a channel deploy — if they
          do not, say so and do not substitute a live deploy to get the proof.
  RULE D: Delete the preview channel when finished.

Steps:
  1. Introduce a single failing assertion in an existing test file (not a new
     __ci_probe__ file this time — do not repeat Task 0's cleanup problem).
  2. Run `firebase deploy --only hosting`. Paste the output verbatim.
  3. State explicitly: did it abort at predeploy? Was anything uploaded? How do you
     know — quote the evidence, do not infer from the absence of an error.
  4. Revert the failing assertion. Confirm `npm test` is green.
  5. Run the preview-channel deploy from RULE C. Paste the output.
  6. Delete the preview channel.

  7. Check whether any flag bypasses predeploy hooks — try `--force` and any other
     candidate you find in `firebase deploy --help`. Report the answer honestly. If
     a bypass exists, the gate is advisory rather than mandatory, and ADR-018 and
     the QMS procedure must say so. Do not soften this finding.

## Task 5 — Make the Platform Validation Report cover the real path

The report script Phase 31 added runs in CI. CI is not where releases happen, so
today a real release leaves no evidence.

Extend it so a local deploy also produces a retained report:

  - Add the script to the predeploy chain, after the tests and before the build.
  - The local report must additionally record: that this was a LOCAL deploy, the
    machine and user, the git commit SHA, whether the working tree was CLEAN or
    DIRTY at deploy time, and the target (live, or which preview channel).
  - A DIRTY working tree at deploy time must be stated prominently in the report.
    Deploying uncommitted code is not forbidden here, but it must never be silent —
    a release that cannot be tied to a commit cannot be reproduced, and clause 7.5
    turns on reproducibility.
  - Write reports to docs/validation-reports/ with a dated filename. They are
    quality records under clause 8.4 and belong in version control.
  - Print a closing line reminding the operator to commit the report.

Keep the existing CI behaviour working. Do not fork the script into two.

## Task 6 — Report

Write docs/PHASE_31A_RESULT.md containing:
  - Task 1 verification results, including the gh run list output or its absence
  - The test duration from Task 2 and your judgement on it
  - The final firebase.json hosting block, verbatim
  - What you found about working directory and Windows shell behaviour
  - Task 4 evidence for BOTH cases, quoted, plus the bypass-flag answer
  - A one-line honest statement: is the deploy path now gated, yes or no

## Constraints

  - Do NOT modify anything under src/, except the temporary failing assertion in
    Task 4, which must be reverted.
  - Do NOT modify firestore.rules, firestore.indexes.json, storage.rules or .firebaserc.
  - Do NOT revert or weaken the GitHub Actions gate from Phase 31. Both paths keep
    their gate (owner decision, 2026-08-25).
  - Do NOT add dependencies.
  - Do NOT run a bare `firebase deploy`.
  - If a stated fact in this prompt turns out to be wrong, STOP and report it.
```

## Done when

A broken test provably aborts `firebase deploy --only hosting` before anything is
uploaded, demonstrated with quoted output; a real deploy leaves behind a report
naming the commit and whether the tree was clean; and PHASE_31A_RESULT.md answers
yes or no to whether the deploy path is gated.

## Still owed after this phase

Not part of Phase 31A; listed so they are not lost:

1. **ADR-018 D9 correction note** — the decision as written rests on the premise
   that CI is the deploy path. It needs a dated CORRECTION section in the same
   format as the ADR-004 and ADR-007 corrections.
2. **QMS procedure section 5.1** — currently states that a failing release "cannot
   be deployed — this is enforced by the system, not by procedure." That is not true
   today, and will only become true once this phase lands. The procedure is still a
   draft and has not been adopted, so nothing false is in force — but it must be
   corrected before adoption.
