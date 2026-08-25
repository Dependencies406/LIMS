# ADR-016: Voiding records — soft delete, and what it releases

Date: 2026-08-19
Status: Accepted

**Amends [ADR-005](ADR-005-record-lifecycle.md)** — adds `voided` as a terminal state
alongside `superseded`, and changes `records` from never-deletable to
never-*hard*-deletable.

## Context

`firestore.rules` currently says:

```
allow delete: if false;   // Delete: never — records are permanent quality records.
```

That is right for records that back an issued certificate, and wrong for the reality of
building the system: 18 test records now block a template version reset, and there is no
sanctioned way to clear them.

Two things were confused in the request and are worth separating permanently:

- **Publishing a new version** (v1 → v2) is never blocked and never was. Existing records
  keep their pinned version and stay reproducible. This is the normal path for "the
  template changed."
- **Resetting the version counter** is blocked, because republishing would overwrite the
  `recorderTemplateVersions` snapshot existing records pin to.

Also noted: **committing a draft binds it harder, not looser.** A committed record has an
allocated record number (ADR-008) and frozen standard and conversion snapshots. Drafts are
the only cheap ones to remove.

`createRevision` already handles the legitimate "this record is wrong, do it again" case
by superseding. This ADR is for the different case: records that should never have existed.

## Decisions

### D1 — Void is a soft delete; hard delete stays forbidden

A voided record keeps its document. It gains `voidedAt`, `voidedBy` and a mandatory
`voidReason`, and is excluded from every default query and listing.

`allow delete: if false` **stays**. This is the same pattern the codebase already uses for
reference standards and conversion equations: deactivate, never delete. Deleting Firestore
data is irreversible; hiding it costs nothing.

### D2 — Voiding is admin-only, at any status, and requires a reason

One gated action, one rule, defensible to an assessor. The reason is not optional — a
voided record with no explanation is worse than no record, because it looks like data loss.

Voiding an **approved** record is permitted but is an accreditation event: the UI must say
so plainly and name `createRevision` as the usual alternative. The software does not
prevent it; the metrologist decides, and the audit trail records who and why.

### D3 — Voided records stop blocking a template version reset

The Phase 23 guard counts live records only. Voiding the 18 test records therefore lets
the reset through.

This is the decision that makes the feature useful, and the one that carries risk:
**voiding is now the lever that unlocks version reuse.** The reset guard's message must
say so, so nobody voids records to work around a block without understanding they are
also releasing a pinned version.

### D4 — Voiding frees the item for a new record

`resolveRecordForItem` looks for the non-superseded record on an item. A voided record is
excluded from that search, so the item becomes available for a fresh record — which is the
"re-assign a new record to the same item" case.

`createRevision`/`superseded` remains the correct path when the original work was real.
Void is for records that should not exist at all.

### D5 — Restore is a first-class action, not an afterthought

An admin can restore a voided record to the status it held before voiding. Store the prior
status; do not infer it. A recycle bin you cannot restore from is just a slower delete.

Restoring a record re-blocks any version reset it was blocking. That is correct and must
not be silently swallowed.

## Consequences

Positive:

- Test and junk records can be cleared without touching real ones
- Version reset becomes reachable after a deliberate, audited action
- Items can be freed for re-recording
- No Firestore data is ever destroyed; `allow delete: if false` still holds

Negative and accepted:

- Voiding now has a second, non-obvious effect (releasing a pinned version). Mitigated by
  naming it in the UI at both ends.
- Voided records accumulate. Acceptable — an unused document costs nothing, and the same
  reasoning already applies to deactivated standards.
- Every query that lists records must now exclude voided ones. A missed one leaks voided
  records back into a listing, which is a visible bug rather than a silent wrong number.

### Addendum 2026-08-19 — D3's other half: the version slot itself

Voiding the blocking records makes `resetTemplateVersion` succeed, but that only resets the
template's version *counter*. It doesn't touch the already-published
`recorderTemplateVersions/{id}_v1` document from the prior publish cycle — and that collection
is immutable by rule (`allow update: if false`, ADR-005: "a published version can never change
out from under a record that pins it"). The very next publish always re-targets v1, so its
write is evaluated as an UPDATE and gets refused, permanently, discovered live when an admin
actually tried to republish after a reset for the first time.

Fixed by having `resetTemplateVersion` delete the old `_v1` snapshot itself, in the same
transaction that resets the counter — `firestore.rules` now allows admin-only delete on that
collection for exactly this. Accepted trade-off: a voided record that still pointed at that
snapshot loses the friendly template-name lookup on the Voided Records page (falls back to the
raw templateId) — its own void trail (`voidedAt`/`voidedBy`/`voidReason`/`statusBeforeVoid`)
is untouched, since none of that lives on the version document. See
`recorderTemplateService.resetTemplateVersion`'s doc comment for the full mechanics.
