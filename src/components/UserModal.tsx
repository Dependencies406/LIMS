import React, { useState, useEffect, useMemo } from 'react';
import type { User, Role } from '../types';
import { db, doc, updateDoc, serverTimestamp } from '../services/firebase';
import { useUsers } from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/userService';
import { roleService, getRoleDisplayName } from '../services/roleService';

interface UserModalProps {
  user: User | null;
  onClose: () => void;
  onSuccess: () => void;
  /** Called after Firestore profile is deleted (inactive users only). */
  onProfileDeleted?: () => void;
}

export const UserModal: React.FC<UserModalProps> = ({ user, onClose, onSuccess, onProfileDeleted }) => {
  const { currentUser } = useAuth();
  const { deactivateUser, reactivateUser, deleteUserProfile } = useUsers();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveProfileConfirm, setShowRemoveProfileConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic'>('basic');
  const [pickerRoles, setPickerRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    position: '',
    role: 'staff',
    isActive: true,
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    let cancelled = false;
    const loadPickerRoles = async () => {
      setRolesLoading(true);
      try {
        await roleService.initializeSystemRoles();
        const list = await roleService.getMergedRolesForUserPicker();
        if (!cancelled) setPickerRoles(list);
      } catch {
        if (!cancelled) setPickerRoles([]);
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    };
    loadPickerRoles();
    const unsub = roleService.subscribeToRoles(() => {
      loadPickerRoles();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const roleSelectOptions = useMemo(() => {
    const opts = [...pickerRoles];
    const ids = new Set(opts.map((o) => o.id));
    if (user?.role && !ids.has(user.role)) {
      opts.push({
        id: user.role,
        name: getRoleDisplayName(user.role, pickerRoles),
        permissions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Role);
    }
    return opts.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }, [pickerRoles, user?.role]);

  useEffect(() => {
    if (rolesLoading || roleSelectOptions.length === 0) return;
    if (!roleSelectOptions.some((r) => r.id === form.role)) {
      const fallback = roleSelectOptions.some((r) => r.id === 'staff')
        ? 'staff'
        : roleSelectOptions[0].id;
      setForm((prev) => (prev.role === fallback ? prev : { ...prev, role: fallback }));
    }
  }, [rolesLoading, roleSelectOptions, form.role]);

  useEffect(() => {
    if (user) {
      setForm({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        position: user.position || '',
        role: user.role || 'staff',
        isActive: user.isActive !== false,
        password: '',
        confirmPassword: '',
      });
    } else {
      setForm((prev) => ({
        ...prev,
        email: '',
        firstName: '',
        lastName: '',
        position: '',
        role: 'staff',
        isActive: true,
        password: '',
        confirmPassword: '',
      }));
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

    if (rolesLoading) {
      setError('Please wait for roles to finish loading.');
      return;
    }
    if (roleSelectOptions.length === 0) {
      setError('No roles are available. Configure roles under Settings → Roles & permissions.');
      return;
    }
    if (!roleSelectOptions.some((r) => r.id === form.role)) {
      setError('Please select a valid role.');
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

  const handleRemoveProfile = async () => {
    if (!user) return;
    if (currentUser?.uid === user.uid) {
      setError('You cannot delete your own account.');
      setShowRemoveProfileConfirm(false);
      return;
    }
    if (user.isActive !== false) {
      setError('Only inactive accounts can be removed this way. Deactivate the user first.');
      setShowRemoveProfileConfirm(false);
      return;
    }

    if (!currentUser?.uid) {
      setError('You must be signed in to delete a user.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await deleteUserProfile(user.uid, currentUser.uid);
      setShowRemoveProfileConfirm(false);
      if (onProfileDeleted) {
        onProfileDeleted();
      } else {
        onSuccess();
      }
    } catch (err) {
      console.error('Error deleting user profile:', err);
      setError('Failed to delete user profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const canDeleteThisProfile =
    !!user &&
    user.isActive === false &&
    currentUser?.uid !== user.uid;

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content max-w-3xl relative" onClick={e => e.stopPropagation()}>
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
            </div>
          )}
        </div>

        {user && user.isActive === false && (
          <div className="px-6 pt-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-900">Account disabled</p>
                <p className="text-sm text-amber-800">
                  This user cannot sign in until the account is enabled again.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn btn-primary whitespace-nowrap"
                  disabled={loading}
                >
                  Enable account
                </button>
                {canDeleteThisProfile && (
                  <button
                    type="button"
                    onClick={() => setShowRemoveProfileConfirm(true)}
                    className="btn border border-red-300 bg-white text-red-700 hover:bg-red-50 whitespace-nowrap"
                    disabled={loading}
                  >
                    Delete profile
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

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
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="user-modal-role">
                    Role <span className="text-red-500">*</span>
                  </label>
                  {rolesLoading ? (
                    <p className="text-sm text-gray-500 py-2">Loading roles…</p>
                  ) : roleSelectOptions.length === 0 ? (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      No roles available. Check Firestore and Settings → Roles & permissions.
                    </p>
                  ) : (
                    <>
                      <select
                        id="user-modal-role"
                        className="input w-full"
                        value={form.role}
                        onChange={(e) => handleChange('role', e.target.value)}
                        required
                      >
                        {roleSelectOptions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Same roles as in Roles & permissions. New or renamed roles there appear in this list automatically.
                      </p>
                    </>
                  )}
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
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB') : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600">Last Updated:</span>
                      <p className="text-gray-800 mt-1">
                        {user.updatedAt ? new Date(user.updatedAt).toLocaleDateString('en-GB') : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </>
          )}


          {/* Actions */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-4 border-t border-gray-200">
            {user && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn btn-danger"
                  disabled={loading}
                >
                  {form.isActive ? 'Deactivate User' : 'Reactivate User'}
                </button>
                {canDeleteThisProfile && (
                  <button
                    type="button"
                    onClick={() => setShowRemoveProfileConfirm(true)}
                    className="btn border border-red-300 bg-white text-red-700 hover:bg-red-50"
                    disabled={loading}
                  >
                    Delete profile
                  </button>
                )}
              </div>
            )}
            <div className={`flex space-x-3 ${user ? 'sm:ml-auto' : 'ml-auto'}`}>
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
                disabled={loading || rolesLoading || roleSelectOptions.length === 0}
              >
                {loading ? 'Saving...' : user ? 'Update User' : 'Create User'}
              </button>
            </div>
          </div>
        </form>

        {/* Deactivate/Reactivate Confirmation */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg z-10">
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
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="btn btn-secondary"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
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

        {/* Remove inactive profile (Firestore only) */}
        {showRemoveProfileConfirm && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg z-20">
            <div className="bg-white rounded-lg p-6 max-w-md m-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete user from database?</h3>
              <p className="text-gray-600 mb-3 text-sm">
                This permanently removes <span className="font-medium">{user?.email}</span> from Firestore
                (user document and related records), and deletes their files under Storage for this user.
                They will disappear from User Management.
              </p>
              <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-sm mb-4">
                Firebase Authentication is separate: remove their login under Firebase Console →
                Authentication → Users if they should not sign in again.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowRemoveProfileConfirm(false)}
                  className="btn btn-secondary"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRemoveProfile}
                  className="btn btn-danger"
                  disabled={loading}
                >
                  {loading ? 'Deleting…' : 'Delete profile'}
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

