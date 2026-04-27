# Firestore Security Rules for Procedure Documents

Add these rules to your Firestore security rules in the Firebase Console.

## Complete Rules for Procedure Documents Collection

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function to check if user is admin
    function isAdmin() {
      return isAuthenticated() && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Procedure Documents Collection (SOPs and Calibration Templates)
    match /procedureDocuments/{documentId} {
      // Allow read access to all authenticated users (for viewing published documents)
      allow read: if isAuthenticated();
      
      // Allow create/update/delete only to admins
      allow create: if isAdmin() && 
                      request.resource.data.keys().hasAll(['title', 'contentOrTemplate', 'version', 'status', 'isDeleted', 'createdAt', 'createdBy']) &&
                      request.resource.data.status in ['draft', 'published', 'archived', 'deprecated'] &&
                      request.resource.data.isDeleted == false &&
                      request.resource.data.createdBy == request.auth.uid;
      
      allow update: if isAdmin() && 
                      request.resource.data.status in ['draft', 'published', 'archived', 'deprecated'] &&
                      (!('isDeleted' in request.resource.data) || request.resource.data.isDeleted is bool);
      
      allow delete: if isAdmin();
    }
    
    // ... (your existing rules for other collections)
  }
}
```

## Quick Fix Rules (Simplified)

If you need a quick fix for testing, use these more permissive rules (NOT recommended for production):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Procedure Documents - Allow all authenticated users to read, only admins to write
    match /procedureDocuments/{documentId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null; // Temporarily allow all authenticated users
    }
  }
}
```

## How to Apply

1. Go to Firebase Console → Firestore Database → Rules
2. Paste the rules above
3. Click "Publish"
4. Wait a few seconds for rules to propagate

## Notes

- The rules ensure only admins can create, update, or delete procedure documents
- All authenticated users can read procedure documents (needed for job creation)
- The rules validate data structure and status values
- For production, you may want to add more specific validation






















































