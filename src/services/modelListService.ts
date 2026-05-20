import { db, doc, collection, query, getDocs, deleteDoc, updateDoc } from './firebase';
import { addDoc } from 'firebase/firestore';

const MODEL_LIST_COLLECTION = 'modelList';

export interface ModelListItem {
  id: string;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Load all model list items from Firestore
 */
export const loadModelList = async (): Promise<ModelListItem[]> => {
  try {
    const q = query(collection(db, MODEL_LIST_COLLECTION));
    const querySnapshot = await getDocs(q);
    
    const items: ModelListItem[] = [];
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
    console.error('Error loading model list:', error);
    return [];
  }
};

/**
 * Add a new model item to the list
 */
export const addModelItem = async (name: string): Promise<string> => {
  try {
    if (!name || name.trim().length === 0) {
      throw new Error('Model name cannot be empty');
    }
    
    // Check if item already exists
    const existingItems = await loadModelList();
    const normalizedName = name.trim();
    if (existingItems.some(item => item.name.toLowerCase() === normalizedName.toLowerCase())) {
      throw new Error('Model name already exists');
    }
    
    const newItem = {
      name: normalizedName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const docRef = await addDoc(collection(db, MODEL_LIST_COLLECTION), newItem);
    return docRef.id;
  } catch (error) {
    console.error('Error adding model item:', error);
    throw error;
  }
};

/**
 * Update an existing model item
 */
export const updateModelItem = async (id: string, name: string): Promise<void> => {
  try {
    if (!name || name.trim().length === 0) {
      throw new Error('Model name cannot be empty');
    }
    
    // Check if another item with the same name exists
    const existingItems = await loadModelList();
    const normalizedName = name.trim();
    const duplicateItem = existingItems.find(item => 
      item.id !== id && item.name.toLowerCase() === normalizedName.toLowerCase()
    );
    
    if (duplicateItem) {
      throw new Error('Model name already exists');
    }
    
    const docRef = doc(db, MODEL_LIST_COLLECTION, id);
    await updateDoc(docRef, {
      name: normalizedName,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error updating model item:', error);
    throw error;
  }
};

/**
 * Delete a model item from the list
 */
export const deleteModelItem = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, MODEL_LIST_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting model item:', error);
    throw error;
  }
};

/**
 * Get model names as a simple string array (for dropdowns)
 */
export const getModelNames = async (): Promise<string[]> => {
  const items = await loadModelList();
  return items.map(item => item.name);
};



































