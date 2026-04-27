/**
 * Report Template Service
 * Handles CRUD operations for report templates in Firestore
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
import type { ReportTemplate, ReportLayout } from '../modules/report-designer/types';

/**
 * Convert Firestore document to ReportTemplate
 */
const documentToTemplate = (doc: DocumentSnapshot<DocumentData>): ReportTemplate => {
  const data = doc.data();
  if (!data) {
    throw new Error('Template document has no data');
  }

  return {
    id: doc.id,
    name: data.name,
    description: data.description || '',
    layout: data.layout as ReportLayout,
    author: data.author,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  };
};

/**
 * Convert ReportTemplate to Firestore document data
 */
const templateToDocument = (template: ReportTemplate): DocumentData => {
  return {
    name: template.name,
    description: template.description,
    layout: template.layout,
    author: template.author,
    createdAt: template.createdAt ? Timestamp.fromDate(template.createdAt) : Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
};

export class ReportTemplateService {
  private collectionName = 'report_templates';

  /**
   * Create a new report template
   */
  async createTemplate(
    template: Omit<ReportTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const templateRef = doc(collection(db, this.collectionName));
    const templateData = templateToDocument({
      ...template,
      id: templateRef.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ReportTemplate);

    await setDoc(templateRef, templateData);
    return templateRef.id;
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<ReportTemplate | null> {
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
    updates: Partial<Omit<ReportTemplate, 'id' | 'createdAt'>>
  ): Promise<void> {
    const templateRef = doc(db, this.collectionName, templateId);
    const existing = await this.getTemplate(templateId);

    if (!existing) {
      throw new Error(`Template ${templateId} not found`);
    }

    const updateData: DocumentData = {
      ...updates,
      updatedAt: Timestamp.now(),
    };

    // If layout is being updated, include it
    if (updates.layout) {
      updateData.layout = updates.layout;
    }

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
   * Get all templates
   */
  async getAllTemplates(): Promise<ReportTemplate[]> {
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
  async getTemplatesByAuthor(authorId: string): Promise<ReportTemplate[]> {
    const q = query(
      collection(db, this.collectionName),
      where('author', '==', authorId),
      orderBy('updatedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(documentToTemplate);
  }
}

export const reportTemplateService = new ReportTemplateService();

