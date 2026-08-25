# Implementation Phase Prompts

One entry per phase. Each prompt is self-contained so it can be pasted into a
fresh session with no prior context.

Design authority for all phases:

- `docs/DATA_MGMT_MODULE_DOMAIN_MODEL.md` — entities, schemas, phasing
- `docs/DATA_MGMT_MODULE_GLOSSARY.md` — ubiquitous language
- `docs/DATA_MGMT_MODULE_AUDIT.md` — verified facts about the codebase
- `docs/adr/` — ADR-001 .. ADR-011

| Phase | Model | Effort | Rationale |
|---|---|---|---|
| 0 | Sonnet 5 | High | Small and precisely specified, but transactional allocation has subtle retry semantics |
| 1 | Sonnet 5 | High | New entity + migration; mechanical but touches JobModal/ServiceRequestModal |
| 2 | Sonnet 5 | High | Data backfill — needs care, low conceptual difficulty |
| 3 | **Opus 5** | **Maximum** | Language implementation: grammar, two evaluation contexts, large test surface |
| 4 | Sonnet 5 | High | UI authoring surface over a settled schema |
| 5 | Sonnet 5 | High | Recording UI + lifecycle; broad but well-specified |
| 6 | **Opus 5** | High | Edits `pdfTemplateRenderer.ts`, which has existing callers and tests |

---

## Phase 0 — Fix persistence defects and make number allocation transactional

**Model: Claude Sonnet 5 · Effort: High**

### Prompt

```
Read these first, in order:
  - CLAUDE.md (project root) — these are hard rules, not suggestions
  - docs/DATA_MGMT_MODULE_AUDIT.md sections 4 and 6
  - docs/adr/ADR-003-equipment-type-entity.md
  - docs/adr/ADR-008-record-number-allocation.md

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

Before editing ANY file, run and report the output of:
    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Known state as of 2026-07-30 (verify, do not assume):
  - Active branch was `feature/analysis-module`
  - No linked worktrees existed (`.git/worktrees/` absent)
  - Only ONE working copy exists: C:\Users\seela\Desktop\LIMS-New
  - CLAUDE.md's reference to C:\Users\seela\OneDrive\Desktop\LIMS-New is STALE —
    that path does not exist

STOP and ask me before editing if:
  - the branch is not what you expect, or has uncommitted work you did not create
  - any worktree exists other than the main working copy
  - a dev server is serving from a directory other than this one

Also ask me which branch this work belongs on before your first edit.

## SCOPE — do exactly this and nothing more

### Task 1: Persist the three silently-dropped fields

In src/services/certificateNumberConfigService.ts:

`documentToConfig` (~line 29-48) READS these fields, but `configToDocument`
(~line 53-76) never WRITES them, and `updateConfig` (~line 187-201) has no
branch for them. They are therefore always lost:
    - currentSequence
    - currentYear
    - yearlyReset

Fix both `configToDocument` and `updateConfig` so all three round-trip
correctly.

DO NOT fix `equipmentType`. It is also dropped, but ADR-003 removes that field
entirely in Phase 1, so fixing it is throwaway work. It is currently harmless
(always ''). Leave it exactly as is and add a brief code comment noting that
ADR-003 supersedes it.

### Task 2: Make number allocation transactional

First READ src/services/certificateNumberGeneratorService.ts in full and report
what it actually does. Whether it already uses a transaction is UNVERIFIED — do
not assume either way.

`updateConfig` and `resetNumber` in certificateNumberConfigService.ts currently
use plain `updateDoc`, so two concurrent allocations can read the same
`currentNumber` and collide.

Convert number allocation to use Firestore `runTransaction`, such that:
  - the counter read and the increment are atomic
  - a retried transaction does NOT allocate a second number (idempotent)
  - the year/month reset policy (`resetPolicy: 'never' | 'yearly' | 'monthly'`)
    is evaluated INSIDE the transaction, using the now-persisted
    `currentYear` / `yearlyReset` fields
  - existing callers keep working — find them all before changing signatures

### Tests

Add vitest tests alongside the existing ones in
src/services/__tests__/ (pattern: <subject>.test.ts). Cover at minimum:
  - all three fields survive a write -> read round trip
  - updateConfig persists them when changed
  - concurrent allocation does not produce duplicate numbers
  - yearly reset fires when currentYear differs from the current year
  - monthly reset behaviour
  - a retried transaction does not double-increment

Run `npm test` and report the result.

## CONSTRAINTS

- Do NOT delete any file, branch, or worktree. Do NOT suggest deletions.
- Do NOT refactor anything outside the two service files and their tests.
- Do NOT touch equipmentType (see above).
- Do NOT change Firestore rules in this phase.
- Any new markdown file goes in docs/ (CLAUDE.md RULE 9).
- If you are unsure about something, say so and ask. Do not fill gaps with
  guesses (CLAUDE.md RULE 1 and RULE 7).

## DEFINITION OF DONE

Report each of these explicitly:
  1. Pre-work command output, and which branch you edited
  2. A diff summary of every file changed
  3. `npm test` output
  4. Confirmation that `equipmentType` was left untouched
  5. A list of every caller of the allocation function you found, and whether
     each still works
  6. Anything you could not verify, stated as UNVERIFIED
```

### Verification checklist

- [x] `configToDocument` writes `currentSequence`, `currentYear`, `yearlyReset`
- [x] `updateConfig` has a branch for each of the three
- [x] `equipmentType` is unchanged, with a comment referencing ADR-003
- [x] Allocation uses `runTransaction`, and the reset policy is evaluated inside it
- [x] Retry does not double-allocate
- [x] New tests exist and `npm test` passes (95/95 — reported, not independently run)
- [x] Every caller of the allocation function was enumerated and still works
- [x] No file, branch, or worktree was deleted
- [x] No changes outside the two service files and their tests

### Phase 0 outcome: PASSED (verified 2026-07-30)

Corrections that came out of it:

- `generateCertificateNumber` **was already transactional** — ADR-008 recorded
  this as unverified. It simply ignored the persisted fields and never handled
  `monthly` reset. Both now fixed.
- An entire prior recorder module was discovered at `recorder-reserved/`, missed
  by the original audit. See audit §2b. Confirmed **not in use, archived only**.

Carried forward as small debts, not blockers:

1. `updateConfig`'s duplicate-name check reads **outside** the transaction, so two
   concurrent renames could still collide. The counter invariant is safe; the
   name-uniqueness invariant is not.
2. The generator writes `updatedAt: Timestamp.now()` (client clock) where the rest
   of the codebase uses `serverTimestamp()`. Server time is preferable on an audit
   field, and `serverTimestamp()` does work inside transactions.
3. `yearlyReset` is now always exactly `resetPolicy === 'yearly'`, so it carries no
   independent information. Collapse it in Phase 1 rather than carrying it forward.

---

## Phase 1 — EquipmentType as a first-class entity

**Model: Claude Sonnet 5 · Effort: High**

Sonnet is right for this: the entity itself is simple and the ADR is specific.
High effort is warranted because it touches `JobModal.tsx` and
`ServiceRequestModal.tsx` — both large and central to job creation — and because
the migration involves human judgement about near-duplicate names.

### Prompt

```
Read these first, in order:
  - CLAUDE.md (project root) — hard rules, not suggestions
  - docs/PLAIN_LANGUAGE_GUIDE.md — terminology
  - docs/adr/ADR-003-equipment-type-entity.md — the decision being implemented
  - docs/DATA_MGMT_MODULE_AUDIT.md section 4 — the evidence behind it
  - docs/DATA_MGMT_MODULE_DOMAIN_MODEL.md section 2 — the target schema

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

Before editing ANY file, run and report:
    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Known state as of Phase 0 (verify, do not assume):
  - Branch `feature/analysis-module`; only one working copy; no linked worktrees
  - There is a LARGE amount of pre-existing uncommitted work that is NOT yours,
    including a staged rename of a prior recorder module into `recorder-reserved/`.
    LEAVE ALL OF IT ALONE. Do not stage, commit, revert, or move any of it.
  - `recorder-reserved/` is an archive. Do not modify, build against, or delete it.

STOP and ask me before editing if the branch differs, if a dev server is serving
from another directory, or if anything else looks unexpected.

## BACKGROUND — the defect being fixed

`CertificateNumberConfig.equipmentType` (src/types/index.ts:534) is declared and
READ in two services, but NEVER WRITTEN — see docs audit §4. It is always ''.
What the app actually uses as the equipment type today is
`CertificateNumberConfig.name`, a free-text, renameable string, matched by string
equality against `Equipment.name` in JobModal and ServiceRequestModal.

## SCOPE

### Task 1: Create the EquipmentType entity

New Firestore collection `equipment_types`, new service following the existing
service conventions (plain exported object literal, subscribe/getAll/add/update,
serverTimestamp on createdAt/updatedAt, a toDate() mapper).

  interface EquipmentType {
    id: string;          // immutable, system-generated
    code: string;        // short stable human key, unique
    name: string;        // renameable display name
    isActive: boolean;
    createdAt: Date; updatedAt: Date;
    createdBy: string; updatedBy: string;
  }

### Task 2: Reference it, keeping the old field readable

  - Add `equipmentTypeId` to `CertificateNumberConfig`, and PERSIST it properly
    (do not repeat the configToDocument omission — verify the round trip).
  - Add `equipmentTypeId` to `Equipment` (the job line item).
  - Do NOT remove the old `equipmentType` string or change `name` semantics yet.
    Both must keep working until the migration is verified complete.

### Task 3: Settings UI

Admin-only management of equipment types (list, create, rename, activate,
deactivate). Deactivate rather than delete. Follow the existing settings modal
patterns — CertificateNumberManagerModal is the closest example.

### Task 4: Migration script — REPORT ONLY, DO NOT RUN

Write a script that:
  a. reads all distinct `CertificateNumberConfig.name` values and all distinct
     `Equipment.name` values currently in use;
  b. reports them grouped, flagging near-duplicates (case differences, extra
     whitespace, probable typos) for human review;
  c. supports a --dry-run that changes nothing and prints exactly what it would do.

DO NOT execute the migration. Report its dry-run output and wait for me.
Reconciling near-duplicates needs my judgement, not yours.

### Task 5: Clean up the derived field

Per Phase 0 finding: `yearlyReset` is now always exactly
`resetPolicy === 'yearly'`. Remove it as a stored field and derive it on read
instead. Update the Phase 0 tests accordingly.

## CONSTRAINTS

- Do NOT delete any file, branch, or worktree. Do NOT suggest deletions.
- Do NOT touch `recorder-reserved/`.
- Do NOT touch the pre-existing uncommitted work.
- Do NOT run the migration.
- Do NOT remove the old `equipmentType` field yet.
- New markdown goes in docs/ (RULE 9).
- If unsure, say so and ask. Do not guess (RULE 1, RULE 7).

## TESTS

vitest, in src/services/__tests__/. Cover: EquipmentType CRUD round trip;
`equipmentTypeId` persists on CertificateNumberConfig (explicitly test the round
trip that equipmentType failed); uniqueness of `code`; deactivate does not delete;
`yearlyReset` still derives correctly after removal as a stored field.
Run `npm test` and report.

## DEFINITION OF DONE

  1. Pre-work output and branch edited
  2. Diff summary per file
  3. `npm test` output
  4. Migration dry-run output, with the near-duplicate report
  5. Confirmation that JobModal and ServiceRequestModal still work unchanged
  6. Anything you could not verify, stated as UNVERIFIED
```

