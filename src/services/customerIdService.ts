import { db, doc, getDoc, setDoc, updateDoc, increment } from './firebase';
import type { CustomerIdSettings } from '../types';

const CUSTOMER_ID_SETTINGS_DOC = 'system/customerIdSettings';

// Default settings
export const DEFAULT_CUSTOMER_ID_SETTINGS: CustomerIdSettings = {
  prefix: 'CUS',
  organizationPrefix: 'CUS',
  idTypePrefix: '',
  currentYear: new Date().getFullYear(),
  currentSequence: 1,
  yearlyReset: true
};

/**
 * Load customer ID settings from Firestore
 */
export const loadCustomerIdSettings = async (): Promise<CustomerIdSettings> => {
  try {
    const docRef = doc(db, CUSTOMER_ID_SETTINGS_DOC);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data() as any;
      
      // Migrate from old structure (organizationPrefix + customerTypePrefix) to new structure (prefix)
      let settings: CustomerIdSettings;
      if (data.organizationPrefix && data.customerTypePrefix && !data.prefix) {
        // Old structure: use customerTypePrefix as the new prefix (or combine if needed)
        settings = {
          prefix: data.customerTypePrefix || 'CUS',
          organizationPrefix: data.organizationPrefix || data.customerTypePrefix || 'CUS',
          idTypePrefix: data.idTypePrefix || '',
          currentYear: data.currentYear || new Date().getFullYear(),
          currentSequence: data.currentSequence || 1,
          yearlyReset: data.yearlyReset !== undefined ? data.yearlyReset : true
        };
        // Save migrated settings
        await setDoc(docRef, settings);
      } else {
        settings = data as CustomerIdSettings;
      }
      
      // Check if year has changed and yearly reset is enabled
      const currentYear = new Date().getFullYear();
      if (settings.yearlyReset && settings.currentYear !== currentYear) {
        // Reset sequence for new year
        const updatedSettings = {
          ...settings,
          currentYear,
          currentSequence: 1
        };
        await setDoc(docRef, updatedSettings);
        return updatedSettings;
      }
      
      return settings;
    } else {
      // Initialize with default settings
      await setDoc(docRef, DEFAULT_CUSTOMER_ID_SETTINGS);
      return DEFAULT_CUSTOMER_ID_SETTINGS;
    }
  } catch (error) {
    console.error('Error loading customer ID settings:', error);
    return DEFAULT_CUSTOMER_ID_SETTINGS;
  }
};

/**
 * Save customer ID settings to Firestore
 */
export const saveCustomerIdSettings = async (settings: CustomerIdSettings): Promise<void> => {
  try {
    const docRef = doc(db, CUSTOMER_ID_SETTINGS_DOC);
    await setDoc(docRef, settings);
  } catch (error) {
    console.error('Error saving customer ID settings:', error);
    throw error;
  }
};

/**
 * Get the next customer ID without incrementing the sequence in database
 * Shows what the NEXT customer will be numbered as (current sequence + 1)
 * Used when opening the create customer modal to preview the ID
 */
export const getNextCustomerId = async (): Promise<string> => {
  try {
    const docRef = doc(db, CUSTOMER_ID_SETTINGS_DOC);
    const docSnap = await getDoc(docRef);
    
    let settings: CustomerIdSettings;
    
    if (docSnap.exists()) {
      settings = docSnap.data() as CustomerIdSettings;
      
      // Check if year has changed and yearly reset is enabled
      const currentYear = new Date().getFullYear();
      if (settings.yearlyReset && settings.currentYear !== currentYear) {
        settings = {
          ...settings,
          currentYear,
          currentSequence: 1
        };
        // Update year in Firestore but don't increment sequence yet
        await updateDoc(docRef, { currentYear, currentSequence: 1 });
      }
    } else {
      // Initialize with default settings
      settings = { ...DEFAULT_CUSTOMER_ID_SETTINGS };
      await setDoc(docRef, settings);
    }
    
    // Generate customer ID for the NEXT customer (current sequence represents the next customer to be created)
    // The sequence in the database always points to the next available number
    const customerId = formatCustomerId(settings);
    
    return customerId;
  } catch (error) {
    console.error('Error getting customer ID:', error);
    // Fallback to timestamp-based ID
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `CUS-${dateStr}-${randomStr}`;
  }
};

/**
 * Atomically increment the customer ID sequence after successfully saving a customer.
 * Uses Firestore increment() to avoid read-modify-write race conditions when
 * multiple users create customers concurrently.
 */
export const incrementCustomerIdSequence = async (): Promise<void> => {
  try {
    const docRef = doc(db, CUSTOMER_ID_SETTINGS_DOC);
    // increment() is atomic — concurrent calls can never produce the same sequence number
    await updateDoc(docRef, { currentSequence: increment(1) });
  } catch (error) {
    console.error('Error incrementing customer ID sequence:', error);
    throw error;
  }
};

/**
 * Format customer ID from settings
 * Format: [PREFIX]-[YY][XXX]
 * Example: CUS-25001
 */
export const formatCustomerId = (settings: CustomerIdSettings): string => {
  const year = settings.currentYear.toString().slice(-2); // Last 2 digits
  const sequence = settings.currentSequence.toString().padStart(3, '0'); // 3 digits with leading zeros
  
  return `${settings.prefix}-${year}${sequence}`;
};

/**
 * Preview customer ID without saving
 */
export const previewCustomerId = (settings: CustomerIdSettings): string => {
  return formatCustomerId(settings);
};

/**
 * Validate customer ID settings
 */
export const validateCustomerIdSettings = (settings: Partial<CustomerIdSettings>): string[] => {
  const errors: string[] = [];
  
  if (settings.prefix !== undefined) {
    if (!settings.prefix || settings.prefix.length === 0) {
      errors.push('Prefix cannot be empty');
    }
    if (settings.prefix.length > 10) {
      errors.push('Prefix must be 10 characters or less');
    }
    if (!/^[A-Z0-9]+$/.test(settings.prefix)) {
      errors.push('Prefix must contain only uppercase letters and numbers');
    }
  }
  
  if (settings.currentSequence !== undefined) {
    if (settings.currentSequence < 1) {
      errors.push('Sequence must be at least 1');
    }
    if (settings.currentSequence > 999) {
      errors.push('Sequence cannot exceed 999');
    }
  }
  
  if (settings.currentYear !== undefined) {
    const currentYear = new Date().getFullYear();
    if (settings.currentYear < 2000 || settings.currentYear > currentYear + 10) {
      errors.push(`Year must be between 2000 and ${currentYear + 10}`);
    }
  }
  
  return errors;
};
