/**
 * Orphan Detection Service
 * 
 * Detects and optionally cleans up orphaned Firestore documents
 * and Storage files that have no parent reference.
 * 
 * This is a safety net to catch any data that wasn't properly deleted.
 * 
 * @module services/orphanDetectionService
 */

import {
  db,
  storage,
  collection,
  getDocs,
  query,
  doc,
  getDoc,
  deleteDoc,
} from './firebase';
import { deleteObject, ref, listAll } from 'firebase/storage';

/**
 * Orphan detection result
 */
export interface OrphanDetectionResult {
  /** Orphaned Firestore documents found */
  orphanedDocuments: Array<{
    path: string;
    type: string;
    reason: string;
  }>;
  /** Orphaned Storage files found */
  orphanedFiles: Array<{
    path: string;
    reason: string;
  }>;
  /** Whether to auto-delete orphans */
  autoDelete: boolean;
  /** Number of documents deleted */
  documentsDeleted: number;
  /** Number of files deleted */
  filesDeleted: number;
  /** Errors encountered */
  errors: string[];
}

/**
 * Detect orphaned equipment documents
 * Equipment should have a parent job that exists
 */
async function detectOrphanedEquipment(): Promise<Array<{ path: string; reason: string }>> {
  const orphans: Array<{ path: string; reason: string }> = [];
  
  try {
    // Get all equipment (using collectionGroup query)
    const equipmentQuery = query(collection(db, 'jobs'));
    const jobsSnapshot = await getDocs(equipmentQuery);
    
    for (const jobDoc of jobsSnapshot.docs) {
      const jobId = jobDoc.id;
      const equipmentRef = collection(db, `jobs/${jobId}/equipment`);
      const equipmentSnapshot = await getDocs(equipmentRef);
      
      // Check if parent job exists and is not deleted
      const jobData = jobDoc.data();
      if (jobData.isDeleted) {
        // Job is soft-deleted, equipment should be cleaned up
        for (const eqDoc of equipmentSnapshot.docs) {
          orphans.push({
            path: eqDoc.ref.path,
            reason: `Parent job ${jobId} is soft-deleted`,
          });
        }
      }
    }
  } catch (error: any) {
    console.error('Error detecting orphaned equipment:', error);
  }
  
  return orphans;
}

/**
 * Detect orphaned documents
 * Documents should have a parent job that exists
 */
async function detectOrphanedDocuments(): Promise<Array<{ path: string; reason: string }>> {
  const orphans: Array<{ path: string; reason: string }> = [];
  
  try {
    const jobsQuery = query(collection(db, 'jobs'));
    const jobsSnapshot = await getDocs(jobsQuery);
    
    for (const jobDoc of jobsSnapshot.docs) {
      const jobId = jobDoc.id;
      const documentsRef = collection(db, `jobs/${jobId}/documents`);
      const documentsSnapshot = await getDocs(documentsRef);
      
      const jobData = jobDoc.data();
      if (jobData.isDeleted) {
        for (const docDoc of documentsSnapshot.docs) {
          orphans.push({
            path: docDoc.ref.path,
            reason: `Parent job ${jobId} is soft-deleted`,
          });
        }
      }
    }
  } catch (error: any) {
    console.error('Error detecting orphaned documents:', error);
  }
  
  return orphans;
}

/**
 * Detect orphaned Storage files
 * Files should have a corresponding Firestore document
 * 
 * Note: This is a simplified version. For production, consider using
 * Firebase Admin SDK for more efficient bulk operations.
 */
