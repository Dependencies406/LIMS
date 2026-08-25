# ADR-012: Equipment Type and Certificate Number Configuration are one entity

Date: 2026-07-30
Status: Accepted
**Supersedes: [ADR-003](ADR-003-equipment-type-entity.md)**

## Context

ADR-003 created `EquipmentType` as a new first-class entity, separate from
`CertificateNumberConfig`. Phase 1 implemented it: a new `equipment_types`
collection, service, admin UI, Firestore rule block, permission entries, and an
`equipmentTypeId` link field on both `CertificateNumberConfig` and `Equipment`.

The owner then observed that Settings > Documents & Certificates now shows **two
cards for what is, in their design, one concept** — and asked whether Certificate
Numbers and Equipment Types are the same thing.

### What the evidence showed

The codebase disagreed with itself:

- The Certificate Numbers UI calls them **categories** — "Add category", "Edit
  category" (`CertificateNumberManagerModal.tsx:205,244,337,555`), and
  `certificateNumberConfigService.ts:2` describes "certificate number **category**
  configurations".
- The Equipment Types card calls them **instrument classes**
  (`SettingsPage.tsx:260`).
- But in working code before Phase 1, `CertificateNumberConfig.name` **was** the
  equipment type — `getEquipmentNames()` / `subscribeToEquipmentNames()` populated
  the equipment dropdowns in `JobModal.tsx:2583,3001` and
  `ServiceRequestModal.tsx:836`.

So "category" suggested a grouping coarser than an instrument type, while the
running code treated the two as identical.

### What the owner confirmed (2026-07-30)

1. **Each instrument type has its own certificate series.** No series is shared
   across types.
2. **One series per instrument type, always.** No accredited/non-accredited or
   other split.
3. **Every equipment type receives certificates.** There are no tracked-but-not-
   certificated types.

This is a strict **1:1:1** — one instrument type, one certificate series, one
Recorder Template.

## The error in ADR-003

ADR-003 considered and rejected "key on the certificate config document ID":

> conflates 'numbering rule' with 'equipment type'; an equipment type that needs
> no certificate number would have nowhere to live

**Point 3 above voids that objection.** The rejected alternative was correct, and
was dismissed on a scenario that does not exist in this laboratory.

The problem ADR-003 correctly identified remains real: keying templates on
`CertificateNumberConfig.name` — a renameable free-text string — would break on
any rename or typo fix. But the remedy was never a second entity. **Every
Firestore document already has a stable id.** Keying on the existing config's
document id solves the rename problem completely, with no new entity, no new
collection, and no synchronisation burden.

Phase 1's split created exactly that burden: two settings screens, an optional
link nothing enforces, and — pending migration — every config without a type and
every type without a config.

## Decision

**`certificate_number_configs` IS the equipment type.** One entity, one screen.

- Its **document id** is the stable key. `Equipment.equipmentTypeId`,
  `RecorderTemplate.equipmentTypeId`, and all future references point at it.
- `name` remains the renameable display label. Renaming is now safe, because
  nothing keys on it.
- The separate `EquipmentType` entity from Phase 1 is **retired**.
- `CertificateNumberConfig.equipmentTypeId` (added in Phase 1 to link config to
  type) becomes self-referential and is **removed**.
- The dead free-text `CertificateNumberConfig.equipmentType` string — never
  persisted, always `''`, deferred through Phases 0 and 1 — is **finally removed**.
  The concept it named is now the record itself.
- The UI is renamed throughout from "category" to "equipment type", matching the
  language the laboratory actually uses.

### Retaining `updatedAt` as a meaningful field

Merging means the record now holds both stable identity and a counter mutated on
every allocation. Add **`lastAllocatedAt`**, written by the allocation
transaction, so that `updatedAt` continues to mean "when a human last edited this
equipment type" rather than "when a certificate was last issued".

## Consequences

Positive:

- The model matches how the laboratory actually thinks. One concept, one screen,
  one record.
- The synchronisation burden and orphan risk introduced by Phase 1 disappear.
- Renaming an equipment type is safe — the stable key is the document id.
- **No certificate counter data is migrated.** Counters stay exactly where they
  are, and every existing caller (`JobModal`, `ServiceRequestModal`, the
  allocation transaction) continues to work against the same collection.

Negative and accepted:

- The Firestore collection keeps the name `certificate_number_configs` while
  representing equipment types. This is an internal detail no user sees, but it
  **will** confuse a future developer. Mitigated by a prominent comment on the
  type and an entry in the glossary. Renaming a collection means copying live
  counter documents — the single highest-consequence migration available in this
  system — and the naming cost does not justify that risk.
- A field named `equipmentTypeId` references a document in a collection named
  `certificate_number_configs`. Same mitigation, same reasoning.
- Phase 1's `EquipmentType` entity, service, and modal become dead code and must
  be retired. Its near-duplicate name report and permission entries remain useful.
- If the laboratory ever *does* need two series for one instrument type — an
  accreditation scope change is the realistic trigger — this model must be
  revisited. That was explicitly ruled out, and designing for the hypothetical is
  what produced the split this ADR reverses.

## On deleting Phase 1's artefacts

Per project `CLAUDE.md` RULE 2:

- The **`equipment_types` Firestore collection data must NOT be deleted.** Stop
  using it; leave the documents in place. Deleting Firestore data is irreversible,
  and an unused collection costs nothing.
- The Firestore rule block for it may remain — harmless once unused.
- Code files (`equipmentTypeService.ts`, `EquipmentTypeManagerModal.tsx`) are
  git-tracked and therefore recoverable, but their removal must still be preceded
  by verifying no remaining imports, and by showing the diff before removal.
