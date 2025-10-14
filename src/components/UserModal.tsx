import React, { useState, useEffect } from 'react';
import type { User } from '../types';
import { db, doc, updateDoc, serverTimestamp } from '../services/firebase';
import { useUsers } from '../hooks/useUsers';
import { userService } from '../services/userService';

interface UserModalProps {
  user: User | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const UserModal: React.FC<UserModalProps> = ({ user, onClose, onSuccess }) => {
  const { deactivateUser, reactivateUser } = useUsers();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'training' | 'documents'>('basic');

  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    position: '',
    role: 'staff' as 'admin' | 'staff',
    isActive: true,
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (user) {
      setForm({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        position: user.position || '',
        role: user.role,
        isActive: user.isActive !== false,
        password: '',
        confirmPassword: '',
      });
    }
  }, [user]);

  const handleChange = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!form.email || !form.firstName || !form.lastName) {
      setError('Please fill in all required fields');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      setError('Please enter a valid email address');
      return;
    }

    // Password validation for new users
    if (!user) {
      if (!form.password) {
        setError('Password is required for new users');
        return;
      }
      if (form.password.length < 6) {
        setError('Password must be at least 6 characters long');
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    setLoading(true);

    try {
      if (user) {
        // Update existing user
        const updateData = {
          firstName: form.firstName,
          lastName: form.lastName,
          displayName: `${form.firstName} ${form.lastName}`,
          position: form.position,
          role: form.role,
          isActive: form.isActive,
          updatedAt: serverTimestamp(),
        };

        await updateDoc(doc(db, 'users', user.uid), updateData);
      } else {
        // Create new user with Firebase Auth + Firestore profile
        await userService.createUser({
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          position: form.position,
          role: form.role,
        });
      }

      onSuccess();
    } catch (err: any) {
      console.error('Error saving user:', err);
      setError(err.message || 'Failed to save user. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      if (form.isActive) {
        await deactivateUser(user.uid);
      } else {
        await reactivateUser(user.uid);
      }
      onSuccess();
    } catch (err) {
      console.error('Error changing user status:', err);
      setError('Failed to change user status. Please try again.');
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content max-w-3xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">
              {user ? 'Edit User' : 'Create New User'}
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
              ×
            </button>
          </div>

          {/* Tabs - Prepared for future features */}
          {user && (
            <div className="flex space-x-4 mt-4 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('basic')}
                className={`pb-3 px-2 font-medium transition-colors ${
                  activeTab === 'basic'
                    ? 'border-b-2 border-primary-600 text-primary-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Basic Information
              </button>
              <button
                onClick={() => setActiveTab('training')}
                className={`pb-3 px-2 font-medium transition-colors ${
                  activeTab === 'training'
                    ? 'border-b-2 border-primary-600 text-primary-600'
                    : 'text-gray-600 hover:text-gray-900'
                } opacity-50 cursor-not-allowed`}
                disabled
                title="Coming soon"
              >
                Training Logs
                <span className="ml-2 text-xs bg-gray-200 px-2 py-0.5 rounded">Soon</span>
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={`pb-3 px-2 font-medium transition-colors ${
                  activeTab === 'documents'
                    ? 'border-b-2 border-primary-600 text-primary-600'
                    : 'text-gray-600 hover:text-gray-900'
                } opacity-50 cursor-not-allowed`}
                disabled
                title="Coming soon"
              >
                Documents
                <span className="ml-2 text-xs bg-gray-200 px-2 py-0.5 rounded">Soon</span>
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {activeTab === 'basic' && (
            <>
              {/* Basic Information Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
                  Basic Information
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={(e) => handleChange('firstName', e.target.value)}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={(e) => handleChange('lastName', e.target.value)}
                      className="input"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="input"
                    required
                    disabled={!!user}
                  />
                  {user && (
                    <p className="text-xs text-gray-500 mt-1">
                      Email cannot be changed after user creation
                    </p>
                  )}
                </div>

                {/* Password fields (only for new users) */}
                {!user && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Password <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => handleChange('password', e.target.value)}
                        className="input"
                        required
                        placeholder="Minimum 6 characters"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Must be at least 6 characters long
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Confirm Password <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        value={form.confirmPassword}
                        onChange={(e) => handleChange('confirmPassword', e.target.value)}
                        className="input"
                        required
                        placeholder="Re-enter password"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Position
                  </label>
                  <input
                    type="text"
                    value={form.position}
                    onChange={(e) => handleChange('position', e.target.value)}
                    className="input"
                    placeholder="e.g., Laboratory Technician, Manager"
                  />
                </div>
              </div>

              {/* Account Settings Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
                  Account Settings
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="role"
                        value="staff"
                        checked={form.role === 'staff'}
                        onChange={(e) => handleChange('role', e.target.value)}
                        className="w-4 h-4 text-primary-600"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Staff</div>
                        <div className="text-sm text-gray-500">
                          Can view and edit jobs, customers. Cannot access settings or user management.
                        </div>
                      </div>
                    </label>

                    <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="role"
                        value="admin"
                        checked={form.role === 'admin'}
                        onChange={(e) => handleChange('role', e.target.value)}
                        className="w-4 h-4 text-primary-600"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Administrator</div>
                        <div className="text-sm text-gray-500">
                          Full access to all features including user management and settings.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {user && (
                  <div>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => handleChange('isActive', e.target.checked)}
                        className="w-4 h-4 text-primary-600 rounded"
                      />
                      <div>
                        <span className="font-medium text-gray-900">Active Account</span>
                        <p className="text-sm text-gray-500">
                          Inactive users cannot log in to the system
                        </p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* User Information Display (for existing users) */}
              {user && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
                    Account Information
                  </h3>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">User ID:</span>
                      <p className="font-mono text-xs text-gray-800 mt-1">{user.uid}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Last Login:</span>
                      <p className="text-gray-800 mt-1">
                        {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never logged in'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600">Created:</span>
                      <p className="text-gray-800 mt-1">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600">Last Updated:</span>
                      <p className="text-gray-800 mt-1">
                        {user.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Future Features Placeholder */}
              {user && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">🔮 Future Features</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Training logs and certifications</li>
                    <li>• Document storage (ID, certificates, etc.)</li>
                    <li>• Performance tracking</li>
                    <li>• Access history and audit logs</li>
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Training Tab - Placeholder for future */}
          {activeTab === 'training' && (
            <div className="text-center py-12">
              <p className="text-gray-500">Training logs feature coming soon...</p>
            </div>
          )}

          {/* Documents Tab - Placeholder for future */}
          {activeTab === 'documents' && (
            <div className="text-center py-12">
              <p className="text-gray-500">Document management feature coming soon...</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            {user && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="btn btn-danger"
                disabled={loading}
              >
                {form.isActive ? 'Deactivate User' : 'Reactivate User'}
              </button>
            )}
            <div className={`flex space-x-3 ${user ? '' : 'ml-auto'}`}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? 'Saving...' : user ? 'Update User' : 'Create User'}
              </button>
            </div>
          </div>
        </form>

        {/* Deactivate/Reactivate Confirmation */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
            <div className="bg-white rounded-lg p-6 max-w-sm m-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {form.isActive ? 'Confirm Deactivation' : 'Confirm Reactivation'}
              </h3>
              <p className="text-gray-600 mb-4">
                {form.isActive 
                  ? 'Are you sure you want to deactivate this user? They will not be able to log in.'
                  : 'Are you sure you want to reactivate this user? They will be able to log in again.'
                }
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="btn btn-secondary"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeactivate}
                  className={`btn ${form.isActive ? 'btn-danger' : 'btn-primary'}`}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : form.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Help Section for Creating Users */}
        {!user && (
          <div className="px-6 pb-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-medium text-yellow-900 mb-2">ℹ️ How to Create Users</h4>
              <ol className="text-sm text-yellow-800 space-y-1 ml-4 list-decimal">
                <li>Go to <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline">Firebase Console</a></li>
                <li>Navigate to Authentication → Users</li>
                <li>Click "Add User" and create the account</li>
                <li>Copy the User ID (UID)</li>
                <li>Return here and create their profile with that UID</li>
              </ol>
              <p className="text-xs text-yellow-700 mt-3">
                Note: User creation through the app requires Firebase Admin SDK (future enhancement)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