### Verification checklist for Phase 1

- [x] `equipment_types` collection and service exist, following house conventions
- [x] `equipmentTypeId` round-trips on `CertificateNumberConfig` — read `:34`, write `:76-78`, update `:217`
- [x] Old `equipmentType` string still present (`types/index.ts:560`) and untouched
- [x] `Equipment.equipmentTypeId` added (`types/index.ts:120`)
- [x] Deactivate rather than delete — `deactivateEquipmentType` / `activateEquipmentType`; no delete method exists
- [x] Migration written, dry-run only, near-duplicate detection unit-tested
- [x] Migration NOT executed — script fails cleanly at the credentials step
- [x] `yearlyReset` no longer stored; derived on read (`:44`); no update branch (`:225-226`)
- [~] Job creation — neither modal was touched and `tsc` is clean, but no authenticated walkthrough was possible
- [~] `recorder-reserved/` untouched — reported, **not independently verified** (no shell access to run `git status`)

### Phase 1 outcome: PASSED, with one decision outstanding

Handled well: the session found a dev server running, verified its command line
pointed at *this* directory before editing, spotted that `firestore.rules` has a
default-deny catch-all so a new collection needs its own rule block, noticed that
Phase 1 neither authorised nor forbade rules changes, and **asked instead of
guessing**. It also declined to obtain credentials to run the migration.

#### DECISION NEEDED — the permission model and the Firestore rule disagree

The session added granular permissions `equipmentTypes.view` / `equipmentTypes.edit`
to `roleService.ALL_PERMISSIONS`, **and** wrote this rule:

```
match /equipment_types/{equipmentTypeId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null &&
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

These check different things. A user holding a **custom role** granted
`equipmentTypes.edit` will see the Create/Edit buttons in the UI, click one, and
get a permission-denied error from the database — because their `users/{uid}.role`
field is not literally `'admin'`.

This is exactly the problem the neighbouring comment documents at
`firestore.rules:158-159`, which is why `certificate_number_configs` allows any
authenticated user to write. Three ways out:

1. **Drop the granular permissions**, gate the UI on `role === 'admin'` to match
   the rule. Simplest, and honest about what is actually enforced.
2. **Loosen the rule** to any authenticated user, matching `certificate_number_configs`,
   and rely on UI gating. Consistent with the existing collection, weaker at the
   database.
3. **Keep both**, accepting that custom roles can never manage equipment types —
   but then remove the permission entries, since offering a permission that cannot
   work is worse than not offering it.

Also note the rule's `get()` performs an extra document read per write — the very
cost the neighbouring comment cites as its reason for not doing this. Negligible
for a low-write admin collection, but inconsistent.

#### Carried-forward debts

1. **`code` uniqueness is enforced app-side only** (`equipmentTypeService:133`,
   `:185`) — read, then check, then write. Two admins creating the same code
   simultaneously both pass. This is the **second** instance of this pattern; the
   first was `updateConfig`'s duplicate-name check in Phase 0. Firestore can
   enforce it properly with a `equipment_type_codes/{code}` marker document created
   inside a transaction. Low likelihood here (admin-only, low volume) but worth
   fixing once, consistently.
2. **`firebase-admin` + `tsx` added 34 npm vulnerabilities (3 critical)** for a
   one-off report script. These are `devDependencies`, so they never reach the
   browser bundle — exposure is limited to the developer machine and CI. Still
   worth a look, and worth asking whether a Firebase console export would avoid
   the dependency entirely.
3. `equipmentTypeId` is optional on both types, correctly, until the migration
   runs. ADR-003 wants it required eventually — that tightening is a later phase.

#### OUTSTANDING USER ACTION before Phase 2 completes

Run the near-duplicate report on your own machine and reconcile the names:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
  npm run report:equipment-type-names -- --dry-run
```

Nothing has been migrated. Deciding which near-duplicate names are genuinely the
same instrument class needs your judgement.

---

## Phase 2 — Item identity (hard gate)

**Model: Claude Sonnet 5 · Effort: High**

Sonnet is sufficient — this is conceptually simple. The risk is not difficulty
but **consequence**: it writes to every job document in production. The safety
comes from procedure (additive-only, idempotent, dry-run, backup), which the
prompt enforces.

You confirmed this is a hard gate: every existing equipment item must have an id
before any later phase proceeds.

### Prompt

```
Read first, in order:
  - CLAUDE.md (project root) — hard rules
  - docs/PLAIN_LANGUAGE_GUIDE.md — terminology
  - docs/adr/ADR-002-record-storage.md — why item identity is required
  - docs/DATA_MGMT_MODULE_AUDIT.md section 2 — the evidence
  - docs/PHASE_PROMPTS.md — Phase 1 outcome, including carried-forward debts

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

Run and report before editing anything:
    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

If a dev server is running, verify its command line points at THIS directory
before editing (Phase 1 found one at PID 33200 serving from here).

There is a large amount of pre-existing uncommitted work on this branch that is
not yours, including a staged rename into `recorder-reserved/`. LEAVE IT ALONE.
`recorder-reserved/` is an archive — do not modify, build against, or delete it.

STOP and ask if anything differs from the above.

## BACKGROUND

`Job.equipment` is an embedded array of `Equipment` objects (types/index.ts:196-208).
`Equipment.id` is currently OPTIONAL (types/index.ts:117). A Record cannot be
reliably bound to an item that may have no id, so every item needs a stable one.

## SCOPE

### Task 1: Assign ids to new items at creation

Ensure every code path that creates an equipment item assigns a stable unique id
(`uuid` is already a dependency). Find ALL such paths before changing any —
JobModal, ServiceRequestModal, and any service that constructs equipment items.
Report the full list before editing.

### Task 2: Backfill script — WRITE IT, DRY-RUN IT, DO NOT EXECUTE IT

A script that adds an id to every existing equipment item that lacks one.

Hard requirements:
  - ADDITIVE ONLY. Never modify or remove any existing field. Only add `id`
    where it is absent.
  - IDEMPOTENT. Running it twice must not change anything the second time, and
    must never regenerate an id that already exists.
  - --dry-run default. It must require an explicit --execute flag to write.
  - Reports counts before and after: jobs scanned, items found, items already
    having ids, items needing ids.
  - Processes in batches and can resume safely if interrupted partway.

DO NOT run it against real data. Report the dry-run behaviour only.

### Task 3: Do NOT make Equipment.id required yet

Leave it optional in the type. It becomes required only after the backfill has
actually run and been verified. Making it required now would break compilation
against real data that has not been migrated.

## CONSTRAINTS

- Do NOT delete anything. Do NOT suggest deletions.
- Do NOT touch recorder-reserved/ or the pre-existing uncommitted work.
- Do NOT execute the backfill.
- Do NOT change Equipment.id to required.
- Do NOT change Firestore rules unless you find a blocker — if you do, ask first.
- New markdown goes in docs/ (RULE 9).
- If unsure, say so and ask (RULE 1, RULE 7).

## TESTS

vitest. Cover: new items get ids at every creation path; the backfill's
id-assignment logic is idempotent; items with existing ids are left untouched;
items lacking ids are correctly identified. Run `npm test` and report.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. The COMPLETE list of code paths that create equipment items, and confirmation
     each now assigns an id
  3. Diff summary per file
  4. `npm test` output
  5. Dry-run behaviour of the backfill script
  6. Explicit confirmation that Equipment.id is still optional
  7. Anything unverified, stated as UNVERIFIED
```

### Verification checklist for Phase 2

- [ ] Every equipment-item creation path enumerated and assigns a stable id
- [ ] Backfill script is additive-only — adds `id`, touches nothing else
- [ ] Backfill is idempotent and safe to resume
- [ ] Backfill defaults to dry-run; requires `--execute` to write
- [ ] Backfill NOT executed
- [ ] `Equipment.id` still optional in the type
- [ ] Tests cover idempotency and existing-id preservation
- [ ] `recorder-reserved/` and pre-existing uncommitted work untouched

### Before YOU run the backfill

1. Export a Firestore backup first. The script is additive, but a backup makes any
   mistake recoverable rather than permanent.
2. Run with `--dry-run` and read the counts. If "items needing ids" looks wrong
   against your expectation of how many jobs exist, stop and investigate.
3. Only then run with `--execute`.

### Phase 2 outcome: PASSED (verified 2026-07-30)

- `Equipment.id: string` is now **required** (`types/index.ts:121`), documented with
  the ADR reference and the backfill script name.
- Backfill was executed by the owner and confirmed clean before the type was
  tightened — correct ordering.
- Three additional construction sites in `JobModal.tsx` (initial `useState` default,
  load-existing-job fallback, reset-for-new-job) were missed by the manual pass and
  surfaced by the compiler once `id` became required.
- 138/138 tests passing, `tsc` clean project-wide.

**Verification note worth reusing:** flipping a field from optional to required
makes the compiler enumerate every construction site. A clean `tsc` afterwards is
genuine proof of completeness — a stronger guarantee than reading files and
reasoning about coverage. Prefer this pattern for future required-field migrations.

---

## Phase 3 — Expression Interpreter and verifier

**Model: Claude Opus 5 · Effort: Maximum**

The one phase that warrants Opus at full effort. It is a language implementation:
lexer, parser, two evaluation contexts, a call graph with cycle detection, and a
large error-message surface. Mistakes here are inherited by every formula in every
template forever, and they are the kind of mistake that produces plausible-looking
wrong numbers rather than obvious failures.

**Prerequisite met:** `docs/FORMULA_GRAMMAR.md` is approved. ADR-001 required that
before any parser code.

### Prompt

