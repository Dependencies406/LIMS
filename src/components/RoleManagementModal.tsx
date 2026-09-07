import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { roleService, ALL_PERMISSIONS } from '../services/roleService';
import type { Role, RoleInput, PermissionAction } from '../types';

/** Set of permission actions that exist in the app (strips legacy forms/documents/masterLists). */
const VALID_PERMISSION_ACTIONS = new Set(ALL_PERMISSIONS.map((p) => p.action));

interface RoleManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When true, render only the panel body (for use inside Users & roles combined modal). */
  embedded?: boolean;
}

export const RoleManagementModal: React.FC<RoleManagementModalProps> = ({
  isOpen,
  onClose,
  embedded = false,
}) => {
  const { isAdmin, currentUser } = useAuth();
  const { success, error: showError } = useToast();
  
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<RoleInput>({
    name: '',
    description: '',
    permissions: [],
  });

  // Load roles
  useEffect(() => {
    if (!isOpen) return;

    const loadRoles = async () => {
      try {
        await roleService.initializeSystemRoles();
        const mergedRoles = await roleService.getMergedRolesForManagement();
        setRoles(mergedRoles);
        setLoading(false);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load roles');
        setLoading(false);
      }
    };

    loadRoles();

    // Also subscribe to real-time updates
    const unsubscribe = roleService.subscribeToRoles((_loadedRoles, err) => {
      if (err) {
        console.error('Error in role subscription:', err);
        return;
      }

      // Reload when roles change
      loadRoles();
    });

    return unsubscribe;
  }, [isOpen]);

  if (!isOpen) return null;

  // Redirect if not admin
  if (!isAdmin) {
    if (embedded) return null;
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

  const handleCreateRole = () => {
    setFormData({
      name: '',
      description: '',
      permissions: [],
    });
    setShowCreateModal(true);
  };

  const handleEditRole = (role: Role) => {
    // Admin role can be edited (to customize permissions)
    // Only prevent deletion, not editing
    setSelectedRole(role);
    // Strip legacy permissions (forms.*, old documents.*, masterLists.*) so UI only shows current set
    const validPermissions = (role.permissions || []).filter((p) => VALID_PERMISSION_ACTIONS.has(p));
    setFormData({
      name: role.name,
      description: role.description || '',
      permissions: validPermissions,
    });
    setShowEditModal(true);
  };

  const handleDeleteRole = (role: Role) => {
    if (role.id === 'admin') {
      showError('Cannot delete the admin system role');
      return;
    }
    if (role.id === 'staff') {
      showError('Cannot delete the Standard user system role');
      return;
    }
    setRoleToDelete(role);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return;
    
    setDeleting(true);
    try {
      await roleService.deleteRole(roleToDelete.id);
      success(`Role "${roleToDelete.name}" has been deleted successfully.`);
      setShowDeleteConfirm(false);
      setRoleToDelete(null);
    } catch (err: any) {
      console.error('Error deleting role:', err);
      showError(err.message || 'Failed to delete role. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveRole = async () => {
    if (!formData.name.trim()) {
      showError('Role name is required');
      return;
    }

    if (formData.permissions.length === 0) {
      showError('At least one permission is required');
      return;
    }

    try {
      // Persist only permissions that exist in the app (strip any legacy strings)
      const permissionsToSave = formData.permissions.filter((p) => VALID_PERMISSION_ACTIONS.has(p));
      const payload: RoleInput = { ...formData, permissions: permissionsToSave };

      if (selectedRole) {
        // Update existing role
        await roleService.updateRole(selectedRole.id, payload);
        success(`Role "${formData.name}" has been updated successfully.`);
      } else {
        // Create new role
        if (!currentUser?.uid) {
          showError('User not authenticated');
          return;
        }
        await roleService.createRole(payload, currentUser.uid);
        success(`Role "${formData.name}" has been created successfully.`);
      }
      
      setShowCreateModal(false);
      setShowEditModal(false);
      setSelectedRole(null);
      setFormData({
        name: '',
        description: '',
        permissions: [],
      });
    } catch (err: any) {
      console.error('Error saving role:', err);
      showError(err.message || 'Failed to save role. Please try again.');
    }
  };

  const togglePermission = (permission: PermissionAction) => {
    setFormData(prev => {
      const permissions = prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission];
      return { ...prev, permissions };
    });
  };

  const toggleCategoryPermissions = (category: string) => {
    const categoryPermissions = ALL_PERMISSIONS
      .filter(p => p.category === category)
      .map(p => p.action);
    
    const allSelected = categoryPermissions.every(p => formData.permissions.includes(p));
    
    setFormData(prev => {
      if (allSelected) {
        // Deselect all in category
        return {
          ...prev,
          permissions: prev.permissions.filter(p => !categoryPermissions.includes(p)),
        };
      } else {
        // Select all in category
        const newPermissions = [...prev.permissions];
        categoryPermissions.forEach(p => {
          if (!newPermissions.includes(p)) {
            newPermissions.push(p);
          }
        });
        return { ...prev, permissions: newPermissions };
      }
    });
  };

  // Filter roles
  const filteredRoles = roles.filter(role => {
    return (
      role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (role.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Group permissions by category
  const permissionsByCategory = roleService.getPermissionsByCategory();

  const listSection = (
          <div className="p-6">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex flex-wrap gap-4 flex-1">
                {/* Search Box */}
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Search roles..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input w-full"
                  />
                </div>
              </div>

              {/* Create Role Button */}
              <button onClick={handleCreateRole} className="btn btn-primary whitespace-nowrap">
                + Create Role
              </button>
            </div>

            {/* Roles List */}
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="text-gray-500">Loading roles...</div>
              </div>
            ) : error ? (
              <div className="card p-12 text-center">
                <div className="mb-4">
                  <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Roles</h3>
                  <p className="text-red-600">{error}</p>
                </div>
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="mb-4">
                  <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">No Roles Found</h3>
                  <p className="text-gray-600 mb-4">
                    {searchTerm ? 'No roles match your search.' : 'Create your first custom role to get started.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRoles.map((role) => (
                  <div
                    key={role.id}
                    className={`p-4 rounded-lg border-2 ${
                      role.isSystemRole
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-primary-300 hover:shadow-md transition-all'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                          {role.name}
                          {role.isSystemRole && (
                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                              System
                            </span>
                          )}
                        </h3>
                        {role.description && (
                          <p className="text-sm text-gray-600 mt-1">{role.description}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-3 text-sm text-gray-500">
                      <span className="font-medium">{role.permissions.length}</span> permission{role.permissions.length !== 1 ? 's' : ''}
                    </div>

                    <div className="mt-4 flex justify-end gap-1">
                      <button
                        onClick={() => handleEditRole(role)}
                        title={role.id === 'admin' ? 'Edit administrator permissions' : role.id === 'staff' ? 'Edit standard user permissions' : 'Edit role'}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                      </button>
                      {role.id !== 'admin' && role.id !== 'staff' && (
                        <button
                          onClick={() => handleDeleteRole(role)}
                          title="Delete role"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
  );

  const nestedModals = (
    <>
      {/* Create/Edit Role Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => {
          setShowCreateModal(false);
          setShowEditModal(false);
          setSelectedRole(null);
        }}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-4xl w-full mx-4 h-[85vh] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="text-xl font-bold text-gray-900">
                {selectedRole ? 'Edit Role' : 'Create New Role'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedRole(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="flex-1 min-h-0 grid grid-rows-[30fr_70fr_auto] gap-4">
              {/* Role Name + Description — 30% of content height */}
              <div className="min-h-0 flex flex-col overflow-y-auto space-y-3">
                {/* Role Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input w-full"
                    placeholder="e.g., Manager, Technician, Viewer"
                    disabled={
                      selectedRole?.id === 'admin' || selectedRole?.id === 'staff'
                    }
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input w-full"
                    rows={2}
                    placeholder="Describe the role's purpose and responsibilities"
                    // Admin description can be edited
                  />
                </div>
              </div>

              {/* Permissions — 70% of content height */}
              <div className="min-h-0 flex flex-col flex-shrink-0">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex-shrink-0">
                  Permissions <span className="text-red-500">*</span>
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    ({formData.permissions.length} selected)
                  </span>
                </label>
                
                <div className="flex-1 min-h-0 overflow-y-auto border border-gray-200 rounded-lg p-4 space-y-4">
                  {Object.entries(permissionsByCategory).map(([category, permissions]) => {
                    const categoryPermissions = permissions.map(p => p.action);
                    const allSelected = categoryPermissions.every(p => formData.permissions.includes(p));
                    const someSelected = categoryPermissions.some(p => formData.permissions.includes(p));

                    return (
                      <div key={category} className="border-b border-gray-200 pb-4 last:border-b-0">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-gray-900">{category}</h4>
                          <button
                            type="button"
                            onClick={() => toggleCategoryPermissions(category)}
                            className={`text-sm px-3 py-1 rounded ${
                              allSelected
                                ? 'bg-primary-100 text-primary-700'
                                : someSelected
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                            disabled={selectedRole?.isSystemRole}
                          >
                            {allSelected ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {permissions.map((perm) => (
                            <label
                              key={perm.action}
                              className="flex items-start space-x-2 p-2 rounded cursor-pointer hover:bg-gray-50"
                            >
                              <input
                                type="checkbox"
                                checked={formData.permissions.includes(perm.action)}
                                onChange={() => togglePermission(perm.action)}
                                className="mt-1"
                                // Admin permissions can be edited
                              />
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900">
                                  {perm.action.split('.').pop()?.replace(/([A-Z])/g, ' $1').trim()}
                                </div>
                                <div className="text-xs text-gray-500">{perm.description}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowEditModal(false);
                    setSelectedRole(null);
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRole}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  {selectedRole ? 'Update Role' : 'Create Role'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && roleToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-200">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Confirm Delete Role</h3>
                <p className="text-sm text-gray-500 mt-1">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6 ml-16">
              Are you sure you want to permanently delete the role <span className="font-semibold">"{roleToDelete.name}"</span>?
              <br /><br />
              This will remove the role from the system. Users assigned to this role will need to be reassigned before deletion.
            </p>
            <div className="flex justify-end space-x-3 ml-16">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setRoleToDelete(null);
                }}
                disabled={deleting}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteRole}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {deleting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Role</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );

  if (embedded) {
    return (
      <>
        {listSection}
        {nestedModals}
      </>
    );
  }

  return (
    <>
      <div className="modal" onClick={onClose}>
        <div className="modal-content max-w-7xl" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Role Management</h2>
                <p className="text-gray-600 mt-1">Create and manage roles with specific permissions</p>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
                ×
              </button>
            </div>
          </div>

          {listSection}
        </div>
      </div>

      {nestedModals}
    </>
  );
};































