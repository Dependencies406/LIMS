/**
 * Spreadsheet template service.
 * Fetches and manages TREB spreadsheet templates in Firestore (`spreadsheet_templates`).
 * Used by Spreadsheet Template Builder, Equipment Spreadsheet modal, and PDF Builder treb-table.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { userService } from './userService';
import { roleService } from './roleService';
import type { SpreadsheetTemplate, TrebTabDefinition } from '../modules/spreadsheet-templates/types';
import type { PermissionAction } from '../types';

const COLLECTION = 'spreadsheet_templates';

/** Firestore document shape for spreadsheet_templates */
interface SpreadsheetTemplateDoc {
  name: string;
  description?: string;
  trebDocument: unknown;
  ownerId: string;
  isPublic?: boolean;
  unlockPasswordHash?: string | null;
  /** Print area per tab id → range string (e.g. "A1:F15"). Optional. */
  tabPrintAreas?: Record<string, string>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Normalize sheet_data to array (single sheet or array, or Firestore object-with-numeric-keys). */
function normalizeSheetArray(sheetData: unknown): any[] {
  if (sheetData == null) return [];
  if (Array.isArray(sheetData)) return sheetData;
  if (typeof sheetData === 'object') {
    const obj = sheetData as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
    if (keys.length > 0) return keys.map((k) => obj[k]);
  }
  return [sheetData];
}

/** Build tabs array from TREB document sheet_data. */
function tabsFromTrebDocument(trebDocument: unknown): TrebTabDefinition[] {
  if (!trebDocument || typeof trebDocument !== 'object') return [];
  const doc = trebDocument as { sheet_data?: unknown };
  const sheets = normalizeSheetArray(doc.sheet_data);
  return sheets.map((sheet: any, index: number) => {
    const name = sheet?.name != null ? String(sheet.name) : `Sheet ${index + 1}`;
    const id = sheet?.name != null ? String(sheet.name) : `sheet-${index}`;
    return { id, name };
  });
}

/** Map Firestore doc to SpreadsheetTemplate. */
function docToSpreadsheetTemplate(
  id: string,
  data: SpreadsheetTemplateDoc,
  options: { includeTrebDocument?: boolean } = {}
): SpreadsheetTemplate {
  const trebDoc = data.trebDocument as { version?: string } | undefined;
  const version = trebDoc?.version != null ? String(trebDoc.version) : '1.0';
  const tabs = tabsFromTrebDocument(data.trebDocument);
  const tpl: SpreadsheetTemplate = {
    id,
    name: data.name,
    calibrationType: data.description ?? '',
    version,
    status: 'active',
    tabs,
    description: data.description,
    ownerId: data.ownerId,
    isPublic: data.isPublic,
    unlockPasswordHash: data.unlockPasswordHash ?? null,
  };
  if (options.includeTrebDocument) {
    tpl.trebDocument = data.trebDocument;
  }
  if (data.updatedAt != null) {
    const raw = data.updatedAt as { toDate?: () => Date };
    tpl.updatedAt = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw as unknown as number);
  }
  if (data.tabPrintAreas != null && typeof data.tabPrintAreas === 'object') {
    tpl.tabPrintAreas = data.tabPrintAreas;
  }
  return tpl;
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function listByOwner(ownerId: string): Promise<SpreadsheetTemplate[]> {
  if (!ownerId) return [];
  try {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', ownerId),
      orderBy('updatedAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => docToSpreadsheetTemplate(d.id, d.data() as SpreadsheetTemplateDoc));
  } catch (err: any) {
    if (err?.code === 'failed-precondition' || err?.message?.includes('index')) {
      const q = query(collection(db, COLLECTION), where('ownerId', '==', ownerId));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((d) => docToSpreadsheetTemplate(d.id, d.data() as SpreadsheetTemplateDoc));
      return list.sort((a, b) => {
        const aT = (a as any).updatedAt?.toMillis?.() ?? 0;
        const bT = (b as any).updatedAt?.toMillis?.() ?? 0;
        return bT - aT;
      });
    }
    throw err;
  }
}

async function listAccessible(userId: string): Promise<SpreadsheetTemplate[]> {
  if (!userId) return [];
  try {
    const user = await userService.getUserById(userId);
    if (!user) return listByOwner(userId);
    const hasView = await roleService.hasPermission(
      user.role,
      'spreadsheetTemplates.view' as PermissionAction
    );
    if (hasView) {
      const snapshot = await getDocs(collection(db, COLLECTION));
      const list = snapshot.docs.map((d) => {
        const data = d.data() as SpreadsheetTemplateDoc & { updatedAt?: { toMillis?: () => number } };
        const tpl = docToSpreadsheetTemplate(d.id, data);
        (tpl as any)._updatedAt = data.updatedAt;
        return tpl;
      });
      list.sort((a, b) => {
        const aT = (a as any)._updatedAt?.toMillis?.() ?? 0;
        const bT = (b as any)._updatedAt?.toMillis?.() ?? 0;
        return bT - aT;
      });
      list.forEach((t) => delete (t as any)._updatedAt);
      return list;
    }
    return listByOwner(userId);
  } catch {
    return listByOwner(userId);
  }
}

async function getByIdFromServer(id: string): Promise<SpreadsheetTemplate | null> {
  const ref = doc(db, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return docToSpreadsheetTemplate(snap.id, snap.data() as SpreadsheetTemplateDoc, {
    includeTrebDocument: true,
  });
}

async function create(input: {
  name: string;
  description?: string;
  trebDocument: unknown;
  ownerId: string;
  isPublic?: boolean;
  unlockPasswordHash?: string | null;
  tabPrintAreas?: Record<string, string>;
}): Promise<string> {
  const ref = doc(collection(db, COLLECTION));
  const now = serverTimestamp();
  const data: SpreadsheetTemplateDoc = {
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    trebDocument: input.trebDocument,
    ownerId: input.ownerId,
    isPublic: input.isPublic ?? false,
    unlockPasswordHash: input.unlockPasswordHash ?? null,
    ...(input.tabPrintAreas != null && { tabPrintAreas: input.tabPrintAreas }),
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, data);
  return ref.id;
}

async function update(
  id: string,
  updates: {
    name?: string;
    description?: string;
    trebDocument?: unknown;
    isPublic?: boolean;
    unlockPasswordHash?: string | null;
    tabPrintAreas?: Record<string, string>;
  }
): Promise<void> {
  const ref = doc(db, COLLECTION, id);
  const existing = await getDoc(ref);
  if (!existing.exists()) throw new Error(`Template ${id} not found`);
  const current = existing.data() as SpreadsheetTemplateDoc;
  const next: SpreadsheetTemplateDoc = {
    ...current,
    ...(updates.name !== undefined && { name: updates.name.trim() }),
    ...(updates.description !== undefined && { description: updates.description.trim() }),
    ...(updates.trebDocument !== undefined && { trebDocument: updates.trebDocument }),
    ...(updates.isPublic !== undefined && { isPublic: updates.isPublic }),
    ...(updates.unlockPasswordHash !== undefined && { unlockPasswordHash: updates.unlockPasswordHash }),
    ...(updates.tabPrintAreas !== undefined && { tabPrintAreas: updates.tabPrintAreas }),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, next);
}

async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

async function duplicate(
  id: string,
  ownerId: string,
  existingNames: string[]
): Promise<string> {
  const ref = doc(db, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Template ${id} not found`);
  const data = snap.data() as SpreadsheetTemplateDoc;
  const baseName = data.name;
  let name = `${baseName} (Copy)`;
  let n = 1;
  while (existingNames.some((n) => n === name)) {
    name = `${baseName} (Copy ${n})`;
    n += 1;
  }
  const newRef = doc(collection(db, COLLECTION));
  const now = serverTimestamp();
  await setDoc(newRef, {
    name,
    description: data.description ?? '',
    trebDocument: data.trebDocument,
    ownerId,
    isPublic: false,
    unlockPasswordHash: data.unlockPasswordHash ?? null,
    ...(data.tabPrintAreas != null && { tabPrintAreas: data.tabPrintAreas }),
    createdAt: now,
    updatedAt: now,
  });
  return newRef.id;
}

async function verifyTemplateUnlockPassword(templateId: string, password: string): Promise<boolean> {
  const tpl = await getByIdFromServer(templateId);
  if (!tpl?.unlockPasswordHash) return false;
  const inputHash = await hashPassword(password);
  return inputHash === tpl.unlockPasswordHash;
}

/**
 * Returns templates accessible to the user (same as Equipment Spreadsheet template picker).
 * Use for PDF Builder treb-table dropdown. Pass currentUser.uid from the component.
 */
export async function getAvailableTemplates(userId: string): Promise<SpreadsheetTemplate[]> {
  return listAccessible(userId);
}

export const spreadsheetTemplateService = {
  listByOwner,
  listAccessible,
  getByIdFromServer,
  create,
  update,
  delete: deleteTemplate,
  duplicate,
  hashPassword,
  verifyTemplateUnlockPassword,
};

export type { SpreadsheetTemplate };