```
Read first, in order:
  - CLAUDE.md (project root) — hard rules
  - docs/FORMULA_GRAMMAR.md — THE SPECIFICATION. Approved. Implement exactly this.
  - docs/adr/ADR-001-expression-interpreter.md
  - docs/adr/ADR-009-environment-references.md
  - docs/adr/ADR-010-evaluation-contexts-and-summary-fields.md
  - docs/adr/ADR-011-number-precision-and-formatting.md
  - docs/PLAIN_LANGUAGE_GUIDE.md — terminology

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

Run and report before editing anything:
    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

If a dev server is running, verify its command line points at THIS directory.
There is pre-existing uncommitted work on this branch that is not yours —
LEAVE IT ALONE. `recorder-reserved/` is an archive: read it for reference if
useful, but do NOT modify, build against, import from, or delete it.

STOP and ask if anything differs.

## SCOPE

Implement the language specified in docs/FORMULA_GRAMMAR.md. Pure logic only —
NO UI in this phase. It must be independently unit-testable.

Suggested shape (adapt to house conventions):
    src/modules/recorder/formula/lexer.ts
    src/modules/recorder/formula/ast.ts
    src/modules/recorder/formula/parser.ts
    src/modules/recorder/formula/builtins.ts
    src/modules/recorder/formula/evaluator.ts
    src/modules/recorder/formula/validator.ts     (the verifier, §7)
    src/modules/recorder/formula/index.ts

Hard requirements:
  - NEVER use eval(), new Function(), or any dynamic code construction. The whole
    security argument of ADR-001 rests on this.
  - Operate on UNROUNDED values. Never apply display formatting (ADR-011).
  - Implement BOTH evaluation contexts with the restrictions in §6.
  - Implement ALL collision rules in §4 and ALL restrictions in §2, each with the
    exact error message specified where one is given.
  - Custom functions may call other custom functions: build the call graph,
    topologically sort, reject cycles, and enforce a recursion-depth cap (§5).
  - Custom function bodies may reference ONLY their parameters, builtins, and other
    custom functions — never columns, ENV_*, SUMMARY_*, or col_* (§5).
  - ROUND is half-away-from-zero, NOT Python's banker's rounding. Include the test
    with the explanatory comment demanded by §3.
  - Errors must carry a kind: "awaiting-input" vs "invalid-computation" (§6), since
    the UI must style them differently in a later phase.

You MAY read recorder-reserved/modules/data-recorder/analysis/ for reference —
particularly studentT.ts (TINV) and numeric.ts (Excel ROUND/TRUNC), which are
non-trivial and already tested. PORT THE IDEAS, writing fresh code in the new
location. Do not import from that tree.

## TESTS — this is the deliverable as much as the code

Cover everything in §8 of the grammar doc:
  - grammar conformance table: every production, valid and invalid
  - precedence, including -2**2 == -4 and 2**3**2 == 512
  - scientific notation literals: 11.5e-6, 7.882E+21, 1e-3
  - ROUND half-away-from-zero, with the §3 comment
  - TINV against known values including the df-truncation quirk
  - error-message snapshots for every §2 restriction and §4 collision
  - cycle detection: direct and indirect, functions and columns
  - context violations: col_* and SUMMARY_* in row formulas
  - strict empty propagation, including aggregates over incomplete columns
  - no rounding occurs during evaluation

Run `npm test` and `tsc --noEmit`. Report both.

## CONSTRAINTS

- Do NOT delete anything. Do NOT suggest deletions.
- Do NOT modify or import from recorder-reserved/.
- Do NOT touch the pre-existing uncommitted work.
- Do NOT build UI in this phase.
- Do NOT deviate from docs/FORMULA_GRAMMAR.md. If you believe the spec is wrong,
  STOP and explain — do not silently "improve" it. It is an approved artifact.
- New markdown goes in docs/ (RULE 9).
- If unsure, say so and ask (RULE 1, RULE 7).

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Diff summary per file
  3. `npm test` and `tsc --noEmit` output
  4. A table mapping each §8 test requirement to the test that covers it
  5. Confirmation that eval/new Function appear nowhere
  6. Any point where you believe the spec is wrong or ambiguous, stated rather
     than silently resolved
  7. Anything unverified, stated as UNVERIFIED
```

### Verification checklist for Phase 3

- [ ] No `eval`, `new Function`, or dynamic code construction anywhere
- [ ] Both evaluation contexts implemented, with §6 restrictions enforced
- [ ] `col_*` rejected in row formulas; `SUMMARY_*` rejected in row formulas
- [ ] Custom functions can call each other; cycles rejected, direct and indirect
- [ ] Recursion-depth cap present
- [ ] Function bodies cannot reach columns / `ENV_*` / `SUMMARY_*` / `col_*`
- [ ] All §4 collision rules enforced
- [ ] Scientific notation literals parse
- [ ] `ROUND` is half-away-from-zero, with the explanatory test comment
- [ ] `-2**2 == -4` and `2**3**2 == 512`
- [ ] Strict empty propagation; aggregates error on incomplete columns
- [ ] Errors carry an "awaiting-input" vs "invalid-computation" kind
- [ ] No rounding during evaluation
- [x] Nothing imported from `recorder-reserved/`
- [x] Every §8 test requirement mapped to an actual test

### Phase 3 outcome: PASSED (verified 2026-07-30)

16 files, 3,544 lines (1,608 source / 1,936 test). 369/369 tests passing,
`tsc --noEmit` clean. All new files; nothing pre-existing modified.

Verified independently: no `eval`, `new Function`, or dynamic construction in
source — the only `recorder-reserved` occurrences are attribution comments in
`numeric.ts` and `studentT.ts`, which the security test's comment-stripping
correctly ignores.

**`security.test.ts` deserves specific credit.** It excludes `__tests__` so it does
not trip on its own detection patterns, strips comments before scanning, covers
indirect routes (`globalThis['eval']`, string-form `setTimeout`/`setInterval`,
`Function('...')`, `import()`, `require()`), and — most importantly — asserts at
line 53-55 that the file scan found more than five files. Without that guard, a
broken directory walk would make every other assertion pass trivially: a green test
that tested nothing. This converts ADR-001's security argument from review
discipline into a permanent check.

Its one limitation, appropriate to its purpose: the scan is textual, not
AST-based, so a deliberate bypass (`const e = 'ev' + 'al'`) would evade it. It
guards against accidental reintroduction by a future maintainer, not against
someone with commit access who intends harm.

#### Spec ambiguities the session surfaced rather than silently resolving

All five are now resolved in `FORMULA_GRAMMAR.md` §7b, and one was my drafting
error:

1. `and`/`or` return booleans — **confirmed.** Also protects ADR-010: operand
   returning would make `X or 0` a silent default-value idiom.
2. String arithmetic rejected — **confirmed.**
3. Mixed-type comparison (`==` false, ordering errors) — **confirmed.**
4. `col_count` errors on incomplete columns — **confirmed as consistent.**
5. `def f(ROUND)` was permitted because §4 enumerated only two parameter rules
   while also claiming "no shadowing anywhere" — **my drafting error.** §4 now
   extends parameter collisions to builtins and aggregates, and adopts the
   session's unprompted duplicate-parameter rejection.
6. TINV's `IFERROR(..., 2)` fallback deliberately not carried over — **confirmed**,
   and now documented as an improvement: the same behaviour is expressible as
   `TINV(0.05, CAL_NU) if CAL_NU >= 1 else 2`, which puts the `k = 2` assumption
   on the page instead of hiding it.

#### Outstanding

- **Spot-check TINV against your real Excel** before any number reaches a
  certificate. Values were verified against published Excel figures and the
  archive's goldens, not against your installation.
- **Verify the TINV-fallback change against a real single-reading sheet.** Where a
  spreadsheet silently produced `2`, this will now error until the formula is
  written explicitly.
- Archived golden fixtures (`STAGE_D_GOLDEN_DATA.json`) were not ported — they are
  keyed to the archive's Excel-like syntax. Optional future regression work.

---

## Phase 3.5 — Unify Equipment Type with Certificate Number config (ADR-012)

**Model: Claude Sonnet 5 · Effort: High**

Inserted after Phase 3 because Phase 4 binds Recorder Templates to equipment
types. Building that on a model already identified as wrong would mean reworking
templates later, possibly after records reference them.

This **reverses most of Phase 1**. That is expected — see ADR-012 for why ADR-003
was wrong. High effort because it removes code and changes a live data model;
Sonnet is sufficient because the target state is fully specified.

### Prompt

```
Read first, in order:
  - CLAUDE.md (project root) — hard rules, especially RULE 2 on deletions
  - docs/adr/ADR-012-equipment-type-is-the-certificate-config.md — the decision
  - docs/adr/ADR-003-equipment-type-entity.md — the superseded decision and why
  - docs/DATA_MGMT_MODULE_DOMAIN_MODEL.md section 2 — the target schema
  - docs/PLAIN_LANGUAGE_GUIDE.md — terminology

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

Run and report before editing anything:
    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

If a dev server is running, verify its command line points at THIS directory.
Pre-existing uncommitted work on this branch is NOT yours — leave it alone.
`recorder-reserved/` is an archive — do not modify, import from, or delete it.

STOP and ask if anything differs.

## GOAL

`certificate_number_configs` IS the equipment type. One entity, one settings
screen. Its document id is the stable key. This retires the separate
EquipmentType entity built in Phase 1.

## SCOPE

### Task 1: Repoint references to the config document id

  - `Equipment.equipmentTypeId` now references a `certificate_number_configs`
    document id. Keep the FIELD NAME — it is the correct domain word — and add a
    comment stating which collection it points at and citing ADR-012.
  - Remove `CertificateNumberConfig.equipmentTypeId` — it is now self-referential.
  - Remove the dead free-text `CertificateNumberConfig.equipmentType` string. It
    has never been persisted and is always ''. ADR-012 finally retires it. Verify
    no reader depends on it before removing.

### Task 2: Add lastAllocatedAt

The allocation transaction must write `lastAllocatedAt`, so `updatedAt` keeps
meaning "when a human last edited this equipment type" rather than "when a
certificate was last issued". Update Phase 0's allocation tests.

### Task 3: One settings screen

  - Remove the "Equipment Types" card from SettingsPage.
  - Rename the "Certificate Numbers" card to "Equipment Types", with a description
    covering both roles (instrument class + its certificate series).
  - Inside CertificateNumberManagerModal, rename ALL user-facing "category"
    wording to "equipment type" — currently at lines ~205, ~244, ~337, ~555.
  - Update the service docstring, which says "certificate number category
    configurations".

### Task 4: Retire Phase 1's entity — CAREFULLY, per RULE 2

  - **DO NOT delete the `equipment_types` Firestore collection or its documents.**
    Stop using it. Deleting Firestore data is irreversible; an unused collection
    costs nothing. Report how many documents it holds.
  - The Firestore rule block for `equipment_types` may remain — harmless once
    unused. Do not remove it in this phase.
  - Code files `src/services/equipmentTypeService.ts` and
    `src/components/EquipmentTypeManagerModal.tsx` (plus their tests) should be
    removed — BUT FIRST: grep for every import of each, prove nothing else uses
    them, and SHOW ME the list before removing. If anything still imports them,
    stop and ask.
  - Keep `scripts/reportEquipmentTypeNames.ts` and
    `src/utils/equipmentTypeNameReport.ts` — the near-duplicate name report is
    still needed to clean up the name list. Repoint it at
    certificate_number_configs names if it does not already read those.
  - Keep the `equipmentTypes.view` / `equipmentTypes.edit` permission entries.
    They now govern the unified screen.

### Task 5: Resolve the permission mismatch left open by Phase 1

Phase 1 added granular permissions AND a Firestore rule checking
`users/{uid}.role == 'admin'`. These disagree: a custom role granted
`equipmentTypes.edit` sees the buttons and is then refused by the database.

Pick ONE and make both layers agree. Recommended: gate the UI on the same
condition the rule enforces, so the UI never offers an action the database will
refuse. SHOW ME your choice before implementing if you prefer a different one.

## CONSTRAINTS

- Do NOT delete Firestore collection data.
- Do NOT delete any code file without first proving no imports remain AND showing
  me the list (RULE 2).
- Do NOT touch recorder-reserved/ or the pre-existing uncommitted work.
- Do NOT migrate or alter certificate counters. They stay exactly where they are.
- Do NOT start Phase 4 template work.
- New markdown goes in docs/ (RULE 9).
- If unsure, say so and ask (RULE 1, RULE 7).

## TESTS

Update existing tests and add: equipmentTypeId round-trips on Equipment;
`equipmentType` and `CertificateNumberConfig.equipmentTypeId` are gone with no
readers left; `lastAllocatedAt` is written on allocation and `updatedAt` is NOT
disturbed by allocation; allocation still works end to end.
Run `npm test` and `tsc --noEmit`. Report both.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Diff summary per file
  3. The import-check list for every file you propose removing, shown BEFORE removal
  4. Document count in the orphaned equipment_types collection (not deleted)
  5. `npm test` and `tsc --noEmit` output
  6. Which permission option you chose and how both layers now agree
  7. Confirmation that no certificate counter was migrated or altered
  8. Anything unverified, stated as UNVERIFIED
```

