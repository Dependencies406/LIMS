# Phase 23 — Record workflow: unit change without reset, sign-off, save draft, version reset

## Model and effort

**Claude Sonnet 5 · Effort: High**

Five items, but three touch the lifecycle that produces calibration certificates —
sign-off identity, the review permission gate, and template version numbers that
committed records pin to. High effort for the consequence profile, not the volume.

---

## Item 1 — Why the grid resets on a unit change, and why it should not

`RecordEntryPage.tsx:534`:

```
key={`${record.id}_${template.version}_${record.status}_${standardOptions.length}_${JSON.stringify(record.columnUnits ?? {})}_${conversionRules.length}`}
```

`columnUnits` is in the React `key`. Change a header unit and React unmounts the whole
component, TREB is destroyed and rebuilt from scratch. That is deliberate — `RecordingGrid`
reads `columnUnits` once at mount by its own documented contract — but it is the wrong
trade now.

**ADR-015 D1 makes the correct fix cheap.** Conversion is display-only: a converted
column's stored value is the RAW value, and the unit affects only the header text and the
rendered number. So a unit change needs no re-read of raw data and no recalculation — it
is a re-render of two things. Nothing about the record changes.

## Item 3 — The review permission error is probably working as designed

`firestore.rules:296-305` gates committed → reviewed on four conditions. Three of them
your payload satisfies. The fourth:

```
request.auth.uid != resource.data.createdBy
```

**Separation of duties (ADR-005): the reviewer may not be the person who created the
draft.** Testing the full lifecycle alone, as one account, will always fail here.

The other candidates, in order: the caller's role document lacks `records.review` (the
rule fails closed, so a missing `roles/{role}` document grants nothing), or
`firestore.rules` has not been deployed — which is the same suspicion raised by the
earlier `certificate_number_configs` permission error and has still not been confirmed.

Either way the UI is at fault for offering a **Confirm** button that the rules will
refuse. That is Task 3's real work.

## Item 5 — Resetting a template version is genuinely dangerous

ADR-005 pins each committed record to a template version, so historical records stay
reproducible. Reusing a version number would silently re-point existing records at
different content. This must be gated on nothing referencing any version, and that check
must be real, not a warning dialog.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules, especially RULE 2
  - docs/PHASE_23_PROMPT_RECORD_WORKFLOW.md — this file, including the three analyses
  - docs/adr/ADR-005-record-lifecycle.md — the four states, separation of duties, and
    template version pinning. Item 5 lives or dies on this.
  - docs/adr/ADR-015-display-time-unit-conversion.md — D1. It is WHY item 1 is cheap.
  - src/pages/RecordEntryPage.tsx — the key at line 534, the sign-off wiring ~line 392
  - src/modules/recorder/components/RecordingGrid.tsx — the mount contract in its file
    header, applyLayout, and the Phase 19 guards
  - src/modules/recorder/components/RecordSignOffModal.tsx — signerName is free text
  - src/services/calibrationRecordService.ts — reviewRecord (~line 770), commitRecord
  - src/modules/recorder/hooks/useDraftAutosave.ts — what already autosaves
  - firestore.rules — the /records/{recordId} block, lines 262-331

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List

