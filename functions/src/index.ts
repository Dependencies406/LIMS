/**
 * LIMS Firebase Cloud Functions — entry point
 * All exported functions are automatically discovered by the Firebase CLI.
 */

import { getApps, initializeApp } from 'firebase-admin/app';

// Initialize admin SDK once
if (!getApps().length) {
  initializeApp();
}

// Re-export all functions
export { exportJobsToGoogleDrive } from './exportToDrive';
export { pingFunctions } from './ping';
export { allocateCertificateNumber } from './allocateCertificateNumber';
