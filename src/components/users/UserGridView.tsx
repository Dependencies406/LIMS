import React from 'react';
import type { Role, User } from '../../types';
import { getRoleDisplayName } from '../../services/roleService';
import { Card } from '../common/Card';

interface UserGridViewProps {
  users: User[];
  roles?: Role[];
  onEdit: (user: User) => void;
  onEnableAccount?: (user: User) => void | Promise<void>;
  enablingUserId?: string | null;
}

/**
 * Grid view for users - Compact grid display
 */
export const UserGridView: React.FC<UserGridViewProps> = ({
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
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {users.map((user) => {
        const roleLabel = getRoleDisplayName(user.role, roles);
        return (
        <Card key={user.uid} onClick={() => onEdit(user)} hoverable className="p-4">
          <div className="space-y-2 text-center">
            {/* Avatar */}
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto">
              <span className="text-primary-700 font-semibold text-xl">
                {user.firstName?.[0]}{user.lastName?.[0]}
              </span>
            </div>

            {/* Name */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {user.firstName} {user.lastName}
              </h3>
              <p className="text-xs text-gray-500 truncate">{user.position || 'No position'}</p>
            </div>

            {/* Role Badge */}
            <span
              title={roleLabel}
              className={`inline-block max-w-full truncate px-2 py-1 rounded-full text-xs font-medium ${
              user.role === 'admin' 
                ? 'bg-primary-100 text-primary-800' 
                : 'bg-blue-100 text-blue-800'
            }`}>
              {roleLabel}
            </span>

            {/* Status Indicator */}
            <div className="flex items-center justify-center space-x-1">
              <span className={`w-2 h-2 rounded-full ${
                user.isActive !== false ? 'bg-green-500' : 'bg-gray-400'
              }`}></span>
              <span className="text-xs text-gray-600">
                {user.isActive !== false ? 'Active' : 'Inactive'}
              </span>
            </div>

            {user.isActive === false && onEnableAccount && (
              <div onClick={(e) => e.stopPropagation()} className="pt-1">
                <button
                  type="button"
                  onClick={() => onEnableAccount(user)}
                  disabled={enablingUserId === user.uid}
                  className="btn btn-primary w-full text-xs py-1.5 px-2"
                >
                  {enablingUserId === user.uid ? '…' : 'Enable'}
                </button>
              </div>
            )}
          </div>
        </Card>
        );
      })}
    </div>
  );
};

