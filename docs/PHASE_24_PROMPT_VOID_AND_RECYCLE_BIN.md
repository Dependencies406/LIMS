# Phase 24 — Voiding records, the recycle bin, and freeing an item

## Model and effort

**Claude Sonnet 5 · Effort: High**

ADR-016 settles every design question, so this is not exploratory. High effort because it
changes a Firestore rule that currently reads "records are permanent quality records," and
because a missed query filter leaks voided records back into a listing.

---

## Prompt

```
Read first, in order:
  - CLAUDE.md — hard rules, especially RULE 2
  - docs/adr/ADR-016-voiding-records.md — THE SPEC. D3 is the one with teeth.
  - docs/adr/ADR-005-record-lifecycle.md — the four states, superseded, version pinning
  - docs/adr/ADR-008-record-number-allocation.md — why a committed record binds harder
  - firestore.rules — the /records/{recordId} block, lines 262-331, especially
    `allow delete: if false` at 330
  - src/services/calibrationRecordService.ts — resolveRecordForItem,
    getRecordCountByTemplateId (Phase 23), createRevision
  - src/services/recorderTemplateService.ts — resetTemplateVersion

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List

Report each FULL path. `LIMS-New-Backup` exists nested INSIDE the project — confirm no dev
server runs from it. Do not modify, move or delete it (RULE 2, RULE 6).

## TASK 1 — The void state

Add `voided` alongside the existing statuses, with `voidedAt`, `voidedBy`, `voidReason`
(mandatory, non-empty) and `statusBeforeVoid`.

  - Store `statusBeforeVoid` explicitly. Do NOT infer it on restore (ADR-016 D5).
  - `allow delete: if false` STAYS. This is a soft delete. Nothing is ever removed.
  - Firestore rule for the transition: admin-only, any prior status, and
    `affectedKeys().hasOnly([...])` restricted to the void fields exactly as the existing
    review/approve transitions do. Follow that pattern; do not invent a looser one.
  - Restore: admin-only, back to `statusBeforeVoid`, same field restriction.

**SHOW ME the proposed rule changes before applying them.** This is the rule that says
records are permanent; changing it deserves to be read first.

## TASK 2 — Exclude voided records EVERYWHERE — this is the risky part

Every query, listing, count and resolver that returns records must exclude voided ones by
default. A missed one puts a voided record back in front of a user.

  - Find them by grepping for the records collection, not from memory. List every call
    site you found in your report.
  - Prefer ONE shared helper that applies the filter, so a future query cannot forget.
    If Firestore's query constraints make that impractical, say why and show how you
    covered each site instead.
  - `resolveRecordForItem` must skip voided records, which is what frees the item for a
    new one (ADR-016 D4).
  - `getRecordCountByTemplateId` must count LIVE records only (ADR-016 D3).

Add a test asserting a voided record does not appear in each listing you changed.

## TASK 3 — Void and restore, admin-only, with a reason

  - Admin-only, gated the same way other admin actions in this codebase are.
  - The reason is mandatory. An empty or whitespace reason is rejected client-side AND by
    the rule's field check where possible.
  - Confirmation must state what will happen, including — for a committed-or-later record
    — that a record number was already allocated and will not be reused.
  - **Voiding an APPROVED record is permitted but must warn plainly** that an approved
    record backs an issued certificate, and name `createRevision` as the usual
    alternative (ADR-016 D2). Warn; do not block. The metrologist decides.
  - Restore returns the record to `statusBeforeVoid` and must re-block anything the record
    was blocking.

## TASK 4 — The recycle bin

An admin view listing voided records: record number if any, job, item, template, prior
status, who voided it, when, and the reason.

  - Restore from here.
  - Filter or search by template, because "which voided records were blocking this
    template" is the question that brings someone here.
  - No hard-delete control. There is none, by design (ADR-016 D1) — do not add one, and do
    not leave a disabled button implying one is coming.

## TASK 5 — Say what voiding releases, at BOTH ends

ADR-016 D3 makes voiding the lever that unlocks version reuse. That must not be a surprise.

  - When a version reset is refused, the message must say how many LIVE records block it,
    and that voiding records is what would release it.
  - When voiding a record, if it is the last live record pinning a template version, say
    so — the admin is about to unlock a reset, possibly without realising.

This pairing is the whole safety story for D3. Neither half alone is enough.

## TASK 6 — User creation: real errors, and the orphan case

Reported error, creating a second account so the review workflow can be tested:

```
FirebaseError: Firebase: Error (auth/email-already-in-use)
Error saving user: Error: This email address is already in use
```

Three separate things to check. Report findings for each before fixing.

### 6a. The error reaches the console, not the user

`auth/email-already-in-use` is a normal, expected outcome — someone typed an email that
already exists. It should appear as a field-level message on the email input, not a red
console trace. Map the common Firebase Auth codes to plain language:
`email-already-in-use`, `invalid-email`, `weak-password`, `network-request-failed`. Any
unmapped code shows a generic message plus the raw code, never a stack trace.

### 6b. THE LIKELY REAL BUG — an Auth user with no Firestore document

Creating a user is two writes: a Firebase Auth account, then a `users/{uid}` document.
If the Auth call succeeds and the Firestore write then fails — which is entirely plausible
here, since this project has been hitting permission-denied — you get an **orphaned Auth
account**: it can sign in, but has no role document.

`firestore.rules`'s `callerHasPermission()` fails CLOSED on a missing role document, by
deliberate design (ADR-005, Phase 5d). So an orphaned user can log in and then be refused
every single permission-gated action, with no obvious cause.

**This may already be the cause of the reported review failure.** Check it first.

  - Determine whether the create flow can leave an Auth account without a `users/{uid}`
    document, and report the exact code path.
  - Handle the orphan case: when creation fails with `email-already-in-use`, check whether
    a `users` document exists for that email. If it does not, this is a half-created
    account — say so plainly and offer to complete it by writing the missing document,
    rather than reporting "email already in use" and leaving the user stuck forever.
  - The order matters too: report whether the Firestore write is attempted before or after
    the Auth account is created, and whether reversing it would reduce the orphan window.
    Do not restructure it without saying what you changed and why.

### 6c. Does creating a user sign the admin out?

`createUserWithEmailAndPassword` on the client **replaces the current auth session** — the
admin becomes the newly created user. Check whether this codebase hits that, and report
what happens to the admin's session after a successful create.

If it does, say so and describe the fix (a secondary Firebase app instance, or a Cloud
Function) but do NOT build a Cloud Function in this phase. Report and stop.

### Out of scope for 6

Do not add self-registration, password reset, or email verification. Do not change role
assignment. This task is error handling plus the orphan case only.

## CONSTRAINTS

- Do NOT enable hard delete. `allow delete: if false` stays.
- Do NOT weaken `callerHasPermission`'s fail-closed behaviour to work around an orphaned
  user. Fix the orphan, not the guard.
- Do NOT build a Cloud Function in this phase (6c is report-only).
- Do NOT allow voiding without a non-empty reason.
- Do NOT infer statusBeforeVoid on restore — store it.
- Do NOT weaken the review/approve separation-of-duties rules while editing this block.
- Do NOT change the formula engine, evaluator, snapshots, or any computed value.
- Do NOT weaken, reorder or bypass Phase 19's guards if you touch the grid.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or LIMS-New-Backup/.
- SHOW ME proposed Firestore rules before applying them.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. Voiding requires admin and a non-empty reason; both rejections tested
  2. A voided record is excluded from EVERY listing you changed — one assertion per site
  3. resolveRecordForItem ignores voided records, so the item accepts a new record
  4. getRecordCountByTemplateId counts live records only
  5. Voiding the last live record makes a previously-refused version reset succeed
  6. Restore returns the exact prior status, and re-blocks the reset
  7. A voided record is never hard-deleted — the document still exists
  8. Voiding an approved record warns but is permitted
  9. Separation-of-duties rules for review/approve still behave exactly as before
 10. `email-already-in-use` renders as a field-level message, not a thrown console error
 11. An email present in Auth with NO `users` document is reported as half-created, and
     completing it writes the missing document rather than dead-ending the admin

Run npm test and tsc --noEmit. Report both, with before and after counts.

## DEFINITION OF DONE

  1. Pre-work output, branch, and confirmation no server runs from LIMS-New-Backup
  2. The proposed Firestore rule diff, shown BEFORE it was applied
  3. Every record-returning call site you found, and how each excludes voided records
  4. Diff summary per file
  5. Confirmation `allow delete: if false` is unchanged
  6. The exact wording of both D3 messages — the refused-reset message and the
     last-live-record warning
  7. npm test and tsc output
  8. TASK 6 findings, each answered separately:
     a. which Auth error codes you mapped, and what an unmapped one shows
     b. whether the create flow CAN orphan an Auth account, the exact code path, and
        whether this could explain the project's existing permission-denied failures
     c. whether creating a user replaces the admin's session — report only, do not fix
  9. Anything unverified, stated as UNVERIFIED — say plainly whether you exercised void
     and restore in a browser
```

---

## What to do with your 18 records once this lands

Void them, then the reset will go through. But check the list first — if any is a real
calibration rather than test data, `createRevision` is the right tool for it instead, and
voiding real work to unblock a version number would be the wrong trade.

## And the thing you may not need at all

If what you actually want is "the template changed, record new calibrations against the new
one," **just publish a new version.** That has never been blocked, existing records keep
their pinned version, and nothing needs voiding. The reset only matters if you want the
numbering itself to start over.
