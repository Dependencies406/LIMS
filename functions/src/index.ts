/**
 * LIMS Firebase Cloud Functions — entry point
 * All exported functions are automatically discovered by the Firebase CLI.
 */

import * as admin from 'firebase-admin';

// Initialize admin SDK once
if (!admin.apps.length) {
  admin.initializeApp();
}

// Re-export all functions
export { exportJobsToGoogleDrive } from './exportToDrive';
