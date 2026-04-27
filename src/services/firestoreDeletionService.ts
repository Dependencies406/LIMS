/**
 * Centralized Firestore Deletion Service
 * 
 * ⚠️ CRITICAL: This is the ONLY service allowed to delete Firestore documents.
 * 
 * All deletion operations MUST go through this service to ensure:
 * - Recursive deletion of child collections
 * - Storage file cleanup
 * - Soft delete support
 * - Audit logging
 * 
 * ❌ FORBIDDEN: Direct deleteDoc() calls from UI components or other services
 * ✅ REQUIRED: All deletions must use this service
 * 
 * @module services/firestoreDeletionService
 */

import type { Firestore } from 'firebase/firestore';
import {
  db,
  storage,
  doc,
  collection,
  getDocs,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  Timestamp,
} from './firebase';

/**
 * Firestore modular API requires path segments (e.g. users, uid, notifications),
 * not one string with slashes — required for subcollection deletion to work.
 */
function collectionRefFromPath(firestore: Firestore, slashPath: string) {
  const segments = slashPath.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new Error(`Invalid collection path: ${slashPath}`);
  }
  return collection(firestore, segments[0], ...segments.slice(1));
}
import {
  getOwnershipRule,
  resolveCollectionPaths,
  resolveStoragePaths,
  getSubEntities,
} from '../dataLifecycle/firestoreOwnership';
import { deleteObject, ref as storageRef, listAll } from 'firebase/storage';

/**
 * Deletion options
 */
export interface DeletionOptions {
  /** User ID performing the deletion (for audit) */
  userId: string;
  /** Whether to perform soft delete (default: true) */
  softDelete?: boolean;
  /** Whether to delete Storage files (default: true) */
  deleteStorage?: boolean;
  /** Whether to delete child collections recursively (default: true) */
  recursive?: boolean;
  /** Force hard delete even if soft delete is enabled */
  forceHardDelete?: boolean;
}

/**
 * Deletion result
 */
export interface DeletionResult {
  /** Number of Firestore documents deleted */
  documentsDeleted: number;
  /** Number of Storage files deleted */
  filesDeleted: number;
  /** Whether soft delete was performed */
  softDeleted: boolean;
  /** Errors encountered (non-fatal) */
  errors: string[];
}

/**
 * Recursively delete a Firestore collection and all subcollections
 */
async function deleteCollectionRecursively(
  collectionPath: string
): Promise<number> {
  let deletedCount = 0;
  
  try {
    const collectionRef = collectionRefFromPath(db, collectionPath);
    const snapshot = await getDocs(collectionRef);
    
    // If collection is empty, return 0 (no error)
    if (snapshot.empty) {
      return 0;
    }
    
    // Delete all documents in this collection
    for (const docSnapshot of snapshot.docs) {
      try {
        // First, delete all subcollections
        const subcollections = await listSubcollections(docSnapshot.ref.path);
        for (const subcolPath of subcollections) {
          try {
            deletedCount += await deleteCollectionRecursively(subcolPath);
          } catch (subcolError: any) {
            // Log but don't throw - continue with other subcollections
            // Permission errors are expected if collection doesn't exist or is empty
            const isPermissionError = subcolError.code === 'permission-denied' || 
                                     subcolError.code === 'PERMISSION_DENIED' ||
                                     subcolError.message?.includes('permission');
            if (isPermissionError) {
              console.warn(`Permission denied when deleting subcollection ${subcolPath}. This may be expected if the collection doesn't exist.`);
            } else {
              console.error(`Error deleting subcollection ${subcolPath}:`, subcolError);
              // For non-permission errors, continue anyway as subcollection deletion is not critical
            }
          }
        }
        
        // Then delete the document itself
        await deleteDoc(docSnapshot.ref);
        deletedCount++;
      } catch (docError: any) {
        // Log individual document errors but continue with others
        const isPermissionError = docError.code === 'permission-denied' || 
                                 docError.code === 'PERMISSION_DENIED' ||
                                 docError.message?.includes('permission');
        if (isPermissionError) {
          console.warn(`Permission denied when deleting document ${docSnapshot.ref.path}. Continuing with other documents.`);
        } else {
          console.error(`Error deleting document ${docSnapshot.ref.path}:`, docError);
          // For non-permission errors, continue anyway to avoid blocking other deletions
        }
      }
    }
  } catch (error: any) {
    // Handle permission errors gracefully - they might be expected for empty/non-existent collections
    const isPermissionError = error.code === 'permission-denied' || 
                             error.code === 'PERMISSION_DENIED' ||
                             error.code === 'firestore/permission-denied' ||
                             error.message?.toLowerCase().includes('permission') ||
                             error.message?.toLowerCase().includes('insufficient permissions') ||
                             (typeof error.message === 'string' && error.message.toLowerCase().includes('missing or insufficient'));
    if (isPermissionError) {
      console.warn(`Permission denied when accessing collection ${collectionPath}. This may be expected if the collection doesn't exist, is empty, or the user lacks permissions. Error: ${error.message || error.code || 'unknown'}`);
      return 0; // Return 0 deleted count for permission errors (non-fatal)
    }
    // For other errors, log and re-throw
    console.error(`Error deleting collection ${collectionPath}:`, error);
    throw error;
  }
  
  return deletedCount;
}

