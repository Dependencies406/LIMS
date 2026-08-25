# Data & Information Management Module — Domain Model & Plan

Date: 2026-07-30
Status: design agreed; **not yet implemented**

Companion documents:

- [`DATA_MGMT_MODULE_AUDIT.md`](DATA_MGMT_MODULE_AUDIT.md) — verified facts about the existing codebase
- [`DATA_MGMT_MODULE_GLOSSARY.md`](DATA_MGMT_MODULE_GLOSSARY.md) — ubiquitous language
- [`adr/`](adr/README.md) — the eight decisions this model rests on

---

## 1. Aggregates

Four aggregates, each with its own consistency boundary.

```
EquipmentType  (settings-managed reference data)
      |  1
      |
      |  1
RecorderTemplate ──publishes──> RecorderTemplateVersion (immutable snapshot)
                                          ^
                                          | pinned by
                                          |
Job ──has many──> Item ──1:1──> Record ───┘
```

- **EquipmentType** — reference data. Root of the 1:1 binding. (ADR-003)
- **RecorderTemplate** — authoring aggregate. Mutable while drafting; publishing
  emits an immutable **RecorderTemplateVersion**. (ADR-005, ADR-007)
- **Record** — the transactional aggregate. Own top-level collection, own
  lifecycle, pins a template version. (ADR-002, ADR-005)
- **Job / Item** — existing aggregate. Modified only to give `Item` a required
  stable `id` and an `equipmentTypeId`.

Invariants:

1. At most one **active** RecorderTemplate per EquipmentType. (ADR-003)
2. A Record's `templateVersion` is immutable once set.
3. A Record in `Committed` or later state is immutable except for lifecycle
   transitions and revision links. (ADR-005)
4. `environment.length === templateSnapshot.roundCount`. (ADR-006)
5. A record number exists if and only if state is `Committed` or later. (ADR-008)

---

## 2. Schemas

Illustrative TypeScript. Field names are the binding part; exact placement should
follow the existing conventions in `src/types/index.ts`.

### EquipmentType — **is** the certificate number configuration (ADR-012)

There is **no separate `EquipmentType` entity.** The existing
`CertificateNumberConfig`, stored in the `certificate_number_configs` collection,
*is* the equipment type. One instrument type, one certificate series, one recorder
template — a strict 1:1:1 confirmed by the owner.

```ts
interface CertificateNumberConfig {   // = "Equipment Type" in all user-facing language
  id: string;              // STABLE KEY — referenced by Equipment and RecorderTemplate
  name: string;            // renameable display label; nothing keys on it
  prefix: string;
  separator: string;
  includeYear: boolean;
  numberPadding: number;
  currentNumber: number;
  currentSequence: number;
  currentYear: number;
  resetPolicy: 'never' | 'yearly' | 'monthly';
  lastResetAt?: Date;
  lastAllocatedAt?: Date;  // so updatedAt still means "last human edit" (ADR-012)
  isActive: boolean;
  createdAt: Date; updatedAt: Date;
}
```

> **Naming warning for developers.** The collection is called
> `certificate_number_configs` but represents **equipment types**, and fields named
> `equipmentTypeId` reference documents in it. This mismatch is deliberate:
> renaming the collection would require copying live certificate counters, the
> highest-consequence migration in this system, and the naming cost does not
> justify that risk. See ADR-012.

Removed by ADR-012: the `EquipmentType` entity and `equipment_types` collection
from Phase 1; `CertificateNumberConfig.equipmentTypeId` (self-referential); and the
long-dead free-text `CertificateNumberConfig.equipmentType` string.

### RecorderTemplate

