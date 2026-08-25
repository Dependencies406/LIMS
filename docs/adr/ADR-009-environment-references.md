# ADR-009: Environment values are referenced via a reserved `ENV` section

Date: 2026-07-30
Status: Accepted
Resolves: the open question left by [ADR-006](ADR-006-rounds-and-environment.md)

## Context

The Environment Block holds per-round scalars — one temperature (deg C) and one
relative humidity (%) per round (ADR-006). Formulas, however, evaluate **per
row**, and the variable pattern is `SECTIONID_COLUMNID` with no round index
(ADR-006).

Temperature correction is routine calibration arithmetic:

```
corrected_R1 = READ_R1 * (1 + alpha * (temperature_of_round_1 - 20))
```

So a row formula must be able to name **one specific round's** environmental
value, and that scalar must apply to every row.

## Decision

Reserve the section id **`ENV`** and auto-generate its columns from
`roundCount`:

| Variable | Resolves to |
|---|---|
| `ENV_TEMP_R1` .. `ENV_TEMP_R{roundCount}` | `environment[n].temperatureC` |
| `ENV_RH_R1` .. `ENV_RH_R{roundCount}` | `environment[n].relativeHumidity` |

Rules:

- These are **scalars, broadcast** — the same value on every row.
- They are **read-only**. An `ENV_*` name can never be a formula column target.
- **`ENV` is a reserved section id.** Template validation rejects any
  author-defined section with that id.
- Round indices are **1-based**. Referencing `ENV_TEMP_R4` when `roundCount` is 3
  is a **static validation error**, catchable before any data exists.
- Changing `roundCount` on a template re-derives the variable set, so it must
  re-validate every existing expression and report any that break.

## Consequences

Positive:

- **Zero grammar change.** `ENV_TEMP_R1` already matches `SECTIONID_COLUMNID`,
  so the tokenizer, parser, and validator need no new constructs. The whitelist
  stays purely mathematical — no data-accessor functions in it.
- **Consistent with the model already agreed.** The settled rule is "each round
  is its own column". Environment follows identical logic: each round's
  temperature is its own column. No new mental model for the user.
- Statically checkable: every `ENV_*` reference resolves against a known set
  derived from `roundCount`.

Negative and accepted:

- **Mildly leaky abstraction.** `ENV` looks like a section in formulas but never
  appears as a column group in the grid. The formula editor's autocomplete should
  present it in a visually distinct group (e.g. "Environment") so authors are not
  hunting for a section that isn't there.
- Reserving `ENV` removes it from the author's namespace. Low cost, but the
  validation error must say *why* it is rejected.
- The variable count grows with `roundCount` (2 x rounds). At 3 rounds that's 6
  names — fine. At 20 it would clutter autocomplete, which argues for a sane
  maximum on `roundCount`.

## Rejected alternatives

- **Accessor functions `env_temp(1)` / `env_rh(1)`** — conceptually cleaner, since
  it does not pretend `ENV` is a section. Rejected because it introduces data
  accessors into a function whitelist otherwise composed of pure mathematics, and
  because it reads differently from every other data reference.
- **Prefixed variables `@TEMP_R1`** — marks non-row data at a glance, but costs a
  new token in the grammar and breaks the single uniform variable pattern.
- **Implicit per-round resolution** (bare `ENV_TEMP` resolving via a column's
  round tag) — rejected because ADR-006 explicitly declined to tag columns with a
  round index, and because implicit resolution is hard to debug.

## Note

`SUMMARY` is likewise reserved — see
[ADR-010](ADR-010-evaluation-contexts-and-summary-fields.md). `ENV` and
`SUMMARY` are the only two reserved section ids.
