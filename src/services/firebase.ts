import { initializeApp, getApps } from "firebase/app";
import type { FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
  query,
  orderBy,
  where,
  limit,
  getDoc,
  getDocs,
  runTransaction,
  Timestamp,
  collectionGroup
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "firebase/storage";
import { firebaseConfig } from '../config/firebase';

// Initialize Firebase
let firebaseApp: FirebaseApp;
if (getApps().length === 0) {
  firebaseApp = initializeApp(firebaseConfig);
} else {
  firebaseApp = getApps()[0];
}

// Export Firebase services
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

// Re-export Firebase functions for easier imports
export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  firebaseSignOut as signOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
  query,
  orderBy,
  where,
  limit,
  getDoc,
  getDocs,
  runTransaction,
  Timestamp,
  collectionGroup,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
};

export type { FirebaseUser };

