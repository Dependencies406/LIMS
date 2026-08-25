# Formula Language — Approved Grammar and Function Whitelist

Date: 2026-07-30
Status: **APPROVED** — this is the specification Phase 3 implements
Authority: [ADR-001](adr/ADR-001-expression-interpreter.md),
[ADR-009](adr/ADR-009-environment-references.md),
[ADR-010](adr/ADR-010-evaluation-contexts-and-summary-fields.md),
[ADR-011](adr/ADR-011-number-precision-and-formatting.md)

ADR-001 required this grammar and whitelist be approved before any parser code is
written. This document is that approval. Changes to it after Phase 3 begins are
ADR-level decisions, not implementation details.

If any term here is unfamiliar, see [`PLAIN_LANGUAGE_GUIDE.md`](PLAIN_LANGUAGE_GUIDE.md).

---

## 1. What a formula may contain

- Arithmetic: `+  -  *  /  **`, and unary minus
- Comparisons: `==  !=  <  <=  >  >=`
- Boolean logic: `and`, `or`, `not`
- One conditional form: `"PASS" if CAL_ERR <= CAL_TOL else "FAIL"`
- Parentheses, numbers (including scientific notation), double-quoted text
- Calls to whitelisted builtins and to user-defined custom functions
- Column references written `SECTIONID_COLUMNID`, e.g. `CAL_IND`

**Never allowed:** loops, `if`/`elif`/`else` blocks, self-assigned variables,
`import`, classes, lambdas, `try`, indexing (`x[0]`), attribute access (`x.foo`),
floor division (`//`), modulo (`%`), and any name not resolvable per §4.

---

## 2. Grammar (EBNF)

```ebnf
expression      = ternary ;
ternary         = or_expr , [ "if" , or_expr , "else" , expression ] ;
or_expr         = and_expr , { "or" , and_expr } ;
and_expr        = not_expr , { "and" , not_expr } ;
not_expr        = [ "not" ] , comparison ;
comparison      = additive , [ comp_op , additive ] ;
comp_op         = "==" | "!=" | "<" | "<=" | ">" | ">=" ;
additive        = multiplicative , { ( "+" | "-" ) , multiplicative } ;
multiplicative  = unary , { ( "*" | "/" ) , unary } ;
unary           = [ "-" ] , power ;
power           = primary , [ "**" , unary ] ;
primary         = number
                | string
                | identifier , [ "(" , [ arg_list ] , ")" ]
                | "(" , expression , ")" ;
arg_list        = expression , { "," , expression } ;

identifier      = ( letter | "_" ) , { letter | digit | "_" } ;
number          = digit , { digit } , [ "." , digit , { digit } ]
                            , [ ( "e" | "E" ) , [ "+" | "-" ] , digit , { digit } ] ;
string          = '"' , { any character except '"' } , '"' ;

funcdef         = "def" , identifier , "(" , [ param_list ] , ")" , ":" , NEWLINE ,
                  INDENT , "return" , expression ;
param_list      = identifier , { "," , identifier } ;
```

### Precedence, loosest to tightest

1. `if … else` (ternary)
2. `or`
3. `and`
4. `not`
5. comparisons
6. `+` `-`
7. `*` `/`
8. unary `-`
9. `**` (right-associative)
10. function call, parentheses

Consequences to preserve, both matching Python:

- `-2 ** 2` evaluates to `-4` — unary minus binds looser than `**`
- `2 ** 3 ** 2` evaluates to `512`, i.e. `2 ** (3 ** 2)`

### Deliberate restrictions, with required error messages

| Restriction | Example | Required message |
|---|---|---|
| One comparison only, no chaining | `0 < x < 10` | "Chained comparisons are not supported. Write `0 < x and x < 10` instead." |
| One `not` only | `not not x` | "Repeated `not` is not supported." |
| No floor division | `a // b` | "`//` is not supported. Use `/`." |
| No modulo | `a % b` | "`%` is not supported." |
| No escape sequences in strings | `"say \"hi\""` | "Quotes cannot be used inside text. Use different wording." |