### Verification checklist for Phase 3.5

- [ ] `Equipment.equipmentTypeId` references the config document id, with an explanatory comment
- [ ] `CertificateNumberConfig.equipmentTypeId` removed
- [ ] Dead `equipmentType` free-text string removed, no readers left
- [ ] `lastAllocatedAt` written on allocation; `updatedAt` untouched by allocation
- [ ] One settings card, named "Equipment Types"
- [ ] All "category" wording replaced in UI and service docstring
- [ ] `equipment_types` **collection data not deleted**; document count reported
- [ ] Code file removals preceded by a shown import check
- [ ] Name-report script retained and still working
- [ ] Permission mismatch resolved; UI and Firestore rule agree
- [x] **No certificate counter migrated or altered**

### Phase 3.5 outcome: PASSED (verified 2026-07-30)

Verified in code: dead `equipmentType` string gone; `CertificateNumberConfig.equipmentTypeId`
gone; `Equipment.equipmentTypeId` retained with an ADR-012 comment naming the target
collection; `EquipmentType` interface removed; three files removed after a shown
import check; `equipment_types` collection data **not** deleted; counters untouched.
425/425 tests, `tsc` clean.

The session did the import check properly — it found `RecorderTemplatesListPage.tsx`
and `RecorderTemplateBuilderPage.tsx` still importing the retired service, repointed
them first, re-verified, and only then removed files. That is exactly RULE 2.

#### Two items needing your attention

1. **Real behavioural regression.** Tightening `certificate_number_configs` writes to
   `role == 'admin'` means any non-admin who previously held `certificateNumbers.edit`
   through a custom role has **lost write access to equipment types**, in the UI and at
   the database. Check whether any such role is actually in use before this reaches
   your staff.
2. **The permission catalog inconsistency persists, inverted.** `equipmentTypes.view` /
   `equipmentTypes.edit` remain in `ALL_PERMISSIONS`, but the screen now hard-checks
   `isAdmin`, so granting those permissions does nothing. This is the safe direction —
   under-granting, never a button the database refuses — but it is still a permission
   that cannot work. Either wire the gate to the permission, or remove the entries.

---

## Phase 4 — Recorder Template authoring

> ### ⚠ STATUS: BUILT AHEAD OF THIS PROMPT
>
> Phase 4 was substantially implemented by the Phase 3 / 3.5 session **before this
> prompt was issued** — the second time a session has self-advanced past its stated
> scope (Phase 2 also ran on into Phase 3).
>
> Existing artefacts:
> `recorderTemplateService.ts`, `recorderTemplateValidation.ts`,
> `recorderTemplateMockup.ts` (all with tests), `RecorderTemplatesListPage.tsx`,
> `RecorderTemplateBuilderPage.tsx`, and the `RecorderTemplate` /
> `RecorderTemplateVersion` types.
>
> **Spot-checks passed (2026-07-30):**
> - Reserved ids enforced — `RESERVED_SECTION_IDS = ['ENV','SUMMARY']` with a clear message
> - `customFunctions` round-trips both directions and is included in the published snapshot
> - Versions in a separate `recorderTemplateVersions` collection (ADR-005)
> - Publishing gated on verification via `TemplateNotPublishableError`
> - **No second formula engine** — imports Phase 3's `modules/recorder/formula`
>
> **Still unverified:** the two page components, the mockup harness behaviour, and the
> test suite content. Ask the session for a Definition-of-Done report against the
> checklist below before treating Phase 4 as complete.
>
> **Caveat:** this was built against the pre-ADR-012 model and repointed during Phase
> 3.5. Re-verify that `equipmentTypeId` now genuinely resolves to a
> `certificate_number_configs` document everywhere, not just where it compiled.
>
> Stale reference to fix: `RecorderTemplate.equipmentTypeId`'s comment cites ADR-003;
> it should cite ADR-012.

### ✅ The uniqueness invariant was solved properly — back-port this pattern

`recorderTemplateService.ts` enforces one-active-template-per-equipment-type with a
**lock collection**, and its docstring explains exactly why:

> Firestore's `Transaction.get()` only accepts a DocumentReference, not a Query — there
> is no way to transactionally ask "does any other active template exist for this
> equipmentTypeId" via a `where()` query inside a transaction. The lock collection turns
> that question into a single-document read at a deterministic path
> (`recorderTemplateActiveLocks/{equipmentTypeId}`), which CAN be read-and-written
> atomically.

This is the correct answer to the read-then-write race flagged **three times** in this
project: Phase 0's duplicate-name check, Phase 1's `code` uniqueness, and this. The
remaining live instance is `certificateNumberConfigService.updateConfig`, whose
duplicate-name check still reads outside its transaction. Worth back-porting the same
pattern.

### Phase 4 outcome: PASSED (verified 2026-07-30)

Confirmed by a verification pass against all 11 checklist items. `tsc` clean,
425/425 tests. No implementation changes were needed.

Additionally confirmed post-ADR-012: the equipment-type picker on both pages now
sources from `certificateNumberConfigService`, and `recorderTemplateVersions` has a
Firestore rules block denying `update`/`delete`, so published versions are immutable
at the database and not merely by convention.

> ### ⚠ THE PROMPT BELOW IS STALE — DO NOT RUN IT
>
> Its "WHAT ALREADY EXISTS" section names `src/services/equipmentTypeService.ts` as a
> Phase 1 dependency to reuse. **ADR-012 retired that file.** Running this prompt would
> risk reintroducing the dependency Phase 3.5 deliberately removed.
>
> The session correctly refused to execute it, verified current state instead, and
> reported the staleness. That is the right response to a prompt that contradicts the
> code — the failure mode to avoid is implementing from a stale instruction because it
> was written down.
>
> Retained only as a record of what Phase 4 was asked to cover.

### Original Phase 4 prompt (STALE — reference only)

**Model: Claude Sonnet 5 · Effort: High**

The hard thinking is done: the schema is settled in the domain model and the
language is specified and built. This is a substantial but conventional authoring
UI over a known schema, plus versioning. Sonnet at high effort is the right fit;
Opus would be paying for reasoning the ADRs already contain.

### Prompt

```
Read first, in order:
  - CLAUDE.md (project root) — hard rules
  - docs/PLAIN_LANGUAGE_GUIDE.md — terminology
  - docs/DATA_MGMT_MODULE_DOMAIN_MODEL.md sections 1-3 — the schema you implement
  - docs/FORMULA_GRAMMAR.md — the language, ALREADY BUILT in src/modules/recorder/formula/
  - docs/adr/ADR-003 (equipment types), ADR-005 (versioning), ADR-006 (rounds and
    environment), ADR-010 (summary fields), ADR-011 (number formatting)

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

Run and report before editing anything:
    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

If a dev server is running, verify its command line points at THIS directory.
There is a large amount of pre-existing uncommitted work on this branch that is
not yours — LEAVE IT ALONE. `recorder-reserved/` is an archive: do not modify,
import from, or delete it.

STOP and ask if anything differs.

## WHAT ALREADY EXISTS — use it, do not rebuild it

  - src/modules/recorder/formula/ — the complete interpreter and verifier from
    Phase 3. Call its public API from src/modules/recorder/formula/index.ts.
    Do NOT write a second parser, evaluator, or validator.
  - src/services/equipmentTypeService.ts — Phase 1.
  - Equipment.id is required (Phase 2).

## SCOPE

### Task 1: RecorderTemplate persistence

Implement `RecorderTemplate`, `RecordSection`, `RecordColumn`, `SummaryField`,
`CustomFunction`, and `NumberFormat` exactly as specified in domain model §2.
New Firestore collection, service following house conventions.

Enforce: at most ONE active template per equipmentTypeId (ADR-003 invariant).
Enforce this in a transaction, not with read-then-write — see the carried-forward
debts from Phases 0 and 1, where app-side uniqueness checks left a race twice.

### Task 2: Publishing and versioning (ADR-005)

  - Publishing emits an immutable RecorderTemplateVersion holding a full snapshot,
    INCLUDING customFunctions.
  - Store versions as separate documents (`recorderTemplateVersions`) so N records
    sharing a version share one snapshot.
  - A published version is never mutated. Editing produces a new draft.

### Task 3: Authoring UI

Two panes, per the original requirement:
  - LEFT: sections and columns. Add/remove/reorder sections; add/remove/reorder
    columns within a section. Per column: id, label, type
    (text | number | selection | formula), NumberFormat (notation + decimals) for
    number, choices for selection, expression for formula, preInput for inputs.
  - RIGHT: the custom-function code editor, with a Verify button calling the
    Phase 3 validator and showing position-accurate errors.

Template-level settings: name, description, equipmentTypeId (picker), roundCount,
defaultRowCount, allowRowAdd, recordNumberFormat.

Summary fields panel — separate from the column editor (ADR-010).

Reserved section ids ENV and SUMMARY must be rejected with a clear reason.

Admin-only, consistent with whatever you and I settle for the equipment-type
permission question (see Phase 1 outcome — if unresolved, ASK before choosing).

### Task 4: Template mockup / test harness

Draft requirement 3: let the author enter sample data and see formulas evaluate,
so template integrity can be checked before use. Reuse the Phase 3 evaluator in
both contexts.

## CONSTRAINTS

- Do NOT write a second formula parser/evaluator/validator. Call Phase 3's.
- Do NOT delete anything. Do NOT suggest deletions.
- Do NOT modify or import from recorder-reserved/.
- Do NOT touch the pre-existing uncommitted work.
- Do NOT build the recording UI (Phase 5) or PDF work (Phase 6).
- Firestore rules: if a new collection needs a rule block, ASK first and show me
  the proposed rule (this is how Phase 1 handled it correctly).
- New markdown goes in docs/ (RULE 9).
- If unsure, say so and ask (RULE 1, RULE 7).

## TESTS

vitest. Cover: template CRUD round trip with every field persisting (explicitly
test the round trip — dropped fields have been a real defect twice in this
codebase); the one-active-template-per-equipment-type invariant under concurrency;
publishing produces an immutable snapshot including customFunctions; a published
version cannot be mutated; ENV and SUMMARY rejected as section ids; the verifier
is actually invoked and surfaces errors.
Run `npm test` and `tsc --noEmit`. Report both.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Diff summary per file
  3. `npm test` and `tsc --noEmit` output
  4. Confirmation that no second formula engine was written, and where Phase 3's
     API is called from
  5. How the one-active-template-per-equipment-type invariant is enforced, and
     whether it is race-free
  6. Any spec ambiguity, stated rather than silently resolved
  7. Anything unverified, stated as UNVERIFIED
```

