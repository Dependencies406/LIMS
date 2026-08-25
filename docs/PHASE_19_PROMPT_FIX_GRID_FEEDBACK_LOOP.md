# Phase 19 — Fix the recording-grid write/event feedback loop

## Model and effort

**Claude Opus 5 · Effort: High**

Opus because the failure is a hang with unsaved work in the grid, and because the fix
turns on **event timing inside TREB** — whether `document-change` fires synchronously
from `SetRange` or on a later tick. A synchronous-only guard that looks correct will
silently fail if the event is async, and the symptom returns intermittently.

## The loop, located by reading — confirm before fixing

`RecordingGrid.tsx` has an unguarded cycle:

1. `updateComputedValues` writes formula columns — `sheet.SetRange(...)` at **line 435**,
   per-cell `sheet.ApplyStyle(...)` at **line 428**, and the standard-column re-sync
   `SetRange` at **line 455**.
2. The `document-change` subscription at **lines 351-368** has **no suppression flag, no
   equality check, and no debounce**. It unconditionally reads the range, extracts rows,
   and calls `onRowsChangeRef.current?.(nextRows)`.
3. The parent recalculates and calls `updateComputedValues` again.
4. Back to 1.

Each cycle allocates a fresh range read, a `normalizeRangeValues` array, and new row
objects — which is the climbing RAM.

**The existing mitigation is one level too shallow.** The comment at lines 441-445 says
the standard-column write happens outside the subscription "to avoid feeding a
programmatic write back into that same subscription." That prevents writing *synchronously
inside the handler*. It does not prevent the parent's callback — invoked from the handler —
from writing and re-triggering the event.

Phase 13 flagged exactly this and could not test it:

> Whether TREB's own `document-change` re-fires from a programmatic `SetRange` … I found
> evidence this is plausible … flagged rather than silently assumed fine.

### Why it appears only now

The loop needs all three, and a real record is the first time they have coexisted:

- `!isReadOnly` — the subscription is skipped entirely for committed records
- `rowCount > 0` — 5 rows
- at least one `formula` column — 3

Until the `equipmentTypeId` fix, no record reached grid mount at all. This is old code
that has never run against real data.

### Why ruling out ADR-015 conversion did not help

The loop is in the write path itself. `SetRange` at line 435 runs for **every** formula
column regardless of `conversionEnabled` — conversion only changes *what* is written, not
*that* a write happens. So `conversionEnabled: false` on all three columns changes nothing.

Note also that mount itself is safe: `applyLayout` (line 347) writes **before** `Subscribe`
(line 351). The first trigger is the parent's initial recalculation.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules
  - docs/PHASE_19_PROMPT_FIX_GRID_FEEDBACK_LOOP.md — the analysis above
  - src/modules/recorder/components/RecordingGrid.tsx — ALL of it. Lines 317-384
    (mount + Subscribe) and 386-461 (updateComputedValues) are the loop.
  - src/modules/recorder/hooks/useLiveRecalculation.ts — the other half of the cycle
  - src/pages/RecordEntryPage.tsx — the effect at ~line 207 that fires a recalculation
    on reportUnit change, and whatever triggers the initial one
  - docs/adr/ADR-007-template-system-strategy.md — the CORRECTION block. TREB has no
    per-cell change event; document-change carries no address. That constraint is why
    this component re-reads the whole range on every event.

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Verify any dev server points at THIS directory. Pre-existing uncommitted work on this
branch is NOT yours. recorder-reserved/ is an archive. STOP and ask if anything differs.

## TASK 1 — PROVE THE LOOP BEFORE CHANGING ANYTHING

Do not fix first. A fix applied to an unconfirmed diagnosis is how this project's worst
mistakes happened (CLAUDE.md RULE 1).

  - Add temporary instrumentation: a counter in the document-change handler and another
    in updateComputedValues, logging each entry with a timestamp.
  - Open the affected Draft record and capture the counts.
  - REPORT the numbers. If the two counters climb together without bound, the diagnosis
    holds. If they do not, STOP — the analysis above is wrong and the real cause is
    elsewhere. Say so rather than fixing what I described.

