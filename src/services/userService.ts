import type { User } from '../types';
import {
  db,
  auth,
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
  createUserWithEmailAndPassword,
  signOut,
} from './firebase';

// Note: Firebase Admin SDK is required for user creation/deletion
// For now, we'll manage Firestore user documents
// Actual Firebase Auth user creation should be done through Firebase Console or Admin SDK

export interface UserInput {
  email: string;
  firstName: string;
  lastName: string;
  position?: string;
  /**
   * Built-in roles: 'admin' | 'staff'.
   * Any Firestore roles/{id} document ID is also valid (custom roles).
   */
  role: string;
  password?: string; // Only used for initial creation
}

/**
 * Service for managing user-related operations
 * Handles user CRUD, authentication tracking, and role management
 * Designed to be extensible for future features (training logs, documents, etc.)
 */
export const userService = {
  /**
   * Subscribe to real-time user updates
   * @param callback Function called when users change
   * @returns Unsubscribe function
   */
  subscribeToUsers(
    callback: (users: User[], error?: Error) => void
  ): () => void {
    // Check if we have a valid db instance
    if (!db) {
      console.error('Firestore database not initialized');
      callback([], new Error('Database not initialized'));
      return () => {};
    }

    try {
      // Use simple query without orderBy to avoid field requirements
      const q = query(collection(db, 'users'));
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const users = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              uid: doc.id,
              email: data.email || '',
              displayName: data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || '',
              firstName: data.firstName || '',
              lastName: data.lastName || '',
              position: data.position || '',
              role: data.role || 'staff',
              lastLogin: data.lastLogin?.toDate(),
              createdAt: data.createdAt?.toDate(),
              updatedAt: data.updatedAt?.toDate(),
              isActive: data.isActive !== false,
              trainingLogs: data.trainingLogs || [],
              documents: data.documents || [],
            } as User;
          });
          
          callback(users);
        },
        (error) => {
          console.error('Error loading users:', error);
          
          // Handle specific permission errors
          if (error.code === 'permission-denied') {
            console.warn('Users collection access denied - returning empty array');
            callback([], new Error('Permission denied: Cannot access users collection. Please check Firestore security rules.'));
          } else {
            callback([], error as Error);
          }
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up users subscription:', error);
      callback([], error as Error);
      return () => {};
    }
  },

  /**
   * Get all users (one-time fetch)
   * @returns Promise with array of users
   */
  async getAllUsers(): Promise<User[]> {
    try {
      if (!db) {
        throw new Error('Database not initialized');
      }

      // Use simple query without orderBy to avoid field requirements
      const q = query(collection(db, 'users'));
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          uid: doc.id,
          email: data.email || '',
          displayName: data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || '',
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          position: data.position || '',
          role: data.role || 'staff',
          lastLogin: data.lastLogin?.toDate(),
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
          isActive: data.isActive !== false,
          trainingLogs: data.trainingLogs || [],
          documents: data.documents || [],
        } as User;
      });
    } catch (error: any) {
      console.error('Error fetching users:', error);
      
      // Handle specific permission errors
      if (error.code === 'permission-denied') {
        console.warn('Users collection access denied - returning empty array');
        return []; // Return empty array instead of throwing
      }
      
      throw new Error('Failed to fetch users');
    }
  },

  /**
   * Get a single user by UID
   * @param uid User ID
   * @returns Promise with user data
   */
  async getUserById(uid: string): Promise<User> {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      
      if (!userDoc.exists()) {
        throw new Error('User not found');
      }

      return {
        uid: userDoc.id,
        ...userDoc.data(),
        lastLogin: userDoc.data().lastLogin?.toDate(),
        createdAt: userDoc.data().createdAt?.toDate(),
        updatedAt: userDoc.data().updatedAt?.toDate(),
      } as User;
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  },

  /**
   * Create user document in Firestore
   * Note: Firebase Auth user should be created separately (requires Admin SDK)
   * This creates the user profile/metadata in Firestore
   * 
   * @param uid Firebase Auth UID
   * @param data User input data
   * @returns Promise with user UID
   */
  async createUserProfile(uid: string, data: UserInput): Promise<string> {
    try {
      const userData = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        displayName: `${data.firstName} ${data.lastName}`,
        position: data.position || '',
        role: data.role,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLogin: null,
      };

      await setDoc(doc(db, 'users', uid), userData);
      return uid;
    } catch (error) {
      console.error('Error creating user profile:', error);
      throw error;
    }
  },

  /**
   * Create a complete user account (Firebase Auth + Firestore profile)
   * This creates both the authentication account and the user profile
   * 
   * @param data User input data including email and password
   * @returns Promise with user UID
   */
  async createUser(data: UserInput & { password: string }): Promise<string> {
    // ⚠️  KNOWN LIMITATION — Client-SDK session swap:
    // `createUserWithEmailAndPassword` immediately signs the new user in and signs out
    // the calling admin. We capture the admin's credential before the call so we can
    // re-sign them in afterward.  The proper fix is a Firebase Cloud Function (Admin SDK)
    // that creates the auth account server-side without touching the client session.
    const adminEmail = auth.currentUser?.email ?? null;

    try {
      // Validate required fields
      if (!data.email || !data.password || !data.firstName || !data.lastName) {
        throw new Error('Email, password, first name, and last name are required');
      }

      // Validate password length
      if (data.password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      // Create Firebase Authentication account.
      // NOTE: this call changes auth.currentUser to the newly created user.
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );

      const uid = userCredential.user.uid;

      try {
        // Create Firestore user profile while signed in as the new user.
        await this.createUserProfile(uid, data);
        return uid;
      } catch (profileError) {
        console.error('Failed to create user profile after auth account creation:', profileError);
        throw new Error('User account created but profile setup failed. Please contact administrator.');
      } finally {
        // Sign the new user out so auth.currentUser is cleared.
        // The page will redirect to /login and the admin can re-authenticate.
        // Alternatively, if the admin password is available, re-sign them in here.
        if (adminEmail) {
          try { await signOut(auth); } catch { /* ignore */ }
        }
      }
    } catch (error: any) {
      console.error('Error creating user:', error);

      // Provide user-friendly error messages
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('This email address is already in use');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password is too weak. Please use a stronger password');
      } else if (error.message) {
        throw error;
      } else {
        throw new Error('Failed to create user account');
      }
    }
  },

  /**
   * Update an existing user
   * @param uid User ID
   * @param data Partial user data to update
   */
  async updateUser(
    uid: string,
    data: Partial<Omit<UserInput, 'email' | 'password'>>
  ): Promise<void> {
    try {
      const updateData: any = {
        ...data,
        updatedAt: serverTimestamp(),
      };

      // Update displayName if first/last name changed
      if (data.firstName || data.lastName) {
        const currentUser = await this.getUserById(uid);
        const firstName = data.firstName || currentUser.firstName;
        const lastName = data.lastName || currentUser.lastName;
        updateData.displayName = `${firstName} ${lastName}`;
      }

      await updateDoc(doc(db, 'users', uid), updateData);
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  /**
   * Deactivate a user (soft delete)
   * Note: This doesn't delete the Firebase Auth account
   * For full deletion, use Firebase Admin SDK
   * 
   * @param uid User ID
   */
  async deactivateUser(uid: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'users', uid), {
        isActive: false,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error deactivating user:', error);
      throw error;
    }
  },

  /**
   * Reactivate a user
   * @param uid User ID
   */
  async reactivateUser(uid: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'users', uid), {
        isActive: true,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error reactivating user:', error);
      throw error;
    }
  },

  /**
   * Delete user profile from Firestore
   * Note: This doesn't delete the Firebase Auth account
   * 
   * @param uid User ID
   */
  async deleteUserProfile(uid: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (error) {
      console.error('Error deleting user profile:', error);
      throw error;
    }
  },

  /**
   * Update user's last login timestamp
   * Called automatically when user logs in
   * 
   * @param uid User ID
   */
  async updateLastLogin(uid: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'users', uid), {
        lastLogin: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating last login:', error);
      // Don't throw - this is not critical
    }
  },

  /**
   * Search users by query string
   * @param users Array of users to search
   * @param searchTerm Search query
   * @returns Filtered users
   */
  searchUsers(users: User[], searchTerm: string): User[] {
    if (!searchTerm) return users;

    const term = searchTerm.toLowerCase();
    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(term) ||
        user.firstName.toLowerCase().includes(term) ||
        user.lastName.toLowerCase().includes(term) ||
        (user.displayName || '').toLowerCase().includes(term) ||
        (user.position || '').toLowerCase().includes(term)
    );
  },

  /**
   * Filter users by role
   * @param users Array of users to filter
   * @param role Role to filter by ('all' for no filter)
   * @returns Filtered users
   */
  filterUsersByRole(users: User[], role: string): User[] {
    if (role === 'all') return users;
    return users.filter((user) => user.role === role);
  },

  /**
   * Filter users by active status
   * @param users Array of users to filter
   * @param activeOnly If true, return only active users
   * @returns Filtered users
   */
  filterUsersByStatus(users: User[], activeOnly: boolean): User[] {
    if (!activeOnly) return users;
    return users.filter((user) => user.isActive !== false);
  },

  /**
   * Get user statistics
   * @param users Array of users
   * @returns Object with user statistics
   */
  getUserStats(users: User[]) {
    return {
      total: users.length,
      active: users.filter((u) => u.isActive !== false).length,
      inactive: users.filter((u) => u.isActive === false).length,
      admins: users.filter((u) => u.role === 'admin').length,
      staff: users.filter((u) => u.role === 'staff').length,
    };
  },

  /**
   * Ensure current user has proper document structure
   * @param uid Current user's UID
   * @param email Current user's email
   * @returns Promise with updated user data
   */
  async ensureUserDocument(uid: string, email: string): Promise<User> {
    try {
      if (!db) {
        throw new Error('Database not initialized');
      }

      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        // Create user document if it doesn't exist
        const now = new Date();
        const newUser: User = {
          uid,
          email,
          displayName: email,
          firstName: '',
          lastName: '',
          position: '',
          role: 'staff', // Default to staff for safety; promote to admin via the Admin panel
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };

        await setDoc(userRef, {
          ...newUser,
          createdAt: newUser.createdAt,
          updatedAt: newUser.updatedAt,
        });

        return newUser;
      } else {
        // Update existing document to ensure it has all required fields
        const data = userDoc.data();
        const now = new Date();
        
        const updatedUser: User = {
          uid,
          email: data.email || email,
          displayName: data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || email,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          position: data.position || '',
          role: data.role || 'staff', // Default to staff if role field is missing
          lastLogin: data.lastLogin?.toDate(),
          createdAt: data.createdAt?.toDate() || now,
          updatedAt: now,
          isActive: data.isActive !== false,
        };

        // Update document with missing fields
        await updateDoc(userRef, {
          email: updatedUser.email,
          displayName: updatedUser.displayName,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          position: updatedUser.position,
          role: updatedUser.role,
          isActive: updatedUser.isActive,
          updatedAt: updatedUser.updatedAt,
        });

        return updatedUser;
      }
    } catch (error: any) {
      console.error('Error ensuring user document:', error);
      throw new Error('Failed to ensure user document');
    }
  },
};

