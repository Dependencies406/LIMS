import type { Role, RoleInput, PermissionAction } from '../types';
import { firestoreToDate } from '../utils/dateUtils';
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  serverTimestamp,
  onSnapshot,
} from './firebase';

/**
 * Single source of truth for all permissions in the application.
 * Used by Edit Role modal, PermissionAction type, and role checks.
 * Legacy permissions (forms.*, old documents.*, masterLists.*) were removed;
 * Documents category contains only documentIndex.view and documentIndex.manage.
 */
export const ALL_PERMISSIONS: Array<{ action: PermissionAction; category: string; description: string }> = [
  // Service Requests permissions (Pending Requests - first in sidebar)
  { action: 'serviceRequests.view', category: 'Service Requests', description: 'View pending service requests' },
  { action: 'serviceRequests.convert', category: 'Service Requests', description: 'Convert service requests to jobs' },
  { action: 'serviceRequests.cancel', category: 'Service Requests', description: 'Cancel service requests' },
  { action: 'serviceRequests.delete', category: 'Service Requests', description: 'Delete service requests' },
  
  // Jobs permissions (second in sidebar)
  { action: 'jobs.view', category: 'Jobs', description: 'View jobs list and details' },
  { action: 'jobs.create', category: 'Jobs', description: 'Create new jobs' },
  { action: 'jobs.edit', category: 'Jobs', description: 'Edit existing jobs' },
  { action: 'jobs.delete', category: 'Jobs', description: 'Delete jobs' },
  { action: 'jobs.assign', category: 'Jobs', description: 'Assign jobs to staff members' },
  { action: 'jobs.changeStatus', category: 'Jobs', description: 'Change job status' },
  { action: 'jobs.export', category: 'Jobs', description: 'Export jobs to CSV/Excel' },
  { action: 'jobs.import', category: 'Jobs', description: 'Import jobs from Excel' },
  { action: 'jobs.generatePdf', category: 'Jobs', description: 'Generate job PDFs' },
  { action: 'jobs.viewDeleted', category: 'Jobs', description: 'View deleted jobs' },
  
  // Customers permissions (third in sidebar)
  { action: 'customers.view', category: 'Customers', description: 'View customers list and details' },
  { action: 'customers.create', category: 'Customers', description: 'Create new customers' },
  { action: 'customers.edit', category: 'Customers', description: 'Edit existing customers' },
  { action: 'customers.delete', category: 'Customers', description: 'Delete customers' },
  { action: 'customers.export', category: 'Customers', description: 'Export customers to CSV' },
  
  // Documents Index permissions (Documents Index & Distributor)
  { action: 'documentIndex.view', category: 'Documents', description: 'View documents index' },
  { action: 'documentIndex.manage', category: 'Documents', description: 'Create/edit/delete documents index' },
  
  // Spreadsheet Templates permissions (in Settings)
  { action: 'spreadsheetTemplates.view', category: 'Spreadsheet Templates', description: 'View spreadsheet templates' },
  { action: 'spreadsheetTemplates.create', category: 'Spreadsheet Templates', description: 'Create spreadsheet templates' },
  { action: 'spreadsheetTemplates.edit', category: 'Spreadsheet Templates', description: 'Edit spreadsheet templates' },
  { action: 'spreadsheetTemplates.delete', category: 'Spreadsheet Templates', description: 'Delete spreadsheet templates' },
  { action: 'spreadsheetTemplates.duplicate', category: 'Spreadsheet Templates', description: 'Duplicate spreadsheet templates' },
  
  // PDF Templates permissions (in Settings)
  { action: 'pdfTemplates.view', category: 'PDF Templates', description: 'View PDF templates' },
  { action: 'pdfTemplates.create', category: 'PDF Templates', description: 'Create PDF templates' },
  { action: 'pdfTemplates.edit', category: 'PDF Templates', description: 'Edit PDF templates' },
  { action: 'pdfTemplates.delete', category: 'PDF Templates', description: 'Delete PDF templates' },
  { action: 'pdfTemplates.duplicate', category: 'PDF Templates', description: 'Duplicate PDF templates' },
  
  // Users permissions (in Settings)
  { action: 'users.view', category: 'Users', description: 'View users list' },
  { action: 'users.create', category: 'Users', description: 'Create new users' },
  { action: 'users.edit', category: 'Users', description: 'Edit existing users' },
  { action: 'users.delete', category: 'Users', description: 'Delete users' },
  { action: 'users.activate', category: 'Users', description: 'Activate user accounts' },
  { action: 'users.deactivate', category: 'Users', description: 'Deactivate user accounts' },
  
  // Roles permissions (in Settings)
  { action: 'roles.view', category: 'Roles', description: 'View roles list' },
  { action: 'roles.create', category: 'Roles', description: 'Create new roles' },
  { action: 'roles.edit', category: 'Roles', description: 'Edit existing roles' },
  { action: 'roles.delete', category: 'Roles', description: 'Delete roles' },
  
  // Settings permissions (last in sidebar)
  { action: 'settings.view', category: 'Settings', description: 'View settings page' },
  { action: 'settings.jobIdConfig', category: 'Settings', description: 'Configure Job ID settings' },
  { action: 'settings.customerIdConfig', category: 'Settings', description: 'Configure Customer ID settings' },
  { action: 'settings.companyInfo', category: 'Settings', description: 'Manage company information' },
  
  // Certificate Numbers permissions (in Settings)
  { action: 'certificateNumbers.view', category: 'Certificate Numbers', description: 'View certificate number configurations' },
  { action: 'certificateNumbers.edit', category: 'Certificate Numbers', description: 'Create and edit certificate number configurations' },
  
  // Staff Performance permissions
  { action: 'staffPerformance.view', category: 'Staff Performance', description: 'View staff performance dashboard and metrics for all staff' },
  { action: 'staffPerformance.viewOwn', category: 'Staff Performance', description: 'View own performance metrics' },
  { action: 'staffPerformance.exportLogs', category: 'Staff Performance', description: 'Export staff performance logs' },

  // Equipment Control permissions (ISO 17025 §6.4–6.5)
  { action: 'equipmentControl.view', category: 'Lab Equipment', description: 'View the lab equipment control module' },
  { action: 'equipmentControl.register', category: 'Lab Equipment', description: 'Register new lab instruments' },
  { action: 'equipmentControl.edit', category: 'Lab Equipment', description: 'Edit lab instrument details' },
  { action: 'equipmentControl.approve', category: 'Lab Equipment', description: 'Approve or reject equipment registration' },
  { action: 'equipmentControl.logUsage', category: 'Lab Equipment', description: 'Log equipment usage entries' },
  { action: 'equipmentControl.calibrate', category: 'Lab Equipment', description: 'Record calibration events' },
  { action: 'equipmentControl.uploadDocuments', category: 'Lab Equipment', description: 'Upload documents to equipment records' },
  { action: 'equipmentControl.deleteDocuments', category: 'Lab Equipment', description: 'Delete documents from equipment records' },
  { action: 'equipmentControl.retire', category: 'Lab Equipment', description: 'Retire equipment from service' },
];

