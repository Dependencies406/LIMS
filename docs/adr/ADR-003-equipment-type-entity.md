# ADR-003: Promote Equipment Type to a first-class entity

Date: 2026-07-30
Status: **SUPERSEDED by [ADR-012](ADR-012-equipment-type-is-the-certificate-config.md)** (2026-07-30)

> **Why this was superseded.** This ADR rejected "key on the certificate config
> document ID" on the grounds that "an equipment type that needs no certificate
> number would have nowhere to live". The owner subsequently confirmed that in
> this laboratory **every equipment type receives certificates**, that each type
> has **its own** series, and that no type ever needs two series — a strict 1:1.
> The objection was therefore void, and the rejected alternative was correct.
>
> The problem identified below is real and still stands: keying on the renameable
> free-text `name` is fragile. The remedy chosen here — a second entity — was not.
> Every Firestore document already has a stable id, which solves it without the
> synchronisation burden this ADR created.
>
> Phase 1 implemented this ADR. ADR-012 retires that work. The analysis of the
> dead `equipmentType` field below (§Context) remains accurate and useful.

## Context

The requirement is: a Recorder Template binds to an Equipment Type that "already
exists in Certificate Numbers", with the restriction that one Equipment Type maps
to exactly one template.

What the code actually does:

- `CertificateNumberConfig.equipmentType: string` is declared
  (`src/types/index.ts:534`) and **read** in two places
  (`certificateNumberConfigService.ts:33`,
  `certificateNumberGeneratorService.ts:81`).
- It is **never written.** `configToDocument`
  (`certificateNumberConfigService.ts:53-76`) omits it, and `updateConfig`
  (`:187-201`) has no branch for it. `CertificateNumberManagerModal.tsx:108`
  assigns `''` through an `any` cast.
- **Therefore `equipmentType` is always the empty string.** It is dead code.
- The same omission affects `currentSequence`, `currentYear`, and `yearlyReset`
  — all declared and read, none persisted.

What is *actually* used as the equipment type today is
`CertificateNumberConfig.name`:

- `getConfigByEquipmentName()` matches on `.name` (`:247-252`)
- `getEquipmentNames()` / `subscribeToEquipmentNames()` feed the dropdowns
  (`:258-315`)
- `JobModal.tsx:2583,3001` and `ServiceRequestModal.tsx:836` render those names
  and match them against `Equipment.name` — a free-text field.

So the de-facto key for the proposed 1:1 restriction is a **mutable, free-text
display string**, matched by string equality against another free-text field.

## Decision

Introduce **`EquipmentType`** as a first-class entity:

```ts
interface EquipmentType {
  id: string;          // immutable, system-generated
  code: string;        // short stable human key, unique
  name: string;        // display name, renameable
  isActive: boolean;
  createdAt: Date; updatedAt: Date;
}
```

- `CertificateNumberConfig` gains `equipmentTypeId` referencing it.
- `RecorderTemplate` gains `equipmentTypeId`, with a uniqueness constraint
  enforcing the 1:1 restriction.
- `Equipment` (Item) gains `equipmentTypeId` rather than relying on `name`
  string matching.
- The dead `equipmentType` string field is removed.

## Consequences

Positive:

- Renaming an equipment type no longer breaks template binding, certificate
  numbering, or historical records.
- The 1:1 restriction becomes enforceable — you can hold a uniqueness constraint
  on an id, not on a free-text label that two users may capitalise differently.
- Template matching at record creation ("open matched template by verifying the
  equipment type") becomes an id lookup rather than a fuzzy string match.
- Fixes a real latent bug: `equipmentType` silently discarding writes.

Negative and accepted:

- **Migration required.** Existing certificate configs and job items key on free
  text. Distinct names must be reconciled into EquipmentType records, including
  near-duplicates from typos and casing. This needs human review; it cannot be
  fully automated. Scope is **[UNVERIFIED]** — production data was not inspected.
- New settings UI to manage equipment types.
- Touches `JobModal.tsx` and `ServiceRequestModal.tsx`, both of which are large
  and central. Changes there carry regression risk to job creation.

## Note on scope

While fixing this, also persist `currentSequence`, `currentYear`, and
`yearlyReset`, which are dropped by the same function. They are relevant to
ADR-008 (record number allocation) — a reset policy that is read but never
written cannot work.

## Rejected alternatives

- **Key on `CertificateNumberConfig.id`** — stable and a smaller change, but
  conflates "numbering rule" with "equipment type"; an equipment type that needs
  no certificate number would have nowhere to live.
- **Fix and use the `equipmentType` string** — least structure, but remains free
  text with no uniqueness guarantee, so the 1:1 restriction stays unenforceable.
- **Drop the 1:1 restriction** — would have removed the conflict with template
  versioning, but the user retained the restriction; ADR-005 resolves that
  conflict via version pinning instead.
