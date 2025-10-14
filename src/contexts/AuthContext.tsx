import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { User } from '../types';
import {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  db,
  doc,
  updateDoc,
  serverTimestamp
} from '../services/firebase';
import { userService } from '../services/userService';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          // Ensure user document exists and has proper structure
          const user = await userService.ensureUserDocument(
            firebaseUser.uid, 
            firebaseUser.email || ''
          );
          
          // Update last login timestamp
          try {
            await updateDoc(doc(db, 'users', firebaseUser.uid), {
              lastLogin: serverTimestamp(),
            });
          } catch (loginError) {
            console.warn('Could not update last login:', loginError);
            // Don't fail auth if we can't update login time
          }
          
          setCurrentUser(user);
        } catch (error) {
          console.error('Error ensuring user document:', error);
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  const value: AuthContextType = {
    currentUser,
    loading,
    login,
    logout,
    isAdmin
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

