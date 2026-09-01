# Phase 31 — Tier 1: block deploy on failing tests, and retain the run as evidence

## Model and effort

**Claude Sonnet 5 · Effort: Medium**

Small and mechanical. Two workflow files and one script. The risk is not complexity —
it is claiming the gate works without having watched it fail.

## Context for a fresh session

Standalone. Decisions: `docs/adr/ADR-018-recorder-template-validation.md`, D1 and D9.

**The problem, verified 2026-08-25:**

- `package.json:9` — `"test": "vitest run"`. The suite exists and is large.
- `.github/workflows/firebase-hosting-merge.yml:18-19` — the job runs `npm ci` then
  `npm run build`. **There is no test step.**
- `.github/workflows/firebase-hosting-pull-request.yml` — same pair of steps.
- These two are the **only** workflows in `.github/workflows/`.

So application code reaches production having been *compiled*, never *tested*.
ISO/IEC 17025:2017 clause 7.11.2 requires changes to be validated before
implementation. Right now nothing does that mechanically.

This phase is the cheapest possible fix: the evidence already exists, it is simply
never executed by the pipeline and never recorded.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules, especially RULE 1 (never assert what you have not verified)
  - docs/PHASE_31_PROMPT_CI_TEST_GATE.md — this file
  - docs/adr/ADR-018-recorder-template-validation.md — D1 and D9 only
  - .github/workflows/firebase-hosting-merge.yml — read it in full
  - .github/workflows/firebase-hosting-pull-request.yml — read it in full
  - package.json — the scripts block

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List

Report each FULL path. Confirm nothing runs from LIMS-New-Backup (which is nested
INSIDE the project at C:\Users\seela\Desktop\LIMS-New\LIMS-New-Backup\ — never modify it).

Work on a branch: feature/ci-test-gate

## Task 1 — Establish the baseline. Do this before editing anything.

Run:

    npm test

Report the EXACT result: how many test files, how many tests, how many passed,
how many failed, how long it took.

**If any test currently fails, STOP and report.** Do not add a gate to a red suite —
that turns every future deploy into a blocked deploy and the gate will simply be
removed by whoever is trying to ship. Tell the owner what is failing and wait.

## Task 2 — Add the test step to both workflows

In BOTH `.github/workflows/firebase-hosting-merge.yml` and
`.github/workflows/firebase-hosting-pull-request.yml`, insert a step that runs the
test suite BETWEEN `npm ci` and `npm run build`.

Requirements:
  - The step must FAIL the job when tests fail. Do not add `continue-on-error`.
    Do not use `|| true`. The whole point is that it blocks.
  - Place it before `npm run build`, not after: there is no reason to spend build
    time on a change that has already failed its tests.
  - Give the step an explicit `name:` so it is identifiable in the Actions log —
    that log is quality evidence, not just developer output.
  - Emit the vitest results as a machine-readable JSON report as well as console
    output, written to a path the next task can read.

Do not change anything else in these files. In particular do not touch the
FirebaseExtended/action-hosting-deploy step, its secrets, or its project id.

## Task 3 — Platform Validation Report

Add a script, `scripts/writePlatformValidationReport.ts`, run in CI after a
successful test step. It writes a single Markdown report containing at minimum:

  - Report title and the date/time of the run (UTC and Asia/Bangkok)
  - The commit SHA and branch
  - The workflow run id and its URL
  - Test suite result: files, tests, passed, failed, skipped, duration
  - Node version, npm version, vitest version, and the app version from package.json
  - An explicit statement of what this report is evidence FOR:
    "Tier 1 platform validation per ADR-018 D9. Covers the expression interpreter,
     number formatting and round-on-display rules, unit conversion, PDF rendering
     and Firestore rules to the extent exercised by the automated suite. It does
     NOT constitute validation of any individual Recorder Template version."

That last paragraph is not decoration. It is what stops the report being read as
proving more than it does.

Upload the report as a workflow artifact so it is retained. Follow the existing
`scripts/` conventions — `tsx` is already a devDependency and other scripts in that
folder are run through it.

Follow CLAUDE.md RULE 9: any markdown the script GENERATES is output, not project
documentation, and must not be written into the repo root.

## Task 4 — Prove the gate actually blocks. Do not skip this.

You must demonstrate the gate working, not assert it.

  1. Create a temporary test file with one deliberately failing assertion.
  2. Push the branch and open a PR.
  3. Report what the pull-request workflow did: did the test step fail? Did the
     deploy step run anyway, or was it skipped?
  4. Remove the temporary failing test.
  5. Push again and report that the workflow now passes and produces the report
     artifact.

Paste the relevant workflow log lines for both runs. "It should block" is not an
acceptable answer — RULE 1.

## Task 5 — Report

Write `docs/PHASE_31_RESULT.md` containing:
  - The exact baseline test numbers from Task 1
  - The diff of both workflow files
  - The evidence from Task 4, both runs
  - Anything you found that contradicts this prompt's stated facts

## Constraints

  - Do NOT modify any application source under src/.
  - Do NOT modify firestore.rules, firebase.json, or .firebaserc.
  - Do NOT add or upgrade dependencies. vitest and tsx are already present.
  - Do NOT create a third workflow. Modify the two that exist.
  - If a stated fact in this prompt turns out to be wrong when you read the files,
    STOP and report the discrepancy before proceeding.
```

## Done when

A deliberately failing test blocks a deploy — demonstrated with log output, not
asserted — and a passing merge leaves behind a retained report naming the commit,
the date, and the suite result.
