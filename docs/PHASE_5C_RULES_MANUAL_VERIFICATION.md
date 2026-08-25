# Phase 5c/5d — Manual verification procedure for the `records` rules

> ## ✅ EXECUTED AND PASSED — 2026-08-04
>
> The owner ran this entire procedure against the **published** rules in the
> `scs-lims` project. **Every case matched its expected Allow/Deny result.** All
> scratch documents were cleaned up afterwards.
>
> **The rules are no longer merely "read" — they are verified by execution.** This
> closes the single largest unverified claim across all eight phases.
>
> Two points confirmed with the owner about how the run was performed, because both
> affect whether the result is meaningful:
>
> 1. **Test 8a used a user whose `role` was set to `admin`** for the duration of the
>    test. This matters: `PHASE_5C_WALKTHROUGH_FOR_HUMANS.md` Step 3 assigns TECH the
>    `staff` role, and deleting `roles/admin` has no effect on a `staff` user — run
>    that way, 8a would have returned Allow and tested nothing. The owner spotted the
>    inconsistency and corrected for it, so the fail-closed behaviour introduced in
>    Phase 5d **is** genuinely confirmed. *(That inconsistency in the walkthrough has
>    since been fixed.)*
> 2. **The new rules were published before testing**, so the Playground was
>    evaluating the current rules, not a stale published version.
>
> ### Consequence: the new rules are LIVE
>
> Publishing happened before verification rather than after. Verification passed, so
> this is fine — but the rules are now in force for real users, which makes the
> remaining checks in `PHASE_PROMPTS.md` time-sensitive rather than preparatory:
>
> - Every real user needs an explicit `role` field on their `users/{uid}` document.
>   Under fail-closed rules a missing field denies that person everything, with no
>   visible explanation.
> - `roles/admin` and `roles/staff` must be present and complete. Both were
>   temporarily modified during Group 8 and restored — worth one final confirmation.
> - Any user whose `role` was temporarily changed to `admin` for test 8a must be set
>   back to its original value, or that person now holds admin rights in production.

**Updated for Phase 5d:** the permission check now fails CLOSED (a missing
`roles/{role}` document grants nothing, for every role including admin — see
section 8), and `records.review`/`records.approve` were removed from
`standardUser`'s defaults, so REVIEWER and APPROVER below must now be **admin**
accounts (or a custom role whose `roles/{id}` document explicitly grants
`records.review`/`records.approve`) — a plain technician/staff account no longer
qualifies.

**Why manual, not automated:** `@firebase/rules-unit-testing` needs the Firestore
emulator, which needs a JRE. This machine has no `java` on `PATH` (checked via both
Bash and PowerShell, `JAVA\_HOME` unset) — the emulator cannot run here. The existing
`fakeFirestore.ts` unit tests do **not** exercise `firestore.rules` at all (it's a
permissive in-memory mock), so they cannot substitute for this. The rules below have
only been read, not executed. Do not treat them as verified until you've run this
procedure (or set up the emulator with Java installed).

## Setup

You need at least three real Firebase Auth users, distinct from each other:

* **TECH** — will create/commit the record and raise revisions. Any role that
includes `records.commit`/`records.revise` (built-in `admin` or `staff` both
qualify by default — see `DEFAULT\_ROLE\_PERMISSIONS` in `roleService.ts`).
* **REVIEWER** — a *different* person, holding `records.review`. As of Phase 5d
this means an **admin** account (or a custom role explicitly granted it) —
`standardUser`/`staff` no longer includes it.
* **APPROVER** — a *third*, different person, holding `records.approve` (same
admin-only caveat). Must differ from REVIEWER (`approver != reviewer`) — see
ADR-005's two-admin requirement.

Note their **Firebase Auth UIDs** (Firebase Console → Authentication → Users) — the
rules key off `request.auth.uid`, not email or display name.

Use the **Firestore Rules Playground**: Firebase Console → Firestore Database →
Rules tab → "Rules playground" button (or the simulator panel next to the rules
editor). It runs a single simulated request against the rules **as currently
published** — so publish the new `firestore.rules` first (or paste it into the
playground's rules editor without publishing, if the console version supports that;
otherwise publish to a **non-production** project if you have one, since live scratch
documents are needed for the update cases below).

