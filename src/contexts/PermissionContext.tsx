/**
 * PermissionContext.tsx
 *
 * Single source of truth for the current user's permissions.
 *
 * Design:
 *  - Subscribes to roles/{roleId} in Firestore via onSnapshot so permission
 *    changes made by an admin take effect immediately â€” no re-login required.
 *  - Provides a synchronous can() function so every component gets O(1) checks
 *    without spawning its own Firestore read.
 *  - Admins always pass every permission regardless of the role document.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '../services/roleService';
import type { PermissionAction } from '../types';
import { db, doc, onSnapshot } from '../services/firebase';

interface PermissionContextType {
  /** All permission strings granted to the current user. */
  permissions: Set<string>;
  /** True while the initial role document is being fetched. */
  loading: boolean;
  /** Synchronous permission check â€” always returns false while loading. */
  can: (permission: PermissionAction) => boolean;
}

const PermissionContext = createContext<PermissionContextType>({
  permissions: new Set(),
  loading: true,
  can: () => false,
});

export const usePermissions = () => useContext(PermissionContext);

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isAdmin } = useAuth();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // â”€â”€ No user â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!currentUser) {
      setPermissions(new Set());
      setLoading(false);
      return;
    }

    // â”€â”€ Admin: grant everything, no Firestore read needed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (isAdmin) {
      setPermissions(new Set(ALL_PERMISSIONS.map((p) => p.action)));
      setLoading(false);
      return;
    }

    // â”€â”€ Custom / staff role: subscribe to real-time updates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const roleId = currentUser.role;
    if (!roleId) {
      setPermissions(new Set());
      setLoading(false);
      return;
    }

    const roleRef = doc(db, 'roles', roleId);
    const unsubscribe = onSnapshot(
      roleRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const perms: string[] = Array.isArray(data.permissions) ? data.permissions : [];
          setPermissions(new Set(perms));
        } else {
          // Role doc missing in Firestore â€” fall back to the built-in staff defaults
          setPermissions(new Set(DEFAULT_ROLE_PERMISSIONS.standardUser));
        }
        setLoading(false);
      },
      (error) => {
        console.error('[PermissionContext] Failed to load role:', error);
        setPermissions(new Set());
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser?.uid, currentUser?.role, isAdmin]); // re-subscribe when user or role changes

  const can = (permission: PermissionAction): boolean => {
    if (isAdmin) return true;
    return permissions.has(permission as string);
  };

  return (
    <PermissionContext.Provider value={{ permissions, loading, can }}>
      {children}
    </PermissionContext.Provider>
  );
};
