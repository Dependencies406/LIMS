/**
 * usePermission.tsx
 *
 * Thin wrapper around PermissionContext.
 * Returns the same { hasPermission, loading } shape as before so all existing
 * call-sites continue to work without changes.
 *
 * Unlike the previous implementation this hook does NOT make a Firestore call —
 * the context has already loaded the role document once via onSnapshot.
 */
import { usePermissions } from '../contexts/PermissionContext';
import type { PermissionAction } from '../types';

export const usePermission = (permission: PermissionAction) => {
  const { can, loading } = usePermissions();
  return {
    hasPermission: can(permission),
    loading,
  };
};
