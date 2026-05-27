import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
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
  const [tab, setTab] = useState<'users' | 'roles'>(initialTab);

  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  if (!isAdmin) {
    return (
      <div className="modal" onClick={onClose}>
        <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-11a4 4 0 00-4 4v1H6a2 2 0 00-2 2v7a2 2 0 002 2h12a2 2 0 002-2v-7a2 2 0 00-2-2h-2V8a4 4 0 00-4-4z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Access restricted</h2>
            <p className="text-sm text-gray-500 mb-5">Only administrators can manage users and roles.</p>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors">
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
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-5 py-3.5">
          <div className="flex items-center justify-between gap-4">

            {/* Title */}
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900">Users & Roles</h2>
              <p className="text-xs text-gray-400 mt-0.5">Accounts, assignments, and permission templates</p>
            </div>

            {/* Tab switcher + close */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div
                className="flex rounded-lg bg-gray-100 p-0.5 gap-0.5"
                role="tablist"
                aria-label="Users and roles sections"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'users'}
                  onClick={() => setTab('users')}
                  className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    tab === 'users'
                      ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Users
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'roles'}
                  onClick={() => setTab('roles')}
                  className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    tab === 'roles'
                      ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Roles
                </button>
              </div>

              {/* Close */}
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <UserManagementModal embedded isOpen={tab === 'users'} onClose={onClose} />
          <RoleManagementModal embedded isOpen={tab === 'roles'} onClose={onClose} />
        </div>
      </div>
    </div>
  );
};
