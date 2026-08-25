# ADR-008: Allocate the record number on first commit, in a transaction

Date: 2026-07-30
Status: Accepted

## Context

The draft specifies a record number built from one or two fixed parts joined by
`-`, plus a running part `YY001` where `YY` is the last two year digits.

Two problems with the draft scheme:

1. **It duplicates existing capability, more weakly.**
   `CertificateNumberConfig` (`src/types/index.ts:531-548`) already provides
   `prefix`, `separator`, `includeYear`, `numberPadding`, and
   `resetPolicy: 'never' | 'yearly' | 'monthly'`.
2. **`YY001` caps at 999 per year** and offers no monthly reset, both of which
   the existing config already handles via `numberPadding` and `resetPolicy`.

The draft also never says **when** a number is allocated.

Additionally, allocation is **not currently transactional**: `updateConfig` and
`resetNumber` (`certificateNumberConfigService.ts:171-242`) use plain
`updateDoc`, so two concurrent allocations can read the same `currentNumber` and
collide. Whether `certificateNumberGeneratorService` wraps allocation in a
transaction is **[UNVERIFIED]** — it was not read in full during the audit.

## Decision

**Allocate the record number at first commit, inside a Firestore transaction.**

- **Draft** records carry **no** record number.
- On the Draft -> Committed transition, a transaction reads the counter,
  increments it, and writes both the counter and the record's number atomically.
- The number format reuses the existing configuration model (`prefix`,
  `separator`, `includeYear`, `numberPadding`, `resetPolicy`) rather than
  introducing the weaker `YY001` scheme. The draft's "1 or 2 fixed parts" maps
  onto the existing prefix/separator fields.

## Consequences

Positive:

- **No gaps from abandoned drafts.** A technician who opens a record and closes
  it without saving consumes no number — which matters, because an auditor will
  ask about missing numbers in a quality-record sequence.
- **No collisions under concurrency**, unlike the current non-transactional path.
- Reuses a numbering model that already supports padding beyond three digits and
  monthly reset.

Negative and accepted:

- **The technician does not see a record number while recording.** Some labs want
  the number on the working sheet from the start. If that turns out to be a hard
  requirement here, this decision must be revisited — but the fix is a
  human-readable draft identifier, not early allocation of the real number.
- Commit becomes a transaction and can therefore fail under contention. It needs
  retry handling and a clear error state, and it must be idempotent: a retried
  commit must not allocate a second number.

## Related defect to fix alongside

`currentSequence`, `currentYear`, and `yearlyReset` are declared on
`CertificateNumberConfig` and read by
`certificateNumberConfigService.documentToConfig` (`:33-47`) but **never written**
by `configToDocument` (`:53-76`) — the same class of bug as `equipmentType` in
ADR-003. A yearly-reset policy that is read but never persisted cannot function.
This must be fixed for reliable allocation.

## ACCEPTED RISK — the draft-to-committed transition is client-enforced

Recorded 2026-07-30, after reviewing the Phase 5a Firestore rules. Owner accepted
this knowingly.

The `records` rules are strong **after** a record leaves draft: `delete` is denied
outright, and updates are restricted to lifecycle keys only. But the first branch of
the update rule permits any change while the record is still a draft:

```
allow update: if request.auth != null && (
  resource.data.status == 'draft' || ...
);
```

That branch is necessary — commit writes rows, summary, `recordNumber`, and `status`
in a single operation. But it also means a client could set `status` directly to
`'approved'` with a **fabricated `recordNumber`**, never touching the counter. And
`recordNumberCounters` permits any authenticated write, so a counter could be
rewritten directly.

**So record-number integrity rests on the client-side service behaving correctly,
not on the database.**

Security rules cannot close this. A rule cannot verify that a counter was
incremented atomically as part of the same operation. **Only server-side allocation
in a Cloud Function can** — the project has a `functions/` directory on Node 22, so
it is feasible.

**Why accepted for now:** users are laboratory staff on an internal, authenticated
system, not anonymous external users. Every write is attributable.

**Revisit when any of these become true:**

- any external or customer-facing access to the system is added
- an accreditation assessor asks how number integrity is enforced
- a duplicate or out-of-sequence record number is ever observed in practice

The same limitation applies to certificate numbers, though slightly narrower there
since `certificate_number_configs` is now admin-write only (Phase 3.5).

## Rejected alternatives

- **Allocate on record creation** — gives the technician the number immediately,
  but burns numbers on abandoned drafts.
- **Allocate on creation and recycle gaps** — avoids visible gaps, but reissuing
  a previously issued identifier is poor practice for traceability, and a number
  may already have been written on a physical worksheet.
