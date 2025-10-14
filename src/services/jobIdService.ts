import { db, doc, getDoc, setDoc, updateDoc } from './firebase';
import type { JobIdSettings } from '../types';

const JOB_ID_SETTINGS_DOC = 'system/jobIdSettings';

// Default settings
export const DEFAULT_JOB_ID_SETTINGS: JobIdSettings = {
  organizationPrefix: 'CPN',
  jobTypePrefix: 'CAL',
  currentYear: new Date().getFullYear(),
  currentSequence: 1,
  yearlyReset: true
};

/**
 * Load job ID settings from Firestore
 */
export const loadJobIdSettings = async (): Promise<JobIdSettings> => {
  try {
    const docRef = doc(db, JOB_ID_SETTINGS_DOC);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data() as JobIdSettings;
      
      // Check if year has changed and yearly reset is enabled
      const currentYear = new Date().getFullYear();
      if (data.yearlyReset && data.currentYear !== currentYear) {
        // Reset sequence for new year
        const updatedSettings = {
          ...data,
          currentYear,
          currentSequence: 1
        };
        await setDoc(docRef, updatedSettings);
        return updatedSettings;
      }
      
      return data;
    } else {
      // Initialize with default settings
      await setDoc(docRef, DEFAULT_JOB_ID_SETTINGS);
      return DEFAULT_JOB_ID_SETTINGS;
    }
  } catch (error) {
    console.error('Error loading job ID settings:', error);
    return DEFAULT_JOB_ID_SETTINGS;
  }
};

/**
 * Save job ID settings to Firestore
 */
export const saveJobIdSettings = async (settings: JobIdSettings): Promise<void> => {
  try {
    const docRef = doc(db, JOB_ID_SETTINGS_DOC);
    await setDoc(docRef, settings);
  } catch (error) {
    console.error('Error saving job ID settings:', error);
    throw error;
  }
};

/**
 * Get the next job ID without incrementing the sequence in database
 * Shows what the NEXT job will be numbered as (current sequence + 1)
 * Used when opening the create job modal to preview the ID
 */
export const getNextJobId = async (): Promise<string> => {
  try {
    const docRef = doc(db, JOB_ID_SETTINGS_DOC);
    const docSnap = await getDoc(docRef);
    
    let settings: JobIdSettings;
    
    if (docSnap.exists()) {
      settings = docSnap.data() as JobIdSettings;
      
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
      settings = { ...DEFAULT_JOB_ID_SETTINGS };
      await setDoc(docRef, settings);
    }
    
    // Generate job ID for the NEXT job (current sequence represents the next job to be created)
    // The sequence in the database always points to the next available number
    const jobId = formatJobId(settings);
    
    return jobId;
  } catch (error) {
    console.error('Error getting job ID:', error);
    // Fallback to timestamp-based ID
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `JOB-${dateStr}-${randomStr}`;
  }
};

/**
 * Increment the job ID sequence after successfully saving a job
 * Called after job is saved to database
 */
export const incrementJobIdSequence = async (): Promise<void> => {
  try {
    const docRef = doc(db, JOB_ID_SETTINGS_DOC);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const settings = docSnap.data() as JobIdSettings;
      const nextSequence = settings.currentSequence + 1;
      
      // Only increment if sequence is within valid range
      if (nextSequence <= 999) {
        await updateDoc(docRef, { currentSequence: nextSequence });
      } else {
        console.warn('Job ID sequence has reached maximum (999). Consider yearly reset or manual adjustment.');
      }
    }
  } catch (error) {
    console.error('Error incrementing job ID sequence:', error);
    throw error;
  }
};

/**
 * Format job ID from settings
 * Format: [ORG]-[TYPE]-[YY][XXX]
 * Example: CPN-CAL-25001
 */
export const formatJobId = (settings: JobIdSettings): string => {
  const year = settings.currentYear.toString().slice(-2); // Last 2 digits
  const sequence = settings.currentSequence.toString().padStart(3, '0'); // 3 digits with leading zeros
  
  return `${settings.organizationPrefix}-${settings.jobTypePrefix}-${year}${sequence}`;
};

/**
 * Preview job ID without saving
 */
export const previewJobId = (settings: JobIdSettings): string => {
  return formatJobId(settings);
};

/**
 * Validate job ID settings
 */
export const validateJobIdSettings = (settings: Partial<JobIdSettings>): string[] => {
  const errors: string[] = [];
  
  if (settings.organizationPrefix !== undefined) {
    if (!settings.organizationPrefix || settings.organizationPrefix.length === 0) {
      errors.push('Organization prefix cannot be empty');
    }
    if (settings.organizationPrefix.length > 10) {
      errors.push('Organization prefix must be 10 characters or less');
    }
    if (!/^[A-Z0-9]+$/.test(settings.organizationPrefix)) {
      errors.push('Organization prefix must contain only uppercase letters and numbers');
    }
  }
  
  if (settings.jobTypePrefix !== undefined) {
    if (!settings.jobTypePrefix || settings.jobTypePrefix.length === 0) {
      errors.push('Job type prefix cannot be empty');
    }
    if (settings.jobTypePrefix.length > 10) {
      errors.push('Job type prefix must be 10 characters or less');
    }
    if (!/^[A-Z0-9]+$/.test(settings.jobTypePrefix)) {
      errors.push('Job type prefix must contain only uppercase letters and numbers');
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

