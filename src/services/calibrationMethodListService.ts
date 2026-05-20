import { db, doc, collection, query, getDocs, deleteDoc, updateDoc } from './firebase';
import { addDoc } from 'firebase/firestore';

const CALIBRATION_METHOD_LIST_COLLECTION = 'calibrationMethodList';

export interface CalibrationMethodListItem {
  id: string;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Load all calibration method list items from Firestore
 */
export const loadCalibrationMethodList = async (): Promise<CalibrationMethodListItem[]> => {
  try {
    const q = query(collection(db, CALIBRATION_METHOD_LIST_COLLECTION));
    const querySnapshot = await getDocs(q);
    
    const items: CalibrationMethodListItem[] = [];
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
    console.error('Error loading calibration method list:', error);
    return [];
  }
};

/**
 * Add a new calibration method item to the list
 */
export const addCalibrationMethodItem = async (name: string): Promise<string> => {
  try {
    if (!name || name.trim().length === 0) {
      throw new Error('Calibration method name cannot be empty');
    }
    
    // Check if item already exists
    const existingItems = await loadCalibrationMethodList();
    const normalizedName = name.trim();
    if (existingItems.some(item => item.name.toLowerCase() === normalizedName.toLowerCase())) {
      throw new Error('Calibration method name already exists');
    }
    
    const newItem = {
      name: normalizedName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const docRef = await addDoc(collection(db, CALIBRATION_METHOD_LIST_COLLECTION), newItem);
    return docRef.id;
  } catch (error) {
    console.error('Error adding calibration method item:', error);
    throw error;
  }
};

/**
 * Update an existing calibration method item
 */
export const updateCalibrationMethodItem = async (id: string, name: string): Promise<void> => {
  try {
    if (!name || name.trim().length === 0) {
      throw new Error('Calibration method name cannot be empty');
    }
    
    // Check if another item with the same name exists
    const existingItems = await loadCalibrationMethodList();
    const normalizedName = name.trim();
    const duplicateItem = existingItems.find(item => 
      item.id !== id && item.name.toLowerCase() === normalizedName.toLowerCase()
    );
    
    if (duplicateItem) {
      throw new Error('Calibration method name already exists');
    }
    
    const docRef = doc(db, CALIBRATION_METHOD_LIST_COLLECTION, id);
    await updateDoc(docRef, {
      name: normalizedName,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error updating calibration method item:', error);
    throw error;
  }
};

/**
 * Delete a calibration method item from the list
 */
export const deleteCalibrationMethodItem = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, CALIBRATION_METHOD_LIST_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting calibration method item:', error);
    throw error;
  }
};

/**
 * Get calibration method names as a simple string array (for dropdowns)
 */
export const getCalibrationMethodNames = async (): Promise<string[]> => {
  const items = await loadCalibrationMethodList();
  return items.map(item => item.name);
};



































