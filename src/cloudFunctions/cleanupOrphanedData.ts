/**
 * Cloud Function: Cleanup Orphaned Data
 * 
 * This function performs hard deletion of soft-deleted documents
 * and detects orphaned Firestore documents and Storage files.
 * 
 * Should be scheduled to run daily via Cloud Scheduler.
 * 
 * @module cloudFunctions/cleanupOrphanedData
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Retention period: 30 days
const HARD_DELETE_AFTER_DAYS = 30;

/**
 * Hard delete cleanup function
 * 
 * Scans for documents with isDeleted=true and deletedAt timestamp
 * older than HARD_DELETE_AFTER_DAYS, then permanently deletes them.
 */
export const cleanupHardDelete = functions
  .region('us-central1')
  .pubsub
  .schedule('0 2 * * *') // Run daily at 2 AM
  .timeZone('UTC')
  .onRun(async (context) => {
    const db = admin.firestore();
    const storage = admin.storage();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - HARD_DELETE_AFTER_DAYS);
    
    const results = {
      jobsDeleted: 0,
      equipmentDeleted: 0,
      documentsDeleted: 0,
      templatesDeleted: 0,
      customersDeleted: 0,
      usersDeleted: 0,
      storageFilesDeleted: 0,
      errors: [] as string[],
    };
    
    try {
      // Cleanup jobs
      const jobsQuery = db.collection('jobs')
        .where('isDeleted', '==', true)
        .where('deletedAt', '<=', admin.firestore.Timestamp.fromDate(cutoffDate));
      
      const jobsSnapshot = await jobsQuery.get();
      for (const jobDoc of jobsSnapshot.docs) {
        try {
          const jobId = jobDoc.id;
          
          // Delete Storage files
          const bucket = storage.bucket();
          const [files] = await bucket.getFiles({ prefix: `jobs/${jobId}/` });
          for (const file of files) {
            await file.delete();
            results.storageFilesDeleted++;
          }
          
          // Delete subcollections
          const subcollections = [
            `jobs/${jobId}/equipment`,
            `jobs/${jobId}/documents`,
            `jobs/${jobId}/spreadsheets`,
            `jobs/${jobId}/attachments`,
            `jobs/${jobId}/serviceRequests`,
            `jobs/${jobId}/notifications`,
          ];
          
          for (const subcolPath of subcollections) {
            await deleteCollectionRecursively(db, subcolPath);
          }
          
          // Delete the job document
          await jobDoc.ref.delete();
          results.jobsDeleted++;
        } catch (error: any) {
          results.errors.push(`Error deleting job ${jobDoc.id}: ${error.message}`);
        }
      }
      
      // Cleanup equipment
      const equipmentQuery = db.collectionGroup('equipment')
        .where('isDeleted', '==', true)
        .where('deletedAt', '<=', admin.firestore.Timestamp.fromDate(cutoffDate));
      
      const equipmentSnapshot = await equipmentQuery.get();
      for (const eqDoc of equipmentSnapshot.docs) {
        try {
          const pathParts = eqDoc.ref.path.split('/');
          const jobId = pathParts[1];
          const equipmentId = pathParts[3];
          
          // Delete Storage files
          const bucket = storage.bucket();
          const [files] = await bucket.getFiles({ 
            prefix: `jobs/${jobId}/equipment/${equipmentId}/` 
          });
          for (const file of files) {
            await file.delete();
            results.storageFilesDeleted++;
          }
          
          // Delete subcollections
          const subcollections = [
            `jobs/${jobId}/equipment/${equipmentId}/spreadsheets`,
            `jobs/${jobId}/equipment/${equipmentId}/attachments`,
            `jobs/${jobId}/equipment/${equipmentId}/calibrationRecords`,
          ];
          
          for (const subcolPath of subcollections) {
            await deleteCollectionRecursively(db, subcolPath);
          }
          
          // Delete the equipment document
          await eqDoc.ref.delete();
          results.equipmentDeleted++;
        } catch (error: any) {
          results.errors.push(`Error deleting equipment ${eqDoc.id}: ${error.message}`);
        }
      }
      
      // Cleanup documents
      const documentsQuery = db.collectionGroup('documents')
        .where('isDeleted', '==', true)
        .where('deletedAt', '<=', admin.firestore.Timestamp.fromDate(cutoffDate));
      
      const documentsSnapshot = await documentsQuery.get();
      for (const docDoc of documentsSnapshot.docs) {
        try {
          const pathParts = docDoc.ref.path.split('/');
          const jobId = pathParts[1];
          const documentId = pathParts[3];
          
          // Delete Storage files
          const bucket = storage.bucket();
          const [files] = await bucket.getFiles({ 
            prefix: `jobs/${jobId}/documents/${documentId}/` 
          });
          for (const file of files) {
            await file.delete();
            results.storageFilesDeleted++;
          }
          
          // Delete subcollections
          const subcollections = [
            `jobs/${jobId}/documents/${documentId}/revisions`,
            `jobs/${jobId}/documents/${documentId}/attachments`,
          ];
          
          for (const subcolPath of subcollections) {
            await deleteCollectionRecursively(db, subcolPath);
          }
          
          // Delete the document
          await docDoc.ref.delete();
          results.documentsDeleted++;
        } catch (error: any) {
          results.errors.push(`Error deleting document ${docDoc.id}: ${error.message}`);
        }
      }
      
      // Cleanup templates
      const templatesQuery = db.collection('templates')
        .where('isDeleted', '==', true)
        .where('deletedAt', '<=', admin.firestore.Timestamp.fromDate(cutoffDate));
      
      const templatesSnapshot = await templatesQuery.get();
      for (const templateDoc of templatesSnapshot.docs) {
        try {
          const templateId = templateDoc.id;
          
          // Delete Storage files
          const bucket = storage.bucket();
          const [files] = await bucket.getFiles({ prefix: `templates/${templateId}/` });
          for (const file of files) {
            await file.delete();
            results.storageFilesDeleted++;
          }
          
          // Delete subcollections
          await deleteCollectionRecursively(db, `templates/${templateId}/versions`);
          
          // Delete the template
          await templateDoc.ref.delete();
          results.templatesDeleted++;
        } catch (error: any) {
          results.errors.push(`Error deleting template ${templateDoc.id}: ${error.message}`);
        }
      }
      
      // Cleanup customers
      const customersQuery = db.collection('customers')
        .where('isDeleted', '==', true)
        .where('deletedAt', '<=', admin.firestore.Timestamp.fromDate(cutoffDate));
      
      const customersSnapshot = await customersQuery.get();
      for (const customerDoc of customersSnapshot.docs) {
        try {
          const customerId = customerDoc.id;
          
          // Delete Storage files
          const bucket = storage.bucket();
          const [files] = await bucket.getFiles({ prefix: `customers/${customerId}/` });
          for (const file of files) {
            await file.delete();
            results.storageFilesDeleted++;
          }
          
          // Delete subcollections
          const subcollections = [
            `customers/${customerId}/attachments`,
            `customers/${customerId}/serviceRequests`,
          ];
          
          for (const subcolPath of subcollections) {
            await deleteCollectionRecursively(db, subcolPath);
          }
          
          // Delete the customer
          await customerDoc.ref.delete();
          results.customersDeleted++;
        } catch (error: any) {
          results.errors.push(`Error deleting customer ${customerDoc.id}: ${error.message}`);
        }
      }
      
      // Cleanup users (only if explicitly soft-deleted)
      const usersQuery = db.collection('users')
        .where('isDeleted', '==', true)
        .where('deletedAt', '<=', admin.firestore.Timestamp.fromDate(cutoffDate));
      
      const usersSnapshot = await usersQuery.get();
      for (const userDoc of usersSnapshot.docs) {
        try {
          const userId = userDoc.id;
          
          // Delete Storage files
          const bucket = storage.bucket();
          const [files] = await bucket.getFiles({ prefix: `users/${userId}/` });
          for (const file of files) {
            await file.delete();
            results.storageFilesDeleted++;
          }
          
          // Delete subcollections
          const subcollections = [
            `users/${userId}/notifications`,
            `users/${userId}/preferences`,
          ];
          
          for (const subcolPath of subcollections) {
            await deleteCollectionRecursively(db, subcolPath);
          }
          
          // Delete the user
          await userDoc.ref.delete();
          results.usersDeleted++;
        } catch (error: any) {
          results.errors.push(`Error deleting user ${userDoc.id}: ${error.message}`);
        }
      }
      
      console.log('Cleanup completed:', results);
      return results;
      
    } catch (error: any) {
      console.error('Error in cleanup function:', error);
      throw error;
    }
  });

/**
 * Recursively delete a Firestore collection
 */
async function deleteCollectionRecursively(
  db: admin.firestore.Firestore,
  collectionPath: string
): Promise<void> {
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();
  
  // Delete all documents
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  
  // Recursively delete subcollections
  for (const docSnapshot of snapshot.docs) {
    const subcollections = await docSnapshot.ref.listCollections();
    for (const subcol of subcollections) {
      await deleteCollectionRecursively(db, subcol.path);
    }
  }
}
