# Plain-Language Guide to the Design Documents

Written for the project owner — a calibration physicist, not a software
engineer. The other design documents use software vocabulary. This one explains
that vocabulary so the rest is readable.

Where a software idea has a good metrology parallel, it is used.

---

## The formula engine — how a typed formula becomes a number

Four parts. Reading a sentence is a fair analogy.

| Term | What it means |
|---|---|
| **Lexer** | Splits your typed text into pieces: `MAX`, `(`, `q1`, `,`, `q2`, `)`. Like separating a sentence into words. |
| **Parser** | Works out the structure — which pieces are arguments to which function, what is calculated first. Like working out the grammar of the sentence. |
| **AST** | "Abstract Syntax Tree" — the structured form the parser produces. A tree of operations, like a worked calculation written out in stages rather than one long line. |
| **Evaluator** | Walks that tree and does the arithmetic. |
| **Builtins** | The function library your formulas may call: `ROUND`, `MAX`, `SQRT`, `TINV`, and so on. |
| **Whitelist** | The fixed list of names a formula is allowed to use. Anything not on the list is rejected. |
| **Interpreter** | The whole lot together — reads a formula, produces a number. |

### Why we never use "eval"

`eval` means handing your typed text straight to the computer to run as a
program. Anything typed would be executed — including something harmful. The
lexer/parser/evaluator approach reads the text ourselves and only ever performs
arithmetic with it, so a typed formula can never do anything except calculate.

This is also why the system is **deterministic** — the same formula and the same
inputs always give exactly the same result. That is what makes an old record
reproducible years later.

### Grammar and EBNF

A **grammar** is the precise rulebook for what counts as a valid formula.
**EBNF** is just a standard notation for writing that rulebook down — comparable
to writing out a measurement procedure formally instead of describing it in
prose.

### Topological sort and cycles

If column C is calculated from column B, and B from column A, the system must
calculate A, then B, then C. Working out that order automatically is called a
**topological sort**.

A **cycle** is a circular definition — A depends on B, and B depends on A. It can
never be calculated, so the system rejects it when the template is authored
rather than failing later during a calibration.

---

## Data storage

| Term | What it means |
|---|---|
| **Firestore** | The cloud database this project stores everything in. |
| **Document** | One record in that database — roughly one row, but it can hold nested structure. Hard size limit: **1 MiB** (about one million characters). |
| **Collection** | A named group of documents, e.g. all records, all jobs. |
| **Field** | One named value inside a document. |
| **Schema** | The agreed shape of a document — which fields exist and what type each holds. |
| **Migration** | A one-off job that converts existing stored data to a new shape. |
| **Backfill** | Filling in a newly added field for records that already exist. |
| **Query** | A request for the documents matching some condition. |
| **Index** | A prepared lookup structure that makes a particular query possible or fast. |

### Transactions

A **transaction** groups several database operations so they either all happen or
none do, and so that nobody else can change the data midway.

This matters for record numbers. Without one, two people committing at the same
instant could both read "last number = 40" and both write 41 — a duplicate. A
transaction forces them to take turns.

**Idempotent** means doing the same operation twice has the same effect as doing
it once. For number allocation: if a save is retried after a network hiccup, it
must not consume two numbers.

### Race condition

Two operations happening at the same time, where the result depends on which
finishes first. Almost always a bug. The duplicate-number example above is one.

---

## Code organisation

| Term | What it means |
|---|---|
| **Type / interface** | A written-down description of a data shape, which the computer checks for you. Like a form that specifies which boxes exist and whether each takes a number or text. |
| **Service** | A file grouping all operations on one kind of data (e.g. `jobService` handles jobs). |
| **Component** | One piece of user interface — a button, a modal, a grid. |
| **Module** | A folder holding one self-contained feature. |
| **Refactor** | Restructuring code without changing what it does. |
| **Dead code** | Code still present but no longer used by anything. |
| **Dependency** | An outside library the project relies on. |
| **Regression** | Something that used to work and has broken. |
| **Unit test** | A small automatic check that one piece of code gives the right answer. Comparable to running a known reference standard through your process to confirm it reads correctly. |
| **Golden test** | A test comparing output against a known-correct reference result — for instance, your validated Excel workbook. |

---

## Version control (Git)

| Term | What it means |
|---|---|
| **Repository** | The project folder, with its complete history. |
| **Commit** | A saved snapshot of changes, with a message. |
| **Branch** | A parallel line of work. `feature/analysis-module` is the branch this work is on. |
| **Uncommitted changes** | Edits made but not yet snapshotted — these are the fragile ones. |
| **Staged** | Marked as ready to include in the next snapshot. |
| **Worktree** | A second folder containing another branch of the same project at the same time. These caused the earlier data-loss incident recorded in `CLAUDE.md`. |
| **Diff** | The list of exactly what changed between two versions. |

---

## PDF rendering

| Term | What it means |
|---|---|
| **Render** | Draw the final output — turn the template plus the data into an actual PDF. |
| **Element** | One item on the page: text, a line, an image, a table. |
| **Absolute positioning** | An element is placed at fixed coordinates on the page, e.g. 40 mm from the left, 60 mm from the top. |
| **Dynamic / flowing** | An element whose size is unknown until the data arrives — a table whose row count depends on how many calibration points were recorded. |
| **Pagination** | Splitting content across pages when it does not fit on one. |
| **Slice** | One page's worth of a table that had to be split. |
| **Sub-page** | An extra physical page generated because a table overflowed. |
| **Viewport** | The space available for an element before it must break to the next page. |

---

## Terms specific to this design

| Term | Meaning here |
|---|---|
| **ADR** | "Architecture Decision Record" — one short document per significant decision, recording what was chosen, what was rejected, and why. So that in a year nobody has to guess at the reasoning. |
| **Aggregate** | A group of data that must stay internally consistent and is saved as a unit. |
| **Invariant** | A rule that must always hold. Example: a committed record can never be edited. |
| **Row context** | Calculating once per row — per calibration point. |
| **Summary context** | Calculating once per whole record — a maximum deviation, an overall pass/fail. |
| **Broadcast** | One value applied to every row. The temperature for a round is the same for all rows in that round. |
| **Pinning** | A record permanently remembers which version of the template produced it, so editing the template later cannot alter an already-issued record. |
| **Snapshot** | A copy of information taken at a moment in time and stored with the record, so later changes elsewhere do not alter what the certificate said. |
| **Reserved section** | A section name the system uses internally and the template author may not reuse: `ENV` and `SUMMARY`. |
| **`[UNVERIFIED]`** | A note meaning: not actually checked. Used deliberately, because guessing has caused real damage on this project before. |

---

## The rounding decision, in your language

This one is metrology rather than software, and you chose it already.

**Round-on-display** — the system stores and calculates at full precision, and
rounds only when printing. Intermediate results are never rounded, matching GUM
guidance. The trade-off: figures printed on a certificate may not exactly
reconcile if someone recalculates from the printed values, because the real
calculation used more digits than were shown.

**Round-on-store** (not chosen) — round every intermediate result to its declared
decimal places. Certificates then reconcile exactly, but rounding error
accumulates through a chain of calculations.
