# Firestore Security Rules for List Manager Collections

## Overview
The List Manager requires access to the following Firestore collections:
- `manufacturerList` - Manufacturer names
- `modelList` - Model names
- `calibrationMethodList` - Calibration method names

## Security Rules

Add these rules to your Firestore security rules in Firebase Console:

```javascript
// Manufacturer List collection - authenticated users can read/write
match /manufacturerList/{manufacturerId} {
  allow read, write: if request.auth != null;
}

// Model List collection - authenticated users can read/write
match /modelList/{modelId} {
  allow read, write: if request.auth != null;
}

// Calibration Method List collection - authenticated users can read/write
match /calibrationMethodList/{methodId} {
  allow read, write: if request.auth != null;
}
```

## How to Update Rules

1. Go to Firebase Console → Firestore Database → Rules
2. Add the rules above to your existing rules
3. Click "Publish" to apply the changes

## Notes

- All authenticated users can read and write to these collections
- If you want to restrict write access to admins only, change `write` to:
  ```javascript
  allow write: if request.auth != null && 
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
  ```



































