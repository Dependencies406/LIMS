/**
 * Firebase configuration.
 *
 * Firebase web SDK config is intentionally client-side and public — it is
 * embedded in every web app built with Firebase and visible in the browser.
 * Security is enforced by Firebase Security Rules (and optionally App Check),
 * not by hiding this config.
 * See: https://firebase.google.com/docs/projects/api-keys#api-keys-for-firebase
 *
 * Env-var overrides are still supported so local dev and CI can swap projects
 * without touching source code.
 */
export const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY             || 'AIzaSyA0EoxW-uA3KSPwHal7Ww6yvrEt6SYWRSI',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         || 'scs-lims.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID          || 'scs-lims',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET      || 'scs-lims.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '511921681509',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID              || '1:511921681509:web:a722d92349151dc96f028c',
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID      || 'G-69NHMCGD66',
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL        || 'https://scs-lims-default-rtdb.asia-southeast1.firebasedatabase.app/',
};

