/**
 * PDF Template Service
 * Handles CRUD operations for PDF templates in Firestore
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
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import type { PdfTemplate } from '../modules/pdf-template-builder/types';

const withPaginationDefaults = (element: any) => {
  if (!element || typeof element !== 'object') return element;
  const next = { ...element };
  if (next.paginationMode === undefined && next.overflowRole !== undefined) {
    next.paginationMode = next.overflowRole;
  }
  if (next.repeatOnOverflowPages === undefined) {
    next.repeatOnOverflowPages = true;
  }
  return next;
};

/**
 * Recursively remove undefined values from an object
 * Firestore doesn't allow undefined values
 */
const removeUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item));
  }
  if (typeof obj === 'object' && !(obj instanceof Date) && !(obj instanceof Timestamp) && !(obj instanceof Function)) {
    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      if (value !== undefined) {
        cleaned[key] = removeUndefined(value);
      }
    });
    return cleaned;
  }
  return obj;
};

/**
 * Convert Firestore document to PdfTemplate
 */
const documentToTemplate = (doc: DocumentSnapshot<DocumentData>): PdfTemplate => {
  const data = doc.data();
  if (!data) {
    throw new Error('Template document has no data');
  }

  const pages = data.pages?.map((p: any) => ({
    ...p,
    orientation: p.orientation ?? data.orientation ?? 'portrait',
    elements: Array.isArray(p.elements) ? p.elements.map(withPaginationDefaults) : [],
  }));
  return {
    id: doc.id,
    name: data.name,
    description: data.description || '',
    pageSize: data.pageSize || 'A4',
    orientation: data.orientation ?? 'portrait',
    pagePattern: data.pagePattern,
    backgroundPdf: data.backgroundPdf,
    elements: (data.elements || (data.pages?.[0]?.elements || [])).map(withPaginationDefaults),
    pages: pages || undefined,
    metadata: {
      author: data.author,
      createdAt: data.createdAt?.toDate()?.toISOString(),
      updatedAt: data.updatedAt?.toDate()?.toISOString(),
    },
  };
};

/**
 * Convert PdfTemplate to Firestore document data
 */
const templateToDocument = (template: PdfTemplate): DocumentData => {
  const doc: DocumentData = {
    name: template.name,
    description: template.description || '',
    pageSize: template.pageSize,
    orientation: template.orientation ?? 'portrait',
    pagePattern: template.pagePattern,
    elements: template.elements || template.pages?.[0]?.elements || [],
    pages: template.pages,
    author: template.metadata?.author,
    createdAt: template.metadata?.createdAt ? Timestamp.fromDate(new Date(template.metadata.createdAt)) : Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  
  // Only include backgroundPdf if it's defined (Firestore doesn't allow undefined)
  if (template.backgroundPdf !== undefined) {
    doc.backgroundPdf = template.backgroundPdf;
  }
  
  return doc;
};

export class PdfTemplateService {
  private collectionName = 'pdf_templates';
  private builtinsEnsured = false;

  private async ensureBuiltInTemplates(): Promise<void> {
    if (this.builtinsEnsured) return;
    this.builtinsEnsured = true;
    // Built-in templates disabled (user requested: do not auto-seed).
  }

  /**
   * Create a new PDF template
   */
  async createTemplate(
    template: Omit<PdfTemplate, 'id'>
  ): Promise<string> {
    const templateRef = doc(collection(db, this.collectionName));
    const templateData = templateToDocument({
      ...template,
      id: templateRef.id,
      metadata: template.metadata || {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    } as PdfTemplate);

    // Remove any undefined values recursively before saving
    const cleanData = removeUndefined(templateData);

    await setDoc(templateRef, cleanData);
    return templateRef.id;
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<PdfTemplate | null> {
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
  async updateTemplate(
    templateId: string,
    updates: Partial<Omit<PdfTemplate, 'id' | 'metadata'>>
  ): Promise<void> {
    const templateRef = doc(db, this.collectionName, templateId);
    const existing = await this.getTemplate(templateId);

    if (!existing) {
      throw new Error(`Template ${templateId} not found`);
    }

    const updateData: DocumentData = {
      updatedAt: Timestamp.now(),
    };

    // Only include defined values from updates
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.pageSize !== undefined) updateData.pageSize = updates.pageSize;
    if (updates.orientation !== undefined) updateData.orientation = updates.orientation;
    if (updates.pagePattern !== undefined) updateData.pagePattern = updates.pagePattern;
    if (updates.backgroundPdf !== undefined) updateData.backgroundPdf = updates.backgroundPdf;
    if (updates.elements !== undefined) updateData.elements = updates.elements;
    if (updates.pages !== undefined) updateData.pages = updates.pages;

    // Remove any undefined values recursively before saving
    const cleanData = removeUndefined(updateData);

    await setDoc(templateRef, cleanData, { merge: true });
  }

  /**
   * Duplicate a template
   */
  async duplicateTemplate(templateId: string): Promise<string> {
    const existing = await this.getTemplate(templateId);
    if (!existing) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Generate a new name (append "Copy" or "Copy (n)" if needed)
    const baseName = `${existing.name} Copy`;
    const allTemplates = await this.getAllTemplates();
    let newName = baseName;
    let counter = 1;
    while (allTemplates.some(t => t.name === newName)) {
      newName = `${existing.name} Copy (${counter})`;
      counter++;
    }

    // Create a new template with the duplicated data
    const duplicatedTemplate: Omit<PdfTemplate, 'id'> = {
      name: newName,
      description: existing.description,
      pageSize: existing.pageSize,
      pagePattern: existing.pagePattern,
      backgroundPdf: existing.backgroundPdf,
      elements: existing.elements,
      pages: existing.pages,
      metadata: {
        author: existing.metadata?.author,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    return await this.createTemplate(duplicatedTemplate);
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const templateRef = doc(db, this.collectionName, templateId);
    await deleteDoc(templateRef);
  }

  /**
   * Get all templates
   */
  async getAllTemplates(): Promise<PdfTemplate[]> {
    await this.ensureBuiltInTemplates();
    const q = query(
      collection(db, this.collectionName),
      orderBy('updatedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(documentToTemplate);
  }

  /**
   * Get templates by author
   */
  async getTemplatesByAuthor(authorId: string): Promise<PdfTemplate[]> {
    await this.ensureBuiltInTemplates();
    const q = query(
      collection(db, this.collectionName),
      where('author', '==', authorId),
      orderBy('updatedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(documentToTemplate);
  }
}

export const pdfTemplateService = new PdfTemplateService();

