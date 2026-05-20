/**
 * Notification Service
 * Handles notifications for document publishing and workflow events
 * ISO/IEC 17025:2017 - Notify staff when new documents are published
 */

import { db, collection, doc, setDoc, serverTimestamp } from './firebase';
import type { Document } from '../types';

export interface Notification {
  id: string;
  type: 'document_published' | 'document_review_required' | 'document_approval_required' | 'job_assigned' | 'job_message';
  title: string;
  message: string;
  documentId?: string;
  documentTitle?: string;
  jobId?: string;
  jobTitle?: string;
  userId: string; // Target user ID
  read: boolean;
  createdAt: Date;
  fromUserId?: string; // User who sent the notification/message
}

/**
 * Create a notification for document publishing
 */
export const notifyDocumentPublished = async (
  document: Document,
  userIds: string[]
): Promise<void> => {
  try {
    if (!document.id) {
      console.warn('Cannot create notification: document ID is missing');
      return;
    }

    const notifications = userIds.map(userId => {
      const notificationData: any = {
        type: 'document_published' as const,
        title: 'New Document Published',
        message: `A new document "${document.title}" (${document.documentId}) has been published.`,
        documentId: document.id,
        documentTitle: document.title,
        userId,
        read: false,
        createdAt: serverTimestamp(),
      };

      // Remove any undefined values
      Object.keys(notificationData).forEach(key => {
        if (notificationData[key] === undefined) {
          delete notificationData[key];
        }
      });

      return notificationData;
    });

    // Create notifications in batch
    const batchPromises = notifications.map(notification => {
      const notificationRef = doc(collection(db, 'notifications'));
      return setDoc(notificationRef, notification);
    });

    await Promise.all(batchPromises);
  } catch (error) {
    console.error('Error creating notifications:', error);
    // Don't throw - notifications are non-critical
  }
};

/**
 * Create a notification for review required
 */
export const notifyReviewRequired = async (
  document: Document,
  reviewerId: string
): Promise<void> => {
  try {
    if (!document.id) {
      console.warn('Cannot create notification: document ID is missing');
      return;
    }

    const notificationRef = doc(collection(db, 'notifications'));
    
    // Build notification data, only including defined values
    const notificationData: any = {
      type: 'document_review_required' as const,
      title: 'Document Review Required',
      message: `Document "${document.title}" (${document.documentId}) requires your review.`,
      userId: reviewerId,
      read: false,
      createdAt: serverTimestamp(),
    };
    
    // Only add optional fields if they have values
    if (document.id) {
      notificationData.documentId = document.id;
    }
    if (document.title) {
      notificationData.documentTitle = document.title;
    }

    await setDoc(notificationRef, notificationData);
  } catch (error) {
    console.error('Error creating review notification:', error);
  }
};

/**
 * Create a notification for approval required
 */
export const notifyApprovalRequired = async (
  document: Document,
  approverId: string
): Promise<void> => {
  try {
    if (!document.id) {
      console.warn('Cannot create notification: document ID is missing');
      return;
    }

    const notificationRef = doc(collection(db, 'notifications'));
    const notificationData: any = {
      type: 'document_approval_required' as const,
      title: 'Document Approval Required',
      message: `Document "${document.title}" (${document.documentId}) requires your approval.`,
      documentId: document.id,
      documentTitle: document.title,
      userId: approverId,
      read: false,
      createdAt: serverTimestamp(),
    };

    // Remove any undefined values
    Object.keys(notificationData).forEach(key => {
      if (notificationData[key] === undefined) {
        delete notificationData[key];
      }
    });

    await setDoc(notificationRef, notificationData);
  } catch (error) {
    console.error('Error creating approval notification:', error);
  }
};

/**
 * Create a notification for job assignment
 */
export const notifyJobAssigned = async (
  jobId: string,
  jobTitle: string,
  assignedToUserId: string,
  assignedByUserId: string
): Promise<void> => {
  try {
    const notificationRef = doc(collection(db, 'notifications'));
    const notificationData: any = {
      type: 'job_assigned' as const,
      title: 'Job Assigned to You',
      message: `Job "${jobTitle}" (${jobId}) has been assigned to you.`,
      jobId: jobId,
      jobTitle: jobTitle,
      userId: assignedToUserId,
      fromUserId: assignedByUserId,
      read: false,
      createdAt: serverTimestamp(),
    };

    await setDoc(notificationRef, notificationData);
  } catch (error) {
    console.error('Error creating job assignment notification:', error);
  }
};

/**
 * Create a notification/message for job communication
 */
export const notifyJobMessage = async (
  jobId: string,
  jobTitle: string,
  toUserId: string,
  fromUserId: string,
  message: string
): Promise<void> => {
  try {
    const notificationRef = doc(collection(db, 'notifications'));
    const notificationData: any = {
      type: 'job_message' as const,
      title: `Message about Job ${jobId}`,
      message: message,
      jobId: jobId,
      jobTitle: jobTitle,
      userId: toUserId,
      fromUserId: fromUserId,
      read: false,
      createdAt: serverTimestamp(),
    };

    await setDoc(notificationRef, notificationData);
  } catch (error) {
    console.error('Error creating job message notification:', error);
  }
};

export const notificationService = {
  notifyDocumentPublished,
  notifyReviewRequired,
  notifyApprovalRequired,
  notifyJobAssigned,
  notifyJobMessage,
};