### Verification checklist for Phase 4

- [ ] Every schema field from domain model §2 present and round-tripping
- [ ] One-active-template-per-equipment-type enforced transactionally, not read-then-write
- [ ] Publishing snapshots the template including `customFunctions`
- [ ] Versions stored as separate documents; published versions immutable
- [ ] `ENV` and `SUMMARY` rejected as author section ids
- [ ] Verify button calls Phase 3's validator; errors carry position
- [ ] Summary fields panel separate from the column editor
- [ ] `NumberFormat` notation + decimals per column
- [x] Mockup harness evaluates in both contexts
- [x] **No second parser/evaluator/validator written**
- [x] `recorder-reserved/` and pre-existing uncommitted work untouched

---

## Phase 5a — Record entity, lifecycle, and commit (no UI)

**Model: Claude Sonnet 5 · Effort: High**

Phase 5 is split. **5a is persistence and lifecycle logic; 5b is the recording UI.**
The split mirrors what worked for Phase 3 → 4: build and test the logic first, then
put an interface on something already known to be correct. It also keeps the change
set reviewable — 5 as one phase would be the largest in the project.

Sonnet at high effort: broad but fully specified by the ADRs. The risk is consequence
(it writes quality records and allocates numbers), and that is handled by
transactions and rules rather than by model capability.

### Prompt

```
Read first, in order:
  - CLAUDE.md (project root) — hard rules
  - docs/PLAIN_LANGUAGE_GUIDE.md — terminology
  - docs/DATA_MGMT_MODULE_DOMAIN_MODEL.md sections 1, 2, 4 — schema and workflow
  - docs/adr/ADR-002 (record storage), ADR-005 (lifecycle and version pinning),
    ADR-008 (number allocation), ADR-010 (evaluation contexts), ADR-012 (equipment type)
  - docs/FORMULA_GRAMMAR.md section 6 — evaluation semantics

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

Run and report:
    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

If a dev server is running, verify its command line points at THIS directory.
Pre-existing uncommitted work on this branch is NOT yours — leave it alone.
`recorder-reserved/` is an archive — do not modify, import from, or delete it.

STOP and ask if anything differs.

## WHAT ALREADY EXISTS — verify before assuming; this list may itself be stale

  - src/modules/recorder/formula/ — interpreter and verifier (Phase 3). Use it.
  - src/services/recorderTemplateService.ts — templates and published versions (Phase 4)
  - src/services/certificateNumberConfigService.ts — IS the equipment type (ADR-012).
    There is NO equipmentTypeService; it was retired.
  - Equipment.id is required (Phase 2)

If anything above does not match the code, STOP and tell me rather than working
around it.

## SCOPE — logic and persistence only. NO UI.

### Task 1: Record entity

Implement `CalibrationRecord` per domain model §2, in its own TOP-LEVEL `records`
collection (ADR-002 — never inline on the job document).

  - rows keyed `${sectionId}_${columnId}`, matching the formula variable pattern
  - environment: exactly `roundCount` entries of { roundIndex, temperatureC, relativeHumidity }
  - contextSnapshot captured at creation (domain model §2) — snapshot, not reference,
    so a certificate reprinted years later shows what was true at calibration time
  - templateId + templateVersion pinned at creation, referencing an immutable
    recorderTemplateVersions document (ADR-005)

### Task 2: Lifecycle

Draft → Committed → Reviewed → Approved, plus Superseded.

  - Draft: editable, NO record number
  - Committed: immutable data; number allocated
  - Reviewed / Approved: sign-off states, reusing the existing DigitalSignature pattern
  - Corrections NEVER mutate a committed record. A revision is a NEW record linked via
    supersedes / supersededBy / revisionReason (ADR-005)

### Task 3: Record number allocation

Allocate on FIRST COMMIT, inside a transaction (ADR-008). Drafts carry no number.

Put the counter in its own document at a deterministic path —
`recordNumberCounters/{templateId}` — NOT on the template document. Two reasons:
the template's `updatedAt` must keep meaning "last edited", and a deterministic path
is the only thing Firestore can read-and-write atomically. This is the same lock/
counter pattern recorderTemplateService already uses; follow it.

Must be idempotent: a retried commit must not allocate a second number.

### Task 4: Evaluation on commit

Evaluate row formulas and then summary fields using the Phase 3 engine, against the
PINNED template version — never the current template. Persist the evaluated summary.
Strict empty semantics apply (ADR-010): an incomplete record cannot commit.

### Task 5: Firestore rules — immutability must be server-side

ADR-005 requires that a committed record cannot be edited. Enforce it in
firestore.rules, not only in the client. SHOW ME the proposed rule before applying it.

### Task 6: Item binding

Given a jobId + itemId, resolve: no record → may create Draft; Draft exists → reopen;
Committed-or-later exists → read-only, revision required to change.

## CONSTRAINTS

- Do NOT build UI. That is Phase 5b.
- Do NOT write a second formula engine. Call Phase 3's.
- Do NOT store records inline on the job document.
- Do NOT delete anything; do NOT suggest deletions.
- Do NOT touch recorder-reserved/ or pre-existing uncommitted work.
- Show proposed Firestore rules before applying.
- New markdown goes in docs/ (RULE 9).
- If unsure, say so and ask (RULE 1, RULE 7).

## TESTS

Every field round-trips (dropped fields have been a real defect twice here).
Number allocated only at commit; concurrent commits never duplicate; retry does not
double-allocate. Committed records reject mutation. Revisions link both ways.
Evaluation uses the pinned version, proven by editing the live template and showing
the record's numbers do not move. environment length must equal roundCount.
Incomplete records cannot commit.
Run `npm test` and `tsc --noEmit`. Report both.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Any point where "WHAT ALREADY EXISTS" did not match the code
  3. Diff summary per file
  4. Proposed Firestore rules, shown before applying
  5. `npm test` and `tsc --noEmit` output
  6. How allocation idempotency is guaranteed
  7. Proof that evaluation uses the pinned version, not the live template
  8. Anything unverified, stated as UNVERIFIED
```

### Verification checklist for Phase 5a

- [ ] Records in a top-level `records` collection, never inline on jobs
- [ ] `rows` keyed `SECTION_COLUMN`; `environment` length equals `roundCount`
- [ ] `contextSnapshot` captured at creation
- [ ] `templateVersion` pinned; evaluation uses the pinned snapshot, proven by test
- [ ] Drafts have no record number; allocation happens at first commit, transactionally
- [ ] Counter at `recordNumberCounters/{templateId}`, not on the template document
- [ ] Retry does not double-allocate; concurrent commits never duplicate
- [ ] Committed records immutable **in firestore.rules**, not only client-side
- [ ] Revisions link both directions; committed records never mutated
- [x] Incomplete records cannot commit (strict empty semantics)
- [x] No UI built; no second formula engine

### Phase 5a outcome: PASSED (verified 2026-07-30)

458/458 tests, `tsc` clean, 2 new source files. Verified in `firestore.rules`:
records are top-level, `delete` denied outright, post-commit updates restricted to
lifecycle keys, counter at its own path.

The pinned-version proof is the right shape — the live template was edited to
`× 1000`, republished as v2, and the committed record still produced `0.2` rather
than `200`.

Credit where due: the session caught its own bug — non-transactional queries nested
inside a `runTransaction` callback gain no atomicity, the same Firestore constraint
from Phase 4 — and restructured so the transaction guards exactly the invariant that
needs it. Blocking commit on `invalid-computation` as well as `awaiting-input` was
also an unprompted, correct call.

#### Decisions taken (2026-07-30)

1. **Revisions inherit the original's pinned version and pre-fill its data.** Phase
   5a implemented the opposite. **Must be corrected at the start of Phase 5b**,
   before any revision exists in real data. See ADR-005.
2. **The draft-to-committed gap is an accepted risk.** Record numbers could be
   fabricated client-side; only a Cloud Function can close it. Documented with
   revisit triggers in ADR-008.

---

## Phase 5b — Recording UI

**Model: Claude Sonnet 5 · Effort: High**

UI over logic that is already built and tested. Broad surface, but every behaviour
is specified.

### Prompt

```
Read first, in order:
  - CLAUDE.md (project root) — hard rules
  - docs/PLAIN_LANGUAGE_GUIDE.md — terminology
  - docs/DATA_MGMT_MODULE_DOMAIN_MODEL.md section 4 — the workflow
  - docs/adr/ADR-005 (lifecycle + the NEW revision decision), ADR-006 (rounds and
    environment), ADR-007 (extend TREB, do not build a fifth system),
    ADR-010 (evaluation contexts + error kinds), ADR-011 (number formatting)
  - docs/FORMULA_GRAMMAR.md section 6 — evaluation semantics

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

Run and report: git branch / git worktree list / git status / netstat -ano | grep ":5173"
If a dev server is running, verify its command line points at THIS directory.
Pre-existing uncommitted work is NOT yours. `recorder-reserved/` is an archive.
STOP and ask if anything differs.

## WHAT ALREADY EXISTS — verify; this list may be stale. If it does not match, STOP and say so.

  - src/modules/recorder/formula/ — interpreter and verifier (Phase 3)
  - src/services/recorderTemplateService.ts — templates and versions (Phase 4)
  - src/services/calibrationRecordService.ts — record lifecycle and commit (Phase 5a)
  - src/services/certificateNumberConfigService.ts — IS the equipment type (ADR-012)

## TASK 0 — FIRST, correct the revision behaviour (ADR-005, decided after 5a)

`createRevision` currently re-resolves to the currently-active template version and
starts with empty rows. Both are wrong. A revision must:
  - INHERIT the superseded record's templateVersion — a revision corrects a data
    error in the same calibration event; the method did not change, so the maths
    must not change
  - PRE-FILL the original's rows and environment, so the technician corrects one
    cell rather than re-recording everything
Update the function, its doc comment, and its tests. Do this before any UI work.

## SCOPE

### Task 1: Recording grid
Extend the existing TREB spreadsheet (ADR-007). Do NOT build a new grid.
  - Sections render as spanning header groups above their columns
  - Only input columns editable; formula columns read-only
  - Column display honours NumberFormat: fixed vs scientific, decimals (ADR-011).
    Display only — never round stored values
  - Row count starts at defaultRowCount; technician may add rows if allowRowAdd

### Task 2: Environment block
Built-in, non-deletable, exactly roundCount entries of temperature (°C) and
relative humidity (%). Required before commit (ADR-006).

### Task 3: Live recalculation
Call the Phase 3 engine. Row context per row, then summary context. Any cell feeding
an aggregate invalidates the whole summary. Do NOT write a second engine.

### Task 4: Error presentation — this one matters
Errors carry a kind (ADR-010). They must LOOK different:
  - 'awaiting-input' — expected during recording, visually QUIET
  - 'invalid-computation' — a real mistake, PROMINENT
Because the technician sets row count while recording, most of a session is spent
with formulas awaiting input. Styling both the same produces a wall of red and
trains people to ignore error styling entirely.

### Task 5: Draft safety
Autosave drafts. On unexpected close, offer recovery on return.
AUTOSAVE MUST NEVER COMMIT — committing allocates a number and creates an immutable
quality record from an unfinished calibration (ADR-005).

### Task 6: Job integration
Job → Items tab → select item → calibrationRecordService.resolveRecordForItem:
  none → create Draft; draft → reopen; committed-or-later → open READ-ONLY with an
  explicit "create revision" action.

### Task 7: Lifecycle actions
Commit, Review, Approve, Create Revision — each gated to the appropriate role, each
showing clearly which state the record is in.

## CONSTRAINTS

- Do NOT build a new grid or a second formula engine.
- Do NOT let autosave commit.
- Do NOT round stored values — formatting is display only.
- Do NOT delete anything; do NOT suggest deletions.
- Do NOT touch recorder-reserved/ or pre-existing uncommitted work.
- Firestore rule changes: show them before applying.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

Revision inherits version and pre-fills data. Formula columns not editable.
Environment required before commit. Autosave never changes status. Recovery restores
an interrupted draft. Committed records open read-only. The two error kinds are
distinguishable in the rendered output.
Run `npm test` and `tsc --noEmit`. Report both.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Confirmation Task 0 is done, with its tests updated
  3. Any point where "WHAT ALREADY EXISTS" did not match
  4. Diff summary per file
  5. npm test and tsc output
  6. How the two error kinds differ visually
  7. Proof autosave cannot commit
  8. Anything unverified, stated as UNVERIFIED
```

