import React, { useCallback } from 'react';
import type { Job } from '../../types';
import { Card } from '../common/Card';
import { useUsers } from '../../hooks/useUsers';
import { matchUserFromAssignedStaffValue } from '../../services/userService';

interface JobCardViewProps {
  jobs: Job[];
  onEdit: (job: Job) => void;
  getStatusColor: (status: string) => string;
  getCustomerName: (customerCode: string) => string;
}

/**
 * Card view for jobs - Detailed card display
 */
export const JobCardView: React.FC<JobCardViewProps> = ({ jobs, onEdit, getStatusColor, getCustomerName }) => {
  const { users } = useUsers();
  const staffDisplay = useCallback((raw: string) => {
    const u = matchUserFromAssignedStaffValue(raw, users);
    if (u) {
      return (
        u.displayName?.trim() ||
        `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
        u.email ||
        raw
      );
    }
    return raw;
  }, [users]);

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg">
        <p className="text-gray-600">No jobs found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <Card key={job.id} onClick={() => onEdit(job)} hoverable>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <h3 className="text-lg font-semibold text-gray-900">{job.jobId}</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(job.status)}`}>
                  {job.status}
                </span>
              </div>
              <p className="text-gray-700 mb-2">{job.title}</p>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <span>
                  <span className="font-medium">Customer:</span> {getCustomerName(job.customerCode)}
                </span>
                <span>
                  <span className="font-medium">Equipment:</span> {job.equipment.length} items
                </span>
                {job.appointmentDate && (
                  <span>
                    <span className="font-medium">Appointment:</span> {new Date(job.appointmentDate).toLocaleDateString('en-GB')}
                  </span>
                )}
                {job.assignedStaff && (
                  <span>
                    <span className="font-medium">Staff:</span> {staffDisplay(job.assignedStaff)}
                  </span>
                )}
              </div>
            </div>
            <div className="text-sm text-gray-500 ml-4">
              {new Date(job.createdAt).toLocaleDateString('en-GB')}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

