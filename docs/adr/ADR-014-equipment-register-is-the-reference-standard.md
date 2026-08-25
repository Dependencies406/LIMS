# ADR-014: The equipment register is the reference standard; conversion equations bind to it

Date: 2026-08-04
Status: Accepted
**Amends [ADR-013](ADR-013-reference-standards-and-signal-conversion.md)** — D1, D4,
D6, D8, D9 stand unchanged. D2 (separate `ReferenceStandard` entity), D3 (what the
picker selects) and D5 (unit scaling source) are superseded below.

## Context

ADR-013 specified a new top-level `ReferenceStandard` entity, and Phase 11 built it:
`referenceStandardService.ts`, `referenceStandardVariables.ts`,
`ReferenceStandardManagerModal.tsx`, `STD_*` resolution in the evaluator, snapshotting,
range and due-date warnings, and a namespace-isolation test.

**ADR-013 was written without knowing that a conversion-equation feature already
existed.** It does: `ConversionEquation`, stored at
`equipmentControl/{equipmentId}/conversionEquations/{id}`, with coefficients, degree,
divisor, units, and the same `uCal`/`uA`/`uB`/`uC` contributors — surfaced on
`EquipmentDetailPage`.

So two entities now model one physical thing. This is the fifth-template-system
pattern that ADR-007 documented and ADR-012 corrected, repeated because an ADR was
again written from an incomplete reading of the codebase.

### Two findings that forced this ADR

**1. The coefficient arrays run in opposite directions.**

```
ReferenceStandard:   coefficients[i] multiplies R^i    → [const, c₁, c₂, c₃]  ascending
ConversionEquation:  coefficients[0] = highest degree  → [c₃, c₂, c₁, const]  descending
```

Copying one into the other without reversing inverts the polynomial. With the real
`CAL-FRC-001` values (25.0019, −0.0396, 0.0757) the result is plausible-looking and
completely wrong — the identical failure mode ADR-013 found in the workbook, from the
identical cause: an equation whose written form did not match its evaluated form.

**2. `divisor` is stored, but unit scaling is job-dependent.**

The owner confirmed (2026-08-04) that `ConversionEquation.divisor` converts from the
standard's readout unit to the unit reported on the certificate.

That factor depends on the **job's** reporting unit, not on the equation. The same
transducer used on one job reporting in N and another in kN requires two different
divisors, and a stored field cannot supply both.

The workbook is right here and the existing field is wrong: Excel's `O15` is
*computed* from `F6` (UUC unit) and `K8` (standard unit), and is not stored in LCDB.

## Decisions

### D1 — The equipment register is the reference standard

A reference transducer is already an asset in `equipmentControl`, carrying serial
number, calibration date, due date, traceability and manufacturer.
`ReferenceStandard` duplicated all of it. **The equipment record is the single source
of truth.**

This also models physical reality better than the workbook does. In LCDB a 250 kN
transducer appears as four rows. In the equipment register it is **one device with
four calibrated ranges** — one equipment record, four `ConversionEquation` children.
One device is one device.

The owner confirmed `ReferenceStandard` holds **no data**, so retirement is code
removal, not migration.

### D2 — `ReferenceStandard` is retired

Superseding ADR-013 D2. Remove the entity, its service, and its settings modal.

Per `CLAUDE.md` RULE 2: verify no remaining imports and show the list before removing
anything. The (empty) Firestore collection and its rule block may simply be left in
place — deleting Firestore data is irreversible and an unused collection costs
nothing.

**Retained from Phase 11, unchanged:** `STD_*` resolution in the evaluator,
`buildStandardVariables()`, snapshotting, the range and due-date warnings, and
`standardNamespaceIsolation.test.ts`. That work was correct; only its data source
changes.

### D3 — The `standard` column selects an (equipment, equation) pair

Superseding ADR-013 D3. The cell stores both ids, because an equation is only
meaningful together with the equipment it belongs to.

The picker is two-stage — choose the transducer, then its calibrated range — or a
flattened list showing `equipment — range`. Range and due-date warnings continue to
warn rather than block (ADR-013 D3).

Only equipment marked as usable as a reference standard should appear. If no such
flag exists, add one rather than filtering on a name convention.

### D4 — One canonical coefficient order, converted in exactly one place

**Canonical internal order is ascending: `coefficients[i]` multiplies `Rⁱ`**, matching
ADR-013 D1 and the natural reading of `Σ cᵢRⁱ`.

