import React from 'react';
import type { Job } from '../../types';
import { Card } from '../common/Card';

interface JobGridViewProps {
  jobs: Job[];
  onEdit: (job: Job) => void;
  getStatusColor: (status: string) => string;
  getCustomerName: (customerCode: string) => string;
}

/**
 * Grid view for jobs - Compact grid display
 */
export const JobGridView: React.FC<JobGridViewProps> = ({ jobs, onEdit, getStatusColor, getCustomerName }) => {
  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg">
        <p className="text-gray-600">No jobs found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {jobs.map((job) => (
        <Card key={job.id} onClick={() => onEdit(job)} hoverable>
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-semibold text-gray-900 truncate pr-2">{job.jobId}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(job.status)}`}>
                {job.status}
              </span>
            </div>
            
            <p className="text-sm text-gray-700 line-clamp-2">{job.title}</p>
            
            <div className="space-y-1 text-xs text-gray-600">
              <div className="flex items-center justify-between">
                <span className="font-medium">Customer:</span>
                <span className="truncate ml-2">{getCustomerName(job.customerCode)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Equipment:</span>
                <span>{job.equipment.length} items</span>
              </div>
              {job.appointmentDate && (
                <div className="flex items-center justify-between">
                  <span className="font-medium">Appointment:</span>
                  <span>{new Date(job.appointmentDate).toLocaleDateString('en-GB')}</span>
                </div>
              )}
            </div>
            
            <div className="pt-2 border-t border-gray-200">
              <span className="text-xs text-gray-500">
                {new Date(job.createdAt).toLocaleDateString('en-GB')}
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

