# Phase 34 — Permission model audit (read-only)

## Model and effort

**Claude Opus 5 · Effort: Maximum**

The joining work is mechanical, but the judgement is not. For each permission the
session must decide what a granted checkbox is *supposed* to let a person do, find
the Firestore path that action actually writes, and compare that against the rule
guarding it. A wrong "WORKS" verdict in this audit becomes a rules change deployed
to a lab that issues real calibration certificates, so the cost of a confident
wrong answer is high and the cost of "I could not determine this" is low.

**Stop the session and report, rather than working around, if:**

- Any anchor fact in Task 1 turns out to be wrong.
- The repository is not on the expected branch, or more than one worktree exists.
- A permission's behaviour cannot be determined from the code without guessing.
  Mark it `UNDETERMINED` with the reason. Do not infer.

## Context for a fresh session

Governing documents to read (reasons given in the read list below):
`CLAUDE.md`, `docs/PHASE_5C_RULES_MANUAL_VERIFICATION.md`.

### What triggered this phase

A person signed in under the built-in **Standard user** role opened a job, pressed
the Generate button on the certificate-number field of an equipment row, and got
`Missing or insufficient permissions.` — the Firestore `permission-denied` error
surfaced through `JobModal`'s catch block. The role had **Certificate Numbers ▸
view** and **▸ edit** both ticked.

### Verified facts (each read directly from the file at the anchor given)

1. `firestore.rules:161-165` — `match /certificate_number_configs/{configId}`:
   `allow read: if request.auth != null;` and
   `allow write: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';`

2. `firestore.rules:155-160` — the comment above that rule asserts: *"The UI gates
   on isAdmin directly (not a granular permission) so it can never offer an action
   this rule will refuse."* **This comment is false** for the JobModal path — see
   fact 5.

3. `src/services/certificateNumberGeneratorService.ts:65-148` —
   `generateCertificateNumber(configId)` opens a `runTransaction` on
   `doc(db, 'certificate_number_configs', configId)` (line 67) and calls
   `transaction.update(configRef, {...})` at **line 132**. Allocating a certificate
   number is therefore a **write to `certificate_number_configs`**, the exact path
   guarded by fact 1. Line 240 `generateCertificateNumberForEquipment(equipmentName)`
   resolves the config by name and delegates to it (line 245).

4. `src/contexts/AuthContext.tsx:96` — `isAdmin` is
   `currentUser?.role?.toLowerCase() === 'admin'`.

5. `src/components/JobModal.tsx` — line 12 imports
   `generateCertificateNumberForEquipment`; lines 129-132 call `usePermission` for
   `jobs.edit`, `jobs.create`, `jobs.generatePdf`, `jobs.delete` — and for nothing
   else. The Generate button at lines 3106-3112 is disabled only by
   `!currentJob || generatingCertificateForRow === index || Boolean(String(eq.certificateNumber ?? '').trim())`
   (line 3109). **There is no admin check and no permission check on this control.**
   A second certificate-number render site exists near lines 2674-2693 —
   *unverified: Claude Code must confirm whether it also exposes a Generate control
   and under what gate, before relying on this.*

6. `src/contexts/PermissionContext.tsx` — the app's permission model:
   `const roleId = currentUser.role` (line 57), then `doc(db, 'roles', roleId)`
   (line 64) and `setPermissions(new Set(data.permissions))` (line 71).
   `can()` (lines 88-91) short-circuits `true` for `isAdmin`, else set membership.
   **`user.role` is overloaded**: it is simultaneously the legacy role string that
   `firestore.rules` compares to `'admin'`, and the document id pointing at
   `roles/{roleId}` where the permission array lives.