For each update case you need a real scratch document at the stated path with the
stated fields, because the Playground's "existing document" is whatever is actually
in the database — there's no way to fake `resource.data` without a real doc. Create
each scratch doc directly in the Firestore console (Data tab), run the simulation,
then move to the next case. Delete all scratch docs when done.

\---

## Test matrix

### 1\. Create

|Case|Request|Expected|Why|
|-|-|-|-|
|1a|`create` at `/records/scratch1`, authenticated as TECH, data `{status:'draft'}` (no `recordNumber`)|**Allow**|Unchanged behavior|
|1b|`create` at `/records/scratch1`, authenticated as TECH, data `{status:'committed'}`|**Deny**|Unchanged behavior — can't create pre-committed|
|1c|`create` at `/records/scratch1`, **unauthenticated**|**Deny**|`request.auth != null`|

### 2\. Draft editing (unchanged)

Create scratch doc `/records/rec\_draft` = `{status:'draft', createdBy:'TECH\_UID', rows:\[], environment:\[]}`.

|Case|Request|Expected|Why|
|-|-|-|-|
|2a|`update` `/records/rec\_draft`, as TECH, new data `{...same, rows:\[{a:1}]}` (status stays `'draft'`)|**Allow**|Plain draft editing, no permission gate|
|2b|`update` `/records/rec\_draft`, as **REVIEWER** (someone else's draft), new data with `status` still `'draft'`|**Allow**|Deliberately still open — matches pre-5c behavior; not in this task's scope to restrict|

### 3\. Draft → Committed

Reuse `/records/rec\_draft` (`status:'draft'`, `createdBy:'TECH\_UID'`).

|Case|Request|Expected|Why|
|-|-|-|-|
|3a|`update`, as **TECH** (holds `records.commit`), new data `{status:'committed', recordNumber:'X-001', rows:\[...], summary:{...}, committedAt:<ts>, committedBy:'TECH\_UID'}`|**Allow**|Has permission, correct FROM status|
|3b|`update`, as a **third user with no role doc and role field `'guest'`** (or any role lacking `records.commit`), same payload|**Deny**|`callerHasPermission('records.commit')` false|
|3c|`update` on a doc whose `status` is `'committed'` already, new data `status:'committed'` again (re-submitting)|**Deny**|FROM status doesn't match `'draft'` in the commit branch, and doesn't match the draft-stays-draft branch either|
|3d|`update`, as TECH, new data `status:'reviewed'` directly (skipping committed) on a **draft** doc|**Deny**|No branch allows `draft -> reviewed`|

### 4\. Committed → Reviewed

Create scratch doc `/records/rec\_committed` = `{status:'committed', createdBy:'TECH\_UID', recordNumber:'X-001', rows:\[], summary:{}}`.

|Case|Request|Expected|Why|
|-|-|-|-|
|4a|`update`, as **REVIEWER** (holds `records.review`, is not `createdBy`), new data changing only `{status:'reviewed', reviewedAt:<ts>, reviewedBy:'REVIEWER\_UID', reviewerSignature:{...}}`|**Allow**|Permission + correct FROM status + signer is caller + not self-review|
|4b|Same, but `reviewedBy:'SOMEONE\_ELSES\_UID'` (not the caller's own uid) while authenticated as REVIEWER|**Deny**|`request.resource.data.reviewedBy == request.auth.uid` fails — this is the forged-signature case|
|4c|Same as 4a, but authenticated as **TECH** (`request.auth.uid == resource.data.createdBy`)|**Deny**|Separation of duties: reviewer != createdBy|
|4d|Same as 4a, but the new data *also* changes an unrelated field, e.g. `rows`|**Deny**|Field allowlist — only the 4 listed keys may change|
|4e|Same request shape but on a doc whose `status` is `'draft'`|**Deny**|FROM status must be `'committed'`|

### 5\. Reviewed → Approved

Create scratch doc `/records/rec\_reviewed` = `{status:'reviewed', createdBy:'TECH\_UID', reviewedBy:'REVIEWER\_UID', recordNumber:'X-001'}`.

|Case|Request|Expected|Why|
|-|-|-|-|
|5a|`update`, as a **third user APPROVER** (holds `records.approve`, is not `reviewedBy`), new data `{status:'approved', approvedAt:<ts>, approvedBy:'APPROVER\_UID', approverSignature:{...}}`|**Allow**|All conditions satisfied|
|5b|Same, but authenticated as **REVIEWER** (`request.auth.uid == resource.data.reviewedBy`)|**Deny**|Separation of duties: approver != reviewer|
|5c|Same as 5a but `approvedBy` set to a uid other than the caller's|**Deny**|Forged-signature check|

### 6\. Supersession (createRevision)

Create scratch doc `/records/rec\_to\_supersede` = `{status:'committed', createdBy:'TECH\_UID'}`.

|Case|Request|Expected|Why|
|-|-|-|-|
|6a|`update`, as a user holding `records.revise`, new data changing only `{status:'superseded', supersededBy:'some-new-record-id'}`|**Allow**||
|6b|Same, as a user **without** `records.revise`|**Deny**||
|6c|Same shape, but on a doc whose current `status` is already `'superseded'`|**Deny**|Can't re-supersede|
|6d|Same shape, but on a **draft** doc|**Deny**|Not in the FROM set `\['committed','reviewed','approved']`|

### 7\. Delete (unchanged)

|Case|Request|Expected|
|-|-|-|
|7a|`delete` on any `/records/{id}`, as any authenticated user (including admin)|**Deny**|

### 8\. Fail-closed: missing or under-permissioned role document (Phase 5d)

This is the section that actually verifies the Phase 5d change. Case 3b already
exercises part of this (a role with no matching permission); these cases isolate
the "document doesn't exist at all" and "exists but incomplete" scenarios
specifically, including for `admin` — the case that changed behavior.

Reuse `/records/rec\_draft` (`status:'draft'`, `createdBy:'TECH\_UID'`) for 8a/8b, and
`/records/rec\_committed` (`status:'committed'`, `createdBy:'TECH\_UID'`) for 8c/8d.

|Case|Request|Expected|Why|
|-|-|-|-|
|8a|**Temporarily rename or delete `roles/admin`** in the console. `update` `/records/rec\_draft`, as TECH (`users/TECH\_UID.role == 'admin'`), new data `status:'committed'` (+ required fields)|**Deny**|`exists(roles/admin)` is false → `callerHasPermission` returns false unconditionally, even though the caller's `role` field says `'admin'`. This is the exact behavior Phase 5d exists to produce — restore `roles/admin` immediately after this test|
|8b|With `roles/admin` restored, **temporarily edit its `permissions` array to remove `'records.commit'`**. Same request as 8a|**Deny**|Document exists, but the specific action isn't in its array — restore the full array after|
|8c|Authenticate as a user whose `users/{uid}.role` is a **custom role id with no `roles/{id}` document at all** (e.g. a typo'd or deleted custom role). `update` `/records/rec\_committed`, new data `status:'reviewed'` (+ required fields)|**Deny**|Same as 8a, for a non-built-in role — confirms there is no special-case fallback for `admin`/`staff` anymore|
|8d|(Contrast case, sanity check) `roles/admin` exists and its `permissions` includes `'records.commit'`. Same request as 8a|**Allow**|Confirms the fail-closed change didn't also break the legitimate path|

**Do not leave `roles/admin` modified or deleted after this section** — restore its
original `permissions` array (or recreate the document) before moving on, and before
any real use of the app. Per ADR-005's pre-deploy requirement, `roles/admin` and
`roles/staff` must exist in Firestore, complete, before these rules are ever
published for real.

\---

## Cleanup

Delete every `/records/rec\_\*` and `/records/scratch1` scratch document created above.

## What this procedure does NOT cover (explicitly out of scope, per ADR-008)

It does not verify that `recordNumber` was allocated from an incremented counter, or
that `rows`/`summary` reflect a real evaluation — the rules do not check either, by
design (see the "NOT protected by this rule" comment in `firestore.rules`). A holder
of `records.commit` can still write an arbitrary `recordNumber`/`rows`/`summary` in
the same request that flips status to `'committed'`. Closing that needs a Cloud
Function, out of scope for this task.

