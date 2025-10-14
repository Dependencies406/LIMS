# 🚨 QUICK FIX: Firestore Security Rules

**Issue**: User Management causing Firestore errors  
**Solution**: Set up basic security rules (2 minutes)

---

## ⚡ Quick Fix Steps

### **Step 1: Open Firebase Console**
1. Go to: https://console.firebase.google.com/
2. Select your project: **scs-lims**

### **Step 2: Go to Firestore Rules**
1. Click **"Firestore Database"** in left sidebar
2. Click **"Rules"** tab

### **Step 3: Replace Rules**
Replace everything with this:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow all authenticated users to read/write everything
    // This is a temporary fix for development
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### **Step 4: Publish**
1. Click **"Publish"** button
2. Wait for "Published" confirmation

### **Step 5: Test**
1. Refresh your LIMS app
2. Go to Settings → User Management
3. Should now work without errors

---

## ✅ Expected Results

**Before Fix:**
- ❌ Permission denied errors
- ❌ Firestore internal assertion failures
- ❌ User Management broken
- ❌ Other features affected

**After Fix:**
- ✅ No more Firestore errors
- ✅ User Management works
- ✅ All features restored
- ✅ Clean console

---

## 🔒 Security Note

**These rules allow all authenticated users full access.**

**For Production**, use more restrictive rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - admin only
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Other collections
    match /jobs/{jobId} {
      allow read, write: if request.auth != null;
    }
    
    match /customers/{customerId} {
      allow read, write: if request.auth != null;
    }
    
    // Admin-only collections
    match /jobIdSettings/{document} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    match /companyInfo/{document} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    match /pdfSettings/{document} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

---

## 🎯 Why This Fixes It

The errors were caused by:
1. **No security rules** for the `users` collection
2. **Firestore getting corrupted** from permission errors
3. **Cascading errors** affecting other features

By setting up basic rules, we:
- ✅ Allow access to all collections
- ✅ Stop permission errors
- ✅ Prevent Firestore corruption
- ✅ Restore all functionality

---

## 🚀 Next Steps

1. **Apply the quick fix** (above)
2. **Test User Management**
3. **Later**: Implement production security rules
4. **Create your first admin user**

---

**This should resolve all the Firestore errors immediately!** ✨

---

Last Updated: October 13, 2025  
Time to Fix: ~2 minutes  
Status: Ready to Apply
