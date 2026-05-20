/**
 * Pre-export verification for PDF templates that use TREB table elements.
 * Returns a list of missing sourceTabIds so the UI can warn the user before exporting.
 */

import type { PdfTemplate, PdfElement, TrebTableElement } from '../modules/pdf-template-builder/types';

/**
 * Verifies that every treb-table element in the template has its source tab
 * present in the provided trebDataRegistry. Returns an array of missing
 * sourceTabId values (no duplicates).
 *
 * @param template - The PDF template to validate
 * @param trebDataRegistry - Map of tabId -> serialized TREB 2D array data
 * @returns Array of sourceTabId strings that are referenced but not in the registry
 */
export function verifyPdfTrebDependencies(
  template: PdfTemplate,
  trebDataRegistry: Record<string, unknown>
): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();

  const pages =
    template.pages && template.pages.length > 0
      ? template.pages
      : [{ id: 'page_1', pageNumber: 1, pageSize: template.pageSize, elements: template.elements || [] }];

  for (const page of pages) {
    const elements: PdfElement[] = page.elements || [];
    for (const el of elements) {
      if (el.type !== 'treb-table') continue;
      const sourceTabId = (el as TrebTableElement).sourceTabId;
      if (typeof sourceTabId !== 'string' || !sourceTabId.trim()) continue;
      if (seen.has(sourceTabId)) continue;
      seen.add(sourceTabId);
      if (!(sourceTabId in trebDataRegistry)) {
        missing.push(sourceTabId);
      }
    }
  }

  return missing;
}
