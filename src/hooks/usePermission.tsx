import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { roleService } from '../services/roleService';
import type { PermissionAction } from '../types';

/**
 * Hook to check if user has a specific permission
 * @param permission The permission to check
 * @returns Object with hasPermission boolean and loading state
 */
export const usePermission = (permission: PermissionAction) => {
  const { currentUser, isAdmin } = useAuth();
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermission = async () => {
      if (!currentUser) {
        setHasPermission(false);
        setLoading(false);
        return;
      }

      // Admins always have all permissions
      if (isAdmin) {
        setHasPermission(true);
        setLoading(false);
        return;
      }

      try {
        // Get user's role
        const roleId = currentUser.role;
        if (!roleId) {
          setHasPermission(false);
          setLoading(false);
          return;
        }

        // Check permission using roleService
        const hasPerm = await roleService.hasPermission(roleId, permission);
        setHasPermission(hasPerm);
      } catch (error) {
        console.error('Error checking permission:', error);
        setHasPermission(false);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [currentUser, isAdmin, permission]);

  return { hasPermission, loading };
};
