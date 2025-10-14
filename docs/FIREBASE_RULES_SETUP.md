# Firebase Security Rules Setup

## Issues
1. **Company logo upload failing:**
```
Firebase Storage: User does not have permission to access 'company/logo/logo_xxx.png'. (storage/unauthorized)
```

2. **Job ID settings and Company Info loading failing:**
```
Error loading job ID settings: FirebaseError: Missing or insufficient permissions.
Error getting company info: FirebaseError: Missing or insufficient permissions.
```

## Solution
You need to update both Firebase Storage and Firestore security rules to allow authenticated users to access the required collections and storage paths.

## Steps to Fix

### 1. Update Firestore Rules (CRITICAL - Do this first)
1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Firestore Database** in the left sidebar
4. Click on **Rules** tab
5. Replace your current rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Jobs collection
    match /jobs/{jobId} {
      allow read, write: if request.auth != null;
    }
    
    // Customers collection
    match /customers/{customerId} {
      allow read, write: if request.auth != null;
    }
    
    // Settings collection
    match /settings/{settingId} {
      allow read, write: if request.auth != null;
    }
    
    // System collection (CRITICAL - allows access to job ID and company info)
    match /system/{document} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Default rule
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

6. Click **Publish**

### 2. Update Storage Rules
1. Go to **Storage** in the left sidebar
2. Click on **Rules** tab
3. Replace your current storage rules with:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated users to upload and manage company logos
    match /company/logo/{fileName} {
      allow read, write: if request.auth != null;
    }
    
    // Allow authenticated users to upload and manage job attachments
    match /jobs/{jobId}/attachments/{fileName} {
      allow read, write: if request.auth != null;
    }
    
    // Allow authenticated users to upload and manage customer files
    match /customers/{customerId}/files/{fileName} {
      allow read, write: if request.auth != null;
    }
    
    // Allow authenticated users to upload and manage user avatars
    match /users/{userId}/avatar/{fileName} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Default rule: deny all other access
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

4. Click **Publish**

### 3. Test
1. Go back to your LIMS application
2. Refresh the page
3. Check that the Settings page loads without errors
4. Try uploading a company logo
5. Both the Job ID settings and Company Info should now work

## What These Rules Fix

### Firestore Rules
- ✅ **System Collection Access**: Allows reading job ID settings and company info
- ✅ **Admin Write Access**: Only admins can modify system settings
- ✅ **User Data Access**: Users can manage their own profiles
- ✅ **Jobs & Customers**: Full access for authenticated users

### Storage Rules
- ✅ **Company Logo Upload**: Allows logo uploads to `company/logo/`
- ✅ **Job Attachments**: Allows file uploads for jobs
- ✅ **Customer Files**: Allows file uploads for customers
- ✅ **User Avatars**: Users can manage their own avatars

## Security Notes
- These rules allow any authenticated user to read system settings
- Only admin users can modify system settings (job ID config, company info)
- All operations require authentication (`request.auth != null`)
- The rules are designed to be secure while allowing necessary functionality

## Troubleshooting
If you still get permission errors:
1. Make sure you're logged in to the application
2. Check that your user has the correct role in Firestore
3. Verify both Firestore and Storage rules were published successfully
4. Try refreshing the page and logging in again
5. Check the browser console for any remaining error messages
