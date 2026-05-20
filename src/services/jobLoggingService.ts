import {
  db,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp
} from './firebase';
import type { JobActionLog, JobAssignmentLog, User } from '../types';

const buildActor = (actor?: User | null) => ({
  userId: actor?.uid || 'system',
  userName: actor?.displayName || actor?.email || 'System',
  userEmail: actor?.email || '',
});

const toDate = (value: any): Date => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return new Date();
};

export const jobLoggingService = {
  async logJobAction(
    jobId: string,
    action: string,
    details?: Record<string, unknown>,
    actor?: User | null
  ): Promise<void> {
    const actorInfo = buildActor(actor);

    await addDoc(collection(db, 'jobLogs'), {
      jobId,
      action,
      details: details || null,
      ...actorInfo,
      timestamp: serverTimestamp(),
    });
  },

  async logStaffAction(
    staffId: string,
    action: JobAssignmentLog['action'],
    jobId: string,
    details?: Record<string, unknown>,
    actor?: User | null
  ): Promise<void> {
    const actorInfo = buildActor(actor);

    await addDoc(collection(db, 'staffLogs', staffId, 'actions'), {
      jobId,
      action,
      details: details || null,
      ...actorInfo,
      timestamp: serverTimestamp(),
    });
  },

  async getJobLogs(jobId: string): Promise<JobActionLog[]> {
    try {
      const q = query(
        collection(db, 'jobLogs'),
        where('jobId', '==', jobId),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          jobId: data.jobId,
          action: data.action,
          details: data.details || undefined,
          userId: data.userId || 'system',
          userName: data.userName || 'System',
          userEmail: data.userEmail || '',
          timestamp: toDate(data.timestamp),
        } as JobActionLog;
      });
    } catch (error: any) {
      // Re-throw index errors so they can be handled gracefully by the caller
      if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
        throw error;
      }
      // For other errors, return empty array
      console.warn('Error fetching job logs:', error);
      return [];
    }
  },

  async getStaffLogs(staffId: string): Promise<JobAssignmentLog[]> {
    const q = query(
      collection(db, 'staffLogs', staffId, 'actions'),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        action: data.action,
        details: data.details || undefined,
        userId: data.userId || 'system',
        userName: data.userName || 'System',
        userEmail: data.userEmail || '',
        timestamp: toDate(data.timestamp),
      } as JobAssignmentLog;
    });
  },

  async exportStaffLogsToText(staffId: string): Promise<string> {
    const logs = await this.getStaffLogs(staffId);

    let text = 'Staff Performance Logs\n';
    text += `Generated: ${new Date().toLocaleString()}\n`;
    text += `Staff ID: ${staffId}\n`;
    text += '========================================\n\n';

    logs.forEach((log, index) => {
      text += `[${index + 1}] ${log.action.toUpperCase()}\n`;
      text += `Date: ${log.timestamp.toLocaleString()}\n`;
      text += `User: ${log.userName} (${log.userEmail || 'N/A'})\n`;
      if (log.details) {
        text += `Details: ${JSON.stringify(log.details, null, 2)}\n`;
      }
      text += '\n';
    });

    return text;
  },

  async exportJobLogsToText(jobId: string): Promise<string> {
    const logs = await this.getJobLogs(jobId);

    let text = 'Job Logs\n';
    text += `Generated: ${new Date().toLocaleString()}\n`;
    text += `Job ID: ${jobId}\n`;
    text += '========================================\n\n';

    logs.forEach((log, index) => {
      text += `[${index + 1}] ${log.action.toUpperCase()}\n`;
      text += `Date: ${log.timestamp.toLocaleString()}\n`;
      text += `User: ${log.userName} (${log.userEmail || 'N/A'})\n`;
      if (log.details) {
        text += `Details: ${JSON.stringify(log.details, null, 2)}\n`;
      }
      text += '\n';
    });

    return text;
  },
};
