/**
 * Spreadsheet template types for TREB-linked templates (PDF Builder, equipment spreadsheets).
 */

export interface TrebTabDefinition {
  id: string;
  name: string;
}

export type SpreadsheetTemplateStatus = 'active' | 'archived';

export interface SpreadsheetTemplate {
  id: string;
  name: string;
  calibrationType: string;
  version: string;
  status: SpreadsheetTemplateStatus;
  tabs: TrebTabDefinition[];
  /** Full TREB document (for apply/edit). Optional on list, present from getByIdFromServer. */
  trebDocument?: unknown;
  /** SHA-256 hash of unlock password. Optional, used by Template Builder and equipment spreadsheet. */
  unlockPasswordHash?: string | null;
  description?: string;
  ownerId?: string;
  isPublic?: boolean;
  /** Last updated (set when loaded from Firestore). */
  updatedAt?: Date;
  /** Print area per tab: map from tab id (e.g. "sheet-4", "Report-1") to range string (e.g. "A1:F15"). Omit or empty = use whole sheet. */
  tabPrintAreas?: Record<string, string>;
}
