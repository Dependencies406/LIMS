# Phase 31 Result — Tier 1: block deploy on failing tests, retain evidence

Branch: `feature/ci-test-gate`. Prompt: `docs/PHASE_31_PROMPT_CI_TEST_GATE.md`.

## Status: Tasks 1–3 and 5 complete. Task 4 (live proof) not completed — blocked, not skipped by choice.

The gate itself is built, and every mechanical piece of it was verified locally
(exit codes, JSON output shape, report contents). What was **not** obtained is a
GitHub Actions run actually executing it, because Actions has never triggered a
single workflow run on this repository — a pre-existing condition unrelated to
this change. See "Task 4" below for the full account. Per instruction, this is
reported rather than asserted as done.

## Pre-work (CLAUDE.md RULE 3/4/8)

- Branch at session start: `feature/analysis-module`. Other local branches:
  `feature/data-recorder`, `master`, `recovery-before-20251128-113145`,
  `recovery/20251128-115142`.
- Worktrees: exactly one — `C:/Users/seela/Desktop/LIMS-New` — no others.
- `git status` at start showed pre-existing uncommitted changes (modified
  `docs/DATA_MGMT_MODULE_GLOSSARY.md`, `docs/adr/README.md`, and several
  untracked docs, including the ADR and prompt this phase reads). Left
  untouched throughout — not part of this task.
- `node.exe` processes: `npm run dev` / `vite` and the `firebase-functions`
  emulator all running from `C:\Users\seela\Desktop\LIMS-New`. No process
  referenced `LIMS-New-Backup`.
- Created `feature/ci-test-gate` from `feature/analysis-module` HEAD (bc1f615).

## Task 1 — Baseline

```
npm test
```

**Test Files: 76 passed (76)**
**Tests: 1478 passed (1478)**
**Duration: 48.80s**
0 failed. Suite was green — proceeded per the prompt's instruction.

## Task 2 — Test step added to both workflows

Inserted between `npm ci` and `npm run build` in both
`.github/workflows/firebase-hosting-merge.yml` and
`.github/workflows/firebase-hosting-pull-request.yml`:

```diff
       - run: npm ci
+      - name: Run test suite (vitest)
+        run: npx vitest run --reporter=default --reporter=json --outputFile.json=./test-results/vitest-report.json
+      - name: Write platform validation report
+        run: npx tsx scripts/writePlatformValidationReport.ts
+      - uses: actions/upload-artifact@v4
+        with:
+          name: platform-validation-report
+          path: validation-reports/
       - run: npm run build
```

No `continue-on-error`, no `|| true`. GitHub Actions fails the job on the
step's non-zero exit code by default, which was verified locally (see below).
`FirebaseExtended/action-hosting-deploy`, its secrets, and its project id were
not touched — confirmed by the diff above being the only change to either file.

Locally verified (not just asserted):
- `npx vitest run --reporter=default --reporter=json --outputFile.json=...`
  produces both console output and a valid JSON report simultaneously.
- A deliberately failing test causes the command to exit `1` while still
  writing the JSON report first — the JSON step doesn't depend on success.

## Task 3 — Platform Validation Report script

`scripts/writePlatformValidationReport.ts`, run via `tsx` after the test step,
before `npm run build`. Reads `test-results/vitest-report.json`, writes
`validation-reports/platform-validation-<sha>.md`, uploaded as a workflow
artifact via `actions/upload-artifact@v4`.

Two bugs found and fixed during local verification, both worth recording
since they'd have produced a wrong report if shipped unverified:

1. **`numTotalTestSuites` in vitest's JSON reporter is not the file count.**
   It counts `describe` blocks (412 in this suite), not test files (76,
   matching the console reporter). Fixed by using `testResults.length`
   instead. Caught by comparing the script's output against the baseline
   console numbers from Task 1 — they didn't match, which is what exposed it.
2. **`execFileSync('npm', ...)` fails on Windows** (`ENOENT` — Windows
   resolves `npm` as `npm.cmd`, not found by direct exec). Fixed by switching
   to `execSync('npm --version')`, which goes through a shell and resolves
   correctly on both Windows and the `ubuntu-latest` CI runner. Caught by
   running the script locally before trusting it in CI.

Sample output (generated locally against the real Task 1 test run, with
GitHub env vars simulated):

```
# Platform Validation Report

- Run date (UTC): 2026-08-25T14:50:06.849Z
- Run date (Asia/Bangkok): 25 Aug 2026, 21:50:06 GMT+7
- Commit SHA: bc1f615efa8c5d188f7a97a3987d38e5cea45de9
- Branch: feature/ci-test-gate
- Workflow run: [123456789](https://github.com/seela/LIMS-New/actions/runs/123456789)

## Test suite result
- Test files: 76
- Tests: 1478
- Passed: 1478
- Failed: 0
- Skipped: 0
- Duration: 12.35s

## Tooling
- Node version: v24.11.1
- npm version: 11.6.2
- vitest version: 3.2.4
- App version: 0.1.0

## Scope of this evidence
Tier 1 platform validation per ADR-018 D9. Covers the expression interpreter,
number formatting and round-on-display rules, unit conversion, PDF rendering
and Firestore rules to the extent exercised by the automated suite. It does
NOT constitute validation of any individual Recorder Template version.
```