```ts
interface RecorderTemplate {
  id: string;
  name: string;
  description?: string;
  equipmentTypeId: string;          // unique among active templates (ADR-003)

  roundCount: number;               // drives Environment Block only (ADR-006)
  defaultRowCount: number;          // initial calibration-point rows
  allowRowAdd: boolean;             // may the technician add rows?

  recordNumberFormat: {             // reuses existing config model (ADR-008)
    parts: string[];                // 1-2 fixed parts, joined by separator
    separator: string;              // default '-'
    includeYear: boolean;
    yearDigits: 2 | 4;
    numberPadding: number;
    resetPolicy: 'never' | 'yearly' | 'monthly';
  };

  sections: RecordSection[];
  summaryFields: SummaryField[];    // record-level values (ADR-010)
  customFunctions: CustomFunction[];

  status: 'draft' | 'active' | 'archived';
  version: number;                  // incremented on publish
  createdAt: Date; updatedAt: Date;
  createdBy: string; updatedBy: string;
}

interface RecordSection {
  id: string;                       // formula variable part A; /^[A-Z][A-Z0-9]*$/
  label: string;                    // shown as spanning header
  order: number;
  columns: RecordColumn[];
}

interface RecordColumn {
  id: string;                       // formula variable part B; /^[A-Z][A-Z0-9]*$/
  label: string;
  order: number;
  type: 'text' | 'number' | 'selection' | 'formula';

  numberFormat?: NumberFormat;      // type 'number' (ADR-011)
  choices?: string[];               // type 'selection'
  expression?: string;              // type 'formula'; read-only column
  preInput?: string | number;       // preset value for input types
}

/** Display-only. Stored values are always full precision. (ADR-011) */
interface NumberFormat {
  notation: 'fixed' | 'scientific';
  decimals: number;   // fixed: decimal places; scientific: mantissa decimals
}

interface CustomFunction {
  name: string;                     // /^[a-zA-Z_][a-zA-Z0-9_]*$/
  params: string[];
  expression: string;               // single expression (ADR-001)
}

/** Evaluated once per record, after all rows. Referenced as SUMMARY_<id>. */
interface SummaryField {
  id: string;                       // /^[A-Z][A-Z0-9]*$/
  label: string;
  type: 'number' | 'text';
  numberFormat?: NumberFormat;      // type 'number' (ADR-011)
  expression: string;               // summary context (ADR-010)
}
```

**Reserved section ids:** `ENV` (ADR-009) and `SUMMARY` (ADR-010). Template
validation must reject author-defined sections using either.

### RecorderTemplateVersion

```ts
interface RecorderTemplateVersion {
  id: string;                       // `${templateId}_v${version}`
  templateId: string;
  version: number;
  snapshot: RecorderTemplate;       // frozen, includes customFunctions
  publishedAt: Date; publishedBy: string;
}
```

Stored separately so that N records sharing a version share one snapshot
(ADR-005 storage mitigation).

### Record

```ts
type RecordStatus = 'draft' | 'committed' | 'reviewed' | 'approved' | 'superseded';

interface CalibrationRecord {
  id: string;
  recordNumber?: string;            // present iff status >= committed (ADR-008)

  jobId: string;                    // Job document id
  itemId: string;                   // stable Equipment.id — now required
  equipmentTypeId: string;

  templateId: string;
  templateVersion: number;          // pinned, immutable (ADR-005)

  contextSnapshot: RecordContextSnapshot;
  environment: RoundEnvironment[];  // length === roundCount (ADR-006)
  rows: RecordRow[];
  summary: Record<string, string | number | null>;  // evaluated (ADR-010)

  status: RecordStatus;
  supersedes?: string;              // recordId this revises
  supersededBy?: string;
  revisionReason?: string;

  createdAt: Date; createdBy: string;
  committedAt?: Date; committedBy?: string;
  reviewedAt?: Date; reviewerSignature?: DigitalSignature;
  approvedAt?: Date; approverSignature?: DigitalSignature;
}

/** One row = one calibration point. Keys are `${sectionId}_${columnId}`. */
type RecordRow = Record<string, string | number | null>;

interface RoundEnvironment {
  roundIndex: number;               // 1-based
  temperatureC: number;             // required
  relativeHumidity: number;         // required, %
}
```

**Note the row keying.** Flat `SECTIONID_COLUMNID` keys map 1:1 onto the formula
variable pattern, so row-by-row evaluation is a direct lookup with no
translation layer.

### RecordContextSnapshot

Captured at creation, per workflow requirement 3. Snapshotted rather than
referenced, so a certificate reprinted years later shows what was true at
calibration time — job and customer records will have moved on.

```ts
interface RecordContextSnapshot {
  job: {
    jobId: string; title: string;
    customerName: string; customerAddress: string;
    customerContact: string; customerEmail: string; customerPhone: string;
    assignedStaff: string; receivedDate: string;
  };
  item: {
    name: string; manufacturer: string; model: string;
    serialNumber: string; assetTag: string; accessories: string;
    machineLocation: string; resolution: string; unit: string;
    certificateNumber: string;
  };
  capturedAt: Date;
}
```

---

## 3. Formula evaluation

Two contexts (ADR-010). The validator is **context-aware** — the same expression
may be legal in one and illegal in the other.

### Row context

- Evaluates once per row, over `rows`.
- A variable is `SECTIONID_COLUMNID`, resolving to that column's value **in the
  current row**. No row index, no round index. (ADR-006)
- `ENV_TEMP_R{n}` / `ENV_RH_R{n}` resolve to per-round scalars, broadcast
  identically to every row. (ADR-009)
