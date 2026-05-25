/**
 * JobSelector — searchable dropdown that lets users link a usage log to a job.
 *
 * Props:
 *   value      – currently selected Firestore doc ID (or '' for none)
 *   onChange   – called with { id, jobId, title, customerName } | null
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { jobService } from '../services/jobService';
import type { Job } from '../types';

export interface SelectedJob {
  id: string;          // Firestore doc ID
  jobId: string;       // human-readable reference
  title: string;
  customerName: string;
  status: string;
}

interface Props {
  value: string;       // Firestore doc ID of selected job, '' = none
  onChange: (job: SelectedJob | null) => void;
}

const STATUS_COLORS: Record<string, string> = {
  'In Progress': 'bg-blue-100 text-blue-700',
  'Completed':   'bg-green-100 text-green-700',
  'Pending':     'bg-amber-100 text-amber-700',
  'On Hold':     'bg-gray-100 text-gray-500',
};

function statusBadge(status: string) {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  );
}

export const JobSelector: React.FC<Props> = ({ value, onChange }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load jobs once on mount
  useEffect(() => {
    jobService.getAllJobs().then((all) => {
      setJobs(all.filter((j) => !j.isDeleted));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const selected = useMemo(
    () => (value ? jobs.find((j) => j.id === value) ?? null : null),
    [value, jobs]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return jobs.slice(0, 40);
    const q = query.toLowerCase();
    return jobs
      .filter(
        (j) =>
          j.jobId?.toLowerCase().includes(q) ||
          j.title?.toLowerCase().includes(q) ||
          (j.customerName ?? '').toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [jobs, query]);

  function select(job: Job | null) {
    if (job) {
      onChange({
        id: job.id,
        jobId: job.jobId,
        title: job.title,
        customerName: job.customerName ?? '',
        status: job.status,
      });
    } else {
      onChange(null);
    }
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2.5 text-sm text-left transition-colors
          ${open
            ? 'border-primary-500 ring-2 ring-primary-100'
            : 'border-gray-300 hover:border-gray-400'
          }`}
      >
        {loading ? (
          <span className="text-gray-400">Loading jobs…</span>
        ) : selected ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs font-semibold text-primary-700 flex-shrink-0">
              {selected.jobId}
            </span>
            <span className="text-gray-700 truncate">{selected.title}</span>
            {statusBadge(selected.status)}
          </div>
        ) : (
          <span className="text-gray-400">No job linked — select to link</span>
        )}
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Clear button */}
      {selected && !open && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); select(null); }}
          className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-base leading-none"
          title="Remove job link"
        >
          ×
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <svg className="absolute left-2.5 top-2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by job number, title or customer…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto divide-y divide-gray-50">
            {/* "No job" option */}
            <li>
              <button
                type="button"
                onClick={() => select(null)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-gray-400 italic">No job linked</span>
              </button>
            </li>

            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-sm text-gray-400 text-center">No jobs match "{query}"</li>
            ) : (
              filtered.map((job) => {
                const isSelected = job.id === value;
                return (
                  <li key={job.id}>
                    <button
                      type="button"
                      onClick={() => select(job)}
                      className={`w-full flex items-start gap-2 px-3 py-2.5 text-left text-sm transition-colors
                        ${isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
                    >
                      <span className="font-mono text-xs font-semibold text-primary-700 mt-0.5 flex-shrink-0 w-28">
                        {job.jobId}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-gray-800 font-medium truncate">{job.title}</p>
                        {job.customerName && (
                          <p className="text-xs text-gray-400 truncate">{job.customerName}</p>
                        )}
                      </div>
                      <div className="flex-shrink-0 mt-0.5">
                        {statusBadge(job.status)}
                      </div>
                      {isSelected && (
                        <svg className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
