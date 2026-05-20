/**
 * Equipment File Service
 * Handles file uploads and management for equipment attachments
 * 
 * Files are scoped to: jobs/{jobId}/equipment/{equipmentIndex}/attachments
 * - Metadata stored in Firestore
 * - Actual files stored in Firebase Storage
 */

import { storage, db } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import type { EquipmentAttachment, Equipment } from '../types';

/**
 * Storage path pattern: jobs/{jobId}/equipment/{equipmentIndex}/attachments/{fileName}
 */
const getStoragePath = (jobId: string, equipmentIndex: number, fileName: string): string => {
  return `jobs/${jobId}/equipment/${equipmentIndex}/attachments/${fileName}`;
};

/**
 * Upload a file for an equipment item
 */
export const uploadEquipmentFile = async (
  jobId: string,
  equipmentIndex: number,
  file: File,
  uploadedBy: string,
  onProgress?: (progress: number) => void
): Promise<EquipmentAttachment> => {
  try {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    // Removed unused variable: fileExtension
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedFileName}`;
    
    // Create storage reference
    const storagePath = getStoragePath(jobId, equipmentIndex, fileName);
    const storageReference = ref(storage, storagePath);
    
    // Upload file to Firebase Storage with progress tracking
    const uploadTask = uploadBytesResumable(storageReference, file);
    
    // Return a promise that resolves when upload completes
    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          // Progress callback
          if (onProgress) {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            onProgress(progress);
          }
        },
        (error) => {
          // Error callback
          console.error('Upload error:', error);
          reject(error);
        },
        async () => {
          // Success callback
          try {
            // Get download URL
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            
            // Create attachment metadata
            const attachment: EquipmentAttachment = {
              id: `${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
              fileName: file.name,
              fileType: file.type || 'application/octet-stream',
              fileSize: file.size,
              storagePath,
              downloadURL,
              uploadedBy,
              uploadedAt: new Date(),
            };
            
            // Save metadata to Firestore
            // Note: Firestore doesn't support nested arrayUnion, so we need to update the entire equipment array
            const jobRef = doc(db, 'jobs', jobId);
            const jobDoc = await getDoc(jobRef);
            
            if (!jobDoc.exists()) {
              throw new Error('Job not found');
            }
            
            const jobData = jobDoc.data();
            const equipment: Equipment[] = jobData.equipment || [];
            
            // Ensure equipment at index exists
            if (!equipment[equipmentIndex]) {
              throw new Error(`Equipment at index ${equipmentIndex} not found`);
            }
            
            // Add attachment to equipment item
            const updatedEquipment = [...equipment];
            updatedEquipment[equipmentIndex] = {
              ...updatedEquipment[equipmentIndex],
              attachments: [
                ...(updatedEquipment[equipmentIndex].attachments || []),
                attachment
              ]
            };
            
            await updateDoc(jobRef, {
              equipment: updatedEquipment,
              updatedAt: serverTimestamp(),
            });
            
            resolve(attachment);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  } catch (error) {
    console.error('Error uploading equipment file:', error);
    throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Delete an equipment file (removes from both Storage and Firestore)
 */
export const deleteEquipmentFile = async (
  jobId: string,
  equipmentIndex: number,
  attachment: EquipmentAttachment,
  _deletedBy: string
): Promise<void> => {
  try {
    // Check if user has permission (uploader or admin)
    // Note: Admin check should be done in the component before calling this
    
    // Delete from Firebase Storage
    const storageReference = ref(storage, attachment.storagePath);
    await deleteObject(storageReference);
    
    // Remove metadata from Firestore
    // Note: Firestore doesn't support nested arrayRemove, so we need to update the entire equipment array
    const jobRef = doc(db, 'jobs', jobId);
    const jobDoc = await getDoc(jobRef);
    
    if (!jobDoc.exists()) {
      throw new Error('Job not found');
    }
    
    const jobData = jobDoc.data();
    const equipment: Equipment[] = jobData.equipment || [];
    
    // Ensure equipment at index exists
    if (!equipment[equipmentIndex]) {
      throw new Error(`Equipment at index ${equipmentIndex} not found`);
    }
    
    // Remove attachment from equipment item
    const updatedEquipment = [...equipment];
    updatedEquipment[equipmentIndex] = {
      ...updatedEquipment[equipmentIndex],
      attachments: (updatedEquipment[equipmentIndex].attachments || []).filter(
        (att) => att.id !== attachment.id
      )
    };
    
    await updateDoc(jobRef, {
      equipment: updatedEquipment,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error deleting equipment file:', error);
    throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Get download URL for an equipment file
 */
export const getEquipmentFileDownloadURL = async (
  storagePath: string
): Promise<string> => {
  try {
    const storageReference = ref(storage, storagePath);
    return await getDownloadURL(storageReference);
  } catch (error) {
    console.error('Error getting download URL:', error);
    throw new Error(`Failed to get download URL: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Get file type icon/color
 */
export const getFileTypeInfo = (fileType: string): { icon: string; color: string } => {
  const type = fileType.toLowerCase();
  
  if (type.includes('pdf')) {
    return { icon: '📄', color: 'text-red-600' };
  }
  if (type.includes('image')) {
    return { icon: '🖼️', color: 'text-blue-600' };
  }
  if (type.includes('excel') || type.includes('spreadsheet')) {
    return { icon: '📊', color: 'text-green-600' };
  }
  if (type.includes('word') || type.includes('document')) {
    return { icon: '📝', color: 'text-blue-600' };
  }
  if (type.includes('zip') || type.includes('archive')) {
    return { icon: '📦', color: 'text-gray-600' };
  }
  
  return { icon: '📎', color: 'text-gray-600' };
};