/** Display name for the built-in `staff` role document (roles/staff). */
export const STANDARD_USER_ROLE_NAME = 'Standard user';

/**
 * Default permissions for system roles
 */
export const DEFAULT_ROLE_PERMISSIONS = {
  admin: ALL_PERMISSIONS.map((p) => p.action) as PermissionAction[],
  /** Operational access without user/role admin or sensitive settings IDs. */
  standardUser: ALL_PERMISSIONS.map((p) => p.action).filter((action) => {
    if (action.startsWith('users.')) return false;
    if (action.startsWith('roles.')) return false;
    if (
      action === 'settings.jobIdConfig' ||
      action === 'settings.customerIdConfig' ||
      action === 'settings.companyInfo'
    ) {
      return false;
    }
    return true;
  }) as PermissionAction[],
};

const FALLBACK_ADMIN_ROLE: Role = {
  id: 'admin',
  name: 'Administrator',
  description: 'Full system access with customizable permissions',
  permissions: DEFAULT_ROLE_PERMISSIONS.admin,
  isSystemRole: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'system',
};

/**
 * Resolve `user.role` (legacy `admin` / `staff` or a Firestore `roles` document id) for UI labels.
 * Aligns with Roles & permissions: Administrator (admin), User (staff default).
 */
export function getRoleDisplayName(roleId: string, roles: Role[]): string {
  if (!roleId) return 'User';
  const id = roleId.trim();
  if (id === 'admin') {
    const fromDb = roles.find((r) => r.id === 'admin');
    if (fromDb?.name?.trim()) return fromDb.name.trim();
    return 'Administrator';
  }
  if (id === 'staff') {
    const fromDb = roles.find((r) => r.id === 'staff');
    if (fromDb?.name?.trim()) return fromDb.name.trim();
    return STANDARD_USER_ROLE_NAME;
  }
  const match = roles.find((r) => r.id === id);
  if (match?.name?.trim()) return match.name.trim();
  return 'Unknown role';
}

/**
 * Service for managing roles and permissions
 */
