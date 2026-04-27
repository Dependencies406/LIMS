import type { EquipmentRecord } from '../types';
import {
  db,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot
} from './firebase';

export interface EquipmentRecordInput {
  serialNumber: string;
  name: string;
  manufacturer: string;
  model: string;
  capacity?: string;
  calibrationPoint?: string;
  note?: string;
}

/**
 * Service for managing equipment records by serial number
 */
export const equipmentService = {
  /**
   * Subscribe to real-time equipment updates
   * @param callback Function called when equipment changes
   * @returns Unsubscribe function
   */
  subscribeToEquipment(
    callback: (equipment: EquipmentRecord[], error?: Error) => void
  ): () => void {
    const q = query(collection(db, 'equipment'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const equipment = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
          } as EquipmentRecord;
        });
        
        callback(equipment);
      },
      (error) => {
        console.error('Error loading equipment:', error);
        callback([], error as Error);
      }
    );

    return unsubscribe;
  },

  /**
   * Get all equipment records
   * @returns Promise with array of equipment records
   */
  async getAllEquipment(): Promise<EquipmentRecord[]> {
    try {
      const q = query(collection(db, 'equipment'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as EquipmentRecord;
      });
    } catch (error) {
      console.error('Error fetching equipment:', error);
      throw new Error('Failed to fetch equipment');
    }
  },

  /**
   * Get equipment by serial number
   * @param serialNumber Serial number to search for
   * @returns Promise with equipment record or null
   */
  async getEquipmentBySerialNumber(serialNumber: string): Promise<EquipmentRecord | null> {
    try {
      const q = query(
        collection(db, 'equipment'),
        where('serialNumber', '==', serialNumber.trim())
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as EquipmentRecord;
    } catch (error) {
      console.error('Error fetching equipment by serial number:', error);
      throw error;
    }
  },

  /**
   * Create or update equipment record
   * @param data Equipment input data
   * @returns Promise with equipment ID
   */
  async createOrUpdateEquipment(data: EquipmentRecordInput): Promise<string> {
    try {
      const serialNumber = data.serialNumber.trim();
      if (!serialNumber) {
        throw new Error('Serial number is required');
      }

      // Check if equipment with this serial number exists
      const existing = await this.getEquipmentBySerialNumber(serialNumber);
      
      const equipmentData = {
        serialNumber: serialNumber,
        name: data.name.trim(),
        manufacturer: data.manufacturer.trim(),
        model: data.model.trim(),
        capacity: data.capacity?.trim() || '',
        calibrationPoint: data.calibrationPoint?.trim() || '',
        note: data.note?.trim() || '',
        updatedAt: serverTimestamp(),
      };

      if (existing) {
        // Update existing equipment
        await updateDoc(doc(db, 'equipment', existing.id), equipmentData);
        return existing.id;
      } else {
        // Create new equipment
        const newEquipmentData = {
          ...equipmentData,
          createdAt: serverTimestamp(),
        };
        const newDocRef = doc(collection(db, 'equipment'));
        await setDoc(newDocRef, newEquipmentData);
        return newDocRef.id;
      }
    } catch (error) {
      console.error('Error creating/updating equipment:', error);
      throw error;
    }
  },

  /**
   * Search equipment by name, manufacturer, or model
   * @param searchTerm Search query
   * @returns Promise with filtered equipment records
   */
  async searchEquipment(searchTerm: string): Promise<EquipmentRecord[]> {
    try {
      const allEquipment = await this.getAllEquipment();
      if (!searchTerm) return allEquipment;

      const term = searchTerm.toLowerCase();
      return allEquipment.filter(
        (eq) =>
          eq.name.toLowerCase().includes(term) ||
          eq.manufacturer.toLowerCase().includes(term) ||
          eq.model.toLowerCase().includes(term) ||
          eq.serialNumber.toLowerCase().includes(term)
      );
    } catch (error) {
      console.error('Error searching equipment:', error);
      throw error;
    }
  },
};
