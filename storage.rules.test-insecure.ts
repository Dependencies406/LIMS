// ⚠️ TEMPORARY INSECURE RULES FOR TESTING ONLY ⚠️
// DO NOT USE IN PRODUCTION - THIS ALLOWS ANYONE TO UPLOAD/DELETE FILES
// 
// Purpose: Test if 412 errors are caused by authentication/security rules
// 
// To use:
// 1. Backup your current storage.rules
// 2. Copy this content to storage.rules
// 3. Deploy: firebase deploy --only storage
// 4. Test your upload
// 5. Restore your original storage.rules immediately after testing

rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // TEMPORARY: Allow ALL access to company/logo for testing
    // This bypasses all authentication checks
    match /company/logo/{fileName} {
      allow read, write: if true;  // ⚠️ INSECURE - Allows anyone
    }
    
    // Keep other rules as-is for safety
    match /jobs/{jobId}/attachments/{fileName} {
      allow read, write: if request.auth != null;
    }
    
    match /jobs/{jobId}/equipment/{equipmentIndex}/attachments/{fileName} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    match /customers/{customerId}/files/{fileName} {
      allow read, write: if request.auth != null;
    }
    
    match /users/{userId}/avatar/{fileName} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /report_templates/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
    
    match /templates/{templateId}/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
    
    // Default rule: deny all other access
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
