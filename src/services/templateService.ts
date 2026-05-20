/**
 * Template Service
 * Handles CRUD operations for spreadsheet templates in Firestore
 * Includes zod validation, owner filtering, and duplicate name checking
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
  type DocumentData,
  type DocumentSnapshot
} from 'firebase/firestore';
import { db } from './firebase';
import { z } from 'zod';
import type { TemplateSchema } from '../types/template';
import { templateSchema } from '../types/template';

export class DuplicateTemplateNameError extends Error {
  constructor(templateName: string) {
    super(`A template named "${templateName}" already exists for this owner.`);
    this.name = 'DuplicateTemplateNameError';
  }
}

const _templateFormulaSchema = z.object({
  cellId: z.string(),
  formula: z.string(),
  dependsOn: z.array(z.string()).optional(),
});

/**
 * Convert Firestore document to TemplateSchema
 */
const documentToTemplate = (doc: DocumentSnapshot<DocumentData>): TemplateSchema => {
  const data = doc.data();
  if (!data) {
    throw new Error('Template document has no data');
  }

  return {
    id: doc.id,
    name: data.name,
    description: data.description,
    ownerId: data.ownerId,
    columns: data.columns || [],
    formulas: data.formulas || [],
    pdfSettings: data.pdfSettings,
    isPublic: data.isPublic || false,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
    version: data.version || 1,
  } as TemplateSchema;
};

/**
 * Convert TemplateSchema to Firestore document data
 */
const templateToDocument = (template: TemplateSchema): DocumentData => {
  return {
    name: template.name,
    description: template.description,
    ownerId: template.ownerId,
    columns: template.columns,
    formulas: template.formulas || [],
    pdfSettings: template.pdfSettings,
    isPublic: template.isPublic || false,
    createdAt: template.createdAt ? Timestamp.fromDate(template.createdAt) : serverTimestamp(),
    updatedAt: Timestamp.now(),
    version: template.version || 1,
  };
};

// Import serverTimestamp
import { serverTimestamp } from 'firebase/firestore';

export class TemplateService {
  private collectionName = 'templates';

  /**
   * Create a new template
   * @throws {DuplicateTemplateNameError} if template name already exists for this owner
   */
  async createTemplate(template: Omit<TemplateSchema, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    // Validate template
    const validated = templateSchema.parse(template);

    // Check for duplicate name
    const existingTemplates = await this.getTemplatesByOwner(validated.ownerId);
    const duplicate = existingTemplates.find(t => t.name === validated.name);
    if (duplicate) {
      throw new DuplicateTemplateNameError(validated.name);
    }

    // Create template document
    const templateRef = doc(collection(db, this.collectionName));
    const templateData = templateToDocument({
      ...validated,
      id: templateRef.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TemplateSchema);

    await setDoc(templateRef, templateData);
    return templateRef.id;
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<TemplateSchema | null> {
    const templateRef = doc(db, this.collectionName, templateId);
    const templateDoc = await getDoc(templateRef);
    
    if (!templateDoc.exists()) {
      return null;
    }

    return documentToTemplate(templateDoc);
  }

  /**
   * Update an existing template
   */
  async updateTemplate(templateId: string, updates: Partial<TemplateSchema>): Promise<void> {
    const templateRef = doc(db, this.collectionName, templateId);
    const existing = await this.getTemplate(templateId);
    
    if (!existing) {
      throw new Error(`Template ${templateId} not found`);
    }

    // If name is being updated, check for duplicates
    if (updates.name && updates.name !== existing.name) {
      const existingTemplates = await this.getTemplatesByOwner(existing.ownerId);
      const duplicate = existingTemplates.find(t => t.name === updates.name && t.id !== templateId);
      if (duplicate) {
        throw new DuplicateTemplateNameError(updates.name);
      }
    }

    // Validate updates if provided
    const updatedTemplate = { ...existing, ...updates, updatedAt: new Date() };
    if (updates.columns || updates.formulas || updates.pdfSettings) {
      templateSchema.parse(updatedTemplate);
    }

    const updateData: DocumentData = {
      ...updates,
      updatedAt: Timestamp.now(),
    };

    await setDoc(templateRef, updateData, { merge: true });
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const templateRef = doc(db, this.collectionName, templateId);
    await deleteDoc(templateRef);
  }

  /**
   * Get all templates owned by a user
   */
  async getTemplatesByOwner(ownerId: string): Promise<TemplateSchema[]> {
    const q = query(
      collection(db, this.collectionName),
      where('ownerId', '==', ownerId),
      orderBy('updatedAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(documentToTemplate);
  }

  /**
   * Get all public templates
   */
  async getPublicTemplates(): Promise<TemplateSchema[]> {
    const q = query(
      collection(db, this.collectionName),
      where('isPublic', '==', true),
      orderBy('updatedAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(documentToTemplate);
  }

  /**
   * Get templates accessible to a user (own + public)
   */
  async getAccessibleTemplates(userId: string): Promise<TemplateSchema[]> {
    const [ownTemplates, publicTemplates] = await Promise.all([
      this.getTemplatesByOwner(userId),
      this.getPublicTemplates(),
    ]);

    // Combine and deduplicate
    const templateMap = new Map<string, TemplateSchema>();
    [...ownTemplates, ...publicTemplates].forEach(t => {
      if (!templateMap.has(t.id!)) {
        templateMap.set(t.id!, t);
      }
    });

    return Array.from(templateMap.values());
  }
}

export const templateService = new TemplateService();

