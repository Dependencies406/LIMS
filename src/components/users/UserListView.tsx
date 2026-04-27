import React from 'react';
import type { Role, User } from '../../types';
import { getRoleDisplayName } from '../../services/roleService';

interface UserListViewProps {
  users: User[];
  roles?: Role[];
  onEdit: (user: User) => void;
  /** Re-enable a deactivated Firestore user (sign-in allowed again). */
  onEnableAccount?: (user: User) => void | Promise<void>;
  enablingUserId?: string | null;
}

/**
 * List view for users - Table format with all details
 */
export const UserListView: React.FC<UserListViewProps> = ({
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
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Position
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Role
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Last Login
            </th>
            {onEnableAccount && (
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {users.map((user) => {
            const roleLabel = getRoleDisplayName(user.role, roles);
            return (
            <tr
              key={user.uid}
              onClick={() => onEdit(user)}
              className="hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {user.firstName} {user.lastName}
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{user.position || '-'}</td>
              <td className="px-6 py-4 whitespace-nowrap max-w-[14rem]">
                <span
                  title={roleLabel}
                  className={`inline-block max-w-full truncate px-3 py-1 rounded-full text-xs font-medium ${
                  user.role === 'admin' 
                    ? 'bg-primary-100 text-primary-800' 
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {roleLabel}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  user.isActive !== false
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {user.isActive !== false ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
              </td>
              {onEnableAccount && (
                <td
                  className="px-6 py-4 whitespace-nowrap text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  {user.isActive === false ? (
                    <button
                      type="button"
                      onClick={() => onEnableAccount(user)}
                      disabled={enablingUserId === user.uid}
                      className="btn btn-primary text-xs py-1.5 px-3"
                    >
                      {enablingUserId === user.uid ? 'Enabling…' : 'Enable account'}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

