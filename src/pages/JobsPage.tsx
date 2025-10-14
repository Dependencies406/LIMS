import React, { useState, useEffect } from 'react';
import type { Job, Customer } from '../types';
import { db, collection, onSnapshot, query, orderBy } from '../services/firebase';
import { JobModal } from '../components/JobModal';
import { useToast } from '../hooks/useToast';
import { ViewToggle } from '../components/common/ViewToggle';
import { useViewPreference } from '../hooks/useViewPreference';
import { JobListView } from '../components/jobs/JobListView';
import { JobCardView } from '../components/jobs/JobCardView';
import { JobGridView } from '../components/jobs/JobGridView';
import { exportService } from '../services/exportService';
import { JobPdfSettingsModal } from '../components/JobPdfSettingsModal';

export const JobsPage: React.FC = () => {
  const { success, error: showError } = useToast();
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [showPdfSettings, setShowPdfSettings] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  
  // View preferences with localStorage persistence
  const [jobsView, setJobsView] = useViewPreference('lims-jobs-view', 'card');

  // Load jobs from Firebase
  useEffect(() => {
    const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as Job[];
      setJobs(jobsData);
      setLoading(false);
    }, (err) => {
      console.error('Error loading jobs:', err);
      showError('Failed to load jobs');
      setLoading(false);
    });

    return unsubscribe;
  }, [showError]);

  // Load customers from Firebase
  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({
        id: doc.id,
        customerCode: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as Customer[];
      setCustomers(customersData);
    }, (err) => {
      console.error('Error loading customers:', err);
      showError('Failed to load customers');
    });

    return unsubscribe;
  }, [showError]);

  const handleCreateJob = () => {
    setSelectedJob(null);
    setShowJobModal(true);
  };

  const handleEditJob = (job: Job) => {
    setSelectedJob(job);
    setShowJobModal(true);
  };

  const handleExport = (type: 'csv' | 'summary') => {
    try {
      if (type === 'csv') {
        exportService.exportJobsToCSV(filteredJobs);
        success('Jobs exported to CSV successfully');
      } else if (type === 'summary') {
        exportService.exportSummaryReport(filteredJobs);
        success('Summary report generated successfully');
      }
      setShowExportMenu(false);
    } catch (err) {
      showError('Failed to export data');
    }
  };

  // Filter jobs
  const filteredJobs = jobs.filter(job => {
    const matchesSearch = 
      job.jobId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.customerCode.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'In Progress': return 'bg-blue-100 text-blue-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Halt': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCustomerName = (customerCode: string): string => {
    const customer = customers.find(c => c.customerCode === customerCode);
    return customer?.name || customerCode;
  };

  // Calculate statistics
  const stats = {
    total: jobs.length,
    pending: jobs.filter(j => j.status === 'Pending').length,
    inProgress: jobs.filter(j => j.status === 'In Progress').length,
    completed: jobs.filter(j => j.status === 'Completed').length,
    halt: jobs.filter(j => j.status === 'Halt').length,
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-600 mt-1">Manage your laboratory jobs and requests</p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex flex-wrap gap-4 flex-1">
            {/* Animated Search Box */}
            <div className="relative">
              {!isSearchExpanded ? (
                <button
                  onClick={() => setIsSearchExpanded(true)}
                  className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  title="Search jobs..."
                >
                  <svg
                    className="w-5 h-5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </button>
              ) : (
                <div className="flex items-center space-x-2 animate-in slide-in-from-left-2 duration-200">
                  <input
                    type="text"
                    placeholder="Search jobs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input max-w-md transition-all duration-200"
                    autoFocus
                    onBlur={() => {
                      if (!searchTerm.trim()) {
                        setIsSearchExpanded(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setSearchTerm('');
                        setIsSearchExpanded(false);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setIsSearchExpanded(false);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    title="Clear search"
                  >
                    <svg
                      className="w-4 h-4 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>


            {/* View Toggle */}
            <ViewToggle
              currentView={jobsView}
              onViewChange={setJobsView}
            />
          </div>

          <div className="flex gap-2">
            {/* Export Menu */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="btn btn-secondary whitespace-nowrap"
              >
                📥 Export
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded-t-lg"
                  >
                    Export to CSV
                  </button>
                  <button
                    onClick={() => handleExport('summary')}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded-b-lg"
                  >
                    Summary Report
                  </button>
                </div>
              )}
            </div>

            {/* PDF Settings Button */}
            <button 
              onClick={() => setShowPdfSettings(true)} 
              className="btn btn-secondary whitespace-nowrap"
            >
              ⚙️ PDF Settings
            </button>

            {/* Create Job Button */}
            <button onClick={handleCreateJob} className="btn btn-primary whitespace-nowrap">
              + Create Job
            </button>
          </div>
        </div>

        {/* Statistics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          {/* Total Jobs */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'all' ? 'all' : 'all')}
            className={`p-4 rounded-lg border-2 transition-all ${
              statusFilter === 'all'
                ? 'border-primary-500 bg-primary-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm'
            }`}
          >
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600 mt-1">Total Jobs</div>
          </button>

          {/* Pending */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'Pending' ? 'all' : 'Pending')}
            className={`p-4 rounded-lg border-2 transition-all ${
              statusFilter === 'Pending'
                ? 'border-yellow-500 bg-yellow-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-yellow-300 hover:shadow-sm'
            }`}
          >
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <div className="text-sm text-gray-600 mt-1">Pending</div>
          </button>

          {/* In Progress */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'In Progress' ? 'all' : 'In Progress')}
            className={`p-4 rounded-lg border-2 transition-all ${
              statusFilter === 'In Progress'
                ? 'border-blue-500 bg-blue-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
            }`}
          >
            <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
            <div className="text-sm text-gray-600 mt-1">In Progress</div>
          </button>

          {/* Completed */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'Completed' ? 'all' : 'Completed')}
            className={`p-4 rounded-lg border-2 transition-all ${
              statusFilter === 'Completed'
                ? 'border-green-500 bg-green-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-green-300 hover:shadow-sm'
            }`}
          >
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-sm text-gray-600 mt-1">Completed</div>
          </button>

          {/* Halt */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'Halt' ? 'all' : 'Halt')}
            className={`p-4 rounded-lg border-2 transition-all ${
              statusFilter === 'Halt'
                ? 'border-red-500 bg-red-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-red-300 hover:shadow-sm'
            }`}
          >
            <div className="text-2xl font-bold text-red-600">{stats.halt}</div>
            <div className="text-sm text-gray-600 mt-1">Halt</div>
          </button>
        </div>

        {/* Jobs List */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading jobs...</div>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-gray-500">No jobs found</p>
          </div>
        ) : (
          <>
            {jobsView === 'list' && (
              <JobListView
                jobs={filteredJobs}
                onEdit={handleEditJob}
                getStatusColor={getStatusColor}
                getCustomerName={getCustomerName}
              />
            )}
            {jobsView === 'card' && (
              <JobCardView
                jobs={filteredJobs}
                onEdit={handleEditJob}
                getStatusColor={getStatusColor}
                getCustomerName={getCustomerName}
              />
            )}
            {jobsView === 'grid' && (
              <JobGridView
                jobs={filteredJobs}
                onEdit={handleEditJob}
                getStatusColor={getStatusColor}
                getCustomerName={getCustomerName}
              />
            )}
          </>
        )}

        {/* Job Modal */}
        {showJobModal && (
          <JobModal
            job={selectedJob}
            customers={customers}
            onClose={() => setShowJobModal(false)}
            onSuccess={() => {
              // Don't close modal, just show success message
              success(selectedJob ? 'Job updated successfully' : 'Job created successfully');
            }}
          />
        )}

        {/* Job PDF Settings Modal */}
        {showPdfSettings && (
          <JobPdfSettingsModal
            isOpen={showPdfSettings}
            onClose={() => setShowPdfSettings(false)}
            jobs={jobs}
          />
        )}
      </div>
    </div>
  );
};

