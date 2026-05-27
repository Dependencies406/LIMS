import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { usePermission } from '../hooks/usePermission';
import type { StaffPerformanceMetrics } from '../types';
import { staffPerformanceService } from '../services/staffPerformanceService';
import { jobLoggingService } from '../services/jobLoggingService';

export const StaffPerformanceDashboard: React.FC = () => {
  const { isAdmin } = useAuth();
  const { hasPermission: canViewPerformance, loading: permissionLoading } = usePermission('staffPerformance.view');
  const { success, error: showError } = useToast();
  const [metrics, setMetrics] = useState<StaffPerformanceMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingStaffId, setExportingStaffId] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await staffPerformanceService.getAllStaffPerformance();
      setMetrics(data);
    } catch (err) {
      console.error('Failed to load staff performance:', err);
      showError('Failed to load staff performance');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (!canViewPerformance && !permissionLoading) return;
    if (permissionLoading) return;
    loadMetrics();
  }, [canViewPerformance, permissionLoading, loadMetrics]);

  const handleExportLogs = useCallback(async (staffId: string) => {
    setExportingStaffId(staffId);
    try {
      const logText = await jobLoggingService.exportStaffLogsToText(staffId);
      const blob = new Blob([logText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `staff-logs-${staffId}-${Date.now()}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      success('Staff logs exported');
    } catch (err) {
      console.error('Failed to export staff logs:', err);
      showError('Failed to export staff logs');
    } finally {
      setExportingStaffId(null);
    }
  }, [showError, success]);

  if (permissionLoading) {
    return (
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Checking permissions...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!canViewPerformance && !isAdmin) {
    return (
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold text-red-800 mb-2">Access Denied</h2>
            <p className="text-red-600">You don't have permission to view staff performance metrics.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading performance data...</div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="card p-4">
                <div className="text-sm text-gray-600">Total Staff</div>
                <div className="text-2xl font-bold text-gray-900">{metrics.length}</div>
              </div>
              <div className="card p-4">
                <div className="text-sm text-gray-600">Total Assigned Jobs</div>
                <div className="text-2xl font-bold text-blue-600">
                  {metrics.reduce((sum, item) => sum + (item.totalJobsAssigned ?? 0), 0)}
                </div>
              </div>
              <div className="card p-4">
                <div className="text-sm text-gray-600">Average On-Time %</div>
                <div className="text-2xl font-bold text-green-600">
                  {metrics.length > 0
                    ? Math.round(metrics.reduce((sum, item) => sum + (item.onTimePercentage ?? 0), 0) / metrics.length)
                    : 0}
                  %
                </div>
              </div>
              <div className="card p-4">
                <div className="text-sm text-gray-600">Jobs In Progress</div>
                <div className="text-2xl font-bold text-purple-600">
                  {metrics.reduce((sum, item) => sum + (item.jobsInProgress ?? 0), 0)}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Performance Summary</h2>
                <button
                  type="button"
                  onClick={loadMetrics}
                  className="px-3 py-1 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50"
                >
                  Refresh
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Staff
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Assigned
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        On Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Overdue
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        On-Time %
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg Days
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Logs
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {metrics.map(item => (
                      <tr key={item.staffId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{item.staffName}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.totalJobsAssigned}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                          {item.jobsCompletedOnTime}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                          {item.jobsCompletedOverdue}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {(item.onTimePercentage ?? 0).toFixed(1)}%
                            </span>
                            <div className="w-24 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-green-600 h-2 rounded-full"
                                style={{ width: `${item.onTimePercentage ?? 0}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.averageCompletionDays ? `${item.averageCompletionDays.toFixed(1)} days` : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            type="button"
                            onClick={() => handleExportLogs(item.staffId ?? '')}
                            disabled={exportingStaffId === item.staffId}
                            className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                          >
                            {exportingStaffId === item.staffId ? 'Exporting...' : 'Export'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {metrics.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                          No staff performance data available yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
