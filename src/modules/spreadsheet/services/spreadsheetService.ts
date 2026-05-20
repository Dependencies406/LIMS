/**
 * Spreadsheet Service
 * Handles CRUD operations for spreadsheets in Firestore
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  where,
  Timestamp,
  serverTimestamp,
  type DocumentData,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import type { SpreadsheetModel } from '../models/SpreadsheetModel';

/**
 * Convert Firestore document to SpreadsheetModel
 */
const documentToSpreadsheet = (doc: DocumentSnapshot<DocumentData>): SpreadsheetModel => {
  const data = doc.data();
  if (!data) {
    throw new Error('Spreadsheet document has no data');
  }

  // Convert Maps from Firestore format (arrays) back to Maps
  const cells = new Map<string, any>();
  if (Array.isArray(data.cells)) {
    data.cells.forEach(([key, value]: [string, any]) => {
      cells.set(key, value);
    });
  } else if (data.cells && typeof data.cells === 'object') {
    Object.entries(data.cells).forEach(([key, value]) => {
      cells.set(key, value);
    });
  }

  const formulas = new Map<string, any>();
  if (Array.isArray(data.formulas)) {
    data.formulas.forEach(([key, value]: [string, any]) => {
      formulas.set(key, value);
    });
  } else if (data.formulas && typeof data.formulas === 'object') {
    Object.entries(data.formulas).forEach(([key, value]) => {
      formulas.set(key, value);
    });
  }

  const variables = new Map<string, any>();
  if (Array.isArray(data.variables)) {
    data.variables.forEach(([key, value]: [string, any]) => {
      variables.set(key, value);
    });
  } else if (data.variables && typeof data.variables === 'object') {
    Object.entries(data.variables).forEach(([key, value]) => {
      variables.set(key, value);
    });
  }

  const columnDefinitions = new Map<string, any>();
  if (data.columnDefinitions) {
    if (Array.isArray(data.columnDefinitions)) {
      data.columnDefinitions.forEach(([key, value]: [string, any]) => {
        columnDefinitions.set(key, value);
      });
    } else if (typeof data.columnDefinitions === 'object') {
      Object.entries(data.columnDefinitions).forEach(([key, value]) => {
        columnDefinitions.set(key, value);
      });
    }
  }

  // Calculate grid dimensions from cells
  let rowCount = 0;
  let columnCount = 0;
  for (const cell of cells.values()) {
    rowCount = Math.max(rowCount, (cell.row || 0) + 1);
    columnCount = Math.max(columnCount, (cell.column || 0) + 1);
  }
  // Default to 10x26 if no cells
  if (rowCount === 0) rowCount = 10;
  if (columnCount === 0) columnCount = 26;

  return {
    id: doc.id,
    name: data.name || 'Untitled Spreadsheet',
    description: data.description || '',
    version: data.version || '1.0',
    status: data.status || 'draft',
    rowCount,
    columnCount,
    cells,
    formulas,
    variables,
    columnDefinitions: columnDefinitions.size > 0 ? columnDefinitions : undefined,
    columnOrder: data.columnOrder || undefined,
    auditTrail: data.auditTrail || [],
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    createdBy: data.createdBy || 'unknown',
    updatedBy: data.updatedBy || 'unknown',
  };
};

/**
 * Convert SpreadsheetModel to Firestore document data
 */
