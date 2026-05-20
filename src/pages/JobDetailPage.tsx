import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Customer, Job } from '../types';
import { db, collection, query, orderBy, onSnapshot } from '../services/firebase';
import { firestoreToDate } from '../utils/dateUtils';
import { jobService } from '../services/jobService';
import { JobModal } from '../components/JobModal';
import { useToast } from '../hooks/useToast';

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [job, setJob] = useState<Job | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const loadJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const j = await jobService.getJobById(jobId);
      setJob(j);
      setNotFound(false);
    } catch {
      setNotFound(true);
      setJob(null);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadJob().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId, loadJob]);

  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          customerCode: docSnap.id,
          ...docSnap.data(),
          createdAt: firestoreToDate(docSnap.data().createdAt),
          updatedAt: firestoreToDate(docSnap.data().updatedAt),
        })) as Customer[];
        setCustomers(list);
      },
      (err) => {
        console.error('Error loading customers:', err);
        showError('Failed to load customers');
      }
    );
    return unsub;
  }, [showError]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading job…</p>
        </div>
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="flex-1 max-w-xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Job not found</h1>
        <p className="text-gray-600 mb-6">This job may have been removed or the link is invalid.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/jobs')}>
          Back to jobs
        </button>
      </div>
    );
  }

  if (job.isDeleted) {
    return (
      <div className="flex-1 max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Job is in the Recycle Bin</h1>
        <p className="text-gray-600 mb-6">
          This job is no longer in the active list. Open the Recycle Bin to restore it or delete it permanently (with
          confirmation).
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button type="button" className="btn btn-primary" onClick={() => navigate('/recycle-bin')}>
            Open Recycle Bin
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/jobs')}>
            Back to jobs
          </button>
        </div>
      </div>
    );
  }

  return (
    <JobModal
      layout="page"
      job={job}
      customers={customers}
      onClose={() => navigate('/jobs')}
      onSuccess={() => {
        success('Job saved');
        loadJob();
      }}
    />
  );
}