Report each FULL path. NOTE: `LIMS-New-Backup` DOES exist, nested INSIDE the project at
`C:\Users\seela\Desktop\LIMS-New\LIMS-New-Backup\` with its own package.json and src/. A
previous session searched only for a SIBLING of LIMS-New and wrongly reported it absent.
Search inside the project. Do not modify, move or delete it (RULE 2, RULE 6) — only
confirm no dev server runs from it.

## TASK 1 — Change a header unit without destroying the grid

Add an imperative `updateHeaders(columnUnits)` to RecordingGridHandle that:

  - Rewrites the column-header row text with the new effective units
  - Re-renders converted columns' DISPLAY values (ADR-015 D8's pipeline)
  - Touches NO raw value, no input cell, no row the technician typed into

Then remove `columnUnits` from the `key` at RecordEntryPage.tsx:534 and call the new
method instead. Update RecordingGrid's file-header contract to say what is now updatable
after mount and what still requires a remount — that comment is the contract, and leaving
it stale is how the next session gets this wrong.

  - The write goes inside Phase 19's `isProgrammaticWriteRef` try/finally.
  - Re-apply Phase 22's role tints and Phase 20's widths if the header rewrite disturbs
    them; verify by test, do not assume.
  - Leave `record.status`, `standardOptions.length` and `conversionRules.length` in the
    key. Those genuinely need a remount; say so in the comment.

Test: type a value into an input cell, change a header unit, and assert the typed value
is still there and unchanged — the regression test for exactly what the owner reported.

## TASK 2 — Signer name from the user directory, not free text

`RecordSignOffModal` takes `signerName` as free text. Replace with a selection sourced
from the application's existing users.

**But read this before designing it.** The Firestore rule requires
`request.resource.data.reviewedBy == request.auth.uid` — you can only sign as YOURSELF.
The enforced identity is the auth uid; the typed name is cosmetic. A dropdown that let
someone pick a different person would print one name on a certificate while recording a
different uid as reviewer. That is an accreditation defect, not a convenience.

So: resolve the SIGNED-IN user's display name from the user directory and present it as
the signer, not editable to an arbitrary other person. If the owner genuinely needs to
sign on behalf of someone else, that is a different feature with its own rule change —
report it, do not build it.

State in your report exactly what a user can and cannot change about the signer name.

## TASK 3 — Stop offering an action the rules will refuse

The Review button is offered, the modal opens, the signature is drawn, and only on
Confirm does Firestore refuse. Fix the order.

  - Hide or disable Review when the signed-in user is the record's `createdBy`
    (separation of duties), with a message saying why — "a record must be reviewed by
    someone other than the person who recorded it"
  - Same for Approve when the user is the record's `reviewedBy`
  - Same when the user's role lacks the matching permission
  - When Firestore refuses anyway, surface a readable message, not a raw FirebaseError.
    A permission-denied here means one of: not deployed rules, missing role permission,
    or separation of duties. Say which are possible rather than printing the exception.

Do NOT weaken firestore.rules to make this pass. The rule is correct; the UI is wrong.

Also report: does the deployed ruleset match `firestore.rules` in this repo? If you
cannot determine that from the repo alone, say so — do not guess, and do not deploy.

## TASK 4 — An explicit Save Draft

Autosave exists (`useDraftAutosave`). Add a visible Save Draft control anyway: the owner
cannot currently tell whether work is safe.

  - Persists through the existing `updateDraftRecord`. Do NOT add a second write path.
  - Show saved state — last-saved time, and a clear indicator while a save is pending.
  - Draft only; not offered once committed.
  - This does not commit and does not change status. Label it so no one expects it to.

## TASK 5 — Reset a template's version number, safely

Admin-only, for templates still under development.

**The guard is the feature.** ADR-005 pins every committed record to a template version.
Reusing a version number would silently re-point existing records at different content —
a certificate whose numbers no longer match the template it claims.

  - Refuse the reset if ANY record references ANY version of this template, in ANY
    status. Query and check; do not warn-and-proceed.
  - Show the count and let the admin see what blocks it.
  - Admin-only, matching how other template-management actions are gated.
  - SHOW ME any proposed Firestore rule change before applying it.

If the check cannot be done reliably client-side, say so and propose the alternative
rather than shipping an unguarded reset.

## CONSTRAINTS

- Do NOT weaken firestore.rules, especially separation of duties.
- Do NOT let a signer name disagree with the recorded auth uid.
- Do NOT allow a version reset when any record references the template.
- Do NOT weaken, reorder or bypass Phase 19's guards.
- Do NOT touch raw cell values in Task 1 — headers and display only (ADR-015 D1).
- Do NOT add a second write path for drafts.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or LIMS-New-Backup/.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. Typed input survives a header-unit change — no remount, value unchanged
  2. Header text and converted display values both update on that change
  3. Role tints and column widths survive the header rewrite
  4. Review is not offered to the record's creator; the reason is shown
  5. Approve is not offered to the reviewer
  6. Neither is offered without the matching role permission
  7. The signer name resolves to the signed-in user and cannot be set to another user
  8. Save Draft persists via updateDraftRecord and reports saved state
  9. Version reset is refused when a record references the template, permitted when none
     does
 10. Every Phase 19 RecordingGrid test passes UNCHANGED, and the break-and-revert still
     fails the loop tests when guards are disabled

Run npm test and tsc --noEmit. Report both, with before and after counts.

## DEFINITION OF DONE

  1. Pre-work — full path of every node process, and confirmation none runs from
     LIMS-New-Backup (which DOES exist, inside the project)
  2. Diff summary per file
  3. The updated RecordingGrid mount contract — what is now updatable in place, what
     still needs a remount
  4. Exactly what a user can and cannot change about the signer name
  5. Whether you could determine if the deployed rules match the repo, and the answer or
     a plain statement that you could not
  6. How the version-reset guard queries for referencing records, and what it does if the
     query fails
  7. Confirmation Phase 19's guards hold, with the break-and-revert result
  8. npm test and tsc output
  9. Anything unverified, stated as UNVERIFIED — this touches sign-off, so say plainly
     whether you exercised review/approve in a browser
```

---

## The one you can settle in a minute

The review failure is most likely **separation of duties working correctly** — you created
the draft, so the rules refuse to let you review it. Testing the full lifecycle needs a
second account with `records.review`.

If a second account also fails, then it is the deployed ruleset, which is now the second
permission error pointing that way and still unconfirmed.