- Produces formula columns, which are read-only in the UI.
- Dependencies between formula columns require a **topological sort** per row and
  **cycle detection** — a formula column referencing another is legitimate and
  must work; a cycle is rejected at authoring time.
- **May not** reference `SUMMARY_*` or use `col_*` aggregates.

### Summary context

- Evaluates **once per record, after all rows are complete**.
- May reference `ENV_*`, other `SUMMARY_*` fields, and column aggregates
  (`col_mean`, `col_max`, `col_min`, `col_sum`, `col_count`, `col_stdev`).
- Aggregate arguments must be a **bare column reference**, not an expression.
- Summary fields may reference each other; topologically sorted, cycles rejected.

### Where expressions are written

One grammar, two places (ADR-001):

- **Custom function bodies** — `def name(params): return <expression>`, authored
  in the code editor panel.
- **Column and summary formula bars** — any expression in the subset. Not
  restricted to a bare function call: `CAL_IND - CAL_NOM`,
  `ROUND(CAL_IND - CAL_NOM, 3)`, and `error(CAL_NOM, CAL_IND) * 1.02` are all
  valid. Custom functions are for reuse, not a mandatory wrapper.

### Verifier

Runs without executing anything (satisfying draft requirement 2-2): parse; check
every name against the whitelist, the variable pattern, or the reserved sections;
check arity against declared `customFunctions`; confirm referenced sections and
columns exist; enforce context restrictions; detect cycles; and validate every
`ENV_*` round index against `roundCount`.

Recalculation order: all rows, then summary. Any cell change that feeds an
aggregate invalidates the whole summary, so summary invalidation is broader than
per-row recalculation.

---

## 4. Workflow

1. Technician opens Job -> Items tab -> selects an Item.
2. System looks up existing Records for that `itemId`:
   - none -> create Draft
   - a Draft exists -> reopen it
   - a Committed-or-later record exists -> open read-only, with an explicit
     "create revision" action (ADR-005)
3. Resolve the template by `item.equipmentTypeId` -> active RecorderTemplate ->
   pin its current published version.
4. Capture `contextSnapshot` from job and item.
5. Technician records data. Formulas recalculate live. Environment block requires
   temperature and RH for each of the `roundCount` rounds.
6. Drafts autosave locally; an unexpected close prompts recovery on return.
   **Autosave never commits** (ADR-005).
7. Commit: validate completeness, evaluate and persist summary fields, allocate
   the record number in a transaction, freeze the data (ADR-008, ADR-010).
8. PDF generation binds a Record Table Band to the record's rows (ADR-004) and
   scalar elements to `record.summary.<id>` (ADR-010).

---

## 5. Suggested phasing

Each phase should be independently shippable and verifiable.

| Phase | Scope | Why this order |
|---|---|---|
| 0 | **Fix persistence defects**: `equipmentType`, `currentSequence`, `currentYear`, `yearlyReset` silently dropped by `certificateNumberConfigService.configToDocument`. Make allocation transactional. | Small, self-contained, fixes live bugs, and everything else depends on it. (ADR-003, ADR-008) |
| 1 | **EquipmentType entity** + settings UI + migration from free-text names. | Root of the 1:1 binding; blocks template authoring. |
| 2 | **Item identity — hard gate.** Make `Equipment.id` required and **assign ids to all existing equipment items before any later phase proceeds.** | Records cannot bind to items without it. Confirmed as a blocking prerequisite, not a parallel task. (ADR-002) |
| 3 | **Expression Interpreter** + context-aware verifier, with grammar and whitelist approved first. Both contexts, `ENV_*` resolution, `col_*` aggregates. Pure logic, heavily unit-tested, no UI. | Independently testable; de-risks the highest-uncertainty piece early. (ADR-001, ADR-009, ADR-010) |
| 4 | **Recorder Template authoring**: sections, columns, round count, summary fields, custom function editor, publish/versioning. | Needs 1 and 3. |
| 5 | **Record entity + lifecycle** + recording UI on the TREB grid, autosave and recovery, transactional commit. | Needs 2, 3, 4. |
| 6 | **Record Table Band** PDF element + renderer displacement. | Needs 5 for real data to render. |
| 7 | **Template mockup / test harness** (draft requirement 3): enter sample data, see formulas evaluate. | Naturally falls out of 4 + 5; valuable but not blocking. |

Phase 3 should come before any UI work. It is the piece most likely to reveal
that the agreed subset is too small or too large, and finding that out early is
cheap.

---

## 6. Open questions — must be resolved before implementation

### Resolved

1. **Environment references in formulas** — reserved `ENV` section with
   auto-generated per-round columns. (ADR-009)

