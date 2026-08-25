# Phase 25 — Environment data loss, and in-app version cleanup

## Model and effort

**Claude Sonnet 5 · Effort: High**

Task 1 is silent data loss on a calibration record — recorded environmental conditions
never reach Firestore. That alone sets the effort level. Task 2 removes the need to hand-
edit Firestore in the Console.

**Do Task 1 first and independently.** It is losing data right now.

---

## Task 1 — Environment readings are never saved

Two separate `environment` states exist and the wrong one is persisted.

`useLiveRecalculation.ts:152` keeps its own:

```js
const [environment, setEnvironment] = useState<RoundEnvironment[]>(initialEnvironment);
```

`EnvironmentBlock` is wired to THAT one (`RecordEntryPage.tsx:647-652` —
`value={liveRecalc.environment}`, `onChange={handleEnvironmentChange}`), so typing a
temperature updates the hook's state.

But `RecordEntryPage` also holds its own `environment` (line 141), set once at load
(line 206) and never updated again — and that is what autosave receives:

```js
const autosave = useDraftAutosave({ rows, environment, ... });   // page copy, stale
```

So autosave writes the environment **as it was when the record opened**. `commitRecord`
then reads whatever was last persisted, so the commit loses it too.

Manual Save Draft (line 332) uses `liveRecalc.environment` and is therefore correct —
which is the discriminator: Save Draft persists, autosave does not.

### The probable second half

`useState(initialEnvironment)` reads its argument only on first render. The page's
`environment` starts as `[]` and the record loads asynchronously, so the hook may
initialise with `[]` and never pick up `record.environment`. I found no sync effect.

**Verify this before fixing.** If confirmed, a saved environment does not display on
reopen either, and both faces share one cause.

---

## Task 2 — In-app cleanup instead of the Firebase Console

The owner has had to delete `recorderTemplateVersions` documents by hand in the Console
to unblock publishing. That should not be the workflow.

Two distinct things, and only one of them is a new capability:

- **Orphaned version snapshots** — `firestore.rules` ALREADY allows admin delete on
  `recorderTemplateVersions` (line 247). Nothing new is needed at the rule level; the app
  simply never exposed it.
- **Records** — `allow delete: if false` stays. ADR-016 D1 chose soft delete
  deliberately, and voiding already exists. Do NOT add record hard-delete in this phase.

### 2a. Fix the real bug: `resetTemplateVersion` only clears `_v1`

It deletes `${id}_v1`, hardcoded, on the assumption that a reset always leaves the counter
at 0 so the next publish targets v1. That assumption fails: a counter can sit at 1 with an
orphaned `_v2` present, publish then targets v2, `allow update: if false` refuses it, and
the admin is stuck in the Console. This happened.

Delete **every** `recorderTemplateVersions` document for the template, not just `_v1`.
Query by `templateId`, delete what comes back, in the same transaction that resets the
counter where possible — and if a query cannot run inside a Firestore transaction, say so
and describe what you did instead.

### 2b. An admin view of a template's published versions

List every version snapshot for a template: version number, published at, published by,
and **how many live records pin it**.

  - Delete is offered ONLY for a version with zero live records pinning it. A version a
    record depends on must not be deletable from the UI — that is the ADR-005 guarantee
    this whole area exists to protect.
  - Show the pinning count next to each version so the admin can see why one is blocked.
  - Confirmation names the version and states that deletion is permanent.
  - Voided records do not count as pinning (ADR-016 D3), consistent with the reset guard.

### 2c. Say what is NOT deletable, and why

If the answer to "can I delete this" is no, the UI should say which records are pinning
it, not just disable a button. The owner went to the Console because the app gave no way
forward and no explanation.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules, especially RULE 2
  - docs/PHASE_25_PROMPT_ENVIRONMENT_LOSS_AND_VERSION_CLEANUP.md — this file
  - docs/adr/ADR-005-record-lifecycle.md — version pinning; why a pinned version is
    never deletable
  - docs/adr/ADR-016-voiding-records.md — D1 (hard delete stays forbidden for RECORDS)
    and its 2026-08-19 addendum, which describes the _v1-only bug from the inside
  - src/modules/recorder/hooks/useLiveRecalculation.ts — line 152, the duplicate state
  - src/pages/RecordEntryPage.tsx — lines 141, 206, 284-289, 327-335, 647-652
  - src/modules/recorder/hooks/useDraftAutosave.ts
  - src/services/recorderTemplateService.ts — resetTemplateVersion, publishTemplate
  - firestore.rules — recorderTemplateVersions, line 242-249

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List