const spreadsheetToDocument = (spreadsheet: SpreadsheetModel): DocumentData => {
  // Convert Maps to plain objects for Firestore
  const cellsObj: Record<string, any> = {};
  const cells = spreadsheet.cells || new Map();
  cells.forEach((value, key) => {
    cellsObj[key] = value;
  });

  const formulasObj: Record<string, any> = {};
  spreadsheet.formulas.forEach((value, key) => {
    formulasObj[key] = value;
  });

  const variablesObj: Record<string, any> = {};
  spreadsheet.variables.forEach((value, key) => {
    variablesObj[key] = value;
  });

  const columnDefinitionsObj: Record<string, any> | undefined = spreadsheet.columnDefinitions
    ? {}
    : undefined;
  if (spreadsheet.columnDefinitions) {
    spreadsheet.columnDefinitions.forEach((value, key) => {
      columnDefinitionsObj![key] = value;
    });
  }

  return {
    name: spreadsheet.name,
    description: spreadsheet.description || '',
    status: spreadsheet.status,
    cells: cellsObj,
    formulas: formulasObj,
    variables: variablesObj,
    columnDefinitions: columnDefinitionsObj,
    columnOrder: spreadsheet.columnOrder || undefined,
    createdAt: spreadsheet.createdAt ? Timestamp.fromDate(spreadsheet.createdAt) : serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: spreadsheet.createdBy || 'unknown',
    updatedBy: spreadsheet.updatedBy || 'unknown',
  };
};

export class SpreadsheetService {
  private collectionName = 'spreadsheets';

  /**
   * Create a new spreadsheet
   */
  async createSpreadsheet(spreadsheet: SpreadsheetModel): Promise<string> {
    const spreadsheetRef = doc(collection(db, this.collectionName));
    const spreadsheetData = spreadsheetToDocument({
      ...spreadsheet,
      id: spreadsheetRef.id,
    });

    await setDoc(spreadsheetRef, spreadsheetData);
    return spreadsheetRef.id;
  }

  /**
   * Get spreadsheet by ID
   */
  async getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetModel | null> {
    const spreadsheetRef = doc(db, this.collectionName, spreadsheetId);
    const spreadsheetDoc = await getDoc(spreadsheetRef);

    if (!spreadsheetDoc.exists()) {
      return null;
    }

    return documentToSpreadsheet(spreadsheetDoc);
  }

  /**
   * Update an existing spreadsheet
   */
  async updateSpreadsheet(
    spreadsheetId: string,
    updates: Partial<SpreadsheetModel>
  ): Promise<void> {
    const spreadsheetRef = doc(db, this.collectionName, spreadsheetId);
    const existing = await this.getSpreadsheet(spreadsheetId);

    if (!existing) {
      throw new Error(`Spreadsheet ${spreadsheetId} not found`);
    }

    // Merge updates with existing spreadsheet
    const updatedSpreadsheet: SpreadsheetModel = {
      ...existing,
      ...updates,
      // Merge Maps
      cells: updates.cells || existing.cells,
      formulas: updates.formulas || existing.formulas,
      variables: updates.variables || existing.variables,
      columnDefinitions: updates.columnDefinitions || existing.columnDefinitions,
      updatedAt: new Date(),
    };

    const updateData = spreadsheetToDocument(updatedSpreadsheet);
    await setDoc(spreadsheetRef, updateData, { merge: true });
  }

  /**
   * Delete a spreadsheet
   */
  async deleteSpreadsheet(spreadsheetId: string): Promise<void> {
    const spreadsheetRef = doc(db, this.collectionName, spreadsheetId);
    await deleteDoc(spreadsheetRef);
  }

  /**
   * Get all spreadsheets
   */
  async getAllSpreadsheets(): Promise<SpreadsheetModel[]> {
    const q = query(
      collection(db, this.collectionName),
      orderBy('updatedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(documentToSpreadsheet);
  }

  /**
   * Get spreadsheets by user
   */
  async getSpreadsheetsByUser(userId: string): Promise<SpreadsheetModel[]> {
    const q = query(
      collection(db, this.collectionName),
      where('createdBy', '==', userId),
      orderBy('updatedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(documentToSpreadsheet);
  }

  /**
   * Get spreadsheets by status
   */
  async getSpreadsheetsByStatus(status: string): Promise<SpreadsheetModel[]> {
    const q = query(
      collection(db, this.collectionName),
      where('status', '==', status),
      orderBy('updatedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(documentToSpreadsheet);
  }
}

export const spreadsheetService = new SpreadsheetService();