7. `src/services/roleService.ts:23-110` — `ALL_PERMISSIONS` contains **59** entries
   across 14 categories. Lines 118-139 — `DEFAULT_ROLE_PERMISSIONS.standardUser`
   is `ALL_PERMISSIONS` minus `users.*` (6), `roles.*` (4), `equipmentTypes.*` (2),
   `recorderTemplates.*` (3), `records.review`, `records.approve`, and
   `settings.jobIdConfig` / `settings.customerIdConfig` / `settings.companyInfo`
   — **20 excluded, 39 granted**. The owner's screenshot of the Standard user role
   reads "39 selected", so that role holds the stock default set unmodified.
   `certificateNumbers.view` and `certificateNumbers.edit` are **in** the default
   standard-user set.

8. `docs/PHASE_5C_RULES_MANUAL_VERIFICATION.md` — `@firebase/rules-unit-testing`
   needs the Firestore emulator, which needs a JRE; the owner's machine has no
   `java` on `PATH` and `JAVA_HOME` is unset. `firebase.json` has no `emulators`
   block. **Firestore rules cannot be executed on this machine.** The existing
   `src/services/__tests__/fakeFirestore.ts` is a permissive in-memory mock that
   does not evaluate `firestore.rules` at all and must not be presented as
   coverage of it.

### The problem this phase exists to fix

The permission checkboxes in the Roles screen and the security rules in
`firestore.rules` are two independent gates that were never reconciled. The
checkboxes are read from `roles/{id}.permissions`; the rules read
`users/{uid}.role` and compare it to the literal string `'admin'`. A rule can
therefore never see a custom role's permissions, so **every collection whose rule
requires `role == 'admin'` is unreachable by any non-admin role regardless of which
boxes are ticked** — and conversely, several collections are wide open to any
authenticated user, with the checkbox being the only thing standing in the way.

The certificate-number denial is one instance. This phase does not fix it. This
phase produces the complete list of instances, so the owner can decide what to fix
and in what order, from evidence rather than from one bug report.

**Decision already taken by the owner, recorded here so the audit can be scored
against it:** a Standard user *should* be able to generate a certificate number on
a job. Allocating the next number is normal lab work; editing a configuration's
prefix, padding, or reset policy is not. The audit must therefore treat
"allocate the next number" and "change the configuration" as two distinct
capabilities and report whether the current permission vocabulary can even express
that distinction.

