import React, { useState, useEffect } from 'react';
import { DateInput } from './common/DateInput';
import type { Job, User } from '../types';
import { jobService } from '../services/jobService';
import { jobLoggingService } from '../services/jobLoggingService';
import { userService, matchUserFromAssignedStaffValue } from '../services/userService';
import { notificationService } from '../services/notificationService';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';

interface JobAssignmentModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const JobAssignmentModal: React.FC<JobAssignmentModalProps> = ({
  job,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [expectedFinishDate, setExpectedFinishDate] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    const loadUsers = async () => {
      try {
        const allUsers = await userService.getAllUsers();
        // Filter to only active users (staff and admin can be assigned)
        const activeUsers = allUsers.filter(
          (u) => u.isActive !== false && u.uid !== currentUser?.uid // Don't show current user
        );
        setUsers(activeUsers);

        if (job?.assignedStaff) {
          const matched = matchUserFromAssignedStaffValue(job.assignedStaff, allUsers);
          setSelectedStaffId(matched ? matched.uid : job.assignedStaff);
        }

        if (job?.expectedFinishDate) {
          setExpectedFinishDate(job.expectedFinishDate);
        } else if (job?.appointmentDate) {
          setExpectedFinishDate(job.appointmentDate);
        } else {
          setExpectedFinishDate('');
        }
      } catch (err) {
        console.error('Error loading users:', err);
        showError('Failed to load staff members');
      }
    };

    loadUsers();
  }, [isOpen, job, showError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!job || !currentUser) return;

    if (!selectedStaffId) {
      showError('Please select a staff member to assign');
      return;
    }

    if (!expectedFinishDate) {
      showError('Please set an expected finish date');
      return;
    }

    setLoading(true);

    try {
      // Assign the job
      await jobService.assignJob(job.id, selectedStaffId, currentUser.uid, expectedFinishDate);

      // Get assigned user details for notification
      const assignedUser = users.find((u) => u.uid === selectedStaffId);
      try {
        await jobLoggingService.logJobAction(
          job.id,
          'assigned',
          {
            assignedTo: selectedStaffId,
            expectedFinishDate,
          },
          currentUser
        );

        await jobLoggingService.logStaffAction(
          selectedStaffId,
          'assigned',
          job.id,
          {
            expectedFinishDate,
          },
          currentUser
        );

        await jobLoggingService.logStaffAction(
          selectedStaffId,
          'expected_finish_date_set',
          job.id,
          {
            expectedFinishDate,
          },
          currentUser
        );
      } catch (logError: any) {
        // Logging failures shouldn't block assignment
        // This usually means Firestore rules haven't been deployed yet
        console.warn('Failed to log assignment (non-blocking):', logError?.message || logError);
        if (import.meta.env.DEV) {
          console.info('💡 Tip: Deploy Firestore rules to enable logging. Assignment succeeded.');
        }
      }

      
      // Create notification
      await notificationService.notifyJobAssigned(
        job.jobId,
        job.title,
        selectedStaffId,
        currentUser.uid
      );

      // If there's a message, create a message notification
      if (message.trim()) {
        await notificationService.notifyJobMessage(
          job.jobId,
          job.title,
          selectedStaffId,
          currentUser.uid,
          message.trim()
        );
      }

      success(`Job assigned to ${assignedUser?.displayName || assignedUser?.email || 'staff member'}`);
      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Error assigning job:', err);
      showError(err.message || 'Failed to assign job. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedStaffId('');
    setMessage('');
    setExpectedFinishDate('');
    onClose();
  };

  if (!isOpen || !job) return null;

  return (
    <div className="modal" onClick={handleClose}>
      <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Assign Job</h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-medium">Job:</span> {job.jobId} - {job.title}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assign To <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="input w-full"
              required
            >
              <option value="">Select a staff member...</option>
              {users.map((user) => (
                <option key={user.uid} value={user.uid}>
                  {user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.email}
                  {user.position ? ` - ${user.position}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Expected Finish Date <span className="text-red-500">*</span>
            </label>
            <DateInput
              
              value={expectedFinishDate}
              onChange={(e) => setExpectedFinishDate(e.target.value)}
              className="input w-full"
              required
              min={job?.appointmentDate || undefined}
            />
            <p className="text-xs text-gray-500 mt-1">
              Used to track on-time vs overdue completion.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message (Optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="input w-full"
              rows={3}
              placeholder="Add a message or note about this assignment..."
            />
            <p className="text-xs text-gray-500 mt-1">
              This message will be sent as a notification to the assigned staff member.
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Assigning...' : 'Assign Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