### Verification checklist for Phase 5b

- [ ] **Task 0 done** — revisions inherit the pinned version and pre-fill data
- [ ] Grid extends TREB; no new grid built
- [ ] Sections render as spanning header groups; formula columns read-only
- [ ] `NumberFormat` honoured on display; stored values never rounded
- [ ] Environment block non-deletable, `roundCount` entries, required before commit
- [ ] Live recalculation calls Phase 3's engine; no second engine
- [ ] `awaiting-input` and `invalid-computation` visually distinct
- [ ] Autosave never commits; recovery works after an interrupted session
- [ ] Item binding resolves correctly for all three cases
- [x] Committed records open read-only with an explicit revision action

### Phase 5b outcome: PASSED (verified 2026-07-30)

530/530 tests, `tsc` clean, production build succeeds. Task 0 verified in code —
`createRevision` fetches the *pinned* version with the comment "a defensive
data-integrity check, not a re-resolution to anything current", and deep-copies rows
and environment.

Error kinds are visually distinct as required: `awaiting-input` renders blank and
undecorated, `invalid-computation` gets red fill, red bold text, and the message in
the cell. Autosave's inability to commit is structural — the hook never imports
`commitRecord` — not merely tested.

**ADR-007 was corrected as a result of this phase.** Its claim that "cell protection
is already plumbed" was verified false; see the correction block in that ADR.

---

## Phase 5c — Enforce record permissions in Firestore rules

**Model: Claude Sonnet 5 · Effort: High**

Small and self-contained, but compliance-relevant and easy to get subtly wrong.

### Why this is not the ADR-008 accepted risk

ADR-008 accepted that record numbers can be fabricated client-side, because
**security rules cannot verify a counter was incremented atomically** — only a Cloud
Function can.

This is different: rules **can** read the caller's role and check permissions. The
pattern already exists in this file (`equipment_types` checks `role == 'admin'`).
The consequence is also worse — right now **any authenticated user can approve any
record and write any signature**, bypassing the UI. The separation between who
performs a calibration and who approves it is a core ISO/IEC 17025 control, and it
is currently enforced only by hiding a button.

### Prompt

```
Read first:
  - CLAUDE.md — hard rules
  - docs/adr/ADR-005-record-lifecycle.md — the lifecycle being protected
  - docs/adr/ADR-008-record-number-allocation.md — the ACCEPTED risk this does NOT fix
  - firestore.rules — existing patterns, especially equipment_types
  - src/services/roleService.ts — the permission model

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

git branch / git worktree list / git status / netstat -ano | grep ":5173"
Verify any dev server points at THIS directory. Pre-existing uncommitted work is NOT
yours. recorder-reserved/ is an archive. STOP and ask if anything differs.

## PROBLEM

records.commit / records.review / records.approve / records.revise are enforced
CLIENT-SIDE ONLY. The Phase 5a rule lets ANY authenticated user change status,
reviewedAt, reviewerSignature, approvedAt, approverSignature, supersededBy on ANY
record. Signatures can be forged; anyone can self-approve.

## SCOPE — firestore.rules only, plus tests

### Task 1: Enforce the permission model in rules

Lifecycle transitions must check the caller actually holds the permission. The rich
model is user -> role -> permissions array, so this needs two get() calls. That is
acceptable here: lifecycle transitions happen ONCE per record, not per keystroke.

If you find a cheaper correct approach (e.g. permissions denormalised onto the user
document), propose it — but do not silently change the model.

### Task 2: Constrain the transitions themselves

  - draft may only become 'committed' — never jump straight to reviewed/approved
  - 'reviewed' only from 'committed'; 'approved' only from 'reviewed'
  - the signing user must be the caller: reviewerSignature/approverSignature must
    carry request.auth.uid — no signing as someone else
  - keep: delete denied, post-commit field allowlist, create must be draft with no
    recordNumber

### Task 3: SEPARATION OF DUTIES — ask me, do not decide

Even with permissions enforced, one person holding all four permissions could
record, commit, review AND approve the same record. Most accredited laboratories
require the reviewer to be someone other than the recorder.

ASK ME whether rules should enforce reviewer != createdBy, and approver != reviewer.
Do not implement either until I answer.

### Task 4: Verification

Rules cannot be proven by unit tests alone. Either:
  (a) set up @firebase/rules-unit-testing against the Firestore emulator and write
      real tests for each rule branch — preferred; or
  (b) if the emulator cannot run here, say so plainly and give me a MANUAL test
      procedure: exact steps, expected allow/deny per case, so I can verify myself.

Do NOT claim the rules work because they read correctly.

## CONSTRAINTS

- Change firestore.rules and tests only. No application logic, no UI.
- SHOW ME the proposed rules before applying them.
- Do NOT attempt to fix the ADR-008 counter risk here — out of scope, needs a
  Cloud Function.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing work.
- If unsure, ask (RULE 1, RULE 7).

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Proposed rules, shown BEFORE applying
  3. Your separation-of-duties question, asked and answered
  4. Emulator tests, or a manual verification procedure
  5. npm test and tsc output
  6. Explicit statement of what these rules do NOT protect (the ADR-008 risk)
  7. Anything unverified, stated as UNVERIFIED
```

### Verification checklist for Phase 5c

- [ ] Lifecycle writes check the caller's actual permissions, not just authentication
- [ ] Transition order enforced: draft → committed → reviewed → approved
- [ ] Signatures must carry the calling user's uid
- [ ] Separation of duties asked, not assumed
- [ ] Emulator tests exist, **or** a manual procedure was provided and the limitation stated
- [ ] `delete` still denied; create still restricted to draft without a number
- [x] ADR-008's counter risk explicitly noted as still open

### Phase 5c outcome: PASSED — but DO NOT DEPLOY the rules until Phase 5d

530/530 tests, `tsc` clean. Rules written and applied to the file, plus
`docs/PHASE_5C_RULES_MANUAL_VERIFICATION.md` (~20 cases).

Handled well: the session found a **contradiction in the Phase 5c prompt** — it
demanded signer-identity enforcement *and* "rules only", when `DigitalSignature` has
no uid field to check against. It surfaced the conflict and obtained authorisation
rather than silently dropping the requirement or silently exceeding scope. It also
refused to write emulator tests it could not execute (no Java available) and wrote a
manual procedure instead, which is what the prompt asked for.

#### Two defects found in review

1. **The permission fallback fails OPEN.**
   `!exists(roles/$(role)) && (role == 'admin' || role == 'staff')` grants full record
   permissions when a role document is missing. Deleting `roles/staff` to revoke
   access would instead grant it. Rules must fail closed.
   *Partly my prompt's fault — fail-closed behaviour was never specified.*
2. **Every technician holds approval authority by default.**
   `DEFAULT_ROLE_PERMISSIONS.standardUser` excludes `users.*`, `roles.*`,
   `equipmentTypes.*`, and `recorderTemplates.*` — but not `records.*`. An omission,
   not a decision.

---

## Phase 5d — Fix the rule defects, then verify before deploying

**Model: Claude Sonnet 5 · Effort: High**

Small change set, high consequence. Both fixes are decided; no design work remains.

### Prompt

```
Read first:
  - CLAUDE.md — hard rules
  - docs/adr/ADR-005-record-lifecycle.md — the "Permission model and separation of
    duties" section is the specification for this phase
  - firestore.rules — the records block from Phase 5c
  - src/services/roleService.ts — DEFAULT_ROLE_PERMISSIONS

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

git branch / git worktree list / git status / netstat -ano | grep ":5173"
Verify any dev server points at THIS directory. Pre-existing uncommitted work is NOT
yours. recorder-reserved/ is an archive. STOP and ask if anything differs.

## FIX 1 — make the permission check fail CLOSED

In firestore.rules, `callerHasPermission` currently grants full permissions when
`roles/{role}` does not exist, for `admin` and `staff`. Remove that fallback
entirely.

New behaviour: a missing role document means NO permissions, for EVERY role
including admin. The check becomes simply: the role document exists AND the action
is in its permissions array.

Rationale (ADR-005): rules are the last line of defence, not a mirror of the
client's graceful-degradation fallback. As written, deleting a role document to
revoke access would grant it instead.

## FIX 2 — remove review and approve from the technician default

In roleService.ts, `DEFAULT_ROLE_PERMISSIONS.standardUser` must ALSO exclude:
    records.review
    records.approve

Keep `records.commit` and `records.revise` — technicians record, commit, and raise
revisions. Only admins review and approve (ADR-005).

Follow the existing filter style in that function.

## FIX 3 — pre-deploy safety check

Write a small read-only script (same pattern as scripts/reportEquipmentTypeNames.ts,
using GOOGLE_APPLICATION_CREDENTIALS) that reports:
  - whether roles/admin exists, and its permissions array
  - whether roles/staff exists, and its permissions array
  - how many users have role == 'admin'

Do NOT run it — I will. It exists because fail-closed rules plus a missing
roles/admin document means nobody can approve anything, fixable only via the
Firebase console.

## CONSTRAINTS

- firestore.rules, roleService.ts, the new script, and tests ONLY.
- Do NOT change lifecycle logic, the transition order, or separation-of-duties checks
  — those are correct as built.
- Do NOT attempt the ADR-008 counter risk. Still out of scope, still needs a Cloud
  Function.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing work.
- SHOW ME the revised rules before applying.
- If unsure, ask (RULE 1, RULE 7).

## TESTS

Update any test asserting the old standardUser default. Add a test proving
standardUser does NOT include records.review or records.approve, and DOES include
records.commit and records.revise.
Update docs/PHASE_5C_RULES_MANUAL_VERIFICATION.md for the fail-closed change — add
cases for "role document missing" expecting DENY.
Run npm test and tsc --noEmit. Report both.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Revised rules, shown BEFORE applying
  3. Diff summary per file
  4. npm test and tsc output
  5. The pre-deploy script, NOT run
  6. A plain-language deploy checklist for me: what to verify, in what order,
     before publishing these rules
  7. Anything unverified, stated as UNVERIFIED
```

