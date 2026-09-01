# Phase 31A Result — Gate the deploy path that is actually used

Branch: `feature/ci-test-gate` (continued from Phase 31, unmerged — PR #1). Prompt:
`docs/PHASE_31A_PROMPT_DEPLOY_GATE.md`.

## Answer up front: is the deploy path now gated? **Yes.**

`firebase deploy --only hosting` (and `firebase hosting:channel:deploy`) now runs
`npm test` before anything is built or uploaded, and a failing suite aborts the
deploy before Firebase's upload phase begins — demonstrated below with quoted
log output, not asserted. `--force` does not bypass it (also demonstrated).

## Pre-work (CLAUDE.md RULE 3/4/8)

- Branch: `feature/ci-test-gate`, confirmed unmerged (`gh pr view 1` →
  `state: OPEN`) — continued on it per instruction, no new branch created.
- Worktrees: exactly one — `C:/Users/seela/Desktop/LIMS-New`.
- `node.exe`: dev server (`vite`) and `firebase-functions` emulator both running
  from `C:\Users\seela\Desktop\LIMS-New`. No `LIMS-New-Backup` process.

## Task 0 — Phase 31 probe test cleared

`src/__ci_probe__/deliberateFailure.test.ts` was present locally and on origin
(commit `1c1adef`). Its full contents were archived as an appendix in
`docs/PHASE_31_RESULT.md` before deletion. Removed via an ordinary commit
(`32b9931`, `test: remove Phase 31 CI-gate probe, archive it in
PHASE_31_RESULT.md`) and pushed — no force-push, no history rewrite.
`npm test` confirmed green immediately after: **76 files, 1478 tests, all
passed.**

## Task 1 — Independent verification of the prompt's table

All four checks performed directly, not taken on the prompt's word:

1. **`firebase.json` hosting block, before this phase's changes:** no
   `predeploy` key. Only keys were `public`, `ignore`, `rewrites`. Confirmed by
   reading the file directly (see "Read first" in the prompt). Matches the
   table.
2. **`.firebase/hosting.ZGlzdA.cache`:** exists, `-rw-r--r-- ... Aug 25 10:16`.
   `dist/index.html`: `-rw-r--r-- ... Aug 25 09:29`. System clock is Bangkok
   time (GMT+7) — confirmed by cross-checking against the earlier Phase 31
   session's own UTC/Bangkok report timestamps. Both times match the table
   exactly.
3. **`git log --oneline -15`:** most recent commits are the Phase 31/31A work
   (probe removal, CI gate, and the underlying Data Management Module feature
   work) — nothing unexpected.
4. **`gh run list --limit 20`:** GitHub CLI is available (`gh version 2.92.0`).
   Plain output: empty (zero lines). JSON form: `gh run list --limit 20
   --json databaseId,status,conclusion,headBranch,createdAt` → `[]`. Zero
   workflow runs, confirming the Phase 31 session's finding still holds.

**No discrepancy found.** Everything in the prompt's table checked out exactly.

## Task 2 — Test duration measurement

Two `time npm test` runs back-to-back, warm cache: **13.713s** and **13.378s**
wall-clock (`real` time). For comparison, the same-day cold-cache baseline from
earlier sessions was 42–48s.

**Judgement: acceptable.** Even the slow end (~48s) is nowhere near the
four-minute threshold the prompt flags as unlivable. No faster-reporter or
fast-subset change proposed or needed.

## Task 3 — Predeploy hook added, both assumptions checked experimentally

### a) Working directory — the prompt's assumption was wrong

The prompt assumed predeploy hooks run with CWD set to `$RESOURCE_DIR` (the
`dist/` directory for hosting). **This is false.** Verified with a throwaway
probe script (`node scripts/_predeployCwdProbe.cjs`, temporarily wired into
`firebase.json`'s hosting `predeploy`, run via a real preview-channel deploy,
then deleted):

```
[predeploy-cwd-probe] CWD=C:\Users\seela\Desktop\LIMS-New | RESOURCE_DIR_ENV=C:\Users\seela\Desktop\LIMS-New\dist | SCRIPT_DIR=C:\Users\seela\Desktop\LIMS-New\scripts
```

**`CWD` is the project root.** `$RESOURCE_DIR` is only exposed as an
environment variable (equal to `dist/`), not the working directory. This also
explains something the prompt didn't ask about but is worth recording: the
pre-existing `functions` predeploy (`npm --prefix "$RESOURCE_DIR" run build`)
needs `--prefix` for exactly this reason — CWD is always the project root
regardless of target, so functions has to be told explicitly where its own
resource directory is. Consequence for hosting: no CWD adjustment was needed —
`npm test` and `npm run build`, written as plain strings, already run from the
project root, which is what's wanted.

A full environment-variable dump (same throwaway-probe method, `RESOURCE_DIR`
/`FIREBASE`/`GCLOUD`/`PROJECT`/`CHANNEL`-matching keys only) showed only:
`GCLOUD_PROJECT`, `IS_FIREBASE_CLI`, `PROJECT_DIR`, `RESOURCE_DIR` — identical
between a live-shaped deploy and a channel deploy. **Firebase does not expose
which target (live vs. channel) is being deployed to its predeploy hooks.**
This directly informs Task 5's "deploy target" field (see below).

### b) Windows shell — tested, not assumed

Phase 31 hit an `ENOENT` from Node's `execFileSync('npm', ...)` without
`shell: true`. That was a Node API quirk (Windows resolves `npm` to `npm.cmd`,
and `execFileSync` won't find `.cmd` files without a shell). It does **not**
apply to Firebase's own predeploy execution: `"npm test"`, written as a plain
string in the `predeploy` array, was run for real via
`firebase hosting:channel:deploy` and executed cleanly — Firebase's own exec
path clearly goes through a real shell (`cmd.exe`) that resolves `.cmd` shims
correctly. Confirmed by observing the full test suite run to completion inside
an actual channel deploy (see Task 4 evidence below, which used this exact
predeploy chain).

### Final hosting block (verbatim)

```json
{
  "hosting": {
    "public": "dist",
    "predeploy": [
      "npm test",
      "npx tsx scripts/writePlatformValidationReport.ts",
      "npm run build"
    ],
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

`functions`, `firestore`, `storage` blocks and `.firebaserc` untouched — diffed
and confirmed only the `predeploy` key was added to `hosting`.

`package.json`'s `test` script was changed from `"vitest run"` to
`"vitest run --reporter=default --reporter=json --outputFile.json=./test-results/vitest-report.json"`
so that plain `npm test` — used verbatim in the predeploy chain, per Task 3's
literal instruction — always produces the JSON report the validation-report
script needs, in both CI and local runs, without duplicating the vitest
invocation in two places. CI's own workflow steps (from Phase 31) already
called the same flags explicitly, so CI behavior is unchanged; this just makes
local `npm test` match it.

## Task 4 — Proof the gate blocks (both cases), plus the bypass check

### FAILURE case (RULE B)

Introduced one failing assertion in an existing file,
`src/utils/__tests__/formulaHelpers.test.ts:21`
(`expect(getColumnLetter(0)).toBe('WRONG_PHASE_31A_PROBE')`), then ran:

```
firebase deploy --only hosting
```

Full output captured (500 lines). Relevant excerpt — the test failure and the
final abort:

```
 Test Files  1 failed | 75 passed (76)
      Tests  1 failed | 1477 passed (1478)
   Start at  22:48:30
   Duration  12.72s ...

JSON report written to C:/Users/seela/Desktop/LIMS-New/test-results/vitest-report.json
node:events:486
      throw er; // Unhandled 'error' event
      ^
Error: spawn npm test ENOENT
    at notFoundError (...firebase-tools\node_modules\cross-spawn\lib\enoent.js:6:26)
    ...
Error: hosting predeploy error: Command terminated with non-zero exit code 1
```

**Did it abort at predeploy? Yes.** **Was anything uploaded? No.** Evidence:
`grep`-ing the full 500-line output for every string Firebase's own hosting
deploy prints during upload (`beginning deploy`, `found ... files in dist`,
`upload complete`, `finalizing version`, `release complete`) returns **zero
matches**. The only relevant lines are the test failure and the final
`hosting predeploy error` line. This is not inferred from silence — the same
grep against the passing run below (see next section) *does* find every one
of those lines, confirming the grep itself is a valid discriminator.

**Honest caveat, not softened:** after the predeploy command's non-zero exit,
firebase-tools itself threw an *unhandled* `Error: spawn npm test ENOENT` with
a raw Node stack trace, rather than a single clean CLI error message. This
looks like a rough edge in firebase-tools' own Windows error-handling path
(it appears to attempt an additional internal spawn using the full command
string as a literal executable name after detecting the failure). It is
cosmetic, not a gate failure — it happens *after* the predeploy step already
failed and *before* any upload phase, and the final line
(`hosting predeploy error: Command terminated with non-zero exit code 1`)
still correctly reports the abort. Flagged here rather than swept under the
rug per the prompt's instruction not to soften findings.

Reverted the assertion, confirmed clean diff, ran `npm test`: **76 files, 1478
tests, all passed, 12.71s.**

### `--force` bypass check (Task 4 step 7)

Re-introduced the same failing assertion, ran:

```
firebase deploy --only hosting --force
```

Result: identical abort. `grep` for upload-phase strings: zero matches again.
**`--force` does not bypass the predeploy gate** — its documented behavior
(`firebase deploy --help`) is "delete Cloud Functions missing from the current
working directory and bypass interactive prompts," and that is exactly what
was observed; it has no effect on predeploy hook enforcement. No other flag in
`firebase deploy --help` claims to skip predeploy hooks (`--dry-run`,
`--only`, `--except`, `-p/--public`, `-m/--message` — none are predeploy-hook
bypasses by their documented purpose). **No bypass exists.** The gate is
mandatory, not advisory, for this deploy path.

Reverted the assertion again, confirmed clean diff, ran `npm test`: **76
files, 1478 tests, all passed.**

### PASS case (RULE C)

First confirmed predeploy hooks run on channel deploys at all — yes, observed
directly in every channel-deploy run in this phase (probe runs and the real
run below all show `Running command: ...` / `Finished running predeploy
script.` before `beginning deploy...`).

Ran, with a clean test suite:

```
DEPLOY_TARGET_LABEL="channel:phase31a-verify" firebase hosting:channel:deploy phase31a-verify --expires 1d
```

Relevant output:

```
Running command: npm test
...
 Test Files  76 passed (76)
      Tests  1478 passed (1478)
...
JSON report written to C:/Users/seela/Desktop/LIMS-New/test-results/vitest-report.json
Platform Validation Report written to C:\Users\seela\Desktop\LIMS-New\docs\validation-reports\platform-validation-local-2026-08-25T15-50-00-642Z-32b9931c310d.md
Reminder: this report is a quality record (clause 8.4) and must be committed — git add "docs\validation-reports\platform-validation-local-2026-08-25T15-50-00-642Z-32b9931c310d.md" && git commit
...
✓ built in 19.08s
+ hosting: Finished running predeploy script.
i  hosting[scs-lims]: beginning deploy...
i  hosting[scs-lims]: found 11 files in dist
i  hosting: upload complete
+  hosting[scs-lims]: file upload complete
i  hosting[scs-lims]: finalizing version...
+  hosting[scs-lims]: version finalized
i  hosting[scs-lims]: releasing new version...
+  hosting[scs-lims]: release complete
+ Deploy complete!
+  hosting:channel: Channel URL (scs-lims): https://scs-lims--phase31a-verify-el614xkb.web.app [expires 2026-08-26 22:49:44]
```

Report generated (`docs/validation-reports/platform-validation-local-2026-08-25T15-50-00-642Z-32b9931c310d.md`,
committed alongside this result doc) correctly recorded: LOCAL DEPLOY,
`DIRTY` working tree (prominently flagged — the pre-existing uncommitted doc
changes from earlier sessions were present the whole time), commit SHA,
branch, deploy target (`channel:phase31a-verify`, from `DEPLOY_TARGET_LABEL`),
machine (`HomieHim`), user (`seela`), and the full test-suite/tooling section.

### RULE D — preview channel deleted

```
firebase hosting:channel:delete phase31a-verify --force
+  hosting:channels: Successfully deleted channel phase31a-verify for site scs-lims.
```

(`--force` here only skips the interactive delete confirmation — unrelated to
the predeploy-bypass question above.)

## Task 5 — Report script now covers the local deploy path

`scripts/writePlatformValidationReport.ts` extended (not forked) to detect
`GITHUB_ACTIONS=true` and branch behavior:

- **CI** (unchanged): writes to `validation-reports/` (gitignored, retained via
  the workflow's `upload-artifact` step).
- **Local** (new): writes to `docs/validation-reports/` with a dated filename,
  additionally records LOCAL DEPLOY, machine (`os.hostname()`), user
  (`os.userInfo().username`), commit SHA/branch (via `git rev-parse`), CLEAN
  vs. DIRTY working tree (`git status --porcelain`), and deploy target. A
  dirty tree is flagged with a bold blockquote warning immediately after the
  title, not buried in the field list. Deploy target is read from an optional
  `DEPLOY_TARGET_LABEL` env var (since Firebase exposes no way to detect it
  automatically — see Task 3a) and otherwise reports honestly that it's
  unconfirmed rather than assuming "live". Closing console line reminds the
  operator to commit the report, with the exact `git add`/`git commit`
  command spelled out.

Wired into the hosting `predeploy` chain between `npm test` and
`npm run build`, exactly as instructed.

## Discrepancies against the prompt's stated facts

One: **Task 3a's assumption about `$RESOURCE_DIR` and CWD was wrong** — the
prompt itself flagged this as something to verify rather than assume, and the
verification found the documented/assumed behavior does not hold on this
Firebase CLI version (15.25.1) for hosting predeploy hooks. Recorded in full
under Task 3a above. Everything else in the prompt (the deploy-path finding,
the zero-Actions-runs finding, the Windows npm exec issue reference) checked
out exactly.

## Still owed (per the prompt's "Still owed after this phase")

Not done in this phase, listed so they aren't lost:
1. ADR-018 D9 correction note (dated CORRECTION section, ADR-004/ADR-007
   format).
2. QMS procedure section 5.1 correction (currently claims system-enforced
   blocking was already true; it is only true as of this phase, and the
   procedure is still draft/unadopted).
