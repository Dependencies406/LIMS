# Recorder Template Validation — Execution Plan

Date: 2026-08-25
Decisions: [ADR-018](adr/ADR-018-recorder-template-validation.md)
Glossary: [DATA_MGMT_MODULE_GLOSSARY.md](DATA_MGMT_MODULE_GLOSSARY.md) § Validation

Five Claude Code sessions. Each is a separate session with a fresh context.

## Why only two prompts are written today

Prompts for Phases 31 and 32 are complete and ready to hand over.

Phases 33–35 are **outlined here but not written as prompts**, deliberately. Each
depends on the shape of code that does not exist yet — Phase 33's UI depends on the
exact `TraceNode` type Phase 32 produces, and Phase 34's comparison engine depends
on how Phase 32 exposes evaluation. Writing those prompts now would mean asserting
the state of code that has not been written, which is exactly the failure mode
`CLAUDE.md` RULE 1 exists to prevent. This project's own history shows the cost:
ADR-004 and ADR-007 both required published corrections because a capability was
asserted from type declarations rather than read.

Ask for the next prompt when the previous phase has merged. It will be written
against what the code actually says.

---

## Phase 31 — Tier 1: CI test gate and Platform Validation Report

**Claude Sonnet 5 · Effort: Medium** — small, mechanical, low-risk.
**Prompt:** [`PHASE_31_PROMPT_CI_TEST_GATE.md`](PHASE_31_PROMPT_CI_TEST_GATE.md)

Add a test step to both GitHub workflows so a failing suite blocks deploy, and
render each passing run as a retained Platform Validation Report.

Do this **first**. It is the smallest piece of work in the plan and it closes the
widest gap: today application code reaches production having only been *compiled*.
It also produces the Tier 1 evidence every later dossier leans on (ADR-018 D1, D9).

**Done when:** a deliberately failing test blocks a deploy, and a passing merge
leaves behind a report naming the commit, the date and the suite result.

---

## Phase 32 — The Calculation Trace engine

**Claude Opus 5 · Effort: xHigh** — the foundation, and the one place a subtle
error would poison every downstream artefact.
**Prompt:** [`PHASE_32_PROMPT_CALCULATION_TRACE_ENGINE.md`](PHASE_32_PROMPT_CALCULATION_TRACE_ENGINE.md)

Instrument the recorder's interpreter so that evaluating a record also produces a
`TraceNode` tree with provenance on every leaf. Pure, no Firestore, no UI, fully
unit-tested against golden data.

**The critical constraint:** the trace must come from the *same evaluation path* as
normal computation. If it is produced by a second, parallel implementation, it
documents something the system does not actually do — which is worse than no trace
at all, because it would be signed.

**Done when:** every existing formula test still passes unchanged, and a new golden
suite asserts trace structure, provenance tags, substituted expressions, and that
`trace(x).value === evaluate(x)` for every golden case.

---

## Phase 33 — "Show the working" in the recorder

**Claude Sonnet 5 · Effort: High** — UI work over a settled engine.

Render the trace in the record view: one line per computed value, expandable in
place, uncertainty budget presented as a proper budget table. Available on any
record regardless of status (ADR-018 D3, and the "on demand" half of the owner's
decision).

Depends on Phase 32's `TraceNode` type being final.

---

## Phase 34 — Validation Dossier: schema, service, comparison

**Claude Sonnet 5 · Effort: High** — schema and pure comparison logic; consider
Opus if the impact-diff classification proves subtle.

- `recorderTemplateValidations` collection, immutable, id `${templateId}_v${version}`
- Reference Case authoring: inputs, expected values, tolerance, source
- Comparison engine implementing ADR-018 D5 — tolerance on stored values, exact
  string match on reported values, two distinct defect classes
- Impact-class diff between two template snapshots (ADR-018 D10)
- Superseded detection (ADR-018 D8)
- `firestore.rules` for the new collection: append-only, admin write

Depends on Phase 32. Independent of Phase 33.

---

## Phase 35 — Dossier UI, signature, PDF, and the certificate transfer check

**Claude Sonnet 5 · Effort: High**

- Dossier screen: run cases, view traces, record deviations, sign
- Rendered dossier PDF for the auditor's file (reuse the existing PDF stack)
- Revalidation-due badge on the template, showing the impact class and the diff
- **Certificate transfer check** (ADR-018 D4): reconcile the values placed by
  report blocks and the Record Table Band against the record they came from, and
  report any mismatch

The transfer check is the riskiest item here — it touches `pdfTemplateRenderer.ts`
(162 KB) and the report-block work from Phases 26–30. If it proves large, split it
into its own Phase 36 rather than compressing it.

---

## What this plan does not build

Named so their absence is a decision, not an oversight (ADR-018, Open questions):

| Not built | Clause | Why |
|---|---|---|
| Any gate preventing use of an unvalidated template | 7.11.2 | Owner decision D7 — documentation only |
| Independent second signature | 7.11.2 | Owner decision D12 — single admin |
| Retrospective dossier for the live force template | 7.11.2 | Owner decision D13 — grandfathered |
| Reconciliation of the Stage D workbook behaviours | 7.7 / 7.10 | Owner decision D6 — out of scope, separate technical review |
| System-failure log | 7.11.3 e) | Not addressed; no such log exists in the app today |
| External-provider assurance (Firebase, GCP, GitHub) | 7.11.4 | QMS document, not software |
| Export/import and offline-sync transfer checks | 7.11.6 | Deliberately excluded from D4 scope |
