import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { roleService, DEFAULT_ROLE_PERMISSIONS } from '../services/roleService';
import type { PermissionAction } from '../types';

/**
 * Hook to check if user has access to Settings module
 * Returns true if user has any settings-related permission
 */
export const useSettingsAccess = () => {
  const { currentUser, isAdmin } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  // Settings-related permissions that grant access to Settings module
  const settingsPermissions: PermissionAction[] = [
    'settings.view',
    'settings.jobIdConfig',
    'settings.customerIdConfig',
    'settings.companyInfo',
    'users.view',
    'roles.view',
    'spreadsheetTemplates.view',
    'pdfTemplates.view',
    'certificateNumbers.view',
  ];

  useEffect(() => {
    const checkAccess = async () => {
      if (!currentUser) {
        setHasAccess(false);
        setLoading(false);
        return;
      }

      // Admins always have access
      if (isAdmin) {
        setHasAccess(true);
        setLoading(false);
        return;
      }

      try {
        // Get user's role
        const roleId = currentUser.role;
        if (!roleId) {
          setHasAccess(false);
          setLoading(false);
          return;
        }

        // Get role data
        const role = await roleService.getRoleById(roleId);
        if (!role) {
          setHasAccess(false);
          setLoading(false);
          return;
        }

        // Check if role has any settings-related permission
        const userPermissions = role.permissions || [];
        
        // Check if any settings permission is in the user's permissions
        const hasAnyPermission = settingsPermissions.some(permission => 
          userPermissions.includes(permission)
        );

        setHasAccess(hasAnyPermission);
      } catch (error) {
        console.error('Error checking settings access:', error);
        setHasAccess(false);
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [currentUser, isAdmin]);

  return { hasAccess, loading };
};