Python permits chained comparisons, but its semantics there are subtle (each
operand evaluated once, with short-circuiting). Excluding them and giving a
precise message is safer than implementing them subtly wrong.

### Scientific notation in literals

Required, per ADR-011 and because calibration constants need it:

```
11.5e-6          # coefficient of thermal expansion, /°C
7.882E+21
1e-3
```

---

## 3. Function whitelist

### General builtins — valid in both contexts

ALL-CAPS, following the archived reference engine's convention.

| Function | Arity | Behaviour |
|---|---|---|
| `ABS(x)` | 1 | Absolute value |
| `SQRT(x)` | 1 | Square root. Negative input is an error, not NaN |
| `ROUND(x, dp)` | 2 | **Excel-style half-away-from-zero** — see the warning below |
| `TRUNC(x [, dp])` | 1–2 | Truncate toward zero; `dp` defaults to 0 |
| `MAX(...)` | 1+ | Variadic maximum |
| `MIN(...)` | 1+ | Variadic minimum |
| `AVERAGE(...)` | 1+ | Variadic arithmetic mean |
| `SUM(...)` | 1+ | Variadic sum |
| `RSS(...)` | 1+ | Root-sum-square, `sqrt(Σx²)` — uncertainty combination |
| `STDEV(...)` | 1+ | Sample standard deviation (n−1 denominator) |
| `TINV(alpha, nu)` | 2 | Two-tailed inverse Student-t, Excel-matching **including its degrees-of-freedom truncation quirk** |

`IF(cond, a, b)` is **deliberately excluded.** The ternary
(`a if cond else b`) is the single conditional form. The archived engine had
`IF()`; it is not carried over, because two spellings of one concept is test and
documentation surface for no benefit.

> ### ⚠ `ROUND` intentionally does NOT match Python
>
> Python's built-in `round()` uses banker's rounding (half-to-even), so
> `round(0.5)` is `0` and `round(1.5)` is `2`.
>
> `ROUND` here uses **half-away-from-zero**, matching Excel and the archived
> `numeric.ts`: `ROUND(0.5, 0)` is `1`, `ROUND(-0.5, 0)` is `-1`.
>
> **This divergence is deliberate**, so that results reconcile against the
> lab's existing spreadsheets. It must be covered by a test whose comment says
> exactly this, or a future maintainer will "fix" it and silently change
> historical calculations.

### Column aggregates — summary context ONLY

Lowercase `col_*`, per ADR-010.

`col_mean(COL)` · `col_max(COL)` · `col_min(COL)` · `col_sum(COL)` ·
`col_count(COL)` · `col_stdev(COL)`

- The argument must be a **bare column reference** — never an expression.
  `col_mean(CAL_IND)` is valid; `col_mean(CAL_IND * 2)` is not.
- Using any `col_*` in a row formula is an error: "Column aggregates can only be
  used in summary fields, not in column formulas."
- They may **not** appear inside custom function bodies (see §5).

---

## 4. Name resolution

The grammar treats every name as a plain `identifier`. Meaning is assigned
afterwards by the validator — this is what lets `ENV_TEMP_R1` and `CAL_IND` work
with no grammar changes (ADR-009).

**If followed by `(`** it is a call, and must resolve to one of:

1. a general builtin (§3)
2. a `col_*` aggregate — summary context only, outside function bodies
3. a declared custom function

**Otherwise** it is a value, and must resolve to one of:

1. a parameter of the enclosing custom function (inside a `funcdef` body only)
2. a column reference `SECTIONID_COLUMNID` that exists in the template
3. `ENV_TEMP_R{n}` or `ENV_RH_R{n}` where `1 ≤ n ≤ roundCount` (ADR-009)
4. `SUMMARY_<fieldId>` — summary context only

Anything else is an error naming the unresolved identifier and, where possible,
suggesting the closest valid name.

### Collisions — all rejected at authoring time

A custom function name must not:

