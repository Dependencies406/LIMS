import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { UserManagementModal } from './UserManagementModal';
import { RoleManagementModal } from './RoleManagementModal';

export interface UsersAndRolesManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'users' | 'roles';
}

export const UsersAndRolesManagementModal: React.FC<UsersAndRolesManagementModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'users',
}) => {
  const { isAdmin } = useAuth();
  const { hasPermission: canViewUsers } = usePermission('users.view');
  const { hasPermission: canViewRoles } = usePermission('roles.view');
  const hasAnyAccess = isAdmin || canViewUsers || canViewRoles;
  const [tab, setTab] = useState<'users' | 'roles'>(initialTab);

  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  if (!hasAnyAccess) {
    return (
      <div className="modal" onClick={onClose}>
        <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold text-red-800 mb-2">Access Denied</h2>
            <p className="text-red-600">You don't have permission to manage users or roles.</p>
            <button type="button" onClick={onClose} className="btn btn-primary mt-4">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal-content max-w-7xl max-h-[min(92vh,960px)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-20 flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Users & roles</h2>
              <p className="text-sm text-gray-600 mt-1">
                Accounts, assignments, and permission templates
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-shrink-0">
              <div
                className="flex rounded-lg bg-gray-100 p-1 gap-1 w-full sm:w-auto"
                role="tablist"
                aria-label="Users and roles"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'users'}
                  onClick={() => setTab('users')}
                  className={`flex-1 sm:flex-initial min-w-0 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    tab === 'users'
                      ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Users
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'roles'}
                  onClick={() => setTab('roles')}
                  className={`flex-1 sm:flex-initial min-w-0 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    tab === 'roles'
                      ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span className="hidden sm:inline">Roles & permissions</span>
                  <span className="sm:hidden">Roles</span>
                </button>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="self-end sm:self-center text-gray-500 hover:text-gray-700 text-2xl leading-none px-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <UserManagementModal embedded isOpen={tab === 'users'} onClose={onClose} />
          <RoleManagementModal embedded isOpen={tab === 'roles'} onClose={onClose} />
        </div>
      </div>
    </div>
  );
};