## Prompt

    Read first:
      - CLAUDE.md — hard rules, especially RULE 1 (never assert what you have not
        verified) and RULE 9 (all markdown goes in docs/)
      - docs/PHASE_34_PROMPT_PERMISSION_MODEL_AUDIT.md — this file
      - firestore.rules — the whole file. This is the primary subject of the audit.
      - storage.rules — Storage has its own rules and its own mismatches; in scope.
      - src/services/roleService.ts lines 20-140 — ALL_PERMISSIONS and the default
        role permission sets. This list is the audit's row set.
      - src/contexts/PermissionContext.tsx — how a permission is resolved at runtime
      - src/contexts/AuthContext.tsx — how isAdmin is derived
      - src/hooks/usePermission.tsx and src/hooks/useSettingsAccess.tsx — the two
        ways components ask about permissions
      - docs/PHASE_5C_RULES_MANUAL_VERIFICATION.md — the existing record of how
        rules get verified on this machine, and why automated rules tests cannot run

    ## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)
        git branch
        git worktree list
        git status
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
          Select-Object ProcessId, CommandLine | Format-List

    Report each FULL path. Confirm nothing runs from LIMS-New-Backup (nested INSIDE
    the project).

    Expected branch: feature/trace-ui. When this prompt was written the repository
    was on that branch, on commit 0305d35, with exactly one worktree, and with
    package.json, package-lock.json and src/App.tsx modified but uncommitted. If
    what you find differs, report the difference and continue — this phase changes
    no source file, so the branch does not affect the audit — but do NOT commit,
    stash, or check out anything.

    Also report, as a single line, the absolute path of the repository you are
    working in (Get-Location). The project root is C:\Users\seela\Desktop\LIMS-New.
    CLAUDE.md line 145 names C:\Users\seela\OneDrive\Desktop\LIMS-New instead —
    that line is stale. Record the discrepancy in the RESULT file; do NOT edit
    CLAUDE.md in this phase. If the path you are in is neither of those, say so
    plainly and STOP.

    ## Task 1 — The gate. Nothing else starts until this passes.

    Verify each of the eight numbered facts in the "Verified facts" section above,
    by opening the file at the anchor given and reading it. For each, report
    CONFIRMED or WRONG with the actual content you found.

    Fact 5 additionally requires you to resolve the flagged unknown: open
    src/components/JobModal.tsx around lines 2660-2700 and report whether that
    render site exposes a certificate-number Generate control, and if so what
    disables it.

    If any fact is WRONG, STOP and report. Do not proceed on a corrected
    understanding without saying so first — this prompt was written from those
    facts and the rest of it may be wrong too.

    ## Task 2 — Map every permission to its UI gate

    For each of the 59 entries in ALL_PERMISSIONS, find every place in src/ where
    that permission string is consulted. Search for the literal string; the two
    consumers are usePermission('<action>') and useSettingsAccess.

    Record for each permission:
      - every call site as file:line
      - what the call site does with the answer (hides a control, disables it,
        blocks a route, filters a list, gates a submit handler)
      - "NO CALL SITE" where the string appears nowhere but roleService.ts

    Do not summarise a category. One row per permission, all 59.

    ## Task 3 — Map every Firestore and Storage path to its rule

    From firestore.rules and storage.rules, list every match block with:
      - the path pattern
      - its line range
      - the condition for read, and the condition for each write verb
      - whether the condition can EVER be satisfied by a user whose
        users/{uid}.role is something other than the literal 'admin'

    Classify each write condition as one of:
      OPEN       — any authenticated user passes
      ADMIN      — requires users/{uid}.role == 'admin'
      OWNER      — requires document ownership
      MIXED      — a combination; state it
      CLOSED     — allow ... : if false

    ## Task 4 — Join, and classify every permission

    For each of the 59 permissions, determine which Firestore/Storage paths the
    gated action actually reads and writes. Trace from the UI call site found in
    Task 2 into the service function it calls, and from there to the collection
    name in the doc()/collection() call. Give the service file:line for each.

    Then assign exactly one verdict per permission:

      WORKS              — the UI gate and the rule agree. Granting the checkbox
                           genuinely enables the action; withholding it and the
                           rule both deny.
      UI_OFFERS_RULE_DENIES
                         — the checkbox (or an ungated control) offers an action
                           the rule will refuse. This is the certificate-number
                           class of bug: the user sees a control, presses it, and
                           gets "Missing or insufficient permissions."
      RULE_OPEN_UI_ONLY  — the rule permits any authenticated user; the checkbox
                           is the ONLY thing preventing the action. Anyone who can
                           reach the Firestore SDK (browser console, a script with
                           the same credentials) bypasses it entirely. Note this
                           is not necessarily a defect — say so where the data is
                           low-risk — but it must be listed, because the owner is
                           entitled to know which of his controls are advisory.
      RULE_ALLOWS_UI_HIDES
                         — the rule would permit it but no UI path exists, or the
                           UI hides it unconditionally. Dead permission.
      NO_CALL_SITE       — the permission is offered in the Roles screen and does
                           nothing anywhere. Ticking or clearing it has no effect.
      UNDETERMINED       — you could not establish this without guessing. Say what
                           you would need in order to determine it.

    ## Task 5 — The certificate-number path, in detail

    Separately from the table, answer these four questions with file:line evidence:

    5a. Every code path that writes to certificate_number_configs. For each, say
        whether it is "allocate the next number" or "change the configuration",
        and what UI control reaches it.

    5b. Does the current permission vocabulary distinguish allocation from
        configuration? certificateNumbers.edit is described in roleService.ts as
        "Create and edit certificate number configurations" — state plainly
        whether any existing permission means "may allocate a number", or whether
        a new one would have to be introduced.

    5c. What would have to change in firestore.rules for a non-admin to allocate a
        number but not edit a configuration — given that both are writes to the
        same document. Write the candidate rule out in full. Firestore rules can
        constrain which fields a write touches
        (request.resource.data.diff(resource.data).affectedKeys()) — the users
        rule at firestore.rules:16-19 already uses that technique in this file, so
        the pattern is established here. State the exact field set an allocation
        writes, taken from certificateNumberGeneratorService.ts:132-141, and note
        any field a legitimate allocation writes conditionally.
        DO NOT EDIT firestore.rules in this phase. Write the candidate rule into
        the RESULT file as a proposal only.

    5d. Whether that candidate rule can be verified on this machine, given fact 8.
        If it cannot be executed, say what manual verification procedure would
        prove it, in the style of docs/PHASE_5C_RULES_MANUAL_VERIFICATION.md.
        Do not claim any rule is verified because it "looks right".

    ## Task 6 — Report

    Write docs/PHASE_34_RESULT.md containing:

      1. The pre-work output verbatim, including the repository path.
      2. Task 1 results: each of the eight facts marked CONFIRMED or WRONG, with
         the content found. Plus the Fact 5 unknown, resolved.
      3. The full 59-row table from Task 4. Columns:
         Permission | Category | UI call sites (file:line) | Firestore/Storage
         path(s) | Rule line range | Rule class | Verdict
      4. A mismatch summary: every permission whose verdict is not WORKS, grouped
         by verdict, each with one plain-English sentence a non-developer can
         read — what a person would see happen, not what the code does.
      5. Task 5's four answers in full.
      6. Test counts before and after (npm test). They must be identical — this
         phase changes no source file. Paste both.
      7. git status output at the end of the session, proving docs/PHASE_34_RESULT.md
         is the only changed file.

    ## Constraints

      - THIS PHASE IS READ-ONLY. The ONLY file you may create or modify is
        docs/PHASE_34_RESULT.md. Not firestore.rules. Not storage.rules. Not any
        file under src/. Not CLAUDE.md. If you believe a fix is obvious and small,
        write it into the RESULT file as a proposal and leave the code alone.
      - Do NOT deploy anything. No firebase deploy, no rules publish, for any
        reason.
      - Do NOT modify existing tests. Do NOT add tests in this phase.
      - Do NOT add dependencies. In particular do not install the Firebase
        emulator or @firebase/rules-unit-testing — fact 8 explains why it cannot
        run here, and an install attempt burns a session.
      - Do NOT re-survey the repository. The read list above and the anchors in
        this prompt are the map. Search for permission strings and collection
        names; do not go exploring.
      - Do NOT write "appears to", "should be fine", or "has everything". Every
        claim carries a file:line or it does not go in the report.
      - Where you cannot determine something, write UNDETERMINED and what you
        would need. An honest gap is worth more here than a plausible sentence.
      - If a stated fact in this prompt turns out to be wrong, STOP and report it.
        Assume this prompt contains an error and find it.

## Done when

The owner can open `docs/PHASE_34_RESULT.md` and:

1. Find the row for `certificateNumbers.edit` and see it marked
   `UI_OFFERS_RULE_DENIES`, with `firestore.rules:161-165` named as the refusing
   rule and `certificateNumberGeneratorService.ts:132` named as the refused write.
2. Read the mismatch summary and see, in plain sentences, every *other* place in
   the system where ticking a permission box does not do what it says — including
   any box that does nothing at all, and any action that is permitted by the rules
   regardless of the box.
3. See that `npm test` reports the same counts before and after, and that
   `git status` shows exactly one changed file.

No code has changed and nothing has been deployed. The next phase decides what to
fix, from this list.
