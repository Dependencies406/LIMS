# Phase 15 — CORRECTION to Task 1: fixed vs selectable column units

**Replaces Task 1's single `unit?: string` field. Tasks 2, 3 and 4 are unchanged, as is
the non-negotiable rule that a unit never enters a calculation.**

## Prompt

```
This supersedes Phase 15 Task 1. Read that task first, then this.

A column header's unit has TWO modes, chosen by the template author:

  FIXED       — the author sets one unit in the template. It is not changeable while
                recording. Header renders `label (unit)`.
  SELECTABLE  — the author defines the ALLOWED units in the template as a
                comma-separated list. While recording, the technician picks one of
                them for that column. Header renders `label (chosen unit)`.

### Schema

Follow the existing `selection` column precedent — that type already stores
`choices?: string[]` parsed from a comma-separated input. Mirror it, do not invent a
different shape:

  RecordColumn:
    unitMode?: 'fixed' | 'selectable'   // absent = no unit, renders as today
    unit?: string                        // fixed mode: the one unit
    unitChoices?: string[]               // selectable mode: the allowed units

Parse `unitChoices` from a comma-separated text input, trimming and dropping blanks —
exactly as the `selection` column's Choices field does.

### Where the chosen unit is stored

The choice is per COLUMN per RECORD — not per row, and not on the template.

  - Add a record-level map, e.g. `columnUnits?: Record<string, string>` on
    CalibrationRecord, keyed by the column key (the same key the grid layout uses).
  - Persist it through the existing draft update path. Do NOT add a second write path.
  - Editable while Draft; read-only once committed (ADR-005) — it changes what every
    number on the certificate CLAIMS to be, so it must be pinned like the rest.
  - Snapshot it at commit alongside the other pinned data, and confirm in your report
    whether commitRecord already covers it or you had to add it.

### Validation, template side

  - `selectable` with an empty or single-entry list is an author error — report it in
    the template verifier, next to the existing column checks.
  - `fixed` with no unit is the same as no unit at all; do not error, just render as
    today.
  - A unit string is free text (mV/V, °C, %RH, mm), NOT constrained to ForceUnit.

### Validation, record side

  - A selectable column with nothing chosen yet: leave the header showing `label` with
    no parentheses, and do NOT block. It is a display label, not data.
  - Only values from `unitChoices` may be stored. No free text, same rule as the
    `standard` column.

### Where the technician picks it

The grid header is drawn into TREB cells by buildGridDocument, so a React <select>
cannot live inside one. Two workable options — investigate and choose, then say which:

  a. A compact unit strip above the grid: one small <select> per selectable column,
     labelled with the column name.
  b. TREB's SetValidation on the header cell (it is public and real — Phase 13 verified
     it, and it blocks off-list values when `error: true`).

Prefer (a) unless (b) proves clean. Do not reach into TREB internals either way.

### Unchanged from Task 1 — still non-negotiable

The unit is a LABEL. Neither `unit`, `unitChoices`, nor the chosen value may enter any
calculation. Keep Task 1's test proving no evaluation path reads them, and extend it to
cover `columnUnits`: changing a record's chosen unit must change no computed number.

The builder input must still say so in words: "Display only — does not convert values."

Note the interaction with Task 2: its force-column/report-unit mismatch warning should
compare against the EFFECTIVE unit — the fixed one, or the record's chosen one — not
against `unitChoices` as a whole.

### Tests, added to Phase 15's list

  - fixed mode renders `label (unit)`; selectable renders `label (chosen)`; neither
    set renders `label` with no parentheses
  - unitChoices parses from "N, kN, kgF" to three trimmed entries
  - a selectable column stores only listed values; arbitrary text cannot be stored
  - changing a record's chosen unit changes NO computed value
  - the chosen unit is editable in Draft and rejected after commit
  - Task 2's warning uses the effective unit, not the choice list
  - a template using neither mode renders exactly as before
```
