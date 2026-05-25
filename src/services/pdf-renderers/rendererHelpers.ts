import type jsPDF from 'jspdf';

/** Shared utilities passed from PdfTemplateRenderer into sub-renderer functions. */
export interface RendererHelpers {
  applyContentFont: (
    pdf: jsPDF,
    text: string,
    family: string,
    style: string,
    size: number
  ) => void;
  wrapTextForCell: (
    text: string,
    maxWidth: number,
    fontSize: number,
    pdf: jsPDF
  ) => string[];
  normalizePdfText: (text: string) => string;
  formatDate: (value: unknown, format?: string) => string;
}
