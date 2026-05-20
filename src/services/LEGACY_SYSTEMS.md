# Legacy PDF Systems

This document describes the two legacy PDF systems that still exist in the codebase
and explains what is safe to use for new work.

---

## ✅ Current System (use this for all new work)

| File | Purpose |
|---|---|
| `pdfTemplateRenderer.ts` | Core rendering engine — template → jsPDF |
| `pdfTemplateService.ts` | Firestore CRUD for templates |
| `pdfDataResolver.ts` | Data binding (resolves `job.title` etc.) |
| `pdfFontManager.ts` | Thai/Unicode font support |
| `pdfTextLayoutService.ts` | Text wrapping and line layout |
| `pdfComponentScanner.ts` | Component registry audit and search |
| `dataSourceDiscoveryService.ts` | Data source catalog |

Builder UI: `src/modules/pdf-template-builder/`

---

## ⚠️ Legacy System A — Module Registry (`pdfModuleRegistry.ts`)

**Status:** Deprecated. Kept only for form PDF modules (a separate system from template PDFs).  
**Do not use** for new job/document PDF templates.

---

## ⚠️ Legacy System B — html2canvas Service (`pdfService.ts`)

**Status:** Legacy. Kept for `PdfSettingsContext` and `JobPdfSettingsModal` backward compatibility.  
**Do not use** for new PDF features. The html2canvas approach is slower, lower quality,
and cannot be customized with the visual template builder.

---

## Migration path

If you need to add a new PDF feature:
1. Add a new element type to `src/modules/pdf-template-builder/types.ts`
2. Add a factory case to `models/PdfElement.ts` (TypeScript will error if you miss this)
3. Add a renderer case to `pdfTemplateRenderer.ts` (TypeScript will error if you miss this)
4. Add a section component in `components/sections/` and register it in `index.ts`