### Verification checklist for Phase 5d

- [ ] Permissive fallback removed — missing role document denies, for all roles
- [ ] `standardUser` excludes `records.review` and `records.approve`
- [ ] `standardUser` still includes `records.commit` and `records.revise`
- [ ] Pre-deploy script written, not run
- [ ] Manual-verification doc updated with missing-role DENY cases
- [ ] Transition order and separation-of-duties checks left unchanged
- [x] A deploy checklist written in plain language

### Phase 5d outcome: PASSED (verified 2026-07-30)

533/533 tests, `tsc` clean. Verified in code: `callerHasPermission`
(`firestore.rules:237-241`) has no fallback and fails closed;
`DEFAULT_ROLE_PERMISSIONS.standardUser` (`roleService.ts:129`) excludes
`records.review` and `records.approve` while retaining `records.commit` and
`records.revise`. Rules comment syntax confirmed valid by direct read, since there is
no offline linter for this file.

Step 6 of the session's deploy checklist is a good addition I had not asked for: after
publishing, do one real end-to-end pass (draft → commit → review → approve) because
the Rules Playground simulates rather than executes.

**Note for whoever deploys:** `roleService.ts` contains a `FALLBACK_ADMIN_ROLE`
constant, which implies the application was written expecting `roles/admin` may not
exist. That makes the pre-deploy script genuinely load-bearing, not a formality.

---

## Phase 6 — PDF record table

**Model: Claude Opus 5 · Effort: High**

Opus because this edits `pdfTemplateRenderer.ts`, which has existing callers and
tests, and because ADR-004's first version was wrong about this very file — the risk
of reasoning from the wrong premise here is proven rather than hypothetical.

### Prompt

```
Read first, in order:
  - CLAUDE.md — hard rules
  - docs/adr/ADR-004-pdf-record-table-band.md — READ THE REVISION NOTE AT THE TOP.
    This ADR was rewritten after its original premises proved false.
  - docs/DATA_MGMT_MODULE_AUDIT.md section 5 — including the CORRECTION block
  - docs/adr/ADR-011-number-precision-and-formatting.md — display formatting
  - docs/adr/ADR-010-evaluation-contexts-and-summary-fields.md — summary fields
  - src/services/pdfTemplateRenderer.ts — the LIVE renderer

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

git branch / git worktree list / git status / netstat -ano | grep ":5173"
Verify any dev server points at THIS directory. Pre-existing uncommitted work is NOT
yours. recorder-reserved/ is an archive. STOP and ask if anything differs.

## CRITICAL — THERE ARE TWO PDF TYPE SYSTEMS. USE THE RIGHT ONE.

  LIVE:  src/modules/pdf-template-builder/types.ts  (PdfElementType, PdfElement,
         positions in pt, `pages`) — rendered by services/pdfTemplateRenderer.ts
  DEAD:  src/types/pdfTemplate.ts  (ReportTemplate, ReportSection, DataSourceKey,
         positions in mm) — NO live callers found; only components/pdf/ imports it

Work in the LIVE system. Do NOT touch, import from, or delete the dead one
(RULE 2 — it is reported as dead, not authorised for removal).

## WHAT ALREADY EXISTS — verify; this list may be stale. If it does not match, STOP.

There is ALREADY a working generic pagination mechanism. Do NOT build a new one, and
do NOT reach for jspdf-autotable directly:
  - ElementSlicePlan { elementId, slices, splitCount }        (~line 72)
  - buildElementSlicePlansForTemplatePage()                    (~line 394)
  - countSubPagesFromPlans()                                   (~line 380)
  - computeTableRowSlices()  — ALREADY reserves headerHeight per slice,
    so header repeat on continuation pages is already solved   (~line 354)
  - getTableViewportHeight()                                   (~line 344)
  - planEquipmentTableElement()  — THE REFERENCE IMPLEMENTATION TO COPY (~line 417)

Note: `treb-table` is marked dynamic but is explicitly EXCLUDED from slicing
(~line 174, ~line 384) — it never paginates. Do not model on it.

There is NO displacement model. Absolute positions stay fixed; overflow creates
sub-pages, and static elements repeat via `repeatOnOverflowPages ?? true`.

## SCOPE

### Task 1: Add a `record-table` element
  - Add 'record-table' to PdfElementType in modules/pdf-template-builder/types.ts
  - Define RecordTableElement: which record columns to include (SECTION_COLUMN keys),
    section-grouping header, cell/header styles, optional explicit height
  - Register in elementIsDynamic() as dynamic by default
  - Add its branch to buildElementSlicePlansForTemplatePage()

### Task 2: Implement the slice-plan contract
Write measureRecordTableHeights() and planRecordTableElement(), modelled directly on
measureEquipmentTableHeights / planEquipmentTableElement. Reuse computeTableRowSlices
and getTableViewportHeight — do not reimplement them.

### Task 3: Formatting — measure what will actually be drawn
Cells must render through the column's NumberFormat: fixed vs scientific, decimals
(ADR-011). Display only — NEVER round stored values.
measureRecordTableHeights MUST measure the FORMATTED string, not the raw number, or
row heights will be wrong.

### Task 4: Section grouping
Render sections as a spanning header row above the column headers, matching the
on-screen grid.

### Task 5: Summary fields
Make evaluated summary values bindable as ordinary scalar elements
(record.summary.<id>). No table machinery needed for these.

### Task 6: Dynamic column count
Rounds are ordinary columns (ADR-006), so column count varies per template. Column
widths must be computed or declared proportionally — an author cannot fix x positions.

## CONSTRAINTS

- Do NOT build a new pagination engine. Use ElementSlicePlan.
- Do NOT use jspdf-autotable directly for this element.
- Do NOT touch src/types/pdfTemplate.ts or src/components/pdf/.
- Do NOT bypass pdfFontManager — Thai/complex-script layout is already solved there.
- Do NOT round stored values.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing work.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

Extend src/services/__tests__/pdfTemplateRenderer.test.ts.
Cover: a table longer than one page splits into the right number of sub-pages;
column headers repeat on every slice; a 3-round and a 5-round template both render
with correct column counts; formatted values (fixed AND scientific) are what get
measured and drawn; summary fields bind; an explicit element height is respected.
Run npm test and tsc --noEmit. Report both.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Any point where "WHAT ALREADY EXISTS" did not match the code
  3. Diff summary per file
  4. Confirmation you used the LIVE type system, and touched neither
     types/pdfTemplate.ts nor components/pdf/
  5. Confirmation no new pagination logic was written — name the existing functions
     you reused
  6. npm test and tsc output
  7. Anything unverified, stated as UNVERIFIED
```

### Verification checklist for Phase 6

- [ ] Worked in `modules/pdf-template-builder/types.ts`, not `types/pdfTemplate.ts`
- [ ] `record-table` added to `PdfElementType` and to `elementIsDynamic`
- [ ] `planRecordTableElement` reuses `computeTableRowSlices` and `getTableViewportHeight`
- [ ] **No new pagination engine; no direct jspdf-autotable use**
- [ ] Row heights measured from the FORMATTED string, not the raw value
- [ ] Stored values never rounded
- [ ] Section grouping renders as a spanning header row
- [ ] Summary fields bindable as scalars
- [ ] Varying round counts produce correct column counts
- [ ] `pdfFontManager` used; Thai layout not bypassed
- [x] `types/pdfTemplate.ts` and `components/pdf/` untouched

### Phase 6 outcome: PASSED (verified 2026-07-30)

539/539 tests, `tsc` clean. Verified in code: `record-table` registered in
`elementIsDynamic` (`:332`) and in the slice-plan dispatch (`:414`);
`planRecordTableElement` reuses `getTableViewportHeight` and `computeTableRowSlices`
(`:460-461`); no `jspdf-autotable` import; draw logic in a new
`pdf-renderers/renderRecordTable.ts`, matching the existing sibling pattern.

**Row heights measured from the formatted string** (`:1329` —
`formatRecordValueForPdf(row[col.key], col.column)`), which was the requirement most
likely to be missed. Better than specified: `headerHeight` includes the section-header
height as well as the column-header height (`:1336`), so `computeTableRowSlices`
reserves both on every slice and the spanning section header repeats on continuation
pages too.

Also handled well: adding to `PdfElementType` broke two other exhaustive
`switch (element.type)` statements in `models/PdfElement.ts` via `assertNever`. Those
weren't in the prompt's file list; the session fixed them because `tsc` demanded it
and flagged the deviation. And it verified that `pdfDataResolver`'s generic dot-path
fallback already resolves `record.summary.MAXDEV` with **zero code changes** rather
than adding a special case.

#### The feature is complete but not yet REACHABLE

Two gaps the session flagged honestly:

1. **No authoring UI** — there is no "Insert Record Table" control in the template
   builder, so an author cannot place the element.
2. **No print entry point** — nothing populates `jobData.record` and
   `jobData.recordTemplate` from a real `CalibrationRecord` plus its pinned
   `RecorderTemplateVersion`.

The renderer is correct and tested; nobody can invoke it. That is Phase 7.

---

## Phase 7 — Wire the record certificate end to end

**Model: Claude Sonnet 5 · Effort: High**

UI and plumbing over parts already built and tested. The last phase needed to make the
module usable.

### Prompt