export const roleService = {
  /**
   * Subscribe to real-time role updates
   * @param callback Function called when roles change
   * @returns Unsubscribe function
   */
  subscribeToRoles(
    callback: (roles: Role[], error?: Error) => void
  ): () => void {
    if (!db) {
      console.error('Firestore database not initialized');
      callback([], new Error('Database not initialized'));
      return () => {};
    }

    try {
      const q = query(collection(db, 'roles'));
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const roles = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name || '',
              description: data.description || '',
              permissions: data.permissions || [],
              isSystemRole: data.isSystemRole || false,
              createdAt: firestoreToDate(data.createdAt),
              updatedAt: firestoreToDate(data.updatedAt),
              createdBy: data.createdBy || '',
            } as Role;
          });
          
          callback(roles);
        },
        (error) => {
          console.error('Error loading roles:', error);
          callback([], error as Error);
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up roles subscription:', error);
      callback([], error as Error);
      return () => {};
    }
  },

  /**
   * Get all roles (one-time fetch)
   * @returns Promise with array of roles
   */
  async getAllRoles(): Promise<Role[]> {
    try {
      if (!db) {
        throw new Error('Database not initialized');
      }

      const q = query(collection(db, 'roles'));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || '',
          description: data.description || '',
          permissions: data.permissions || [],
          isSystemRole: data.isSystemRole || false,
          createdAt: firestoreToDate(data.createdAt),
          updatedAt: firestoreToDate(data.updatedAt),
          createdBy: data.createdBy || '',
        } as Role;
      });
    } catch (error: any) {
      console.error('Error fetching roles:', error);
      throw new Error('Failed to fetch roles');
    }
  },

  /**
   * Get a single role by ID
   * @param roleId Role ID
   * @returns Promise with role data
   */
  async getRoleById(roleId: string): Promise<Role | null> {
    try {
      // Handle system role (admin)
      if (roleId === 'admin') {
        // Try to get admin role from database first (to get custom permissions if set)
        try {
          const adminDoc = await getDoc(doc(db, 'roles', 'admin'));
          if (adminDoc.exists()) {
            const data = adminDoc.data();
            return {
              id: 'admin',
              name: 'Administrator',
              description: data.description || 'Full system access with customizable permissions',
              permissions: data.permissions || DEFAULT_ROLE_PERMISSIONS.admin,
              isSystemRole: true,
              createdAt: firestoreToDate(data.createdAt),
              updatedAt: firestoreToDate(data.updatedAt),
              createdBy: data.createdBy || 'system',
            };
          }
        } catch (error) {
          // If admin role doesn't exist in DB, return default
        }
        
        return {
          id: 'admin',
          name: 'Administrator',
          description: 'Full system access with customizable permissions',
          permissions: DEFAULT_ROLE_PERMISSIONS.admin,
          isSystemRole: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'system',
        };
      }

      if (roleId === 'staff') {
        try {
          const staffDoc = await getDoc(doc(db, 'roles', 'staff'));
          if (staffDoc.exists()) {
            const data = staffDoc.data();
            return {
              id: 'staff',
              name: (data.name as string)?.trim() || STANDARD_USER_ROLE_NAME,
              description:
                data.description ||
                'Default role for standard accounts (legacy user.role value: staff)',
              permissions: data.permissions?.length
                ? data.permissions
                : DEFAULT_ROLE_PERMISSIONS.standardUser,
              isSystemRole: true,
              createdAt: firestoreToDate(data.createdAt),
              updatedAt: firestoreToDate(data.updatedAt),
              createdBy: data.createdBy || 'system',
            } as Role;
          }
        } catch {
          // fall through to fallback
        }
        return {
          id: 'staff',
          name: STANDARD_USER_ROLE_NAME,
          description: 'Default role for standard accounts (legacy user.role value: staff)',
          permissions: DEFAULT_ROLE_PERMISSIONS.standardUser,
          isSystemRole: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'system',
        };
      }

      const roleDoc = await getDoc(doc(db, 'roles', roleId));
      
      if (!roleDoc.exists()) {
        return null;
      }

      const data = roleDoc.data();
      return {
        id: roleDoc.id,
        name: data.name || '',
        description: data.description || '',
        permissions: data.permissions || [],
        isSystemRole: data.isSystemRole || false,
        createdAt: firestoreToDate(data.createdAt),
        updatedAt: firestoreToDate(data.updatedAt),
        createdBy: data.createdBy || '',
      } as Role;
    } catch (error) {
      console.error('Error fetching role:', error);
      throw error;
    }
  },

  /**
   * Create a new role
   * @param data Role input data
   * @param createdBy User ID who created the role
   * @returns Promise with role ID
   */
  async createRole(data: RoleInput, createdBy: string): Promise<string> {
    try {
      if (!db) {
        throw new Error('Database not initialized');
      }

      // Validate role name
      if (!data.name || data.name.trim().length === 0) {
        throw new Error('Role name is required');
      }

      // Check if role name already exists
      const existingRoles = await this.getAllRoles();
      const nameExists = existingRoles.some(
        r => r.name.toLowerCase() === data.name.toLowerCase()
      );
      
      if (nameExists) {
        throw new Error('A role with this name already exists');
      }

      // Validate permissions
      if (!Array.isArray(data.permissions) || data.permissions.length === 0) {
        throw new Error('At least one permission is required');
      }

      const roleData = {
        name: data.name.trim(),
        description: data.description?.trim() || '',
        permissions: data.permissions,
        isSystemRole: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy,
      };

      const roleRef = doc(collection(db, 'roles'));
      await setDoc(roleRef, roleData);
      
      return roleRef.id;
    } catch (error: any) {
      console.error('Error creating role:', error);
      if (error.message) {
        throw error;
      }
      throw new Error('Failed to create role');
    }
  },

  /**
   * Update an existing role
   * @param roleId Role ID
   * @param data Partial role data to update
   * @returns Promise
   */
  async updateRole(roleId: string, data: Partial<RoleInput>): Promise<void> {
    try {
      if (!db) {
        throw new Error('Database not initialized');
      }

      // Admin role can be updated (to allow permission customization)
      // Only prevent deletion, not updates

      const roleRef = doc(db, 'roles', roleId);
      const roleDoc = await getDoc(roleRef);
      
      if (!roleDoc.exists()) {
        throw new Error('Role not found');
      }

      const updateData: any = {
        updatedAt: serverTimestamp(),
      };

      // For admin role, allow updating permissions and description, but not name
      if (roleId === 'admin') {
        if (data.name !== undefined && data.name.trim().toLowerCase() !== 'administrator') {
          throw new Error('Cannot change admin role name');
        }
        
        if (data.description !== undefined) {
          updateData.description = data.description.trim();
        }

        if (data.permissions !== undefined) {
          if (!Array.isArray(data.permissions) || data.permissions.length === 0) {
            throw new Error('At least one permission is required');
          }
          updateData.permissions = data.permissions;
        }
      } else if (roleId === 'staff') {
        if (
          data.name !== undefined &&
          data.name.trim().toLowerCase() !== STANDARD_USER_ROLE_NAME.toLowerCase()
        ) {
          throw new Error(`Cannot change ${STANDARD_USER_ROLE_NAME} role name`);
        }

        if (data.description !== undefined) {
          updateData.description = data.description.trim();
        }

        if (data.permissions !== undefined) {
          if (!Array.isArray(data.permissions) || data.permissions.length === 0) {
            throw new Error('At least one permission is required');
          }
          updateData.permissions = data.permissions;
        }
      } else {
        // For custom roles, allow updating name, description, and permissions
        if (data.name !== undefined) {
          if (!data.name || data.name.trim().length === 0) {
            throw new Error('Role name cannot be empty');
          }
          
          // Check if another role with this name exists
          const existingRoles = await this.getAllRoles();
          const roleName = data.name.trim();
          const nameExists = existingRoles.some(
            r => r.id !== roleId && r.name.toLowerCase() === roleName.toLowerCase()
          );
          
          if (nameExists) {
            throw new Error('A role with this name already exists');
          }
          
          updateData.name = data.name.trim();
        }

        if (data.description !== undefined) {
          updateData.description = data.description.trim();
        }

        if (data.permissions !== undefined) {
          if (!Array.isArray(data.permissions) || data.permissions.length === 0) {
            throw new Error('At least one permission is required');
          }
          updateData.permissions = data.permissions;
        }
      }

      await updateDoc(roleRef, updateData);
    } catch (error: any) {
      console.error('Error updating role:', error);
      if (error.message) {
        throw error;
      }
      throw new Error('Failed to update role');
    }
  },

  /**
   * Delete a role
   * @param roleId Role ID
   * @returns Promise
   */
  async deleteRole(roleId: string): Promise<void> {
    try {
      if (!db) {
        throw new Error('Database not initialized');
      }

      // Cannot delete system roles
      if (roleId === 'admin') {
        throw new Error('Cannot delete the admin system role');
      }
      if (roleId === 'staff') {
        throw new Error('Cannot delete the Standard user system role');
      }

      // Check if any users are using this role
      const { userService } = await import('./userService');
      const users = await userService.getAllUsers();
      const usersWithRole = users.filter(u => u.role === roleId);
      
      if (usersWithRole.length > 0) {
        throw new Error(`Cannot delete role: ${usersWithRole.length} user(s) are assigned to this role`);
      }

      await deleteDoc(doc(db, 'roles', roleId));
    } catch (error: any) {
      console.error('Error deleting role:', error);
      if (error.message) {
        throw error;
      }
      throw new Error('Failed to delete role');
    }
  },

  /**
   * Ensure built-in roles exist in Firestore so they appear under Roles & permissions.
   * - roles/admin → Administrator
   * - roles/staff → Standard user (legacy user.role value `staff`)
   */
  async initializeSystemRoles(): Promise<void> {
    try {
      const adminDoc = await getDoc(doc(db, 'roles', 'admin'));
      if (!adminDoc.exists()) {
        await setDoc(doc(db, 'roles', 'admin'), {
          name: 'Administrator',
          description: 'Full system access with customizable permissions',
          permissions: DEFAULT_ROLE_PERMISSIONS.admin,
          isSystemRole: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: 'system',
        });
      }

      const staffDoc = await getDoc(doc(db, 'roles', 'staff'));
      if (!staffDoc.exists()) {
        await setDoc(doc(db, 'roles', 'staff'), {
          name: STANDARD_USER_ROLE_NAME,
          description: 'Default role for standard accounts (legacy user.role value: staff)',
          permissions: DEFAULT_ROLE_PERMISSIONS.standardUser,
          isSystemRole: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: 'system',
        });
      }
    } catch (error) {
      console.error('Error initializing system roles:', error);
    }
  },

  /**
   * Get permissions grouped by category
   * @returns Object with permissions grouped by category
   */
  getPermissionsByCategory(): Record<string, Array<{ action: PermissionAction; description: string }>> {
    const grouped: Record<string, Array<{ action: PermissionAction; description: string }>> = {};
    
    ALL_PERMISSIONS.forEach(perm => {
      if (!grouped[perm.category]) {
        grouped[perm.category] = [];
      }
      grouped[perm.category].push({
        action: perm.action,
        description: perm.description,
      });
    });
    
    return grouped;
  },

  /**
   * Same merge as Settings → Roles & permissions: Administrator + every Firestore role (no duplicate admin).
   */
  async getMergedRolesForManagement(): Promise<Role[]> {
    const adminRole = await this.getRoleById('admin');
    const allRoles = await this.getAllRoles();
    const systemRoles: Role[] = adminRole ? [adminRole] : [FALLBACK_ADMIN_ROLE];
    const merged: Role[] = [...systemRoles];
    allRoles.forEach((role) => {
      if (role.id !== 'admin') merged.push(role);
    });
    return merged;
  },

  /**
   * Roles assignable to users: management list + legacy `staff` when no `roles/staff` document exists.
   * Synthetic staff uses a distinct label if Firestore already has a role named "User" (avoids duplicate menu lines).
   * Duplicate display names (any roles) get ` (id)` suffix for disambiguation.
   */
  async getMergedRolesForUserPicker(): Promise<Role[]> {
    const merged = await this.getMergedRolesForManagement();
    const hasStaffDoc = merged.some((r) => r.id === 'staff');
    if (!hasStaffDoc) {
      const hasUserNamedRole = merged.some(
        (r) => r.name.trim().toLowerCase() === 'user'
      );
      merged.push({
        id: 'staff',
        name: hasUserNamedRole ? 'Standard user' : 'User',
        description: 'Legacy role id staff; same pool as Roles & permissions.',
        permissions: [],
        isSystemRole: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
      } as Role);
    }

    const nameKey = (n: string) => n.trim().toLowerCase();
    const nameCounts = new Map<string, number>();
    merged.forEach((r) => {
      const k = nameKey(r.name);
      nameCounts.set(k, (nameCounts.get(k) || 0) + 1);
    });

    const disambiguated = merged.map((r) => {
      const k = nameKey(r.name);
      if ((nameCounts.get(k) || 0) <= 1) return r;
      return {
        ...r,
        name: `${r.name.trim()} (${r.id})`,
      };
    });

    return disambiguated.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  },

  /**
   * Check if a role has a specific permission
   * @param role Role object or role ID
   * @param permission Permission to check
   * @returns Promise with boolean
   */
  async hasPermission(role: Role | string, permission: PermissionAction): Promise<boolean> {
    let roleData: Role | null;
    
    if (typeof role === 'string') {
      roleData = await this.getRoleById(role);
    } else {
      roleData = role;
    }
    
    if (!roleData) {
      return false;
    }
    
    return roleData.permissions.includes(permission);
  },
};

