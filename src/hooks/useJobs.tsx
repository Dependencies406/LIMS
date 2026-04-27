import { useState, useEffect, useCallback } from 'react';
import type { Job } from '../types';
import { jobService, type JobInput } from '../services/jobService';
import { useAuth } from '../contexts/AuthContext';

/**
 * Custom hook for managing job data
 * Provides real-time job updates and CRUD operations
 */
export const useJobs = () => {
  const { currentUser } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to real-time job updates
  useEffect(() => {
    const unsubscribe = jobService.subscribeToJobs((updatedJobs, err) => {
      if (err) {
        setError('Failed to load jobs');
        setJobs([]);
      } else {
        setJobs(updatedJobs);
        setError(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  /**
   * Create a new job
   */
  const createJob = useCallback(
    async (data: JobInput): Promise<string> => {
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      setError(null);
      try {
        const jobId = await jobService.createJob(data, currentUser.uid);
        return jobId;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create job';
        setError(message);
        throw err;
      }
    },
    [currentUser]
  );

  /**
   * Update an existing job
   */
  const updateJob = useCallback(
    async (id: string, data: Partial<JobInput>): Promise<void> => {
      setError(null);
      try {
        await jobService.updateJob(id, data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update job';
        setError(message);
        throw err;
      }
    },
    []
  );

  /**
   * Delete a job
   */
  const deleteJob = useCallback(
    async (id: string): Promise<void> => {
      if (!currentUser?.uid) {
        throw new Error('User not authenticated');
      }
      setError(null);
      try {
        await jobService.deleteJob(id, currentUser.uid);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete job';
        setError(message);
        throw err;
      }
    },
    [currentUser]
  );

  /**
   * Get a single job by ID
   */
  const getJobById = useCallback(async (id: string): Promise<Job> => {
    setError(null);
    try {
      return await jobService.getJobById(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch job';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Generate a unique job ID
   */
  const generateJobId = useCallback(() => {
    return jobService.generateJobId();
  }, []);

  /**
   * Search jobs
   */
  const searchJobs = useCallback(
    (searchTerm: string) => {
      return jobService.searchJobs(jobs, searchTerm);
    },
    [jobs]
  );

  /**
   * Filter jobs by status
   */
  const filterByStatus = useCallback(
    (status: string) => {
      return jobService.filterJobsByStatus(jobs, status);
    },
    [jobs]
  );

  return {
    jobs,
    loading,
    error,
    createJob,
    updateJob,
    deleteJob,
    getJobById,
    generateJobId,
    searchJobs,
    filterByStatus,
  };
};

