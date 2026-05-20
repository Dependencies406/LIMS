import { db, doc, collection, query, getDocs, deleteDoc, updateDoc } from './firebase';
import { addDoc } from 'firebase/firestore';

const MANUFACTURER_LIST_COLLECTION = 'manufacturerList';

export interface ManufacturerListItem {
  id: string;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Load all manufacturer list items from Firestore
 */
export const loadManufacturerList = async (): Promise<ManufacturerListItem[]> => {
  try {
    const q = query(collection(db, MANUFACTURER_LIST_COLLECTION));
    const querySnapshot = await getDocs(q);
    
    const items: ManufacturerListItem[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        name: data.name,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      });
    });
    
    // Sort by name alphabetically
    return items.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error loading manufacturer list:', error);
    return [];
  }
};

/**
 * Add a new manufacturer item to the list
 */
export const addManufacturerItem = async (name: string): Promise<string> => {
  try {
    if (!name || name.trim().length === 0) {
      throw new Error('Manufacturer name cannot be empty');
    }
    
    // Check if item already exists
    const existingItems = await loadManufacturerList();
    const normalizedName = name.trim();
    if (existingItems.some(item => item.name.toLowerCase() === normalizedName.toLowerCase())) {
      throw new Error('Manufacturer name already exists');
    }
    
    const newItem = {
      name: normalizedName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const docRef = await addDoc(collection(db, MANUFACTURER_LIST_COLLECTION), newItem);
    return docRef.id;
  } catch (error) {
    console.error('Error adding manufacturer item:', error);
    throw error;
  }
};

/**
 * Update an existing manufacturer item
 */
export const updateManufacturerItem = async (id: string, name: string): Promise<void> => {
  try {
    if (!name || name.trim().length === 0) {
      throw new Error('Manufacturer name cannot be empty');
    }
    
    // Check if another item with the same name exists
    const existingItems = await loadManufacturerList();
    const normalizedName = name.trim();
    const duplicateItem = existingItems.find(item => 
      item.id !== id && item.name.toLowerCase() === normalizedName.toLowerCase()
    );
    
    if (duplicateItem) {
      throw new Error('Manufacturer name already exists');
    }
    
    const docRef = doc(db, MANUFACTURER_LIST_COLLECTION, id);
    await updateDoc(docRef, {
      name: normalizedName,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error updating manufacturer item:', error);
    throw error;
  }
};

/**
 * Delete a manufacturer item from the list
 */
export const deleteManufacturerItem = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, MANUFACTURER_LIST_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting manufacturer item:', error);
    throw error;
  }
};

/**
 * Get manufacturer names as a simple string array (for dropdowns)
 */
export const getManufacturerNames = async (): Promise<string[]> => {
  const items = await loadManufacturerList();
  return items.map(item => item.name);
};



