Report each FULL path. `LIMS-New-Backup` exists nested INSIDE the project; confirm no dev
server runs from it, and do not modify it (RULE 2, RULE 6).

## TASK 1 — One source of truth for environment

  - Establish a single owner of `environment`. Either the page owns it and the hook takes
    it as a prop with no local state, or the hook owns it and EVERY consumer — autosave
    included — reads `liveRecalc.environment`. State which you chose and why.
  - Verify and report whether the hook currently fails to pick up a loaded record's
    environment (the `useState(initialEnvironment)` first-render problem). If it does,
    fix it as part of the same change; they are one bug.
  - Do NOT fix this by adding a sync effect that copies between two states. That keeps
    both and adds a race. Remove one.
  - Check `rows` for the same split while you are there and report what you find — the
    page holds `rows` too, and `getLatestRows()` exists precisely because of it.

Tests, and these are the point of the task:

  - Changing the environment, then letting AUTOSAVE fire, persists the new values —
    the direct regression test for the reported loss
  - Manual Save Draft persists them too
  - Committing a record persists the environment that is on screen, not the one loaded
  - Reopening a draft displays its saved environment

## TASK 2 — Version snapshot cleanup, in the app

### 2a
`resetTemplateVersion` must delete EVERY `recorderTemplateVersions` document for the
template, not the hardcoded `_v1`. Report how you handled the query-inside-transaction
limitation.

### 2b
An admin view listing a template's version snapshots with a live-record pin count, and
delete offered only at zero. Voided records do not count (ADR-016 D3).

### 2c
When deletion is refused, name what is pinning it.

## CONSTRAINTS

- Do NOT add hard delete for RECORDS. `allow delete: if false` stays (ADR-016 D1).
  Voiding is the sanctioned path and already exists.
- Do NOT allow deleting a version that any live record pins.
- Do NOT weaken, reorder or bypass Phase 19's guards.
- Do NOT keep two copies of `environment` and sync them.
- Do NOT change the formula engine, evaluator, or any computed value.
- SHOW ME any proposed Firestore rule change before applying it. Task 2 should need
  none — admin delete on recorderTemplateVersions already exists at line 247.
- Do NOT delete anything else. Do NOT touch recorder-reserved/ or LIMS-New-Backup/.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1-4. The Task 1 tests above
  5. resetTemplateVersion deletes ALL version documents for the template, proven with
     a fixture holding v1, v2 and v3
  6. A version with zero live records can be deleted; one with a live record cannot
  7. A voided record does not count as pinning
  8. Publish succeeds immediately after a reset — the end-to-end proof that the
     _v1-only bug is gone
  9. Phase 19's RecordingGrid tests pass UNCHANGED, and the break-and-revert still
     fails the loop tests when guards are disabled

Run npm test and tsc --noEmit. Report both, with before and after counts.

## DEFINITION OF DONE

  1. Pre-work output, branch, and confirmation about LIMS-New-Backup
  2. Which component now owns `environment`, and confirmation only ONE copy exists
  3. Whether the load-side bug was real, and the evidence
  4. What you found about `rows` having the same split — reported, and say whether you
     changed it or left it
  5. How resetTemplateVersion enumerates versions given the transaction limitation
  6. Diff summary per file
  7. Confirmation records are still not hard-deletable
  8. npm test and tsc output
  9. Anything unverified, stated as UNVERIFIED — say plainly whether you saw an
     environment value survive a reload in a browser
```

---

## On deleting records from the app

You already decided this two turns ago and I would not reverse it quietly: ADR-016 D1
chose **soft delete**, and `allow delete: if false` on `records` stays. Voiding gives you
the recycle bin, the audit trail, and restore.

If you now want a genuine purge — permanently removing already-voided records after a
retention period — that was option 2 in the original question and it is a real, separate
decision. Say so and I will amend ADR-016 rather than slipping it in here.

What this phase does remove is the reason you were in the Console in the first place: the
orphaned version snapshots, which were never protected data and which the rules already
let an admin delete.
