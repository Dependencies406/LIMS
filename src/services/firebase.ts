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
  increment,
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
import { getFunctions, httpsCallable } from "firebase/functions";
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

/**
 * Callable Cloud Functions.
 *
 * The region MUST match the region declared on the function itself
 * (`region: 'asia-southeast1'` in `functions/src/*.ts`). A mismatch does not
 * error at wiring time — the call simply 404s at runtime.
 */
export const functions = getFunctions(firebaseApp, 'asia-southeast1');

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
  increment,
  Timestamp,
  collectionGroup,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  getFunctions,
  httpsCallable
};

export type { FirebaseUser };

