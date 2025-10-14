import React from 'react';
import type { User } from '../../types';
import { Card } from '../common/Card';

interface UserGridViewProps {
  users: User[];
  onEdit: (user: User) => void;
}

/**
 * Grid view for users - Compact grid display
 */
export const UserGridView: React.FC<UserGridViewProps> = ({ users, onEdit }) => {
  if (users.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg">
        <p className="text-gray-600">No users found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {users.map((user) => (
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
            <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
              user.role === 'admin' 
                ? 'bg-primary-100 text-primary-800' 
                : 'bg-blue-100 text-blue-800'
            }`}>
              {user.role}
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
          </div>
        </Card>
      ))}
    </div>
  );
};

