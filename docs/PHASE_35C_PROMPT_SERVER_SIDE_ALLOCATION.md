# Phase 35C — Build the allocation function (server side only)

> This phase changes NOTHING a user can see. It adds a server program and a rule,
> and deploys them. The app still allocates numbers the old way until **35D**
> switches the client over. That split is deliberate: a lab that cannot issue
> certificates is the worst outcome available here, so the new engine gets built
> and proven while the old one is still running.

## Model and effort

**Claude Opus 5 · Effort: Maximum**

The failure mode is silent. A subtly wrong counter does not crash — it issues a
duplicate or skipped certificate number that nobody notices until an assessor
reads the register. Maximum effort is for the transaction semantics, the
year-reset branch, and the exact field set, where "looks right" and "is right"
are indistinguishable by inspection.

**Stop the session and report, rather than working around, if:**

- Task 1's reachability gate fails.
- The reset logic in `certificateNumberGeneratorService.ts` cannot be transcribed
  exactly — any temptation to "improve" it is a signal to stop and ask.
- Any anchor fact below is wrong.

## Context for a fresh session

Governing: `docs/adr/ADR-019-certificate-number-allocation.md` — read it first.
Also `docs/PHASE_35A_RESULT.md` (the function that is already deployed) and
`docs/adr/ADR-008-record-number-allocation.md` (the accepted risk this closes).

### The decisions this phase implements

- **D2** Any authenticated user may allocate. No permission check. Do not add one.
- **D3** Allocation happens on the server, in a Cloud Function.
- **D6** A number taken for a cancelled job is burned; gaps are acceptable **but
  must be explainable** — the system records which job consumed each number.

### Verified facts

1. **Firebase project id is `scs-lims`** (`.firebaserc`).

2. **A callable is already deployed and the client is wired.**
   `pingFunctions` — v2 callable, `region: 'asia-southeast1'`, `invoker: 'public'`
   (`functions/src/ping.ts`). `src/services/firebase.ts` exports
   `functions = getFunctions(firebaseApp, 'asia-southeast1')` plus `httpsCallable`.
   Deployment succeeded after `firebase login --reauth` (PHASE_35A_RESULT §2).
   **The round trip has never been observed** — that is Task 1.

3. **`invoker: 'public'` is the established pattern** (`exportToDrive.ts:160`,
   `ping.ts`). It is required for browser CORS preflight. The platform therefore
   lets anyone reach the endpoint; **the in-function `request.auth` check is the
   entire security boundary.** Treat it as such.

4. **Today's allocation logic — the thing being moved** —
   `src/services/certificateNumberGeneratorService.ts`:
   - `formatCertificateNumber` at `:26-56`. Parts joined by `config.separator`:
     company abbreviation (if any), `config.prefix`, then — when
     `config.includeYear` — `String(year).slice(-2)` concatenated directly with
     the zero-padded number (`:43-48`), else just the padded number.
   - `generateCertificateNumber(configId)` at `:65-148`: `runTransaction`,
     `transaction.get(configRef)`, reset evaluation at `:105-116`,
     `baseNumber`/`nextNumber` at `:118-121`, `transaction.update` at `:132-141`.
   - **It deliberately does NOT write `updatedAt`** (`:128-131`, ADR-012:
     `updatedAt` means "a human last edited this equipment type"). It writes
     `lastAllocatedAt` instead, and `lastResetAt` only on a reset.
   - Company abbreviation comes from `getCompanyInfo()` (`:153`), and a failure to
     read it is swallowed — the number is still issued, without the prefix
     (`:155-158`).
   - `generateCertificateNumberForEquipment(equipmentName)` at `:240-246` resolves
     the config via `certificateNumberConfigService.getConfigByEquipmentName`.

5. **Config resolution is by `name`, and that is a known wart.**
   `getConfigByEquipmentName` (`certificateNumberConfigService.ts:291-296`) filters
   active configs by exact `name` match, while ADR-012 and the glossary say the
   name is a display label and the document id is the stable key. **Do not fix
   this here.** Mirror today's behaviour exactly and note it in the report.

6. **`currentYear` is stored as a full four-digit number**, printed as the last two
   (fact 4). Typed `currentYear: number`, `src/types/index.ts:565`.
   **UNVERIFIED against live data** — `npm run report:certificate-configs` has
   never run (no service-account key). Assume four digits; make the function
   fail loudly rather than silently if it meets anything else (Task 2f).

7. **`firestore.rules` is 778 lines.** `certificate_number_configs` at `:161-165`
   is admin-write-only. **This phase does not change that rule** (ADR-019 D4 — the
   Admin SDK bypasses rules, so the client no longer needs write access at all).
   The catch-all `match /{document=**} { allow read, write: if false; }` is at
   `:774-776`; a new collection is invisible until a rule is added above it.

8. **`functions/` is on Node 22** with `firebase-admin ^14.3.0` and
   `firebase-functions ^7.3.2` (`functions/package.json`); build is `tsc`.
   Deploy predeploy runs only the functions build — **deploying functions does not
   deploy the app** (`firebase.json:38-40` vs the hosting predeploy at `:4-8`).