`test-results/` and `validation-reports/` added to `.gitignore` — generated
output, not committed (CLAUDE.md RULE 9 also applies: generated markdown does
not belong in the repo).

## Task 4 — Prove the gate blocks: attempted, not completed

Steps taken:
1. Committed the Task 2/3 changes (`18d4d1e`), pushed `feature/ci-test-gate`
   to `origin` (`Dependencies406/LIMS`), opened
   [PR #1](https://github.com/Dependencies406/LIMS/pull/1) against `master`
   — with explicit user confirmation before pushing/opening the PR.
2. Added `src/__ci_probe__/deliberateFailure.test.ts` (one `expect(1).toBe(2)`
   assertion), committed (`1c1adef`), pushed.
3. Waited, then checked for a workflow run three independent ways:
   - `gh api repos/Dependencies406/LIMS/actions/runs` → `{"total_count":0}`
   - `gh pr checks 1` → `no checks reported on the 'feature/ci-test-gate' branch`
   - GitHub's Actions tab in-browser → **"There are no workflow runs yet."**

**Finding: no workflow has ever run on this repository**, not just on this
branch. `gh api repos/Dependencies406/LIMS/actions/workflows/<id>/runs` for
*both* workflows (including the pre-existing merge workflow, unrelated to
this change) returns zero runs, despite `pushed_at` being current and both
workflows showing `state: active`. Checked and ruled out:
repo not archived/disabled, Actions permission `enabled: true, allowed_actions:
all`, PR is same-repo not a fork (so the `head.repo.full_name ==
github.repository` guard in the PR workflow should pass).

This is a pre-existing condition of the GitHub repository/account, not caused
by this phase's changes. The most likely cause — not verified, since it
requires the account owner's authenticated session, which is out of reach for
this session — is an unverified email address on the GitHub account, which
silently blocks all Actions runs on public repos. The user was given
step-by-step instructions to check this; resolution is pending.

**Per explicit user instruction, this session did not push a fix or a revert
commit for the probe test.** `feature/ci-test-gate` on `origin` currently
contains the failing test at commit `1c1adef` (HEAD), unremoved. Locally, the
same state is present. Anyone building this branch or running `npm test` on
it will see one failing test file until that commit is reverted or a follow-up
commit removes `src/__ci_probe__/deliberateFailure.test.ts`.

**Conclusion:** the gate's mechanics were verified locally (exit codes, JSON
output, report generation), and the workflow YAML is in place and diffed
above, but the live "does GitHub Actions actually block a real deploy"
demonstration the prompt requires has **not** been obtained. This does not
meet the prompt's "Done when" bar, which explicitly requires evidence over
assertion.

## Discrepancies against the prompt's stated facts

None. Every fact in `docs/PHASE_31_PROMPT_CI_TEST_GATE.md` and
`docs/adr/ADR-018-recorder-template-validation.md` (D1, D9) matched what was
read directly: `package.json:9` is `"test": "vitest run"`; both workflows ran
only `npm ci` then `npm run build` with no test step; these are the only two
workflow files in `.github/workflows/`; vitest and tsx were already present as
devDependencies.

## Outstanding before this phase can be marked done

1. Resolve the GitHub Actions trigger blocker (likely email verification —
   unconfirmed).
2. Re-run Task 4: observe the failing-test run actually fail in Actions, then
   remove `src/__ci_probe__/deliberateFailure.test.ts`, push, and observe a
   passing run with the Platform Validation Report artifact attached.
3. Update this document with the real (not locally-simulated) Actions log
   lines and artifact link for both runs.

## Appendix — Phase 31A Task 0: probe test removed

`src/__ci_probe__/deliberateFailure.test.ts` was left on this branch (locally
and on `origin`, commit `1c1adef`) at the end of the Phase 31 session, per
explicit user instruction not to push a removal commit at that time. Phase 31A
Task 0 removes it. Its full contents, verbatim, so it can be recreated if this
kind of probe is needed again:

```typescript
import { describe, it, expect } from 'vitest';

// Temporary probe for Phase 31 Task 4 — proves the CI test gate blocks a
// failing suite. Removed in the immediately following commit.
describe('Phase 31 CI gate probe', () => {
  it('is deliberately failing', () => {
    expect(1).toBe(2);
  });
});
```

File path was `src/__ci_probe__/deliberateFailure.test.ts` (directory
`src/__ci_probe__/` removed along with it — no other files in it).
