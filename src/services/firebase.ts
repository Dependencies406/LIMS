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
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  getDoc,
  getDocs,
  addDoc,
  runTransaction,
  writeBatch,
  increment,
  Timestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
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
  // Auth
  onAuthStateChanged,
  signInWithEmailAndPassword,
  firebaseSignOut as signOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  // Firestore
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  getDoc,
  getDocs,
  addDoc,
  runTransaction,
  writeBatch,
  increment,
  Timestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
  // Storage
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
};

export type { FirebaseUser };
