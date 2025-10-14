import React, { useState } from 'react';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { ViewToggle } from './common/ViewToggle';
import { useViewPreference } from '../hooks/useViewPreference';
import { UserListView } from './users/UserListView';
import { UserCardView } from './users/UserCardView';
import { UserGridView } from './users/UserGridView';
import { UserModal } from './UserModal';
import { userService } from '../services/userService';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose }) => {
  const { isAdmin } = useAuth();
  const { users, loading, error } = useUsers();
  const { success } = useToast();
  
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<boolean>(true); // true = active only
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  
  // View preferences with localStorage persistence
  const [usersView, setUsersView] = useViewPreference('lims-users-view', 'card');

  if (!isOpen) return null;

  // Redirect if not admin
  if (!isAdmin) {
    return (
      <div className="modal" onClick={onClose}>
        <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
          <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold text-red-800 mb-2">Access Denied</h2>
            <p className="text-red-600">This feature is only accessible to administrators.</p>
            <button onClick={onClose} className="btn btn-primary mt-4">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleCreateUser = () => {
    setSelectedUser(null);
    setShowUserModal(true);
  };

  const handleEditUser = (user: any) => {
    setSelectedUser(user);
    setShowUserModal(true);
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.position || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = !statusFilter || user.isActive !== false;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  // Calculate statistics
  const stats = {
    total: users.length,
    active: users.filter(u => u.isActive !== false).length,
    inactive: users.filter(u => u.isActive === false).length,
    admins: users.filter(u => u.role === 'admin').length,
    staff: users.filter(u => u.role === 'staff').length,
  };

  return (
    <>
      <div className="modal" onClick={onClose}>
        <div className="modal-content max-w-7xl" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
                <p className="text-gray-600 mt-1">Manage user accounts and permissions</p>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
                ×
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Statistics Dashboard */}
            {!error && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                {/* Total Users */}
                <div className="p-4 rounded-lg border-2 border-gray-200 bg-white">
                  <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                  <div className="text-sm text-gray-600 mt-1">Total Users</div>
                </div>

                {/* Active */}
                <button
                  onClick={() => setStatusFilter(statusFilter ? statusFilter : true)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    statusFilter
                      ? 'border-green-500 bg-green-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-green-300 hover:shadow-sm'
                  }`}
                >
                  <div className="text-2xl font-bold text-green-600">{stats.active}</div>
                  <div className="text-sm text-gray-600 mt-1">Active</div>
                </button>

                {/* Inactive */}
                <button
                  onClick={() => setStatusFilter(!statusFilter)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    !statusFilter
                      ? 'border-gray-500 bg-gray-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="text-2xl font-bold text-gray-600">{stats.inactive}</div>
                  <div className="text-sm text-gray-600 mt-1">Inactive</div>
                </button>

                {/* Admins */}
                <button
                  onClick={() => setRoleFilter(roleFilter === 'admin' ? 'all' : 'admin')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    roleFilter === 'admin'
                      ? 'border-primary-500 bg-primary-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-primary-300 hover:shadow-sm'
                  }`}
                >
                  <div className="text-2xl font-bold text-primary-600">{stats.admins}</div>
                  <div className="text-sm text-gray-600 mt-1">Admins</div>
                </button>

                {/* Staff */}
                <button
                  onClick={() => setRoleFilter(roleFilter === 'staff' ? 'all' : 'staff')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    roleFilter === 'staff'
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
                  }`}
                >
                  <div className="text-2xl font-bold text-blue-600">{stats.staff}</div>
                  <div className="text-sm text-gray-600 mt-1">Staff</div>
                </button>
              </div>
            )}

            {/* Toolbar */}
            {!error && (
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex flex-wrap gap-4 flex-1">
                {/* Animated Search Box */}
                <div className="relative">
                  {!isSearchExpanded ? (
                    <button
                      onClick={() => setIsSearchExpanded(true)}
                      className="flex items-center justify-center w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-all duration-200 hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      title="Search users..."
                    >
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="input max-w-md"
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
                        className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                        title="Clear search"
                      >
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* View Toggle */}
                <ViewToggle
                  currentView={usersView}
                  onViewChange={setUsersView}
                />
              </div>

              {/* Create User Button */}
              {!error && (
                <button onClick={handleCreateUser} className="btn btn-primary whitespace-nowrap">
                  + Create User
                </button>
              )}
              
              {/* Debug Button */}
              <button 
                onClick={async () => {
                  console.log('=== DEBUG BUTTON CLICKED ===');
                  await userService.debugFirestoreAccess();
                }} 
                className="btn btn-secondary whitespace-nowrap ml-2"
              >
                🔍 Debug
              </button>
              </div>
            )}

            {/* Users List */}
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="text-gray-500">Loading users...</div>
              </div>
            ) : error ? (
              <div className="card p-12 text-center">
                <div className="mb-4">
                  <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-red-800 mb-2">Permission Error</h3>
                  <p className="text-red-600 mb-4">
                    Cannot access user data. This is likely due to Firestore security rules.
                  </p>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-left max-w-md mx-auto">
                    <h4 className="font-semibold text-yellow-800 mb-2">Quick Fix (2 minutes):</h4>
                    <ol className="text-sm text-yellow-700 space-y-1 list-decimal ml-4">
                      <li>Go to <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-medium">Firebase Console</a></li>
                      <li>Navigate to Firestore Database → Rules</li>
                      <li>Replace rules with:</li>
                    </ol>
                    <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono">
                      match /{`{document=**}`} {'{'}<br/>
                      &nbsp;&nbsp;allow read, write: if request.auth != null;<br/>
                      {'}'}
                    </div>
                    <ol className="text-sm text-yellow-700 space-y-1 list-decimal ml-4 mt-2">
                      <li>Click "Publish"</li>
                      <li>Refresh this page</li>
                    </ol>
                  </div>
                  <p className="text-xs text-gray-500 mt-4">
                    Error: {error}
                  </p>
                </div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="mb-4">
                  <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">No Users Found</h3>
                  <p className="text-gray-600 mb-4">
                    No users have been created yet. Create your first user to get started.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {usersView === 'list' && (
                  <UserListView
                    users={filteredUsers}
                    onEdit={handleEditUser}
                  />
                )}
                {usersView === 'card' && (
                  <UserCardView
                    users={filteredUsers}
                    onEdit={handleEditUser}
                  />
                )}
                {usersView === 'grid' && (
                  <UserGridView
                    users={filteredUsers}
                    onEdit={handleEditUser}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* User Modal */}
      {showUserModal && (
        <UserModal
          user={selectedUser}
          onClose={() => {
            setShowUserModal(false);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            setShowUserModal(false);
            setSelectedUser(null);
            success(selectedUser ? 'User updated successfully' : 'User created successfully');
          }}
        />
      )}
    </>
  );
};
