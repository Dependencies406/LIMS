import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { roleService, ALL_PERMISSIONS } from '../services/roleService';
import { permissionDiscoveryService, type DiscoveredPermission } from '../services/permissionDiscoveryService';
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
  
  // Permission discovery state
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [discoveredPermissions, setDiscoveredPermissions] = useState<DiscoveredPermission[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selectedDiscoveries, setSelectedDiscoveries] = useState<Set<string>>(new Set());
  
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

  const handleScanForPermissions = async () => {
    setScanning(true);
    try {
      const suggested = await permissionDiscoveryService.scanForNewFeatures();
      setDiscoveredPermissions(suggested);
      setSelectedDiscoveries(new Set());
      setShowDiscoveryModal(true);
      if (suggested.length === 0) {
        success('No new permissions found. All registered permissions are already in the system.');
      } else {
        success(`Found ${suggested.length} new permission(s) to review.`);
      }
    } catch (err: any) {
      console.error('Error scanning for permissions:', err);
      showError('Failed to scan for permissions. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleAddDiscoveredPermissions = async () => {
    if (selectedDiscoveries.size === 0) {
      showError('Please select at least one permission to add.');
      return;
    }

    try {
      // Note: In a real implementation, this would update the PermissionAction type
      // and add the permissions to ALL_PERMISSIONS in roleService.ts
      // For now, we'll show a message that these need to be manually added
      
      const selected = Array.from(selectedDiscoveries);
      const permissionsToAdd = discoveredPermissions.filter(p => selected.includes(p.action));
      
      // Show instructions for adding these permissions
      const instructions = permissionsToAdd.map(p => 
        `  { action: '${p.action}', category: '${p.category}', description: '${p.description}' },`
      ).join('\n');
      
      success(
        `${selected.length} permission(s) selected. ` +
        `Please add these to src/services/roleService.ts in the ALL_PERMISSIONS array:\n\n${instructions}`
      );
      
      // Close modal after a delay
      setTimeout(() => {
        setShowDiscoveryModal(false);
        setSelectedDiscoveries(new Set());
      }, 5000);
    } catch (err: any) {
      console.error('Error adding permissions:', err);
      showError('Failed to add permissions. Please try again.');
    }
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

              {/* Discovery Button */}
              <button
                onClick={handleScanForPermissions}
                className="btn btn-secondary whitespace-nowrap"
                disabled={scanning}
              >
                {scanning ? (
                  <>
                    <svg className="w-4 h-4 animate-spin inline-block mr-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Scanning...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Scan for New Permissions
                  </>
                )}
              </button>

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

                    <div className="mt-4 flex gap-2">
                      {role.id === 'admin' || role.id === 'staff' ? (
                        <button
                          onClick={() => handleEditRole(role)}
                          className="flex-1 px-3 py-2 text-sm bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition-colors"
                          title={
                            role.id === 'admin'
                              ? 'Edit administrator permissions'
                              : 'Edit Standard user permissions'
                          }
                        >
                          Edit Permissions
                        </button>
                      ) : (
                        // Custom roles can be edited and deleted
                        <>
                          <button
                            onClick={() => handleEditRole(role)}
                            className="flex-1 px-3 py-2 text-sm bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteRole(role)}
                            className="flex-1 px-3 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                          >
                            Delete
                          </button>
                        </>
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

      {/* Permission Discovery Modal */}
      {showDiscoveryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowDiscoveryModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Discovered Permissions</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {discoveredPermissions.length} new permission(s) found in the codebase
                </p>
              </div>
              <button
                onClick={() => setShowDiscoveryModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            {discoveredPermissions.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">All Up to Date!</h4>
                <p className="text-gray-600">
                  No new permissions were discovered. All registered permissions are already in the system.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">How to Add These Permissions:</p>
                      <ol className="list-decimal ml-4 space-y-1">
                        <li>Select the permissions you want to add</li>
                        <li>Click "Add Selected Permissions"</li>
                        <li>Follow the instructions to add them to <code className="bg-blue-100 px-1 rounded">src/services/roleService.ts</code></li>
                        <li>Update the <code className="bg-blue-100 px-1 rounded">PermissionAction</code> type in <code className="bg-blue-100 px-1 rounded">src/types/index.ts</code></li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto mb-6">
                  {discoveredPermissions.map((perm) => (
                    <label
                      key={perm.action}
                      className={`flex items-start space-x-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedDiscoveries.has(perm.action)
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDiscoveries.has(perm.action)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedDiscoveries);
                          if (e.target.checked) {
                            newSelected.add(perm.action);
                          } else {
                            newSelected.delete(perm.action);
                          }
                          setSelectedDiscoveries(newSelected);
                        }}
                        className="mt-1 w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-medium text-gray-900">{perm.action}</div>
                          <div className="flex items-center space-x-2">
                            <span className={`text-xs px-2 py-1 rounded ${
                              perm.confidence === 'high' ? 'bg-green-100 text-green-800' :
                              perm.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {perm.confidence} confidence
                            </span>
                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                              {perm.category}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{perm.description}</p>
                        {perm.source && (
                          <p className="text-xs text-gray-500 font-mono">
                            Source: {perm.source}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    {selectedDiscoveries.size} of {discoveredPermissions.length} selected
                  </div>
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDiscoveryModal(false);
                        setSelectedDiscoveries(new Set());
                      }}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddDiscoveredPermissions}
                      disabled={selectedDiscoveries.size === 0}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Add Selected Permissions ({selectedDiscoveries.size})
                    </button>
                  </div>
                </div>
              </>
            )}
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































