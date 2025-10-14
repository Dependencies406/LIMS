# 🔧 Updated Firestore Rules for User Management

**Issue**: Current rules prevent User Management from accessing all users  
**Solution**: Update existing rules to allow admin access to users collection

---

## 🚨 **Problem with Current Rules:**

Your current `users` collection rule:
```javascript
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

**This only allows users to access their own document, but User Management needs to read ALL users.**

---

## ✅ **Updated Rules (Replace Your Current Rules):**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - allow users to read their own data, admins to read/write all
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
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

---

## 🔍 **What Changed:**

**Before:**
```javascript
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

**After:**
```javascript
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
  allow read, write: if request.auth != null && 
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

**Added:** Admin users can now read and write all user documents.

---

## 🚨 **Important: You Need an Admin User First**

Since your current user probably doesn't have `role: 'admin'` in their user document, you'll need to either:

### **Option 1: Temporary Fix (Quick)**
Replace your rules with this temporary version that allows all authenticated users to access users:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - temporary: allow all authenticated users
    match /users/{userId} {
      allow read, write: if request.auth != null;
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

### **Option 2: Create Admin User First**
1. Use the temporary rules above
2. Create your first admin user through User Management
3. Then switch back to the secure rules

---

## 📋 **Steps to Apply:**

1. **Copy the updated rules** (choose Option 1 for now)
2. **Paste into Firebase Console Rules editor**
3. **Click "Publish"**
4. **Test User Management**
5. **Create your first admin user**
6. **Later: Switch to secure rules (Option 2)**

---

## 🎯 **Expected Results:**

After applying the rules:
- ✅ User Management will work
- ✅ You can create users
- ✅ You can assign admin roles
- ✅ All other features continue working

---

**Choose Option 1 (temporary rules) for now to get User Management working quickly!** 🚀
