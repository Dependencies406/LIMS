# Phase 36 — Make four permissions real locks

> Risk-based first. This phase makes FOUR capabilities genuinely enforced in the
> database. It does not touch the other decorative switches — that backlog is
> listed in `PHASE_34_RESULT.md` §5 and gets its own phase.

## Model and effort

**Claude Opus 5 · Effort: Maximum**

These are security rules on a production laboratory, and **they cannot be executed
or tested on this machine** — no JRE, so no Firestore emulator (PHASE_34_RESULT.md
fact 8). Every claim about them is a claim about code that has been read, not run.

The failure modes are asymmetric and both bad. Too strict and a technician cannot
do their job — a lab that cannot record work. Too loose and the phase achieves
nothing while appearing to succeed. The rules currently under change are the ones
every technician touches all day: jobs and customers.

**Stop the session and report, rather than working around, if:**

- Task 1's gate is not clean — the role documents must be confirmed before
  fail-closed rules go anywhere near them.
- Any anchor fact below is wrong.
- You find yourself widening a rule to make something pass.

## Context for a fresh session

Governing: `docs/PHASE_34_RESULT.md` — the audit. Read §5 (the mismatch summary)
and the `callerHasPermission` discussion.
Pattern reference: `docs/adr/ADR-005-record-lifecycle.md`.

### The owner's decisions, 2026-09-07

- The QMS does **not** currently claim role-based access control, so this is a
  design defect on his own timetable, not a nonconformity. Nothing needs to be
  raised or reported.
- **The Roles screen must become a real lock.** A switch that stays on the screen
  genuinely permits or prevents something. Decoration is not acceptable long-term.
- **Four capabilities must be genuinely prevented, not merely hidden:**
  deleting a customer, deleting a job, cancelling or converting a service
  request, and seeing another staff member's performance.
- Risk-based scope: enforce those four now; the rest is a later phase.

### Verified facts

1. **The three rules to change are wide open today.**
   - `firestore.rules:53-56` — `customers`: `allow read: if true` (public, for the
     service-request form) and `allow write: if request.auth != null`. `write`
     covers create, update AND delete.
   - `firestore.rules:595-599` — `jobs`: `allow read, write: if request.auth != null`.
   - `firestore.rules:481-486` — `serviceRequests`: `allow create: if true` (public
     form), `allow read, update, delete: if request.auth != null`.

2. **Staff performance is the opposite problem.**
   `firestore.rules:708-719` — `staffLogs/{staffId}/actions/{actionId}` allows read
   only when `request.auth.uid == staffId` or the caller's role is literally
   `'admin'`. So `staffPerformance.view` is ticked for the Standard user and the
   database refuses it. The box lies; the restriction already exists.

3. **The working permission-aware pattern** is `firestore.rules:284-295`, inside
   the `records` match block:

       function callerRole() {
         return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
       }
       function callerHasPermission(action) {
         let role = callerRole();
         return exists(/databases/$(database)/documents/roles/$(role)) &&
           action in get(/databases/$(database)/documents/roles/$(role)).data.permissions;
       }

   It **fails closed**: a missing `roles/{role}` document grants nothing, to every
   role including admin (ADR-005 Phase 5d). Used at `:328, :336, :354, :366`. These
   four `records.*` permissions are the only ones in the system enforced end to end.

4. **Admin is NOT special-cased inside `callerHasPermission`.** An admin passes only
   because `roles/admin` contains every permission (`roleService.ts:119`,
   `DEFAULT_ROLE_PERMISSIONS.admin = ALL_PERMISSIONS`). **If `roles/admin` is
   missing or incomplete, admins are locked out too.** That is deliberate, and it is
   why Task 1 exists.

5. **THE CRITICAL ONE — enforcement alone changes nothing.**
   `roleService.ts:118-139` — `DEFAULT_ROLE_PERMISSIONS.standardUser` excludes only
   `users.*`, `roles.*`, `equipmentTypes.*`, `recorderTemplates.*`,
   `records.review`, `records.approve`, and three `settings.*` keys.
   **`customers.delete`, `jobs.delete`, `serviceRequests.cancel`,
   `serviceRequests.convert` and `staffPerformance.view` are all INSIDE the Standard
   user's 39.** Making the database honour a ticked box, while the box is ticked,
   prevents nothing. The defaults must change too.

6. **Changing the default constant does not change stored role documents.**
   The live `roles/staff` document already holds its 39 permission strings in
   Firestore. Editing `DEFAULT_ROLE_PERMISSIONS` affects only roles created
   afterwards. **The owner must untick the boxes in the Roles screen** for the
   change to take effect on the existing role — and that is the acceptance test.

