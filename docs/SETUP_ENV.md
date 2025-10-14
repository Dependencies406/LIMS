# 🔧 Environment Setup Guide

## Creating Your `.env` File

The `.env` file is required for Firebase to work. Follow these steps:

### Step 1: Create the File

Create a new file named `.env` in the project root directory:

```
LIMS-New/
├── .env  ← Create this file
├── package.json
├── src/
└── ...
```

### Step 2: Add Firebase Credentials

Copy and paste this content into your `.env` file:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=scs-lims
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

### Step 3: Get Your Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (scs-lims)
3. Click the gear icon ⚙️ > **Project Settings**
4. Scroll down to **"Your apps"** section
5. If you have a web app, click the **</>** (Web) icon
6. Copy the config values and replace in your `.env` file

### Step 4: Restart Dev Server

After creating the `.env` file, restart your development server:

```bash
# Stop the server (Ctrl+C)
# Then restart
npm run dev
```

## ✅ Verification

Once set up, you should see:
- ✅ No Firebase errors in console
- ✅ Login page loads correctly
- ✅ Can authenticate

## 🔒 Security Note

The `.env` file is already in `.gitignore`, so it won't be committed to git. Keep your credentials secure!

