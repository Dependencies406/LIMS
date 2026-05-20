import { jobService } from './jobService';
import { userService, matchUserFromAssignedStaffValue } from './userService';
import type { Job, StaffPerformanceMetrics, User } from '../types';
import { parseDateStringAsLocal } from '../utils/dateUtils';

const formatName = (user?: User): string => {
  if (!user) return '';
  return (
    user.displayName?.trim() ||
    `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
    user.email ||
    ''
  );
};

const toDateOnly = (value?: string): Date | null => {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? parseDateStringAsLocal(value)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

export const staffPerformanceService = {
  async getAllStaffPerformance(): Promise<StaffPerformanceMetrics[]> {
    const [jobs, users] = await Promise.all([
      jobService.getAllJobs(),
      userService.getAllUsers(),
    ]);

    /** Merge jobs where the same person was saved as uid vs legacy display name. */
    const canonicalKeyForJob = (job: Job): string | null => {
      const raw = job.assignedStaff?.trim();
      if (!raw) return null;
      const user = matchUserFromAssignedStaffValue(raw, users);
      return user ? user.uid : raw;
    };

    const buckets = new Map<string, Job[]>();
    for (const job of jobs) {
      const key = canonicalKeyForJob(job);
      if (!key) continue;
      const list = buckets.get(key);
      if (list) list.push(job);
      else buckets.set(key, [job]);
    }

    const metrics: StaffPerformanceMetrics[] = [];

    buckets.forEach((staffJobs, canonicalStaffId) => {
      const completedJobs = staffJobs.filter(job => job.status === 'Completed');

      const completedOnTime = completedJobs.filter(job => {
        const expected = toDateOnly(job.expectedFinishDate);
        const completed = toDateOnly(job.completedDate);
        if (!expected || !completed) return false;
        return completed <= expected;
      });

      const completedOverdue = completedJobs.filter(job => {
        const expected = toDateOnly(job.expectedFinishDate);
        const completed = toDateOnly(job.completedDate);
        if (!expected || !completed) return false;
        return completed > expected;
      });

      const totalJobsAssigned = staffJobs.length;
      const onTimePercentage = totalJobsAssigned > 0
        ? (completedOnTime.length / totalJobsAssigned) * 100
        : 0;
      const overduePercentage = totalJobsAssigned > 0
        ? (completedOverdue.length / totalJobsAssigned) * 100
        : 0;

      let averageCompletionDays: number | undefined;
      const completionDurations = completedJobs
        .map(job => {
          const start = toDateOnly(job.appointmentDate);
          const completed = toDateOnly(job.completedDate);
          if (!start || !completed) return null;
          const diffMs = completed.getTime() - start.getTime();
          return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        })
        .filter((days): days is number => days !== null);

      if (completionDurations.length > 0) {
        const totalDays = completionDurations.reduce((sum, days) => sum + days, 0);
        averageCompletionDays = Math.round((totalDays / completionDurations.length) * 100) / 100;
      }

      const staffUser = matchUserFromAssignedStaffValue(canonicalStaffId, users);
      const resolvedName = formatName(staffUser);
      const staffName =
        resolvedName ||
        (canonicalStaffId.trim() ? canonicalStaffId.trim() : 'Unknown');

      metrics.push({
        staffId: canonicalStaffId,
        staffName,
        totalJobsAssigned,
        jobsCompletedOnTime: completedOnTime.length,
        jobsCompletedOverdue: completedOverdue.length,
        jobsPending: staffJobs.filter(job => job.status === 'Pending').length,
        jobsInProgress: staffJobs.filter(job => job.status === 'In Progress').length,
        onTimePercentage: Math.round(onTimePercentage * 100) / 100,
        overduePercentage: Math.round(overduePercentage * 100) / 100,
        averageCompletionDays,
        lastUpdated: new Date(),
      });
    });

    return metrics.sort((a, b) => b.totalJobsAssigned - a.totalJobsAssigned);
  },

  async getStaffPerformance(staffId: string): Promise<StaffPerformanceMetrics | null> {
    const metrics = await this.getAllStaffPerformance();
    return metrics.find(item => item.staffId === staffId) || null;
  },
};