7. **UI wiring status** (PHASE_34_RESULT.md §5):
   - `jobs.delete` — already consulted in the UI (`JobModal.tsx:132`).
   - `customers.*` — all five have **no call site anywhere**.
   - `serviceRequests.*` — all four have **no call site anywhere**.
   - `staffPerformance.view` — consulted; the rule is what refuses it.

8. **Rules cannot be tested here.** No `java` on PATH, `JAVA_HOME` unset, no
   `emulators` block in `firebase.json`. `fakeFirestore.ts` is a permissive mock
   that never evaluates `firestore.rules` — never cite it as coverage.

9. **Baseline: 82 files / 1726 tests / 0 failures.** Branch `feature/trace-ui`; the
   dependency migration and all of Phase 35 are still uncommitted.

### The planner's decision on the helper

`callerHasPermission` lives inside the `records` block. It must become available to
three more blocks. **Duplicate it into each new block. Do NOT hoist it to the top
level.**

Reasoning: the `records` rules are the only ones in this file whose behaviour has
been proven by execution (`docs/PHASE_5C_RULES_MANUAL_VERIFICATION.md`, run against
the published rules). Rules cannot be tested on this machine, so a scoping change
under those four transitions would be an unverifiable change to the one part that is
verified — and a mistake there stops record commit, review and approval. Four copies
of a five-line function is the cheaper risk. Record it as debt: hoist once rules can
be executed.

