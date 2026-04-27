# Firebase Console Setup Guide

This guide will walk you through setting up a Firebase project for the LIMS application from scratch.

## Table of Contents

1. [Create Firebase Project](#1-create-firebase-project)
2. [Enable Required Services](#2-enable-required-services)
3. [Get Configuration Credentials](#3-get-configuration-credentials)
4. [Configure Authentication](#4-configure-authentication)
5. [Set Up Firestore Database](#5-set-up-firestore-database)
6. [Set Up Storage](#6-set-up-storage)
7. [Deploy Security Rules](#7-deploy-security-rules)
8. [Create Firestore Indexes](#8-create-firestore-indexes)
9. [Verify Setup](#9-verify-setup)

---

## 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or **"Create a project"**
3. Enter a project name (e.g., "My LIMS Application")
4. Click **Continue**
5. **Google Analytics** (optional):
   - You can enable or disable Google Analytics
   - If enabled, select or create an Analytics account
   - Click **Continue**
6. Review and click **Create project**
7. Wait for project creation to complete
8. Click **Continue**

---

## 2. Enable Required Services

The LIMS application requires the following Firebase services:

- ✅ **Authentication** (for user login)
- ✅ **Firestore Database** (for data storage)
- ✅ **Storage** (for file uploads)
- ✅ **Hosting** (for deploying the web app)

---

## 3. Get Configuration Credentials

1. In Firebase Console, click the **gear icon** ⚙️ next to "Project Overview"
2. Select **"Project settings"**
3. Scroll down to the **"Your apps"** section
4. If you don't have a web app yet:
   - Click the **Web icon** (</>)
   - Register your app with a nickname (e.g., "LIMS Web App")
   - **Do NOT** check "Also set up Firebase Hosting" (we'll do that separately)
   - Click **Register app**
5. Copy the configuration values. You'll see something like:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890",
  measurementId: "G-XXXXXXXXXX" // Optional
};
```

**Save these values** - you'll need them for the configuration tool.

---

## 4. Configure Authentication

1. In Firebase Console, go to **Build** → **Authentication**
2. Click **"Get started"** (if first time)
3. Click the **"Sign-in method"** tab
4. Enable **Email/Password**:
   - Click on **Email/Password**
   - Toggle **"Enable"** to ON
   - Click **Save**
5. (Optional) Enable other providers if needed:
   - Google Sign-In
   - Other providers as required

---

## 5. Set Up Firestore Database

1. In Firebase Console, go to **Build** → **Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in production mode"** (we'll deploy security rules next)
4. Select a **location** for your database:
   - Choose the closest region to your users
   - Click **Enable**
5. Wait for database creation (takes 1-2 minutes)

---

## 6. Set Up Storage

1. In Firebase Console, go to **Build** → **Storage**
2. Click **"Get started"**
3. Review the security rules (we'll update them later)
4. Choose a **location** for your storage:
   - Should match your Firestore location if possible
   - Click **Next**
5. Click **Done**

---

## 7. Deploy Security Rules

### Option A: Using Firebase CLI (Recommended)

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Initialize Firebase** (if not already done):
   ```bash
   cd lims-app
   firebase init
   ```
   - Select: Firestore, Storage, Hosting
   - Use existing project (select your project)
   - Use default file names
   - Set public directory to `dist`

4. **Deploy Firestore Rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```

5. **Deploy Storage Rules**:
   ```bash
   firebase deploy --only storage:rules
   ```

### Option B: Using Firebase Console

#### Firestore Rules:

1. Go to **Build** → **Firestore Database** → **Rules** tab
2. Copy the contents of `firestore.rules` from your package
3. Paste into the rules editor
4. Click **Publish**

#### Storage Rules:

1. Go to **Build** → **Storage** → **Rules** tab
2. Copy the contents of `storage.rules` from your package
3. Paste into the rules editor
4. Click **Publish**

---

## 8. Create Firestore Indexes

### Option A: Using Firebase CLI (Recommended)

1. **Deploy indexes**:
   ```bash
   firebase deploy --only firestore:indexes
   ```

### Option B: Using Firebase Console

The indexes are defined in `firestore.indexes.json`. You can create them manually:

1. Go to **Build** → **Firestore Database** → **Indexes** tab
2. Click **"Create Index"**
3. For each index in `firestore.indexes.json`:
   - Collection ID: `templates` (or as specified)
   - Fields: Add fields as specified
   - Query scope: Collection
   - Click **Create**

**Required Indexes:**

1. **templates** collection:
   - Field: `ownerId` (Ascending), `updatedAt` (Descending)
   - Query scope: Collection

2. **templates** collection:
   - Field: `isPublic` (Ascending), `updatedAt` (Descending)
   - Query scope: Collection

3. **notifications** collection:
   - Field: `userId` (Ascending), `createdAt` (Descending)
   - Query scope: Collection

4. **certificate_number_configs** collection:
   - Field: `isActive` (Ascending), `name` (Ascending)
   - Query scope: Collection

**Note:** Index creation can take several minutes. You'll see a notification when they're ready.

---

## 9. Verify Setup

### Checklist:

- [ ] Firebase project created
- [ ] Web app registered and configuration copied
- [ ] Authentication enabled (Email/Password)
- [ ] Firestore database created
- [ ] Storage bucket created
- [ ] Firestore security rules deployed
- [ ] Storage security rules deployed
- [ ] Firestore indexes created (or deploying)

### Test Your Setup:

1. **Test Authentication**:
   - Try creating a test user in Authentication → Users
   - Or use the app's sign-up feature

2. **Test Firestore**:
   - Go to Firestore Database → Data
   - Verify you can see the database (it will be empty initially)

3. **Test Storage**:
   - Go to Storage → Files
   - Verify the bucket is accessible

---

## Next Steps

After completing this setup:

1. **Configure Application**:
   - Use the Firebase Setup Tool (`firebase-setup-tool/main.py`)
   - Enter your Firebase credentials
   - Generate the `.env` file

2. **Install and Build**:
   - Follow the `INSTALLATION_GUIDE.md`

3. **Deploy Application**:
   - Build the application: `npm run build`
   - Deploy to Firebase Hosting: `firebase deploy --only hosting`

---

## Troubleshooting

### Common Issues:

**Issue: "Permission denied" errors**
- **Solution**: Ensure security rules are deployed correctly
- Check that rules match the `firestore.rules` and `storage.rules` files

**Issue: "Index not found" errors**
- **Solution**: Wait for indexes to finish building (can take 5-10 minutes)
- Check Firestore → Indexes tab for status

**Issue: "Storage bucket not found"**
- **Solution**: Verify Storage is enabled and bucket name matches your project ID

**Issue: "Authentication not working"**
- **Solution**: Verify Email/Password is enabled in Authentication settings

---

## Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Storage Security Rules](https://firebase.google.com/docs/storage/security)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)

---

## Support

If you encounter issues not covered here:

1. Check Firebase Console for error messages
2. Review Firebase documentation
3. Check application logs in browser console
4. Verify all configuration values are correct

---

**Last Updated:** 2025-01-14
