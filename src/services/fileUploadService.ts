/**
 * File Upload Service
 * Handles file uploads to Firebase Storage
 */

import {
  storage,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from './firebase';
import type { UploadTaskSnapshot } from 'firebase/storage';

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
}

/**
 * Upload a file to Firebase Storage
 */
export const uploadFile = async (
  file: File,
  path: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<FileMetadata> => {
  try {
    // Create a storage reference
    const fileRef = storageRef(storage, path);

    // Create upload task
    const uploadTask = uploadBytesResumable(fileRef, file);

    // Return a promise that resolves when upload completes
    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot: UploadTaskSnapshot) => {
          // Progress callback
          if (onProgress) {
            const progress: UploadProgress = {
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
              percentage: (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
            };
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
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            
            const metadata: FileMetadata = {
              id: uploadTask.snapshot.ref.fullPath,
              name: file.name,
              size: file.size,
              type: file.type,
              url: downloadURL,
              uploadedAt: new Date(),
              uploadedBy: '', // Will be set by the caller
            };
            
            resolve(metadata);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  } catch (error) {
    console.error('Error initiating upload:', error);
    throw error;
  }
};

/**
 * Delete a file from Firebase Storage
 */
export const deleteFile = async (filePath: string): Promise<void> => {
  try {
    const fileRef = storageRef(storage, filePath);
    await deleteObject(fileRef);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

/**
 * Upload multiple files
 */
export const uploadMultipleFiles = async (
  files: File[],
  basePath: string,
  onProgress?: (fileIndex: number, progress: UploadProgress) => void
): Promise<FileMetadata[]> => {
  const uploadPromises = files.map((file, index) => {
    const filePath = `${basePath}/${Date.now()}_${file.name}`;
    return uploadFile(
      file,
      filePath,
      onProgress ? (progress) => onProgress(index, progress) : undefined
    );
  });

  return Promise.all(uploadPromises);
};

/**
 * Upload job attachment
 */
export const uploadJobAttachment = async (
  jobId: string,
  file: File,
  userId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<FileMetadata> => {
  const timestamp = Date.now();
  const filePath = `jobs/${jobId}/attachments/${timestamp}_${file.name}`;
  const metadata = await uploadFile(file, filePath, onProgress);
  
  return {
    ...metadata,
    uploadedBy: userId,
  };
};

/**
 * Delete job attachment
 */
export const deleteJobAttachment = async (filePath: string): Promise<void> => {
  return deleteFile(filePath);
};

/**
 * Validate file before upload
 */
export const validateFile = (
  file: File,
  options: {
    maxSize?: number; // in bytes
    allowedTypes?: string[];
  } = {}
): { valid: boolean; error?: string } => {
  const { maxSize = 10 * 1024 * 1024, allowedTypes } = options; // Default 10MB

  // Check file size
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds ${(maxSize / 1024 / 1024).toFixed(0)}MB limit`,
    };
  }

  // Check file type
  if (allowedTypes && allowedTypes.length > 0) {
    const fileType = file.type;
    const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    
    const isAllowed = allowedTypes.some(
      (type) => fileType === type || fileExtension === type
    );
    
    if (!isAllowed) {
      return {
        valid: false,
        error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
      };
    }
  }

  return { valid: true };
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Get file icon based on file type
 */
export const getFileIcon = (fileType: string): string => {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.startsWith('video/')) return '🎥';
  if (fileType.startsWith('audio/')) return '🎵';
  if (fileType.includes('pdf')) return '📄';
  if (fileType.includes('word') || fileType.includes('document')) return '📝';
  if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
  if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '📽️';
  if (fileType.includes('zip') || fileType.includes('compressed')) return '📦';
  return '📎';
};

/**
 * Export file upload service
 */
export const fileUploadService = {
  uploadFile,
  deleteFile,
  uploadMultipleFiles,
  uploadJobAttachment,
  deleteJobAttachment,
  validateFile,
  formatFileSize,
  getFileIcon,
};

