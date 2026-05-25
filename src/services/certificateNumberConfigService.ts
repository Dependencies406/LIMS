/**
 * Certificate Number Configuration Service
 * Manages certificate number category configurations
 */

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
  onSnapshot
} from './firebase';
import type { CertificateNumberConfig } from '../types';

const COLLECTION_NAME = 'certificate_number_configs';

/**
 * Convert Firestore document to CertificateNumberConfig
 */
const documentToConfig = (docData: any, docId: string): CertificateNumberConfig => {
  return {
    id: docId,
    name: docData.name || '',
    equipmentType: docData.equipmentType || '',
    prefix: docData.prefix || '',
    separator: docData.separator || '-',
    includeYear: docData.includeYear !== false,
    numberPadding: docData.numberPadding || 3,
    currentNumber: docData.currentNumber || 0,
    currentSequence: docData.currentSequence ?? docData.currentNumber ?? 0,
    currentYear: docData.currentYear ?? new Date().getFullYear(),
    yearlyReset: docData.yearlyReset ?? (docData.resetPolicy === 'yearly'),
    resetPolicy: docData.resetPolicy || 'never',
    lastResetAt: docData.lastResetAt?.toDate() || undefined,
    isActive: docData.isActive !== false,
    createdAt: docData.createdAt?.toDate() || new Date(),
    updatedAt: docData.updatedAt?.toDate() || new Date(),
  };
};

/**
 * Convert CertificateNumberConfig to Firestore document
 */
const configToDocument = (config: Omit<CertificateNumberConfig, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: Date; updatedAt?: Date }): any => {
  const docData: any = {
    name: config.name,
    prefix: config.prefix,
    separator: config.separator,
    includeYear: config.includeYear !== false, // Default to true
    numberPadding: config.numberPadding,
    currentNumber: config.currentNumber,
    resetPolicy: config.resetPolicy,
    isActive: config.isActive,
  };

  if (config.lastResetAt) {
    docData.lastResetAt = Timestamp.fromDate(config.lastResetAt);
  }
  if (config.createdAt) {
    docData.createdAt = Timestamp.fromDate(config.createdAt);
  }
  if (config.updatedAt) {
    docData.updatedAt = Timestamp.fromDate(config.updatedAt);
  }

  return docData;
};