- match a general builtin (`def ROUND(...)`)
- match a `col_*` aggregate name
- match any existing column reference (`def CAL_IND(...)`)
- begin with `ENV_` or `SUMMARY_`
- duplicate another custom function name

A **parameter** name must not:

- match an existing column reference
- begin with `ENV_` or `SUMMARY_`
- **match a general builtin or `col_*` aggregate name** (`def f(ROUND)`)
- **duplicate another parameter of the same function** (`def f(a, a)`)

> **Corrected 2026-07-30.** The original draft of this section enumerated only
> the first two parameter rules while also stating "no shadowing is permitted
> anywhere". The enumerated list was incomplete; the broad statement was the
> intent. `def f(ROUND): return ROUND * 2` must be rejected — inside that body,
> a later `ROUND(x, 2)` call would be genuinely ambiguous. Duplicate parameter
> names were not enumerated at all and are plainly a mistake worth catching.

No shadowing is permitted anywhere. Shadowing in a formula language authored by
non-programmers produces bugs that are extremely hard to see on the page.

---

## 5. Custom functions

```python
def percent_error(nominal, indicated):
    return (indicated - nominal) / nominal * 100
```

- Exactly one `return`, of exactly one expression (ADR-001).
- **A function's only data inputs are its parameters.** A body may **not**
  reference columns, `ENV_*`, or `SUMMARY_*` directly, and may not use `col_*`.

  This makes every custom function a pure function of its arguments: independently
  testable, reusable, and valid in both evaluation contexts without change. It also
  matches the original requirement's `functionName(A_B)` form, where data is passed
  in rather than reached out for.

- **A function may call other custom functions** (owner decision, 2026-07-30):

  ```python
  def error(nominal, indicated):
      return indicated - nominal

  def percent_error(nominal, indicated):
      return error(nominal, indicated) / nominal * 100
  ```

  Requirements this creates:

  - Build a **call graph** across all custom functions in the template.
  - **Topologically sort** it to determine evaluation order.
  - **Reject cycles**, direct (`a` calls `a`) and indirect (`a` → `b` → `a`), at
    authoring time with a message naming the cycle. This is the same machinery
    already required for column dependencies, so it is reuse rather than new work.
  - Enforce a **recursion-depth cap** as defence in depth, so that a bug in cycle
    detection degrades into an error rather than a frozen browser.

- Arity is checked at authoring time: calling a 2-parameter function with 3
  arguments is a validation error, not a runtime one.

---

## 6. Evaluation semantics

### Two contexts (ADR-010)

| | Row context | Summary context |
|---|---|---|
| Runs | Once per row | Once per record, after all rows |
| Can see | Columns (current row), `ENV_*` | `ENV_*`, `SUMMARY_*`, `col_*` aggregates |
| Cannot see | `SUMMARY_*`, `col_*` | — |
| Produces | Formula columns | Summary fields |

Row formulas may never reference summary fields — summary depends on all rows, so
the reverse dependency would be circular.

### Empty and error values — strict (ADR-010)

- An empty cell is **empty, not zero**.
- Any expression consuming an empty value produces an **error**, not a blank.
- Any function receiving an error produces an error — errors propagate.
- `col_*` over a column where **any** row is empty is an error. Aggregates do not
  skip empties: a mean over an incomplete data set is meaningless.
- Division by zero, `SQRT` of a negative, and `TINV` outside its domain are errors.

The UI must distinguish two error kinds, though both are errors internally:

- **Awaiting input** — a required input has not been entered yet. Expected during
  recording; should be visually quiet.
- **Invalid computation** — division by zero, domain error, genuine mistake.
  Should be prominent.

Row count is set by the technician during recording, so most of a session is spent
with formulas in the "awaiting input" state. Conflating the two would produce a
wall of red and train technicians to ignore error styling.

### Precision (ADR-011)

The interpreter operates on **unrounded** values throughout and never applies
column formatting — display precision and `fixed`/`scientific` notation are purely
a rendering concern. `col_mean` therefore averages true stored values, not
displayed ones.

---

## 7. The verifier

Validates without executing anything, satisfying draft requirement 2-2:

