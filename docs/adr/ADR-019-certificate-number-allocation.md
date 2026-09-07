# ADR-019: Allocate certificate numbers on the server; anyone signed in may allocate

Date: 2026-09-03
Status: Accepted — implementation not started

## Context

A person signed in under the built-in **Standard user** role opened a job, pressed
Generate on an item's certificate-number field, and received
`Missing or insufficient permissions.` The role had Certificate Numbers ▸ view and
▸ edit both ticked.

The Phase 34 audit (`docs/PHASE_34_RESULT.md`) established why:

- Allocating a number is a **write** to `certificate_number_configs/{id}` —
  `certificateNumberGeneratorService.ts:132` inside the allocation transaction.
- `firestore.rules:161-165` permits that write only when
  `users/{uid}.role == 'admin'`.
- The Generate control at `JobModal.tsx:3106-3112` (and a second at `:2681-2699`,
  gated only by `formDisabled` → `jobs.edit`) checks **no** `certificateNumbers.*`
  permission at all. The comment at `firestore.rules:155-160` asserting the UI
  gates on `isAdmin` is false.
- More broadly: the Roles screen writes `roles/{id}.permissions`, while most rules
  compare `users/{uid}.role` to the string `'admin'`. Of 59 permission switches,
  4 are enforced end to end, 6 offer actions the database refuses, 12 are advisory
  only, and 37 are wired to nothing.

**The admin-only lock was deliberate, not an oversight.** ADR-008's accepted-risk
section records that record- and certificate-number integrity rests on the client
service behaving correctly rather than on the database, and that certificate
numbers are "slightly narrower" in exposure *because* `certificate_number_configs`
was made admin-write-only in Phase 3.5. ADR-008 names the only real remedy —
server-side allocation in a Cloud Function — and lists the triggers for revisiting:
an assessor asking how integrity is enforced, or a duplicate number observed in
practice.

Simply widening the rule would hand that control back and leave the accepted risk
open and slightly wider.

Owner interview, 2026-09-03, settled the questions below.

## Decisions

**D1 — Taking a certificate number is clerical, not an act of authority.**
It is bookkeeping, like tearing off the next page of a numbered pad. Authority
lives later, at signature of the certificate.

**D2 — Any authenticated user may allocate. No permission switch is added.**
There is no login in the lab that should be excluded. A checkbox that everyone
must have is theatre, and Phase 34 already found 37 switches that do nothing —
this decision deliberately declines to create a 38th. `certificateNumbers.allocate`
is **not** introduced. `certificateNumbers.edit` continues to mean configuration
editing, which stays admin-only.

**D3 — Allocation moves to a callable Cloud Function.**
The client asks the server for the next number; the server performs the counter
transaction with the Admin SDK. Chosen over widening the security rule so that the
answer to *"what prevents two certificates carrying the same number?"* becomes a
demonstration rather than a promise. This closes, for certificate numbers, the
accepted risk recorded in ADR-008.

**D4 — Clients stop writing `certificate_number_configs` for allocation.**
Because the Admin SDK bypasses security rules, the rule can stay admin-only for
configuration edits and no longer needs to admit allocation at all. The
field-set-discrimination rule proposed in `PHASE_34_RESULT.md` §5c is therefore
**not** implemented.

**D5 — Numbering restarts at 001 each calendar year.**
`resetPolicy: 'yearly'`. The year is **stored as a full four-digit number** and
**printed as the last two digits** (`SCS-UMT-26001`) — the split already
implemented at `certificateNumberGeneratorService.ts:45`, and shared by job IDs
(`jobIdService.ts:143`) and customer IDs (`customerIdService.ts:152`). The owner
reports the certificate register has never shown unexpected restarts or repeats.

**D6 — A number taken for a job later cancelled is burned. Gaps are acceptable.**
The register may show an unused number, and that gap must be explainable: the
system records which job consumed each number. Consistent with ADR-008, which
rejected recycling identifiers for record numbers on traceability grounds.

**D7 — Cloud Functions capability is UNVERIFIED and must be proven first.**
`functions/` contains exactly one function, `exportJobsToGoogleDrive` — a v2
callable in `asia-southeast1` using Secret Manager (`functions/src/exportToDrive.ts:154-159`).
Neither it nor `firebase/functions` is referenced anywhere in `src`: **the app has
never called a Cloud Function.** The owner has never successfully run the Drive
backup, so whether functions deploy and run in this project is unproven. Proving
it is the first step of implementation, before any allocation logic is written.

**D8 — The numbering year turns over at Asia/Bangkok midnight, not UTC.**
Added 2026-09-06, after Phase 35C found that moving allocation to the server
silently changed this. `new Date().getFullYear()` reads the host's timezone: the
browser's is Bangkok, Cloud Functions' is UTC. Left alone, an allocation between
00:00 and 07:00 Bangkok time on 1 January would continue the previous year's
series and print the previous two-digit year, while the on-screen preview showed
the new one.

The lab's own clock governs the certificate register, so the year — and the month,
for a monthly reset policy — is computed in `Asia/Bangkok` on both sides. The
owner notes the lab does not work on 1 January, so this is insurance rather than a
live defect; implement it simply and do not build a timezone abstraction around it.

## Consequences

Positive:

- Certificate-number integrity becomes enforceable rather than trusted. A client
  cannot fabricate a number or rewrite the counter, whatever it sends.
- The confusing failure disappears: any technician can allocate.
- No new permission switch, and no weakening of `firestore.rules`.
- Establishes the client→function pattern this app has never had, which is the
  same mechanism ADR-008 identifies as the eventual fix for **record** numbers.

Negative and accepted:

- **Slower than a rules change.** The technician stays blocked until it ships;
  the interim workaround is what happens today — an admin allocates.
- Introduces a runtime dependency on Cloud Functions availability and on the
  Blaze plan. An allocation now fails if the function is cold-failing or the
  region is down, where previously it failed only on permissions.
- One more deployment surface (`firebase deploy --only functions`) in a process
  that currently deploys hosting and rules.
- Does nothing for the other 5 UI_OFFERS_RULE_DENIES permissions, the 12 advisory
  ones, or the 37 dead switches. Those remain open (Phase 36).

## Open questions

- **Do Cloud Functions deploy and run in this project?** (D7.) Unproven.
- **What `currentYear` values are actually in the live documents?** The code has
  only ever written four digits, and the owner reports no anomalies, but the data
  has not been inspected. A two-digit value would make the reset test true on
  every allocation and silently reissue the same number. Worth one read-only
  check; three read-only `firebase-admin` scripts already exist as the pattern
  (`scripts/reportEquipmentTypeNames.ts` and siblings).

## Rejected alternatives

- **Widen the Firestore rule by field set** (`PHASE_34_RESULT.md` §5c). Rejected:
  hands back the Phase 3.5 control, leaves ADR-008's accepted risk open, and rests
  on a fragile `affectedKeys().hasOnly()` guard that cannot be executed as a test
  on the owner's machine (no JRE, so no emulator).
- **Add a `certificateNumbers.allocate` permission.** Rejected under D2 — nobody
  would ever be denied it.
- **Leave admin-only and only fix the UI.** Rejected as a destination, though it
  remains available as an interim: it removes the confusing error without
  unblocking the technician.
- **Recycle burned numbers.** Rejected under D6, following ADR-008.