/**
 * List all subcollections of a document
 * Note: Firestore client SDK doesn't have a direct way to list subcollections
 * We use a known list of possible subcollections based on the document path
 */
async function listSubcollections(documentPath: string): Promise<string[]> {
  const parts = documentPath.split('/');
  if (parts.length < 2) {
    return [];
  }
  
  // Extract entity type and IDs from path
  const subcollections: string[] = [];
  
  // Check if this is a job document (jobs/{jobId})
  if (parts[0] === 'jobs' && parts.length === 2) {
    const jobId = parts[1];
    subcollections.push(
      `jobs/${jobId}/equipment`,
      `jobs/${jobId}/documents`,
      `jobs/${jobId}/spreadsheets`,
      `jobs/${jobId}/attachments`,
      `jobs/${jobId}/serviceRequests`,
      `jobs/${jobId}/notifications`
    );
  }
  // Check if this is equipment document (jobs/{jobId}/equipment/{equipmentIndex})
  // Path structure: jobs/{jobId}/equipment/{equipmentIndex}
  // So parts[0]='jobs', parts[1]=jobId, parts[2]='equipment', parts[3]=equipmentIndex
  else if (parts.length === 4 && parts[0] === 'jobs' && parts[2] === 'equipment') {
    const jobId = parts[1];
    const equipmentId = parts[3];
    subcollections.push(
      `jobs/${jobId}/equipment/${equipmentId}/spreadsheets`,
      `jobs/${jobId}/equipment/${equipmentId}/attachments`,
      `jobs/${jobId}/equipment/${equipmentId}/calibrationRecords`
    );
  }
  // Check if this is a document document (jobs/{jobId}/documents/{documentId})
  else if (parts.length === 4 && parts[0] === 'jobs' && parts[2] === 'documents') {
    const jobId = parts[1];
    const documentId = parts[3];
    subcollections.push(
      `jobs/${jobId}/documents/${documentId}/revisions`,
      `jobs/${jobId}/documents/${documentId}/attachments`
    );
  }
  // Add more patterns as needed
  
  return subcollections;
}

/**
 * Delete all files in a Storage path
 */