async function detectOrphanedStorageFiles(): Promise<Array<{ path: string; reason: string }>> {
  const orphans: Array<{ path: string; reason: string }> = [];
  
  try {
    // Check job files
    const jobsRef = ref(storage, 'jobs');
    const jobsResult = await listAll(jobsRef);
    
    for (const jobPrefix of jobsResult.prefixes) {
      const jobId = jobPrefix.name;
      
      // Check if job exists
      const jobDocRef = doc(db, 'jobs', jobId);
      const jobDoc = await getDoc(jobDocRef);
      
      if (!jobDoc.exists() || jobDoc.data()?.isDeleted) {
        // Job doesn't exist or is deleted, all files are orphaned
        const jobFiles = await listAll(jobPrefix);
        for (const file of jobFiles.items) {
          orphans.push({
            path: file.fullPath,
            reason: `Parent job ${jobId} does not exist or is deleted`,
          });
        }
        
        // Also check subdirectories
        for (const subPrefix of jobFiles.prefixes) {
          const subFiles = await listAll(subPrefix);
          for (const file of subFiles.items) {
            orphans.push({
              path: file.fullPath,
              reason: `Parent job ${jobId} does not exist or is deleted`,
            });
          }
        }
      } else {
        // Check equipment files
        const equipmentPrefixRef = ref(storage, `jobs/${jobId}/equipment`);
        try {
          const equipmentResult = await listAll(equipmentPrefixRef);
          
          for (const eqPrefix of equipmentResult.prefixes) {
            const equipmentId = eqPrefix.name;
            const equipmentDocRef = doc(
              db,
              `jobs/${jobId}/equipment/${equipmentId}`
            );
            const equipmentDoc = await getDoc(equipmentDocRef);
            
            if (!equipmentDoc.exists() || equipmentDoc.data()?.isDeleted) {
              const eqFiles = await listAll(eqPrefix);
              for (const file of eqFiles.items) {
                orphans.push({
                  path: file.fullPath,
                  reason: `Parent equipment ${equipmentId} does not exist or is deleted`,
                });
              }
            }
          }
        } catch (error: any) {
          // Equipment directory might not exist, that's okay
          if (error.code !== 'storage/object-not-found') {
            console.warn(`Error checking equipment files for job ${jobId}:`, error);
          }
        }
      }
    }
  } catch (error: any) {
    console.error('Error detecting orphaned Storage files:', error);
    // Don't throw - orphan detection failures shouldn't break the app
  }
  
  return orphans;
}

/**
 * Detect all orphaned data
 */
export async function detectOrphans(
  autoDelete: boolean = false
): Promise<OrphanDetectionResult> {
  const result: OrphanDetectionResult = {
    orphanedDocuments: [],
    orphanedFiles: [],
    autoDelete,
    documentsDeleted: 0,
    filesDeleted: 0,
    errors: [],
  };
  
  try {
    // Detect orphaned equipment
    const orphanedEquipment = await detectOrphanedEquipment();
    for (const orphan of orphanedEquipment) {
      result.orphanedDocuments.push({
        path: orphan.path,
        type: 'equipment',
        reason: orphan.reason,
      });
      
      if (autoDelete) {
        try {
          await deleteDoc(doc(db, orphan.path));
          result.documentsDeleted++;
        } catch (error: any) {
          result.errors.push(`Error deleting ${orphan.path}: ${error.message}`);
        }
      }
    }
    
    // Detect orphaned documents
    const orphanedDocuments = await detectOrphanedDocuments();
    for (const orphan of orphanedDocuments) {
      result.orphanedDocuments.push({
        path: orphan.path,
        type: 'document',
        reason: orphan.reason,
      });
      
      if (autoDelete) {
        try {
          await deleteDoc(doc(db, orphan.path));
          result.documentsDeleted++;
        } catch (error: any) {
          result.errors.push(`Error deleting ${orphan.path}: ${error.message}`);
        }
      }
    }
    
    // Detect orphaned Storage files
    const orphanedFiles = await detectOrphanedStorageFiles();
    for (const orphan of orphanedFiles) {
      result.orphanedFiles.push({
        path: orphan.path,
        reason: orphan.reason,
      });
      
      if (autoDelete) {
        try {
          const fileRef = ref(storage, orphan.path);
          await deleteObject(fileRef);
          result.filesDeleted++;
        } catch (error: any) {
          result.errors.push(`Error deleting file ${orphan.path}: ${error.message}`);
        }
      }
    }
    
  } catch (error: any) {
    result.errors.push(`Error in orphan detection: ${error.message}`);
  }
  
  return result;
}

/**
 * Generate orphan detection report
 */
export async function generateOrphanReport(): Promise<string> {
  const result = await detectOrphans(false);
  
  let report = '=== Orphan Detection Report ===\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;
  
  report += `Orphaned Documents: ${result.orphanedDocuments.length}\n`;
  for (const orphan of result.orphanedDocuments) {
    report += `  - ${orphan.path} (${orphan.type}): ${orphan.reason}\n`;
  }
  
  report += `\nOrphaned Files: ${result.orphanedFiles.length}\n`;
  for (const orphan of result.orphanedFiles) {
    report += `  - ${orphan.path}: ${orphan.reason}\n`;
  }
  
  if (result.errors.length > 0) {
    report += `\nErrors: ${result.errors.length}\n`;
    for (const error of result.errors) {
      report += `  - ${error}\n`;
    }
  }
  
  return report;
}
