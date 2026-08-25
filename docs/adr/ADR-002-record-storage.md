# ADR-002: Records live in their own top-level collection

Date: 2026-07-30
Status: Accepted

## Context

Recorded data is currently embedded inline in the job document:

```ts
// src/types/index.ts:196-208
export interface Job { ...; equipment: Equipment[]; }

// src/types/index.ts:100-120
export interface Equipment { ...; id?: string; spreadsheetData?: EquipmentSpreadsheetData; }

// src/types/index.ts:87-98
export interface EquipmentSpreadsheetData {
  hotData?: unknown[][];
  formulaResults?: Record<string, unknown>;
  [key: string]: unknown;
}
```

Three problems for this module:

1. **Firestore's 1 MiB per-document limit.** Every item's recorded data shares
   one document with the job. A record is rows (calibration points) x columns
   (including one per round) x N items per job. This will hit the ceiling.
2. **Write contention.** Realtime recalculation with autosave rewrites the
   *entire job document* on every change. Two technicians recording two
   different items on the same job would overwrite each other.
3. **No stable item identity.** `Equipment.id` is optional, so there is nothing
   dependable to bind a record to. The workflow requirement "verify if item
   already bounded to record or not" cannot be implemented reliably.

## Decision

Records live in a **top-level `records` collection**, keyed by their own id, each
holding `jobId` and `itemId` references.

`Equipment.id` becomes **required and stably assigned** at item creation.

## Consequences

Positive:

- Removes the size ceiling — each record has its own 1 MiB budget.
- Removes write contention; per-record autosave touches only that record.
- Enables cross-job queries the lab actually needs: "all records awaiting
  review", "all records by this technician", "all records for this equipment
  type".
- Records get their own Firestore security rules and their own audit trail,
  independent of job-edit permissions. Given that committed records must be
  immutable (ADR-005), this separation is necessary — immutability cannot be
  enforced on a subobject of a mutable job document.

Negative and accepted:

- Reading a job's items plus their record status requires a second query. A
  lightweight denormalized pointer on the item (`recordId`, `recordStatus`) is
  the likely mitigation, at the cost of keeping it in sync.
- **A migration is required** for any existing `Equipment.spreadsheetData`, and
  for backfilling `Equipment.id` on items that lack one. Scope is
  **[UNVERIFIED]** — production data volume was not inspected. This must be
  measured before implementation, and the migration must be written as a
  reversible, dry-runnable script.
- New Firestore composite indexes will be needed for the cross-job queries.

## Rejected alternative

A subcollection at `jobs/{jobId}/records/{recordId}` also solves size and
contention and keeps locality. It was rejected because collection-group queries
are a clumsier path to the cross-job review-queue and reporting patterns above,
and because top-level records make independent security rules and retention
policy clearer.

Keeping data inline was rejected outright: it retains all three problems.