async function deleteStoragePath(
  storagePath: string
): Promise<number> {
  let deletedCount = 0;
  
  try {
    // Convert path pattern to actual path (remove wildcards for listing)
    const basePath = storagePath.replace('/**', '').replace('**', '');
    const pathRef = storageRef(storage, basePath);
    
    // List all files in this path
    try {
      const result = await listAll(pathRef);
      
      // Delete all files
      for (const itemRef of result.items) {
        try {
          await deleteObject(itemRef);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting file ${itemRef.fullPath}:`, error);
        }
      }
      
      // Recursively delete files in subdirectories
      for (const prefixRef of result.prefixes) {
        deletedCount += await deleteStoragePath(prefixRef.fullPath + '/**');
      }
    } catch (error: any) {
      const code: any = error.code || error?.message || '';
      const codeStr = typeof code === 'string' ? code.toLowerCase() : '';
      const isNotFound =
        error.code === 'storage/object-not-found' ||
        codeStr.includes('object-not-found');
      const isUnauthorized =
        error.code === 'storage/unauthorized' ||
        codeStr.includes('unauthorized') ||
        codeStr.includes('permission');
      // For not-found or unauthorized/permission errors, treat as "nothing to delete".
      if (isNotFound || isUnauthorized) {
        return deletedCount;
      }
      // Anything else is unexpected: rethrow so outer catch can log.
      throw error;
    }
  } catch (error: any) {
    const code: any = error.code || error?.message || '';
    const codeStr = typeof code === 'string' ? code.toLowerCase() : '';
    const isUnauthorized =
      error.code === 'storage/unauthorized' ||
      codeStr.includes('unauthorized') ||
      codeStr.includes('permission');
    if (isUnauthorized) {
      // Expected when current user is not allowed to manage this Storage path.
      // Storage cleanup is best-effort; silently skip.
      return deletedCount;
    }
    console.error(`Error deleting storage path ${storagePath}:`, error);
    // Don't throw - Storage cleanup failures shouldn't block Firestore deletion
  }
  
  return deletedCount;
}

/**
 * Perform soft delete on a document
 */
async function performSoftDelete(
  documentPath: string,
  userId: string
): Promise<void> {
  const docRef = doc(db, documentPath);
  await updateDoc(docRef, {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: userId,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Restore a soft-deleted document
 */
async function performRestore(
  documentPath: string,
  userId: string
): Promise<void> {
  const docRef = doc(db, documentPath);
  await updateDoc(docRef, {
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    restoredAt: serverTimestamp(),
    restoredBy: userId,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Restore a soft-deleted job
 */
export async function restoreJob(
  jobId: string,
  userId: string
): Promise<void> {
  try {
    const jobDocPath = `jobs/${jobId}`;
    await performRestore(jobDocPath, userId);
  } catch (error: any) {
    console.error('Error restoring job:', error);
    throw new Error(`Failed to restore job: ${error.message}`);
  }
}

/**
 * Restore a soft-deleted customer
 */
export async function restoreCustomer(
  customerId: string,
  userId: string
): Promise<void> {
  try {
    const customerDocPath = `customers/${customerId}`;
    await performRestore(customerDocPath, userId);
  } catch (error: any) {
    console.error('Error restoring customer:', error);
    throw new Error(`Failed to restore customer: ${error.message}`);
  }
}

/**
 * Restore a soft-deleted document
 */
export async function restoreDocument(
  jobId: string,
  documentId: string,
  userId: string
): Promise<void> {
  try {
    const documentDocPath = `jobs/${jobId}/documents/${documentId}`;
    await performRestore(documentDocPath, userId);
  } catch (error: any) {
    console.error('Error restoring document:', error);
    throw new Error(`Failed to restore document: ${error.message}`);
  }
}

/**
 * Restore a soft-deleted template
 */
export async function restoreTemplate(
  templateId: string,
  userId: string
): Promise<void> {
  try {
    const templateDocPath = `templates/${templateId}`;
    await performRestore(templateDocPath, userId);
  } catch (error: any) {
    console.error('Error restoring template:', error);
    throw new Error(`Failed to restore template: ${error.message}`);
  }
}

/**
 * Restore a soft-deleted user
 */
export async function restoreUser(
  userId: string,
  restoredBy: string
): Promise<void> {
  try {
    const userDocPath = `users/${userId}`;
    await performRestore(userDocPath, restoredBy);
  } catch (error: any) {
    console.error('Error restoring user:', error);
    throw new Error(`Failed to restore user: ${error.message}`);
  }
}

/**
 * Permanently delete a job (hard delete)
 */
export async function permanentDeleteJob(
  jobId: string,
  userId: string
): Promise<DeletionResult> {
  return deleteJob(jobId, {
    userId,
    softDelete: false,
    forceHardDelete: true,
  });
}

/**
 * Permanently delete a customer (hard delete)
 */
export async function permanentDeleteCustomer(
  customerId: string,
  userId: string
): Promise<DeletionResult> {
  return deleteCustomer(customerId, {
    userId,
    softDelete: false,
    forceHardDelete: true,
  });
}

/**
 * Permanently delete a document (hard delete)
 */
export async function permanentDeleteDocument(
  jobId: string,
  documentId: string,
  userId: string
): Promise<DeletionResult> {
  return deleteDocument(jobId, documentId, {
    userId,
    softDelete: false,
    forceHardDelete: true,
  });
}

/**
 * Permanently delete a template (hard delete)
 */
export async function permanentDeleteTemplate(
  templateId: string,
  userId: string
): Promise<DeletionResult> {
  return deleteTemplate(templateId, {
    userId,
    softDelete: false,
    forceHardDelete: true,
  });
}

/**
 * Delete a job and all related data
 */
export async function deleteJob(
  jobId: string,
  options: DeletionOptions
): Promise<DeletionResult> {
  const result: DeletionResult = {
    documentsDeleted: 0,
    filesDeleted: 0,
    softDeleted: false,
    errors: [],
  };
  
  try {
    const rule = getOwnershipRule('job');
    if (!rule) {
      throw new Error('No ownership rule found for job');
    }

    // Soft delete only flags the job document; subcollections and files stay until hard delete.
    if (options.softDelete && !options.forceHardDelete) {
      await performSoftDelete(`jobs/${jobId}`, options.userId);
      result.softDeleted = true;
      return result;
    }
    
    // Resolve paths
    const collectionPaths = resolveCollectionPaths('job', { jobId });
    const storagePaths = resolveStoragePaths('job', { jobId });
    
    // Delete sub-entities first (equipment, documents, spreadsheets)
    const subEntities = getSubEntities('job');
    for (const subEntityType of subEntities) {
      try {
        // Get all sub-entities
        const subCollectionPath = collectionPaths.find(p => 
          p.includes(`/${subEntityType}`)
        );
        if (subCollectionPath) {
          const deleted = await deleteCollectionRecursively(subCollectionPath);
          result.documentsDeleted += deleted;
        }
      } catch (error: any) {
        result.errors.push(`Error deleting ${subEntityType}: ${error.message}`);
      }
    }
    
    // Delete Storage files
    if (options.deleteStorage !== false) {
      for (const storagePath of storagePaths) {
        try {
          const deleted = await deleteStoragePath(storagePath);
          result.filesDeleted += deleted;
        } catch (error: any) {
          result.errors.push(`Error deleting storage ${storagePath}: ${error.message}`);
        }
      }
    }
    
    // Hard delete job document (soft path returned above)
    const jobDocPath = `jobs/${jobId}`;
    await deleteDoc(doc(db, jobDocPath));
    result.documentsDeleted++;
    
  } catch (error: any) {
    console.error('Error deleting job:', error);
    throw new Error(`Failed to delete job: ${error.message}`);
  }
  
  return result;
}

/**
 * Delete equipment and all related data
 */
export async function deleteEquipment(
  jobId: string,
  equipmentId: string,
  options: DeletionOptions
): Promise<DeletionResult> {
  const result: DeletionResult = {
    documentsDeleted: 0,
    filesDeleted: 0,
    softDeleted: false,
    errors: [],
  };
  
  try {
    const rule = getOwnershipRule('equipment');
    if (!rule) {
      throw new Error('No ownership rule found for equipment');
    }
    
    // Resolve paths
    const collectionPaths = resolveCollectionPaths('equipment', { jobId, equipmentId });
    const storagePaths = resolveStoragePaths('equipment', { jobId, equipmentId });
    
    // Delete sub-entities first
    const subEntities = getSubEntities('equipment');
    for (const subEntityType of subEntities) {
      try {
        const subCollectionPath = collectionPaths.find(p => 
          p.includes(`/${subEntityType}`)
        );
        if (subCollectionPath) {
          const deleted = await deleteCollectionRecursively(subCollectionPath);
          result.documentsDeleted += deleted;
        }
      } catch (error: any) {
        result.errors.push(`Error deleting ${subEntityType}: ${error.message}`);
      }
    }
    
    // Delete Storage files
    if (options.deleteStorage !== false) {
      for (const storagePath of storagePaths) {
        try {
          const deleted = await deleteStoragePath(storagePath);
          result.filesDeleted += deleted;
        } catch (error: any) {
          result.errors.push(`Error deleting storage ${storagePath}: ${error.message}`);
        }
      }
    }
    
    // Delete or soft-delete the equipment document
    const equipmentDocPath = `jobs/${jobId}/equipment/${equipmentId}`;
    if (options.softDelete && !options.forceHardDelete) {
      await performSoftDelete(equipmentDocPath, options.userId);
      result.softDeleted = true;
    } else {
      await deleteDoc(doc(db, equipmentDocPath));
      result.documentsDeleted++;
    }
    
  } catch (error: any) {
    console.error('Error deleting equipment:', error);
    throw new Error(`Failed to delete equipment: ${error.message}`);
  }
  
  return result;
}

/**
 * Delete a document and all related data
 */
export async function deleteDocument(
  jobId: string,
  documentId: string,
  options: DeletionOptions
): Promise<DeletionResult> {
  const result: DeletionResult = {
    documentsDeleted: 0,
    filesDeleted: 0,
    softDeleted: false,
    errors: [],
  };
  
  try {
    const rule = getOwnershipRule('document');
    if (!rule) {
      throw new Error('No ownership rule found for document');
    }
    
    // Resolve paths
    const collectionPaths = resolveCollectionPaths('document', { jobId, documentId });
    const storagePaths = resolveStoragePaths('document', { jobId, documentId });
    
    // Delete subcollections
    for (const collectionPath of collectionPaths) {
      if (collectionPath !== `jobs/${jobId}/documents/${documentId}`) {
        try {
          const deleted = await deleteCollectionRecursively(collectionPath);
          result.documentsDeleted += deleted;
        } catch (error: any) {
          result.errors.push(`Error deleting collection ${collectionPath}: ${error.message}`);
        }
      }
    }
    
    // Delete Storage files
    if (options.deleteStorage !== false) {
      for (const storagePath of storagePaths) {
        try {
          const deleted = await deleteStoragePath(storagePath);
          result.filesDeleted += deleted;
        } catch (error: any) {
          result.errors.push(`Error deleting storage ${storagePath}: ${error.message}`);
        }
      }
    }
    
    // Delete or soft-delete the document
    const documentDocPath = `jobs/${jobId}/documents/${documentId}`;
    if (options.softDelete && !options.forceHardDelete) {
      await performSoftDelete(documentDocPath, options.userId);
      result.softDeleted = true;
    } else {
      await deleteDoc(doc(db, documentDocPath));
      result.documentsDeleted++;
    }
    
  } catch (error: any) {
    console.error('Error deleting document:', error);
    throw new Error(`Failed to delete document: ${error.message}`);
  }
  
  return result;
}

/**
 * Delete a template and all related data
 */
export async function deleteTemplate(
  templateId: string,
  options: DeletionOptions
): Promise<DeletionResult> {
  const result: DeletionResult = {
    documentsDeleted: 0,
    filesDeleted: 0,
    softDeleted: false,
    errors: [],
  };
  
  try {
    const rule = getOwnershipRule('template');
    if (!rule) {
      throw new Error('No ownership rule found for template');
    }
    
    // Resolve paths
    const collectionPaths = resolveCollectionPaths('template', { templateId });
    const storagePaths = resolveStoragePaths('template', { templateId });
    
    // Delete subcollections
    for (const collectionPath of collectionPaths) {
      if (collectionPath !== `templates/${templateId}`) {
        try {
          const deleted = await deleteCollectionRecursively(collectionPath);
          result.documentsDeleted += deleted;
        } catch (error: any) {
          result.errors.push(`Error deleting collection ${collectionPath}: ${error.message}`);
        }
      }
    }
    
    // Delete Storage files
    if (options.deleteStorage !== false) {
      for (const storagePath of storagePaths) {
        try {
          const deleted = await deleteStoragePath(storagePath);
          result.filesDeleted += deleted;
        } catch (error: any) {
          result.errors.push(`Error deleting storage ${storagePath}: ${error.message}`);
        }
      }
    }
    
    // Delete or soft-delete the template
    const templateDocPath = `templates/${templateId}`;
    if (options.softDelete && !options.forceHardDelete) {
      await performSoftDelete(templateDocPath, options.userId);
      result.softDeleted = true;
    } else {
      await deleteDoc(doc(db, templateDocPath));
      result.documentsDeleted++;
    }
    
  } catch (error: any) {
    console.error('Error deleting template:', error);
    throw new Error(`Failed to delete template: ${error.message}`);
  }
  
  return result;
}

/**
 * Delete a customer and all related data
 */
export async function deleteCustomer(
  customerId: string,
  options: DeletionOptions
): Promise<DeletionResult> {
  const result: DeletionResult = {
    documentsDeleted: 0,
    filesDeleted: 0,
    softDeleted: false,
    errors: [],
  };
  
  try {
    const rule = getOwnershipRule('customer');
    if (!rule) {
      throw new Error('No ownership rule found for customer');
    }
    
    // Resolve paths
    const collectionPaths = resolveCollectionPaths('customer', { customerId });
    const storagePaths = resolveStoragePaths('customer', { customerId });
    
    // Delete subcollections
    for (const collectionPath of collectionPaths) {
      if (collectionPath !== `customers/${customerId}`) {
        try {
          const deleted = await deleteCollectionRecursively(collectionPath);
          result.documentsDeleted += deleted;
        } catch (error: any) {
          result.errors.push(`Error deleting collection ${collectionPath}: ${error.message}`);
        }
      }
    }
    
    // Delete Storage files
    if (options.deleteStorage !== false) {
      for (const storagePath of storagePaths) {
        try {
          const deleted = await deleteStoragePath(storagePath);
          result.filesDeleted += deleted;
        } catch (error: any) {
          result.errors.push(`Error deleting storage ${storagePath}: ${error.message}`);
        }
      }
    }
    
    // Delete or soft-delete the customer
    const customerDocPath = `customers/${customerId}`;
    if (options.softDelete && !options.forceHardDelete) {
      await performSoftDelete(customerDocPath, options.userId);
      result.softDeleted = true;
    } else {
      await deleteDoc(doc(db, customerDocPath));
      result.documentsDeleted++;
    }
    
  } catch (error: any) {
    console.error('Error deleting customer:', error);
    throw new Error(`Failed to delete customer: ${error.message}`);
  }
  
  return result;
}

/**
 * Delete a user and all related data
 */
export async function deleteUser(
  userId: string,
  options: DeletionOptions
): Promise<DeletionResult> {
  const result: DeletionResult = {
    documentsDeleted: 0,
    filesDeleted: 0,
    softDeleted: false,
    errors: [],
  };
  
  try {
    const rule = getOwnershipRule('user');
    if (!rule) {
      throw new Error('No ownership rule found for user');
    }
    
    // Resolve paths
    const collectionPaths = resolveCollectionPaths('user', { userId });
    const storagePaths = resolveStoragePaths('user', { userId });
    
    // Delete subcollections
    for (const collectionPath of collectionPaths) {
      if (collectionPath !== `users/${userId}`) {
        try {
          const deleted = await deleteCollectionRecursively(collectionPath);
          result.documentsDeleted += deleted;
        } catch (error: any) {
          result.errors.push(`Error deleting collection ${collectionPath}: ${error.message}`);
        }
      }
    }
    
    // Delete Storage files
    if (options.deleteStorage !== false) {
      for (const storagePath of storagePaths) {
        try {
          const deleted = await deleteStoragePath(storagePath);
          result.filesDeleted += deleted;
        } catch (error: any) {
          result.errors.push(`Error deleting storage ${storagePath}: ${error.message}`);
        }
      }
    }
    
    // Delete or soft-delete the user
    const userDocPath = `users/${userId}`;
    if (options.softDelete && !options.forceHardDelete) {
      await performSoftDelete(userDocPath, options.userId);
      result.softDeleted = true;
    } else {
      await deleteDoc(doc(db, userDocPath));
      result.documentsDeleted++;
    }
    
  } catch (error: any) {
    console.error('Error deleting user:', error);
    throw new Error(`Failed to delete user: ${error.message}`);
  }
  
  return result;
}
