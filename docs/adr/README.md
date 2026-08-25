# Architecture Decision Records

Decisions for the Data & Information Management Module, settled during the
design grilling session of 2026-07-30.

Supporting documents:

- [`../DATA_MGMT_MODULE_AUDIT.md`](../DATA_MGMT_MODULE_AUDIT.md) — verified facts about the existing codebase
- [`../DATA_MGMT_MODULE_GLOSSARY.md`](../DATA_MGMT_MODULE_GLOSSARY.md) — ubiquitous language
- [`../DATA_MGMT_MODULE_DOMAIN_MODEL.md`](../DATA_MGMT_MODULE_DOMAIN_MODEL.md) — entities, schemas, phasing, open questions

| ADR | Decision | Status |
|---|---|---|
| [001](ADR-001-expression-interpreter.md) | Python-syntax single-expression interpreter in TypeScript | Accepted |
| [002](ADR-002-record-storage.md) | Records in their own top-level collection | Accepted |
| [003](ADR-003-equipment-type-entity.md) | ~~Promote Equipment Type to a first-class entity~~ | **Superseded by 012** |
| [004](ADR-004-pdf-record-table-band.md) | Add a flowing Record Table Band PDF element | Accepted |
| [005](ADR-005-record-lifecycle.md) | Four-state lifecycle with template version pinning | Accepted |
| [006](ADR-006-rounds-and-environment.md) | Rounds as ordinary columns; template-level round count | Accepted |
| [007](ADR-007-template-system-strategy.md) | Extend TREB + PDF builder rather than build a fifth system | Accepted |
| [008](ADR-008-record-number-allocation.md) | Allocate record number on first commit, in a transaction | Accepted |
| [009](ADR-009-environment-references.md) | Environment referenced via reserved `ENV` section | Accepted |
| [010](ADR-010-evaluation-contexts-and-summary-fields.md) | Two evaluation contexts: row formulas and summary fields | Accepted |
| [011](ADR-011-number-precision-and-formatting.md) | Full-precision storage, round-on-display, per-column notation | Accepted |
| [012](ADR-012-equipment-type-is-the-certificate-config.md) | Equipment Type and Certificate Number config are one entity | Accepted |
| [013](ADR-013-reference-standards-and-signal-conversion.md) | Reference standards, per-row selection, mV/V → force conversion | Accepted (D2/D3/D5 amended by 014) |
| [014](ADR-014-equipment-register-is-the-reference-standard.md) | Equipment register is the reference standard; equations bind to it | Accepted (D5 extended by 015) |
| [015](ADR-015-display-time-unit-conversion.md) | Display-time unit conversion for non-force units; shared rule library | Accepted |
| [016](ADR-016-voiding-records.md) | Voiding records: soft delete, admin-only, releases a pinned version | Accepted |
| [017](ADR-017-report-blocks.md) | Report blocks: tables and text with their own row axis; third evaluation context | Accepted |

**Note:** ADR-004 was **revised** after deeper reading of `pdfTemplateRenderer.ts`
— its original premises about the PDF type system, pagination, and element
displacement were all incorrect. See the revision note at the top of that file.
