/**
 * Shared helper interface passed from PdfTemplateRenderer to sub-renderers.
 *
 * Each sub-renderer file receives this object so it can use shared utilities
 * without importing the main renderer class (which would create circular deps).
 */

import type jsPDF from 'jspdf';

export interface RendererHelpers {
  /** Apply a content-aware font (switches to Thai font when needed). */
  applyContentFont(
    pdf: jsPDF,
    text: string,
    family: string | undefined,
    style: 'normal' | 'bold' | 'italic' | 'bolditalic',
    size: number
  ): void;

  /** Wrap text to fit inside maxWidth, returning one string per line. */
  wrapTextForCell(text: string, maxWidth: number, fontSize: number, pdf: jsPDF): string[];

  /** Strip or replace characters that jsPDF cannot encode. */
  normalizePdfText(text: string): string;

  /** Format a date value for display in PDF cells. */
  formatDate(value: unknown, format: string | undefined): string;
}
