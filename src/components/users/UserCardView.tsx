import React from 'react';
import type { User } from '../../types';
import { Card } from '../common/Card';

interface UserCardViewProps {
  users: User[];
  onEdit: (user: User) => void;
}

/**
 * Card view for users - Detailed card display
 */
export const UserCardView: React.FC<UserCardViewProps> = ({ users, onEdit }) => {
  if (users.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg">
        <p className="text-gray-600">No users found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {users.map((user) => (
        <Card key={user.uid} onClick={() => onEdit(user)} hoverable>
          <div className="space-y-3">
            {/* Header with Role Badge */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-700 font-semibold text-lg">
                    {user.firstName?.[0]}{user.lastName?.[0]}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {user.firstName} {user.lastName}
                  </h3>
                  <p className="text-xs text-gray-500">{user.position || 'No position'}</p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                user.role === 'admin' 
                  ? 'bg-primary-100 text-primary-800' 
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {user.role}
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
                <span>{user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}</span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