Also answer, from TREB's own source rather than inference — this determines the fix:

  **Does `SetRange` publish `document-change` synchronously, or on a later tick?**

Phase 13 established SetRange goes through the command pipeline that publishes the event.
What is not established is the TIMING. Read it and say which.

## TASK 2 — Fix it, with a guard that survives EITHER timing answer

Implement BOTH. Neither alone is sufficient, and the reason is the point of this task:

  a. **A re-entrancy flag.** Set it around every programmatic write in
     `updateComputedValues` and `addRow`, clear it in a `finally`, and have the
     subscription return early while it is set. This catches SYNCHRONOUS re-entry.

  b. **An equality guard.** Keep the last rows emitted to `onRowsChange` and skip the
     call when the freshly extracted rows are deep-equal. This catches ASYNC re-entry,
     which the flag cannot — by the time a deferred event fires, the `finally` has
     already cleared it — and it also stops any idempotent cycle from spinning.

If Task 1 proves the event is synchronous, (b) is still required: it is the guard that
holds if TREB's timing ever changes, and it is cheap.

Do NOT "fix" this by removing the subscription, by removing the write-back, or by
debouncing with a timeout. A debounce slows the loop; it does not end it, and it makes
the bug intermittent rather than absent.

Do NOT reach into TREB internals (ADR-007's correction). Public API only.

## TASK 3 — Check the ApplyStyle loop while you are here

Line 428 calls `ApplyStyle` once PER CELL, inside the per-column loop — 5 rows x 3
formula columns is 15 calls per update, each potentially publishing its own event.

Determine whether ApplyStyle also publishes document-change. If it does, it is a second
loop source and must be inside the same guard. Either way, report whether these can be
batched into one call per contiguous style run, but do NOT restructure the styling logic
in this phase beyond what the guard requires — correctness first.

## CONSTRAINTS

- Do NOT change the formula engine, evaluator, validator, adapter, composite key format,
  snapshot behaviour, or any ADR-015 conversion logic. The loop is in the grid's write/
  event plumbing, not in anything that computes.
- Do NOT change what `extractInputRows` returns or how standard keys/labels translate.
- Do NOT remove the standard-column re-sync — it is what keeps a rejected paste from
  sitting visibly in a cell.
- Do NOT leave the Task 1 instrumentation in the shipped code.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing work.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. A simulated document-change caused by a programmatic write does NOT call
     onRowsChange — the regression test for this exact bug
  2. A document-change caused by a genuine USER edit DOES call onRowsChange. The guard
     must not deafen the grid; prove both directions.
  3. Deep-equal extracted rows do not re-emit; changed rows do
  4. The guard clears correctly when a write throws — inject a throwing SetRange and
     confirm the subscription still works afterwards
  5. addRow is covered by the same guard
  6. Existing RecordingGrid tests still pass UNMODIFIED — if one must change, say which
     and why

Run npm test and tsc --noEmit. Report both, with before and after counts.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. TASK 1 EVIDENCE — the instrumented counts, and whether they confirm the loop. If
     they do not, stop there and report.
  3. Whether SetRange publishes document-change synchronously or asynchronously, from
     TREB's source, with the file/line you read
  4. Whether ApplyStyle also publishes it
  5. Diff summary per file
  6. Confirmation BOTH guards are in place, and the specific re-entry each one catches
  7. Confirmation a real user edit still propagates — this is the way a bad fix here
     fails, and it fails silently
  8. Confirmation the instrumentation was removed
  9. npm test and tsc output
 10. Anything unverified, stated as UNVERIFIED — say plainly whether you opened the
     affected record in a browser and confirmed the freeze is gone
```

---

## The way a fix here goes wrong

The dangerous failure is not the loop coming back — that is loud. It is a guard that is
slightly too broad, swallowing genuine user edits. The grid would look fine, accept
typing, and silently stop persisting it, and nothing on screen would say so.

Test 2 is therefore not optional, and neither is item 7 in the Definition of Done.