`ConversionEquation` stores descending. Therefore:

- **Exactly one adapter function** converts stored → canonical. Not two, not inline
  in three call sites.
- It is guarded by the ADR-013 arithmetic test: the real `CAL-FRC-001` coefficients
  must yield **1.00002 at R = 0.04** and **9.99927 at R = 0.4**. Reversed, they do
  not.
- Its doc comment states both orders explicitly and why they differ.

This is the highest-risk detail in the phase. An inverted polynomial does not throw —
it returns a number, and that number goes on a certificate.

### D5 — Unit scaling is derived, never read from the stored `divisor`

Superseding ADR-013 D5's source (the newton-normalisation *method* stands).

The scale factor is computed at evaluation time:

```
force_in_report_unit = polynomial(R) * STD_TO_N / REPORT_TO_N
```

with the ADR-013 D5 table — N = 1, kN = 1000, kgF = 9.80665, gF = 0.00980665.

**`divisor` is NOT applied in the recorder path.** Applying it as well as the derived
factor would scale twice, putting forces out by three orders of magnitude.

`divisor` is retained on `ConversionEquation` for the standalone calculator on
`EquipmentDetailPage`, which is not part of this pipeline. But:

> **Add a disagreement warning.** Surface in the equipment UI any stored `divisor`
> that the recorder path will ignore. This exposes bad existing data instead of
> silently honouring or silently ignoring it. Flag `divisor` as deprecated in its doc
> comment.

> ### Correction (2026-08-04) — the check is `divisor ≠ 1`, not a unit ratio
>
> This section originally said to compare `divisor` against "the factor derived from
> the equation's own `inputUnit`/`outputUnit`". **That is not computable.**
> `inputUnit` is `mV/V`, a signal unit; there is no force-to-force ratio between it
> and `outputUnit`. The instruction was wrong.
>
> The Phase 12 session identified the correct check from the calculator's own
> semantics (`EquipmentDetailPage.tsx:1478`): `raw polynomial ÷ divisor = outputUnit`.
>
> Therefore **any `divisor ≠ 1` means the raw polynomial is NOT expressed in
> `outputUnit`.** The recorder path treats the polynomial's output as being in
> `outputUnit` and ignores `divisor`, so a stored divisor of *d* would make every
> force from that equation wrong by exactly *d*.
>
> The warning is therefore: **`divisor ≠ 1` → warn, naming the factor.** `divisor = 1`
> is the only value consistent with `outputUnit` describing the polynomial directly.

The report unit comes from the record or template, exposed to formulas as
`REPORT_TO_N` (name it clearly and consistently with `STD_TO_N`).

### D6 — Snapshot the equation and the equipment fields it depends on

ADR-013 D6 stands; only the source changes. At commit each row snapshots the
**canonical ascending coefficients** — already converted, never the stored descending
form — plus units, uncertainty contributors, and the parent equipment's serial number,
calibration date and due date.

Storing the converted form means a future reader cannot re-invert it by accident.

## Consequences

Positive:

- One entity for one physical thing; equipment metadata has one home
- One transducer with several calibrated ranges matches reality better than LCDB's
  flattened rows
- Real existing data is used rather than re-entered
- Unit scaling finally works per job, which the stored `divisor` could never do
- `STD_*`, snapshotting, warnings and the isolation test are all kept — Phase 11 was
  not wasted, only re-sourced
- Retirement costs no migration

Negative and accepted:

- The coefficient-order mismatch is a permanent trap at the boundary. Mitigated by a
  single adapter, an arithmetic test, and storing the converted form in snapshots.
- `divisor` lingers as a deprecated field with a warning rather than being removed,
  because the equipment calculator still uses it.
- Phase 11's `ReferenceStandard` UI work is discarded.

## What went wrong here, recorded deliberately

ADR-013 specified a new entity without first searching for existing conversion-equation
code. `conversionEquationService.ts`, `ConversionEquation` in `types/index.ts`, and the
`EquipmentDetailPage` UI were all present and were all missed.

This is the **fourth** ADR in this project corrected after the code contradicted it —
after ADR-003 (over-modelled equipment types), ADR-004 (documented the dead PDF system)
and ADR-007 (asserted cell protection that was dead code).

The pattern is identical every time: **a capability was asserted from reasoning rather
than from reading.** The audit that would have caught this is one `grep` for
"conversion" or "coefficient" before writing the ADR.
