import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase';
import type { CompanyInfo } from '../types';

const COMPANY_INFO_DOC = 'system/companyInfo';
const LOGO_STORAGE_PATH = 'company/logo';

// Default company info structure
export const DEFAULT_COMPANY_INFO: Omit<CompanyInfo, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'> = {
  companyName: '',
  logoUrl: '',
  address: {
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: ''
  },
  contactInfo: {
    phone: '',
    email: '',
    website: '',
    fax: ''
  },
  additionalInfo: {
    taxId: '',
    registrationNumber: '',
    businessLicense: ''
  }
};

/**
 * Get company information from Firestore
 */
export const getCompanyInfo = async (): Promise<CompanyInfo | null> => {
  try {
    const docRef = doc(db, COMPANY_INFO_DOC);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as CompanyInfo;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting company info:', error);
    throw error;
  }
};

/**
 * Save or update company information
 */
export const saveCompanyInfo = async (
  companyInfo: Partial<CompanyInfo>, 
  updatedBy: string
): Promise<CompanyInfo> => {
  try {
    const docRef = doc(db, COMPANY_INFO_DOC);
    const docSnap = await getDoc(docRef);
    
    const now = new Date();
    const updateData = {
      ...companyInfo,
      updatedAt: serverTimestamp(),
      updatedBy
    };

    if (docSnap.exists()) {
      // Update existing document
      await updateDoc(docRef, updateData);
    } else {
      // Create new document
      await setDoc(docRef, {
        ...DEFAULT_COMPANY_INFO,
        ...updateData,
        createdAt: serverTimestamp()
      });
    }

    // Return the updated company info
    const updatedDoc = await getDoc(docRef);
    const data = updatedDoc.data();
    return {
      id: updatedDoc.id,
      ...data,
      createdAt: data?.createdAt?.toDate() || now,
      updatedAt: data?.updatedAt?.toDate() || now,
    } as CompanyInfo;
  } catch (error) {
    console.error('Error saving company info:', error);
    throw error;
  }
};

/**
 * Upload company logo to Firebase Storage
 */
export const uploadCompanyLogo = async (file: File): Promise<string> => {
  try {
    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop();
    const fileName = `logo_${timestamp}.${fileExtension}`;
    
    // Create storage reference
    const storageRef = ref(storage, `${LOGO_STORAGE_PATH}/${fileName}`);
    
    // Upload file
    const snapshot = await uploadBytes(storageRef, file);
    
    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading company logo:', error);
    throw error;
  }
};

/**
 * Delete company logo from Firebase Storage
 */
export const deleteCompanyLogo = async (logoUrl: string): Promise<void> => {
  try {
    if (!logoUrl) return;
    
    // Extract file path from URL
    const url = new URL(logoUrl);
    const pathMatch = url.pathname.match(/\/o\/(.+)\?/);
    
    if (pathMatch) {
      const filePath = decodeURIComponent(pathMatch[1]);
      const storageRef = ref(storage, filePath);
      await deleteObject(storageRef);
    }
  } catch (error) {
    console.error('Error deleting company logo:', error);
    // Don't throw error for logo deletion failures
  }
};

/**
 * Save company info with logo upload
 */
export const saveCompanyInfoWithLogo = async (
  companyInfo: Partial<CompanyInfo>,
  logoFile: File | null,
  updatedBy: string
): Promise<CompanyInfo> => {
  try {
    let logoUrl = companyInfo.logoUrl;

    // Handle logo upload if new file is provided
    if (logoFile) {
      // Delete old logo if exists
      if (logoUrl) {
        await deleteCompanyLogo(logoUrl);
      }
      
      // Upload new logo
      logoUrl = await uploadCompanyLogo(logoFile);
    }

    // Save company info with logo URL
    const updatedCompanyInfo = {
      ...companyInfo,
      logoUrl
    };

    return await saveCompanyInfo(updatedCompanyInfo, updatedBy);
  } catch (error) {
    console.error('Error saving company info with logo:', error);
    throw error;
  }
};

/**
 * Validate company information
 */
export const validateCompanyInfo = (companyInfo: Partial<CompanyInfo>): string[] => {
  const errors: string[] = [];

  if (!companyInfo.companyName?.trim()) {
    errors.push('Company name is required');
  }

  if (!companyInfo.address?.street?.trim()) {
    errors.push('Street address is required');
  }

  if (!companyInfo.address?.city?.trim()) {
    errors.push('City is required');
  }

  if (!companyInfo.address?.state?.trim()) {
    errors.push('State/Province is required');
  }

  if (!companyInfo.address?.postalCode?.trim()) {
    errors.push('Postal code is required');
  }

  if (!companyInfo.address?.country?.trim()) {
    errors.push('Country is required');
  }

  if (!companyInfo.contactInfo?.phone?.trim()) {
    errors.push('Phone number is required');
  }

  if (!companyInfo.contactInfo?.email?.trim()) {
    errors.push('Email address is required');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyInfo.contactInfo.email)) {
    errors.push('Please enter a valid email address');
  }

  return errors;
};

/**
 * Format company address for display
 */
export const formatCompanyAddress = (address: CompanyInfo['address']): string => {
  if (!address) return '';
  
  const parts = [
    address.street,
    address.city,
    address.state,
    address.postalCode,
    address.country
  ].filter(part => part?.trim());
  
  return parts.join(', ');
};

/**
 * Format company contact info for display
 */
export const formatCompanyContact = (contactInfo: CompanyInfo['contactInfo']): string => {
  if (!contactInfo) return '';
  
  const parts = [
    contactInfo.phone,
    contactInfo.email,
    contactInfo.website,
    contactInfo.fax
  ].filter(part => part?.trim());
  
  return parts.join(' | ');
};