1. Parse; report syntax errors with line and column position.
2. Resolve every identifier per §4.
3. Check arity for every call.
4. Enforce context restrictions (`col_*` and `SUMMARY_*` in summary only).
5. Enforce all collision rules (§4).
6. Validate every `ENV_*` round index against `roundCount`.
7. Build and topologically sort the custom-function call graph; reject cycles.
8. Build and topologically sort the column dependency graph; reject cycles.
9. Verify custom function bodies reference only their own parameters, builtins,
   and other custom functions.

---

## 7b. Semantics the original draft left unstated

All four surfaced during Phase 3 implementation and were flagged rather than
silently resolved. Confirmed 2026-07-30.

### `and` / `or` return booleans, not operands

Python returns the operand: `5 and 3` is `3`, and `x or 0` yields `0` when `x` is
falsy. **Here they always return `true` or `false`.** Short-circuit evaluation is
still performed, so `CAL_X != 0 and 1 / CAL_X > 5` remains safe to write.

This is not merely a readability preference — it **protects ADR-010's strict empty
semantics.** If `or` returned operands, `SOME_COL or 0` would become a
default-value idiom that silently substitutes a number for missing data, which is
precisely the behaviour strict semantics exist to prevent.

### String arithmetic is rejected

`"a" + "b"` is an error. Python would concatenate. Text exists in this language
only for verdict labels (`"PASS"` / `"FAIL"`), which the ternary already produces.
Permitting concatenation would invite type confusion for no calibration benefit.

### Mixed-type comparison

`==` and `!=` across differing types return `false`. Ordering comparisons
(`<`, `<=`, `>`, `>=`) across differing types are an error. This matches Python 3,
which also refuses to order a number against text.

### `col_count` errors on an incomplete column, like every other aggregate

§6's rule is applied uniformly: no aggregate tolerates an empty row.

A count of a partly-filled column is arguably meaningful, so this was worth
questioning. It is resolved as **consistent** for two reasons. Row count is set by
the technician during recording, so rows are added as they are used — a blank cell
therefore means *missing data*, not *not applicable*. And summary values computed
over an incomplete record are meaningless regardless of which aggregate is used.
One rule ("aggregates require a complete column") is easier to teach and remember
than one rule plus an exception.

### TINV has no `IFERROR` fallback — deliberately

The archived engine reproduced the source workbook's `=IFERROR(TINV(...), 2)`,
silently substituting `2` when TINV could not be computed — typically at zero
degrees of freedom, i.e. a single reading with no repeats.

**That fallback is not carried over.** Out-of-domain TINV is an error (§6).

The substitution itself is metrologically reasonable — `k = 2` is the conventional
coverage factor for approximately 95% confidence. But performing it *silently*
hides an assumption that belongs on the page. The same behaviour can now be
written explicitly:

```
TINV(0.05, CAL_NU) if CAL_NU >= 1 else 2
```

A visible assumption is a better position for accreditation than a hidden one, and
a reviewer can see exactly when `k = 2` was used and why.

**Caveat worth checking:** any existing sheet that relied on the silent fallback
will produce an error here rather than a number. Verify against a real sheet with a
single-reading calibration point before this reaches a certificate.

---

## 8. Test surface Phase 3 must cover

- **Grammar conformance table** — every production, valid and invalid cases.
- **Precedence** — including `-2 ** 2 == -4` and `2 ** 3 ** 2 == 512`.
- **Scientific notation literals** — `11.5e-6`, `7.882E+21`, `1e-3`.
- **`ROUND` half-away-from-zero**, with the comment from §3's warning box.
- **`TINV`** against known values, including the Excel df-truncation quirk.
- **Error-message snapshots** for every restriction in §2 and every collision in §4.
- **Cycle detection** — direct and indirect, for both functions and columns.
- **Context violations** — `col_*` in a row formula, `SUMMARY_*` in a row formula.
- **Strict empty propagation**, including aggregates over incomplete columns.
- **Numeric precision** — that no rounding occurs during evaluation.
