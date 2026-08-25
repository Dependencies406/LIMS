# ADR-005: Four-state record lifecycle with template version pinning

Date: 2026-07-30
Status: Accepted

## Context

The draft requirement is only: "After finish calibration user must click on save
button to commit the record information to the database (add the handler in case
of user close the record module unintentionally)."

That leaves undefined: record states, who may edit after saving, how a mistake is
corrected, and what audit trail exists.

More seriously, it leaves **template mutation unaddressed**. Today
`SpreadsheetTemplate.version` exists as a string
(`modules/spreadsheet-templates/types.ts:17`) and `TemplateBuilder.tsx:97` bumps
a numeric `version`, but **no record records which version it was created
under**. Editing a template would therefore silently change the meaning of every
historical record — including closed ones.

This directly conflicts with the retained 1:1 Equipment-Type-to-template
restriction (ADR-003): with a 1:1 constraint and no version pinning, you cannot
run v1 and v2 concurrently, so you cannot revise a template without retroactively
altering closed records.

The codebase shows clear ISO/IEC 17025 intent — statement of conformity,
`uncertaintyEngine.ts`, `technicalReviewerSignature`, `pdfTemplateAuditService.ts`
— so record control and reproducibility are requirements, not nice-to-haves.

## Decision

**Lifecycle:** `Draft` -> `Committed` -> `Reviewed` -> `Approved`, plus
`Superseded`.

- **Draft** — editable, carries no record number (ADR-008).
- **Committed** — explicitly saved. A record number is allocated atomically.
  **Data becomes immutable.**
- **Reviewed** / **Approved** — sign-off states, reusing the
  `DigitalSignature` / `technicalReviewerSignature` patterns already present.
- **Superseded** — a committed-or-later record replaced by a Revision. Retained,
  never deleted, linked to its replacement.

**Corrections never mutate a committed record.** A correction creates a new
**Revision** record that links to the record it supersedes, mirroring the
existing job amendment pattern (`parentJobId` / `amendmentReason` on `Job`).

**Version pinning:** at creation, a record stores the template id **and an
immutable snapshot of that template version**, including its custom functions.
A record is always recomputed against its pinned snapshot, never against the
current template.

This resolves the 1:1 conflict: the template stays 1:1 with the equipment type
for *new* records, while old records remain bound to the version they were
recorded under.

## Consequences

Positive:

- Closed records are reproducible: pinned snapshot plus the deterministic
  interpreter (ADR-001) means a record always recomputes to the same numbers.
- Templates can be revised freely without corrupting history.
- Immutability is enforceable because records are their own documents (ADR-002)
  with their own security rules — it could not be enforced on a subobject of a
  mutable job document.
- Full change history via revision links.

Negative and accepted:

- Storage cost: every record embeds a template snapshot. Mitigation is to store
  snapshots as separate immutable `recorderTemplateVersions` documents and have
  records reference them by `(templateId, version)`, so N records sharing a
  version share one snapshot.
- More UI: state badges, transition actions, permission gating per state, and a
  revision-creation flow.
- The "unintentional close" handler now has a precise meaning — it must preserve
  **Draft** state (local autosave plus recovery prompt), and must never
  auto-commit. Auto-committing would allocate a record number and create an
  immutable quality record from an unfinished calibration.
- Requires deciding who may perform each transition. Not yet specified;
  `PermissionContext` exists but its contents are **[UNVERIFIED]**.

## Resolved: Reviewed and Approved are distinct

Confirmed by the owner 2026-07-30. Both states are retained; the four-state
lifecycle above stands as written.

## Permission model and separation of duties

Decided 2026-07-30 during Phase 5c. Enforced in `firestore.rules`, not only in the
client — the first collection in this project where the rules check granular
permissions rather than just `role == 'admin'`.

### Who may do what

| Transition | Permission | Default holder |
|---|---|---|
| Draft → Committed | `records.commit` | Standard user (technician) |
| Committed → Reviewed | `records.review` | **Admin only** |
| Reviewed → Approved | `records.approve` | **Admin only** |
| Create revision | `records.revise` | Standard user (technician) |

`DEFAULT_ROLE_PERMISSIONS.standardUser` must therefore **exclude
`records.review` and `records.approve`**. It currently excludes `users.*`,
`roles.*`, `equipmentTypes.*`, and `recorderTemplates.*` but not `records.*` — so
every technician presently holds approval authority by default. That was an
omission, not a decision, and is corrected in Phase 5d.

### Separation of duties

Enforced in rules, by uid:

- **reviewer ≠ `createdBy`** — nobody reviews their own recording

Enforcing this required adding `reviewedBy` and `approvedBy` fields, since
`DigitalSignature` carries no uid. That was an application change made as an
authorised exception to Phase 5c's "rules only" scope, mirroring the existing
`committedBy` pattern.

> ### Revisited 2026-08-19 — `approver ≠ reviewer` relaxed
>
> Originally this section also enforced **approver ≠ reviewer** ("nobody approves
> their own review"), which required the "AT LEAST TWO ADMIN ACCOUNTS" caveat that
> used to live here. The owner requested reviewer and approver be allowed to be the
> same person — exactly the revisit condition this ADR named at the time ("relax
> `approver ≠ reviewer`" if the two-admin assumption ever stopped holding).
>
> `approver ≠ reviewer` is removed from `firestore.rules`' Reviewed → Approved
> clause and from `approveBlockedReason` (`calibrationRecordService.ts`). A single
> admin can now complete both Review and Approve on the same record. `reviewer ≠
> createdBy` is unaffected — the record's author still cannot review their own work.

### Missing role documents fail CLOSED

If `roles/{role}` does not exist, the caller has **no permissions** — for every
role, admin included.

Phase 5c originally implemented the opposite: a missing role document granted full
record permissions to `admin` and `staff`, mirroring the client's graceful-degradation
fallback. That inverts the purpose of security rules. Deleting a role document to
*revoke* access would instead have *granted* it.

> ### ⚠ PRE-DEPLOY REQUIREMENT
>
> `roles/admin` and `roles/staff` **must exist in Firestore before these rules are
> deployed.** With fail-closed behaviour and no `roles/admin` document, nobody can
> approve anything, and it cannot be fixed from inside the application — only via the
> Firebase console. Verify in the console first.

## Revisions keep the original's pinned template version

Confirmed by the owner 2026-07-30, resolving an ambiguity surfaced during Phase 5a.

A revision **inherits the superseded record's `templateVersion`** and **starts with
the original's row and environment data pre-filled.** These two are one decision, not
two: they both follow from what a revision actually is.

**Reasoning.** The dominant reason to revise is a data error — a transcription
mistake, a wrong serial number, the wrong item selected. The measurement method did
not change, so the mathematics must not change either. Re-resolving to the current
template version would silently recompute untouched readings with different maths,
and nothing in the record would say that had happened. Pre-filling also matches the
task: the technician is correcting one cell, not re-recording a calibration.

**The exception, and how to handle it.** Sometimes the reason for revising *is* that
the formula was wrong. In that case the correct action is not to re-pin an existing
revision but to publish a corrected template version and record a fresh calibration
against it — because if the method was wrong, the previous result was not merely
mistyped, it was computed incorrectly, and the distinction belongs in the record.

Phase 5a implemented the opposite (re-resolve to current, start empty). This must be
changed at the start of Phase 5b, before any revision exists in real data.

**Superseded by this decision:** nothing. It fills a gap the original ADR left.