2. **Empty-value semantics — strict.** An empty cell holds an empty/blank value,
   **not zero**. If an empty value is consumed by a formula or any calculation,
   that result is an **error**, not a blank. Column aggregates likewise error if
   any contributing row is empty — a maximum deviation over an incomplete data set
   is meaningless, so this is the coherent choice.
   *UI implication:* formula columns and summary fields will show errors
   throughout data entry until the table is complete. The UI should visually
   distinguish **"awaiting input"** from **"invalid computation"** — both are
   errors, but only the second indicates a mistake. Without that distinction, a
   half-filled record is a wall of red.

4. **Row count — entered by the technician.** The technician sets the number of
   calibration-point rows when recording. `defaultRowCount` serves as a starting
   value and `allowRowAdd` is effectively always true.
   *Implication:* row count is **not** statically known at template-authoring
   time, so the PDF record table must handle a variable row count — which it does
   (ADR-004). It also means commit-time validation cannot check row count against
   a template expectation.

5. **Review and approval are two distinct steps.** The four-state lifecycle in
   ADR-005 stands as written: `Draft -> Committed -> Reviewed -> Approved`.

6. **Permissions.** Template authoring, publishing, and equipment-type management
   are **admin only**. Assigned staff create drafts, record data, and commit.
   Review and approval are separate privileged roles. Existing role definitions in
   `PermissionContext` are still **[UNVERIFIED]** and must be read before the
   mapping is implemented.

7. **Firestore rules will be adjusted** for this module — committed-record
   immutability enforced server-side, and write authorization on template
   documents (which carry user-authored expressions). Current rule content is
   still **[UNVERIFIED]**; `firestore.rules` must be read before editing.

8. **Migration ordering — assign ids to all existing equipment items first**,
   before any later phase proceeds. This makes Phase 2 a hard gate rather than a
   parallel task. Data volume remains **[UNVERIFIED]** and must be measured.

9. **`treb-table` does not paginate.** Verified: it is explicitly excluded from
   the slice-plan mechanism (`pdfTemplateRenderer.ts:174`, `:384-387`) and is
   always drawn in full on every sub-page. Extending it would not have provided
   pagination. ADR-004 was revised — the record table instead implements the
   existing `ElementSlicePlan` contract used by `equipment-table`.

10. **Number precision and formatting — round-on-display.** Values are stored at
    full precision; rounding happens only when rendering. Formulas and aggregates
    consume unrounded values, so intermediates are never rounded — the
    metrologically correct approach (the GUM advises against rounding intermediate
    results).
    Notation is an **explicit per-column choice** of `fixed` or `scientific`, with
    no magnitude-based auto-switching. The existing `decimals` field controls
    mantissa precision in scientific mode, so `decimals: 3` gives `7.882E+21`
    (uppercase `E`, always-signed exponent).
    *Accepted trade-off:* printed certificates may not self-reconcile — recomputing
    from printed figures can differ in the last digit. Handle by documenting the
    policy, and by raising declared decimals on intermediate columns where a report
    must reconcile on its face. (ADR-011)

### Still open

*None blocking. All questions raised during the grilling session are resolved.*

Remaining **[UNVERIFIED]** items requiring investigation during implementation,
not decisions:

- `PermissionContext` role definitions (needed for the Phase 1 permission mapping)
- `firestore.rules` current content (needed before adjusting rules)
- Production data volume: `Equipment.spreadsheetData`, items lacking `id`,
  distinct free-text equipment-type names (needed to estimate Phases 1–2)
- Whether `components/pdf/` + `types/pdfTemplate.ts` has any live caller
  (router check; **do not delete on the strength of this document** — RULE 2)

---

## 7. Before the implementation session

Per project `CLAUDE.md` RULE 3/4/8. The Linux shell was unavailable this session,
so these were checked by reading the filesystem directly instead.

**Verified:**

- `C:\Users\seela\OneDrive\Desktop\LIMS-New` **does not exist** (checked
  directly). The `CLAUDE.md` reference to that path is **stale** — there is only
  one working copy, at `C:\Users\seela\Desktop\LIMS-New`. The mistake-#1 risk
  (editing a copy the dev server is not watching) does not apply.
- Active branch is **`feature/analysis-module`**, not `master`
  (`.git/HEAD`).
- **No linked worktrees** — `.git/worktrees/` is absent. This is the healthy
  state RULE 6 describes.

**Still unverified:**

- `git status` — whether `feature/analysis-module` carries uncommitted work.
- Whether a dev server is running, and from where (`netstat -ano | grep ":5173"`).

**Action:** update `CLAUDE.md` to drop the stale `OneDrive` path, and confirm
whether this module's work belongs on `feature/analysis-module` or on a new
branch, before Phase 0 begins.