## Prompt

    Read first:
      - CLAUDE.md — hard rules, especially RULE 1
      - docs/PHASE_36_PROMPT_MAKE_PERMISSIONS_REAL.md — this file
      - docs/PHASE_34_RESULT.md §5 — the audit's mismatch summary
      - firestore.rules — lines 50-60, 275-300, 320-370, 478-490, 592-602, 705-722
      - src/services/roleService.ts lines 20-140 — ALL_PERMISSIONS and the defaults
      - src/pages/CustomersPage.tsx and src/components/CustomerModal.tsx — where a
        customer is deleted
      - src/pages/PendingJobsPage.tsx — where a service request is cancelled or
        converted

    ## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)
        git branch
        git worktree list
        git status
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
          Select-Object ProcessId, CommandLine | Format-List

    Report each FULL path. Confirm nothing runs from LIMS-New-Backup. Project root
    is C:\Users\seela\Desktop\LIMS-New. Expected branch: feature/trace-ui.

    ## Task 1 — THE GATE. The role documents, before anything else.

    These rules fail closed. If `roles/admin` or `roles/staff` is missing or
    incomplete, the change locks people out of their own laboratory.

    You cannot read Firestore from here. So: STOP and ask the owner to open the
    running app as an administrator, go to Settings -> Users & Roles -> Roles, and
    report:

      a. Does a role named "Administrator" exist, and how many permissions does it
         show as selected? (Expected: 59.)
      b. Does "Standard user" exist, and how many? (Expected: 39.)
      c. Are there any OTHER custom roles? Name each and its count.

    Wait for his answer. If Administrator is missing or shows fewer than 59, STOP
    and report — the fix is to restore that role before any rule changes, not to
    work around it.

    Record his answer verbatim in the report. Every later claim about who can do
    what depends on it.

    ## Task 2 — Make the four capabilities real, in firestore.rules

    In EACH block below, add local copies of `callerRole()` and
    `callerHasPermission(action)`, transcribed exactly from `firestore.rules:284-295`
    including the fail-closed comment. Do not hoist; do not modify the `records`
    block.

    2a. `customers` (:53-56). Keep `allow read: if true` — the public
        service-request form depends on it; say so in a comment. Replace the blanket
        write with:
          - create, update: any authenticated user (unchanged in effect)
          - delete: `callerHasPermission('customers.delete')`

    2b. `jobs` (:595-599). Keep read and create/update as they are. Split `delete`
        out and gate it on `callerHasPermission('jobs.delete')`.
        **Careful:** this block has many subcollections (documents, spreadsheets,
        attachments, equipment, serviceRequests, notifications, calibrations). Do
        NOT change any of them, and make sure your new `delete` clause on the parent
        does not alter their inherited behaviour.

    2c. `serviceRequests` (:481-486). Keep `allow create: if true` (public form).
        Keep `read` as is. Gate `update` on
        `callerHasPermission('serviceRequests.convert') ||
         callerHasPermission('serviceRequests.cancel')`, and `delete` on
        `callerHasPermission('serviceRequests.delete')`.
        State in a comment that cancel and convert are both writes to the same
        document and cannot be told apart by a rule — the finer distinction is the
        UI's job (Task 3).

    2d. `staffLogs/{staffId}/actions/{actionId}` (:708-719). Widen the read so it is
        `request.auth.uid == staffId` OR `callerRole() == 'admin'` OR
        `callerHasPermission('staffPerformance.view')`. This makes the existing box
        mean what it says instead of silently failing, while a role without it is
        still limited to its own activity.

    Change NOTHING else in firestore.rules. Do not deploy it.

    ## Task 3 — Wire the UI checks that do not exist

    3a. Customer deletion — find every place a customer can be deleted and gate the
        control on `usePermission('customers.delete')`, following exactly how
        `JobModal.tsx:132` consults `jobs.delete`. Report each file:line you change.

    3b. Service requests — gate the cancel control on
        `usePermission('serviceRequests.cancel')` and the convert-to-job control on
        `usePermission('serviceRequests.convert')`.

    3c. Where a control is hidden or disabled, the user must be able to tell why.
        Follow the pattern the interim gate used in Phase 35A: a disabled control
        with a title explaining who to ask, not a silently vanishing button.

    Do not add permission checks anywhere else. Do not "tidy up" adjacent code.

    ## Task 4 — Take the four out of the Standard user default

    In `roleService.ts`, `DEFAULT_ROLE_PERMISSIONS.standardUser` (:121-138), add to
    the exclusion list: `customers.delete`, `jobs.delete`,
    `serviceRequests.cancel`, `serviceRequests.convert`, `staffPerformance.view`.
    The count drops from 39 to 34.

    Add a comment naming this phase and the reason: these are the capabilities the
    owner decided a technician must be genuinely prevented from using.

    **Then state clearly in the report** that this changes only NEW roles, that the
    existing `roles/staff` document in Firestore still holds its 39, and that the
    owner must untick those five boxes in the Roles screen himself for the change to
    take effect — with the exact box names to untick.

    ## Task 5 — Tests

    Add tests proving the default set changed: `standardUser` no longer contains the
    five named permissions, still contains the ones it should (spot-check
    `jobs.edit`, `customers.edit`, `records.commit`), and totals 34.

    Add component tests for the new UI gates, in the style of
    `JobModalCertificateNumberGenerateControl.test.tsx`: a user without the
    permission sees the control disabled; a user with it sees it enabled. Prove each
    test fails without its gate by temporarily reverting that one gate, showing the
    failure, restoring it, and confirming the diff is unchanged.

    Do NOT modify any existing test.

    You cannot test firestore.rules. Say so plainly rather than implying the rules
    are covered.

    ## Task 6 — Report and hand over

    6a. `npx tsc --noEmit`, `npm test` (before and after, every delta accounted
        for), `npm run build`. All must be clean.
    6b. Write `docs/PHASE_36_RESULT.md` containing: pre-work; Task 1's answer
        verbatim; the full `firestore.rules` diff with one sentence per hunk; every
        UI file:line changed; the defaults diff; the test evidence including the
        revert-and-restore proofs; what could not be tested and why; the exact list
        of boxes the owner must untick; and anything that contradicted this prompt.
    6c. STOP and hand the owner, in this order and explaining why order matters:

            firebase deploy --only firestore:rules
            firebase deploy --only hosting

        Rules first: if the app shipped first it would hide controls the database
        still permits — harmless. The reverse would let the database refuse actions
        the app still offers, which is the bug this whole series began with.
        Rollback: Firebase Console -> Hosting -> release history for the app;
        for rules, redeploy from the previous commit.

    ## Constraints

      - Do NOT modify the `records` block of firestore.rules, and do NOT hoist
        `callerHasPermission`.
      - Do NOT change any rule other than the four named in Task 2.
      - Do NOT remove the public `read` on `customers` or the public `create` on
        `serviceRequests` — the service-request form depends on both.
      - Do NOT touch `package.json`, `package-lock.json`, `src/App.tsx`.
      - Do NOT deploy anything. Task 6c hands the commands over.
      - Do NOT modify existing tests; do NOT add dependencies.
      - Do NOT commit, stash, checkout, revert, or create a branch or worktree.
      - Do NOT wire up any of the other decorative permissions. Out of scope.
      - If a stated fact here turns out to be wrong, STOP and report it. Assume this
        prompt contains an error and find it.

## Done when

The owner can, in his own app:

1. Untick **Customers ▸ delete** for the Standard user, then sign in as that user
   and find the delete control disabled — and, if he reaches past the UI, find the
   database refuses it too. That is the first time a box on that screen has been a
   real lock outside the records module.
2. Re-tick it and find the capability comes back.
3. Confirm an administrator is unaffected throughout.

And `docs/PHASE_36_RESULT.md` states plainly which boxes he must untick on the
existing Standard user role, because the code change alone does not move them.
