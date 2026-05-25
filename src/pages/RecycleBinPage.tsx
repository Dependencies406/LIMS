import React, { useState, useEffect, useMemo } from 'react';
import type { Job, Customer, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { jobService } from '../services/jobService';
import { customerService } from '../services/customerService';
import { userService } from '../services/userService';
import { 
  restoreJob, 
  restoreCustomer, 
  restoreDocument, 
  restoreTemplate,
  permanentDeleteJob,
  permanentDeleteCustomer,
  permanentDeleteDocument,
  permanentDeleteTemplate
} from '../services/firestoreDeletionService';
import { StatFilterDropdown } from '../components/common/StatFilterDropdown';

type DeletedItem = {
  id: string;
  type: 'job' | 'customer' | 'document' | 'template' | 'user';
  name: string;
  deletedAt?: Date;
  deletedBy?: string;
  status?: string;
  jobId?: string; // For documents
  customerId?: string;
};

export const RecycleBinPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<DeletedItem | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'job' | 'customer' | 'document' | 'template' | 'user'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Load users map for displaying names
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const users = await userService.getAllUsers();
        const map = new Map<string, string>();
        users.forEach(user => {
          const name = `${user.firstName} ${user.lastName}`.trim() || user.displayName || user.email || user.uid;
          map.set(user.uid, name);
        });
        setUserMap(map);
      } catch (err) {
        console.error('Error loading users:', err);
      }
    };

    loadUsers();
  }, []);

  // Load deleted items
  useEffect(() => {
    if (!currentUser) return;

    const loadDeletedItems = async () => {
      setLoading(true);
      try {
        const deletedItems: DeletedItem[] = [];

        // Load deleted jobs
        try {
          const jobs = await jobService.getAllJobs(true);
          const deletedJobs = jobs.filter(job => job.isDeleted);
          deletedJobs.forEach(job => {
            deletedItems.push({
              id: job.id!,
              type: 'job',
              name: job.title || job.jobId || 'Untitled Job',
              deletedAt: job.deletedAt,
              deletedBy: job.deletedBy,
              status: job.status,
            });
          });
        } catch (err) {
          console.error('Error loading deleted jobs:', err);
        }

        // Load deleted customers
        try {
          const customers = await customerService.getAllCustomers();
          const deletedCustomers = customers.filter((c: any) => c.isDeleted);
          deletedCustomers.forEach(customer => {
            deletedItems.push({
              id: customer.id!,
              type: 'customer',
              name: customer.name || customer.customerCode || 'Untitled Customer',
              deletedAt: (customer as any).deletedAt,
              deletedBy: (customer as any).deletedBy,
              customerId: customer.customerCode || (customer as any).customerId,
            });
          });
        } catch (err) {
          console.error('Error loading deleted customers:', err);
        }

        // Sort by deletion date (most recent first)
        deletedItems.sort((a, b) => {
          const dateA = a.deletedAt?.getTime() || 0;
          const dateB = b.deletedAt?.getTime() || 0;
          return dateB - dateA;
        });

        setItems(deletedItems);
      } catch (err) {
        console.error('Error loading deleted items:', err);
        showError('Failed to load deleted items');
      } finally {
        setLoading(false);
      }
    };

    loadDeletedItems();
  }, [currentUser, showError]);

  const typeCounts = useMemo(
    () => ({
      all: items.length,
      job: items.filter((i) => i.type === 'job').length,
      customer: items.filter((i) => i.type === 'customer').length,
      document: items.filter((i) => i.type === 'document').length,
      template: items.filter((i) => i.type === 'template').length,
      user: items.filter((i) => i.type === 'user').length,
    }),
    [items]
  );

  // Filter items
  const filteredItems = items.filter(item => {
    // Type filter
    if (filterType !== 'all' && item.type !== filterType) {
      return false;
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        item.name.toLowerCase().includes(term) ||
        item.id.toLowerCase().includes(term) ||
        (item.status && item.status.toLowerCase().includes(term))
      );
    }

    return true;
  });

  // Handle restore
  const handleRestore = async (item: DeletedItem) => {
    if (!currentUser?.uid) {
      showError('You must be logged in to restore items');
      return;
    }

    setRestoring(item.id);
    try {
      switch (item.type) {
        case 'job':
          await restoreJob(item.id, currentUser.uid);
          success(`Job "${item.name}" has been restored`);
          break;
        case 'customer':
          await restoreCustomer(item.id, currentUser.uid);
          success(`Customer "${item.name}" has been restored`);
          break;
        case 'document':
          if (item.jobId) {
            await restoreDocument(item.jobId, item.id, currentUser.uid);
            success(`Document "${item.name}" has been restored`);
          }
          break;
        case 'template':
          await restoreTemplate(item.id, currentUser.uid);
          success(`Template "${item.name}" has been restored`);
          break;
        default:
          showError(`Cannot restore items of type: ${item.type}`);
          return;
      }

      // Remove restored item from list
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      console.error('Error restoring item:', err);
      showError(err instanceof Error ? err.message : 'Failed to restore item');
    } finally {
      setRestoring(null);
    }
  };

  // Handle permanent delete
  const handlePermanentDelete = async (item: DeletedItem) => {
    if (!currentUser?.uid) {
      showError('You must be logged in to permanently delete items');
      return;
    }

    const label = item.name || item.id;
    if (
      !window.confirm(
        `Final confirmation: permanently delete "${label}"?\n\nThis removes all related data from the database and cannot be undone.`
      )
    ) {
      return;
    }

    setDeleting(item.id);
    setShowDeleteConfirm(null);
    try {
      switch (item.type) {
        case 'job':
          await permanentDeleteJob(item.id, currentUser.uid);
          success(`Job "${item.name}" has been permanently deleted`);
          break;
        case 'customer':
          await permanentDeleteCustomer(item.id, currentUser.uid);
          success(`Customer "${item.name}" has been permanently deleted`);
          break;
        case 'document':
          if (item.jobId) {
            await permanentDeleteDocument(item.jobId, item.id, currentUser.uid);
            success(`Document "${item.name}" has been permanently deleted`);
          }
          break;
        case 'template':
          await permanentDeleteTemplate(item.id, currentUser.uid);
          success(`Template "${item.name}" has been permanently deleted`);
          break;
        default:
          showError(`Cannot permanently delete items of type: ${item.type}`);
          return;
      }

      // Remove deleted item from list
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      console.error('Error permanently deleting item:', err);
      showError(err instanceof Error ? err.message : 'Failed to permanently delete item');
    } finally {
      setDeleting(null);
    }
  };

  // Get user name from ID
  const getUserName = (userId?: string): string => {
    if (!userId) return 'Unknown';
    return userMap.get(userId) || userId;
  };

  // Format date
  const formatDate = (date?: Date) => {
    if (!date) return 'Unknown';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Get type badge color
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'job': return 'bg-blue-100 text-blue-800';
      case 'customer': return 'bg-green-100 text-green-800';
      case 'document': return 'bg-purple-100 text-purple-800';
      case 'template': return 'bg-orange-100 text-orange-800';
      case 'user': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading deleted items...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters (counts shown in type dropdown — replaces stacked stat cards) */}
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <StatFilterDropdown
              id="recycle-type-filter"
              label="Item type"
              value={filterType}
              onChange={(v) =>
                setFilterType(v as 'all' | 'job' | 'customer' | 'document' | 'template' | 'user')
              }
              options={[
                { value: 'all', label: 'All types', count: typeCounts.all },
                { value: 'job', label: 'Jobs', count: typeCounts.job },
                { value: 'customer', label: 'Customers', count: typeCounts.customer },
                { value: 'document', label: 'Documents', count: typeCounts.document },
                { value: 'template', label: 'Templates', count: typeCounts.template },
                { value: 'user', label: 'Users', count: typeCounts.user },
              ]}
              className="sm:flex-1 sm:min-w-[min(100%,280px)]"
            />

            {/* Search */}
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <input
                type="text"
                placeholder="Search deleted items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>

        {/* Items Table */}
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No deleted items found</h3>
            <p className="text-gray-600">
              {searchTerm || filterType !== 'all'
                ? 'Try adjusting your filters'
                : 'The recycle bin is empty'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Deleted At
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Deleted By
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredItems.map((item) => (
                    <tr key={`${item.type}-${item.id}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(item.type)}`}>
                          {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{item.name}</div>
                        <div className="text-sm text-gray-500">ID: {item.id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {item.status && (
                          <span className="text-sm text-gray-700">{item.status}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(item.deletedAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {getUserName(item.deletedBy)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRestore(item)}
                            disabled={restoring === item.id || deleting === item.id}
                            className="text-primary-600 hover:text-primary-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            {restoring === item.id ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                                <span>Restoring...</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span>Restore</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(item)}
                            disabled={restoring === item.id || deleting === item.id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            {deleting === item.id ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                                <span>Deleting...</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                <span>Delete</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Permanent Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(null)}>
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900">Permanent Delete</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>
              
              <p className="text-gray-700 mb-6">
                Are you sure you want to permanently delete <strong>{showDeleteConfirm.name}</strong>? 
                This will permanently remove all associated data and cannot be restored.
              </p>
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  disabled={deleting === showDeleteConfirm.id}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handlePermanentDelete(showDeleteConfirm)}
                  disabled={deleting === showDeleteConfirm.id}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {deleting === showDeleteConfirm.id ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Delete Permanently</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
