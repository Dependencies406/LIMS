import React from 'react';
import type { Role, User } from '../../types';
import { getRoleDisplayName } from '../../services/roleService';
import { Card } from '../common/Card';

interface UserCardViewProps {
  users: User[];
  roles?: Role[];
  onEdit: (user: User) => void;
  onEnableAccount?: (user: User) => void | Promise<void>;
  enablingUserId?: string | null;
}

/**
 * Card view for users - Detailed card display
 */
export const UserCardView: React.FC<UserCardViewProps> = ({
  users,
  roles = [],
  onEdit,
  onEnableAccount,
  enablingUserId = null,
}) => {
  if (users.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg">
        <p className="text-gray-600">No users found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {users.map((user) => {
        const roleLabel = getRoleDisplayName(user.role, roles);
        return (
        <Card key={user.uid} onClick={() => onEdit(user)} hoverable>
          <div className="space-y-3">
            {/* Header with Role Badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center space-x-2 min-w-0">
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-700 font-semibold text-lg">
                    {user.firstName?.[0]}{user.lastName?.[0]}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {user.firstName} {user.lastName}
                  </h3>
                  <p className="text-xs text-gray-500">{user.position || 'No position'}</p>
                </div>
              </div>
              <span
                title={roleLabel}
                className={`flex-shrink-0 max-w-[40%] truncate px-2 py-1 rounded-full text-xs font-medium ${
                user.role === 'admin' 
                  ? 'bg-primary-100 text-primary-800' 
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {roleLabel}
              </span>
            </div>

            {/* User Details */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center text-gray-600">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="truncate">{user.email}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  user.isActive !== false
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {user.isActive !== false ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Last Login:</span>
                <span>{user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('en-GB') : 'Never'}</span>
              </div>

              {user.isActive === false && onEnableAccount && (
                <div
                  className="pt-2 border-t border-gray-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onEnableAccount(user)}
                    disabled={enablingUserId === user.uid}
                    className="btn btn-primary w-full text-sm py-2"
                  >
                    {enablingUserId === user.uid ? 'Enabling…' : 'Enable account'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>
        );
      })}
    </div>
  );
};

