import type { Job } from '../types';
import { firestoreToDate } from '../utils/dateUtils';

/** Strips undefined values so Firestore doesn't reject them */
export function removeUndefinedForFirestore<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot
} from './firebase';
import { deleteJob as deleteJobLifecycle } from './firestoreDeletionService';

export interface JobInput {
  jobId: string;
  requestNo?: string;
  title: string;
  status: Job['status'];
  customerCode: string;
  customerContact?: string;
  assignedStaff?: string;
  equipment: Job['equipment'];
  startDate?: string;
  appointmentDate?: string;
  comments?: string;
  poNumber?: string;
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  serviceInformation?: Job['serviceInformation'];
  workAuthorization?: Job['workAuthorization'];
}

/**
 * Service for managing job-related operations
 * Provides CRUD operations and real-time subscriptions
 */
export const jobService = {
  /**
   * Subscribe to real-time job updates
   * @param callback Function called when jobs change
   * @returns Unsubscribe function
   */
  subscribeToJobs(
    callback: (jobs: Job[], error?: Error) => void
  ): () => void {
    const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const jobs = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              ...data,
              createdAt: firestoreToDate(data.createdAt),
              updatedAt: firestoreToDate(data.updatedAt),
              deletedAt: data.deletedAt ? firestoreToDate(data.deletedAt) : undefined,
            } as Job;
          })
          .filter((j) => !j.isDeleted);

        callback(jobs);
      },
      (error) => {
        console.error('Error loading jobs:', error);
        callback([], error as Error);
      }
    );

    return unsubscribe;
  },

  /**
   * Get all jobs (one-time fetch)
   * @returns Promise with array of jobs
   */
  async getAllJobs(includeDeleted = false): Promise<Job[]> {
    try {
      const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      const jobs = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: firestoreToDate(data.createdAt),
          updatedAt: firestoreToDate(data.updatedAt),
          deletedAt: data.deletedAt ? firestoreToDate(data.deletedAt) : undefined,
        } as Job;
      });

      if (includeDeleted) return jobs;
      return jobs.filter((j) => !j.isDeleted);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      throw new Error('Failed to fetch jobs');
    }
  },

  /**
   * Get a single job by ID
   * @param id Job document ID
   * @returns Promise with job data
   */
  async getJobById(id: string): Promise<Job> {
    try {
      const jobDoc = await getDoc(doc(db, 'jobs', id));
      
      if (!jobDoc.exists()) {
        throw new Error('Job not found');
      }

      const data = jobDoc.data();
      return {
        id: jobDoc.id,
        ...data,
        createdAt: firestoreToDate(data.createdAt),
        updatedAt: firestoreToDate(data.updatedAt),
        deletedAt: data.deletedAt ? firestoreToDate(data.deletedAt) : undefined,
      } as Job;
    } catch (error) {
      console.error('Error fetching job:', error);
      throw error;
    }
  },

  /**
   * Create a new job
   * @param data Job input data
   * @param userId ID of user creating the job
   * @returns Promise with created job ID
   */
  async createJob(data: JobInput, userId: string): Promise<string> {
    try {
      // Filter out empty equipment entries
      const validEquipment = data.equipment.filter(
        (eq) => eq.name || eq.model
      );

      if (validEquipment.length === 0) {
        throw new Error('At least one equipment entry is required');
      }

      const jobData = removeUndefinedForFirestore({
        ...data,
        equipment: validEquipment,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
      });

      const newJobId = `job-${Date.now()}`;
      await setDoc(doc(db, 'jobs', newJobId), jobData);

      return newJobId;
    } catch (error) {
      console.error('Error creating job:', error);
      throw error;
    }
  },

  /**
   * Update an existing job
   * @param id Job document ID
   * @param data Partial job data to update
   */
  async updateJob(id: string, data: Partial<JobInput>): Promise<void> {
    try {
      // If equipment is being updated, filter empty entries
      const updateData: any = { ...data };
      
      if (data.equipment) {
        updateData.equipment = data.equipment.filter(
          (eq) => eq.name || eq.model
        );
        
        if (updateData.equipment.length === 0) {
          throw new Error('At least one equipment entry is required');
        }
      }

      updateData.updatedAt = serverTimestamp();

      await updateDoc(doc(db, 'jobs', id), removeUndefinedForFirestore(updateData));
    } catch (error) {
      console.error('Error updating job:', error);
      throw error;
    }
  },

  /**
   * Soft-delete a job (moves to Recycle Bin). Permanent removal is done from the Recycle Bin page.
   * @param id Job document ID
   * @param userId User performing the deletion (audit)
   */
  async deleteJob(id: string, userId: string): Promise<void> {
    try {
      await deleteJobLifecycle(id, {
        userId,
        softDelete: true,
        forceHardDelete: false,
      });
    } catch (error) {
      console.error('Error deleting job:', error);
      throw error;
    }
  },

  /**
   * Generate a unique job ID
   * @returns Job ID in format JOB-YYYYMMDD-XXXX
   */
  generateJobId(): string {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `JOB-${dateStr}-${randomStr}`;
  },

  /**
   * Search jobs by query string
   * @param jobs Array of jobs to search
   * @param searchTerm Search query
   * @returns Filtered jobs
   */
  searchJobs(jobs: Job[], searchTerm: string): Job[] {
    if (!searchTerm) return jobs;

    const term = searchTerm.toLowerCase();
    return jobs.filter(
      (job) =>
        job.jobId.toLowerCase().includes(term) ||
        job.title.toLowerCase().includes(term) ||
        job.customerCode.toLowerCase().includes(term)
    );
  },

  /**
   * Filter jobs by status
   * @param jobs Array of jobs to filter
   * @param status Status to filter by ('all' for no filter)
   * @returns Filtered jobs
   */
  filterJobsByStatus(jobs: Job[], status: string): Job[] {
    if (status === 'all') return jobs;
    return jobs.filter((job) => job.status === status);
  },
};