```
Read first:
  - CLAUDE.md — hard rules
  - docs/adr/ADR-004-pdf-record-table-band.md — including its revision note
  - docs/adr/ADR-005-record-lifecycle.md — version pinning; which states may print
  - docs/PHASE_PROMPTS.md — the Phase 6 outcome, especially the two gaps

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

git branch / git worktree list / git status / netstat -ano | grep ":5173"
Verify any dev server points at THIS directory. Pre-existing uncommitted work is NOT
yours. recorder-reserved/ is an archive. STOP and ask if anything differs.

## WHAT ALREADY EXISTS — verify; may be stale. If it does not match, STOP and say so.

  - record-table element type + renderer + slice planning (Phase 6). WORKING.
    The renderer expects two keys on the render context: `record` (CalibrationRecord)
    and `recordTemplate` (RecorderTemplate — the PINNED snapshot, not the live doc).
  - calibrationRecordService — records and lifecycle (Phase 5a)
  - recorderTemplateService.getVersion(templateId, version) — pinned snapshots
  - pdfTemplateRenderer, pdfDataResolver — `record.summary.<id>` already resolves
  - LIVE PDF types: modules/pdf-template-builder/types.ts. Do NOT touch
    src/types/pdfTemplate.ts or src/components/pdf/ (dead, RULE 2)

## SCOPE

### Task 1: Authoring — let an author place a record table
Add "Record Table" to the template builder's element palette, and a properties panel
for it: which columns to include (from the selected RecorderTemplate's sections and
columns), show/hide section headers, cell and header styles, explicit height.
Follow the existing equipment-table element's palette and panel patterns.

### Task 2: Print entry point
From a record, produce a PDF:
  - resolve the record's PINNED template version via
    recorderTemplateService.getVersion(record.templateId, record.templateVersion) —
    NEVER the live template document (ADR-005)
  - build the render context with `record` and `recordTemplate` populated
  - render through the existing pdfTemplateRenderer

### Task 3: Which PDF template, and which states may print
Decide (and ASK ME if ambiguous) how a record maps to a PDF template, and which
lifecycle states may be printed. My expectation: drafts must be clearly marked
UNAPPROVED or blocked entirely, since an unapproved calibration certificate leaving
the lab is a serious problem. Propose, do not assume.

### Task 4: Preview
Reuse the existing preview modal patterns rather than building a new one.

## CONSTRAINTS

- Do NOT modify the Phase 6 renderer logic — it is verified. Wire to it.
- Do NOT resolve the live template when a pinned version exists.
- Do NOT touch src/types/pdfTemplate.ts or src/components/pdf/.
- Do NOT delete anything; do NOT touch recorder-reserved/ or pre-existing work.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

A record renders using its pinned version, proven by editing the live template and
showing output unchanged. A record with no pinned version fails cleanly. Column
selection round-trips on the element. Draft-state printing behaves per Task 3.
Run npm test and tsc --noEmit. Report both.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Any point where "WHAT ALREADY EXISTS" did not match
  3. Your Task 3 proposal, and my answer
  4. Diff summary per file
  5. Proof the PINNED version is used, not the live template
  6. npm test and tsc output
  7. Anything unverified, stated as UNVERIFIED
```

### Verification checklist for Phase 7

- [ ] "Record Table" placeable from the builder palette, with a properties panel
- [ ] Column selection round-trips on the element
- [ ] Print resolves the **pinned** version via `getVersion`, never the live template
- [ ] Proven by test: editing the live template does not change existing output
- [ ] Draft-state printing decided deliberately and marked or blocked
- [ ] Existing preview patterns reused; no new modal invented
- [ ] Phase 6 renderer logic unmodified
- [ ] `types/pdfTemplate.ts` and `components/pdf/` untouched

### Known limitation carried forward (ADR-004)

A record table too **wide** for the page does not split horizontally — it must fit,
be scaled, or use landscape. Test against your widest real template (highest round
count × most columns) before relying on it.

### Phase 7 outcome: PASSED (verified 2026-07-30)

564/564 tests, `tsc` clean. Verified in `recordTemplatePrintService.ts`:
`getVersion(record.templateId, record.templateVersion)` at `:49` — the pinned
snapshot, never the live document; a missing pinned version fails cleanly rather than
falling back; `assertPrintable` blocks drafts *before* any template resolution.

Lifecycle gating as decided:

| Status | Prints? | Watermark |
|---|---|---|
| draft | **blocked** | — |
| committed | yes | UNAPPROVED — NOT YET REVIEWED |
| reviewed | yes | UNAPPROVED — PENDING FINAL APPROVAL |
| superseded | yes | SUPERSEDED — SEE REVISION |
| approved | yes | none |

Reuse rather than reinvention throughout: `addWatermark` from `documentPdfService`,
`TemplateSelectorModal`, `useTemplatePdfWorkflow`, and
`TemplateBasedDocumentsPdfGenerator` as the model. One design note worth keeping —
pinned-version resolution lives in exactly one function, with a comment saying so,
"so it can't be forgotten by a caller."

**A verification technique worth reusing:** the pinned-version test mocks
`recorderTemplateService` with *only* `getVersion` implemented, deliberately omitting
`getTemplateById` and `getActiveTemplateByEquipmentTypeId`. If the service ever reached
for a live-template path, the test fails with "not a function." That proves absence,
which assertions normally cannot.

---

# BUILD COMPLETE — remaining owner actions

All eight phases verified. 564 tests. The module is reachable end to end.
What is left is not code.

## 1. Firestore rules — ✅ DONE (2026-08-04)

> ### ✅ PUBLISHED AND VERIFIED BY EXECUTION
>
> The owner published the rules and then ran the **entire** manual verification
> procedure in `PHASE_5C_RULES_MANUAL_VERIFICATION.md` against the live rules in
> `scs-lims`. **Every case matched its expected Allow/Deny.** Scratch documents
> cleaned up.
>
> Confirmed complete on 2026-08-04:
>
> - [x] Full test matrix executed, all cases as expected
> - [x] Group 8 (fail-closed) was a **valid** test — the owner caught that the
>       walkthrough's Step 3 gave TECH the `staff` role, which would have made 8a
>       a no-op, and set the role to `admin` for the test. Fail-closed behaviour is
>       genuinely confirmed.
> - [x] The temporarily elevated user's `role` restored to `staff`
> - [x] `roles/admin` recreated with its original `permissions` array after 8a/8b
> - [x] Every real user has an explicit `role` field
> - [x] Scratch documents deleted
>
> **The `records` rules are no longer an unverified claim.** This was the single
> largest one across all eight phases.
>
> Still outstanding for this section: **one real end-to-end pass in the app** —
> create a draft, commit it, review it as a second person, approve it as a third.
> The Playground simulates individual requests; it does not prove the application
> wires the sequence together correctly.

The pre-deploy readiness script remains available if roles or admin counts ever need
re-checking (e.g. after staff changes):

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\your-key.json"
npm run report:record-permission-rollout
```

> ### ⚠ Look for DOCUMENT IDs, not the names the app shows you
>
> The interface displays **"Administrator"** and **"Standard user"**. Those are labels,
> produced by `getRoleDisplayName()` (`roleService.ts:157-172`).
>
> What is stored on a user, and what the Firestore rules check, is the role
> **document ID**:
>
> | Shown in the app | Document ID | Firestore path |
> |---|---|---|
> | Administrator | `admin` | `roles/admin` |
> | Standard user | `staff` | `roles/staff` |
>
> In the console, look for documents whose **ID** is `admin` and `staff`. Their `name`
> field will read "Administrator" and "Standard user". **Do not conclude the documents
> are missing because nothing is called "Administrator".** Verified: `UserModal.tsx:470`
> uses `<option key={r.id} value={r.id}>`, so the picker stores the ID and displays the
> name; `userService.ts` reads and writes `role` as the ID throughout.

- [ ] `roles/admin` **exists** (document ID `admin`), and its permissions include
      `records.review` and `records.approve`. `roleService.ts` contains a
      `FALLBACK_ADMIN_ROLE` constant, which implies the app was written expecting this
      document may be absent. With fail-closed rules and no `roles/admin`, **nobody can
      approve anything**, and it cannot be fixed from inside the app — only via the
      Firebase console.
- [ ] `roles/staff` **exists** (document ID `staff`), with `records.commit` and
      `records.revise`, or technicians cannot commit.
- [ ] **Every user document has an explicit `role` field.** `userService.ts:113,169`
      defaults a missing role to `'staff'` **on the client only**. The rules read
      `users/{uid}.role` directly, so an absent field resolves to nothing, `exists()`
      fails, and the write is denied. That user would see the Commit button and then be
      refused — a confusing failure with no visible cause.
- [OK] **Two or more admin accounts exist.** Review and approve are both admin-only and
      `approver ≠ reviewer`, so one admin cannot complete both steps. Records would
      stall at `reviewed` with no error explaining why.
- [ ] Walked `docs/PHASE_5C_RULES_MANUAL_VERIFICATION.md` in the Rules Playground,
      including the §8 fail-closed cases.
- [ ] After publishing, one real end-to-end pass: draft → commit → review → approve.

## 2. Metrology checks before any number reaches a certificate

- [ ] **Spot-check `TINV` against your own Excel.** Verified against published values
      and the archive's goldens, never against your installation.
- [ ] **Test a single-reading calibration point.** Where your spreadsheet silently
      produced `2` via `IFERROR`, this now errors until the formula spells the fallback
      out explicitly: `TINV(0.05, CAL_NU) if CAL_NU >= 1 else 2`. Better behaviour, but
      it is a change — meet it deliberately, not mid-calibration.
- [ ] **Confirm round-on-display is what you want in practice.** Printed figures may not
      reconcile if recomputed from the certificate; raise declared decimals on
      intermediate columns where a report must reconcile on its face (ADR-011).

## 3. PDF reality check

- [ ] Render your **widest** real template — highest round count × most columns. A table
      too wide for the page does not split horizontally (ADR-004).
- [ ] Look at an actual generated PDF. Every phase tested against a mocked jsPDF;
      spacing, spanning-header alignment, and Thai text rendering are unverified
      visually.
- [ ] Click through the authoring UI. The palette button and properties panel compile
      and follow the equipment-table pattern, but were never seen rendered.

## 4. Source control

- [ ] **Commit this branch.** Eight phases sit uncommitted on `feature/analysis-module`,
      alongside pre-existing uncommitted work. `CLAUDE.md` exists because this project
      lost work once already; uncommitted changes are the ones a mistake destroys
      permanently.

## 5. Open items deliberately deferred

- **ADR-008 accepted risk** — record numbers can be fabricated client-side. Only a
  Cloud Function can close it. Revisit triggers are recorded in that ADR: external
  access, an assessor asking, or a duplicate number observed.
- **`equipmentTypes.view` / `.edit` permissions** remain in the catalog but are not the
  runtime gate (the screen checks `isAdmin`). Either wire them up or remove them.
- **`updateConfig`'s duplicate-name check** still reads outside its transaction. The
  lock-document pattern in `recorderTemplateService` is the fix.
- **Dead code, reported but never authorised for removal** (RULE 2): `types/pdfTemplate.ts`
  and `components/pdf/`, and `recorder-reserved/` which you confirmed is an archive.

### ⚠ BEFORE YOU DEPLOY THESE RULES

1. **Confirm `roles/admin` exists in Firestore** (console → Firestore → `roles`). With
   fail-closed rules and no such document, nobody can approve anything, and it cannot
   be fixed from inside the app.
2. **Confirm `roles/staff` exists**, or technicians cannot commit.
3. **Confirm at least two admin accounts exist.** Review and approve are both
   admin-only and `approver ≠ reviewer`, so one admin cannot complete both steps —
   records would stall at `reviewed` with no error explaining why.
4. Run the manual verification procedure in
   `docs/PHASE_5C_RULES_MANUAL_VERIFICATION.md` using the Firebase Rules Playground.
5. Only then publish.