export const certificateNumberConfigService = {
  /**
   * Get all certificate number configurations
   */
  async getAllConfigs(): Promise<CertificateNumberConfig[]> {
    try {
      const q = query(collection(db, COLLECTION_NAME), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => documentToConfig(doc.data(), doc.id));
    } catch (error) {
      console.error('Error fetching certificate number configs:', error);
      throw new Error('Failed to fetch certificate number configurations');
    }
  },

  /**
   * Get active certificate number configurations only
   */
  async getActiveConfigs(): Promise<CertificateNumberConfig[]> {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('isActive', '==', true),
        orderBy('name', 'asc')
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => documentToConfig(doc.data(), doc.id));
    } catch (error) {
      console.error('Error fetching active certificate number configs:', error);
      throw new Error('Failed to fetch active certificate number configurations');
    }
  },

  /**
   * Get a single configuration by ID
   */
  async getConfigById(id: string): Promise<CertificateNumberConfig | null> {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return null;
      }

      return documentToConfig(docSnap.data(), docSnap.id);
    } catch (error) {
      console.error('Error fetching certificate number config:', error);
      throw new Error('Failed to fetch certificate number configuration');
    }
  },

  /**
   * Create a new certificate number configuration
   */
  async createConfig(config: Omit<CertificateNumberConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      // Check for duplicate name
      const existingConfigs = await this.getAllConfigs();
      const nameExists = existingConfigs.some(c => c.name.toLowerCase() === config.name.toLowerCase());
      if (nameExists) {
        throw new Error(`Certificate number configuration with name "${config.name}" already exists`);
      }

      const now = new Date();
      const docData = configToDocument({
        ...config,
        createdAt: now,
        updatedAt: now,
      });
      
      // Set server timestamps
      docData.createdAt = serverTimestamp();
      docData.updatedAt = serverTimestamp();

      const docRef = doc(collection(db, COLLECTION_NAME));
      await setDoc(docRef, docData);
      
      return docRef.id;
    } catch (error: any) {
      console.error('Error creating certificate number config:', error);
      if (error.message) {
        throw error;
      }
      throw new Error('Failed to create certificate number configuration');
    }
  },

  /**
   * Update an existing certificate number configuration
   */
  async updateConfig(id: string, updates: Partial<Omit<CertificateNumberConfig, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    try {
      const existing = await this.getConfigById(id);
      if (!existing) {
        throw new Error('Certificate number configuration not found');
      }

      // Check for duplicate name if name is being updated
      if (updates.name && updates.name.toLowerCase() !== existing.name.toLowerCase()) {
        const existingConfigs = await this.getAllConfigs();
        const nameExists = existingConfigs.some(c => c.name.toLowerCase() === updates.name!.toLowerCase() && c.id !== id);
        if (nameExists) {
          throw new Error(`Certificate number configuration with name "${updates.name}" already exists`);
        }
      }

      const updateData: any = {};
      
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.prefix !== undefined) updateData.prefix = updates.prefix;
      if (updates.separator !== undefined) updateData.separator = updates.separator;
      if (updates.includeYear !== undefined) updateData.includeYear = updates.includeYear;
      if (updates.numberPadding !== undefined) updateData.numberPadding = updates.numberPadding;
      if (updates.currentNumber !== undefined) updateData.currentNumber = updates.currentNumber;
      if (updates.resetPolicy !== undefined) updateData.resetPolicy = updates.resetPolicy;
      if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
      if (updates.lastResetAt !== undefined) {
        updateData.lastResetAt = updates.lastResetAt ? Timestamp.fromDate(updates.lastResetAt) : null;
      }

      updateData.updatedAt = serverTimestamp();

      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, updateData);
    } catch (error: any) {
      console.error('Error updating certificate number config:', error);
      if (error.message) {
        throw error;
      }
      throw new Error('Failed to update certificate number configuration');
    }
  },

  /**
   * Delete a certificate number configuration
   * Note: Should check if config is in use before deleting
   */
  async deleteConfig(id: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting certificate number config:', error);
      throw new Error('Failed to delete certificate number configuration');
    }
  },

  /**
   * Reset current number for a configuration (used for yearly reset)
   */
  async resetNumber(id: string): Promise<void> {
    try {
      const now = new Date();
      await this.updateConfig(id, {
        currentNumber: 0,
        lastResetAt: now,
      });
    } catch (error) {
      console.error('Error resetting certificate number:', error);
      throw new Error('Failed to reset certificate number');
    }
  },

  /**
   * Get active config by equipment name (config.name). Used to resolve config for "Generate certificate number" by equipment.
   */
  async getConfigByEquipmentName(equipmentName: string): Promise<CertificateNumberConfig | null> {
    if (!equipmentName || !String(equipmentName).trim()) return null;
    const configs = await this.getActiveConfigs();
    const name = String(equipmentName).trim();
    return configs.find((c) => c.name === name) ?? null;
  },

  /**
   * Get equipment names from active certificate number configurations
   * Returns array of equipment names (config.name) for use in dropdowns
   */
  async getEquipmentNames(): Promise<string[]> {
    try {
      const configs = await this.getActiveConfigs();
      return configs.map(config => config.name).sort((a, b) => a.localeCompare(b));
    } catch (error) {
      console.error('Error getting equipment names from certificate configs:', error);
      return [];
    }
  },

  /**
   * Subscribe to real-time equipment name updates from certificate number configs
   * Returns an unsubscribe function
   */
  subscribeToEquipmentNames(
    callback: (names: string[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    try {
      // Query only by isActive (no orderBy to avoid requiring composite index)
      // We'll sort manually in the callback
      const q = query(
        collection(db, COLLECTION_NAME),
        where('isActive', '==', true)
      );
      
      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const names: string[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.name) {
              names.push(data.name);
            }
          });
          // Sort alphabetically (manual sort to avoid needing composite index)
          const sorted = names.sort((a, b) => a.localeCompare(b));
          callback(sorted);
        },
        (error) => {
          console.error('Error subscribing to equipment names:', error);
          if (onError) {
            onError(error);
          }
        }
      );
      
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up equipment names subscription:', error);
      if (onError && error instanceof Error) {
        onError(error);
      }
      // Return a no-op unsubscribe function
      return () => {};
    }
  },
};