9. **`functions/` has no test runner** and adding one would be a new dependency.
   The function body therefore cannot be unit-tested in this phase. Say so plainly
   rather than implying coverage.

10. **Test baseline: 82 files / 1721 tests / 0 failures.** The repository still
    carries the uncommitted dependency migration (`package.json`,
    `package-lock.json`, `src/App.tsx`); branch `feature/trace-ui`.

## Prompt

    Read first:
      - CLAUDE.md — hard rules, especially RULE 1
      - docs/PHASE_35C_PROMPT_SERVER_SIDE_ALLOCATION.md — this file
      - docs/adr/ADR-019-certificate-number-allocation.md — the governing decisions
      - src/services/certificateNumberGeneratorService.ts — ALL of it. This is the
        logic being transcribed; getting it exactly right is the phase.
      - src/services/certificateNumberConfigService.ts lines 285-300 — config lookup
      - functions/src/ping.ts and functions/src/exportToDrive.ts lines 150-175 —
        the callable pattern, auth guard, and error style to follow
      - firestore.rules lines 150-170 and 770-778 — where the new rule goes

    ## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)
        git branch
        git worktree list
        git status
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
          Select-Object ProcessId, CommandLine | Format-List

    Report each FULL path. Confirm nothing runs from LIMS-New-Backup. Project root
    is C:\Users\seela\Desktop\LIMS-New (CLAUDE.md line 145's OneDrive path is
    stale). Expected branch: feature/trace-ui, migration still uncommitted.

    ## Task 1 — THE GATE. Prove the deployed function actually executes.

    ADR-019 D7 requires the client->function round trip to be proven before this
    work is built on. It has not been. Prove what can be proven WITHOUT a browser:

    Send an unauthenticated POST to the deployed callable:

        curl -i -X POST \
          https://asia-southeast1-scs-lims.cloudfunctions.net/pingFunctions \
          -H "Content-Type: application/json" \
          -d "{\"data\":{}}"

    A reply carrying the function's OWN `unauthenticated` error proves the endpoint
    resolves, the region is right, the deployment is live, and the function body
    ran far enough to reject the call. That is the gate.

    A 404, a DNS failure, or a platform-level 403 that never reaches the function
    is a FAILURE — STOP and report it. Do not proceed to build on an endpoint that
    does not answer.

    Paste the full response. State: GATE PASSED / GATE FAILED.

    (Full success with a real signed-in token is still unobserved. That is expected
    and is closed in 35D by a real allocation, not here.)

    ## Task 2 — The allocation function

    Create `functions/src/allocateCertificateNumber.ts`, exported from
    `functions/src/index.ts` alongside the existing exports.

    2a. Signature: v2 `onCall`, `region: 'asia-southeast1'`, `invoker: 'public'`,
        matching ping.ts exactly.

        Input:  { equipmentName: string, jobId: string, equipmentIndex: number }
        Output: { certificateNumber: string, number: number, year: number,
                  configId: string }

    2b. Guards, in order, each throwing the named HttpsError code:
          - no request.auth                      -> 'unauthenticated'
          - equipmentName missing/blank, jobId
            missing/blank, equipmentIndex not a
            non-negative integer                 -> 'invalid-argument'
          - no active config whose name matches   -> 'not-found'
          - config found but isActive === false   -> 'failed-precondition'
        Any authenticated user passes. **Do NOT check a role or a permission** —
        ADR-019 D2 is explicit that allocation is open to every signed-in user.

    2c. Resolve the config the SAME way the client does today: among configs with
        `isActive !== false`, exact match on `name` after trimming
        (certificateNumberConfigService.ts:291-296). Do not "improve" the matching.

    2d. Allocate inside ONE Firestore transaction:
          - read the config document
          - evaluate the reset policy exactly as
            certificateNumberGeneratorService.ts:105-116 does — 'yearly' compares
            `config.currentYear !== currentYear`; 'monthly' compares
            `lastResetAt`'s year and month; anything else never resets
          - nextNumber = (shouldReset ? 0 : currentNumber) + 1
          - update the config with EXACTLY these fields and no others:
                currentNumber, currentSequence, currentYear, lastAllocatedAt
                plus lastResetAt ONLY when shouldReset
          - **NEVER write `updatedAt`.** It means "a human edited this equipment
            type" (ADR-012). Writing it would corrupt that meaning.

    2e. In the SAME transaction, create a ledger document (see Task 3).

    2f. Sanity-guard the year. If `config.currentYear` is not an integer in
        2000..2100, throw 'failed-precondition' naming the document id and the
        offending value. Do NOT coerce it, and do NOT guess a four-digit year from
        a two-digit one. Fact 6 says the live data has never been inspected; a loud
        failure on one config is recoverable, a silently wrong year is not.

    2g. Format the number by transcribing `formatCertificateNumber`
        (certificateNumberGeneratorService.ts:26-56) literally, including the
        company abbreviation read from `system/companyInfo` and the same swallow-
        on-failure behaviour (:153-158): if company info cannot be read, issue the
        number without the abbreviation rather than failing.

        This is a SECOND copy of the formatting rules. Put a comment at the top of
        each of the two implementations naming the other as its twin and stating
        that they must be changed together. Record the duplication in the report as
        accepted debt.

    2h. Log, via firebase-functions logger, one line per successful allocation:
        the caller uid, configId, jobId, equipmentIndex, and the issued number.

    ## Task 3 — The allocation ledger, so gaps can be explained

    ADR-019 D6 requires that a gap in the register be explainable. Create, in the
    same transaction as 2d, one document per allocated number in a new collection
    `certificateNumberAllocations`:

        document id: the formatted certificate number itself
        fields:      certificateNumber, number, year, configId, configName,
                     jobId, equipmentIndex, allocatedBy (uid), allocatedAt

    Use a transaction CREATE, not a set/overwrite: if a document with that id
    already exists the transaction must abort with 'already-exists'. **This makes a
    duplicate certificate number structurally impossible** — the database refuses
    it even if the counter logic is somehow wrong. Say so in a comment; it is the
    single strongest thing this phase does.

    Note in the report: a client that retries after a timeout may burn a number
    (allocate one that is never used). ADR-019 D6 accepts burned numbers. Do NOT
    add an idempotency key in this phase.

    ## Task 4 — The rule for the new collection

    In `firestore.rules`, ABOVE the catch-all at :774, add:

        match /certificateNumberAllocations/{allocationId} {
          allow read: if request.auth != null;
          allow write: if false;
        }

    Write is denied to every client; only the Admin SDK (which bypasses rules)
    writes here. Comment it saying exactly that, and why.

    **Do NOT change the `certificate_number_configs` rule at :161-165.**
    Do NOT change any other rule. Do NOT deploy rules yourself.

    ## Task 5 — Build, and hand the owner the deploy

    5a. `npm --prefix functions run build` — must be clean. Paste the output.
    5b. `npm test` — must be unchanged at 82 files / 1721 tests. This phase touches
        no `src/` file. Paste before and after.
    5c. STOP. Print, as two copyable lines, the commands for the owner:

            firebase deploy --only functions:allocateCertificateNumber
            firebase deploy --only firestore:rules

        Tell him plainly: neither command deploys the app; nothing users see
        changes; the new function is not called by anything until 35D; and the
        rules change only ADDS a read permission on a new collection, removing
        nothing. Wait for his results, then record them.

    5d. If he reports success, re-run the Task 1 curl against
        `allocateCertificateNumber` and confirm it too answers with its own
        `unauthenticated` error. Paste it.

    ## Task 6 — Report

    Write docs/PHASE_35C_RESULT.md containing:
      1. Pre-work verbatim
      2. Task 1: the curl response and GATE PASSED/FAILED
      3. A side-by-side table: every field the OLD client transaction writes vs
         every field the NEW function writes, proving they match and that
         `updatedAt` appears in neither
      4. The reset-policy logic quoted from both old and new, side by side
      5. Task 3: the ledger document shape, and one sentence on why the document id
         choice prevents duplicates
      6. Task 4: the rules diff
      7. Build output; test counts before and after (must be identical)
      8. The owner's deploy results, and the Task 5d curl
      9. Accepted debt: the duplicated formatting logic, the name-based config
         lookup (fact 5), the absence of unit tests for the function body (fact 9),
         and the retry-burns-a-number behaviour
     10. Anything that contradicted this prompt

    ## Constraints

      - Do NOT change any file under `src/`. The client switch is 35D.
      - Do NOT change the `certificate_number_configs` rule.
      - Do NOT delete `src/dev/pingFunctionsProbe.ts` or its two lines in
        `src/main.tsx` — 35D removes them, after they have served their purpose.
      - Do NOT add a permission or role check to the function (ADR-019 D2).
      - Do NOT write `updatedAt` from the function, ever.
      - Do NOT add dependencies to either package.json.
      - Do NOT deploy anything yourself. Task 5c hands the commands over.
      - Do NOT run npm install/update/ci, and do NOT commit, stash, checkout or
        revert anything.
      - Do NOT modify existing tests.
      - If a stated fact in this prompt turns out to be wrong, STOP and report it.
        Assume this prompt contains an error and find it.

## Done when

The owner can read `docs/PHASE_35C_RESULT.md` and see:

1. Proof the already-deployed function answers when called — the gate ADR-019 D7
   asked for, closed without needing him to click anything.
2. A field-by-field table showing the new server allocation writes exactly what the
   old client allocation writes, and that neither touches `updatedAt`.
3. That a duplicate certificate number is now refused by the database itself,
   because the ledger document is named after the number.
4. His two deploy commands, run, with their output.
5. Test counts identical, because nothing in the app changed.

Nothing a user can see has changed. **35D** switches the app over to this function,
removes the client-side allocation, drops the interim admin-only gate so any
technician can allocate, and deletes the temporary probe.
