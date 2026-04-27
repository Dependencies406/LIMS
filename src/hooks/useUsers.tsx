import { useState, useEffect, useCallback } from 'react';
import type { User } from '../types';
import { userService, type UserInput } from '../services/userService';

/**
 * Custom hook for managing user data
 * Provides real-time user updates and CRUD operations
 * Admin-only functionality for user management
 */
export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to real-time user updates
  useEffect(() => {
    const unsubscribe = userService.subscribeToUsers((updatedUsers, err) => {
      if (err) {
        setError('Failed to load users');
        setUsers([]);
      } else {
        setUsers(updatedUsers);
        setError(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  /**
   * Create a new user profile in Firestore
   * Note: Firebase Auth account must be created separately
   */
  const createUserProfile = useCallback(async (uid: string, data: UserInput): Promise<string> => {
    setError(null);
    try {
      const userId = await userService.createUserProfile(uid, data);
      return userId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Update an existing user
   */
  const updateUser = useCallback(
    async (uid: string, data: Partial<Omit<UserInput, 'email' | 'password'>>): Promise<void> => {
      setError(null);
      try {
        await userService.updateUser(uid, data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update user';
        setError(message);
        throw err;
      }
    },
    []
  );

  /**
   * Deactivate a user (soft delete)
   */
  const deactivateUser = useCallback(async (uid: string): Promise<void> => {
    setError(null);
    try {
      await userService.deactivateUser(uid);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deactivate user';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Reactivate a user
   */
  const reactivateUser = useCallback(async (uid: string): Promise<void> => {
    setError(null);
    try {
      await userService.reactivateUser(uid);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reactivate user';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Delete user profile
   */
  const deleteUserProfile = useCallback(async (uid: string, performedByUid: string): Promise<void> => {
    setError(null);
    try {
      await userService.deleteUserProfile(uid, performedByUid);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete user';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Get a single user by ID
   */
  const getUserById = useCallback(async (uid: string): Promise<User> => {
    setError(null);
    try {
      return await userService.getUserById(uid);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch user';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Update last login timestamp
   */
  const updateLastLogin = useCallback(async (uid: string): Promise<void> => {
    setError(null);
    try {
      await userService.updateLastLogin(uid);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update last login';
      setError(message);
      // Don't throw - this is not critical
    }
  }, []);

  /**
   * Search users
   */
  const searchUsers = useCallback(
    (searchTerm: string) => {
      return userService.searchUsers(users, searchTerm);
    },
    [users]
  );

  /**
   * Filter users by role
   */
  const filterByRole = useCallback(
    (role: string) => {
      return userService.filterUsersByRole(users, role);
    },
    [users]
  );

  /**
   * Filter users by status
   */
  const filterByStatus = useCallback(
    (activeOnly: boolean) => {
      return userService.filterUsersByStatus(users, activeOnly);
    },
    [users]
  );

  /**
   * Get user statistics
   */
  const getStats = useCallback(() => {
    return userService.getUserStats(users);
  }, [users]);

  return {
    users,
    loading,
    error,
    createUserProfile,
    updateUser,
    deactivateUser,
    reactivateUser,
    deleteUserProfile,
    getUserById,
    updateLastLogin,
    searchUsers,
    filterByRole,
    filterByStatus,
    getStats,
  };
};

